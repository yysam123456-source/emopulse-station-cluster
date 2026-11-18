/**
 * /hug 的蒲公英渲染层（Canvas 2D）。
 *
 * 数学全部来自 shared/parts-library/dandelion/core/meadow.ts（算法移植，D3 级）；
 * 本文件只负责「把 3D 世界坐标画到 2D 画布」，并解决一个工程问题：
 * 1335 颗 × 44 段 = 58,740 段线，Canvas 2D 逐帧全量重绘会拖垮帧率。
 *
 * 性能方案（见 part.manifest.ts 的 downgrade）：
 *   1. ready 态（用户停留最久的画面）把 1335 颗附着种子按 23 段/颗预渲染进离屏位图，
 *      之后每帧只 blit 一次 + 位图整体微摆（原文的逐颗待机摇动 → 整体轻摆）；
 *   2. 释放过程中附着集合连续变化、无法预渲染，改用 LOD 实时绘制（附着态 14 段/颗）；
 *   3. 飞行种子按屏幕尺寸选 44 / 14 / 5 / 2 段四档，并做画面外剔除；
 *   4. 按透明度分 8 个桶批量 stroke，把逐颗 stroke 压到 ≤16 次/帧；
 *   5. 帧耗时自适应：平均绘制耗时超阈值时整体下调 LOD 档位（绝不减少种子数）。
 *
 * 还有一处量纲换算：原件的 drift 是按全屏 3D 场景调的，直接搬到卡片会把画面撑爆，
 * 因此逐帧乘 driftHeightScale(CSS 高度) —— 只缩位移，不改任何原始系数，也不动 7/10 的淡出窗口。
 */
import {
  DEFAULT_WIND,
  PLANT_LAYOUT,
  SEGMENTS_PER_SEED,
  SHADE_SPLIT,
  axisInto,
  buildSeedField,
  createSeedGeometry,
  createView,
  driftHeightScale,
  driftInto,
  localPoint,
  projectInto,
  readFrame,
  releaseField,
  seedBasisInto,
  type CameraView,
  type ProjectedPoint,
  type SeedBasis,
  type SeedField,
  type SeedFrame,
  type SeedGeometry,
  type Vec3Out,
} from '../../../shared/parts-library/dandelion/core/meadow';

/** 站点零件的最小生命周期契约（与 parts/index.ts 的 Part 结构一致）。 */
export interface DandelionPart {
  update(seconds: number): void;
  dispose(): void;
  /** 放飞（只在 ready 态生效；drifting/away 重复调用无效）。 */
  release(): void;
  /** 重新长满：出发时刻恢复 -1（原文第九节）。 */
  reset(): void;
  readonly state: MeadowState;
  readonly released: number;
}

export type MeadowState = 'ready' | 'drifting' | 'away';

/** 三状态之外的内部输入。 */
export interface DandelionOptions {
  /** 风力（原文 uWind，视觉参数，不对应风速计读数）。 */
  readonly wind?: number;
}

/**
 * LOD 档位：按屏幕尺寸挑线段子集（不改变几何本身，只在远处抽稀）。
 *  - full ：全部 44 段
 *  - rich ：瘦果+细柄 + 7 个方向（23 段，跨 14 个方向均匀取样）—— ready 态预渲染用
 *  - mid  ：瘦果+细柄 + 4 个方向（14 段）—— 释放期附着态 / 中距离飞行
 *  - low  ：瘦果+细柄 + 3 根伞骨（5 段）
 *  - tiny ：细柄 + 1 根伞骨（2 段）
 */
const TIER_FULL: readonly number[] = Array.from({ length: SEGMENTS_PER_SEED }, (_, i) => i);

function buildMidTier(): number[] {
  const indices = [0, 1];
  for (const j of [0, 3, 6, 9]) {
    const base = 2 + j * 3;
    indices.push(base, base + 1, base + 2);
  }
  return indices;
}

function buildLowTier(): number[] {
  const indices = [0, 1];
  for (const j of [0, 5, 9]) indices.push(2 + j * 3);
  return indices;
}

