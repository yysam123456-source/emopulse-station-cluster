import * as THREE from 'three';
import { MaterialLab } from '../materials';
import type { ModuleContext, SceneModule } from '../types';
import { beam, box, contactShadow, cylinder, mesh, tube } from '../primitives';
import { buildHipRoof } from '../roof';
import { terrainHeight } from './ground';

function shojiPanel(
  parent: THREE.Object3D,
  lab: MaterialLab,
  w: number,
  h: number,
  x: number,
  y: number,
  z: number,
  cols: number,
  rows: number,
  rotY = 0,
): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  parent.add(g);
  box(g, w + 0.13, h + 0.13, 0.075, lab.get('darkWood'), 0, 0, 0);
  const paper = mesh(new THREE.PlaneGeometry(w, h), lab.get('shoji'), 0, 0, 0.045, g);
  paper.castShadow = false;
  for (let i = 1; i < cols; i += 1) {
    box(g, 0.022, h, 0.028, lab.get('darkWood'), -w / 2 + (w / cols) * i, 0, 0.062, false);
  }
  for (let j = 1; j < rows; j += 1) {
    box(g, w, 0.024, 0.028, lab.get('darkWood'), 0, -h / 2 + (h / rows) * j, 0.062, false);
  }
  box(g, w + 0.055, 0.035, 0.05, lab.get('darkWood'), 0, -h / 2 - 0.025, 0.058, false);
  box(g, w + 0.055, 0.035, 0.05, lab.get('darkWood'), 0, h / 2 + 0.025, 0.058, false);
  return g;
}

function bracketSet(parent: THREE.Object3D, lab: MaterialLab, x: number, y: number, z: number, scale = 1): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  box(g, 0.34, 0.10, 0.34, lab.get('darkWood'), 0, 0.05 * scale, 0);
  box(g, 0.23, 0.12, 0.58, lab.get('darkWood'), 0, 0.16 * scale, 0.10 * scale);
  box(g, 0.25, 0.09, 0.82, lab.get('darkWood'), 0, 0.26 * scale, 0.20 * scale);
  box(g, 0.19, 0.16, 0.22, lab.get('darkWood'), 0, 0.38 * scale, 0.12 * scale);
  for (const s of [-1, 1]) {
    const arm = beam(g, [s * 0.08, 0.10, 0.02], [s * 0.78, 0.34, 0.05], 0.045, lab.get('darkWood'), 6);
    arm.castShadow = true;
  }
  return g;
}

function weatherDecal(
  parent: THREE.Object3D,
  lab: MaterialLab,
  w: number,
  h: number,
  x: number,
  y: number,
  z: number,
  rotY: number,
  opacity: number,
): THREE.Mesh {
  const d = mesh(new THREE.PlaneGeometry(w, h), lab.weather(opacity), x, y, z, parent, false);
  d.rotation.y = rotY;
  d.renderOrder = 2;
  return d;
}

