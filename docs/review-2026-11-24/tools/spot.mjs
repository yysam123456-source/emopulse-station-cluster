// 主理人自己的抽查：四站桌面 + 手机首屏，各存一张图 + 指标，再拼两张对照表。
import { writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { launch } from './cdp.mjs';

const base = process.argv[2] ?? 'http://127.0.0.1:8097';
const out = '_scratch/review-1124/spot';
const pages = (process.argv[3] ?? 'license,hug,still,koi').split(',');
const modes = [
  ['desktop', { width: 1280, height: 720, dpr: 1 }],
  ['mobile', { width: 390, height: 844, dpr: 2, mobile: true }],
];
const results = {};
const cells = [];
for (const [label, opts] of modes) {
  for (const p of pages) {
    const s = await launch(opts);
    try {
      const nav = await s.goto(`${base}/${p}`, { frames: 60, timeoutMs: 60000 });
      await sleep(3000);
      const file = `${out}/${p}-${label}.jpg`;
      await s.shot(file);
      const env = await s.env();
      const fps = await s.fps(2000);
      results[`${p}-${label}`] = { nav, env, fps, ...s.summary(), text: await s.text() };
      cells.push({ title: `${p} ${label}`, file });
    } catch (e) {
      results[`${p}-${label}`] = { error: String((e && e.stack) || e) };
    } finally {
      await s.close();
    }
  }
}
if (cells.some((c) => c.title.endsWith('desktop'))) {
  const d = await launch();
  await d.sheet(cells.filter((c) => c.title.endsWith('desktop')), `${out}/sheet-desktop.jpg`, { cols: 2, cellW: 960, cellH: 540 });
  await d.close();
}
if (cells.some((c) => c.title.endsWith('mobile'))) {
  const m = await launch();
  await m.sheet(cells.filter((c) => c.title.endsWith('mobile')), `${out}/sheet-mobile.jpg`, { cols: 4, cellW: 390, cellH: 844 });
  await m.close();
}
writeFileSync(`${out}/spot.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.error ? v : {
  ready: v.nav.ready, readyMs: v.nav.readyMs, state: v.nav.snapshot?.state, degraded: v.nav.snapshot?.degraded,
  fps: v.fps?.fps, errors: v.errors, warnings: v.consoleWarnings.length + v.browserWarnings.length,
  viewport: v.env?.viewport, docHeight: v.env?.docHeight, bytes: v.network.bytes, hosts: v.network.hosts,
}])), null, 2));
