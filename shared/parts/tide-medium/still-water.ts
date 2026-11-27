// still-water —— /still 无 WebGPU 档的「一片水」L0。
//
// 产品形态（PRODUCT-FORM §1.3）：满幅的水、无地平线/岸/边框/中心实体；Sit 后镜头
// 下潜一个身位，上方出现水面折光与光带，下面变暗；光在 4 分钟里单调退走。
//
// 为什么不用 tide-medium 的 A 版：A 版是「上亮下暗的灰蓝渐变」，在 1280 宽画布上
// 顶边 L* 约 44，读成天空而不是水下；Sit 也没有可接的动词。这里把「水」做成
// 有水面、有深水、有悬浮颗粒的三段连续介质，并把 sit/stand 接进同一个零件。

import type { PartEnv, PartInstance, StageSize, WorldFrame } from '../../stage/contract';
import { mulberry32 } from '../../stage/world';

const MOTES = 84;
const SIT_SECONDS = 2.2;

type Canvas2DLike = {
  width: number;
  height: number;
  getContext(id: '2d'): CanvasRenderingContext2D | null;
};

type Mote = {
  x: number;
  y: number;
  r: number;
  speed: number;
  phase: number;
  drift: number;
};

function offscreen(canvas: Canvas2DLike): (() => Canvas2DLike | null) | null {
  const doc = (canvas as unknown as { ownerDocument?: { createElement(tag: string): Canvas2DLike } }).ownerDocument
    ?? (globalThis as unknown as { document?: { createElement(tag: string): Canvas2DLike } }).document;
  if (!doc || typeof doc.createElement !== 'function') return null;
  return () => {
    try {
      const c = doc.createElement('canvas');
      return c.getContext('2d') ? c : null;
    } catch {
      return null;
    }
  };
}

/**
 * 一条竖向光带精灵：顶亮到底透明，左右用 destination-in 切软边。
 * 它不是「光柱实体」——没有闭合轮廓，亮度只沿 y 单调衰减。
 */
function bakeShaft(make: () => Canvas2DLike | null): Canvas2DLike | null {
  const c = make();
  if (!c) return null;
  const W = 256;
  const H = 512;
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  if (!g) return null;
  const v = g.createLinearGradient(0, 0, 0, H);
  v.addColorStop(0, 'rgba(154, 220, 231, 0.26)');
  v.addColorStop(0.38, 'rgba(110, 180, 198, 0.12)');
  v.addColorStop(0.78, 'rgba(58, 118, 136, 0.03)');
  v.addColorStop(1, 'rgba(20, 48, 60, 0)');
  g.fillStyle = v;
  g.fillRect(0, 0, W, H);
  const mask = g.createLinearGradient(0, 0, W, 0);
  mask.addColorStop(0, 'rgba(0,0,0,0)');
  mask.addColorStop(0.26, 'rgba(0,0,0,1)');
  mask.addColorStop(0.74, 'rgba(0,0,0,1)');
  mask.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalCompositeOperation = 'destination-in';
  g.fillStyle = mask;
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'source-over';
  return c;
}

