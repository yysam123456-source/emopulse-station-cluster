// dawn-desk —— **预览专用** L1 world 件，不是正式零件。
//
// 它做一件事：把 /license 的一张纸放进一间“清晨签发台”的小书房里。
// 纸是主角；桌、窗、绿植、灯与晨雾只是让这张纸有地方、有光、有时间。
//
// 不是产品代码：不进 shared/parts、不进 /license、不进 dist/sites。
// 场景重写在 ./studio.ts；第三方只拆做法，不复制未授权代码/素材。
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { PartEnv, PartInstance, PartV2, StageSize, WorldFrame } from '../../contract';
import { buildStudio, dataTexture, DESK_Y, paintEnvelope, paintInkFelt, paintLinen, paintPageEdges, paintStampDie, paintTrayLabel, paintWood, PAPER_Y, texture } from './studio';

/** 纸在桌面上的位置 / 尺寸（米）。 */
const PAPER = Object.freeze({
  x: 3.14,
  z: 0.38,
  w: 0.792,
  h: 0.560,
  yaw: -0.07,
});

/** 纸贴图分辨率。A4 横 1.414，和 /license 的 1410×1000 同比例。 */
const PAPER_CANVAS = Object.freeze({ w: 1024, h: 724 });

/** 实体印章：木柄 + 红胶面，停在一块小印台上；拖到纸上按住 0.8 秒才落章。 */
const STAMP = Object.freeze({ x: 2.64, z: 0.52, lift: 0.032, hold: 0.8 });

/** 文件盘：纸盖章后拖到这里完成归档，避免把“归档”做成下载按钮。 */
const TRAY = Object.freeze({ x: 3.68, z: 0.15, w: 0.22, d: 0.17 });

/** 预览专用件声明的成本（毫秒）—— 真实测量值由 bench 写回报告，不在运行时伪装。 */
const DECLARED_COST_MS = 1.6;

/** 单文件实测体积（KB）—— 含 three 与 RectAreaLight 的 LTC 表。 */
const DECLARED_KB = 1738;

/** 当前预览模式。 */
type DawnMode = 'color' | 'light';

/** 签发仪式的状态：读纸 → 拖章 → 按住 → 归档 → 完成。 */
type DawnPhase = 'idle' | 'stamped' | 'filed';

/** 桌面件在页面上的取证快照。 */
interface DawnSnapshot {
  readonly mode: DawnMode;
  readonly time: number;
  readonly calls: number;
  readonly triangles: number;
  readonly meshes: number;
  readonly breakdown: Record<string, { meshes: number; tris: number }>;
  readonly paper: { x: number; y: number; w: number; h: number } | null;
  readonly stamp: { x: number; y: number; w: number; h: number } | null;
  readonly tray: { x: number; y: number; w: number; h: number } | null;
  readonly stamped: boolean;
  readonly phase: DawnPhase;
  readonly holding: number;
}

/** 安全读 query（file:// / 测试环境下也不会炸）。 */
function query(): URLSearchParams {
  try {
    return new URLSearchParams(globalThis.location?.search ?? '');
  } catch {
    return new URLSearchParams();
  }
}

/** 数字 query，非法值回退。 */
function numberQuery(q: URLSearchParams, key: string, fallback: number): number {
  if (!q.has(key)) return fallback;
  const value = Number.parseFloat(q.get(key) ?? '');
  return Number.isFinite(value) ? value : fallback;
}

/** 在 0..1 之间夹住。 */
function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** 纸下的接触阴影：中间透明、边缘柔和变暗，让纸不像贴在桌垫上。 */
function paintPaperShadow(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 384;
  const g = c.getContext('2d');
  if (!g) return c;
  g.fillStyle = 'rgba(18,12,7,0.58)';
  g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'destination-out';
  g.filter = 'blur(26px)';
  g.fillStyle = 'rgba(0,0,0,1)';
  g.beginPath();
  g.roundRect(54, 42, c.width - 108, c.height - 84, 14);
  g.fill();
  g.filter = 'none';
  g.globalCompositeOperation = 'source-over';
  return c;
}

/** 纸纹背景 + 许可证排版。这个纹理是纸上唯一的内容来源，避免 DOM 文字和 3D 纸错位。 */
function paintPaper(stamped: boolean): HTMLCanvasElement {
  const { w: W, h: H } = PAPER_CANVAS;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d');
  if (!x) return c;

  // 纸底：暖白，右下略暗，模拟斜光落在纸面上。
  x.fillStyle = '#e9ddc8';
  x.fillRect(0, 0, W, H);
  const g = x.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, 'rgba(255,250,240,0.45)');
  g.addColorStop(0.55, 'rgba(255,250,240,0.08)');
  g.addColorStop(1, 'rgba(112,88,58,0.16)');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  // 纸边内侧的薄暗：纸不受光，靠这层暖灰保住“纸”的厚度。
  const edgeR = x.createLinearGradient(W * 0.72, 0, W, 0);
  edgeR.addColorStop(0, 'rgba(92,70,46,0)');
  edgeR.addColorStop(1, 'rgba(92,70,46,0.13)');
  x.fillStyle = edgeR;
  x.fillRect(0, 0, W, H);
  const edgeB = x.createLinearGradient(0, H * 0.70, 0, H);
  edgeB.addColorStop(0, 'rgba(92,70,46,0)');
  edgeB.addColorStop(1, 'rgba(92,70,46,0.16)');
  x.fillStyle = edgeB;
  x.fillRect(0, 0, W, H);
  x.strokeStyle = 'rgba(110,86,58,0.18)';
  x.lineWidth = 2;
  x.strokeRect(5, 5, W - 10, H - 10);

  // 纤维：低幅度、非平铺，只做纸感，不做旧照片滤镜。
  let seed = 0x1f2e3d4c;
  const rand = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 2400; i += 1) {
    const px = rand() * W;
    const py = rand() * H;
    x.fillStyle = rand() > 0.5 ? 'rgba(90,72,50,0.035)' : 'rgba(255,255,255,0.045)';
    x.fillRect(px, py, 1 + rand() * 1.2, 1 + rand() * 1.2);
  }

  const ink = '#211b16';
  const muted = 'rgba(33,27,22,0.72)';
  const hair = 'rgba(58,44,30,0.46)';
  const pad = 88;
  const right = W - 104;

  // 页眉：一条细线 + 小字，像一张真正的许可证，不是一张空白纸。
  x.strokeStyle = hair;
  x.lineWidth = 1.5;
  x.beginPath();
  x.moveTo(pad, 54);
  x.lineTo(right, 54);
  x.stroke();

  x.fillStyle = muted;
  x.font = '500 18px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  x.letterSpacing = '0.10em';
  x.fillText('EMOPULSE / PERMIT OFFICE', pad, 42);
  x.textAlign = 'right';
  x.fillText('6:51 / FIRST LIGHT', right, 42);
  x.textAlign = 'left';

  // H1 + hook。纸就是首屏正文，字号按“在 1440 下约 34px、390 下约 26px”反推。
  x.fillStyle = ink;
  x.font = 'italic 400 96px Georgia, "Times New Roman", serif';
  x.fillText('License', pad, 186);
  x.fillStyle = ink;
  x.font = '400 38px Georgia, "Times New Roman", serif';
  x.fillText('A permit to simply be.', pad, 238);

  // 正文块：只放一句，留出足够白，纸才不会读成表单。
  x.fillStyle = 'rgba(26,21,16,0.98)';
  x.font = '500 31px Georgia, "Times New Roman", serif';
  const lines = [
    'This permit entitles the holder to rest,',
    'to stop explaining, and to take up space.',
  ];
  lines.forEach((line, i) => x.fillText(line, pad, 330 + i * 38));

  // 页脚：编号 / 日期 / 一句章下文字。
  x.strokeStyle = hair;
  x.beginPath();
  x.moveTo(pad, H - 116);
  x.lineTo(right, H - 116);
  x.stroke();

  x.fillStyle = muted;
  x.font = '500 17px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  x.letterSpacing = '0.06em';
  x.fillText('No. 0001', pad, H - 78);
  x.textAlign = 'right';
  x.fillText('ISSUED AT FIRST LIGHT', right, H - 78);
  x.textAlign = 'left';

  // 章：只在 stamped 时出现。位置在右下，给纸留出被盖过的重量。
  if (stamped) {
    const cx = W - 178;
    const cy = H - 185;
    x.save();
    x.translate(cx, cy);
    x.rotate(-0.08);
    x.globalAlpha = 1;
    x.globalCompositeOperation = 'multiply';
    x.strokeStyle = 'rgba(112,14,11,0.94)';
    x.fillStyle = 'rgba(126,18,14,0.62)';
    x.lineWidth = 9;
    x.beginPath();
    x.arc(0, 0, 104, 0, Math.PI * 2);
    x.fill();
    x.stroke();
    x.lineWidth = 2.4;
    x.beginPath();
    x.arc(0, 0, 90, 0, Math.PI * 2);
    x.stroke();
    x.fillStyle = 'rgba(82,8,6,1)';
    x.font = '700 29px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    x.textAlign = 'center';
    x.fillText('APPROVED', 0, -2);
    x.font = '600 18px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    x.fillText('NO COPY KEPT.', 0, 31);
    x.restore();
  }

  return c;
}

