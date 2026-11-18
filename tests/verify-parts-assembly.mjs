// T-R01 装配闭环 + 溯源契约三级断言（P0-R0 修复的验收门）。
//
// 背景（修复前的真实故障，ARCHITECTURE-REUSE §2.1）：
//   8/8 份 part.manifest.ts 的 entry 全部指向不存在的 index.ts，registerPart() 全仓 0 调用点
//   → partStore 永远为空 → 零件从来没有「可被使用的形态」。所以断言的不是「有没有被用」，
//   而是「能不能被装配、能不能构造、不能装配的是否如实报错、溯源是否符合契约」。
//
// 断言分组：
//   Tier-1  全部 8 件：entry 存在 / default 是函数 / 导出 manifest 且 id 与目录一致
//   Tier-1P provenance 契约（REUSE-1/2/3）：字段形状、files[].bytes 与磁盘一致、
//           ported[].symbol 在原文件中 \b 命中、paramSurface 自洽、depth↔origin 一致
//   Tier-2  depth !== 'D0'：installParts() 后 resolvePart(id).factory() 能真实构造 + dispose 两次幂等
//   Tier-D0 depth === 'D0'：factory() 必须抛 code === 'E_PART_NOT_MOUNTED'
//   附加 A  装配器幂等（连调两次 installParts 不重复注册、不抛错）
//   附加 B  legacy 溯源冻结快照自洽（7 条 / 哈希钉死 / still 零零件 / 与 manifest 同源）
//   附加 C  legacy-provenance 不得被 sites/** 引用（否则会进产物字节）
//
// 用法：node tests/verify-parts-assembly.mjs
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { loadTsModule, loadTsSource, REPO_ROOT } from './lib/load-ts.mjs';

const LIB = path.join(REPO_ROOT, 'shared', 'parts-library');
const DEPTHS = ['D0', 'D1', 'D2', 'D3', 'D4'];
const COMPLETENESS = ['complete', 'partial', 'absent'];
const KINDS = ['function', 'constant', 'table', 'shader', 'algorithm'];
const LICENSE_GRADES = ['L1', 'L2', 'L3', 'L4'];
const ORIGIN_FOR_DEPTH = { D4: ['copy'], D3: ['port'], D2: ['equivalent'], D1: ['equivalent'], D0: ['equivalent'] };
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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
 * 构造契约 v1 的最小工厂入参（stub bus/store/capability）。
 * 构造期零 DOM 是硬约束：此处不提供 window/document/canvas，谁偷用谁当场炸。
 * @param {string} ref 零件 id
 * @returns {object} PartOptions
 */
function stubOptions(ref) {
  return {
    ref,
    options: {},
    bus: {
      on() { /* noop */ },
      interval() { /* noop */ },
      exchange(value) { return value; },
      get() { return undefined; },
      set() { /* noop */ },
      capability: {},
      masterGain: null,
    },
    store: {},
    capability: {},
  };
}

