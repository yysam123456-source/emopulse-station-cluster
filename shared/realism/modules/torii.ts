import * as THREE from 'three';
import { MaterialLab } from '../materials';
import type { ModuleContext, SceneModule } from '../types';
import { beam, box, contactShadow, cylinder, mesh, tube } from '../primitives';
import { terrainHeight } from './ground';

function shide(parent: THREE.Object3D, lab: MaterialLab, x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  const mat = lab.get('paper');
  const piece = (w: number, h: number, px: number, py: number, pz: number, rz: number, rx: number): void => {
    const p = mesh(new THREE.PlaneGeometry(w, h, 1, 1), mat, px, py, pz, g);
    p.rotation.set(rx, 0, rz);
    p.castShadow = true;
  };
  piece(0.16, 0.24, 0, -0.12, 0, 0.04, 0);
  piece(0.15, 0.23, 0.03, -0.31, 0.015, -0.17, 0.03);
  piece(0.14, 0.22, -0.01, -0.50, 0.006, 0.15, -0.02);
  return g;
}

export const toriiModule: SceneModule = {
  id: 'torii',
  label: '鸟居：朱漆 / 笠木 / 注连绳 / 纸垂',
  build(ctx: ModuleContext): THREE.Group {
    const { lab, plan, quality } = ctx;
    const x0 = ctx.placement.x ?? -1.0;
    const z0 = ctx.placement.z ?? 3.7;
    const y0 = terrainHeight(x0, z0);
    const s = ctx.placement.scale ?? 0.94;
    const g = new THREE.Group();
    g.position.set(x0, y0, z0);
    g.rotation.y = ctx.placement.rot ?? -0.04;
    g.scale.setScalar(s);

    const red = lab.get('redLacquer');
    const dark = lab.get('darkWood');
    const stone = lab.get('stone');
    const soot = lab.get('soot');
    const gold = lab.get('gold');

    // 柱：下粗上细，略向内倾；石龟趺不是圆盘。
    for (const side of [-1, 1]) {
      const px = side * 2.25;
      const base = cylinder(g, 0.46, 0.56, 0.36, stone, px, 0.18, 0, 16);
      base.rotation.y = side * 0.2;
      box(g, 0.88, 0.10, 0.88, stone, px, 0.40, 0);
      const col = cylinder(g, 0.26, 0.35, 4.0, red, px, 2.32, 0, 14);
      col.rotation.z = side * 0.022;
      // 柱脚金具。
      cylinder(g, 0.34, 0.35, 0.10, soot, px, 0.50, 0, 14);
      cylinder(g, 0.27, 0.29, 0.08, soot, px, 0.76, 0, 14);
      // 柱身上的旧漆裂缝与加固箍。
      for (const y of [2.1, 3.55]) {
        const band = cylinder(g, 0.30, 0.30, 0.055, dark, px, y, 0, 14);
        band.rotation.z = side * 0.022;
      }
      // 柱顶方斗。
      box(g, 0.62, 0.18, 0.62, dark, px, 4.36, 0, false);
      box(g, 0.46, 0.12, 0.46, red, px, 4.50, 0, false);
    }

    // 岛木 / 贯 / 笠木。笠木用曲线，两端起翘。
    box(g, 5.55, 0.28, 0.42, red, 0, 3.02, 0.02, false);
    box(g, 5.25, 0.21, 0.33, dark, 0, 2.58, 0.05, false);
    const kasagiPts: Array<[number, number, number]> = [
      [-3.38, 4.39, 0.02],
      [-2.55, 4.54, 0.03],
      [-1.25, 4.62, 0.02],
      [0, 4.65, 0.01],
      [1.25, 4.62, 0.02],
      [2.55, 4.54, 0.03],
      [3.38, 4.39, 0.02],
    ];
    tube(g, kasagiPts, 0.20, red, 26, 8);
    // 笠木顶面的黑色压条，让轮廓不是一根红管子。
    const capPts = kasagiPts.map(([x, y, z]) => [x, y + 0.16, z] as [number, number, number]);
    tube(g, capPts, 0.075, soot, 26, 5);
    // 笠木端部金具。
    for (const side of [-1, 1]) {
      const cap = cylinder(g, 0.10, 0.17, 0.36, soot, side * 3.42, 4.42, 0.02, 10);
      cap.rotation.z = Math.PI / 2 + side * 0.14;
      const ring = cylinder(g, 0.135, 0.135, 0.045, gold, side * 3.05, 4.56, 0.02, 12);
      ring.rotation.z = Math.PI / 2;
    }

    // 额束、匾、金边。
    box(g, 1.12, 0.92, 0.14, dark, 0, 3.38, 0.24);
    box(g, 0.96, 0.76, 0.16, soot, 0, 3.38, 0.31);
    box(g, 0.10, 0.76, 0.06, gold, -0.41, 3.38, 0.41);
    box(g, 0.10, 0.76, 0.06, gold, 0.41, 3.38, 0.41);
    box(g, 0.96, 0.07, 0.06, gold, 0, 3.81, 0.41);
    box(g, 0.96, 0.07, 0.06, gold, 0, 2.95, 0.41);

    // 注连绳：由三段绳股绞成，不是一根光滑管子。
    const ropeMat = new THREE.MeshStandardMaterial({ color: 0xb8a478, roughness: 0.94 });
    const rope: Array<[number, number, number]> = [];
    for (let i = 0; i <= 28; i += 1) {
      const t = i / 28;
      rope.push([-2.0 + t * 4.0, 3.12 - Math.sin(t * Math.PI) * 0.25, 0.18]);
    }
    tube(g, rope, 0.052, ropeMat, 36, 5);
    for (const offset of [-0.035, 0.035]) {
      const strand: Array<[number, number, number]> = [];
      for (let i = 0; i <= 24; i += 1) {
        const t = i / 24;
        strand.push([-2.0 + t * 4.0, 3.12 - Math.sin(t * Math.PI) * 0.25 + offset, 0.18 + offset]);
      }
      tube(g, strand, 0.025, ropeMat, 30, 4);
    }
    // 绳结：每隔一段压一个草绳环。
    for (let i = 1; i < 22; i += 1) {
      const t = i / 22;
      const x = -2.0 + t * 4.0;
      const y = 3.12 - Math.sin(t * Math.PI) * 0.25;
      const ring = mesh(new THREE.TorusGeometry(0.055, 0.018, 5, 10), ropeMat, x, y, 0.205, g);
      ring.rotation.x = Math.PI / 2;
    }

    // 纸垂：从注连绳垂下，三层折纸。
    for (const x of [-1.45, -0.75, 0, 0.75, 1.45]) {
      shide(g, lab, x, 3.05 - Math.sin((x + 2) / 4 * Math.PI) * 0.18, 0.245);
    }

    // 接触阴影。
    contactShadow(g, lab.contactShadow(), 0, 0.015, 0.02, 7.4, 2.2, 0.30);
    for (const side of [-1, 1]) {
      contactShadow(g, lab.contactShadow(), side * 2.25, 0.01, 0, 1.5, 1.5, 0.28);
    }

    // 小细节：柱脚青苔。
    if (!plan.terrain.snow) {
      for (const side of [-1, 1]) {
        const m = mesh(new THREE.SphereGeometry(0.48, 9, 6), lab.get('moss'), side * 2.25, 0.03, 0.30, g);
        m.scale.y = 0.12;
      }
    }

    // 侧风时绳子微摆，作为可动画标签。
    g.userData.rope = rope;
    void beam;
    return g;
  },
};
