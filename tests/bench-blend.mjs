// `screen` 混合的真实代价 —— 回答 "bubbles 的 costMs 该填多少"。
//
// 为什么需要单独一个脚本：`bubbles` 的效应（估算 0.25ms）比本机测量噪声还小。
//   · 同步计时（指令发射）量不到填充；
//   · rAF 间隔在有余量时恒 16.7ms；
//   · 强制同步法的同步税 ~8ms，抖动 ±1ms > 信号 0.25ms（实测出现过 -1.00ms 的负差值）。
//
// 所以这里用**放大信号**的办法：把同一组气泡画 K=50 遍（等效 3500 个气泡/帧），
// 再除以 K 得到"每帧 70 个气泡"的代价。同一张画布、同一组几何，**只改 globalCompositeOperation**，
// 两组的差就是混合模式本身的代价。
//
// 口径边界（重要）：
//   · 测量含一次 `getImageData` 的强制同步税；两组相减时抵消。
//   · K=50 时填充量是真实的 50 倍，**线性外推是假设**（GPU 在饱和区会变慢，所以这是**上界**）。
//   · 本机 Metal + headless，不可外推到低端集显/移动端。
//
// 用法：node tests/bench-blend.mjs
import { launch } from './lib/browser.mjs';

const K = 50;
const SAMPLES = 40;
const BUBBLES = 70;

const { browser, close } = await launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto('about:blank');

  const result = await page.evaluate(({ k, samples, count }) => {
    const canvas = document.createElement('canvas');
    canvas.width = 2560;
    canvas.height = 1440;
    const g = canvas.getContext('2d');

    // 与 bubbles 一致的几何：70 个本体 + 70 个高光
    const bodies = [];
    for (let i = 0; i < count; i += 1) {
      bodies.push({
        x: Math.random() * 2560,
        y: Math.random() * 1440,
        r: (0.6 + Math.random() * 2.2) * 2,
      });
    }

    const draw = (mode) => {
      g.globalCompositeOperation = mode;
      for (let rep = 0; rep < k; rep += 1) {
        g.fillStyle = 'rgba(150,205,230,0.13)';
        g.beginPath();
        for (let i = 0; i < count; i += 1) {
          const b = bodies[i];
          g.moveTo(b.x + b.r, b.y);
          g.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        }
        g.fill();
        g.fillStyle = 'rgba(220,245,255,0.5)';
        g.beginPath();
        for (let i = 0; i < count; i += 1) {
          const b = bodies[i];
          const hr = b.r * 0.35;
          g.moveTo(b.x - b.r * 0.3 + hr, b.y - b.r * 0.3);
          g.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, hr, 0, Math.PI * 2);
        }
        g.fill();
      }
      g.globalCompositeOperation = 'source-over';
    };

    const measure = (mode) => {
      // 预热
      for (let i = 0; i < 6; i += 1) { draw(mode); g.getImageData(0, 0, 1, 1); }
      const out = [];
      for (let i = 0; i < samples; i += 1) {
        const started = performance.now();
        draw(mode);
        g.getImageData(0, 0, 1, 1); // 强制 GPU 完成
        out.push(performance.now() - started);
      }
      out.sort((a, b) => a - b);
      return { median: out[Math.floor(out.length * 0.5)], p95: out[Math.floor(out.length * 0.95)] };
    };

    const base = measure('source-over');
    const screen = measure('screen');
    return { base, screen, k, count };
  }, { k: K, samples: SAMPLES, count: BUBBLES });

  const perFrame = (v) => v / result.k;
  const delta = (result.screen.median - result.base.median) / result.k;
  console.log('`screen` 混合的代价（真 Chromium + Metal，K=50 放大后除以 K）');
  console.log(`  同一组 ${result.count} 个气泡 × ${result.k} 遍：`);
  console.log(`  source-over：中位 ${result.base.median.toFixed(2)} ms（÷K = ${perFrame(result.base.median).toFixed(3)} ms/帧）`);
  console.log(`  screen     ：中位 ${result.screen.median.toFixed(2)} ms（÷K = ${perFrame(result.screen.median).toFixed(3)} ms/帧）`);
  console.log(`  → **混合模式本身的代价 ≈ ${delta.toFixed(3)} ms/帧**（70 个气泡）`);
  console.log(`  → 建议 costMs = 填充 ${perFrame(result.screen.median).toFixed(3)} ms + 路径构造 ≈ ${(perFrame(result.screen.median) + 0.11).toFixed(2)} ms`);
  console.log('\n  注：K=50 的线性外推是**假设**，GPU 饱和区会更慢，所以这是**上界**；本机不可外推。');
} finally {
  await close();
}
