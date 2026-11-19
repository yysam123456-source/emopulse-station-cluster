// paper-ink 的成本依据核对 + **无缝性数值检查**。
//
// ★ 先说清这个脚本测什么、不测什么（同一份口径，别把假数字当真）：
//   Node 里没有 canvas。假 ctx 只记账不画像素，所以「每帧毫秒数」在这里恒接近 0，
//   而本件 100% 的成本是那一次全屏不透明 blit 的 GPU 填充 —— 那笔开销不会进 JS 计时。
//   所以本脚本报三样**可核对**的东西：
//     ① 每帧画布指令计数（drawImage / fillRect / createGradient 各有几次）
//     ② 按声明填充率常数推的估算成本，与 part.costMs 对账
//     ③ **瓦片无缝性**：把 putImageData 收到的真实像素截下来，比较「跨缝像素差」与「内部像素差」。
//        这一条是唯一能自动证明「无缝」的办法 —— 光看代码说「用了周期噪声」不算证据。
//
// 用法：node shared/parts/paper-ink/bench.mjs
import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadTsModule, REPO_ROOT } from '../../../tests/lib/load-ts.mjs';
import { encodePng } from '../../../tests/lib/png.mjs';
import { guardCtx } from '../../../tests/lib/fake-ctx.mjs';

const WIDTH = 1280;
const HEIGHT = 720;
const DPR = 2;
const WARMUP = 10;
const SAMPLES = 120;

/** 与 index.ts 同源的填充率常数（ms）。 */
const MS_PER_MPX_OPAQUE = 0.35;

/**
 * 造一个记账用假 ctx；`putImageData` 会把图像截下来供无缝性检查。
 *
 * @param {object} counts 计数器
 * @param {object} store 用于保存最近一次 putImageData 的图像
 * @returns {object} 假 ctx
 */
function makeFakeCtx(counts, store) {
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
    createLinearGradient() { counts.createGradient += 1; return gradient; },
    createRadialGradient() { counts.createGradient += 1; return gradient; },
    createPattern() { counts.createPattern += 1; return { __pattern: true }; },
    rect() {},
    clip() { counts.clip += 1; },
    createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; },
    putImageData(img) { counts.putImageData += 1; store.tile = img; },
    fillRect() { counts.fillRect += 1; },
    strokeRect() { counts.strokeRect += 1; },
    clearRect() { counts.clearRect += 1; },
    drawImage() { counts.drawImage += 1; },
    beginPath() {},
    moveTo() {},
    lineTo() { counts.segment += 1; },
    quadraticCurveTo() { counts.segment += 1; },
    closePath() {},
    fill() { counts.fill += 1; },
    stroke() { counts.stroke += 1; },
  };
  return guardCtx(raw);
}

/**
 * 造一个假 canvas。
 *
 * @param {number} w
 * @param {number} h
 * @param {object} counts
 * @param {object} store
 * @param {boolean} withDoc
 * @returns {object}
 */
function makeFakeCanvas(w, h, counts, store, withDoc) {
  const guarded = makeFakeCtx(counts, store);
  const ctx = guarded.ctx;
  guards.push(guarded);
  const el = {
    width: w,
    height: h,
    clientWidth: w,
    clientHeight: h,
    style: {},
    getContext(id) { return id === '2d' ? ctx : null; },
  };
  if (withDoc) {
    el.ownerDocument = { createElement() { return makeFakeCanvas(0, 0, counts, store, false); } };
  }
  return el;
}

/**
 * 无缝性检查：**按列/行均值**比较跨缝跳变与内部跳变。
 *
 * 为什么不能直接比「相邻像素差」（第一版就栽在这里）：
 *   瓦片里有逐像素随机颗粒，相邻像素差里绝大部分是颗粒，内部差与跨缝差**同量级**
 *   —— 于是任何瓦片都能通过，包括有明显接缝的。那是个恒绿断言。
 *   改成先对每列（每行）求均值，颗粒零均值会在 256 次平均里被压掉，剩下的才是低频结构。
 *
 * 为什么分母用 p90 而不是 max（第二版栽在这里）：
 *   人造接缝必然同时污染「紧邻接缝的那一条内部跳变」（末列一暗，进它的那一步也变暗），
 *   于是 `seam / max(interior)` 恒 ≈ 1，阴性对照报不出来。改用 p90 后，
 *   一两个被污染的 spike 不影响分母，而有真接缝时分子会大出一个数量级。
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} img
 * @returns {{ seamX: number, seamY: number, p90: number, wall: number, ratio: number }}
 */
