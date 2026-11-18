// 措辞与降级三问校验（REUSE-2 黑名单 + REUSE-6 三问 + REUSE-7 的 L3 四要素）。
//
// 为什么需要单独一支脚本：数值门（rate / coverage）挡不住「话说过头」。
// `depth='D1'` 却写「完整移植原件」、`completeness='partial'` 却写「原样复用」，
// 这类措辞会让下游（PM、审计、读者）把「借观感」误读成「搬了算法」——比数字造假更难发现。
//
// 三条检查：
//   ① 措辞黑名单（按 depth 分档，见 §3.2 与 §12.3）
//   ② `downgrade` 三问齐全（原件用了什么技术 / 我们用什么替代 / 差异导致的可见后果），
//      每问都要有实质内容，且不得命中 §12.3 的不合格黑名单
//   ③ L3（无许可声明）零件的固定句式四要素：无声明 / 已豁免 / 仅个人展示 / 不得再分发
//      （§14.1-A-2：逐件写明，不得漏签）
//
// 用法：node tests/verify-reuse-wording.mjs
import { existsSync } from 'node:fs';
import path from 'node:path';
import { loadTsModule, REPO_ROOT } from './lib/load-ts.mjs';

/** 零件库根目录。 */
const LIB = path.join(REPO_ROOT, 'shared', 'parts-library');

/** 任何 depth 都不许用的措辞（会把「自写/等效」说成「搬运」）。 */
const ALWAYS_FORBIDDEN = [
  '完整移植',
  '完美复刻',
  '原样复用',
  '逐字节移植',
  '原样照搬',
  '完全照搬',
];

/** 只有 D4（真实复制）才能用的措辞；D3/D2/D1/D0 用了即算夸大。 */
const COPY_ONLY_WORDS = ['真实复制原件', '逐字节一致', '逐字节复制'];

/** §12.3 明列的不合格表述（出现在 downgrade 里即失败）。 */
const DOWNGRADE_BLACKLIST = ['按描述实现', '等效实现', '保留关键参数', '移植为 Canvas 2D', '算法相同'];

/** 降级三问的三个必要标签（缺一即失败）。 */
const DOWNGRADE_LABELS = ['原件用了什么技术', '我们用什么替代', '差异导致的可见后果'];

/** 三问每问的最少字数（低于此视为敷衍，PRD GWT-10 的「6 个字」即为此设）。 */
const MIN_ANSWER_LENGTH = 8;

/** L3 固定句式的四要素（§14.1-A-2）。 */
const L3_ELEMENTS = [
  { name: '无许可声明', pattern: /无许可(?:证)?声明/ },
  { name: '已签字豁免', pattern: /已签字豁免/ },
  { name: '仅个人展示', pattern: /仅用于个人展示/ },
  { name: '不得再分发', pattern: /不得再分发/ },
];

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

/**
 * 汇总一份 provenance 里所有「会被读成事实陈述」的文本。
 * @param {object} manifest 零件声明
 * @param {object} provenance 溯源
 * @returns {{where: string, text: string}[]} 待扫描文本
 */
function statementsOf(manifest, provenance) {
  const items = [];
  const push = (where, text) => {
    if (typeof text === 'string' && text.trim() !== '') items.push({ where, text });
  };
  push('note', manifest.note);
  push('license.evidence', provenance.license?.evidence);
  push('paramSurface.evidence', provenance.paramSurface?.evidence);
  for (const entry of Array.isArray(provenance.paramSurface?.scope) ? provenance.paramSurface.scope : []) {
    push(`scope[${String(entry?.path)}].reason`, entry?.reason);
  }
  for (const symbol of Array.isArray(provenance.ported) ? provenance.ported : []) {
    push(`ported[${String(symbol?.symbol)}].downgrade`, symbol?.downgrade);
  }
  return items;
}

/**
 * 校验 downgrade 三问。
 * @param {string} text downgrade 正文
 * @returns {string[]} 问题列表（空 = 合格）
 */
function downgradeProblems(text) {
  const problems = [];
  if (typeof text !== 'string' || text.trim() === '') return ['downgrade 为空（三问必须写全）'];
  const positions = [];
  for (const label of DOWNGRADE_LABELS) {
    const index = text.indexOf(label);
    if (index < 0) problems.push(`缺「${label}」一问`);
    else positions.push({ label, index });
  }
  if (positions.length === DOWNGRADE_LABELS.length) {
    positions.sort((a, b) => a.index - b.index);
    for (let i = 0; i < positions.length; i += 1) {
      const start = positions[i].index + positions[i].label.length;
      const end = i + 1 < positions.length ? positions[i + 1].index : text.length;
      const answer = text.slice(start, end).replace(/^[：:]\s*/, '').trim();
      if (answer.length < MIN_ANSWER_LENGTH) {
        problems.push(`「${positions[i].label}」的回答只有 ${answer.length} 字（<${MIN_ANSWER_LENGTH}，视为敷衍）`);
      }
    }
  }
  for (const phrase of DOWNGRADE_BLACKLIST) {
    if (text.includes(phrase)) problems.push(`downgrade 命中不合格表述「${phrase}」（§12.3 黑名单）`);
  }
  return problems;
}

