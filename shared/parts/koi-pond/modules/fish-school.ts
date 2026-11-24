import { Koi, RESIDENTS } from '../../../parts-library/koi/koi.js';
import { glaze } from '../../../parts-library/koi/paint.js';

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
