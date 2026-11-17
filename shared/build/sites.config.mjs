// 站点注册表（重写）：LEGACY_SITES 冻结存量（7 条） ∪ 增量 manifest 扫描（可扩展）。
// 变更类型：L2 受控演进（架构 §4.2）。硬纪律：
//   ① FILES / CORE_ANCHORS 两个导出**逐字保留**（inject-theme.mjs 依赖 CORE_ANCHORS，
//      改一个字都可能让锚点诊断漂移）；
//   ② 原 SITES 硬编码对象与 FUTURE_SITES 已移除，7 站注册信息改由 registry.mjs 的
//      LEGACY_SITES 冻结快照等价提供（字段逐字相同）；
//   ③ 本文件是**构建元信息**，不参与产物字节函数 f()，故重写不影响任何既有产物哈希。
import { buildRegistry, LEGACY_IDS, LEGACY_SITES, LEGACY_SITES_HASH } from './registry.mjs';

export { LEGACY_IDS, LEGACY_SITES, LEGACY_SITES_HASH };

/** Frozen Core 拼接顺序——顺序影响共享作用域，不可变（照抄原版 build.mjs）。 */
export const FILES = ['quality.js', 'math.js', 'shaders.js', 'world.js', 'main.js', 'audio.js'];

/** T01 已核实的 5 个配色锚点原文（用于构建失败时给出可读诊断）。 */
export const CORE_ANCHORS = {
  WCOL: 'shaders.js:196  const WCOL = vec3f(.16, .58, .90);',
  PCOL: 'shaders.js:198  const PCOL = vec3f(.58, .66, .98);',
  SUNC: 'shaders.js:199  const SUNC = vec3f(1.7, 1.6, 1.45);',
  EXPO: 'main.js:393    const TANH = 0.6, NEAR = 0.1, EXPO = 0.62, RAYS = 0.54;',
  RAYS: 'main.js:393    const TANH = 0.6, NEAR = 0.1, EXPO = 0.62, RAYS = 0.54;',
};

/** 注册表缓存：{ sites: Map<id, entry>, order: string[] }；loadRegistry() 成功后写入。 */
let cache = null;

/** 未加载注册表时的统一错误（避免静默返回空列表导致构建出 0 个产物）。 */
function requireCache(api) {
  if (!cache) {
    throw new Error(`[sites.config] 注册表尚未加载：请先 await loadRegistry() 再调用 ${api}()`);
  }
  return cache;
}

/**
 * 加载注册表：LEGACY_SITES 冻结存量 ∪ 增量 manifest 扫描，按 id 字典序排序。
 * @param {{ rootDir?: string, baseDir?: string }} [options]
 * @returns {Promise<{ order: string[], sites: Map<string, object>, legacyCount: number, scannedCount: number }>}
 */
export async function loadRegistry(options = {}) {
  const { sites, legacy, scanned, files } = await buildRegistry(options);
  const map = new Map();
  for (const entry of sites) map.set(entry.id, entry);
  cache = {
    sites: map,
    order: sites.map((entry) => entry.id),
    legacyCount: legacy.length,
    scannedCount: scanned.length,
    files,
  };
  return cache;
}

/** 按 ID 取站点注册信息（未注册时明确失败，并列出可选 id）。 */
export function getSite(id) {
  const { sites } = requireCache('getSite');
  const site = sites.get(id);
  if (!site) throw new Error(`[sites.config] 未注册的站点：${id}（可选：${[...sites.keys()].join(', ')}）`);
  return site;
}

/** 列出所有已注册站点 ID（按 id 字典序，保证构建确定性）。 */
export function listSites() {
  return requireCache('listSites').order.slice();
}

/** 列出全部注册信息（含 cohort / engine，供 verify-size 等测试按分区断言）。 */
export function listRegistryEntries() {
  const { sites, order } = requireCache('listRegistryEntries');
  return order.map((id) => sites.get(id));
}

/** 清空缓存（仅供测试复位，构建流程禁止调用）。 */
export function resetRegistry() {
  cache = null;
}

/** 注册表当前统计（供构建日志与测试打印）。 */
export function registryStats() {
  const current = requireCache('registryStats');
  return { total: current.order.length, legacy: current.legacyCount, scanned: current.scannedCount };
}
