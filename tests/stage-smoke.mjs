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
    drawImage(source, dx, dy, dw, dh) {
      log.push({ op: 'drawImage', dx, dy, dw, dh, blend: this.globalCompositeOperation });
    },
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

  // ── E_NO_BASE：非空装配必须有 L0/L1（帧循环从不 clearRect，缺底件会残留上一帧像素）──
  let noBase = null;
  try {
    build(stageMod, [makePart({ id: 'only-l2', layer: 'L2' }, trace)]);
  } catch (error) { noBase = error.code; }
  check(noBase === 'E_NO_BASE', `只有 L2 时应抛 E_NO_BASE，实得 ${noBase}`);

  // 空装配必须**放行**（empty preset 走同一条路）
  let emptyOk = true;
  let emptyCode = null;
  try {
    build(stageMod, []);
  } catch (error) { emptyOk = false; emptyCode = error.code; }
  check(emptyOk, `空装配应放行，实得 ${emptyCode}`);

  // 有 L1（gl）也算有底件 —— 但不能因缺 glCanvas 而误报 E_NO_BASE
  const glOnly = (() => {
    const p = makePart({ id: 'gl-base', layer: 'L1' }, trace);
    p.channel = 'gl';
    return p;
  })();
  let glCode = null;
  try {
    build(stageMod, [glOnly]);
  } catch (error) { glCode = error.code; }
  check(glCode !== 'E_NO_BASE', `只有 L1(gl) 时不该报 E_NO_BASE（实得 ${glCode}）`);
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

// ------------------------------------------- 11. 严格画布：不许把主画布锁成 webgl2
// 这一节的存在理由（2026-11-18 P0 白屏，实测确认）：
//   HTML 规范规定一个 canvas 只有**一种**上下文模式。`getContext('webgl2')` 成功之后，
//   `getContext('2d')` 恒返回 null。而原来的 detectCapabilities 是在**主画布**上探测 webgl2 的，
//   于是真浏览器里每个页面都在构造期抛「主画布拿不到 2d 上下文」→ 白屏。
//   上面所有用 makeCanvas 的用例都测不出它，因为 makeCanvas 写的是
//   `getContext(id){ return id === '2d' ? ctx : null }` —— 把真实语义写反了：
//   它对 webgl2 永远返回 null，所以画布永远不会被锁成 gl 模式。
//   makeStrictCanvas 按规范实现：首次成功的模式锁定，此后请求其它模式返回 null。
{
  /**
   * 造一个**符合规范**的假画布：一种上下文模式，先到先得。
   *
   * @param {number} width CSS 宽
   * @param {number} height CSS 高
   * @returns {{canvas: object, mode: () => (string|null)}}
   */
  function makeStrictCanvas(width = 800, height = 600) {
    let mode = null;
    const ctx = {
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      save() {},
      restore() {},
      setTransform() {},
      fillRect() {},
      clearRect() {},
      drawImage() {},
      beginPath() {},
      moveTo() {},
      lineTo() {},
      closePath() {},
      fill() {},
      stroke() {},
      arc() {},
      createLinearGradient() { return { addColorStop() {} }; },
      createRadialGradient() { return { addColorStop() {} }; },
      createPattern() { return {}; },
      createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; },
      getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; },
      putImageData() {},
    };
    const canvas = {
      width,
      height,
      clientWidth: width,
      clientHeight: height,
      style: {},
      getContext(id) {
        // 真实的 webgl2 上下文对象我们只需要「非 null」这一件事
        const handle = id === '2d' ? ctx : {};
        if (mode === null) { mode = id; return handle; }
        return mode === id ? handle : null;
      },
    };
    return { canvas, mode: () => mode };
  }

  const strict = makeStrictCanvas();
  let error = null;
  let stage = null;
  try {
    stage = stageMod.createStage({
      canvas: strict.canvas,
      parts: [makePart({ id: 'probe', layer: 'L0' }, [])],
      biome: 'field',
      seed: 1,
      now: () => 0,
    });
  } catch (caught) { error = caught; }

  check(error === null, `严格画布上 createStage 不得抛错（白屏根因），实得 ${error && error.message}`);
  check(
    strict.mode() === '2d',
    `主画布应被锁成 '2d' 模式，实得 '${strict.mode()}' —— 若为 webgl2，说明能力探测又跑回主画布了`,
  );
  if (stage) {
    let threw = false;
    try { stage.frame(16); } catch { threw = true; }
    check(!threw, '严格画布上推进一帧不得抛错');
    stage.dispose();
  }
}

