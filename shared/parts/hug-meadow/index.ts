// hug-meadow —— `/hug` 的 L1 世界：一整片会呼吸的蒲公英草甸。
//
// 参考站：https://demo.darmk.com.cn/threejsExample/#/dandelion-meadow（实验 15 / 风的来信）。
// 这不是把旧 2D 花球“调参调亮”，而是把原站那一套真实空间结构完整搬过来：
//   · 10 株前后错落的蒲公英（1335 颗种子，Fibonacci 球面 + 44 段冠毛线）
//   · 半球光 + 指数雾 + 深橄榄绿背景渐变，让前后花球真正分开
//   · 100 颗失焦 bokeh 光斑在 z=-10..-18，衬出远处的暖光
//   · CatmullRom 曲线花茎 / TubeGeometry 茎管 / 3 片压弯的叶
//   · release 后种子按 0..1.8s 错峰脱开，乘同一个风场向右后方飞远
//
// 和旧 `dandelion` 零件的关系：旧件是 Canvas2D 的平面花球（10 个球叠在草地上），
// 它是 `/hug` 上一版的渲染层；这里保留它的数学布局常量（`PLANT_LAYOUT` 的 10 株、
// 1335 颗）作为视觉基准，但绘制换成原站同构的 three.js 实例化线段。旧件仍保留，
// 因为 preview 和 golden-run 还在读它的数学内核；`/hug` 的栈已经不再装它。
import * as THREE from 'three';
import type {
  Lod,
  PartEnv,
  PartInstance,
  PartV2,
  StageSize,
  WorldFrame,
} from '../../stage/contract';
import { mulberry32 } from '../../stage/world';

/** 一株蒲公英：世界坐标 + 花球半径 + 种子数。前 5 株是画面里的主花。 */
interface Plant {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly radius: number;
  readonly seeds: number;
}

/** 原站的 10 株布局；数量、半径、纵深关系逐项对齐参考站。 */
const PLANTS: readonly Plant[] = [
  { x: -1.1, y: 2.45, z: 1.1, radius: 0.82, seeds: 300 },
  { x: -3.5, y: 1.7, z: 0.1, radius: 0.53, seeds: 160 },
  { x: 1.35, y: 1.82, z: -0.5, radius: 0.58, seeds: 190 },
  { x: -0.1, y: 1.35, z: -2.3, radius: 0.48, seeds: 130 },
  { x: -4.6, y: 1.05, z: -2.8, radius: 0.39, seeds: 90 },
  { x: 3.45, y: 1.18, z: -2.4, radius: 0.44, seeds: 110 },
  { x: -2.6, y: 2.05, z: -4.1, radius: 0.47, seeds: 110 },
  { x: 2.2, y: 2.35, z: -5.5, radius: 0.45, seeds: 100 },
  { x: 4.7, y: 0.8, z: -5.4, radius: 0.32, seeds: 65 },
  { x: -5.7, y: 1.8, z: -5.2, radius: 0.39, seeds: 80 },
];

/** 种子错峰脱开窗口（秒）。 */
const DETACH_SECONDS = 1.8;

/** 一颗种子从花球到远方的运动时间（秒）。 */
const TRAVEL_SECONDS = 10;

/** 原站固定种子；这里用 env.seed 驱动，同 seed 复现。 */
const BASE_SEED = 31121;

/** 背景色 / 雾色：深橄榄绿，不是暖黄昏。 */
const BG = '#172c29';

