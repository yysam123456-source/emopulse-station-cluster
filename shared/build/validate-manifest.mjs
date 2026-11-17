// L2 构建期 manifest schema 校验：兜住「编译期看不到的」跨文件一致性与唯一性（§5.4 ②）。
// 与 shared/contract/manifest.ts 的 SiteManifest 一一对应；两处都要改才算完整演进。
// 纯函数 + 显式错误码，便于 tests/verify-registry.mjs 断言。
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

/** slug 正则（与 K6 一致）：全小写连字符，数字不得开头，不允许连续/结尾连字符。 */
export const SLUG_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** 合法 cohort 取值。 */
export const COHORTS = ['legacy', 'nexus'];

/** 合法 engine 取值。 */
export const ENGINES = ['canvas2d', 'core-wgsl'];

/** 合法 requires 取值。 */
export const REQUIREMENTS = ['webgpu', 'none'];

/** 合法层名（与 composition.ts 的 LAYER_ORDER 一致）。 */
export const LAYERS = ['narrative', 'scene', 'interaction', 'audio', 'artifact'];

/** 必填字段（顺序即报错顺序，保证诊断可读）。 */
export const REQUIRED_FIELDS = ['id', 'route', 'dir', 'out', 'config', 'bridge', 'cohort', 'engine'];

/** manifest 校验错误：带错误码，便于负向测试精确断言。 */
export class ManifestError extends Error {
  /**
   * @param {string} code 错误码（E_FIELD / E_SLUG / E_ROUTE / E_OUT / E_ENUM / E_DIR / E_FILE / E_LEGACY_ID / E_DUP_ID / E_COMPOSITION）
   * @param {string} message 可读信息
   * @param {string} [file] manifest 文件路径
   */
  constructor(code, message, file = '') {
    super(`[validate-manifest] ${code}: ${message}${file ? `（${file}）` : ''}`);
    this.name = 'ManifestError';
    this.code = code;
    this.file = file;
  }
}

/** 判断是否为普通对象（排除 null / 数组 / class 实例误判）。 */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 校验 composition 结构（只做形状与枚举校验；ref 是否命中注册中心留到运行期 Composer.validate）。 */
function validateCompositionShape(composition, file) {
  if (!isPlainObject(composition)) {
    throw new ManifestError('E_COMPOSITION', 'composition 必须是对象', file);
  }
  for (const key of Object.keys(composition)) {
    if (!LAYERS.includes(key)) {
      throw new ManifestError('E_COMPOSITION', `composition 含非法层名 ${key}（允许：${LAYERS.join('/')}）`, file);
    }
  }
  for (const layer of LAYERS) {
    const bindings = composition[layer];
    if (bindings === undefined) continue;
    if (!Array.isArray(bindings)) {
      throw new ManifestError('E_COMPOSITION', `composition.${layer} 必须是数组`, file);
    }
    for (const binding of bindings) {
      if (!isPlainObject(binding) || typeof binding.ref !== 'string' || binding.ref.length === 0) {
        throw new ManifestError('E_COMPOSITION', `composition.${layer} 存在缺少 ref 的绑定`, file);
      }
      if (binding.enabled !== undefined && typeof binding.enabled !== 'boolean') {
        throw new ManifestError('E_COMPOSITION', `composition.${layer}.${binding.ref}.enabled 必须是布尔值`, file);
      }
    }
  }
}

/**
 * 校验单条站点声明。
 * @param {unknown} manifest 待校验对象
 * @param {{ root?: string, legacyIds?: ReadonlySet<string>, seenIds?: Set<string>, file?: string }} [options]
 * @returns {Readonly<object>} 归一化后的只读 manifest
 * @throws {ManifestError}
 */
export function validateManifest(manifest, options = {}) {
  const file = options.file ?? '';
  const root = options.root ?? process.cwd();
  const legacyIds = options.legacyIds ?? new Set();
  const seenIds = options.seenIds ?? new Set();

  if (!isPlainObject(manifest)) {
    throw new ManifestError('E_FIELD', 'manifest 必须是普通对象', file);
  }

  for (const field of REQUIRED_FIELDS) {
    const value = manifest[field];
    if (typeof value !== 'string' || value.trim() === '') {
      throw new ManifestError('E_FIELD', `缺少必填字段或类型错误：${field}`, file);
    }
  }

  const { id, route, dir, out, config, bridge, cohort, engine, requires } = manifest;

  if (!SLUG_PATTERN.test(id)) {
    throw new ManifestError('E_SLUG', `id=${id} 不符合 slug 正则 ${SLUG_PATTERN}`, file);
  }
  if (legacyIds.has(id)) {
    throw new ManifestError('E_LEGACY_ID', `id=${id} 落入 LEGACY_IDS（存量 7 条冻结，禁止重建存量站）`, file);
  }
  if (seenIds.has(id)) {
    throw new ManifestError('E_DUP_ID', `id=${id} 重复（注册表内 id 必须唯一）`, file);
  }
  if (route !== `/${id}`) {
    throw new ManifestError('E_ROUTE', `route=${route} 必须等于 '/' + id = '/${id}'`, file);
  }
  if (out !== `${id}.html`) {
    throw new ManifestError('E_OUT', `out=${out} 必须等于 id + '.html' = '${id}.html'`, file);
  }
  if (!COHORTS.includes(cohort)) {
    throw new ManifestError('E_ENUM', `cohort=${cohort} 不合法（允许：${COHORTS.join('/')}）`, file);
  }
  if (!ENGINES.includes(engine)) {
    throw new ManifestError('E_ENUM', `engine=${engine} 不合法（允许：${ENGINES.join('/')}）`, file);
  }
  if (requires !== undefined && !REQUIREMENTS.includes(requires)) {
    throw new ManifestError('E_ENUM', `requires=${requires} 不合法（允许：${REQUIREMENTS.join('/')}）`, file);
  }
  if (path.isAbsolute(dir) || dir.split('/').includes('..')) {
    throw new ManifestError('E_DIR', `dir=${dir} 必须是仓库内相对路径且不含 '..'`, file);
  }

  for (const field of ['config', 'bridge']) {
    const target = path.join(root, dir, manifest[field]);
    if (!existsSync(target) || !statSync(target).isFile()) {
      throw new ManifestError('E_FILE', `${field} 文件不存在：${path.relative(root, target) || target}`, file);
    }
  }

  if (manifest.composition !== undefined) validateCompositionShape(manifest.composition, file);

  seenIds.add(id);

  const normalized = {
    id,
    route,
    dir,
    out,
    config,
    bridge,
    cohort,
    engine,
    ...(requires === undefined ? {} : { requires }),
  };
  return Object.freeze(normalized);
}

export default { validateManifest, SLUG_PATTERN, COHORTS, ENGINES, LAYERS, REQUIRED_FIELDS, ManifestError };
