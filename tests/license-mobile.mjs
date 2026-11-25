// P0-6 / M2 门：/license 在 390×844 上盖章后不得重叠，二级动作不得小于 12px，
// 保存必须给可见反馈。
//
// 这不是“看起来还行”的截图门：它量 DOM 矩形与计算字号；截图只作为证据。
// 用法：node tests/license-mobile.mjs
import path from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { launch, openFile, screenshot, REPO_ROOT } from './lib/browser.mjs';

const failures = [];
let checks = 0;
const check = (ok, msg) => { checks += 1; if (!ok) failures.push(msg); };
const evidence = path.join(REPO_ROOT, 'docs', 'evidence', 'plan-2026-11-25');
mkdirSync(evidence, { recursive: true });

const file = path.join(REPO_ROOT, 'dist', 'license', 'index.html');
if (!existsSync(file)) {
  console.error('[license-mobile] 缺产物：先跑 npm run build:sites');
  process.exit(1);
}

const { browser, close } = await launch({ headless: true });
try {
  const { page } = await openFile(browser, file, { width: 390, height: 844, dpr: 1 });
  await page.waitForTimeout(1200);
  await page.click('#cta');
  await page.waitForFunction(
    () => document.getElementById('stage-word')?.dataset.stage === 'approved',
    null,
    { timeout: 20000 },
  );
  await page.waitForTimeout(400);

  const layout = await page.evaluate(() => {
    const ids = ['save', 'play-hint', 'stage-word', 'cert-seal-sub', 'again', 'fold'];
    const nodes = {};
    for (const id of ids) {
      const el = document.getElementById(id);
      if (!el) { nodes[id] = null; continue; }
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      nodes[id] = {
        hidden: el.hidden || st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) < 0.01,
        rect: { x: r.x, y: r.y, w: r.width, h: r.height },
        font: st.fontSize,
        color: st.color,
        text: (el.textContent ?? '').trim().slice(0, 40),
      };
    }
    const visible = Object.fromEntries(Object.entries(nodes).filter(([, n]) => n && !n.hidden));
    return { nodes, visible, viewport: [innerWidth, innerHeight] };
  });

  const overlap = (a, b) => {
    const x = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const y = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return x > 2 && y > 2;
  };
  const pairs = [['save', 'play-hint'], ['save', 'stage-word'], ['stage-word', 'cert-seal-sub'], ['stage-word', 'again'], ['stage-word', 'fold']];
  for (const [a, b] of pairs) {
    const va = layout.visible[a];
    const vb = layout.visible[b];
    if (va && vb) check(!overlap(va.rect, vb.rect), `/license: #${a} 与 #${b} 重叠`);
  }
  for (const [id, node] of Object.entries(layout.visible)) {
    check(node.rect.x >= -1 && node.rect.y >= -1 && node.rect.x + node.rect.w <= layout.viewport[0] + 1 && node.rect.y + node.rect.h <= layout.viewport[1] + 1,
      `/license: #${id} 超出视口 ${JSON.stringify(node.rect)}`);
    check(parseFloat(node.font) >= 12, `/license: #${id} 字号 ${node.font} < 12px（二级文字可读性门）`);
  }
  check(layout.nodes.save?.text !== '', '/license: #save 没有文案');
  check(layout.nodes['stage-word']?.text === 'approved', `/license: 终态词=${layout.nodes['stage-word']?.text}`);
  const viewport = await page.evaluate(() => document.querySelector('meta[name="viewport"]')?.content ?? '');
  check(/user-scalable=no/i.test(viewport) && /maximum-scale=1/i.test(viewport), `/license: viewport 未禁页面缩放：${viewport}`);

  await screenshot(page, path.join(evidence, 'license-mobile-approved.png'));

  // 保存反馈：按钮原位变成 Saved.，并且不是只改 aria。
  await page.click('#save');
  await page.waitForTimeout(120);
  const saved = await page.evaluate(() => ({
    text: document.getElementById('save')?.textContent ?? '',
    disabled: document.getElementById('save')?.disabled,
  }));
  check(/Saved/i.test(saved.text), `/license: 点 Save 后按钮文案=${JSON.stringify(saved.text)}`);
  check(saved.disabled === true, `/license: 点 Save 后按钮未进入短暂禁用态（用户会重复点）`);

  console.log(`license-mobile（${layout.viewport.join('×')}）`);
  for (const [id, node] of Object.entries(layout.visible)) {
    console.log(`  #${id.padEnd(14)} font=${node.font.padEnd(6)} rect=${JSON.stringify(node.rect)} text=${JSON.stringify(node.text)}`);
  }
  console.log(`  save feedback=${JSON.stringify(saved)}`);
} finally {
  await close();
}

if (failures.length === 0) {
  console.log(`license-mobile: PASS ${checks}/${checks}`);
  process.exit(0);
}
console.error(`license-mobile: FAIL ${failures.length}/${checks}`);
for (const failure of failures) console.error(`  - ${failure}`);
process.exit(1);
