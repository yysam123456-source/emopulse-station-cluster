import * as THREE from 'three';
import type { Lod, PartEnv, StageSize, WorldFrame } from '../../stage/contract';
import { PALETTES, clamp, isPalette, type NebulaPalette } from './palette';
import type { NebulaOptions } from './options';
import { createUniforms } from './shader';
import type { NebulaModule } from './types';
import { createArmsModule } from './modules/arms';
import { createCoreModule } from './modules/core';
import { createHaloModule } from './modules/halo';
import { createStarfieldModule } from './modules/starfield';

export interface NebulaScene {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly modules: NebulaModule[];
  update(frame: WorldFrame): void;
  draw(): void;
  resize(size: StageSize): void;
  setLod(next: Lod): void;
  dispose(): void;
  debug(): unknown;
}

function readQuery(): URLSearchParams | null {
  try {
    const search = globalThis.location?.search;
    return search ? new URLSearchParams(search) : null;
  } catch {
    return null;
  }
}

/** 星系装配：星场 → 尘埃晕 → 四旋臂 → 核心；模块顺序就是绘制层序。 */
export function createNebulaScene(env: PartEnv, opts: NebulaOptions = {}): NebulaScene {
  if (!env.canvas) throw Object.assign(new Error('nebula 需要 GL 画布'), { code: 'E_UNSUPPORTED' });
  try {
    const probe = (): void => {};
    env.canvas.addEventListener('webglcontextlost', probe);
    env.canvas.removeEventListener('webglcontextlost', probe);
  } catch {
    throw Object.assign(new Error('nebula 需要真实 WebGL2 画布'), { code: 'E_UNSUPPORTED' });
  }

  const Q = readQuery();
  const paletteName = isPalette(Q?.get('palette'))
    ? Q!.get('palette') as NebulaPalette
    : (opts.palette ?? 'violet');
  const palette = PALETTES[paletteName];
  const num = (key: string, fallback: number): number => {
    const raw = Q?.get(key);
    const value = raw == null ? Number.NaN : Number.parseFloat(raw);
    return Number.isFinite(value) ? value : fallback;
  };
  const density = clamp(num('density', opts.density ?? 1), 0.45, 1.35);
  const scale = clamp(num('scale', opts.scale ?? 1), 0.6, 1.6);
  const speed = clamp(num('speed', opts.speed ?? 1), 0.2, 2);
  const pulseStrength = clamp(num('pulse', opts.pulse ?? 0.55), 0, 1);
  const coreGlow = Q?.has('coreGlow') ? Q.get('coreGlow') !== '0' : opts.coreGlow !== false;
  const withStars = Q?.has('starfield') ? Q.get('starfield') !== '0' : opts.starfield !== false;

  const renderer = new THREE.WebGLRenderer({
    canvas: env.canvas,
    antialias: false,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(palette.background, 0);
  renderer.autoClear = false;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 100);
  camera.position.set(0, 5.2, 8.6);
  camera.lookAt(0, 0, 0);

  const uniforms = createUniforms(palette.core, palette.arm, palette.dust, env.dpr, scale);
  const modules: NebulaModule[] = [];
  if (withStars) modules.push(createStarfieldModule(density, env.dpr));
  modules.push(createHaloModule(density, uniforms));
  modules.push(createArmsModule(density, uniforms));
  modules.push(createCoreModule(density, uniforms, coreGlow));
  for (const m of modules) scene.add(m.group);

  let width = Math.max(1, env.width);
  let height = Math.max(1, env.height);
  let dpr = Math.max(1, env.dpr);
  let lod: Lod = env.lod;
  let time = 0;
  let pointerDown = false;
  let pulse = 0;
  let disposed = false;

  const applyLayout = (): void => {
    renderer.setPixelRatio(Math.min(dpr, 2) * (lod === 'low' ? 0.82 : 1));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    uniforms.uPixelRatio.value = Math.min(1.6, dpr) * (lod === 'low' ? 0.9 : 1);
    uniforms.uPointSize.value = (lod === 'low' ? 1.8 : 2.1) * Math.min(1.4, dpr);
  };
  applyLayout();

  return {
    scene,
    camera,
    modules,
    update(frame: WorldFrame): void {
      time = frame.t * speed;
      const down = frame.pointer.down;
      if (down && !pointerDown) pulse = 1;
      pointerDown = down;
      pulse = Math.max(0, pulse - frame.dt * (frame.reducedMotion ? 9 : 4.5));
      uniforms.uTime.value = time;
      uniforms.uPulse.value = pulse * pulseStrength;
      for (const m of modules) m.update?.(time, pulse);
    },
    draw(): void {
      if (disposed) return;
      renderer.clear();
      const t = time;
      camera.position.x = Math.sin(t * 0.12) * 0.35;
      camera.position.y = 5.2 + Math.sin(t * 0.2) * 0.18;
      camera.position.z = 8.6 + Math.cos(t * 0.16) * 0.25;
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    },
    resize(size: StageSize): void {
      width = Math.max(1, size.w);
      height = Math.max(1, size.h);
      dpr = Math.max(1, size.dpr);
      applyLayout();
    },
    setLod(next: Lod): void {
      lod = next;
      applyLayout();
    },
    dispose(): void {
      disposed = true;
      for (const m of modules) {
        m.dispose?.();
        for (const mat of m.materials) mat.dispose();
        scene.remove(m.group);
      }
      renderer.dispose();
    },
    debug(): unknown {
      return {
        palette: paletteName,
        density,
        scale,
        speed,
        modules: modules.map((m) => m.id),
      };
    },
  };
}
