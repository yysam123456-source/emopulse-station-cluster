// tide-medium 的「已定部分」门：微粒与雾转正后必须配断言（主理人要求，别让"骨架转正"只发生在色阶/焦散上）。
//
// ★ 这份 bench 只验**已定**的两层：
//   · 微粒：数量固定、随 LOD 减量、可独立关闭
//   · 雾：烘焙期建过渐变、可独立关闭
//   **色阶与焦散形态仍在待裁状态**，这里只断言「可以独立关掉」，不评判形态好不好。
//
// 口径：Node 里没有 canvas，假 ctx 不画像素。量的是**指令与烘焙调用次数**，可核对。
//
// 用法：node shared/parts/tide-medium/bench.mjs
import path from 'node:path';
import { loadTsModule, REPO_ROOT } from '../../../tests/lib/load-ts.mjs';
import { guardCtx } from '../../../tests/lib/fake-ctx.mjs';

const WIDTH = 1280;
const HEIGHT = 720;
const DPR = 2;

/** 每帧/每烘焙的指令计数 */
const counters = {
  drawImage: 0, arc: 0, fill: 0, fillRect: 0, clearRect: 0,
  linearGradient: 0, radialGradient: 0, quadratic: 0,
};

/** 所有假 ctx 的守卫 */
const guards = [];

/** 本次帧内 drawImage 的目标尺寸（用来验焦散直径） */
let stamps = [];

function makeFakeCtx() {
  const gradient = { addColorStop() {} };
  const raw = {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: null,
    strokeStyle: null,
    lineWidth: 1,
    lineCap: 'butt',
    imageSmoothingEnabled: true,
    save() {},
    restore() {},
    setTransform() {},
    createLinearGradient() { counters.linearGradient += 1; return gradient; },
    createRadialGradient() { counters.radialGradient += 1; return gradient; },
    createPattern() { return null; },
    createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; },
    getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; },
    putImageData() {},
    fillRect() { counters.fillRect += 1; },
    strokeRect() {},
    clearRect() { counters.clearRect += 1; },
    drawImage(src, dx, dy, dw, dh) { counters.drawImage += 1; if (typeof dw === 'number') stamps.push({ dw, dh }); },
    beginPath() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() { counters.quadratic += 1; },
    closePath() {},
    arc() { counters.arc += 1; },
    fill() { counters.fill += 1; },
    stroke() {},
    fillText() {},
    measureText() { return { width: 0 }; },
  };
  const guarded = guardCtx(raw);
  guards.push(guarded);
  return guarded.ctx;
}

/** 建一个实例并跑一帧，返回该帧的计数（烘焙不计入）。 */
function runFrame(def, { lod = 'high', warm = 3 } = {}) {
  const canvas = (() => {
    const ctx = makeFakeCtx();
    const el = {
      width: WIDTH * DPR, height: HEIGHT * DPR, clientWidth: WIDTH, clientHeight: HEIGHT, style: {},
      getContext(id) { return id === '2d' ? ctx : null; },
    };
    el.ownerDocument = { createElement: () => { const c2 = makeFakeCtx(); return { width: 1, height: 1, getContext: () => c2 }; } };
    return el;
  })();
  const ctx = canvas.getContext('2d');
  const instance = def.create({ canvas, ctx, width: WIDTH, height: HEIGHT, dpr: DPR, seed: 20260901, biome: 'tide', lod });
  const frame = (t) => ({
    t, dt: 0.016, seed: 20260901,
    pointer: { x: 0.5, y: 0.5, vx: 0, vy: 0, down: false },
    audio: null, biome: 'tide', reducedMotion: false,
    size: { w: WIDTH, h: HEIGHT, dpr: DPR },
  });
  for (let i = 0; i < warm; i += 1) { instance.update(frame(i * 0.016)); instance.draw(frame(i * 0.016)); }
  for (const key of Object.keys(counters)) counters[key] = 0;
  stamps = [];
  instance.update(frame(0.5));
  instance.draw(frame(0.5));
  const one = { ...counters };
  instance.dispose();
  instance.dispose();
  return one;
}