/** 种子顶点着色器：与原站同构，只把随机源换成实例属性。 */
const SEED_VERTEX = `
attribute vec3 aHome;
attribute vec3 aAxis;
attribute float aRelease;
attribute float aRandom;
attribute float aSize;
uniform float uTime;
uniform float uWind;
uniform float uMotion;
varying vec3 vTint;
varying float vAlpha;

void main() {
  float age = max(0.0, uTime - aRelease);
  float flying = aRelease >= 0.0 && uTime >= aRelease ? 1.0 : 0.0;
  float travel = age * flying;

  vec3 floatingAxis = normalize(vec3(
    sin(travel * 0.7 + aRandom * 33.0) * 0.38,
    1.0,
    cos(travel + aRandom * 19.0) * 0.3
  ));
  vec3 axis = normalize(mix(aAxis, floatingAxis, smoothstep(0.0, 1.3, travel)));
  vec3 right = normalize(cross(abs(axis.y) > 0.96 ? vec3(1, 0, 0) : vec3(0, 1, 0), axis));
  vec3 forward = cross(axis, right);

  float spin = aRandom * 6.2831853;
  vec2 radial = mat2(cos(spin), -sin(spin), sin(spin), cos(spin)) * position.xz;
  vec3 local = (right * radial.x + axis * position.y + forward * radial.y) * aSize;

  // 有界的侧向摆动叠加主风向；这是美术轨迹，不是空气动力学求解。
  vec3 drift = vec3(
    travel * (0.35 + aRandom * 1.6),
    travel * (0.08 + fract(aRandom * 17.0) * 0.7),
    -travel * (0.5 + fract(aRandom * 31.0) * 2.5)
  );
  drift.x += sin(travel * 1.1 + aRandom * 31.0) * 0.24 * min(travel, 1.0);
  drift.y += sin(travel * 0.9 + aRandom * 23.0) * 0.22 * min(travel, 1.0);
  drift *= 0.85 + uWind * 0.25;

  vec3 home = aHome;
  home.x += sin(uTime * 0.65 + aHome.z) * 0.022 * uMotion;
  vec3 world = home + local + drift * flying;

  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  vTint = color;
  // 冠毛是半透明细丝；背向镜头的附着种子减淡，避免叠成实心白球。
  vAlpha = (1.0 - smoothstep(7.0, 10.0, travel))
    * mix(0.22 + max(0.0, aAxis.z) * 0.30, 0.64, flying);
}
`;

/** 种子片元着色器：颜色空间交给 three。 */
const SEED_FRAGMENT = `
varying vec3 vTint;
varying float vAlpha;
void main() {
  gl_FragColor = vec4(vTint, vAlpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** 背景片元：上暗下亮 + 右上暖光，完全程序化，无外部图。 */
const BG_FRAGMENT = `
varying vec2 vUv;
void main() {
  vec3 c = mix(vec3(0.007, 0.021, 0.018), vec3(0.055, 0.095, 0.065), vUv.y);
  float glow = exp(-length((vUv - vec2(0.72, 0.69)) * vec2(2.0, 2.5)) * 6.0);
  c += vec3(0.35, 0.27, 0.1) * glow;
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}
`;

const BG_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`;

const BOKEH_VERTEX = `
attribute float aSize;
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize;
}
`;

const BOKEH_FRAGMENT = `
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = pow(max(0.0, 1.0 - r * r), 3.0) * 0.12;
  gl_FragColor = vec4(0.8, 0.76, 0.5, a);
}
`;

type SeedGeometry = {
  readonly base: THREE.InstancedBufferGeometry;
  readonly material: THREE.ShaderMaterial;
  readonly mesh: THREE.LineSegments;
  readonly release: THREE.InstancedBufferAttribute;
  readonly releases: Float32Array;
};

type Phase = 'ready' | 'drifting' | 'away';

