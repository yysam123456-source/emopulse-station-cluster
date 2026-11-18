// 装配壳（契约 v1）：koi —— 原件是整页 three.js 三着色器应用（模块顶层读 location /
// matchMedia / localStorage），因此**不得**在壳里静态 import；壳只做生命周期装配。
//
// 视觉移植落在 koi-pond / koi-ink / koi-watercolor 三站的 Canvas 2D 产物里（depth=D2）。
// 硬约束：构造期零 DOM / 零 canvas / 零 window —— Node 下 import + createPart 均安全。
import type { PartInstance, PartOptions } from '../../contract/parts-registry';
import manifest from './part.manifest';

export { manifest };

/** 零件 id（与 part.manifest.ts 一致）。 */
export const PART_ID: string = manifest.id;

/** 水面同时保留的涟漪数上限（原件 glsl.js: `export const MAXR = 24`）。 */
const MAX_RIPPLES = 24;

/** 原件 main.js 的三种风格（style 参数域：ink | paint | real）。 */
const STYLES = ['ink', 'paint', 'real'] as const;

type KoiStyle = (typeof STYLES)[number];

/** 把配置值归一化到合法风格，非法值回落到原件默认 'ink'。 */
function normalizeStyle(value: unknown): KoiStyle {
  return typeof value === 'string' && (STYLES as readonly string[]).includes(value)
    ? (value as KoiStyle)
    : 'ink';
}

/**
 * 创建 koi 零件实例（纯状态机，不建 renderer / 不建 canvas）。
 *
 * @param options 契约 v1 工厂入参；`options.options.style` 选 ink/paint/real。
 * @returns 实例：update 累计时间；pipe 计一次涟漪并返回受 MAXR 约束的状态快照。
 */
export function createPart(options: PartOptions): PartInstance {
  const state = {
    style: normalizeStyle(options.options.style),
    seconds: 0,
    ripples: 0,
    disposed: false,
  };

  return {
    update(seconds: number): void {
      if (state.disposed) return;
      state.seconds += seconds;
    },

    /** 一次输入 → 一次涟漪（上限沿用原件 MAXR=24）。 */
    pipe(input: unknown): unknown {
      if (state.disposed) return null;
      state.ripples = Math.min(MAX_RIPPLES, state.ripples + 1);
      return { style: state.style, ripples: state.ripples, seconds: state.seconds, input };
    },

    dispose(): void {
      state.disposed = true;
      state.ripples = 0;
    },
  };
}

export default createPart;
