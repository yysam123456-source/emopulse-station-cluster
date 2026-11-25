// paper-ink —— `room` / `ink` 两个 biome 的 L0 底材：**一张纸**（不是一层底纹）。
//
// 为什么不用 ink 引擎那份纸纹：原件是 **273 KB base64 内联 PNG**（gzip 后仍约 205 KB），
// 一件 L0 底材吃掉整站体积门；它的 SVG 管线（feTurbulence + feDisplacementMap）也不值得 port。
//
// ★ 三次返工换来的三条硬结论（每条都是像素实测逼出来的，别再踩）：
//   1. **不许平铺**。上一版是 128px 瓦片 + createPattern：单块跨缝连续（bench 验过 0.78×），
//      但铺到 78% 屏宽后**列均值自相关在 lag 7/14/21 连续高（0.83/0.80/0.86）** —— 肉眼读成"贴图"。
//      现在整张纸**一次生成、不平铺**，生成分辨率按 CSS px（不是设备 px）再放大：
//      少 4 倍像素，且彻底没有周期。
//   2. **光必须作用在纸之上**。上一版把晨光画成纸内部的浅色渐变（alpha 0.16），实测
//      纸面 dL/dx=−1.10、R²=0.013，左上/右下只差 1.32 L* —— 等于没有方向。
//      现在叠一条**从亮到暗**的真实明度梯度（左上白 0.14 → 右下黑 0.13），目标差 ≥6 L*、R² ≥0.5。
//   3. **纸边要能被看见**。1px + alpha 0.25 落在 L* 82 的纸上实测只低 7.1 L*，等于不存在。
//      现在双线框 ≥2px、对比 ≥12 L*，并在受光侧加亮边、背光侧加暗边（纸的厚度感）。
//
// 暗角不在这里：产品判定「纸上边缘发暗会读成旧照片滤镜」，暗角归 L4 `pixel-post`。
//
// 帧预算纪律：draw 里零 new、零 createGradient、零字符串拼接、零 Math.random。
import type { BiomeId, PartEnv, PartInstance, PartV2, Rect, StageSize, WorldFrame } from '../../stage/contract';
import { mulberry32 } from '../../stage/world';

/**
 * 纸的宽高比 = **A4 横 1.41**。
 *
 * ★ 这个数字不是审美，是**导出的前置条件**：
 *   `/license` 的带走物是 1410×1000（同样 1.41）。若屏上纸是别的比例（曾经是 2.21 的"宽幅"），
 *   `cover` 裁切横帧到竖版会把纸左右各切掉三分之一，**右下角的章会落出画外** ——
 *   而那种失败不报错，只让整站的仪式落空。
 *   所以：**屏上纸与导出卡必须同比例**，`tests/site-build.mjs` 会断言站点常量与本常量一致。
 */
export const SHEET_ASPECT = 1.4142;

/**
 * 纸矩形（CSS px）—— 壳与 world 通道的**唯一**布局来源。
 *
 * 从前 `shared/sites/shell.ts` 手抄了 1.4142 / 0.90 / 0.82 三个数字，
 * 纸一改比例，DOM 文字和画布纸面就会错位。现在只在这里算一次。
 *
 * `ink` biome 是整屏纸（/koi 的纸铺到画布外，没有台面），所以返回 null：
 * world 通道按整屏合成，DOM 也不该被框进一个不存在的纸矩形。
 *
 * @param width CSS 宽
 * @param height CSS 高
 * @param biome 站点 biome
 */
export function sheetRect(width: number, height: number, biome?: BiomeId): Rect | null {
  if (biome === 'ink') return null;
  const w = width > 0 ? width : 1;
  const h = height > 0 ? height : 1;
  let sheetH = Math.round(h * 0.90);
  let sheetW = Math.round(sheetH * SHEET_ASPECT);
  // 手机上 82% 宽只留下 226px 高的纸，许可证正文会挤成三层重叠；
  // 95% 宽让纸多出约 35px 高，同时仍留出边缘阴影。
  const maxW = Math.round(w * (w <= 600 ? 0.95 : 0.82));
  if (sheetW > maxW) {
    sheetW = maxW;
    sheetH = Math.round(sheetW / SHEET_ASPECT);
  }
  return {
    x: Math.round((w - sheetW) / 2),
    y: Math.round((h - sheetH) / 2),
    w: sheetW,
    h: sheetH,
  };
}

