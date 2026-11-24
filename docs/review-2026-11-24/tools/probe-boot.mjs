// 量「黑屏等待」：从导航开始到 body[data-state] 离开 booting 用了多久；期间页面给用户看了什么。
import { setTimeout as sleep } from 'node:timers/promises';
import { launch } from '../../docs/review-1124/../review-2026-11-24/tools/cdp.mjs';
const base = process.argv[2] ?? 'http://127.0.0.1:8097';
const pathName = process.argv[3] ?? '/still';
const gpu = process.argv[4] ?? 'default';
const args = process.argv[5] ? process.argv[5].split(';') : [];
const mode = process.argv[6] ?? 'desktop';
const s = await launch(mode === 'mobile' ? { width: 390, height: 844, dpr: 3, mobile: true, gpu, args } : { width: 1280, height: 720, dpr: 1, gpu, args });
try {
  const t0 = Date.now();
  await s.send('Page.navigate', { url: base + pathName });
  const samples = [];
  let leftBoot = null;
  let firstFrame = null;
  for (let i = 0; i < 240; i += 1) {
    await sleep(500);
    const v = await s.evaluate(`(() => { const h = globalThis.__site ?? globalThis.__preview; let sn = null; try { sn = h ? h.snapshot() : null; } catch {} return { state: document.body ? document.body.dataset.state : null, frames: sn ? sn.frames : -1, readiness: sn ? sn.readiness : null, fps: sn ? Math.round(sn.fps) : null }; })()`);
    if (firstFrame === null && v.frames >= 1) firstFrame = Date.now() - t0;
    if (i % 4 === 0 || v.state !== 'booting') samples.push({ t: Date.now() - t0, ...v });
    if (v.state && v.state !== 'booting') { leftBoot = Date.now() - t0; break; }
  }
  const shot = `_scratch/review-1124/spot/boot-${pathName.replace(/\//g, '')}-${gpu}-${args.join('_') || 'default'}-${mode}.jpg`;
  await s.shot(shot);
  const fps = await s.fps(2000);
  console.log(JSON.stringify({ leftBootMs: leftBoot, firstFrameMs: firstFrame, samples: samples.filter((x, i) => i < 6 || i > samples.length - 4), fps, errors: s.errors, browserWarnings: s.logs.filter((l) => l.level === 'warning').map((l) => l.text.slice(0, 160)), shot }, null, 2));
} finally { await s.close(); }
