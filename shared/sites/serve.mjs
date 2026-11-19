// 本地静态服务器 —— **零依赖**，只绑 `127.0.0.1`，不绑 `0.0.0.0`。
//
// 为什么必须显式绑 127.0.0.1：绑 0.0.0.0 会把开发中的站暴露到局域网，
// 而这些站里有尚未定稿的文案与半成品零件。默认安全，需要外网时才显式改 `--host`。
//
// 路径语义（单域名按路径分站，用户拍板的产品前提）：
//   `/`        → dist/index.html（四站索引）
//   `/hug`     → dist/hug/index.html   （补尾斜杠与不补都行）
//   `/hug/`    → dist/hug/index.html
//   `/xx.png`  → dist/xx.png           （产物同目录下的静态文件）
//
// 用法：
//   node shared/sites/serve.mjs            # 127.0.0.1:8080
//   node shared/sites/serve.mjs --port 9000
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** 仓库根。 */
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** 产物根。 */
const DIST = path.join(REPO_ROOT, 'dist');

/** 扩展名 → Content-Type。 */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

/**
 * 把请求路径解析成 dist 下的真实文件。
 *
 * 安全：解析后必须仍在 DIST 内（挡住 `../` 穿越）。
 *
 * @param {string} urlPath 请求路径（不含查询串）
 * @returns {string|null} 文件绝对路径；不存在或越界返回 null
 */
function resolveFile(urlPath) {
  let clean = decodeURIComponent(urlPath.split('?')[0]);
  if (clean.endsWith('/')) clean += 'index.html';
  const candidates = [path.join(DIST, clean), path.join(DIST, clean, 'index.html')];
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (!resolved.startsWith(DIST + path.sep) && resolved !== path.join(DIST, 'index.html')) continue;
    if (existsSync(resolved) && statSync(resolved).isFile()) return resolved;
  }
  return null;
}

/**
 * 起服务器。
 *
 * @param {{ port?: number, host?: string }} [options]
 * @returns {import('node:http').Server}
 */
export function serve(options = {}) {
  const port = Number.isFinite(options.port) ? options.port : 8080;
  const host = options.host ?? '127.0.0.1';

  const server = createServer((req, res) => {
    const file = resolveFile(req.url ?? '/');
    if (!file) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(`404 ${req.url}\n（先跑 npm run build:sites）`);
      return;
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'content-type': MIME[ext] ?? 'application/octet-stream',
      // 开发期不缓存：改完刷新就能看到
      'cache-control': 'no-store',
    });
    createReadStream(file).pipe(res);
  });

  server.on('error', (error) => {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'EADDRINUSE') {
      console.error(`[serve] 端口 ${port} 已被占用。换一个：--port 9000`);
      process.exit(1);
    }
    throw error;
  });

  server.listen(port, host, () => {
    console.log(`[serve] http://${host}:${port}/`);
    console.log(`  站点：${['license', 'hug', 'still', 'koi'].map((s) => `/${s}`).join('  ')}`);
    console.log('  （只监听 127.0.0.1；要临时对外请显式传 --host 0.0.0.0，并知道后果）');
  });
  return server;
}

// CLI
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const flag = (name, fallback) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
  };
  if (argv.includes('--help')) {
    console.log('用法：node shared/sites/serve.mjs [--port 8080] [--host 127.0.0.1]');
    process.exit(0);
  }
  if (!existsSync(path.join(DIST, 'index.html'))) {
    console.error('[serve] dist/ 里没有产物。先跑：npm run build:sites');
    process.exit(1);
  }
  serve({ port: Number(flag('port', 8080)), host: flag('host', '127.0.0.1') });
}
