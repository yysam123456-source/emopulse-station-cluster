import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MaterialLab } from '../materials';
import type { ModuleContext, SceneModule } from '../types';
import { beam, contactShadow, cylinder, mesh, mulberry, rock, tube } from '../primitives';
import { terrainHeight } from './ground';

interface PineOpts {
  readonly x: number;
  readonly z: number;
  readonly height: number;
  readonly lean: number;
  readonly seed: number;
}

function foliageCard(w: number, h: number): THREE.BufferGeometry {
  const a = new THREE.PlaneGeometry(w, h);
  const b = a.clone();
  b.rotateY(Math.PI);
  const merged = mergeGeometries([a, b])!;
  // 关键：植被卡片用“朝上的法线”，不是竖直平面法线。
  // 否则一半卡片背光，树冠会黑成一团；这是植物渲染里常用的 normal-up 法。
  const n = merged.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < n.count; i += 1) n.setXYZ(i, 0, 1, 0);
  n.needsUpdate = true;
  a.dispose();
  b.dispose();
  return merged;
}

function pine(parent: THREE.Object3D, lab: MaterialLab, quality: 'low' | 'high', o: PineOpts): THREE.Group {
  const rng = mulberry(o.seed);
  const g = new THREE.Group();
  g.position.set(o.x, terrainHeight(o.x, o.z), o.z);
  parent.add(g);
  const bark = lab.get('bark');
  const needles = lab.needleMaterial(0xffffff);
  const needlesWarm = lab.needleMaterial(0xf3f7df);
  const needlesFlip = lab.needleMaterial(0xffffff, true);

  // 主干：几段不等径、带弯曲的木段，近景不是一根圆柱。
  const trunk: Array<[number, number, number]> = [
    [0, 0, 0],
    [0.05, 1.1, 0.05],
    [-0.08, 2.1, 0.16],
    [0.02, 3.0, 0.23],
    [o.lean * 0.6, 3.9, 0.34],
    [o.lean, o.height, 0.42],
  ];
  const nseg = 5;
  for (let i = 0; i < nseg; i += 1) {
    const a = trunk[i]!;
    const b = trunk[i + 1]!;
    const r0 = 0.24 - i * 0.032;
    const r1 = 0.24 - (i + 1) * 0.032;
    const mid = new THREE.Vector3(a[0] + b[0], a[1] + b[1], a[2] + b[2]).multiplyScalar(0.5);
    const m = cylinder(g, r1, r0, Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) + 0.06, bark, mid.x, mid.y, mid.z, 9);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize());
  }

  const addCluster = (px: number, py: number, pz: number, scale: number, count: number): void => {
    for (let c = 0; c < count; c += 1) {
      const mat = c === 0 ? needles : c === 1 ? needlesFlip : needlesWarm;
      const w = (1.02 + rng() * 0.48) * scale;
      const h = (0.72 + rng() * 0.34) * scale;
      const card = mesh(
        foliageCard(w, h),
        mat,
        px + (rng() - 0.5) * 0.34 * scale,
        py + (rng() - 0.5) * 0.24 * scale,
        pz + (rng() - 0.5) * 0.34 * scale,
        g,
      );
      // 不是“正面朝镜头的一张图”：绕 Y 铺开、再前倾，让一簇针叶从多个角度看都有厚度。
      card.rotation.set(-0.52 + rng() * 0.85, rng() * Math.PI * 2, (rng() - 0.5) * 0.55);
      card.castShadow = true;
      card.receiveShadow = true;
    }
  };

  const branchCount = quality === 'high' ? 14 : 9;
  for (let i = 0; i < branchCount; i += 1) {
    const h = 1.35 + i * (o.height - 1.9) / branchCount;
    const t = h / o.height;
    const base = new THREE.Vector3(
      o.lean * t * 0.85 + (rng() - 0.5) * 0.15,
      h,
      0.08 + t * 0.30,
    );
    const az = i * 2.38 + rng() * 0.8;
    const len = (1.7 + rng() * 1.5) * (1 - t * 0.26);
    const end = new THREE.Vector3(
      base.x + Math.cos(az) * len,
      base.y + 0.42 + rng() * 0.55,
      base.z + Math.sin(az) * len,
    );
    beam(g, [base.x, base.y, base.z], [end.x, end.y, end.z], 0.062 - t * 0.022, bark, 6);
    // 主枝沿途挂枝叶簇，不能只在枝头像插花，否则树冠全是“光杆 + 花椰菜”。
    for (const tt of [0.28, 0.44, 0.60, 0.76, 0.90]) {
      const pp = base.clone().lerp(end, tt);
      addCluster(pp.x, pp.y, pp.z, 1.02 - tt * 0.18, 2);
    }
    // 主枝末端一簇。
    addCluster(end.x, end.y, end.z, 1.0, quality === 'high' ? 5 : 3);

    // 三次副枝，沿主枝向内/向外分层，撑出松树的层状剪影。
    const subCount = quality === 'high' ? 3 : 2;
    for (let k = 0; k < subCount; k += 1) {
      const tt = 0.38 + k * 0.23;
      const p = base.clone().lerp(end, tt);
      const dir = az + (k % 2 ? 0.85 : -0.85) + (rng() - 0.5) * 0.25;
      const tip = new THREE.Vector3(
        p.x + Math.cos(dir) * (0.80 + rng() * 0.65) * (1 - tt * 0.3),
        p.y + 0.20 + rng() * 0.38,
        p.z + Math.sin(dir) * (0.80 + rng() * 0.65) * (1 - tt * 0.3),
      );
      beam(g, [p.x, p.y, p.z], [tip.x, tip.y, tip.z], 0.030, bark, 5);
      addCluster(tip.x, tip.y, tip.z, 0.82 + rng() * 0.22, quality === 'high' ? 4 : 2);
      // 副枝中段也补一簇，避免树冠只剩一圈“外轮廓”。
      const mid = p.clone().lerp(tip, 0.55);
      if (quality === 'high') {
        addCluster(mid.x, mid.y, mid.z, 0.72, 2);
        const inner = p.clone().lerp(tip, 0.22);
        addCluster(inner.x, inner.y, inner.z, 0.86, 1);
      }
    }
  }

  // 树冠顶部：多簇叠在一起，不靠一张大贴片。
  for (let i = 0; i < (quality === 'high' ? 8 : 4); i += 1) {
    const angle = i / (quality === 'high' ? 8 : 4) * Math.PI * 2;
    addCluster(
      o.lean + Math.cos(angle) * (0.30 + rng() * 0.45),
      o.height - 0.12 + (rng() - 0.5) * 0.28,
      0.4 + Math.sin(angle) * (0.30 + rng() * 0.45),
      0.72 + rng() * 0.25,
      1,
    );
  }

  // 树根与根部石。
  for (let i = 0; i < 4; i += 1) {
    const a = i * Math.PI / 2 + 0.2;
    beam(g, [0, 0.22, 0], [Math.cos(a) * 0.55, 0.04, Math.sin(a) * 0.55], 0.06, bark, 5);
  }
  contactShadow(parent, lab.contactShadow(), o.x, terrainHeight(o.x, o.z) + 0.012, o.z, 2.8, 2.8, 0.22);
  return g;
}

