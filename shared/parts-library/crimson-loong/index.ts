// 装配壳（契约 v1）：crimson-loong —— 原件 60_dragon.js / 15_tex.js / 00_util.js 是
// 依赖全局 THREE 的浏览器脚本（模块顶层即 `new THREE.Vector3()`），不能在壳里 import。
//
// /license 的 Canvas 2D 印章时间轴（verifying→stamping→approved）是该零件 depth=D2 的落地形态。
// 硬约束：构造期零 DOM / 零 canvas / 零 window。
import type { PartInstance, PartOptions } from '../../contract/parts-registry';
import manifest from './part.manifest';

export { manifest };

/** 零件 id（与 part.manifest.ts 一致）。 */
export const PART_ID: string = manifest.id;

/** 原件 60_dragon.js: `const MAXROLL = rad(5)` —— 环框最大滚转角。 */
const MAX_ROLL_DEGREES = 5;

/** 原件 00_util.js: `const TAU = Math.PI * 2`。 */
const TAU = Math.PI * 2;

/** /license 取的事件表顺序（原件事件表按此顺序推进，见 manifest.note）。 */
const PHASES = ['verifying', 'stamping', 'approved'] as const;

type LoongPhase = (typeof PHASES)[number];

/** 把归一化进度映射到三阶段（0..1/3 → verifying，依此类推）。 */
function phaseAt(progress: number): LoongPhase {
  const clamped = progress < 0 ? 0 : progress > 1 ? 1 : progress;
  const index = Math.min(PHASES.length - 1, Math.floor(clamped * PHASES.length));
  return PHASES[index] ?? PHASES[0];
}

/**
 * 创建 crimson-loong 零件实例（时间轴状态机，不建几何/纹理）。
 *
 * @param options 契约 v1 工厂入参；`options.options.duration` 为一轮周期秒数，默认 1。
 * @returns 实例：update 推进时间轴；pipe(progress) 返回阶段与滚转上限。
 */
export function createPart(options: PartOptions): PartInstance {
  const duration = typeof options.options.duration === 'number' && options.options.duration > 0
    ? options.options.duration
    : 1;
  const state = { seconds: 0, phase: PHASES[0] as LoongPhase, disposed: false };

  return {
    update(seconds: number): void {
      if (state.disposed) return;
      state.seconds = (state.seconds + seconds) % duration;
      state.phase = phaseAt(state.seconds / duration);
    },

    /** 显式给定进度（0..1）→ 阶段 + 该阶段的滚转上限（弧度）。 */
    pipe(input: unknown): unknown {
      if (state.disposed) return null;
      const progress = typeof input === 'number' && !Number.isNaN(input) ? Math.min(1, Math.max(0, input)) : 0;
      return {
        progress,
        phase: phaseAt(progress),
        rollLimitRadians: (MAX_ROLL_DEGREES * Math.PI) / 180,
        turnRadians: TAU * progress,
      };
    },

    dispose(): void {
      state.disposed = true;
      state.seconds = 0;
      state.phase = PHASES[0];
    },
  };
}

export default createPart;
