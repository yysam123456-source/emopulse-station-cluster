// /hug 40s 慢变量门：40s 后背景光位左移并变暗，必须在画面上量得到，而不是只看代码。
// 判据：顶部右侧网格内至少一格的平均 L* 变化 ≥3；整幅帧不要求全亮/全暗。
import path from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { launch, openFile, waitForPreview, screenshot, REPO_ROOT } from './lib/browser.mjs';

const failures = [];
let checks = 0;
const check = (ok, msg) => { checks += 1; if (!ok) failures.push(msg); };
const evidence = path.join(REPO_ROOT, 'docs', 'evidence', 'plan-2026-11-25');
mkdirSync(evidence, { recursive: true });

const file = path.join(REPO_ROOT, 'dist', 'hug', 'index.html');
if (!existsSync(file)) { console.error('[hug-long-stay] 缺产物：先跑 npm run build:sites'); process.exit(1); }

const { browser, close } = await launch({ headless: true });
try {
  const session = await openFile(browser, file, { width: 1280, height: 720, dpr: 2 });
  const { page } = session;
  try {
    await waitForPreview(page, { frames: 40, timeoutMs: 60000 });
    await page.waitForTimeout(2000);
    const shot = async () => (await page.screenshot({ scale: 'css' })).toString('base64');
    const grid = (a, b) => page.evaluate(async ({ a, b }) => {
      const load = (b64) => new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = 'data:image/png;base64,' + b64; });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      const ca = new OffscreenCanvas(ia.width, ia.height).getContext('2d'); ca.drawImage(ia, 0, 0);
      const cb = new OffscreenCanvas(ib.width, ib.height).getContext('2d'); cb.drawImage(ib, 0, 0);
      const da = ca.getImageData(0, 0, ia.width, ia.height).data;
      const db = cb.getImageData(0, 0, ib.width, ib.height).data;
      const srgb = (v) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
      const L = (r, g, b) => { const Y = 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b); return Y > 216 / 24389 ? 116 * Math.cbrt(Y) - 16 : (24389 / 27) * Y; };
      const cells = [];
      // 顶部 65% 的右侧 45%：避开正文/CTA，覆盖太阳光晕；裁掉最外 2px 边框噪声。
      const x0 = Math.floor(ia.width * 0.55); const x1 = Math.floor(ia.width * 0.98);
      const y0 = Math.floor(ia.height * 0.02); const y1 = Math.floor(ia.height * 0.65);
      const cols = 4; const rows = 3;
      for (let ry = 0; ry < rows; ry += 1) {
        for (let rx = 0; rx < cols; rx += 1) {
          const x = Math.floor(x0 + (x1 - x0) * rx / cols);
          const y = Math.floor(y0 + (y1 - y0) * ry / rows);
          const w = Math.max(1, Math.floor((x1 - x0) / cols));
          const h = Math.max(1, Math.floor((y1 - y0) / rows));
          let sa = 0; let sb = 0; let n = 0;
          for (let yy = y; yy < Math.min(y + h, ia.height); yy += 1) {
            for (let xx = x; xx < Math.min(x + w, ia.width); xx += 1) {
              const i = (yy * ia.width + xx) * 4;
              sa += L(da[i], da[i + 1], da[i + 2]); sb += L(db[i], db[i + 1], db[i + 2]); n += 1;
            }
          }
          cells.push({ rx, ry, before: +(sa / n).toFixed(2), after: +(sb / n).toFixed(2), delta: +((sb - sa) / n).toFixed(2) });
        }
      }
      return cells;
    }, { a, b });

    const a = await shot();
    await page.waitForTimeout(62000);
    const b = await shot();
    await screenshot(page, path.join(evidence, 'hug-long-62s.png'));
    const cells = await grid(a, b);
    const maxAbs = Math.max(...cells.map((c) => Math.abs(c.delta)));
    const darkest = cells.reduce((p, c) => (c.delta < p.delta ? c : p), cells[0]);
    check(maxAbs >= 3, `40s 后顶部右侧无格子的 L* 变化 ≥3（最大 ${maxAbs.toFixed(2)}）—— 慢变量在代码里，但画面看不出来`);
    check(darkest.delta <= -1.5, `40s 后没有明显变暗的格子（最暗格 ${darkest.delta} L*）—— 光只移动没有下落`);

    console.log(`hug-long-stay: 顶部右侧 ${cells.length} 格，最大 |ΔL*| ${maxAbs.toFixed(2)}`);
    console.log(`  最暗 ${darkest.before} → ${darkest.after}（${darkest.delta} L*）`);
  } finally {
    await session.close();
  }
} finally {
  await close();
}

if (failures.length === 0) {
  console.log(`hug-long-stay: PASS ${checks}/${checks}`);
  process.exit(0);
}
console.error(`hug-long-stay: FAIL ${failures.length}/${checks}`);
for (const f of failures) console.error(`  - ${f}`);
process.exit(1);
