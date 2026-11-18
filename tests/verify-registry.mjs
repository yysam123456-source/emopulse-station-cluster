// INV-6 / NX-A-01：注册表 schema / 唯一性 / slug 正则 / 必填文件 / 冻结快照一致性。
// 覆盖架构 §7.2 T01 验收第 5 条的落地口径（本次不建 8 个产品站，改用 fixture 验证 schema）：
//   - LEGACY_SITES 7 条与旧硬编码 SITES 逐字段一致；
//   - fixtures 下 2 条正向 manifest 全通过 schema；
//   - 4 类负向（重复 id / 非法 slug / 缺失文件 / id 落入 LEGACY_IDS）各自报错；
//   - 零件注册中心的条目与磁盘目录一一对应，manifest 合法、source 原件存在。
// 用法：node tests/verify-registry.mjs
import { createHash } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { loadTsModule, REPO_ROOT } from './lib/load-ts.mjs';
import { FILES, CORE_ANCHORS, getSite, listSites, loadRegistry, resetRegistry } from '../shared/build/sites.config.mjs';
import { LEGACY_IDS, LEGACY_SITES, LEGACY_SITES_HASH, scanManifests } from '../shared/build/registry.mjs';

let checks = 0;
const failures = [];

/** 断言：失败也继续跑完，最后统一汇总（避免只看到第一个错误）。 */
function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

/** 深比较（只用于扁平的注册条目）。 */
function sameEntry(actual, expected, label) {
  check(Boolean(actual), `${label} 缺失`);
  if (!actual) return;
  for (const key of Object.keys(expected)) {
    check(actual[key] === expected[key], `${label}.${key} 期望 ${expected[key]}，实际 ${actual[key]}`);
  }
}

// ─── 1. LEGACY_SITES 冻结存量：7 条、双层冻结、字段逐字等于对照表 ────────────────
const EXPECTED_LEGACY = {
  still: { id: 'still', dir: 'sites/still', out: 'still.html', route: '/still', config: 'site.config.ts', bridge: 'bridge.ts', cohort: 'legacy', engine: 'core-wgsl' },
  license: { id: 'license', dir: 'sites/license', out: 'license.html', route: '/license', config: 'site.config.ts', bridge: 'bridge.ts', cohort: 'legacy', engine: 'core-wgsl' },
  praise: { id: 'praise', dir: 'sites/praise', out: 'praise.html', route: '/praise', config: 'site.config.ts', bridge: 'bridge.ts', cohort: 'legacy', engine: 'core-wgsl' },
  hug: { id: 'hug', dir: 'sites/hug', out: 'hug.html', route: '/hug', config: 'site.config.ts', bridge: 'bridge.ts', cohort: 'legacy', engine: 'core-wgsl' },
  'koi-pond': { id: 'koi-pond', dir: 'sites/koi/pond', out: 'koi-pond.html', route: '/koi-pond', config: 'site.config.ts', bridge: 'bridge.ts', cohort: 'legacy', engine: 'core-wgsl' },
  'koi-ink': { id: 'koi-ink', dir: 'sites/koi/ink', out: 'koi-ink.html', route: '/koi-ink', config: 'site.config.ts', bridge: 'bridge.ts', cohort: 'legacy', engine: 'core-wgsl' },
  'koi-watercolor': { id: 'koi-watercolor', dir: 'sites/koi/watercolor', out: 'koi-watercolor.html', route: '/koi-watercolor', config: 'site.config.ts', bridge: 'bridge.ts', cohort: 'legacy', engine: 'core-wgsl' },
};

const legacyIds = Object.keys(LEGACY_SITES);
check(legacyIds.length === 7, `LEGACY_SITES 长度应为 7，实际 ${legacyIds.length}`);
check(Object.isFrozen(LEGACY_SITES), 'LEGACY_SITES 必须被 Object.freeze（表级冻结）');
for (const id of legacyIds) {
  check(Object.isFrozen(LEGACY_SITES[id]), `LEGACY_SITES['${id}'] 必须被 Object.freeze（条目级冻结）`);
  sameEntry(LEGACY_SITES[id], EXPECTED_LEGACY[id], `LEGACY_SITES['${id}']`);
}
check(LEGACY_IDS.size === 7, `LEGACY_IDS 大小应为 7，实际 ${LEGACY_IDS.size}`);
check(Object.isFrozen(LEGACY_IDS), 'LEGACY_IDS 必须被冻结');
for (const id of Object.keys(EXPECTED_LEGACY)) check(LEGACY_IDS.has(id), `LEGACY_IDS 缺少 ${id}`);

