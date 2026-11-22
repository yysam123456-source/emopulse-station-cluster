// 成品视觉门 —— 四个**站点**（不是零件）在真实 Chromium 里的首屏与一次交互。
//
// 为什么必须单独有这一层（2026-11-19 的教训）：
//   `verify:sites` 124/124、`verify:dom` 82/82、`verify:stage` 44/44 全绿的时候，
//   `/koi` 整屏是 ASCII 水纹（没有鱼）、`/hug` 没有蒲公英、`/still` 没有 Sit。
//   零件统计正确 ≠ 成品画面正确。这个门只回答四个用户真正看得见的问题：
//     1. 画面不是空白/纯色（主画布有足够的亮度方差）
//     2. 四个站都真的到 ready（或诚实的 degraded），不是 booting 卡住
//     3. 主 CTA 真的改变了画面（/hug 放走、/still 坐下）
//     4. /license 的 Save 真的产出一张 1410×1000 的 PNG（不是 0 字节/错尺寸）
//
// 它**不**替代零件门：零件门的 124 条仍然管文案/栈/预算/契约。
// 用法：node tests/site-visual.mjs
import { mkdirSync, readFileSync } from 'node:fs';
import { statsFromPng } from './lib/png.mjs';
import path from 'node:path';
import { launch, openFile, waitForPreview, REPO_ROOT } from './lib/browser.mjs';

// `still` 放最前：它是唯一用 WebGPU 的站，也是唯一会因上下文/设备初始化失败而
// 整站只剩 tide 底材的站。先跑它，避免前面三个页面的 GL 上下文把它拖成 flaky。
const SITES = ['still', 'license', 'hug', 'koi'];
mkdirSync(path.join(REPO_ROOT, 'dist', 'qa'), { recursive: true });
const checks = [];
const failures = [];
const summary = [];

function check(ok, label) {
  checks.push(label);
  if (!ok) failures.push(label);
}

/**
 * 主画布降采样亮度：既能判空白，也能做交互前后的帧差。
 *
 * @param {object} page Playwright page
 * @returns {Promise<{ mean: number, std: number, min: number, max: number, dark: number, grid: number[] }>}
 */
async function canvasStats(page) {
  return page.evaluate(() => {
    const canvas = document.getElementById('stage');
    if (!canvas) return { error: 'missing #stage' };
    const ctx = canvas.getContext('2d');
    if (!ctx) return { error: 'no 2d ctx' };
    const w = canvas.width; const h = canvas.height;
    const data = ctx.getImageData(0, 0, w, h).data;
    // 固定 96×96 网格：renderScale / 视口一变，canvas 尺寸就变；按像素步长采样会让
    // 两张图的 grid 长度不同，gridDiff 直接返回 0（假绿/假红都来过）。
    const GX = 96; const GY = 96;
    let sum = 0; let sum2 = 0; let min = 255; let max = 0; let dark = 0;
    const grid = [];
    for (let gy = 0; gy < GY; gy += 1) {
      const y = Math.min(h - 1, Math.floor(gy * (h - 1) / (GY - 1)));
      for (let gx = 0; gx < GX; gx += 1) {
        const x = Math.min(w - 1, Math.floor(gx * (w - 1) / (GX - 1)));
        const i = (y * w + x) * 4;
        const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        sum += lum; sum2 += lum * lum;
        if (lum < min) min = lum;
        if (lum > max) max = lum;
        if (lum < 60) dark += 1;
        grid.push(Math.round(lum));
      }
    }
    const n = GX * GY;
    const mean = sum / n;
    const variance = Math.max(0, sum2 / n - mean * mean);
    return { mean: +mean.toFixed(1), std: +Math.sqrt(variance).toFixed(1), min: +min.toFixed(1), max: +max.toFixed(1), dark, grid };
  });
}

/**
 * 整屏截图统计。`/still` 的体素世界在 `#gl`（z-index:-1），只读 `#stage` 会把 Sit
 * 判成「没动」；这里按浏览器真正合成的整屏取像素。
 */
async function screenStats(page) {
  const buffer = await page.screenshot({ type: 'png' });
  return statsFromPng(buffer);
}

/** 两帧降采样亮度的平均绝对差。 */
function gridDiff(a, b) {
  if (!a.grid || !b.grid || a.grid.length !== b.grid.length) return 0;
  let sum = 0;
  for (let i = 0; i < a.grid.length; i += 1) sum += Math.abs(a.grid[i] - b.grid[i]);
  return +(sum / a.grid.length).toFixed(2);
}

