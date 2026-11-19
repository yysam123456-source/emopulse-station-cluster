// 纸的画面门 —— 阈值按**真样本**重写（2026-11-18 第三版）。
//
// ★ 为什么重写：产品经理承认上一版**三条判据本身是错的**，病根统一 ——
//   「没有样本时把阈值写成了'看着合理'，一遇真实画面就崩。这是"从失败样本只能推出地板、
//     推不出目标"的另一面：**我连地板都是猜的。**」
//
//   错在哪 → 改成什么：
//   1. 背景明度「取中心 60%」→ 在 `/license` 上取到的是**纸**（L* 82.6），必然误判。
//      改成**画幅色指纹**：全帧 L* P50 + 色相中位 + 饱和中位。**只报数、不断言**（见输出末行）。
//   2. 周期「lag 4–32 自相关 ≤0.35」→ **永远不过**：任何平滑纹理在短 lag 上都高度相关
//      （那是连续性，不是周期）。改成 **tile 周期（128 CSS px）自相关 ≤0.35** + **功率谱 max/median ≤400**。
//   3. 暗角「四角比中心压暗 ≤8%」→ 有了方向光之后**必然失败**，因为那是光不是暗角。
//      改成**先减掉光平面，再看残差的角/中比**。
//
// ★ 一条判据错了，工程师为它做的所有优化都是负功 —— 所以这里每个数都注明来源与样本。
//
// 用法：node tests/paper-visual.mjs
import { launch, openFile, waitForPreview, REPO_ROOT } from './lib/browser.mjs';
import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * 阈值：每个数都标注样本来源。
 * 分两类（§2.4b）：**地板**（从失败样本反推，只保证能区分有无）与**目标**（真实工作点）。
 */
const THRESHOLDS = {
  /** 方向光：地板 6（从 1.32 判失败反推）；产品目标 10；实测工作点 ≈16.6（11.5 过门但眼睛说平） */
  gradientLstar: 10,
  gradientR2: 0.5,
  /** 纸面均值：目标区间（太亮则梯度没余量，太暗则发灰） */
  paperMeanMin: 72,
  paperMeanMax: 86,
  /** 周期 ①：**tile 周期（128 CSS px）上的自相关**。样本 v2=0.645（有重复）→ v6=−0.183（无） */
  tileAutocorr: 0.35,
  /** 周期 ②：功率谱峰值比。样本 v2=1448（有重复）→ v6=258（无）；PM 给的上限 400 */
  spectralPeakRatio: 400,
  /** 纸边：四条边**各自的最大局部差**（用全纸中位数当参考会量成 7 L*，那是旧口径的错） */
  borderLstar: 12,
  /** 纸面积：PM 修正后 55–80%（原来的"78%"与"四边可见 + 真实纸张比例"在 16:9 里互斥） */
  paperRatioMin: 0.55,
  paperRatioMax: 0.80,
  /** 纸张宽高比：A4 横 1.41，与导出卡 1410×1000 同比例（否则 cover 裁切会剪掉纸） */
  aspectTarget: 1.4142,
  aspectTolerance: 0.09,
  /**
   * 暗角残差：减掉光平面后，**最暗的那一角**允许低多少 L*。样本实测 −3.42，阈值 −6 留 1.75× 余量。
   *
   * ★ **继续当记录项，不进硬门**（PM 判定）：这个量被**光平面拟合质量**污染 ——
   *   拟合不完美时残差会在某个角上假性变暗（他独立拟合量到过 −18，而那片角落在视觉上完全正常）。
   *   一个会被拟合质量影响的量不适合当阻断项。（和"绝对阈值量被光照影响的量"是同一族。）
   */
  cornerResidualMin: -6,
};

const failures = [];
let checks = 0;

/**
 * 记一次断言。
 *
 * @param {boolean} ok 条件
 * @param {string} msg 失败描述
 */
function check(ok, msg) {
  checks += 1;
  if (!ok) failures.push(msg);
}

const previewPath = path.join(REPO_ROOT, 'dist', 'preview', 'room.html');
if (!existsSync(previewPath)) {
  console.error(`[paper-visual] 缺产物：${previewPath}\n先跑 \`npm run preview:room\``);
  process.exit(1);
}