function buildRichTier(): number[] {
  const indices = [0, 1];
  for (const j of [0, 2, 4, 6, 8, 10, 12]) {
    const base = 2 + j * 3;
    indices.push(base, base + 1, base + 2);
  }
  return indices;
}

const TIER_MID: readonly number[] = buildMidTier();
const TIER_RICH: readonly number[] = buildRichTier();
const TIER_LOW: readonly number[] = buildLowTier();
const TIER_TINY: readonly number[] = [1, 2];

/** 伞冠顶端到种子的局部 Y 上界，用于估算屏幕尺寸。 */
const PAPPUS_REACH = 0.19;

/** 透明度分桶数（批量 stroke 用；细丝的半透明分档在视觉上不可辨）。 */
const ALPHA_BUCKETS = 8;

/** 一帧内允许的最大时间步（原文「对异常大的时间步长设上限」）。 */
const MAX_DT = 0.1;

/** 待机整体轻摆的振幅（设备像素）。 */
const SWAY_X = 0.9;
const SWAY_Y = 0.6;

/** 帧耗时自适应阈值（毫秒）。 */
const SLOW_FRAME_MS = 13;
const FAST_FRAME_MS = 8;

const STEM_COLOR = 'rgba(109,122,84,0.55)';
const ACHENE_COLOR = '#b4864f';
const PAPPUS_COLOR = '#fbeedc';

interface Bucket {
  stem: Path2D;
  hair: Path2D;
}