// 内容哈希必须等于「按对照表重建出的快照」的哈希（恒定量，verify-append-only 亦断言）
const expectedHash = createHash('sha256').update(JSON.stringify(EXPECTED_LEGACY)).digest('hex');
check(LEGACY_SITES_HASH === expectedHash, `LEGACY_SITES_HASH 不符（期望 ${expectedHash}，实际 ${LEGACY_SITES_HASH}）`);
console.log(`[verify-registry] LEGACY_SITES 内容哈希 = ${LEGACY_SITES_HASH}`);

// ─── 2. sites.config.mjs 的注册表 API ─────────────────────────────────────────
const legacyTable = {
  WCOL: 'shaders.js:196  const WCOL = vec3f(.16, .58, .90);',
  PCOL: 'shaders.js:198  const PCOL = vec3f(.58, .66, .98);',
  SUNC: 'shaders.js:199  const SUNC = vec3f(1.7, 1.6, 1.45);',
  EXPO: 'main.js:393    const TANH = 0.6, NEAR = 0.1, EXPO = 0.62, RAYS = 0.54;',
  RAYS: 'main.js:393    const TANH = 0.6, NEAR = 0.1, EXPO = 0.62, RAYS = 0.54;',
};
check(JSON.stringify(FILES) === JSON.stringify(['quality.js', 'math.js', 'shaders.js', 'world.js', 'main.js', 'audio.js']),
  `FILES 必须逐字保留原顺序，实际 ${JSON.stringify(FILES)}`);
check(JSON.stringify(CORE_ANCHORS) === JSON.stringify(legacyTable), 'CORE_ANCHORS 必须逐字保留原值');

resetRegistry();
let threwBeforeLoad = false;
try {
  listSites();
} catch {
  threwBeforeLoad = true;
}
check(threwBeforeLoad, '未 loadRegistry() 就调用 listSites() 必须显式抛错（不允许静默返回空列表）');

const registry = await loadRegistry();
check(registry.order.length === 7, `注册表应为 7 站（T01 无 nexus 站点），实际 ${registry.order.length}`);
check(registry.order.every((id, index) => index === 0 || registry.order[index - 1] < id), '注册表必须按 id 字典序排序（构建确定性）');
check(JSON.stringify(listSites()) === JSON.stringify([...legacyIds].sort()), 'listSites() 必须等于 LEGACY_IDS 的字典序');
sameEntry(getSite('still'), EXPECTED_LEGACY.still, 'getSite("still")');

let unknownThrew = false;
try {
  getSite('no-such-site');
} catch {
  unknownThrew = true;
}
check(unknownThrew, 'getSite(未知 id) 必须抛错');

// ─── 3. fixtures 正向：2 条 manifest 通过 schema ──────────────────────────────
const positive = await scanManifests({ rootDir: 'tests/fixtures/sites' });
check(positive.errors.length === 0, `fixture 正向扫描不应有错误，实际 ${positive.errors.map((e) => e.code).join(',')}`);
check(positive.manifests.length === 2, `fixture 正向应发现 2 条 manifest，实际 ${positive.manifests.length}`);
for (const manifest of positive.manifests) {
  check(Object.isFrozen(manifest), `校验后的 manifest 应被冻结：${manifest.id}`);
  check(manifest.route === `/${manifest.id}`, `${manifest.id} 的 route 必须 === '/' + id`);
  check(manifest.out === `${manifest.id}.html`, `${manifest.id} 的 out 必须 === id + '.html'`);
  check(!LEGACY_IDS.has(manifest.id), `${manifest.id} 不得落入 LEGACY_IDS`);
}

// ─── 4. fixtures 负向：四类错误各自报错 ───────────────────────────────────────
const negative = await scanManifests({ rootDir: 'tests/fixtures/manifests/invalid', strict: false });
const codeOf = (basename) => {
  const found = negative.errors.find((error) => String(error.file).includes(basename));
  return found ? found.code : '(未报错)';
};
const EXPECTED_NEGATIVE = {
  'bad-slug.site.manifest.ts': 'E_SLUG',
  'dup-id-b.site.manifest.ts': 'E_DUP_ID',
  'missing-file.site.manifest.ts': 'E_FILE',
  'legacy-collision.site.manifest.ts': 'E_LEGACY_ID',
};
for (const [file, expected] of Object.entries(EXPECTED_NEGATIVE)) {
  const actual = codeOf(file);
  check(actual === expected, `负向 fixture ${file} 期望 ${expected}，实际 ${actual}`);
}
check(negative.manifests.length === 1, `负向目录中应有 1 条通过（dup-id-a），实际 ${negative.manifests.length}`);

let strictThrew = false;
try {
  await scanManifests({ rootDir: 'tests/fixtures/manifests/invalid' });
} catch (error) {
  strictThrew = error?.code === 'E_SLUG';
}
check(strictThrew, 'strict 模式（构建默认）遇到首个非法 manifest 必须立即抛错');

