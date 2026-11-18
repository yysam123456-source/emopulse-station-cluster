// 参数池机械抽取（REUSE-4 v1.1 的地基，T-R02 第 1 批交付物 ①）。
//
// 为什么必须机械抽取而不是 manifest 自报：
//   v1.0 让每个 manifest 自己写 `paramSurface.total`，结果 8/8 都填成 `enumerated.length`，
//   搬运率恒等 100%。分母一旦自评，指标就恒真。本脚本用 TypeScript AST 从原件源码
//   机械枚举参数，manifest 只能声明「哪些文件属于移植面」（scope）与「我真的接线了哪几个」
//   （enumerated），两者都要和本脚本算出的池子对得上。
//
// 抽取口径（ARCHITECTURE-REUSE §3.3 v1.2，逐条可复算）：
//   N1 VariableDeclaration 初值 numeric-ish（const MAXROLL = rad(5)）
//   N2 PropertyAssignment  初值 numeric-ish（kohaku: { t1: 0.53 } 的 t1）
//   N3 PropertyDeclaration 初值 numeric-ish（类字段 fov = 55）
//   N4 Parameter           默认值 numeric-ish（function f(NS = 52)）
// 去噪：
//   E1 数学常量白名单（PI/TAU/E/…）
//   E2 单字母标识符（/^[A-Za-z]$/）
//   E3 颜色类键（REUSE: 颜色必须来自 biome token）
//   E4 尺寸/运行时类键（resolution/width/height/…）
//   E5 迭代变量（for 的 init/update、for-of/for-in 的 left 里声明的名字）
//   E6 可变局部状态（`let` 绑定 + numeric-ish 初值，但在其作用域内被写操作改过）
//      依据：koi.js:415 `let ax = 0, ay = 0, excite = 0` → L423 `ax -= …` / L430 `ax += …`；
//            L435 `let food = null, fd = 2.6` → 随后 `fd = d`；cdp.js:18 `let id = 0` → `++id`。
//      写操作口径（写死，含普通 `=`，因为 §3.3.6 点名的 `fd = d` 就是普通赋值）：
//      `=` + 全部复合赋值（`+= -= *= /= %= **= <<= >>= >>>= &= |= ^=`）+ `++` / `--`。
//      作用域口径：取最近的函数类节点 / 源文件；实测与文档 §3.3.2 的「文件内」口径结果完全一致
//      （8 件 P_all / P_scope 逐位相同），此处采用更窄的一个，方向是「少剔」而非「多剔」。
//   E7 三方库信封键（`{ value|uniforms|elements|needsUpdate: <numeric-ish> }` 的键）
//      依据：koi.js:389 `uPitch: { value: 0 }` —— THREE.js uniform 的信封键，不是参数名。
//
// E5/E6/E7 共用同一条 guard（防止误伤真参数）：
//   以「名字 + 文件」分组；只有当该名字的**首个采集记录**命中可疑类别、
//   且同组内**没有任何一条记录是干净的真参数记录**（如 VARIETIES 里的 N2）时才剔除。
//   即：同一个名字若同时以真实参数身份被采集，则不剔除。
//
// 双向约束：被 E1–E7 剔除的名字同样不得写进 params / enumerated（脚本对 params 跑同一套判定）。
//
// 【口径冻结 2026-11-18】E1–E7 为最终去噪集，不再追加。
// 加规则 = 改分母 = 改结论，须主理人书面核准。
//
// E6 的已知盲区（主理人 2026-11-18 核准接受，不为此加第 8 条规则）：
//   `let x = 0.5` 紧跟 `x *= 0.5` 这种形状，AST 上无法区分「初值是算法参数、改写在算法内」
//   与「纯运行期状态」。`ascii-kit/lib/kit.js:59` 的 `amp` 恰是前者（fbm 起始振幅 0.5、每层衰减一半），
//   而 `koi.js:415` 的 `ax` 是后者。接受的代价：`ascii-kit` 的 P_all 少 2（6→4），
//   但它是 D4、rate 为 n/a，对任何门的结论都无影响。
//
// 用法：
//   node tests/lib/param-pool.mjs --report     # 逐零件打印 P_all / P_scope / 剔除明细
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/** 零件库根目录（绝对）。 */
const LIB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'shared', 'parts-library');

/** 参与抽取的扩展名。 */
const SCRIPT_EXTENSIONS = new Set(['.js', '.mjs', '.ts']);

