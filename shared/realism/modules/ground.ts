import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MaterialLab } from '../materials';
import type { ModuleContext, SceneModule } from '../types';
import { mulberry, box, cylinder, mesh, ribbon, rock } from '../primitives';

export function terrainHeight(x: number, z: number): number {
  const rolling = Math.sin(x * 0.27) * Math.cos(z * 0.21) * 0.16
    + Math.sin(x * 0.61 + z * 0.17) * 0.055
    + Math.cos(z * 0.43 - x * 0.11) * 0.05;
  const flat = Math.max(0, 1 - Math.hypot(x / 3.6, (z - 1.2) / 6.2));
  return rolling * (1 - flat * 0.78) - 0.035;
}

export function pathCenter(z: number): number {
  return Math.sin((z - 2) * 0.22) * 0.42 + Math.sin(z * 0.08) * 0.18;
}

function clumpGeometry(): THREE.BufferGeometry {
  const a = new THREE.PlaneGeometry(1, 1);
  a.translate(0, 0.5, 0);
  const b = a.clone();
  b.rotateY(Math.PI / 2);
  const c = a.clone();
  c.rotateY(Math.PI);
  const d = b.clone();
  d.rotateY(Math.PI);
  const merged = mergeGeometries([a, b, c, d])!;
  const n = merged.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < n.count; i += 1) n.setXYZ(i, 0, 1, 0);
  n.needsUpdate = true;
  a.dispose();
  b.dispose();
  c.dispose();
  d.dispose();
  return merged;
}

