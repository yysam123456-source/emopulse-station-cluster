// P0-7 / M2 门：入口门厅在 390×844 上可读、无横向滚动、四张站卡都在。
//
// 这里量的是真实 DOM：卡片是 `<a>`，不是装饰 `<div>`；不是“有两张卡但只有一张能点”。
// 用法：node tests/entry-mobile.mjs
import path from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { launch, openFile, screenshot, REPO_ROOT } from './lib/browser.mjs';

const failures = [];
let checks = 0;
const check = (ok, msg) => { checks += 1; if (!ok) failures.push(msg); };
const evidence = path.join(REPO_ROOT, 'docs', 'evidence', 'plan-2026-11-25');
mkdirSync(evidence, { recursive: true });

const file = path.join(REPO_ROOT, 'dist', 'index.html');
if (!existsSync(file)) {
  console.error('[entry-mobile] 缺产物：先跑 npm run build:sites');
  process.exit(1);
}

const { browser, close } = await launch({ headless: true });
try {
  const { page } = await openFile(browser, file, { width: 390, height: 844, dpr: 1, mobile: true });
  await page.waitForTimeout(800);
  const data = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('a[href]')].filter((a) => /\/?(license|hug|still|koi)\//.test(a.getAttribute('href') ?? ''));
    return {
      title: document.querySelector('h1')?.textContent ?? '',
      count: cards.length,
      cards: cards.map((a) => ({
        href: a.getAttribute('href'),
        text: (a.innerText || a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 90),
      })),
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth,
      bodyWidth: document.body.getBoundingClientRect().width,
      src: [...document.querySelectorAll('img,script[src],link[href]')].length,
      errors: window.__errors ?? [],
    };
  });
  check(data.count === 4, `入口页站卡链接数=${data.count}（需 4）`);
  for (const slug of ['license', 'hug', 'still', 'koi']) {
    check(data.cards.some((c) => c.href?.includes(`${slug}/`)), `入口页缺 ${slug} 卡`);
  }
  check(data.scrollWidth <= data.innerWidth + 1, `390×844 横向滚动 scrollWidth=${data.scrollWidth} > ${data.innerWidth}`);
  check(data.bodyWidth <= data.innerWidth + 1, `390×844 body 宽 ${data.bodyWidth} > ${data.innerWidth}`);
  check(data.src === 0, `入口页有外部资源标签（img/script[src]/link[href]=${data.src}）`);
  await screenshot(page, path.join(evidence, 'entry-mobile.png'));
  console.log(`entry-mobile title=${JSON.stringify(data.title)} count=${data.count} scroll=${data.scrollWidth}/${data.innerWidth}`);
  for (const card of data.cards) console.log(`  ${card.href}  ${JSON.stringify(card.text)}`);
} finally {
  await close();
}

if (failures.length === 0) {
  console.log(`entry-mobile: PASS ${checks}/${checks}`);
  process.exit(0);
}
console.error(`entry-mobile: FAIL ${failures.length}/${checks}`);
for (const failure of failures) console.error(`  - ${failure}`);
process.exit(1);