/** 建场景。整套小书房在 studio.ts 里；这里只负责把统计交给预览快照。 */
function buildScene(): {
  scene: THREE.Scene;
  ctx: Record<string, unknown>;
  stats: { meshes: number; triangles: number; breakdown: Record<string, { meshes: number; tris: number }> };
  glass: THREE.Material;
} {
  const studio = buildStudio();
  const breakdown = studio.breakdown;
  const meshes = Object.values(breakdown).reduce((sum, item) => sum + item.meshes, 0);
  const triangles = Object.values(breakdown).reduce((sum, item) => sum + item.tris, 0);
  return {
    scene: studio.scene,
    ctx: { animated: studio.animated },
    stats: { meshes, triangles, breakdown },
    glass: studio.glass,
  };
}

/** 建一个预览实例。 */
function create(env: PartEnv): PartInstance {
  // Node 假 DOM 没有真实 WebGL 画布；用 E_UNSUPPORTED 让装配器走 degraded，而不是伪装成运行期 bug。
  try {
    const probe = (): void => {};
    env.canvas.addEventListener('webglcontextlost', probe);
    env.canvas.removeEventListener('webglcontextlost', probe);
  } catch {
    throw Object.assign(new Error('dawn-desk 需要真实 WebGL2 画布'), { code: 'E_UNSUPPORTED' });
  }

  const Q = query();
  const mode: DawnMode = Q.get('dawn') === 'light' ? 'light' : 'color';
  const fixedTime = Q.has('t') ? numberQuery(Q, 't', 0) : null;
  const freeze = Q.has('freeze') && Q.get('freeze') !== '0';
  const startAt = numberQuery(Q, 'start', 0);
  const mobileMode = env.width / Math.max(1, env.height) < 0.82;

  const renderer = new THREE.WebGLRenderer({
    canvas: env.canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(Math.max(1, env.width), Math.max(1, env.height), false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.98;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.info.autoReset = false;

  const camera = new THREE.PerspectiveCamera(42, 1, 0.03, 60);
  const cameraBase = new THREE.Vector3();
  const cameraLook = new THREE.Vector3();
  RectAreaLightUniformsLib.init();
  const { scene, ctx, stats: sceneStats, glass } = buildScene();
  (globalThis as unknown as { __dawnDeskScene?: THREE.Scene; __dawnDeskCamera?: THREE.PerspectiveCamera }).__dawnDeskScene = scene;
  (globalThis as unknown as { __dawnDeskScene?: THREE.Scene; __dawnDeskCamera?: THREE.PerspectiveCamera }).__dawnDeskCamera = camera;

  // 灯：晨光从窗里进来，室内再补一层暖反射。整套场景只有一盏投影方向光。
  const hemi = new THREE.HemisphereLight(0xf3f4ec, 0x9a7c60, 0.42);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight(0xffefd9, 0.16);
  scene.add(ambient);
  const fill = new THREE.DirectionalLight(0xfff4e5, 0.22);
  fill.position.set(3.2, 1.24, 2.7);
  scene.add(fill);
  const lampLight = new THREE.PointLight(0xffc187, 0.52, 0, 2);
  lampLight.position.set(2.95, 1.06, 0.12);
  scene.add(lampLight);

  // 窗形区域光：1.0 × 0.62 m，正好是窗洞的大小；朝桌面斜射。
  const area = new THREE.RectAreaLight(0xffd0a6, 2.65, 1.02, 0.63);
  area.position.set(2.66, 1.13, -0.02);
  area.lookAt(3.12, 0.80, 0.48);
  scene.add(area);

  const sun = new THREE.DirectionalLight(0xffd0aa, 2.25);
  sun.position.set(2.16, 1.78, -1.08);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 0.2;
  sun.shadow.camera.far = 8;
  sun.shadow.camera.left = -1.8;
  sun.shadow.camera.right = 1.8;
  sun.shadow.camera.top = 1.5;
  sun.shadow.camera.bottom = -1.2;
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.012;
  sun.shadow.radius = 2.6;
  sun.target.position.set(PAPER.x, 0.742, PAPER.z);
  scene.add(sun);
  scene.add(sun.target);

  // 只让桌面接影；书、杯子、印章这些近处小物投短影，绿植不投影（叶影会压到正文）。
  for (const name of ['desk', 'room', 'decor', 'plants']) {
    const root = scene.getObjectByName(name);
    root?.traverse((o: THREE.Object3D) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.receiveShadow = true;
    });
  }
  for (const name of ['decor', 'desk']) {
    const root = scene.getObjectByName(name);
    root?.traverse((o: THREE.Object3D) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = !['deskTop', 'lamp-bulb', 'blotter'].includes(o.name);
    });
  }

  // 纸：单独的 plane，贴图是 canvas 生成的许可证；stamp 只改这张贴图，不改 DOM。
  const paperCanvas = paintPaper(false);
  const paperTexture = new THREE.CanvasTexture(paperCanvas);
  paperTexture.colorSpace = THREE.SRGBColorSpace;
  paperTexture.anisotropy = 4;
  // 纸是产品面，不是受光道具：unlit 保住正文可读性，接触阴影交给 blotter/halo。
  const paperMat = new THREE.MeshBasicMaterial({
    map: paperTexture,
    color: new THREE.Color('#f2e8d7'),
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 1,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(PAPER.w, PAPER.h, 1, 1), paperMat);
  paper.name = 'license-paper';
  paper.rotation.x = -Math.PI / 2;
  paper.rotation.z = PAPER.yaw;
  paper.position.set(PAPER.x, PAPER_Y, PAPER.z);
  paper.castShadow = true;
  paper.receiveShadow = true;
  scene.add(paper);
  // 纸不是零厚度的 UI 贴片：给一张 1.5mm 的纸边，侧光下才有一条真实的白边。
  const paperEdge = new THREE.Mesh(
    new THREE.BoxGeometry(PAPER.w, 0.0022, PAPER.h),
    new THREE.MeshStandardMaterial({ color: '#d8c8ad', roughness: 0.95, metalness: 0, transparent: true }),
  );
  paperEdge.name = 'license-paper-edge';
  paperEdge.position.set(PAPER.x, PAPER_Y - 0.0018, PAPER.z);
  paperEdge.rotation.y = PAPER.yaw;
  paperEdge.castShadow = true;
  paperEdge.receiveShadow = true;
  scene.add(paperEdge);

  // 调试取证：列出与纸的包围盒相交的桌面对象，用来确认没有东西压住纸。
  // 只在预览里存在，名称为 __dawnDeskNear；不参与正式装配。
  if (typeof globalThis !== 'undefined') {
    const near: Array<{ name: string; min: [number, number, number]; max: [number, number, number] }> = [];
    const paperBox = new THREE.Box3(
      new THREE.Vector3(PAPER.x - PAPER.w / 2 - 0.01, 0.73, PAPER.z - PAPER.h / 2 - 0.01),
      new THREE.Vector3(PAPER.x + PAPER.w / 2 + 0.01, 0.96, PAPER.z + PAPER.h / 2 + 0.01),
    );
    scene.traverse((o: THREE.Object3D) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.visible || mesh === paper || o.name === 'deskTop') return;
      const b = new THREE.Box3().setFromObject(mesh);
      if (b.intersectsBox(paperBox)) near.push({ name: o.name, min: [b.min.x, b.min.y, b.min.z], max: [b.max.x, b.max.y, b.max.z] });
    });
    (globalThis as unknown as { __dawnDeskNear?: typeof near }).__dawnDeskNear = near.slice(0, 80);
    (globalThis as unknown as {
      __dawnDeskPick?: (nx: number, ny: number) => Array<{ name: string; distance: number }>;
    }).__dawnDeskPick = (nx: number, ny: number) => {
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(nx, ny), camera);
      return ray.intersectObjects(scene.children, true).slice(0, 8).map((hit) => ({
        name: hit.object.name || '(unnamed)',
        visible: hit.object.visible,
        parent: hit.object.parent?.name || '(none)',
        distance: Number(hit.distance.toFixed(3)),
      }));
    };
  }

  // 桌面上的纸不能和桌面 z-fight；polygonOffset 是双保险。
  const paperShadowTex = new THREE.CanvasTexture(paintPaperShadow());
  paperShadowTex.colorSpace = THREE.SRGBColorSpace;
  const paperHalo = new THREE.Mesh(
    new THREE.PlaneGeometry(PAPER.w + 0.095, PAPER.h + 0.095),
    new THREE.MeshBasicMaterial({
      map: paperShadowTex,
      color: 0x000000,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
    }),
  );
  paperHalo.rotation.x = -Math.PI / 2;
  paperHalo.rotation.z = PAPER.yaw;
  paperHalo.position.set(PAPER.x + 0.012, PAPER_Y - 0.0012, PAPER.z + 0.012);
  scene.add(paperHalo);

  // 印台 + 实体印章。章不是贴图上的一个红圈，而是桌面上可以拿起来的物件：
  // 木柄、红胶面、压在纸上的手感和“按住才落章”的时间门槛都靠它。
  const inkPad = new THREE.Group();
  inkPad.name = 'ink-pad';
  inkPad.position.set(STAMP.x, DESK_Y, STAMP.z);
  inkPad.scale.setScalar(0.78);
  const padWood = new THREE.MeshPhysicalMaterial({
    map: texture(paintWood(512, 256, '#3a2415', '#180d06', '#6a4a30', 517), 1, 1, 4),
    bumpMap: dataTexture(paintWood(256, 128, '#3a2415', '#180d06', '#6a4a30', 517), 1, 1, 2),
    bumpScale: 0.0007,
    color: '#ffffff',
    roughness: 0.62,
    metalness: 0.02,
    clearcoat: 0.14,
    clearcoatRoughness: 0.52,
    envMapIntensity: 0.35,
  });
  const padDark = new THREE.MeshStandardMaterial({ color: '#1e120b', roughness: 0.82, metalness: 0.01 });
  const padBase = new THREE.Mesh(new RoundedBoxGeometry(0.152, 0.015, 0.132, 4, 0.0065), padWood);
  padBase.position.y = 0.0075;
  padBase.receiveShadow = true;
  padBase.castShadow = true;
  // 内凹的木槽，让绒垫真的嵌在盒里，而不是贴在木板上。
  const padWell = new THREE.Mesh(new RoundedBoxGeometry(0.132, 0.006, 0.112, 3, 0.004), padDark);
  padWell.position.y = 0.016;
  padWell.receiveShadow = true;
  const padFelt = new THREE.Mesh(
    new RoundedBoxGeometry(0.113, 0.005, 0.095, 3, 0.0025),
    new THREE.MeshPhysicalMaterial({
      map: texture(paintInkFelt(512, 512), 1, 1, 8),
      bumpMap: dataTexture(paintLinen(256, 256), 1, 1, 4),
      bumpScale: 0.0012,
      color: '#ffffff',
      roughness: 0.9,
      metalness: 0,
      clearcoat: 0.04,
      clearcoatRoughness: 0.9,
      envMapIntensity: 0.16,
    }),
  );
  padFelt.position.y = 0.0205;
  padFelt.receiveShadow = true;
  const padBrass = new THREE.MeshStandardMaterial({ color: '#b88d55', roughness: 0.28, metalness: 0.92, envMapIntensity: 1.1 });
  for (const [dx, dz, sx, sz] of [
    [0, -0.052, 0.120, 0.0035],
    [0, 0.052, 0.120, 0.0035],
    [-0.060, 0, 0.0035, 0.090],
    [0.060, 0, 0.0035, 0.090],
  ] as const) {
    const rim = new THREE.Mesh(new RoundedBoxGeometry(sx, 0.0038, sz, 2, 0.0014), padBrass);
    rim.position.set(dx, 0.0235, dz);
    rim.castShadow = true;
    rim.receiveShadow = true;
    inkPad.add(rim);
  }
  // 后侧黄铜铰链 + 前侧小搭扣，读成一只可以合上的印泥盒。
  const hingePlate = new THREE.Mesh(new RoundedBoxGeometry(0.054, 0.003, 0.009, 2, 0.0015), padBrass);
  hingePlate.position.set(0, 0.0172, -0.061);
  inkPad.add(hingePlate);
  for (const dx of [-0.018, 0.018]) {
    const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0042, 0.014, 12), padBrass);
    hinge.rotation.z = Math.PI / 2;
    hinge.position.set(dx, 0.0178, -0.066);
    hinge.castShadow = true;
    inkPad.add(hinge);
  }
  const clasp = new THREE.Mesh(new RoundedBoxGeometry(0.024, 0.0045, 0.007, 2, 0.0015), padBrass);
  clasp.position.set(0, 0.0158, 0.063);
  clasp.castShadow = true;
  inkPad.add(clasp);
  const claspPin = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.003, 8), padBrass);
  claspPin.rotation.x = Math.PI / 2;
  claspPin.position.set(0, 0.0185, 0.064);
  inkPad.add(claspPin);
  for (const [dx, dz] of [[-0.064, -0.054], [0.064, -0.054], [-0.064, 0.054], [0.064, 0.054]] as const) {
    const nail = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.0034, 0.002, 10), padBrass);
    nail.position.set(dx, 0.0155, dz);
    inkPad.add(nail);
  }
  const padStain = new THREE.Mesh(
    new THREE.CircleGeometry(0.020, 24),
    new THREE.MeshStandardMaterial({ color: '#6d1a14', roughness: 0.92, metalness: 0, transparent: true, opacity: 0.30 }),
  );
  padStain.rotation.x = -Math.PI / 2;
  padStain.position.set(-0.040, 0.0148, 0.035);
  const padShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.19, 0.17),
    new THREE.MeshBasicMaterial({ map: paperShadowTex, color: 0x000000, transparent: true, opacity: 0.46, depthWrite: false }),
  );
  padShadow.rotation.x = -Math.PI / 2;
  padShadow.position.y = 0.0012;
  inkPad.add(padShadow, padBase, padWell, padFelt, padStain);
  scene.add(inkPad);

  const stamp = new THREE.Group();
  stamp.name = 'stamp';
  stamp.position.set(STAMP.x, DESK_Y + 0.028, STAMP.z);
  stamp.rotation.y = -0.16;
  stamp.scale.setScalar(0.78);

  const stampWood = new THREE.MeshPhysicalMaterial({
    map: texture(paintWood(512, 256, '#7b4325', '#3f2011', '#a86b43', 639), 1, 1, 4),
    bumpMap: dataTexture(paintWood(256, 128, '#7b4325', '#3f2011', '#a86b43', 639), 1, 1, 2),
    bumpScale: 0.0008,
    color: '#ffffff',
    roughness: 0.58,
    metalness: 0.03,
    clearcoat: 0.16,
    clearcoatRoughness: 0.5,
    envMapIntensity: 0.4,
  });
  const stampDark = new THREE.MeshStandardMaterial({
    color: '#2d1b10',
    roughness: 0.7,
    metalness: 0.02,
  });
  const stampBrass = new THREE.MeshStandardMaterial({
    color: '#b88b51',
    roughness: 0.26,
    metalness: 0.92,
    envMapIntensity: 1.18,
  });
  const stampRubber = new THREE.MeshStandardMaterial({
    color: '#3a1712',
    roughness: 0.9,
    metalness: 0,
  });
  const stampInk = new THREE.MeshStandardMaterial({
    color: '#b43a2c',
    roughness: 0.48,
    metalness: 0,
    emissive: new THREE.Color('#3a0b08'),
    emissiveIntensity: 0.35,
  });
  // 底部橡胶章面：红色印面 + 深色橡胶边，不是一根红柱子。
  const rubber = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.038, 0.005, 32), stampRubber);
  rubber.position.y = 0.005;
  rubber.castShadow = true;
  stamp.add(rubber);
  const die = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.0024, 32), stampInk);
  die.position.y = 0.0012;
  die.castShadow = true;
  stamp.add(die);
  const dieFace = new THREE.Mesh(
    new THREE.CircleGeometry(0.031, 32),
    new THREE.MeshStandardMaterial({
      map: texture(paintStampDie(256, 256), 1, 1, 8),
      transparent: true,
      alphaTest: 0.02,
      roughness: 0.58,
      metalness: 0.02,
      side: THREE.DoubleSide,
    }),
  );
  dieFace.rotation.x = Math.PI / 2;
  dieFace.position.y = -0.0002;
  stamp.add(dieFace);
  // 木底座和铜箍。
  const stampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.039, 0.041, 0.009, 32), stampWood);
  stampBase.position.y = 0.009;
  stampBase.castShadow = true;
  stamp.add(stampBase);
  const stampFerrule = new THREE.Mesh(new THREE.CylinderGeometry(0.0235, 0.0255, 0.011, 32), stampBrass);
  stampFerrule.position.y = 0.020;
  stampFerrule.castShadow = true;
  stamp.add(stampFerrule);
  for (const y of [0.0148, 0.0252]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0245, 0.0013, 6, 24), stampBrass);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    stamp.add(ring);
  }
  const stampNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.0175, 0.0205, 0.013, 20), stampDark);
  stampNeck.position.y = 0.030;
  stampNeck.castShadow = true;
  stamp.add(stampNeck);
  // 木柄：腰身收进去，顶部成蘑菇形圆头，握起来像真的。
  const handleProfile = [
    new THREE.Vector2(0.0165, 0.033),
    new THREE.Vector2(0.0180, 0.039),
    new THREE.Vector2(0.0132, 0.047),
    new THREE.Vector2(0.0125, 0.054),
    new THREE.Vector2(0.0170, 0.061),
    new THREE.Vector2(0.0215, 0.068),
    new THREE.Vector2(0.0198, 0.074),
    new THREE.Vector2(0.0105, 0.0775),
    new THREE.Vector2(0.0, 0.078),
  ];
  const stampHandle = new THREE.Mesh(new THREE.LatheGeometry(handleProfile, 32), stampWood);
  stampHandle.castShadow = true;
  stampHandle.receiveShadow = true;
  stamp.add(stampHandle);
  // 木柄与铜箍之间的一圈细铜环。
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.0014, 6, 20), stampBrass);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.033;
  stamp.add(collar);

  // 可拾取范围比模型大一圈：手机拇指不需要精准点到 3px 的木柄。
  const stampHit = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.075, 0.118, 12),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.001, depthWrite: false, colorWrite: false }),
  );
  stampHit.position.y = 0.05;
  stampHit.name = 'stamp-hit';
  stamp.add(stampHit);

  // 可交互提示：章底座一圈很淡的红环，鼠标/手指靠近时呼吸。
  const stampRing = new THREE.Mesh(
    new THREE.RingGeometry(0.044, 0.050, 32),
    new THREE.MeshBasicMaterial({ color: 0xd45a44, transparent: true, opacity: 0.34, depthWrite: false }),
  );
  stampRing.rotation.x = -Math.PI / 2;
  stampRing.position.y = 0.001;
  stamp.add(stampRing);
  scene.add(stamp);

  // 文件盘：深胡桃木框、皮革内衬、纸叠和封蜡旧信。盖章后盘沿会亮一下。
  const tray = new THREE.Group();
  tray.name = 'file-tray';
  tray.position.set(TRAY.x, DESK_Y, TRAY.z);
  const trayWood = new THREE.MeshPhysicalMaterial({
    map: texture(paintWood(1024, 512, '#5a3a24', '#2c180e', '#956a46', 909), 1, 1, 8),
    bumpMap: dataTexture(paintWood(512, 256, '#5a3a24', '#2c180e', '#956a46', 909), 1, 1, 4),
    bumpScale: 0.0009,
    color: '#ffffff',
    roughness: 0.58,
    metalness: 0.02,
    clearcoat: 0.2,
    clearcoatRoughness: 0.44,
    envMapIntensity: 0.4,
  });
  const trayLining = new THREE.MeshStandardMaterial({ color: '#352b20', roughness: 0.93, metalness: 0.01 });
  const trayPaper = new THREE.MeshStandardMaterial({
    map: texture(paintPageEdges(512, 128), 1, 1, 8),
    bumpMap: dataTexture(paintPageEdges(512, 128), 1, 1, 4),
    bumpScale: 0.0003,
    color: '#ffffff',
    roughness: 0.92,
    metalness: 0,
  });
  const trayShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(TRAY.w + 0.07, TRAY.d + 0.07),
    new THREE.MeshBasicMaterial({ map: paperShadowTex, color: 0x000000, transparent: true, opacity: 0.42, depthWrite: false }),
  );
  trayShadow.rotation.x = -Math.PI / 2;
  trayShadow.position.y = 0.0014;
  tray.add(trayShadow);
  const trayBase = new THREE.Mesh(new RoundedBoxGeometry(TRAY.w, 0.012, TRAY.d, 4, 0.008), trayWood);
  trayBase.position.y = 0.006;
  trayBase.receiveShadow = true;
  trayBase.castShadow = true;
  tray.add(trayBase);
  const trayLiningMesh = new THREE.Mesh(new RoundedBoxGeometry(TRAY.w - 0.026, 0.004, TRAY.d - 0.026, 3, 0.004), trayLining);
  trayLiningMesh.position.y = 0.013;
  trayLiningMesh.receiveShadow = true;
  tray.add(trayLiningMesh);
  // 六张纸叠在一起，纸张边缘一张张错开。
  for (let i = 0; i < 6; i += 1) {
    const sheet = new THREE.Mesh(
      new RoundedBoxGeometry(TRAY.w - 0.050 - i * 0.0022, 0.0017, TRAY.d - 0.046 - i * 0.002, 2, 0.0012),
      trayPaper,
    );
    sheet.position.set(0.006 + (i % 3) * 0.0022, 0.0152 + i * 0.0018, 0.003 - (i % 2) * 0.0025);
    sheet.rotation.y = -0.06 + i * 0.022;
    sheet.castShadow = true;
    sheet.receiveShadow = true;
    tray.add(sheet);
  }
  // 一封装在盘里的旧信：纸面、折缝、邮戳和一小块封蜡。
  const envelope = new THREE.Group();
  envelope.name = 'tray-envelope';
  envelope.position.set(0.014, 0.0268, 0.014);
  envelope.rotation.y = 0.10;
  const envelopeBack = new THREE.Mesh(new RoundedBoxGeometry(0.094, 0.002, 0.061, 2, 0.001), trayPaper);
  envelopeBack.position.y = -0.0002;
  envelope.add(envelopeBack);
  const envelopeFace = new THREE.Mesh(
    new THREE.PlaneGeometry(0.092, 0.059),
    new THREE.MeshStandardMaterial({
      map: texture(paintEnvelope(512, 320), 1, 1, 8),
      bumpMap: dataTexture(paintEnvelope(256, 160), 1, 1, 4),
      bumpScale: 0.0003,
      roughness: 0.92,
      metalness: 0,
      side: THREE.DoubleSide,
    }),
  );
  envelopeFace.rotation.x = -Math.PI / 2;
  envelopeFace.position.y = 0.0012;
  envelope.add(envelopeFace);
  // 信封折盖：一个很薄的三角面，不再只是平纸。
  const flapGeo = new THREE.BufferGeometry();
  flapGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.045, 0.0008, -0.028, 0.045, 0.0008, -0.028, 0.0, 0.0012, 0.017,
  ], 3));
  flapGeo.setIndex([0, 1, 2]);
  flapGeo.computeVertexNormals();
  const flap = new THREE.Mesh(flapGeo, new THREE.MeshStandardMaterial({ color: '#cdbb9c', roughness: 0.94, side: THREE.DoubleSide }));
  flap.castShadow = true;
  envelope.add(flap);
  const seal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.009, 0.010, 0.0032, 20),
    new THREE.MeshPhysicalMaterial({ color: '#731d18', roughness: 0.48, metalness: 0.02, clearcoat: 0.15, clearcoatRoughness: 0.6, envMapIntensity: 0.25 }),
  );
  seal.position.set(0, 0.0034, 0.003);
  seal.castShadow = true;
  envelope.add(seal);
  const sealRing = new THREE.Mesh(new THREE.TorusGeometry(0.0062, 0.0014, 6, 16), new THREE.MeshStandardMaterial({ color: '#8b2e25', roughness: 0.65, metalness: 0 }));
  sealRing.rotation.x = Math.PI / 2;
  sealRing.position.set(0, 0.0052, 0.003);
  envelope.add(sealRing);
  tray.add(envelope);
  // 盘沿：四根厚木条，内侧有细黄铜边。
  for (const [sx, sz, sxSize, szSize] of [
    [0, -TRAY.d / 2 + 0.006, TRAY.w, 0.012],
    [0, TRAY.d / 2 - 0.006, TRAY.w, 0.012],
    [-TRAY.w / 2 + 0.006, 0, 0.012, TRAY.d],
    [TRAY.w / 2 - 0.006, 0, 0.012, TRAY.d],
  ] as const) {
    const rail = new THREE.Mesh(new RoundedBoxGeometry(sxSize, 0.020, szSize, 3, 0.003), trayWood);
    rail.position.set(sx, 0.016, sz);
    rail.castShadow = true;
    rail.receiveShadow = true;
    tray.add(rail);
  }
  for (const [sx, sz, sxSize, szSize] of [
    [0, -TRAY.d / 2 + 0.006, TRAY.w + 0.004, 0.004],
    [0, TRAY.d / 2 - 0.006, TRAY.w + 0.004, 0.004],
  ] as const) {
    const lip = new THREE.Mesh(new RoundedBoxGeometry(sxSize, 0.0032, szSize, 2, 0.0012), padBrass);
    lip.position.set(sx, 0.027, sz);
    lip.castShadow = true;
    tray.add(lip);
  }
  // 四角黄铜护角：小小的 L 形，让木盘有被使用过的痕迹。
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const cornerX = sx * (TRAY.w / 2 - 0.010);
    const cornerZ = sz * (TRAY.d / 2 - 0.010);
    const a = new THREE.Mesh(new RoundedBoxGeometry(0.017, 0.003, 0.004, 2, 0.0012), padBrass);
    a.position.set(cornerX, 0.0262, cornerZ - sz * 0.0065);
    tray.add(a);
    const b = new THREE.Mesh(new RoundedBoxGeometry(0.004, 0.003, 0.017, 2, 0.0012), padBrass);
    b.position.set(cornerX - sx * 0.0065, 0.0262, cornerZ);
    tray.add(b);
  }
  // 正面的小黄铜铭牌：“IN”。不用大段文字，近看才读得到。
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(0.042, 0.018),
    new THREE.MeshStandardMaterial({
      map: texture(paintTrayLabel(128, 64), 1, 1, 8),
      roughness: 0.36,
      metalness: 0.55,
      envMapIntensity: 0.8,
    }),
  );
  label.position.set(0.028, 0.019, TRAY.d / 2 + 0.001);
  tray.add(label);
  const trayGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(TRAY.w - 0.018, TRAY.d - 0.018),
    new THREE.MeshBasicMaterial({ color: 0xe06a48, transparent: true, opacity: 0, depthWrite: false }),
  );
  trayGlow.rotation.x = -Math.PI / 2;
  trayGlow.position.y = 0.0248;
  tray.add(trayGlow);
  scene.add(tray);

  // 落章瞬间的一圈红墨扩散，给“按下去”一个物理回应。
  const inkRipple = new THREE.Mesh(
    new THREE.RingGeometry(0.02, 0.032, 32),
    new THREE.MeshBasicMaterial({ color: 0xa83328, transparent: true, opacity: 0, depthWrite: false }),
  );
  inkRipple.rotation.x = -Math.PI / 2;
  inkRipple.position.y = DESK_Y + 0.004;
  inkRipple.visible = false;
  scene.add(inkRipple);

  let stamped = false;
  let phase: DawnPhase = 'idle';
  let holding = 0;
  let holdStart: number | null = null;
  let draggingStamp = false;
  let stampPlaced = false;
  let stampSelected = false;
  let draggingPaper = false;
  let filing = false;
  let fileT = 0;
  let fileFromX: number = PAPER.x;
  let fileFromZ: number = PAPER.z;
  let inkT = -1;
  let lastDown = false;
  let lastHint = '';
  let lastHintEnd = false;
  let lastHintPhase: DawnPhase | null = null;
  let hintBooted = false;
  let stampHomeX: number = STAMP.x;
  let stampHomeZ: number = STAMP.z;

  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  const deskPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -DESK_Y);
  const deskPoint = new THREE.Vector3();

  /** 把归一化指针变成一条从相机出发的射线。 */
  function aim(nx: number, ny: number): void {
    pointerNdc.set(nx * 2 - 1, 1 - ny * 2);
    raycaster.setFromCamera(pointerNdc, camera);
  }

  /** 射线是否打到某个对象（含子网格）。 */
  function hits(object: THREE.Object3D): boolean {
    return raycaster.intersectObject(object, true).length > 0;
  }

  /** 手机上的章不能要求 3px 精准：在屏幕空间给拇指一个 58px 的命中半径。 */
  function mobileStampHit(nx: number, ny: number): boolean {
    const v = stamp.position.clone();
    v.y += 0.035;
    v.project(camera);
    const sx = (v.x + 1) * 0.5 * env.width;
    const sy = (1 - v.y) * 0.5 * env.height;
    return Math.hypot(nx * env.width - sx, ny * env.height - sy) <= 58;
  }

  /** 指针落在桌面平面上的世界坐标，夹在桌沿以内，避免把纸拖到桌子外。 */
  function onDesk(): THREE.Vector3 | null {
    const hit = raycaster.ray.intersectPlane(deskPlane, deskPoint);
    if (!hit) return null;
    deskPoint.x = Math.min(3.74, Math.max(2.60, deskPoint.x));
    deskPoint.z = Math.min(0.64, Math.max(0.06, deskPoint.z));
    return deskPoint;
  }

  /** 纸和阴影垫片一起移动，避免纸浮在影子上方。 */
  function setPaperPos(x: number, z: number): void {
    paper.position.x = x;
    paper.position.z = z;
    paperHalo.position.x = x;
    paperHalo.position.z = z;
  }

  /** 章是否压在纸面范围内（含 3cm 容差，手指不用像素级对准）。 */
  function stampOverPaper(): boolean {
    return (
      Math.abs(stamp.position.x - paper.position.x) <= PAPER.w / 2 + 0.035 &&
      Math.abs(stamp.position.z - paper.position.z) <= PAPER.h / 2 + 0.035
    );
  }

  /** 纸是否拖到了文件盘上方。 */
  function paperOverTray(): boolean {
    return Math.hypot(paper.position.x - TRAY.x, paper.position.z - TRAY.z) < 0.20;
  }

  /** 把当前该说的话发给宿主；只在文字或结束态变化时派发，避免每帧写 DOM。 */
  function emitHint(text: string, end = false, force = false): void {
    if (!force && text === lastHint && end === lastHintEnd && phase === lastHintPhase) return;
    lastHint = text;
    lastHintEnd = end;
    lastHintPhase = phase;
    const detail = { phase, hint: text, end, progress: holding };
    const g = globalThis as unknown as {
      __dawnDeskUi?: typeof detail;
      dispatchEvent?: (event: Event) => boolean;
      CustomEvent?: typeof CustomEvent;
    };
    g.__dawnDeskUi = detail;
    if (typeof g.dispatchEvent === 'function' && typeof g.CustomEvent === 'function') {
      g.dispatchEvent(new g.CustomEvent('preview:dawn-desk', { detail }));
    }
  }

  /** 重新画纸贴图。只在点击时调用，不在 draw 里每帧重建。 */
  function refreshPaper(): void {
    const next = paintPaper(stamped);
    paperTexture.image = next;
    paperTexture.needsUpdate = true;
  }

  /** 盖章：纸面出现红章，章退回印台，托盘亮起，进入“归档”一步。 */
  function applyStamp(): void {
    if (phase !== 'idle') return;
    phase = 'stamped';
    stamped = true;
    refreshPaper();
    restStamp();
    stampRing.visible = false;
    draggingStamp = false;
    stampPlaced = false;
    stampSelected = false;
    holdStart = null;
    holding = 1;
    inkT = 0;
    inkRipple.position.x = paper.position.x + 0.085;
    inkRipple.position.z = paper.position.z + 0.055;
    inkRipple.scale.setScalar(0.4);
    inkRipple.visible = true;
    (trayGlow.material as THREE.MeshBasicMaterial).opacity = 0.16;
    emitHint('NOW FILE THE PERMIT', false, true);
  }

  /** 归档：纸被拖进文件盘，放大、抬起、淡出。 */
  function startFile(): void {
    if (phase !== 'stamped' || filing) return;
    filing = true;
    fileT = 0;
    fileFromX = paper.position.x;
    fileFromZ = paper.position.z;
    draggingPaper = false;
    emitHint('FILING THE PERMIT', false, true);
  }

  /** 回到第一帧，供 `ISSUE ANOTHER` 与测试复位。 */
  function reset(): void {
    stamped = false;
    phase = 'idle';
    filing = false;
    fileT = 0;
    fileFromX = PAPER.x;
    fileFromZ = PAPER.z;
    holding = 0;
    holdStart = null;
    draggingStamp = false;
    stampPlaced = false;
    stampSelected = false;
    draggingPaper = false;
    paper.visible = true;
    paperHalo.visible = true;
    paper.scale.setScalar(1);
    paper.position.y = PAPER_Y;
    paperMat.opacity = 1;
    (paperHalo.material as THREE.MeshBasicMaterial).opacity = 0.62;
    setPaperPos(PAPER.x, PAPER.z);
    refreshPaper();
    restStamp();
    stampRing.visible = true;
    inkRipple.visible = false;
    inkT = -1;
    (trayGlow.material as THREE.MeshBasicMaterial).opacity = 0;
    emitHint(mobileMode ? 'TAP THE STAMP' : 'DRAG THE STAMP TO THE PAPER', false, true);
  }

  /** 章回到印台；宽屏与竖屏的印台位置由 fitCamera 决定。 */
  function restStamp(): void {
    stamp.position.set(stampHomeX, DESK_Y + 0.028, stampHomeZ);
    inkPad.position.set(stampHomeX, DESK_Y + 0.006, stampHomeZ);
  }

  /** 投影纸的四角到 CSS 屏幕坐标，供“纸是不是主角”的自动取证。 */
  function projectPaper(): { x: number; y: number; w: number; h: number } | null {
    const w = env.width;
    const h = env.height;
    if (!w || !h) return null;
    const local = [
      [-PAPER.w / 2, 0, -PAPER.h / 2],
      [PAPER.w / 2, 0, -PAPER.h / 2],
      [PAPER.w / 2, 0, PAPER.h / 2],
      [-PAPER.w / 2, 0, PAPER.h / 2],
    ];
    const v = new THREE.Vector3();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of local) {
      v.set(p[0]!, 0, p[2]!);
      v.applyAxisAngle(new THREE.Vector3(0, 1, 0), PAPER.yaw);
      v.add(paper.position);
      v.project(camera);
      const sx = (v.x + 1) * 0.5 * w;
      const sy = (1 - v.y) * 0.5 * h;
      minX = Math.min(minX, sx);
      maxX = Math.max(maxX, sx);
      minY = Math.min(minY, sy);
      maxY = Math.max(maxY, sy);
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  /** 投影一个对象的包围盒，供小屏检查“章和文件盘是否还在画面里”。 */
  function projectBox(root: THREE.Object3D): { x: number; y: number; w: number; h: number } | null {
    const w = env.width;
    const h = env.height;
    if (!w || !h) return null;
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    if (box.isEmpty()) return null;
    const v = new THREE.Vector3();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const cx of [box.min.x, box.max.x]) {
      for (const cy of [box.min.y, box.max.y]) {
        for (const cz of [box.min.z, box.max.z]) {
          v.set(cx, cy, cz).project(camera);
          const sx = (v.x + 1) * 0.5 * w;
          const sy = (1 - v.y) * 0.5 * h;
          minX = Math.min(minX, sx);
          maxX = Math.max(maxX, sx);
          minY = Math.min(minY, sy);
          maxY = Math.max(maxY, sy);
        }
      }
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  /** 相机：宽屏让纸占 56% 左右，竖屏让纸接近满宽；机位固定，不做 orbit/zoom。 */
  function fitCamera(w: number, h: number): void {
    const aspect = w / Math.max(1, h);
    camera.aspect = aspect;
    if (aspect < 0.82) {
      camera.fov = 60;
      camera.position.set(2.50, 2.10, 1.72);
      const notebook = scene.getObjectByName('notebook');
      if (notebook) notebook.visible = false;
      cameraLook.set(PAPER.x - 0.02, 0.80, PAPER.z + 0.01);
      stampHomeX = 2.84;
      stampHomeZ = 0.54;
    } else {
      camera.fov = 42;
      camera.position.set(2.40, 1.40, 1.43);
      cameraLook.set(PAPER.x, 0.81, PAPER.z + 0.02);
      stampHomeX = 2.64;
      stampHomeZ = 0.52;
    }
    if (phase === 'idle' && !draggingStamp && !stampPlaced) restStamp();
    cameraBase.copy(camera.position);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
  }

  fitCamera(env.width, env.height);

  // 预览专用控制面：让同尺寸截图/自动验收能直接走“盖章→归档→复位”，不必模拟拖拽轨迹。
  // 只在 window 上暴露，不进正式零件。
  if (typeof globalThis !== 'undefined') {
    (globalThis as unknown as {
      __dawnDeskCtl?: { stamp: () => void; file: () => void; reset: () => void };
    }).__dawnDeskCtl = { stamp: applyStamp, file: startFile, reset };
  }

  /** 晨光：0..40 秒。颜色模式只漂色温/曝光；光模式移动窗后的太阳，窗光角度跟着走。 */
  function dawn(t: number): void {
    const p = clamp01(t / 40);
    if (mode === 'light') {
      // 太阳从窗后偏左升到偏右；纸上的亮面会从左往右走，但窗格不投影。
      sun.position.set(1.92 + p * 0.88, 1.76 + p * 0.36, -1.50);
    } else {
      sun.position.set(2.10 + p * 0.36, 1.82 + p * 0.16, -1.48);
    }
    sun.target.position.set(PAPER.x - 0.01, 0.76, PAPER.z + 0.04);
    // 0s 是冷蓝的窗光，40s 是暖金的晨光。4 分钟版只需要把这个 p 拉成 0..1 的慢变量。
    const cr = 0.74 + p * 0.24;
    const cg = 0.83 + p * 0.04;
    const cb = 0.94 - p * 0.32;
    sun.color.setRGB(cr, cg, cb);
    area.color.setRGB(cr, cg, cb);
    sun.intensity = 2.05 + p * 0.82;
    area.intensity = 2.42 + p * 0.86;
    hemi.intensity = 0.42 + p * 0.09;
    renderer.toneMappingExposure = 0.93 + p * 0.02;
    for (const fn of (ctx.animated as Array<(time: number) => void>)) fn(t);
  }

  let frames = 0;
  let currentTime = 0;
  let lastSnapshot: DawnSnapshot | null = null;

  return {
    update(frame: WorldFrame): void {
      const raw = fixedTime !== null ? fixedTime : (freeze ? startAt : frame.t + startAt);
      currentTime = raw;
      dawn(raw);

      const p = frame.pointer;
      const downEdge = p.down && !lastDown;
      const upEdge = !p.down && lastDown;

      // 阅读时的轻微视差：机位固定，只随着指针倾身 ±2cm，不做 orbit/zoom。
      if (!frame.reducedMotion) {
        camera.position.copy(cameraBase).add(new THREE.Vector3((p.x - 0.5) * 0.018, (p.y - 0.5) * -0.010, 0));
        camera.lookAt(cameraLook);
        camera.updateMatrixWorld(true);
      }

      aim(p.x, p.y);
      const at = onDesk();

      if (!hintBooted) {
        hintBooted = true;
        emitHint(mobileMode ? 'TAP THE STAMP' : 'DRAG THE STAMP TO THE PAPER', false, true);
      }

      if (filing) {
        fileT = Math.min(1, fileT + frame.dt / 0.85);
        const e = fileT * fileT * (3 - 2 * fileT);
        paper.position.x = fileFromX + (TRAY.x - fileFromX) * e;
        paper.position.z = fileFromZ + (TRAY.z - fileFromZ) * e;
        paper.position.y = PAPER_Y + Math.sin(Math.PI * e) * 0.085;
        paper.scale.setScalar(1 - 0.5 * e);
        paperMat.opacity = 1 - e;
        paperEdge.position.set(paper.position.x, paper.position.y - 0.0018, paper.position.z);
        paperEdge.scale.copy(paper.scale);
        (paperEdge.material as THREE.MeshStandardMaterial).opacity = 1 - e;
        (paperHalo.material as THREE.MeshBasicMaterial).opacity = 0.62 * (1 - e);
        paperHalo.scale.setScalar(1 - 0.5 * e);
        paperHalo.position.x = paper.position.x;
        paperHalo.position.z = paper.position.z;
        trayGlow.material.opacity = 0.16 + 0.24 * Math.sin(Math.PI * e);
        if (fileT >= 1) {
          paper.visible = false;
          paperHalo.visible = false;
          trayGlow.material.opacity = 0;
          filing = false;
          phase = 'filed';
          emitHint('', true, true);
        }
        lastDown = p.down;
        return;
      }

      if (phase !== 'filed') {
        if (downEdge) {
          if (mobileMode) {
            // 竖屏不做“拖 + 按住”的精细动作：先点章，再点纸。
            if (phase === 'idle' && stampSelected && hits(paper) && at) {
              stamp.position.x = at.x;
              stamp.position.z = at.z;
              stamp.position.y = DESK_Y;
              stampSelected = false;
              applyStamp();
            } else if (phase === 'idle' && (hits(stamp) || mobileStampHit(p.x, p.y))) {
              stampSelected = true;
              draggingStamp = false;
              stampPlaced = false;
              holdStart = null;
              holding = 0;
              stamp.position.y = DESK_Y + STAMP.lift;
              emitHint('TAP THE PAPER', false, true);
            } else if (phase === 'stamped' && hits(paper) && at) {
              draggingPaper = true;
              emitHint('DRAG TO THE FILE TRAY', false, true);
            } else if (stampSelected) {
              stampSelected = false;
              restStamp();
              emitHint('TAP THE STAMP', false, true);
            }
          } else if (phase === 'idle' && hits(stamp) && at) {
            draggingStamp = true;
            stampPlaced = false;
            holdStart = null;
            holding = 0;
            stamp.position.y = DESK_Y + STAMP.lift;
            emitHint('DRAG TO THE PAPER', false, true);
          } else if (phase === 'stamped' && !draggingStamp && hits(paper) && at) {
            draggingPaper = true;
            emitHint('DRAG TO THE FILE TRAY', false, true);
          }
        }

        if (draggingStamp) {
          if (p.down && at) {
            stamp.position.x = at.x;
            stamp.position.z = at.z;
            if (stampOverPaper()) {
              if (holdStart === null) holdStart = frame.t;
              holding = clamp01((frame.t - holdStart) / STAMP.hold);
              stamp.position.y = DESK_Y + STAMP.lift - STAMP.lift * holding;
              if (holding >= 1) applyStamp();
            } else {
              holdStart = null;
              holding = 0;
              stamp.position.y = DESK_Y + STAMP.lift;
              emitHint('DRAG TO THE PAPER');
            }
          }
          if (upEdge && draggingStamp) {
            draggingStamp = false;
            if (stampOverPaper()) {
              stamp.position.y = DESK_Y;
              stampPlaced = true;
              holdStart = null;
              holding = 0;
              emitHint('PRESS AND HOLD', false, true);
            } else {
              restStamp();
              stampRing.visible = true;
              holdStart = null;
              holding = 0;
              emitHint('DRAG THE STAMP TO THE PAPER', false, true);
            }
          }
        }

        if (draggingPaper) {
          if (p.down && at) {
            setPaperPos(at.x, at.z);
            emitHint(paperOverTray() ? 'DROP IT IN THE TRAY' : 'DRAG TO THE FILE TRAY');
          }
          if (upEdge && draggingPaper) {
            draggingPaper = false;
            if (paperOverTray()) startFile();
            else emitHint('DRAG TO THE FILE TRAY', false, true);
          }
        }
      }

      if (phase === 'idle' && !draggingStamp) {
        stampRing.visible = !stampPlaced;
        (stampRing.material as THREE.MeshBasicMaterial).opacity = stampPlaced ? 0 : 0.18 + 0.18 * Math.abs(Math.sin(raw * 2.2));
      } else {
        stampRing.visible = false;
      }
      if (phase === 'stamped') {
        trayGlow.material.opacity = 0.10 + 0.12 * (0.5 + 0.5 * Math.sin(raw * 3.1));
      } else if (phase === 'idle') {
        trayGlow.material.opacity = 0;
      }

      if (inkT >= 0) {
        inkT += frame.dt;
        inkRipple.scale.setScalar(0.4 + inkT * 2.2);
        inkRipple.material.opacity = Math.max(0, 0.42 * (1 - inkT / 0.55));
        if (inkT > 0.55) {
          inkT = -1;
          inkRipple.visible = false;
        }
      }

      // 纸边跟随纸的位移/缩放/淡出；拖章时纸不动，归档和复位时要同步。
      paperEdge.position.set(paper.position.x, paper.position.y - 0.0018, paper.position.z);
      paperEdge.rotation.y = PAPER.yaw;
      paperEdge.scale.copy(paper.scale);
      paperEdge.visible = paper.visible;
      (paperEdge.material as THREE.MeshStandardMaterial).opacity = paperMat.opacity;
      lastDown = p.down;
    },
    draw(): void {
      renderer.info.reset();
      renderer.render(scene, camera);
      frames += 1;
      const info = renderer.info.render;
      lastSnapshot = {
        mode,
        time: currentTime,
        calls: info.calls,
        triangles: info.triangles,
        meshes: sceneStats.meshes,
        breakdown: sceneStats.breakdown,
        paper: projectPaper(),
        stamp: projectBox(stamp),
        tray: projectBox(tray),
        stamped,
        phase,
        holding,
      };
      (globalThis as unknown as { __dawnDesk?: DawnSnapshot }).__dawnDesk = lastSnapshot;
    },
    resize(size: StageSize): void {
      fitCamera(size.w, size.h);
      renderer.setSize(Math.max(1, size.w), Math.max(1, size.h), false);
    },
    cue(verb: string): void {
      if (verb === 'ripple') {
        applyStamp();
      } else if (verb === 'file') {
        startFile();
      } else if (verb === 'reset') {
        reset();
      }
    },
    dispose(): void {
      paperTexture.dispose();
      paperMat.dispose();
      paper.geometry.dispose();
      paperHalo.geometry.dispose();
      (paperHalo.material as THREE.Material).dispose();
      glass.dispose();
      renderer.dispose();
    },
  };
}

/** 预览专用零件定义。 */
export const part: PartV2 = {
  id: 'dawn-desk',
  layer: 'L1',
  channel: 'world',
  space: 'screen',
  blend: 'source-over',
  costMs: DECLARED_COST_MS,
  kb: DECLARED_KB,
  requires: ['webgl2'],
  create,
};

export default part;
