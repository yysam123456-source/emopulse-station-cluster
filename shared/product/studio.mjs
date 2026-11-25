// Studio 生成器（产品化第三层）。
//
// 它不跑运行时、不依赖服务器：读 `dist/templates/manifest.json`，生成一个
// `dist/studio/index.html`，每个模板一张卡：参数控件 + iframe 预览 + 独立页/下载。
//
// 参数通过 query 传给模板：零件在 create 时读 `?palette=&density=...`。
// 构建期 `opts` 是默认值，query 是现场调参；两者同时存在时 query 优先。
//
// 用法：
//   node shared/product/build-templates.mjs
//   node shared/product/studio.mjs
//   # 打开 dist/studio/index.html
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const MANIFEST = path.join(REPO_ROOT, 'dist', 'templates', 'manifest.json');
const OUT_DIR = path.join(REPO_ROOT, 'dist', 'studio');
const OUT = path.join(OUT_DIR, 'index.html');

function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

function readManifest() {
  if (!existsSync(MANIFEST)) {
    console.error(`[studio] 缺少 ${path.relative(REPO_ROOT, MANIFEST)}，先跑 node shared/product/build-templates.mjs`);
    process.exitCode = 1;
    return null;
  }
  return JSON.parse(readFileSync(MANIFEST, 'utf8'));
}

