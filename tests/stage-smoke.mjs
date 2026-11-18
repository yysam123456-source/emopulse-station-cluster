// 装配运行时冒烟门（shared/stage 的验收）。
//
// 这个门不是「能不能 import」的形式检查 —— 每一条都打在一条**会真实故障**的语义上：
//   1. 层序与层内 z  → 画反了就是「后处理被前景盖住」，肉眼一看就知道，但代码上看不出来
//   2. blend 真落到 ctx.globalCompositeOperation → 否则「复合效果」全是空话
//   3. L4 唯一       → 两条后处理链会互相抹掉像素
//   4. 超预算只降档不跳过 draw → 跳过 = 画面缺块，比掉帧更难看
//   5. expendable 才可挂起 → 挂错就是把世界或 UI 干掉了
//   6. 同 seed 确定性 → 不能复现就没法做视觉回归
//   7. 零件抛错隔离   → 一个零件炸掉不该拖垮整场
//   8. dispose 逆序   → 依赖方先于被依赖方释放
//   9. 缺能力不构造   → 声明 requires 却照构造，等于假绿
//
// 用法：node tests/stage-smoke.mjs
import path from 'node:path';
import { loadTsModule, REPO_ROOT } from './lib/load-ts.mjs';

const failures = [];
let checks = 0;

/**
 * 记一次断言。
 *
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
 * 造一个假画布 + 会记账的 2D 上下文。
 *
 * @param {number} width CSS 宽
 * @param {number} height CSS 高
 * @returns {{canvas: object, log: Array<object>}}
 */
function makeCanvas(width = 800, height = 600) {
  /** 绘制期记账：每一笔都带当时的 globalCompositeOperation */
  const log = [];
  const ctx = {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    save() { log.push({ op: 'save', blend: this.globalCompositeOperation }); },
    restore() { log.push({ op: 'restore', blend: this.globalCompositeOperation }); },
    setTransform() {},
    fillRect() {},
    getImageData() { return { data: new Uint8ClampedArray(4), width: 1, height: 1 }; },
    putImageData() {},
  };
  const canvas = {
    width,
    height,
    clientWidth: width,
    clientHeight: height,
    style: {},
    getContext(id) { return id === '2d' ? ctx : null; },
  };
  ctx.canvas = canvas;
  return { canvas, log };
}

/**
 * 造一个可观测的零件：draw 时把 (id, blend, t) 记进共享的 trace。
 *
 * @param {object} spec 零件字段
 * @param {Array<object>} trace 共享轨迹
 * @returns {object} PartV2
 */
function makePart(spec, trace) {
  const {
    id,
    layer,
    blend,
    costMs = 1,
    z,
    expendable,
    requires,
    lodLog,
    disposeLog,
    throwOnDraw = false,
    throwOnCreate = false,
    throwOnDispose = false,
  } = spec;
  const part = {
    id,
    layer,
    costMs,
    kb: 1,
    create(env) {
      if (throwOnCreate) throw new Error(`boom-create:${id}`);
      let lod = 'high';
      return {
        update(frame) {
          trace.push({ kind: 'update', id, t: frame.t, dt: frame.dt });
        },
        draw(frame) {
          // 先记账再抛错：否则「有没有被再次调用」这件事根本观测不到
          // （变异探针 M6 抓到的真实漏断言：trace 写在 throw 之后 → 断言恒真）
          trace.push({ kind: 'draw', id, t: frame.t, blend: env.ctx ? env.ctx.globalCompositeOperation : null });
          if (throwOnDraw) throw new Error(`boom-draw:${id}`);
        },
        setLod(next) {
          lod = next;
          if (lodLog) lodLog.push({ id, lod: next });
        },
        get lod() { return lod; },
        dispose() {
          if (throwOnDispose) throw new Error(`boom-dispose:${id}`);
          if (disposeLog) disposeLog.push(id);
        },
      };
    },
  };
  if (blend !== undefined) part.blend = blend;
  if (z !== undefined) part.z = z;
  if (expendable !== undefined) part.expendable = expendable;
  if (requires !== undefined) part.requires = requires;
  return part;
}

