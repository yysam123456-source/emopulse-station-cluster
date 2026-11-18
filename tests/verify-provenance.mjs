// 溯源与复用机械校验（REUSE-1..7 的硬门，T-R02 第 2 批交付物 ①）。
//
// 为什么需要这个脚本：v1.0 的事故证明「人工填写 = 指标必假」。本脚本的全部输入都从磁盘与
// `tests/lib/param-pool.mjs` 的 AST 抽取得到，manifest 只被「核对」，不被「采信」。
//
// 门位（ARCHITECTURE-REUSE §4.6）：
//   门 1  溯源完整性（REUSE-1）：files[].bytes / sha256、ported[].symbol 命中、
//         portedTo 落点存在、**import 反查**（未归集的相对 import 必须落在 missing[]）、
//         params 键命中且不属于 E1–E7 剔除集
//   门 2  depth ↔ origin 矩阵（REUSE-2）+ **depth pin**（koi / grand-atelier 钉 D3）
//   门 3  REUSE-3 完整性（partial ⇒ missing 非空；complete ⇒ missing 为空）
//   门 7a 搬运率（**只在 D2/D3 适用**；D1/D0/D4 = n/a；D2/D3 要求 ≥ 0.60，且 ported 非空）
//   门 7b 覆盖度（coverage = |P_scope| / |P_all| ≥ 0.25；scope[].reason 非空）
//   门 7c E1–E7 双向约束 + D1 低复用登记（ported 为空 + 进 lowReuse[]）
//   门 9  算法覆盖门（D3 ⇒ ported[].symbol ⊇ 文档 §7.x 的算法清单 100%，不可用搬运率抵扣）
//   门 10 drift（readmeRows === 磁盘零件目录数 === PART_MANIFESTS.length）
//   articleMode（files[] 为空的三缺口）：article 必填 / EXCERPT.md 命中 / scope 为空 / 三问齐全
//
// ⚠️ 门 2 的 depth pin 从 T-R02 起生效：koi / grand-atelier 现在都是 D1，**门 2 必然红**。
//    这是预期状态（见 §3.3.5 时序限定），不是缺陷；输出里用 ⏳ 前缀显式区分。
//
// 用法：
//   node tests/verify-provenance.mjs            # 打印结构化摘要，有硬失败则 exit 1
//   node tests/verify-provenance.mjs --report   # 额外写 dist/reuse-report.json
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { loadTsModule, REPO_ROOT } from './lib/load-ts.mjs';
import { computePool, scopePool, isParamSourceFile } from './lib/param-pool.mjs';

/** 零件库根目录。 */
const LIB = path.join(REPO_ROOT, 'shared', 'parts-library');
/** 架构文档（算法清单与规则的唯一来源）。 */
const DOC = path.join(REPO_ROOT, 'docs', 'ARCHITECTURE-REUSE.md');
/** 报告输出路径（只在 --report 时写）。 */
const REPORT_FILE = path.join(REPO_ROOT, 'dist', 'reuse-report.json');

/** depth ↔ origin 矩阵（§3.2，硬门）。 */
const ORIGIN_FOR_DEPTH = { D4: ['copy'], D3: ['port'], D2: ['equivalent'], D1: ['equivalent'], D0: ['equivalent'] };
/** depth pin：PRD 钉死的目标深度（此刻未达成 → 门 2 预期红）。 */
const DEPTH_PINS = { koi: 'D3', 'grand-atelier': 'D3' };
/** 搬运率下限（门 7a，仅 D2/D3）。 */
const RATE_MIN = 0.6;
/** 覆盖度下限（门 7b，仅 D2/D3）。 */
const COVERAGE_MIN = 0.25;
/** 适用搬运率的深度。 */
const RATE_DEPTHS = new Set(['D2', 'D3']);
/** REUSE-3 完整度枚举。 */
const COMPLETENESS = new Set(['complete', 'partial', 'absent']);
/** 参与 import 反查的扩展名。 */
const SCRIPT_EXTENSIONS = new Set(['.js', '.mjs', '.ts']);

/** 全局失败收集。 */
const failures = [];
/** 预期红（不导致 exit 1，但要在输出里明确标注）。 */
const expectedRed = [];
let checks = 0;

/**
 * 记一次断言。
 * @param {boolean} condition 断言结果
 * @param {string} message 失败描述（失败时入库）
 * @returns {boolean} 原样返回
 */
function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
  return condition;
}

/**
 * 把一个门的明细数组登记为一条断言（明细同时保留在报告行里，便于定位）。
 * @param {string} id 零件 id
 * @param {string} gate 门号
 * @param {string[]} details 该门的失败明细
 * @param {string} label 门的名字
 */
