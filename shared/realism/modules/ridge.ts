import * as THREE from 'three';
import type { ModuleContext, SceneModule } from '../types';

// 远山：两层被雾吞掉轮廓的山脊。它不是天空贴图的一部分，而是一个可放置、可换色、
// 可重复堆叠的独立零件；放在任何室外场景背后都能立刻补出空气透视和地平线层次。
function ridgeGeometry(width: number, baseY: number, height: number, phase: number, segments: number): THREE.BufferGeometry {
  const top: number[] = [];
  const bottom: number[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const x = (t - 0.5) * width;
    // 多频正弦叠加，避免“锯齿状随机山”的塑料感；主峰低频、次峰中频、碎石高频。
    const h =
      height *
      (0.46 +
        0.30 * Math.sin(t * Math.PI * 2.4 + phase) +
        0.18 * Math.sin(t * Math.PI * 7.1 + phase * 2.3) +
        0.08 * Math.sin(t * Math.PI * 17.0 + phase * 4.1));
    top.push(baseY + Math.max(0.6, h));
    bottom.push(baseY);
  }
  const positions = new Float32Array((segments + 1) * 2 * 3);
  for (let i = 0; i <= segments; i += 1) {
    const x = (i / segments - 0.5) * width;
    positions[i * 6 + 0] = x;
    positions[i * 6 + 1] = bottom[i]!;
    positions[i * 6 + 2] = 0;
    positions[i * 6 + 3] = x;
    positions[i * 6 + 4] = top[i]!;
    positions[i * 6 + 5] = 0;
  }
  const indices: number[] = [];
  for (let i = 0; i < segments; i += 1) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

export const ridgeModule: SceneModule = {
  id: 'ridge',
  label: '远山',
  build(ctx: ModuleContext): THREE.Group {
    const g = new THREE.Group();
    g.name = 'ridge';
    const snow = ctx.plan.terrain.snow;
    const layers = Math.max(1, Math.min(3, Number(ctx.placement.opts?.layers ?? 2)));
    for (let i = 0; i < layers; i += 1) {
      const z = -55 - i * 22;
      const width = 240 + i * 90;
      const height = 16 + i * 5;
      const phase = 0.7 + i * 2.15;
      const geo = ridgeGeometry(width, -4.5, height, phase, ctx.quality === 'high' ? 120 : 56);
      const color = snow
        ? (i === 0 ? 0xd2dce1 : 0xbfccd3)
        : (i === 0 ? 0x78898c : 0x93a3a5);
      const mat = new THREE.MeshBasicMaterial({ color, fog: true, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(0, 0, z);
      mesh.frustumCulled = false;
      mesh.renderOrder = -3;
      g.add(mesh);
    }
    return g;
  },
};
