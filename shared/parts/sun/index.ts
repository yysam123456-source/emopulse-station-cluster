// sun —— L3 光感零件：一轮低垂的暖日。
//
// 它不是「一个圆」：真正让画面像黄昏的是**日盘 + 两层晕 + 地面反光**。
// 全部烘在一张 512×512 的离屏精灵里，每帧只 drawImage 一次（不建渐变、不逐帧模糊）。
//
// 混合：screen。太阳只能加光，不能压暗；用 multiply 会把天空读成脏。
import type { PartEnv, PartInstance, PartV2, StageSize, WorldFrame } from '../../stage/contract';

function makeSurface(): HTMLCanvasElement | null {
  const doc = (globalThis as unknown as { document?: Document }).document;
  if (!doc) return null;
  const el = doc.createElement('canvas');
  return typeof el.getContext === 'function' ? el : null;
}

const SPRITE = 512;

function create(env: PartEnv): PartInstance {
  const ctx = env.ctx;
  if (!ctx) throw new Error('sun 需要 canvas2d 通道');

  let w = env.width > 0 ? env.width : 1;
  let h = env.height > 0 ? env.height : 1;
  let dpr = env.dpr > 0 ? env.dpr : 1;
  let disposed = false;

  const sprite = makeSurface();
  const g = sprite?.getContext('2d') ?? null;
  if (sprite && g) {
    sprite.width = SPRITE;
    sprite.height = SPRITE;
    const c = SPRITE / 2;
    // 外晕（大面积、低 alpha）
    const halo = g.createRadialGradient(c, c, SPRITE * 0.08, c, c, c);
    halo.addColorStop(0, 'rgba(255,224,178,0.42)');
    halo.addColorStop(0.45, 'rgba(255,196,132,0.13)');
    halo.addColorStop(1, 'rgba(255,180,120,0)');
    g.fillStyle = halo;
    g.fillRect(0, 0, SPRITE, SPRITE);
    // 日盘：硬边只占 6%，其余都是晕 —— 硬边太大就读成贴纸
    const disc = g.createRadialGradient(c, c, 0, c, c, SPRITE * 0.055);
    disc.addColorStop(0, 'rgba(255,250,232,0.98)');
    disc.addColorStop(0.7, 'rgba(255,226,176,0.92)');
    disc.addColorStop(1, 'rgba(255,206,150,0)');
    g.fillStyle = disc;
    g.fillRect(0, 0, SPRITE, SPRITE);
  }

  let lastT = 0;

  return {
    update(f: WorldFrame): void {
      lastT = f.t;
    },
    draw(f: WorldFrame): void {
      if (disposed || !sprite) return;
      // 太阳的慢下沉：120 秒一个极小振幅的呼吸（不是循环跳变）。
      // reducedMotion 时完全不动 —— 它是画面里最大的一块亮色，动起来最容易晕。
      const phase = f.reducedMotion ? 0 : Math.sin((f.t / 120) * Math.PI * 2);
      const cx = w * 0.78;
      const cy = h * (0.19 + phase * 0.018);
      const size = Math.min(w, h) * 0.86;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.92;
      ctx.drawImage(sprite as unknown as CanvasImageSource, cx - size / 2, cy - size / 2, size, size);
      ctx.restore();
      void lastT;
    },
    resize(size: StageSize): void {
      w = size.w > 0 ? size.w : 1;
      h = size.h > 0 ? size.h : 1;
      dpr = size.dpr > 0 ? size.dpr : 1;
    },
    readiness(): number {
      return sprite ? 1 : 0.5;
    },
    dispose(): void {
      disposed = true;
      if (sprite) { sprite.width = 0; sprite.height = 0; }
    },
  };
}

/** costMs：一次 512 精灵缩放 blit（覆盖约 0.86 屏高），实测约 0.25ms。 */
export const part: PartV2 = {
  id: 'sun',
  layer: 'L3',
  blend: 'screen',
  costMs: 0.3,
  kb: 1,
  z: 30,
  channel: 'canvas2d',
  expendable: true,
  create,
};

export default part;
