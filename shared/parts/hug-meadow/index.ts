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
  // 2026-11-27 产品重排：一株近景主花 + 一片后退的远景花群。
  // 原来的 10 株几乎站在同一条 z 线上，透视压平后变成“一排棒棒糖”。
  // 种子数不变（仍是 1335）：只改纵深与主次，不动原站的密度预算。
  { x: -0.9, y: 2.50, z: 2.0, radius: 0.92, seeds: 300 },
  { x: -3.8, y: 1.15, z: -2.4, radius: 0.48, seeds: 160 },
  { x: 1.9, y: 1.25, z: -1.6, radius: 0.52, seeds: 190 },
  { x: -0.3, y: 0.95, z: -5.0, radius: 0.42, seeds: 130 },
  { x: -5.4, y: 0.80, z: -4.6, radius: 0.36, seeds: 90 },
  { x: 4.0, y: 0.90, z: -4.8, radius: 0.40, seeds: 110 },
  { x: -2.8, y: 1.05, z: -6.2, radius: 0.40, seeds: 110 },
  { x: 2.4, y: 1.10, z: -7.4, radius: 0.38, seeds: 100 },
  { x: 5.6, y: 0.65, z: -8.0, radius: 0.28, seeds: 65 },
  { x: -6.3, y: 0.95, z: -7.2, radius: 0.34, seeds: 80 },
];

/** 种子错峰脱开窗口（秒）。 */
const DETACH_SECONDS = 1.8;

/** 一颗种子从花球到远方的运动时间（秒）。 */
const TRAVEL_SECONDS = 10;

/** 原站固定种子；这里用 env.seed 驱动，同 seed 复现。 */
const BASE_SEED = 31121;