/**
 * 装配一个固定时钟的舞台。
 *
 * @param {object} stageMod 模块命名空间
 * @param {object[]} parts 零件
 * @param {object} [extra] 额外选项
 * @returns {{stage: object, log: object[], canvas: object}}
 */
function build(stageMod, parts, extra = {}) {
  const { canvas, log } = makeCanvas();
  let clock = 0;
  const stage = stageMod.createStage({
    canvas,
    parts,
    biome: 'field',
    seed: 20261118,
    now: () => clock,
    ...extra,
  });
  return { stage, log, canvas, advance(ms) { clock += ms; stage.frame(clock); } };
}

const stageMod = await loadTsModule(path.join(REPO_ROOT, 'shared', 'stage', 'index.ts'));

// ---------------------------------------------------------------- 1. 层序与 z
{
  const trace = [];
  // 刻意让 id 字典序与 z 序**相反**：
  // 若同层两件按 id 排恰好也等于按 z 排，这条断言就抓不住「z 排序被删掉」的回归。
  // zeta(z=-5) 必须排在 alpha(z=10) 前面，而字典序里 alpha 在 zeta 前面。
  const parts = [
    makePart({ id: 'ui', layer: 'L5' }, trace),
    makePart({ id: 'post', layer: 'L4' }, trace),
    makePart({ id: 'alpha', layer: 'L2', z: 10 }, trace),
    makePart({ id: 'base', layer: 'L0' }, trace),
    makePart({ id: 'zeta', layer: 'L2', z: -5 }, trace),
    makePart({ id: 'world', layer: 'L1' }, trace),
    makePart({ id: 'input', layer: 'L3' }, trace),
  ];
  const { stage } = build(stageMod, parts);
  const expected = ['base', 'world', 'zeta', 'alpha', 'input', 'post', 'ui'];
  check(
    JSON.stringify(stage.order) === JSON.stringify(expected),
    `层序错误：期望 ${expected.join(' → ')}，实得 ${stage.order.join(' → ')}`,
  );
}

// ---------------------------------------------------------- 2. blend 真落 ctx
{
  const trace = [];
  const { stage, advance, log } = build(stageMod, [
    makePart({ id: 'paper', layer: 'L0', blend: 'source-over' }, trace),
    makePart({ id: 'glow', layer: 'L2', blend: 'lighter' }, trace),
    makePart({ id: 'grain', layer: 'L4', blend: 'overlay' }, trace),
  ]);
  advance(16);
  const drawn = trace.filter((e) => e.kind === 'draw');
  const byId = Object.fromEntries(drawn.map((e) => [e.id, e.blend]));
  check(byId.paper === 'source-over', `paper 绘制时 blend 应为 source-over，实得 ${byId.paper}`);
  check(byId.glow === 'lighter', `glow 绘制时 blend 应为 lighter，实得 ${byId.glow}`);
  check(byId.grain === 'overlay', `grain 绘制时 blend 应为 overlay，实得 ${byId.grain}`);
  // save/restore 必须成对，否则混合模式会「漏」到下一个零件
  const saves = log.filter((e) => e.op === 'save').length;
  const restores = log.filter((e) => e.op === 'restore').length;
  check(saves === restores && saves === 3, `save/restore 应各 3 次，实得 ${saves}/${restores}`);
}

