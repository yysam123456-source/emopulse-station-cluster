// 装配壳（契约 v1）：grand-atelier —— 原件 piano-model.ts 依赖 three/addons + 4 个未入库模块
//（./music、./piano-keyboard、./piano-acoustics、./piano-pedals），因此壳不 import 原件。
//
// /license 的「按钮→印章→出证」联动是该零件 depth=D2 的落地形态（见 manifest.note）。
// 硬约束：构造期零 DOM / 零 canvas / 零 window。
import type { PartInstance, PartOptions } from '../../contract/parts-registry';
import manifest from './part.manifest';

export { manifest };

/** 零件 id（与 part.manifest.ts 一致）。 */
export const PART_ID: string = manifest.id;

/** 原件 piano-action.ts: `export const HAMMER_STROKE_SECONDS = .13`。 */
const HAMMER_STROKE_SECONDS = 0.13;

/** 原件 piano-action.ts: `export const HAMMER_ATTACK_SECONDS = .027`。 */
const HAMMER_ATTACK_SECONDS = 0.027;

/** 键位下沉量的合法域（原件 ACTION.keyAngle = .023 为静息角，联动按 0..1 归一化表达）。 */
function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * 创建 grand-atelier 零件实例（击弦机时序占位，不建 three 场景）。
 *
 * @param options 契约 v1 工厂入参；`options.options.pedal` 仅记录，不改变时序。
 * @returns 实例：update 累计时间；pipe(depression) 返回该下沉量对应的击弦时序。
 */
export function createPart(options: PartOptions): PartInstance {
  const state = { seconds: 0, lastDepression: 0, disposed: false };

  return {
    update(seconds: number): void {
      if (state.disposed) return;
      state.seconds += seconds;
    },

    /** 下沉量（0..1）→ 原件击弦时长常量（stroke / attack）。 */
    pipe(input: unknown): unknown {
      if (state.disposed) return null;
      const depression = typeof input === 'number' ? clamp01(input) : 0;
      state.lastDepression = depression;
      return {
        depression,
        strokeSeconds: HAMMER_STROKE_SECONDS,
        attackSeconds: HAMMER_ATTACK_SECONDS,
        seconds: state.seconds,
      };
    },

    dispose(): void {
      state.disposed = true;
      state.lastDepression = 0;
    },
  };
}

export default createPart;
