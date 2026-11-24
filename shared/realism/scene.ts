import * as THREE from 'three';
import { MaterialLab } from './materials';
import { countTriangles, disposeObject, mergeStatic } from './primitives';
import type { BuildResult, ModuleContext, SceneModule, ScenePlan } from './types';
import { groundModule } from './modules/ground';
import { hallModule } from './modules/hall';
import { toriiModule } from './modules/torii';
import { lanternModule } from './modules/lanterns';
import { pinesModule } from './modules/pines';
import { atmosphereModule } from './modules/atmosphere';
import { ridgeModule } from './modules/ridge';

export const SCENE_MODULES: Readonly<Record<string, SceneModule>> = {
  atmosphere: atmosphereModule,
  ground: groundModule,
  ridge: ridgeModule,
  'shrine-hall': hallModule,
  torii: toriiModule,
  'stone-lanterns': lanternModule,
  'pine-grove': pinesModule,
};

const MERGE: Readonly<Record<string, boolean>> = {
  atmosphere: false,
  ground: true,
  ridge: false,
  'shrine-hall': true,
  torii: true,
  'stone-lanterns': true,
  'pine-grove': true,
};

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function buildScene(
  renderer: THREE.WebGLRenderer,
  plan: ScenePlan,
  quality: 'low' | 'high',
  opts: { width: number; height: number; fog: number; lanterns: number; modules?: readonly string[] },
): BuildResult {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(plan.fog.color, plan.fog.density * Math.max(0, opts.fog));
  scene.background = new THREE.Color(plan.fog.color);
  const lab = new MaterialLab(renderer, plan.palette, plan.terrain.snow);
  const root = new THREE.Group();
  root.name = 'scene-plan';
  scene.add(root);
  const seed = 38417;
  const r = rng(seed);
  const lights: THREE.PointLight[] = [];
  const animated: Array<{ kind: 'sky'; u: Record<string, THREE.IUniform> } | { kind: 'dust'; u: Record<string, THREE.IUniform> }> = [];
  const moduleIds: string[] = [];

  for (const placement of plan.modules) {
    if (opts.modules && !opts.modules.includes(placement.id)) continue;
    const def = SCENE_MODULES[placement.id];
    if (!def) continue;
    const ctx: ModuleContext = {
      lab,
      plan,
      placement,
      quality,
      rng: r,
      width: opts.width,
      height: opts.height,
    };
    const g = def.build(ctx);
    // 模板级开关：灯笼强度、雾量在这里统一覆盖，模块内部不再各自造一套参数。
    if (placement.id === 'stone-lanterns') {
      const lightsHere = g.children.filter((o): o is THREE.PointLight => o instanceof THREE.PointLight);
      for (const l of lightsHere) l.intensity *= Math.max(0, opts.lanterns);
      g.traverse((o) => {
        if (o instanceof THREE.PointLight) lights.push(o);
        const s = o as THREE.Sprite;
        if (s.isSprite && s.material instanceof THREE.SpriteMaterial) s.material.opacity *= Math.max(0, opts.lanterns);
      });
    } else {
      g.traverse((o) => {
        if (o instanceof THREE.PointLight) lights.push(o);
      });
    }
    if (g.userData.lanternLights) {
      for (const l of g.userData.lanternLights as THREE.PointLight[]) lights.push(l);
    }
    if (g.userData.skyUniforms) animated.push({ kind: 'sky', u: g.userData.skyUniforms as Record<string, THREE.IUniform> });
    if (g.userData.dustUniforms) animated.push({ kind: 'dust', u: g.userData.dustUniforms as Record<string, THREE.IUniform> });
    if (MERGE[placement.id]) mergeStatic(g);
    root.add(g);
    moduleIds.push(placement.id);
  }

  // 环境光照：直接复用晨空全景的 IBL，让木、石、瓦的反射与天空同源。
  let skyTexture: THREE.Texture | undefined;
  root.traverse((o) => {
    const t = o.userData.skyTexture as THREE.Texture | undefined;
    if (t) skyTexture = t;
  });
  if (skyTexture) {
    scene.environment = skyTexture;
    scene.environmentIntensity = plan.palette === 'snow' ? 0.58 : 0.30;
  }

  const stats = { objects: 0, triangles: 0, modules: moduleIds };
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) stats.objects += 1;
  });
  stats.triangles = countTriangles(root);

  const tick = (time: number): void => {
    for (const a of animated) {
      if (a.kind === 'sky') a.u.uTime.value = time;
      else if (a.kind === 'dust') a.u.uTime.value = time;
    }
    for (let i = 0; i < lights.length; i += 1) {
      const l = lights[i]!;
      const base = l.userData.baseIntensity as number | undefined;
      if (base === undefined) {
        l.userData.baseIntensity = l.intensity;
        l.userData.phase = i * 1.37;
      }
      const b = l.userData.baseIntensity as number;
      const phase = l.userData.phase as number;
      l.intensity = b * (0.96 + 0.04 * Math.sin(time * 2.7 + phase) + 0.025 * Math.sin(time * 8.1 + phase * 2.2));
    }
  };

  return {
    scene,
    group: root,
    tick,
    stats,
    dispose: () => {
      disposeObject(root);
      lab.dispose();
      if (scene.environment) scene.environment.dispose();
      scene.clear();
    },
  };
}
