// P1 / M3 门：/still 在 390×844 上 Sit 后 40s 浮出带走入口，点击写剪贴板。
// 这条门必须真等 40s：它不是“有按钮”的结构门，而是慢变量的时序门。
// 用法：node tests/still-takeaway.mjs（约 45s）
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
  console.error('[still-takeaway] 缺产物：先跑 npm run build:sites');
  process.exit(1);
}

const { browser, close } = await launch({ headless: true });
try {
  const { page } = await openFile(browser, file, { width: 390, height: 844, dpr: 1, mobile: true });
  await page.waitForTimeout(1200);
  await page.click('#cta');
  const started = Date.now();
  await page.waitForFunction(
    () => {
      const el = document.getElementById('copy-line');
      return el && !el.hidden;
    },
    null,
    { timeout: 50000, polling: 250 },
  );
  const elapsed = (Date.now() - started) / 1000;
  check(elapsed >= 38 && elapsed <= 48, `/still: Copy the line 出现于 ${elapsed.toFixed(1)}s（目标 40s ± 8s）`);

  const layout = await page.evaluate(() => {
    const copy = document.getElementById('copy-line');
    const cta = document.getElementById('cta');
    const note = document.getElementById('share-note');
    const c = copy.getBoundingClientRect();
    const b = cta.getBoundingClientRect();
    return {
      copy: { hidden: copy.hidden, text: copy.textContent, rect: { x: c.x, y: c.y, w: c.width, h: c.height }, font: getComputedStyle(copy).fontSize },
      cta: { rect: { x: b.x, y: b.y, w: b.width, h: b.height }, visible: getComputedStyle(cta).visibility },
      note: { hidden: note.hidden, text: note.textContent },
      state: globalThis.__site?.snapshot?.().state,
    };
  });
  check(layout.copy.hidden === false, '/still: Copy the line 仍隐藏');
  check(/copy/i.test(layout.copy.text), `/still: 带走入口文案=${JSON.stringify(layout.copy.text)}`);
  check(parseFloat(layout.copy.font) >= 12, `/still: Copy the line 字号 ${layout.copy.font} < 12px`);
  const overlap = Math.min(layout.copy.rect.y + layout.copy.rect.h, layout.cta.rect.y + layout.cta.rect.h)
    - Math.max(layout.copy.rect.y, layout.cta.rect.y);
  check(overlap <= 2, `/still: Copy the line 与常驻 CTA 垂直重叠 ${overlap}px`);
  await screenshot(page, path.join(evidence, 'still-mobile-copy-40s.png'));

  await page.click('#copy-line');
  await page.waitForTimeout(150);
  const copied = await page.evaluate(() => ({
    noteHidden: document.getElementById('share-note')?.hidden,
    noteText: document.getElementById('share-note')?.textContent ?? '',
  }));
  check(copied.noteHidden === false, '/still: 点 Copy the line 后没有可见反馈');
  check(/copied|clipboard|复制/i.test(copied.noteText), `/still: 复制反馈=${JSON.stringify(copied.noteText)}`);

  console.log(`still-takeaway: ${elapsed.toFixed(1)}s copy=${JSON.stringify(layout.copy.text)} note=${JSON.stringify(copied.noteText)} state=${layout.state}`);
} finally {
  await close();
}

if (failures.length === 0) {
  console.log(`still-takeaway: PASS ${checks}/${checks}`);
  process.exit(0);
}
console.error(`still-takeaway: FAIL ${failures.length}/${checks}`);
for (const failure of failures) console.error(`  - ${failure}`);
process.exit(1);
