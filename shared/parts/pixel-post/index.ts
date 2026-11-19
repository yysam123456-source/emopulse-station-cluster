// pixel-post —— L4 后处理：颗粒 / 扫描线 / 暗角。**只走快路径**：烘覆盖图，每帧一次 blit。
//
// ★ 2026-11-18 大手术（架构师裁决，四处代码级改动，**顺序不能反**）：
//   ① **动能颗粒搬进快路径** —— 先搬，再删。原来颗粒只在读回路径里按 `floor(t*24)` 换相，
//      快路径那张覆盖图是冻的；先删读回路径会让颗粒从"胶片"退化成"屏上的脏点"。
//   ② 删 `dither`：它抖的是 **alpha < 255**，而合成链终点是**不透明整帧** →
//      **不是"这一站不触发"，是"任何站都不可能触发"**。触发条件与合成链互斥 = 架构性死路。
//      它还强迫走 GPU→CPU 读回（实测 5.1ms），把 `/koi-pond` 顶到 9.78ms → 整站降档。
//   ③ 删 `blockPx`：四站规格没有一站要"像素块化"，它是整条读回路径唯一的理由。
//      将来谁要块化，那是一件**新零件**，不是一个睡着的选项。
//   ④ 补 `vignette`：**这个字段以前根本不存在**，但标题与三处注释都写着"暗角 0.08" ——
//      `/license` 的 8% 与 `/still` 的 14% 至今一次都没实现过。谁报过"暗角已生效"都是虚构。
//
// 删掉读回路径的收益比"省 5ms"更大：**本件不再有 `getImageData`（GPU→CPU 读回）**；
// 唯一剩下的 `putImageData` 在 `bakeGrainTile` 里、写的是**离屏 tile**，一次性烘焙，不写主画布。
// 那是整套里唯一一处 GPU→CPU 读回，成本随驱动波动（同一份代码 3–10ms 都见过）——
// **不可预测的成本会污染所有站的预算判断**。L4 现在是"一个可预测的常量 blit"。
import type { PartEnv, PartInstance, PartV2, StageSize, WorldFrame } from '../../stage/contract';
import { mulberry32 } from '../../stage/world';

/** 站点可配参数。**全部有上限**，超上限不是"更强"，是"滤镜演示"。 */
export interface PixelPostOptions {
  /** 颗粒强度 ≤0.05 */
  readonly grain?: number;
  /** 扫描线暗化幅度 ≤0.08；0 = 关（/license 必须关） */
  readonly scanline?: number;
  /**
   * 暗角强度 ≤0.14（产品红线 `PRODUCT-FORM §2.2-A-3`）。
   *
   * **暗角只由 L4 画**：站内不许再画一层（两边都画会叠成两层、边缘发脏）。
   * 越界按 `LIMITS` **静默夹住** —— 与 dither 的处理相反，判据是：
   * **夹住之后效果还在（只是变弱）→ 夹；效果根本不存在 → 删。**
   */
  readonly vignette?: number;
}

/** 参数硬上限（超了夹住，静默 —— 站点配错不该把整站变成滤镜）。 */
const LIMITS = { grain: 0.05, scanline: 0.08, vignette: 0.14 } as const;

/** 缺省值 = 几乎什么都不做。 */
const DEFAULTS: Required<PixelPostOptions> = {
  grain: 0.04,
  scanline: 0,
  vignette: 0.08,
};

/** 颗粒换相用的 tile 张数（24Hz、8 张 → 3 秒一循环，肉眼辨不出重复）。 */
const GRAIN_PHASES = 8;

/** 颗粒换相频率（Hz）。与"相位 = `floor(t*Hz)`"那条时钟规则一致。 */
const GRAIN_HZ = 24;

/** 可挂 2D 上下文的最小平面的结构类型。 */
interface Canvas2DLike {
  width: number;
  height: number;
  getContext(id: '2d'): CanvasRenderingContext2D | null;
}

/**
 * 取离屏 canvas 工厂；拿不到返回 null。
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
 * 夹住并校验参数。
 *
 * @param options 站点参数
 * @returns 完整参数
 */
function normalize(options: PixelPostOptions): Required<PixelPostOptions> {
  const clamp = (value: number | undefined, limit: number, fallback: number): number => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return fallback;
    return value > limit ? limit : value;
  };
  return {
    grain: clamp(options.grain, LIMITS.grain, DEFAULTS.grain),
    scanline: clamp(options.scanline, LIMITS.scanline, DEFAULTS.scanline),
    vignette: clamp(options.vignette, LIMITS.vignette, DEFAULTS.vignette),
  };
}

/**
 * 造一张 128×128 的灰度噪点瓦片。
 *
 * @param target 瓦片画布
 * @param seed 种子（每相位一个）
 */
