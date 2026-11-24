import * as THREE from 'three';
import { clamp, hash } from '../palette';
import { createParticleSet, finalize, put } from '../particles';
import { createParticleMaterial, type NebulaUniforms } from '../shader';
import type { NebulaModule } from '../types';

/** 四旋臂主粒子：星系的主体，半径 5.4、四臂、盘面轻微厚度。 */
export function createArmsModule(density: number, uniforms: NebulaUniforms): NebulaModule {
  const count = Math.round(22000 * density);
  const set = createParticleSet(count);
  const arms = 4;
  for (let n = 0; n < count; n += 1) {
    const arm = n % arms;
    const t = hash(n * 1.37 + 2.1);
    const radius = Math.pow(t, 0.62) * 5.4;
    const angle = (arm / arms) * Math.PI * 2
      + radius * 0.24
      + (hash(n * 2.11 + 4.7) - 0.5) * 0.34;
    const spread = (hash(n * 3.31 + 8.3) - 0.5) * 0.28 * (0.35 + radius / 5.4);
    const x = Math.cos(angle) * radius + spread;
    const z = Math.sin(angle) * radius + spread * 0.7;
    const y = (hash(n * 4.73 + 1.9) - 0.5) * 0.22 * (1.0 - radius / 8.2);
    const m = clamp(0.3 + hash(n * 5.17 + 3.4) * 0.7, 0, 1);
    const alpha = 0.28 + Math.pow(hash(n * 6.43 + 2.8), 1.8) * 0.62;
    const s = 0.35 + Math.pow(hash(n * 7.71 + 5.2), 2.2) * 1.8;
    put(set, x, y, z, hash(n * 8.91), m, alpha, s);
  }
  const geometry = finalize(set);
  const material = createParticleMaterial(uniforms);
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  const group = new THREE.Group();
  group.name = 'nebula-arms';
  group.add(points);
  return {
    id: 'arms',
    label: '四旋臂',
    group,
    materials: [material],
    dispose(): void {
      geometry.dispose();
    },
  };
}