const { browser, close } = await launch({ headless: true });
try {
  const session = await openFile(browser, previewPath, { width: 1280, height: 720, dpr: 2 });
  try {
    const snapshot = await waitForPreview(session.page, { frames: 12 });
    check(
      snapshot.state === 'ready' || snapshot.degraded.every((d) => d.reason === 'budget'),
      `预览状态异常：${snapshot.state}`,
    );
    check(session.errors.length === 0, `控制台有错误：${session.errors.join(' | ')}`);

    const stats = await session.page.evaluate(() => {
      const canvas = document.getElementById('stage');
      const ctx = canvas.getContext('2d');
      const { width, height } = canvas;
      const data = ctx.getImageData(0, 0, width, height).data;

      const srgb = (c) => {
        const v = c / 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      const lstar = (r, g, b) => {
        const Y = 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
        return Y > 216 / 24389 ? 116 * Math.cbrt(Y) - 16 : (24389 / 27) * Y;
      };
      const hsl = (r, g, b) => {
        const rn = r / 255; const gn = g / 255; const bn = b / 255;
        const max = Math.max(rn, gn, bn); const min = Math.min(rn, gn, bn);
        const l = (max + min) / 2;
        const d = max - min;
        let h = 0;
        if (d > 1e-6) {
          if (max === rn) h = ((gn - bn) / d) % 6;
          else if (max === gn) h = (bn - rn) / d + 2;
          else h = (rn - gn) / d + 4;
          h *= 60;
          if (h < 0) h += 360;
        }
        // ★ 饱和度**固定用 HSV S = (max-min)/max**（MANUAL-QA §8 附录钉死）：
        //   HSL 的 S 与 HSV 的 S 在 /hug 上能差 0.157（0.315 vs 0.472），两个人各报一个数、
        //   各自都"有依据"，而谁都说不清缺的是什么 —— 口径没钉死，数字就不是证据。
        const s = max <= 1e-6 ? 0 : d / max;
        void l;
        return { h, s };
      };

      const lumaMap = new Float32Array(width * height);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const i = (y * width + x) * 4;
          lumaMap[y * width + x] = lstar(data[i], data[i + 1], data[i + 2]);
        }
      }

      // ── 找纸（亮部包围盒）──
      // ★ 阈值必须**相对背景**，不能写死：
      //   PM 用固定 `L>50` 量出 59.3% / 1.531，会把一个**正确**的产物判红 ——
      //   因为方向光把暗侧角压到阈值以下，"纸"被裁小了。
      //   这里先取背景（画面四边一圈）的 P50，再用 `L > 背景P50 + 15` 定纸。
      const bgSamples = [];
      for (let y = 0; y < height; y += 4) {
        for (let x = 0; x < width; x += 4) {
          const nearEdge = x < width * 0.06 || x > width * 0.94 || y < height * 0.06 || y > height * 0.94;
          if (nearEdge) bgSamples.push(lumaMap[y * width + x]);
        }
      }
      bgSamples.sort((a, b) => a - b);
      const bgP50 = bgSamples.length > 0 ? bgSamples[Math.floor(bgSamples.length * 0.5)] : 0;
      const paperThreshold = bgP50 + 15;
      let count = 0;
      let minX = width; let minY = height; let maxX = 0; let maxY = 0;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          if (lumaMap[y * width + x] > paperThreshold) {
            count += 1;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      const sheetW = Math.max(1, maxX - minX);
      const sheetH = Math.max(1, maxY - minY);
      const paperRatio = count / (width * height);
      const aspect = sheetW / Math.max(1, sheetH);

      // ── 画幅色指纹（全帧三个中位数）──
      const frameL = [];
      const frameH = [];
      const frameS = [];
      for (let y = 0; y < height; y += 6) {
        for (let x = 0; x < width; x += 6) {
          const i = (y * width + x) * 4;
          frameL.push(lumaMap[y * width + x]);
          const { h, s } = hsl(data[i], data[i + 1], data[i + 2]);
          frameH.push(h);
          frameS.push(s);
        }
      }
      const median = (arr) => {
        arr.sort((a, b) => a - b);
        return arr[Math.floor(arr.length * 0.5)];
      };

      // ── 方向光：4×4 块 + 平面拟合 ──
      const blocks = [];
      for (let by = 0; by < 4; by += 1) {
        for (let bx = 0; bx < 4; bx += 1) {
          const x0 = minX + sheetW * (0.12 + bx * 0.19);
          const y0 = minY + sheetH * (0.12 + by * 0.19);
          let sum = 0; let n = 0;
          for (let y = Math.floor(y0); y < y0 + sheetH * 0.12; y += 2) {
            for (let x = Math.floor(x0); x < x0 + sheetW * 0.12; x += 2) {
              if (x < 0 || y < 0 || x >= width || y >= height) continue;
              sum += lumaMap[y * width + x]; n += 1;
            }
          }
          blocks.push({ bx, by, mean: n > 0 ? sum / n : 0 });
        }
      }
      const meanAll = blocks.reduce((s, b) => s + b.mean, 0) / blocks.length;
      let sxx = 0; let syy = 0; let sxy = 0; let sxz = 0; let syz = 0;
      for (const b of blocks) {
        const x = (b.bx - 1.5) / 1.5;
        const y = (b.by - 1.5) / 1.5;
        const z = b.mean - meanAll;
        sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z;
      }
      const det = sxx * syy - sxy * sxy;
      const coefB = det === 0 ? 0 : (sxz * syy - syz * sxy) / det;
      const coefC = det === 0 ? 0 : (syz * sxx - sxz * sxy) / det;
      let ssRes = 0; let ssTot = 0;
      for (const b of blocks) {
        const x = (b.bx - 1.5) / 1.5;
        const y = (b.by - 1.5) / 1.5;
        const pred = meanAll + coefB * x + coefC * y;
        ssRes += (b.mean - pred) ** 2;
        ssTot += (b.mean - meanAll) ** 2;
      }
      const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
      const gradient = blocks[0].mean - blocks[blocks.length - 1].mean;

      // ── 暗角残差：减掉光平面后，角部 vs 中部 ──
      let cornerRes = 0; let cornerN = 0; let centerRes = 0; let centerN = 0;
      for (const b of blocks) {
        const x = (b.bx - 1.5) / 1.5;
        const y = (b.by - 1.5) / 1.5;
        const residual = b.mean - (meanAll + coefB * x + coefC * y);
        const isCorner = (b.bx === 0 || b.bx === 3) && (b.by === 0 || b.by === 3);
        const isCenter = (b.bx === 1 || b.bx === 2) && (b.by === 1 || b.by === 2);
        if (isCorner) { cornerRes += residual; cornerN += 1; }
        if (isCenter) { centerRes += residual; centerN += 1; }
      }
      // ★ 不用"比值"：中心残差≈0 时比值会爆炸（PM 独立量出 −9.03，毫无意义）。
      //   改成**四角残差的最小值**（绝对 L*）—— 语义直接："最暗的那个角比光平面预测的低多少"。
      let cornerMin = Infinity;
      for (const b of blocks) {
        const x = (b.bx - 1.5) / 1.5;
        const y = (b.by - 1.5) / 1.5;
        if (!((b.bx === 0 || b.bx === 3) && (b.by === 0 || b.by === 3))) continue;
        const residual = b.mean - (meanAll + coefB * x + coefC * y);
        if (residual < cornerMin) cornerMin = residual;
      }
      const cornerResidualMin = Number.isFinite(cornerMin) ? cornerMin : 0;
      void cornerRes; void cornerN; void centerRes; void centerN;

      // ── 周期 ①：tile 周期（128 CSS px）自相关 ──
      const dprBox = Math.max(1, Math.round(window.devicePixelRatio || 1));
      const colMeans = [];
      for (let x = minX + Math.round(sheetW * 0.05); x + dprBox <= maxX - Math.round(sheetW * 0.05); x += dprBox) {
        let sum = 0; let n = 0;
        for (let k = 0; k < dprBox; k += 1) {
          for (let y = minY + Math.round(sheetH * 0.05); y <= maxY - Math.round(sheetH * 0.05); y += 3) {
            sum += lumaMap[y * width + x + k]; n += 1;
          }
        }
        colMeans.push(sum / Math.max(1, n));
      }
      // ★ 必须先**去趋势**（40 CSS px 高通）再算任何周期指标。
      //   方向光是一条平滑斜坡，它在**任何 lag** 上都高度相关 —— 不去趋势时实测 tile 自相关 0.517，
      //   会把"有光"判成"有周期"。（上一版这坑踩过一次，写重写版时又漏了，同一个坑认两次。）
      const trendWindow = 40;
      const residual = colMeans.map((v, i) => {
        const from = Math.max(0, i - trendWindow);
        const to = Math.min(colMeans.length, i + trendWindow + 1);
        let sum = 0;
        for (let k = from; k < to; k += 1) sum += colMeans[k];
        return v - sum / (to - from);
      });
      const avg = residual.reduce((s, v) => s + v, 0) / Math.max(1, residual.length);
      let variance = 0;
      for (const v of residual) variance += (v - avg) ** 2;
      variance /= Math.max(1, residual.length);
      const tileLag = 128;
      let tileCov = 0; let tileN = 0;
      for (let i = 0; i + tileLag < residual.length; i += 1) {
        tileCov += (residual[i] - avg) * (residual[i + tileLag] - avg);
        tileN += 1;
      }
      const tileAutocorr = variance > 1e-9 && tileN > 0 ? (tileCov / tileN) / variance : 0;

      // ── 周期 ②：功率谱峰值比（512 点 FFT）──
      const N = 512;
      const re = new Float64Array(N);
      const im = new Float64Array(N);
      for (let i = 0; i < N; i += 1) re[i] = i < residual.length ? residual[i] - avg : 0;
      for (let i = 1, j = 0; i < N; i += 1) {
        let bit = N >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) { const tr = re[i]; re[i] = re[j]; re[j] = tr; const ti = im[i]; im[i] = im[j]; im[j] = ti; }
      }
      for (let len = 2; len <= N; len <<= 1) {
        const ang = -2 * Math.PI / len;
        const wr = Math.cos(ang); const wi = Math.sin(ang);
        for (let i = 0; i < N; i += len) {
          let cr = 1; let ci = 0;
          for (let k = 0; k < len / 2; k += 1) {
            const ur = re[i + k]; const ui = im[i + k];
            const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
            const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
            re[i + k] = ur + vr; im[i + k] = ui + vi;
            re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
            const ncr = cr * wr - ci * wi;
            ci = cr * wi + ci * wr;
            cr = ncr;
          }
        }
      }
      const spectrum = [];
      for (let i = 1; i < N / 2; i += 1) spectrum.push(Math.hypot(re[i], im[i]));
      spectrum.sort((a, b) => a - b);
      const specMedian = spectrum[Math.floor(spectrum.length * 0.5)] || 1e-9;
      const spectralPeakRatio = spectrum[spectrum.length - 1] / specMedian;

      // ── 纸边：四条边各自的最大局部差 ──
      const paperMean = (() => {
        let sum = 0; let n = 0;
        for (let y = minY + Math.round(sheetH * 0.2); y < minY + Math.round(sheetH * 0.8); y += 3) {
          for (let x = minX + Math.round(sheetW * 0.2); x < minX + Math.round(sheetW * 0.8); x += 3) {
            sum += lumaMap[y * width + x]; n += 1;
          }
        }
        return n > 0 ? sum / n : 0;
      })();
      const rowMeanAt = (y) => {
        let sum = 0; let n = 0;
        for (let x = minX + Math.round(sheetW * 0.3); x < minX + Math.round(sheetW * 0.7); x += 1) {
          sum += lumaMap[y * width + x]; n += 1;
        }
        return sum / Math.max(1, n);
      };
      const colMeanAt = (x) => {
        let sum = 0; let n = 0;
        for (let y = minY + Math.round(sheetH * 0.3); y < minY + Math.round(sheetH * 0.7); y += 1) {
          sum += lumaMap[y * width + x]; n += 1;
        }
        return sum / Math.max(1, n);
      };
      const maxDelta = (values) => {
        let best = 0;
        for (const v of values) {
          const d = Math.abs(v - paperMean);
          if (d > best) best = d;
        }
        return best;
      };
      const sides = { top: [], bottom: [], left: [], right: [] };
      for (let d = 2; d < Math.round(sheetH * 0.055); d += 1) {
        sides.top.push(rowMeanAt(minY + d));
        sides.bottom.push(rowMeanAt(maxY - d));
      }
      for (let d = 2; d < Math.round(sheetW * 0.055); d += 1) {
        sides.left.push(colMeanAt(minX + d));
        sides.right.push(colMeanAt(maxX - d));
      }

      return {
        width, height, paperRatio, aspect, paperMean,
        fingerprint: { lstarP50: median(frameL), hue: median(frameH), saturation: median(frameS) },
        gradient, r2, cornerResidualMin, bgP50, tileAutocorr, spectralPeakRatio,
        border: {
          top: maxDelta(sides.top), bottom: maxDelta(sides.bottom),
          left: maxDelta(sides.left), right: maxDelta(sides.right),
        },
      };
    });

    const borderMin = Math.min(stats.border.top, stats.border.bottom, stats.border.left, stats.border.right);

    check(stats.gradient >= THRESHOLDS.gradientLstar,
      `L1 方向光不足：左上−右下 ${stats.gradient.toFixed(2)} L*（需 ≥${THRESHOLDS.gradientLstar}）`);
    check(stats.r2 >= THRESHOLDS.gradientR2,
      `L1 梯度不像一个方向：R²=${stats.r2.toFixed(3)}（需 ≥${THRESHOLDS.gradientR2}）`);
    check(stats.paperMean >= THRESHOLDS.paperMeanMin && stats.paperMean <= THRESHOLDS.paperMeanMax,
      `L1b 纸面均值 ${stats.paperMean.toFixed(1)} 不在 ${THRESHOLDS.paperMeanMin}–${THRESHOLDS.paperMeanMax}`);
    check(borderMin >= THRESHOLDS.borderLstar,
      `L3 纸边最弱一条 ${borderMin.toFixed(2)} L*（需四条都 ≥${THRESHOLDS.borderLstar}）`);
    check(stats.paperRatio >= THRESHOLDS.paperRatioMin && stats.paperRatio <= THRESHOLDS.paperRatioMax,
      `L4 纸面积 ${(stats.paperRatio * 100).toFixed(1)}%（需 ${THRESHOLDS.paperRatioMin * 100}–${THRESHOLDS.paperRatioMax * 100}%）`);
    check(Math.abs(stats.aspect - THRESHOLDS.aspectTarget) <= THRESHOLDS.aspectTolerance,
      `L1c 纸的宽高比 ${stats.aspect.toFixed(3)}（目标 ${THRESHOLDS.aspectTarget}±${THRESHOLDS.aspectTolerance}；必须与导出卡 1410×1000 同比例，否则裁切会剪掉纸）`);
    check(Math.abs(stats.tileAutocorr) <= THRESHOLDS.tileAutocorr,
      `L2a tile 周期自相关 ${stats.tileAutocorr.toFixed(3)}（需 |ρ| ≤${THRESHOLDS.tileAutocorr}；样本 v2=0.645 / v6=−0.183）`);
    check(stats.spectralPeakRatio <= THRESHOLDS.spectralPeakRatio,
      `L2b 功率谱峰值比 ${stats.spectralPeakRatio.toFixed(0)}（需 ≤${THRESHOLDS.spectralPeakRatio}；样本 v2=1448 / v6=258）`);
    // 记录项：不阻断（阈值缺样本），但必须打印出来 —— 下一轮 PM 给数后转成断言
    const cornerOk = stats.cornerResidualMin >= THRESHOLDS.cornerResidualMin;

    console.log('paper-ink 画面门 v3（真实 Chromium，1280×720@dpr2，room 预设）');
    console.log(`  纸：${(stats.paperRatio * 100).toFixed(1)}% 面积 · 宽高比 ${stats.aspect.toFixed(3)}（目标 1.414）· 纸面均值 L* ${stats.paperMean.toFixed(1)}`);
    console.log(`  L1 方向光：${stats.gradient.toFixed(2)} L* · R² ${stats.r2.toFixed(3)}`);
    console.log(`  L2a tile 周期自相关 ${stats.tileAutocorr.toFixed(3)} · L2b 功率谱峰值比 ${stats.spectralPeakRatio.toFixed(0)}`);
    console.log(`  L3 纸边：上 ${stats.border.top.toFixed(1)} / 下 ${stats.border.bottom.toFixed(1)} / 左 ${stats.border.left.toFixed(1)} / 右 ${stats.border.right.toFixed(1)}`);
    console.log(`  L6 暗角残差（减光平面后）最暗角 = ${stats.cornerResidualMin.toFixed(2)} L*· 参考阈值 ${THRESHOLDS.cornerResidualMin} → ${cornerOk ? '记录项内' : '⚠️ 记录项外（不阻断，等 PM 给阈值）'}`);
    console.log(`  画幅色指纹（**只报数、不断言** —— 阈值需 PM 给样本，我不猜）：L* P50 ${stats.fingerprint.lstarP50.toFixed(1)} · 色相 ${stats.fingerprint.hue.toFixed(0)}° · 饱和 ${stats.fingerprint.saturation.toFixed(3)}`);
  } finally {
    await session.close();
  }
} finally {
  await close();
}

if (failures.length === 0) {
  console.log(`\npaper-visual: PASS ${checks}/${checks}`);
  process.exit(0);
}
console.error(`\npaper-visual: FAIL ${failures.length}/${checks}`);
for (const failure of failures) console.error(`  - ${failure}`);
process.exit(1);
