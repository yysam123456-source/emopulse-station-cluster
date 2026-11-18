/**
 * 蒲公英草甸算法核心（纯函数 · 构造期零 DOM · Node 下可 import / 可直接单测）。
 *
 * 出处：公众号原文《Three.js 实战：把愿望交给风，做一个可以吹散的蒲公英网页》，
 * 原件文件 src/three/DandelionMeadow.ts / src/utils/BlowInput.ts（全文摘录见 ../EXCERPT.md）。
 * 逐条对应关系（原文行 → 本文件符号）：
 *   - 单颗种子几何 `line(a, b, shade)` 两段 + 14 个方向的「细柄→伞面→末端分叉」三连段
 *     → createSeedGeometry()（44 段 / 88 端点）
 *   - Fibonacci 球面采样 `ny / r / angle / nx / nz` + 角度·高度·半径抖动
 *     → buildSeedField()
 *   - 实例属性 aHome / aAxis / aSize / aRandom / aRelease → SeedField 同名字段
 *   - `DETACH_SECONDS = 1.8` 与 `releases[i] = time + random() * DETACH_SECONDS` → releaseField()
 *   - `age / flying / travel` → readFrame()（travel 是秒数，不是 0—1 进度）
 *   - `drift`（三轴异速 + 两组正弦 + `0.85 + uWind * 0.25`）→ driftInto()
 *   - `fade / attachedAlpha / vAlpha` → alphaOf()
 *   - `vec3 world = home + local + drift * flying` → 本站渲染层（../index.ts 与 sites/hug/parts/dandelion.ts）
 *
 * 本文件只放「原件里有对应公式」的数学，以及投影这类渲染必需的本地补充；本地补充一律标注
 * 【本地补充】并写清理由，不冒充原文常量。
 */

/** 错峰释放窗口（秒）。原文：`const DETACH_SECONDS = 1.8`。 */
export const DETACH_SECONDS = 1.8;

/** 单颗种子的线段数：2（瘦果 + 细柄）+ 14 个方向 × 3 段。 */
export const SEGMENTS_PER_SEED = 44;

/** 伞冠方向数（原文 `for (let j = 0; j < 14; j++)`）。 */
export const PAPPUS_DIRECTIONS = 14;

/** 方位角步长（原文 `i * 2.39996323`）。 */
export const GOLDEN_STEP = 2.39996323;

/** 细柄顶端高度 0.16（原文几何第二段 `line([0,0,0],[0,0.16,0],0.7)`）。 */
export const STEM_TOP_Y = 0.16;

/** 飘散朝向过渡时长（秒）。原文：「会在约 1.3 秒内，将径向朝向过渡到略微倾斜的向上方向」。 */
export const TURN_SECONDS = 1.3;

/** 淡出起止（原文 `smoothstep(7.0, 10.0, travel)`）。 */
export const FADE_START = 7.0;
export const FADE_END = 10.0;

/** 放飞后的目标透明度（原文 `mix(attachedAlpha, 0.62, flying)`）。 */
export const FLYING_ALPHA = 0.62;

/** 附着态透明度（原文 `attachedAlpha = 0.19 + max(0.0, aAxis.z) * 0.26`）。 */
export const ATTACHED_ALPHA_BASE = 0.19;
export const ATTACHED_ALPHA_Z = 0.26;

/** 风向强度的默认值（原文 uWind 是视觉参数，未给默认值；取 0.55 为静止画面观感）。【本地补充】 */
export const DEFAULT_WIND = 0.55;

/** 镜头距离与焦距系数。【本地补充】原文用 Three.js PerspectiveCamera，参数不在摘录内。 */
export const CAMERA_Z = 6.4;
export const FOCAL_PER_HEIGHT = 2.1;

/** 地平线（画布高度比例）。【本地补充】镜头略高，给飘散留出上方天空。 */
export const HORIZON = 0.72;