export function createStillWater(env: PartEnv): PartInstance {
  const maybeCtx = env.ctx;
  if (!maybeCtx) throw new Error('still-water 需要 canvas2d 上下文');
  const ctx: CanvasRenderingContext2D = maybeCtx;

  const makeCanvas = offscreen(env.canvas as unknown as Canvas2DLike);
  let w = env.width > 0 ? env.width : 1;
  let h = env.height > 0 ? env.height : 1;
  let dpr = env.dpr > 0 ? env.dpr : 1;
  let disposed = false;
  let base: Canvas2DLike | null = null;
  let baseDirty = true;
  let shaft: Canvas2DLike | null = null;
  let shaftTried = false;

  let sitTarget = 0;
  let sitMix = 0;
  const rng = mulberry32((env.seed ^ 0x51ea7c3d) >>> 0);
  const motes: Mote[] = [];
  for (let i = 0; i < MOTES; i += 1) {
    motes.push({
      x: rng(),
      y: rng(),
      r: (0.6 + rng() * 1.5) * dpr,
      speed: (0.0008 + rng() * 0.0018) * 60,
      phase: rng() * Math.PI * 2,
      drift: (rng() - 0.5) * 0.002,
    });
  }

  /** 静态水：一条连续的上亮下暗，顶部一层水面雾。只在 resize 烘一次。 */
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

    const body = g.createLinearGradient(0, 0, 0, pxH);
    body.addColorStop(0, '#17323d');
    body.addColorStop(0.18, '#152e38');
    body.addColorStop(0.44, '#112832');
    body.addColorStop(0.72, '#0f2630');
    body.addColorStop(1, '#0e2530');
    g.fillStyle = body;
    g.fillRect(0, 0, pxW, pxH);

    // 水面雾：只贴着画面顶部，连续、不封口，不形成一条岸线。
    const haze = g.createLinearGradient(0, 0, 0, pxH * 0.42);
    haze.addColorStop(0, 'rgba(120, 180, 192, 0.15)');
    haze.addColorStop(0.38, 'rgba(64, 128, 146, 0.06)');
    haze.addColorStop(1, 'rgba(10, 30, 38, 0)');
    g.fillStyle = haze;
    g.fillRect(0, 0, pxW, pxH * 0.42);

    // 深水层压暗：三条极淡的横向水层，用来避免「一条纯渐变」的塑料感。
    for (let i = 0; i < 3; i += 1) {
      const y = pxH * (0.34 + i * 0.18);
      const band = g.createLinearGradient(0, y, 0, y + pxH * 0.16);
      band.addColorStop(0, 'rgba(2, 9, 13, 0)');
      band.addColorStop(0.5, `rgba(2, 9, 13, ${0.05 + i * 0.015})`);
      band.addColorStop(1, 'rgba(2, 9, 13, 0)');
      g.fillStyle = band;
      g.fillRect(0, y, pxW, pxH * 0.16);
    }
    baseDirty = false;
  }

  function drawShaft(t: number, xNorm: number, widthNorm: number, alpha: number): void {
    if (!shaft) return;
    const sway = Math.sin(t * 0.11 + xNorm * 6.2) * w * 0.012;
    const dw = w * widthNorm;
    const dh = h * 0.92;
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = alpha;
    ctx.drawImage(shaft as unknown as CanvasImageSource, w * xNorm - dw * 0.5 + sway, 0, dw, dh);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawMotes(t: number, motion: number): void {
    ctx.save();
    ctx.fillStyle = 'rgba(188, 226, 234, 0.10)';
    ctx.beginPath();
    for (let i = 0; i < motes.length; i += 1) {
      const m = motes[i]!;
      if (m.y > 0.82) continue;
      const px = (m.x + Math.sin(t * 0.22 + m.phase) * 0.004 + t * m.drift) * w;
      const py = m.y * h;
      ctx.moveTo(px + m.r, py);
      ctx.arc(px, py, m.r, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.restore();
    void motion;
  }

  return {
    update(frame: WorldFrame): void {
      if (disposed) return;
      const motion = frame.reducedMotion ? 0.3 : 1;
      sitMix += (sitTarget - sitMix) * Math.min(1, frame.dt / 0.85);
      for (let i = 0; i < motes.length; i += 1) {
        const m = motes[i]!;
        m.y -= m.speed * motion * frame.dt;
        if (m.y < -0.02) {
          m.y += 1.02;
          m.x = (m.x + 0.37) % 1;
        }
      }
    },

    draw(frame: WorldFrame): void {
      if (disposed) return;
      if (!makeCanvas) return;
      if (baseDirty || !base) bake();
      if (!base) return;
      if (!shaft && !shaftTried) {
        shaftTried = true;
        shaft = bakeShaft(makeCanvas);
      }

      ctx.drawImage(base as unknown as CanvasImageSource, 0, 0, w, h);

      const t = frame.t;
      // 4 分钟里单调退走：只压亮度，不改构图；这站的落点是「光没了，水还在」。
      const decay = Math.min(1, Math.max(0, frame.t / 240));
      // Sit 之后再暗一档：镜头从水面落到水里一个身位。
      const depth = 0.06 * decay + 0.78 * sitMix;
      ctx.fillStyle = `rgba(1, 7, 10, ${0.07 + depth})`;
      ctx.fillRect(0, 0, w, h);

      // 镜头下潜后，水面上移到画面上沿：一条连续的上亮下暗，不是岸线、也不是光带。
      // 峰值从顶边开始，向下单调衰减；没有平台，就不会读成「地平线」。
      if (sitMix > 0.001) {
        const lit = ctx.createLinearGradient(0, 0, 0, h * 0.70);
        lit.addColorStop(0, `rgba(118, 200, 216, ${0.78 * sitMix})`);
        lit.addColorStop(0.10, `rgba(106, 186, 204, ${0.60 * sitMix})`);
        lit.addColorStop(0.28, `rgba(82, 158, 178, ${0.36 * sitMix})`);
        lit.addColorStop(0.46, `rgba(44, 108, 126, ${0.16 * sitMix})`);
        lit.addColorStop(0.68, `rgba(12, 36, 46, ${0.05 * sitMix})`);
        lit.addColorStop(1, 'rgba(4, 14, 20, 0)');
        ctx.fillStyle = lit;
        ctx.fillRect(0, 0, w, h * 0.70);
      }

      // 光带：Sit 后从水面下压下来；Sit 前只有很薄的一层水光。
      // 两条不同宽度的竖向光带，左右错开，避免读成「两根光柱」。
      if (typeof document !== 'undefined' && document.body) document.body.dataset.stillShaft = shaft ? '1' : '0';
      drawShaft(t, 0.36, 0.40, 0.055 + 0.30 * sitMix);
      drawShaft(t, 0.64, 0.28, 0.040 + 0.22 * sitMix);

      // 水面下方的一层冷雾：让光带和水面之间不是硬切。
      const under = ctx.createLinearGradient(0, h * 0.06, 0, h * 0.34);
      under.addColorStop(0, `rgba(74, 140, 154, ${0.035 + 0.05 * sitMix})`);
      under.addColorStop(1, 'rgba(8, 24, 30, 0)');
      ctx.fillStyle = under;
      ctx.fillRect(0, h * 0.06, w, h * 0.34);

      drawMotes(t, frame.reducedMotion ? 0.3 : 1);

      // 暗角交给 pixel-post；这里只保底一层很薄的底部压暗，保证底边不是硬切。
      const floor = ctx.createLinearGradient(0, h * 0.7, 0, h);
      floor.addColorStop(0, 'rgba(0, 4, 6, 0)');
      floor.addColorStop(1, 'rgba(0, 3, 5, 0.28)');
      ctx.fillStyle = floor;
      ctx.fillRect(0, h * 0.7, w, h * 0.3);
    },

    cue(verb: string): void {
      if (verb === 'sit') sitTarget = 1;
      else if (verb === 'stand' || verb === 'reset') sitTarget = 0;
    },

    resize(next: StageSize): void {
      w = next.w > 0 ? next.w : 1;
      h = next.h > 0 ? next.h : 1;
      dpr = next.dpr > 0 ? next.dpr : 1;
      baseDirty = true;
    },

    readiness(): number {
      return 1;
    },

    dispose(): void {
      disposed = true;
      base = null;
      shaft = null;
    },
  };
}
