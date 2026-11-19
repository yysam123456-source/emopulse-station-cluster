// field-ground 的 costMs 依据核对。
//
// ★ 先说清这个脚本能测什么、不能测什么 —— 免得把假数字当真：
//   Node 里没有 canvas 实现。假 ctx 只记账、不画像素，所以它测出来的毫秒数
//   **只是 JS 侧指令发射成本**（约 0.004ms），完全不含 GPU 填充。
//   而本件的真实成本 99% 在填充（1 次全屏 blit + 3 次山体 blit + 520 段描边），
//   所以「用假 ctx 的计时当 costMs」是错的，会把一个 3~4ms 的零件报成 0.004ms。
//
// 本脚本因此做三件事：
//   ① 输出**每帧画布指令计数**（drawImage 次数、fill 次数、stroke 段数）—— 这些是确定的、可核对的事实
//   ② 按声明的填充率常数推出估算填充成本，和 part.costMs 对账
//   ③ 输出 JS 侧耗时的下界（用来说明「JS 不是瓶颈」）
//
// 用法：node shared/parts/field-ground/bench.mjs
import path from 'node:path';
import { loadTsModule, REPO_ROOT } from '../../../tests/lib/load-ts.mjs';

const WIDTH = 1280;
const HEIGHT = 720;
const DPR = 2;
const WARMUP = 20;
const SAMPLES = 120;

/** 声明的吞吐常数（ms 单位），与 index.ts 注释同源。 */
const MS_PER_MPX_OPAQUE = 0.35;   // 不透明整屏 blit
const MS_PER_MPX_SOLID_FILL = 0.30; // 实色多边形填充
const MS_PER_K_SEGMENTS = 0.8;    // 描边，每千段
/** 草地：high 档草叶数（与 index.ts 同值） */
const BLADES_HIGH = 560;
/** 山体覆盖的屏幕高度比例（base≈0.60，波动 ±0.085 → 从 0.51h 到底） */
const HILL_COVER = 0.50;
/** 三道的山脊亮边：每层 34 个曲线段 */
const RIM_SEGMENTS = 3 * 34;
/** 最近一档的草穗个数（约 1/3 的草落在近档） */
const TIP_COUNT = Math.round(560 / 3);

/**
 * 造一个只记账的假 2D 上下文。
 *
 * @returns {object} 假 ctx
 */
function makeFakeCtx() {
  const gradient = { addColorStop() {} };
  const counts = { drawImage: 0, fill: 0, stroke: 0, fillRect: 0, segments: 0, gradients: 0, clip: 0 };
  return {
    counts,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    lineCap: 'butt',
    save() {},
    restore() {},
    setTransform() {},
    createLinearGradient() { counts.gradients += 1; return gradient; },
    createRadialGradient() { counts.gradients += 1; return gradient; },
    fillRect() { counts.fillRect += 1; counts.fill += 1; },
    drawImage() { counts.drawImage += 1; },
    beginPath() {},
    moveTo() {},
    lineTo() { counts.segments += 1; },
    quadraticCurveTo() { counts.segments += 1; },
    closePath() {},
    fill() { counts.fill += 1; },
    stroke() { counts.stroke += 1; },
    arc() {},
    // clip 必须实现：field-ground 用前景山脊裁切草坡。缺了它会每帧抛错、
    // 被装配器隔离、画到一半就停 —— 而计数断言反而"恰好"成立（2026-11-18 踩过）。
    clip() { counts.clip += 1; },
    createPattern() { return null; },
    clearRect() {},
  };
}

/**
 * 造一个可当离屏画布用的假 canvas。
 *
 * @returns {object} 假 canvas
 */
function makeFakeCanvas() {
  const ctx = makeFakeCtx();
  const el = {
    width: 0,
    height: 0,
    getContext(id) { return id === '2d' ? ctx : null; },
  };
  return el;
}

const mod = await loadTsModule(path.join(REPO_ROOT, 'shared', 'parts', 'field-ground', 'index.ts'));
const part = mod.part ?? mod.default;

const mainCtx = makeFakeCtx();
const mainCanvas = {
  width: WIDTH * DPR,
  height: HEIGHT * DPR,
  clientWidth: WIDTH,
  clientHeight: HEIGHT,
  style: {},
  // 有 ownerDocument 才会走「离屏烘焙」这条真实路径；没有会走降级路径（慢 3 倍）
  ownerDocument: { createElement: () => makeFakeCanvas() },
  getContext(id) { return id === '2d' ? mainCtx : null; },
};

const instance = part.create({
  canvas: mainCanvas,
  ctx: mainCtx,
  width: WIDTH,
  height: HEIGHT,
  dpr: DPR,
  seed: 20261118,
  biome: 'field',
  lod: 'high',
});

