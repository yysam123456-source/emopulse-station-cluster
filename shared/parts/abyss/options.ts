import type { AbyssPalette } from './palette';

export interface AbyssOptions {
  readonly palette?: AbyssPalette;
  /** 微粒密度倍率，0.4–1.6；默认 1。 */
  readonly density?: number;
  /** 光柱强度，0–1；默认 0.55。 */
  readonly rays?: number;
  /** 焦散强度，0–1；默认 0.35。 */
  readonly caustics?: number;
  /** 是否保留暗角；默认 true。 */
  readonly vignette?: boolean;
}
