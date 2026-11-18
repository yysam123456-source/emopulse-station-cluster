// 死参数探针（REUSE-5，ARCHITECTURE-REUSE §4.3，T-R02 第 3 批交付物 ②）。
//
// 要解决的唯一问题：**manifest 声称「这个参数接线了」是不是真的？**
//   「名字在文件里出现过」证明不了任何事（`const X = 1.8` 出现一次但没接线也能过 greps）。
//   「黄金值绿」也证明不了（黄金值验的是另一组输入下的输出，不验某个参数是否被读）。
//   唯一能证明「参数 P 真的影响输出」的机械方法是：**只改 P，看输出变不变**。改了不变 = 死参数。
//
// 双模式（§4.3）：
//   Mode A · 纯核探针   喂 `fn(...args, PARAMS)`，只改一个键 ±10%，比对输出签名（阈值 1e-9）。
//                       适用于所有 D3 零件（AD-1 要求 core 纯函数 + 显式 PARAMS 注入）。
//   Mode B · 指令指纹   输出必须经 Canvas2D 才能观察的零件（如 dandelion 的释放调度可视化）。
//                       用 `tests/lib/canvas-recorder.mjs` 把绘制调用录成指令流，同输入重放
//                       两次 digest 必须完全相等（确定性），改参数 digest 必须变（敏感性）。
//
// 三条防误判规则（§4.3，少一条就会假红）：
//   ① 灵敏度门槛：每个符号的 golden 用例 ≥ 2 条，且**不得全落在同一输出点**（退化区间）。
//      例：`halfWidth(0.25)` 处 `sm(0.25,0.83,0.25)=0`，对 `taperAmt` 天然不敏感 ——
//      只给这一条用例，`taperAmt` 会被误判为死参数。必须同时有 `s=0.5` / `s=0.7`。
//   ② 差异阈值 `1e-9`：只要求「有可测变化」，不要求「变化显著」（远小于黄金值容差 1e-6）。
//   ③ 不可探针参数必须移出 `params`：结构上不影响输出的参数（如 `normalEps` 只影响 3D 法线）
//      不得写进 `params`，改在 `downgrade` 里说明。字符串参数无法做 ±10% 变异 → 判违规。
//
// 纪律：
//   - 探针**只读** manifest 与 golden，绝不写回任何期望值、绝不改写 `enumerated`。
//     「探针判死谁，就从 enumerated 删掉谁」是**人**的动作（§3.3.8），由主理人裁决。
//   - 有 `ported[].params` 但探针无法执行（无 core、无 golden、符号不在模块里）→ **红**，
//     不是 skip。「无法证明」与「证明为假」在验收上同价：都不能算「已接线」。
//
// 用法：
//   node tests/mutation-probe.mjs            # 自检 + 真实零件；有硬失败则 exit 1
//   node tests/mutation-probe.mjs --report   # 额外把结构化结果打到 stdout（JSON）
import path from 'node:path';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { REPO_ROOT, loadTsModule } from './lib/load-ts.mjs';
import { ADAPTERS, LIB, loadAdapter, resolveSymbolModule } from './lib/part-adapters.mjs';
import { createRecordingCtx, recordFrames, timeline } from './lib/canvas-recorder.mjs';

/** 参数变异幅度（±10%，§4.3）。 */
const MUTATION_FACTOR = 0.1;
/** 输出变化阈值（§4.3 规则 ②）。 */
const CHANGE_EPS = 1e-9;
/** 每个符号要求的最少 golden 用例数（§4.3 规则 ①）。 */
const MIN_CASES_PER_SYMBOL = 2;
/** 参数值绝对值低于此值时，比例变异会退化成 0 → 改用绝对变异。 */
const ZERO_GUARD = 1e-12;
/** 零值附近的绝对变异量。 */
const ZERO_ABSOLUTE_DELTA = 0.1;
/** golden 清单目录。 */
const GOLDEN_DIR = path.join(REPO_ROOT, 'tests', 'golden');

const failures = [];
const expectedRed = [];
const warnings = [];
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
 * 两个输出值之间的最大差异；`Infinity` 表示「类型/结构不同，确有差异但不可量化」。
 * @param {unknown} a 基线输出
 * @param {unknown} b 变异后输出
 * @returns {number} 最大差异
 */
