// pixel-post 对账（重写版：零件已删 dither/blockPx、补 vignette、颗粒搬进快路径）。
//
// ★ 这份 bench 的**核心职责**是架构师提的那条：
//   **每个零件必须吐一对"开/关"可辨数字** —— 因为"它有没有在工作"不能靠眼睛。
//   产品经理就是在 1:1 下"看见网点"（其实是抗锯齿）才误判的；缺席那一对是根因。
//
// 六条断言（都要能红）：
//   A. 快路径每帧 **1 次 drawImage**
//   B. **`getImageData` / `putImageData` = 0** —— 删干净的直接证据
//   C. **颗粒是动的**：连续 3 帧用的 grain tile 对象不同（防"搬运没做就直接删读回路径"）
//   D. **开/关一对**：vignette 0 vs 0.14、grain 0 vs 0.04，各出一对可辨数字
//   E. 全中性（三项全 0）→ **零指令**
//   F. `costMs` 随参数变
//
// 用法：node shared/parts/pixel-post/bench.mjs
import path from 'node:path';
import { loadTsModule, REPO_ROOT } from '../../../tests/lib/load-ts.mjs';
import { guardCtx } from '../../../tests/lib/fake-ctx.mjs';

const WIDTH = 1280;
const HEIGHT = 720;
const DPR = 2;

const counters = {
  drawImage: 0, clearRect: 0, fillRect: 0, getImageData: 0, putImageData: 0,
  createPattern: 0, createRadialGradient: 0, createImageData: 0, linear: 0,
};

/** 每次 radial 渐变的色标（用于出"终点 alpha"这对数字） */
let radialStops = [];
/** 每次 createPattern 的源对象（用于验颗粒换相） */
let patternSources = [];
/** 每次 drawImage 的源对象（验每帧换的是哪张预烘覆盖图） */
let blitSources = [];

/** 所有假 ctx 的守卫 */
const guards = [];

function makeFakeCtx() {
  const makeGradient = (kind) => ({
    addColorStop(offset, color) {
      if (kind === 'radial') radialStops.push({ offset, color });
    },
  });
  const raw = {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: null,
    strokeStyle: null,
    lineWidth: 1,
    imageSmoothingEnabled: true,
    save() {}, restore() {}, setTransform() {},
    translate() {}, scale() {}, rotate() {},
    createLinearGradient() { counters.linear += 1; return makeGradient('linear'); },
    createRadialGradient() { counters.createRadialGradient += 1; return makeGradient('radial'); },
    createPattern(src) { counters.createPattern += 1; patternSources.push(src); return { __pattern: true }; },
    createImageData(w, h) {
      counters.createImageData += 1;
      return { data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: w, height: h };
    },
    getImageData(x, y, w, h) {
      counters.getImageData += 1;
      return { data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: w, height: h };
    },
    putImageData() { counters.putImageData += 1; },
    fillRect() { counters.fillRect += 1; },
    strokeRect() {},
    clearRect() { counters.clearRect += 1; },
    drawImage(src) { counters.drawImage += 1; if (src) blitSources.push(src); },
    beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, arc() {}, fill() {}, stroke() {}, rect() {}, clip() {},
    fillText() {}, measureText() { return { width: 0 }; },
  };
  const guarded = guardCtx(raw);
  guards.push(guarded);
  return guarded.ctx;
}

/** 假 canvas（带 ownerDocument，使离屏可用）。 */
function makeFakeCanvas(w, h, withDoc) {
  const ctx = makeFakeCtx();
  const el = {
    width: Math.max(1, Math.round(w)),
    height: Math.max(1, Math.round(h)),
    clientWidth: w,
    clientHeight: h,
    style: {},
    getContext(id) { return id === '2d' ? ctx : null; },
  };
  if (withDoc) el.ownerDocument = { createElement: () => makeFakeCanvas(1, 1, false) };
  return el;
}