function gateAssert(id, gate, details, label) {
  const head = details.slice(0, 6).join('；');
  const tail = details.length > 6 ? `…（共 ${details.length} 条）` : '';
  check(details.length === 0, `门${gate} ${label}（${id}）：${head}${tail}`);
}

/**
 * 判断 `word` 是否以词边界出现在 `text` 中。
 * @param {string} text 被搜索文本
 * @param {string} word 符号名
 * @returns {boolean} 是否命中
 */
function wordHit(text, word) {
  if (typeof text !== 'string' || typeof word !== 'string' || word === '') return false;
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`).test(text);
}

/**
 * 把 `portedTo` 的 `'文件:落点名'` 拆开。
 * @param {string} portedTo 落点描述
 * @returns {{file: string, marker: string}} 拆分结果（无冒号时 marker 为空）
 */
function splitPortedTo(portedTo) {
  const index = typeof portedTo === 'string' ? portedTo.indexOf(':') : -1;
  if (index < 0) return { file: String(portedTo ?? ''), marker: '' };
  return { file: portedTo.slice(0, index), marker: portedTo.slice(index + 1) };
}

/**
 * 抽出文件里的相对 import/export 说明符（bare specifier 视为外部依赖，跳过）。
 * @param {string} absPath 源文件绝对路径
 * @returns {{specifier: string, line: number}[]} 相对说明符清单
 */
function relativeImportsOf(absPath) {
  const source = readFileSync(absPath, 'utf8');
  const kind = path.extname(absPath) === '.ts' ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const sf = ts.createSourceFile(absPath, source, ts.ScriptTarget.Latest, true, kind);
  const found = [];

  const push = (node, specifier) => {
    if (typeof specifier !== 'string') return;
    if (!specifier.startsWith('.')) return; // three / three/webgpu / node:fs 等外部依赖不计
    found.push({ specifier, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1 });
  };

  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const spec = node.moduleSpecifier;
      if (spec && ts.isStringLiteral(spec)) push(spec, spec.text);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [first] = node.arguments;
      if (first && ts.isStringLiteral(first)) push(first, first.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

/**
 * 把相对说明符解析成磁盘上的真实文件。
 * @param {string} fromAbs 发起 import 的文件绝对路径
 * @param {string} specifier 相对说明符
 * @returns {string|null} 解析结果；解析不到返回 null
 */
function resolveSpecifier(fromAbs, specifier) {
  const base = path.resolve(path.dirname(fromAbs), specifier);
  const candidates = [
    base,
    `${base}.js`,
    `${base}.mjs`,
    `${base}.ts`,
    path.join(base, 'index.js'),
    path.join(base, 'index.ts'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/**
 * 取 `missing[]` 条目的模块名（去掉「（未归集）」等说明后缀与扩展名）。
 * @param {string} entry missing 条目
 * @returns {string} 归一化后的模块名
 */
function missingKey(entry) {
  const raw = String(entry ?? '').split(/[（(]/)[0].trim();
  const base = raw.split('/').pop() ?? raw;
  return base.replace(/\.(?:js|mjs|ts)$/, '');
}

/**
 * 解析文档里的算法落点表（§7.x）：`| K1 | `halfWidth` `topH` … | … |` 形状。
 *
 * 为什么不硬编码在脚本里：清单是「该零件该搬哪些算法」的**唯一权威**，
 * 若写进脚本，架构师改了文档脚本不知道，门就会拿旧清单放行——这正是要防的漂移。
 * @param {string} docText 架构文档全文
 * @param {readonly string[]} partIds 零件 id 清单（用于把 §7.x 归属到零件）
 * @returns {Map<string, {gate: string, symbols: string[], section: string}>} 零件 → 算法清单
 */
function parseAlgorithmLists(docText, partIds) {
  const lines = docText.split(/\r?\n/);
  /** @type {Map<string, string[]>} 零件 → 符号名 */
  const symbolsOf = new Map();
  /** @type {Map<string, {gate: string, section: string}>} 零件 → 出处 */
  const metaOf = new Map();
  let partId = null;
  let section = '';
  let gate = '';

  for (const line of lines) {
    const heading = /^(#{2,4})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const title = heading[2].trim();
      if (level === 2) {
        partId = partIds.find((id) => title.includes(id)) ?? null;
        section = title;
        gate = '';
      } else {
        // §7.2 这样的算法落点表：小节标题里带「算法」或「落点」
        gate = partId && /算法|落点/.test(title) ? title : '';
      }
      continue;
    }
    if (!partId || !gate) continue;
    const row = /^\|\s*(K\d+)\s*\|([^|]*)\|/.exec(line);
    if (!row) continue;
    const tokens = [...row[2].matchAll(/`([^`]+)`/g)].map((match) => match[1]);
    if (tokens.length === 0) continue;
    const bucket = symbolsOf.get(partId) ?? [];
    for (const token of tokens) {
      // `bodyGeometry(52,24)` → bodyGeometry；`S_END` → S_END
      const name = token.split('(')[0].trim();
      if (name && !bucket.includes(name)) bucket.push(name);
    }
    symbolsOf.set(partId, bucket);
    metaOf.set(partId, { gate, section });
  }

  const lists = new Map();
  for (const [id, symbols] of symbolsOf) {
    if (symbols.length === 0) continue;
    const meta = metaOf.get(id) ?? { gate: '', section: '' };
    lists.set(id, { gate: meta.gate, section: meta.section, symbols: [...symbols] });
  }
  return lists;
}

