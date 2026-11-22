// boids —— L2 生态零件：60 只鸟，V 形笔触，flocking。
//
// 为什么不用 three.js Points/InstancedMesh：鸟是**两笔线**，Canvas2D 的 60×2 次 stroke
// 在 0.3ms 量级；three.js 反而要建几何、上传矩阵、处理透明排序。这里选便宜的。
//
// 为什么必须用自己的离屏缓冲：主画布**从不 clearRect**（L0 负责铺底），
// 细线直接画会留下上一帧的尾巴。缓冲只覆盖天空带（60% 高），clear 成本比全屏低。
import type { Lod, PartEnv, PartInstance, PartV2, StageSize, WorldFrame } from '../../stage/contract';
import { mulberry32 } from '../../stage/world';

interface Bird {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** 天空带高度占比：鸟不会飞到草坡下半部。 */
const BAND = 0.58;

const COUNT_HIGH = 60;
const COUNT_LOW = 26;

const MAX_DT = 0.1;

function makeSurface(): HTMLCanvasElement | null {
  const doc = (globalThis as unknown as { document?: Document }).document;
  if (!doc) return null;
  const el = doc.createElement('canvas');
  return typeof el.getContext === 'function' ? el : null;
}

function create(env: PartEnv): PartInstance {
  const ctx = env.ctx;
  if (!ctx) throw new Error('boids 需要 canvas2d 通道');

  let w = env.width > 0 ? env.width : 1;
  let h = env.height > 0 ? env.height : 1;
  let dpr = env.dpr > 0 ? env.dpr : 1;
  let lod: Lod = env.lod;
  let count = lod === 'low' ? COUNT_LOW : COUNT_HIGH;

  const rng = mulberry32(env.seed);
  const birds: Bird[] = Array.from({ length: COUNT_HIGH }, () => ({
    x: rng() * w,
    y: (0.08 + rng() * 0.34) * h,
    vx: (rng() * 2 - 1) * 0.03 * w,
    vy: (rng() * 2 - 1) * 0.012 * h,
  }));

  const buffer = makeSurface();
  let bctx = buffer?.getContext('2d') ?? null;
  let disposed = false;
  let scatter = 0;
  let lastT = 0;

  const resizeBuffer = (): void => {
    if (!buffer || !bctx) return;
    const pxW = Math.max(1, Math.round(w * dpr));
    const pxH = Math.max(1, Math.round((h * BAND) * dpr));
    if (buffer.width !== pxW || buffer.height !== pxH) {
      buffer.width = pxW;
      buffer.height = pxH;
    }
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const step = (dt: number, f: WorldFrame): void => {
    const bandH = h * BAND;
    const vision = Math.min(w, h) * 0.16;
    const sep = Math.min(w, h) * 0.035;
    const maxSpeed = Math.max(0.02 * w, 6);
    const minSpeed = 0.008 * w;
    const pointerX = f.pointer.x * w;
    const pointerY = f.pointer.y * h;
    const active = birds.slice(0, count);

    for (let i = 0; i < active.length; i += 1) {
      const a = active[i]!;
      let ax = 0;
      let ay = 0;
      let sx = 0;
      let sy = 0;
      let cx = 0;
      let cy = 0;
      let n = 0;
      for (let j = 0; j < active.length; j += 1) {
        if (i === j) continue;
        const b = active[j]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > vision * vision || d2 < 0.0001) continue;
        n += 1;
        ax += b.vx;
        ay += b.vy;
        cx += b.x;
        cy += b.y;
        if (d2 < sep * sep) {
          const inv = 1 / Math.sqrt(d2);
          sx -= dx * inv;
          sy -= dy * inv;
        }
      }

      let axv = 0;
      let ayv = 0;
      if (n > 0) {
        axv = (ax / n - a.vx) * 0.05;
        ayv = (ay / n - a.vy) * 0.05;
        cx = (cx / n - a.x) * 0.0016;
        cy = (cy / n - a.y) * 0.0016;
      }
      sx *= 0.06;
      sy *= 0.06;

      // 指针是「吓一下」而不是「吸过去」：鸟在指针附近会被推开
      const pdx = a.x - pointerX;
      const pdy = a.y - pointerY;
      const pd2 = pdx * pdx + pdy * pdy;
      let px = 0;
      let py = 0;
      if (pd2 < vision * vision && pd2 > 0.0001) {
        const inv = 1 / Math.sqrt(pd2);
        const force = (1 - Math.sqrt(pd2) / vision) * 0.02;
        px = pdx * inv * force;
        py = pdy * inv * force;
      }

      // release 时炸群：一次性向外加速，而不是永久改变 flocking 参数
      if (scatter > 0) {
        const inv = 1 / Math.max(1, Math.sqrt(pd2));
        px += (a.x - w * 0.5) * inv * scatter * 0.006;
        py -= 0.05;
      }

      a.vx += (axv + cx + sx + px) * (dt * 60);
      a.vy += (ayv + cy + sy + py) * (dt * 60);
      // 个体噪声：没有它，60 只鸟会在 3 秒内锁成一条直线
      a.vx += (rng() * 2 - 1) * 0.0006 * w * dt;
      a.vy += (rng() * 2 - 1) * 0.0004 * w * dt;

      const speed = Math.sqrt(a.vx * a.vx + a.vy * a.vy);
      if (speed > maxSpeed) {
        a.vx = (a.vx / speed) * maxSpeed;
        a.vy = (a.vy / speed) * maxSpeed;
      } else if (speed < minSpeed) {
        a.vx += (rng() * 2 - 1) * minSpeed * 0.5;
        a.vy += (rng() * 2 - 1) * minSpeed * 0.5;
      }

      a.x += a.vx * dt;
      a.y += a.vy * dt;

      // 边界：横向环绕，纵向弹回（不出天空带）
      if (a.x < -20) a.x = w + 20;
      else if (a.x > w + 20) a.x = -20;
      const top = h * 0.04;
      const bottom = bandH - 8;
      if (a.y < top) { a.y = top; a.vy = Math.abs(a.vy); }
      else if (a.y > bottom) { a.y = bottom; a.vy = -Math.abs(a.vy); }
    }
    if (scatter > 0) scatter *= 0.94;
    if (scatter < 0.01) scatter = 0;
  };

  const paint = (): void => {
    if (!buffer || !bctx) return;
    const g = bctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h * BAND);
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(46,38,30,0.62)';
    g.lineWidth = Math.max(1, Math.min(2.2, w * 0.0014));
    const active = birds.slice(0, count);
    for (const bird of active) {
      const vx = bird.vx;
      const vy = bird.vy;
      const len = Math.max(4, Math.min(11, Math.sqrt(vx * vx + vy * vy) * 0.12));
      const angle = Math.atan2(vy, vx);
      // V 形：尖端在头部，两翼向后展开
      g.beginPath();
      g.moveTo(bird.x - Math.cos(angle - 0.5) * len, bird.y - Math.sin(angle - 0.5) * len);
      g.lineTo(bird.x, bird.y);
      g.lineTo(bird.x - Math.cos(angle + 0.5) * len, bird.y - Math.sin(angle + 0.5) * len);
      g.stroke();
    }
    ctx.drawImage(buffer as unknown as CanvasImageSource, 0, 0, w, h * BAND);
  };

