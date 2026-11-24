import type { Lod, WorldFrame } from '../../../stage/contract';
import type { AbyssPalette } from '../palette';

/** 所有水层共享的只读状态；图层自己只持有所需的私有数组/缓存。 */
export interface AbyssView {
  w: number;
  h: number;
  dpr: number;
  lod: Lod;
  time: number;
  palette: AbyssPalette;
  density: number;
  rayAmount: number;
  causticAmount: number;
  vignette: boolean;
}

/** 一个可独立增删、调序、关闭的 2D 水层零件。 */
export interface AbyssLayer {
  readonly id: string;
  readonly label: string;
  /** 尺寸/DPR 变化时重建自己的离屏缓存；没有缓存的层可以省略。 */
  resize?(view: AbyssView): void;
  /** 推进自身状态；motes/ripples 这类层需要，静态层可以省略。 */
  update?(frame: WorldFrame, view: AbyssView): void;
  draw(g: CanvasRenderingContext2D, frame: WorldFrame, view: AbyssView): void;
  dispose?(): void;
}
