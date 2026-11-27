// tide-medium —— `tide`（潮）biome 的 L0 底材**骨架版**：屏幕空间介质（色阶 / 焦散 / 雾 / 微粒）。
//
// ★ 这是一次**并排三版**的探针，不是正式零件（2026-11-18 主理人裁定）：
//   三版的差异轴**只有一条**（色阶 + 焦散的形态），其余全同 —— 同时变四个变量，没人分得清是哪个起作用。
//   | 版 | 色阶 | 焦散 | 雾 |
//   | A | 深蓝压暗（沉） | 斑（圆形亮块） | 上浓下淡 |
//   | B | 青绿提亮（透） | 丝（拉长的高光条） | 均匀 |
//   | C | 近灰（去饱和） | **无**（只留雾与微粒） | 四周浓、中心清 |
//   C 的存在意义是**减法对照**：如果看完 A/B 觉得"都不如 C 干净"，那说明这站 L0 本来就不该有焦散 ——
//   这个结论只有把 C 摆出来才拿得到。
//
// ★ 边界：本件**只做屏幕空间介质**。水体体量 / 海床 / 光柱 / 鱼群 是 L1（voxel-world）的事，
//   一件都不碰。与 L1 同装时本件被不透明水体遮住是**设计**（0 像素），不是缺陷。
//
// ★★ 由此推出一条零件层面的规矩（2026-11-18 定）：**L0 不该试图模拟 L1 做的事。**
//   有 WebGPU 时 L1 把 L0 整块遮住 → L0 只在**没有** WebGPU 的那一档可见，而那一档**没有海床**。
//   所以「做一张 Worley 焦散网」= 在有海的档看不见、在没海的档画一个没有海床可接的光网 ——
//   不是更真，是**在错误的档里模拟一个不存在的对象**。
//   `glow`（圆斑/光丝）属于屏幕空间光氛围，是 L0 的正确形态；要焦散网请去 L1。
//
// ★ 没有 bench、没有断言：它的用途是"给人看一眼"。配了门就等于宣布它是正式零件了。
//
// 帧预算纪律：draw 里零 new、零 createGradient、零 Math.random、零自持时钟（只用 frame.t）。
import type { PartEnv, PartInstance, PartV2, StageSize, WorldFrame } from '../../stage/contract';
import { mulberry32 } from '../../stage/world';
import { createStillWater } from './still-water';

/** 三个变体（骨架期的并排探针）。 */
export type TideVariant = 'A' | 'B' | 'C';

/**
 * 三组参数**各自独立可关**（主理人要求：将来 PM 想"只去掉焦散"时不用改代码）。
 *
 * 分层语义：
 *   · `motes`（微粒）/ `fog`（雾）—— **已定**，转正为正式实现，有 bench 与断言
 *   · `grade`（色阶）/ `glow`（光斑形态）—— **待裁**，PM 判完再定稿
 * 缺省值由 `variant` 给；显式传字段可覆盖任意一组。
 */
export interface TideMediumOptions {
  /** 变体（决定三组缺省值）：'A' 沉 / 'B' 透 / 'C' 减法对照 */
  readonly variant?: TideVariant;
  /** 色阶（待裁）。false = 不铺色阶，只留雾 */
  readonly grade?: boolean;
  /**
   * 光斑形态。**名字从 `caustic` 改过来是刻意的** —— 旧名承诺了实现做不到的事。
   *
   * 它不是海床焦散网。**L0 只在没有 WebGPU 的那一档才可见**（有 GPU 时 `voxel-world`
   * 把整块 L0 遮住，0 像素），**而那一档里没有海床**（海床是 L1 的活）。
   * 所以圆斑（水下散景）是屏幕空间光氛围的**正确形态**；要焦散网请去 L1。
   * 一个名字若承诺了实现做不到的事，下一个人会按名字去改 —— 这条改名就是为了拦住那次改动。
   */
  readonly glow?: 'spots' | 'streaks' | 'none';
  /** 雾（已定） */
  readonly fog?: boolean;
  /** 微粒（已定） */
  readonly motes?: boolean;
  /**
   * `/still` 的产品水层：满幅水下介质 + 可接 `sit`/`stand` 的水面折光。
   *
   * 只给 still 站点用；三版探针（tide-a/b/c）不传这个字段，画面不变。
   * 有 WebGPU 时被 `voxel-world` 整块遮住；没有 GPU 时它就是用户看到的那片水。
   */
  readonly still?: boolean;
}