/**
 * 画布高度归一化 —— 把「原件全屏 3D 场景」的漂移尺度换算到本站的卡片。【本地补充】
 *
 * 量纲问题：本站 #stage 的可视世界高度 = 画布 CSS 高 / focal = 1 / FOCAL_PER_HEIGHT ≈ 0.48 单位，
 * 而原件是满屏 3D 场景（可视世界高度约 3.5—4 单位，原文相机参数未给，按 fov 60°/距离 4 估算）。
 * 同一套世界单位的 drift 在卡片里占画面高度的比例被放大约 7—8 倍，
 * 结果是种子在 fade（smoothstep(7,10,travel)）完成之前就撞上画框上沿，观感从「淡出」变成「被裁切」。
 *
 * 归一方式：整段 drift（含两组正弦摆动）乘 (参考高 / 画布 CSS 高) × GAIN，再夹取到 [MIN, MAX]。
 * 用 CSS 高（设备像素高 / dpr）而不是设备像素，保证 dpr=1 与 dpr=2 下观感一致；
 * 用「参考高 / 实际高」而不是常数，是因为 focal ∝ 画布高，乘这个系数后
 * 漂移的**像素预算**与画布尺寸解耦，卡片被放大嵌入（视网膜或大版位）时构图不会散架。
 *
 * 为什么 GAIN = 0.32 而不是几何等比例的 0.13：
 *   0.13 会让 7 秒内位移不足 30 px，看起来「钉在原地然后淡掉」，失去原文「随风飘走」的主叙事。
 *   0.32 是实测折中：1024×384 画布（CSS 512×192）下，可见种子（alpha > 0.15）最后一次触碰画框
 *   上沿发生在 travel ≈ 9.0 s、alpha ≈ 0.16——即「淡到快看不见时才离场」，肉眼不读作裁切；
 *   同时 t=2 s 位移中位约 99 px（CSS 约 50 px），飘散仍然一眼可辨。
 *   实测脚本：_scratch/clip-check.mjs、_scratch/drift-strength.mjs（仓库外工具，不进产物）。
 *
 * **不改任何原始系数，也不动 7/10 的淡出窗口。**
 */
export const DRIFT_REFERENCE_HEIGHT = 192;
export const DRIFT_SCALE_GAIN = 0.32;
export const DRIFT_SCALE_MIN = 0.18;
export const DRIFT_SCALE_MAX = 0.6;

/**
 * 按画布 CSS 高度求 drift 归一化系数。
 * @param cssHeight 画布 CSS 高度（= 设备像素高 / dpr）
 * @returns 0.18—0.6 之间的系数；参考卡高 192 px 时为 0.32
 */
export function driftHeightScale(cssHeight: number): number {
  const h = Math.max(1, cssHeight);
  const raw = (DRIFT_REFERENCE_HEIGHT / h) * DRIFT_SCALE_GAIN;
  return Math.min(DRIFT_SCALE_MAX, Math.max(DRIFT_SCALE_MIN, raw));
}

/**
 * 10 株蒲公英的摆放。【本地补充】
 *
 * 原文只给了「10 株 / 共 1335 颗 / 近处主花球多一些、远处更小、种子相应减少」，
 * 逐株坐标与半径不在摘录内（在原件的场景初始化代码里，文章未贴）。
 * 这里按「近大远小 + 面积权重分配种子」复现该描述，播种数与 1335 严格相等。
 */
export interface PlantLayout {
  /** 花球中心世界坐标（Y 向上） */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** 花球半径（世界单位） */
  readonly radius: number;
  /** 本株种子数 */
  readonly seeds: number;
  /** 花茎向一侧倾斜的比例（只用于画茎） */
  readonly lean: number;
}

export const PLANT_LAYOUT: readonly PlantLayout[] = [
  { x: -2.42, y: 0.50, z: 0.80, radius: 0.52, seeds: 401, lean: -0.34 },
  { x: -1.39, y: 0.401, z: 0.55, radius: 0.457, seeds: 310, lean: -0.18 },
  { x: -0.503, y: 0.655, z: 0.30, radius: 0.378, seeds: 212, lean: 0.04 },
  { x: 0.222, y: 0.416, z: 0.05, radius: 0.307, seeds: 140, lean: 0.20 },
  { x: 1.009, y: 0.738, z: -0.20, radius: 0.254, seeds: 96, lean: 0.36 },
  { x: 1.716, y: 0.466, z: -0.45, radius: 0.203, seeds: 61, lean: 0.50 },
  { x: 2.389, y: 0.809, z: -0.70, radius: 0.173, seeds: 44, lean: 0.60 },
  { x: 2.993, y: 0.481, z: -0.95, radius: 0.144, seeds: 31, lean: 0.66 },
  { x: 3.58, y: 0.847, z: -1.20, radius: 0.122, seeds: 22, lean: 0.70 },
  { x: 4.167, y: 0.489, z: -1.50, radius: 0.109, seeds: 18, lean: 0.74 },
];

