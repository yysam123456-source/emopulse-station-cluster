// 组合验证：field-ground 走**真实装配器** createStage 能不能跑、能不能落到正确的层与绘制顺序。
// 与 bench.mjs 的分工：bench 只问「这一件多贵」，这里问「它和运行时接得上吗」。
//
// 用法：node tests/parts-composition.mjs
import path from 'node:path';
import { loadTsModule, REPO_ROOT } from './lib/load-ts.mjs';
import { guardCtx } from './lib/fake-ctx.mjs';

const failures = [];
let checks = 0;

/**
 * 记一次断言。
 *
 * @param {boolean} ok 条件
 * @param {string} msg 失败描述
 */
function check(ok, msg) {
  checks += 1;
  if (!ok) failures.push(msg);
}

/**
 * 制造账用的假 2D 上下文。
 *
 * @param {string} tag 来源标签（便于分辨主画布与离屏）
 * @param {object[]} log 共享轨迹
 * @returns {object} 假 ctx
 */
function makeCtx(tag, log) {
  const gradient = { addColorStop() {} };
  const raw = {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    lineCap: 'butt',
    save() { log.push({ tag, op: 'save' }); },
    restore() { log.push({ tag, op: 'restore' }); },
    setTransform() {},
    createLinearGradient() { log.push({ tag, op: 'linear' }); return gradient; },
    createRadialGradient() { log.push({ tag, op: 'radial' }); return gradient; },
    fillRect() { log.push({ tag, op: 'fillRect' }); },
    strokeRect() { log.push({ tag, op: 'strokeRect' }); },
    drawImage() { log.push({ tag, op: 'drawImage' }); },
    beginPath() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    closePath() {},
    fill() { log.push({ tag, op: 'fill' }); },
    stroke() { log.push({ tag, op: 'stroke', blend: this.globalCompositeOperation }); },
    arc() {},
    clip() { log.push({ tag, op: 'clip' }); },
    createPattern() { return null; },
    rect() {},
    createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; },
    clearRect() {},
  };
  // 包一层守卫：零件若调用了这里没实现的方法，会**记下来并喊出方法名**，
  // 而不是变成一句 `ctx.xxx is not a function` 然后零件被隔离、测试继续绿。
  return guardCtx(raw);
}

const log = [];

/** 所有假 ctx 的守卫（收尾统一断言"没有未实现的方法"） */
const guards = [];

/**
 * 造一个假 canvas（可带 ownerDocument 以启用离屏烘焙）。
 *
 * @param {number} w CSS 宽
 * @param {number} h CSS 高
 * @param {string} tag 来源标签
 * @param {boolean} withDoc 是否提供 ownerDocument
 * @returns {object} 假 canvas
 */
function makeCanvas(w, h, tag, withDoc) {
  const guarded = makeCtx(tag, log);
  const ctx = guarded.ctx;
  guards.push(guarded);
  const el = {
    width: w,
    height: h,
    clientWidth: w,
    clientHeight: h,
    style: {},
    getContext(id) { return id === '2d' ? ctx : null; },
  };
  if (withDoc) {
    el.ownerDocument = {
      createElement() {
        // 离屏 canvas 的 ctx 也要包守卫（paper-ink / field-ground 的烘焙都发生在离屏）
        const offGuard = makeCtx(`${tag}-offscreen`, log);
        guards.push(offGuard);
        const off = { width: 0, height: 0, getContext(id) { return id === '2d' ? offGuard.ctx : null; } };
        return off;
      },
    };
  }
  return el;
}

const stageMod = await loadTsModule(path.join(REPO_ROOT, 'shared', 'stage', 'index.ts'));
const fieldMod = await loadTsModule(path.join(REPO_ROOT, 'shared', 'parts', 'field-ground', 'index.ts'));
const field = fieldMod.part ?? fieldMod.default;

