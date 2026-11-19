// 真浏览器里量零件每帧耗时（回答「costMs 为什么还是估算」这个问题）。
//
// ★ 两套数并列报出，因为**它们量的不是同一件事**（2026-11-18 补，主理人指出 37fps 与 2.90ms 对不上）：
//   ① `sync`：同步循环里 `performance.now()` 包住 `stage.frame()`。量的是**指令发射**，
//      `getImageData`/`putImageData` 触发的 GPU 同步**等待**不计入 —— 这是它的盲区。
//   ② `raf`：靠 `requestAnimationFrame` 的**间隔**算 fps。rAF 间隔包含 GPU 等待与合成，
//      所以它才是**用户真实看到的帧率**。
//   两者的差值 ≈ 一次帧里的 GPU 同步/合成开销。
//   **当一个零件的 sync 数远小于 raf 数对应的帧预算时，以 raf 为准。**
//   （实例：ink 降档后 sync 2.90ms 但 37fps —— 2.90ms 本该跑满 60fps，说明 37fps 才是真的。）
//
//   仍然量不到的：纯 GPU 填充成本（光栅化在 submit 之后）。那必须用 GPU timer query，本轮不做。
//
// 用法：node tests/bench-parts-browser.mjs
import { launch, openFile, waitForPreview, REPO_ROOT } from './lib/browser.mjs';
import { existsSync } from 'node:fs';
import path from 'node:path';

/** 采样帧数（取中位与 p95，别只报平均）。 */
const FRAMES = 120;

/** 要量的页面：只用装到该零件的预设。 */
const TARGETS = [
  { name: 'field-ground（L0 草甸）', preset: 'field-l0' },
  { name: 'paper-ink + pixel-post（room 快路径）', preset: 'room' },
  { name: 'paper-ink + pixel-post（ink 抖动读回路径）', preset: 'ink' },
  // bubbles 是纯 Canvas2D，**Screen 混合的真实代价**在这里量（voxel-world 的 30fps 会污染它，所以用 tide-a 打底）
  { name: 'tide-medium + bubbles（screen 混合实测）', preset: 'bubbles-probe' },
];

const { browser, close } = await launch({ headless: true });
console.log(`真浏览器（chromium headless，1280×720@dpr2）· 每项 ${FRAMES} 帧同步计时\n`);

try {
  for (const target of TARGETS) {
    const file = path.join(REPO_ROOT, 'dist', 'preview', `${target.preset}.html`);
    if (!existsSync(file)) {
      console.log(`  跳过 ${target.name}：缺 ${path.relative(REPO_ROOT, file)}`);
      continue;
    }
    const session = await openFile(browser, file, { width: 1280, height: 720, dpr: 2 });
    try {
      await waitForPreview(session.page, { frames: 6 });
      // ① 同步计时（指令发射）
      const result = await session.page.evaluate((frames) => {
        const stage = globalThis.__preview.stage;
        // 同步循环：rAF 不可能插进来，所以每帧的 measurement 是干净的
        const samples = [];
        let clock = performance.now();
        for (let i = 0; i < frames; i += 1) {
          clock += 16.7;
          const started = performance.now();
          stage.frame(clock);
          samples.push(performance.now() - started);
        }
        samples.sort((a, b) => a - b);
        return {
          median: samples[Math.floor(samples.length * 0.5)],
          p95: samples[Math.floor(samples.length * 0.95)],
          max: samples[samples.length - 1],
          declared: stage.stats.budgetCostMs,
          frames: stage.stats.frames,
        };
      }, FRAMES);

      // ② rAF 间隔（真实帧率：含 GPU 等待与合成）
      const raf = await session.page.evaluate((frames) => new Promise((resolve) => {
        const stamps = [];
        const tick = (ts) => {
          stamps.push(ts);
          if (stamps.length < frames + 1) {
            requestAnimationFrame(tick);
            return;
          }
          const gaps = [];
          for (let i = 1; i < stamps.length; i += 1) gaps.push(stamps[i] - stamps[i - 1]);
          gaps.sort((a, b) => a - b);
          const median = gaps[Math.floor(gaps.length * 0.5)];
          resolve({ medianGap: median, fps: 1000 / Math.max(1e-6, median) });
        };
        requestAnimationFrame(tick);
      }), 60);
      const syncBudget = 1000 / 60;
      console.log(`  ${target.name}`);
      console.log(`    ① 同步计时（指令发射）中位 ${result.median.toFixed(2)} ms · p95 ${result.p95.toFixed(2)} · 最大 ${result.max.toFixed(2)}`);
      console.log(`    ② rAF 间隔（真实帧率）中位 ${raf.medianGap.toFixed(2)} ms → ${raf.fps.toFixed(1)} fps`);
      // 只有当 rAF 间隔**超出**帧预算时，差值才代表"被吃掉的时间"；否则差值只是空闲等待。
      const saturated = raf.medianGap > syncBudget * 1.15;
      const hidden = raf.medianGap - result.median;
      console.log(
        saturated
          ? `    差值 ${hidden.toFixed(2)} ms ← 已饱和（<${(1000 / syncBudget).toFixed(0)}fps），这里才是 GPU 同步/合成的代价`
          : `    差值 ${hidden.toFixed(2)} ms = 帧内空闲（未饱和，说明这套配置还有余量；同步计时①仍不代表填充成本）`,
      );
      console.log(`    装配声明合计 ${result.declared.toFixed(2)} ms（costMs 之和）`);
    } finally {
      await session.close();
    }
  }
} catch (error) {
  await close();
  throw error;
}

