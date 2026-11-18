// 7 站产物基线的「变化必须签字」门（T-R01，ARCHITECTURE-REUSE §4.5）。
//
// 断言链：
//   ① tests/baseline-dist.v1.sha256（原始基线，永不改）与 tests/baseline-dist.sha256（现行基线）
//      都存在、格式合法、各 7 条；
//   ② 逐站：v1 哈希 vs 现行哈希
//        - 相同 → 台账不得有该站 signoff（防「签了但没改」污染）；
//        - 不同 → 必须有 signoff，且 fromHash === v1 哈希、toHash === 现行哈希、
//          reason / prdRef / signedBy 非空、date 为 YYYY-MM-DD；
//   ③ still 双重锁定：台账不得有 still 条目；且 dist/still.html 实际 sha256 === v1 基线 still 哈希
//      （产物侧独立断言，不看现行基线）；
//   ④ 现行基线必须等于 dist 实际哈希（否则现行基线是手改的）；
//   ⑤ 附加：legacy 零件溯源冻结快照自洽（7 条 / 内容哈希钉死 / still 零零件）。
//
// 用法：node tests/verify-baseline-signoff.mjs
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTsModule } from './lib/load-ts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const V1 = path.join(ROOT, 'tests', 'baseline-dist.v1.sha256');
const CURRENT = path.join(ROOT, 'tests', 'baseline-dist.sha256');
const LEDGER = path.join(ROOT, 'tests', 'baseline-signoff.json');
const HEX64 = /^[0-9a-f]{64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const failures = [];
let checks = 0;

/**
 * 记一次断言。
 * @param {boolean} condition 断言结果
 * @param {string} message 失败描述
 * @returns {boolean} 原样返回
 */
function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
  return condition;
}

/** 计算文件 sha256（不存在返回 null）。 */
function sha256File(file) {
  if (!existsSync(file)) return null;
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

/**
 * 解析基线：Map<站点 id, 哈希>。站点 id 由文件名推出（dist/still.html → still）。
 * @param {string} text 基线文本
 * @param {string} label 用于报错的标签
 * @returns {Map<string, string>} 站点 → 哈希
 */
function parseBaseline(text, label) {
  const map = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const match = /^([0-9a-f]{64})\s+\*?(.+)$/.exec(line);
    if (!match) throw new Error(`[verify-baseline-signoff] ${label} 格式错误：${line}`);
    map.set(path.basename(match[2]).replace(/\.html$/, ''), match[1]);
  }
  return map;
}

// ── ① 基线文件 ───────────────────────────────────────────────────────
for (const file of [V1, CURRENT, LEDGER]) {
  if (!check(existsSync(file), `缺文件：${path.relative(ROOT, file)}`)) {
    console.error(`[verify-baseline-signoff] ❌ ${failures.join('；')}`);
    process.exit(1);
  }
}

const v1 = parseBaseline(readFileSync(V1, 'utf8'), '.v1');
const current = parseBaseline(readFileSync(CURRENT, 'utf8'), '现行基线');
check(v1.size === 7, `.v1 基线应有 7 条，实际 ${v1.size}`);
check(current.size === 7, `现行基线应有 7 条，实际 ${current.size}`);

let ledger = null;
try {
  ledger = JSON.parse(readFileSync(LEDGER, 'utf8'));
} catch (error) {
  failures.push(`签字台账不是合法 JSON：${error?.message ?? error}`);
}
const signoffs = Array.isArray(ledger?.signoffs) ? ledger.signoffs : null;
check(signoffs !== null, '签字台账必须有 signoffs 数组');

