import * as THREE from 'three';
import { hash } from '../palette';
import { createParticleSet, finalize, put } from '../particles';
import { createParticleMaterial, type NebulaUniforms } from '../shader';
import type { NebulaModule } from '../types';

/** 尘埃晕：大半径、低透明度，负责把旋臂和核球之间填满，不抢主体。 */
export function createHaloModule(density: number, uniforms: NebulaUniforms): NebulaModule {
  const count = Math.round(1800 * density);
  const set = createParticleSet(count);
  for (let n = 0; n < count; n += 1) {
    const a = hash(n * 1.91 + 12.1) * Math.PI * 2;
    const r = 0.9 + hash(n * 2.71 + 12.7) * 5.1;
    put(
      set,
      Math.cos(a) * r,
      (hash(n * 3.19 + 12.3) - 0.5) * 0.7,
      Math.sin(a) * r,
      hash(n * 4.31),
      0.15,
      0.12 + hash(n * 5.71 + 12.9) * 0.22,
      0.3 + hash(n * 6.31 + 12.5) * 0.8,
    );
  }
  const geometry = finalize(set);
  const material = createParticleMaterial(uniforms);
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  const group = new THREE.Group();
  group.name = 'nebula-halo';
  group.add(points);
  return {
    id: 'halo',
    label: '尘埃晕',
    group,
    materials: [material],
    dispose(): void {
      geometry.dispose();
    },
  };
}
