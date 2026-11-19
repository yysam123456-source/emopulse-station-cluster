// field-ground —— `field`（野）biome 的 L0 底材：黄昏草甸。
//
// 为什么 L0 必须单独成件：装配模型里 L0 是唯一「被所有人压在下面」的一层。
// 它一旦包含自走实体或输入响应，就会和 L2/L3 抢视觉与帧预算；
// 而它承担了整站 70% 的情绪基调（天光、地平线、地表色）。所以它只做三件事：铺天光、立三层远山、长一坡草。
//
// ★ 关键设计决定 1：**能烘到离屏的就绝不在主画布重算**
//   天光 / 日晕 / 雾带 / 地表渐变 / 暗角 五件全是静态（只随尺寸变）。
//   若每帧现算：全屏 linear + 3 段部分屏 linear + 全屏 radial，在 1280×720@dpr2（3.69 Mpx）上
//   光渐变求值就要 4–6 ms —— 一个零件吃掉半个帧预算，而且这笔开销**永远不会出现在 JS 计时里**
//   （所以假 ctx 测出来是 0.004ms，那是个陷阱）。离屏烘焙后：1 次不透明全屏 blit。
//
// ★ 关键设计决定 2：**所有横向分层都用多停靠点渐变，不用平涂矩形**（2026-11-18 T19 返工）
//   上一版用 `fillRect(0, h*0.48, w, h*0.20)` 这种平涂画雾带、`fillRect(0, h*0.62, …)` 画地表，
//   顶边是**硬边**：真浏览器截图里 y≈280 与 y≈370 各有一条横线穿过整幅画面。
//   那不是风格问题，是 bug。现在每层都是一条纵向多停靠点渐变（两端 alpha=0），没有可被看出的边。
//
// ★ 关键设计决定 3：**草的深度由地平线推出来，并由前景山脊裁切**
//   上一版按 `i % DEPTHS` 随机撒草 → 草长在远山轮廓之上（截图里山尖上插着草），而且全宽均匀、
//   等长、笔直，像撒了一地稻草。现在：先算每根草的落地点 y，再由 y 反推层深；
//   整坡草被**最近那层山脊的路径 clip** 住，所以一根草也不会出现在山脊线以上。
//
// 视差：三层丘陵各自按 pointer.x 平移（层深越大位移越大）。
//
// 帧预算纪律：draw 里零 new、零字符串拼接、零 createGradient、零数组字面量（颜色表全部在模块级）。
import type { PartEnv, PartInstance, PartV2, StageSize, WorldFrame } from '../../stage/contract';
import { mulberry32 } from '../../stage/world';

/** 草叶数量：high 档。 */
const BLADES_HIGH = 560;

/** 草叶数量：low 档。 */
const BLADES_LOW = 170;

/** 丘陵层数。 */
const HILL_LAYERS = 3;

/** 每层丘陵的控制点数（越大轮廓越细，路径构造也越贵）。 */
const HILL_POINTS = 34;

/** 草叶深度的三档（0 最远，2 最近）。 */
const DEPTHS = 3;

/** 一簇草的基准株数（决定「聚簇」的观感，不是装饰性常数：它直接控制疏密对比）。 */
const CLUSTER_SPREAD = 0.055;

// ★ 黄昏暖金：**画面最大面积必须是暖的**。
//   T19 返工时我把天空压成了深蓝（`#20283b`），而天空占画面面积最大 →
//   整幅的色相中位数是 **225°（冷蓝）**，与"黄昏草甸"相反，而当时所有结构断言全绿
//   （色相不影响任何计数）。现在整条天空改成暗紫红 → 玫瑰 → 琥珀 → 金的连续过渡，
//   目标色相中位 35–55°（由 `tests/site-fingerprint.mjs` 把关）。
const SKY_TOP = '#54402e';
const SKY_MID = '#a37a3c';
const SKY_GLOW = '#d4a03e';
const SKY_HORIZON = '#f7d472';

/** 地表色：从地平线的暖灰过渡到近处的深墨绿。 */
// 地表：暖褐 → 深墨，不能偏蓝（否则下半幅会把中位色相拽回冷区）
const GROUND_TOP = 'rgba(146,110,70,0)';
const GROUND_MID = 'rgba(88,60,38,0.55)';
const GROUND_BOTTOM = 'rgba(26,18,12,0.86)';

