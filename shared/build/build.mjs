// 构建入口：node build.mjs <site> | all [--readable]
// 流程：verify-core → 读注册表/站点配置 → L1 同名覆盖 → L2 锚点注入 → 拼接 IIFE → 压缩内联 → 单 HTML 产物。
import { spawnSync } from 'node:child_process';
import { buildSync } from 'esbuild';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FILES, getSite, listSites } from './sites.config.mjs';
import { resolveOverlay, warnUnknownOverrides } from './resolve-overlay.mjs';
import { injectTheme } from './inject-theme.mjs';
import { inlineHtml, inlineRuntime } from './inline.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const coreSrcDir = path.join(root, 'shared', 'core', 'src');
const coreTemplate = path.join(root, 'shared', 'core', 'template.html');
const distDir = path.join(root, 'dist');

const args = process.argv.slice(2);
const readable = args.includes('--readable');
const target = args.find((arg) => !arg.startsWith('--')) ?? 'still';
const targets = target === 'all' ? listSites() : [target];

/** 校验 Frozen Core 哈希，失败立即终止构建。 */
function verifyCore() {
  const result = spawnSync(process.execPath, [path.join(here, 'verify-core.mjs')], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) {
    console.error('[build] Frozen Core 校验失败，构建终止');
    process.exit(result.status ?? 1);
  }
}

/** 用 esbuild 把站点 TS 配置转成 ESM data URL 后导入（无临时文件、无 tsx 运行依赖）。 */
async function loadSiteConfig(site) {
  const configPath = path.join(root, site.dir, site.config);
  if (!existsSync(configPath)) throw new Error(`[build] 站点配置不存在：${configPath}`);
  const built = buildSync({
    entryPoints: [configPath],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node18',
    write: false,
    logLevel: 'silent',
  });
  const code = built.outputFiles[0].text;
  const module = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  if (!module.default) throw new Error(`[build] 站点配置缺少 default 导出：${configPath}`);
  return module.default;
}

/** 编译站点浏览器侧 glue（bundle 仅针对 contract 纯逻辑，不触碰 core 的 6 文件拼接）。 */
function compileBridge(site) {
  const bridgePath = path.join(root, site.dir, site.bridge);
  if (!existsSync(bridgePath)) return '';
  const built = buildSync({
    entryPoints: [bridgePath],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'es2022',
    minify: !readable,
    legalComments: 'none',
    write: false,
    logLevel: 'silent',
  });
  return built.outputFiles[0].text.trim();
}

/** esbuild minify 会把 0.42 写成 .42；生成两种形态供产物断言使用。 */
function numberVariants(value) {
  const text = String(value);
  const compact = text.startsWith('0.') ? text.slice(1) : text;
  return compact === text ? [text] : [text, compact];
}

/** 产物断言：占位符清零、零外链、5 常量已注入、canvas 存在。 */
function assertArtifact(html, config) {
  for (const token of ['/*SCRIPT*/', '/*RUNTIME*/']) {
    if (html.includes(token)) throw new Error(`[build] 产物残留占位符 ${token}`);
  }
  const external = /https?:\/\//i.exec(html);
  if (external) throw new Error(`[build] 产物含外部 URL：${external[0]}（索引 ${external.index}）`);
  if (/<(?:script|link|img|iframe)[^>]+(?:src|href)\s*=\s*["']?(?:https?:)?\/\//i.test(html)) {
    throw new Error('[build] 产物含外部资源引用');
  }

  for (const key of ['WCOL', 'PCOL', 'SUNC']) {
    const values = config.theme[key].map(numberVariants);
    for (let i = 0; i < 3; i += 1) {
      if (!values[i].some((v) => html.includes(v))) {
        throw new Error(`[build] 产物未检测到 theme.${key}[${i}] 的注入值`);
      }
    }
  }
  for (const key of ['EXPO', 'RAYS']) {
    if (!numberVariants(config.theme[key]).some((v) => html.includes(v))) {
      throw new Error(`[build] 产物未检测到 theme.${key} 的注入值`);
    }
  }
  if (!/<canvas\b/i.test(html)) throw new Error('[build] 产物缺少 canvas 元素');
}

/** 压缩前断言：TANH/NEAR 仍为 core 原值（esbuild 会重命名局部变量，只能在注入后、压缩前检查）。 */
function assertInjectedSource(injected) {
  if (!/\bTANH\s*=\s*0\.6\b/.test(injected) || !/\bNEAR\s*=\s*0\.1\b/.test(injected)) {
    throw new Error('[build] 注入后源码中 TANH/NEAR 原值缺失，锚点注入误伤了同行邻居');
  }
}

/** 构建单站。 */
async function buildSite(siteId) {
  const site = getSite(siteId);
  const config = await loadSiteConfig(site);
  if (config.id !== site.id) throw new Error(`[build] 配置 id=${config.id} 与注册 id=${site.id} 不一致`);

  const loaded = resolveOverlay({
    coreDir: coreSrcDir,
    overrideDir: path.join(root, site.dir, 'override'),
    files: FILES,
  });
  warnUnknownOverrides(path.join(root, site.dir, 'override'), [...FILES, 'template.html']);
  const overrides = loaded.filter((item) => item.from === 'override').map((item) => item.name);

  // 拼接顺序、IIFE 包装、压缩内联全部沿用原版；注入只发生在内存字符串。
  const joined = loaded.map((item) => item.source).join('\n');
  const injected = injectTheme(joined, config.theme);
  assertInjectedSource(injected);
  const templatePath = existsSync(path.join(root, site.dir, 'override', 'template.html'))
    ? path.join(root, site.dir, 'override', 'template.html')
    : coreTemplate;
  const template = readFileSync(templatePath, 'utf8');
  let html = inlineHtml(injected, template, { readable });
  html = inlineRuntime(html, compileBridge(site));
  assertArtifact(html, config);

  mkdirSync(distDir, { recursive: true });
  const outPath = path.join(distDir, site.out);
  writeFileSync(outPath, html, 'utf8');
  const size = (Buffer.byteLength(html) / 1024).toFixed(1);
  console.log(`[build] ${siteId}: ${outPath} ${size} kB${readable ? ' (readable)' : ''}`);
  console.log(`[build] ${siteId}: override=[${overrides.join(', ') || 'none'}] route=${site.route}`);
  return outPath;
}

verifyCore();
for (const id of targets) await buildSite(id);
console.log(`[build] 完成：${targets.join(', ')}`);
