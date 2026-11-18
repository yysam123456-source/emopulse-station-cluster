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
 * 解析文档里的算法落点表（§7.2 / §7.5 / §7.6）。
 *
 * 为什么不硬编码在脚本里：清单是「该零件该搬哪些算法」的**唯一权威**，
 * 若写进脚本，架构师改了文档脚本不知道，门就会拿旧清单放行——这正是要防的漂移。
 *
 * 两个容易写错的地方（都已踩过，改这里前先读）：
 *
 * ① **编号前缀不是 `K`**。§7.2 是 `K1..K7`、§7.5 是 `D1..D10`、§7.6 是 `B0..B7`，
 *    只认 `K\d+` 会让后两张表解析出 0 行，门 9 永远报「无清单」。
 *    现在按 `[A-Z]{1,2}\d+` 取，并用 `**D1**` 这种加粗写法也要能匹配（首列带 `**`）。
 *
 * ② **归属不看标题层级，看标题里有没有零件 id**。三张表都是 `###`（三级），
 *    上级 `## 7. koi 移植的架构路径` 只提到 koi —— 若只在二级标题上绑 `partId`，
 *    §7.5 / §7.6 的编号会**全部记到 `koi` 头上**：koi 凭空多出 10 条「已覆盖」，
 *    而 dandelion 仍报无清单。**一门两错，且错的方向是假绿**，比读不到更坏。
 *    所以三级/四级标题也做一次重绑（`### 7.5 dandelion …` / `### 7.6 blow-input …`），
 *    标题里没有 id 时（如 `### 7.2 七个算法符号的落点表`）才沿用上级的归属。
 *
 * ③ gate 收紧到 `落点表|算法清单`，并显式排除 `前置条件|非算法`：
 *    `#### 7.6.1 前置条件（**非算法，不算进门 9 的清单**…）` 标题里含「算法」二字，
 *    用宽松的 `/算法|落点/` 会把 gate 打开，把 getUserMedia constraints / AnalyserNode 配置
 *    当成算法收进清单——那就违反了「粒度铁律」，门 9 退化成符号搬运清单。
 *
 * ④ 每节只取**第一张**表（§7.x 的解析契约）：表格结束后立即关 gate，
 *    避免把同节后面的示例表/对照表也读进来。
 *
 * @param {string} docText 架构文档全文
 * @param {readonly string[]} partIds 零件 id 清单（用于把 §7.x 归属到零件）
 * @returns {Map<string, {gate: string, section: string, entries: {no: string, symbols: string[]}[], symbols: string[]}>} 零件 → 算法清单
 */
