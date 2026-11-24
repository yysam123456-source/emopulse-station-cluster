// 定位 /still 手机「画面只画在左上角」：读两张画布的像素尺寸 / CSS 尺寸 / 内联 style，对照 snapshot。
import { setTimeout as sleep } from 'node:timers/promises';
import { launch } from './cdp.mjs';
const base = process.argv[2] ?? 'http://127.0.0.1:8097';
const mode = process.argv[3] ?? 'mobile';
const s = await launch(mode === 'mobile' ? { width: 390, height: 844, dpr: 3, mobile: true } : { width: 1280, height: 720, dpr: 1 });
try {
  const t0 = Date.now();
  await s.send('Page.navigate', { url: base + '/still' });
  let state = 'booting';
  while (Date.now() - t0 < 150000) {
    await sleep(500);
    state = await s.evaluate(`document.body ? document.body.dataset.state : null`);
    if (state && state !== 'booting') break;
  }
  await sleep(4000);
  const info = await s.evaluate(`(() => {
    const pick = (c) => { const r = c.getBoundingClientRect(); return { id: c.id, px: [c.width, c.height], css: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], styleAttr: c.getAttribute('style'), ctx: Object.keys(c).filter((k) => /webgpu|gl|context/i.test(k)).slice(0, 4) }; };
    const h = globalThis.__site; const sn = h.snapshot();
    return { dpr: devicePixelRatio, inner: [innerWidth, innerHeight], doc: [document.documentElement.clientWidth, document.documentElement.clientHeight], screen: [screen.width, screen.height], vv: [visualViewport.width, visualViewport.height, visualViewport.scale], canvases: [...document.querySelectorAll('canvas')].map(pick), renderScale: sn.renderScale, lod: sn.lod, degraded: sn.degraded.map((d) => d.id + ':' + d.reason) };
  })()`);
  await s.shot(`_scratch/review-1124/spot/still-geom-${mode}.jpg`);
  console.log(JSON.stringify({ leftBootMs: Date.now() - t0, state, ...info }, null, 2));
} finally { await s.close(); }
