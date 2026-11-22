// dandelion —— L2 生态零件：10 株 / 1335 颗种子，纸上的蒲公英。
//
// 来源：`sites/hug/parts/dandelion.ts`（v1 的 Canvas2D 渲染层，1335 颗、LOD、预渲染缓存）
// 与 `shared/parts-library/dandelion/core/meadow.ts`（原文算法的纯数学移植）。
//
// 为什么不是 three.js：蒲公英是**两万根细线**（1335×44 段），three.js 用 LineSegments 会
// 产生 2.6 万顶点 + 每帧上传；v1 已经证明 Canvas2D 的分层 LOD 更省。这里保留 v1 的
// 「ready 预渲染成一张位图 + 飞行期实时 LOD」策略，只把它接进 PartV2。
//
// 与 v1 的三处不同（都是契约要求的）：
//   1. 自己**不清主画布**：v1 的 `ctx.clearRect` 会把 L0 草地擦掉。飞行期改用零件私有
//      离屏缓冲（clear 自己的），ready 期直接画（静态内容不会拖尾）。
//   2. 时钟只读 `frame.dt`，不读 `performance.now()`；reducedMotion 每帧读 frame。
//   3. 种子由 `env.seed` 决定（v1 用 Math.random，同一 seed 两次跑出两种花球）。
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
import type { Lod, PartEnv, PartInstance, PartV2, StageSize, WorldFrame } from '../../stage/contract';
import { mulberry32 } from '../../stage/world';

/**
 * 建一条可 stroke 的路径。
 *
 * 真浏览器里是 `Path2D`（预构建一次、每帧只 stroke，不逐线 moveTo）。
 * Node 假 DOM 没有 Path2D（预览门要在没有浏览器的环境里跑装配），所以退化成
 * **只记录不绘制**的空路径；它只在测试环境出现，真实浏览器永远走上面那条。
 */
function makePath(): Path2D {
  const Ctor = (globalThis as unknown as { Path2D?: new () => Path2D }).Path2D;
  if (Ctor) return new Ctor();
  return {
    moveTo() {},
    lineTo() {},
  } as unknown as Path2D;
}

/** 三状态：ready（花球完整）→ drifting（放飞）→ away（全部离场）。 */
type MeadowState = 'ready' | 'drifting' | 'away';

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

const TIER_MID = buildMidTier();
const TIER_RICH = buildRichTier();
const TIER_LOW = buildLowTier();
const TIER_TINY: readonly number[] = [1, 2];

const PAPPUS_REACH = 0.19;
const ALPHA_BUCKETS = 8;
const MAX_DT = 0.1;
const SWAY_X = 0.9;
const SWAY_Y = 0.6;
const SLOW_FRAME_MS = 13;
const FAST_FRAME_MS = 8;

const STEM_COLOR = 'rgba(109,122,84,0.55)';
const ACHENE_COLOR = '#b4864f';
const PAPPUS_COLOR = '#fbeedc';

interface Bucket {
  stem: Path2D;
  hair: Path2D;
}

/** 造一张离屏画布；没有 document 时返回 null（预览/单测的降级路径）。 */
function makeSurface(): HTMLCanvasElement | null {
  const doc = (globalThis as unknown as { document?: Document }).document;
  if (!doc) return null;
  const el = doc.createElement('canvas');
  return typeof el.getContext === 'function' ? el : null;
}