function frameAt(t, reducedMotion = false) {
  return {
    t, dt: 0.016, seed: 20261118,
    pointer: { x: 0.5, y: 0.5, vx: 0, vy: 0, down: false },
    audio: null, biome: 'room', reducedMotion,
    size: { w: WIDTH, h: HEIGHT, dpr: DPR },
  };
}

const mod = await loadTsModule(path.join(REPO_ROOT, 'shared', 'parts', 'pixel-post', 'index.ts'));
const makePixelPost = mod.makePixelPost;
if (typeof makePixelPost !== 'function') {
  console.error('pixel-post bench: FAIL —— 没有导出 makePixelPost');
  process.exit(1);
}

const canvas = makeFakeCanvas(WIDTH * DPR, HEIGHT * DPR, true);
canvas.clientWidth = WIDTH;
canvas.clientHeight = HEIGHT;
const ctx = canvas.getContext('2d');

const mount = (def) => def.create({
  canvas, ctx, width: WIDTH, height: HEIGHT, dpr: DPR,
  seed: 20261118, biome: 'room', lod: 'high',
});

let failed = false;
const bad = (msg) => { console.error(`  ❌ ${msg}`); failed = true; };
const reset = () => { for (const k of Object.keys(counters)) counters[k] = 0; };

// ── A/B ──
{
  const inst = mount(makePixelPost({ grain: 0.04, scanline: 0, vignette: 0.08 }));
  for (let i = 0; i < 4; i += 1) inst.draw(frameAt(i * 0.016));
  reset();
  inst.draw(frameAt(0.5));
  const one = { ...counters };
  inst.dispose();
  console.log('pixel-post —— 每帧指令（1280×720@dpr2，high 档）');
  console.log(`  drawImage=${one.drawImage} clearRect=${one.clearRect} fillRect=${one.fillRect}`);
  console.log(`  getImageData=${one.getImageData} putImageData=${one.putImageData}（必须均为 0）`);
  if (one.drawImage !== 1) bad(`快路径每帧应恰好 1 次 drawImage，实得 ${one.drawImage}`);
  if (one.getImageData !== 0) bad(`删干净之后不该再读回像素，getImageData=${one.getImageData}`);
  if (one.putImageData !== 0) bad(`不该再写回像素，putImageData=${one.putImageData}`);
}

// ── C：颗粒换相（3 帧 blit 的覆盖图对象必须不同）──
// 改成"预烘 N 张、每帧挑一张 blit"之后，动画体现在**blit 的源对象**上，
// 不再是每帧 createPattern —— 那是"每帧重烘"的写法，实测把帧时间从 16.7ms 拉到 29.7ms。
{
  const inst = mount(makePixelPost({ grain: 0.04, scanline: 0, vignette: 0 }));
  inst.draw(frameAt(0));
  blitSources = [];
  inst.draw(frameAt(0));
  inst.draw(frameAt(0.05));
  inst.draw(frameAt(0.09));
  const refs = new Set(blitSources);
  inst.dispose();
  console.log(`\nC. 颗粒换相：3 帧 blit ${blitSources.length} 次，不同覆盖图对象 ${refs.size} 个`);
  if (blitSources.length !== 3) bad(`3 帧应有 3 次 blit，实得 ${blitSources.length}`);
  if (refs.size < 2) bad(`连续 3 帧 blit 了同一张覆盖图（${refs.size} 个不同对象）—— 颗粒是冻的`);
}

