// 单变量实验：/still 就绪后派发一次 resize 事件，看 #gl 画布像素尺寸与画面是否被破坏（验证「两个责任人写同一张画布尺寸」）。
import { setTimeout as sleep } from 'node:timers/promises';
import { launch } from './cdp.mjs';
const base = process.argv[2] ?? 'http://127.0.0.1:8097';
const s = await launch({ width: 1280, height: 720, dpr: 1 });
const read = `(() => { const c = document.getElementById('gl'); const sn = globalThis.__site.snapshot(); return { glPx: [c.width, c.height], css: [c.clientWidth, c.clientHeight], renderScale: sn.renderScale, lod: sn.lod, frames: sn.frames }; })()`;
try {
  const t0 = Date.now();
  await s.send('Page.navigate', { url: base + '/still' });
  let state = 'booting';
  while (Date.now() - t0 < 150000) { await sleep(500); state = await s.evaluate(`document.body ? document.body.dataset.state : null`); if (state && state !== 'booting') break; }
  await sleep(6000);
  const before = await s.evaluate(read);
  await s.shot('_scratch/review-1124/spot/still-resize-A-before.jpg');
  await s.evaluate(`window.dispatchEvent(new Event('resize'))`);
  await sleep(1500);
  const after = await s.evaluate(read);
  await s.shot('_scratch/review-1124/spot/still-resize-B-after.jpg');
  console.log(JSON.stringify({ leftBootMs: Date.now() - t0, state, before, after }, null, 2));
} finally { await s.close(); }