// ------------------------------------------ 12. L1 就地合成（T18）
// 这三条是「L1 有没有画对位置」的唯一护栏：
//   ① 层序：L0 画完 → L1 画完 → **立刻**合成 → L2 画（不是"跑完 2D 再跑 GL"）
//   ② 目标矩形必须是 CSS 尺寸：ctx 已被 setTransform(dpr) 缩放过，传设备像素会放大 dpr 倍
//   ③ gl 零件抛错后不得再合成（否则上一帧的 GL 内容会一直糊在画面上 —— 残影）
{
  /**
   * 造一个假 GL 画布。
   *
   * @returns {object} 假 canvas
   */
  function makeGlCanvas() {
    return {
      width: 2560,
      height: 1440,
      clientWidth: 1280,
      clientHeight: 720,
      style: {},
      getContext() { return null; },
    };
  }

  const trace = [];
  const glPart = makePart({ id: 'gl-world', layer: 'L1', blend: 'screen' }, trace);
  glPart.channel = 'gl';

  const { canvas, log } = makeCanvas();
  canvas.clientWidth = 1280;
  canvas.clientHeight = 720;
  const glCanvas = makeGlCanvas();
  // ★ 必须把 dpr 抬到 2 再建舞台：CSS 尺寸与设备像素只有在 dpr>1 时才不同。
  //   第一版没抬，于是「目标矩形传设备像素」这个变异**测不出来**（Node 里 dpr=1，两者相等）——
  //   断言看起来合理，实际没有辨别力。
  const originalDpr = globalThis.devicePixelRatio;
  globalThis.devicePixelRatio = 2;
  let clock = 0;
  const stage = stageMod.createStage({
    canvas,
    glCanvas,
    parts: [
      makePart({ id: 'a-base', layer: 'L0' }, trace),
      glPart,
      makePart({ id: 'b-eco', layer: 'L2' }, trace),
    ],
    biome: 'tide',
    seed: 7,
    now: () => clock,
  });

  clock += 16;
  stage.frame(clock);

  // ① 层序：a.draw → gl.draw → composite → b.draw
  const sequence = trace.filter((entry) => entry.kind === 'draw').map((entry) => `draw:${entry.id}`);
  const compositeAt = log.findIndex((entry) => entry.op === 'drawImage');
  check(compositeAt >= 0, 'GL 层没有被合成进主画布（一次 drawImage 都没有）');
  check(sequence.join(' > ') === 'draw:a-base > draw:gl-world > draw:b-eco', `单循环层序应为 L0 → L1 → L2，实得 ${sequence.join(' > ')}`);
  check(compositeAt >= 0 && compositeAt < log.length, '主画布应有 drawImage 记录');

  // ② 目标矩形 = CSS 尺寸（这一条只有眼睛能看出问题，所以必须由断言锁）
  check(canvas.width === 2560, `前提不成立：canvas.width 应为 1280×dpr2=2560，实得 ${canvas.width}（否则这条断言没有辨别力）`);
  const composite = log[compositeAt];
  check(
    composite && composite.dx === 0 && composite.dy === 0 && composite.dw === 1280 && composite.dh === 720,
    `合成目标矩形应为 CSS (0,0,1280,720)，实得 (${composite?.dx},${composite?.dy},${composite?.dw},${composite?.dh}) —— 传设备像素会放大 dpr 倍`,
  );
  // 合成 blend 取自 gl 零件自己的 blend（未显式传 glBlend 时）
  check(composite && composite.blend === 'screen', `合成 blend 应取自 gl 零件的 blend=screen，实得 ${composite?.blend}`);

  // ③ gl 抛错后不得再合成
  const throwTrace = [];
  const throwing = makePart({ id: 'gl-boom', layer: 'L1', throwOnDraw: true }, throwTrace);
  throwing.channel = 'gl';
  const second = makeCanvas();
  const secondLog = second.log;
  let secondClock = 0;
  const boomStage = stageMod.createStage({
    canvas: second.canvas,
    glCanvas: makeGlCanvas(),
    parts: [makePart({ id: 'base2', layer: 'L0' }, throwTrace), throwing],
    biome: 'tide',
    seed: 7,
    now: () => secondClock,
  });
  secondClock += 16;
  boomStage.frame(secondClock);
  const compositesAfterFirst = secondLog.filter((entry) => entry.op === 'drawImage').length;
  secondClock += 16;
  boomStage.frame(secondClock);
  const compositesAfterSecond = secondLog.filter((entry) => entry.op === 'drawImage').length;
  // draw 抛错的 gl 零件一次都不该合成；而且第二帧也不该再尝试（被隔离）
  check(compositesAfterFirst === 0, `gl 的 draw 抛错后仍合成了 ${compositesAfterFirst} 次（应 0）`);
  check(compositesAfterSecond === 0, `gl 抛错后第二帧仍在合成（残影）：${compositesAfterSecond} 次`);
  const boomDraws = throwTrace.filter((entry) => entry.kind === 'draw' && entry.id === 'gl-boom').length;
  check(boomDraws === 1, `抛错的 gl 零件只该被尝试 1 次，实得 ${boomDraws}`);
  boomStage.dispose();
  stage.dispose();
  globalThis.devicePixelRatio = originalDpr;
}

// ---------------------------------------- 13. glBlend 必须走 BLEND_MODES 白名单
{
  const { canvas } = makeCanvas();
  let caught = null;
  try {
    stageMod.createStage({
      canvas,
      glCanvas: { width: 1, height: 1, style: {}, getContext: () => null },
      parts: [(() => { const p = makePart({ id: 'g', layer: 'L1' }, []); p.channel = 'gl'; return p; })()],
      biome: 'tide',
      seed: 1,
      glBlend: 'copy',
      now: () => 0,
    });
  } catch (error) { caught = error; }
  check(caught && caught.code === 'E_BAD_BLEND', `glBlend='copy' 应抛 E_BAD_BLEND，实得 ${caught && caught.code}`);
}

// ------------------------------------------------------------ 结果
if (failures.length === 0) {
  console.log(`stage-smoke: PASS ${checks}/${checks}`);
  process.exit(0);
}
console.error(`stage-smoke: FAIL ${failures.length}/${checks}`);
for (const failure of failures) console.error(`  - ${failure}`);
process.exit(1);
