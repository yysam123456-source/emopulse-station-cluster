// P0-4 / M2 门：/hug 的“点草地”和 CTA 必须走同一套 release()，且带走链接提示可见。
//
// 这条门不读剪贴板（file:// 下权限行为因浏览器而异），只读页面自己的状态：
// 提示里必须出现 `?from=hug` 或明确的 “Link copied.”，并在 390×844 上不被 CTA 压住。
// 用法：node tests/hug-release.mjs
import path from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { launch, openFile, screenshot, REPO_ROOT } from './lib/browser.mjs';

const failures = [];
let checks = 0;
const check = (ok, msg) => { checks += 1; if (!ok) failures.push(msg); };
const evidence = path.join(REPO_ROOT, 'docs', 'evidence', 'plan-2026-11-25');
mkdirSync(evidence, { recursive: true });

const file = path.join(REPO_ROOT, 'dist', 'hug', 'index.html');
if (!existsSync(file)) {
  console.error('[hug-release] 缺产物：先跑 npm run build:sites');
  process.exit(1);
}

const { browser, close } = await launch({ headless: true });
try {
  const { page } = await openFile(browser, file, { width: 390, height: 844, dpr: 1, mobile: true });
  await page.waitForTimeout(1600);

  // 画布就是触发区；不要点 CTA，专门验证“点草地”这条路径。
  const canvasRect = await page.evaluate(() => {
    const r = document.getElementById('stage').getBoundingClientRect();
    return { x: r.x + r.width * 0.5, y: r.y + r.height * 0.62 };
  });
  await page.evaluate(({ x, y }) => {
    document.getElementById('stage').dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, pointerId: 9, clientX: x, clientY: y, button: 0,
    }));
  }, canvasRect);
  await page.waitForTimeout(250);

  const state = await page.evaluate(() => {
    const note = document.getElementById('share-note');
    const cta = document.getElementById('cta');
    const n = note ? note.getBoundingClientRect() : null;
    const c = cta ? cta.getBoundingClientRect() : null;
    return {
      note: note ? { hidden: note.hidden, text: note.textContent ?? '', rect: n && { x: n.x, y: n.y, w: n.width, h: n.height } } : null,
      cta: c && { x: c.x, y: c.y, w: c.width, h: c.height },
      tapped: globalThis.__site?.snapshot?.().tapped ?? null,
    };
  });
  check(state.note && state.note.hidden === false, `/hug: 点草地后 #share-note 仍隐藏（${JSON.stringify(state.note)}）`);
  check(
    state.note && (/from=hug|\/hug\?|Link copied/i.test(state.note.text)),
    `/hug: 提示没带 from=hug：${JSON.stringify(state.note?.text)}`,
  );
  if (state.note?.rect && state.cta) {
    const x = Math.min(state.note.rect.x + state.note.rect.w, state.cta.x + state.cta.w) - Math.max(state.note.rect.x, state.cta.x);
    const y = Math.min(state.note.rect.y + state.note.rect.h, state.cta.y + state.cta.h) - Math.max(state.note.rect.y, state.cta.y);
    check(!(x > 2 && y > 2), '/hug: #share-note 与 CTA 重叠');
  }

  await screenshot(page, path.join(evidence, 'hug-canvas-release.png'));

  // 菜单打开时，底层 CTA/带走提示必须让位；否则手机上菜单和 CTA 会叠。
  await page.click('#menu-open');
  await page.waitForTimeout(150);
  const modal = await page.evaluate(() => ({
    open: document.body.dataset.modal,
    ctaHidden: getComputedStyle(document.getElementById('cta')).visibility,
    shareHidden: getComputedStyle(document.getElementById('share-note')).visibility,
    menuVisible: getComputedStyle(document.getElementById('menu')).visibility,
  }));
  check(modal.open === 'open', `/hug: 点 #menu-open 后 body[data-modal]=${modal.open}`);
  check(modal.ctaHidden === 'hidden', `/hug: 菜单打开时 CTA 仍可见（${modal.ctaHidden}）`);
  check(modal.shareHidden === 'hidden', `/hug: 菜单打开时带走提示仍可见（${modal.shareHidden}）`);
  check(modal.menuVisible !== 'hidden', `/hug: 菜单打开后 #menu 不可见`);
  await screenshot(page, path.join(evidence, 'hug-menu-mobile.png'));

  console.log(`hug-release note=${JSON.stringify(state.note)} tapped=${state.tapped}`);
  console.log(`hug menu modal=${JSON.stringify(modal)}`);
} finally {
  await close();
}

if (failures.length === 0) {
  console.log(`hug-release: PASS ${checks}/${checks}`);
  process.exit(0);
}
console.error(`hug-release: FAIL ${failures.length}/${checks}`);
for (const failure of failures) console.error(`  - ${failure}`);
process.exit(1);