  return {
    update(f: WorldFrame): void {
      if (disposed) return;
      let dt = f.dt;
      if (!Number.isFinite(dt) || dt < 0) dt = 0;
      lastT = f.t;
      if (dt > MAX_DT) dt = 0.1;
      if (!f.reducedMotion) step(dt, f);
    },
    draw(): void {
      if (!disposed) paint();
    },
    resize(size: StageSize): void {
      w = size.w > 0 ? size.w : 1;
      h = size.h > 0 ? size.h : 1;
      dpr = size.dpr > 0 ? size.dpr : 1;
      resizeBuffer();
      for (const bird of birds) {
        bird.x = Math.min(w, Math.max(0, bird.x));
        bird.y = Math.min(h * BAND, Math.max(h * 0.04, bird.y));
      }
    },
    setLod(next: Lod): void {
      lod = next;
      count = next === 'low' ? COUNT_LOW : COUNT_HIGH;
    },
    cue(verb: string): void {
      if (verb === 'release') scatter = 1;
    },
    readiness(): number {
      return buffer ? 1 : 0.5;
    },
    dispose(): void {
      disposed = true;
      if (buffer) { buffer.width = 0; buffer.height = 0; }
      bctx = null;
    },
  };
}

/**
 * 零件定义。costMs：60 只 × O(n²) 邻域（3.6k 对）+ 天空带 clear/blit，实测约 0.6ms。
 */
export const part: PartV2 = {
  id: 'boids',
  layer: 'L2',
  blend: 'source-over',
  costMs: 0.7,
  kb: 2,
  z: 20,
  channel: 'canvas2d',
  expendable: true,
  create,
};

export default part;