/** 背景色 / 雾色：黄昏暖褐，不是冷橄榄绿。 */
const BG = '#24160d';

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
uniform float uLong;
void main() {
  // 黄昏暖褐：上暗下暖，右下角一团低太阳的橘光。原来的深橄榄绿把全帧拉到 139°，
  // 与产品规格的 35–55° 相反；颜色是构图的一部分，不是后期滤镜。
  float y = vUv.y;
  // 黄昏天光：地平线附近最暖，往上转暗，往下是草甸的暗底。
  vec3 c = mix(vec3(0.012, 0.007, 0.003), vec3(0.145, 0.095, 0.036),
    smoothstep(0.24, 0.82, y));
  // 40s 后太阳沿地平线缓慢下落：只改背景，不碰种子的放飞因果。
  vec2 glowAt = vec2(0.79 - 0.17 * uLong, 0.36 - 0.075 * uLong);
  // 地平线暖带只围着太阳，不能横贯全屏变成一条发光的河。
  float horizon = exp(-pow((y - 0.315) / 0.095, 2.0));
  float hx = 0.16 + 0.84 * exp(-pow((vUv.x - glowAt.x) / 0.58, 2.0));
  c += vec3(0.29, 0.175, 0.060) * horizon * hx * 0.30;
  c *= mix(0.46, 1.0, smoothstep(0.03, 0.31, y));
  float glow = exp(-length((vUv - glowAt) * vec2(2.1, 3.0)) * 5.0);
  c += vec3(0.64, 0.38, 0.13) * glow * (1.0 - 0.34 * uLong);
  float core = exp(-length((vUv - glowAt) * vec2(3.8, 5.2)) * 15.0);
  c += vec3(1.0, 0.70, 0.33) * core * 0.22;
  // 太阳沉下去，天色也要跟着退：只移光斑不压整体亮度，40s 的慢变量在画面上读不出来。
  c *= 1.0 - 0.24 * uLong;
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
  // 40s 长停留是「用户在这站待了多久」，必须走真实时钟，不能走被 rAF 节流的累计帧时；
  // 否则无头/后台标签只出一帧时，太阳永远停在 40s 之前。
  const bornAt = performance.now();
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
  const hemi = new THREE.HemisphereLight(0xffdfb0, 0x24160d, 2.4);
  scene.add(hemi);
  // 低太阳从右后方打进来：只给茎/叶/花托一层暖边，不投影、不改变种子的自发光线。
  const lowSun = new THREE.DirectionalLight(0xffc98a, 1.8);
  lowSun.position.set(9, 5, -5);
  lowSun.target.position.set(0, 1.2, -1);
  scene.add(lowSun);
  scene.add(lowSun.target);

  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
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

  let bgLong: { value: number } | null = null;

  function buildBackground(): void {
    const bgMat = material(new THREE.ShaderMaterial({
      depthWrite: false,
      depthTest: false,
      vertexShader: BG_VERTEX,
      fragmentShader: BG_FRAGMENT,
      uniforms: {
        uLong: { value: 0 },
      },
    }));
    bgLong = bgMat.uniforms.uLong as { value: number };
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
    const stemMat = material(new THREE.MeshStandardMaterial({ color: '#6f643a', roughness: 1 }));
    const headMat = material(new THREE.MeshStandardMaterial({ color: '#76664b', roughness: 1 }));
    const leafMat = material(new THREE.MeshStandardMaterial({
      color: '#4a3f1f',
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

  function buildGrass(): void {
    // 草甸的“草”不是一排三角钉：一张程序化画的草叶卡片，重复成上千个竖直面片。
    // 卡片的透明边缘用 alphaTest 切掉，近处有体积、远处被雾吃掉，仍不引入任何外部图片。
    const doc = (env.canvas as unknown as { ownerDocument?: Document }).ownerDocument
      ?? (globalThis as unknown as { document?: Document }).document;
    if (!doc || typeof doc.createElement !== 'function') return;

    function grassTexture(seed: number): THREE.CanvasTexture | null {
      const c = doc!.createElement('canvas');
      c.width = 128;
      c.height = 128;
      const ctx = c.getContext('2d');
      if (!ctx) return null;
      ctx.clearRect(0, 0, 128, 128);
      const rng = mulberry32(seed);
      for (let i = 0; i < 34; i += 1) {
        const x = 10 + rng() * 108;
        const baseY = 126;
        const height = 34 + rng() * 88;
        const tipX = x + (rng() - 0.5) * 20;
        const midX = x + (rng() - 0.5) * 9;
        ctx.beginPath();
        ctx.moveTo(x, baseY);
        ctx.quadraticCurveTo(midX, baseY - height * 0.58, tipX, baseY - height);
        ctx.lineWidth = 1.0 + rng() * 1.4;
        const lit = rng();
        // 少量草尖吃到低太阳，大部分是深色剪影；全画成金黄色会变成麦田。
        ctx.strokeStyle = lit > 0.82
          ? `rgba(176,143,76,${0.22 + rng() * 0.24})`
          : `rgba(48,42,20,${0.36 + rng() * 0.34})`;
        ctx.stroke();
      }
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      textures.add(tex);
      return tex;
    }

    const cardGeo = owned(new THREE.PlaneGeometry(0.62, 0.92));
    // 几何底边落在 y=0，实例位置就是草的落地位置。
    cardGeo.translate(0, 0.46, 0);
    const variants = [grassTexture(BASE_SEED + 41), grassTexture(BASE_SEED + 53)]
      .filter((tex): tex is THREE.CanvasTexture => Boolean(tex));
    if (variants.length === 0) return;

    const countPer = 620;
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const sc = new THREE.Vector3();
    variants.forEach((tex, variant) => {
      // 半透明草卡：草叶之间保留空气感，低太阳的暖光才会从草缝里透出来。
      // alphaTest 切硬边，transparent 负责叶与叶的叠色；depthWrite 关掉，避免透明面互相截断。
      const mat = material(new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        alphaTest: 0.16,
        side: THREE.DoubleSide,
        depthWrite: false,
      }));
      const mesh = new THREE.InstancedMesh(cardGeo, mat, countPer);
      mesh.frustumCulled = false;
      const rng = mulberry32(BASE_SEED + 67 + variant * 19);
      for (let i = 0; i < countPer; i += 1) {
        // 成丛：先选丛心，再在 0.4–1.1m 内撒卡片；近处卡片更高。
        const cx = -13 + rng() * 24;
        const cz = -12 + rng() * 15;
        const angle = rng() * Math.PI * 2;
        const r = Math.sqrt(rng()) * (0.35 + rng() * 0.75);
        const x = cx + Math.cos(angle) * r;
        const z = cz + Math.sin(angle) * r;
        const height = 0.55 + rng() * 0.55 + (z > 0.6 ? 0.22 : 0);
        const width = 0.75 + rng() * 0.8;
        e.set(0, rng() * Math.PI * 2, (rng() - 0.5) * 0.18);
        q.setFromEuler(e);
        p.set(x, -0.79, z);
        sc.set(width, height, 1);
        m.compose(p, q, sc);
        mesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
      scene.add(mesh);
    });
  }

  buildBackground();
  buildMeadow();
  buildGrass();
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
      // 长停留单向慢变量：40s 后太阳高度/暖光位置开始下降，不会回弹。
      const wall = (performance.now() - bornAt) / 1000;
      if (bgLong) bgLong.value = Math.min(1, Math.max(0, (wall - 40) / 30));
      const uTime = seed.material.uniforms.uTime;
      if (uTime) uTime.value = time;
      const uMotion = seed.material.uniforms.uMotion;
      if (uMotion) uMotion.value = f.reducedMotion ? 0 : 1;
      // 因果只在站点层（`sites/hug/attach.ts`）：零件不监听 pointer、不因麦克风电平自动放飞。
      // 上一版在 pointerdown 和 audio.level>0.12 时自己调 blow()，于是「只是想开个风」会把整片蒲公英吹走。
      if (f.audio) {
        const uWind = seed.material.uniforms.uWind;
        if (uWind) uWind.value = Math.max(0.4, Math.min(1, 0.55 + f.audio.level * 0.45));
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
      textures.forEach((tex) => tex.dispose());
      textures.clear();
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