/** 全库种子总数（原文 1335；与 PLANT_LAYOUT 逐株求和一致）。 */
export const SEED_COUNT = PLANT_LAYOUT.reduce((sum, plant) => sum + plant.seeds, 0);

/** 三轴向量（调用方传入的复用容器，避免逐帧分配）。 */
export interface Vec3Out {
  x: number;
  y: number;
  z: number;
}

/** 单颗种子某一时刻的派生量（对应顶点着色器里的同名单变量）。 */
export interface SeedFrame {
  /** 离开花球的时长（秒）——原文明确：不是距离，也不是 0—1 进度 */
  travel: number;
  /** 0 = 仍附着在花球上；1 = 已放飞 */
  flying: number;
  /** 最终透明度（已含 fade） */
  alpha: number;
}

/** 投影结果：屏幕坐标 + 该深度上的每世界单位像素数。 */
export interface ProjectedPoint {
  x: number;
  y: number;
  /** 该深度的像素/世界单位比（用于按屏幕尺寸选 LOD） */
  k: number;
}

/** 单颗种子的线段几何：points 为 88 个端点（x,y,z），shades 为 44 个线段明暗系数。 */
export interface SeedGeometry {
  readonly points: Float32Array;
  readonly shades: Float32Array;
  readonly segments: number;
  readonly endpoints: number;
}

/** 一株草地上的全部实例属性（对应原文的 InstancedBufferAttribute 集合）。 */
export interface SeedField {
  readonly count: number;
  /** aHome：世界空间固定起点（3 × count） */
  readonly aHome: Float32Array;
  /** aAxis：花球中心指向该种子的径向单位向量（3 × count） */
  readonly aAxis: Float32Array;
  /** aSize：尺寸变化（count） */
  readonly aSize: Float32Array;
  /** aRandom：保留的随机值，供旋转与飘动复用（count） */
  readonly aRandom: Float32Array;
  /** aRelease：出发时刻；-1 = 尚未放飞（count） */
  readonly aRelease: Float32Array;
  /** 种子局部绕自身 Y 轴的旋转角（count）【本地补充】原文只说「每颗种子的旋转角不同」 */
  readonly aSpin: Float32Array;
  /** 归属株序号（count）【本地补充】只为渲染分株，不参与数学 */
  readonly aPlant: Uint8Array;
}

/** 线段的明暗分界：shade < 0.5 视为瘦果/细柄（棕色），其余视为冠毛（暖白）。 */
export const SHADE_SPLIT = 0.5;

/** 夹取到 [0,1]。 */
export function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

/** GLSL 同名函数（原文着色器里用 smoothstep(7.0, 10.0, travel)）。 */
export function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** GLSL 同名函数（原文用 fract(aRandom * 17.0) 把同一随机值重映射到不同变化）。 */
export function fract(value: number): number {
  return value - Math.floor(value);
}

/**
 * 构造单颗种子的线段几何 —— 与原文逐行对应（`line(a, b, shade)` 原样保留）。
 *
 * 局部坐标约定 Y 向上：瘦果在 y < 0，细柄从原点向上，伞冠在 y ≈ 0.16—0.19。
 * 合计 2 + 14 × 3 = 44 段 / 88 端点。
 */
export function createSeedGeometry(): SeedGeometry {
  const points: number[] = [];
  const shades: number[] = [];

  const line = (a: readonly number[], b: readonly number[], shade: number): void => {
    points.push(a[0]!, a[1]!, a[2]!, b[0]!, b[1]!, b[2]!);
    shades.push(shade);
  };

  line([0, -0.055, 0], [0, 0, 0], 0.38);
  line([0, 0, 0], [0, 0.16, 0], 0.7);

  for (let j = 0; j < PAPPUS_DIRECTIONS; j += 1) {
    const angle = (j / PAPPUS_DIRECTIONS) * Math.PI * 2;
    const c = Math.cos(angle);
    const s = Math.sin(angle);

    line([0, 0.16, 0], [c * 0.07, 0.19, s * 0.07], 0.92);
    line([c * 0.07, 0.19, s * 0.07], [c * 0.125, 0.18, s * 0.125], 1);
    line(
      [c * 0.1, 0.184, s * 0.1],
      [c * 0.13 - s * 0.014, 0.19, s * 0.13 + c * 0.014],
      0.9,
    );
  }

  return {
    points: new Float32Array(points),
    shades: new Float32Array(shades),
    segments: shades.length,
    endpoints: points.length / 3,
  };
}