/** 雾带（两端 alpha=0，所以没有可见的上/下边界）。 */
const HAZE_COLOR = '242,178,120';

/** 三层丘陵 + 大气透视：越远越浅越蓝（等同「把颜色向雾色混过去」，比加一层雾更便宜）。 */
interface HillStyle {
  /** 每层的地平线基准（占屏高比例） */
  readonly base: number;
  /** 起伏幅度（占屏高比例） */
  readonly amp: number;
  readonly fill: string;
  /** 山脊线上的一道细亮边：把「空气在中间」这件事画出来，比整体加雾便宜 */
  readonly rim: string;
  readonly rimWidth: number;
  /** 视差位移系数 */
  readonly drift: number;
}

const HILL_STYLES: readonly HillStyle[] = [
  {
    base: 0.565, amp: 0.105,
    fill: 'rgba(180,146,78,0.92)',
    rim: 'rgba(255,214,170,0.22)', rimWidth: 1.0, drift: 0.010,
  },
  {
    base: 0.620, amp: 0.090,
    fill: 'rgba(120,86,46,0.96)',
    rim: 'rgba(238,186,142,0.16)', rimWidth: 1.1, drift: 0.024,
  },
  {
    base: 0.688, amp: 0.072,
    fill: 'rgba(78,52,28,1)',
    rim: 'rgba(200,150,120,0.10)', rimWidth: 1.2, drift: 0.040,
  },
];

/** 三档草的描边色（远：薄而灰；近：厚而亮）。 */
// ★ 色相分离（产品口径）：草体往**青绿**偏 8–15°，地面保持暖橙。
//   原来三档草与地面**同色相**（实测都是 38.8°），草只靠明度撑形 ——
//   天一转暖，明度又被压向同一头，草就并进地里。**加深明度会更糟**（变成深色栅栏），
//   正确解是让两块**不同色相**，而不是拉大对比。
const GRASS_STROKE: readonly string[] = [
  'rgba(146,170,128,0.44)',
  'rgba(182,196,126,0.68)',
  'rgba(222,212,132,0.93)',
];

/** 三档草的线宽。 */
const GRASS_WIDTH: readonly number[] = [0.8, 1.15, 1.7];

/** 草尖的穗（只给最近一档，一格 fill 画完所有穗）。 */
const GRASS_TIP = 'rgba(240,222,160,0.55)';

/** 一根草叶的静态几何。 */
interface Blade {
  readonly x: number;
  readonly baseY: number;
  readonly h: number;
  readonly phase: number;
  readonly depth: number;
  /** 根部横移（草不是垂直线，天然带一点倾角） */
  readonly lean: number;
  /** 中段控制点偏移：决定弯曲方向与幅度 */
  readonly curve: number;
  readonly sway: number;
}

/** 可挂 2D 上下文的最小平面的结构类型（主画布与离屏共用）。 */
interface Canvas2DLike {
  width: number;
  height: number;
  getContext(id: '2d'): CanvasRenderingContext2D | null;
}

/**
 * 生成一根草叶。
 *
 * 长度用 `rnd()^1.7` 取偏态分布：绝大多数是矮草，少数几根高的 —— 均匀分布会像「撒稻草」。
 *
 * @param rnd 确定性随机源
 * @param x 落点 x
 * @param baseY 落点 y（已由地平线与山脊决定）
 * @param h 画布高
 * @param depth 层深 0..2
 * @returns 草叶
 */
function makeBlade(rnd: () => number, x: number, baseY: number, h: number, depth: number): Blade {
  const thick = 0.42 + depth * 0.29;
  const skew = Math.pow(rnd(), 1.7);
  const height = h * (0.022 + thick * 0.052) * (0.55 + skew * 1.15);
  return {
    x,
    baseY,
    h: height,
    phase: rnd() * Math.PI * 2,
    depth,
    lean: (rnd() - 0.5) * h * 0.012,
    curve: (rnd() - 0.5) * height * 0.62,
    sway: (0.45 + rnd() * 0.85) * (0.35 + depth * 0.55),
  };
}

/**
 * 取一个能创建离屏 canvas 的工厂。拿不到就返回 null（降级为直接绘制）。
 *
 * @param canvas 主画布
 * @returns 工厂或 null
 */