const mod = await loadTsModule(path.join(REPO_ROOT, 'shared', 'parts', 'tide-medium', 'index.ts'));
const makeTideMedium = mod.makeTideMedium;
if (typeof makeTideMedium !== 'function') {
  console.error('tide-medium bench: FAIL —— 没有导出 makeTideMedium');
  process.exit(1);
}

let failed = false;
const check = (ok, msg, detail) => {
  if (!ok) { console.error(`  ❌ ${msg}${detail ? `（${detail}）` : ''}`); failed = true; }
};

// ── A. 已定层：微粒 ──
const full = runFrame(makeTideMedium({ variant: 'C' }));           // C 无焦散，微粒数可干净读出
console.log('tide-medium —— 每帧指令（1280×720@dpr2，high 档，variant=C）');
console.log(`  全开：drawImage=${full.drawImage} arc=${full.arc} fill=${full.fill}`);
console.log(`  → 期望：底图 1 次 blit；微粒（浅层 20–48 个）arc + 1 次 fill；C 版无光斑`);

check(full.drawImage === 1, '底图应每帧 1 次 blit', `实得 ${full.drawImage}`);
// 微粒只画**浅层**（y ≤ 0.5）：深层颗粒本就稀，且暗底上的亮点会打破"亮区单调"（判据 1）。
// 所以数量随 seed 在 ~24–40 之间浮动，断言给区间而不是定值。
check(full.arc >= 20 && full.arc <= 48, '微粒 arc 数应在 20–48（只画浅层）', `实得 ${full.arc}`);
check(full.fill === 1, 'C 版应只有微粒那 1 次 fill（无焦散）', `实得 ${full.fill}`);

// 独立关闭微粒
const noMotes = runFrame(makeTideMedium({ variant: 'C', motes: false }));
console.log(`  关微粒：arc=${noMotes.arc} fill=${noMotes.fill}（应 0 / 0）`);
check(noMotes.arc === 0, '关掉 motes 后不该有 arc', `实得 ${noMotes.arc}`);
check(noMotes.fill === 0, '关掉 motes 后不该有 fill', `实得 ${noMotes.fill}`);

// ── B. 已定层：雾（烘焙期） ──
const fogBake = (() => {
  const ctx = makeFakeCtx();
  const canvas = {
    width: WIDTH * DPR, height: HEIGHT * DPR, clientWidth: WIDTH, clientHeight: HEIGHT, style: {},
    getContext(id) { return id === '2d' ? ctx : null; },
    ownerDocument: { createElement: () => { const c2 = makeFakeCtx(); return { width: 1, height: 1, getContext: () => c2 }; } },
  };
  for (const key of Object.keys(counters)) counters[key] = 0;
  const instance = makeTideMedium({ variant: 'C' }).create({
    canvas, ctx, width: WIDTH, height: HEIGHT, dpr: DPR, seed: 20260901, biome: 'tide', lod: 'high',
  });
  instance.draw({
    t: 0.1, dt: 0.016, seed: 20260901,
    pointer: { x: 0.5, y: 0.5, vx: 0, vy: 0, down: false },
    audio: null, biome: 'tide', reducedMotion: false, size: { w: WIDTH, h: HEIGHT, dpr: DPR },
  });
  const baked = { linear: counters.linearGradient, radial: counters.radialGradient };
  instance.dispose();
  return baked;
})();
console.log(`\n  雾（烘焙期）：linearGradient=${fogBake.linear} radialGradient=${fogBake.radial}`);
console.log(`  → C 版应 1 条竖向雾渐变 + 1 条四周加浓径向渐变`);
check(fogBake.linear >= 1, '应至少建 1 条竖向雾渐变', `实得 ${fogBake.linear}`);
check(fogBake.radial >= 1, 'C 版应建 1 条四周加浓的径向渐变', `实得 ${fogBake.radial}`);