function render() {
  const manifest = readManifest();
  if (!manifest) return;
  const templates = (manifest.templates ?? []).filter((t) => t.status === 'ready');
  if (templates.length === 0) {
    console.error('[studio] manifest 里没有 ready 模板');
    process.exitCode = 1;
    return;
  }

  // 防止 manifest 里的字符串提前闭合 <script>；模板名是我们自己写的，但仍然按数据转义。
  const payload = JSON.stringify(templates).replaceAll('<', '\\u003c');
  const generatedAt = esc(manifest.generatedAt ?? '');

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Stage Templates · Studio</title>
<style>
  :root{--bg:#07090d;--panel:#0e131b;--line:#202a38;--ink:#dce7f5;--muted:#7d8da3;--accent:#65e0c8;--warm:#ffbd6b}
  *{box-sizing:border-box}
  html,body{margin:0;background:var(--bg);color:var(--ink);font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
  body{padding:28px 30px 60px}
  header{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;border-bottom:1px solid var(--line);padding-bottom:18px;margin-bottom:24px}
  h1{margin:0;font:400 34px/1.1 Georgia,"Times New Roman",serif;letter-spacing:.02em}
  header p{margin:0;color:var(--muted);max-width:560px;text-align:right}
  .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px}
  .card{border:1px solid var(--line);background:linear-gradient(180deg,#101722,#0b1017);border-radius:14px;overflow:hidden}
  .card-head{padding:16px 18px 12px;display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
  .card h2{margin:0;font:400 22px/1.25 Georgia,"Times New Roman",serif}
  .meta{color:var(--muted);font-size:11px;line-height:1.6;margin-top:5px}
  .badge{font-size:10px;letter-spacing:.08em;color:var(--accent);border:1px solid #2b5f55;border-radius:999px;padding:4px 8px;white-space:nowrap}
  .badge.over{color:#ff8b8b;border-color:#7a2a2a;background:rgba(120,20,20,.18)}
  .badge.warn{color:var(--warm);border-color:#6b4a24}
  #quality,#platform{background:#0a0f16;color:var(--ink);border:1px solid var(--line);border-radius:7px;padding:6px 8px;font:12px ui-monospace,Menlo,monospace}
  .frame{position:relative;aspect-ratio:16/9;background:#040609;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
  iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:#040609}
  .controls{padding:12px 18px 16px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 14px}
  .control{display:flex;flex-direction:column;gap:4px;min-width:0}
  .control label{color:var(--muted);font-size:10px;letter-spacing:.05em;text-transform:uppercase}
  .control input[type=range]{accent-color:var(--accent);width:100%}
  .control select,.control input[type=number]{background:#0a0f16;color:var(--ink);border:1px solid var(--line);border-radius:7px;padding:6px 8px;font:12px ui-monospace,Menlo,monospace}
  .control .row{display:flex;align-items:center;gap:8px}
  .control .row output{color:var(--accent);font-size:11px;min-width:38px;text-align:right}
  .actions{display:flex;gap:10px;flex-wrap:wrap;padding:0 18px 16px}
  a,.btn{color:var(--ink);border:1px solid var(--line);background:#111923;border-radius:8px;padding:7px 10px;text-decoration:none;font:11px ui-monospace,Menlo,monospace;cursor:pointer}
  a:hover,.btn:hover{border-color:#3b5268;background:#162231}
  .ok{color:var(--accent)}
  .warn{color:var(--warm)}
  footer{margin-top:30px;color:var(--muted);font-size:11px;line-height:1.7}
  @media(max-width:960px){.grid{grid-template-columns:1fr}header{display:block}header p{text-align:left;margin-top:10px}}
</style>
</head>
<body>
<header>
  <div>
    <h1>Stage Templates · Studio</h1>
    <div class="meta">${templates.length} 个模板 · 单 HTML · 零外部请求 · 参数走 query</div>
  </div>
  <div class="meta" style="text-align:right">
    <label for="platform">Platform </label>
    <select id="platform" aria-label="Platform budget">
      <option value="toy">Toy · 1 MB</option>
      <option value="standalone">Standalone · 5 MB</option>
    </select>
    <label for="quality">Quality </label>
    <select id="quality" aria-label="Quality">
      <option value="high">High</option>
      <option value="normal">Normal</option>
      <option value="low">Low</option>
    </select>
    <p style="margin:8px 0 0">第一层：templates.mjs 注册 / 第二层：build-templates.mjs 构建与体积门 / 第三层：这个 Studio。生成于 ${generatedAt}</p>
  </div>
</header>
<main class="grid" id="grid"></main>
<footer>
  参数控件只改 query，不重写构建产物；要固化默认值，改 <code>shared/product/templates.mjs</code> 后重跑构建。<br>
  独立页打开的是 <code>dist/templates/&lt;id&gt;/index.html</code>；iframe 与它同源，无服务器也能用。
</footer>
<script>
const TEMPLATES = ${payload};
const INITIAL_PLATFORM = ${JSON.stringify(manifest.platform || 'toy')};
const grid = document.getElementById('grid');
const quality = document.getElementById('quality');
const platform = document.getElementById('platform');
let qualityValue = quality?.value || 'high';
let platformValue = INITIAL_PLATFORM;
if (platform) platform.value = INITIAL_PLATFORM;
const LIMITS = { toy: 1048576, standalone: 5 * 1048576 };
const badgeUpdaters = [];
const frames = [];

function queryFor(t, values) {
  const q = new URLSearchParams();
  for (const p of t.params) {
    const v = values[p.key];
    if (v === undefined || v === null) continue;
    if (p.type === 'boolean') q.set(p.key, v ? '1' : '0');
    else q.set(p.key, String(v));
  }
  // 产品模板默认隐藏调试条；画质是 Studio 的全局选择。
  q.set('clean', '1');
  q.set('quality', qualityValue);
  return q.toString();
}

for (const t of TEMPLATES) {
  const values = Object.fromEntries(t.params.map((p) => [p.key, p.default]));
  const card = document.createElement('section');
  card.className = 'card';

  const head = document.createElement('div');
  head.className = 'card-head';
  const headCopy = document.createElement('div');
  const title = document.createElement('h2');
  title.textContent = t.name;
  const meta = document.createElement('div');
  meta.className = 'meta';
  headCopy.append(title, meta);
  const badge = document.createElement('span');
  badge.className = 'badge';
  head.append(headCopy, badge);

  const updateBadge = () => {
    const limit = LIMITS[platformValue] || LIMITS.toy;
    const over = t.gzipBytes > limit;
    meta.innerHTML = t.id + ' · preset ' + t.preset + ' · ' + (t.bytes / 1024).toFixed(1) + ' KB / gzip ' + (t.gzipBytes / 1024).toFixed(1) + ' KB · limit ' + (limit / 1024).toFixed(0) + ' KB<br>' + t.parts.join(' + ');
    badge.className = 'badge ' + (over ? 'over' : '');
    badge.textContent = (over ? 'OVER BUDGET · ' : '') + (t.hasGl ? 'GL' : '2D') + ' · READY';
  };
  updateBadge();
  badgeUpdaters.push(updateBadge);

  const frame = document.createElement('div');
  frame.className = 'frame';
  const iframe = document.createElement('iframe');
  iframe.loading = 'lazy';
  iframe.title = t.name + ' preview';
  frame.appendChild(iframe);

  const controls = document.createElement('div');
  controls.className = 'controls';
  let update = () => {};

  for (const p of t.params) {
    const wrap = document.createElement('div');
    wrap.className = 'control';
    const label = document.createElement('label');
    label.textContent = p.label + ' · ' + p.key;
    wrap.appendChild(label);

    if (p.type === 'enum') {
      const select = document.createElement('select');
      for (const v of p.values ?? []) {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = v;
        if (v === values[p.key]) opt.selected = true;
        select.appendChild(opt);
      }
      select.addEventListener('change', () => { values[p.key] = select.value; update(); });
      wrap.appendChild(select);
    } else if (p.type === 'boolean') {
      const row = document.createElement('div');
      row.className = 'row';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = Boolean(values[p.key]);
      input.addEventListener('change', () => { values[p.key] = input.checked; update(); });
      const text = document.createElement('span');
      text.className = 'meta';
      text.textContent = '开关';
      row.append(input, text);
      wrap.appendChild(row);
    } else {
      const row = document.createElement('div');
      row.className = 'row';
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(p.min ?? 0);
      input.max = String(p.max ?? 1);
      input.step = String(p.step ?? 0.05);
      input.value = String(values[p.key]);
      const output = document.createElement('output');
      output.textContent = String(values[p.key]);
      input.addEventListener('input', () => {
        values[p.key] = Number(input.value);
        output.textContent = input.value;
        // 拖动只更新读数；change 才提交一次参数，避免每像素都重建零件。
      });
      input.addEventListener('change', () => { update(); });
      row.append(input, output);
      wrap.appendChild(row);
    }
    controls.appendChild(wrap);
  }

  const actions = document.createElement('div');
  actions.className = 'actions';
  const open = document.createElement('a');
  open.textContent = '打开独立页';
  open.target = '_blank';
  open.rel = 'noopener';
  const exportBtn = document.createElement('button');
  exportBtn.className = 'btn';
  exportBtn.textContent = '导出单 HTML';
  const reset = document.createElement('button');
  reset.className = 'btn';
  reset.textContent = '重置参数';
  reset.addEventListener('click', () => {
    for (const p of t.params) values[p.key] = p.default;
    // 重新渲染控件最省事：直接重载 Studio 页面，保持同一套模板数据。
    location.reload();
  });
  const note = document.createElement('span');
  note.className = 'meta';
  note.textContent = '参数防抖 250ms，postMessage 重建零件；Quality 对全部模板生效';
  actions.append(open, exportBtn, reset, note);

  // 导出：把当前参数**写死进单 HTML**，打开时不需要 Studio、也不发任何请求。
  // 不用 data: URL，因为 >2 MB 的 temple/gate 在部分浏览器会被截断；用 Blob 下载。
  exportBtn.addEventListener('click', async () => {
    exportBtn.disabled = true;
    const original = exportBtn.textContent;
    exportBtn.textContent = '导出中…';
    try {
      let html;
      try {
        const res = await fetch(t.url + '?' + queryFor(t, values), { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        html = await res.text();
      } catch (fetchError) {
        // file:// 直接打开 Studio 时 fetch 被浏览器拦；向 iframe 要它自己的 outerHTML。
        // 渲染后的 DOM 会连同 boot 脚本一起回来，参数再由下面的 shim 内嵌。
        if (!frameReady) throw fetchError;
        html = await new Promise((resolve, reject) => {
          const timer = window.setTimeout(() => {
            window.removeEventListener('message', onHtml);
            reject(new Error('iframe 序列化超时'));
          }, 3000);
          const onHtml = (event) => {
            if (event.source !== iframe.contentWindow) return;
            if (!event.data || event.data.type !== 'exportHtml' || typeof event.data.html !== 'string') return;
            window.clearTimeout(timer);
            window.removeEventListener('message', onHtml);
            resolve(event.data.html);
          };
          window.addEventListener('message', onHtml);
          iframe.contentWindow?.postMessage({ type: 'requestHtml' }, '*');
        });
      }
      const embedded = Object.assign({}, values, { quality: qualityValue, clean: '1' });
      // 把参数变成「下载文件自己的 query」：预览宿主/零件读 location.search 时，
      // 由这个极小的 URLSearchParams 垫片把 __EMBEDDED_PARAMS__ 合并进去。
      const shim = '(function(){var E=' + JSON.stringify(embedded).replace(/</g, '\\\\u003c') + ';'
        + 'window.__EMBEDDED_PARAMS__=E;var N=window.URLSearchParams;'
        + 'function P(init){var q=new N(init===undefined?"":init);'
        + 'if(typeof init==="string"&&(init===location.search||init===location.search.slice(1))){'
        + 'for(var k in E){if(!q.has(k))q.set(k,String(E[k]));}}return q;}'
        + 'P.prototype=N.prototype;window.URLSearchParams=P;})();';
      html = html.replace('</head>', '<script>' + shim + '</scr' + 'ipt></head>');
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'emopulse-' + t.id + '.html';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
      note.textContent = '已导出 ' + (html.length / 1024).toFixed(1) + ' KB · 参数已内嵌';
    } catch (error) {
      note.textContent = '导出失败：' + (error && error.message ? error.message : String(error)) + '（用本地服务打开 Studio 再试）';
    } finally {
      exportBtn.disabled = false;
      exportBtn.textContent = original;
    }
  });

  card.append(head, frame, controls, actions);
  grid.appendChild(card);

  let refreshTimer = 0;
  let frameReady = false;
  const urlFor = () => {
    const q = queryFor(t, values);
    return t.url + (q ? '?' + q : '');
  };
  const sendParams = () => {
    if (!frameReady) return;
    try {
      iframe.contentWindow?.postMessage({ type: 'params', values: { ...values } }, '*');
    } catch {
      // 跨源/iframe 已销毁：下一次 load 会重新同步。
    }
  };
  const sendQuality = () => {
    if (!frameReady) return;
    try {
      iframe.contentWindow?.postMessage({ type: 'quality', value: qualityValue }, '*');
    } catch {
      // 同上
    }
  };
  iframe.addEventListener('load', () => {
    frameReady = true;
    sendParams();
    sendQuality();
  });
  const apply = () => {
    const url = urlFor();
    open.href = url;
    if (!frameReady) {
      // 只有第一次装载写 src；之后参数走 postMessage，不重载整页。
      iframe.src = url;
      return;
    }
    sendParams();
  };
  update = () => {
    // 拖动 range 时 250ms 防抖：不每个 input 事件都重建零件，松手后最多一次。
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(apply, 250);
  };
  frames.push({ sendParams, sendQuality });
  apply();
}

quality?.addEventListener('change', () => {
  qualityValue = quality.value;
  // 画质是运行时参数，走 postMessage；不重载 Studio / iframe。
  for (const frame of frames) frame.sendQuality();
});

platform?.addEventListener('change', () => {
  platformValue = platform.value;
  for (const updateBadge of badgeUpdaters) updateBadge();
});
</script>
</body>
</html>`;

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT, html);
  console.log(`[studio] ${path.relative(REPO_ROOT, OUT)} (${(html.length / 1024).toFixed(1)} KB, ${templates.length} templates)`);
}

render();