// ------------------------------------------------------------- 3. L4 唯一
{
  const trace = [];
  let code = null;
  try {
    build(stageMod, [
      makePart({ id: 'p1', layer: 'L4' }, trace),
      makePart({ id: 'p2', layer: 'L4' }, trace),
    ]);
  } catch (error) {
    code = error.code;
  }
  check(code === 'E_MULTI_POST', `两个 L4 应抛 E_MULTI_POST，实得 ${code}`);

  // 顺带验：重复 id 与非法混合模式也必须挡
  let dup = null;
  try {
    build(stageMod, [makePart({ id: 'same', layer: 'L0' }, trace), makePart({ id: 'same', layer: 'L2' }, trace)]);
  } catch (error) { dup = error.code; }
  check(dup === 'E_DUP_PART_ID', `重复 id 应抛 E_DUP_PART_ID，实得 ${dup}`);

  let badBlend = null;
  try {
    build(stageMod, [{ ...makePart({ id: 'x', layer: 'L0' }, trace), blend: 'copy' }]);
  } catch (error) { badBlend = error.code; }
  check(badBlend === 'E_BAD_BLEND', `copy 不在白名单，应抛 E_BAD_BLEND，实得 ${badBlend}`);
}

// -------------------------------------------- 4. 超预算：降档但**不跳过 draw**
{
  const trace = [];
  const lodLog = [];
  const parts = [
    makePart({ id: 'a', layer: 'L0', costMs: 4 }, trace),
    makePart({ id: 'b', layer: 'L2', costMs: 4, lodLog }, trace),
    makePart({ id: 'c', layer: 'L4', costMs: 4, lodLog }, trace),
  ];
  const { stage, advance } = build(stageMod, parts, { budgetMs: 6 });
  const budgetEntries = stage.degraded.filter((d) => d.reason === 'budget');
  check(budgetEntries.length >= 2, `超预算应记录 budget 降档，实得 ${budgetEntries.length} 条`);
  check(
    lodLog.filter((e) => e.lod === 'low').length === 2,
    `有 setLod 的两件都应降到 low，实得 ${JSON.stringify(lodLog)}`,
  );
  advance(16);
  const drawn = trace.filter((e) => e.kind === 'draw').map((e) => e.id);
  check(
    drawn.length === 3,
    `超预算也要全部 draw（缺块比掉帧更难看），实得 ${drawn.join(',') || '无'}`,
  );
  check(stage.stats.budgetCostMs === 12, `budgetCostMs 应为 12，实得 ${stage.stats.budgetCostMs}`);

  // 预算放宽 → 必须能升回 high，否则降档是单向棘轮
  stage.setBudget(64);
  const afterRelax = lodLog.filter((e) => e.lod === 'high').length;
  check(afterRelax >= 2, `预算放宽后应升回 high，实得 ${afterRelax} 次`);
  check(stage.degraded.filter((d) => d.reason === 'budget').length === 0, '放宽后 degraded 里不应再有 budget 记录');
}

// --------------------------------------------------- 5. 只有 expendable 可挂起
{
  const trace = [];
  const parts = [
    // L1 世界：绝不可挂起
    { ...makePart({ id: 'world', layer: 'L1', costMs: 20 }, trace), expendable: false },
    // 装饰性后处理：可挂起
    makePart({ id: 'post', layer: 'L4', costMs: 20, expendable: true }, trace),
    makePart({ id: 'ui', layer: 'L5', costMs: 2 }, trace),
  ];
  const { stage } = build(stageMod, parts, { budgetMs: 8 });
  const suspended = stage.degraded.filter((d) => d.reason === 'suspended').map((d) => d.id);
  check(
    JSON.stringify(suspended) === JSON.stringify(['post']),
    `只应挂起 expendable 的 post，实得 ${JSON.stringify(suspended)}`,
  );
}

// --------------------------------------------------------- 6. 同 seed 确定性
{
  const runOnce = () => {
    const trace = [];
    const parts = [
      makePart({ id: 'base', layer: 'L0' }, trace),
      makePart({ id: 'eco', layer: 'L2' }, trace),
    ];
    const env = build(stageMod, parts);
    for (let i = 0; i < 5; i += 1) env.advance(16);
    return trace.map((e) => `${e.kind}:${e.id}:${e.t.toFixed(6)}`).join('|');
  };
  const first = runOnce();
  const second = runOnce();
  check(first === second, '同 seed 同 dt 序列应逐帧一致（不同则视觉回归无从谈起）');
  check(stageMod.hashSeed(1, 'a', 'bc') !== stageMod.hashSeed(1, 'ab', 'c'), 'hashSeed 必须区分分段边界');
}

