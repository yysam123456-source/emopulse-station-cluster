// field-ground 的**画面门** —— 把「肉眼不得出现硬边接缝」这类验收标准变成可回归断言。
//
// 为什么需要它：T19 返工的四条问题（两道横缝 / 草长在山脊上 / 草形态均质 / 山体像剪纸）
// 全都是「图上看得见、测试看不见」的。上一轮 `parts-composition` 15/15 全绿，
// 而真浏览器打开是个占位图。所以这里直接读画布像素，问三个可以用数字回答的问题：
//   A. 有没有横贯整幅的硬边？→ 行均值跳变比（硬边 = 某一行突然跳一大截）
//   B. 草有没有长到天上？→ 地平线以上不该出现草色像素
//   C. 判据本身有没有辨别力？→ 拿一张人造硬边图喂同一个判据，必须报红（阴性对照）
//
// 依赖真实浏览器（tests/lib/browser.mjs）。**拿不到浏览器时打印 SKIP 并以 0 退出** ——
// 这条是画面门，不是正确性门；在没有浏览器的机器上把它变成红的，只会逼人删掉它。
//
// 用法：node tests/field-visual.mjs
import { launch, openFile, waitForPreview, REPO_ROOT } from './lib/browser.mjs';
import { existsSync } from 'node:fs';
import path from 'node:path';

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

// 用只装 L0 的预设：L4 颗粒会把像素判据打成假阳性（见 build.mjs 里 field-l0 的注释）
const previewPath = path.join(REPO_ROOT, 'dist', 'preview', 'field-l0.html');
if (!existsSync(previewPath)) {
  console.error(`[field-visual] 缺产物：${previewPath}\n先跑 \`npm run preview:field\``);
  process.exit(1);
}