function maxDelta(a, b) {
  if (typeof a === 'number' && typeof b === 'number') {
    if (Number.isNaN(a) && Number.isNaN(b)) return 0;
    if (!Number.isFinite(a) || !Number.isFinite(b)) return Object.is(a, b) ? 0 : Number.POSITIVE_INFINITY;
    return Math.abs(a - b);
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return Number.POSITIVE_INFINITY;
    let worst = 0;
    for (let index = 0; index < a.length; index += 1) {
      const delta = maxDelta(a[index], b[index]);
      if (delta === Number.POSITIVE_INFINITY) return Number.POSITIVE_INFINITY;
      if (delta > worst) worst = delta;
    }
    return worst;
  }
  // 字符串 / 布尔 / 枚举 / undefined：只判等，差异记为 Infinity（"变了"但无量化意义）
  return Object.is(a, b) ? 0 : Number.POSITIVE_INFINITY;
}

/**
 * 格式化差异值用于打印。
 * @param {number} delta 差异
 * @returns {string} 可读文本
 */
function formatDelta(delta) {
  if (delta === Number.POSITIVE_INFINITY) return '≠';
  if (delta === 0) return '0';
  return delta.toExponential(2);
}

/**
 * 为一个参数键生成两个变异体（±10%）。
 *
 * 零值特判的理由：`0 * 0.9 === 0`，比例变异在 0 处完全失效，会把「0 附近确实敏感」的参数
 * 误判成死参数。改用 ±0.1 绝对变异，语义仍是「只动这一个键」，不违反 §4.3。
 *
 * @param {number|readonly number[]} value 参数当前值
 * @returns {{label: string, next: number|number[]}[]} 两个变异体
 */
function mutatorsFor(value) {
  if (typeof value === 'number') {
    const tiny = Math.abs(value) < ZERO_GUARD;
    const low = tiny ? value - ZERO_ABSOLUTE_DELTA : value * (1 - MUTATION_FACTOR);
    const high = tiny ? value + ZERO_ABSOLUTE_DELTA : value * (1 + MUTATION_FACTOR);
    return [
      { label: tiny ? `Δ-${ZERO_ABSOLUTE_DELTA}` : `×${(1 - MUTATION_FACTOR).toFixed(1)}`, next: low },
      { label: tiny ? `Δ+${ZERO_ABSOLUTE_DELTA}` : `×${(1 + MUTATION_FACTOR).toFixed(1)}`, next: high },
    ];
  }
  if (Array.isArray(value)) {
    // 数值数组（梯度 / 表格行）：全体元素同比例缩放，仍是「只动这一个键」
    const scale = (factor) => value.map((item) => (typeof item === 'number' ? (Math.abs(item) < ZERO_GUARD ? item + ZERO_ABSOLUTE_DELTA : item * factor) : item));
    return [
      { label: `×${(1 - MUTATION_FACTOR).toFixed(1)}`, next: scale(1 - MUTATION_FACTOR) },
      { label: `×${(1 + MUTATION_FACTOR).toFixed(1)}`, next: scale(1 + MUTATION_FACTOR) },
    ];
  }
  return [];
}

/**
 * Mode A：对一个符号做全参数键的死参数探测。
 *
 * @param {object} target 探测目标
 * @param {string} target.part 零件 id（自检样本时为样本名）
 * @param {string} target.symbol 符号名
 * @param {Function} target.fn 待测函数，签名必须为 `(...args, params)`（AD-1 显式注入）
 * @param {{args: unknown[]}[]} target.cases golden 用例（只用 args）
 * @param {Record<string, unknown>} target.base 基线参数对象
 * @returns {{rows: object[], dead: string[], problems: string[]}} 探测结果
 */