// ── ② 逐站比对 v1 ↔ 现行 ────────────────────────────────────────────
if (signoffs !== null) {
  const byStation = new Map();
  for (const entry of signoffs) {
    const station = String(entry?.station ?? '');
    check(station !== '', 'signoff 条目缺 station');
    check(!byStation.has(station), `signoff 存在重复站点：${station}`);
    byStation.set(station, entry);
    check(v1.has(station), `signoff 出现基线之外的站点：${station}`);
  }

  // ③ still 不得签字
  check(!byStation.has('still'), 'still 不得出现在签字台账（INV-3 锚点站禁止签字放行）');

  console.log('[verify-baseline-signoff] 逐站比对（v1 → 现行基线 → dist）：');
  for (const [station, v1Hash] of v1) {
    const curHash = current.get(station) ?? null;
    const distHash = sha256File(path.join(ROOT, 'dist', `${station}.html`));
    const problems = [];

    if (curHash === null) problems.push('现行基线缺该站');
    if (distHash === null) problems.push('dist 产物缺失');
    else if (curHash !== null && distHash !== curHash) problems.push(`dist 实际哈希 ≠ 现行基线（${distHash.slice(0, 12)}…）`);

    if (curHash !== null) {
      const sign = byStation.get(station);
      if (curHash === v1Hash) {
        if (sign) problems.push('未改却留了签字条目（应删除）');
      } else if (!sign) {
        problems.push('哈希已变但台账无签字');
      } else {
        if (sign.fromHash !== v1Hash) problems.push(`fromHash ≠ v1 基线（${String(sign.fromHash).slice(0, 12)}…）`);
        if (sign.toHash !== curHash) problems.push(`toHash ≠ 现行基线（${String(sign.toHash).slice(0, 12)}…）`);
        if (typeof sign.reason !== 'string' || sign.reason.trim() === '') problems.push('reason 缺失');
        if (typeof sign.prdRef !== 'string' || sign.prdRef.trim() === '') problems.push('prdRef 缺失');
        if (typeof sign.signedBy !== 'string' || sign.signedBy.trim() === '') problems.push('signedBy 缺失');
        if (typeof sign.date !== 'string' || !DATE.test(sign.date)) problems.push('date 必须是 YYYY-MM-DD');
      }
    }

    const signed = curHash !== null && curHash !== v1Hash;
    const flag = problems.length === 0 ? (signed ? 'SIGN' : 'OK  ') : 'FAIL';
    console.log(`  ${flag} ${station.padEnd(14)} v1=${v1Hash.slice(0, 12)}… cur=${String(curHash).slice(0, 12)}…`);
    if (problems.length > 0) failures.push(`${station}: ${problems.join('；')}`);
  }

  // ④ 台账里出现 extra station 已在 ② 断言；这里断言 v1/current 站点集合一致
  for (const station of current.keys()) {
    check(v1.has(station), `现行基线出现 v1 之外的站点：${station}`);
  }
}

// ── ③ still 产物侧双重锁定 ───────────────────────────────────────────
const stillV1 = v1.get('still');
const stillDist = sha256File(path.join(ROOT, 'dist', 'still.html'));
check(
  typeof stillV1 === 'string' && stillDist === stillV1,
  `dist/still.html 哈希必须恒等于 v1 基线（v1=${String(stillV1).slice(0, 12)}… 实际=${String(stillDist).slice(0, 12)}…）`,
);
check(current.get('still') === stillV1, '现行基线的 still 哈希必须仍等于 v1（still 永久不可重基线）');

// ── ⑤ 附加：legacy 溯源冻结快照 ──────────────────────────────────────
try {
  const provenance = await loadTsModule(path.join(ROOT, 'shared', 'parts-library', 'legacy-provenance.ts'));
  const snapshot = provenance.LEGACY_PARTS;
  check(Object.keys(snapshot).length === 7, `legacy 溯源快照必须恒为 7 条，实际 ${Object.keys(snapshot).length}`);
  const recomputed = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  check(
    recomputed === provenance.LEGACY_PARTS_HASH,
    `legacy 溯源快照内容哈希已变化（钉死 ${String(provenance.LEGACY_PARTS_HASH).slice(0, 16)}…，实际 ${recomputed.slice(0, 16)}…）`,
  );
  check(snapshot.still && snapshot.still.length === 0, 'legacy 溯源快照里 still 必须为零零件');
  provenance.assertLegacyPartsIntegrity();
  console.log(`[verify-baseline-signoff] legacy 溯源冻结快照：7 条 · 内容哈希 ${String(provenance.LEGACY_PARTS_HASH).slice(0, 16)}…（恒定）`);
} catch (error) {
  failures.push(`legacy 溯源冻结快照校验失败：${error?.message ?? error}`);
}

if (failures.length > 0) {
  console.error(`[verify-baseline-signoff] ❌ ${failures.length}/${checks} 项断言失败：`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`[verify-baseline-signoff] ✅ PASS：${checks} 项断言（双基线 7 站一致 / 无违规签字 / still 产物侧锁定 / 溯源快照冻结）`);