/**
 * 按 Fibonacci 球面把种子排到 10 株花球上。
 *
 * 原文采样：
 *   ny = 1 - (i + 0.5) / count * 2
 *   r  = sqrt(1 - ny * ny)
 *   angle = i * 2.39996323
 *   nx = cos(angle) * r, nz = sin(angle) * r
 * 并按原文补了「角度、高度、半径小幅抖动 + 每颗尺寸略有不同」。
 *
 * 起点半径减去一段细柄长度（STEM_TOP_Y）：原文特别提醒，直接把根部放到球壳上
 * 会让花球比预期大一圈。
 */
export function buildSeedField(random: () => number = Math.random): SeedField {
  const count = SEED_COUNT;
  const aHome = new Float32Array(count * 3);
  const aAxis = new Float32Array(count * 3);
  const aSize = new Float32Array(count);
  const aRandom = new Float32Array(count);
  const aRelease = new Float32Array(count);
  const aSpin = new Float32Array(count);
  const aPlant = new Uint8Array(count);

  let cursor = 0;
  for (let p = 0; p < PLANT_LAYOUT.length; p += 1) {
    const plant = PLANT_LAYOUT[p]!;
    const plantCount = plant.seeds;

    for (let i = 0; i < plantCount; i += 1) {
      const ny = 1 - ((i + 0.5) / plantCount) * 2;
      const ring = Math.sqrt(Math.max(0, 1 - ny * ny));
      const angle = i * GOLDEN_STEP;

      // 抖动：打散经纬格子感（原文「小幅抖动」，幅度未给 → 本地补充的保守取值）
      const jitterAngle = angle + (random() - 0.5) * 0.18;
      const jitterY = Math.max(-1, Math.min(1, ny + (random() - 0.5) * 0.03));
      const jitterRing = ring * (1 + (random() - 0.5) * 0.07);

      const nx = Math.cos(jitterAngle) * jitterRing;
      const nz = Math.sin(jitterAngle) * jitterRing;
      const nyUnit = jitterY;

      // 方向归一化（抖动后长度略偏离 1）
      const len = Math.hypot(nx, nyUnit, nz) || 1;
      const dx = nx / len;
      const dy = nyUnit / len;
      const dz = nz / len;

      const size = 0.82 + random() * 0.36;
      // 起点半径 = 花球半径 − 细柄长度，保证伞面落在球壳上而不是整球胀一圈
      const homeRadius = plant.radius - STEM_TOP_Y * size;

      const index = cursor + i;
      aHome[index * 3] = plant.x + dx * homeRadius;
      aHome[index * 3 + 1] = plant.y + dy * homeRadius;
      aHome[index * 3 + 2] = plant.z + dz * homeRadius;
      aAxis[index * 3] = dx;
      aAxis[index * 3 + 1] = dy;
      aAxis[index * 3 + 2] = dz;
      aSize[index] = size;
      aRandom[index] = random();
      aRelease[index] = -1;
      aSpin[index] = random() * Math.PI * 2;
      aPlant[index] = p;
    }
    cursor += plantCount;
  }

  return { count, aHome, aAxis, aSize, aRandom, aRelease, aSpin, aPlant };
}

/**
 * 给每颗种子安排出发时刻：原文
 *   for (i…) releases[i] = time + random() * DETACH_SECONDS
 * 重置只把出发时刻恢复为 -1，场景与几何继续复用。
 */
export function releaseField(field: SeedField, time: number, random: () => number = Math.random): number {
  let latest = time;
  for (let i = 0; i < field.count; i += 1) {
    const release = time + random() * DETACH_SECONDS;
    field.aRelease[i] = release;
    if (release > latest) latest = release;
  }
  // 返回最晚的出发时刻：调用方据此判断「全部种子都已飞过 fade 终点」。
  return latest;
}

/** 重置：`releases.fill(-1)`（原文第九节）。 */
export function resetField(field: SeedField): void {
  field.aRelease.fill(-1);
}

/**
 * 读出某颗种子在 time 时刻的 age / flying / travel / alpha。
 *
 * 原文着色器：
 *   float age    = max(0.0, uTime - aRelease);
 *   float flying = aRelease >= 0.0 && uTime >= aRelease ? 1.0 : 0.0;
 *   float travel = age * flying;
 */
