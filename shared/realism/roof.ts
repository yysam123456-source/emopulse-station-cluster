import * as THREE from 'three';
import { MaterialLab } from './materials';
import { box, cylinder, mesh, tube } from './primitives';

export interface RoofOptions {
  readonly x?: number;
  readonly z?: number;
  readonly w: number;
  readonly d: number;
  readonly ridge: number;
  readonly eave: number;
  readonly rise: number;
  readonly curl?: number;
  readonly snow?: boolean;
  readonly beasts?: number;
}

function faceUp(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = g.getAttribute('normal') as THREE.BufferAttribute;
  let sy = 0;
  for (let i = 1; i < n.array.length; i += 3) sy += n.array[i] as number;
  if (sy < 0) {
    const idx = g.getIndex();
    if (idx) {
      const a = idx.array;
      for (let i = 0; i < a.length; i += 3) {
        const t = a[i + 1] as number;
        a[i + 1] = a[i + 2] as number;
        a[i + 2] = t;
      }
      idx.needsUpdate = true;
    }
    g.computeVertexNormals();
  }
  return g;
}

function grid(
  nx: number,
  nz: number,
  fn: (u: number, v: number) => [number, number, number],
  keep?: (u: number, v: number) => boolean,
): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= nz; j += 1) {
    for (let i = 0; i <= nx; i += 1) {
      const p = fn(i / nx, j / nz);
      pos.push(...p);
      uv.push(i / nx, j / nz);
    }
  }
  for (let j = 0; j < nz; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      if (keep && !keep((i + 0.5) / nx, (j + 0.5) / nz)) continue;
      const a = j * (nx + 1) + i;
      const b = a + 1;
      const c = a + nx + 1;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function clippedGrid(
  nx: number,
  nz: number,
  fn: (u: number, v: number) => [number, number, number],
  field: (u: number, v: number) => number,
): THREE.BufferGeometry {
  const points: Array<{ p: [number, number, number]; u: number; v: number; f: number }> = [];
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= nz; j += 1) {
    for (let i = 0; i <= nx; i += 1) {
      const u = i / nx;
      const v = j / nz;
      points.push({ p: fn(u, v), u, v, f: field(u, v) });
    }
  }
  const tri = (ids: number[]): void => {
    const poly = ids.map((n) => points[n]!);
    const out: typeof poly = [];
    for (let i = 0; i < 3; i += 1) {
      const a = poly[i]!;
      const b = poly[(i + 1) % 3]!;
      if (a.f >= 0) out.push(a);
      if ((a.f >= 0) !== (b.f >= 0)) {
        const t = a.f / (a.f - b.f);
        out.push({
          p: [
            a.p[0] + (b.p[0] - a.p[0]) * t,
            a.p[1] + (b.p[1] - a.p[1]) * t,
            a.p[2] + (b.p[2] - a.p[2]) * t,
          ],
          u: a.u + (b.u - a.u) * t,
          v: a.v + (b.v - a.v) * t,
          f: 0,
        });
      }
    }
    for (let i = 1; i + 1 < out.length; i += 1) {
      for (const q of [out[0]!, out[i]!, out[i + 1]!]) {
        idx.push(pos.length / 3);
        pos.push(...q.p);
        uv.push(q.u, q.v);
      }
    }
  };
  for (let j = 0; j < nz; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const a = j * (nx + 1) + i;
      const b = a + 1;
      const c = a + nx + 1;
      const d = c + 1;
      tri([a, c, b]);
      tri([b, c, d]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function roofPoint(
  w: number,
  d: number,
  ridge: number,
  eave: number,
  rise: number,
  side: number,
  u: number,
  t: number,
  curl: number,
): [number, number, number] {
  const hw = w / 2;
  const hd = d / 2;
  let x: number;
  let z: number;
  if (side < 2) {
    const span = ridge / 2 + (hw - ridge / 2) * t;
    x = -span + span * 2 * u;
    z = (side === 0 ? 1 : -1) * hd * t;
  } else {
    x = (side === 2 ? 1 : -1) * (ridge / 2 + (hw - ridge / 2) * t);
    z = -hd + hd * 2 * u * t;
  }
  const y = eave + rise * Math.pow(1 - t, 1.48)
    + curl * Math.pow(t, 6) * Math.pow(Math.abs(u * 2 - 1), 3)
    + 0.038 * Math.pow(t, 8);
  return [x, y, z];
}

export function buildHipRoof(
  parent: THREE.Object3D,
  lab: MaterialLab,
  quality: 'low' | 'high',
  o: RoofOptions,
): THREE.Group {
  const g = new THREE.Group();
  g.position.set(o.x ?? 0, 0, o.z ?? 0);
  parent.add(g);
  const curl = o.curl ?? 0.22;
  const roofMat = lab.get('roofTile');
  const darkMat = lab.get('soot');
  const edgeMat = lab.get('roofEdge');
  const snowMat = lab.get('snow');
  const segX = quality === 'high' ? 52 : 28;
  const segY = quality === 'high' ? 20 : 12;
  const tileCount = (side: number): number => Math.round((side < 2 ? o.w : o.d) / (quality === 'high' ? 0.26 : 0.34));

  for (let side = 0; side < 4; side += 1) {
    const geo = faceUp(grid(segX, segY, (u, t) => roofPoint(o.w, o.d, o.ridge, o.eave, o.rise, side, u, t, curl)));
    // 瓦垄必须沿坡面直下，不能跟着梯形网格扇开。旧 UV 用参数 u/v，
    // 结果所有瓦垄从正脊向外发散，看起来像斜纹铁皮；这里改成世界坐标 UV：
    // 横向按真实宽度、纵向按高度，瓦垄才是一根根竖直的。
    const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
    const uvAttr = geo.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < posAttr.count; i += 1) {
      const px = posAttr.getX(i);
      const py = posAttr.getY(i);
      const pz = posAttr.getZ(i);
      uvAttr.setXY(
        i,
        side < 2 ? px / o.w + 0.5 : pz / o.d * 0.5 + 0.5,
        Math.max(0, Math.min(1.25, (py - o.eave) / Math.max(0.001, o.rise))),
      );
    }
    uvAttr.needsUpdate = true;
    mesh(geo, roofMat, 0, 0, 0, g);
    // 深色垫层，仰视时不会从瓦缝里看穿。
    const lower = geo.clone();
    lower.translate(0, -0.055, 0);
    mesh(lower, darkMat, 0, 0, 0, g);

    // 瓦垄：从檐口沿坡面到正脊，是“瓦”最关键的密度。
    const count = tileCount(side);
    if (quality === 'low') {
      for (let i = 0; i <= count; i += 1) {
        const u = i / count;
        const pts: Array<[number, number, number]> = [];
        for (let j = 1; j <= 10; j += 1) {
          const p = roofPoint(o.w, o.d, o.ridge, o.eave, o.rise, side, u, j / 10, curl);
          pts.push([p[0], p[1] + 0.012, p[2]]);
        }
        tube(g, pts, 0.020, edgeMat, 8, 4);
      }
    } else {
      // 高画质把瓦垄交给真实瓦作照片纹理，不再叠一圈圈“铁皮箍”。
      // 只在檐口做一道薄压边，保证轮廓干净。
      for (let i = 0; i <= 10; i += 1) {
        const p = roofPoint(o.w, o.d, o.ridge, o.eave, o.rise, side, i / 10, 0.99, curl);
        if (i > 0) {
          const prev = roofPoint(o.w, o.d, o.ridge, o.eave, o.rise, side, (i - 1) / 10, 0.99, curl);
          tube(g, [[prev[0], prev[1] + 0.004, prev[2]], [p[0], p[1] + 0.004, p[2]]], 0.018, edgeMat, 8, 2);
        }
      }
    }

    // 檐口：一排圆瓦当 + 一条压边木。
    const eaveCount = count;
    const eavePts: Array<[number, number, number]> = [];
    for (let i = 0; i <= 24; i += 1) {
      eavePts.push(roofPoint(o.w, o.d, o.ridge, o.eave, o.rise, side, i / 24, 0.0, curl));
    }
    for (let i = 1; i < eavePts.length; i += 1) {
      const a = eavePts[i - 1]!;
      const b = eavePts[i]!;
      const m = new THREE.Vector3(
        (a[0] + b[0]) / 2,
        (a[1] + b[1]) / 2 - 0.015,
        (a[2] + b[2]) / 2,
      );
      const angle = Math.atan2(b[2] - a[2], b[0] - a[0]);
      const tile = cylinder(g, 0.032, 0.038, 0.075, edgeMat, m.x, m.y, m.z, 9);
      tile.rotation.set(Math.PI / 2, 0, -angle);
    }
    for (let i = 0; i < eaveCount; i += 1) {
      const p = roofPoint(o.w, o.d, o.ridge, o.eave, o.rise, side, (i + 0.5) / eaveCount, 0, curl);
      const disc = mesh(new THREE.CircleGeometry(0.038, 10), edgeMat, p[0], p[1] - 0.006, p[2], g);
      disc.rotation.y = side === 0 ? 0 : side === 1 ? Math.PI : side === 2 ? Math.PI / 2 : -Math.PI / 2;
    }

    // 檐下椽子：只在低机位看到，但正是这个角度暴露“纸片屋顶”。
    const rafters = quality === 'high' ? 26 : 14;
    for (let i = 0; i < rafters; i += 1) {
      const u = i / (rafters - 1);
      const p0 = roofPoint(o.w, o.d, o.ridge, o.eave, o.rise, side, u, 0.015, curl);
      const p1 = roofPoint(o.w, o.d, o.ridge, o.eave, o.rise, side, u, 0.20, curl);
      const m = new THREE.Vector3((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2 - 0.17, (p0[2] + p1[2]) / 2);
      const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
      const b = box(g, 0.065, 0.075, len + 0.2, lab.get('darkWood'), m.x, m.y, m.z, false);
      const yaw = Math.atan2(p1[0] - p0[0], p1[2] - p0[2]);
      b.rotation.y = yaw;
    }

    // 檐口封边。
    const fascia = box(g, side < 2 ? o.w + 0.08 : 0.16, 0.13, side < 2 ? 0.16 : o.d + 0.08, lab.get('darkWood'),
      side === 0 ? 0 : side === 1 ? 0 : side === 2 ? o.w / 2 : -o.w / 2,
      o.eave - 0.02,
      side === 0 ? o.d / 2 : side === 1 ? -o.d / 2 : 0, false);
    fascia.rotation.y = side < 2 ? 0 : Math.PI / 2;

    if (o.snow) {
      const field = (u: number, t: number): number => {
        const p = roofPoint(o.w, o.d, o.ridge, o.eave, o.rise, side, u, t, curl);
        return Math.min((0.92 - t) * 3, (t - 0.02) * 3, 0.36 + 0.28 * Math.sin(p[0] * 1.7 + p[2] * 1.3));
      };
      const sg = faceUp(clippedGrid(quality === 'high' ? 72 : 38, quality === 'high' ? 26 : 14, (u, t) => {
        const p = roofPoint(o.w, o.d, o.ridge, o.eave, o.rise, side, u, t, curl);
        return [p[0], p[1] + 0.046, p[2]];
      }, field));
      mesh(sg, snowMat, 0, 0, 0, g);
    }
  }

  // 正脊、脊端、四角戗脊。
  tube(g, [[-o.ridge / 2, o.eave + o.rise + 0.035, 0], [o.ridge / 2, o.eave + o.rise + 0.035, 0]], 0.075, edgeMat, 18, 8);
  for (const end of [-1, 1]) {
    tube(g, [
      [end * (o.ridge / 2 - 0.08), o.eave + o.rise + 0.05, 0],
      [end * (o.ridge / 2 + 0.07), o.eave + o.rise + 0.20, 0],
      [end * (o.ridge / 2 + 0.025), o.eave + o.rise + 0.38, 0],
      [end * (o.ridge / 2 - 0.10), o.eave + o.rise + 0.31, 0],
    ], 0.074, edgeMat, 12, 6);
    const finial = cylinder(g, 0.06, 0.10, 0.22, edgeMat, end * o.ridge / 2, o.eave + o.rise + 0.24, 0, 8);
    finial.rotation.z = end * 0.18;
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const pts: Array<[number, number, number]> = [];
      for (let j = 0; j <= 14; j += 1) {
        const t = j / 14;
        pts.push([sx * (o.ridge / 2 + (o.w / 2 - o.ridge / 2) * t), o.eave + o.rise * Math.pow(1 - t, 1.48) + curl * Math.pow(t, 6) + 0.08, sz * o.d / 2 * t]);
      }
      tube(g, pts, 0.043, edgeMat, 18, 5);
      const beasts = o.beasts ?? 0;
      for (let k = 0; k < beasts; k += 1) {
        const t = 0.86 - k * 0.041;
        const y = o.eave + o.rise * Math.pow(1 - t, 1.48) + curl * Math.pow(t, 6) + 0.105;
        const x = sx * (o.ridge / 2 + (o.w / 2 - o.ridge / 2) * t);
        const z = sz * o.d / 2 * t;
        const body = mesh(new THREE.ConeGeometry(0.075, 0.22, 6), edgeMat, x, y, z, g);
        body.rotation.z = sx * 0.12;
        const head = mesh(new THREE.SphereGeometry(0.052, 7, 6), edgeMat, x + sx * 0.035, y + 0.13, z, g);
        void head;
      }
    }
  }
  return g;
}
