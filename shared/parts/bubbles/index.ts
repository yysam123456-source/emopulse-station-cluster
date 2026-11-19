// bubbles —— L2 生态：上浮的气泡群。
//
// ★ 介质前提（§2.5b 的规矩：新零件第一段必须回答"在什么底上、用什么混合、为什么"）：
//   底是**深水**（L0 水色 / L1 体素海），所以气泡是"发光的薄壳"而不是"有影的实体"：
//   · `blend: 'screen'` —— 气泡只加光不减光，叠在深色水上才会亮起来（用 source-over 会变成脏灰点）
//   · 高光用**第二个更小的实心圆**，不是径向渐变 —— 渐变在高光这种小尺度上只会糊成一团，
//     而两个实心圆的边界本身就是"壳"和"反光"的分界
//
// 口径来自 `src/components/showcases/AbyssalDescent.tsx` 的第二个 effect（54 行）：
//   70 个 · `r = (0.6 + rand*2.2) * dpr` · `speed = 0.0004 + rand*0.0012` · `sway = 0.3 + rand*0.9`
//   高光：`(x - 0.3r, y - 0.3r)`，半径 `0.35r`，`rgba(220,245,255,0.5)`
//
// 帧预算纪律：`draw` 里零 new、零闭包、零数组字面量、零字符串拼接、零 Math.random、零自持时钟。
//   两个 fillStyle 覆盖全部气泡（本体一轮、高光一轮），不做逐泡样式切换。
import type { PartEnv, PartInstance, PartV2, StageSize, WorldFrame } from '../../stage/contract';
import { mulberry32 } from '../../stage/world';

/** 气泡数：high 档（原文 70）。 */
const COUNT_HIGH = 70;

/** 气泡数：low 档（真减量，不是"画小一点"）。 */
const COUNT_LOW = 24;

/** 本体色：极淡的冷蓝，配 `screen` 才像"壳"。 */
const BODY = 'rgba(150,205,230,0.13)';

/** 高光色（原文 `rgba(220,245,255,0.5)`）。 */
const HIGHLIGHT = 'rgba(220,245,255,0.5)';

/** 高光相对半径/位置（原文 0.35r 与 -0.3r）。 */
const HL_RATIO = 0.35;
const HL_OFFSET = 0.3;

/** 一个气泡的静态参数 + 动态位置（结构固定，帧内只改 y）。 */
interface Bubble {
  /** 归一化 x（0..1，乘画布宽） */
  readonly x: number;
  /** 归一化 y（0..1，向上减） */
  y: number;
  /** 半径（CSS px，已含 dpr 系数，见 rBase） */
  readonly r: number;
  /** 每秒上升的归一化距离（原文是"每帧"，这里换算成每秒：×60） */
  readonly speed: number;
  /** 横向摆幅（归一化） */
  readonly sway: number;
  /** 摆动相位 */
  readonly phase: number;
}

/** 可挂 2D 上下文的最小平面的结构类型。 */
interface Canvas2DLike {
  width: number;
  height: number;
  getContext(id: '2d'): CanvasRenderingContext2D | null;
}

/**
 * 建零件实例。
 *
 * @param env 零件环境
 * @returns 实例
 */
