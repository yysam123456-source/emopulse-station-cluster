// NX-A-01/05 / INV-6 / SOP §7 / 主理人 D2：只追加（append-only）验收。
// 断言链：
//   ① 追加 1 个 dummy manifest（+ 最小站点目录）→ 能真的产出 dummy 站产物；
//   ② 7 站产物哈希零变化（INV-3）；
//   ③ LEGACY_SITES.length === 7 且内容哈希恒定（未偷偷把新站塞进存量表）；
//   ④ 新增站 id 出现在扫描结果中且不在 LEGACY_IDS；
//   ⑤ 底座文件与 legacy 站点目录的 git 状态零变化（D2 硬门）；
//   ⑥ 清理后仓库 git 状态与追加前逐字节相同。
// 手法：临时创建 sites/zzz-append-probe/，构建、断言、finally 清理（不留残留）。
// 用法：node tests/verify-append-only.mjs
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEGACY_IDS, LEGACY_SITES, LEGACY_SITES_HASH, scanManifests } from '../shared/build/registry.mjs';
import { loadRegistry, resetRegistry } from '../shared/build/sites.config.mjs';
import { createProbeSite, removeProbeSite } from './lib/probe-site.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROBE_ID = 'zzz-append-probe';
const PROBE_DIR_NAME = PROBE_ID;
const PROBE_OUT = path.join(ROOT, 'dist', `${PROBE_ID}.html`);

let checks = 0;
const failures = [];
function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