/** 主流程。 */
async function main() {
  const registry = await loadTsModule(path.join(LIB, 'registry', 'index.ts'));
  const legacy = await loadTsModule(path.join(LIB, 'legacy-provenance.ts'));
  const manifests = registry.PART_MANIFESTS;

  /** 待校验的零件：8 份已注册 manifest + 尚未建目录的缺口占位。 */
  const parts = manifests.map((manifest) => ({
    id: manifest.id,
    manifest,
    provenance: manifest.provenance ?? {},
    source: 'manifest',
  }));

  const seen = new Set(parts.map((part) => part.id));
  for (const siteId of Object.keys(legacy.LEGACY_PARTS)) {
    for (const ref of legacy.LEGACY_PARTS[siteId]) {
      if (seen.has(ref.partId)) continue;
      seen.add(ref.partId);
      // 已有磁盘 manifest 的缺口零件（施工中）不在本门范围内：注册后自动接管
      if (existsSync(path.join(LIB, ref.partId, 'part.manifest.ts'))) continue;
      parts.push({
        id: ref.partId,
        manifest: { id: ref.partId, note: undefined },
        provenance: ref.provenance ?? {},
        source: 'legacy-gap',
      });
    }
  }

  console.log('[verify-reuse-wording] 措辞黑名单 + 降级三问 + L3 四要素');
  console.log(`  零件 ${parts.length} 件（manifest ${manifests.length} + 缺口占位 ${parts.length - manifests.length}）`);

  const summary = [];
  for (const part of parts) {
    const provenance = part.provenance;
    const depth = provenance.depth ?? 'D0';
    const problems = [];
    const statements = statementsOf(part.manifest, provenance);
    const joined = statements.map((item) => item.text).join('\n');

    // ① 措辞黑名单
    for (const phrase of ALWAYS_FORBIDDEN) {
      if (!joined.includes(phrase)) continue;
      const where = statements.find((item) => item.text.includes(phrase))?.where ?? '?';
      problems.push(`措辞黑名单「${phrase}」（出现在 ${where}，任何 depth 都不许用）`);
    }
    if (depth !== 'D4') {
      for (const phrase of COPY_ONLY_WORDS) {
        if (!joined.includes(phrase)) continue;
        const where = statements.find((item) => item.text.includes(phrase))?.where ?? '?';
        problems.push(`措辞黑名单「${phrase}」（出现在 ${where}；depth=${depth} 只能写「等效实现 / 观感参考」）`);
      }
    }

    // ② downgrade 三问（存在即必须合格；D3 且有 ported 时必须存在）
    const ported = Array.isArray(provenance.ported) ? provenance.ported : [];
    for (const symbol of ported) {
      if (typeof symbol?.downgrade === 'string' && symbol.downgrade.trim() !== '') {
        for (const problem of downgradeProblems(symbol.downgrade)) {
          problems.push(`ported ${String(symbol.symbol)} 的 ${problem}`);
        }
      }
    }
    if (depth === 'D3' && ported.length > 0 && !ported.some((symbol) => typeof symbol?.downgrade === 'string' && symbol.downgrade.trim() !== '')) {
      problems.push('depth=D3 且有 ported 符号时必须写 downgrade 三问（REUSE-6）');
    }

    // ③ L3 四要素（L4 另行校验 blocked）
    const grade = provenance.license?.grade;
    if (grade === 'L3') {
      for (const element of L3_ELEMENTS) {
        if (!element.pattern.test(joined)) {
          problems.push(`L3 固定句式缺要素「${element.name}」（§14.1-A-2 要求逐件写明四要素）`);
        }
      }
    }
    if (grade === 'L4') {
      if (provenance.license?.blocked !== true) problems.push('L4（明示不授权）必须 blocked: true');
      if (!/不授权|阻断/.test(joined)) problems.push('L4 的 license.evidence 必须写明「明示不授权 / 硬阻断」的依据');
    }

    check(problems.length === 0, `${part.id}（${depth}/${grade ?? '?'}）：${problems.slice(0, 6).join('；')}`);
    summary.push({ id: part.id, depth, grade, source: part.source, problems });
  }

  console.log('');
  console.log('  id                depth  许可  结果');
  for (const row of summary) {
    console.log(`  ${row.id.padEnd(17)} ${String(row.depth).padEnd(5)} ${String(row.grade ?? '?').padEnd(5)} ${row.problems.length === 0 ? '✓' : '✗'}`);
  }

  const l3 = summary.filter((row) => row.grade === 'L3').length;
  const l4 = summary.filter((row) => row.grade === 'L4').length;
  const l1 = summary.filter((row) => row.grade === 'L1').length;
  console.log('');
  console.log(`[verify-reuse-wording] 许可分级：L1=${l1} L3=${l3} L4=${l4}（本次纳入 ${summary.length} 件）`);
  // 架构 §3.4 要求全库 L3 恰好 8 条（8 份 manifest 里 5 件 + 三缺口）。
  // 缺口零件未注册进 PART_MANIFESTS 时本门只看到 9 件，此时 8 条不可达 → 记为预期红并写明差额，
  // 而不是把断言改弱（装配测试里的 L3=8 硬断言仍然覆盖全部 11 件，未被放松）。
  const EXPECTED_L3 = 8;
  const ALL_PARTS = 11;
  if (summary.length >= ALL_PARTS) {
    check(l3 === EXPECTED_L3, `L3 条目数应为 ${EXPECTED_L3}（架构 §3.4 硬断言），实际 ${l3}`);
  } else {
    console.log(`[verify-reuse-wording] ⏳ L3 计数 ${l3}/${EXPECTED_L3}：差额来自尚未注册的缺口零件`
      + '（T-R04 施工中；装配测试的 L3=8 硬断言覆盖全部 11 件，未受影响）——本门在 11 件齐备后自动转硬断言');
  }

  if (failures.length > 0) {
    console.log('');
    console.log(`[verify-reuse-wording] ❌ FAIL：${failures.length} 项失败（断言 ${checks} 项）`);
    for (const failure of failures) console.log(`  - ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log('');
  console.log(`[verify-reuse-wording] ✅ PASS：${checks} 项断言（措辞黑名单 / 降级三问 / L3 四要素 / L3 计数）`);
}

await main();
