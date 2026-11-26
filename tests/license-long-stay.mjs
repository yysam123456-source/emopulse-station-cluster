// /license G7 像素门：40s 单向慢变量必须在纸面上量得到，而不是只读 CSS 变量。
// 判据：光角单调右移 ≥8°；纸面内至少有一块 ≥3 L* 的差异，且这种像素占比 ≥0.1%。
import path from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { launch, openFile, waitForPreview, screenshot, REPO_ROOT } from './lib/browser.mjs';

const failures = [];
let checks = 0;
const check = (ok, msg) => { checks += 1; if (!ok) failures.push(msg); };
const evidence = path.join(REPO_ROOT, 'docs', 'evidence', 'plan-2026-11-25');
mkdirSync(evidence, { recursive: true });

const file = path.join(REPO_ROOT, 'dist', 'license', 'index.html');
if (!existsSync(file)) { console.error('[license-long-stay] 缺产物：先跑 npm run build:sites'); process.exit(1); }

const { browser, close } = await launch({ headless: true });
try {
  const session = await openFile(browser, file, { width: 1280, height: 720, dpr: 2 });
  const { page } = session;
  try {
    await waitForPreview(page, { frames: 8 });
    await page.waitForTimeout(1800);
    const rect = await page.evaluate(() => {
      const r = document.getElementById('sheet').getBoundingClientRect();
      return { x: Math.round(r.x) + 8, y: Math.round(r.y) + 8, w: Math.round(r.width) - 16, h: Math.round(r.height) - 16 };
    });
    const readAngle = () => page.evaluate(() => document.body.style.getPropertyValue('--sun-angle').trim());
    const shot = async () => (await page.screenshot({ scale: 'css' })).toString('base64');
    const metrics = (a, b, rect) => page.evaluate(async ({ a, b, rect }) => {
      const load = (b64) => new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = 'data:image/png;base64,' + b64; });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      const ca = new OffscreenCanvas(ia.width, ia.height).getContext('2d'); ca.drawImage(ia, 0, 0);
      const cb = new OffscreenCanvas(ib.width, ib.height).getContext('2d'); cb.drawImage(ib, 0, 0);
      const da = ca.getImageData(rect.x, rect.y, rect.w, rect.h).data;
      const db = cb.getImageData(rect.x, rect.y, rect.w, rect.h).data;
      const srgb = (v) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
      const L = (r, g, b) => { const Y = 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b); return Y > 216 / 24389 ? 116 * Math.cbrt(Y) - 16 : (24389 / 27) * Y; };
      let sumAbs = 0; let n = 0; let over3 = 0; let max = 0;
      for (let i = 0; i < da.length; i += 4) {
        const d = Math.abs(L(db[i], db[i + 1], db[i + 2]) - L(da[i], da[i + 1], da[i + 2]));
        sumAbs += d; n += 1; if (d >= 3) over3 += 1; if (d > max) max = d;
      }
      return { meanAbs: +(sumAbs / n).toFixed(2), over3Pct: +(over3 / n * 100).toFixed(2), max: +max.toFixed(2), n };
    }, { a, b, rect });

    const a1 = await readAngle();
    const s1 = await shot();
    await page.waitForTimeout(40000);
    const a2 = await readAngle();
    const s2 = await shot();
    await screenshot(page, path.join(evidence, 'license-long-40s.png'));

    const delta = parseFloat(a2) - parseFloat(a1);
    const m = await metrics(s1, s2, rect);
    check(delta >= 8, `40s 光角只变了 ${delta.toFixed(2)}°（${a1} → ${a2}），需 ≥8°`);
    check(m.max >= 3, `40s 纸面最大 L* 差 ${m.max}，需 ≥3 L* —— 变量在走，但像素看不出来`);
    check(m.over3Pct >= 0.1, `40s ≥3 L* 的像素只占 ${m.over3Pct}%，需 ≥0.1% —— 差异太孤立`);

    console.log(`license-long-stay: 光角 ${a1} → ${a2}（Δ${delta.toFixed(2)}°）`);
    console.log(`  纸面 40s 差：平均绝对值 ${m.meanAbs} L* · 最大 ${m.max} L* · ≥3 L* 像素 ${m.over3Pct}%`);
  } finally {
    await session.close();
  }
} finally {
  await close();
}

if (failures.length === 0) {
  console.log(`license-long-stay: PASS ${checks}/${checks}`);
  process.exit(0);
}
console.error(`license-long-stay: FAIL ${failures.length}/${checks}`);
for (const f of failures) console.error(`  - ${f}`);
process.exit(1);