export function readFrame(field: SeedField, index: number, time: number, out: SeedFrame): SeedFrame {
  const release = field.aRelease[index]!;
  const age = Math.max(0, time - release);
  const flying = release >= 0 && time >= release ? 1 : 0;
  const travel = age * flying;
  out.travel = travel;
  out.flying = flying;
  out.alpha = alphaOf(field.aAxis[index * 3 + 2]!, travel, flying);
  return out;
}

/**
 * 透明度（原文第六节）：
 *   float fade = 1.0 - smoothstep(7.0, 10.0, travel);
 *   float attachedAlpha = 0.19 + max(0.0, aAxis.z) * 0.26;
 *   vAlpha = fade * mix(attachedAlpha, 0.62, flying);
 */
export function alphaOf(axisZ: number, travel: number, flying: number): number {
  const fade = 1 - smoothstep(FADE_START, FADE_END, travel);
  const attachedAlpha = ATTACHED_ALPHA_BASE + Math.max(0, axisZ) * ATTACHED_ALPHA_Z;
  return fade * (attachedAlpha + (FLYING_ALPHA - attachedAlpha) * flying);
}

/**
 * 飘散位移（原文第五节，一个系数都不改）：
 *   travel * (0.35 + aRandom * 1.6)
 *   travel * (0.08 + fract(aRandom * 17.0) * 0.7)
 *  -travel * (0.5  + fract(aRandom * 31.0) * 2.5)
 *   再叠加两组有界正弦摆动，整体乘 (0.85 + uWind * 0.25)。
 *
 * @param heightScale 画布高度归一化系数（见 driftHeightScale）。默认 1 = 原件尺度，
 *   便于与原文逐项对拍；本站渲染层必须传 driftHeightScale(cssHeight)。
 *   它只乘在最后一步，不改变上面任何一项的系数。
 */
export function driftInto(
  aRandom: number,
  travel: number,
  wind: number,
  out: Vec3Out,
  heightScale = 1,
): void {
  let x = travel * (0.35 + aRandom * 1.6);
  let y = travel * (0.08 + fract(aRandom * 17.0) * 0.7);
  let z = -travel * (0.5 + fract(aRandom * 31.0) * 2.5);

  const swing = Math.min(travel, 1);
  x += Math.sin(travel * 1.1 + aRandom * 31.0) * 0.24 * swing;
  y += Math.sin(travel * 0.9 + aRandom * 23.0) * 0.22 * swing;

  const gust = 0.85 + wind * 0.25;
  // 【本地补充】量纲归一：整段位移（含正弦摆动）一起乘画布高度系数。
  const scale = gust * heightScale;
  out.x = x * scale;
  out.y = y * scale;
  out.z = z * scale;
}