export const hallModule: SceneModule = {
  id: 'shrine-hall',
  label: '主殿：石基 / 木柱 / 障子 / 歇山瓦顶',
  build(ctx: ModuleContext): THREE.Group {
    const { lab, plan, quality } = ctx;
    const x0 = ctx.placement.x ?? 0;
    const z0 = ctx.placement.z ?? -3.4;
    const y0 = terrainHeight(x0, z0);
    const g = new THREE.Group();
    g.position.set(x0, y0, z0);
    g.scale.setScalar(ctx.placement.scale ?? 1.06);

    const hallW = 7.4;
    const hallD = 4.6;
    const floor = 0.72;
    const wallTop = 3.52;

    // 石基：下枭、上枋和压边石，分成三层，不是一个灰盒子。
    box(g, 10.4, 0.30, 7.25, lab.get('stone'), 0, 0.15, 0);
    // 石基不是一整块白盒子：加竖向石缝与压顶线。
    for (let i = 0; i < 19; i += 1) {
      const x = -5.05 + i * 0.56;
      box(g, 0.028, 0.29, 0.035, lab.get('mortar'), x, 0.15, 3.625, false);
      box(g, 0.028, 0.29, 0.035, lab.get('mortar'), x, 0.15, -3.625, false);
    }
    box(g, 10.42, 0.022, 0.035, lab.get('mortar'), 0, 0.29, 3.625, false);
    box(g, 9.95, 0.15, 6.85, lab.get('stone'), 0, 0.42, 0);
    box(g, 9.55, 0.15, 6.55, lab.get('darkWood'), 0, 0.54, 0);
    box(g, 9.5, 0.18, 6.5, lab.get('cedar'), 0, floor - 0.09, 0);
    // 板缘收口。
    box(g, 9.55, 0.09, 0.14, lab.get('darkWood'), 0, floor - 0.15, 3.25);
    box(g, 9.55, 0.09, 0.14, lab.get('darkWood'), 0, floor - 0.15, -3.25);

    // 正面石阶：三级，每级有独立的压边。
    for (let i = 0; i < 3; i += 1) {
      const w = 2.65 + i * 0.22;
      const y = 0.54 - i * 0.18;
      box(g, w, 0.18, 0.52, lab.get('stone'), 0, y, 3.55 + i * 0.23);
      box(g, w + 0.12, 0.055, 0.58, lab.get('stone'), 0, y + 0.115, 3.55 + i * 0.23);
    }
    // 阶旁侧石。
    for (const s of [-1, 1]) {
      const rail = box(g, 0.22, 0.55, 0.78, lab.get('stone'), s * 1.52, 0.40, 3.48);
      rail.rotation.x = 0.05;
    }

    // 主体：下段木裙、上段灰泥，每间独立成板，避免一张皮。
    box(g, hallW, 1.10, hallD, lab.get('cedarVertical'), 0, 1.28, 0);
    // 下段竖向木板：真实木板有缝、有厚薄，不能只靠一张平贴图。
    for (let i = 0; i < 31; i += 1) {
      const x = -hallW / 2 + 0.16 + i * (hallW - 0.32) / 30;
      const w = 0.13 + (i % 3) * 0.012;
      const board = box(g, w, 1.02, 0.045, i % 5 === 0 ? lab.get('darkWood') : lab.get('cedar'),
        x, 1.28, hallD / 2 + 0.025, false);
      board.castShadow = true;
    }
    for (const s of [-1, 1]) {
      for (let i = 0; i < 18; i += 1) {
        const z = -hallD / 2 + 0.2 + i * (hallD - 0.4) / 17;
        const board = box(g, 0.045, 1.02, 0.13, lab.get('cedar'), s * (hallW / 2 + 0.025), 1.28, z, false);
        board.castShadow = true;
      }
    }
    box(g, hallW - 0.08, 2.15, hallD - 0.08, lab.get('plaster'), 0, 2.68, 0);
    // 做旧：墙角返潮、檐下雨水痕、木裙板根部的泥点。
    weatherDecal(g, lab, hallW - 0.20, 1.05, 0, 1.30, hallD / 2 + 0.002, 0, 0.50);
    const eaveShade = weatherDecal(g, lab, hallW - 0.16, 1.25, 0, 3.28, hallD / 2 + 0.002, 0, 0.62);
    eaveShade.rotation.z = Math.PI;
    weatherDecal(g, lab, hallW - 0.20, 0.72, 0, 3.86, hallD / 2 + 0.002, 0, 0.36);
    for (const s of [-1, 1]) {
      weatherDecal(g, lab, hallD - 0.20, 0.92, s * (hallW / 2 + 0.003), 1.36, 0, s * Math.PI / 2, 0.46);
      weatherDecal(g, lab, hallD - 0.20, 0.62, s * (hallW / 2 + 0.003), 3.90, 0, s * Math.PI / 2, 0.32);
    }
    // 正面五间：柱、额枋、门、窗。
    const bays = 5;
    const bay = hallW / bays;
    for (let i = 0; i <= bays; i += 1) {
      const x = -hallW / 2 + i * bay;
      weatherDecal(g, lab, 0.19, 1.35, x, 3.02, hallD / 2 + 0.003, 0, 0.36);
      weatherDecal(g, lab, 0.13, 1.55, x + 0.03, 1.58, hallD / 2 + 0.004, 0, 0.28);
    }
    for (let i = 0; i <= bays; i += 1) {
      const x = -hallW / 2 + i * bay;
      const col = cylinder(g, 0.17, 0.21, 2.95, lab.get('redLacquer'), x, 2.00, hallD / 2 + 0.10, 14);
      col.castShadow = true;
      cylinder(g, 0.28, 0.33, 0.13, lab.get('stone'), x, floor + 0.06, hallD / 2 + 0.10, 10);
      box(g, 0.30, 0.14, 0.40, lab.get('darkWood'), x, 2.62, hallD / 2 + 0.10);
      box(g, 0.44, 0.10, 0.44, lab.get('darkWood'), x, 3.48, hallD / 2 + 0.10);
      if (i < bays) {
        bracketSet(g, lab, x + bay / 2, 3.58, hallD / 2 + 0.18, 0.92);
      }
    }
    // 背柱与侧柱。
    for (let i = 0; i <= bays; i += 1) {
      const x = -hallW / 2 + i * bay;
      cylinder(g, 0.16, 0.20, 2.95, lab.get('redLacquer'), x, 2.00, -hallD / 2 - 0.08, 12);
    }
    for (const s of [-1, 1]) {
      for (const z of [-1.35, 1.35]) {
        cylinder(g, 0.16, 0.20, 2.95, lab.get('redLacquer'), s * (hallW / 2 + 0.08), 2.00, z, 12);
      }
    }
    // 水平额枋 / 腰枋 / 地枋。
    for (const y of [floor + 0.12, 1.80, 3.46]) {
      box(g, hallW + 0.24, 0.18, 0.16, lab.get('darkWood'), 0, y, hallD / 2 + 0.16);
      box(g, hallW + 0.24, 0.18, 0.16, lab.get('darkWood'), 0, y, -hallD / 2 - 0.16);
    }
    for (const s of [-1, 1]) {
      box(g, 0.16, 0.18, hallD + 0.24, lab.get('darkWood'), s * (hallW / 2 + 0.16), 3.46, 0);
      box(g, 0.16, 0.18, hallD + 0.24, lab.get('darkWood'), s * (hallW / 2 + 0.16), floor + 0.12, 0);
    }

    // 正面中央门：两扇，一扇略开，能看见里面的暖光。
    const doorW = 2.05;
    const doorH = 2.35;
    const dz = hallD / 2 + 0.22;
    box(g, doorW + 0.24, doorH + 0.28, 0.12, lab.get('darkWood'), 0, floor + doorH / 2 + 0.1, dz);
    box(g, doorW + 0.05, doorH + 0.1, 0.06, lab.get('soot'), 0, floor + doorH / 2 + 0.08, dz + 0.08);
    const leftDoor = shojiPanel(g, lab, doorW / 2 - 0.03, doorH, -doorW / 4, floor + doorH / 2 + 0.08, dz + 0.11, 3, 6);
    const rightDoor = shojiPanel(g, lab, doorW / 2 - 0.03, doorH, doorW / 4, floor + doorH / 2 + 0.08, dz + 0.11, 3, 6);
    rightDoor.rotation.y = 0.32;
    rightDoor.position.z += 0.22;
    // 门内暖色发光面，降低“纸片门”感。
    const inner = mesh(new THREE.PlaneGeometry(doorW, doorH), new THREE.MeshBasicMaterial({
      color: 0xffb96e,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
    }), 0, floor + doorH / 2 + 0.06, dz - 0.03, g);
    inner.castShadow = false;

    // 两侧窗：障子格窗，边框更厚。
    for (const x of [-2.45, 2.45]) {
      shojiPanel(g, lab, 0.95, 1.62, x, 2.38, dz + 0.13, 4, 7);
      box(g, 1.15, 0.10, 0.32, lab.get('darkWood'), x, 1.50, dz + 0.22);
    }
    // 侧窗。
    for (const s of [-1, 1]) {
      shojiPanel(g, lab, 1.45, 1.42, s * (hallW / 2 + 0.20), 2.40, 0.2, 4, 6, s * Math.PI / 2);
    }

    // 檐下斗拱：每间一朵，外挑两层，屋檐下面不再是空的。
    for (let i = 0; i < bays; i += 1) {
      const x = -hallW / 2 + bay * (i + 0.5);
      bracketSet(g, lab, x, 3.62, hallD / 2 + 0.23, 1.0);
      bracketSet(g, lab, x, 3.62, -hallD / 2 - 0.23, 0.72);
    }
    // 角柱上的斜撑。
    for (const s of [-1, 1]) {
      const arm = beam(g, [s * 3.58, 3.36, hallD / 2 - 0.10], [s * 4.82, 4.04, hallD / 2 + 0.18], 0.055, lab.get('darkWood'), 8);
      arm.castShadow = true;
    }

    // 屋面：真正的四坡举折 + 瓦垄，不是两块黑板。
    buildHipRoof(g, lab, quality, {
      w: 11.2,
      d: 7.9,
      ridge: 5.1,
      eave: 4.22,
      rise: 1.55,
      curl: 0.26,
      snow: plan.terrain.snow,
      beasts: 5,
    });

    // 屋下暗部：加一条深色檐底，让屋顶和墙身分开。
    box(g, 10.2, 0.08, 6.9, lab.get('soot'), 0, 4.18, 0);

    // 侧殿：用同一套柱/墙/瓦顶模块的缩小版，打破对称。
    const annex = new THREE.Group();
    annex.position.set(5.65, 0, -3.8);
    annex.rotation.y = -0.05;
    g.add(annex);
    box(annex, 4.0, 0.32, 3.2, lab.get('stone'), 0, 0.16, 0);
    box(annex, 3.6, 0.22, 2.9, lab.get('cedar'), 0, 0.42, 0);
    box(annex, 2.9, 1.9, 2.3, lab.get('plaster'), 0, 1.62, 0);
    for (const px of [-1.42, 0, 1.42]) {
      cylinder(annex, 0.12, 0.14, 2.1, lab.get('redLacquer'), px, 1.38, 1.2, 10);
    }
    shojiPanel(annex, lab, 0.8, 1.2, 0, 1.42, 1.24, 3, 5);
    buildHipRoof(annex, lab, quality, {
      w: 4.6,
      d: 3.8,
      ridge: 1.9,
      eave: 2.95,
      rise: 0.72,
      curl: 0.18,
      snow: plan.terrain.snow,
      beasts: 2,
    });

    // 檐下吊灯笼：纸、竹骨、暖光。
    const glow = lab.glowMap();
    const lanterns: THREE.PointLight[] = [];
    for (const lx of [-3.0, 3.0]) {
      const lg = new THREE.Group();
      lg.position.set(lx, 3.28, 3.02);
      g.add(lg);
      cylinder(lg, 0.22, 0.22, 0.50, lab.get('paper'), 0, 0, 0, 12);
      cylinder(lg, 0.25, 0.19, 0.08, lab.get('soot'), 0, -0.28, 0, 12);
      cylinder(lg, 0.19, 0.25, 0.08, lab.get('soot'), 0, 0.28, 0, 12);
      for (let i = 0; i < 6; i += 1) {
        const a = i * Math.PI / 3;
        const bar = box(lg, 0.018, 0.48, 0.018, lab.get('darkWood'), Math.sin(a) * 0.205, 0, Math.cos(a) * 0.205, false);
        bar.rotation.y = a;
      }
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glow,
        color: 0xffbd77,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }));
      sprite.scale.set(2.4, 2.4, 1);
      sprite.position.set(0, 0, 0.12);
      lg.add(sprite);
      const light = new THREE.PointLight(0xffb66e, 1.25, 9, 2);
      light.position.set(0, 0, 0.2);
      lg.add(light);
      lanterns.push(light);
      tube(lg, [[0, 0.44, 0], [0, 0.56, 0]], 0.015, lab.get('darkWood'), 6, 4);
    }

    // 门内一点暖光，照亮檐下木构。
    const doorLight = new THREE.PointLight(0xffb067, 1.8, 10, 2);
    doorLight.position.set(0, 2.3, 3.1);
    g.add(doorLight);

    // 接触阴影：把建筑落到地面上。
    contactShadow(g, lab.contactShadow(), 0, 0.02, 0.4, 14, 10, 0.33);
    for (const sx of [-5.7, 5.7]) {
      contactShadow(g, lab.contactShadow(), sx, 0.015, -3.8, 4.2, 3.5, 0.26);
    }

    // 让灯光对象保留可动画标签。
    g.userData.lanternLights = lanterns;
    g.userData.doorLight = doorLight;
    return g;
  },
};
