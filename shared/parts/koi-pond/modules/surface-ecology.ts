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
    this.composePads(hx, hy);
  }

  /**
   * 池边不是一圈装饰框：右下角一组大莲叶压住池沿，右侧中段一小簇过渡，左下角两点收住构图。
   * 原站的三个边缘簇在上方也放叶，首屏会压住左上角 H1；这里把上边留成干净纸面。
   */
  private composePads(hx: number, hy: number): void {
    const clusters: ReadonlyArray<readonly [number, number, number]> = [
      [0.84, -0.66, 4],
      [0.90, 0.02, 3],
      [-0.86, -0.86, 2],
    ];
    const pads = this.surface.pads as any[];
    let index = 0;
    for (const [cx, cy, count] of clusters) {
      for (let j = 0; j < count; j += 1) {
        const p = pads[index];
        index += 1;
        if (!p) break;
        const off = j === 0 ? [0, 0] : [0.16 + j * 0.05, -0.05 + j * 0.13];
        p.ax = cx * hx + off[0];
        p.ay = cy * hy + off[1];
        p.x = p.ax;
        p.y = p.ay;
        p.vx = 0;
        p.vy = 0;
      }
    }
  }

  update(state: any): void {
    this.surface.update(state);
  }

  dropPellets(x: number, y: number, n: number, rippleFn: (x: number, y: number, a?: number) => void): void {
    this.surface.dropPellets(x, y, n, rippleFn);
  }
}
