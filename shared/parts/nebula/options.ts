import type { NebulaPalette } from './palette';

export interface NebulaOptions {
  /** 色板；默认 `violet`。 */
  readonly palette?: NebulaPalette;
  /** 粒子密度倍率，0.45–1.35；默认 1。 */
  readonly density?: number;
  /** 星系整体半径，0.6–1.6；默认 1。 */
  readonly scale?: number;
  /** 自转速度倍率，0.2–2；默认 1。 */
  readonly speed?: number;
  /** 指针按下时的脉冲强度，0–1；默认 0.55。 */
  readonly pulse?: number;
  /** 是否绘制中心核球光晕；默认 true。 */
  readonly coreGlow?: boolean;
  /** 是否绘制背景星场；默认 true。 */
  readonly starfield?: boolean;
}
