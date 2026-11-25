// P0-8 / M3 门：/koi 在 40s 后出现 Keep this frame，点击必须落一张真实 PNG。
// 这条门真等 40s；它不测“按钮存在”，测的是慢变量 + 下载闭环。
// 用法：node tests/koi-keep.mjs（约 45s）
import path from 'node:path';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { launch, openFile, screenshot, REPO_ROOT } from './lib/browser.mjs';
import { decodePng } from './lib/png.mjs';

const failures = [];
let checks = 0;
const check = (ok, msg) => { checks += 1; if (!ok) failures.push(msg); };
const evidence = path.join(REPO_ROOT, 'docs', 'evidence', 'plan-2026-11-25');
mkdirSync(evidence, { recursive: true });

const file = path.join(REPO_ROOT, 'dist', 'koi', 'index.html');
if (!existsSync(file)) {
  console.error('[koi-keep] 缺产物：先跑 npm run build:sites');
  process.exit(1);
}

const { browser, close } = await launch({ headless: true });
try {
  const { page } = await openFile(browser, file, { width: 1280, height: 720, dpr: 1 });
  const started = Date.now();
  await page.waitForFunction(
    () => {
      const el = document.getElementById('keep');
      return el && !el.hidden;
    },
    null,
    { timeout: 50000, polling: 250 },
  );
  const elapsed = (Date.now() - started) / 1000;
  check(elapsed >= 38 && elapsed <= 48, `/koi: Keep this frame 出现于 ${elapsed.toFixed(1)}s（目标 40s ± 8s）`);
  await screenshot(page, path.join(evidence, 'koi-keep-40s.png'));

  const keep = await page.evaluate(() => {
    const el = document.getElementById('keep');
    const r = el.getBoundingClientRect();
    return { text: el.textContent ?? '', font: getComputedStyle(el).fontSize, rect: { x: r.x, y: r.y, w: r.width, h: r.height } };
  });
  check(/keep/i.test(keep.text), `/koi: 带走入口文案=${JSON.stringify(keep.text)}`);
  check(parseFloat(keep.font) >= 12, `/koi: Keep 字号 ${keep.font} < 12px`);

  const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
  await page.click('#keep');
  const download = await downloadPromise;
  const out = path.join(evidence, 'koi-frame-40s.png');
  await download.saveAs(out);
  const buffer = readFileSync(out);
  const decoded = decodePng(buffer);
  check(decoded.width >= 1000 && decoded.height >= 600, `/koi: 导出帧 ${decoded.width}×${decoded.height} 不是一帧可用的图`);
  check(buffer.length > 100 * 1024, `/koi: 导出 PNG 只有 ${buffer.length} B，疑似空帧`);
  const feedback = await page.evaluate(() => document.getElementById('keep')?.textContent ?? '');
  check(/saved|kept|frame/i.test(feedback), `/koi: 下载后反馈=${JSON.stringify(feedback)}`);

  console.log(`koi-keep: ${elapsed.toFixed(1)}s keep=${JSON.stringify(keep.text)} png=${decoded.width}×${decoded.height} ${buffer.length} B feedback=${JSON.stringify(feedback)}`);
} finally {
  await close();
}

if (failures.length === 0) {
  console.log(`koi-keep: PASS ${checks}/${checks}`);
  process.exit(0);
}
console.error(`koi-keep: FAIL ${failures.length}/${checks}`);
for (const failure of failures) console.error(`  - ${failure}`);
process.exit(1);