function probeSymbol(target) {
  const { part, symbol, fn, cases, base } = target;
  const problems = [];
  const rows = [];
  const dead = [];

  if (typeof fn !== 'function') {
    return { rows, dead, problems: [`${part}.${symbol} 在目标模块里不是函数（portedTo 落点或符号名写错）`] };
  }
  if (!Array.isArray(cases) || cases.length < MIN_CASES_PER_SYMBOL) {
    return {
      rows,
      dead,
      problems: [`${part}.${symbol} 只有 ${Array.isArray(cases) ? cases.length : 0} 条 golden 用例（§4.3 规则 ① 要求 ≥ ${MIN_CASES_PER_SYMBOL}，否则灵敏度判不了）`],
    };
  }

  // 基线输出
  const baseline = [];
  for (const item of cases) {
    const args = Array.isArray(item?.args) ? item.args : [];
    try {
      baseline.push(fn(...args, base));
    } catch (error) {
      return { rows, dead, problems: [`${part}.${symbol}(${JSON.stringify(args)}) 基线调用抛错：${String(error.message).split('\n')[0]}（AD-1 要求 fn(...args, params) 显式注入）`] };
    }
  }

  // 规则 ①：用例不得全落在同一输出点，否则「输出不变」可能只是用例退化，不是参数死
  const distinct = new Set(baseline.map((value) => JSON.stringify(value) ?? 'undefined'));
  if (distinct.size < MIN_CASES_PER_SYMBOL) {
    problems.push(`${part}.${symbol} 的 ${cases.length} 条用例只产出 ${distinct.size} 种输出（可能全在退化区间，探针会假红；§4.3 规则 ① 要求补非退化点用例）`);
  }

  for (const [key, value] of Object.entries(base)) {
    const mutators = mutatorsFor(value);
    if (mutators.length === 0) {
      problems.push(`${part}.${symbol}.${key} 不是数值/数值数组（${typeof value}），无法做 ±10% 变异 —— §4.3 规则 ③ 要求移出 params 并改在 downgrade 说明`);
      continue;
    }
    let alive = false;
    let worstDelta = 0;
    const detail = [];
    for (const mutator of mutators) {
      const mutated = { ...base, [key]: mutator.next };
      let changed = false;
      let factorWorst = 0;
      for (let index = 0; index < cases.length; index += 1) {
        const args = Array.isArray(cases[index]?.args) ? cases[index].args : [];
        let out;
        try {
          out = fn(...args, mutated);
        } catch (error) {
          problems.push(`${part}.${symbol}.${key} 变异体 ${mutator.label} 调用抛错：${String(error.message).split('\n')[0]}`);
          factorWorst = Number.POSITIVE_INFINITY;
          changed = true;
          break;
        }
        const delta = maxDelta(baseline[index], out);
        if (delta > factorWorst) factorWorst = delta;
        if (delta > CHANGE_EPS) changed = true;
      }
      if (changed) alive = true;
      if (factorWorst === Number.POSITIVE_INFINITY) worstDelta = Number.POSITIVE_INFINITY;
      else if (factorWorst > worstDelta) worstDelta = factorWorst;
      detail.push(`${mutator.label}:${changed ? formatDelta(factorWorst) : '未变'}`);
    }
    rows.push({ key, alive, worstDelta, detail: detail.join(' ') });
    if (!alive) dead.push(key);
  }

  return { rows, dead, problems };
}

/**
 * 读零件的 golden 清单。
 * @param {string} partId 零件 id
 * @returns {{spec: object|null, error: string|null}} 清单与错误
 */
function readGoldenSpec(partId) {
  const file = path.join(GOLDEN_DIR, `${partId}.json`);
  if (!existsSync(file)) return { spec: null, error: `缺 tests/golden/${partId}.json（没有用例就无法判断参数灵敏度）` };
  try {
    return { spec: JSON.parse(readFileSync(file, 'utf8')), error: null };
  } catch (error) {
    return { spec: null, error: `tests/golden/${partId}.json 不是合法 JSON：${error.message}` };
  }
}

/** 探测结果表头。 */
const TABLE_HEAD = '  零件              符号              参数键              敏感   最坏 |Δ|   变异明细';

/**
 * 打印一行探测结果。
 * @param {string} part 零件 id
 * @param {string} symbol 符号名
 * @param {{key: string, alive: boolean, worstDelta: number, detail: string}} row 结果行
 */
function printRow(part, symbol, row) {
  console.log(`  ${part.padEnd(17)} ${symbol.padEnd(17)} ${row.key.padEnd(19)} ${(row.alive ? '✓' : '✗ 死').padEnd(6)} ${formatDelta(row.worstDelta).padEnd(9)} ${row.detail}`);
}

