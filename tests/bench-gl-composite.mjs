// GL 合成成本 —— 这条是 `/still` 能不能走「L1 就地合成」的分水岭，也是全项目最大的未知项。
//
// 为什么之前判"无法测量"：上一轮探测到 `navigator.gpu === false`，据此认定本机没有 WebGPU。
// **那个结论是错的**（2026-11-18 复核）：这台机器的 Chrome for Testing 有真 WebGPU，
// `requestAdapter()` 返回 `{ vendor: 'apple', architecture: 'metal-3' }` —— 是 Metal，不是 SwiftShader。
// 所以这条现在**可以量**，也必须有数字，不许再填估算。
//
// 量的三件事（与 ADR §5 的口径一致）：
//   ① `drawImage(webgpuCanvas → 2d)` 的耗时 —— 判据 ≤3ms，超过就说明走了 CPU 回读
//   ② `still` 预设的稳态帧率（rAF 间隔，含 GPU 等待）
//   ③ gl 画布的实际像素尺寸（它决定 ① 的量级）
//
// ⚠️ 口径边界：
//   · ① 量到的是**提交侧**耗时（同步 blit 排队）；GPU 侧完成不进 JS 计时。
//     但「若走 CPU 回读」会表现为十几到几十毫秒的同步阻塞，所以 0.1ms 这个量级本身就排除了那条路。
//   · 本机是 Metal + headless，**不能外推到低端集显/移动端**。
//
// 用法：node tests/bench-gl-composite.mjs
import { launch, openFile, waitForPreview, REPO_ROOT } from './lib/browser.mjs';
import { existsSync } from 'node:fs';
import path from 'node:path';

/** 判据：超过这个数就说明 drawImage 走了 CPU 回读，`/still` 的这条路径不能走。 */
const LIMIT_MS = 3;

const previewPath = path.join(REPO_ROOT, 'dist', 'preview', 'still.html');
if (!existsSync(previewPath)) {
  console.error(`[bench-gl] 缺产物：${previewPath}\n先跑 \`node shared/stage/preview/build.mjs --preset still\``);
  process.exit(1);
}

const { browser, close } = await launch({ headless: true });
try {
  const session = await openFile(browser, previewPath, { width: 1280, height: 720, dpr: 2 });
  const { page } = session;
  try {
    // voxel-world 的构造是异步的（建世界要几十秒），必须等到它真的出画面
    await waitForPreview(page, { frames: 40, timeoutMs: 240000 });
    const caps = await page.evaluate(async () => {
      const out = { gpu: !!navigator.gpu, adapter: false, descriptor: null };
      if (navigator.gpu) {
        try {
          const adapter = await navigator.gpu.requestAdapter();
          out.adapter = !!adapter;
          if (adapter?.info) out.descriptor = `${adapter.info.vendor}/${adapter.info.architecture}`;
        } catch { /* 探测失败按不可用处理 */ }
      }
      return out;
    });

    // ① drawImage(webgpu → 2d)：三种目标尺寸，取中位/p95
    const composite = await page.evaluate(() => new Promise((resolve) => {
      const gl = document.getElementById('gl');
      const target = document.createElement('canvas');
      target.width = 2560;
      target.height = 1440;
      const ctx = target.getContext('2d');
      const sizes = [[1280, 720], [2560, 1440]];
      const results = [];
      let index = 0;
      const runSize = () => {
        if (index >= sizes.length) { resolve({ glSize: `${gl.width}x${gl.height}`, results }); return; }
        const [w, h] = sizes[index];
        const samples = [];
        let i = 0;
        const step = () => {
          const started = performance.now();
          ctx.clearRect(0, 0, target.width, target.height);
          ctx.drawImage(gl, 0, 0, w, h);
          samples.push(performance.now() - started);
          i += 1;
          if (i < 60) { requestAnimationFrame(step); return; }
          samples.sort((a, b) => a - b);
          results.push({
            target: `${w}x${h}`,
            median: samples[Math.floor(samples.length * 0.5)],
            p95: samples[Math.floor(samples.length * 0.95)],
            max: samples[samples.length - 1],
          });
          index += 1;
          requestAnimationFrame(runSize);
        };
        requestAnimationFrame(step);
      };
      runSize();
    }));

    // ② 稳态帧率（rAF 间隔包含 GPU 等待）
    const raf = await page.evaluate((frames) => new Promise((resolve) => {
      const stamps = [];
      const tick = (ts) => {
        stamps.push(ts);
        if (stamps.length < frames + 1) { requestAnimationFrame(tick); return; }
        const gaps = [];
        for (let i = 1; i < stamps.length; i += 1) gaps.push(stamps[i] - stamps[i - 1]);
        gaps.sort((a, b) => a - b);
        resolve({ medianGap: gaps[Math.floor(gaps.length * 0.5)], fps: 1000 / gaps[Math.floor(gaps.length * 0.5)] });
      };
      requestAnimationFrame(tick);
    }), 60);

    const worst = composite.results.reduce((acc, r) => (r.median > acc.median ? r : acc), composite.results[0]);

    console.log('GL 合成成本（真 Chromium + 真 WebGPU）');
    console.log(`  WebGPU: gpu=${caps.gpu} adapter=${caps.adapter} (${caps.descriptor ?? 'n/a'})`);
    console.log(`  gl 画布实际像素：${composite.glSize}`);
    for (const r of composite.results) {
      console.log(`  drawImage → ${r.target}：中位 ${r.median.toFixed(2)} ms · p95 ${r.p95.toFixed(2)} · 最大 ${r.max.toFixed(2)}`);
    }
    console.log(`  稳态：rAF 间隔 ${raf.medianGap.toFixed(2)} ms = ${raf.fps.toFixed(1)} fps`);
    console.log(`  判据：drawImage ≤ ${LIMIT_MS} ms → ${worst.median <= LIMIT_MS ? 'PASS（没走 CPU 回读）' : 'FAIL（疑似 CPU 回读，/still 这条路径不能走）'}`);

    if (!caps.adapter) {
      console.error('\nbench-gl-composite: 无法测量（拿不到 adapter）—— 不许填数字');
      process.exit(2);
    }
    if (worst.median > LIMIT_MS) {
      console.error('\nbench-gl-composite: FAIL');
      process.exit(1);
    }
    console.log('\nbench-gl-composite: PASS');
  } finally {
    await session.close();
  }
} finally {
  await close();
}