function offscreenFactory(canvas: Canvas2DLike): (() => Canvas2DLike | null) | null {
  const doc = (canvas as unknown as {
    ownerDocument?: { createElement(tag: string): Canvas2DLike };
  }).ownerDocument ?? (globalThis as unknown as {
    document?: { createElement(tag: string): Canvas2DLike };
  }).document;
  if (!doc || typeof doc.createElement !== 'function') return null;
  return () => {
    try {
      const el = doc.createElement('canvas');
      return typeof el.getContext === 'function' ? el : null;
    } catch {
      return null;
    }
  };
}

/**
 * 丘陵路径的横向外扩量（占屏宽比例）。
 *
 * 必须 ≥ 最大视差位移（0.04w），否则平移时会在画布边上露出空隙；
 * 同时它也是「山体必须画到画布两侧之外」的余量 —— 上一版路径右端少走了一个 stepX，
 * 于是在 x≈0.82w 处留下一条**竖直硬边**（截图里右侧那条直上直下的界线）。
 */
const RIDGE_BLEED = 0.06;

/**
 * 采样某一层山脊在归一化 x 处的 y（线性插值，与绘制用的路径同源）。
 *
 * `u` 的定义域是**外扩后的跨度**（-BLEED..1+BLEED），不是 0..1 —— 这样草落地点的推算
 * 与画出来的轮廓用的是同一套坐标，不会出现「草比山脊高半格」。
 *
 * @param row 该层控制点（归一化 y）
 * @param u 归一化 x（含外扩）
 * @returns 归一化 y
 */
function ridgeAt(row: readonly number[], u: number): number {
  const clamped = u < 0 ? 0 : u > 1 ? 1 : u;
  const pos = clamped * HILL_POINTS;
  const index = Math.min(HILL_POINTS - 1, Math.floor(pos));
  const frac = pos - index;
  const a = row[index];
  const b = row[index + 1];
  return a + (b - a) * frac;
}