/** E1：数学常量白名单（不是可调参数）。 */
const MATH_CONSTANTS = new Set([
  'PI', 'TAU', 'E', 'EPSILON', 'LN2', 'LN10', 'SQRT2', 'SQRT1_2', 'TWO_PI', 'HALF_PI', 'DEG2RAD', 'RAD2DEG',
]);

/** E2：单字母标识符。 */
const SINGLE_LETTER = /^[A-Za-z]$/;

/** E3：颜色类键（v2.1 R5：颜色必须来自 biome token）。 */
const COLOR_KEY = /^(colou?r|c1|c2|base|tint|hue|sat|bg|fin|finroot|water|ink|skin|shade|palette|pal|fg|accent|glow)$/i;

/** E4：尺寸 / 运行时类键。 */
const RUNTIME_KEY = /^(resolution|res|width|height|size|dpr|pixelratio|aspect|scale|viewport)$/i;

/** E7：三方库信封键（`{ value: 0 }` 里的 key 是信封结构，不是参数名）。 */
const ENVELOPE_KEY = new Set(['value', 'uniforms', 'elements', 'needsUpdate']);

/** numeric-ish 允许的调用（被调用者文本白名单）。 */
const NUMERIC_CALLS = new Set([
  'rad', 'deg', 'clamp', 'Math.min', 'Math.max', 'Math.round', 'Math.floor', 'Math.ceil',
  'Math.abs', 'Math.pow', 'Math.sqrt', 'Math.hypot',
]);

/**
 * 判断节点是否 numeric-ish（穷举 6 条，不扩展）。
 * @param {ts.Node} node AST 节点
 * @param {ts.SourceFile} sf 源文件（用于 getText）
 * @returns {boolean} 是否计入参数池
 */
export function isNumericish(node, sf) {
  if (!node) return false;
  if (ts.isNumericLiteral(node)) return true;
  if (ts.isPrefixUnaryExpression(node)) {
    const isPlusOrMinus = node.operator === ts.SyntaxKind.PlusToken || node.operator === ts.SyntaxKind.MinusToken;
    return isPlusOrMinus && isNumericish(node.operand, sf);
  }
  if (ts.isParenthesizedExpression(node)) return isNumericish(node.expression, sf);
  if (ts.isBinaryExpression(node)) {
    return isNumericish(node.left, sf) && isNumericish(node.right, sf);
  }
  if (ts.isPropertyAccessExpression(node)) {
    const objectText = node.expression.getText(sf);
    return objectText === 'Math' || objectText === 'THREE.MathUtils';
  }
  if (ts.isCallExpression(node)) {
    const calleeText = node.expression.getText(sf);
    if (!NUMERIC_CALLS.has(calleeText)) return false;
    return node.arguments.every((argument) => isNumericish(argument, sf));
  }
  return false;
}

/**
 * 收集文件里所有「迭代变量」名字（E5）。
 * @param {ts.SourceFile} sf 源文件
 * @returns {Set<string>} 迭代变量名集合
 */
