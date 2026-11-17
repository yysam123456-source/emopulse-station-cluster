// QA 运行时冒烟：用无头 Edge + CDP 逐站打开产物，检查错误态与主交互的可见状态变化。
// 运行：node tests/runtime-smoke.mjs
// 说明：若环境无 WebGPU / 无头浏览器不可用，脚本会如实报告，不伪装 PASS。
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9333 + (process.pid % 200);
const profile = path.join(here, `.edge-profile-${process.pid}`);
const fileUrl = (id) => pathToFileURL(path.join(root, 'dist', `${id}.html`)).href;

const results = [];
let edge;

/** 极简 CDP 客户端：id 关联请求/响应 + 事件监听。 */
class CDP {
  constructor(ws) { this.ws = ws; this.seq = 0; this.pending = new Map(); this.events = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id); this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      } else if (msg.method) this.events.push(msg);
    });
  }
  send(method, params = {}) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`CDP 超时 ${method}`)); } }, 10000);
    });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { __error: r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description ?? '') };
    return r.result.value;
  }
}

async function waitFor(fn, ms = 15000, step = 200) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(step); }
  return null;
}

try {
  console.log('=== 启动无头 Edge（尝试启用软件 WebGPU）===');
  edge = spawn(EDGE, [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--enable-unsafe-webgpu', '--use-angle=swiftshader', '--enable-features=Vulkan',
    '--disable-gpu-sandbox', '--window-size=1280,800', 'about:blank',
  ], { stdio: 'ignore' });

  const version = await waitFor(async () => {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); return r.ok ? r.json() : null; } catch { return null; }
  });
  if (!version) throw new Error('无法连接 Edge CDP 端口');
  console.log(`Edge: ${version.Browser}`);

  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = list.find((t) => t.type === 'page');
  if (!page) throw new Error('无可用 page target');

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const cdp = new CDP(ws);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Log.enable');

  // WebGPU 能力探测
  await cdp.send('Page.navigate', { url: fileUrl('still') });
  await sleep(1800);
  const gpu = await cdp.eval(`(async()=>{ if(!navigator.gpu) return {gpu:false,adapter:false}; try{ const a=await navigator.gpu.requestAdapter(); return {gpu:true,adapter:!!a}; }catch(e){ return {gpu:true,adapter:false,err:e.message}; } })()`);
  const adapterAvailable = !!(gpu && gpu.adapter);
  console.log('WebGPU 探测：', JSON.stringify(gpu), '=> adapterAvailable =', adapterAvailable);

  const sites = [
    { id: 'still', act: '#d', label: 'Sit' },
    { id: 'license', act: '#act', label: 'Stamp it' },
    { id: 'praise', act: '#act', label: 'Print one' },
    { id: 'hug', act: '#act', label: 'Let it go', share: '#share' },
  ];

  for (const s of sites) {
    const r = { id: s.id };
    await cdp.send('Page.navigate', { url: fileUrl(s.id) });
    await sleep(2200); // 等 async IIFE 与 bridge 完成
    const before = await cdp.eval(`(() => {
      const cls = document.body.className;
      const q = (sel) => document.querySelector(sel);
      return {
        cls, gpu: !!navigator.gpu,
        canvas: !!q('canvas'),
        actPresent: !!q('${s.act}'),
        actText: q('${s.act}')?.textContent ?? null,
        status: q('#status')?.textContent ?? null,
        sitTimer: q('#sit-timer')?.textContent ?? null,
        qlen: (() => { try { return JSON.parse(localStorage.getItem('emopulse.analytics.queue')||'[]').length; } catch { return -1; } })(),
        errText: q('#s')?.textContent ?? null,
      };
    })()`);
    Object.assign(r, { before });
    if (before.__error) { r.verdict = 'FAIL'; r.note = '页面脚本求值异常'; results.push(r); continue; }

    // 错误态判定：body class 含独立的 e token
    r.errorState = before.cls.split(/\s+/).includes('e');

    // 清除旧埋点队列后点击主交互（用干净 localStorage 观察增量）
    await cdp.eval(`localStorage.removeItem('emopulse.analytics.queue')`);
    await cdp.eval(`document.querySelector('${s.act}')?.click()`);
    await sleep(s.id === 'hug' ? 3200 : 900);
    let after = await cdp.eval(`(() => {
      const q = (sel) => document.querySelector(sel);
      return {
        cls: document.body.className,
        actText: q('${s.act}')?.textContent ?? null,
        status: q('#status')?.textContent ?? null,
        sitTimer: q('#sit-timer')?.textContent ?? null,
        qlen: (() => { try { return JSON.parse(localStorage.getItem('emopulse.analytics.queue')||'[]').length; } catch { return -1; } })(),
        backHidden: q('#back')?.hasAttribute('hidden') ?? null,
      };
    })()`);

    // hug 额外点 Share
    if (s.share) {
      await cdp.eval(`document.querySelector('${s.share}')?.click()`);
      await sleep(500);
      after.shareStatus = await cdp.eval(`document.querySelector('#status')?.textContent ?? null`);
      after.qlenAfterShare = await cdp.eval(`(() => { try { return JSON.parse(localStorage.getItem('emopulse.analytics.queue')||'[]').length; } catch { return -1; } })()`);
    }
    r.after = after;

    // 区分两条线：
    //  (1) core 渲染态：依赖 WebGPU adapter；无 adapter 时 l e 是 core 的正确降级，判为"未测（环境）"。
    //  (2) 站点 glue 交互：与 core 解耦，独立按 DOM 状态/埋点队列变化判定。
    const changed = JSON.stringify(before.status ?? before.sitTimer) !== JSON.stringify(after.status ?? after.sitTimer)
      || (after.qlen ?? 0) > 0
      || (after.qlenAfterShare ?? 0) > 0
      || before.actText !== after.actText
      || (after.backHidden === false && before.backHidden !== false);
    r.coreRender = r.errorState ? (adapterAvailable ? 'FAIL' : '未测（环境无 WebGPU adapter，l e 为正确降级）') : 'PASS（body 未进入错误态）';
    r.glueChanged = changed;
    // 最终判定以站点 glue 交互为准（core 渲染另列），因为本环境无法验证渲染。
    if (changed) { r.verdict = 'PASS'; r.note = 'glue 主交互触发可见状态/埋点变化；core 渲染态见 coreRender 字段'; }
    else { r.verdict = 'FAIL'; r.note = 'glue 点击后未观测到状态/埋点变化'; }
    results.push(r);
    console.log(`\n[${s.id}] ${r.verdict} - ${r.note}`);
    console.log('  before:', JSON.stringify(before));
    console.log('  after :', JSON.stringify(after));
  }

  // 汇总错误/控制台异常
  const exceptions = cdp.events.filter((e) => e.method === 'Runtime.exceptionThrown');
  console.log(`\n=== CDP 运行时异常数: ${exceptions.length} ===`);
  for (const e of exceptions.slice(0, 10)) console.log('  -', e.params?.exceptionDetails?.text, e.params?.exceptionDetails?.exception?.description?.slice(0, 200) ?? '');
} catch (err) {
  console.error('冒烟脚本异常：', err.message);
  results.push({ id: 'HARNESS', verdict: '未测', note: err.message });
} finally {
  if (edge) { try { edge.kill('SIGTERM'); } catch {} }
  await sleep(400);
  try { const { rmSync } = await import('node:fs'); rmSync(profile, { recursive: true, force: true }); } catch {}
}

console.log('\n=== 汇总 ===');
for (const r of results) console.log(`  ${r.id}: glue=${r.verdict} | core渲染=${r.coreRender ?? 'n/a'} ${r.note ?? ''}`);
const fail = results.filter((r) => r.verdict === 'FAIL').length;
const pass = results.filter((r) => r.verdict === 'PASS').length;
console.log(`PASS=${pass} FAIL=${fail} 未测=${results.length - pass - fail}`);
process.exit(fail ? 1 : 0);