export const groundModule: SceneModule = {
  id: 'ground',
  label: '苔庭 / 碎石路 / 草与落叶',
  build(ctx: ModuleContext): THREE.Group {
    const { lab, plan, quality } = ctx;
    const g = new THREE.Group();
    g.position.set(ctx.placement.x ?? 0, 0, ctx.placement.z ?? 0);
    const rng = mulberry(ctx.placement.opts?.seed as number ?? Math.round(ctx.rng() * 1e6));
    const size = plan.terrain.size;
    const segments = quality === 'high' ? 190 : 110;

    // 地形：轻微起伏 + 近路压平，避免“浮在太空的圆盘”。
    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, terrainHeight(x, z));
    }
    geo.computeVertexNormals();
    const mat = plan.terrain.snow ? lab.get('snow') : lab.get('grass');
    const ground = mesh(geo, mat, 0, 0, 0, g);
    ground.userData.noMerge = true;
    ground.renderOrder = 0;

    // 一条从前景转向主殿的碎石路。
    const path: Array<[number, number, number]> = [];
    for (let i = 0; i <= 34; i += 1) {
      const z = 8.4 - (i / 34) * 9.8;
      path.push([pathCenter(z), terrainHeight(pathCenter(z), z) + 0.025, z]);
    }
    const pathMesh = ribbon(g, path, plan.terrain.pathWidth, lab.get('gravel'), 0.012);
    pathMesh.receiveShadow = true;

    // 中央石铺：碎石路之上再铺一排带接缝的石板，近景有尺度、有阴影。
    const slabRows = 12;
    for (let row = 0; row < slabRows; row += 1) {
      const z = 8.0 - (row / (slabRows - 1)) * 7.7;
      const cx = pathCenter(z);
      const cols = [-0.62, 0, 0.62];
      for (let c = 0; c < cols.length; c += 1) {
        const x = cx + cols[c]! + (row % 2 ? 0.08 : -0.04);
        const w = 0.48 + rng() * 0.16;
        const d = 0.42 + rng() * 0.22;
        const slab = box(g, w, 0.055 + rng() * 0.018, d, lab.get('stone'), x, terrainHeight(x, z) + 0.035, z, false);
        slab.rotation.y = (rng() - 0.5) * 0.10;
        slab.receiveShadow = true;
        slab.castShadow = true;
      }
    }

    // 路肩：不规则的石头把路和苔地咬合起来。
    for (let i = 0; i < 38; i += 1) {
      const t = i / 37;
      const z = 8.3 - t * 9.6;
      const x = pathCenter(z);
      for (const side of [-1, 1]) {
        const px = x + side * (plan.terrain.pathWidth / 2 - 0.06 + rng() * 0.10);
        const sz = 0.17 + rng() * 0.19;
        const stone = box(g, 0.24 + rng() * 0.26, 0.06 + rng() * 0.04, sz, lab.get('stone'),
          px, terrainHeight(px, z) + 0.04, z, false);
        stone.rotation.y = rng() * 0.5 - 0.25;
        stone.receiveShadow = true;
      }
    }

    // 前景横铺的石板，视觉上把镜头“落地”。
    for (let i = 0; i < 14; i += 1) {
      const x = -2.1 + i * 0.31;
      if (Math.abs(x) > 2.4) continue;
      const z = 7.55 + (i % 3) * 0.08;
      const slab = box(g, 0.27, 0.055, 0.62 + rng() * 0.16, lab.get('stone'), x, terrainHeight(x, z) + 0.035, z, false);
      slab.rotation.y = (rng() - 0.5) * 0.08;
      slab.receiveShadow = true;
    }

    // 草：真透明草簇贴片，交叉成丛；不再是黑色细铁丝。
    if (plan.terrain.grass > 0 && !plan.terrain.snow) {
      const n = Math.round(plan.terrain.grass * (quality === 'high' ? 1 : 0.4));
      const grass = new THREE.InstancedMesh(clumpGeometry(), lab.grassClumpMaterial(), n);
      grass.castShadow = false;
      grass.receiveShadow = true;
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const s = new THREE.Vector3();
      const p = new THREE.Vector3();
      const color = new THREE.Color();
      let k = 0;
      while (k < n) {
        const x = (rng() - 0.5) * size * 0.62;
        const z = (rng() - 0.5) * size * 0.58 - 1.8;
        if (x * x + (z - 1) * (z - 1) < 5.2) continue;
        if (Math.abs(x - pathCenter(z)) < plan.terrain.pathWidth / 2 + 0.18 && z > -2 && z < 9.6) continue;
        p.set(x, terrainHeight(x, z) - 0.02, z);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI * 2);
        const scale = 0.08 + rng() * 0.12;
        s.set(0.28 + rng() * 0.22, scale, 0.28 + rng() * 0.22);
        m.compose(p, q, s);
        grass.setMatrixAt(k, m);
        // 贴片本身有颜色，这里只做明暗与冷暖偏移，避免每丛都是同一张图。
        const shade = 0.72 + rng() * 0.26;
        color.setRGB(shade * (0.94 + rng() * 0.06), shade, shade * (0.88 + rng() * 0.08));
        grass.setColorAt(k, color);
        k += 1;
      }
      grass.instanceMatrix.needsUpdate = true;
      grass.instanceColor!.needsUpdate = true;
      g.add(grass);

      // 镜头脚边单独补一层高草，让前景不是一片空草地。
      const foreground = new THREE.InstancedMesh(clumpGeometry(), lab.grassClumpMaterial(), 0);
      foreground.castShadow = false;
      foreground.receiveShadow = true;
      for (let i = 0; i < foreground.count; i += 1) {
        const x = (rng() - 0.5) * 17;
        const z = 8.4 + rng() * 4.6;
        if (Math.abs(x - pathCenter(z)) < plan.terrain.pathWidth / 2 + 0.12) {
          i -= 1;
          continue;
        }
        p.set(x, terrainHeight(x, z) - 0.03, z);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI * 2);
        s.set(0.62 + rng() * 0.34, 0.58 + rng() * 0.48, 0.62 + rng() * 0.34);
        m.compose(p, q, s);
        foreground.setMatrixAt(i, m);
        color.setRGB(0.64 + rng() * 0.18, 0.66 + rng() * 0.2, 0.54 + rng() * 0.14);
        foreground.setColorAt(i, color);
      }
      foreground.instanceMatrix.needsUpdate = true;
      if (foreground.instanceColor) foreground.instanceColor.needsUpdate = true;
      g.add(foreground);
    }

    // 苔藓团不再用一圈圈“绿圆片”冒充：真实的苔痕交给地表贴图和散石。

    // 散石。
    for (let i = 0; i < Math.round(plan.terrain.stones); i += 1) {
      const x = (rng() - 0.5) * 13;
      const z = (rng() - 0.5) * 12 - 1.8;
      if (Math.abs(x - pathCenter(z)) < plan.terrain.pathWidth / 2 + 0.3 && z > -2 && z < 8.2) continue;
      const r = 0.10 + rng() * 0.28;
      const stone = rock(g, r, lab.get('stone'), x, terrainHeight(x, z) + r * 0.35, z, Math.round(rng() * 1e6));
      stone.castShadow = true;
      stone.receiveShadow = true;
    }

    // 落叶：把“照片写实”里最容易露馅的地面补上一层细节。
    if (plan.terrain.leaves > 0) {
      const n = Math.round(plan.terrain.leaves);
      const leaf = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.15, 0.11), lab.mapleLeafMaterial(0x9a613c), n);
      leaf.castShadow = false;
      leaf.receiveShadow = true;
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const p = new THREE.Vector3();
      const s = new THREE.Vector3();
      for (let i = 0; i < n; i += 1) {
        const x = (rng() - 0.5) * 12;
        const z = (rng() - 0.5) * 11 - 1;
        p.set(x, terrainHeight(x, z) + 0.018, z);
        q.setFromEuler(new THREE.Euler(-Math.PI / 2 + (rng() - 0.5) * 0.3, rng() * Math.PI * 2, (rng() - 0.5) * 0.2));
        s.set(0.8 + rng() * 0.7, 0.8 + rng() * 0.7, 1);
        m.compose(p, q, s);
        leaf.setMatrixAt(i, m);
      }
      leaf.instanceMatrix.needsUpdate = true;
      g.add(leaf);
    }

    // 远景土坡，挡住地面平面边缘，也给全景地平线一个前景层。
    for (let i = 0; i < 3; i += 1) {
      const hill = mesh(new THREE.SphereGeometry(9 + i * 4, 24, 10), lab.get('moss'), -14 + i * 14, -1.8, -18 - i * 3, g);
      hill.scale.set(1.4, 0.22, 0.7);
      hill.castShadow = false;
    }
    for (let i = 0; i < 9; i += 1) {
      const x = -30 + i * 7.5 + (rng() - 0.5) * 3;
      const z = -22 - rng() * 12;
      const hill = mesh(new THREE.SphereGeometry(4 + rng() * 4.5, 16, 8), lab.get('moss'), x, 0.2 + rng() * 0.8, z, g);
      hill.scale.set(1.7 + rng() * 0.5, 0.24 + rng() * 0.16, 0.8);
      hill.castShadow = false;
    }

    return g;
  },
};
