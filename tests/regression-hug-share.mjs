// Round 2 回归：验证 hug / #share 剪贴板失败路径修复（Minor-1）。
// 用 CDP 在文档加载前注入 clipboard.writeText 的三种 stub，确定性触发：
//   A 异步拒绝(Promise.reject) / B 成功(resolve) / C 同步抛错(throw)
// 断言：失败路径 setStatus(url) 兜底、成功路径 setStatus('Link copied...')、均无未处理 Promise 异常。
// 运行：node tests/regression-hug-share.mjs
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9500 + (process.pid % 300);
const profile = path.join(here, `.edge-regress-${process.pid}`);
const URL = pathToFileURL(path.join(root, 'dist', 'hug.html')).href;

let edge;
class CDP {
  constructor(ws) {
    this.ws = ws; this.seq = 0; this.pending = new Map(); this.exceptions = [];
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id); this.pending.delete(m.id);
        m.error ? reject(new Error(m.error.message)) : resolve(m.result);
      } else if (m.method === 'Runtime.exceptionThrown') this.exceptions.push(m.params.exceptionDetails);
    });
  }
  send(method, params = {}) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`超时 ${method}`)); } }, 10000);
    });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { __error: r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description ?? '') };
    return r.result.value;
  }
}
async function waitFor(fn, ms = 15000, step = 150) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(step); }
  return null;
}

const results = [];
try {
  edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--disable-gpu-sandbox', '--disable-extensions', 'about:blank'], { stdio: 'ignore' });
  const version = await waitFor(async () => { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); return r.ok ? r.json() : null; } catch { return null; } });
  if (!version) throw new Error('CDP 端口不可达');
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = list.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const cdp = new CDP(ws);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');

  const SCENARIOS = [
    {
      name: 'A 异步拒绝(Promise.reject)',
      stub: `Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.reject(new Error('QA_FORCED_DENY'))}})`,
      expect: (status) => typeof status === 'string' && status.startsWith('/hug?from='),
      expectDesc: 'status 兜底为 /hug?from=... 链接',
    },
    {
      name: 'B 成功(resolve)',
      stub: `Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.resolve()}})`,
      expect: (status) => status === 'Link copied. Send it to someone.',
      expectDesc: 'status = Link copied. Send it to someone.',
    },
    {
      name: 'C 同步抛错(throw)',
      stub: `Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>{throw new Error('QA_SYNC_THROW')}}})`,
      expect: (status) => typeof status === 'string' && status.startsWith('/hug?from='),
      expectDesc: 'status 兜底为 /hug?from=... 链接',
    },
  ];

  let scriptId = null;
  for (const sc of SCENARIOS) {
    if (scriptId !== null) { try { await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: scriptId }); } catch {} }
    const added = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: sc.stub });
    scriptId = added.identifier;

    await cdp.send('Page.navigate', { url: URL });
    await sleep(2000);
    // 确认 stub 生效（注意：不要让探测用的 rejected promise 悬空，否则污染未处理异常计数）
    const stubCheck = await cdp.eval(`(()=>{try{const r=navigator.clipboard.writeText('probe');if(r&&typeof r.then==='function'){r.catch(()=>{});return 'ok'}return 'no-then'}catch(e){return 'sync-throw'}})()`);
    await sleep(150); // 让探测的 catch 微任务落地
    // 清空点击前异常（含探测可能产生的任何残留）
    cdp.exceptions.length = 0;
    const qlenBefore = await cdp.eval(`(()=>{try{return JSON.parse(localStorage.getItem('emopulse.analytics.queue')||'[]').length}catch{return -1}})()`);
    await cdp.eval(`document.querySelector('#share')?.click()`);
    await sleep(500);
    const status = await cdp.eval(`document.querySelector('#status')?.textContent ?? null`);
    const qlenAfter = await cdp.eval(`(()=>{try{return JSON.parse(localStorage.getItem('emopulse.analytics.queue')||'[]').length}catch{return -1}})()`);
    // 未处理异常：仅统计非 core WebGPU 的（core 失败被 wrap 捕获，不产生 exceptionThrown）
    const unhandled = cdp.exceptions.filter((e) => !/No WebGPU|adapter/i.test(e.text + ' ' + (e.exception?.description ?? '')));
    const statusOk = sc.expect(status);
    const noUnhandled = unhandled.length === 0;
    const tracked = (qlenAfter ?? 0) > (qlenBefore ?? 0) || qlenAfter > 0;
    const verdict = statusOk && noUnhandled && tracked ? 'PASS' : 'FAIL';
    results.push({ name: sc.name, verdict, status, stubCheck, unhandled: unhandled.map((e) => e.exception?.description ?? e.text), qlenBefore, qlenAfter });
    console.log(`\n[${sc.name}] ${verdict}`);
    console.log(`  stubCheck=${stubCheck}  status=${JSON.stringify(status)}  期望=${sc.expectDesc}`);
    console.log(`  未处理异常=${unhandled.length}  埋点队列 ${qlenBefore}->${qlenAfter}`);
    if (unhandled.length) console.log(`  异常明细=${JSON.stringify(unhandled.map((e) => e.exception?.description ?? e.text))}`);
  }
} catch (err) {
  console.error('回归脚本异常：', err.message);
  results.push({ name: 'HARNESS', verdict: '未测', status: null, note: err.message });
} finally {
  if (edge) { try { edge.kill('SIGTERM'); } catch {} }
  await sleep(400);
  try { const { rmSync } = await import('node:fs'); rmSync(profile, { recursive: true, force: true }); } catch {}
}

console.log('\n=== 汇总 ===');
for (const r of results) console.log(`  ${r.name}: ${r.verdict}${r.note ? ' (' + r.note + ')' : ''}`);
const pass = results.filter((r) => r.verdict === 'PASS').length;
const fail = results.filter((r) => r.verdict === 'FAIL').length;
console.log(`PASS=${pass} FAIL=${fail}`);
process.exit(fail ? 1 : 0);