// ── 强制同步法：rAF 未饱和时量不出填充成本，就读 1 个像素把 GPU 队列逼完 ──
// 为什么需要：`screen` 混合的代价全在 GPU 填充里，而上面的①只测指令发射、②在有余量时恒为 16.7ms。
// 做法：每帧 stage.frame() 之后 `getImageData(0,0,1,1)` 强制同步，然后计时。
// 局限：读回本身有固定开销（~0.1–0.3ms），所以这个数**含一点同步税**；但两组相减时该税抵消，
//       得到的**差值**就是"多加一层零件"的填充代价。
const syncTargets = [
  { name: 'L0 打底（无 bubbles）', preset: 'tide-c' },
  { name: 'L0 + bubbles（screen）', preset: 'bubbles-probe' },
];
const syncResults = [];
for (const target of syncTargets) {
  const file = path.join(REPO_ROOT, 'dist', 'preview', `${target.preset}.html`);
  if (!existsSync(file)) { console.log(`  跳过 ${target.name}：缺 ${target.preset}.html`); continue; }
  const session = await openFile(browser, file, { width: 1280, height: 720, dpr: 2 });
  try {
    await waitForPreview(session.page, { frames: 6 });
    const result = await session.page.evaluate((frames) => {
      const stage = globalThis.__preview.stage;
      const ctx = document.getElementById('stage').getContext('2d');
      const samples = [];
      let clock = performance.now();
      // 预热
      for (let i = 0; i < 10; i += 1) { clock += 16.7; stage.frame(clock); ctx.getImageData(0, 0, 1, 1); }
      for (let i = 0; i < frames; i += 1) {
        clock += 16.7;
        const started = performance.now();
        stage.frame(clock);
        ctx.getImageData(0, 0, 1, 1);  // ← 强制 GPU 完成
        samples.push(performance.now() - started);
      }
      samples.sort((a, b) => a - b);
      return { median: samples[Math.floor(samples.length * 0.5)], declared: stage.stats.budgetCostMs };
    }, 60);
    syncResults.push({ name: target.name, ...result });
  } finally {
    await session.close();
  }
}
if (syncResults.length === 2) {
  const base = syncResults[0].median;
  const withBubbles = syncResults[1].median;
  const delta = withBubbles - base;
  console.log('\n强制同步法（每帧后读 1 像素逼 GPU 完成；含少量同步税，相减时抵消）');
  for (const row of syncResults) {
    console.log(`  ${row.name}：中位 ${row.median.toFixed(2)} ms（声明 ${row.declared.toFixed(2)}ms）`);
  }
  console.log(`  → bubbles 的填充代价（含 screen 混合）≈ **${delta.toFixed(2)} ms**`);
  console.log(`    该值应回填到 shared/parts/bubbles/index.ts 的 costMs；估算原值 0.25ms。`);
}

console.log('\n口径：①不含 GPU 填充与同步等待；②是用户实际帧率。两者差得多时，以②为准。');

await close();
