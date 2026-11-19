// L5 的 DOM 门 —— L5 走 DOM（四站共享壳），所以它不进 `stage.order`，只能用**查 DOM** 的方式确认。
//
// ★ 这条门补的是一个真实的误判：主理人曾要求"确认产物 order 里有 L5"，
//   但 L5 是 DOM，`stage.order` 永远不会有它 —— **那个判据在新设计下不可能成立**。
//   正确的确认是这里这五条。
//
// 六条断言（每站都跑）：
//   1. `#h1` 文案 === `COPY.*.h1`
//   2. `#lead` 文案 === `COPY.*.hook`
//   3. `#menu` 存在、默认隐藏、**Esc 能打开**（否则菜单等于不存在）
//   4. 菜单每项都有合法的 `data-channel`（ui / world-param / world-input / world-inject）
//   5. **`world-inject` 全站恰 1 处（有 CTA 的站）或 0 处** —— 注入通道不许悄悄多出来
//   6. 有纸的站：`#h1` 与 `#lead` 的矩形必须**落在纸内**（文案跑到桌面上是本次最直观的缺陷）
//
// 用法：node tests/site-dom.mjs
import { launch, openFile, waitForPreview, REPO_ROOT } from './lib/browser.mjs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { COPY, UI } from '../shared/sites/copy.mjs';
import { STATIONS } from '../shared/sites/build.mjs';

const VALID_CHANNELS = new Set(['ui', 'world-param', 'world-input', 'world-inject']);
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

/** 站 slug → copy.mjs 的 key（`koi` 在文档里叫 `koiPond`）。 */
const copyKey = (slug) => (slug === 'koi' ? 'koiPond' : slug);