export function create(env: PartEnv): PartInstance {
  const maybeCtx = env.ctx;
  if (!maybeCtx) throw new Error('bubbles 需要 canvas2d 上下文（channel 必须为 canvas2d）');
  const ctx: CanvasRenderingContext2D = maybeCtx;

  let w = env.width > 0 ? env.width : 1;
  let h = env.height > 0 ? env.height : 1;
  let dpr = env.dpr > 0 ? env.dpr : 1;
  let lod: 'low' | 'high' = env.lod;
  let disposed = false;

  /** 全部气泡（按 high 档一次建好；low 档只画前 COUNT_LOW 个，不重建数组） */
  let bubbles: Bubble[] = [];

  /** 按种子建气泡。位置全在 [0,1)，同 seed 同分布。 */
  function setup(): void {
    const rnd = mulberry32(env.seed ^ 0x4b1d5a3f);
    const next: Bubble[] = [];
    for (let i = 0; i < COUNT_HIGH; i += 1) {
      next.push({
        x: rnd(),
        y: rnd(),
        // 原文 `(0.6 + rand*2.2) * dpr`：dpr 越大物理半径越大，但视觉尺寸不变（设备像素）
        r: (0.6 + rnd() * 2.2) * dpr,
        // 原文是**每帧**位移，且以归一化坐标计：这里换算成每秒（×60），
        // 因为契约里的时间单位是 frame.t（秒）。不换算会慢 60 倍（气泡几乎不动）。
        speed: (0.0004 + rnd() * 0.0012) * 60,
        sway: 0.3 + rnd() * 0.9,
        phase: rnd() * Math.PI * 2,
      });
    }
    bubbles = next;
  }

  setup();

  return {
    update(frame: WorldFrame): void {
      if (disposed) return;
      const motion = frame.reducedMotion ? 0.3 : 1;
      const count = lod === 'low' ? COUNT_LOW : COUNT_HIGH;
      for (let i = 0; i < count; i += 1) {
        const b = bubbles[i];
        b.y -= b.speed * motion * frame.dt;
        // 出顶后从底部回来（同一个气泡对象，不新建，保证零分配）
        if (b.y < -0.05) b.y += 1.05;
      }
    },

    draw(frame: WorldFrame): void {
      if (disposed) return;
      const count = lod === 'low' ? COUNT_LOW : COUNT_HIGH;
      const t = frame.t;
      const motion = frame.reducedMotion ? 0.3 : 1;

      // ① 本体：一个 fillStyle 覆盖全部气泡（不做逐泡样式切换）
      ctx.fillStyle = BODY;
      ctx.beginPath();
      for (let i = 0; i < count; i += 1) {
        const b = bubbles[i];
        const x = (b.x + Math.sin(t * 0.7 + b.phase) * b.sway * 0.012 * motion) * w;
        const y = b.y * h;
        ctx.moveTo(x + b.r, y); // 避免 arc 之间连线
        ctx.arc(x, y, b.r, 0, Math.PI * 2);
      }
      ctx.fill();

      // ② 高光：第二个更小的实心圆（**不是渐变**）
      ctx.fillStyle = HIGHLIGHT;
      ctx.beginPath();
      for (let i = 0; i < count; i += 1) {
        const b = bubbles[i];
        const x = (b.x + Math.sin(t * 0.7 + b.phase) * b.sway * 0.012 * motion) * w;
        const y = b.y * h;
        const hr = b.r * HL_RATIO;
        ctx.moveTo(x - b.r * HL_OFFSET + hr, y - b.r * HL_OFFSET);
        ctx.arc(x - b.r * HL_OFFSET, y - b.r * HL_OFFSET, hr, 0, Math.PI * 2);
      }
      ctx.fill();
    },

    resize(size: StageSize): void {
      w = size.w > 0 ? size.w : 1;
      h = size.h > 0 ? size.h : 1;
      dpr = size.dpr > 0 ? size.dpr : 1;
      // 半径含 dpr，尺寸变了要按新 dpr 重建（气泡位置保留会更好，但重建更简单且同 seed 稳定）
      setup();
    },

    setLod(next: 'low' | 'high'): void {
      if (next === lod) return;
      lod = next;
      // 只改绘制数量：不重建数组，也不改位置 —— 降档不该让画面"跳一下"
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      bubbles = [];
    },
  };
}

/**
 * 零件定义。
 *
 * `costMs = 0.27`，**真浏览器实测**（`tests/bench-blend.mjs`，Metal，1280×720@dpr2）：
 *   · 70 个气泡 × 2 圆的填充：`screen` 0.156 ms/帧，`source-over` 0.104 ms/帧
 *     → **`screen` 本身的代价 0.052 ms/帧**（这就是原来标为"最不可靠"的那一项，现在是量出来的）
 *   · 加上 140 段路径构造（0.8 ms/千段 ≈ 0.11 ms）= 0.27 ms
 *
 * 方法：把同一组气泡画 50 遍放大信号，再除以 50 —— 因为直接测时效应（0.05–0.25ms）
 * **小于本机噪声**（强制同步法的同步税 ~8ms，抖动 ±1ms，第一次试甚至量出 −1.00ms 的负差值）。
 * 线性外推是**上界**假设（GPU 饱和区更慢）；本机不可外推到低端集显/移动端。
 */
export const part: PartV2 = {
  id: 'bubbles',
  layer: 'L2',
  blend: 'screen',
  costMs: 0.27,
  kb: 2,
  z: 0,
  channel: 'canvas2d',
  // 装饰性生态：超预算时整件不画，画面仍然成立
  expendable: true,
  create,
  // 环境交互：不是能力依赖，留空即可（气泡不读 mic/pointer，只读 frame）
};

export default part;
