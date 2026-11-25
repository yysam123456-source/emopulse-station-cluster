// A2 P1 门：运行期参数 / 画质消息 / Studio 平台阈值 / 默认无调试条。
//
// 这不是“Studio 长得对”的截图门：它直接量 __preview.stage 的替换、renderScale、
// 文档标记是否仍在（证明没有重载），以及 Toy/Standalone 两档徽章。
// 用法：node tests/a2-studio.mjs
import path from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { launch, openFile, screenshot, REPO_ROOT } from './lib/browser.mjs';

const failures = [];
let checks = 0;
const check = (ok, msg) => { checks += 1; if (!ok) failures.push(msg); };
const evidence = path.join(REPO_ROOT, 'docs', 'evidence', 'plan-2026-11-25');
mkdirSync(evidence, { recursive: true });

const template = path.join(REPO_ROOT, 'dist', 'templates', 'deepsea', 'index.html');
const studio = path.join(REPO_ROOT, 'dist', 'studio', 'index.html');
if (!existsSync(template) || !existsSync(studio)) {
  console.error('[a2-studio] 缺产物：先跑 npm run build:templates && npm run build:studio');
  process.exit(1);
}

const { browser, close } = await launch({ headless: true });
try {
  const { page } = await openFile(browser, template, { width: 960, height: 540, dpr: 1, query: { clean: '1' } });
  await page.waitForFunction(() => globalThis.__preview?.snapshot?.().frames > 8, null, { timeout: 20000 });
  const before = await page.evaluate(() => {
    const p = globalThis.__preview;
    const dbg = document.getElementById('dbg');
    return {
      frames: p.snapshot().frames,
      state: p.snapshot().state,
      order: p.snapshot().order,
      renderScale: p.stage.stats.renderScale,
      dbgDisplay: dbg ? getComputedStyle(dbg).display : 'missing',
      marker: globalThis.__marker ?? null,
    };
  });
  check(before.order.includes('abyss'), `/a2: deepsea order=${before.order}`);
  check(before.dbgDisplay === 'none', `/a2: 默认调试条 display=${before.dbgDisplay}（应 none）`);
  check(before.frames > 8, `/a2: 首屏只跑了 ${before.frames} 帧`);

  // 文档标记：如果参数消息导致整页重载，这个变量会消失。
  const marker = await page.evaluate(() => {
    globalThis.__marker = 'still-the-same-document';
    globalThis.__stageBefore = globalThis.__preview.stage;
    globalThis.__preview.stage.setRenderScale(1);
    return globalThis.__preview.stage.stats.renderScale;
  });
  check(marker === 1, `/a2: high 档 renderScale=${marker}`);
  await screenshot(page, path.join(evidence, 'a2-deepsea-default.png'));

  await page.evaluate(() => {
    window.postMessage({ type: 'params', values: { palette: 'tide', density: 1.55, rays: 0.9, caustics: 0.75 } }, '*');
  });
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => {
    const p = globalThis.__preview;
    return {
      ref: p.stage,
      frames: p.snapshot().frames,
      state: p.snapshot().state,
      marker: globalThis.__marker ?? null,
      stageSame: p.stage === globalThis.__stageBefore,
      q: location.search,
    };
  });
  check(after.marker === 'still-the-same-document', `/a2: 参数消息后文档标记消失（发生了整页重载）`);
  check(!after.stageSame, '/a2: 参数消息后 stage 没有被重建');
  check(after.frames > 8, `/a2: 重建后只跑了 ${after.frames} 帧`);
  check(locationSearchIncludes(after.q, 'clean=1'), `/a2: 重建后 location.search=${after.q}`);
  await page.waitForTimeout(800);
  await screenshot(page, path.join(evidence, 'a2-deepsea-params.png'));

  await page.evaluate(() => {
    window.postMessage({ type: 'quality', value: 'low' }, '*');
  });
  await page.waitForTimeout(500);
  const quality = await page.evaluate(() => globalThis.__preview.stage.stats.renderScale);
  check(Math.abs(quality - 0.7) < 0.02, `/a2: quality=low 后 renderScale=${quality}（应 0.70）`);

  // Studio：平台阈值是 UI 态，不是构建期硬编码；切档必须改徽章。
  const studioSession = await openFile(browser, studio, { width: 1280, height: 900, dpr: 1 });
  try {
    const s = studioSession.page;
    await s.waitForTimeout(500);
    const initial = await s.evaluate(() => {
      const cards = [...document.querySelectorAll('.card')];
      const pick = (name) => {
        const card = cards.find((c) => c.querySelector('h2')?.textContent === name);
        return card ? {
          badge: card.querySelector('.badge')?.textContent ?? '',
          over: card.querySelector('.badge')?.classList.contains('over') ?? false,
          meta: card.querySelector('.meta')?.textContent ?? '',
          src: card.querySelector('iframe')?.getAttribute('src') ?? '',
        } : null;
      };
      return {
        platform: document.getElementById('platform')?.value,
        temple: pick('晨光山门与主殿'),
        deepsea: pick('深海信标'),
        iframes: document.querySelectorAll('iframe').length,
      };
    });
    check(initial.platform === 'toy', `/a2: Studio 初始平台=${initial.platform}`);
    check(initial.temple?.over === true, `/a2: temple 在 Toy 档未红（${initial.temple?.badge}）`);
    check(initial.deepsea?.over === false, `/a2: deepsea 在 Toy 档误红（${initial.deepsea?.badge}）`);
    check(initial.iframes === 5, `/a2: Studio iframe 数=${initial.iframes}（应 5）`);
    check(!initial.deepsea?.src.includes('debug=1'), `/a2: Studio 预览 src 带 debug=1：${initial.deepsea?.src}`);

    await s.evaluate(() => {
      const select = document.getElementById('platform');
      select.value = 'standalone';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await s.waitForTimeout(150);
    const standalone = await s.evaluate(() => {
      const cards = [...document.querySelectorAll('.card')];
      const card = cards.find((c) => c.querySelector('h2')?.textContent === '晨光山门与主殿');
      const badge = card?.querySelector('.badge');
      return { over: badge?.classList.contains('over') ?? null, badge: badge?.textContent ?? '', limitText: card?.querySelector('.meta')?.textContent ?? '' };
    });
    check(standalone.over === false, `/a2: temple 在 Standalone 档仍红（${standalone.badge}）`);
    check(/limit 5120 KB/.test(standalone.limitText), `/a2: Standalone 档 limit 文案=${standalone.limitText}`);
    await screenshot(s, path.join(evidence, 'a2-studio-standalone.png'));
  } finally {
    await studioSession.close();
  }

  console.log(`a2-studio: ${checks} checks; deepsea order=${before.order.join(' -> ')} frames=${after.frames}; quality=${quality}`);
} finally {
  await close();
}

function locationSearchIncludes(search, token) {
  return String(search).includes(token);
}

if (failures.length === 0) {
  console.log(`a2-studio: PASS ${checks}/${checks}`);
  process.exit(0);
}
console.error(`a2-studio: FAIL ${failures.length}/${checks}`);
for (const failure of failures) console.error(`  - ${failure}`);
process.exit(1);