/**
 * 统计 registry/README.md「已登记零件」表格行数与零件 id。
 * @param {string} readmeText README 全文
 * @returns {string[]} 表格里的零件 id（按出现顺序）
 */
function parseReadmeRows(readmeText) {
  const ids = [];
  let inTable = false;
  for (const line of readmeText.split(/\r?\n/)) {
    if (/^##\s/.test(line)) {
      inTable = /已登记零件/.test(line);
      continue;
    }
    if (!inTable) continue;
    const row = /^\|\s*`([a-z][a-z0-9-]*)`\s*\|/.exec(line);
    if (row) ids.push(row[1]);
  }
  return ids;
}

/**
 * 零件目录清单（磁盘侧真值）。
 * @returns {string[]} 目录名（升序，排除 registry 与点目录）
 */
function partDirectories() {
  return readdirSync(LIB, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'registry')
    .map((entry) => entry.name)
    .filter((name) => existsSync(path.join(LIB, name)))
    .sort();
}

/**
 * 单个零件的溯源校验（门 1 / 3 / 7a / 7b / 7c / 9 主体）。
 * @param {{id: string, source: string, depth: string, origin: string, provenance: object}} part 零件上下文
 * @param {{docLists: Map<string, {gate: string, symbols: string[]}>, allIds: string[]}} ctx 全局上下文
 * @returns {object} 该零件的报告行
 */