// ─── 5. 真实扫描根：T01 范围内应为 0 条 manifest ──────────────────────────────
const real = await scanManifests({ rootDir: 'sites' });
check(real.errors.length === 0, `真实 sites/ 扫描不应有错误，实际 ${real.errors.map((e) => e.message).join(';')}`);
console.log(`[verify-registry] sites/ 扫描到 ${real.manifests.length} 条新站 manifest（T01 预期 0，8 个产品站属 T02~T05）`);

// ─── 6. 零件注册中心：条目与磁盘目录一一对应，manifest 合法、source 原件存在 ─────
const parts = await loadTsModule(path.join(REPO_ROOT, 'shared/parts-library/registry/index.ts'));
const PART_MANIFESTS = parts.PART_MANIFESTS;
// 条数不写死：断言「注册中心条目数 == 磁盘上带 part.manifest.ts 的目录数」。
// 原实现写死 8，dandelion / blow-input 注册后变成 10，这条断言就一直红着 ——
// 硬编码的期望值在「只增不改」的零件库里必然过期，改结构性断言后新增零件自动跟上。
const diskPartDirs = readdirSync(path.join(REPO_ROOT, 'shared', 'parts-library'), { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(path.join(REPO_ROOT, 'shared', 'parts-library', d.name, 'part.manifest.ts')))
  .map((d) => d.name)
  .sort();
const manifestIds = Array.isArray(PART_MANIFESTS) ? PART_MANIFESTS.map((m) => m.id).sort() : null;
check(Array.isArray(PART_MANIFESTS) && PART_MANIFESTS.length === diskPartDirs.length,
  `PART_MANIFESTS 条数应与磁盘目录一致（磁盘 ${diskPartDirs.length} 个：${diskPartDirs.join(',')}），实际 ${Array.isArray(PART_MANIFESTS) ? PART_MANIFESTS.length : '非数组'}`);
check(manifestIds !== null && JSON.stringify(manifestIds) === JSON.stringify(diskPartDirs),
  `PART_MANIFESTS 的 id 集合应与磁盘目录名集合相等；磁盘=${diskPartDirs.join(',')} 注册表=${(manifestIds ?? []).join(',')}`);
const SLUG = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const LAYERS = ['narrative', 'scene', 'interaction', 'audio', 'artifact'];
const ORIGINS = ['copy', 'equivalent', 'port'];
const pendingEntry = [];
const partIds = new Set();
for (const manifest of PART_MANIFESTS ?? []) {
  check(SLUG.test(manifest.id), `零件 id 非法：${manifest.id}`);
  check(!partIds.has(manifest.id), `零件 id 重复：${manifest.id}`);
  partIds.add(manifest.id);
  check(LAYERS.includes(manifest.layer), `零件 ${manifest.id} 的 layer 非法：${manifest.layer}`);
  check(ORIGINS.includes(manifest.origin), `零件 ${manifest.id} 的 origin 非法：${manifest.origin}`);
  check(manifest.contract === 'v1', `零件 ${manifest.id} 的 contract 必须为 v1`);
  check(typeof manifest.entry === 'string' && manifest.entry.startsWith('shared/parts-library/'),
    `零件 ${manifest.id} 的 entry 必须位于 shared/parts-library/ 下`);
  for (const claim of manifest.claims ?? []) {
    check(['exclusive', 'chain', 'shared'].includes(claim.mode), `零件 ${manifest.id} 的 claim.mode 非法：${claim.mode}`);
    check(typeof claim.resource === 'string' && claim.resource.length > 0, `零件 ${manifest.id} 的 claim.resource 不能为空`);
  }
  if (manifest.source) {
    const sourcePath = path.join(REPO_ROOT, 'shared', 'parts-library', manifest.source);
    check(existsSync(sourcePath), `零件 ${manifest.id} 声明的原件不存在：${manifest.source}（「零件先入库」硬断言）`);
  } else {
    check(manifest.origin !== 'copy', `零件 ${manifest.id} 为 copy 原件却未声明 source`);
  }
  if (!existsSync(path.join(REPO_ROOT, manifest.entry))) pendingEntry.push(manifest.id);
}

// ─── 汇总 ────────────────────────────────────────────────────────────────────
console.log(`[verify-registry] 零件声明 ${partIds.size} 条；entry 薄包装待建（T02+）：[${pendingEntry.join(', ') || 'none'}]`);

if (failures.length > 0) {
  console.error(`[verify-registry] ❌ ${failures.length}/${checks} 项断言失败：`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`[verify-registry] ✅ PASS：${checks} 项断言全通过（LEGACY_SITES 7 条字段逐字一致、fixtures 2 正向 + 4 负向、零件声明 ${PART_MANIFESTS.length} 条与磁盘目录一一对应）`);
