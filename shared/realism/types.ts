import type * as THREE from 'three';

export type RealismPalette = 'dawn' | 'dusk' | 'snow' | 'night';

export interface SceneCamera {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly tx: number;
  readonly ty: number;
  readonly tz: number;
  readonly fov: number;
}

export interface SceneSky {
  readonly top: number;
  readonly horizon: number;
  readonly ground: number;
  readonly sunColor: number;
  readonly sunDir: readonly [number, number, number];
  readonly cloud: number;
  readonly haze: number;
  readonly sunSize: number;
}

export interface SceneFog {
  readonly color: number;
  readonly density: number;
}

export interface SceneLight {
  readonly sunDir: readonly [number, number, number];
  readonly sunColor: number;
  readonly sunIntensity: number;
  readonly hemiSky: number;
  readonly hemiGround: number;
  readonly hemiIntensity: number;
  readonly fillColor: number;
  readonly fillIntensity: number;
  readonly exposure: number;
}

export interface ScenePost {
  readonly bloomStrength: number;
  readonly bloomRadius: number;
  readonly bloomThreshold: number;
  readonly vignette: number;
  readonly grain: number;
  readonly aberration: number;
  readonly handHeld: number;
}

export interface SceneTerrain {
  readonly size: number;
  readonly mossColor: number;
  readonly soilColor: number;
  readonly pathWidth: number;
  readonly pathLength: number;
  readonly snow: boolean;
  readonly grass: number;
  readonly leaves: number;
  readonly stones: number;
}

export interface ModulePlacement {
  readonly id: string;
  readonly x?: number;
  readonly y?: number;
  readonly z?: number;
  readonly rot?: number;
  readonly scale?: number;
  readonly opts?: Readonly<Record<string, number | string | boolean>>;
}

export interface ScenePlan {
  readonly id: string;
  readonly label: string;
  readonly palette: RealismPalette;
  readonly camera: SceneCamera;
  readonly sky: SceneSky;
  readonly fog: SceneFog;
  readonly light: SceneLight;
  readonly post: ScenePost;
  readonly terrain: SceneTerrain;
  readonly modules: readonly ModulePlacement[];
}

export interface ModuleContext {
  readonly lab: import('./materials').MaterialLab;
  readonly plan: ScenePlan;
  readonly placement: ModulePlacement;
  readonly quality: 'low' | 'high';
  readonly rng: () => number;
  readonly width: number;
  readonly height: number;
}

export interface SceneModule {
  readonly id: string;
  readonly label: string;
  build(ctx: ModuleContext): THREE.Group;
}

export interface BuildResult {
  readonly scene: THREE.Scene;
  readonly group: THREE.Group;
  readonly tick: (time: number, dt: number) => void;
  readonly stats: { objects: number; triangles: number; modules: string[] };
  readonly dispose: () => void;
}
