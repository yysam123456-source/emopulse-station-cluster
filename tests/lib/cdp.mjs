// 评审取证驱动（只读）：无头 Edge + 原生 CDP。Node >= 22（内置 fetch / WebSocket），零依赖。
//
// 为什么要有它：本机（Windows）没有 playwright，`tests/lib/browser.mjs` 的 macOS 缓存路径走不通，
// 所以 `verify:site` / `verify:preview` / `shot` / `bench:*` 在这台机器上一条都跑不了。
// 本文件**不替代**那些门，只用于 2026-11-24 这轮评审取证；每张图都带 JSON 指标，能复核。
//
// 编程用法：
//   import { launch } from '../tools/cdp.mjs';
//   const s = await launch({ width: 1280, height: 720 });
//   const r = await s.goto('http://127.0.0.1:8093/hug');        // 等 __site / __preview 就绪
//   await s.shot('hug.jpg');                                      // 相对路径按 cwd 解析
//   console.log(JSON.stringify({ ...r, env: await s.env(), fps: await s.fps(), ...s.summary() }, null, 2));
//   await s.close();
//
// 命令行：
//   node cdp.mjs --url http://127.0.0.1:8093/hug --out hug.jpg [--w 1280] [--h 720] [--dpr 1] [--mobile]
//                [--settle 3000] [--query "a=1"] [--full] [--timeout 30000] [--probe "<就绪表达式>"]
//                [--eval "<表达式>"] [--click 640,360 ...可多次] [--click-text "按钮文字"] [--out2 after.jpg]
//   node cdp.mjs --sheet out.jpg --cols 3 --cell 640x360 -- "标题=图1.jpg" "标题2=图2.jpg"
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

// 不写死 Edge 路径：Windows/macOS/Linux + CI Chromium 都走这里。
// 仍可用 EDGE_PATH 覆盖（评审脚本沿用了这个名字）。
const BROWSER_CANDIDATES = [
  process.env.EDGE_PATH,
  process.env.CHROME_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
].filter(Boolean);
const EDGE = BROWSER_CANDIDATES.find((candidate) => existsSync(candidate)) || BROWSER_CANDIDATES[BROWSER_CANDIDATES.length - 1];
const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const KEY_CODES = { Escape: ['Escape', 27], Enter: ['Enter', 13], Tab: ['Tab', 9], ' ': ['Space', 32], ArrowLeft: ['ArrowLeft', 37], ArrowUp: ['ArrowUp', 38], ArrowRight: ['ArrowRight', 39], ArrowDown: ['ArrowDown', 40], Backspace: ['Backspace', 8] };
const CLICKABLE = 'a,button,input,select,textarea,[role="button"],[tabindex]:not([tabindex="-1"]),canvas,[onclick]';
const VISIBLE = `((el) => { const r = el.getBoundingClientRect(); const st = getComputedStyle(el);
  return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none' && Number(st.opacity) > 0.01 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth; })`;
const READY_PROBE = `(() => {
  try {
    const h = globalThis.__site ?? globalThis.__preview;
    if (!h || typeof h.snapshot !== 'function') return false;
    const s = h.snapshot();
    return s && s.frames >= FRAMES ? { ms: Math.round(performance.now()), snapshot: s } : false;
  } catch { return false; }
})()`;

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

const argText = (a) => (a ? (a.value !== undefined ? String(a.value) : a.description ?? a.unserializableValue ?? a.type ?? '') : '');