/** 创建蒲公英零件；ctx 是站点模板里的 #stage 2D 上下文。 */
export function createDandelionPart(
  ctx: CanvasRenderingContext2D,
  options: DandelionOptions = {},
): DandelionPart {
  const wind = typeof options.wind === 'number' ? options.wind : DEFAULT_WIND;
  const geometry: SeedGeometry = createSeedGeometry();
  const field: SeedField = buildSeedField();
  const count = field.count;

  let state: MeadowState = 'ready';
  let time = 0;
  let lastSeconds = -1;
  let disposed = false;
  let maxRelease = -1;

  /** 离屏位图：ready 态的全细节附着花球。 */
  let cache: HTMLCanvasElement | null = null;
  let cacheWidth = 0;
  let cacheHeight = 0;
  let cacheValid = false;

  /** LOD 质量系数：1 = 满，0.5 = 保守（帧耗时高时下调，只降细节不降种子数）。 */
  let quality = 1;
  let drawCost = 0;

  const reducedMotion = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 逐帧复用的临时对象（避免每帧几百次分配）
  const frame: SeedFrame = { travel: 0, flying: 0, alpha: 0 };
  const axis: Vec3Out = { x: 0, y: 0, z: 0 };
  const basis: SeedBasis = { right: { x: 0, y: 0, z: 0 }, forward: { x: 0, y: 0, z: 0 }, degenerate: false };
  const drift: Vec3Out = { x: 0, y: 0, z: 0 };
  const local: Vec3Out = { x: 0, y: 0, z: 0 };
  const proj: ProjectedPoint = { x: 0, y: 0, k: 0 };
  const center: ProjectedPoint = { x: 0, y: 0, k: 0 };
  const buckets: Bucket[] = Array.from({ length: ALPHA_BUCKETS }, () => ({
    stem: new Path2D(),
    hair: new Path2D(),
  }));

  const ratio = (): number => {
    const c = ctx.canvas;
    const css = c.clientWidth || c.width || 1;
    return c.width / css || 1;
  };

  /** 画 10 根花茎（本地补充：原件的 CatmullRomCurve3 + TubeGeometry 简化为二次曲线）。 */
  const drawStems = (target: CanvasRenderingContext2D, view: CameraView): void => {
    target.strokeStyle = STEM_COLOR;
    target.lineCap = 'round';
    for (const plant of PLANT_LAYOUT) {
      const groundX = plant.x + plant.lean * 0.55;
      projectInto(view, groundX, -0.62, plant.z, proj);
      const gx = proj.x;
      const gy = proj.y;
      projectInto(view, plant.x, plant.y, plant.z, proj);
      const cx = proj.x;
      const cy = proj.y;
      target.lineWidth = Math.max(1, Math.min(4.5, proj.k * 0.022)) * ratio();
      target.beginPath();
      target.moveTo(gx, gy);
      target.quadraticCurveTo(gx + (cx - gx) * 0.35, gy - (gy - cy) * 0.55, cx, cy);
      target.stroke();
    }
  };

  /** 把一颗种子的某档线段写进桶路径。 */
  const plotSeed = (
    view: CameraView,
    now: number,
    index: number,
    travel: number,
    tier: readonly number[],
    target: Bucket,
    hx: number,
    hy: number,
    hz: number,
  ): void => {
    const size = field.aSize[index]!;
    const spin = field.aSpin[index]!;
    axisInto(field, index, travel, now, reducedMotion ? 0 : 1, axis);
    seedBasisInto(axis, basis);

    for (let s = 0; s < tier.length; s += 1) {
      const seg = tier[s]!;
      const shade = geometry.shades[seg]!;
      const path = shade < SHADE_SPLIT ? target.stem : target.hair;
      const offset = seg * 6;
      const px = geometry.points[offset]!;
      const py = geometry.points[offset + 1]!;
      const pz = geometry.points[offset + 2]!;
      localPoint(px, py, pz, spin, size, axis, basis, local);
      projectInto(view, hx + local.x, hy + local.y, hz + local.z, proj);
      path.moveTo(proj.x, proj.y);
      const qx = geometry.points[offset + 3]!;
      const qy = geometry.points[offset + 4]!;
      const qz = geometry.points[offset + 5]!;
      localPoint(qx, qy, qz, spin, size, axis, basis, local);
      projectInto(view, hx + local.x, hy + local.y, hz + local.z, proj);
      path.lineTo(proj.x, proj.y);
    }
  };

  /** 选档：屏幕尺寸 + 是否刚脱离（刚脱离时仍挤在花球上，满细节纯属浪费）。 */
  const pickTier = (screenSize: number, travel: number, flying: number): readonly number[] => {
    const scale = quality;
    if (!flying) return TIER_MID;
    if (screenSize * scale > 22 && travel > 1.0) return TIER_FULL;
    if (screenSize * scale > 9) return TIER_MID;
    if (screenSize * scale > 3.5) return TIER_LOW;
    return TIER_TINY;
  };

  /** 预渲染 ready 态的满细节花球（只做一次；尺寸变化才重建）。 */
  const buildCache = (width: number, height: number): void => {
    if (typeof document === 'undefined') return;
    if (!cache) cache = document.createElement('canvas');
    cache.width = width;
    cache.height = height;
    cacheWidth = width;
    cacheHeight = height;
    const target = cache.getContext('2d');
    if (!target) {
      cacheValid = false;
      return;
    }
    const offView = createView(width, height);

    const localBuckets: Bucket[] = Array.from({ length: ALPHA_BUCKETS }, () => ({
      stem: new Path2D(),
      hair: new Path2D(),
    }));

    for (let i = 0; i < count; i += 1) {
      const alpha = 0.19 + Math.max(0, field.aAxis[i * 3 + 2]!) * 0.26;
      const bucket = localBuckets[Math.max(1, Math.min(ALPHA_BUCKETS, Math.round(alpha * ALPHA_BUCKETS))) - 1]!;
      plotSeed(offView, 0, i, 0, TIER_RICH, bucket, field.aHome[i * 3]!, field.aHome[i * 3 + 1]!, field.aHome[i * 3 + 2]!);
    }

    target.clearRect(0, 0, width, height);
    target.lineCap = 'round';
    target.lineWidth = Math.max(0.6, 0.72 * ratio());
    for (let b = 0; b < ALPHA_BUCKETS; b += 1) {
      const bucket = localBuckets[b]!;
      target.globalAlpha = (b + 1) / ALPHA_BUCKETS;
      target.strokeStyle = ACHENE_COLOR;
      target.stroke(bucket.stem);
      target.strokeStyle = PAPPUS_COLOR;
      target.stroke(bucket.hair);
    }
    target.globalAlpha = 1;
    cacheValid = true;
  };

  /** 主绘制：stems + 种子（ready 用位图，其余实时 LOD 绘制）。 */
  const draw = (): void => {
    const c = ctx.canvas;
    const width = c.width;
    const height = c.height;
    if (width < 2 || height < 2) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const view = createView(width, height);
    drawStems(ctx, view);

    if (state === 'ready') {
      if (!cacheValid || cacheWidth !== width || cacheHeight !== height) buildCache(width, height);
      if (cache && cacheValid) {
        const swayX = reducedMotion ? 0 : Math.sin(time * 0.7) * SWAY_X * ratio();
        const swayY = reducedMotion ? 0 : Math.sin(time * 1.13 + 1.2) * SWAY_Y * ratio();
        ctx.drawImage(cache, swayX, swayY);
      }
      return;
    }

    if (state === 'away') return;

    const started = typeof performance !== 'undefined' ? performance.now() : 0;
    for (const bucket of buckets) {
      bucket.stem = new Path2D();
      bucket.hair = new Path2D();
    }

    const margin = 48 * ratio();
    // drift 的量纲归一（见 meadow.ts 的 driftHeightScale）：按 CSS 高度换算，
    // 保证 dpr=1/2 下观感一致，且种子在淡出完成前不会先撞上画框上沿。
    const driftScale = driftHeightScale(height / ratio());
    for (let i = 0; i < count; i += 1) {
      readFrame(field, i, time, frame);
      const { travel, flying, alpha } = frame;
      if (alpha <= 0.004) continue;

      driftInto(field.aRandom[i]!, travel, wind, drift, driftScale);
      const hx = field.aHome[i * 3]! + drift.x;
      const hy = field.aHome[i * 3 + 1]! + drift.y;
      const hz = field.aHome[i * 3 + 2]! + drift.z;

      projectInto(view, hx, hy, hz, center);
      if (center.x < -margin || center.x > width + margin || center.y < -margin || center.y > height + margin) continue;

      const screenSize = PAPPUS_REACH * field.aSize[i]! * center.k;
      const tier = pickTier(screenSize, travel, flying);
      const slot = Math.max(1, Math.min(ALPHA_BUCKETS, Math.round(alpha * ALPHA_BUCKETS))) - 1;
      plotSeed(view, time, i, travel, tier, buckets[slot]!, hx, hy, hz);
    }

    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(0.6, 0.72 * ratio());
    for (let b = 0; b < ALPHA_BUCKETS; b += 1) {
      const bucket = buckets[b]!;
      ctx.globalAlpha = (b + 1) / ALPHA_BUCKETS;
      ctx.strokeStyle = ACHENE_COLOR;
      ctx.stroke(bucket.stem);
      ctx.strokeStyle = PAPPUS_COLOR;
      ctx.stroke(bucket.hair);
    }
    ctx.globalAlpha = 1;

    if (started > 0) {
      const cost = performance.now() - started;
      drawCost = drawCost === 0 ? cost : drawCost * 0.9 + cost * 0.1;
      if (drawCost > SLOW_FRAME_MS) quality = Math.max(0.5, quality - 0.08);
      else if (drawCost < FAST_FRAME_MS) quality = Math.min(1, quality + 0.02);
    }
  };

  return {
    get state(): MeadowState {
      return state;
    },
    get released(): number {
      return state === 'ready' ? 0 : count;
    },
    release(): void {
      if (disposed || state !== 'ready') return;
      maxRelease = releaseField(field, time);
      state = 'drifting';
    },
    reset(): void {
      if (disposed) return;
      field.aRelease.fill(-1);
      state = 'ready';
      maxRelease = -1;
    },
    update(seconds: number): void {
      if (disposed) return;
      if (lastSeconds < 0) lastSeconds = seconds;
      let dt = seconds - lastSeconds;
      lastSeconds = seconds;
      if (!Number.isFinite(dt) || dt < 0) dt = 0;
      if (dt > MAX_DT) dt = MAX_DT;
      time += dt;

      if (state === 'drifting') {
        // 最后一颗种子也淡出（travel > 10s）即进入 away
        if (maxRelease >= 0 && time > maxRelease + 10) state = 'away';
      }
      draw();
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      cache = null;
      cacheValid = false;
      state = 'ready';
      field.aRelease.fill(-1);
    },
  };
}

export default createDandelionPart;
