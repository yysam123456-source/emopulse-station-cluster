// field-ground —— `field`（野）biome 的 L0 底材：黄昏草甸。
//
// 为什么 L0 必须单独成件：装配模型里 L0 是唯一「被所有人压在下面」的一层。
// 它一旦包含自走实体或输入响应，就会和 L2/L3 抢视觉与帧预算；
// 而它承担了整站 70% 的情绪基调（天光、地平线、地表色）。所以它只做三件事：铺天光、立三层远山、长一坡草。
//
// ★ 关键设计决定：**能烘到离屏的就绝不在主画布重算**
//   天光渐变 + 雾带 + 地表暗部 + 暗角 四件全是静态（只随尺寸变）。
//   若每帧现算：全屏 linear-gradient + 部分屏 linear + 全屏 radial，
//   在 1280×720@dpr2（3.69 Mpx）上光渐变求值就要 4–6 ms —— 一个零件吃掉半个帧预算，
//   而且这笔开销**永远不会出现在 JS 计时里**（所以假 ctx 测出来是 0.004ms，那是个陷阱）。
//   离屏烘焙后：1 次不透明全屏 blit + 3 次带 alpha 山体 blit + 1 次草叶描边。
//
// 视差：三层丘陵各烘一张「比屏幕宽 2×margin」的离屏图，每帧按 pointer.x 平移 blit。
//
// 帧预算纪律：draw 里零 new、零字符串拼接、零 createGradient。
import type { PartEnv, PartInstance, PartV2, StageSize, WorldFrame } from '../../stage/contract';
import { mulberry32 } from '../../stage/world';

/** 草叶数量：high 档。 */
const BLADES_HIGH = 520;

/** 草叶数量：low 档。 */
const BLADES_LOW = 160;

/** 丘陵层数。 */
const HILL_LAYERS = 3;

/** 每层丘陵的控制点数。 */
const HILL_POINTS = 34;

/** 草叶深度的三档（0 最远，2 最近）。 */
const DEPTHS = 3;

const SKY_TOP = '#2f3c52';
const SKY_MID = '#6d6f86';
const SKY_HORIZON = '#d99a6c';
const HAZE = 'rgba(232,178,132,0.30)';
const HILL_FAR = '#4d5773';
const HILL_MID = '#3a4459';
const HILL_NEAR = '#242c3d';
const GROUND_DARK = 'rgba(14,18,28,0.55)';
const VIGNETTE = 'rgba(6,8,14,0.55)';
const GRASS_BODY: readonly string[] = [
  'rgba(146,160,124,0.55)',
  'rgba(176,182,126,0.72)',
  'rgba(214,196,132,0.92)',
];

