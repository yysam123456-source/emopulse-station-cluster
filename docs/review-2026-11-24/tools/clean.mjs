// 空闲机复测（等所有取证 worker 结束后再跑）：四站 + 5 模板 + Studio 的首屏时间 / 离开 booting 时间 / 空闲 fps。
// 用法：MSYS_NO_PATHCONV=1 node _scratch/review-1124/clean.mjs [http://127.0.0.1:8097]
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { launch } from './cdp.mjs';

const base = process.argv[2] ?? 'http://127.0.0.1:8097';
const targets = [
  ['/', 'index'], ['/license', 'site'], ['/hug', 'site'], ['/still', 'site'], ['/koi', 'site'],
  ['/templates/deepsea/', 'template'], ['/templates/nebula/', 'template'], ['/templates/koi/', 'template'], ['/templates/temple/', 'template'], ['/templates/gate/', 'template'],
  ['/studio/', 'studio'],
];
const modes = [
  ['desktop', { width: 1280, height: 720, dpr: 1 }],
  ['mobile', { width: 390, height: 844, dpr: 3, mobile: true }],
];
const PROBE = `(() => {
  const h = globalThis.__site ?? globalThis.__preview;
  let sn = null; try { sn = h ? h.snapshot() : null; } catch {}
  return { state: document.body ? (document.body.dataset.state ?? null) : null, frames: sn ? sn.frames : -1, has: Boolean(h) };
})()`;

const onlyPath = process.argv[3] ?? null;
const onlyMode = process.argv[4] ?? null;
const rows = [];
for (const [label, opts] of modes) {
  if (onlyMode && label !== onlyMode) continue;
  for (const [pathName, kind] of targets) {
    if (onlyPath && pathName !== onlyPath) continue;
    const s = await launch(opts);
    const row = { mode: label, path: pathName, kind };
    try {
      const t0 = Date.now();
      await s.send('Page.navigate', { url: base + pathName });
      let firstFrameMs = null;
      let leftBootMs = null;
      for (let i = 0; i < 300; i += 1) {
        await sleep(200);
        const v = await s.evaluate(PROBE);
        if (firstFrameMs === null && v.frames >= 1) firstFrameMs = Date.now() - t0;
        if (v.state && v.state !== 'booting') { leftBootMs = Date.now() - t0; break; }
        if (!v.state && firstFrameMs !== null) break; // 没有 data-state 的页面：首帧即视为可看
        if (!v.state && !v.has && Date.now() - t0 > 4000) break; // 入口页 / Studio：没有句柄也没有 data-state，load 后 4 秒即记
      }
      row.firstFrameMs = firstFrameMs;
      row.leftBootMs = leftBootMs;
      await sleep(leftBootMs === null ? 3000 : 5000);
      const env = await s.env();
      const fps = await s.fps(3000);
      const snap = await s.evaluate(`(() => { const h = globalThis.__site ?? globalThis.__preview; try { return h ? h.snapshot() : null; } catch { return null; } })()`);
      Object.assign(row, {
        fcp: env.paint['first-contentful-paint'] ?? null, loadEventEnd: env.loadEventEnd, domContentLoaded: env.domContentLoaded,
        fps: fps.fps, frames3s: fps.frames, renderer: env.renderer, webgpu: env.webgpu, viewport: env.viewport.join('x') + '@' + env.dpr,
        state: snap?.state ?? null, lod: snap?.lod ?? null, renderScale: snap?.renderScale ?? null, degraded: (snap?.degraded ?? []).map((d) => `${d.id}:${d.reason}`),
        errors: s.errors, warnings: s.console.filter((c) => c.type === 'warning').length + s.logs.filter((l) => l.level === 'warning').length, bytes: s.bytes, hosts: Object.keys(s.summary().network.hosts),
      });
    } catch (error) {
      row.error = String((error && error.message) || error);
    } finally {
      await s.close();
    }
    rows.push(row);
    console.log([row.mode, row.path, `firstFrame=${row.firstFrameMs}`, `leftBoot=${row.leftBootMs}`, `fcp=${row.fcp}`, `fps=${row.fps}`, `state=${row.state}`, `errors=${(row.errors ?? []).length}`, row.error ? `ERROR=${String(row.error).slice(0, 300)}` : ''].join('  '));
  }
}
mkdirSync('docs/review-2026-11-24/metrics', { recursive: true });
writeFileSync('docs/review-2026-11-24/metrics/clean-metrics.json', JSON.stringify({ measuredAt: new Date().toISOString(), base, rows }, null, 2));
