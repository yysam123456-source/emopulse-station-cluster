// P0-5 / M2 门：四站的触屏菜单入口在 390×844 上可见、可点、打开后 CTA 让位。
//
// 只截菜单一张图；不重跑整站视觉门。仍只起一个 Edge，四站共用一个浏览器会话。
// 用法：node tests/menu-mobile.mjs
import path from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { launch, openFile, screenshot, REPO_ROOT } from './lib/browser.mjs';

const failures = [];
let checks = 0;
const check = (ok, msg) => { checks += 1; if (!ok) failures.push(msg); };
const evidence = path.join(REPO_ROOT, 'docs', 'evidence', 'plan-2026-11-25');
mkdirSync(evidence, { recursive: true });

const { browser, close } = await launch({ headless: true });
try {
  for (const slug of ['license', 'hug', 'still', 'koi']) {
    const file = path.join(REPO_ROOT, 'dist', slug, 'index.html');
    if (!existsSync(file)) {
      check(false, `${slug}: 缺产物`);
      continue;
    }
    const session = await openFile(browser, file, { width: 390, height: 844, dpr: 1, mobile: true });
    try {
      const page = session.page;
      await page.waitForTimeout(slug === 'still' ? 1800 : 900);
      const entry = await page.evaluate(() => {
        const btn = document.getElementById('menu-open');
        if (!btn) return null;
        const st = getComputedStyle(btn);
        const r = btn.getBoundingClientRect();
        return {
          visible: st.display !== 'none' && st.visibility !== 'hidden' && Number(st.opacity) > 0.01,
          rect: { x: r.x, y: r.y, w: r.width, h: r.height },
          text: btn.textContent ?? '',
          touch: st.touchAction,
        };
      });
      check(Boolean(entry && entry.visible), `${slug}: 触屏 #menu-open 不可见`);
      check(Boolean(entry && entry.rect.w >= 44 && entry.rect.h >= 44), `${slug}: #menu-open 触控尺寸 ${entry?.rect.w}×${entry?.rect.h} < 44`);
      if (!entry || !entry.visible) continue;

      await page.click('#menu-open');
      await page.waitForTimeout(200);
      const opened = await page.evaluate(() => {
        const cta = document.getElementById('cta');
        return {
          modal: document.body.dataset.modal,
          menuVisible: getComputedStyle(document.getElementById('menu')).visibility,
          ctaVisible: cta ? getComputedStyle(cta).visibility : 'missing',
        };
      });
      check(opened.modal === 'open', `${slug}: 菜单未打开 body[data-modal]=${opened.modal}`);
      check(opened.menuVisible === 'visible', `${slug}: 菜单 visibility=${opened.menuVisible}`);
      check(opened.ctaVisible === 'hidden' || opened.ctaVisible === 'missing',
        `${slug}: 菜单打开时 CTA visibility=${opened.ctaVisible}（应隐藏或该站没有 CTA）`);
      await screenshot(page, path.join(evidence, `menu-mobile-${slug}.png`));
      console.log(`${slug}: menu ${JSON.stringify(entry.rect)} touch=${entry.touch} → ${JSON.stringify(opened)}`);
    } finally {
      await session.close();
    }
  }
} finally {
  await close();
}

if (failures.length === 0) {
  console.log(`menu-mobile: PASS ${checks}/${checks}`);
  process.exit(0);
}
console.error(`menu-mobile: FAIL ${failures.length}/${checks}`);
for (const failure of failures) console.error(`  - ${failure}`);
process.exit(1);