function buildSeedGeometry(seed: number): SeedGeometry {
  const rng = mulberry32(seed);

  // 44 个顶点 / 22 段线：花茎、冠毛主脉、两段分叉。每颗种子共用这条“伞”。
  const positions: number[] = [];
  const colors: number[] = [];
  const pair = (a: readonly [number, number, number], b: readonly [number, number, number], tint: number): void => {
    positions.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    // 每个线段有 2 个顶点，颜色必须逐顶点写；只写 1 组会让 color buffer 只有一半长度，
    // WebGL 报 "Vertex buffer is not big enough for the draw call"，整颗种子静默消失。
    colors.push(tint, tint * 0.96, tint * 0.83, tint, tint * 0.96, tint * 0.83);
  };
  pair([0, -0.055, 0], [0, 0, 0], 0.38);
  pair([0, 0, 0], [0, 0.16, 0], 0.7);
  for (let i = 0; i < 14; i += 1) {
    const angle = (i / 14) * Math.PI * 2;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    pair([0, 0.16, 0], [c * 0.07, 0.19, s * 0.07], 0.92);
    pair([c * 0.07, 0.19, s * 0.07], [c * 0.125, 0.18, s * 0.125], 1);
    pair(
      [c * 0.1, 0.184, s * 0.1],
      [c * 0.13 - s * 0.014, 0.19, s * 0.13 + c * 0.014],
      0.9,
    );
  }

  const homes: number[] = [];
  const axes: number[] = [];
  const randoms: number[] = [];
  const sizes: number[] = [];
  for (const plant of PLANTS) {
    for (let i = 0; i < plant.seeds; i += 1) {
      const y = 1 - ((i + 0.2 + rng() * 0.6) / plant.seeds) * 2;
      const ring = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = i * 2.39996323 + (rng() - 0.5) * 0.24;
      const bx = Math.cos(theta) * ring;
      const bz = Math.sin(theta) * ring;
      const size = 0.65 + rng() * 0.35;
      const radius = plant.radius - 0.17 * size + (rng() - 0.5) * plant.radius * 0.08;
      homes.push(plant.x + bx * radius, plant.y + y * radius, plant.z + bz * radius);
      axes.push(bx, y, bz);
      randoms.push(rng());
      sizes.push(size);
    }
  }

  const base = new THREE.InstancedBufferGeometry();
  base.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  base.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  base.setAttribute('aHome', new THREE.InstancedBufferAttribute(new Float32Array(homes), 3));
  base.setAttribute('aAxis', new THREE.InstancedBufferAttribute(new Float32Array(axes), 3));
  base.setAttribute('aRandom', new THREE.InstancedBufferAttribute(new Float32Array(randoms), 1));
  base.setAttribute('aSize', new THREE.InstancedBufferAttribute(new Float32Array(sizes), 1));
  const releases = new Float32Array(randoms.length).fill(-1);
  const release = new THREE.InstancedBufferAttribute(releases, 1);
  base.setAttribute('aRelease', release);
  base.instanceCount = randoms.length;

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uWind: { value: 0.7 },
      uMotion: { value: 1 },
    },
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    vertexShader: SEED_VERTEX,
    fragmentShader: SEED_FRAGMENT,
  });

  const mesh = new THREE.LineSegments(base, material);
  mesh.frustumCulled = false;
  return { base, material, mesh, release, releases };
}