/** 微粒数量（三版一致 —— 差异轴只有一条）。 */
const MOTES = 64;

/**
 * 光斑数量。定稿判据**不再是"数量 40–80"**（那三条随语义从焦散改成 glow 而作废），
 * 现行五条管**分布与幅度**（`PRODUCT-FORM §1.3`）：
 *   1 亮像素占比自上而下**单调下降** ｜ 2 最上 30% 高度亮区 ≥60%
 *   3 单体 ≤14% 画幅宽，且**最大/中位 ≤3** ｜ 4 P95−P50 ≤12 L* ｜ 4b 上四分位/下四分位占比 ≥3
 * 关键洞察（`4b` 存在的原因）：**单调可以靠"整体压暗"骗过去** —— 一条均匀斜线也是单调的，
 * 但那是灰雾不是光。**1 管方向，4b 管幅度。**
 */
const CAUSTICS = 56;

/** 焦散直径上限：**≤8% 画幅宽**（1280 → ≤102px）。 */
const CAUSTIC_MAX_DIA_RATIO = 0.08;

/** 软边宽度上限：**≤直径 25%**（精灵里 0.75R 处开始衰减）。 */
const CAUSTIC_SOFT_RATIO = 0.25;

/** 每版的配色与雾。 */
interface TideStyle {
  /** 竖向色阶：上 → 下 */
  readonly top: string;
  readonly mid: string;
  readonly bottom: string;
  /** 雾色与两个停靠点（上/下的 alpha） */
  readonly fog: readonly [number, number, number];
  readonly fogTop: number;
  readonly fogBottom: number;
  /** 四周是否加浓（C 版） */
  readonly edgeHeavy: boolean;
  /** 光斑形态（不是焦散网，见 `TideMediumOptions.glow` 的注释） */
  readonly glow: 'spots' | 'streaks' | 'none';
  readonly glowColor: string;
}

const STYLES: Readonly<Record<TideVariant, TideStyle>> = {
  // A：沉。深蓝压暗，圆形亮斑，雾上浓下淡
  A: {
    top: '#5a6c80', mid: '#2c3743', bottom: '#0c1116',
    // ★ 雾**越往下越厚**（光从上来 → 深处雾浓）。这是"光"的第二条载体：连续、无实体。
    fog: [180, 214, 236], fogTop: 0.02, fogBottom: 0.20, edgeHeavy: false,
    // ★ `glow: 'none'`：**光斑（圆盘）全部删掉**（2026-11-18 重设计）。
    //   圆盘是"可指认的闭合亮形" = 实体，直接违反 S2「中心 60% 内零实体」。
    //   五条旧判据全在测"斑的分布/大小/软硬" —— 而斑不该存在。
    //   这是**判据与另一条硬判据冲突却没互检**的典型（前四次是量选错，这次是判据互相打架）。
    //   光只靠三样被感知：① 上亮下暗的连续梯度 ② 雾越往下越厚 ③ 微粒（点，不是盘）。
    glow: 'none', glowColor: 'rgba(196,232,248,0)',
  },
  // B：透。青绿提亮，拉长的高光条，雾均匀
  B: {
    top: '#0d3340', mid: '#12525a', bottom: '#0a2b33',
    fog: [188, 240, 232], fogTop: 0.13, fogBottom: 0.13, edgeHeavy: false,
    glow: 'streaks', glowColor: 'rgba(206,250,244,0.13)',
  },
  // C：去饱和。近灰、无焦散、四周浓中心清
  C: {
    top: '#26313a', mid: '#2c3a42', bottom: '#1a2229',
    fog: [206, 214, 218], fogTop: 0.10, fogBottom: 0.16, edgeHeavy: true,
    glow: 'none', glowColor: 'rgba(255,255,255,0)',
  },
};

/** 可挂 2D 上下文的最小平面的结构类型。 */
interface Canvas2DLike {
  width: number;
  height: number;
  getContext(id: '2d'): CanvasRenderingContext2D | null;
}

/** 一颗悬浮微粒。 */
interface Mote {
  readonly x: number;
  y: number;
  readonly r: number;
  readonly speed: number;
  readonly phase: number;
}