class Session {
  constructor(ws, options) {
    this.ws = ws;
    this.options = options;
    this.seq = 0;
    this.pending = new Map();
    this.console = [];
    this.errors = [];
    this.logs = [];
    this.requests = [];
    this.failed = [];
    this.dialogs = [];
    this.loadWaiters = [];
    this.bytes = 0;
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== undefined) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(`${message.error.message} (code ${message.error.code})`));
        else pending.resolve(message.result);
        return;
      }
      try {
        this.onEvent(message.method, message.params);
      } catch { /* 事件解析失败不影响取证 */ }
    });
  }

  onEvent(method, params) {
    if (method === 'Runtime.consoleAPICalled') {
      const text = params.args.map(argText).join(' ');
      this.console.push({ type: params.type, text });
      if (params.type === 'error') this.errors.push(`console.error: ${text}`);
      if (params.type === 'assert') this.errors.push(`console.assert: ${text}`);
    } else if (method === 'Runtime.exceptionThrown') {
      const d = params.exceptionDetails;
      this.errors.push(`pageerror: ${(d.exception?.description ?? d.text).split('\n').slice(0, 4).join(' | ')}`);
    } else if (method === 'Log.entryAdded') {
      this.logs.push({ level: params.entry.level, source: params.entry.source, text: params.entry.text, url: params.entry.url });
    } else if (method === 'Network.requestWillBeSent') {
      this.requests.push({ id: params.requestId, url: params.request.url, type: params.type, bytes: 0 });
    } else if (method === 'Network.loadingFinished') {
      const request = this.requests.findLast((x) => x.id === params.requestId);
      if (request) request.bytes += params.encodedDataLength;
      this.bytes += params.encodedDataLength;
    } else if (method === 'Network.loadingFailed') {
      const request = this.requests.findLast((x) => x.id === params.requestId);
      this.failed.push({ url: request?.url ?? params.requestId, error: params.errorText, canceled: Boolean(params.canceled) });
    } else if (method === 'Page.javascriptDialogOpening') {
      this.dialogs.push({ type: params.type, message: params.message });
      this.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
    } else if (method === 'Page.loadEventFired') {
      for (const resolve of this.loadWaiters.splice(0)) resolve();
    }
  }

  send(method, params = {}) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async init() {
    await this.send('Runtime.enable');
    await this.send('Page.enable');
    await this.send('Network.enable');
    await this.send('Log.enable');
    await this.send('Network.setCacheDisabled', { cacheDisabled: true });
    await this.setViewport(this.options.width, this.options.height, this.options.dpr, this.options.mobile);
  }

  /** 改视口；mobile=true 时同时开触摸模拟 + 移动 UA（站点若按触屏/UA 分支，会走移动路径）。 */
  async setViewport(width, height, dpr = 1, mobile = false) {
    this.options = { ...this.options, width, height, dpr, mobile };
    await this.send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: dpr, mobile, screenWidth: width, screenHeight: height,
    });
    await this.send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: mobile ? 5 : 1 });
    if (mobile) await this.send('Emulation.setUserAgentOverride', { userAgent: MOBILE_UA, platform: 'Linux armv81' });
  }

  /** 求值；表达式可以是字符串，也可以是函数（序列化后执行）。异常会抛出，不吞。 */
  async evaluate(expression, { awaitPromise = true } = {}) {
    const expressionText = typeof expression === 'function' ? `(${expression})()` : expression;
    const result = await this.send('Runtime.evaluate', { expression: expressionText, awaitPromise, returnByValue: true });
    if (result.exceptionDetails) {
      const d = result.exceptionDetails;
      throw new Error(`evaluate 抛错：${d.exception?.description ?? d.text}`);
    }
    return result.result.value;
  }

  /**
   * 导航并等就绪。默认等 `__site` / `__preview` 的 snapshot().frames >= frames；
   * 页面没有这两个句柄（索引页 / Studio / 模板）时，等 handleGraceMs 后按「load 完成」返回，ready=false。
   * readyExpr 可换成任意返回真值的表达式（ truthy 即就绪）。
   */
  async goto(url, { frames = 4, timeoutMs = 45000, readyExpr = null, handleGraceMs = 4000 } = {}) {
    this.console.length = 0;
    this.errors.length = 0;
    this.logs.length = 0;
    this.requests.length = 0;
    this.failed.length = 0;
    this.dialogs.length = 0;
    this.bytes = 0;
    const loaded = new Promise((resolve) => this.loadWaiters.push(resolve));
    const t0 = Date.now();
    await this.send('Page.navigate', { url });
    await Promise.race([loaded, sleep(timeoutMs)]);
    const loadMs = Date.now() - t0;
    const probe = readyExpr ?? READY_PROBE.replace('FRAMES', String(frames));
    let ready = null;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const value = await this.evaluate(probe);
      if (value) { ready = value === true ? { ms: Date.now() - t0 } : value; break; }
      if (!readyExpr && Date.now() - t0 - loadMs > handleGraceMs
        && !(await this.evaluate(`Boolean(globalThis.__site ?? globalThis.__preview)`))) break;
      await sleep(120);
    }
    return {
      url, loadMs, readyMs: ready?.ms ?? null, snapshot: ready?.snapshot ?? null,
      ready: Boolean(ready), wallMs: Date.now() - t0,
    };
  }

  /** 截图；默认 JPEG（评审证据够用且体积小）。fullPage=true 截整页。 */
  async shot(file, { format = 'jpeg', quality = 80, fullPage = false } = {}) {
    const params = { format };
    if (format === 'jpeg') params.quality = quality;
    if (fullPage) {
      const metrics = await this.send('Page.getLayoutMetrics');
      const size = metrics.cssContentSize ?? metrics.contentSize;
      params.clip = { x: 0, y: 0, width: Math.ceil(size.width), height: Math.min(Math.ceil(size.height), 12000), scale: 1 };
      params.captureBeyondViewport = true;
    }
    const { data } = await this.send('Page.captureScreenshot', params);
    const absolute = path.resolve(file);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, Buffer.from(data, 'base64'));
    return absolute;
  }

  async move(x, y, pressed = false) {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: pressed ? 'left' : 'none', buttons: pressed ? 1 : 0 });
  }
  async down(x, y) { await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 }); }
  async up(x, y) { await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 }); }
  async wheel(deltaY, x = this.options.width / 2, y = this.options.height / 2) {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY });
  }
  async press(key) {
    const [code, keyCode] = KEY_CODES[key] ?? [`Key${key.toUpperCase()}`, key.toUpperCase().charCodeAt(0)];
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode });
  }
  async typeText(text) { await this.send('Input.insertText', { text }); }
  async scroll(y) { await this.evaluate(`window.scrollTo(0, ${Number(y) || 0})`); }

  /** 按视口模式自动选鼠标或触摸：点一下。 */
  async tap(x, y, { holdMs = 70 } = {}) { await this.pointer(x, y, null, x, y, holdMs, 0); }
  /** 按住不放。 */
  async hold(x, y, ms) { await this.pointer(x, y, null, x, y, ms, 0); }
  /** 按下-拖动-松开。 */
  async drag(x1, y1, x2, y2, { steps = 20, durationMs = 800 } = {}) { await this.pointer(x1, y1, null, x2, y2, 30, durationMs, steps); }

  async pointer(x1, y1, _unused, x2, y2, holdMs, moveMs, steps = 20) {
    const touch = this.options.mobile;
    if (touch) await this.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y: y1, id: 1 }] });
    else {
      await this.move(x1, y1);
      await sleep(30);
      await this.down(x1, y1);
    }
    await sleep(holdMs);
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;
      if (touch) await this.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 1 }] });
      else await this.move(x, y, true);
      await sleep(moveMs / steps);
    }
    if (touch) await this.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    else await this.up(x2, y2);
  }

  /** 点文字匹配的第一个可见可点元素（按钮 / 链接 / [role=button] / [tabindex]）。点不到返回 null。 */
  async clickText(text) {
    const target = await this.evaluate(`(() => {
      const els = [...document.querySelectorAll('a,button,[role="button"],[tabindex]:not([tabindex="-1"]')].filter((el) => {
        if (!(${VISIBLE})(el)) return false;
        return (el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || '').includes(${JSON.stringify(text)});
      });
      if (!els.length) return null;
      const r = els[0].getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), text: (els[0].innerText || '').trim().replace(/\\s+/g, ' ').slice(0, 60) };
    })()`);
    if (!target) return null;
    await this.tap(target.x, target.y);
    return target;
  }

  /** 页面上看得见、点得着的东西（含坐标），用来找按钮在哪、有没有被挡住。 */
  async clickables() {
    return this.evaluate(`[...document.querySelectorAll(${JSON.stringify(CLICKABLE)})].map((el) => {
      const r = el.getBoundingClientRect(); const st = getComputedStyle(el);
      const label = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('placeholder') || '').trim().replace(/\\s+/g, ' ').slice(0, 90);
      return { tag: el.tagName.toLowerCase(), id: el.id || null, label, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
        inView: (${VISIBLE})(el), pointerEvents: st.pointerEvents, href: el.getAttribute('href'), disabled: Boolean(el.disabled) };
    }).filter((e) => e.inView)`);
  }

  /** 页面可见文字（innerText），用来核对用户到底读到了什么。 */
  async text(max = 1500) {
    return this.evaluate(`(document.body ? document.body.innerText : '').replace(/\\n{3,}/g, '\\n\\n').trim().slice(0, ${Number(max) || 1500})`);
  }

  /** 测 ms 毫秒内的 rAF 帧数 → fps。无头环境的数只能当「同机相对值」。 */
  async fps(ms = 2000) {
    return this.evaluate(`new Promise((resolve) => {
      let n = 0; const t0 = performance.now();
      const tick = () => { n += 1; const dt = performance.now() - t0; if (dt >= ${ms}) resolve({ frames: n, ms: Math.round(dt), fps: Math.round((n / dt) * 10000) / 10 }); else requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    })`);
  }

  /** 首屏时间与页面自报的渲染环境。 */
  async env() {
    return this.evaluate(`(() => {
      const nav = performance.getEntriesByType('navigation')[0] || {};
      const paint = Object.fromEntries(performance.getEntriesByType('paint').map((p) => [p.name, Math.round(p.startTime)]));
      const c = document.createElement('canvas');
      const gl2 = c.getContext('webgl2'); const gl = gl2 || c.getContext('webgl');
      let renderer = null;
      if (gl) { const ext = gl.getExtension('WEBGL_debug_renderer_info'); renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); }
      return {
        viewport: [innerWidth, innerHeight], dpr: devicePixelRatio, docHeight: document.documentElement.scrollHeight,
        webgl2: Boolean(gl2), webgl: Boolean(gl), renderer, webgpu: Boolean(navigator.gpu),
        maxTouchPoints: navigator.maxTouchPoints, cores: navigator.hardwareConcurrency, deviceMemory: navigator.deviceMemory,
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        domInteractive: Math.round(nav.domInteractive || 0), domContentLoaded: Math.round(nav.domContentLoadedEventEnd || 0), loadEventEnd: Math.round(nav.loadEventEnd || 0), paint,
      };
    })()`);
  }

  /** 麦克风 / 摄像头等权限：{ microphone: 'granted' | 'denied' | 'prompt' }。要在站点请求权限**之前**调。 */
  async permissions(map, origin) {
    for (const [name, setting] of Object.entries(map)) {
      await this.send('Browser.setPermission', { permission: { name }, setting, origin });
    }
  }

  /** 汇总：错误 / 告警 / 网络（请求数、字节数、外部域名）/ 弹窗。 */
  summary() {
    const hosts = {};
    for (const r of this.requests) {
      let host = '(other)';
      try { host = new URL(r.url).host || `(inline:${r.url.slice(0, 12)})`; } catch { /* data: / blob: 等 */ }
      if (r.url.startsWith('data:')) host = '(data)';
      hosts[host] = (hosts[host] ?? 0) + 1;
    }
    return {
      errors: [...this.errors],
      consoleWarnings: this.console.filter((c) => c.type === 'warning').map((c) => c.text),
      browserWarnings: this.logs.filter((l) => l.level === 'warning').map((l) => `${l.source}: ${l.text}`),
      network: { requests: this.requests.length, bytes: this.bytes, failed: this.failed.map((f) => `${f.error}${f.canceled ? ' (canceled)' : ''}: ${f.url.slice(0, 100)}`), hosts },
      dialogs: this.dialogs,
    };
  }
}