function parseAlgorithmLists(docText, partIds) {
  const lines = docText.split(/\r?\n/);
  /** 首列编号 + 次列原文（编号允许 `**D1**` 加粗） */
  const ROW = /^\|\s*\*{0,2}([A-Z]{1,2}\d+)\*{0,2}\s*\|([^|]*)\|/;
  /** @type {Map<string, {no: string, symbols: string[]}[]>} 零件 → 编号条目 */
  const entriesOf = new Map();
  /** @type {Map<string, {gate: string, section: string}>} 零件 → 出处 */
  const metaOf = new Map();
  /** @type {{partId: string, title: string}[]} 无法归属的落点表（同零件第二张表 → 拒绝归属，防串味） */
  const orphanTables = [];
  let partId = null;
  let section = '';
  let gate = '';
  let inTable = false;

  for (const line of lines) {
    const heading = /^(#{2,4})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const title = heading[2].trim();
      inTable = false;
      if (level === 2) {
        partId = partIds.find((id) => title.includes(id)) ?? null;
        section = title;
        gate = '';
      } else {
        // 三级/四级标题：先尝试用标题里的零件 id 重绑（§7.5「dandelion …」/ §7.6「blow-input …」）
        const named = partIds.find((id) => title.includes(id));
        if (named) partId = named;
        const isAlgoTable = /落点表|算法清单/.test(title) && !/前置条件|非算法/.test(title);
        gate = partId && isAlgoTable ? title : '';
        // 同一零件只允许一张落点表。第二张拒绝归属并单独报红 ——
        // 否则 §7.5 的标题若丢了「dandelion」，D 表会整表记到上级（koi）头上：
        // koi 凭空多出 10 条「已覆盖」，dandelion 仍报无清单，一门两错且方向是假绿。
        if (gate && entriesOf.has(partId)) {
          orphanTables.push({ partId, title });
          gate = '';
        }
      }
      continue;
    }
    if (!partId || !gate) continue;
    if (!line.startsWith('|')) {
      // 第一张表已结束 → 关 gate（每节只认第一张表）
      if (inTable) gate = '';
      continue;
    }
    inTable = true;
    const row = ROW.exec(line);
    if (!row) continue; // 表头 / 分隔行
    const no = row[1];
    const symbols = [...row[2].matchAll(/`([^`]+)`/g)]
      // `bodyGeometry(52,24)` → bodyGeometry；`S_END` → S_END
      .map((match) => match[1].split('(')[0].trim())
      .filter((name) => name !== '');
    const bucket = entriesOf.get(partId) ?? [];
    bucket.push({ no, symbols });
    entriesOf.set(partId, bucket);
    metaOf.set(partId, { gate, section });
  }

  const lists = new Map();
  /** @type {Map<string, string[]>} 零件 → 清单自身的结构问题 */
  const tableProblems = new Map();
  for (const [id, entries] of entriesOf) {
    if (entries.length === 0) continue;
    const meta = metaOf.get(id) ?? { gate: '', section: '' };
    // 结构校验：同一张表的编号必须**同前缀且连续**
    // （D1..D10 / B0..B7 / K1..K7）。不加这道校验，把 `D1` 改成 `E1` 之后
    // 清单仍是 10 行、符号依然全命中 → 门 9 静默变绿，编号却没在按定义检查。
    const problems = [];
    const prefixes = [...new Set(entries.map((entry) => /^[A-Z]{1,2}/.exec(entry.no)[0]))];
    if (prefixes.length > 1) {
      problems.push(`编号前缀不一致：${entries.map((entry) => entry.no).join('/')} 混用了 ${prefixes.join(' 与 ')}（同一张落点表必须同前缀）`);
    }
    const numbers = entries.map((entry) => Number(/\d+$/.exec(entry.no)[0]));
    const min = Math.min(...numbers);
    const max = Math.max(...numbers);
    if (new Set(numbers).size !== numbers.length) {
      problems.push(`编号重复：${entries.map((entry) => entry.no).join('/')}`);
    } else if (max - min + 1 !== numbers.length) {
      problems.push(`编号不连续：${entries.map((entry) => entry.no).join('/')}（缺 ${Array.from({ length: max - min + 1 }, (_, index) => min + index).filter((value) => !numbers.includes(value)).map((value) => `${prefixes[0]}${value}`).join(', ')}）`);
    }
    if (problems.length > 0) tableProblems.set(id, problems);
    // 符号并集仅作展示/兼容用；门 9 的判定按**编号**逐条进行（同一符号可覆盖多个编号）
    const symbols = [];
    for (const entry of entries) {
      for (const symbol of entry.symbols) if (!symbols.includes(symbol)) symbols.push(symbol);
    }
    lists.set(id, { gate: meta.gate, section: meta.section, entries, symbols });
  }
  return { lists, tableProblems, orphanTables };
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

// ───────────────────────── 站点引用判定（门 2 的信号源 + 死引用 E_SITE_REF_DEAD） ─────────────────────────
//
// 为什么需要这一整块：门 2 原先若只看「有没有 `source: '<id>'` 这个字符串」，就会把
// `sites/license/site.config.ts` 里 `{ id: 'paper', source: 'room-at-dawn', enabled: true }`
// 当成「room-at-dawn 被站点使用了」，从而逼它背 D1 的义务 —— 而它实际一个像素都没画。
//
// 一个 `ref` 有**两条**挂载路径（ARCHITECTURE-REUSE §3.3.5）：
//   A · 通用路径   `for (const ref of config.parts)` → `ctx.store.partFactories.get(ref.source)` → `factory(c)`
//   B · 直接实例化 `glue.ts` 的 `this.parts = { <ref.id>: <工厂>(c), … }` 槽位，
//                  且该槽位必须是 `manifest.entry` 的实例化，**不是**本站照着描述重写的等效实现
//
// 判「被引用」用 A 的三条件 AND（宁可判未被引用：误判成「未被引用」只是让它留在 D0，
// 误判成「被引用」会让一个真没被用的零件凭空背上 D1 的义务 —— 两个方向的错误代价不对称）。
// 判「死引用」用 A∪B（任一成立即不算死）；两条都不成立 = 配置声明与实际行为不符。
//
// 注意：**「不算引用」不等于「当作不存在」**。死引用必须独立报红，否则 site.config.ts
// 会读起来像一份功能清单，实际什么都不是 —— 这比 depth 谎报更隐蔽。

/**
 * 有 `site.config.ts` 的站点目录。
 * @returns {string[]} 站点 id（升序）
 */
function siteDirectories() {
  const sitesDir = path.join(REPO_ROOT, 'sites');
  if (!existsSync(sitesDir)) return [];
  return readdirSync(sitesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(path.join(sitesDir, entry.name, 'site.config.ts')))
    .map((entry) => entry.name)
    .sort();
}

/**
 * 解析一个站 `site.config.ts` 的 `parts[]` 配置项（带行号，便于报红时直接定位）。
 * @param {string} siteId 站点 id
 * @returns {{site: string, file: string, line: number, id: string|null, source: string|null, enabled: boolean}[]} 配置项
 */
function parseSiteRefs(siteId) {
  const abs = path.join(REPO_ROOT, 'sites', siteId, 'site.config.ts');
  const source = readFileSync(abs, 'utf8');
  const sf = ts.createSourceFile(abs, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const refs = [];
  const visit = (node) => {
    const isPartsArray = ts.isPropertyAssignment(node)
      && ((ts.isIdentifier(node.name) && node.name.text === 'parts') || (ts.isStringLiteral(node.name) && node.name.text === 'parts'))
      && ts.isArrayLiteralExpression(node.initializer);
    if (isPartsArray) {
      for (const element of node.initializer.elements) {
        if (!ts.isObjectLiteralExpression(element)) continue;
        const ref = {
          site: siteId,
          file: path.relative(REPO_ROOT, abs).split(path.sep).join('/'),
          line: sf.getLineAndCharacterOfPosition(element.getStart(sf)).line + 1,
          id: null,
          source: null,
          enabled: false,
        };
        for (const property of element.properties) {
          if (!ts.isPropertyAssignment(property)) continue;
          const key = ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) ? property.name.text : null;
          if (key === 'id' && ts.isStringLiteral(property.initializer)) ref.id = property.initializer.text;
          if (key === 'source' && ts.isStringLiteral(property.initializer)) ref.source = property.initializer.text;
          if (key === 'enabled' && property.initializer.kind === ts.SyntaxKind.TrueKeyword) ref.enabled = true;
        }
        refs.push(ref);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return refs;
}

/**
 * 解析一个站 `glue.ts` 的三样东西：通用路径的 skip 名单、直接实例化的槽位、以及 import 来源。
 * @param {string} siteId 站点 id
 * @returns {{skipIds: Set<string>, slots: Map<string, string>, imports: Map<string, string>, exists: boolean, hasGenericLoop: boolean}} 解析结果
 */
function parseSiteGlue(siteId) {
  const abs = path.join(REPO_ROOT, 'sites', siteId, 'glue.ts');
  const skipIds = new Set();
  const slots = new Map();
  const imports = new Map();
  let hasGenericLoop = false;
  if (!existsSync(abs)) return { skipIds, slots, imports, exists: false, hasGenericLoop };
  const source = readFileSync(abs, 'utf8');
  const sf = ts.createSourceFile(abs, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  const walk = (node) => {
    // import { createPaperPart } from './parts/index'
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)
      && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
      for (const spec of node.importClause.namedBindings.elements) {
        imports.set(spec.name.text, node.moduleSpecifier.text);
      }
    }
    // for (const ref of config.parts) { if (<skip 条件>) continue; … }
    if (ts.isForOfStatement(node) && node.expression.getText(sf).includes('config.parts')) {
      hasGenericLoop = true;
      const collectSkips = (inner) => {
        if (ts.isIfStatement(inner)) {
          // 两种写法都覆盖：`ref.id === 'paper' || …` 与 `['a','b'].includes(ref.id)`
          for (const match of inner.expression.getText(sf).matchAll(/'([^']*)'|"([^"]*)"/g)) {
            const literal = match[1] ?? match[2];
            if (literal) skipIds.add(literal);
          }
        }
        ts.forEachChild(inner, collectSkips);
      };
      collectSkips(node.statement);
    }
    // this.parts = { paper: createPaperPart(c), … }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      if (/^this\.parts$/.test(node.left.getText(sf)) && ts.isObjectLiteralExpression(node.right)) {
        for (const property of node.right.properties) {
          if (!ts.isPropertyAssignment(property)) continue;
          const key = ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) ? property.name.text : null;
          if (!key) continue;
          const init = property.initializer;
          if (ts.isCallExpression(init) && ts.isIdentifier(init.expression)) slots.set(key, init.expression.text);
        }
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return { skipIds, slots, imports, exists: true, hasGenericLoop };
}

/**
 * 全仓是否存在「工厂表写入点」（Q-01 的机械判据）。
 *
 * 现状：`shared/contract/runtime.ts` 的 `store` 是 `Object.create(null)`，全仓无一处写
 * `store.partFactories`，只有 license/praise/hug 三站**读**它（`ctx.store.partFactories as Map…`）。
 * 因此 A 路径对所有站永久失效。这里不硬编码结论，而是每次扫盘复算 —— 一旦有人接了桥，
 * 判定自动跟随，不需要改本文件。
 *
 * ⚠️ 必须锚定 `store.partFactories`，不能只匹配 `partFactories`：
 *   `sites/still/glue.ts` 有一个**模块级** `const partFactories = new Map(...)`，与
 *   `ctx.store.partFactories` 是两个毫不相干的变量。只按名字匹配会把这个假桥当成真桥，
 *   于是 A 路径「可用」，死引用会立刻全变绿 —— 这是最容易被误判成「修好了」的假绿。
 * @returns {{available: boolean, evidence: string[]}} 是否可取得工厂 + 证据行
 */
function factoryRegistryWritable() {
  const evidence = [];
  /** 只认对 store 上那个字段的写入：`store.partFactories = …` / `store.partFactories: …`。 */
  const WRITE = /store\s*\.\s*partFactories\s*[:=][^=]/;
  const scan = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { scan(full); continue; }
      if (!/\.(?:ts|mts)$/.test(entry.name)) continue;
      const text = readFileSync(full, 'utf8');
      // 读取形态 `ctx.store.partFactories as Map<…>` 不含 `:`/`=`，不会被误认为写入
      if (WRITE.test(text)) {
        evidence.push(path.relative(REPO_ROOT, full).split(path.sep).join('/'));
      }
    }
  };
  scan(path.join(REPO_ROOT, 'shared'));
  scan(path.join(REPO_ROOT, 'sites'));
  return { available: evidence.length > 0, evidence };
}

/**
 * 判定一条 `ref` 的两条挂载路径是否成立。
 * @param {object} ref 配置项
 * @param {{imports: Map<string,string>, slots: Map<string,string>}} glue 该站 glue 解析结果
 * @param {(id: string) => string|null} entryOf 零件 id → manifest.entry
 * @param {{available: boolean, evidence: string[]}} factoryBridge 工厂表写入点探测结果
 * @returns {{a: {ok: boolean, reason: string}, b: {ok: boolean, reason: string}}} 两条路径结果
 */
function resolveRefPaths(ref, glue, entryOf, factoryBridge, knownPartIds) {
  // ---- A · 通用路径：enabled + 非 skip + 工厂可取得 ----
  let aOk = true;
  const aReasons = [];
  // 循环本体不存在时，A 路径无代码可走 —— 若删掉通用挂载循环（把「配置」收敛为「声明」），
  // 这里必须跟着失效，否则一旦将来有人接了工厂桥，A 会凭空变成「可用」。
  if (!glue.hasGenericLoop) { aOk = false; aReasons.push('glue.ts 里没有 config.parts 通用挂载循环（配置不承担挂载职责）'); }
  if (!ref.enabled) { aOk = false; aReasons.push('ref.enabled=false'); }
  if (glue.skipIds.has(ref.id)) { aOk = false; aReasons.push(`ref.id '${ref.id}' 在 glue.ts 的 skip 名单内（不走通用挂载）`); }
  if (!factoryBridge.available) { aOk = false; aReasons.push('ctx.store.partFactories 全仓无写入点（Q-01），工厂恒取不到'); }
  // ---- B · 直接实例化：槽位存在且来自 manifest.entry ----
  const factory = glue.slots.get(String(ref.id));
  let bOk = false;
  let bReason = '';
  if (!factory) {
    bReason = `glue.ts 的 this.parts 里没有 '${ref.id}' 槽位`;
  } else {
    const from = glue.imports.get(factory) ?? null;
    const entry = entryOf(String(ref.source));
    if (!from) {
      bReason = `槽位工厂 ${factory} 不是 glue.ts 里 import 进来的`;
    } else if (!entry) {
      bReason = knownPartIds?.has(String(ref.source))
        ? `槽位 ${ref.id} 用 ${factory}（来自 ${from}），但零件 '${ref.source}' 尚未注册（无 manifest.entry，T-R04 交付）→ B 路径不可能成立`
        : `槽位 ${ref.id} 用 ${factory}（来自 ${from}），但 source '${ref.source}' 不对应任何零件`;
    } else {
      const fromAbs = path.resolve(path.join(REPO_ROOT, 'sites', ref.site), from);
      const entryAbs = path.join(REPO_ROOT, entry).replace(/\.ts$/, '');
      bOk = fromAbs.replace(/\.ts$/, '') === entryAbs;
      if (!bOk) {
        bReason = `槽位 ${ref.id} 用的是 ${from.replace(/^.*\/sites\//, 'sites/')} 的 ${factory}（本站本地实现），不是 manifest.entry（${entry}）的实例化`;
      }
    }
  }
  return {
    a: { ok: aOk, reason: aOk ? '' : aReasons.join('；') },
    b: { ok: bOk, reason: bOk ? '' : bReason },
  };
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

  // depth=D0 ⟺ 未被任何站真正使用。
  // 「真正使用」= 三条件 AND（见本节顶部注释）：enabled + 不在 skip 名单 + 工厂可取得。
  // 只命中一个 `source: '<id>'` 字符串**不算** —— 那正是 room-at-dawn 被误判成「被引用」的原因。
  const siteReferenced = ctx.siteReferenced.has(id);
  if (depth === 'D0' && siteReferenced) {
    gate2.push(`depth=D0 但被站点真正引用（三条件 AND 成立）→ 必须升 D1 或删除该配置项（D0 = 原件一字未用的展示位）`);
  }
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
  //
  // 适用范围（主理人 2026-11-18 裁决，堵「files: [] 绕过主门」的洞）：
  //   const gate9Applies = depth === 'D3' && (!articleMode || hasPort);
  // 三种情形：
  //   - 非 articleMode（有仓库原件）           → 判（原语义不变）
  //   - articleMode 且 ported[] 非空           → **判**。`files: []` 只说明「没有原件可归集」，
  //     不说明「没有算法可对账」。有移植内容就必须对账 —— 否则 dandelion/blow-input 会
  //     一边声明 D3、落 16/14 条真实算法，一边因为「没有仓库」免检主门（比 D1 逃生舱口更隐蔽，
  //     因为它看起来更诚实：字段全填满、completeness='absent' 如实写）。
  //   - articleMode 且 ported[] 为空           → SKIP。这才是真正的「未开工占位」（paper-plane）。
  //
  // 与门 7a/7b/7c 的区别（那三道**保持** articleMode 一律跳过）：
  //   7a/7b 需要**分母**（P_scope 从 files[] 跑 param-pool 得来，没原件就真没有分母，
  //   硬判只会逼人编造 scope）；门 9 需要的是**清单**（文档 §7.x 就能给）。
  //   分母不可得时跳过是诚实；清单可得时跳过是开后门。
  const gate9 = [];
  const list = ctx.docLists.get(id);
  const hasPort = Array.isArray(p.ported) && p.ported.length > 0;
  const gate9Applies = depth === 'D3' && (!articleMode || hasPort);
  if (gate9Applies) {
    if (!list) {
      gate9.push('D3 零件在 docs/ARCHITECTURE-REUSE.md §7.x 里没有算法落点表 → 无法证明算法覆盖 100%');
    } else {
      // 清单自身的结构问题（编号前缀混用 / 不连续 / 重复）→ 直接红。
      // 这道校验专防「只改编号不改表」：把 D1 改成 E1 之后行数没变、符号也全命中，
      // 只看覆盖度会静默变绿，但清单已经不再按定义检查任何东西。
      gate9.push(...(ctx.tableProblems?.get(id) ?? []));
      // 按**编号**判定，不按符号：D4/D5 共用 `drift`，只报符号会让人以为 D4 也缺。
      // 门 9 的清单是「编号 → 该编号的符号必须在 ported[] 里」，符号只是编号的载体。
      const uncovered = [];
      for (const entry of list.entries) {
        const missingInEntry = entry.symbols.filter((symbol) => !portedSymbols.includes(symbol));
        if (missingInEntry.length > 0) uncovered.push(`${entry.no}(${missingInEntry.join('/')})`);
      }
      if (uncovered.length > 0) {
        gate9.push(`算法覆盖 ${list.entries.length - uncovered.length}/${list.entries.length}，缺 ${uncovered.length} 项：${uncovered.join(', ')}（门 9 不可用搬运率抵扣）`);
      }
    }
  } else if (depth === 'D3' && articleMode && !hasPort) {
    notes.push('门 9 SKIP：articleMode 且 ported[] 为空 —— 真正的未开工占位（`files: []` 只免原件归集，不算法覆盖）');
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
    siteReferenced,
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
    algorithmList: list ? list.entries.map((entry) => entry.no) : null,
    algorithmSymbols: list ? list.entries.map((entry) => `${entry.no}:${entry.symbols.join('/')}`) : null,
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

/**
 * 预期死引用清单（ARCHITECTURE-REUSE §3.3.5「逐条枚举（11 条，可复算）」表）。
 *
 * 为什么用**名单**而不是**条数**：条数对不上只能告诉你「有问题」，名单对不上能告诉你
 * 「哪一条新增 / 哪一条漏改」；而且条数会被抵消凑平（删一条 + 错加一条 = 数目不变）。
 *
 * 从表的 11 行出发的两处扣减，都要能复算：
 *   ① 扣 `praise.typewriter`：`source: 'local-template'` 不是任何零件的 id，注释亦自述
 *      「自研 glue，非复制零件」—— 它从未对上游零件做声明，谈不上「声明与实际不符」。
 *      11 − 1 = 10。
 *   ② 扣 `license.paper` 与 `praise.receipt-paper`：本轮把它们的 `source` 从
 *      `room-at-dawn` 改为 `'local'`（配置说真话）。它们不再声称「装的是 room-at-dawn」，
 *      因此不再属于死引用。10 − 2 = **8**。
 *
 * T-R03 / T-R05 完成后（CF-1 把 license / praise 的本地实现改成 re-export 库件），
 * 应降到 5 条：hug 3 + license.paper + praise.receipt-paper。届时这份名单须由主理人重新核准。
 * @type {string[]}
 */
const EXPECTED_DEAD_REFS = [
  'hug/blow',
  'hug/dandelion',
  'hug/flight',
  'license/plane',
  'license/stamp',
  'license/timeline',
  'praise/layers',
  'praise/pointer',
];

/**
 * 该站的代码里，是否真的在用 `source` 这个零件的算法（用于区分 `FALSE` 与 `UNWIRED`）。
 *
 * 判据：`shared/parts-library/<source>/core/` 是否存在 **且** 被 `sites/<site>/` 下的 TS import 过。
 * `core/` 是 AD-1 的算法层，被站点 import = 算法真的在跑（如 hug 的 dandelion/blow 直接 import
 * `core/meadow.ts` / `core/detector.ts`）。反过来，槽位是自写实现、从不碰 `core/` = 与 source 无关。
 *
 * 三者语义要分清：
 *   known=true,  used=true  → UNWIRED（算法在用，只是没走 manifest.entry）
 *   known=true,  used=false → FALSE（假声明：声称装的是它，实际毫无关系）
 *   known=false             → 该零件还没有 `core/`（三缺口尚未建库），无法证明 → 按 UNWIRED 记并注明
 * @param {string} siteId 站点 id
 * @param {string} source 零件 id
 * @returns {{known: boolean, used: boolean}} 判定结果
 */
function algorithmInUse(siteId, source) {
  const coreDir = path.join(LIB, source, 'core');
  if (!existsSync(coreDir)) return { known: false, used: false };
  const sitesDir = path.join(REPO_ROOT, 'sites', siteId);
  const needle = `parts-library/${source}/core`;
  const scan = (dir) => {
    if (!existsSync(dir)) return false;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (scan(full)) return true;
        continue;
      }
      if (!/\.(?:ts|mts)$/.test(entry.name)) continue;
      if (readFileSync(full, 'utf8').includes(needle)) return true;
    }
    return false;
  };
  return { known: true, used: scan(sitesDir) };
}