/** 纸面场生成分辨率上限（CSS px）。超过就按比例缩，避免大屏上一次性烘焙过久。 */
const FIELD_MAX_SIDE = 1024;
// ink 是整屏铺纸：1024² 的逐像素噪声在无头机上要 7s，首帧直接黑。
// 水彩纹理放大后本来就会软，512² 足够；这是启动性能与质感的折中。
const INK_FIELD_MAX_SIDE = 512;

/** 噪声层：斑块 / 中频 / 竖纤维（都在 CSS px 上定义，与 dpr 无关）。 */
const BLOTCH_CELLS = 3;
const MID_CELLS = 14;
/**
 * 竖纤维的幅度。
 *
 * ★ 这里原来是一个 180 格点的（周期性）噪声层 → 在 1024px 上约 5.7px 一格，
 *   实测列均值自相关在去趋势后仍有 0.90 @lag4 —— 那就是"看得见的梳子"。
 *   现在整层换成**每列一个哈希白噪声**：纤维仍然是一列一个值（所以看得见竖纹），
 *   但列与列之间没有任何周期关系 → 自相关在 lag≥1 直接掉到 0。
 */
const FIBER_AMP = 0.03;

/** 每个 biome 的纸色 / 侧光 / 边框。 */
interface Palette {
  readonly paper: readonly [number, number, number];
  /** 侧光亮部色 */
  readonly light: readonly [number, number, number];
  readonly lightAlpha: number;
  /** 侧光暗部（右下）压暗量 */
  readonly shadeAlpha: number;
  readonly border: string;
  readonly hasBorder: boolean;
}

/**
 * 四个 biome 的纸：同一份实现，不同职责（产品口径，可截图查）。
 *
 *  | biome | 纸的角色 | 侧光 | 双线框 |
 *  |---|---|---|---|
 *  | room(=/license) | **主体**（被斜光照、被盖章的对象） | 有方向 | 有边界 |
 *  | ink(=/koi-pond) | **载体**（被墨覆盖） | 无 | 无 |
 */
const PALETTES: Readonly<Record<string, Palette>> = {
  room: {
    paper: [214, 204, 190],
    light: [255, 248, 236], lightAlpha: 0.62, shadeAlpha: 0.64,
    border: 'rgba(96,76,52,0.62)', hasBorder: true,
  },
  ink: {
    paper: [240, 242, 238],
    light: [255, 255, 255], lightAlpha: 0, shadeAlpha: 0,
    border: 'rgba(96,76,52,0)', hasBorder: false,
  },
  field: {
    paper: [240, 231, 210],
    light: [255, 240, 216], lightAlpha: 0.10, shadeAlpha: 0.10,
    border: 'rgba(96,76,52,0.5)', hasBorder: true,
  },
  tide: {
    paper: [231, 236, 238],
    light: [235, 244, 252], lightAlpha: 0.08, shadeAlpha: 0.10,
    border: 'rgba(60,80,100,0)', hasBorder: false,
  },
};

/** 可挂 2D 上下文的最小平面的结构类型。 */
interface Canvas2DLike {
  width: number;
  height: number;
  getContext(id: '2d'): CanvasRenderingContext2D | null;
}

/** 一张格点表（**不做回绕**：纸不再平铺，所以不需要周期性）。 */
interface Lattice {
  readonly gx: number;
  readonly gy: number;
  readonly data: Float32Array;
}

/**
 * 取离屏 canvas 工厂；拿不到返回 null（降级为每帧矢量绘制）。
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
 * 造一张 gx×gy 的格点表。
 *
 * @param rnd 确定性随机源
 * @param gx 横向格点数
 * @param gy 纵向格点数
 * @returns 格点表
 */
function makeLattice(rnd: () => number, gx: number, gy: number): Lattice {
  const data = new Float32Array(gx * gy);
  for (let i = 0; i < data.length; i += 1) data[i] = rnd();
  return { gx, gy, data };
}

