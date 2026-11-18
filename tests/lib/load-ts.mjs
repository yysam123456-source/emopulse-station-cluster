// 测试辅助：把 TS 源（契约层 / 零件 / fixture）按 esbuild 通道 B 的同一手法装载进 .mjs 测试。
// 为什么不用 tsx：这些测试是 `node tests/*.mjs` 直接跑的，不引入新依赖、不改 tsconfig；
// esbuild 已是既有 devDependency，`buildSync({bundle:true, format:'esm'})` + data URL import
// 与 shared/build/build.mjs 的 loadSiteConfig 完全同一手法（F15 通道 B1）。
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';

/** 仓库根绝对路径。 */
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** 单调递增的版本号：用于给 data URL 加不同的 hash，避免模块缓存串味。 */
let revision = 0;

/** 统一的 esbuild 调用（不写盘、不打印日志）。 */
function build(options) {
  return buildSync({
    bundle: true,
    target: 'node18',
    write: false,
    logLevel: 'silent',
    legalComments: 'none',
    ...options,
  });
}

/**
 * 把 TS 入口连同依赖树打成 ESM，再用 data URL import 取模块命名空间。
 * @param {string} entryPath 入口绝对路径（可省略 .ts 扩展名）
 * @param {{ fresh?: boolean }} [options] fresh=true 时强制新模块实例
 * @returns {Promise<Record<string, unknown>>}
 */
export async function loadTsModule(entryPath, options = {}) {
  const built = build({
    entryPoints: [entryPath],
    platform: 'node',
    format: 'esm',
  });
  const code = built.outputFiles[0].text;
  const suffix = options.fresh === false ? '' : `#rev=${(revision += 1)}`;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}${suffix}`);
}

/**
 * 用内联源码（stdin）作为入口，便于把多个模块的导出聚到同一个模块实例里。
 * @param {string} contents 入口源码
 * @returns {Promise<Record<string, unknown>>}
 */
export async function loadTsSource(contents) {
  const built = build({
    stdin: { contents, resolveDir: REPO_ROOT, loader: 'ts', sourcefile: 'test-entry.ts' },
    platform: 'node',
    format: 'esm',
  });
  const code = built.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}#rev=${(revision += 1)}`);
}

/**
 * 把绝对路径转成**可安全嵌入生成代码**的 ESM import 说明符。
 *
 * 为什么需要它（真实事故，非理论问题）：
 *   Windows 路径含反斜杠。如果直接把绝对路径插值进模板字符串：
 *     `import { x } from '${path.join(ROOT, 'shared/contract/composer')}'`
 *   生成的是 `import ... from 'C:\Users\...\2026-11-17...'`；其中 `\202` 会被 JS 引擎
 *   当作**八进制转义**解析成字节 0x82，反斜杠被整体吃掉，esbuild 于是报：
 *     Could not resolve "C:UsersLenovoWorkBuddy\u00826-11-17..."
 *   在 macOS/Linux 上路径没有反斜杠，所以这些测试从未暴露此问题（等于从未真正跑过）。
 *
 * 处理两步：
 *   1. 统一转 POSIX 正斜杠 —— esbuild 在 Windows 上同样接受 `C:/a/b`；
 *   2. 用 JSON.stringify 生成双引号字面量 —— 反斜杠/引号都不会破坏生成代码。
 *
 * @param {string} absPath 绝对路径（任意平台分隔符）
 * @returns {string} 可直接拼进生成代码的说明符字面量（含双引号，如 `"C:/a/b"`）
 */
export function toImportSpecifier(absPath) {
  if (typeof absPath !== 'string' || absPath.length === 0) {
    throw new TypeError('[load-ts] toImportSpecifier 需要非空的路径字符串');
  }
  return JSON.stringify(absPath.replace(/\\/g, '/'));
}

/**
 * 打一个 browser 侧 IIFE 产物（与 compileBridge 的通道 B2 参数一致）。
 * @param {{ entryPath?: string, contents?: string, minify?: boolean, globalName?: string }} options
 * @returns {string} IIFE 代码
 */
export function bundleIife(options = {}) {
  const common = {
    platform: 'browser',
    format: 'iife',
    target: 'es2022',
    minify: options.minify !== false,
    globalName: options.globalName,
  };
  const built = options.entryPath
    ? build({ ...common, entryPoints: [options.entryPath] })
    : build({
      ...common,
      stdin: { contents: options.contents ?? '', resolveDir: REPO_ROOT, loader: 'ts', sourcefile: 'entry.ts' },
    });
  return built.outputFiles[0].text.trim();
}