function bakeGrainTile(target: Canvas2DLike, seed: number): void {
  const size = 128;
  target.width = size;
  target.height = size;
  const ctx = target.getContext('2d');
  if (!ctx) return;
  const image = ctx.createImageData(size, size);
  const data = image.data;
  const rnd = mulberry32(seed >>> 0);
  for (let i = 0; i < data.length; i += 4) {
    // 以 128 为中枢的灰度噪点：配 overlay 混合时对亮暗两侧对称生效
    const value = 128 + (rnd() - 0.5) * 96;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
}

/**
 * 按参数构造一个 pixel-post 零件定义。
 *
 * `costMs` 口径：每帧**固定一次带 alpha 的整屏 blit**（3.69 Mpx × 0.5 ms/Mpx ≈ 1.85 ms）；
 * 扫描线在 high 档多烘一层（烘焙期，不进每帧）。真浏览器实测 JS 侧 0.00 ms（填充不进 JS 计时），
 * 所以这是**估算**。
 *
 * @param options 站点参数
 * @returns 零件定义（id 恒为 'pixel-post'）
 */
export function makePixelPost(options: PixelPostOptions = {}): PartV2 {
  const opts = normalize(options);
  // ⚠️ `allNeutral` **必须包含 vignette**：漏掉它的后果是"只配暗角的站被判成什么都不做"
  //    → draw() 早退 → 暗角永不出现，而所有门全绿（dither 那个坑换个位置重演）。
  const allNeutral = opts.grain === 0 && opts.scanline === 0 && opts.vignette === 0;

  const MPX = 3.69;
  const overlayMs = MPX * 0.5;
  const costMs = allNeutral ? 0.01 : overlayMs * (opts.scanline > 0 ? 1.2 : 1);

  function create(env: PartEnv): PartInstance {
    const maybeCtx = env.ctx;
    if (!maybeCtx) throw new Error('pixel-post 需要 canvas2d 上下文（channel 必须为 canvas2d）');
    const ctx: CanvasRenderingContext2D = maybeCtx;
    const makeCanvas = offscreenFactory(env.canvas as unknown as Canvas2DLike);

    let w = env.width > 0 ? env.width : 1;
    let h = env.height > 0 ? env.height : 1;
    let dpr = env.dpr > 0 ? env.dpr : 1;
    let lod: 'low' | 'high' = env.lod;
    let disposed = false;

    /**
     * **预烘的 N 张覆盖图**（每张对应一个颗粒相位）。
     *
     * ★ 为什么不是"每帧重烘一张"：那等于每帧做一次整屏 clearRect + 渐变填充 + pattern 填充，
     *   实测帧时间从 1 次 blit 的 16.7ms 掉到 29.7ms。架构师的原话是"**换纹理不换工作量**"——
     *   预烘 N 张、每帧只挑一张 blit，与静态 blit 同成本。
     */
    let overlays: Canvas2DLike[] = [];
    let overlayDirty = true;
    /** N 张颗粒 tile（动能颗粒：按 `floor(t*24) % N` 轮换） */
    let grainTiles: Canvas2DLike[] = [];

    /**
     * 把当前相位那张 grain tile 画进覆盖图。
     *
     * @param g 覆盖图上下文
     * @param phase 相位索引
     * @param pxW 覆盖图宽（设备像素）
     * @param pxH 覆盖图高
     */
    function paintGrain(g: CanvasRenderingContext2D, phase: number, pxW: number, pxH: number): void {
      if (!makeCanvas || opts.grain <= 0) return;
      if (grainTiles.length === 0) {
        for (let i = 0; i < GRAIN_PHASES; i += 1) {
          const tile = makeCanvas();
          if (!tile) return;
          bakeGrainTile(tile, (env.seed ^ 0x5bf03635) + i * 0x9e3779b1);
          grainTiles.push(tile);
        }
      }
      const tile = grainTiles[phase % grainTiles.length];
      const pattern = g.createPattern(tile as unknown as CanvasImageSource, 'repeat');
      if (!pattern) return;
      g.save();
      g.globalCompositeOperation = 'overlay';
      // 0.3 alpha 的 overlay 噪点已是"胶片颗粒"强度；grain 0.05（上限）→ alpha 0.125
      g.globalAlpha = Math.min(1, opts.grain * 2.5);
      g.fillStyle = pattern;
      g.fillRect(0, 0, pxW, pxH);
      g.restore();
    }

    /**
     * 烘**全部相位**的覆盖图（设备像素坐标，不 setTransform，避免 dpr 缩放两次）。
     */
    function bakeOverlays(): void {
      if (!makeCanvas) return;
      const count = opts.grain > 0 ? GRAIN_PHASES : 1;
      if (overlays.length !== count) {
        overlays = [];
        for (let i = 0; i < count; i += 1) {
          const c = makeCanvas();
          if (!c) return;
          overlays.push(c);
        }
      }
      for (let i = 0; i < count; i += 1) bakeOne(overlays[i], i);
      overlayDirty = false;
    }

    /**
     * 烘一张覆盖图。
     *
     * @param target 目标画布
     * @param phase 颗粒相位
     */
    function bakeOne(target: Canvas2DLike, phase: number): void {
      if (!makeCanvas) return;
      const pxW = Math.max(1, Math.round(w * dpr));
      const pxH = Math.max(1, Math.round(h * dpr));
      target.width = pxW;
      target.height = pxH;
      const g = target.getContext('2d');
      if (!g) return;
      g.clearRect(0, 0, pxW, pxH);

      // ① 暗角：**椭圆**（宽高独立），中心在画面中心。
      //    做成圆形会在宽屏上吃掉两侧；产品口径是"角部最大压暗比例"。
      if (opts.vignette > 0) {
        g.save();
        g.translate(pxW * 0.5, pxH * 0.5);
        // 按宽归一后再把 Y 拉回来 → 得到覆盖整幅的椭圆衰减
        g.scale(1, pxH / pxW);
        const radius = pxW * 0.72;
        const vig = g.createRadialGradient(0, 0, radius * 0.42, 0, 0, radius);
        vig.addColorStop(0, 'rgba(0,0,0,0)');
        vig.addColorStop(1, `rgba(0,0,0,${opts.vignette})`);
        g.fillStyle = vig;
        g.fillRect(-pxW, -pxW, pxW * 2, pxW * 2);
        g.restore();
      }

      // ② 扫描线：2px 一条的 pattern，奇数行压暗（low 档不画：降到块状后只剩脏）
      if (opts.scanline > 0 && lod === 'high') {
        const line = makeCanvas();
        if (line) {
          line.width = 1;
          line.height = 2;
          const lineCtx = line.getContext('2d');
          if (lineCtx) {
            lineCtx.fillStyle = `rgba(0,0,0,${opts.scanline})`;
            lineCtx.fillRect(0, 1, 1, 1);
            const pattern = g.createPattern(line as unknown as CanvasImageSource, 'repeat');
            if (pattern) {
              g.fillStyle = pattern;
              g.fillRect(0, 0, pxW, pxH);
            }
          }
        }
      }

      // ③ 颗粒（动能）：相位在烘焙期确定，每张覆盖图一个相位
      paintGrain(g, phase, pxW, pxH);
    }

    /**
     * 尺寸落盘。
     *
     * @param size 新尺寸
     */
    function applySize(size: StageSize): void {
      const nextW = size.w > 0 ? size.w : 1;
      const nextH = size.h > 0 ? size.h : 1;
      const nextDpr = size.dpr > 0 ? size.dpr : 1;
      const changed = nextW !== w || nextH !== h || nextDpr !== dpr;
      w = nextW;
      h = nextH;
      dpr = nextDpr;
      if (changed) overlayDirty = true;
    }

    applySize({ w, h, dpr });

    return {
      update(): void {
        // 无内部状态：全部是 frame 的纯函数。
      },

      draw(frame: WorldFrame): void {
        if (disposed) return;
        // 全中性（含 vignette === 0）：连资源都不建，直接早退。
        if (allNeutral) return;
        if (!makeCanvas) return;

        if (overlayDirty || overlays.length === 0) bakeOverlays();
        if (overlays.length === 0) return;
        // 动能颗粒：相位来自 frame.t（零件不许持有自己的时钟）。reducedMotion 冻在第 0 相。
        const phase = opts.grain > 0 && !frame.reducedMotion
          ? Math.floor(frame.t * GRAIN_HZ) % overlays.length
          : 0;
        // 每帧只有这 1 次 blit（覆盖图是预烘的）
        ctx.drawImage(overlays[phase] as unknown as CanvasImageSource, 0, 0, w, h);
      },

      resize(size: StageSize): void {
        applySize(size);
      },

      setLod(next: 'low' | 'high'): void {
        if (next === lod) return;
        lod = next;
        // ★ 必须**显式置脏**：扫描线只在 high 档画，LOD 切换不重烘会"切到 low 扫描线还在"。
        overlayDirty = true;
      },

      dispose(): void {
        if (disposed) return;
        disposed = true;
        for (const tile of grainTiles) {
          tile.width = 0;
          tile.height = 0;
        }
        grainTiles = [];
        for (const o of overlays) {
          o.width = 0;
          o.height = 0;
        }
        overlays = [];
      },
    };
  }

  return {
    id: 'pixel-post',
    layer: 'L4',
    blend: 'source-over',
    costMs: Math.round(costMs * 100) / 100,
    kb: 2,
    z: 0,
    channel: 'canvas2d',
    expendable: true,
    create,
  };
}

/** 缺省实例：粒 0.04 / 暗角 0.08 / 无扫描线。preview 与装配器都靠这个导出。 */
export const part: PartV2 = makePixelPost();

export default part;