/**
 * 「曾经声称、现已撤回」的本地实现留档（主理人 2026-11-18 裁）。
 *
 * 为什么必须有：`sites/license/site.config.ts` 与 `sites/praise/site.config.ts` 本轮的
 * `source` 从 `room-at-dawn` 改成了 `local`——**撤回了对上游零件的声明**，于是它们不再是
 * 死引用（没有声明就没有假声明）。但事实是：我们曾声称两站的纸质来自 `room-at-dawn`，
 * 实际跑的是自己写的 Canvas 纸纹。
 *
 * 不留痕的后果很具体：日后有人统计复用率，`room-at-dawn` 会**凭空从「被两站使用」变成
 * 「零使用」**，而没有人知道为什么。所以这里单独留档，回答「我们实际复用了什么」。
 * **它不上闸门**，但有一条自校验：若哪天 `source` 又改回声称某个零件，本留档立即失配报红
 * （防止留档腐烂成一段没人维护的历史文字）。
 * @type {{site: string, id: string, claimedBefore: string, nowSource: string, reason: string, revisit: string}[]}
 */
const LOCAL_SUPERSEDES = [
  {
    site: 'license',
    id: 'paper',
    claimedBefore: 'room-at-dawn',
    nowSource: 'local',
    reason: "source 声称的是「装的是哪个上游零件」；槽位实际为本地 createPaperPart，"
      + '3D GI 与 2D 纸纹无算法交集（C4 裁「仅取观感」），改 local 以撤回假声明',
    revisit: 'T-R05 若真移植纸纹材质，改回 source 并升 D1',
  },
  {
    site: 'praise',
    id: 'receipt-paper',
    claimedBefore: 'room-at-dawn',
    nowSource: 'local',
    reason: "source 声称的是「装的是哪个上游零件」；槽位实际为本地 createReceiptPaperPart，"
      + '3D GI 与 2D 热敏纸纹无算法交集（C4 裁「仅取观感」），改 local 以撤回假声明',
    revisit: 'T-R05 若真移植纸纹材质，改回 source 并升 D1',
  },
];