/** 一根草叶的静态几何。 */
interface Blade {
  readonly x: number;
  readonly baseY: number;
  readonly h: number;
  readonly phase: number;
  readonly depth: number;
  readonly lean: number;
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
 * @param rnd 确定性随机源
 * @param width 画布宽
 * @param height 画布高
 * @param depth 层深
 * @returns 草叶
 */
function makeBlade(rnd: () => number, width: number, height: number, depth: number): Blade {
  const yBias = depth / (DEPTHS - 1);
  return {
    x: rnd() * width,
    baseY: height * (0.62 + yBias * 0.34) + (rnd() - 0.5) * height * 0.06,
    h: height * (0.035 + yBias * 0.075 + rnd() * 0.03),
    phase: rnd() * Math.PI * 2,
    depth,
    lean: (rnd() - 0.5) * height * 0.02,
    sway: (0.6 + rnd() * 0.8) * (0.5 + yBias * 1.2),
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
  /** 静态底图（天光+雾带+地表+暗角） */
  let bg: Canvas2DLike | null = null;
  let lod: 'low' | 'high' = env.lod;
  let disposed = false;

  /**
   * 把静态底图烘到离屏。
   *
   * @param c 离屏画布
   */
  function bakeBackground(c: Canvas2DLike): void {
    const g = c.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    const sky = g.createLinearGradient(0, 0, 0, h * 0.78);
    sky.addColorStop(0, SKY_TOP);
    sky.addColorStop(0.55, SKY_MID);
    sky.addColorStop(1, SKY_HORIZON);
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);

    const haze = g.createLinearGradient(0, 0, w, 0);
    haze.addColorStop(0, 'rgba(232,178,132,0.10)');
    haze.addColorStop(0.35, HAZE);
    haze.addColorStop(0.7, 'rgba(232,178,132,0.18)');
    haze.addColorStop(1, 'rgba(232,178,132,0.08)');
    g.fillStyle = haze;
    g.fillRect(0, h * 0.48, w, h * 0.20);

    g.fillStyle = GROUND_DARK;
    g.fillRect(0, h * 0.62, w, h * 0.38);

    const vig = g.createRadialGradient(w * 0.5, h * 0.48, Math.min(w, h) * 0.28, w * 0.5, h * 0.48, Math.max(w, h) * 0.78);
    vig.addColorStop(0, 'rgba(6,8,14,0)');
    vig.addColorStop(1, VIGNETTE);
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
    const nextHills: number[][] = [];
    for (let layer = 0; layer < HILL_LAYERS; layer += 1) {
      const amp = 0.085 * (1 - layer * 0.28);
      const base = 0.60 + layer * 0.045;
      const phase = rnd() * Math.PI * 2;
      const phase2 = rnd() * Math.PI * 2;
      const row: number[] = [];
      for (let i = 0; i <= HILL_POINTS; i += 1) {
        const u = i / HILL_POINTS;
        const wave =
          Math.sin(u * Math.PI * 2.4 + phase) * amp +
          Math.sin(u * Math.PI * 7.1 + phase2) * amp * 0.32;
        row.push(base - wave);
      }
      nextHills.push(row);
    }
    hills = nextHills;

    const count = lod === 'low' ? BLADES_LOW : BLADES_HIGH;
    const next: Blade[] = [];
    for (let i = 0; i < count; i += 1) next.push(makeBlade(rnd, w, h, i % DEPTHS));
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
   * 三层丘陵：直接实心填充，不走离屏。
   *
   * 为什么不烘：山体是**实色**多边形，直接 fill 只要 0.3 ms/Mpx 且无纹理采样；
   * 烘成离屏再带 alpha blit 反而更贵（要读纹理 + 混合），还要多三块后备存储。
   * 渐变才值得烘，实色不值得。
   *
   * @param frame 世界帧
   */
  function drawHills(frame: WorldFrame): void {
    const colors = [HILL_FAR, HILL_MID, HILL_NEAR];
    const px = frame.pointer.x - 0.5;
    for (let layer = 0; layer < HILL_LAYERS; layer += 1) {
      const shift = -px * w * (0.012 + layer * 0.022);
      const row = hills[layer];
      const stepX = w / HILL_POINTS;
      ctx.beginPath();
      ctx.moveTo(-stepX + shift, row[0] * h);
      for (let i = 1; i <= HILL_POINTS; i += 1) {
        const y = row[i] * h;
        ctx.quadraticCurveTo(-stepX + shift + (i - 0.5) * stepX, y, -stepX + shift + i * stepX, y);
      }
      ctx.lineTo(w + stepX + shift, h);
      ctx.lineTo(-stepX + shift, h);
      ctx.closePath();
      ctx.fillStyle = colors[layer];
      ctx.fill();
    }
  }

  /**
   * 画草叶。按层深分三次描边，避免 520 次样式切换。
   *
   * @param frame 世界帧
   */
  function drawGrass(frame: WorldFrame): void {
    const px = frame.pointer.x - 0.5;
    const audioLift = frame.audio ? frame.audio.level * 1.6 : 0;
    const wind = 0.55 + px * 1.4 + Math.sin(frame.t * 0.32) * 0.22 + audioLift;
    const motion = frame.reducedMotion ? 0.25 : 1;

    ctx.lineCap = 'round';
    for (let depth = 0; depth < DEPTHS; depth += 1) {
      ctx.beginPath();
      for (let i = 0; i < blades.length; i += 1) {
        const b = blades[i];
        if (b.depth !== depth) continue;
        const swing = Math.sin(frame.t * (0.9 + b.depth * 0.25) + b.phase) * b.sway * motion;
        const tipX = b.x + b.lean + (wind * b.sway * 2.2 + swing) * motion;
        const tipY = b.baseY - b.h;
        ctx.moveTo(b.x, b.baseY);
        ctx.quadraticCurveTo(b.x + (tipX - b.x) * 0.35, b.baseY - b.h * 0.55, tipX, tipY);
      }
      ctx.strokeStyle = GRASS_BODY[depth];
      ctx.lineWidth = 0.9 + depth * 0.7;
      ctx.stroke();
    }
  }

  rebuild({ w, h, dpr });

  return {
    update(): void {
      // 无内部状态需要积分：风与视差都是 frame 的纯函数。
    },

    draw(frame: WorldFrame): void {
      if (disposed) return;

      if (bg) {
        // 底图不透明，直接覆盖，无需 clearRect
        ctx.drawImage(bg as unknown as CanvasImageSource, 0, 0, w, h);
      } else {
        // 没有离屏能力时至少把天光铺上，别白屏
        const sky = ctx.createLinearGradient(0, 0, 0, h * 0.78);
        sky.addColorStop(0, SKY_TOP);
        sky.addColorStop(0.55, SKY_MID);
        sky.addColorStop(1, SKY_HORIZON);
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, w, h);
      }

      drawHills(frame);
      drawGrass(frame);
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
 *   本件在 1280×720@dpr2 = 3.69 Mpx 下：1 次不透明全屏 blit + 3 次实色山体填充（各 50% 屏高）
 *   + 520 段二次曲线描边。按典型 Chrome canvas2d 吞吐
 *   （不透明 blit ≈0.35 ms/Mpx、实色填充 ≈0.30 ms/Mpx、描边 ≈0.8 ms/千段）估约 3.4 ms。
 *   注意山体走**实色 fill** 而非离屏 blit：实色无纹理采样，比带 alpha 的 blit 便宜一半以上。
 *   真实浏览器数值尚未实测（Node 无 canvas 实现），落到站上时用 performance.now() 采样替换。
 */
export const part: PartV2 = {
  id: 'field-ground',
  layer: 'L0',
  blend: 'source-over',
  costMs: 3.4,
  kb: 7,
  z: 0,
  channel: 'canvas2d',
  expendable: false,
  create,
};

export default part;
