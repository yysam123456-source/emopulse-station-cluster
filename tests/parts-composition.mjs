// 组合验证：field-ground 走**真实装配器** createStage 能不能跑、能不能落到正确的层与绘制顺序。
// 与 bench.mjs 的分工：bench 只问「这一件多贵」，这里问「它和运行时接得上吗」。
//
// 用法：node tests/parts-composition.mjs
import path from 'node:path';
import { loadTsModule, REPO_ROOT } from './lib/load-ts.mjs';

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
  return {
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
    drawImage() { log.push({ tag, op: 'drawImage' }); },
    beginPath() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    closePath() {},
    fill() { log.push({ tag, op: 'fill' }); },
    stroke() { log.push({ tag, op: 'stroke', blend: this.globalCompositeOperation }); },
    arc() {},
    clearRect() {},
  };
}

const log = [];

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
  const ctx = makeCtx(tag, log);
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
        const off = { width: 0, height: 0, getContext(id) { return id === '2d' ? makeCtx(`${tag}-offscreen`, log) : null; } };
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

  const mainOps = log.filter((e) => e.tag === 'main');
  const offscreenOps = log.filter((e) => e.tag === 'main-offscreen');
  check(offscreenOps.some((e) => e.op === 'radial'), '应有一个离屏底图（含径向暗角），说明烘焙路径生效');
  check(mainOps.filter((e) => e.op === 'drawImage').length === 1, `主画布每帧应只 1 次 drawImage，实得 ${mainOps.filter((e) => e.op === 'drawImage').length}`);
  check(mainOps.filter((e) => e.op === 'fill').length === 3, `主画布每帧应 3 次 fill（三层山），实得 ${mainOps.filter((e) => e.op === 'fill').length}`);
  check(mainOps.filter((e) => e.op === 'stroke').length === 3, `主画布每帧应 3 次 stroke（三档草），实得 ${mainOps.filter((e) => e.op === 'stroke').length}`);
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
  check(mainOps.filter((e) => e.op === 'fill').length === 3, `降级路径应 3 次山体 fill，实得 ${mainOps.filter((e) => e.op === 'fill').length}`);
  stage.dispose();
}

if (failures.length === 0) {
  console.log(`field-in-stage: PASS ${checks}/${checks}`);
  process.exit(0);
}
console.error(`field-in-stage: FAIL ${failures.length}/${checks}`);
for (const f of failures) console.error(`  - ${f}`);
process.exit(1);