function seamMetrics(img) {
  const { data, width, height } = img;
  const lum = (i) => data[i] + data[i + 1] + data[i + 2];

  const colMean = new Float64Array(width);
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let y = 0; y < height; y += 1) sum += lum((y * width + x) * 4);
    colMean[x] = sum / height;
  }
  const rowMean = new Float64Array(height);
  for (let y = 0; y < height; y += 1) {
    let sum = 0;
    for (let x = 0; x < width; x += 1) sum += lum((y * width + x) * 4);
    rowMean[y] = sum / width;
  }

  const jumps = [];
  for (let x = 0; x + 1 < width; x += 1) jumps.push(Math.abs(colMean[x + 1] - colMean[x]));
  for (let y = 0; y + 1 < height; y += 1) jumps.push(Math.abs(rowMean[y + 1] - rowMean[y]));
  jumps.sort((a, b) => a - b);
  const p90 = jumps.length > 0 ? jumps[Math.min(jumps.length - 1, Math.floor(jumps.length * 0.9))] : 0;
  const wall = jumps.length > 0 ? jumps[jumps.length - 1] : 0;

  const seamX = Math.abs(colMean[0] - colMean[width - 1]);
  const seamY = Math.abs(rowMean[0] - rowMean[height - 1]);
  const ratio = Math.max(seamX, seamY) / Math.max(p90, 1e-6);
  return { seamX, seamY, p90, wall, ratio };
}

/**
 * 阴性对照：把最后一列/最后一行人为压暗，检查上面的判据**会不会红**。
 *
 * 这是本文件里唯一能证明「无缝判据有辨别力」的东西。没有它，
 * 上面那个 PASS 有可能只是又一个恒绿断言（上一轮 6 条变异里 2 条就是这么来的）。
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} img
 * @returns {{data: Uint8ClampedArray, width: number, height: number}}
 */
function brokenClone(img) {
  const copy = { data: new Uint8ClampedArray(img.data), width: img.width, height: img.height };
  const { data, width, height } = copy;
  for (let y = 0; y < height; y += 1) {
    const i = (y * width + width - 1) * 4;
    data[i] *= 0.7;
    data[i + 1] *= 0.7;
    data[i + 2] *= 0.7;
  }
  for (let x = 0; x < width; x += 1) {
    const i = ((height - 1) * width + x) * 4;
    data[i] *= 0.7;
    data[i + 1] *= 0.7;
    data[i + 2] *= 0.7;
  }
  return copy;
}

const mod = await loadTsModule(path.join(REPO_ROOT, 'shared', 'parts', 'paper-ink', 'index.ts'));
const part = mod.part ?? mod.default;

/** 所有假 ctx 的守卫 */
const guards = [];

const counts = {
  createGradient: 0, createPattern: 0, putImageData: 0, fillRect: 0, strokeRect: 0, clearRect: 0,
  drawImage: 0, fill: 0, stroke: 0, segment: 0, clip: 0,
};
const store = { tile: null };
const mainCanvas = makeFakeCanvas(WIDTH * DPR, HEIGHT * DPR, counts, store, true);
mainCanvas.clientWidth = WIDTH;
mainCanvas.clientHeight = HEIGHT;
const mainCtx = mainCanvas.getContext('2d');

// ── 构造（含烘焙）成本：一次性 ──
const buildStart = performance.now();
const instance = part.create({
  canvas: mainCanvas,
  ctx: mainCtx,
  width: WIDTH,
  height: HEIGHT,
  dpr: DPR,
  seed: 20261118,
  biome: 'room',
  lod: 'high',
});
const buildMs = performance.now() - buildStart;
// 构造期就烘过一次瓦片：这里截下 high 档的真实像素（后面「截不到瓦片」必须是 FAIL 而不是跳过）
const highTile = store.tile;

/**
 * 造一帧。
 *
 * @param {number} t 秒
 * @returns {object} WorldFrame
 */
function frameAt(t) {
  return {
    t,
    dt: 0.016,
    seed: 20261118,
    pointer: { x: 0.5, y: 0.5, vx: 0, vy: 0, down: false },
    audio: null,
    biome: 'room',
    reducedMotion: false,
    size: { w: WIDTH, h: HEIGHT, dpr: DPR },
  };
}

let clock = 0;
for (let i = 0; i < WARMUP; i += 1) {
  clock += 16;
  instance.draw(frameAt(clock / 1000));
}

for (const key of Object.keys(counts)) counts[key] = 0;
instance.draw(frameAt(clock / 1000));
const one = { ...counts };

const samples = [];
for (let i = 0; i < SAMPLES; i += 1) {
  const started = performance.now();
  instance.draw(frameAt(clock / 1000));
  samples.push(performance.now() - started);
  clock += 16;
}
samples.sort((a, b) => a - b);
const median = samples[Math.floor(samples.length / 2)];

const mpx = (WIDTH * DPR * HEIGHT * DPR) / 1e6;
const estimate = mpx * MS_PER_MPX_OPAQUE;