/**
 * 起一个无头 Edge。每个实例独立端口 + 独立 profile，互不打架；close() 会清 profile。
 * @param {{ width?: number, height?: number, dpr?: number, mobile?: boolean, gpu?: 'default'|'swiftshader', args?: string[] }} [options]
 */
export async function launch(options = {}) {
  const width = options.width ?? 1280;
  const height = options.height ?? 720;
  const dpr = options.dpr ?? 1;
  const mobile = Boolean(options.mobile);
  const port = await freePort();
  const profile = path.join(os.tmpdir(), `qa-review-${process.pid}-${port}`);
  const args = [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-sync', '--mute-audio',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    '--hide-crash-restore-bubble', '--allow-file-access-from-files',
    '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    ...(options.gpu === 'swiftshader'
      ? ['--use-angle=swiftshader', '--use-webgpu-adapter=swiftshader']
      : ['--use-angle=d3d11', '--enable-gpu']),
    ...(options.args ?? []),
    `--window-size=${width},${height}`,
    'about:blank',
  ];
  const proc = spawn(EDGE, args, { stdio: 'ignore' });
  let version = null;
  let target = null;
  for (let i = 0; i < 160 && !target; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (res.ok) {
        version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json().catch(() => null);
        target = (await res.json()).find((t) => t.type === 'page');
      }
    } catch { /* 还没起来 */ }
    if (!target) await sleep(150);
  }
  if (!target) {
    try { proc.kill(); } catch { /* 已退出 */ }
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* 可能仍被占 */ }
    throw new Error('Edge 的 CDP 端口没起来（24 秒内）');
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('CDP WebSocket 连接失败')), { once: true });
  });
  const session = new Session(ws, { width, height, dpr, mobile });
  await session.init();
  session.browser = { product: version?.Product ?? null, protocolVersion: version?.['Protocol-Version'] ?? null, port };

  /**
   * 把多张图拼成一张对照表（省得一张张翻）。cells: [{ title, file }]。
   * 注意：它会导航走当前页，请用单独的 session。
   */
  session.sheet = async (cells, out, { cols = 3, cellW = 640, cellH = 360, format = 'jpeg' } = {}) => {
    const gap = 8;
    const titleH = 30;
    const rows = Math.ceil(cells.length / cols);
    const html = `<!doctype html><meta charset="utf-8"><style>
      html,body{margin:0;background:#111;color:#eee;font:14px/1.4 system-ui,"Microsoft YaHei",sans-serif}
      .g{display:grid;grid-template-columns:repeat(${cols},${cellW}px);gap:${gap}px;padding:${gap}px}
      .c{position:relative;width:${cellW}px;height:${cellH + titleH}px;background:#000;overflow:hidden}
      .c img{width:${cellW}px;height:${cellH}px;object-fit:contain;display:block;background:#000}
      .c b{display:block;height:${titleH - 8}px;line-height:${titleH - 8}px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:4px 6px 0}
    </style><div class="g">${cells.map((c) => `<div class="c"><b>${String(c.title).replace(/</g, '&lt;')}</b><img src="${pathToFileURL(path.resolve(c.file)).href}"></div>`).join('')}</div>`;
    const tmp = path.join(os.tmpdir(), `qa-sheet-${process.pid}-${Date.now()}.html`);
    writeFileSync(tmp, html);
    const loaded = new Promise((resolve) => session.loadWaiters.push(resolve));
    await session.send('Page.navigate', { url: pathToFileURL(tmp).href });
    await Promise.race([loaded, sleep(10000)]);
    await session.evaluate(`Promise.all([...document.images].map((i) => i.decode().catch(() => null)))`);
    await session.send('Emulation.setDeviceMetricsOverride', {
      width: cols * cellW + (cols + 1) * gap, height: rows * (cellH + titleH) + (rows + 1) * gap, deviceScaleFactor: 1, mobile: false,
    });
    await sleep(200);
    const saved = await session.shot(out, { format });
    rmSync(tmp, { force: true });
    return saved;
  };

  session.close = async () => {
    // 先让浏览器自己收子进程：Browser.close 比只 taskkill 父进程可靠。
    try { await Promise.race([session.send('Browser.close'), sleep(2000)]); } catch { /* 已关 */ }
    try { ws.close(); } catch { /* 已关 */ }
    // Windows 上 Edge 会再拉一批子进程；只 kill 父进程会留下 msedge.exe 和 profile 锁。
    // 父进程先退出时 `/T` 会找不到树，所以再按唯一 profile 扫一遍命令行兜底。
    if (process.platform === 'win32' && proc.pid) {
      try { spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore', timeout: 8000 }); } catch { /* 已退出 */ }
      try {
        const needle = profile.replace(/'/g, "''");
        const ps = `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*${needle}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
        spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { stdio: 'ignore', timeout: 10000 });
      } catch { /* 没有可扫的 */ }
    } else {
      try { proc.kill(); } catch { /* 已退出 */ }
    }
    await sleep(800);
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* Windows 上偶尔占着，留给系统清理 */ }
  };
  return session;
}

/** CLI。 */
async function main() {
  const argv = process.argv.slice(2);
  const flag = (name, fallback) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
  };
  const num = (name, fallback) => Number(flag(name, fallback));

  const sheetAt = argv.indexOf('--sheet');
  if (sheetAt >= 0) {
    const out = argv[sheetAt + 1];
    const cells = [];
    for (let i = sheetAt + 2; i < argv.length; i += 1) {
      if (argv[i] === '--cols' || argv[i] === '--cell') { i += 1; continue; }
      if (argv[i].includes('=')) { const at = argv[i].indexOf('='); cells.push({ title: argv[i].slice(0, at), file: argv[i].slice(at + 1) }); }
    }
    const session = await launch();
    const cell = flag('cell', '640x360').split('x').map(Number);
    await session.sheet(cells, out, { cols: num('cols', 3), cellW: cell[0], cellH: cell[1] });
    console.log(JSON.stringify({ sheet: path.resolve(out), cells: cells.length }));
    await session.close();
    return;
  }

  const url = flag('url', null);
  if (!url) {
    console.error('用法见文件头注释：--url <地址> --out <图> [--w --h --dpr --mobile --settle --query --full --timeout --probe --eval --click x,y --click-text 文字 --out2]');
    process.exit(2);
  }
  const session = await launch({
    width: num('w', 1280), height: num('h', 720), dpr: num('dpr', 1), mobile: argv.includes('--mobile'), gpu: flag('gpu', 'default'),
  });
  let exitCode = 0;
  try {
    const query = flag('query', null);
    const nav = await session.goto(query ? `${url}${url.includes('?') ? '&' : '?'}${query}` : url, {
      timeoutMs: num('timeout', 45000), frames: num('frames', 4), readyExpr: flag('probe', null),
    });
    await sleep(num('settle', 2500));
    if (flag('out', null)) await session.shot(flag('out', null), { fullPage: argv.includes('--full'), format: flag('format', 'jpeg') });
    const env = await session.env();
    const fps = await session.fps(num('fps-ms', 1500));
    const evalResult = flag('eval', null) ? await session.evaluate(flag('eval', '')) : undefined;
    const clicked = [];
    for (let i = 0; i < argv.length; i += 1) {
      if (argv[i] === '--click' && argv[i + 1]) { const [x, y] = argv[i + 1].split(',').map(Number); await session.tap(x, y); clicked.push({ x, y }); await sleep(num('after-click', 1500)); }
      if (argv[i] === '--click-text' && argv[i + 1]) { clicked.push(await session.clickText(argv[i + 1])); await sleep(num('after-click', 1500)); }
    }
    if (clicked.length && flag('out2', null)) await session.shot(flag('out2', null), { format: flag('format', 'jpeg') });
    console.log(JSON.stringify({ nav, env, fps, eval: evalResult, clicked, snapshotAfter: clicked.length ? await session.evaluate(`(() => { const h = globalThis.__site ?? globalThis.__preview; try { return h ? h.snapshot() : null; } catch { return null; } })()`) : undefined, ...session.summary() }, null, 2));
    if (session.errors.length || (!nav.ready && flag('probe', null) !== '1')) exitCode = 1;
  } finally {
    await session.close();
  }
  process.exit(exitCode);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[cdp] 失败：${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    process.exit(1);
  });
}