let session = null;
try {
  const { browser, close } = await launch({ headless: true });
  try {
    session = await openFile(browser, previewPath, { width: 1280, height: 720, dpr: 2 });
    const snapshot = await waitForPreview(session.page, { frames: 10 });

    // ── A. 状态与错误 ──
    check(snapshot.state === 'ready', `预览未就绪：state=${snapshot.state} degraded=${JSON.stringify(snapshot.degraded)}`);
    // field 预设现在含 L4（pixel-post），所以只要求「包含 field-ground 且它是 L0」
    check(
      snapshot.order.includes('field-ground') && snapshot.order[0] === 'field-ground',
      `field-ground 应为首件（L0），实得 ${snapshot.order.join(',')}`,
    );
    check(session.errors.length === 0, `控制台有错误：${session.errors.join(' | ')}`);

    // ── 像素统计（在页面里跑，避免把大数组搬出来）──
    const stats = await session.page.evaluate(() => {
      const canvas = document.getElementById('stage');
      const ctx = canvas.getContext('2d');
      const { width, height } = canvas;
      const image = ctx.getImageData(0, 0, width, height);
      const data = image.data;
      const lum = (i) => data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;

      /** 每行平均亮度 */
      const rowMean = new Float64Array(height);
      for (let y = 0; y < height; y += 1) {
        let sum = 0;
        for (let x = 0; x < width; x += 1) sum += lum((y * width + x) * 4);
        rowMean[y] = sum / width;
      }
      /** 相邻行的亮度跳变 */
      const jumps = [];
      for (let y = 1; y < height; y += 1) jumps.push(Math.abs(rowMean[y] - rowMean[y - 1]));
      const sorted = jumps.slice().sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
      const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? 0;
      const max = sorted[sorted.length - 1] ?? 0;

      /**
       * 「草不在天空里」检测 —— **与颜色无关**（v5）。
       *
       * 演进史（每一版都是被真实改动打破的）：
       *   v1 绝对色阈 `r>195&&g>175&&b<165` → 细线抗锯齿达不到 → 恒 0（假绿）
       *   v2 加 `b<0.78r` → 草压在蓝天上时混合色 b/r 被拉高 → 仍恒 0
       *   v3 放宽到 `r>90&&g>0.85r&&r>b+10` → 把暖雾带算进来 → 恒红
       *   v4 加局部对比 + 邻居条件 → 过了，但**天空改成暖金色之后又误判 342 个**（判据是照蓝天空调的）
       *   v5（现在）**不再看颜色**：上半幅只该是平滑天空，任何"笔画"都是异物。
       *      判据 = 该像素与左右各 8px 的均值差 > 18 的像素数必须为 0。
       *      天空是平滑渐变（差≈0），而草叶/山脊亮边是细笔画（差很大）→ 与调色板无关。
       */
      const lumOf = (i) => data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
      const CONTRAST = 18;
      const WINDOW = 8;
      const skyRegionBottom = Math.floor(height * 0.40);
      let grassInSky = 0;
      for (let y = 0; y < skyRegionBottom; y += 1) {
        const rowBase = y * width;
        for (let x = WINDOW; x + WINDOW < width; x += 1) {
          const here = lumOf((rowBase + x) * 4);
          const left = lumOf((rowBase + x - WINDOW) * 4);
          const right = lumOf((rowBase + x + WINDOW) * 4);
          const bg = (left + right) * 0.5;
          if (Math.abs(here - bg) > CONTRAST) grassInSky += 1;
        }
      }
      const horizonRow = skyRegionBottom;

      /**
       * 同一个判据的**阴性对照**：造一张 400px 高、在中间有一条硬边的图，喂进去。
       * 若这条造出来的硬边不能被判据抓出，说明 A 的判据没有辨别力。
       */
      const probe = document.createElement('canvas');
      probe.width = 64;
      probe.height = 400;
      const pctx = probe.getContext('2d');
      pctx.fillStyle = '#202020';
      pctx.fillRect(0, 0, 64, 200);
      pctx.fillStyle = '#b0b0b0';
      pctx.fillRect(0, 200, 64, 200);
      const pdata = pctx.getImageData(0, 0, 64, 400).data;
      const prowMean = new Float64Array(400);
      for (let y = 0; y < 400; y += 1) {
        let sum = 0;
        for (let x = 0; x < 64; x += 1) {
          const i = (y * 64 + x) * 4;
          sum += pdata[i] * 0.2126 + pdata[i + 1] * 0.7152 + pdata[i + 2] * 0.0722;
        }
        prowMean[y] = sum / 64;
      }
      const pjumps = [];
      for (let y = 1; y < 400; y += 1) pjumps.push(Math.abs(prowMean[y] - prowMean[y - 1]));
      const psorted = pjumps.slice().sort((a, b) => a - b);
      const pmedian = psorted[Math.floor(psorted.length * 0.5)] ?? 0;
      const pmax = psorted[psorted.length - 1] ?? 0;

      return {
        width,
        height,
        median,
        p99,
        max,
        seamRatio: max / Math.max(median, 1e-6),
        grassInSky,
        horizonRow,
        controlRatio: pmax / Math.max(pmedian, 1e-6),
      };
    });

    // 判据：硬边会让某一行跳变远超中位数。软渐变即使很陡，跳变也在中位数的小倍数内。
    const SEAM_LIMIT = 6;
    check(
      stats.seamRatio < SEAM_LIMIT,
      `存在疑似横向硬边：最大行跳变 ${stats.max.toFixed(2)} / 中位 ${stats.median.toFixed(3)} = ${stats.seamRatio.toFixed(1)}×（上限 ${SEAM_LIMIT}×）`,
    );
    check(
      stats.grassInSky === 0,
      `上半幅出现 ${stats.grassInSky} 个高对比像素 —— 天空里出现了笔画（草长到天上 / 山脊越界）`,
    );
    // 阴性对照：人造硬边必须远超上限
    check(
      stats.controlRatio > SEAM_LIMIT * 3,
      `阴性对照没能被人造硬边触发（比值 ${stats.controlRatio.toFixed(1)}×）—— 上面的无缝判据没有辨别力`,
    );

    console.log('field-ground 画面门（真实 Chromium，1280×720@dpr2）');
    console.log(`  画布 ${stats.width}×${stats.height}（设备像素）`);
    console.log(`  行亮度跳变：中位 ${stats.median.toFixed(4)}  p99 ${stats.p99.toFixed(3)}  最大 ${stats.max.toFixed(3)}  → ${stats.seamRatio.toFixed(1)}×（上限 ${SEAM_LIMIT}×）`);
    console.log(`  上半幅（y<40%）异物像素：${stats.grassInSky}（必须 0；与颜色无关，只查"平滑天空里有没有笔画"）`);
    console.log(`  阴性对照（人造硬边）：${stats.controlRatio.toFixed(1)}× → ${stats.controlRatio > SEAM_LIMIT * 3 ? '判据有辨别力' : '⚠️ 判据无效'}`);
    console.log(`  快照：state=${snapshot.state} lod=${snapshot.lod} drawn=${snapshot.drawn} cpu=${snapshot.cpuMs.toFixed(2)}ms`);
  } finally {
    await close();
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (/找不到 playwright|找不到 playwright 的浏览器|没有可用的 chromium/.test(message)) {
    console.log('[field-visual] SKIP：本机起不了浏览器，画面未验证。');
    console.log(`  原因：${message.split('\n')[0]}`);
    console.log('  这不是通过，只是「没测」。有浏览器的机器上请务必重跑。');
    // SKIP 不是绿：CI 没有浏览器时必须显式失败，否则「没测」会被当成「已通过」。
    process.exit(2);
  }
  throw error;
} finally {
  if (session) await session.close();
}

if (failures.length === 0) {
  console.log(`field-visual: PASS ${checks}/${checks}`);
  process.exit(0);
}
console.error(`field-visual: FAIL ${failures.length}/${checks}`);
for (const failure of failures) console.error(`  - ${failure}`);
process.exit(1);
