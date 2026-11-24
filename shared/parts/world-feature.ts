// 场景内部件契约：WorldFeature。
//
// 这层不替代站点级 PartV2。PartV2 负责“占一个站点槽位、自己画、自己释放”；
// WorldFeature 只负责“被某个 world 宿主装进去的一件东西”，共享宿主的
// scene / camera / renderer / time。把两者混在一起会让“内部件”被误注册成
// 可单选零件，所以这里单独定义，并且不接入 parts registry。
//
// 约定：
// - build 可以同步或异步；返回 Object3D 时宿主会挂到该 feature 的 root 下。
// - build 也可以直接把对象加到 ctx.root；返回 void 同样合法。
// - dispose 由 feature 自己负责释放自己创建的资源；默认不递归 dispose root，
//   因为多个 feature 可能共享同一组材质/贴图（例如 room-at-dawn 的 M）。
// - 需要递归释放时显式声明 disposeRoot: true。
import * as THREE from 'three';

export type WorldFeatureQuality = 'low' | 'high';

export interface WorldFeatureBuildContext {
  /** 宿主场景。 */
  readonly scene: THREE.Scene;
  /** 宿主相机；纯装配件可以不用。 */
  readonly camera: THREE.Camera | null;
  /** 宿主渲染器；WebGL/WebGPU 都可能，具体类型由宿主决定。 */
  readonly renderer: unknown;
  /** 该 feature 专属容器；宿主已把它挂到 scene 下。 */
  readonly root: THREE.Group;
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
  readonly quality: WorldFeatureQuality;
  readonly rng: () => number;
}

export interface WorldFeatureFrame {
  readonly time: number;
  readonly dt: number;
  readonly width: number;
  readonly height: number;
}

export interface WorldFeatureDrawContext {
  readonly renderer: unknown;
  readonly scene: THREE.Scene;
  readonly camera: THREE.Camera | null;
}

export interface WorldFeature {
  readonly id: string;
  readonly label?: string;
  /** 装配顺序；数值小的先 build。 */
  readonly order?: number;
  build?(ctx: WorldFeatureBuildContext): THREE.Object3D | void | Promise<THREE.Object3D | void>;
  update?(frame: WorldFeatureFrame): void;
  /** 有些 feature 需要自己发一次 draw（例如全屏后处理）；普通 3D 件不用。 */
  draw?(ctx: WorldFeatureDrawContext): void;
  dispose?(): void;
  /** 默认 false：共享材质的 feature 不应被宿主递归 dispose。 */
  readonly disposeRoot?: boolean;
  debug?(): unknown;
}

export interface WorldFeatureHostOptions {
  readonly scene: THREE.Scene;
  camera?: THREE.Camera | null;
  renderer?: unknown;
  width: number;
  height: number;
  dpr?: number;
  quality?: WorldFeatureQuality;
  seed?: number;
}

interface MountedFeature {
  readonly feature: WorldFeature;
  readonly root: THREE.Group;
}

function seedRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * 最小 WorldFeature 宿主。
 *
 * 它不做站点级槽位校验，也不接管整场唯一 GL 画布；它只解决“一个 world
 * 内部，多个 feature 怎么按顺序 build/update/dispose”这一件事。
 */
export class WorldFeatureHost {
  readonly scene: THREE.Scene;
  readonly camera: THREE.Camera | null;
  readonly renderer: unknown;
  private readonly rng: () => number;
  private readonly mounted = new Map<string, MountedFeature>();
  private width: number;
  private height: number;
  private dpr: number;
  private quality: WorldFeatureQuality;
  private disposed = false;

  constructor(options: WorldFeatureHostOptions) {
    this.scene = options.scene;
    this.camera = options.camera ?? null;
    this.renderer = options.renderer;
    this.width = options.width;
    this.height = options.height;
    this.dpr = options.dpr ?? 1;
    this.quality = options.quality ?? 'high';
    this.rng = seedRng(options.seed ?? 20261124);
  }

  /** 按 order 排序后逐个 build；同一 id 重复装配直接报错。 */
  async addMany(features: readonly WorldFeature[]): Promise<void> {
    const sorted = [...features].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    for (const feature of sorted) await this.add(feature);
  }

  async add(feature: WorldFeature): Promise<void> {
    if (this.disposed) throw new Error('WorldFeatureHost disposed');
    if (this.mounted.has(feature.id)) throw new Error(`duplicate WorldFeature: ${feature.id}`);
    const root = new THREE.Group();
    root.name = `feature:${feature.id}`;
    this.scene.add(root);
    const ctx: WorldFeatureBuildContext = {
      scene: this.scene,
      camera: this.camera,
      renderer: this.renderer,
      root,
      width: this.width,
      height: this.height,
      dpr: this.dpr,
      quality: this.quality,
      rng: this.rng,
    };
    const built = await feature.build?.(ctx);
    if (built) root.add(built);
    this.mounted.set(feature.id, { feature, root });
  }

  remove(id: string): boolean {
    const entry = this.mounted.get(id);
    if (!entry) return false;
    entry.feature.dispose?.();
    entry.root.removeFromParent();
    if (entry.feature.disposeRoot) disposeObject(entry.root);
    this.mounted.delete(id);
    return true;
  }

  update(time: number, dt: number): void {
    if (this.disposed) return;
    const frame: WorldFeatureFrame = { time, dt, width: this.width, height: this.height };
    for (const { feature } of this.mounted.values()) feature.update?.(frame);
  }

  draw(): void {
    if (this.disposed) return;
    for (const { feature } of this.mounted.values()) {
      feature.draw?.({ renderer: this.renderer, scene: this.scene, camera: this.camera });
    }
  }

  setSize(width: number, height: number, dpr = this.dpr): void {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
  }

  setQuality(quality: WorldFeatureQuality): void {
    this.quality = quality;
  }

  debug(): Array<{ id: string; label?: string; order: number; children: number; objects: number; triangles: number }> {
    const rows = [];
    for (const { feature, root } of this.mounted.values()) {
      let objects = 0;
      let triangles = 0;
      root.traverse((o) => {
        objects += 1;
        const g = (o as THREE.Mesh).geometry;
        if (g && typeof g.index?.count === 'number') triangles += g.index.count / 3;
        else if (g && typeof g.getAttribute === 'function') {
          const pos = g.getAttribute('position');
          if (pos) triangles += pos.count / 3;
        }
      });
      rows.push({
        id: feature.id,
        label: feature.label,
        order: feature.order ?? 0,
        children: root.children.length,
        objects,
        triangles: Math.round(triangles),
      });
    }
    return rows;
  }

  dispose(): void {
    if (this.disposed) return;
    for (const { feature, root } of [...this.mounted.values()]) {
      feature.dispose?.();
      root.removeFromParent();
      if (feature.disposeRoot) disposeObject(root);
    }
    this.mounted.clear();
    this.disposed = true;
  }
}

/** 显式请求时才会走这里；共享材质不要调用。 */
function disposeObject(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else if (mat) mat.dispose();
  });
}
