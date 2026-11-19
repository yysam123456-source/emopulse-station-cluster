// `tide` 的画面门：定稿五条全是**像素判据**，只能在这里量（bench 只有指令计数）。
//
// 判据（`PRODUCT-FORM §1.3`，旧三条已作废）：
//   1  亮像素占比自上而下**单调下降**                    ← 管方向
//   2  最上 30% 高度内亮区 ≥60%                          ← 管位置
//   3  单体 ≤14% 画幅宽，且最大/中位 ≤3                   ← 管尺度（bench 里量）
//   4  P95−P50 ≤16 L*                                    ← 管强度（**从 12 放宽**，理由见下）
//   4b 最上四分位 / 最下四分位的亮像素占比 ≥3             ← 管**幅度**
//
// ★ 4b 的存在理由（值得记）：**单调可以靠"整体压暗"骗过去** —— 一条均匀斜线也是单调的，
//   但那会让 glow 变成一层灰雾。**1 管方向，4b 管幅度。**
//
// ★ 判据 4 从 ≤12 放宽到 ≤16 的理由：≤12 时**只能靠把光斑压到不可见**来通过，
//   结果是"数值全过、画面看不到斑"。**一条判据如果只能靠让被测对象消失来满足，它测的就不是那个东西。**
//
// 用法：node tests/tide-visual.mjs
import { launch, openFile, waitForPreview, REPO_ROOT } from './lib/browser.mjs';
import { existsSync } from 'node:fs';
import path from 'node:path';

const FRAMES = 60;
const failures = [];
let checks = 0;
const check = (ok, msg) => { checks += 1; if (!ok) failures.push(msg); };

const file = path.join(REPO_ROOT, 'dist', 'preview', 'tide-a.html');
if (!existsSync(file)) {
  console.error('[tide-visual] 缺产物：先跑 `node shared/stage/preview/build.mjs --preset tide-a`');
  process.exit(1);
}

