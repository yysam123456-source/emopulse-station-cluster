// A2 P1 门：Studio 在 file:// 下导出单 HTML，下载物必须能独立打开、带参数、无外部请求。
//
// 这是 fallback 路径：fetch 读不了 file://，iframe 序列化 outerHTML，Studio 再注入 shim。
// 用法：node tests/a2-export.mjs
import path from 'node:path';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { launch, openFile, screenshot, REPO_ROOT } from './lib/browser.mjs';

const failures = [];
let checks = 0;
const check = (ok, msg) => { checks += 1; if (!ok) failures.push(msg); };
const evidence = path.join(REPO_ROOT, 'docs', 'evidence', 'plan-2026-11-25');
mkdirSync(evidence, { recursive: true });

const studio = path.join(REPO_ROOT, 'dist', 'studio', 'index.html');
if (!existsSync(studio)) {
  console.error('[a2-export] 缺产物：先跑 npm run build:studio');
  process.exit(1);
}

const { browser, close } = await launch({ headless: true });
try {
  const { page } = await openFile(browser, studio, { width: 1280, height: 900, dpr: 1 });
  await page.waitForTimeout(800);

  const target = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.card')];
    const card = cards.find((c) => c.querySelector('h2')?.textContent === '深海信标');
    const button = card ? [...card.querySelectorAll('button')].find((b) => b.textContent?.includes('导出')) : null;
    return { found: Boolean(button), cardFound: Boolean(card) };
  });
  check(target.cardFound, '/a2-export: Studio 里没有深海信标卡片');
  check(target.found, '/a2-export: 深海信标卡片没有导出按钮');

  const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
  await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.card')];
    const card = cards.find((c) => c.querySelector('h2')?.textContent === '深海信标');
    const button = card ? [...card.querySelectorAll('button')].find((b) => b.textContent?.includes('导出')) : null;
    button?.click();
  });
  const download = await downloadPromise;
  const out = path.join(evidence, 'a2-export-deepsea.html');
  await download.saveAs(out);
  const html = readFileSync(out, 'utf8');
  check(html.length > 10 * 1024, `/a2-export: 下载 HTML 只有 ${html.length} B`);
  check(html.includes('__EMBEDDED_PARAMS__'), '/a2-export: 下载物没有参数 shim');
  check(!html.includes('__PREVIEW_'), '/a2-export: 下载物残留 __PREVIEW_ 占位符');
  check(!/https?:\/\/[^\s"']+/i.test(html.replace(/__EMBEDDED_PARAMS__[\s\S]*?};/, '')), '/a2-export: 下载物含 http(s) 外部 URL');

  // 独立打开下载物：真正的验收是它在没有 Studio 的时候也能 boot。
  const exported = await openFile(browser, out, { width: 960, height: 540, dpr: 1 });
  try {
    await exported.page.waitForFunction(
      () => globalThis.__preview?.snapshot?.().frames > 8,
      null,
      { timeout: 20000 },
    );
    const state = await exported.page.evaluate(() => ({
      state: globalThis.__preview.snapshot().state,
      frames: globalThis.__preview.snapshot().frames,
      order: globalThis.__preview.snapshot().order,
      error: document.getElementById('boot-error')?.textContent ?? '',
      dbg: getComputedStyle(document.getElementById('dbg')).display,
      params: globalThis.__EMBEDDED_PARAMS__ ?? null,
    }));
    check(state.state !== 'failed' && state.error === '', `/a2-export: 独立打开 state=${state.state} error=${state.error}`);
    check(state.frames > 8, `/a2-export: 独立打开只跑了 ${state.frames} 帧`);
    check(state.dbg === 'none', `/a2-export: 导出物默认调试条=${state.dbg}（应 none）`);
    check(state.params && state.params.clean === '1', `/a2-export: 导出参数=${JSON.stringify(state.params)}`);
    check(state.order.includes('abyss'), `/a2-export: order=${state.order}`);
    await screenshot(exported.page, path.join(evidence, 'a2-export-running.png'));
    console.log(`a2-export: ${html.length} B → state=${state.state} frames=${state.frames} params=${JSON.stringify(state.params)}`);
  } finally {
    await exported.close();
  }
} finally {
  await close();
}

if (failures.length === 0) {
  console.log(`a2-export: PASS ${checks}/${checks}`);
  process.exit(0);
}
console.error(`a2-export: FAIL ${failures.length}/${checks}`);
for (const failure of failures) console.error(`  - ${failure}`);
process.exit(1);
