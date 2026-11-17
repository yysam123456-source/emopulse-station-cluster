// Q-N13 / GM-7 / NX-P-14：单产物体积硬门 163,840 B + 软观测 131,072 B。
// 口径（§1.5）：
//   - cohort='legacy'（7 站）：不受体积阈值约束，只受「哈希逐字节相等」约束（INV-3）；
//   - cohort='nexus'：硬门 ≤ 163,840 B；软观测 131,072 B 只告警不阻断；
//   - 附加（主理人第 7 条）：全部 dist 产物都不得超硬门。
// 用法：node tests/verify-size.mjs
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listRegistryEntries, loadRegistry } from '../shared/build/sites.config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const HARD_LIMIT = 163840; // 160 KiB 硬门
const SOFT_LIMIT = 131072; // 128 KiB 软观测

const failures = [];
const warnings = [];
const rows = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

/** 解析 tests/baseline-dist.sha256 → Map<file, hash>。 */
function readBaseline() {
  const map = new Map();
  const text = readFileSync(path.join(ROOT, 'tests', 'baseline-dist.sha256'), 'utf8');
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const match = /^([0-9a-f]{64})\s+\*?(.+)$/.exec(line);
    if (match) map.set(match[2], match[1]);
  }
  return map;
}

await loadRegistry();
const entries = listRegistryEntries();
const baseline = readBaseline();

check(entries.length >= 7, `注册表应至少含 7 个 legacy 站，实际 ${entries.length}`);

for (const entry of entries) {
  const file = path.join(DIST, entry.out);
  if (!existsSync(file)) {
    failures.push(`产物缺失：dist/${entry.out}（cohort=${entry.cohort}）`);
    continue;
  }
  const bytes = statSync(file).size;
  const hash = createHash('sha256').update(readFileSync(file)).digest('hex');
  rows.push({ id: entry.id, cohort: entry.cohort, bytes, hash });

  if (entry.cohort === 'legacy') {
    const expected = baseline.get(`dist/${entry.out}`);
    check(Boolean(expected), `基线缺少 dist/${entry.out}`);
    if (expected) check(hash === expected, `legacy 站 ${entry.id} 哈希不符（INV-3）：期望 ${expected.slice(0, 12)}…，实际 ${hash.slice(0, 12)}…`);
  } else {
    check(bytes <= HARD_LIMIT, `nexus 站 ${entry.id} 体积 ${bytes} B 超硬门 ${HARD_LIMIT} B`);
    if (bytes > SOFT_LIMIT) warnings.push(`nexus 站 ${entry.id} 体积 ${bytes} B 超软观测 ${SOFT_LIMIT} B（仅告警）`);
  }
}

// 主理人第 7 条：任何 dist 产物都不得超硬门（含 T01 之外的既有产物）
if (existsSync(DIST)) {
  for (const name of readdirSync(DIST).filter((n) => n.endsWith('.html')).sort()) {
    const bytes = statSync(path.join(DIST, name)).size;
    check(bytes <= HARD_LIMIT, `dist/${name} 体积 ${bytes} B 超硬门 ${HARD_LIMIT} B`);
  }
}

// 报告：中位数 + 分区计数
const sizes = rows.map((row) => row.bytes).sort((a, b) => a - b);
const median = sizes.length === 0 ? 0 : sizes[Math.floor(sizes.length / 2)];
const nexusCount = rows.filter((row) => row.cohort === 'nexus').length;

console.log('[verify-size] id                cohort   bytes    KiB');
for (const row of rows) {
  console.log(`  ${row.id.padEnd(18)}${row.cohort.padEnd(9)}${String(row.bytes).padStart(6)}  ${(row.bytes / 1024).toFixed(1)}`);
}
console.log(`[verify-size] 中位数 ${median} B（${(median / 1024).toFixed(1)} KiB）｜软观测 ${SOFT_LIMIT} B｜硬门 ${HARD_LIMIT} B`);
console.log(`[verify-size] legacy ${rows.length - nexusCount} 站（走哈希约束）｜nexus ${nexusCount} 站（走体积硬门）`);
for (const warning of warnings) console.warn(`  ⚠ ${warning}`);
if (nexusCount === 0) {
  console.log('[verify-size] 提示：T01 范围内尚无 nexus 站（8 个产品站属 T02~T05），nexus 体积硬门已实现但对 0 个产物生效');
}

if (failures.length > 0) {
  console.error(`[verify-size] ❌ ${failures.length} 项失败：`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('[verify-size] ✅ PASS：所有产物 ≤ 163,840 B，legacy 7 站哈希逐字节一致');
