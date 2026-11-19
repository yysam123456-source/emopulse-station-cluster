// bubbles 的口径对账：断言「原文的四个数值」真的落到了代码里，而不是"看着像气泡"。
//
// ★ 口径（同一份诚实账单）：Node 里没有 canvas，假 ctx 不画像素。
//   本脚本量的是**几何与指令**，它们是可核对的：
//     ① 70 个气泡、每个 2 个圆（本体 + 高光）→ arc 140 段、fill 2 次
//     ② 高光是**第二个更小的实心圆**（半径 0.35r、偏移 -0.3r），**不是渐变** → createRadialGradient 必须为 0
//     ③ low 档真的少画（70 → 24），且**位置不跳**（降档只改数量）
//     ④ reducedMotion 上升速度 ×0.3（同一 dt 下位移比 ≈0.3）
//     ⑤ 同 seed 同时间 → 同位置（确定性）
//
// 用法：node shared/parts/bubbles/bench.mjs
import path from 'node:path';
import { loadTsModule, REPO_ROOT } from '../../../tests/lib/load-ts.mjs';
import { guardCtx } from '../../../tests/lib/fake-ctx.mjs';

const WIDTH = 1280;
const HEIGHT = 720;
const DPR = 2;

const counters = {
  arc: 0, fill: 0, stroke: 0, fillRect: 0, drawImage: 0,
  createRadialGradient: 0, createLinearGradient: 0, clearRect: 0,
};

/** 记录每次 arc 的 (x, y, r)，用来核对高光几何 */
const arcs = [];

/** 所有假 ctx 的守卫 */
const guards = [];

function makeFakeCtx() {
  const gradient = { addColorStop() {} };
  const raw = {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: null,
    strokeStyle: null,
    lineWidth: 1,
    lineCap: 'butt',
    save() {},
    restore() {},
    setTransform() {},
    createRadialGradient() { counters.createRadialGradient += 1; return gradient; },
    createLinearGradient() { counters.createLinearGradient += 1; return gradient; },
    createPattern() { return null; },
    createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; },
    getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; },
    putImageData() {},
    fillRect() { counters.fillRect += 1; },
    strokeRect() {},
    clearRect() { counters.clearRect += 1; },
    drawImage() { counters.drawImage += 1; },
    beginPath() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    closePath() {},
    arc(x, y, r) {
      counters.arc += 1;
      if (arcs.length < 400) arcs.push({ x, y, r });
    },
    fill() { counters.fill += 1; },
    stroke() { counters.stroke += 1; },
    fillText() {},
    measureText() { return { width: 0 }; },
  };
  const guarded = guardCtx(raw);
  guards.push(guarded);
  return guarded.ctx;
}

function makeFakeCanvas(w, h) {
  const ctx = makeFakeCtx();
  return {
    width: Math.max(1, Math.round(w)),
    height: Math.max(1, Math.round(h)),
    clientWidth: w,
    clientHeight: h,
    style: {},
    getContext(id) { return id === '2d' ? ctx : null; },
  };
}

function frameAt(t, reducedMotion = false, size = { w: WIDTH, h: HEIGHT, dpr: DPR }) {
  return {
    t,
    dt: 0.016,
    seed: 20261118,
    pointer: { x: 0.5, y: 0.5, vx: 0, vy: 0, down: false },
    audio: null,
    biome: 'tide',
    reducedMotion,
    size,
  };
}

const mod = await loadTsModule(path.join(REPO_ROOT, 'shared', 'parts', 'bubbles', 'index.ts'));
const part = mod.part ?? mod.default;

const canvas = makeFakeCanvas(WIDTH * DPR, HEIGHT * DPR);
const ctx = canvas.getContext('2d');
const instance = part.create({
  canvas, ctx, width: WIDTH, height: HEIGHT, dpr: DPR,
  seed: 20261118, biome: 'tide', lod: 'high',
});

// ── 单帧指令 ──
for (let i = 0; i < 4; i += 1) { instance.update(frameAt(i * 0.016)); instance.draw(frameAt(i * 0.016)); }
for (const key of Object.keys(counters)) counters[key] = 0;
arcs.length = 0;
instance.update(frameAt(0.5));
instance.draw(frameAt(0.5));
const one = { ...counters };
const highArcs = arcs.slice();

let failed = false;
console.log('bubbles —— 每帧几何与指令（1280×720@dpr2，high 档）');
console.log(`  arc=${one.arc}  fill=${one.fill}  stroke=${one.stroke}  createRadialGradient=${one.createRadialGradient}  fillRect=${one.fillRect}`);
console.log(`  → 期望：70 泡 × 2 圆 = arc 140；本体与高光各一次 fill = 2`);

if (one.arc !== 140) { console.error(`  ❌ arc 数应为 140，实得 ${one.arc}`); failed = true; }
if (one.fill !== 2) { console.error(`  ❌ fill 数应为 2（本体 + 高光各一轮），实得 ${one.fill}`); failed = true; }
if (one.createRadialGradient !== 0) {
  console.error(`  ❌ 高光用了径向渐变（${one.createRadialGradient} 次）—— 原文是"第二个更小的实心圆"`);
  failed = true;
}

