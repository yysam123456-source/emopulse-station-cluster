import * as THREE from 'three';

export function mulberry(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function group(x = 0, y = 0, z = 0, rot = 0, parent?: THREE.Object3D): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = rot;
  parent?.add(g);
  return g;
}

export function mesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  parent?: THREE.Object3D,
  shadows = true,
): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = shadows;
  m.receiveShadow = shadows;
  parent?.add(m);
  return m;
}

export function box(
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  shadows = true,
): THREE.Mesh {
  return mesh(new THREE.BoxGeometry(w, h, d), material, x, y, z, parent, shadows);
}

export function cylinder(
  parent: THREE.Object3D,
  rt: number,
  rb: number,
  h: number,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  segments = 16,
  shadows = true,
): THREE.Mesh {
  return mesh(new THREE.CylinderGeometry(rt, rb, h, segments), material, x, y, z, parent, shadows);
}

export function beam(
  parent: THREE.Object3D,
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  radius: number,
  material: THREE.Material,
  segments = 8,
  shadows = true,
): THREE.Mesh {
  const av = new THREE.Vector3(...a);
  const bv = new THREE.Vector3(...b);
  const mid = av.clone().add(bv).multiplyScalar(0.5);
  const m = cylinder(parent, radius, radius, av.distanceTo(bv), material, mid.x, mid.y, mid.z, segments, shadows);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), bv.sub(av).normalize());
  return m;
}

export function tube(
  parent: THREE.Object3D,
  points: readonly (readonly [number, number, number])[],
  radius: number,
  material: THREE.Material,
  segments = 20,
  radial = 6,
): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  return mesh(new THREE.TubeGeometry(curve, segments, radius, radial, false), material, 0, 0, 0, parent);
}

export function ribbon(
  parent: THREE.Object3D,
  path: readonly (readonly [number, number, number])[],
  width: number,
  material: THREE.Material,
  lift = 0,
): THREE.Mesh {
  const verts: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < path.length; i += 1) {
    const q = new THREE.Vector3(...path[i]);
    const before = new THREE.Vector3(...path[Math.max(0, i - 1)]);
    const after = new THREE.Vector3(...path[Math.min(path.length - 1, i + 1)]);
    const tangent = after.sub(before).normalize();
    const side = new THREE.Vector3().crossVectors(tangent, up).normalize();
    if (side.lengthSq() < 0.001) side.set(1, 0, 0);
    side.multiplyScalar(width / 2);
    const l = q.clone().sub(side);
    const r = q.clone().add(side);
    verts.push(l.x, l.y + lift, l.z, r.x, r.y + lift, r.z);
    const v = i / (path.length - 1);
    uvs.push(0, v, 1, v);
    if (i < path.length - 1) {
      const k = i * 2;
      idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return mesh(geo, material, 0, 0, 0, parent);
}

export function rock(parent: THREE.Object3D, radius: number, material: THREE.Material, x: number, y: number, z: number, seed: number): THREE.Mesh {
  const rng = mulberry(seed);
  const geo = new THREE.IcosahedronGeometry(radius, 2);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i += 1) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    const pz = pos.getZ(i);
    const n = 1 + (rng() - 0.5) * 0.34 + Math.sin(px * 5.1 + pz * 3.7) * 0.05;
    pos.setXYZ(i, px * n, py * n * 0.78, pz * n);
  }
  geo.computeVertexNormals();
  const m = mesh(geo, material, x, y, z, parent);
  m.rotation.set(rng() * 0.4, rng() * Math.PI * 2, rng() * 0.3);
  return m;
}

export function contactShadow(
  parent: THREE.Object3D,
  texture: THREE.Texture,
  x: number,
  y: number,
  z: number,
  sx: number,
  sz: number,
  opacity: number,
  color = 0x1b130c,
): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(sx, sz),
    new THREE.MeshBasicMaterial({
      map: texture,
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      fog: false,
      blending: THREE.NormalBlending,
    }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  m.renderOrder = 2;
  parent.add(m);
  return m;
}

/**
 * 静态合批：与故宫场景同一种做法，按材质合并静态网格。
 * 不合并透明材质与 Points/Sprite/Light，避免改变排序与透射。
 */
export function mergeStatic(root: THREE.Object3D, skip: readonly THREE.Object3D[] = []): THREE.Group {
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert();
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const remove: THREE.Object3D[] = [];
  root.traverse((o) => {
    for (let a: THREE.Object3D | null = o; a && a !== root; a = a.parent) {
      if (skip.includes(a)) return;
    }
    const m = o as THREE.Mesh;
    if (!m.isMesh || o instanceof THREE.InstancedMesh || Array.isArray(m.material) || m.material.transparent) return;
    if (m.userData.noMerge) return;
    const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    geo.applyMatrix4(m.matrixWorld);
    geo.applyMatrix4(inverse);
    geo.deleteAttribute('tangent');
    let arr = batches.get(m.material);
    if (!arr) {
      arr = [];
      batches.set(m.material, arr);
    }
    arr.push(geo);
    remove.push(m);
  });
  for (const o of remove) o.removeFromParent();
  const out = new THREE.Group();
  out.name = 'merged-static';
  for (const [material, geos] of batches) {
    let total = 0;
    for (const g of geos) total += g.getAttribute('position').count;
    const merged = new THREE.BufferGeometry();
    for (const [key, size] of [['position', 3], ['normal', 3], ['uv', 2]] as const) {
      const data = new Float32Array(total * size);
      let offset = 0;
      for (const g of geos) {
        const attr = g.getAttribute(key);
        if (attr) data.set(attr.array as Float32Array, offset);
        offset += g.getAttribute('position').count * size;
      }
      merged.setAttribute(key, new THREE.BufferAttribute(data, size));
    }
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    const m = new THREE.Mesh(merged, material);
    m.castShadow = true;
    m.receiveShadow = true;
    out.add(m);
    for (const g of geos) g.dispose();
  }
  root.add(out);
  return out;
}

export function countTriangles(root: THREE.Object3D): number {
  let tris = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry;
    if (!g) return;
    const count = g.index ? g.index.count : g.getAttribute('position')?.count ?? 0;
    tris += Math.floor(count / 3) * (o instanceof THREE.InstancedMesh ? o.count : 1);
  });
  return tris;
}

export function disposeObject(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    if (m.material) {
      if (Array.isArray(m.material)) m.material.forEach((x) => x.dispose());
      else m.material.dispose();
    }
  });
}