function create(env: PartEnv): PartInstance {
  if (!env.canvas) throw new Error('hug-meadow 需要 GL 画布');

  // Node 假 DOM 的 canvas 会禁止 addEventListener；three 构造期必须挂 contextlost。
  // 探不通 = 没有真实 GL 画布，按 unsupported 让装配器跳过，而不是伪装成运行期 bug。
  try {
    const probe = (): void => {};
    env.canvas.addEventListener('webglcontextlost', probe);
    env.canvas.removeEventListener('webglcontextlost', probe);
  } catch {
    throw Object.assign(new Error('hug-meadow 需要真实 WebGL2 画布'), { code: 'E_UNSUPPORTED' });
  }

  let w = Math.max(1, env.width);
  let h = Math.max(1, env.height);
  let dpr = Math.max(1, env.dpr);
  let lod: Lod = env.lod;
  let disposed = false;
  let phase: Phase = 'ready';
  let time = 0;
  let launchTime = 0;
  let pointerArmed = true;
  let lastSize: StageSize = { w, h, dpr };
  const releaseRng = mulberry32((env.seed ^ 0x9e3779b9) >>> 0);

  const renderer = new THREE.WebGLRenderer({
    canvas: env.canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(new THREE.Color(BG), 1);
  renderer.autoClear = true;

  const onLost = (event: Event): void => {
    try { event.preventDefault(); } catch { /* 旧浏览器 */ }
    env.onError?.('WebGL context lost');
  };
  env.canvas.addEventListener('webglcontextlost', onLost);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.FogExp2(BG, 0.046);

  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 80);
  const hemi = new THREE.HemisphereLight(0xeedab0, 0x152e22, 3);
  scene.add(hemi);

  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const owned = <T extends THREE.BufferGeometry>(geometry: T): T => {
    geometries.add(geometry);
    return geometry;
  };
  const material = <T extends THREE.Material>(mat: T): T => {
    materials.add(mat);
    return mat;
  };
  const addMesh = (mesh: THREE.Mesh, geometry: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh => {
    owned(geometry);
    material(mat);
    scene.add(mesh);
    return mesh;
  };

  function buildBackground(): void {
    const bgMat = material(new THREE.ShaderMaterial({
      depthWrite: false,
      depthTest: false,
      vertexShader: BG_VERTEX,
      fragmentShader: BG_FRAGMENT,
    }));
    const bg = new THREE.Mesh(owned(new THREE.PlaneGeometry(2, 2)), bgMat);
    bg.frustumCulled = false;
    bg.renderOrder = -100;
    scene.add(bg);

    // 100 颗失焦光斑：不参与景深/阴影，只作为远处的暖光层。
    const rng = mulberry32(BASE_SEED + 17);
    const points: number[] = [];
    const sizes: number[] = [];
    for (let i = 0; i < 100; i += 1) {
      points.push((rng() - 0.5) * 36, rng() * 14 - 1, -10 - rng() * 8);
      sizes.push(16 + rng() * 110);
    }
    const geo = owned(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    geo.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
    const bokehMat = material(new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader: BOKEH_VERTEX,
      fragmentShader: BOKEH_FRAGMENT,
    }));
    scene.add(new THREE.Points(geo, bokehMat));
  }

  function buildMeadow(): void {
    const stemMat = material(new THREE.MeshStandardMaterial({ color: '#6d8051', roughness: 1 }));
    const headMat = material(new THREE.MeshStandardMaterial({ color: '#76664b', roughness: 1 }));
    const leafMat = material(new THREE.MeshStandardMaterial({
      color: '#334c2a',
      side: THREE.DoubleSide,
      roughness: 1,
    }));

    for (const plant of PLANTS) {
      // 花茎：三控制点，轻微前倾/侧弯，再包成细管。
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(plant.x - 0.18, -0.7, plant.z),
        new THREE.Vector3(plant.x - 0.13, plant.y * 0.5, plant.z + 0.06),
        new THREE.Vector3(plant.x, plant.y, plant.z),
      ]);
      const stemGeo = new THREE.TubeGeometry(curve, 12, 0.018, 5, false);
      addMesh(new THREE.Mesh(stemGeo, stemMat), stemGeo, stemMat);

      // 花托：一小颗棕色球，位于花茎顶端。
      const head = new THREE.Mesh(
        owned(new THREE.SphereGeometry(plant.radius * 0.12, 10, 7)),
        headMat,
      );
      head.position.set(plant.x, plant.y, plant.z);
      scene.add(head);

      // 3 片叶子：在 PlaneGeometry 上做弯曲 + 径向旋转，再落到地面。
      for (let leafIndex = 0; leafIndex < 3; leafIndex += 1) {
        const geo = owned(new THREE.PlaneGeometry(1, 1, 2, 14));
        const pos = geo.getAttribute('position') as THREE.BufferAttribute;
        const angle = leafIndex * 2.4 + plant.x;
        for (let i = 0; i < pos.count; i += 1) {
          const x0 = pos.getX(i) * 2;
          const y0 = pos.getY(i) + 0.5;
          const profile = (0.7 + Math.sin(y0 * 43) * 0.3) * Math.sin(y0 * Math.PI);
          const radial = x0 * profile * 0.13;
          const reach = y0 * 0.85;
          pos.setXYZ(
            i,
            Math.sin(angle) * reach + Math.cos(angle) * radial,
            -0.6 + Math.sin(y0 * Math.PI) * 0.27,
            Math.cos(angle) * reach - Math.sin(angle) * radial,
          );
        }
        geo.computeVertexNormals();
        // 原站叶片在 DPR1 下更宽；几何不变，只把三片叶放宽 35%，补回被暗背景吃掉的体量。
        const leaf = addMesh(new THREE.Mesh(geo, leafMat), geo, leafMat);
        leaf.position.set(plant.x, 0, plant.z);
        leaf.scale.set(1.35, 1.08, 1.35);
      }
    }
  }

  buildBackground();
  buildMeadow();
  // 必须用原站固定种子 31121：换 seed 会改掉每颗种子的大小与抖动，
  // 花球轮廓就和参考站不是同一团（之前用 env.seed 是错的）。
  const seed = buildSeedGeometry(BASE_SEED);
  scene.add(seed.mesh);
  geometries.add(seed.base);
  materials.add(seed.material);

  function setRenderScaleForLod(): void {
    // 低档不删种子（删了会变成秃球），只降低像素比；种子线本身是 1px。
    // 原站 1.6 的像素比在 Retina 上把 1px 线压成 0.625 CSS px，实机对照显得“太规整、缺毛边”；
    // 高/低档分别收到 1.25 / 1.0，让线在屏上回到约 0.8 / 1 CSS px，同时保留整片种子的细密感。
    // 代价是背景 bokeh 略软——这正是参考站 DPR1 的观感，不是画质退化。
    const cap = lod === 'low' ? 1.0 : 1.25;
    renderer.setPixelRatio(Math.min(dpr, cap));
  }

  function resize(size: StageSize): void {
    lastSize = size;
    w = Math.max(1, size.w);
    h = Math.max(1, size.h);
    dpr = Math.max(1, size.dpr);
    const aspect = w / h;
    camera.aspect = aspect;
    // 参考站场景是 1.87 宽幅（40° 视场），/hug 是铺满 16:10 视口。
    // 原站就是 40°；先前为了填满 16:10 收到 34°，实机对照后发现花球偏大、绒毛变稀（单位面积线更少）。
    // 回到 40° 保住原站的花球屏占比与绒毛密度；lookAt 左移到 -1.3 维持 5 簇落位。
    camera.fov = w < 600 ? 42 : 40;
    camera.position.set(w < 600 ? -0.8 : 0, 3.7, w < 600 ? 16.8 : 10.8);
    camera.lookAt(w < 600 ? -0.3 : -1.3, 2, -0.6);
    camera.updateProjectionMatrix();
    setRenderScaleForLod();
    renderer.setSize(w, h, false);
  }

  function blow(strength = 0.7): void {
    if (disposed || phase !== 'ready') return;
    const wind = Number.isFinite(strength) ? Math.max(0.2, Math.min(1, strength)) : 0.7;
    const uWind = seed.material.uniforms.uWind;
    if (uWind) uWind.value = wind;
    launchTime = time;
    phase = 'drifting';
    for (let i = 0; i < seed.releases.length; i += 1) {
      seed.releases[i] = time + releaseRng() * DETACH_SECONDS;
    }
    seed.release.needsUpdate = true;
  }

  function reset(): void {
    if (disposed) return;
    seed.releases.fill(-1);
    seed.release.needsUpdate = true;
    phase = 'ready';
    launchTime = time;
    const uWind = seed.material.uniforms.uWind;
    if (uWind) uWind.value = 0.7;
  }

  resize(lastSize);

  return {
    update(f: WorldFrame): void {
      if (disposed) return;
      time = f.t;
      const uTime = seed.material.uniforms.uTime;
      if (uTime) uTime.value = time;
      const uMotion = seed.material.uniforms.uMotion;
      if (uMotion) uMotion.value = f.reducedMotion ? 0 : 1;
      // 整片草甸就是触发区（staged 的 pointerdown 已过滤 Esc 菜单）：
      // 按一次只放飞一次，抬手才重新上膛，避免按住时反复触发。
      if (!f.pointer.down) pointerArmed = true;
      else if (pointerArmed && phase === 'ready') {
        pointerArmed = false;
        blow();
      }
      if (f.audio) {
        const uWind = seed.material.uniforms.uWind;
        if (uWind) uWind.value = Math.max(0.4, Math.min(1, 0.55 + f.audio.level * 0.45));
        if (phase === 'ready' && f.audio.level > 0.12) blow(Math.max(0.4, f.audio.level));
      }
      if (phase === 'drifting' && time - launchTime >= DETACH_SECONDS + TRAVEL_SECONDS) {
        phase = 'away';
      }
    },
    draw(): void {
      if (disposed) return;
      renderer.render(scene, camera);
    },
    resize,
    setLod(next: Lod): void {
      lod = next;
      setRenderScaleForLod();
      renderer.setSize(w, h, false);
    },
    cue(verb: string): void {
      if (verb === 'release') blow();
      else if (verb === 'reset') reset();
    },
    readiness(): number {
      return 1;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      env.canvas.removeEventListener('webglcontextlost', onLost);
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((mat) => mat.dispose());
      geometries.clear();
      materials.clear();
      renderer.dispose();
    },
  };
}

export const part: PartV2 = {
  id: 'hug-meadow',
  layer: 'L1',
  channel: 'world',
  blend: 'source-over',
  space: 'screen',
  costMs: 4,
  kb: 16,
  z: 0,
  requires: ['webgl2'],
  expendable: false,
  create,
};

export default part;