export function create(env: PartEnv): PartInstance {
  // 拆两步：TS 在嵌套函数里不保留 null 收窄
  const maybeCtx = env.ctx;
  if (!maybeCtx) throw new Error('field-ground 需要 canvas2d 上下文（channel 必须为 canvas2d）');
  const ctx: CanvasRenderingContext2D = maybeCtx;

  const makeCanvas = offscreenFactory(env.canvas as unknown as Canvas2DLike);

  let w = env.width > 0 ? env.width : 1;
  let h = env.height > 0 ? env.height : 1;
  let dpr = env.dpr > 0 ? env.dpr : 1;
  let blades: readonly Blade[] = [];
  let hills: number[][] = [];
  /** 静态底图（天光 + 日晕 + 雾带 + 地表 + 暗角） */
  let bg: Canvas2DLike | null = null;
  let lod: 'low' | 'high' = env.lod;
  let disposed = false;

  /**
   * 把静态底图烘到离屏。
   *
   * 每一笔的边界都必须「软」：用 3~4 个停靠点、两端 alpha=0 的渐变，绝不平涂。
   *
   * @param c 离屏画布
   */
  function bakeBackground(c: Canvas2DLike): void {
    const g = c.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    const sky = g.createLinearGradient(0, 0, 0, h * 0.86);
    sky.addColorStop(0, SKY_TOP);
    sky.addColorStop(0.42, SKY_MID);
    sky.addColorStop(0.78, SKY_GLOW);
    sky.addColorStop(1, SKY_HORIZON);
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);

    // 日晕：偏右上的暖光，替代「一条亮带」。radial 比 linear 更像光在空气里。
    const sun = g.createRadialGradient(w * 0.70, h * 0.60, 0, w * 0.70, h * 0.60, Math.max(w, h) * 0.62);
    sun.addColorStop(0, 'rgba(255,206,150,0.30)');
    sun.addColorStop(0.45, 'rgba(240,176,132,0.13)');
    sun.addColorStop(1, 'rgba(240,176,132,0)');
    g.fillStyle = sun;
    g.fillRect(0, 0, w, h);

    // 雾带：**4 个停靠点、两端透明** —— 这一条就是「没有硬边接缝」的全部内容。
    const haze = g.createLinearGradient(0, h * 0.30, 0, h * 0.90);
    haze.addColorStop(0, `rgba(${HAZE_COLOR},0)`);
    haze.addColorStop(0.28, `rgba(${HAZE_COLOR},0.26)`);
    haze.addColorStop(0.62, `rgba(${HAZE_COLOR},0.11)`);
    haze.addColorStop(1, `rgba(${HAZE_COLOR},0)`);
    g.fillStyle = haze;
    g.fillRect(0, h * 0.30, w, h * 0.60);

    // 地表：从地平线附近透明 → 近处深沉，同样是渐变不是平涂矩形。
    const ground = g.createLinearGradient(0, h * 0.46, 0, h);
    ground.addColorStop(0, GROUND_TOP);
    ground.addColorStop(0.42, GROUND_MID);
    ground.addColorStop(1, GROUND_BOTTOM);
    g.fillStyle = ground;
    g.fillRect(0, h * 0.46, w, h * 0.54);

    // 地表纹理：约 110 道极淡的横向短笔触（像远处的田垄/草茬方向）。
    // 烘在离屏里 → 帧内零成本；alpha 上限 0.08，只在近处略强，不会变成「脏」。
    const tex = mulberry32(env.seed ^ 0x2545f491);
    g.lineCap = 'butt';
    for (let i = 0; i < 110; i += 1) {
      const band = 0.58 + tex() * 0.40;
      const y = h * band;
      const len = w * (0.03 + tex() * 0.15);
      const x = tex() * w - len * 0.5;
      const depth = Math.min(1, Math.max(0, (band - 0.58) / 0.40));
      g.strokeStyle = `rgba(126,136,124,${(0.028 + depth * 0.052).toFixed(3)})`;
      g.lineWidth = 0.7 + depth * 1.7;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + len, y + (tex() - 0.5) * h * 0.004);
      g.stroke();
    }

    const vig = g.createRadialGradient(w * 0.5, h * 0.46, Math.min(w, h) * 0.30, w * 0.5, h * 0.46, Math.max(w, h) * 0.80);
    vig.addColorStop(0, 'rgba(6,8,14,0)');
    vig.addColorStop(1, 'rgba(6,8,14,0.52)');
    g.fillStyle = vig;
    g.fillRect(0, 0, w, h);
  }

  /**
   * 按当前尺寸重建全部静态资源。只在构造、resize、切 LOD 时调用。
   *
   * @param size 新尺寸
   */
  function rebuild(size: StageSize): void {
    w = size.w > 0 ? size.w : 1;
    h = size.h > 0 ? size.h : 1;
    dpr = size.dpr > 0 ? size.dpr : 1;

    const rnd = mulberry32(env.seed ^ 0x9e3779b9);

    // 丘陵：每层单独的一组控制点；层深越远，起伏越平缓
    const nextHills: number[][] = [];
    for (let layer = 0; layer < HILL_LAYERS; layer += 1) {
      const style = HILL_STYLES[layer];
      const phase = rnd() * Math.PI * 2;
      const phase2 = rnd() * Math.PI * 2;
      const row: number[] = [];
      for (let i = 0; i <= HILL_POINTS; i += 1) {
        const u = i / HILL_POINTS;
        const wave =
          Math.sin(u * Math.PI * 2.1 + phase) * style.amp +
          Math.sin(u * Math.PI * 5.7 + phase2) * style.amp * 0.30 +
          Math.sin(u * Math.PI * 11.3 + phase * 0.5) * style.amp * 0.08;
        row.push(style.base - wave);
      }
      nextHills.push(row);
    }
    hills = nextHills;

    // 草：先决定落点，再由落点反推层深（高处的草一定更远、更矮、更淡）
    const count = lod === 'low' ? BLADES_LOW : BLADES_HIGH;
    const nearest = nextHills[HILL_LAYERS - 1];
    const ridgeBottom = h * 0.965;
    const clusterCount = Math.max(8, Math.round(count / 13));
    const next: Blade[] = [];
    const perCluster = Math.ceil(count / clusterCount);

    for (let c = 0; c < clusterCount; c += 1) {
      // 簇心：横向全宽，纵向落在「山脊线以下」的可用高度里
      const toU = 1 / (w * (1 + RIDGE_BLEED * 2));
      const cx = rnd() * w;
      const ridge = ridgeAt(nearest, (cx + w * RIDGE_BLEED) * toU) * h;
      const cy = ridge + (ridgeBottom - ridge) * (0.06 + Math.pow(rnd(), 0.75) * 0.94);
      const spread = w * CLUSTER_SPREAD * (0.5 + rnd());

      for (let i = 0; i < perCluster && next.length < count; i += 1) {
        // 簇内用两次均匀相加近似正态，避免簇心过空
        const dx = (rnd() + rnd() - 1) * spread;
        const dy = (rnd() + rnd() - 1) * spread * 0.22;
        const x = Math.min(w - 1, Math.max(0, cx + dx));
        // 关键：落地点不得高于该 x 处的最近山脊（草不会长在山脊线上）
        const localRidge = ridgeAt(nearest, (x + w * RIDGE_BLEED) * toU) * h;
        const baseY = Math.min(ridgeBottom, Math.max(localRidge + 1, cy + dy));
        // 层深由纵向位置推出来：越靠下越近
        const span = Math.max(1, ridgeBottom - localRidge);
        const t = (baseY - localRidge) / span;
        const depth = Math.min(DEPTHS - 1, Math.max(0, Math.round(t * (DEPTHS - 1))));
        next.push(makeBlade(rnd, x, baseY, h, depth));
      }
    }
    blades = next;

    if (makeCanvas) {
      if (!bg) bg = makeCanvas();
      if (bg) {
        bg.width = Math.max(1, Math.round(w * dpr));
        bg.height = Math.max(1, Math.round(h * dpr));
        bakeBackground(bg);
      }
    }
  }

  /**
   * 某一层丘陵的路径（填充与裁切共用同一组点，避免「用来裁的轮廓」与「画出来的轮廓」不一致）。
   *
   * @param layer 层号
   * @param shift 该层的视差位移
   * @param close 是否闭合成可填充/可裁切的区域
   */
  function traceRidge(layer: number, shift: number, close: boolean): void {
    const row = hills[layer];
    const bleed = w * RIDGE_BLEED;
    const span = w + bleed * 2;
    const stepX = span / HILL_POINTS;
    const originX = -bleed + shift;
    ctx.beginPath();
    ctx.moveTo(originX, row[0] * h);
    for (let i = 1; i <= HILL_POINTS; i += 1) {
      const y = row[i] * h;
      ctx.quadraticCurveTo(originX + (i - 0.5) * stepX, y, originX + i * stepX, y);
    }
    if (close) {
      // 两侧都画到画布之外：右端 x = w + bleed + shift，左端 x = -bleed + shift
      ctx.lineTo(originX + span, h);
      ctx.lineTo(originX, h);
      ctx.closePath();
    }
  }

  /**
   * 三层丘陵：实色填充 + 山脊一道细亮边。
   *
   * 为什么不烘成离屏：山体是**实色**多边形，直接 fill 只要 0.3 ms/Mpx 且无纹理采样；
   * 烘成离屏再带 alpha blit 反而更贵（要读纹理 + 混合），还要多三块后备存储。渐变才值得烘。
   *
   * @param frame 世界帧
   */
  function drawHills(frame: WorldFrame): void {
    const px = frame.pointer.x - 0.5;
    // 逐层「填充 → 描山脊亮边」交替，**不能**先填完三层再统一描边：
    // 那样远处山脊的亮边会被画在近处山体之上，表现为山体中间凭空一条细线（上一版就是这样）。
    // 交替之后，近处山体的填充会自然遮掉远处亮边被挡住的那部分 —— 遮挡关系由绘制顺序表达，不需要额外遮罩。
    for (let layer = 0; layer < HILL_LAYERS; layer += 1) {
      const style = HILL_STYLES[layer];
      const shift = -px * w * style.drift;
      traceRidge(layer, shift, true);
      ctx.fillStyle = style.fill;
      ctx.fill();
      traceRidge(layer, shift, false);
      ctx.strokeStyle = style.rim;
      ctx.lineWidth = style.rimWidth;
      ctx.stroke();
    }
  }

  /**
   * 画草。按层深分三次描边，避免 560 次样式切换。
   *
   * 调用方已经用最近那层山脊 clip 过，所以这里的 tip 不会越过山脊线。
   *
   * @param frame 世界帧
   */
  function drawGrass(frame: WorldFrame): void {
    const px = frame.pointer.x - 0.5;
    const audioLift = frame.audio ? frame.audio.level * 1.8 : 0;
    const wind = 0.5 + px * 1.5 + Math.sin(frame.t * 0.31) * 0.26 + audioLift;
    const motion = frame.reducedMotion ? 0.22 : 1;

    ctx.lineCap = 'round';
    for (let depth = 0; depth < DEPTHS; depth += 1) {
      ctx.beginPath();
      for (let i = 0; i < blades.length; i += 1) {
        const blade = blades[i];
        if (blade.depth !== depth) continue;
        const swing = Math.sin(frame.t * (0.85 + depth * 0.22) + blade.phase) * blade.sway * motion;
        const tipX = blade.x + blade.lean + (wind * blade.sway * 2.4 + swing) * motion;
        const tipY = blade.baseY - blade.h;
        ctx.moveTo(blade.x, blade.baseY);
        // 控制点用 curve（每根草自己的弯曲）而非固定的 0.35 插值 —— 否则所有草同一个弧度
        ctx.quadraticCurveTo(blade.x + blade.curve * motion, blade.baseY - blade.h * 0.58, tipX, tipY);
      }
      ctx.strokeStyle = GRASS_STROKE[depth];
      ctx.lineWidth = GRASS_WIDTH[depth];
      ctx.stroke();
    }

    // 最近一档的穗：一格 fill 画完全部，给前景一点「有东西在风里」的细节
    ctx.fillStyle = GRASS_TIP;
    ctx.beginPath();
    for (let i = 0; i < blades.length; i += 1) {
      const blade = blades[i];
      if (blade.depth !== DEPTHS - 1) continue;
      const swing = Math.sin(frame.t * 1.07 + blade.phase) * blade.sway * motion;
      const tipX = blade.x + blade.lean + (wind * blade.sway * 2.4 + swing) * motion;
      const tipY = blade.baseY - blade.h;
      ctx.moveTo(tipX, tipY);
      ctx.arc(tipX, tipY, 1.1, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  rebuild({ w, h, dpr });

  return {
    update(): void {
      // 无内部状态：风与视差都是 frame 的纯函数。
    },

    draw(frame: WorldFrame): void {
      if (disposed) return;

      if (bg) {
        // 底图不透明，直接覆盖，无需 clearRect
        ctx.drawImage(bg as unknown as CanvasImageSource, 0, 0, w, h);
      } else {
        // 没有离屏能力时至少把天光铺上，别白屏
        const sky = ctx.createLinearGradient(0, 0, 0, h * 0.86);
        sky.addColorStop(0, SKY_TOP);
        sky.addColorStop(0.42, SKY_MID);
        sky.addColorStop(0.78, SKY_GLOW);
        sky.addColorStop(1, SKY_HORIZON);
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, w, h);
      }

      drawHills(frame);

      // 草被「最近那层山脊」裁切：任何一根草叶都不可能出现在山脊线以上。
      ctx.save();
      traceRidge(HILL_LAYERS - 1, -(frame.pointer.x - 0.5) * w * HILL_STYLES[HILL_LAYERS - 1].drift, true);
      ctx.clip();
      drawGrass(frame);
      ctx.restore();
    },

    resize(size: StageSize): void {
      rebuild(size);
    },

    setLod(next: 'low' | 'high'): void {
      if (next === lod) return;
      lod = next;
      rebuild({ w, h, dpr });
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      blades = [];
      hills = [];
      // 尺寸清零让浏览器回收后备存储（比丢引用更确定）
      if (bg) {
        bg.width = 0;
        bg.height = 0;
      }
      bg = null;
    },
  };
}

/**
 * 零件定义。
 *
 * `costMs` 语义（**不是浏览器实测，别当实测用**）：
 *   它是「每帧预算权重」——估算的**主画布填充成本**，不是 JS 耗时。
 *   本件在 1280×720@dpr2 = 3.69 Mpx 下：1 次不透明全屏 blit（0.35 ms/Mpx）
 *   + 3 次实色山体填充（各约 50% 屏高，0.30 ms/Mpx）
 *   + 3 道山脊亮边描边（共 102 个曲线段，0.8 ms/千段）
 *   + 560 段草叶描边 + 1 次草穗点填充
 *   估约 3.5 ms。真实浏览器数值等 `tests/bench-gl-composite.mjs` 那套量法落地后替换。
 */
export const part: PartV2 = {
  id: 'field-ground',
  layer: 'L0',
  blend: 'source-over',
  costMs: 3.5,
  kb: 7,
  z: 0,
  channel: 'canvas2d',
  expendable: false,
  create,
};

export default part;