function collectLoopNames(sf) {
  const names = new Set();
  const addBindings = (node) => {
    if (!node) return;
    if (ts.isVariableDeclarationList(node)) {
      for (const declaration of node.declarations) {
        if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
      }
      return;
    }
    if (ts.isIdentifier(node)) names.add(node.text);
  };

  const visit = (node) => {
    if (ts.isForStatement(node)) {
      addBindings(node.initializer);
      // update 通常不是声明，但 `for (;; i++)` 的 i 由 init 声明；这里不误伤普通表达式
      if (node.incrementor && ts.isVariableDeclarationList(node.incrementor)) addBindings(node.incrementor);
    } else if (ts.isForOfStatement(node) || ts.isForInStatement(node)) {
      addBindings(node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return names;
}

/** 自增/自减运算符集合（E6 的写操作口径之一）。 */
const STEP_OPERATORS = new Set([ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken]);

/**
 * 取节点的「作用域边界」：最近的函数类节点或源文件。
 * 变量声明的作用域边界用于 E6 判断「是否在同一作用域内被改写」。
 * @param {ts.Node} node 任意节点
 * @returns {ts.Node} 作用域边界节点
 */
function enclosingScope(node) {
  let current = node.parent;
  while (current) {
    if (ts.isSourceFile(current) || ts.isFunctionLike(current)) return current;
    current = current.parent;
  }
  return node.getSourceFile();
}

/** 作用域内写操作集合的缓存（同一源文件内复用，避免重复遍历）。 */
const WRITTEN_CACHE = new WeakMap();

/**
 * 收集某个作用域内被写过的标识符（E6 依据）。
 *
 * 口径（写死，不扩展）：任何赋值表达式（`=` 及全部复合赋值）的左侧标识符、
 * 以及 `++`/`--` 的操作数标识符。嵌套函数里的闭包写也算（它确实改了外层绑定）。
 * @param {ts.Node} scopeNode 作用域边界节点
 * @returns {Set<string>} 被写过的名字集合
 */
function collectWrittenNames(scopeNode) {
  const cached = WRITTEN_CACHE.get(scopeNode);
  if (cached) return cached;

  const names = new Set();
  const visit = (node) => {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
      && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
      if (ts.isIdentifier(node.left)) names.add(node.left.text);
    } else if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node))
      && STEP_OPERATORS.has(node.operator) && ts.isIdentifier(node.operand)) {
      names.add(node.operand.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(scopeNode);
  WRITTEN_CACHE.set(scopeNode, names);
  return names;
}


/**
 * 取节点名（变量名 / 属性键名 / 参数名）。
 * @param {ts.Node} nameNode 名字节点
 * @returns {string|null} 名字文本；解构等无法归名的返回 null
 */
function nameOf(nameNode) {
  if (!nameNode) return null;
  if (ts.isIdentifier(nameNode) || ts.isPrivateIdentifier(nameNode)) return nameNode.text;
  if (ts.isStringLiteral(nameNode) || ts.isNumericLiteral(nameNode)) return nameNode.text;
  return null;
}

/**
 * 判断一个 N1 变量声明的绑定是否为 `let`（E6 只对 let 生效：const 不可能被重新赋值）。
 * @param {ts.VariableDeclaration} node 变量声明节点
 * @returns {boolean} 是否 let 绑定
 */
function isLetBinding(node) {
  const list = node.parent;
  if (!list || !ts.isVariableDeclarationList(list)) return false;
  return (list.flags & ts.NodeFlags.Let) !== 0;
}

/**
 * 从单个源文件抽取候选参数（N1–N4）。
 * @param {ts.SourceFile} sf 源文件
 * @param {string} relPath 相对 parts-library 的 POSIX 路径
 * @returns {{name: string, kind: string, file: string, line: number, isLet: boolean, scope: ts.Node}[]} 候选
 *   isLet / scope 只在 E6 判定中使用，不进入输出
 */
function extractCandidates(sf, relPath) {
  const candidates = [];
  const visit = (node) => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

    if (ts.isVariableDeclaration(node) && node.initializer && isNumericish(node.initializer, sf)) {
      const name = nameOf(node.name);
      if (name) candidates.push({ name, kind: 'N1', file: relPath, line, isLet: isLetBinding(node), scope: enclosingScope(node) });
    } else if (ts.isPropertyAssignment(node) && node.initializer && isNumericish(node.initializer, sf)) {
      const name = nameOf(node.name);
      if (name) candidates.push({ name, kind: 'N2', file: relPath, line, isLet: false, scope: enclosingScope(node) });
    } else if (ts.isPropertyDeclaration(node) && node.initializer && isNumericish(node.initializer, sf)) {
      const name = nameOf(node.name);
      if (name) candidates.push({ name, kind: 'N3', file: relPath, line, isLet: false, scope: enclosingScope(node) });
    } else if (ts.isParameter(node) && node.initializer && isNumericish(node.initializer, sf)) {
      const name = nameOf(node.name);
      if (name) candidates.push({ name, kind: 'N4', file: relPath, line, isLet: false, scope: enclosingScope(node) });
    }

    ts.forEachChild(node, visit);
  };
  visit(sf);
  return candidates;
}

/**
 * 名字级去噪（E1–E4）：与采集形状无关，命中即剔除。
 * @param {string} name 参数名
 * @returns {'E1'|'E2'|'E3'|'E4'|null} 命中的码；null = 未命中
 */
function nameCode(name) {
  if (MATH_CONSTANTS.has(name)) return 'E1';
  if (SINGLE_LETTER.test(name)) return 'E2';
  if (COLOR_KEY.test(name)) return 'E3';
  if (RUNTIME_KEY.test(name)) return 'E4';
  return null;
}

/**
 * 记录级去噪（E5 / E6 / E7）：依赖「这一条记录是怎么被采集的」。
 * @param {{name: string, kind: string, isLet: boolean, scope: ts.Node}} record 采集记录
 * @param {{loopNames: Set<string>}} ctx 该文件的上下文
 * @returns {'E5'|'E6'|'E7'|null} 命中的码；null = 这条记录是干净的真参数记录
 */
function recordCode(record, ctx) {
  if (ctx.loopNames.has(record.name)) return 'E5';
  if (record.kind === 'N1' && record.isLet && collectWrittenNames(record.scope).has(record.name)) return 'E6';
  if (record.kind === 'N2' && ENVELOPE_KEY.has(record.name)) return 'E7';
  return null;
}


/**
 * 解析相对路径（相对 parts-library）；也接受绝对路径。
 * @param {string} file 路径
 * @returns {string} 绝对路径
 */
function resolvePartFile(file) {
  return path.isAbsolute(file) ? file : path.join(LIB_ROOT, file);
}

/**
 * 把绝对路径转成相对 parts-library 的 POSIX 路径（报告用）。
 * @param {string} absPath 绝对路径
 * @returns {string} POSIX 相对路径
 */
function toPosixRelative(absPath) {
  return path.relative(LIB_ROOT, absPath).split(path.sep).join('/');
}

/**
 * 判断文件是否参与参数抽取（§4.1）。
 * @param {string} absPath 绝对路径
 * @returns {boolean} 是否参与
 */
export function isParamSourceFile(absPath) {
  const base = path.basename(absPath);
  if (base.endsWith('.d.ts')) return false;
  if (base === 'part.manifest.ts') return false;
  if (!SCRIPT_EXTENSIONS.has(path.extname(absPath))) return false;
  const rel = toPosixRelative(absPath);
  // 我方新增的装配壳 / 移植层不属于「原件参数面」
  if (/(^|\/)index\.ts$/.test(rel)) return false;
  if (rel.includes('/core/') || rel.includes('/render/')) return false;
  return true;
}

/**
 * 对一组文件做参数池抽取。
 * @param {readonly string[]} files 文件路径（相对 parts-library 或绝对）
 * @returns {{ pool: string[], excluded: {name: string, code: string, file: string, line: number}[], scanned: string[] }}
 *   pool：保留的参数名（去重、升序）；excluded：被 E1–E7 剔除的每一次出现（含文件与行号）
 */
export function computePool(files) {
  const scanned = [];
  const kept = new Set();
  const excluded = [];

  for (const file of files) {
    const abs = resolvePartFile(file);
    if (!isParamSourceFile(abs)) continue;
    if (!statSync(abs, { throwIfNoEntry: false })?.isFile()) continue;
    const rel = toPosixRelative(abs);
    scanned.push(rel);

    const source = readFileSync(abs, 'utf8');
    const kind = path.extname(abs) === '.ts' ? ts.ScriptKind.TS : ts.ScriptKind.JS;
    // setParentNodes=true：E6 需要 node.parent 取 VariableDeclarationList 的 let 标志与作用域边界
    const sf = ts.createSourceFile(abs, source, ts.ScriptTarget.Latest, true, kind);
    const ctx = { loopNames: collectLoopNames(sf) };

    // 按「名字」分组后逐组判定：E1–E4 名字级；E5–E7 走「首采集记录 + 干净记录」guard
    const groups = new Map();
    for (const candidate of extractCandidates(sf, rel)) {
      const list = groups.get(candidate.name);
      if (list) list.push(candidate);
      else groups.set(candidate.name, [candidate]);
    }

    for (const [name, records] of groups) {
      const byName = nameCode(name);
      if (byName) {
        for (const record of records) excluded.push({ name, code: byName, file: record.file, line: record.line });
        continue;
      }
      // guard：首个采集记录不可疑 → 保留；可疑但同组存在干净记录 → 保留（真参数身份优先）
      const firstCode = recordCode(records[0], ctx);
      if (!firstCode) {
        kept.add(name);
        continue;
      }
      const hasCleanRecord = records.some((record) => recordCode(record, ctx) === null);
      if (hasCleanRecord) {
        kept.add(name);
        continue;
      }
      for (const record of records) excluded.push({ name, code: firstCode, file: record.file, line: record.line });
    }
  }

  return {
    pool: [...kept].sort(),
    excluded: excluded.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1)),
    scanned,
  };
}