/** 计算文件 sha256（不存在返回 null）。 */
function sha256(file) {
  if (!existsSync(file)) return null;
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

/** 读取基线：Map<dist 文件名, hash>。 */
function readBaseline() {
  const map = new Map();
  for (const line of readFileSync(path.join(ROOT, 'tests', 'baseline-dist.sha256'), 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const match = /^([0-9a-f]{64})\s+\*?(.+)$/.exec(line);
    if (match) map.set(match[2].replace(/^dist\//, ''), match[1]);
  }
  return map;
}

/** git 工作区签名：porcelain 状态 + tracked diff + legacy 站点目录状态。 */
function gitSignature() {
  const run = (args) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  const status = run(['status', '--porcelain=v1']);
  const diff = run(['diff']);
  const legacyDirs = run(['status', '--porcelain=v1', '--', 'sites/still', 'sites/license', 'sites/praise', 'sites/hug', 'sites/koi']);
  return {
    status: status.stdout ?? '',
    diffHash: createHash('sha256').update(diff.stdout ?? '').digest('hex'),
    legacyDirs: legacyDirs.stdout ?? '',
  };
}

/** 检查 baseline 中 7 站产物哈希是否全部未变，返回失败描述数组。 */
function legacyHashProblems(baseline) {
  const problems = [];
  for (const [out, expected] of baseline) {
    const current = sha256(path.join(ROOT, 'dist', out));
    if (current !== expected) problems.push(`dist/${out} 哈希变化（${String(current).slice(0, 12)}… 与基线 ${expected.slice(0, 12)}… 不符）`);
  }
  return problems;
}

const baseline = readBaseline();
const beforeGit = gitSignature();

check(baseline.size === 7, `基线应有 7 条，实际 ${baseline.size}`);
check(Object.keys(LEGACY_SITES).length === 7, `LEGACY_SITES 长度必须恒为 7，实际 ${Object.keys(LEGACY_SITES).length}`);

let created = false;
try {
  // ─── ① 追加 dummy 站点（只新增站点目录，不改任何底座文件）───────────────────
  createProbeSite({ dirName: PROBE_DIR_NAME, id: PROBE_ID });
  created = true;

  // 扫描结果必须包含新增站，且不在 LEGACY_IDS
  const scan = await scanManifests({ rootDir: 'sites' });
  const ids = scan.manifests.map((manifest) => manifest.id);
  check(ids.includes(PROBE_ID), `追加后扫描结果应含 ${PROBE_ID}，实际 [${ids.join(', ')}]`);
  check(!LEGACY_IDS.has(PROBE_ID), `${PROBE_ID} 不得出现在 LEGACY_IDS`);
  check(scan.manifests.length === 1, `T01 范围内追加 1 个 dummy 后扫描结果应为 1 条，实际 ${scan.manifests.length}`);

  resetRegistry();
  const registry = await loadRegistry();
  check(registry.order.length === 8, `注册表应为 7（存量）+ 1（新增）= 8，实际 ${registry.order.length}`);
  check(registry.order.includes(PROBE_ID), '注册表应包含新增站');

  // ─── ② 构建 dummy 站：必须真的产出产物 ────────────────────────────────────
  const build = spawnSync(process.execPath, [path.join(ROOT, 'shared', 'build', 'build.mjs'), PROBE_ID], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  check(build.status === 0, `构建 ${PROBE_ID} 应成功，实际 exit=${build.status}\n${build.stdout ?? ''}\n${build.stderr ?? ''}`);
  check(existsSync(PROBE_OUT), `应产出 dist/${PROBE_ID}.html`);
  if (existsSync(PROBE_OUT)) {
    console.log(`[verify-append-only] 新增站产物 dist/${PROBE_ID}.html = ${readFileSync(PROBE_OUT).byteLength} B`);
  }

  // ─── ③ 7 站产物哈希零变化（INV-3 核心断言）─────────────────────────────────
  const problems = legacyHashProblems(baseline);
  checks += baseline.size;
  for (const problem of problems) failures.push(problem);
  if (problems.length === 0) console.log('[verify-append-only] 7/7 站产物哈希零变化');

  // ─── ④ LEGACY_SITES 长度 / 内容哈希恒定 ────────────────────────────────────
  check(Object.keys(LEGACY_SITES).length === 7, `追加后 LEGACY_SITES 长度必须仍为 7，实际 ${Object.keys(LEGACY_SITES).length}`);
  check(LEGACY_SITES_HASH === createHash('sha256').update(JSON.stringify(LEGACY_SITES)).digest('hex'),
    'LEGACY_SITES 内容哈希必须等于其当前 JSON 的 sha256（自洽）');
  check(!Object.prototype.hasOwnProperty.call(LEGACY_SITES, PROBE_ID), `LEGACY_SITES 不得纳入新增站 ${PROBE_ID}`);
  console.log(`[verify-append-only] LEGACY_SITES 长度=7，内容哈希=${LEGACY_SITES_HASH.slice(0, 16)}…（恒定）`);

  // ─── ⑤ 底座文件与 legacy 站点目录 git 状态零变化 ───────────────────────────
  const duringGit = gitSignature();
  check(duringGit.legacyDirs === beforeGit.legacyDirs,
    `legacy 站点目录 git 状态发生变化：${duringGit.legacyDirs || '(空)'}`);
  check(duringGit.diffHash === beforeGit.diffHash,
    'tracked 文件 diff 在追加 dummy 站前后发生了变化（底座或站点被改写的信号）');
} finally {
  // ─── ⑥ 清理：删除临时站点目录与产物，恢复仓库原状 ──────────────────────────
  if (created) removeProbeSite({ dirName: PROBE_DIR_NAME, out: `${PROBE_ID}.html` });
}

const afterGit = gitSignature();
check(afterGit.status === beforeGit.status, `清理后 git 状态未复原：\nbefore=${beforeGit.status}\nafter=${afterGit.status}`);
check(afterGit.diffHash === beforeGit.diffHash, '清理后 tracked diff 未复原');
check(!existsSync(path.join(ROOT, 'sites', PROBE_DIR_NAME)), '临时探针目录必须已被清理');
check(!existsSync(PROBE_OUT), '临时探针产物必须已被清理');

// 清理后重跑一次哈希校验，确保清理动作本身也没有污染产物
const finalProblems = legacyHashProblems(baseline);
for (const problem of finalProblems) failures.push(problem);

if (failures.length > 0) {
  console.error(`[verify-append-only] ❌ ${failures.length}/${checks} 项断言失败：`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`[verify-append-only] ✅ PASS：${checks} 项断言（追加即产出 / 7 站哈希零变化 / LEGACY_SITES 恒 7 条且哈希恒定 / 底座 git 零变化 / 已清理）`);