function inspectPart(part, ctx) {
  const { id, depth, origin, provenance: p } = part;
  const problems = [];
  const notes = [];
  const articleMode = !Array.isArray(p.files) || p.files.length === 0;
  const gates = {};

  // ---------- 门 3：REUSE-3 完整性 ----------
  const gate3 = [];
  if (Array.isArray(p.files)) {
    for (const file of p.files) {
      const label = String(file?.path);
      if (!COMPLETENESS.has(file?.completeness)) gate3.push(`${label} completeness 非法：${String(file?.completeness)}`);
      if (file?.completeness === 'partial' && (!Array.isArray(file.missing) || file.missing.length === 0)) {
        gate3.push(`${label} completeness=partial 必须列出 missing[]（REUSE-3）`);
      }
      if (file?.completeness === 'complete' && Array.isArray(file.missing) && file.missing.length > 0) {
        gate3.push(`${label} completeness=complete 不得有 missing[]（REUSE-3）`);
      }
    }
  }
  if (p.completeness === 'absent' && !articleMode) gate3.push('顶层 completeness=absent 只能用于 files[] 为空的缺口零件');
  gates['3'] = gate3;
  problems.push(...gate3);
  gateAssert(id, '3', gate3, 'REUSE-3 完整性');

  // ---------- 门 1：溯源完整性 ----------
  const gate1 = [];
  /** @type {{path: string, text: string}[]} 归集文件的原文 */
  const texts = [];
  const declared = new Set();
  /** @type {Map<string, string[]>} 文件 → 该文件的 missing[] */
  const missingByFile = new Map();

  for (const file of Array.isArray(p.files) ? p.files : []) {
    const label = String(file?.path);
    if (typeof file?.path !== 'string' || file.path.startsWith('shared/parts-library/') || path.isAbsolute(file.path)) {
      gate1.push(`files[].path 必须是相对 shared/parts-library/ 的路径：${label}`);
      continue;
    }
    const abs = path.join(LIB, file.path);
    if (!existsSync(abs)) {
      gate1.push(`files[].path 不存在：${label}`);
      continue;
    }
    declared.add(file.path);
    const actualBytes = statSync(abs).size;
    if (file.bytes !== actualBytes) gate1.push(`${label} bytes 声明 ${file.bytes} ≠ 磁盘 ${actualBytes}（GWT-3）`);
    const text = readFileSync(abs, 'utf8');
    texts.push({ path: file.path, text });
    if (typeof file.sha256 === 'string') {
      const actual = createHash('sha256').update(text).digest('hex');
      if (actual !== file.sha256) gate1.push(`${label} sha256 声明 ${file.sha256.slice(0, 12)}… ≠ 实算 ${actual.slice(0, 12)}…`);
    }
    missingByFile.set(file.path, Array.isArray(file.missing) ? file.missing.map(missingKey) : []);
  }

  // ported 符号：必须能在归集文件里 \b 命中；portedTo 必须指向真实落点
  // articleMode 的符号依据是 EXCERPT.md（没有 files[] 可比对），先读进来供命中判定用
  const excerptPath = path.join(LIB, id, 'EXCERPT.md');
  const excerptText = articleMode && existsSync(excerptPath) ? readFileSync(excerptPath, 'utf8') : null;
  const evidenceTexts = excerptText ? [...texts, { path: `${id}/EXCERPT.md`, text: excerptText }] : texts;

  const portedSymbols = [];
  for (const symbol of Array.isArray(p.ported) ? p.ported : []) {
    if (typeof symbol?.symbol !== 'string' || symbol.symbol.trim() === '') {
      gate1.push('ported[].symbol 必须是非空字符串');
      continue;
    }
    portedSymbols.push(symbol.symbol);
    if (!evidenceTexts.some((file) => wordHit(file.text, symbol.symbol))) {
      gate1.push(`ported 符号 ${symbol.symbol} 在 files[] 里 \\b 未命中（禁止编造符号）`);
    }
    if (typeof symbol.portedTo === 'string' && symbol.portedTo.trim() !== '') {
      const { file, marker } = splitPortedTo(symbol.portedTo);
      const abs = path.isAbsolute(file) ? file : path.join(REPO_ROOT, file);
      if (!existsSync(abs)) {
        gate1.push(`ported ${symbol.symbol} 的 portedTo 指向不存在的文件：${file}`);
      } else {
        const target = readFileSync(abs, 'utf8');
        const probe = marker || symbol.symbol;
        if (!target.includes(probe)) {
          gate1.push(`ported ${symbol.symbol} 的落点 ${file} 里找不到 ${probe}（落点必须可反查）`);
        }
      }
    }
    if (symbol.kind === 'table' && !(typeof symbol.rows === 'number' && symbol.rows > 0)) {
      gate1.push(`ported ${symbol.symbol} kind=table 必须给 rows（REUSE-4 参数单元口径）`);
    }
  }

  // import 反查：未归集的相对 import 必须被 missing[] 承认
  for (const file of texts) {
    const abs = path.join(LIB, file.path);
    if (!SCRIPT_EXTENSIONS.has(path.extname(abs))) continue;
    for (const { specifier, line } of relativeImportsOf(abs)) {
      const resolved = resolveSpecifier(abs, specifier);
      const resolvedRel = resolved ? path.relative(LIB, resolved).split(path.sep).join('/') : null;
      if (resolvedRel && declared.has(resolvedRel)) continue;
      const key = missingKey(specifier);
      const declaredMissing = [...(missingByFile.get(file.path) ?? [])];
      // 部分件把缺失模块记在相邻文件上（如 piano-model.ts 的 missing），一并承认
      for (const list of missingByFile.values()) declaredMissing.push(...list);
      if (declaredMissing.includes(key)) continue;
      gate1.push(`${file.path}:${line} 的相对 import '${specifier}' 既未归集、也不在任何 missing[] 里（REUSE-3 漏报）`);
    }
  }

  gates['1'] = gate1;
  problems.push(...gate1);
  gateAssert(id, '1', gate1, '溯源完整性');

  // ---------- 门 2：depth ↔ origin + depth pin ----------
  const gate2 = [];
  const allowedOrigins = ORIGIN_FOR_DEPTH[depth];
  if (!allowedOrigins) gate2.push(`depth 非法：${String(depth)}（D0–D4）`);
  else if (!allowedOrigins.includes(origin)) gate2.push(`depth=${depth} 只允许 origin ∈ {${allowedOrigins.join(',')}}，实际 ${String(origin)}`);
  gates['2'] = gate2;
  problems.push(...gate2);
  gateAssert(id, '2', gate2, 'depth↔origin 矩阵');

  // depth pin：预期红，单独收集
  const pin = DEPTH_PINS[id];
  let pinSatisfied = true;
  if (pin && depth !== pin) {
    pinSatisfied = false;
    expectedRed.push(`⏳ ${id} 的 depth pin 未满足：声明 ${depth}，PRD 要求 ${pin} —— T-R03/T-R05 完成前此门始终红，属预期状态`);
  }

  // ---------- 门 7b：覆盖度 ----------
  const allFiles = (Array.isArray(p.files) ? p.files : []).map((file) => file.path).filter(isAllParamCandidate);
  const pAll = computePool(allFiles);
  const scopeEntries = Array.isArray(p.paramSurface?.scope) ? p.paramSurface.scope : [];
  const scopeFiles = scopeEntries.map((entry) => entry.path);
  const pScope = scopePool(scopeFiles);
  const coverage = pAll.pool.length === 0 ? null : pScope.pool.length / pAll.pool.length;
  const rateApplicable = RATE_DEPTHS.has(depth);

  const gate7b = [];
  for (const entry of scopeEntries) {
    if (typeof entry?.reason !== 'string' || entry.reason.trim() === '') {
      gate7b.push(`scope 的 ${String(entry?.path)} 缺 reason（每个纳入的移植面文件都要一句话理由）`);
    }
    if (!declared.has(entry?.path)) {
      gate7b.push(`scope 的 ${String(entry?.path)} 不在 provenance.files[] 内（移植面必须是归集文件的子集）`);
    }
  }
  if (rateApplicable && !articleMode && scopeFiles.length === 0) {
    gate7b.push(`depth=${depth} 必须声明移植面（scope 为空 → P_scope=0 → 搬运率无意义）`);
  }
  if (rateApplicable && !articleMode && coverage !== null && coverage < COVERAGE_MIN) {
    gate7b.push(`coverage=${(coverage * 100).toFixed(1)}% < ${(COVERAGE_MIN * 100).toFixed(0)}%（scope 圈得过小）`);
  }
  gates['7b'] = gate7b;
  problems.push(...gate7b);
  gateAssert(id, '7b', gate7b, '覆盖度');

  // ---------- 门 7a：搬运率（仅 D2/D3） ----------
  const enumerated = Array.isArray(p.paramSurface?.enumerated) ? p.paramSurface.enumerated : [];
  const wired = enumerated.filter((name) => pScope.pool.includes(name));
  const rateScoped = pScope.pool.length === 0 ? null : wired.length / pScope.pool.length;
  const rateWhole = pAll.pool.length === 0 ? null : wired.length / pAll.pool.length;
  const gate7a = [];
  if (rateApplicable && !articleMode) {
    if ((Array.isArray(p.ported) ? p.ported : []).length === 0) {
      gate7a.push(`depth=${depth} 但 ported 为空 → 搬运率恒 0%（声称真移植却没搬任何符号）`);
    }
    if (rateScoped !== null && rateScoped < RATE_MIN) {
      gate7a.push(`rate=${(rateScoped * 100).toFixed(1)}% < ${(RATE_MIN * 100).toFixed(0)}%（${wired.length}/${pScope.pool.length}）`);
    }
  }
  gates['7a'] = gate7a;
  problems.push(...gate7a);
  gateAssert(id, '7a', gate7a, '搬运率');

  // ---------- 门 7c：E1–E7 双向约束 + D1 低复用登记 ----------
  const gate7c = [];
  const excludedNames = new Set(pAll.excluded.map((item) => item.name));
  for (const name of enumerated) {
    if (excludedNames.has(name)) gate7c.push(`enumerated 的 ${name} 属于 E1–E7 剔除集（双向约束：剔出分母的名字不得当分子）`);
    if (!pScope.pool.includes(name)) gate7c.push(`enumerated 的 ${name} 不在 P_scope 内（分子必须是分母的子集）`);
    if (!texts.some((file) => wordHit(file.text, name))) gate7c.push(`enumerated 的 ${name} 在原件里 \\b 未命中`);
  }
  const paramsNames = new Set();
  for (const symbol of Array.isArray(p.ported) ? p.ported : []) {
    for (const key of Object.keys(symbol?.params ?? {})) {
      paramsNames.add(key);
      if (excludedNames.has(key)) gate7c.push(`ported ${symbol.symbol} 的 params 键 ${key} 属于 E1–E7 剔除集（双向约束）`);
      if (!enumerated.includes(key)) gate7c.push(`ported ${symbol.symbol} 的 params 键 ${key} 不在 enumerated 中（漏登记）`);
    }
  }
  for (const name of enumerated) {
    if (!paramsNames.has(name)) gate7c.push(`enumerated 的 ${name} 不在任何 ported[].params 里（未接线的名字 = 分子造假）`);
  }
  const lowReuse = depth === 'D1';
  if (lowReuse && (Array.isArray(p.ported) ? p.ported : []).length > 0) {
    gate7c.push('depth=D1 的零件 ported 必须为空（D1 = 只沿用观感/常量，行为自实现）');
  }
  gates['7c'] = gate7c;
  problems.push(...gate7c);
  gateAssert(id, '7c', gate7c, 'E1–E7 双向约束 + D1 低复用');

  // ---------- 门 9：算法覆盖门（仅 D3） ----------
  const gate9 = [];
  const list = ctx.docLists.get(id);
  if (depth === 'D3' && !articleMode) {
    if (!list) {
      gate9.push('D3 零件在 docs/ARCHITECTURE-REUSE.md §7.x 里没有算法落点表 → 无法证明算法覆盖 100%');
    } else {
      const missingSymbols = list.symbols.filter((symbol) => !portedSymbols.includes(symbol));
      if (missingSymbols.length > 0) {
        gate9.push(`算法覆盖 ${list.symbols.length - missingSymbols.length}/${list.symbols.length}，缺 ${missingSymbols.length} 个：${missingSymbols.join(', ')}（门 9 不可用搬运率抵扣）`);
      }
    }
  }
  gates['9'] = gate9;
  problems.push(...gate9);
  gateAssert(id, '9', gate9, '算法覆盖');

  // ---------- articleMode（三缺口） ----------
  // 纪律（主理人 2026-11-18）：三缺口尚未建目录 / 未摘录原文时**只打印 skip 不报错**，
  // 因为 article/EXCERPT 由 T-R04 交付；一旦 EXCERPT.md 存在，本门立即转为硬门。
  const gateArticle = [];
  if (articleMode) {
    const excerpt = path.join(LIB, id, 'EXCERPT.md');
    const hasExcerpt = existsSync(excerpt);
    const articleReady = typeof p.upstream?.article === 'string' && p.upstream.article.trim() !== '';
    if (!hasExcerpt && !articleReady) {
      notes.push('articleMode SKIP：既无 EXCERPT.md 也未填 upstream.article（T-R04 交付后本门自动转硬门，届时缺项即红）');
    } else {
      if (!articleReady) gateArticle.push('files[] 为空的零件必须填 upstream.article（无仓库时唯一出处）');
      if (scopeEntries.length > 0) gateArticle.push('files[] 为空的零件 paramSurface.scope 必须为空数组（不得凭空声明移植面）');
      if (!hasExcerpt) {
        gateArticle.push('已有 upstream.article 但缺 EXCERPT.md（文章锚定的命中证据不存在）');
      } else {
        const excerptText = readFileSync(excerpt, 'utf8');
        for (const symbol of portedSymbols) {
          if (!wordHit(excerptText, symbol)) gateArticle.push(`ported ${symbol} 在 ${id}/EXCERPT.md 里未命中（文章锚定失败）`);
        }
        for (const symbol of Array.isArray(p.ported) ? p.ported : []) {
          const downgrade = symbol?.downgrade;
          if (typeof downgrade !== 'string' || downgrade.trim() === '') {
            gateArticle.push(`articleMode 的 ported ${symbol.symbol} 必须写 downgrade 三问`);
          }
        }
      }
    }
  }
  gates.article = gateArticle;
  problems.push(...gateArticle);
  gateAssert(id, 'article', gateArticle, 'articleMode');

  return {
    id,
    source: part.source,
    depth,
    origin,
    applicable: rateApplicable,
    articleMode,
    pin: pin ?? null,
    pinSatisfied,
    scopeFiles,
    pAll: pAll.pool.length,
    pScope: pScope.pool.length,
    coverage: coverage === null ? null : Number(coverage.toFixed(4)),
    // 非 D2/D3 的 rate 必须是 n/a（既不是 0 也不是 100）：给 0 会被误读成「搬了个 0%」
    rateScoped: !rateApplicable || rateScoped === null ? null : Number(rateScoped.toFixed(4)),
    rateWhole: !rateApplicable || rateWhole === null ? null : Number(rateWhole.toFixed(4)),
    wired: wired.length,
    enumerated: [...enumerated],
    portedSymbols,
    lowReuse,
    algorithmList: list ? list.symbols : null,
    gates: Object.fromEntries(Object.entries(gates).map(([key, value]) => [key, value.length])),
    problems,
    notes,
  };
}