/**
 * 只对「移植面」文件做抽取（供门 7a/7b 的 P_scope 使用）。
 * @param {readonly string[]} scopePaths 移植面文件路径（必须已在 provenance.files[] 内）
 * @returns {ReturnType<typeof computePool>} 同 computePool
 */
export function scopePool(scopePaths) {
  return computePool(scopePaths);
}

/**
 * 把剔除明细按码分组打印。
 * @param {{name: string, code: string, file: string, line: number}[]} excluded 剔除明细
 * @param {string} indent 缩进
 */
function printExcluded(excluded, indent = '    ') {
  const codes = ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7'];
  for (const code of codes) {
    const items = excluded.filter((item) => item.code === code);
    if (items.length === 0) continue;
    const names = [...new Set(items.map((item) => item.name))].sort();
    console.log(`${indent}${code}（${names.length} 名 / ${items.length} 处）：${names.join(', ')}`);
  }
}

/** CLI：逐零件打印 P_all / P_scope / 覆盖率 / 剔除明细。 */
async function report() {
  const { loadTsModule, REPO_ROOT } = await import('./load-ts.mjs');
  const registry = await loadTsModule(path.join(REPO_ROOT, 'shared', 'parts-library', 'registry', 'index.ts'));
  const manifests = registry.PART_MANIFESTS;

  console.log(`[param-pool] 零件 ${manifests.length} 件，机械抽取参数池（N1–N4 / E1–E7）`);
  const rows = [];
  for (const manifest of manifests) {
    const provenance = manifest.provenance;
    if (!provenance) {
      console.log(`  ${manifest.id}: 缺 provenance，跳过`);
      continue;
    }
    const allFiles = provenance.files.map((file) => file.path);
    const pAll = computePool(allFiles);
    const scope = provenance.paramSurface?.scope ?? [];
    const pScope = scopePool(scope.map((entry) => entry.path));
    const enumerated = provenance.paramSurface?.enumerated ?? [];
    const wired = enumerated.filter((name) => pScope.pool.includes(name));
    const coverage = pAll.pool.length === 0 ? 0 : pScope.pool.length / pAll.pool.length;
    const rate = pScope.pool.length === 0 ? null : wired.length / pScope.pool.length;
    const applicable = provenance.depth === 'D2' || provenance.depth === 'D3';

    rows.push({ id: manifest.id, depth: provenance.depth, pAll, pScope, enumerated, wired, coverage, rate, applicable });
  }

  console.log('  id                depth  P_all  P_scope  wired  覆盖率   搬运率(仅D2/D3)');
  for (const row of rows) {
    const rateText = row.applicable ? `${(row.rate * 100).toFixed(1)}%` : 'n/a';
    console.log(
      `  ${row.id.padEnd(16)} ${row.depth.padEnd(5)} ${String(row.pAll.pool.length).padStart(5)} ` +
      `${String(row.pScope.pool.length).padStart(8)} ${String(row.wired.length).padStart(6)} ` +
      `${(row.coverage * 100).toFixed(1).padStart(7)}%  ${rateText}`,
    );
  }

  console.log('\n[param-pool] 逐零件明细（剔除按 E1–E7 分组）：');
  for (const row of rows) {
    console.log(`\n  ▸ ${row.id}（depth=${row.depth}，扫描 ${row.pAll.scanned.length} 文件）`);
    console.log(`    P_all=${row.pAll.pool.length}｜P_scope=${row.pScope.pool.length}｜wired=${row.wired.length}｜enumerated=[${row.enumerated.join(', ')}]`);
    console.log(`    P_scope 保留名：${row.pScope.pool.join(', ') || '(空)'}`);
    printExcluded(row.pAll.excluded);
  }

  const koi = rows.find((row) => row.id === 'koi');
  if (koi) {
    console.log(`\n[param-pool] koi 的 P_all 完整名单（${koi.pAll.pool.length} 名）：`);
    console.log(`  ${koi.pAll.pool.join(', ') || '(空)'}`);
    console.log(`[param-pool] koi 的 P_scope 剩余（${koi.pScope.pool.length} 名）：`);
    console.log(`  ${koi.pScope.pool.join(', ') || '(空)'}`);
  }
}

if (process.argv.includes('--report')) {
  await report();
}