/**
 * 站点引用普查：逐站逐 ref 判定 A / B 两条挂载路径。
 * @param {readonly object[]} manifests 已注册零件声明（用于 source → manifest.entry 映射）
 * @param {Set<string>} knownPartIds 全部「真实零件 id」（已注册 + legacy 缺口，如 paper-plane）
 * @returns {{refs: object[], deadRefs: object[], siteReferenced: Set<string>, factoryBridge: object}} 普查结果
 */
function inspectSiteRefs(manifests, knownPartIds) {
  const entryById = new Map(manifests.map((manifest) => [manifest.id, manifest.entry]));
  /**
   * 零件 id → manifest.entry。
   * @param {string} id 零件 id
   * @returns {string|null} entry 相对路径
   */
  const entryOf = (id) => entryById.get(id) ?? null;
  const factoryBridge = factoryRegistryWritable();
  const refs = [];
  const deadRefs = [];
  const siteReferenced = new Set();

  for (const siteId of siteDirectories()) {
    const glue = parseSiteGlue(siteId);
    for (const ref of parseSiteRefs(siteId)) {
      const paths = resolveRefPaths(ref, glue, entryOf, factoryBridge, knownPartIds);
      // `source` 是不是一个**真实零件 id**：以「已注册 + legacy 缺口」为准，不能只看已注册 ——
      // `paper-plane` 尚未注册（T-R04 交付），但 hug.flight / license.plane / praise.layers
      // 三条配置确实在声称自己装的是它。只看已注册会把这 3 条死引用静默漏掉。
      const isPartSource = typeof ref.source === 'string' && knownPartIds.has(ref.source);
      const alive = paths.a.ok || paths.b.ok;
      refs.push({ ...ref, paths, alive, isPartSource });
      // 门 2 的「被引用」只认 A 路径的三条件 AND（不看 B）：
      // 对 D0 而言，误判「未被引用」的代价只是让它留在 D0；误判「被引用」会让一个真没被用的
      // 零件凭空背上 D1 的义务。两个方向的错误代价不对称，所以两个判据也不该相同。
      if (isPartSource && paths.a.ok) siteReferenced.add(ref.source);
      // 死引用：只有「对某个已注册零件做了声明」才谈得上死引。
      if (isPartSource && !alive) {
        const usage = algorithmInUse(ref.site, String(ref.source));
        deadRefs.push({
          // 两码制（主理人 2026-11-18 裁）：一个码会把两种病报成一种，让人以为改配置就能修好全部。
          //   E_SITE_REF_FALSE   假声明：source 声称的零件与槽位实现根本无关 → 改 site.config.ts
          //   E_SITE_REF_UNWIRED 未接线：source 的算法真的在用，但 manifest.entry 没被实例化 → 接通底座（Q-02）
          code: usage.known && !usage.used ? 'E_SITE_REF_FALSE' : 'E_SITE_REF_UNWIRED',
          site: ref.site,
          id: ref.id,
          source: ref.source,
          file: ref.file,
          line: ref.line,
          enabled: ref.enabled,
          // pathA / pathB 写**失效原因**，不写 false：只给布尔值的人是没法照它去修的
          pathA: paths.a.reason,
          pathB: paths.b.reason,
          reason: usage.known
            ? (usage.used
              ? `通用路径 A 未接线（Q-01：ctx.store.partFactories 无写入点）；槽位 B 用的是本站实现、且确实引用了 ${ref.source}/core（算法在跑），但不是 manifest.entry 的实例化 → 接通底座（Q-02）`
              : `通用路径 A 未接线；槽位 B 是本站自写实现，且本站代码从不引用 ${ref.source}/core → 与 source 所指零件无算法关系（假声明，改配置）`)
            : `通用路径 A 未接线；${ref.source} 尚未建库（无 core/），无法用 import 证据判定 → 按未接线记`,
        });
      }
    }
  }
  // 稳定排序（site + ref.id）：报告要能逐行 diff，顺序抖动会让 review 看不出真实变化
  deadRefs.sort((a, b) => (a.site === b.site ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : (a.site < b.site ? -1 : 1)));

  // localSupersedes 的自校验：留档说「现在 source 是 local」，那就必须真的是 local。
  // 否则留档会腐烂成一段没人维护的历史文字（而且是最危险的那种：读起来像事实）。
  const localSupersedes = [];
  const allRefs = refs;
  for (const record of LOCAL_SUPERSEDES) {
    const found = allRefs.find((ref) => ref.site === record.site && ref.id === record.id);
    if (!found) {
      check(false, `localSupersedes 留档失效：${record.site}.${record.id} 已不存在于 site.config.ts（留档必须随配置一起改）`);
      continue;
    }
    if (found.source !== record.nowSource) {
      check(false, `localSupersedes 留档失效：${record.site}.${record.id} 的 source 现在是 '${found.source}'，留档写的是 '${record.nowSource}'（配置变化必须同步留档）`);
      continue;
    }
    localSupersedes.push({ ...record });
  }

  return { refs, deadRefs, localSupersedes, siteReferenced, factoryBridge };
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
  const algoParse = parseAlgorithmLists(docText, [...new Set(allIds)]);
  const docLists = algoParse.lists;
  // 无法归属的落点表（同一零件出现第二张表）是**硬红**：那张表里的编号一个都没被检查。
  // 典型触发：把 `### 7.5 dandelion 算法落点表` 改成 `### 7.5 算法落点表` ——
  // 标题里没有零件 id，D 表会整表记到上级（koi）头上。宁可报「无法归属」，
  // 也不许把 10 个编号静默塞给别的零件（那是假绿，比红更坏）。
  for (const orphan of algoParse.orphanTables) {
    check(false, `算法落点表无法归属：「${orphan.title}」在同一零件 ${orphan.partId} 已有一张清单之后出现 → 该表未被检查（标题里补上零件 id 即可）`);
  }

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

  const siteInspection = inspectSiteRefs(manifests, new Set(allIds));

  const rows = contexts.map((context) => inspectPart(context, {
    docLists,
    allIds,
    siteReferenced: siteInspection.siteReferenced,
    tableProblems: algoParse.tableProblems,
  }));
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

  // ---------- 死引用（E_SITE_REF_DEAD）----------
  // 「不算引用」≠「当作不存在」：一段配置写着 enabled: true、实际永远走不到，
  // 让 site.config.ts 读起来像一份功能清单，实际什么都不是 —— 比 depth 谎报更隐蔽。
  const deadKeys = siteInspection.deadRefs.map((item) => `${item.site}/${item.id}`).sort();
  const expectedKeys = [...EXPECTED_DEAD_REFS].sort();
  console.log('');
  console.log(`[verify-provenance] 站点引用普查：${siteInspection.refs.length} 条 parts[] 配置项 · `
    + `真正被引用（A 三条件 AND）${siteInspection.siteReferenced.size} 件 [${[...siteInspection.siteReferenced].sort().join(', ') || '无'}] · `
    + `死引用 ${deadKeys.length} 条`);
  console.log(`  A 路径（通用挂载）现状：${siteInspection.factoryBridge.available
    ? `可用（写入点 ${siteInspection.factoryBridge.evidence.join(', ')}）`
    : '全站永久失效 —— ctx.store.partFactories 全仓无写入点（Q-01）'}`);
  for (const item of siteInspection.deadRefs) {
    console.log(`  ❌ ${item.file}:${item.line} 死引用 [${item.code}]：{ id: '${item.id}', source: '${item.source}', enabled: ${item.enabled} }`);
    console.log(`     原因 A：${item.pathA}`);
    console.log(`     原因 B：${item.pathB}`);
  }
  if (deadKeys.length > 0) {
    console.log('  说明：死引用是 Q-01（工厂桥不存在）的可视化，不是本脚本的缺陷；'
      + '只有当**集合**与 §3.3.5 预期名单不符时才是硬红（新增缺陷或改写漏项）。');
  }
  console.log(`  留档 localSupersedes[]（曾声称来自上游、已撤回声明）${LOCAL_SUPERSEDES.length} 条：`
    + LOCAL_SUPERSEDES.map((item) => `${item.site}.${item.id}(${item.claimedBefore}→${item.nowSource})`).join(' · '));
  check(
    JSON.stringify(deadKeys) === JSON.stringify(expectedKeys),
    `死引用集合与 §3.3.5 预期不符：实际 [${deadKeys.join(', ')}]，预期 [${expectedKeys.join(', ')}]`,
  );
  const deadByCode = { E_SITE_REF_FALSE: [], E_SITE_REF_UNWIRED: [] };
  for (const item of siteInspection.deadRefs) {
    if (!Object.hasOwn(deadByCode, item.code)) {
      check(false, `死引用 ${item.site}.${item.id} 的 code 非法：${String(item.code)}（只允许 E_SITE_REF_FALSE / E_SITE_REF_UNWIRED）`);
      continue;
    }
    deadByCode[item.code].push(`${item.site}/${item.id}`);
  }
  console.log(`  分码（两码互斥，**不许相加时报「11 或 10」**）：`
    + `FALSE 假声明 ${deadByCode.E_SITE_REF_FALSE.length} 条${deadByCode.E_SITE_REF_FALSE.length ? ` [${deadByCode.E_SITE_REF_FALSE.join(', ')}]` : ''} · `
    + `UNWIRED 未接线 ${deadByCode.E_SITE_REF_UNWIRED.length} 条${deadByCode.E_SITE_REF_UNWIRED.length ? ` [${deadByCode.E_SITE_REF_UNWIRED.join(', ')}]` : ''}`);
  console.log(`  目标态（T-R03/T-R05 后）：FALSE 2 + UNWIRED 3 = 5。当前 FALSE=0 是**配置改真话的预期结果**`
    + `（license.paper / praise.receipt-paper 已撤回声明 → 转 localSupersedes 留档），不是判据放宽。`);

  console.log('');
  if (expectedRed.length > 0) {
    console.log('[verify-provenance] ⏳ 预期红（不是缺陷）：');
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
    // 空数组也必须输出这个键 —— 缺键与"空"是两件事（缺键 = 这道门没实现）
    deadRefs: siteInspection.deadRefs,
    // 留档：曾声称来自某上游零件、现已撤回声明（改 source: 'local'）的配置项。
    // 不上闸门 —— 它回答的是「我们实际复用了什么」，不是「有没有违规」。
    localSupersedes: siteInspection.localSupersedes,
    siteRefs: {
      total: siteInspection.refs.length,
      referencedParts: [...siteInspection.siteReferenced].sort(),
      factoryBridgeAvailable: siteInspection.factoryBridge.available,
      factoryBridgeEvidence: siteInspection.factoryBridge.evidence,
      refs: siteInspection.refs,
    },
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
  // 措辞必须如实：pin 未满足时 expectedRed 非空，此时写「无预期红」就是在骗读日志的人。
  const expectedRedNote = expectedRed.length === 0
    ? '无预期红'
    : `另有 ${expectedRed.length} 条预期红（⏳ 已逐条列出，均属 T-R03/T-R05 完成前的规定状态）`;
  console.log(`[verify-provenance] ✅ PASS：${checks} 项断言（门 1/2/3/7a/7b/7c/9/10 全绿，${expectedRedNote}）`);
}

await main();