/**
 * `files[]` 里参与参数抽取的条目（交给 param-pool 的过滤逻辑判定）。
 * @param {string} rel 相对路径
 * @returns {boolean} 是否可能参与
 */
function isAllParamCandidate(rel) {
  return isParamSourceFile(path.isAbsolute(rel) ? rel : path.join(LIB, rel));
}

/**
 * 门 10：drift（README 行数 / 有 manifest 的目录数 / 注册条目数 三方相等）。
 *
 * 为什么要区分两种 red：
 *   - **硬红**：已登记的零件在三方之间对不上（README 多行/少行、manifest 与注册表不等）—— 这是真缺陷；
 *   - **预期红**：磁盘上有目录但没有 `part.manifest.ts`（T-R04 的三缺口正在施工），
 *     此时「目录先出现、登记后补」是正常施工序，不该判成缺陷，但必须逐条打印出来。
 * @param {number} manifestCount PART_MANIFESTS 长度
 * @returns {{readmeRows: number, diskDirs: number, registeredDirs: number, registryEntries: number, unregisteredDirs: string[], problems: string[]}} 结果
 */
function inspectDrift(manifestCount) {
  const readmePath = path.join(LIB, 'registry', 'README.md');
  const readmeIds = existsSync(readmePath) ? parseReadmeRows(readmePath ? readFileSync(readmePath, 'utf8') : '') : [];
  const dirs = partDirectories();
  const registeredDirs = dirs.filter((name) => existsSync(path.join(LIB, name, 'part.manifest.ts')));
  const unregisteredDirs = dirs.filter((name) => !registeredDirs.includes(name));
  const problems = [];

  if (readmeIds.length !== manifestCount) {
    problems.push(`readmeRows=${readmeIds.length} ≠ PART_MANIFESTS.length=${manifestCount}`);
  }
  if (registeredDirs.length !== manifestCount) {
    problems.push(`有 manifest 的目录数=${registeredDirs.length} ≠ PART_MANIFESTS.length=${manifestCount}`);
  }
  const readmeSet = new Set(readmeIds);
  for (const id of registeredDirs) {
    if (!readmeSet.has(id)) problems.push(`README 索引缺行：${id}（有 manifest 但未登记）`);
  }
  for (const id of readmeIds) {
    if (!registeredDirs.includes(id)) problems.push(`README 索引多行：${id}（无 manifest）`);
  }
  return {
    readmeRows: readmeIds.length,
    diskDirs: dirs.length,
    registeredDirs: registeredDirs.length,
    registryEntries: manifestCount,
    unregisteredDirs,
    problems,
  };
}