/** 朝向过渡的缓动（原文只说「约 1.3 秒内过渡」，缓动曲线是本地补充）。 */
function easeInOut(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * 某颗种子当前的朝向轴（等价于着色器里的 axis）。
 *
 * 附着时 = 球面径向 aAxis；放飞的 1.3 秒内过渡到「略微倾斜的向上方向」，
 * 每颗种子的倾斜与摇动幅度由 aRandom 决定（原文只给了这个性质，没给公式 → 本地补充）。
 *
 * @param sway 待机摇动强度：0 关闭（prefers-reduced-motion 时由调用方传 0）
 */
export function axisInto(
  field: SeedField,
  index: number,
  travel: number,
  time: number,
  sway: number,
  out: Vec3Out,
): void {
  const ax = field.aAxis[index * 3]!;
  const ay = field.aAxis[index * 3 + 1]!;
  const az = field.aAxis[index * 3 + 2]!;
  const r = field.aRandom[index]!;
  const t = easeInOut(clamp01(travel / TURN_SECONDS));

  // 目标：略微倾斜的向上方向，倾斜量每颗不同
  const upX = (r - 0.5) * 0.5;
  const upY = 1;
  const upZ = (fract(r * 13.0) - 0.5) * 0.4;

  let x = ax * (1 - t) + upX * t;
  let y = ay * (1 - t) + upY * t;
  let z = az * (1 - t) + upZ * t;

  // 附着态的待机摇动（原文在「减少动态效果」时会关掉它）
  if (sway > 0 && t < 1) {
    const wobble = Math.sin(time * 1.6 + r * 53.0) * 0.05 * sway * (1 - t);
    x += wobble;
    z += wobble * 0.7;
  }

  const len = Math.hypot(x, y, z) || 1;
  out.x = x / len;
  out.y = y / len;
  out.z = z / len;
}

/** 种子的两条正交基（原文着色器：helper → right = normalize(cross(helper, axis)) → forward = cross(axis, right)）。 */
export interface SeedBasis {
  readonly right: Vec3Out;
  readonly forward: Vec3Out;
  /** axis.y 的绝对值是否触发退化分支（> 0.96 时辅助轴换成 X 轴） */
  degenerate: boolean;
}

/**
 * 构造把局部小伞转到球面朝向的两条正交基。
 *
 * 原文警告：axis 接近竖直时若仍用 Y 轴做辅助轴，两向量近乎平行、叉积长度趋零，
 * 归一化后方向不稳，表现为「花球顶端几颗突然歪掉的种子」。这里按原文换成 X 轴。
 */
export function seedBasisInto(axis: Vec3Out, out: SeedBasis): void {
  const degenerate = Math.abs(axis.y) > 0.96;
  const hx = degenerate ? 1 : 0;
  const hy = degenerate ? 0 : 1;
  const hz = 0;

  // right = normalize(cross(helper, axis))
  let rx = hy * axis.z - hz * axis.y;
  let ry = hz * axis.x - hx * axis.z;
  let rz = hx * axis.y - hy * axis.x;
  const rl = Math.hypot(rx, ry, rz) || 1;
  rx /= rl;
  ry /= rl;
  rz /= rl;

  // forward = cross(axis, right)
  const fx = axis.y * rz - axis.z * ry;
  const fy = axis.z * rx - axis.x * rz;
  const fz = axis.x * ry - axis.y * rx;

  out.right.x = rx;
  out.right.y = ry;
  out.right.z = rz;
  out.forward.x = fx;
  out.forward.y = fy;
  out.forward.z = fz;
  out.degenerate = degenerate;
}

/**
 * 把种子局部坐标 (px,py,pz) 变换到世界空间偏移量（对应原文着色器）：
 *   local = (right * radial.x + axis * position.y + forward * radial.y) * aSize
 * 其中 radial 是局部 XZ 绕自身 Y 轴旋转后的结果。
 */
export function localPoint(
  px: number,
  py: number,
  pz: number,
  spin: number,
  size: number,
  axis: Vec3Out,
  basis: SeedBasis,
  out: Vec3Out,
): void {
  const c = Math.cos(spin);
  const s = Math.sin(spin);
  const radialX = px * c - pz * s;
  const radialZ = px * s + pz * c;

  out.x = (basis.right.x * radialX + axis.x * py + basis.forward.x * radialZ) * size;
  out.y = (basis.right.y * radialX + axis.y * py + basis.forward.y * radialZ) * size;
  out.z = (basis.right.z * radialX + axis.z * py + basis.forward.z * radialZ) * size;
}

/** 镜头参数（本地补充：等价于原文的固定 PerspectiveCamera）。 */
export interface CameraView {
  readonly cx: number;
  readonly cy: number;
  readonly focal: number;
  readonly camZ: number;
}

/** 按画布尺寸建立视图：镜头在正 Z 上方略高处看向原点（原文「镜头大致从正 Z 看向负 Z」）。 */
export function createView(width: number, height: number): CameraView {
  // 画布过窄时按宽高比收一点焦距，避免右侧远株被裁掉（宽高比 ≥ 2.2 时不生效）。
  const aspectCap = (width / 2.2) * FOCAL_PER_HEIGHT;
  const focal = Math.max(1, Math.min(height * FOCAL_PER_HEIGHT, aspectCap));
  return {
    cx: width * 0.5,
    cy: height * HORIZON,
    focal,
    camZ: CAMERA_Z,
  };
}

/** 世界坐标 → 画布坐标（透视：越远越小，对应原文「透视相机会让远去的种子自然变小」）。 */
export function projectInto(view: CameraView, x: number, y: number, z: number, out: ProjectedPoint): void {
  const depth = view.camZ - z;
  const k = view.focal / (depth > 0.25 ? depth : 0.25);
  out.x = view.cx + x * k;
  out.y = view.cy - y * k;
  out.k = k;
}