const { browser, close } = await launch({ headless: true });
const rows = [];
try {
  for (const slug of Object.keys(STATIONS)) {
    const file = path.join(REPO_ROOT, 'dist', slug, 'index.html');
    if (!existsSync(file)) {
      check(false, `${slug}: 缺产物（先跑 npm run build:sites）`);
      continue;
    }
    const station = STATIONS[slug];
    const copy = COPY[copyKey(slug)];
    const session = await openFile(browser, file, { width: 1280, height: 720, dpr: 2 });
    try {
      await waitForPreview(session.page, { frames: 8, timeoutMs: 240000 });

      const dom = await session.page.evaluate(() => {
        const read = (id) => {
          const el = document.getElementById(id);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return {
            text: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
            rect: { x: r.x, y: r.y, w: r.width, h: r.height },
            hidden: el.hidden === true,
          };
        };
        const items = [...document.querySelectorAll('.menu-item')].map((el) => ({
          id: el.id,
          channel: el.getAttribute('data-channel'),
        }));
        const root = getComputedStyle(document.documentElement);
        const sheet = {
          x: parseFloat(root.getPropertyValue('--sheet-x')) || 0,
          y: parseFloat(root.getPropertyValue('--sheet-y')) || 0,
          w: parseFloat(root.getPropertyValue('--sheet-w')) || 0,
          h: parseFloat(root.getPropertyValue('--sheet-h')) || 0,
        };
        return {
          h1: read('h1'), lead: read('lead'), menu: read('menu'), cta: read('cta'),
          items, sheet, sheetMode: document.body.dataset.sheet,
          privacy: (document.querySelector('.menu-privacy')?.textContent ?? '').trim(),
          menuTitle: (document.querySelector('.menu-title')?.textContent ?? '').trim(),
          injects: [...document.querySelectorAll('[data-channel="world-inject"]')].length,
        };
      });

      // 1/2 文案
      check(dom.h1 !== null, `${slug}: 缺 #h1（L5 第一层）`);
      check(dom.h1?.text === copy.h1, `${slug}: #h1 = ${JSON.stringify(dom.h1?.text)}，应为 ${JSON.stringify(copy.h1)}`);
      check(dom.lead?.text === copy.hook, `${slug}: #lead = ${JSON.stringify(dom.lead?.text)}，应为 ${JSON.stringify(copy.hook)}`);

      // 3 菜单：存在 + 默认隐藏 + Esc 能打开
      check(dom.menu !== null, `${slug}: 缺 #menu`);
      check(dom.menu?.hidden === true, `${slug}: 菜单默认应隐藏（第一屏不该是菜单）`);
      await session.page.keyboard.press('Escape');
      const opened = await session.page.evaluate(() => document.getElementById('menu')?.hidden === false);
      check(opened, `${slug}: Esc 打不开菜单（菜单等于不存在）`);
      // 关闭，避免影响后续
      await session.page.keyboard.press('Escape');
      check(dom.privacy === UI.privacy, `${slug}: 菜单固定末行 = ${JSON.stringify(dom.privacy)}，应为 ${JSON.stringify(UI.privacy)}`);
      // 可见标题不能是占位符（`String.replace` 只换第一处那个坑）
      check(dom.menuTitle === UI.menuTitle, `${slug}: 菜单标题 = ${JSON.stringify(dom.menuTitle)}，应为 ${JSON.stringify(UI.menuTitle)}`);

      // 4 每个控件必须标通道，且取值合法
      check(dom.items.length >= 6, `${slug}: 菜单项只有 ${dom.items.length} 个（至少 6）`);
      for (const item of dom.items) {
        check(
          VALID_CHANNELS.has(item.channel),
          `${slug}: 菜单项 #${item.id} 的 data-channel=${JSON.stringify(item.channel)} 不在 ${[...VALID_CHANNELS].join('/')}`,
        );
      }

      // 5 注入通道数量（四站合计只允许 1 处 = CTA）
      // 注入通道 ≠ 有 CTA：/license 的 'Stamp it' 是站点作用域的因果（channel=ui），
      // 只有 `/hug` 的 'Let it go' 才是 world-inject。按通道判，不按有无按钮判。
      const expectInject = station.ctaChannel === 'world-inject' ? 1 : 0;
      check(
        dom.injects === expectInject,
        `${slug}: world-inject 有 ${dom.injects} 处，应为 ${expectInject}（注入通道不许悄悄多出来）`,
      );

      // 6 有纸的站：文案必须落在纸内
      if (station.paperSheet) {
        check(dom.sheetMode === 'on', `${slug}: body[data-sheet] 应为 on（有纸的站）`);
        const inside = (r) => r
          && r.x >= dom.sheet.x - 1 && r.y >= dom.sheet.y - 1
          && r.x + r.w <= dom.sheet.x + dom.sheet.w + 1
          && r.y + r.h <= dom.sheet.y + dom.sheet.h + 1;
        check(inside(dom.h1?.rect), `${slug}: #h1 落在纸外（${JSON.stringify(dom.h1?.rect)} vs 纸 ${JSON.stringify(dom.sheet)}）`);
        check(inside(dom.lead?.rect), `${slug}: #lead 落在纸外（${JSON.stringify(dom.lead?.rect)} vs 纸 ${JSON.stringify(dom.sheet)}）`);
      }

      rows.push({
        slug,
        h1: dom.h1?.text ?? '-',
        hook: dom.lead?.text ?? '-',
        items: dom.items.length,
        injects: dom.injects,
        sheet: dom.sheetMode,
      });
    } finally {
      await session.close();
    }
  }
} finally {
  await close();
}

console.log('L5 DOM 门（真实 Chromium）\n');
console.log('  slug     h1         hook                                    菜单项  注入  纸');
for (const row of rows) {
  console.log(`  ${row.slug.padEnd(8)} ${row.h1.padEnd(9)}  ${row.hook.padEnd(40)} ${String(row.items).padStart(2)}   ${row.injects}    ${row.sheet}`);
}

if (failures.length === 0) {
  console.log(`\nsite-dom: PASS ${checks}/${checks}`);
  process.exit(0);
}
console.error(`\nsite-dom: FAIL ${failures.length}/${checks}`);
for (const failure of failures) console.error(`  - ${failure}`);
process.exit(1);
