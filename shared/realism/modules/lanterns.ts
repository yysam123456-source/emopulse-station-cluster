import * as THREE from 'three';
import { MaterialLab } from '../materials';
import type { ModuleContext, SceneModule } from '../types';
import { box, contactShadow, cylinder, mesh } from '../primitives';
import { terrainHeight } from './ground';

function lantern(g: THREE.Group, lab: MaterialLab, x: number, z: number, amount: number, snow: boolean): void {
  const stone = lab.get('stone');
  const glow = lab.glowMap();
  const y0 = terrainHeight(x, z);
  cylinder(g, 0.42, 0.52, 0.24, stone, x, y0 + 0.12, z, 12);
  cylinder(g, 0.32, 0.40, 0.12, stone, x, y0 + 0.29, z, 12);
  cylinder(g, 0.13, 0.17, 1.05, stone, x, y0 + 0.87, z, 10);
  for (const y of [0.52, 1.28]) {
    cylinder(g, 0.25, 0.23, 0.10, stone, x, y0 + y, z, 10);
  }
  box(g, 0.56, 0.09, 0.56, stone, x, y0 + 1.45, z);
  // 火袋：四面格栅 + 中心发光体。
  const glass = new THREE.MeshStandardMaterial({
    color: 0xffc27b,
    emissive: 0xffa24f,
    emissiveIntensity: 0.9 * amount,
    transparent: true,
    opacity: 0.82,
    roughness: 0.42,
  });
  box(g, 0.38, 0.44, 0.38, glass, x, y0 + 1.72, z);
  for (const [dx, dz] of [[-0.22, 0], [0.22, 0], [0, -0.22], [0, 0.22]] as const) {
    box(g, dx === 0 ? 0.50 : 0.045, 0.50, dz === 0 ? 0.50 : 0.045, stone, x + dx, y0 + 1.72, z + dz);
  }
  // 笠：四坡小顶 + 宝珠。
  const cap = mesh(new THREE.ConeGeometry(0.48, 0.34, 4, 1), stone, x, y0 + 2.08, z, g);
  cap.rotation.y = Math.PI / 4;
  cylinder(g, 0.05, 0.12, 0.18, stone, x, y0 + 2.32, z, 8);
  const ball = mesh(new THREE.SphereGeometry(0.09, 10, 8), stone, x, y0 + 2.45, z, g);
  ball.castShadow = true;
  if (snow) {
    const snowCap = mesh(new THREE.ConeGeometry(0.43, 0.20, 4, 1), lab.get('snow'), x, y0 + 2.13, z, g);
    snowCap.rotation.y = Math.PI / 4;
  }
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glow,
    color: 0xffb36b,
    transparent: true,
    opacity: 0.44 * amount,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  }));
  sprite.scale.set(2.7, 2.7, 1);
  sprite.position.set(x, y0 + 1.72, z);
  g.add(sprite);
  const light = new THREE.PointLight(0xff9f4d, 1.7 * amount, 8.5, 2);
  light.position.set(x, y0 + 1.7, z);
  g.add(light);
  // 石座苔痕。
  if (!snow) {
    const moss = mesh(new THREE.SphereGeometry(0.48, 9, 6), lab.get('moss'), x, y0 + 0.02, z, g);
    moss.scale.y = 0.10;
  }
}

export const lanternModule: SceneModule = {
  id: 'stone-lanterns',
  label: '石灯笼：火袋 / 笠 / 苔',
  build(ctx: ModuleContext): THREE.Group {
    const g = new THREE.Group();
    const amount = Math.max(0, Math.min(1, Number(ctx.placement.opts?.amount ?? 0.8)));
    if (amount <= 0) return g;
    const z = ctx.placement.z ?? 2.2;
    const x = ctx.placement.x ?? 0;
    lantern(g, ctx.lab, x - 3.25, z, amount, ctx.plan.terrain.snow);
    lantern(g, ctx.lab, x + 3.25, z, amount, ctx.plan.terrain.snow);
    contactShadow(g, ctx.lab.contactShadow(), x - 3.25, terrainHeight(x - 3.25, z) + 0.01, z, 1.5, 1.5, 0.26);
    contactShadow(g, ctx.lab.contactShadow(), x + 3.25, terrainHeight(x + 3.25, z) + 0.01, z, 1.5, 1.5, 0.26);
    return g;
  },
};