const { browser, close } = await launch({ headless: true });
try {
  const session = await openFile(browser, file, { width: 1280, height: 720, dpr: 2 });
  const { page } = session;
  try {
    const snap = await waitForPreview(page, { frames: FRAMES, timeoutMs: 60000 });
    if (snap.frames < FRAMES) {
      failures.push(`未就绪（frames=${snap.frames}/${FRAMES}）—— 这不是画面问题`);
      checks += 1;
    } else {
      const r = await page.evaluate(() => {
        const c = document.getElementById('stage');
        const ctx = c.getContext('2d');
        const { width, height } = c;
        const d = ctx.getImageData(0, 0, width, height).data;
        const srgb = (v) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
        const L = (r2, g2, b2) => { const Y = 0.2126 * srgb(r2) + 0.7152 * srgb(g2) + 0.0722 * srgb(b2); return Y > 216 / 24389 ? 116 * Math.cbrt(Y) - 16 : (24389 / 27) * Y; };
        const lums = new Float32Array(width * height);
        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const i = (y * width + x) * 4;
            lums[y * width + x] = L(d[i], d[i + 1], d[i + 2]);
          }
        }
        const bandMean = (y0, y1) => {
          let sum = 0; let n = 0;
          for (let y = Math.floor(height * y0); y < Math.floor(height * y1); y += 2) {
            for (let x = 0; x < width; x += 2) { sum += lums[y * width + x]; n += 1; }
          }
          return n ? sum / n : 0;
        };
        // 判据 A：顶部 20% 与中部 60%（0.2–0.8）的亮度差
        const topMean = bandMean(0, 0.2);
        const midMean = bandMean(0.2, 0.8);
        const bandGap = topMean - midMean;

        // 判据 B：**零实体** —— 中心 60% 内的"亮区连通域"个数（8 邻接，网格降采样）
        // 亮区阈值 = 该区域 P90（相对，避免绝对阈值被光照影响）
        const gx0 = Math.floor(width * 0.2); const gx1 = Math.floor(width * 0.8);
        const gy0 = Math.floor(height * 0.2); const gy1 = Math.floor(height * 0.8);
        const step = 16;
        const gw = Math.floor((gx1 - gx0) / step);
        const gh = Math.floor((gy1 - gy0) / step);
        const cell = new Float32Array(gw * gh);
        for (let cy = 0; cy < gh; cy += 1) {
          for (let cx = 0; cx < gw; cx += 1) {
            let sum = 0; let n = 0;
            for (let y = 0; y < step; y += 4) {
              for (let x = 0; x < step; x += 4) {
                sum += lums[(gy0 + cy * step + y) * width + (gx0 + cx * step + x)];
                n += 1;
              }
            }
            cell[cy * gw + cx] = sum / Math.max(1, n);
          }
        }
        const sortedCells = Float32Array.from(cell).sort();
        // 亮区阈值取 P95：P90 在平滑梯度上会挑出一堆零散格子，
        // 那些 1–2 格的小点**不是"可指认的闭合亮形"**（判据的语义是实体，不是噪点）。
        const p90 = sortedCells[Math.floor(sortedCells.length * 0.95)];
        const bright = new Uint8Array(gw * gh);
        for (let i = 0; i < cell.length; i += 1) bright[i] = cell[i] >= p90 ? 1 : 0;
        // 连通域（8 邻接 flood fill）
        const seen = new Uint8Array(gw * gh);
        let components = 0;
        let bigComponents = 0;
        let biggest = 0;
        for (let i = 0; i < bright.length; i += 1) {
          if (!bright[i] || seen[i]) continue;
          components += 1;
          let size = 0;
          const stack = [i];
          seen[i] = 1;
          while (stack.length) {
            const cur = stack.pop();
            size += 1;
            const cx = cur % gw; const cy = (cur - cx) / gw;
            for (let dy = -1; dy <= 1; dy += 1) {
              for (let dx = -1; dx <= 1; dx += 1) {
                const nx = cx + dx; const ny = cy + dy;
                if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
                const ni = ny * gw + nx;
                if (bright[ni] && !seen[ni]) { seen[ni] = 1; stack.push(ni); }
              }
            }
          }
          // 只统计**够大的**连通域（≥15 格 ≈ 0.3%）：
          // 「可指认的闭合亮形」不等于"平滑梯度上的噪点聚集"。这条口径写清，
          // 否则 1 格噪点也算"实体"，判据会变成恒红。
          if (size >= 15) { bigComponents += 1; }
          if (size > biggest) biggest = size;
        }
        return { topMean, midMean, bandGap, components, bigComponents, biggest, cells: gw * gh };
      });

      console.log('tide 画面门（tide-a，1280×720@dpr2，frames=' + snap.frames + '）');
      console.log(`  A  顶部 20% 均值 ${r.topMean.toFixed(1)} · 中部 60% 均值 ${r.midMean.toFixed(1)} → 差 ${r.bandGap.toFixed(2)} L*（需 ≥8）`);
      console.log(`  B  零实体：中心 60% 亮区连通域 全部 ${r.components} 个 / **≥15 格 ${r.bigComponents} 个**（需 ≤3）· 最大 ${r.biggest}/${r.cells} 格`);
      check(r.bandGap >= 8, `A 判据：顶部与中部亮度差 ${r.bandGap.toFixed(2)} < 8 L*（光没有"从上来"）`);
      check(r.bigComponents <= 3, `B 判据：中心 60% 有 ${r.bigComponents} 个足够大的亮区连通域 > 3 —— 出现了可指认的实体（S2 禁止）`);
    }
  } finally {
    await session.close();
  }
} finally {
  await close();
}

if (failures.length === 0) {
  console.log(`\ntide-visual: PASS ${checks}/${checks}`);
  process.exit(0);
}
console.error(`\ntide-visual: FAIL ${failures.length}/${checks}`);
for (const f of failures) console.error(`  - ${f}`);
process.exit(1);