/** 词边界命中（与 QA 的 `grep -w` 同口径）。 */
function wordHit(text, word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`).test(text);
}

/**
 * 降级三问的标签（与 `tests/verify-reuse-wording.mjs` 的 `DOWNGRADE_LABELS` 同文）。
 * 改这里必须同步那边 —— 两处口径不一致时，松的那处就是后门。
 */
const DOWNGRADE_LABELS = ['原件用了什么技术', '我们用什么替代', '差异导致的可见后果'];
/** 每一问的最少字数：防「标签齐全但内容为空」。 */
const MIN_ANSWER_LENGTH = 8;

/**
 * articleMode 零件的降级三问校验（三问必须齐全，且每问有实质内容）。
 *
 * 为什么 articleMode 要更严：无原件的零件，`files[]` 是空的、没有 bytes/sha256 比对、
 * 没有 `missing[]` 可查，`downgrade` 是**唯一**能被人核对的证据。此时若也放过，这个零件
 * 在机械校验里就只剩「字段齐全」这一条 —— 而字段齐全恰恰是最廉价的东西。
 *
 * @param {{symbol: string, downgrade?: string}} symbol ported 条目
 * @param {string} partId 零件 id
 * @returns {string[]} 问题列表（空 = 合规）
 */
function downgradeProblems(symbol, partId) {
  const text = typeof symbol?.downgrade === 'string' ? symbol.downgrade.trim() : '';
  if (text === '') {
    return [`${partId} 的 ported ${symbol.symbol} 缺 downgrade（articleMode 下这是唯一可核的证据，不得为空）`];
  }
  const problems = [];
  const positions = DOWNGRADE_LABELS
    .map((label) => text.indexOf(label))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b);
  for (const label of DOWNGRADE_LABELS) {
    const at = text.indexOf(label);
    if (at < 0) {
      problems.push(`${partId} 的 ported ${symbol.symbol} 的 downgrade 缺「${label}」这一问`);
      continue;
    }
    const nextAt = positions.find((index) => index > at) ?? text.length;
    const answer = text.slice(at + label.length, nextAt).replace(/^[：:，,\s]+/, '').trim();
    if (answer.length < MIN_ANSWER_LENGTH) {
      problems.push(`${partId} 的 ported ${symbol.symbol} 的「${label}」只有 ${answer.length} 字（<${MIN_ANSWER_LENGTH}，等于没答）`);
    }
  }
  return problems;
}

/**
 * 校验 provenance 契约（REUSE-1/2/3 + ARCHITECTURE-REUSE §3.1）。
 * @param {object} manifest 零件声明
 * @returns {string[]} 问题列表（空 = 合规）
 */
function provenanceProblems(manifest) {
  const problems = [];
  const p = manifest.provenance;
  if (!p || typeof p !== 'object') return ['缺 provenance（REUSE-1）'];

  if (!DEPTHS.includes(p.depth)) problems.push(`depth 非法：${String(p.depth)}`);
  const allowedOrigins = ORIGIN_FOR_DEPTH[p.depth] ?? [];
  if (allowedOrigins.length > 0 && !allowedOrigins.includes(manifest.origin)) {
    problems.push(`depth=${p.depth} 只允许 origin ∈ {${allowedOrigins.join(',')}}，实际 ${manifest.origin}（REUSE-2）`);
  }

  if (!p.upstream || !DATE_PATTERN.test(String(p.upstream?.accessed))) {
    problems.push('upstream.accessed 必须是 YYYY-MM-DD');
  } else if (!p.upstream.repo && !p.upstream.article) {
    problems.push('upstream 至少要有 repo 或 article');
  }

  // articleMode：无仓库原件，只有公众号文章 + 自摘 EXCERPT.md 的三缺口零件。
  // 口径必须与 `tests/verify-provenance.mjs` 一字不差 —— 一边严一边松，松的那边就是后门。
  //
  // 为什么不采用「把 EXCERPT.md 列进 files[] 并把 completeness 填 complete」这个修法：
  //   `files[]` 的语义是「上游原件归集」，`completeness` 描述的是**原件**的完整度。
  //   EXCERPT.md 是我们自己摘的段落，把它塞进 `files[]` 标 `complete`，等于同时声称
  //   「原件已完整归集」和「原件缺失（顶层 completeness: 'absent'）」—— 这是 REUSE-3
  //   「不许假装完整」里最难被 reviewer 抓住的一种犯法：字段全填满了，读起来最像合规。
  const articleMode =
    Boolean(p.upstream?.article) &&
    DATE_PATTERN.test(String(p.upstream?.accessed ?? '')) &&
    p.completeness === 'absent'
    && Array.isArray(p.paramSurface?.scope) && p.paramSurface.scope.length === 0
    && existsSync(path.join(LIB, String(manifest.id), 'EXCERPT.md'));

  if (!Array.isArray(p.files)) {
    problems.push('files 必须是数组（无原件时填 [] 并满足 articleMode）');
  } else if (p.files.length === 0) {
    if (!articleMode) {
      problems.push('files 为空时必须满足 articleMode：upstream.article + accessed + completeness="absent" + paramSurface.scope=[] + EXCERPT.md 存在（REUSE-3：无原件就必须有原文摘录）');
    }
  } else {
    for (const file of p.files) {
      const label = String(file?.path);
      if (typeof file?.path !== 'string' || file.path.startsWith('shared/parts-library/')) {
        problems.push(`files[].path 必须是相对 shared/parts-library/ 的路径：${label}`);
        continue;
      }
      const abs = path.join(LIB, file.path);
      if (!existsSync(abs)) {
        problems.push(`files[].path 不存在：${label}`);
        continue;
      }
      const actualBytes = statSync(abs).size;
      if (file.bytes !== actualBytes) problems.push(`${label} bytes 声明 ${file.bytes} ≠ 磁盘 ${actualBytes}（REUSE-1 GWT-3）`);
      if (!COMPLETENESS.includes(file.completeness)) problems.push(`${label} completeness 非法：${String(file.completeness)}`);
      if (file.completeness === 'partial' && (!Array.isArray(file.missing) || file.missing.length === 0)) {
        problems.push(`${label} completeness=partial 必须列出 missing[]（REUSE-3）`);
      }
      if (p.depth === 'D4' && file.completeness !== 'complete') {
        problems.push(`${label} depth=D4 要求全部 complete（REUSE-3）`);
      }
    }
  }

  const texts = Array.isArray(p.files) && p.files.length > 0
    ? p.files
      .filter((file) => typeof file?.path === 'string' && existsSync(path.join(LIB, file.path)))
      .map((file) => ({ path: file.path, text: readFileSync(path.join(LIB, file.path), 'utf8') }))
    : [];

  // articleMode 的符号依据只能是 EXCERPT.md（没有 files[] 可比对）。把它并进 evidence 文本，
  // 使 `ported[].symbol` 的 \b 命中判定对两种模式走**同一条**代码路径 —— 分支越少越没有后门。
  if (articleMode) {
    texts.push({
      path: `${manifest.id}/EXCERPT.md`,
      text: readFileSync(path.join(LIB, String(manifest.id), 'EXCERPT.md'), 'utf8'),
    });
  }
  const evidenceLabel = articleMode ? 'EXCERPT.md' : 'files[]';

  if (!Array.isArray(p.ported)) {
    problems.push('ported 必须是数组');
  } else if (p.depth === 'D0' && p.ported.length > 0) {
    problems.push('depth=D0 的零件不得声明 ported 符号（原件一字未用）');
  } else {
    for (const symbol of p.ported) {
      if (typeof symbol?.symbol !== 'string' || symbol.symbol.trim() === '') {
        problems.push('ported[].symbol 必须是非空字符串');
        continue;
      }
      if (!KINDS.includes(symbol.kind)) problems.push(`ported ${symbol.symbol} 的 kind 非法：${String(symbol.kind)}`);
      const hit = texts.some((file) => wordHit(file.text, symbol.symbol));
      if (!hit) problems.push(`ported 符号 ${symbol.symbol} 在 ${evidenceLabel} 里 \b 未命中（禁止编造符号）`);
      // articleMode 下 downgrade 是**唯一**可核的东西：没有原件可比对，降级说明就是全部证据。
      // 所以这里不仅不跳过三问，反而比有原件的零件更严（有原件时还有 bytes/sha256/符号命中可查）。
      if (articleMode) problems.push(...downgradeProblems(symbol, manifest.id));
    }
  }

  // paramSurface 自洽（REUSE-4 v1.1，ARCHITECTURE-REUSE §3.3）：
  // 分母不在本文件里（v1.0 的 `total` 已删除，因为它 8/8 都被填成 enumerated.length）；
  // 这里只校验「移植面边界合法」与「分子真的接线了」两件事。
  const surface = p.paramSurface;
  if (!surface || typeof surface !== 'object') {
    problems.push('缺 paramSurface（REUSE-4）');
  } else {
    const declaredFiles = new Set((Array.isArray(p.files) ? p.files : []).map((file) => file?.path));
    const scope = Array.isArray(surface.scope) ? surface.scope : null;
    if (scope === null) {
      problems.push('paramSurface.scope 必须是数组（无移植面填 []）');
    } else {
      if (p.depth === 'D0' && scope.length > 0) {
        problems.push('depth=D0 的零件不得声明移植面（原件一字未用，scope 必须为空）');
      }
      for (const entry of scope) {
        const label = String(entry?.path);
        if (typeof entry?.path !== 'string' || entry.path.trim() === '') {
          problems.push('paramSurface.scope[].path 必须是非空字符串');
          continue;
        }
        if (!declaredFiles.has(entry.path)) {
          problems.push(`paramSurface.scope 的 ${label} 不在 provenance.files[] 内（移植面必须是归集文件的子集）`);
        }
        if (!/\.(?:js|mjs|ts)$/.test(entry.path)) {
          problems.push(`paramSurface.scope 的 ${label} 不是 JS/TS 文件，param-pool 无法抽取（分母恒 0）`);
        }
        if (typeof entry?.reason !== 'string' || entry.reason.trim() === '') {
          problems.push(`paramSurface.scope 的 ${label} 缺 reason（每个纳入的文件都要一句话说明理由）`);
        }
      }
    }

    const enumerated = Array.isArray(surface.enumerated) ? surface.enumerated : null;
    if (enumerated === null) {
      problems.push('paramSurface.enumerated 必须是数组');
    } else {
      // 架构 §3.1 明文：enumerated = 所有 ported[].params 键的并集（脚本断言二者相等）
      const wiredKeys = new Set();
      for (const symbol of Array.isArray(p.ported) ? p.ported : []) {
        for (const key of Object.keys(symbol?.params ?? {})) wiredKeys.add(key);
      }
      for (const name of enumerated) {
        if (!wiredKeys.has(name)) {
          problems.push(`enumerated 中的 ${name} 不在任何 ported[].params 里（未接线的名字 = 分子造假）`);
        }
        const hit = texts.some((file) => wordHit(file.text, name));
        if (!hit) problems.push(`paramSurface.enumerated 中的 ${name} 在原件里未命中（不能凭空造分子）`);
      }
      for (const key of wiredKeys) {
        if (!enumerated.includes(key)) problems.push(`ported[].params 的键 ${key} 不在 enumerated 中（漏登记）`);
      }
    }

    if (typeof surface.evidence !== 'string' || surface.evidence.trim() === '') {
      problems.push('paramSurface.evidence 必填（说明枚举依据，可复核）');
    }
  }

  if (!p.license || typeof p.license.spdx !== 'string' || p.license.spdx.trim() === '') {
    problems.push('license.spdx 必填（无声明填 NOASSERTION）');
  } else {
    if (typeof p.license.evidence !== 'string' || p.license.evidence.trim() === '') {
      problems.push('license.evidence 必填（REUSE-7）');
    }
    if (!LICENSE_GRADES.includes(p.license.grade)) {
      problems.push(`license.grade 非法：${String(p.license.grade)}（L1/L2/L3/L4）`);
    } else if (p.license.grade === 'L1' && p.license.spdx === 'NOASSERTION') {
      problems.push('L1（有 LICENSE 文件）不得填 NOASSERTION');
    } else if ((p.license.grade === 'L3' || p.license.grade === 'L4') && p.license.spdx !== 'NOASSERTION') {
      problems.push(`${p.license.grade} 必须填 NOASSERTION`);
    }
    if (p.license.grade === 'L4' && p.license.blocked !== true) {
      problems.push('L4（明示不授权）必须标记 blocked: true');
    }
    if (p.license.grade !== 'L4' && p.license.blocked === true) {
      problems.push('只有 L4 可以标记 blocked: true');
    }
  }

  return problems;
}

/** 递归查找 sites/ 下所有 .ts 文件（用于附加 C 的 grep 断言）。 */
function collectSiteFiles(dir) {
  const found = [];
  if (!existsSync(dir)) return found;
  for (const name of readdirSync(dir).slice().sort()) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) found.push(...collectSiteFiles(full));
    else if (name.endsWith('.ts')) found.push(full);
  }
  return found;
}

/**
 * 磁盘上「有 part.manifest.ts」的零件目录（磁盘侧真值）。
 *
 * 用途：本脚本原先用 `parts.length === 8` 这种**字面量**去卡注册表条目数。
 * 字面量一旦过时就会变成「永久红」，而且它不检验任何东西 —— 把 8 改成 10 只是把过时的
 * 事实换成新的事实。改为与磁盘目录交叉核对：注册表少一件、多一件、或指向不存在的目录都会红，
 * 且注册表扩容时不需要改断言（与门 10 drift 的三方相等是同一思路）。
 * @returns {string[]} 目录名（升序）
 */
function manifestDirectories() {
  return readdirSync(LIB, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'registry')
    .map((entry) => entry.name)
    .filter((name) => existsSync(path.join(LIB, name, 'part.manifest.ts')))
    .sort();
}

/** 主流程。 */
async function main() {
  const registry = await loadTsModule(path.join(LIB, 'registry', 'index.ts'));
  const parts = registry.PART_MANIFESTS;

  check(Array.isArray(parts), 'registry/index.ts 必须导出 PART_MANIFESTS 数组');
  const diskDirs = manifestDirectories();
  const registeredIds = parts.map((manifest) => manifest.id).slice().sort();
  check(
    JSON.stringify(registeredIds) === JSON.stringify(diskDirs),
    `注册表与磁盘零件目录不一致：磁盘 [${diskDirs.join(', ')}] vs 注册 [${registeredIds.join(', ')}]（REUSE-1：有 manifest 就必须登记）`,
  );

  let integrityError = null;
  try {
    registry.assertPartRegistryIntegrity();
  } catch (error) {
    integrityError = error;
  }
  check(integrityError === null, `assertPartRegistryIntegrity 失败：${integrityError?.message ?? ''}`);

  // 同一 bundle 内同时拿到 installParts() 与 resolvePart()，才能验证「装进去后能按 ref 取回工厂」。
  const combo = await loadTsSource(`
    export { installParts, assertAllPartsInstalled, PART_ASSEMBLY_MODULES } from './shared/parts-library/registry/install';
    export { resolvePart, listPartManifests, hasPart } from './shared/contract/parts-registry';
  `);

  const firstInstall = combo.installParts();
  const secondInstall = combo.installParts();

  console.log(`[verify-parts-assembly] 零件声明 ${parts.length} 件，逐件断言：`);

  const summary = [];

  for (const declared of parts) {
    const id = declared.id;
    const dirName = path.basename(path.dirname(declared.entry));
    const entryAbs = path.join(REPO_ROOT, declared.entry);
    const problems = [];
    const tiers = [];
    let depth = 'UNKNOWN';
    let overallCompleteness = 'UNKNOWN';

    // ── Tier-1 形状 ─────────────────────────────────────────────────
    let module = null;
    if (!check(existsSync(entryAbs), `${id}: entry 文件不存在 ${declared.entry}`)) {
      problems.push('entry 文件不存在');
    } else {
      try {
        module = await loadTsModule(entryAbs);
        tiers.push('T1');
      } catch (error) {
        problems.push(`import 失败（构造期可能访问了 DOM）：${error?.message ?? error}`);
      }
    }
    if (dirName !== id) problems.push(`目录名 ${dirName} ≠ id ${id}`);

    if (module) {
      if (typeof module.default !== 'function') problems.push('entry 未 export default 函数（Tier-1 硬要求）');
      if (typeof module.createPart !== 'function') problems.push('entry 未导出 createPart 函数');
      if (module.manifest?.id !== id) problems.push(`module.manifest.id=${String(module.manifest?.id)} 与声明 ${id} 不一致`);
      if (!declared.provenance) problems.push('registry 声明缺 provenance');
    }
    for (const problem of provenanceProblems(declared)) problems.push(problem);

    const provenance = declared.provenance;
    depth = provenance?.depth ?? 'UNKNOWN';
    if (provenance?.files) {
      const hasPartial = provenance.files.some((file) => file.completeness === 'partial');
      const allAbsent = provenance.files.every((file) => file.completeness === 'absent');
      overallCompleteness = allAbsent ? 'absent' : hasPartial ? 'partial' : 'complete';
    }

    // ── Tier-2 / Tier-D0：从注册中心取回工厂再构造 ────────────────────
    if (DEPTHS.includes(depth) && typeof module?.createPart === 'function') {
      let registration = null;
      try {
        registration = combo.resolvePart(id);
        tiers.push('registered');
      } catch (error) {
        problems.push(`installParts 后仍取不到零件：${error?.message ?? error}`);
      }

      const factory = registration?.factory ?? null;
      if (factory && typeof factory === 'function') {
        if (depth === 'D0') {
          let caught = null;
          try {
            factory(stubOptions(id));
          } catch (error) {
            caught = error;
          }
          if (caught === null) {
            problems.push('depth=D0 构造应抛 E_PART_NOT_MOUNTED，实际未抛错');
          } else {
            if (caught.code !== 'E_PART_NOT_MOUNTED') problems.push(`D0 错误码应为 E_PART_NOT_MOUNTED，实际 ${String(caught.code ?? caught.name)}`);
            if (typeof caught.message !== 'string' || !caught.message.includes(id)) problems.push('D0 错误信息应包含零件 id');
          }
          tiers.push('T0');
        } else {
          let instance = null;
          try {
            instance = factory(stubOptions(id));
            tiers.push('T2');
          } catch (error) {
            problems.push(`Tier-2 构造抛错：${error?.message ?? error}`);
          }
          if (instance !== null && typeof instance === 'object') {
            if (typeof instance.dispose !== 'function') problems.push('实例缺 dispose()');
            if (typeof instance.update === 'function') {
              try {
                instance.update(0.016);
              } catch (error) {
                problems.push(`update(0.016) 抛错：${error?.message ?? error}`);
              }
            }
            if (typeof instance.dispose === 'function') {
              try {
                instance.dispose();
                instance.dispose();
                tiers.push('dispose×2');
              } catch (error) {
                problems.push(`dispose() 非幂等：${error?.message ?? error}`);
              }
            }
            if (typeof instance.update === 'function') {
              try {
                instance.update(0.016);
              } catch (error) {
                problems.push(`dispose 后 update 抛错：${error?.message ?? error}`);
              }
            }
          } else if (instance !== null) {
            problems.push('构造函数未返回实例对象');
          }
        }
      }
    }

    const ok = problems.length === 0;
    if (!ok) failures.push(...problems.map((problem) => `${id}: ${problem}`));
    summary.push({ id, depth, completeness: overallCompleteness, tiers: tiers.join('+'), ok });
    console.log(
      `  ${ok ? 'OK  ' : 'FAIL'} ${id.padEnd(15)} depth=${depth.padEnd(2)} completeness=${overallCompleteness.padEnd(8)} ` +
      `tiers=${tiers.join('+') || '-'}${ok ? '' : `\n         原因：${problems.join('；')}`}`,
    );
  }

  // ── 附加 A：装配器幂等 ──────────────────────────────────────────────
  // 期望值一律取 `parts.length`（注册表实际条目数），不再写字面量：
  // 装配表必须覆盖**全部**已注册零件，这才是要守的不变式；写死数字只能测出「今天恰好 10 件」。
  console.log('[verify-parts-assembly] 装配器幂等：');
  check(firstInstall.total === parts.length, `装配表应覆盖 ${parts.length} 件，实际 ${firstInstall.total}`);
  check(firstInstall.installed.length === parts.length, `首次安装应新装 ${parts.length} 件，实际 ${firstInstall.installed.length}`);
  check(firstInstall.reused.length === 0, `首次安装不应有复用，实际 ${firstInstall.reused.length}`);
  check(secondInstall.installed.length === 0, `二次安装应新装 0 件，实际 ${secondInstall.installed.length}`);
  check(secondInstall.reused.length === parts.length, `二次安装应复用 ${parts.length} 件，实际 ${secondInstall.reused.length}`);
  // notMounted 的期望集合 = 所有 D0 零件（D0 按契约不可挂载，必须抛 E_PART_NOT_MOUNTED）。
  // 由上面的逐件结果机械推导，避免「新增 D0 零件就要手改一行字符串」的隐性耦合。
  const expectedNotMounted = summary.filter((entry) => entry.depth === 'D0').map((entry) => entry.id).sort().join(',');
  const notMounted = [...firstInstall.notMounted].sort().join(',');
  check(notMounted === expectedNotMounted, `未装配清单应恰为全部 D0 零件 [${expectedNotMounted}]，实际 [${notMounted}]`);
  check(combo.listPartManifests().length === parts.length, `装配后 listPartManifests 应为 ${parts.length} 件，实际 ${combo.listPartManifests().length}`);
  console.log(`  首次 installed=${firstInstall.installed.length} reused=${firstInstall.reused.length} notMounted=[${firstInstall.notMounted.join(', ')}]`);
  console.log(`  二次 installed=${secondInstall.installed.length} reused=${secondInstall.reused.length}（幂等）`);

  // ── 附加 B：legacy 溯源冻结快照自洽 ─────────────────────────────────
  console.log('[verify-parts-assembly] legacy 溯源冻结快照：');
  let legacy = null;
  let legacySnapshot = null;
  try {
    legacy = await loadTsModule(path.join(LIB, 'legacy-provenance.ts'));
    const snapshot = legacy.LEGACY_PARTS;
    legacySnapshot = snapshot;
    const ids = Object.keys(snapshot);
    check(ids.length === 7, `legacy 快照必须恒为 7 条，实际 ${ids.length}`);
    check(Array.isArray(snapshot.still) && snapshot.still.length === 0, 'legacy 快照里 still 必须为零零件');
    check(snapshot['koi-pond']?.[0]?.legacySource === 'zz85-koi', '/koi 三站的 legacySource 必须是 zz85-koi（引用名 ≠ 零件 id）');
    check(snapshot['koi-pond']?.[0]?.partId === 'koi', 'zz85-koi 必须映射到零件 id koi');
    legacy.assertLegacyPartsIntegrity();
    const recomputed = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
    check(
      recomputed === legacy.LEGACY_PARTS_HASH,
      `legacy 快照内容哈希已变化（钉死 ${String(legacy.LEGACY_PARTS_HASH).slice(0, 16)}…，实际 ${recomputed.slice(0, 16)}…）`,
    );

    const manifestById = new Map(parts.map((manifest) => [manifest.id, manifest]));
    const gapIds = new Set(['dandelion', 'blow-input', 'paper-plane']);
    for (const siteId of ids) {
      for (const entry of snapshot[siteId] ?? []) {
        if (gapIds.has(entry.partId)) continue;
        const manifest = manifestById.get(entry.partId);
        if (!check(Boolean(manifest), `legacy ${siteId} 引用了不存在的零件 ${entry.partId}`)) continue;
        check(
          JSON.stringify(entry.provenance) === JSON.stringify(manifest.provenance),
          `legacy ${siteId}/${entry.partId} 的 provenance 与 part.manifest.ts 不同源（禁止两处漂移）`,
        );
      }
    }
    console.log(`  7 条站点映射 · 零件引用 ${ids.reduce((sum, id) => sum + (snapshot[id]?.length ?? 0), 0)} 条 · 哈希 ${String(legacy.LEGACY_PARTS_HASH).slice(0, 16)}…`);
  } catch (error) {
    failures.push(`legacy 溯源冻结快照校验失败：${error?.message ?? error}`);
  }

  // ── 附加 B2：许可证分级普查（主理人 2026-11-18 核准：L1=2 / L3=8 / L4=1，合计 11）──
  if (legacySnapshot) {
    const gapIds = ['dandelion', 'blow-input', 'paper-plane'];
    const census = parts.map((manifest) => ({ id: manifest.id, provenance: manifest.provenance }));
    // 只有「尚未注册」的缺口才用 legacy 占位补一遍。
    // 双计是真实缺陷：dandelion / blow-input 一旦注册进 PART_MANIFESTS，若这里无条件再补一条，
    // 普查会出现同一个 id 两条记录（一条 manifest + 一条 legacy），合计从 11 变 13、L3 从 8 变 10 ——
    // 数字自己「长大」，而没有任何一件零件真的变了许可证。这类错最容易被当成「注册后正常变化」放过去。
    const missingGaps = gapIds.filter((id) => !parts.some((manifest) => manifest.id === id));
    for (const id of gapIds) {
      if (!missingGaps.includes(id)) continue;
      const found = Object.values(legacySnapshot).flat().find((entry) => entry.partId === id);
      census.push({ id, provenance: found?.provenance });
    }
    const grades = { L1: 0, L2: 0, L3: 0, L4: 0 };
    for (const item of census) {
      const grade = item.provenance?.license?.grade;
      if (!LICENSE_GRADES.includes(grade)) {
        failures.push(`${item.id}: license.grade 缺失或非法（${String(grade)}）`);
        continue;
      }
      grades[grade] += 1;
    }
    const blocked = census.filter((item) => item.provenance?.license?.blocked === true).map((item) => item.id);
    // 普查覆盖面 = 全部已注册零件 + 尚未注册的 legacy 缺口（结构推导，不写字面量）
    check(
      census.length === parts.length + missingGaps.length,
      `许可证普查应覆盖 ${parts.length + missingGaps.length} 件（${parts.length} 已注册 + ${missingGaps.length} 未注册缺口 ${missingGaps.join(',') || '无'}），实际 ${census.length}`,
    );
    check(grades.L1 === 2, `L1（有 LICENSE 文件）应恰好 2 件，实际 ${grades.L1}`);
    check(grades.L3 === 8, `L3（无声明沉默）应恰好 8 件，实际 ${grades.L3}`);
    check(grades.L4 === 1, `L4（明示不授权）应恰好 1 件，实际 ${grades.L4}`);
    check(blocked.length === 1 && blocked[0] === 'sylva', `blocked 只应有 sylva，实际 [${blocked.join(',')}]`);
    for (const id of gapIds) {
      const item = census.find((entry) => entry.id === id);
      check(item?.provenance?.completeness === 'absent', `缺口零件 ${id} 必须标 completeness='absent'（files 为空）`);
    }
    console.log(
      `  许可证分级：L1=${grades.L1} L2=${grades.L2} L3=${grades.L3} L4=${grades.L4}（合计 ${census.length}）· blocked=[${blocked.join(',')}]`,
    );
  }

  // ── 附加 C：legacy-provenance 不得被 sites/** 引用 ─────────────────
  const siteFiles = collectSiteFiles(path.join(REPO_ROOT, 'sites'));
  const leaked = siteFiles.filter((file) => readFileSync(file, 'utf8').includes('legacy-provenance'));
  check(leaked.length === 0, `legacy-provenance 被站点源码引用（会进产物字节）：${leaked.map((file) => path.relative(REPO_ROOT, file)).join(', ')}`);
  console.log(`  legacy-provenance 未被 sites/** 引用（扫描 ${siteFiles.length} 个 .ts 文件，命中 ${leaked.length}）`);

  // ── 汇总 ───────────────────────────────────────────────────────────
  const d0 = summary.filter((entry) => entry.depth === 'D0').map((entry) => entry.id);
  const constructible = summary.filter((entry) => entry.depth !== 'D0' && entry.ok).map((entry) => entry.id);
  console.log(
    `[verify-parts-assembly] 汇总：Tier-1 ${summary.filter((e) => e.ok).length}/${summary.length} 件 · ` +
    `可构造 ${constructible.length} 件 [${constructible.join(', ')}] · D0 ${d0.length} 件 [${d0.join(', ')}]`,
  );

  if (failures.length > 0) {
    console.error(`[verify-parts-assembly] ❌ ${failures.length} 项失败：`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(`[verify-parts-assembly] ✅ PASS：${checks} 项断言（Tier-1 / Tier-1P 溯源契约 / Tier-2 / Tier-D0 / 装配器幂等 / legacy 快照）`);
}

await main();
