// 站点注册表：id → 目录 / 路由 / 输出名 / 配置文件 / 浏览器侧桥接文件。
// T04/T05 新站只需在此追加一行 + 在 types.ts 的 SiteId 登记，不改构建脚本。
export const SITES = {
  still: {
    id: 'still',
    route: '/still',
    dir: 'sites/still',
    out: 'still.html',
    config: 'site.config.ts',
    bridge: 'bridge.ts',
  },
  license: {
    id: 'license',
    route: '/license',
    dir: 'sites/license',
    out: 'license.html',
    config: 'site.config.ts',
    bridge: 'bridge.ts',
  },
  praise: {
    id: 'praise',
    route: '/praise',
    dir: 'sites/praise',
    out: 'praise.html',
    config: 'site.config.ts',
    bridge: 'bridge.ts',
  },
  hug: {
    id: 'hug',
    route: '/hug',
    dir: 'sites/hug',
    out: 'hug.html',
    config: 'site.config.ts',
    bridge: 'bridge.ts',
  },
  'koi-pond': {
    id: 'koi-pond',
    route: '/koi-pond',
    dir: 'sites/koi/pond',
    out: 'koi-pond.html',
    config: 'site.config.ts',
    bridge: 'bridge.ts',
  },
  'koi-ink': {
    id: 'koi-ink',
    route: '/koi-ink',
    dir: 'sites/koi/ink',
    out: 'koi-ink.html',
    config: 'site.config.ts',
    bridge: 'bridge.ts',
  },
  'koi-watercolor': {
    id: 'koi-watercolor',
    route: '/koi-watercolor',
    dir: 'sites/koi/watercolor',
    out: 'koi-watercolor.html',
    config: 'site.config.ts',
    bridge: 'bridge.ts',
  },
};

/** 后续站点预留（本批次不实现，仅记录落点，避免忘记扩展位）。 */
export const FUTURE_SITES = ['license', 'praise', 'hug', 'koi-pond', 'koi-ink', 'koi-watercolor'];

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

/** 按 ID 取站点注册信息。 */
export function getSite(id) {
  const site = SITES[id];
  if (!site) throw new Error(`[sites.config] 未注册的站点：${id}（可选：${Object.keys(SITES).join(', ')}）`);
  return site;
}

/** 列出所有已注册站点 ID。 */
export function listSites() {
  return Object.keys(SITES);
}