// ------------------------------------------------------------- 7. 抛错隔离
{
  const trace = [];
  const { stage, advance } = build(stageMod, [
    makePart({ id: 'ok1', layer: 'L0' }, trace),
    makePart({ id: 'bad', layer: 'L2', throwOnDraw: true }, trace),
    makePart({ id: 'ok2', layer: 'L3' }, trace),
  ]);
  advance(16);
  advance(16);
  const drawn = trace.filter((e) => e.kind === 'draw').map((e) => e.id);
  check(drawn.filter((id) => id === 'ok1').length === 2, 'ok1 应每帧都画');
  check(drawn.filter((id) => id === 'ok2').length === 2, 'bad 抛错后 ok2 仍应每帧都画');
  check(stage.degraded.some((d) => d.id === 'bad' && /抛错已隔离/.test(d.detail)), 'bad 必须进 degraded 且写明抛错');
  // 只应尝试过一次：第一帧抛错后被隔离，第二帧不该再调它
  check(drawn.filter((id) => id === 'bad').length === 1, `抛错的零件只该被尝试 1 次，实得 ${drawn.filter((id) => id === 'bad').length} 次`);
}

// ------------------------------------------------------------ 8. dispose 逆序
{
  const trace = [];
  const disposeLog = [];
  const { stage } = build(stageMod, [
    makePart({ id: 'first', layer: 'L0', disposeLog }, trace),
    makePart({ id: 'second', layer: 'L2', disposeLog }, trace),
    makePart({ id: 'third', layer: 'L5', disposeLog }, trace),
  ]);
  stage.dispose();
  check(
    JSON.stringify(disposeLog) === JSON.stringify(['third', 'second', 'first']),
    `dispose 应逆序，实得 ${JSON.stringify(disposeLog)}`,
  );
  let threw = false;
  try { stage.dispose(); } catch { threw = true; }
  check(!threw, 'dispose 应幂等');
}

// --------------------------------------------------------- 9. 缺能力不构造
{
  const trace = [];
  let created = false;
  const needsGpu = {
    ...makePart({ id: 'gpu-only', layer: 'L2', requires: ['webgpu'] }, trace),
    create(env) { created = true; return makePart({ id: 'gpu-only', layer: 'L2' }, trace).create(env); },
  };
  const { stage, advance } = build(stageMod, [
    makePart({ id: 'base', layer: 'L0' }, trace),
    needsGpu,
  ]);
  advance(16);
  check(!created, 'requires 未满足的零件不该被 create');
  check(
    stage.degraded.some((d) => d.id === 'gpu-only' && d.reason === 'unsupported'),
    '缺能力必须记 unsupported',
  );
  check(trace.filter((e) => e.kind === 'draw').length === 1, '其余零件照常绘制');
}

// -------------------------------------------------- 10. create 抛错必须带 id
{
  const trace = [];
  let caught = null;
  try {
    build(stageMod, [makePart({ id: 'explosive', layer: 'L0', throwOnCreate: true }, trace)]);
  } catch (error) { caught = error; }
  check(caught && caught.code === 'E_PART_THROW', `create 抛错应包成 E_PART_THROW，实得 ${caught && caught.code}`);
  check(caught ? caught.partId === 'explosive' : false, '错误必须带零件 id（没有 id 的报错等于没报）');
}

// ------------------------------------------------------------ 结果
if (failures.length === 0) {
  console.log(`stage-smoke: PASS ${checks}/${checks}`);
  process.exit(0);
}
console.error(`stage-smoke: FAIL ${failures.length}/${checks}`);
for (const failure of failures) console.error(`  - ${failure}`);
process.exit(1);