function create(env: PartEnv): PartInstance {
  const ctx = env.ctx;
  if (!ctx) throw new Error('dandelion 需要 canvas2d 通道');

  const rng = mulberry32(env.seed);
  const geometry: SeedGeometry = createSeedGeometry();
  const field: SeedField = buildSeedField(rng);
  const count = field.count;

  let w = env.width > 0 ? env.width : 1;
  let h = env.height > 0 ? env.height : 1;
  let dpr = env.dpr > 0 ? env.dpr : 1;
  let lod: Lod = env.lod;
  let state: MeadowState = 'ready';
  let time = 0;
  let maxRelease = -1;
  let disposed = false;
  let lastFrame: WorldFrame | null = null;

  // 离屏：飞行期（必须清自己的画布），以及 ready 期的花球缓存
  const flightCanvas = makeSurface();
  const cacheCanvas = makeSurface();
  let flightCtx = flightCanvas?.getContext('2d') ?? null;
  let cacheCtx = cacheCanvas?.getContext('2d') ?? null;
  let cacheValid = false;

  let quality = lod === 'low' ? 0.6 : 1;
  let drawCost = 0;

  const frame: SeedFrame = { travel: 0, flying: 0, alpha: 0 };
  const axis: Vec3Out = { x: 0, y: 0, z: 0 };
  const basis: SeedBasis = { right: { x: 0, y: 0, z: 0 }, forward: { x: 0, y: 0, z: 0 }, degenerate: false };
  const drift: Vec3Out = { x: 0, y: 0, z: 0 };
  const local: Vec3Out = { x: 0, y: 0, z: 0 };
  const proj: ProjectedPoint = { x: 0, y: 0, k: 0 };
  const center: ProjectedPoint = { x: 0, y: 0, k: 0 };
  const buckets: Bucket[] = Array.from({ length: ALPHA_BUCKETS }, () => ({
    stem: makePath(),
    hair: makePath(),
  }));

  const view = (): CameraView => createView(w, h);

  const drawStems = (target: CanvasRenderingContext2D, cam: CameraView): void => {
    target.strokeStyle = STEM_COLOR;
    target.lineCap = 'round';
    for (const plant of PLANT_LAYOUT) {
      const groundX = plant.x + plant.lean * 0.55;
      projectInto(cam, groundX, -0.62, plant.z, proj);
      const gx = proj.x;
      const gy = proj.y;
      projectInto(cam, plant.x, plant.y, plant.z, proj);
      const cx = proj.x;
      const cy = proj.y;
      target.lineWidth = Math.max(1, Math.min(4.5, proj.k * 0.022));
      target.beginPath();
      target.moveTo(gx, gy);
      target.quadraticCurveTo(gx + (cx - gx) * 0.35, gy - (gy - cy) * 0.55, cx, cy);
      target.stroke();
    }
  };

  const plotSeed = (
    cam: CameraView,
    now: number,
    index: number,
    travel: number,
    tier: readonly number[],
    target: Bucket,
    hx: number,
    hy: number,
    hz: number,
    reduced: boolean,
  ): void => {
    const size = field.aSize[index]!;
    const spin = field.aSpin[index]!;
    axisInto(field, index, travel, now, reduced ? 0 : 1, axis);
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
      projectInto(cam, hx + local.x, hy + local.y, hz + local.z, proj);
      path.moveTo(proj.x, proj.y);
      const qx = geometry.points[offset + 3]!;
      const qy = geometry.points[offset + 4]!;
      const qz = geometry.points[offset + 5]!;
      localPoint(qx, qy, qz, spin, size, axis, basis, local);
      projectInto(cam, hx + local.x, hy + local.y, hz + local.z, proj);
      path.lineTo(proj.x, proj.y);
    }
  };

  const pickTier = (screenSize: number, travel: number, flying: number): readonly number[] => {
    if (!flying) return TIER_MID;
    if (screenSize * quality > 22 && travel > 1.0) return TIER_FULL;
    if (screenSize * quality > 9) return TIER_MID;
    if (screenSize * quality > 3.5) return TIER_LOW;
    return TIER_TINY;
  };

  const buildCache = (): void => {
    if (!cacheCanvas || !cacheCtx) return;
    const pxW = Math.max(1, Math.round(w * dpr));
    const pxH = Math.max(1, Math.round(h * dpr));
    if (cacheCanvas.width !== pxW || cacheCanvas.height !== pxH) {
      cacheCanvas.width = pxW;
      cacheCanvas.height = pxH;
    }
    cacheCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cacheCtx.clearRect(0, 0, w, h);
    const cam = createView(w, h);
    const localBuckets: Bucket[] = Array.from({ length: ALPHA_BUCKETS }, () => ({
      stem: makePath(),
      hair: makePath(),
    }));
    const tier = quality >= 0.99 ? TIER_RICH : TIER_MID;
    for (let i = 0; i < count; i += 1) {
      const alpha = 0.19 + Math.max(0, field.aAxis[i * 3 + 2]!) * 0.26;
      const bucket = localBuckets[Math.max(1, Math.min(ALPHA_BUCKETS, Math.round(alpha * ALPHA_BUCKETS))) - 1]!;
      plotSeed(cam, 0, i, 0, tier, bucket, field.aHome[i * 3]!, field.aHome[i * 3 + 1]!, field.aHome[i * 3 + 2]!, false);
    }
    cacheCtx.lineCap = 'round';
    cacheCtx.lineWidth = Math.max(0.6, 0.72);
    for (let b = 0; b < ALPHA_BUCKETS; b += 1) {
      const bucket = localBuckets[b]!;
      cacheCtx.globalAlpha = (b + 1) / ALPHA_BUCKETS;
      cacheCtx.strokeStyle = ACHENE_COLOR;
      cacheCtx.stroke(bucket.stem);
      cacheCtx.strokeStyle = PAPPUS_COLOR;
      cacheCtx.stroke(bucket.hair);
    }
    cacheCtx.globalAlpha = 1;
    cacheValid = true;
  };

  const drawReady = (f: WorldFrame): void => {
    const g = ctx;
    g.save();
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    drawStems(g, view());
    if (!cacheValid) buildCache();
    if (cacheCanvas && cacheValid) {
      // Wind 开启时，即使还没按「Let it go」，花球也要先被吹得偏一点——
      // 否则用户打开 Wind 看不到任何反馈，会以为麦克风没生效。
      const gust = f.audio ? Math.min(1, Math.max(0, f.audio.level)) : 0;
      const swayX = f.reducedMotion ? 0 : Math.sin(time * 0.7) * SWAY_X + gust * 5;
      const swayY = f.reducedMotion ? 0 : Math.sin(time * 1.13 + 1.2) * SWAY_Y + gust * 1.5;
      g.drawImage(cacheCanvas as unknown as CanvasImageSource, swayX, swayY, w, h);
    }
    g.restore();
  };

  const drawFlight = (f: WorldFrame): void => {
    if (!flightCanvas || !flightCtx) return;
    const pxW = Math.max(1, Math.round(w * dpr));
    const pxH = Math.max(1, Math.round(h * dpr));
    if (flightCanvas.width !== pxW || flightCanvas.height !== pxH) {
      flightCanvas.width = pxW;
      flightCanvas.height = pxH;
    }
    const g = flightCtx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    g.globalAlpha = 1;
    drawStems(g, view());

    const started = typeof performance !== 'undefined' ? performance.now() : 0;
    for (const bucket of buckets) {
      bucket.stem = makePath();
      bucket.hair = makePath();
    }
    const margin = 48;
    const cam = view();
    const driftScale = driftHeightScale(h);
    const reduced = f.reducedMotion;
    // 麦克风只在 /hug 的 Wind 开启时存在；`audio` 为 null 时 gust=0，风回到默认值。
    const gust = f.audio ? Math.min(1, Math.max(0, f.audio.level)) : 0;
    for (let i = 0; i < count; i += 1) {
      readFrame(field, i, time, frame);
      const { travel, flying, alpha } = frame;
      if (alpha <= 0.004) continue;

      // Wind：只有麦克风开启时 `audio` 才非空；关闭时退回默认风。
      // 响度不是「决定」，是连续量 —— 所以它只改风的强度，不触发释放。
      driftInto(field.aRandom[i]!, travel, DEFAULT_WIND + gust * 0.55, drift, driftScale);
      const hx = field.aHome[i * 3]! + drift.x;
      const hy = field.aHome[i * 3 + 1]! + drift.y;
      const hz = field.aHome[i * 3 + 2]! + drift.z;

      projectInto(cam, hx, hy, hz, center);
      if (center.x < -margin || center.x > w + margin || center.y < -margin || center.y > h + margin) continue;

      const screenSize = PAPPUS_REACH * field.aSize[i]! * center.k;
      const tier = pickTier(screenSize, travel, flying);
      const slot = Math.max(1, Math.min(ALPHA_BUCKETS, Math.round(alpha * ALPHA_BUCKETS))) - 1;
      plotSeed(cam, time, i, travel, tier, buckets[slot]!, hx, hy, hz, reduced);
    }

    g.lineCap = 'round';
    g.lineWidth = Math.max(0.6, 0.72);
    for (let b = 0; b < ALPHA_BUCKETS; b += 1) {
      const bucket = buckets[b]!;
      g.globalAlpha = (b + 1) / ALPHA_BUCKETS;
      g.strokeStyle = ACHENE_COLOR;
      g.stroke(bucket.stem);
      g.strokeStyle = PAPPUS_COLOR;
      g.stroke(bucket.hair);
    }
    g.globalAlpha = 1;
    ctx.drawImage(flightCanvas as unknown as CanvasImageSource, 0, 0, w, h);

    if (started > 0) {
      const cost = performance.now() - started;
      drawCost = drawCost === 0 ? cost : drawCost * 0.9 + cost * 0.1;
      if (drawCost > SLOW_FRAME_MS) quality = Math.max(0.5, quality - 0.08);
      else if (drawCost < FAST_FRAME_MS) quality = Math.min(1, quality + 0.02);
    }
  };

  return {
    update(f: WorldFrame): void {
      if (disposed) return;
      let dt = f.dt;
      if (!Number.isFinite(dt) || dt < 0) dt = 0;
      if (dt > MAX_DT) dt = MAX_DT;
      time += dt;
      lastFrame = f;
      if (state === 'drifting' && maxRelease >= 0 && time > maxRelease + 10) state = 'away';
    },
    draw(f: WorldFrame): void {
      if (disposed) return;
      if (!lastFrame) lastFrame = f;
      if (state === 'ready') drawReady(f);
      else if (state === 'drifting') drawFlight(f);
    },
    resize(size: StageSize): void {
      w = size.w > 0 ? size.w : 1;
      h = size.h > 0 ? size.h : 1;
      dpr = size.dpr > 0 ? size.dpr : 1;
      cacheValid = false;
    },
    setLod(next: Lod): void {
      if (next === lod) return;
      lod = next;
      quality = next === 'low' ? 0.6 : 1;
      cacheValid = false;
    },
    cue(verb: string): void {
      if (disposed) return;
      if (verb === 'release') {
        if (state !== 'ready') return;
        maxRelease = releaseField(field, time, rng);
        state = 'drifting';
        cacheValid = false;
      } else if (verb === 'reset') {
        field.aRelease.fill(-1);
        state = 'ready';
        maxRelease = -1;
        cacheValid = false;
      }
    },
    readiness(): number {
      return state === 'ready' && !cacheValid ? 0.6 : 1;
    },
    dispose(): void {
      disposed = true;
      cacheValid = false;
      if (flightCanvas) { flightCanvas.width = 0; flightCanvas.height = 0; }
      if (cacheCanvas) { cacheCanvas.width = 0; cacheCanvas.height = 0; }
      flightCtx = null;
      cacheCtx = null;
    },
  };
}

/**
 * 零件定义。
 *
 * costMs：ready 态每帧 = 10 条茎 + 1 次全屏 blit（缓存位图）；drift 期 = 1335 颗 LOD 遍历
 * + 1 次离屏 clear/blit。实测在 M2 上约 1.6–2.6ms，取 2.2ms。
 */
export const part: PartV2 = {
  id: 'dandelion',
  layer: 'L2',
  blend: 'source-over',
  costMs: 2.2,
  kb: 4,
  z: 10,
  channel: 'canvas2d',
  expendable: true,
  create,
};

export default part;