/**
 * Mode A · 自检：白盒样本上故意植入 1 个死参数，探针必须抓到（§4.6 验收点 ②）。
 *
 * 为什么自检不能省：「探针全绿」有两种可能 —— 参数真都活着，或者探针根本没在探。
 * 唯一能区分这两者的办法，是拿一个**已知为死**的参数喂进去，看它报不报红。
 * 同时放一个**已知为活**的参数做反向对照，防止探针变成「什么都判死」的橡皮锤。
 *
 * 样本放在 `tests/fixtures/`（而不是 `tests/lib/`）是刻意的：tsconfig 的 include 覆盖
 * `tests/fixtures/` 下的 ts，样本因此进 `npm run typecheck`；放 lib 下会变成没人检查的孤儿 TS。
 * @returns {Promise<boolean>} 自检是否通过
 */
async function selfCheckModeA() {
  const specimen = await loadTsModule(path.join(REPO_ROOT, 'tests', 'fixtures', 'probe-specimen.ts'));
  const base = specimen.SPECIMEN_PARAMS;
  const cases = [
    { args: [1] },
    { args: [2] },
    { args: [3] },
  ];
  const result = probeSymbol({
    part: '自检样本', symbol: 'shape', fn: specimen.shape, cases, base,
  });

  console.log('一、Mode A · 自检（白盒样本，故意植入 1 个死参数 + 1 个活参数做反向对照）');
  console.log(TABLE_HEAD);
  for (const row of result.rows) printRow('自检样本', 'shape', row);

  const caught = result.dead.length === 1 && result.dead[0] === 'deadGain';
  const notOverkill = result.rows.some((row) => row.key === 'gain' && row.alive);
  console.log(`  结论：抓到死参数 ${JSON.stringify(result.dead)}；活参数 gain ${notOverkill ? '未被误杀' : '被误杀（探针过严）'}`);
  check(caught, `Mode A 自检失败：应只抓到 deadGain，实际 ${JSON.stringify(result.dead)}（探针抓不出死参数 = 门形同虚设）`);
  check(notOverkill, 'Mode A 自检失败：活参数 gain 被误判为死参数（探针成了橡皮锤）');
  check(result.problems.length === 0, `Mode A 自检失败：样本本身有 ${result.problems.length} 条前置问题 —— ${result.problems.join('；')}`);
  console.log('');
  return caught && notOverkill && result.problems.length === 0;
}

/**
 * Mode A · 真实零件：遍历 PART_MANIFESTS 里所有声明了 `ported[].params` 的符号。
 *
 * 「无法证明」一律算红：没有 core、没有 golden、符号不在声称的落点里 —— 都不能算「已接线」。
 * 只是**存量**（D2/D3 零件尚未接线任何参数，params 全空）走 ⏳ 预期红，不导致 exit 1：
 * 那是 T-R03/T-R05 的施工面，不是本脚本的缺陷。
 * @returns {Promise<{probed: number, deadTotal: number, partRows: object[]}>} 汇总
 */