const noFog = (() => {
  const ctx = makeFakeCtx();
  const canvas = {
    width: WIDTH * DPR, height: HEIGHT * DPR, clientWidth: WIDTH, clientHeight: HEIGHT, style: {},
    getContext(id) { return id === '2d' ? ctx : null; },
    ownerDocument: { createElement: () => { const c2 = makeFakeCtx(); return { width: 1, height: 1, getContext: () => c2 }; } },
  };
  for (const key of Object.keys(counters)) counters[key] = 0;
  const instance = makeTideMedium({ variant: 'C', fog: false }).create({
    canvas, ctx, width: WIDTH, height: HEIGHT, dpr: DPR, seed: 20260901, biome: 'tide', lod: 'high',
  });
  instance.draw({
    t: 0.1, dt: 0.016, seed: 20260901,
    pointer: { x: 0.5, y: 0.5, vx: 0, vy: 0, down: false },
    audio: null, biome: 'tide', reducedMotion: false, size: { w: WIDTH, h: HEIGHT, dpr: DPR },
  });
  const baked = { linear: counters.linearGradient, radial: counters.radialGradient };
  instance.dispose();
  return baked;
})();
console.log(`  关雾：linearGradient=${noFog.linear} radialGradient=${noFog.radial}`);
// 关雾后仍会有色阶那 1 条（grade 默认开），但不应再有"四周加浓"的径向
check(noFog.radial === 0, '关掉 fog 后不该再建四周加浓的径向渐变', `实得 ${noFog.radial}`);

// ── C. 待裁层：焦散必须能独立关（改成精灵盖印后按 drawImage 计数）──
const withCaustic = runFrame(makeTideMedium({ variant: 'A' }));
const noCaustic = runFrame(makeTideMedium({ variant: 'A', glow: 'none' }));
console.log(`\n  焦散（待裁）：A 版 drawImage=${withCaustic.drawImage}（1 底图 + 焦散盖印）· 关掉后=${noCaustic.drawImage}（应只有 1 底图）`);
check(noCaustic.drawImage === 1, '没有 glow 时应只剩 1 次底图 blit', `实得 ${noCaustic.drawImage}`);
check(Math.abs(noCaustic.arc - full.arc) <= 0, '关掉 glow 不应改变微粒数（两者独立）', `全开 ${full.arc} vs 关掉 ${noCaustic.arc}`);
const causticStamps = withCaustic.drawImage - 1;


// ── D. 待裁层：色阶必须能独立关（关掉仍能画，不抛错） ──
const noGrade = runFrame(makeTideMedium({ variant: 'A', grade: false }));
console.log(`  色阶（待裁）：关掉后 drawImage=${noGrade.drawImage}（≥1 即有底图，不白屏）`);
check(noGrade.drawImage >= 1, '关掉 grade 后仍应有底图 blit（不能白屏）', `实得 ${noGrade.drawImage}`);

// ── D. **零实体**（2026-11-18 重设计后的判据）──
// 圆盘是"可指认的闭合亮形" = 实体，违反 S2「中心 60% 内零实体」。所以 A 版不再产生任何光斑，
// 这里断言的是"**一个圆盘都没有**"，而不是"圆盘的尺寸合不合规"（那一整套判据已作废）。
{
  const stampsOnly = stamps.filter((s2) => s2.dw < WIDTH * 0.9);
  console.log(`\n  D. 零实体：光斑盖印 ${stampsOnly.length} 个（判据 **= 0**，圆盘即实体）`);
  if (stampsOnly.length !== 0) {
    console.error(`    ❌ 仍有 ${stampsOnly.length} 个圆形光斑 —— 它们是可指认的实体，S2 禁止`);
    failed = true;
  }
}

for (const guard of guards) {
  if (guard.missing.size > 0) {
    console.error(`\ntide-medium bench: FAIL —— 假 ctx 缺少方法：${[...guard.missing].join(', ')}`);
    process.exit(1);
  }
}

if (failed) {
  console.error('\ntide-medium bench: FAIL');
  process.exit(1);
}
console.log('\ntide-medium bench: PASS');
