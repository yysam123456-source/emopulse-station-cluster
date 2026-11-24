import * as THREE from 'three';
import { hash } from '../palette';
import { createParticleSet, finalize, put } from '../particles';
import { createParticleMaterial, type NebulaUniforms } from '../shader';
import { makeGlowTexture } from '../textures';
import type { NebulaModule } from '../types';

/** 中心核球：高密度、小半径、富亮核；可选的加法 sprite 负责“灯芯”。 */
export function createCoreModule(density: number, uniforms: NebulaUniforms, withGlow: boolean): NebulaModule {
  const count = Math.round(4200 * density);
  const set = createParticleSet(count);
  for (let n = 0; n < count; n += 1) {
    const r = Math.pow(hash(n * 1.13 + 9.1), 2.4) * 1.35;
    const a = hash(n * 2.37 + 9.7) * Math.PI * 2;
    const y = (hash(n * 3.71 + 9.3) - 0.5) * 0.32 * (1.0 - r / 1.5);
    put(
      set,
      Math.cos(a) * r,
      y,
      Math.sin(a) * r,
      hash(n * 4.29),
      1,
      0.55 + hash(n * 5.53 + 9.9) * 0.45,
      0.45 + hash(n * 6.77 + 9.2) * 1.1,
    );
  }
  const geometry = finalize(set);
  const material = createParticleMaterial(uniforms);
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;

  const group = new THREE.Group();
  group.name = 'nebula-core';
  group.add(points);

  let glow: THREE.Sprite | null = null;
  let glowMaterial: THREE.SpriteMaterial | null = null;
  const texture = withGlow ? makeGlowTexture() : null;
  if (texture) {
    glowMaterial = new THREE.SpriteMaterial({
      map: texture,
      color: 0xffffff,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.65,
    });
    glow = new THREE.Sprite(glowMaterial);
    glow.scale.set(3.4, 3.4, 1);
    group.add(glow);
  }

  return {
    id: 'core',
    label: '中心核球',
    group,
    materials: glowMaterial ? [material, glowMaterial] : [material],
    update(_time, pulse): void {
      if (!glow) return;
      const s = 3.4 + pulse * 0.8;
      glow.scale.set(s, s, 1);
      if (glowMaterial) glowMaterial.opacity = 0.55 + pulse * 0.25;
    },
    dispose(): void {
      geometry.dispose();
      texture?.dispose();
    },
  };
}