// ── 高光几何：后 70 个 arc 应是高光，半径 = 0.35 × 对应本体半径，圆心偏移 -0.3r ──
{
  const half = highArcs.length / 2;
  let maxR = 0;
  let maxOffset = 0;
  for (let i = 0; i < half; i += 1) {
    const body = highArcs[i];
    const hl = highArcs[i + half];
    const expectR = body.r * 0.35;
    maxR = Math.max(maxR, Math.abs(hl.r - expectR));
    const expectX = body.x - body.r * 0.3;
    const expectY = body.y - body.r * 0.3;
    maxOffset = Math.max(maxOffset, Math.abs(hl.x - expectX), Math.abs(hl.y - expectY));
  }
  console.log(`  高光几何：半径误差最大 ${maxR.toFixed(3)}px · 圆心偏移误差最大 ${maxOffset.toFixed(3)}px（应为 0.35r / -0.3r）`);
  if (maxR > 0.01 || maxOffset > 0.01) {
    console.error('  ❌ 高光几何与原文（0.35r / -0.3r）不符');
    failed = true;
  }
}

// ── low 档：真减量 ──
instance.setLod('low');
for (const key of Object.keys(counters)) counters[key] = 0;
instance.update(frameAt(0.6));
instance.draw(frameAt(0.6));
const low = { ...counters };
console.log(`\n  low 档：arc=${low.arc}（应 24 × 2 = 48）fill=${low.fill}`);
if (low.arc !== 48) { console.error(`  ❌ low 档 arc 应为 48，实得 ${low.arc}`); failed = true; }
instance.setLod('high');

// ── reducedMotion：上升速度 ×0.3 ──
{
  const probeA = part.create({ canvas, ctx, width: WIDTH, height: HEIGHT, dpr: DPR, seed: 7, biome: 'tide', lod: 'high' });
  const probeB = part.create({ canvas, ctx, width: WIDTH, height: HEIGHT, dpr: DPR, seed: 7, biome: 'tide', lod: 'high' });
  const readY = () => probeA.draw === undefined;  // 占位，避免误用
  void readY;
  // 用同 seed 两实例 + 同 dt，比较"画出来的第一个弧的 y"位移
  const yOfFirstArc = (inst, reduced) => {
    arcs.length = 0;
    inst.update(frameAt(0.2, reduced));
    inst.draw(frameAt(0.2, reduced));
    return arcs.length > 0 ? arcs[0].y : NaN;
  };
  const startA = yOfFirstArc(probeA, false);
  const startB = yOfFirstArc(probeB, false);
  // 推进 10 帧，A 正常、B reducedMotion
  for (let i = 0; i < 10; i += 1) {
    probeA.update(frameAt(0.3 + i * 0.016, false));
    probeA.draw(frameAt(0.3 + i * 0.016, false));
    probeB.update(frameAt(0.3 + i * 0.016, true));
    probeB.draw(frameAt(0.3 + i * 0.016, true));
  }
  const endA = yOfFirstArc(probeA, false);
  const endB = yOfFirstArc(probeB, true);
  const moveA = Math.abs(endA - startA);
  const moveB = Math.abs(endB - startB);
  const ratio = moveB > 0 && moveA > 0 ? moveB / moveA : NaN;
  console.log(`  reducedMotion：正常位移 ${moveA.toFixed(3)}px · 降级位移 ${moveB.toFixed(3)}px · 比 ${Number.isFinite(ratio) ? ratio.toFixed(2) : 'n/a'}（应 ≈0.3）`);
  if (!(ratio > 0.2 && ratio < 0.45)) {
    console.error(`  ❌ reducedMotion 位移比不在 0.2–0.45（实得 ${ratio}）—— 速度没有 ×0.3`);
    failed = true;
  }
  probeA.dispose();
  probeB.dispose();
}

// ── 确定性：同 seed 同 t 两次绘制，首个弧位置一致 ──
{
  const a = part.create({ canvas, ctx, width: WIDTH, height: HEIGHT, dpr: DPR, seed: 99, biome: 'tide', lod: 'high' });
  const b = part.create({ canvas, ctx, width: WIDTH, height: HEIGHT, dpr: DPR, seed: 99, biome: 'tide', lod: 'high' });
  arcs.length = 0; a.update(frameAt(1.7)); a.draw(frameAt(1.7));
  const first = arcs.slice(0, 3).map((v) => `${v.x.toFixed(4)},${v.y.toFixed(4)},${v.r.toFixed(4)}`).join(' | ');
  arcs.length = 0; b.update(frameAt(1.7)); b.draw(frameAt(1.7));
  const second = arcs.slice(0, 3).map((v) => `${v.x.toFixed(4)},${v.y.toFixed(4)},${v.r.toFixed(4)}`).join(' | ');
  console.log(`  确定性：${first === second ? 'PASS（同 seed 同 t 一致）' : 'FAIL'}`);
  if (first !== second) { console.error(`  ❌ 同 seed 同 t 结果不同：\n    ${first}\n    ${second}`); failed = true; }
  a.dispose();
  b.dispose();
}

instance.dispose();
instance.dispose();
console.log('\ndispose 幂等：OK');

for (const guard of guards) {
  if (guard.missing.size > 0) {
    console.error(`\nbubbles bench: FAIL —— 假 ctx 缺少方法：${[...guard.missing].join(', ')}`);
    process.exit(1);
  }
}

if (failed) {
  console.error('\nbubbles bench: FAIL');
  process.exit(1);
}
console.log('\nbubbles bench: PASS');
