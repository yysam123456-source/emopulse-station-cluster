// P0-1 探针：Stage 不再写像素尺寸后，/still 的画面必须真的铺满视口。
//
// 这条只看“画布在页面上的矩形 + 后备像素尺寸是否跟得上”，不看颜色/内容：
// 手机只画左上角时，矩形仍是满屏，但 canvas.width/height 只有一小块，
// 所以两把尺都要量。
//
// 用法：node tests/probe-still-resize.mjs
import path from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { launch, openFile, screenshot, REPO_ROOT } from './lib/browser.mjs';

const failures = [];
let checks = 0;
const check = (ok, msg) => { checks += 1; if (!ok) failures.push(msg); };

const evidence = path.join(REPO_ROOT, 'docs', 'evidence', 'plan-2026-11-25');
mkdirSync(evidence, { recursive: true });

const file = path.join(REPO_ROOT, 'dist', 'still', 'index.html');
if (!existsSync(file)) {
  console.error('[probe-still-resize] 缺产物：先跑 npm run build:sites');
  process.exit(1);
}

/** 读当前视口内所有 canvas 的覆盖面积；返回最大的一块。 */
async function coverage(page) {
  return page.evaluate(() => {
    const vw = innerWidth;
    const vh = innerHeight;
    const canvases = [...document.querySelectorAll('#gl, #stage, canvas')].map((node) => {
      const r = node.getBoundingClientRect();
      const area = Math.max(0, r.width) * Math.max(0, r.height);
      return {
        id: node.id || null,
        css: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
        pixels: [node.width, node.height],
        ratio: area / Math.max(1, vw * vh),
        visible: getComputedStyle(node).display !== 'none' && getComputedStyle(node).visibility !== 'hidden',
      };
    });
    const best = canvases.filter((c) => c.visible).sort((a, b) => b.ratio - a.ratio)[0] ?? null;
    return { viewport: [vw, vh], best, canvases };
  });
}

const { browser, close } = await launch({ headless: true });
try {
  const { page } = await openFile(browser, file, { width: 390, height: 844, dpr: 1 });
  await page.waitForTimeout(2600);
  const mobile = await coverage(page);
  check(mobile.best?.ratio >= 0.95, `390×844 画面覆盖 ${((mobile.best?.ratio ?? 0) * 100).toFixed(1)}%（需 ≥95%）`);
  check(
    mobile.best && mobile.best.pixels[0] >= mobile.best.css[2] * 0.55 && mobile.best.pixels[1] >= mobile.best.css[3] * 0.55,
    `390×844 后备像素 ${JSON.stringify(mobile.best?.pixels)} 小于 CSS 矩形 ${JSON.stringify(mobile.best?.css)} 的 55%（renderScale 下限）`,
  );
  await screenshot(page, path.join(evidence, 'still-mobile-390.png'));

  await browser.session.setViewport(1280, 720, 1, false);
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.waitForTimeout(2200);
  const desktop = await coverage(page);
  check(desktop.best?.ratio >= 0.95, `1280×720 画面覆盖 ${((desktop.best?.ratio ?? 0) * 100).toFixed(1)}%（需 ≥95%）`);
  check(
    desktop.best && Math.abs((desktop.best.pixels[0] / desktop.best.pixels[1]) - (desktop.best.css[2] / desktop.best.css[3])) < 0.03,
    `1280×720 后备像素纵横比 ${JSON.stringify(desktop.best?.pixels)} 与 CSS ${JSON.stringify(desktop.best?.css)} 不一致`,
  );
  await screenshot(page, path.join(evidence, 'still-desktop-resize.png'));

  await browser.session.setViewport(1600, 900, 1, false);
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.waitForTimeout(2200);
  const wide = await coverage(page);
  check(wide.best?.ratio >= 0.95, `1600×900 画面覆盖 ${((wide.best?.ratio ?? 0) * 100).toFixed(1)}%（需 ≥95%）`);
  check(
    wide.best && Math.abs((wide.best.pixels[0] / wide.best.pixels[1]) - (wide.best.css[2] / wide.best.css[3])) < 0.03,
    `1600×900 后备像素纵横比 ${JSON.stringify(wide.best?.pixels)} 与 CSS ${JSON.stringify(wide.best?.css)} 不一致`,
  );
  const errors = browser.session.errors.filter((line) => !/favicon/i.test(line));
  check(errors.length === 0, `控制台错误：${errors[0] ?? ''}`);

  console.log('probe-still-resize（390×844 → 1280×720 → 1600×900）');
  for (const [label, data] of [['mobile', mobile], ['desktop', desktop], ['wide', wide]]) {
    console.log(`  ${label.padEnd(8)} viewport=${data.viewport.join('×')} best=${data.best?.id ?? 'none'} ratio=${((data.best?.ratio ?? 0) * 100).toFixed(1)}% css=${JSON.stringify(data.best?.css)} px=${JSON.stringify(data.best?.pixels)}`);
  }
} finally {
  await close();
}

if (failures.length === 0) {
  console.log(`probe-still-resize: PASS ${checks}/${checks}`);
  process.exit(0);
}
console.error(`probe-still-resize: FAIL ${failures.length}/${checks}`);
for (const failure of failures) console.error(`  - ${failure}`);
process.exit(1);