async function probeRealParts() {
  const registry = await loadTsModule(path.join(LIB, 'registry', 'index.ts'));
  const manifests = Array.isArray(registry.PART_MANIFESTS) ? registry.PART_MANIFESTS : [];

  console.log('二、Mode A · 真实零件（来源：manifest.provenance.ported[].params）');
  let probed = 0;
  let deadTotal = 0;
  let unprovable = 0;
  const partRows = [];
  let anyDeclared = false;

  for (const manifest of manifests) {
    const partId = String(manifest?.id ?? '(无 id)');
    const provenance = manifest?.provenance ?? {};
    const depth = String(provenance.depth ?? '');
    const ported = Array.isArray(provenance.ported) ? provenance.ported : [];
    const withParams = ported.filter((entry) => entry && entry.params && Object.keys(entry.params).length > 0);

    if (withParams.length === 0) {
      if (depth === 'D2' || depth === 'D3') {
        expectedRed.push(`⏳ ${partId}（${depth}）的 ported[].params 全空 → 死参数探针无可测面（存量：算法尚未接线，属 T-R03/T-R05 施工面）`);
      }
      continue;
    }

    anyDeclared = true;
    const { spec, error } = readGoldenSpec(partId);
    if (error) {
      unprovable += 1;
      check(false, `${partId}：${error}`);
      continue;
    }
    const cases = Array.isArray(spec.cases) ? spec.cases : [];

    // 加载实现：优先 manifest 声称的落点文件（顺带验 portedTo 承诺），退化到 golden 适配器
    let namespace = null;
    for (const entry of withParams) {
      const { absPath, fromPortedTo } = resolveSymbolModule(partId, entry.portedTo);
      if (!existsSync(absPath)) {
        const adapterName = String(spec.adapter ?? '');
        if (Object.hasOwn(ADAPTERS, adapterName)) {
          warnings.push(`⚠ ${partId}.${entry.symbol} 的 portedTo 落点不存在（${path.relative(REPO_ROOT, absPath)}），退化到 golden 适配器 ${adapterName}`);
          namespace = await loadAdapter(adapterName);
        } else {
          check(false, `${partId}.${entry.symbol}：portedTo 落点不存在且 golden 适配器未注册（${adapterName || '(空)'}）→ 无法证明该参数接线`);
        }
        break;
      }
      if (!fromPortedTo) warnings.push(`⚠ ${partId}.${entry.symbol} 的 portedTo 未给出可定位的文件，退化到 core/index.ts（门 1 应已抓）`);
      namespace = await loadTsModule(absPath);
      break;
    }
    if (!namespace) continue;

    const moduleParams = namespace.PARAMS && typeof namespace.PARAMS === 'object' ? namespace.PARAMS : null;
    for (const entry of withParams) {
      const symbol = String(entry.symbol);
      const declared = entry.params;
      // 基线参数：core 导出了 PARAMS 就以它为准（那才是运行时真值），否则用 manifest 声明值
      const base = moduleParams ? { ...moduleParams } : { ...declared };
      if (moduleParams) {
        const orphan = Object.keys(declared).filter((key) => !Object.hasOwn(moduleParams, key));
        check(orphan.length === 0, `${partId}.${symbol} 的 params 键 [${orphan.join(', ')}] 不在 core 导出的 PARAMS 里 → 该参数不可能被读到（死参数）`);
        const drift = Object.keys(declared).filter((key) => Object.hasOwn(moduleParams, key) && typeof declared[key] === 'number' && typeof moduleParams[key] === 'number' && Math.abs(declared[key] - moduleParams[key]) > 1e-12);
        if (drift.length > 0) {
          warnings.push(`⚠ ${partId}.${symbol} 的 params 声明值与 core PARAMS 不一致：[${drift.map((key) => `${key}=${declared[key]} vs ${moduleParams[key]}`).join(', ')}]（manifest 应登记实际接线值）`);
        }
      }
      const symbolCases = cases.filter((item) => String(item?.symbol ?? '') === symbol);
      const result = probeSymbol({
        part: partId, symbol, fn: namespace[symbol], cases: symbolCases, base,
      });
      probed += 1;
      deadTotal += result.dead.length;
      partRows.push({ part: partId, symbol, ...result });

      console.log(TABLE_HEAD);
      if (result.rows.length === 0) {
        const reason = result.problems[0] ?? '该符号没有任何可测参数键';
        console.log(`  ${partId.padEnd(17)} ${symbol.padEnd(17)} (无可测键) ${reason}`);
      }
      for (const row of result.rows) printRow(partId, symbol, row);

      if (result.dead.length > 0) {
        check(false, `${partId}.${symbol} 死参数 [${result.dead.join(', ')}]：改 ±10% 输出未变（|Δ| ≤ ${CHANGE_EPS}）——要么没接线，要么该符号未按 AD-1 显式注入 PARAMS`);
      }
      const precondition = result.problems.filter((item) => !item.includes('死参数'));
      if (precondition.length > 0) unprovable += 1;
      check(precondition.length === 0, `${partId}.${symbol} 探针前置条件不满足：${precondition.join('；')}`);
    }
  }

  const unregistered = findUnregisteredParts(manifests);
  for (const partId of unregistered) {
    expectedRed.push(`⏳ ${partId} 已有磁盘 manifest 但未注册进 PART_MANIFESTS —— 本探针不判（注册后自动接管；门 10 drift 已显影）`);
  }

  if (!anyDeclared) {
    console.log(`  ⏳ ${manifests.length} 件已注册零件中 0 件声明了 ported[].params —— 探针今天没有真实探测量。`);
    console.log('     这不是「死参数 = 0 已验收」，而是「尚无参数可探」（存量）。');
    console.log('     判据：manifest 的 ported[].params 是唯一入口，T-R03/T-R05 接线后本表自动长出内容。');
  }
  console.log('');
  return { probed, deadTotal, unprovable, partRows };
}

