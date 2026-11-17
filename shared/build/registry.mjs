// L2 站点注册中心：LEGACY_SITES 冻结存量快照（7 条） ∪ 增量 manifest 扫描（§4.2 / ADR-7 / INV-6）。
//
// 设计要点（为什么不是「倒退回硬编码」）：
//  1. LEGACY_SITES 是**一次性存量快照**：长度恒为 7、内容哈希恒定，永不追加 / 修改 / 删除；
//  2. 此后所有新增站点**必须且只能**通过 sites/**/site.manifest.ts 扫描进入注册表；
//  3. 若某 manifest 的 id 落入 LEGACY_IDS，validateManifest 立即抛错（堵住绕过快照重建存量站的退化路径）；
//  4. 既有 7 站目录零新增、零改动（主理人 D2 裁决），所以本文件是它们唯一的注册信息来源。
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import { ManifestError, validateManifest } from './validate-manifest.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');

/** manifest 文件名（固定，深度 ≤3 递归查找）。 */
export const MANIFEST_FILENAME = 'site.manifest.ts';

/**
 * 兼容后缀：`<slug>.site.manifest.ts`（fixture / 多声明同目录时使用，避免文件名冲突）。
 * 与 `site.manifest.ts` 等价识别，两者都会被扫描到。
 */
export const MANIFEST_SUFFIX = '.site.manifest.ts';

/** 判断文件名是否为站点声明文件。 */
export function isManifestFile(name) {
  return name === MANIFEST_FILENAME || name.endsWith(MANIFEST_SUFFIX);
}

/** 扫描最大目录深度（必须覆盖 sites/koi/pond 这种两级站点目录）。 */
export const MAX_SCAN_DEPTH = 3;

/** 扫描时跳过的目录名。 */
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.tmp', 'override']);

/**
 * 既有 7 站的冻结存量注册信息。一次性快照：长度恒为 7，内容不得修改。
 * 字段值严格等于原 sites.config.mjs 硬编码 SITES（逐字段对照见架构 §4.2 对照表）。
 * 新增站点一律写入 sites/<slug>/site.manifest.ts，**禁止**追加到本表。
 * @typedef {import('../contract/manifest.js').LegacySiteEntry} LegacySiteEntry
 */

/** @type {Readonly<Record<string, LegacySiteEntry>>} */
export const LEGACY_SITES = Object.freeze({
  still: Object.freeze({
    id: 'still', dir: 'sites/still', out: 'still.html', route: '/still',
    config: 'site.config.ts', bridge: 'bridge.ts', cohort: 'legacy', engine: 'core-wgsl',
  }),
  license: Object.freeze({
    id: 'license', dir: 'sites/license', out: 'license.html', route: '/license',
    config: 'site.config.ts', bridge: 'bridge.ts', cohort: 'legacy', engine: 'core-wgsl',
  }),
  praise: Object.freeze({
    id: 'praise', dir: 'sites/praise', out: 'praise.html', route: '/praise',
    config: 'site.config.ts', bridge: 'bridge.ts', cohort: 'legacy', engine: 'core-wgsl',
  }),
  hug: Object.freeze({
    id: 'hug', dir: 'sites/hug', out: 'hug.html', route: '/hug',
    config: 'site.config.ts', bridge: 'bridge.ts', cohort: 'legacy', engine: 'core-wgsl',
  }),
  'koi-pond': Object.freeze({
    id: 'koi-pond', dir: 'sites/koi/pond', out: 'koi-pond.html', route: '/koi-pond',
    config: 'site.config.ts', bridge: 'bridge.ts', cohort: 'legacy', engine: 'core-wgsl',
  }),
  'koi-ink': Object.freeze({
    id: 'koi-ink', dir: 'sites/koi/ink', out: 'koi-ink.html', route: '/koi-ink',
    config: 'site.config.ts', bridge: 'bridge.ts', cohort: 'legacy', engine: 'core-wgsl',
  }),
  'koi-watercolor': Object.freeze({
    id: 'koi-watercolor', dir: 'sites/koi/watercolor', out: 'koi-watercolor.html', route: '/koi-watercolor',
    config: 'site.config.ts', bridge: 'bridge.ts', cohort: 'legacy', engine: 'core-wgsl',
  }),
});

/** @type {ReadonlySet<string>} 冻结 id 集合，供 validateManifest / verify-append-only 断言 */
export const LEGACY_IDS = Object.freeze(new Set(Object.keys(LEGACY_SITES)));

