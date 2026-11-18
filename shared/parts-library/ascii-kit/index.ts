// 装配壳（契约 v1）：ascii-kit —— 唯一 depth=D4 零件：原件 lib/kit.js 纯 ESM，
// 本壳直接 import 并调用原件函数，零改写、零重写。
//
// 硬约束（T-R01）：
//   1. 构造期零 DOM / 零 canvas / 零 window —— Node 下 import + createPart 均安全；
//   2. 导出 createPart + manifest，声明 id 必须与 part.manifest.ts 一致；
//   3. 薄壳无重逻辑：ASCII 映射与 fbm 噪声全部落在原件里。
import type { PartInstance, PartOptions } from '../../contract/parts-registry';
import { RAMPS, fbm, ramp } from './lib/kit.js';
import manifest from './part.manifest';

export { manifest };

/** 零件 id（与 part.manifest.ts 一致，verify-parts-assembly Tier-1 断言）。 */
export const PART_ID: string = manifest.id;

/** 原件 RAMPS 的全部 ramp 名（取自 lib/kit.js 的对象键，不硬编码名单）。 */
const RAMP_NAMES: readonly string[] = Object.keys(RAMPS);

/** ramp 名 → 字符表（原件是对象，索引需先放宽为 Record 以免 TS7053）。 */
const RAMP_TABLE: Record<string, string> = RAMPS as unknown as Record<string, string>;

/** 结构判定：pipe 的噪声入参形状。 */
function isPoint(input: unknown): input is { x: number; y: number; seed?: number } {
  if (typeof input !== 'object' || input === null) return false;
  const candidate = input as { x?: unknown; y?: unknown; seed?: unknown };
  if (typeof candidate.x !== 'number' || typeof candidate.y !== 'number') return false;
  return candidate.seed === undefined || typeof candidate.seed === 'number';
}

/** 把任意数值夹到 0..1（原件 ramp() 期望的输入域）。 */
function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * 创建 ascii-kit 零件实例（无渲染副作用，只暴露纯数据通道）。
 *
 * @param options 契约 v1 工厂入参；`options.options.ramp` 选 ramp 名，
 *   `options.options.octaves` 覆盖原件 fbm 的默认 4 层。
 * @returns 实现 update/pipe/dispose 的实例；dispose 幂等。
 */
export function createPart(options: PartOptions): PartInstance {
  const requested = typeof options.options.ramp === 'string' ? options.options.ramp : 'classic';
  const rampName = RAMP_NAMES.includes(requested) ? requested : 'classic';
  const chars = RAMP_TABLE[rampName] ?? RAMP_TABLE.classic ?? '';
  const octaves = typeof options.options.octaves === 'number' ? options.options.octaves : 4;

  const state = { seconds: 0, frames: 0, disposed: false };

  return {
    update(seconds: number): void {
      if (state.disposed) return;
      state.seconds += seconds;
      state.frames += 1;
    },

    /**
     * number → 原件 ramp() 的 ASCII 字符；{x,y,seed} → 原件 fbm() 的噪声值。
     * @returns 字符 / 噪声值；未知输入返回 null（不抛错，pipe 是可选通道）。
     */
    pipe(input: unknown): unknown {
      if (state.disposed) return null;
      if (typeof input === 'number') return ramp(clamp01(input), chars);
      if (isPoint(input)) return fbm(input.x, input.y, octaves, input.seed ?? 0);
      return null;
    },

    dispose(): void {
      state.disposed = true;
      state.frames = 0;
    },
  };
}

export default createPart;