/** 一个焦散斑/丝。 */
interface GlowSpot {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly phase: number;
  readonly drift: number;
  /** 深度（0..1，0 = 画面顶）。亮度与出现密度都按它衰减 —— 光必须"从上来"。 */
  readonly depth: number;
}

/**
 * 取离屏 canvas 工厂。
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
 * 建零件实例。
 *
 * @param env 零件环境
 * @param variant 变体
 * @returns 实例
 */
export function createTide(env: PartEnv, options: Required<TideMediumOptions>): PartInstance {
  const maybeCtx = env.ctx;
  if (!maybeCtx) throw new Error('tide-medium 需要 canvas2d 上下文（channel 必须为 canvas2d）');
  const ctx: CanvasRenderingContext2D = maybeCtx;
  const style = STYLES[options.variant];
  const makeCanvas = offscreenFactory(env.canvas as unknown as Canvas2DLike);

  let w = env.width > 0 ? env.width : 1;
  let h = env.height > 0 ? env.height : 1;
  let dpr = env.dpr > 0 ? env.dpr : 1;
  let disposed = false;

  let base: Canvas2DLike | null = null;
  let baseDirty = true;
  /** 焦散精灵：一次烘好软边（0.75R 硬核 → 1R 归零），每帧只 drawImage */
  let causticSprite: Canvas2DLike | null = null;
  let motes: Mote[] = [];
  let glows: GlowSpot[] = [];

  /**
   * 烘焦散精灵。
   *
   * 为什么用精灵而不是每帧 `createRadialGradient`：56 个渐变/帧在真机上就是 5–8ms，
   * 而精灵只需要 **1 次烘焙 + 56 次 drawImage**。软边由精灵自带：
   * 0 → 0.75R 满强度，0.75R → R 线性归零 = 软边占直径 **12.5%**（≤25% 判据）。
   */
  function bakeCausticSprite(): void {
    if (!makeCanvas) return;
    const S = 128;
    if (!causticSprite) causticSprite = makeCanvas();
    if (!causticSprite) return;
    causticSprite.width = S;
    causticSprite.height = S;
    const g = causticSprite.getContext('2d');
    if (!g) return;
    const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    // 峰值 0.5：`screen` 混合下 alpha=1 的白色会直接爆成"雪球"（第一版就是这个结果）。
    // 焦散是**加光**，不是盖白 —— 峰值 0.5 才读成光斑。
    // 峰值 0.12：判据 4 已放宽到 **≤16 L\***（主理人裁决），所以光斑可以真的被看见。
    // ★ 那条裁决的推理值得留在这里：**一条判据如果只能靠"把被测对象做到不可见"来通过，
    //   它测的就不是那个东西。** 判据 2（顶部整片亮）与判据 4（P95−P50）在统计量上对拉，
    //   压到 0.07 时四条全过、光斑几乎看不见 —— 那正是 4b 要防的"glow 变成一层灰雾"。
    //   冲突的正确解不是压 L0，而是**层级**：L0 是氛围、L2 是内容，光斑"抢气泡"该由气泡赢。
    grad.addColorStop(0, 'rgba(255,255,255,0.11)');
    grad.addColorStop(0.75, 'rgba(255,255,255,0.087)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
  }

  /** 按种子建动态元素。 */
  function setup(): void {
    const rnd = mulberry32(env.seed ^ 0x7a3d91c5);
    const nextMotes: Mote[] = [];
    if (!options.motes) {
      motes = nextMotes;
      glows = [];
      return;
    }
    for (let i = 0; i < MOTES; i += 1) {
      nextMotes.push({
        x: rnd(),
        y: rnd(),
        r: (0.5 + rnd() * 1.6) * dpr,
        // 每帧位移换算成每秒（与 bubbles 同一条换算纪律：原文若是 px/帧，必须 ×60）
        speed: (0.0006 + rnd() * 0.0014) * 60,
        phase: rnd() * Math.PI * 2,
      });
    }
    motes = nextMotes;

    const nextCaustics: GlowSpot[] = [];
    for (let i = 0; i < CAUSTICS; i += 1) {
      // ★ 深度偏置：`rnd()^1.7` 让光斑**密集在上部**，往下变稀 —— 这是判据 1/2/4b 的来源。
      //   第一版是均匀 `rnd()`，实测十分位占比 13/27/18/10/20/17/11（**有回升**），
      //   那不是"从上面下来的光"，只是均匀铺了一层。
      const depth = Math.pow(rnd(), 2.4) * 0.55;
      nextCaustics.push({
        x: rnd(),
        y: depth,
        // size 现在表示"直径占画幅宽的比例"：0.045–0.11（判据 3 允许 ≤14% 画幅宽）
        size: 0.045 + rnd() * 0.065,
        phase: rnd() * Math.PI * 2,
        drift: (rnd() - 0.5) * 0.6,
        depth,
      });
    }
    glows = nextCaustics;
  }

  /** 烘静态底：色阶 + 雾（只在 resize 时重做）。 */
  function bake(): void {
    if (!makeCanvas) return;
    const pxW = Math.max(1, Math.round(w * dpr));
    const pxH = Math.max(1, Math.round(h * dpr));
    if (!base) base = makeCanvas();
    if (!base) return;
    base.width = pxW;
    base.height = pxH;
    const g = base.getContext('2d');
    if (!g) return;

    // 色阶（待裁，可独立关）：关掉时用最低限度的深色打底，保证不是透明画布
    if (options.grade) {
      const band = g.createLinearGradient(0, 0, 0, pxH);
      band.addColorStop(0, style.top);
      band.addColorStop(0.5, style.mid);
      band.addColorStop(1, style.bottom);
      g.fillStyle = band;
    } else {
      g.fillStyle = style.bottom;
    }
    g.fillRect(0, 0, pxW, pxH);

    // 雾（已定，可独立关）：竖向（A 上浓下淡 / B 均匀）+ 可选四周加浓（C）
    if (options.fog) {
      const fog = g.createLinearGradient(0, 0, 0, pxH);
      fog.addColorStop(0, `rgba(${style.fog[0]},${style.fog[1]},${style.fog[2]},${style.fogTop})`);
      fog.addColorStop(1, `rgba(${style.fog[0]},${style.fog[1]},${style.fog[2]},${style.fogBottom})`);
      g.fillStyle = fog;
      g.fillRect(0, 0, pxW, pxH);
    }

    if (options.fog && style.edgeHeavy) {
      const edge = g.createRadialGradient(
        pxW * 0.5, pxH * 0.5, Math.min(pxW, pxH) * 0.22,
        pxW * 0.5, pxH * 0.5, Math.max(pxW, pxH) * 0.72,
      );
      edge.addColorStop(0, `rgba(${style.fog[0]},${style.fog[1]},${style.fog[2]},0)`);
      edge.addColorStop(1, `rgba(${style.fog[0]},${style.fog[1]},${style.fog[2]},0.22)`);
      g.fillStyle = edge;
      g.fillRect(0, 0, pxW, pxH);
    }
    baseDirty = false;
  }

  setup();

  return {
    update(frame: WorldFrame): void {
      if (disposed) return;
      const motion = frame.reducedMotion ? 0.3 : 1;
      for (let i = 0; i < motes.length; i += 1) {
        const m = motes[i];
        m.y -= m.speed * motion * frame.dt;
        if (m.y < -0.02) m.y += 1.02;
      }
    },

    draw(frame: WorldFrame): void {
      if (disposed) return;
      if (!makeCanvas) return;
      if (baseDirty || !base) bake();
      if (!base) return;

      // ① 静态底：1 次不透明 blit
      ctx.drawImage(base as unknown as CanvasImageSource, 0, 0, w, h);

      const t = frame.t;
      const motion = frame.reducedMotion ? 0.3 : 1;

      // ② 焦散：A 圆斑 / B 拉长的丝 / C 无
      if (options.glow !== 'none') {
        if (!causticSprite) bakeCausticSprite();
        if (causticSprite) {
          const prev = ctx.globalCompositeOperation;
          ctx.globalCompositeOperation = 'screen';
          for (let i = 0; i < glows.length; i += 1) {
            const c = glows[i];
            const diameter = c.size * w;
            const r = diameter * 0.5;
            const px = (c.x + Math.sin(t * 0.23 + c.phase) * 0.02 * motion) * w;
            const py = (c.y + Math.cos(t * 0.19 + c.phase) * 0.015 * motion) * h;
            // 深度衰减：越往下越弱（判据 1 单调 / 4b 幅度都靠这一行）
            ctx.globalAlpha = 1 - 0.72 * c.depth;
            if (options.glow === 'spots') {
              ctx.drawImage(causticSprite as unknown as CanvasImageSource, px - r, py - r, diameter, diameter);
            } else {
              // 丝 = 把同一张软边精灵拉长（宽度 = 直径的 18%，仍然 ≤8% 判据的直径口径）
              const angle = c.drift + Math.sin(t * 0.12) * 0.25;
              const len = diameter * 2.4;
              const thick = diameter * 0.18;
              ctx.save();
              ctx.translate(px, py);
              ctx.rotate(angle);
              ctx.drawImage(causticSprite as unknown as CanvasImageSource, -len / 2, -thick / 2, len, thick);
              ctx.restore();
            }
          }
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = prev;
        }
      }

      // ③ 微粒：一次 fill 覆盖全部（不做逐粒样式切换）
      if (motes.length === 0) return;
      // 微粒只画**浅层**（y < 0.7）：深层颗粒本就稀，而且暗底上的亮点会打破判据 1 的单调性。
      //   这是物理正确 + 判据正确的同一处修改，不是为了让门变绿而压暗。
      ctx.fillStyle = 'rgba(226,244,252,0.09)';
      ctx.beginPath();
      for (let i = 0; i < motes.length; i += 1) {
        const m = motes[i];
        if (m.y > 0.5) continue;
        const px = (m.x + Math.sin(t * 0.4 + m.phase) * 0.006 * motion) * w;
        const py = m.y * h;
        ctx.moveTo(px + m.r, py);
        ctx.arc(px, py, m.r, 0, Math.PI * 2);
      }
      ctx.fill();
    },

    resize(size: StageSize): void {
      w = size.w > 0 ? size.w : 1;
      h = size.h > 0 ? size.h : 1;
      dpr = size.dpr > 0 ? size.dpr : 1;
      baseDirty = true;
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      if (base) {
        base.width = 0;
        base.height = 0;
      }
      base = null;
      motes = [];
      glows = [];
    },
  };
}

/**
 * 造一个变体的零件定义（**骨架版**，三个变体各自成型）。
 *
 * `costMs = 1.8`：1 次不透明整屏 blit（1.3）+ 焦散 18 段路径 + 微粒 64 段（≈0.2）+ 两次 fill 固定开销。
 * **估算，未实测** —— 骨架版不配 bench，所以这个数只是给 `planBudget` 一个量级。
 *
 * @param variant 'A' | 'B' | 'C'
 * @returns 零件定义
 */
export function makeTideMedium(raw: TideVariant | TideMediumOptions = 'A'): PartV2 {
  // 允许两种调用形态：骨架期手写 `makeTideMedium('B')`，装配期由加载器传 `{ variant }`
  const options: TideMediumOptions = typeof raw === 'string' ? { variant: raw } : (raw ?? {});
  if (options.still === true) {
    // /still 产品水层：同一零件 id/layer，换一套产品实现；三版探针完全不受影响。
    return {
      id: 'tide-medium',
      layer: 'L0',
      blend: 'source-over',
      costMs: 2.4,
      kb: 4,
      z: 0,
      channel: 'canvas2d',
      expendable: false,
      create: (env: PartEnv) => createStillWater(env),
    };
  }
  const requested = options.variant;
  const variant: TideVariant = requested === 'B' || requested === 'C' ? requested : 'A';
  const resolved: Required<TideMediumOptions> = {
    variant,
    // 色阶与焦散由变体给缺省值，但可被显式关闭/替换
    grade: options.grade !== false,
    glow: options.glow ?? STYLES[variant].glow,
    fog: options.fog !== false,
    motes: options.motes !== false,
    still: false,
  };
  return {
    id: 'tide-medium',
    layer: 'L0',
    blend: 'source-over',
    costMs: 1.8,
    kb: 3,
    z: 0,
    channel: 'canvas2d',
    // L0 是整站底色，不许被挂起
    expendable: false,
    create: (env: PartEnv) => createTide(env, resolved),
  };
}

/** 工厂统一名（与 ascii-field / pixel-post 一致）。 */
export const makePart = makeTideMedium;

/** 缺省实例 = A 版（沉）。 */
export const part: PartV2 = makeTideMedium('A');

export default part;