export const pinesModule: SceneModule = {
  id: 'pine-grove',
  label: '松林 / 根石 / 灌木',
  build(ctx: ModuleContext): THREE.Group {
    const g = new THREE.Group();
    const rng = mulberry(Math.round(ctx.rng() * 1e6));
    const snow = ctx.plan.terrain.snow;
    const list: PineOpts[] = [
      { x: -7.2, z: -2.4, height: 6.6, lean: -0.55, seed: 1831 },
      { x: -6.0, z: 0.8, height: 5.9, lean: -0.3, seed: 2761 },
      { x: 8.2, z: -2.6, height: 6.4, lean: 0.45, seed: 3187 },
      { x: 8.8, z: -5.8, height: 5.6, lean: 0.62, seed: 4199 },
      { x: -9.2, z: -6.2, height: 5.3, lean: -0.2, seed: 5113 },
    ];
    for (const p of list) pine(g, ctx.lab, ctx.quality, p);
    // 远处补一棵小松，控制天际线。
    pine(g, ctx.lab, ctx.quality, { x: 4.2, z: -11.2, height: 4.4, lean: 0.1, seed: 6121 });

    // 林下灌木：用真透明枝叶贴片交叉成团，不再拿苔藓球冒充植物。
    for (let i = 0; i < (ctx.quality === 'high' ? 34 : 16); i += 1) {
      const x = (rng() - 0.5) * 14;
      const z = (rng() - 0.5) * 13 - 2.2;
      if (Math.abs(x) < 3.0 && z > -1.8 && z < 8.4) continue;
      const s = 0.45 + rng() * 0.72;
      const y = terrainHeight(x, z);
      for (let c = 0; c < 2; c += 1) {
        const card = mesh(foliageCard(s * 1.15, s * 0.82), ctx.lab.shrubMaterial(), x, y + s * 0.44, z, g);
        card.rotation.set(-0.05 + c * 0.04, rng() * Math.PI + c * Math.PI / 2, 0);
        card.castShadow = true;
        card.receiveShadow = true;
      }
      if (snow) {
        const cap = mesh(new THREE.SphereGeometry(s * 0.72, 8, 5), ctx.lab.get('snow'), x, y + s * 0.62, z, g);
        cap.scale.y = 0.22;
      }
    }
    for (let i = 0; i < 12; i += 1) {
      const x = (rng() - 0.5) * 12;
      const z = (rng() - 0.5) * 10 - 2;
      if (Math.abs(x) < 2.6 && z > -1.6 && z < 8.2) continue;
      rock(g, 0.18 + rng() * 0.32, ctx.lab.get('stone'), x, terrainHeight(x, z) + 0.12, z, Math.round(rng() * 1e6));
    }
    return g;
  },
};
