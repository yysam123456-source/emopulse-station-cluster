// still-sink —— L3 沉水层：240 秒里，画面像被水慢慢吞掉。
//
// 为什么是 multiply 而不是「加一层黑」：加黑会同时提高对比（黑得更黑），
// 读成「关灯」；multiply 保留亮部、压暗中间调，读成「光被水吸收了」。
//
// 它依赖 L0（tide-medium）每帧铺满不透明底 —— 所以每帧重新乘是安全的，
// 不会把上一帧的暗度累加。若把本件装到没有不透明 L0 的站，会越叠越黑（契约层的
// `E_NO_BASE` 只保证有 L0/L1，不保证 L0 不透明；这是站点装配的责任）。
import type { PartEnv, PartInstance, PartV2, StageSize, WorldFrame } from '../../stage/contract';

/** 完全沉下去的时间（秒）。不是动画时长，是用户停留尺度。 */
const SINK_SECONDS = 240;

/** 最终暗度（alpha）。0.35 时仍能看清珊瑚，再深就读成黑屏。 */
const MAX_ALPHA = 0.35;

function create(env: PartEnv): PartInstance {
  const ctx = env.ctx;
  if (!ctx) throw new Error('still-sink 需要 canvas2d 通道');

  let w = env.width > 0 ? env.width : 1;
  let h = env.height > 0 ? env.height : 1;
  let gradient: CanvasGradient | null = null;
  let disposed = false;

  const build = (): void => {
    gradient = ctx.createLinearGradient(0, 0, 0, h);
    // 上浅下深：水越深越暗，不是整屏均匀压暗
    gradient.addColorStop(0, 'rgba(14,30,38,0.10)');
    gradient.addColorStop(0.55, 'rgba(10,24,32,0.52)');
    gradient.addColorStop(1, 'rgba(4,12,18,0.88)');
  };
  build();

  return {
    draw(f: WorldFrame): void {
      if (disposed || !gradient) return;
      const p = Math.min(1, Math.max(0, f.t / SINK_SECONDS));
      // smoothstep：前 30 秒几乎无感，最后 60 秒明显，但不做「突然黑屏」
      const eased = p * p * (3 - 2 * p);
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = MAX_ALPHA * eased;
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    },
    resize(size: StageSize): void {
      w = size.w > 0 ? size.w : 1;
      h = size.h > 0 ? size.h : 1;
      build();
    },
    readiness(): number {
      return 1;
    },
    dispose(): void {
      disposed = true;
      gradient = null;
    },
  };
}

/** costMs：一次全屏线性渐变填充（预建 gradient，不逐帧创建），实测约 0.6ms。 */
export const part: PartV2 = {
  id: 'still-sink',
  layer: 'L3',
  blend: 'multiply',
  costMs: 0.6,
  kb: 1,
  z: 40,
  channel: 'canvas2d',
  expendable: true,
  create,
};

export default part;
