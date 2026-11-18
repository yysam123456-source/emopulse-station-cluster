// costMs 实测：Stage 契约要求「实测，不接受估计值」。
//
// Node 里没有 WebGPU，所以这里用本机 Edge（headless + SwiftShader 软件后端）跑一个最小页：
// 直接驱动 part.create/draw，绕开 stage，只测「画一帧」的耗时。
//
// 用法：
//   node shared/parts/voxel-world/bench.mjs             # 90 帧，640×360，lod=low
//   node shared/parts/voxel-world/bench.mjs --frames 30 --w 1280 --h 720 --lod high
// 本机没有 Edge/WebGPU 时打印「需浏览器环境」并以 0 退出（不是失败）。
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '..', '..', '..');

/** 常见 Windows 浏览器路径（不装依赖，只用系统已有的）。 */
const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
];

/**
 * @param {string} name 参数名
 * @param {string} fallback 缺省值
 * @returns {string}
 */
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const FRAMES = Number(arg('frames', '90'));
const WIDTH = Number(arg('w', '640'));
const HEIGHT = Number(arg('h', '360'));
const LOD = arg('lod', 'low');
const TIMEOUT_MS = Number(arg('timeout', '900')) * 1000;

const browser = BROWSERS.find((p) => existsSync(p));
if (!browser) {
  console.log('需浏览器环境：本机未找到 Edge/Chrome，Node 无法创建 WebGPU 设备。');
  console.log('（costMs 见 README 的实测记录；有浏览器时直接重跑本脚本即可复现。）');
  process.exit(0);
}

// 把零件 + 一个最小驱动打成 IIFE（内存里，不落盘）
const source = `
import part, { voxelTelemetry } from ${JSON.stringify(path.join(here, 'index.ts').replace(/\\/g, '/'))};
const W = ${WIDTH}, H = ${HEIGHT}, LOD = ${JSON.stringify(LOD)}, N = ${FRAMES};
const canvas = document.createElement('canvas');
canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%';
document.body.appendChild(canvas);
const inst = part.create({ canvas, ctx: null, width: W, height: H, dpr: 1, seed: 7, biome: 'tide', lod: LOD });
const frame = (t) => ({ t, dt: 1/60, seed: 7, pointer: { x: .5, y: .5, vx: 0, vy: 0, down: false }, audio: null, biome: 'tide', reducedMotion: false, size: { w: W, h: H, dpr: 1 } });
const done = (result) => { window.__BENCH__ = result; window.__BENCH_DONE__ = true; };
(async () => {
  const t0 = performance.now();
  while (!voxelTelemetry().ready && !voxelTelemetry().error) {
    if (performance.now() - t0 > ${Math.round(TIMEOUT_MS * 0.8)}) { done({ error: 'boot timeout at ' + voxelTelemetry().progress }); return; }
    await new Promise((r) => setTimeout(r, 250));
  }
  if (voxelTelemetry().error) { done({ error: voxelTelemetry().error }); return; }
  let t = 0;
  for (let i = 0; i < 12; i++) { t += 1/60; inst.draw(frame(t)); await new Promise(requestAnimationFrame); }
  const cpu = [];
  for (let i = 0; i < N; i++) {
    t += 1/60;
    const s = performance.now();
    inst.draw(frame(t));
    cpu.push(performance.now() - s);
    await new Promise(requestAnimationFrame);
  }
  cpu.sort((a, b) => a - b);
  const tel = voxelTelemetry();
  done({ frames: N, cpuP50: cpu[(N * 0.5) | 0], cpuP90: cpu[(N * 0.9) | 0], bootMs: tel.bootMs, drawMs: tel.drawMs, render: tel.render, progress: tel.progress, ua: navigator.userAgent });
})().catch((e) => done({ error: String(e && e.message || e) }));
`;

const bundle = await build({
  stdin: { contents: source, resolveDir: REPO, loader: 'ts', sourcefile: 'voxel-bench.ts' },
  bundle: true,
  format: 'iife',
  target: 'es2022',
  write: false,
  logLevel: 'error',
  legalComments: 'none',
});
const js = bundle.outputFiles[0].text;
const html = `<!doctype html><meta charset=utf-8><style>html,body{margin:0;height:100%;background:#000}</style><body><script>${js}</script>`;

const server = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(html);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;

const port = 9800;
const profile = `C:/Users/Lenovo/AppData/Local/Temp/qa-voxel-bench-${port}`;
const edge = spawn(browser, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--disable-gpu-sandbox', '--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader',
  `--window-size=${WIDTH},${HEIGHT}`, 'about:blank',
], { stdio: 'ignore' });

let ws;
try {
  let target = null;
  for (let i = 0; i < 80 && !target; i += 1) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (r.ok) target = (await r.json()).find((t) => t.type === 'page');
    } catch { /* 端口还没起来 */ }
    if (!target) await sleep(150);
  }
  if (!target) throw new Error('CDP 端口没起来');

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  let seq = 0;
  const pending = new Map();
  const pageErrors = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') {
      pageErrors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      pageErrors.push('console.error: ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
    }
  });
  const send = (method, params = {}) => new Promise((resolveSend, rejectSend) => {
    const id = ++seq;
    const timer = setTimeout(() => { pending.delete(id); rejectSend(new Error(`CDP ${method} 30s 无响应（渲染进程可能被同步任务卡死）`)); }, 30000);
    pending.set(id, (v) => { clearTimeout(timer); resolveSend(v); });
    ws.send(JSON.stringify({ id, method, params }));
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url });

  const t0 = Date.now();
  let result = null;
  while (Date.now() - t0 < TIMEOUT_MS) {
    await sleep(1000);
    const r = await send('Runtime.evaluate', { expression: 'window.__BENCH__ || null', returnByValue: true });
    if (r.result?.value) { result = r.result.value; break; }
    const probe = await send('Runtime.evaluate', {
      expression: 'window.__BENCH_TICK__ || (document.body ? document.body.childElementCount + " children" : "no body")',
      returnByValue: true,
    });
    console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] waiting · ${probe.result?.value} · errors=${pageErrors.length}`);
  }

  if (!result) {
    console.error(`超时：${TIMEOUT_MS / 1000}s 内没有结果`);
    for (const e of pageErrors.slice(0, 5)) console.error('page:', e.split('\n')[0]);
    process.exitCode = 1;
  } else if (result.error) {
    console.error(`bench 失败：${result.error}`);
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify({
      lod: LOD,
      viewport: `${WIDTH}x${HEIGHT}@dpr1`,
      frames: result.frames,
      cpuP50Ms: Number(result.cpuP50.toFixed(2)),
      cpuP90Ms: Number(result.cpuP90.toFixed(2)),
      bootMs: Math.round(result.bootMs),
      renderSize: result.render && `${result.render.w}x${result.render.h}`,
      qualityLevel: result.render && result.render.level,
      backend: 'headless Edge + SwiftShader（软件光栅器）',
    }, null, 2));
  }
} finally {
  try { ws?.close(); } catch { /* ignore */ }
  edge.kill('SIGTERM');
  server.close();
}
