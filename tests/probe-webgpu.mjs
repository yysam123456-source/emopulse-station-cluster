// 探测：不同无头 Edge 启动参数下能否拿到 WebGPU adapter（软件后端）。
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const COMBOS = [
  ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader'],
  ['--enable-unsafe-webgpu', '--enable-dawn-features=allow_unsafe_apis', '--use-angle=swiftshader'],
  ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=vulkan'],
];
let i = 0;
for (const extra of COMBOS) {
  const port = 9400 + i++;
  const profile = `C:/Users/Lenovo/AppData/Local/Temp/qa-wgpu-${port}`;
  let edge;
  try {
    edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
      '--no-first-run', '--disable-gpu-sandbox', 'about:blank', ...extra], { stdio: 'ignore' });
    let v = null;
    for (let t = 0; t < 50 && !v; t++) { try { const r = await fetch(`http://127.0.0.1:${port}/json/version`); if (r.ok) v = await r.json(); } catch {} if (!v) await sleep(150); }
    if (!v) { console.log(extra.join(' '), '=> 无法连接'); continue; }
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
    let seq = 0; const pending = new Map();
    ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
    const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
    await send('Page.navigate', { url: 'about:blank' });
    await sleep(400);
    const r = await send('Runtime.evaluate', { expression: `(async()=>{ if(!navigator.gpu) return 'no navigator.gpu'; try{ const a = await navigator.gpu.requestAdapter(); return a ? 'ADAPTER OK' : 'adapter null'; }catch(e){ return 'err '+e.message; } })()`, returnByValue: true, awaitPromise: true });
    console.log(extra.join(' '), '=>', r.result?.value ?? JSON.stringify(r));
    ws.close();
  } catch (e) { console.log(extra.join(' '), '=> 异常', e.message); }
  finally { if (edge) edge.kill('SIGTERM'); await sleep(300); }
}