/**
 * 找出「磁盘上有 manifest 但没注册进 PART_MANIFESTS」的零件目录。
 *
 * 为什么只打印不判：注册是零件维护者的动作（谁施工谁注册）。替别人注册 = 替别人签字；
 * 而漏注册本身已由 `verify-provenance` 的门 10 drift 显影。这里只做「别让人误以为探过了」。
 * @param {readonly object[]} manifests 已注册清单
 * @returns {string[]} 未注册的零件 id
 */
function findUnregisteredParts(manifests) {
  const registered = new Set(manifests.map((manifest) => String(manifest?.id ?? '')));
  const found = [];
  for (const entry of readdirSync(LIB, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (registered.has(entry.name)) continue;
    if (existsSync(path.join(LIB, entry.name, 'part.manifest.ts'))) found.push(entry.name);
  }
  return found.sort();
}

/**
 * 合成重放样本：一个「按错峰时间释放 + 透明度衰减」的最小绘制过程。
 *
 * 为什么用合成样本做 Mode B 自检：§4.6 验收点 ④ 要求的正是「同输入两次调用 digest 完全相等」
 * 这条**确定性**性质，它属于 recorder 的性质，与具体零件无关。真实壳探针要等 T-R05/T-R06
 * 的 core 落地（见 `SHELL_TARGETS`）。样本用固定种子、无随机、无时钟，跨平台逐位一致。
 *
 * @param {object} ctx 记录型 ctx
 * @param {number} seconds 当前时间（秒）
 * @param {Record<string, number>} params 参数
 * @returns {number} 本帧实际绘制条数
 */
function specimenFrame(ctx, seconds, params) {
  const seeds = 8;
  const smoothstep = (edge0, edge1, x) => {
    const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  };
  let drawn = 0;
  for (let index = 0; index < seeds; index += 1) {
    const rank = (index + 1) / seeds;
    const release = rank * params.detach;
    const age = seconds - release;
    if (age < 0) continue;
    const travel = age * (0.4 + rank * 0.6);
    const fade = 1 - smoothstep(0.6, 1.6, travel);
    const alpha = params.alphaBase * Math.max(0, fade);
    if (alpha <= 1e-3) continue;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(320 + params.wind * travel * 60, 120 - travel * 40, 1.6 * fade, 0.9 * fade, rank, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    drawn += 1;
  }
  return drawn;
}

/** Mode B 自检样本的基线参数（含一个故意植入的死参数 `unusedGain`）。 */
const SPECIMEN_SHELL_PARAMS = Object.freeze({
  detach: 1.8,
  wind: 0.35,
  alphaBase: 0.9,
  unusedGain: 2.5,
});

/**
 * 在给定参数下重放整条时间线并返回指令指纹。
 * @param {Record<string, number>} params 参数
 * @param {number[]} frames 时间序列
 * @param {boolean} [sameCtx] 是否复用同一个 ctx（true 时先 reset，验证重放可重复）
 * @param {object} [reuse] 复用已有 ctx
 * @returns {{digest: string, commands: number, frames: number}} 指纹与规模
 */
function replaySpecimen(params, frames, sameCtx = false, reuse = null) {
  const ctx = sameCtx && reuse ? reuse : createRecordingCtx(640, 240);
  ctx.reset();
  let drawn = 0;
  for (const seconds of frames) drawn += specimenFrame(ctx, seconds, params);
  return { digest: ctx.digest(), commands: ctx.log.length, frames: drawn };
}

/**
 * Mode B · 自检：确定性（同输入两次 digest 相等）+ 敏感性（改参数 digest 变）+ 抓死参数。
 * @returns {boolean} 自检是否通过
 */
function selfCheckModeB() {
  const frames = timeline(0, 3, 0.1);
  console.log('三、Mode B · 自检（合成重放样本：错峰释放 + 透明度衰减，640×240，0–3 s / 0.1 s 步长）');

  const first = replaySpecimen(SPECIMEN_SHELL_PARAMS, frames);
  const second = replaySpecimen(SPECIMEN_SHELL_PARAMS, frames);
  // 复用同一个 ctx：验证 reset() 之后重放可重复（否则「同一 ctx 录两段」会因日志累加出现假差异）
  const shared = createRecordingCtx(640, 240);
  replaySpecimen(SPECIMEN_SHELL_PARAMS, frames, true, shared);
  const sharedAgain = replaySpecimen(SPECIMEN_SHELL_PARAMS, frames, true, shared);

  console.log(`  重放规模：${frames.length} 帧 / ${first.commands} 条指令 / 实际绘制 ${first.frames} 颗`);
  console.log(`  确定性：独立录制 ${first.digest.slice(0, 16)}… vs ${second.digest.slice(0, 16)}… → ${first.digest === second.digest ? '相等 ✓' : '不等 ✗'}`);
  console.log(`  确定性：同一 ctx reset 后重放 ${sharedAgain.digest.slice(0, 16)}… → ${first.digest === sharedAgain.digest ? '相等 ✓' : '不等 ✗'}`);

  check(first.commands > 0, 'Mode B 自检失败：样本录制到 0 条指令（样本没画东西 = 指纹恒等，门形同虚设）');
  check(sharedAgain.digest === first.digest, 'Mode B 自检失败：同一 ctx reset 后重放指纹不等（reset 未清干净或录入了非确定性状态）');
  check(first.digest === second.digest, 'Mode B 自检失败：同输入两次独立录制指纹不等（非确定性 → 不能作硬门）');
  check(/^[0-9a-f]{64}$/.test(first.digest), 'Mode B 自检失败：digest 不是 sha256 十六进制（recorder 实现异常）');

  const dead = [];
  for (const [key, value] of Object.entries(SPECIMEN_SHELL_PARAMS)) {
    const mutators = mutatorsFor(value);
    let alive = false;
    const detail = [];
    for (const mutator of mutators) {
      const mutated = { ...SPECIMEN_SHELL_PARAMS, [key]: mutator.next };
      const out = replaySpecimen(mutated, frames);
      const changed = out.digest !== first.digest;
      if (changed) alive = true;
      detail.push(`${mutator.label}:${changed ? '变' : '未变'}`);
    }
    console.log(`  ${key.padEnd(12)} ${alive ? '✓ 敏感' : '✗ 死'}   ${detail.join('  ')}`);
    if (!alive) dead.push(key);
  }
  check(dead.length === 1 && dead[0] === 'unusedGain', `Mode B 自检失败：应只抓到 unusedGain，实际 ${JSON.stringify(dead)}`);
  console.log('');
  return first.digest === second.digest && dead.length === 1 && dead[0] === 'unusedGain';
}

/**
 * Mode B · 真实壳探针目标表。
 *
 * 今天的条目为 0，原因是真实目标必须同时满足两条：① 输出经 canvas 才能观察；② 已有可装载的
 * `core/`（AD-1）。dandelion（释放调度可视化）属 T-R05，其 `core/meadow.ts` 尚未落地
 * （manifest: `completeness: 'absent'`，`files: []`）。落地后按下述形状追加一条即可，
 * 探针逻辑无需改动：
 *
 * ```js
 * {
 *   part: 'dandelion',
 *   base: () => ({ DETACH_SECONDS: 1.8, FLYING_ALPHA: 0.9 }),
 *   build: (ctx, params) => makeMeadow({ ctx, params }),   // 返回带 update(seconds) 的播放器
 *   paramKeys: ['DETACH_SECONDS', 'FLYING_ALPHA'],
 * }
 * ```
 * @type {{part: string, base: () => Record<string, unknown>, build: (ctx: object, params: Record<string, unknown>) => {update: (seconds: number) => void}, paramKeys: string[]}[]}
 */
const SHELL_TARGETS = [];

/**
 * Mode B · 单个壳目标的探测：确定性（两次重放指纹相等）+ 每个参数键的敏感性。
 * @param {{part: string, base: () => Record<string, unknown>, build: Function, paramKeys: string[]}} target 壳目标
 * @returns {{part: string, dead: string[], rows: object[]}} 结果
 */
function probeShellTarget(target) {
  const frames = timeline(0, 3, 0.1);
  /**
   * 用给定参数完整重放一遍，返回指令指纹。
   * 重放语义交给 `recordFrames`（§4.3 定义的唯一实现），本函数只负责「建零件 → 传参」。
   * @param {Record<string, unknown>} params 参数
   * @returns {string} 指令指纹
   */
  const run = (params) => {
    const ctx = createRecordingCtx(640, 240);
    const player = target.build(ctx, params);
    return recordFrames(player, frames, ctx).digest;
  };

  const baseline = run(target.base());
  check(baseline === run(target.base()), `Mode B ${target.part}：同输入两次重放指纹不等（非确定性 → 不能作硬门）`);

  const rows = [];
  const dead = [];
  for (const key of target.paramKeys) {
    const value = target.base()[key];
    const mutators = mutatorsFor(value);
    if (mutators.length === 0) {
      check(false, `Mode B ${target.part}.${key} 不是数值/数值数组，无法变异（§4.3 规则 ③）`);
      continue;
    }
    let alive = false;
    const detail = [];
    for (const mutator of mutators) {
      const changed = run({ ...target.base(), [key]: mutator.next }) !== baseline;
      if (changed) alive = true;
      detail.push(`${mutator.label}:${changed ? '变' : '未变'}`);
    }
    rows.push({ key, alive, detail: detail.join(' ') });
    if (!alive) dead.push(key);
  }
  return { part: target.part, dead, rows };
}

/**
 * Mode B · 真实零件。今天只打印「无目标」，不假绿也不假红。
 * @returns {{probed: number, deadTotal: number}} 汇总
 */
function probeRealShells() {
  console.log('四、Mode B · 真实零件（输出必须经 Canvas2D 才能观察的零件）');
  if (SHELL_TARGETS.length === 0) {
    console.log('  ⏳ 无目标：壳探针需要「已有 core 可装载 + 输出经 canvas」的零件（dandelion 属 T-R05，core 未落地）。');
    console.log('     这不是「Mode B 全绿」，而是「尚无壳目标可探」（存量）。');
    console.log('');
    return { probed: 0, deadTotal: 0 };
  }
  let probed = 0;
  let deadTotal = 0;
  for (const target of SHELL_TARGETS) {
    const result = probeShellTarget(target);
    probed += 1;
    deadTotal += result.dead.length;
    for (const row of result.rows) console.log(`  ${target.part.padEnd(17)} ${row.key.padEnd(19)} ${(row.alive ? '✓ 敏感' : '✗ 死')}  ${row.detail}`);
    check(result.dead.length === 0, `Mode B ${target.part} 死参数 [${result.dead.join(', ')}]：改 ±10% 后指令指纹不变`);
  }
  console.log('');
  return { probed, deadTotal };
}

/** 主流程。 */
async function main() {
  console.log('[mutation-probe] 死参数探针（Mode A 纯核 / Mode B 指令指纹，ARCHITECTURE-REUSE §4.3）');
  console.log(`  阈值：变异 ±${MUTATION_FACTOR * 100}% / 变化 > ${CHANGE_EPS} / 每符号 ≥ ${MIN_CASES_PER_SYMBOL} 条用例`);
  console.log('');

  await selfCheckModeA();
  const modeA = await probeRealParts();
  const modeB = selfCheckModeB();
  const modeBReal = probeRealShells();
  check(modeB, 'Mode B 自检未通过（确定性或敏感性）');

  const deadTotal = modeA.deadTotal + modeBReal.deadTotal;
  console.log(`[mutation-probe] 死参数 = ${deadTotal}（门要求 = 0）`);
  console.log(`  真实零件：Mode A 探测 ${modeA.probed} 个符号 / Mode B 探测 ${modeBReal.probed} 个目标`);
  if (modeA.unprovable > 0) {
    console.log(`  ⚠ 另有 ${modeA.unprovable} 个符号「无法证明接线」（缺 core / 缺 golden / 符号不在声称落点）——按纪律与死参数同价，不算通过`);
  }
  if (expectedRed.length > 0) {
    for (const line of expectedRed) console.log(`  ${line}`);
  }
  if (warnings.length > 0) {
    for (const line of warnings) console.log(`  ${line}`);
  }

  if (process.argv.includes('--report')) {
    console.log(`[mutation-probe] （--report）${JSON.stringify({ deadTotal, modeA, expectedRed, warnings })}`);
  }

  if (failures.length > 0) {
    console.log('');
    console.log(`[mutation-probe] ❌ FAIL：${failures.length} 项失败（断言 ${checks} 项）`);
    for (const failure of failures) console.log(`  - ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log('');
  console.log(`[mutation-probe] ✅ PASS：${checks} 项断言（自检抓到植入的死参数且未误杀活参数；真实零件死参数 = ${deadTotal}）`);
}

await main();