/**
 * 造一帧；pointer 走一条正弦轨迹，避免常量折叠。
 *
 * @param {number} t 秒
 * @returns {object} WorldFrame
 */
function frameAt(t) {
  return {
    t,
    dt: 0.016,
    seed: 20261118,
    pointer: { x: 0.5 + Math.sin(t) * 0.3, y: 0.5, vx: Math.cos(t) * 0.2, vy: 0, down: false },
    audio: null,
    biome: 'field',
    reducedMotion: false,
    size: { w: WIDTH, h: HEIGHT, dpr: DPR },
  };
}

let clock = 0;
for (let i = 0; i < WARMUP; i += 1) {
  clock += 16;
  instance.draw(frameAt(clock / 1000));
}

// 只统计**一帧**的指令数：把计数清零后跑一帧
for (const k of Object.keys(mainCtx.counts)) mainCtx.counts[k] = 0;
instance.draw(frameAt(clock / 1000));
const one = { ...mainCtx.counts };

const samples = [];
for (let i = 0; i < SAMPLES; i += 1) {
  const frame = frameAt(clock / 1000);
  clock += 16;
  const started = performance.now();
  instance.draw(frame);
  samples.push(performance.now() - started);
}
samples.sort((a, b) => a - b);
const median = samples[Math.floor(samples.length / 2)];

const mpx = (WIDTH * DPR * HEIGHT * DPR) / 1e6;
// 1 次全屏不透明 blit + 3 次实色山体填充（各覆盖 50% 屏高）+ 520 段草叶描边
const blitFullMs = mpx * MS_PER_MPX_OPAQUE;
const hillFillMs = 3 * mpx * HILL_COVER * MS_PER_MPX_SOLID_FILL;
// 描边段数 = 560 根草 + 3 道山脊亮边（各 34 段）
const strokeMs = ((BLADES_HIGH + RIM_SEGMENTS) / 1000) * MS_PER_K_SEGMENTS;
/** 草穗：一次 fill 画 TIP_COUNT 个小圆，按描边单价折半估 */
const tipMs = (TIP_COUNT / 1000) * MS_PER_K_SEGMENTS * 0.5;
const estimate = blitFullMs + hillFillMs + strokeMs + tipMs;

console.log('field-ground —— 每帧画布指令（1280×720@dpr2，high 档）');
console.log(`  drawImage=${one.drawImage}  fill=${one.fill}  fillRect=${one.fillRect}  stroke=${one.stroke}  曲线段=${one.segments}  createGradient=${one.gradients}  clip=${one.clip}`);
console.log('  → createGradient=0 是设计目标：所有渐变都烘在离屏里，每帧不重建');
console.log('  → 山体走实色 fill 而不是离屏 blit：实色无纹理采样，比带 alpha 的 blit 便宜一半以上');
console.log('');
console.log('成本估算（按声明的填充率常数）');
console.log(`  全屏 blit        ${blitFullMs.toFixed(2)} ms  (${mpx.toFixed(2)} Mpx × ${MS_PER_MPX_OPAQUE})`);
console.log(`  3× 山体实色填充  ${hillFillMs.toFixed(2)} ms  (3 × ${(mpx * HILL_COVER).toFixed(2)} Mpx × ${MS_PER_MPX_SOLID_FILL})`);
console.log(`  草叶+山脊描边    ${strokeMs.toFixed(2)} ms  (${BLADES_HIGH} 草叶段 + ${RIM_SEGMENTS} 山脊段)`);
console.log(`  草穗填充         ${tipMs.toFixed(2)} ms  (${TIP_COUNT} 个小圆，一次 fill)`);
console.log(`  合计估算         ${estimate.toFixed(2)} ms`);
console.log(`  声明 costMs=${part.costMs}  →  ${Math.abs(part.costMs - estimate) <= 1.0 ? '与估算相符（±1ms 内）' : '与估算不符，需要改'}`);
console.log('');
console.log(`JS 侧耗时下界（假 ctx，不含光栅化）：中位数 ${median.toFixed(3)} ms`);
console.log('  → 这个数字证明「JS 不是瓶颈」，**不能**当作 costMs');

// low 档：确认是真减量
instance.setLod('low');
for (const k of Object.keys(mainCtx.counts)) mainCtx.counts[k] = 0;
instance.draw(frameAt(clock / 1000));
const oneLow = { ...mainCtx.counts };
console.log('');
console.log('low 档对照');
console.log(`  曲线段 ${one.segments} → ${oneLow.segments}（降幅 ${(100 * (1 - oneLow.segments / one.segments)).toFixed(1)}%）`);
console.log(`  drawImage ${one.drawImage} → ${oneLow.drawImage}   fill ${one.fill} → ${oneLow.fill}`);

instance.dispose();
instance.dispose();
console.log('dispose 幂等：OK');