/**
 * smoothstep 插值权重，比线性少一路「网格感」。
 *
 * @param t 0..1
 * @returns 0..1
 */
function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * 采样值噪声（u,v ∈ [0,1) 映射到整张格点表；越界夹住）。
 *
 * @param lat 格点表
 * @param u 归一化横坐标
 * @param v 归一化纵坐标
 * @returns 0..1
 */
function sampleNoise(lat: Lattice, u: number, v: number): number {
  const fx = u * (lat.gx - 1);
  const fy = v * (lat.gy - 1);
  const ix = Math.min(lat.gx - 2, Math.max(0, Math.floor(fx)));
  const iy = Math.min(lat.gy - 2, Math.max(0, Math.floor(fy)));
  const tx = smooth(fx - ix);
  const ty = smooth(fy - iy);
  const a = lat.data[iy * lat.gx + ix];
  const b = lat.data[iy * lat.gx + ix + 1];
  const c = lat.data[(iy + 1) * lat.gx + ix];
  const d = lat.data[(iy + 1) * lat.gx + ix + 1];
  const top = a + (b - a) * tx;
  const bottom = c + (d - c) * tx;
  return top + (bottom - top) * ty;
}

/**
 * 每像素确定性哈希（0..1）。**不用 Math.random** —— 否则同 seed 不可复现。
 *
 * @param x 像素 x
 * @param y 像素 y
 * @param seed 种子
 * @returns 0..1
 */
function hashPx(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed | 0, 2246822519)) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * 夹紧到 0..255 并取整。
 *
 * @param value 任意值
 * @returns 0..255 整数
 */
function clamp255(value: number): number {
  if (!(value > 0)) return 0;
  if (value > 255) return 255;
  return value | 0;
}

/**
 * 生成整张纸的纸面场（**一次生成、不平铺**）。
 *
 * 竖纤维是「每列一个平滑值」（gy 很小），不是逐像素梳齿 —— 上一版用 8px 周期的格点，
 * 平铺后列均值自相关在 lag 7/14/21 上 0.83，肉眼就是贴图阵列。
 *
 * @param target 目标画布（按 CSS px 尺寸生成）
 * @param wCss 宽（CSS px）
 * @param hCss 高（CSS px）
 * @param seed 种子
 * @param palette 配色
 */
function bakePaperField(
  target: Canvas2DLike,
  wCss: number,
  hCss: number,
  seed: number,
  palette: Palette,
  maxSide: number = FIELD_MAX_SIDE,
): void {
  const scale = Math.min(1, maxSide / Math.max(wCss, hCss, 1));
  const pxW = Math.max(2, Math.round(wCss * scale));
  const pxH = Math.max(2, Math.round(hCss * scale));
  target.width = pxW;
  target.height = pxH;
  const ctx = target.getContext('2d');
  if (!ctx) return;

  const rnd = mulberry32(seed >>> 0);
  const blotch = makeLattice(rnd, BLOTCH_CELLS, BLOTCH_CELLS);
  const mid = makeLattice(rnd, MID_CELLS, MID_CELLS);

  const image = ctx.createImageData(pxW, pxH);
  const data = image.data;
  const base = palette.paper;
  const invX = 1 / pxW;
  const invY = 1 / pxH;

  let index = 0;
  for (let y = 0; y < pxH; y += 1) {
    const v = y * invY;
    for (let x = 0; x < pxW; x += 1) {
      const u = x * invX;
      const b = sampleNoise(blotch, u, v) - 0.5;
      const m = sampleNoise(mid, u, v) - 0.5;
      // 纤维：整列同一个值（竖向连续），列间白噪声（无周期）
      const f = (hashPx(x, 7, seed) - 0.5) * 0.6 + (hashPx(x, 23, seed) - 0.5) * 0.4;
      const grain = hashPx(x, y, seed) - 0.5;
      const fleck = hashPx(x + 977, y + 613, seed) < 0.0008 ? -0.16 : 0;
      const l = 1 + b * 0.035 + m * 0.03 + f * FIBER_AMP + grain * 0.055 + fleck;

      data[index] = clamp255(base[0] * l);
      data[index + 1] = clamp255(base[1] * l);
      data[index + 2] = clamp255(base[2] * l);
      data[index + 3] = 255;
      index += 4;
    }
  }
  ctx.putImageData(image, 0, 0);
}