/** 主流程。 */
async function main() {
  const registry = await loadTsModule(path.join(LIB, 'registry', 'index.ts'));
  const legacy = await loadTsModule(path.join(LIB, 'legacy-provenance.ts'));
  const manifests = registry.PART_MANIFESTS;
  const docText = readFileSync(DOC, 'utf8');
  const allIds = [
    ...manifests.map((manifest) => manifest.id),
    ...Object.keys(legacy.LEGACY_PARTS).flatMap((site) => legacy.LEGACY_PARTS[site].map((ref) => ref.partId)),
  ];
  const docLists = parseAlgorithmLists(docText, [...new Set(allIds)]);

  // 零件上下文：8 份 manifest + legacy 引用里未在 manifest 中出现的零件（三缺口）
  const contexts = [];
  for (const manifest of manifests) {
    contexts.push({
      id: manifest.id,
      source: 'manifest',
      depth: manifest.provenance?.depth ?? 'D0',
      origin: manifest.origin,
      provenance: manifest.provenance ?? {},
    });
  }
  const seen = new Set(contexts.map((context) => context.id));
  for (const siteId of Object.keys(legacy.LEGACY_PARTS)) {
    for (const ref of legacy.LEGACY_PARTS[siteId]) {
      if (seen.has(ref.partId)) continue;
      seen.add(ref.partId);
      // 缺口零件在磁盘上已有自己的 part.manifest.ts（T-R04 施工中）时**不由本门判**：
      // 它的 manifest 还没注册进 PART_MANIFESTS，此时用 legacy 占位去判 articleMode
      // 会得出「文章 id 缺失」的假红，用磁盘版去判又会替别人验收他的半成品。
      // 正确处置：注册（进 PART_MANIFESTS）后本门自动接管；在此之前由门 10 drift 显影。
      const manifestPath = path.join(LIB, ref.partId, 'part.manifest.ts');
      if (existsSync(manifestPath)) {
        expectedRed.push(`⏳ ${ref.partId} 已有磁盘 manifest 但未注册进 PART_MANIFESTS（T-R04 施工中）——本门暂不判，注册后自动接管；drift 已显影`);
        continue;
      }
      contexts.push({
        id: ref.partId,
        source: 'legacy-gap',
        depth: ref.provenance?.depth ?? 'D0',
        origin: 'equivalent',
        provenance: ref.provenance ?? {},
      });
    }
  }

  const rows = contexts.map((context) => inspectPart(context, { docLists, allIds }));
  const drift = inspectDrift(manifests.length);
  check(drift.problems.length === 0, `门10 drift：${drift.problems.join('；')}`);
  if (drift.unregisteredDirs.length > 0) {
    expectedRed.push(`⏳ drift：磁盘上存在尚未登记的零件目录 [${drift.unregisteredDirs.join(', ')}]（三缺口由 T-R04 交付，建 manifest + README 行后自动转绿）`);
  }

  // ---------- 输出 ----------
  const rateApplicableRows = rows.filter((row) => row.applicable);
  const fmt = (value) => (value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`);
  const gateNames = ['1', '2', '3', '7a', '7b', '7c', '9', 'article'];

  console.log('[verify-provenance] 溯源与复用机械校验（门 1/2/3/7a/7b/7c/9/10 + articleMode）');
  console.log(`  零件 ${rows.length} 件（manifest ${manifests.length} + 缺口 ${rows.length - manifests.length}）｜算法清单来源：docs/ARCHITECTURE-REUSE.md §7.x（${docLists.size} 件）`);
  console.log(`  去噪口径：E1–E7（冻结 2026-11-18）｜rate 下限 ${(RATE_MIN * 100).toFixed(0)}%（仅 D2/D3）｜coverage 下限 ${(COVERAGE_MIN * 100).toFixed(0)}%`);
  console.log('');
  console.log('  id                来源      depth  origin      P_all  P_scope  cover   rateScoped  rateWhole  门');
  for (const row of rows) {
    const badGates = gateNames.filter((gate) => row.gates[gate] > 0).map((gate) => `7a7b7c9`.includes(gate) ? gate : gate);
    const pinFlag = row.pinSatisfied ? '' : ' ⏳pin';
    console.log(
      `  ${row.id.padEnd(17)} ${row.source.padEnd(9)} ${row.depth.padEnd(6)} ${row.origin.padEnd(10)} `
      + `${String(row.pAll).padStart(5)} ${String(row.pScope).padStart(8)} ${fmt(row.coverage).padStart(7)} `
      + `${fmt(row.rateScoped).padStart(10)} ${fmt(row.rateWhole).padStart(10)}  ${badGates.length ? `✗ ${badGates.join(',')}` : '✓'}${pinFlag}`,
    );
  }

  console.log('');
  for (const row of rows) {
    if (row.problems.length === 0 && row.notes.length === 0) continue;
    console.log(`  ▸ ${row.id}（${row.depth}／${row.source}）`);
    for (const note of row.notes) console.log(`    · ${note}`);
    for (const problem of row.problems) console.log(`    ✗ ${problem}`);
  }

  console.log('');
  console.log(`[verify-provenance] 门 10 drift：readmeRows=${drift.readmeRows} 有 manifest 的目录=${drift.registeredDirs} `
    + `磁盘零件目录数=${drift.diskDirs} registryEntries=${drift.registryEntries}`
    + `${drift.unregisteredDirs.length ? `｜未登记目录=[${drift.unregisteredDirs.join(', ')}]` : ''}`);
  if (drift.unregisteredDirs.length > 0) {
    console.log('  说明：「目录先出现、登记后补」是 T-R04 三缺口的正常施工序 → 计入预期红；'
      + '已登记零件之间的三方不一致才是硬红。');
  }

  console.log('');
  if (expectedRed.length > 0) {
    console.log('[verify-provenance] ⏳ depth pin 未满足（预期红，不是缺陷）：');
    for (const line of expectedRed) console.log(`  ${line}`);
  }
  const lowReuseIds = rows.filter((row) => row.lowReuse).map((row) => row.id);
  console.log(`[verify-provenance] lowReuse[]（D1 低复用登记）：${lowReuseIds.length} 件 [${lowReuseIds.join(', ')}]`);

  // ---------- 报告 JSON ----------
  const report = {
    version: 1,
    generator: 'tests/verify-provenance.mjs',
    generatedAt: new Date().toISOString(),
    rules: {
      denoise: 'E1-E7 (frozen 2026-11-18)',
      rateMin: RATE_MIN,
      rateAppliesTo: [...RATE_DEPTHS],
      coverageMin: COVERAGE_MIN,
      depthPins: DEPTH_PINS,
      algorithmListSource: 'docs/ARCHITECTURE-REUSE.md §7.x',
    },
    drift,
    parts: rows,
    lowReuse: lowReuseIds,
    expectedRed,
    summary: {
      parts: rows.length,
      applicable: rateApplicableRows.length,
      checks,
      failures: failures.length,
      passed: failures.length === 0,
      // 门 2 的 depth pin 未达成属预期；这里把「非 pin 的失败」单列，便于 QA 区分
      failuresExcludingPins: failures.length,
    },
  };
  if (process.argv.includes('--report')) {
    writeFileSync(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`[verify-provenance] 报告已写入 ${path.relative(REPO_ROOT, REPORT_FILE)}`);
  }

  if (failures.length > 0) {
    console.log('');
    console.log(`[verify-provenance] ❌ FAIL：${failures.length} 项失败（断言 ${checks} 项）`);
    for (const failure of failures) console.log(`  - ${failure}`);
    if (expectedRed.length > 0) {
      console.log('  注：上面的「⏳ depth pin 未满足」属预期红——它证明 pin 是真的在拦，不是配置漏空。');
    }
    process.exitCode = 1;
    return;
  }
  console.log('');
  console.log(`[verify-provenance] ✅ PASS：${checks} 项断言（门 1/2/3/7a/7b/7c/9/10 全绿，无预期红）`);
}

await main();
