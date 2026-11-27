import { Koi, RESIDENTS } from '../../../parts-library/koi/koi.js';
import { glaze } from '../../../parts-library/koi/paint.js';

/**
 * 产品级出生构图：一条从画面左下到右上的斜向鱼群，中心留一口呼吸；
 * 坐标归一化到视口半宽/半高，鱼的体长再留 0.35 余量，首屏不再有半条鱼切在边上。
 * 原站是 1.2×2 的随机撒点，在 ink 的 0.8 半高视口里一半鱼出生在画外，才读成「鱼挤四边、中心空」。
 */
const SPAWN: ReadonlyArray<readonly [number, number, number]> = [
  // 左下簇：四条鱼压住池角，朝右上
  [-0.90, -0.55, 0.45],
  [-0.62, -0.30, 0.72],
  [-0.34, -0.50, 0.28],
  [-0.70, -0.10, 1.05],
  // 中央：三条鱼守住空水，不排成直线
  [-0.10, 0.02, 0.10],
  [0.16, 0.22, 2.75],
  [-0.22, 0.24, 4.20],
  // 右上簇：四条鱼靠池沿，朝左下
  [0.58, 0.38, 2.95],
  [0.86, 0.16, 0.05],
  [0.62, 0.55, -1.57],
  [0.90, 0.48, 0.00],
];

export interface FishSchoolOptions {
  readonly scene: any;
  readonly shadowScene: any;
  readonly shared: any;
  readonly rng: () => number;
  readonly count: number;
}

/** 鱼群零件：只负责 Koi 实例、鱼体/鱼影挂载和数量增减；水体与后期不归它管。 */
export class FishSchool {
  readonly fish: any[] = [];
  private readonly scene: any;
  private readonly shadowScene: any;
  private readonly shared: any;
  private readonly rng: () => number;

  constructor(opts: FishSchoolOptions) {
    this.scene = opts.scene;
    this.shadowScene = opts.shadowScene;
    this.shared = opts.shared;
    this.rng = opts.rng;
    this.add(opts.count);
  }

  add(n: number): void {
    for (let i = 0; i < n; i += 1) {
      const [variety, L, long] = RESIDENTS[this.fish.length % RESIDENTS.length] as [string, number, boolean?];
      const k = new Koi({
        variety,
        L: L * (0.92 + this.rng() * 0.16),
        long,
        seed: this.rng() * 1000,
        // 原件：整池范围 1.2 × 2；保持这个值，鱼不会一出生就挤在中心。
        x: (this.rng() * 2 - 1) * 1.2,
        y: (this.rng() * 2 - 1) * 2,
        h: this.rng() * 6.28,
        shared: this.shared,
      });
      this.fish.push(k);
      this.scene.add(k.body, k.fins);
      this.shadowScene.add(k.sBody, k.sFins);
    }
  }

  /**
   * 首屏排位：只改出生点与朝向，不改 Koi 的模拟。
   * 11 条鱼按 SPAWN 等距取样；手机 9 条、降档 7 条也沿着同一条斜线抽点，不另造一套构图。
   */
  arrange(hx: number, hy: number): void {
    const n = this.fish.length;
    for (let i = 0; i < n; i += 1) {
      const pick = n === SPAWN.length
        ? i
        : Math.round((i * (SPAWN.length - 1)) / Math.max(1, n - 1));
      const [nx, ny, h] = SPAWN[pick]!;
      const ring = Math.floor(i / SPAWN.length);
      const k = this.fish[i]!;
      k.x = (nx + ring * 0.05) * hx;
      k.y = (ny - ring * 0.04) * hy;
      k.h = h;
      k.v = k.L * 0.16;
      k.omega = 0;
      k.boost = 0;
      k.diveUntil = 0;
      k.updateSpine(1 / 30);
    }
  }

  setCount(want: number): void {
    if (want > this.fish.length) {
      this.add(want - this.fish.length);
      return;
    }
    for (let i = this.fish.length - 1; i >= want; i -= 1) {
      const k = this.fish.pop();
      this.scene.remove(k.body, k.fins);
      this.shadowScene.remove(k.sBody, k.sFins);
    }
  }

  setPainted(painted: boolean): void {
    for (const k of this.fish) glaze(k.fins.material, painted);
  }

  update(dt: number, world: any): void {
    for (const k of this.fish) k.update(dt, world);
  }

  dispose(): void {
    this.setCount(0);
  }
}