const { browser, close } = await launch({ headless: true, webgpu: true });
try {
  for (const slug of SITES) {
    const session = await openFile(browser, `dist/${slug}/index.html`, { width: 1280, height: 800, dpr: 1 });
    try {
      const snap = await waitForPreview(session.page, { frames: 60 });
      check(snap.frames >= 60, `${slug}: 只跑了 ${snap.frames} 帧（<60 不得作为视觉证据）`);
      check(snap.readiness >= 1, `${slug}: readiness=${snap.readiness}（画面还没建完）`);
      check(snap.state === 'ready' || snap.state === 'degraded', `${slug}: state=${snap.state}`);
      if (slug === 'hug' || slug === 'still' || slug === 'license') {
        check(snap.ctaEnabled === true, `${slug}: CTA 还不可按（ctaEnabled=${snap.ctaEnabled}）`);
      }

      const before = await canvasStats(session.page);
      check(!before.error, `${slug}: 主画布读不到像素：${before.error ?? ''}`);
      if (!before.error) {
        check(before.std > 6, `${slug}: 主画布近乎纯色（std=${before.std}, mean=${before.mean}）`);
        check(before.max - before.min > 25, `${slug}: 明暗范围只有 ${before.min}–${before.max}`);
      }
      if (slug === 'still') {
        // 设备丢失是异步的：装配器现在会记 degraded（onError），不能只看 readiness=1。
        check(
          !snap.degraded.some((entry) => entry.id === 'voxel-world' && entry.reason === 'suspended'),
          `still: voxel-world 异步失败被隔离了：${JSON.stringify(snap.degraded)}`,
        );
      }
      if (slug === 'koi') {
        // 鱼是画面里唯一的近黑块；纸/浮萍是浅灰。纯 ASCII 水纹的旧版没有这个暗块。
        check(before.dark > 20, `koi: 采样里近黑像素只有 ${before.dark}（鱼很可能又不见了）`);

        // 三种 look 必须是三条真的不同画面，不是同一个 ink 换了名字：
        //   ink 是冷灰纸，paint 是暖白水彩纸，real 是深色池底。
        // 这里用「同一次会话里切菜单」证明接线是通的，再用深链接各开一次证明刷新后仍在。
        await session.page.keyboard.press('Escape');
        const lookInk = before;
        await session.page.click('#menu-look');
        await session.page.waitForTimeout(1300);
        const lookPaint = await canvasStats(session.page);
        check(
          (await session.page.evaluate(() => document.body.dataset.koiStyle)) === 'paint',
          'koi: Look 菜单没有把 body 切到 paint',
        );
        check(
          gridDiff(lookInk, lookPaint) > 12,
          `koi: ink→paint 的帧差只有 ${gridDiff(lookInk, lookPaint)}（菜单没接上渲染路径）`,
        );
        await session.page.click('#menu-look');
        await session.page.waitForTimeout(1600);
        const lookReal = await canvasStats(session.page);
        check(
          (await session.page.evaluate(() => document.body.dataset.koiStyle)) === 'real',
          'koi: Look 菜单没有把 body 切到 real',
        );
        check(
          gridDiff(lookPaint, lookReal) > 20,
          `koi: paint→real 的帧差只有 ${gridDiff(lookPaint, lookReal)}（real 路径没跑起来）`,
        );
        // real 是深水，标题必须换成浅字；深墨标题在深水上等于消失。
        const h1 = await session.page.evaluate(() => getComputedStyle(document.getElementById('h1')).color);
        check(/rgba\(24[0-9], 24[0-9], 23[0-9]/.test(h1) || /rgb\(24[0-9], 24[0-9], 23[0-9]/.test(h1),
          `koi: real 下 H1 颜色仍是 ${h1}（深墨标题会沉进深水）`);

        // 深链接：刷新后仍停在指定风格，而不是只靠同一次会话里的菜单状态。
        // 上游的 `?style=` 是一条正式入口；A1 曾只测菜单，漏掉了「刷新即回到 ink」。
        for (const [style, baseline, minDiff] of [
          ['paint', lookInk, 12],
          ['real', lookPaint, 20],
        ]) {
          const deep = await openFile(browser, 'dist/koi/index.html', {
            width: 1280, height: 800, dpr: 1, query: `?style=${style}`,
          });
          try {
            await waitForPreview(deep.page, { frames: 60, timeoutMs: 30000 });
            const stats = await canvasStats(deep.page);
            check(
              (await deep.page.evaluate(() => document.body.dataset.koiStyle)) === style,
              `koi: 深链接 ?style=${style} 没有生效`,
            );
            check(
              gridDiff(baseline, stats) > minDiff,
              `koi: 深链接 ?style=${style} 与基准帧差只有 ${gridDiff(baseline, stats)}`,
            );
            if (style === 'real') {
              const deepH1 = await deep.page.evaluate(() => getComputedStyle(document.getElementById('h1')).color);
              check(/rgba\(24[0-9], 24[0-9], 23[0-9]/.test(deepH1) || /rgb\(24[0-9], 24[0-9], 23[0-9]/.test(deepH1),
                `koi: ?style=real 下 H1 颜色仍是 ${deepH1}（深墨标题会沉进深水）`);
            }
          } finally {
            await deep.close();
          }
        }
      }

      // 主 CTA：只测两站真驱动世界的；license 另有导出断言。
      let ctaDiff = null;
      let after = before;
      if (slug === 'hug' || slug === 'still') {
        // CTA 的帧差用整屏：still 的世界在 #gl，不在 #stage。
        const ctaBefore = await screenStats(session.page);
        await session.page.click('#cta');
        // 一次点击要穿过「壳 → site:cta → 零件」三层；相机 glide 有 2.4s，
        // 取两个时间点里的最大帧差，既避免 glide 中途采样，也不会把一次早点击误判成失败。
        const waits = slug === 'hug' ? [1200, 1800] : [1200, 2400];
        let diff = 0;
        for (const waitMs of waits) {
          await session.page.waitForTimeout(waitMs === waits[0] ? waitMs : waitMs - waits[0]);
          const sample = await screenStats(session.page);
          diff = Math.max(diff, gridDiff(ctaBefore, sample));
          after = sample;
        }
        ctaDiff = diff;
        // still 的水本身在动（ambient 帧差可达个位数）；Sit 的镜头位移必须显著高于它。
        check(diff > (slug === 'hug' ? 1.5 : 20), `${slug}: CTA 按下后画面帧差 ${diff}（太小，等于没动）`);
      }

      if (slug === 'hug') {
        const note = await session.page.evaluate(() => {
          const el = document.getElementById('share-note');
          return { hidden: el ? el.hidden : null, text: el ? el.textContent : '' };
        });
        check(note.hidden === false && /link/i.test(note.text ?? ''), `hug: 带走链接状态没有出现：${JSON.stringify(note)}`);
      }

      let exportInfo = null;
      if (slug === 'license') {
        await session.page.click('#cta');
        await session.page.waitForTimeout(7200);
        const state = await session.page.evaluate(() => ({
          saveHidden: document.getElementById('save')?.hidden,
          seal: document.getElementById('seal')?.className ?? '',
          stage: document.getElementById('stage-word')?.textContent ?? '',
        }));
        check(state.saveHidden === false, `license: approved 后 #save 仍隐藏（${JSON.stringify(state)}）`);
        check(state.seal.includes('is-set'), `license: 朱砂章没有 is-set（${state.seal}）`);
        check(state.stage === 'approved', `license: 终态词=${state.stage}`);

        const out = path.join(REPO_ROOT, 'dist', 'qa', `license-export-${Date.now()}.png`);
        const [download] = await Promise.all([
          session.page.waitForEvent('download'),
          session.page.click('#save'),
        ]);
        await download.saveAs(out);
        const bytes = readFileSync(out);
        // PNG IHDR：宽/高在 offset 16/20（大端 32 位）。
        const width = bytes.readUInt32BE(16);
        const height = bytes.readUInt32BE(20);
        check(width === 1410 && height === 1000, `license: 导出 ${width}×${height}（应为 1410×1000）`);
        check(bytes.length > 80_000, `license: 导出只有 ${bytes.length} B（疑似空白）`);
        exportInfo = { bytes: bytes.length, size: `${width}×${height}` };
      }

      const errors = session.errors.filter((line) => !/favicon/i.test(line));
      check(errors.length === 0, `${slug}: 控制台有 ${errors.length} 条错误：${errors[0] ?? ''}`);
      summary.push({
        slug,
        state: snap.state,
        lod: snap.lod,
        fps: snap.fps.toFixed(1),
        mean: before.mean,
        std: before.std,
        ctaDiff: ctaDiff === null ? '—' : ctaDiff,
        export: exportInfo ? exportInfo.size : '—',
      });
    } finally {
      await session.close();
    }
  }
} finally {
  await close();
}

console.log('\n成品视觉门（真实 Chromium，1280×800@dpr1）\n');
console.log('  slug      state      lod    fps    paperL*  std   CTA Δ   export');
for (const row of summary) {
  console.log(`  ${row.slug.padEnd(8)} ${String(row.state).padEnd(9)} ${String(row.lod).padEnd(5)} ${String(row.fps).padStart(5)}  ${String(row.mean).padStart(6)}  ${String(row.std).padStart(4)}  ${String(row.ctaDiff).padStart(6)}  ${row.export}`);
}

if (failures.length === 0) {
  console.log(`\nsite-visual: PASS ${checks.length}/${checks.length}`);
  process.exit(0);
}
console.error(`\nsite-visual: FAIL ${failures.length}/${checks.length}`);
for (const failure of failures) console.error(`  - ${failure}`);
process.exit(1);