/**
 * 建零件实例。
 *
 * @param env 零件环境
 * @returns 实例
 */
export function create(env: PartEnv): PartInstance {
  const maybeCtx = env.ctx;
  if (!maybeCtx) throw new Error('paper-ink 需要 canvas2d 上下文（channel 必须为 canvas2d）');
  const ctx: CanvasRenderingContext2D = maybeCtx;

  const makeCanvas = offscreenFactory(env.canvas as unknown as Canvas2DLike);
  const palette = PALETTES[env.biome] ?? PALETTES.room;

  let w = env.width > 0 ? env.width : 1;
  let h = env.height > 0 ? env.height : 1;
  let dpr = env.dpr > 0 ? env.dpr : 1;
  let lod: 'low' | 'high' = env.lod;
  let disposed = false;

  /** 烘好的整屏底图（台面 + 纸 + 光 + 边框） */
  let target: Canvas2DLike | null = null;
  /** 纸面场（CSS px 分辨率，最后放大贴到纸上） */
  let field: Canvas2DLike | null = null;
  /** 降级路径：可复用的渐变与纸屑点 */
  let fallbackShade: CanvasGradient | null = null;
  let specks: Float32Array = new Float32Array(0);
  const SPECK_COUNT = 420;

  /** 重建降级路径的资源（没有离屏能力时用）。 */
  function rebuildFallback(): void {
    const rnd = mulberry32(env.seed ^ 0x51ed270b);
    const next = new Float32Array(SPECK_COUNT * 3);
    for (let i = 0; i < SPECK_COUNT; i += 1) {
      next[i * 3] = rnd() * w;
      next[i * 3 + 1] = rnd() * h;
      next[i * 3 + 2] = 0.04 + rnd() * 0.10;
    }
    specks = next;
    const shade = ctx.createLinearGradient(0, 0, w, h);
    shade.addColorStop(0, 'rgba(255,248,236,0.14)');
    shade.addColorStop(0.42, 'rgba(255,255,255,0)');
    shade.addColorStop(1, 'rgba(26,18,10,0.13)');
    fallbackShade = shade;
  }

  /** 把整屏底图烘焙出来。只在构造 / resize / 切 LOD 时调用。 */
  function bake(): void {
    if (!makeCanvas) {
      rebuildFallback();
      return;
    }
    const pxW = Math.max(1, Math.round(w * dpr));
    const pxH = Math.max(1, Math.round(h * dpr));
    if (!target) target = makeCanvas();
    if (!field) field = makeCanvas();
    if (!target || !field) return;
    target.width = pxW;
    target.height = pxH;
    const g = target.getContext('2d');
    if (!g) return;

    // ★ `ink`（/koi-pond）的纸是**载体**：铺满画布、无边界、无台面、无方向光。
    //   产品口径（PRODUCT-FORM §1.1）：「纸铺到画布外，看不出边界」。
    //   第一版对所有 biome 都沿用 room 的内缩纸+台面 → 截图上出现一圈深色桌面，
    //   PM 把它看成了"灰不透明方块"。这不是渲染 bug，是**纸张角色**没分开。
    if (env.biome === 'ink') {
      bakePaperField(field, w, h, env.seed, palette, INK_FIELD_MAX_SIDE);
      g.drawImage(field as unknown as CanvasImageSource, 0, 0, pxW, pxH);
      g.imageSmoothingEnabled = false;
      return;
    }

    // 纸的高 ≈ 90% 画幅高；宽度按 1.41 反推，并保证不超出 82% 画幅宽。
    // 两者冲突时（极端窄视口）以"宽度不越界"为准 —— 宁可纸矮一点，也不要贴到边上。
    // 公式只在 sheetRect 里写一次（壳/导出/world 通道都读它）。
    const rect = sheetRect(w, h, env.biome);
    if (!rect) return;
    const sheetW = Math.round(rect.w * dpr);
    const sheetH = Math.round(rect.h * dpr);
    const sheetX = Math.round(rect.x * dpr);
    const sheetY = Math.round(rect.y * dpr);

    // ── 台面（暖中暗，L*≈20）：纸以外的那圈背景 ──
    const desk = g.createLinearGradient(0, 0, pxW * 0.75, pxH);
    // 台面要落在 L* 16–24（暖中暗）：太暗会让纸"浮在虚空里"，太亮就抢主体
    desk.addColorStop(0, '#3a332b');
    desk.addColorStop(0.55, '#2b2721');
    desk.addColorStop(1, '#232019');
    g.fillStyle = desk;
    g.fillRect(0, 0, pxW, pxH);

    // ── 投影：纸浮起来 ──
    g.fillStyle = 'rgba(0,0,0,0.36)';
    g.fillRect(sheetX + Math.round(4 * dpr), sheetY + Math.round(8 * dpr), sheetW, sheetH);
    g.fillStyle = 'rgba(0,0,0,0.20)';
    g.fillRect(sheetX + Math.round(11 * dpr), sheetY + Math.round(16 * dpr), sheetW, sheetH);

    // ── 纸面：一次生成、放大贴上（不平铺 → 没有周期）──
    bakePaperField(field, sheetW / dpr, sheetH / dpr, env.seed, palette);
    g.imageSmoothingEnabled = true;
    g.drawImage(field as unknown as CanvasImageSource, sheetX, sheetY, sheetW, sheetH);
    g.imageSmoothingEnabled = false;

    // ── 方向光：**作用在纸之上**的明度梯度（左上亮 → 右下暗）──
    // 产品判据 2 的核心：实测要求左上/右下块差 ≥6 L*、平面拟合 R² ≥0.5。
    if (palette.lightAlpha > 0 || palette.shadeAlpha > 0) {
      // 两段叠加，缺一不可：
      //   ① **匀速斜向渐变** —— 负责"数值意义上的方向"（左上块与右下块的差，门在量这个）。
      //      工作点的由来：11.5 L* 能过"≥10"的门，但**眼睛仍说平**（主理人复判过 16.6 与 11.5 两版）；
      //      16.6 L* 时梯度明确可辨、且还没有硬边/暗角，不像打灯。所以取 ~16.6。
      //      只做②会让差变小（因为取样块在 12%~24% 内缩处，光晕已经衰掉）。
      //   ② **锚在左上角的光晕** —— 负责"眼睛意义上的入口"。大面积的匀速 10 L* 低于感知阈值，
      //      光必须有来处；但光晕不能替代①，否则数值会掉到 8 L*（实测）。
      const lit = g.createLinearGradient(sheetX, sheetY, sheetX + sheetW, sheetY + sheetH);
      lit.addColorStop(0, `rgba(${palette.light[0]},${palette.light[1]},${palette.light[2]},${palette.lightAlpha})`);
      lit.addColorStop(0.42, 'rgba(255,255,255,0)');
      lit.addColorStop(1, `rgba(26,18,10,${palette.shadeAlpha})`);
      const bloom = g.createRadialGradient(
        sheetX + sheetW * 0.04, sheetY + sheetH * 0.02, 0,
        sheetX + sheetW * 0.04, sheetY + sheetH * 0.02, Math.max(sheetW, sheetH) * 0.62,
      );
      bloom.addColorStop(0, `rgba(${palette.light[0]},${palette.light[1]},${palette.light[2]},0.20)`);
      bloom.addColorStop(0.45, `rgba(${palette.light[0]},${palette.light[1]},${palette.light[2]},0.06)`);
      bloom.addColorStop(1, 'rgba(255,255,255,0)');
      g.save();
      g.beginPath();
      g.rect(sheetX, sheetY, sheetW, sheetH);
      g.clip();
      g.fillStyle = lit;
      g.fillRect(sheetX, sheetY, sheetW, sheetH);
      g.fillStyle = bloom;
      g.fillRect(sheetX, sheetY, sheetW, sheetH);

      // 受光侧的亮边（上 + 左）：光打在纸的切口上
      const edge = Math.max(2, Math.round(1.5 * dpr));
      g.fillStyle = `rgba(${palette.light[0]},${palette.light[1]},${palette.light[2]},0.55)`;
      g.fillRect(sheetX, sheetY, sheetW, edge);
      g.fillRect(sheetX, sheetY, edge, sheetH);
      // 背光侧的暗边（下 + 右）：让纸有厚度
      g.fillStyle = 'rgba(40,30,18,0.30)';
      g.fillRect(sheetX, sheetY + sheetH - edge, sheetW, edge);
      g.fillRect(sheetX + sheetW - edge, sheetY, edge, sheetH);
      g.restore();
    }

    // ── 双线框：≥2px 且对比 ≥12 L*（1px + alpha 0.25 实测只低 7.1 L*，等于不存在）──
    if (palette.hasBorder && lod === 'high') {
      const inset = Math.max(3, Math.round(9 * dpr));
      const gap = Math.max(3, Math.round(4 * dpr));
      const weight = Math.max(2, Math.round(1.2 * dpr));
      g.strokeStyle = palette.border;
      g.lineWidth = weight;
      g.strokeRect(sheetX + inset, sheetY + inset, sheetW - inset * 2, sheetH - inset * 2);
      g.lineWidth = Math.max(1, Math.round(0.8 * dpr));
      g.strokeRect(sheetX + inset + gap, sheetY + inset + gap, sheetW - (inset + gap) * 2, sheetH - (inset + gap) * 2);
    }
  }

  /**
   * 尺寸落盘并重烘。
   *
   * 装配器构造期**一定**会调一次 `resize()`，而 create 里已经烘过一次 ——
   * 没有这句守卫，每个站启动时白烘一张整屏底图。
   *
   * @param size 新尺寸
   */
  function applySize(size: StageSize): void {
    const nextW = size.w > 0 ? size.w : 1;
    const nextH = size.h > 0 ? size.h : 1;
    const nextDpr = size.dpr > 0 ? size.dpr : 1;
    if (target && nextW === w && nextH === h && nextDpr === dpr) return;
    w = nextW;
    h = nextH;
    dpr = nextDpr;
    bake();
  }

  applySize({ w, h, dpr });

  return {
    update(): void {
      // 无内部状态：纸是静的。
    },

    draw(): void {
      if (disposed) return;

      if (target) {
        // 不透明整屏 blit：1 次调用，1 次填充
        ctx.drawImage(target as unknown as CanvasImageSource, 0, 0, w, h);
        return;
      }

      // ── 降级路径：没有离屏能力时用矢量近似，慢但不白屏 ──
      ctx.fillStyle = `rgb(${palette.paper[0]},${palette.paper[1]},${palette.paper[2]})`;
      ctx.fillRect(0, 0, w, h);
      if (fallbackShade) {
        ctx.fillStyle = fallbackShade;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.fillStyle = 'rgba(40,32,20,0.10)';
      for (let i = 0; i < specks.length; i += 3) {
        ctx.fillRect(specks[i], specks[i + 1], 1, 1);
      }
    },

    resize(size: StageSize): void {
      applySize(size);
    },

    setLod(next: 'low' | 'high'): void {
      if (next === lod) return;
      lod = next;
      bake();
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const surface of [target, field]) {
        if (!surface) continue;
        surface.width = 0;
        surface.height = 0;
      }
      target = null;
      field = null;
      fallbackShade = null;
      specks = new Float32Array(0);
    },
  };
}

/**
 * 零件定义。
 *
 * `costMs` 口径：**每帧固定 1 次不透明整屏 blit**（3.69 Mpx × 0.35 ms/Mpx ≈ 1.29 ms）——**估算**；
 * 真浏览器 JS 侧实测 0.00 ms（填充不进 JS 计时）。构造期另有一次整张纸的烘焙（见 bench）。
 *
 * `setLod('low')`：跳过双线框、纸面场按更低分辨率生成。**每帧成本不变** ——
 * 本件每帧只有 1 次 blit，没有可减的填充量。
 */
export const part: PartV2 = {
  id: 'paper-ink',
  layer: 'L0',
  blend: 'source-over',
  costMs: 1.3,
  kb: 2,
  z: 0,
  channel: 'canvas2d',
  // L0 是整站底色，不许被挂起：挂掉就是纯黑屏
  expendable: false,
  describe(size, biome) {
    return { sheet: sheetRect(size.w, size.h, biome) };
  },
  create,
};

export default part;