/** 存量快照的内容哈希（恒定量）。verify-append-only / verify-registry 断言其永不变化。 */
export const LEGACY_SITES_HASH = createHash('sha256')
  .update(JSON.stringify(LEGACY_SITES))
  .digest('hex');

/** 仓库根绝对路径（供测试与诊断打印）。 */
export const REPO_ROOT = repoRoot;

/**
 * 递归查找 manifest 文件。
 * @param {string} dir 起始目录（绝对路径）
 * @param {number} depth 当前深度（0 = 起始目录）
 * @param {string[]} found 收集结果
 * @returns {string[]} 升序排列的 manifest 绝对路径
 */
function findManifests(dir, depth, found) {
  if (depth > MAX_SCAN_DEPTH) return found;
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return found;
  const names = readdirSync(dir).slice().sort();
  for (const name of names) {
    if (name.startsWith('.')) continue;
    const full = path.join(dir, name);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      if (SKIP_DIRS.has(name)) continue;
      findManifests(full, depth + 1, found);
      continue;
    }
    if (isManifestFile(name)) found.push(full);
  }
  return found;
}

/**
 * 用 esbuild 把 manifest TS 编译为 ESM data URL 后导入（与 build.mjs 的 loadSiteConfig 同一手法：
 * 无临时文件、无 tsx 运行依赖）。manifest 只 `import type`，bundle 体积接近原文。
 * @param {string} file manifest 绝对路径
 * @returns {Promise<unknown>} default 导出
 */
async function loadManifestModule(file) {
  const built = buildSync({
    entryPoints: [file],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node18',
    write: false,
    logLevel: 'silent',
  });
  const code = built.outputFiles[0].text;
  const module = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  if (!module.default) {
    throw new ManifestError('E_FIELD', 'manifest 缺少 default 导出（应 export default defineSite({...})）', file);
  }
  return module.default;
}

/**
 * 扫描并校验增量 manifest。
 * @param {{ rootDir?: string, baseDir?: string, strict?: boolean }} [options]
 *   rootDir：相对 baseDir 的扫描根（默认 'sites'）；baseDir 默认仓库根。
 *   strict=false 时收集错误而不抛出（供 verify-registry 逐个负向断言）。
 * @returns {Promise<{ manifests: Readonly<object>[], files: string[], errors: ManifestError[] }>}
 */
export async function scanManifests(options = {}) {
  const rootDir = options.rootDir ?? 'sites';
  const baseDir = options.baseDir ?? repoRoot;
  const strict = options.strict !== false;
  const scanRoot = path.resolve(baseDir, rootDir);

  /** @type {ManifestError[]} */
  const errors = [];
  /** @type {Readonly<object>[]} */
  const manifests = [];
  const files = findManifests(scanRoot, 0, []);
  const seenIds = new Set();

  for (const file of files) {
    try {
      const raw = await loadManifestModule(file);
      const manifest = validateManifest(raw, { root: baseDir, legacyIds: LEGACY_IDS, seenIds, file });
      manifests.push(manifest);
    } catch (error) {
      const manifestError = error instanceof ManifestError
        ? error
        : new ManifestError('E_FIELD', `加载失败：${error?.message ?? error}`, file);
      if (strict) throw manifestError;
      errors.push(manifestError);
    }
  }

  return { manifests, files, errors };
}

/**
 * 构建完整注册表：LEGACY_SITES（冻结 7 条） ∪ 扫描结果，按 id 字典序排序（保证构建确定性）。
 * @param {{ rootDir?: string, baseDir?: string, strict?: boolean }} [options]
 * @returns {Promise<{ sites: Readonly<object>[], legacy: Readonly<object>[], scanned: Readonly<object>[], files: string[], errors: ManifestError[] }>}
 */
export async function buildRegistry(options = {}) {
  const { manifests, files, errors } = await scanManifests(options);
  const legacy = Object.values(LEGACY_SITES);

  const seen = new Set();
  for (const entry of legacy) seen.add(entry.id);
  for (const entry of manifests) {
    if (seen.has(entry.id)) {
      throw new Error(`[registry] id 冲突：${entry.id}（LEGACY_IDS 与增量扫描结果不得有交集）`);
    }
    seen.add(entry.id);
  }

  const sites = [...legacy, ...manifests]
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return { sites, legacy, scanned: manifests, files, errors };
}

export default {
  LEGACY_SITES,
  LEGACY_IDS,
  LEGACY_SITES_HASH,
  scanManifests,
  buildRegistry,
  MANIFEST_FILENAME,
  MANIFEST_SUFFIX,
  isManifestFile,
  MAX_SCAN_DEPTH,
  REPO_ROOT,
};