// ── D：开/关一对数字 ──
{
  const read = (opts) => {
    radialStops = [];
    reset();
    const inst = mount(makePixelPost(opts));
    for (let i = 0; i < 2; i += 1) inst.draw(frameAt(i * 0.016));
    const out = {
      radial: counters.createRadialGradient,
      pattern: counters.createPattern,
      lastStop: radialStops.length ? radialStops[radialStops.length - 1].color : '(无)',
    };
    inst.dispose();
    reset();
    return out;
  };
  const vigOff = read({ grain: 0, scanline: 0, vignette: 0 });
  const vigOn = read({ grain: 0, scanline: 0, vignette: 0.14 });
  console.log(`\nD. 一对数字（vignette）：关 → radial ${vigOff.radial} 次 / 开 → ${vigOn.radial} 次，终点色 ${vigOn.lastStop}`);
  if (vigOn.radial === vigOff.radial) bad('vignette 0 与 0.14 的渐变次数相同 —— 暗角没被画出来');
  if (!String(vigOn.lastStop).includes('0.14')) bad(`vignette 终点色不是 0.14（实得 ${vigOn.lastStop}）`);

  const grainOff = read({ grain: 0, scanline: 0, vignette: 0 });
  const grainOn = read({ grain: 0.04, scanline: 0, vignette: 0 });
  console.log(`   一对数字（grain）：关 → pattern ${grainOff.pattern} 次 / 开 → ${grainOn.pattern} 次`);
  if (grainOn.pattern === grainOff.pattern) bad('grain 0 与 0.04 的 pattern 次数相同 —— 颗粒没被画出来');

  const scanOff = read({ grain: 0, scanline: 0, vignette: 0 });
  const scanOn = read({ grain: 0, scanline: 0.06, vignette: 0 });
  console.log(`   一对数字（scanline）：关 → pattern ${scanOff.pattern} 次 / 开 → ${scanOn.pattern} 次`);
  if (scanOn.pattern === scanOff.pattern) bad('scanline 0 与 0.06 的 pattern 次数相同 —— 扫描线没被画出来');
}

// ── E：全中性零指令 ──
{
  reset();
  const inst = mount(makePixelPost({ grain: 0, scanline: 0, vignette: 0 }));
  for (let i = 0; i < 3; i += 1) inst.draw(frameAt(i * 0.016));
  const total = counters.drawImage + counters.fillRect + counters.clearRect + counters.createPattern + counters.createRadialGradient;
  inst.dispose();
  console.log(`\nE. 全中性（三项全 0）：指令总数 ${total}（需 0）`);
  if (total !== 0) bad(`全中性时仍在画东西（${total} 条指令）—— draw() 应早退`);
}

// ── F：costMs 随参数变 ──
{
  const a = makePixelPost({ grain: 0.04, scanline: 0, vignette: 0.08 }).costMs;
  const b = makePixelPost({ grain: 0.04, scanline: 0.06, vignette: 0.08 }).costMs;
  const c = makePixelPost({ grain: 0, scanline: 0, vignette: 0 }).costMs;
  console.log(`\nF. costMs：常规 ${a} · 带扫描线 ${b} · 全中性 ${c}`);
  if (!(b > a)) bad('开了扫描线却不变贵 —— costMs 没随参数变');
  if (!(c < 0.05)) bad(`全中性 costMs 应 ≈0，实得 ${c}`);
  // ★ 架构师那条：删了读回路径之后，**声明值必须跟着掉**。
  //   降档决策只看 `costMs`（声明），不看 `cpuMs`（实际）—— 声明值不跟着改，
  //   就会出现"画面快了、账还宣布 5.2ms → 整站照样降档、ASCII 格子照样变粗"，
  //   省下的 5ms 一分不兑现，而所有门全绿。
  const declared = makePixelPost({ vignette: 0.14, grain: 0.03 }).costMs;
  const expect = 3.69 * 0.5; // ≈1.845
  console.log(`  账与现实验证：vignette 0.14 + grain 0.03 → costMs ${declared}（应 ≈${expect.toFixed(2)}，旧的读回路径是 ~5.2）`);
  if (Math.abs(declared - expect) > 0.3) {
    bad(`costMs=${declared} 与"只剩一次 blit"的 ${expect.toFixed(2)} 不符 —— 声明值没跟着删掉读回分支`);
  }
}

for (const guard of guards) {
  if (guard.missing.size > 0) {
    console.error(`\npixel-post bench: FAIL —— 假 ctx 缺少方法：${[...guard.missing].join(', ')}`);
    process.exit(1);
  }
}

if (failed) {
  console.error('\npixel-post bench: FAIL（见上面的判据）');
  process.exit(1);
}
console.log('\npixel-post bench: PASS');
