// 装配壳（契约 v1）：dandelion —— 蒲公英草甸（D3 算法移植）。
//
// 本壳是**无渲染**的装配形态：只持有种子场、场景时钟与三状态机，供注册中心构造与单测；
// 真正的 Canvas 2D 绘制在 sites/hug/parts/dandelion.ts（与本壳共用 core/meadow.ts 的同一套数学）。
// 硬约束：构造期零 DOM / 零 canvas / 零 window —— Node 下 import + createPart 均安全。
import type { PartInstance, PartOptions } from '../../contract/parts-registry';
import manifest from './part.manifest';
import {
  DEFAULT_WIND,
  SEED_COUNT,
  buildSeedField,
  readFrame,
  releaseField,
  resetField,
  type SeedField,
  type SeedFrame,
} from './core/meadow';

export { manifest };

/** 零件 id（与 part.manifest.ts 一致）。 */
export const PART_ID: string = manifest.id;

/** 三状态：ready 花球完整 → drifting 正在脱落 → away 绒毛已消失。 */
export type MeadowPhase = 'ready' | 'drifting' | 'away';

/** 快照（pipe 的返回值，纯数据）。 */
export interface MeadowSnapshot {
  readonly state: MeadowPhase;
  readonly released: number;
  readonly seeds: number;
  readonly wind: number;
  readonly time: number;
  /** 已放飞种子中最大的 travel（秒）；未放飞为 0 */
  readonly maxTravel: number;
}

/**
 * 创建 dandelion 零件实例（纯状态机，不建 canvas、不建渲染器）。
 */
export function createPart(options: PartOptions): PartInstance {
  const configured = options?.options?.wind;
  const wind = typeof configured === 'number' ? configured : DEFAULT_WIND;

  const field: SeedField = buildSeedField();
  const frame: SeedFrame = { travel: 0, flying: 0, alpha: 0 };
  let phase: MeadowPhase = 'ready';
  let time = 0;
  let lastRelease = -1;
  let disposed = false;

  const snapshot = (): MeadowSnapshot => {
    let maxTravel = 0;
    if (phase !== 'ready') {
      for (let i = 0; i < field.count; i += 1) {
        readFrame(field, i, time, frame);
        if (frame.travel > maxTravel) maxTravel = frame.travel;
      }
    }
    return { state: phase, released: phase === 'ready' ? 0 : field.count, seeds: SEED_COUNT, wind, time, maxTravel };
  };

  return {
    update(seconds: number): void {
      if (disposed) return;
      const dt = Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 0.1) : 0;
      time += dt;
      if (phase === 'drifting' && lastRelease >= 0 && time > lastRelease + 10) phase = 'away';
    },

    /** 输入：'release' 放飞 / 'reset' 重新长满 / 其余原样回显快照。 */
    pipe(input: unknown): unknown {
      if (disposed) return null;
      if (input === 'release' && phase === 'ready') {
        lastRelease = time;
        releaseField(field, time);
        phase = 'drifting';
      } else if (input === 'reset') {
        resetField(field);
        phase = 'ready';
        lastRelease = -1;
      }
      return snapshot();
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      resetField(field);
      phase = 'ready';
    },
  };
}

export default createPart;
