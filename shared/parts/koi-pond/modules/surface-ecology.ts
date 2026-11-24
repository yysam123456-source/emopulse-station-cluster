import { Surface, seasonNow } from '../../../parts-library/koi/surface.js';

export interface SurfaceEcologyOptions {
  readonly shared: any;
  readonly scene: any;
  readonly shadowScene: any;
  readonly seed: number;
  readonly season?: string;
}

/** 浮萍/浮叶/投食生态：一个独立场景层，水体只通过 layout/update 驱动它。 */
export class SurfaceEcology {
  readonly surface: any;

  constructor(opts: SurfaceEcologyOptions) {
    this.surface = new Surface(opts.shared, {
      season: opts.season ?? seasonNow(),
      seed: opts.seed,
    });
    opts.scene.add(this.surface.scene);
    opts.shadowScene.add(this.surface.shadow);
  }

  get pads(): any[] {
    return this.surface.pads;
  }

  get pellets(): any {
    return this.surface.pellets;
  }

  layout(hx: number, hy: number, scale: number): void {
    this.surface.layout(hx, hy, scale);
  }

  update(state: any): void {
    this.surface.update(state);
  }

  dropPellets(x: number, y: number, n: number, rippleFn: (x: number, y: number, a?: number) => void): void {
    this.surface.dropPellets(x, y, n, rippleFn);
  }
}