// ── 1. 单件装配：能构造、能画、层正确 ──
{
  log.length = 0;
  const canvas = makeCanvas(800, 600, 'main', true);
  let clock = 0;
  const stage = stageMod.createStage({
    canvas,
    parts: [field],
    biome: 'field',
    seed: 20261118,
    budgetMs: 12,
    now: () => clock,
  });

  check(stage.order.join(',') === 'field-ground', `单件装配顺序应为 field-ground，实得 ${stage.order.join(',')}`);
  check(stage.degraded.length === 0, `不应有降档记录，实得 ${JSON.stringify(stage.degraded)}`);

  clock += 16;
  stage.frame(clock);

  // ★ 这一条是本文件最重要的一条断言，2026-11-18 补：
  //   之前假 ctx 缺 `ctx.clip`，field-ground 每帧在 draw 开头就抛 TypeError，
  //   装配器把它隔离（记 broken + degraded），**画到一半就停**——
  //   于是「每帧 3 次 stroke」这类计数断言反而"恰好"成立，15/15 全绿而零件是坏的。
  //   任何「零件在测试环境里静默失效」都必须在这里变红。
  check(
    stage.degraded.length === 0,
    `首帧后不应有降级/隔离记录（零件在测试环境里抛错了）：${JSON.stringify(stage.degraded)}`,
  );

  const mainOps = log.filter((e) => e.tag === 'main');
  const offscreenOps = log.filter((e) => e.tag === 'main-offscreen');
  check(offscreenOps.some((e) => e.op === 'radial'), '应有一个离屏底图（含径向暗角），说明烘焙路径生效');
  // ★ 这条同时是「**没有 gl 零件时不得发生 GL 合成**」的护栏（T18 之后）：
  //   field-ground 自己每帧只有 1 次 drawImage（整屏底图 blit）。若 compositeGl 被无条件调用，
  //   这里会变成 2 —— 而那种 bug 在画面上表现为"整幅画面被自己叠了一遍"（亮度翻倍），很难查。
  check(
    mainOps.filter((e) => e.op === 'drawImage').length === 1,
    `主画布每帧应只 1 次 drawImage（本件自身的底图 blit；无 gl 零件时不该有合成），实得 ${mainOps.filter((e) => e.op === 'drawImage').length}`,
  );
  check(mainOps.filter((e) => e.op === 'fill').length === 4, `主画布每帧应 4 次 fill（三层山 + 一档草穗），实得 ${mainOps.filter((e) => e.op === 'fill').length}`);
  check(mainOps.filter((e) => e.op === 'stroke').length === 6, `主画布每帧应 6 次 stroke（3 道山脊亮边 + 3 档草），实得 ${mainOps.filter((e) => e.op === 'stroke').length}`);
  check(mainOps.some((e) => e.op === 'clip'), '草应被前景山脊裁切（clip 一次）');
  check(mainOps.filter((e) => e.op === 'linear' || e.op === 'radial').length === 0, '主画布每帧不应现建渐变（必须烘在离屏）');
  check(mainOps.every((e) => e.op !== 'stroke' || e.blend === 'source-over'), '草叶描边应在本件的 source-over 下执行');

  // 帧推进不重烘焙：第二帧不应再出现离屏绘制
  log.length = 0;
  clock += 16;
  stage.frame(clock);
  check(log.filter((e) => e.tag === 'main-offscreen').length === 0, '第二帧不应再烘焙离屏（只有 resize 才重建）');

  stage.dispose();
  stage.dispose();
  check(stage.degraded.length === 0, 'dispose 后 degraded 应清空');
}

// ── 2. 与另一件叠加：blend 是否逐件切换、顺序是否按层 ──
{
  log.length = 0;
  const canvas = makeCanvas(640, 480, 'main', true);
  const fakeTop = {
    id: 'fake-ui',
    layer: 'L5',
    blend: 'overlay',
    costMs: 0.2,
    kb: 1,
    create() {
      return { draw() { /* 只观察 blend 是否被设好 */ } };
    },
  };
  let clock = 0;
  const stage = stageMod.createStage({
    canvas,
    parts: [fakeTop, field],
    biome: 'field',
    seed: 7,
    budgetMs: 12,
    now: () => clock,
  });
  check(stage.order.join(',') === 'field-ground,fake-ui', `层序应为 L0→L5，实得 ${stage.order.join(',')}`);
  clock += 16;
  stage.frame(clock);
  stage.dispose();
}

// ── 3. 无离屏能力时必须降级而不是抛错 ──
{
  log.length = 0;
  const canvas = makeCanvas(640, 480, 'main', false);
  let clock = 0;
  const stage = stageMod.createStage({
    canvas,
    parts: [field],
    biome: 'field',
    seed: 7,
    budgetMs: 12,
    now: () => clock,
  });
  clock += 16;
  let threw = false;
  try { stage.frame(clock); } catch { threw = true; }
  check(!threw, '没有 ownerDocument 时应降级绘制，不得抛错');
  const mainOps = log.filter((e) => e.tag === 'main');
  check(mainOps.some((e) => e.op === 'linear'), '降级路径应现建天光渐变');
  // fillRect 与 fill 在假 ctx 里是两个不同的记账项（真实 canvas 也是两个 API）
  check(mainOps.filter((e) => e.op === 'fillRect').length === 1, `降级路径应 1 次 fillRect 铺天光，实得 ${mainOps.filter((e) => e.op === 'fillRect').length}`);
  check(mainOps.filter((e) => e.op === 'fill').length === 4, `降级路径应 4 次 fill（三层山 + 草穗），实得 ${mainOps.filter((e) => e.op === 'fill').length}`);
  stage.dispose();
}

// ── 假 ctx 必须覆盖零件调用过的所有方法 ──
for (const guard of guards) {
  checks += 1;
  if (guard.missing.size > 0) {
    failures.push(`假 ctx 缺少方法：${[...guard.missing].join(', ')}（被零件调用过；真 ctx 有、假 ctx 没有 = 测试跑在了不同的环境里）`);
  }
}

if (failures.length === 0) {
  console.log(`field-in-stage: PASS ${checks}/${checks}`);
  process.exit(0);
}
console.error(`field-in-stage: FAIL ${failures.length}/${checks}`);
for (const f of failures) console.error(`  - ${f}`);
process.exit(1);
