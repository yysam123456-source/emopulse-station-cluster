import * as THREE from 'three';

export const FOV = 30;
/** 原件 `main.js` 的相机角度：elevation from straight down。 */
export const CAM_EL: Readonly<Record<string, number>> = { top: 0, angle: 0.62, orbit: 0.62 };
export const EL_MAX = 0.8;

export interface CameraRigOptions {
  readonly cam: THREE.PerspectiveCamera;
  readonly view: { hx: number; hy: number; H: number };
  readonly depth: number;
  readonly mode: string;
  readonly style: string;
}

/** 镜头零件：球面轨道、elevation 缓动、最斜视角覆盖半径；不碰鱼的模拟。 */
export class CameraRig {
  readonly target: THREE.Vector3;
  el: number;
  az = 0;
  elT: number;
  azT = 0;
  mode: string;
  style: string;
  private readonly cam: THREE.PerspectiveCamera;
  private readonly view: { hx: number; hy: number; H: number };
  private readonly depth: number;

  constructor(opts: CameraRigOptions) {
    this.cam = opts.cam;
    this.view = opts.view;
    this.depth = opts.depth;
    this.mode = opts.mode;
    this.style = opts.style;
    this.target = new THREE.Vector3(0, 0, -opts.depth * 0.55);
    this.el = CAM_EL[opts.mode] ?? 0;
    this.elT = this.el;
  }

  get angled(): boolean {
    return this.style === 'real' && this.mode !== 'top';
  }

  setStyle(style: string): void {
    this.style = style;
  }

  setMode(mode: string): void {
    this.mode = mode;
    this.elT = CAM_EL[mode] ?? 0;
  }

  camDist(el: number): number {
    return (this.view.H - this.target.z) * (1 - 0.22 * Math.sin(el));
  }

  place(el: number, az: number, tx = 0, ty = 0): void {
    const R = this.camDist(el);
    const s = Math.sin(el);
    this.cam.position.set(
      this.target.x - R * s * Math.sin(az) + tx * this.view.H * 0.09,
      this.target.y - R * s * Math.cos(az) + ty * this.view.H * 0.09,
      this.target.z + R * Math.cos(el),
    );
    this.cam.up.set(Math.sin(az), Math.cos(az), 0);
    this.cam.lookAt(this.target);
    this.cam.updateMatrixWorld();
  }

  step(dt: number, interacting: boolean): void {
    if (!this.angled) {
      this.elT = 0;
      this.azT = Math.round(this.azT / 6.2832) * 6.2832;
    } else if (this.mode === 'orbit' && !interacting) {
      this.azT += dt * 0.025;
    }
    const e = Math.min(1, dt * 2.5);
    this.el += (this.elT - this.el) * e;
    this.az += (this.azT - this.az) * e;
  }

  /** 池底必须覆盖最斜视角能看到的范围；正上方只需要覆盖当前视口，再留 tilt 余量。 */
  reach(): number {
    this.place(EL_MAX, 0);
    this.cam.updateProjectionMatrix();
    let rho = Math.max(this.view.hx, this.view.hy);
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const v = new THREE.Vector3(sx, sy, 0.5).unproject(this.cam).sub(this.cam.position).normalize();
      const t = (-this.depth - this.cam.position.z) / v.z;
      rho = Math.max(rho, Math.hypot(this.cam.position.x + v.x * t, this.cam.position.y + v.y * t));
    }
    return Math.min(rho * 1.05, 14);
  }
}