console.log('paper-ink —— 每帧画布指令（1280×720@dpr2，high 档，biome=room）');
console.log(`  drawImage=${one.drawImage}  fillRect=${one.fillRect}  createGradient=${one.createGradient}  createPattern=${one.createPattern}  putImageData=${one.putImageData}`);
console.log('  → createGradient=0 / createPattern=0 / putImageData=0 是设计目标：纸纹与暗角全烘在离屏里，每帧只有 1 次 blit');
console.log('');
console.log('成本估算（按声明的填充率常数，**不是实测**）');
console.log(`  单次不透明整屏 blit  ${estimate.toFixed(2)} ms  (${mpx.toFixed(2)} Mpx × ${MS_PER_MPX_OPAQUE})`);
console.log(`  声明 costMs=${part.costMs}  →  ${Math.abs(part.costMs - estimate) <= 0.5 ? '与估算相符（±0.5ms 内）' : '与估算不符，需要改'}`);
console.log('');
console.log('构造期一次性成本（本机 Node，假 ctx，只含指令发射 + 噪声计算）');
console.log(`  烘焙耗时 ${buildMs.toFixed(2)} ms（high 档瓦片 ${Math.round(128 * DPR)}×${Math.round(128 * DPR)} 设备像素）`);
console.log(`  每帧 JS 侧耗时中位数 ${median.toFixed(4)} ms（假 ctx：证明 JS 不是瓶颈，**不能**当 costMs）`);
console.log('');

// ── 无缝性数值检查（含阴性对照）──
const highSeam = highTile ? seamMetrics(highTile) : null;
const control = highTile ? seamMetrics(brokenClone(highTile)) : null;
const SEAM_LIMIT = 3.0;

console.log('纸面场边缘连续性（非平铺；周期性见 tests/paper-visual.mjs）');
if (highSeam && highTile) {
  console.log(`  high 档 ${highTile.width}×${highTile.height}：跨缝 X=${highSeam.seamX.toFixed(3)} Y=${highSeam.seamY.toFixed(3)}  内部 p90 跳变=${highSeam.p90.toFixed(3)}（最大 ${highSeam.wall.toFixed(3)}）  比值=${highSeam.ratio.toFixed(2)}×`);
  console.log(`  → 判据：比值 < ${SEAM_LIMIT} 视为无缝。结果：${highSeam.ratio < SEAM_LIMIT ? 'PASS' : 'FAIL'}`);
} else {
  console.log('  ❌ 未截到 high 档瓦片（离屏烘焙路径没走到）');
}
if (control) {
  console.log(`  阴性对照（把末行末列压暗 30%）：比值=${control.ratio.toFixed(2)}× → ${control.ratio >= SEAM_LIMIT ? '判据成功报出接缝（有辨别力）' : '⚠️ 判据没能报出人造接缝，这条断言没有辨别力'}`);
}

// ── low 档：瓦片真减半 ──
instance.setLod('low');
const lowTile = store.tile;
const lowSeam = lowTile ? seamMetrics(lowTile) : null;
for (const key of Object.keys(counts)) counts[key] = 0;
instance.draw(frameAt(clock / 1000));
const oneLow = { ...counts };

console.log('');
console.log('low 档对照');
console.log(`  纸面场 ${highTile ? `${highTile.width}×${highTile.height}` : '?'} → ${lowTile ? `${lowTile.width}×${lowTile.height}` : '?'}（CSS px，low 档跳过双线框）`);
if (lowSeam) {
  console.log(`  无缝性：比值 ${lowSeam.ratio.toFixed(2)}× → ${lowSeam.ratio < SEAM_LIMIT ? 'PASS' : 'FAIL'}`);
}
console.log(`  每帧指令：drawImage ${one.drawImage} → ${oneLow.drawImage}（预期不变：本件每帧只有 1 次 blit，low 省的是烘焙成本与显存，不是每帧填充）`);

instance.dispose();
instance.dispose();
console.log('dispose 幂等：OK');
for (const guard of guards) {
  if (guard.missing.size > 0) {
    console.error(`paper-ink bench: FAIL —— 假 ctx 缺少方法：${[...guard.missing].join(', ')}`);
    process.exit(1);
  }
}

const failed = !highSeam || !lowSeam || !control
  || highSeam.ratio >= SEAM_LIMIT
  || lowSeam.ratio >= SEAM_LIMIT
  || control.ratio < SEAM_LIMIT
  || one.drawImage !== 1
  || one.createGradient !== 0;

// ── 可选：把真实瓦片像素落成 PNG ──
// 本机没有 Edge/Chrome（只有 Safari，GUI 截图是全黑），所以「看一眼纸纹」只能靠导出像素。
// 这段输出的是**零件自己算出的像素**，不是浏览器渲染的观感 —— 两者不能混为一谈。
if (process.argv.includes('--png') && highTile) {
  const outDir = path.join(REPO_ROOT, 'dist', 'preview');
  mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, 'paper-tile.png');
  writeFileSync(out, encodePng(highTile.width, highTile.height, highTile.data));
  console.log(`\n瓦片像素已导出：${path.relative(REPO_ROOT, out)}（${highTile.width}×${highTile.height}，high 档）`);
}

if (failed) {
  console.error('\npaper-ink bench: FAIL（见上面的判据）');
  process.exit(1);
}
console.log('\npaper-ink bench: PASS');
