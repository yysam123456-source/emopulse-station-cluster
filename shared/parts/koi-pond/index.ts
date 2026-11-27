// koi-pond —— L1 world 零件：zz85 锦鲤池的完整移植。
//
// 原件：https://github.com/zz85/random-sketches/tree/gh-pages/vibes/koi
// 源码：`shared/parts-library/koi/`（26 个上游文件，逐文件 git hash 与上游一致）。
//
// 为什么这次不再「只保留 ink」：
//   v1 的适配把 `main.js` 的三条渲染路径（real / paint / ink）压成了 ink 单条，
//   把原作最贵的东西（水面折射、焦散、三种相机、触摸模式、声音）留在了源码里。
//   用户看到的是一张「像墨但不像原作」的静态鱼图。这个文件现在按 `main.js`
//   的帧结构重新接：shadow → fish → composite → grade，另一条 pig → paint/ink。
//
// 与原件的关系：
//   · 着色器、鱼体、浮萍、焦散、水彩、水墨全部来自原件，没有重写；
//   · 只替换宿主：原件自己 `new WebGLRenderer(document.body)` + `requestAnimationFrame`，
//     这里改成 stage 给的 GL 画布 + `update/draw`；
//   · DOM 控件、localStorage、Wake Lock、PWA 留在站点层（见 sites/koi/attach.ts）。
//
// 坐标单位仍是米：短边 1.5（real）/ 0.8（paint/ink），池深 1.1。
import * as THREE from 'three';
import type { Lod, PartEnv, PartInstance, PartV2, Rect, StageSize, WorldFrame } from '../../stage/contract';
import { MAXR, makeShared } from '../../parts-library/koi/glsl.js';
import { makeCausticPass, makeBottom, makeComposite, makeGrade, mulberry32 } from '../../parts-library/koi/pond.js';
import { seasonNow } from '../../parts-library/koi/surface.js';
import { makePaint } from '../../parts-library/koi/paint.js';
import { FishSchool } from './modules/fish-school';
import { SurfaceEcology } from './modules/surface-ecology';
import { CameraRig, FOV } from './modules/camera-rig';
import { makeInk, NF } from '../../parts-library/koi/ink.js';
import { makeAudio } from '../../parts-library/koi/audio.js';

/** 三条渲染路径。默认 ink：原件 `main.js` 的默认值也是 ink。 */
type KoiStyle = 'ink' | 'paint' | 'real';
type TouchMode = 'ripple' | 'feed' | 'call';
type CameraMode = 'top' | 'angle' | 'orbit';
type Floor = 'pebble' | 'sky' | 'dark';
type Rain = 'dry' | 'drizzle' | 'rain';
type Music = 'off' | 'still' | 'flow';

/** 模板参数：只覆盖站点默认，不改变 `/koi` 现有的 URL query 行为。 */
export interface KoiOptions {
  readonly style?: KoiStyle;
  readonly mode?: TouchMode;
  readonly cam?: CameraMode;
  readonly floor?: Floor;
  readonly rain?: Rain;
  readonly music?: Music;
  readonly seed?: number;
}

const STYLES: readonly KoiStyle[] = ['ink', 'paint', 'real'];
const MODES: readonly TouchMode[] = ['ripple', 'feed', 'call'];
const CAMS: readonly CameraMode[] = ['top', 'angle', 'orbit'];
const FLOORS: readonly Floor[] = ['pebble', 'sky', 'dark'];
const RAINS: readonly Rain[] = ['dry', 'drizzle', 'rain'];
const MUSICS: readonly Music[] = ['off', 'still', 'flow'];
const FPS_STEPS: readonly number[] = [60, 24, 16, 12, 8, 4, 2, 1, 0.5, 0.25];

/** 原件实测：手机 9 条、桌面 11 条；stage low 再降到 7。 */
const FISH_HIGH = 11;
const FISH_LOW = 7;

/** 原件池塘底的三种配色（符号、名字、floor id、uSigma、uScatter）。 */
const FLOOR_DEF: Readonly<Record<Floor, {
  symbol: string;
  label: string;
  id: number;
  sigma: readonly [number, number, number];
  scatter: readonly [number, number, number];
}>> = {
  pebble: { symbol: '石', label: 'Pebble', id: 0, sigma: [0.42, 0.24, 0.26], scatter: [0.006, 0.008, 0.008] },
  sky: { symbol: '空', label: 'Sky', id: 1, sigma: [0.70, 0.17, 0.09], scatter: [0.004, 0.012, 0.020] },
  dark: { symbol: '黒', label: 'Dark', id: 2, sigma: [0.55, 0.36, 0.36], scatter: [0.003, 0.004, 0.005] },
};

const RAIN_DEF: Readonly<Record<Rain, { level: number; label: string }>> = {
  dry: { level: 0, label: 'Dry' },
  drizzle: { level: 0.3, label: 'Drizzle' },
  rain: { level: 0.9, label: 'Rain' },
};

interface Ripple {
  x: number;
  y: number;
  t0: number;
  a: number;
}

interface KoiState {
  style: KoiStyle;
  mode: TouchMode;
  cam: CameraMode;
  floor: Floor;
  rain: Rain;
  music: Music;
  /** 水彩/水墨的「手绘帧率」；real 不看这个。 */
  fps: number;
  /** 水彩/水墨按住当前帧（原件 `still`）。 */
  still: boolean;
  /** 设备倾斜/摇晃（原件 `motion`）。 */
  motion: boolean;
}

/** 安全读 query：file:// 与 Node 预览都不会炸。 */
function query(): URLSearchParams {
  try {
    return new URLSearchParams(globalThis.location?.search ?? '');
  } catch {
    return new URLSearchParams();
  }
}

function pick<T extends string>(list: readonly T[], value: string | null, fallback: T): T {
  return value && (list as readonly string[]).includes(value) ? value as T : fallback;
}

function clamp(x: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, x));
}

function next<T>(list: readonly T[], value: T): T {
  const i = list.indexOf(value);
  return list[(i + 1) % list.length] as T;
}

/** 创建一个完整 koi 池。 */
function create(env: PartEnv, opts: KoiOptions = {}): PartInstance {
  if (!env.canvas) throw new Error('koi-pond 需要 GL 画布');

  // Node 假 DOM 的 canvas 会禁止 addEventListener；three 构造期必须挂 contextlost。
  // 探不通 = 没有真实 GL 画布，按 unsupported 让装配器跳过，而不是伪装成运行期 bug。
  try {
    const probe = (): void => {};
    env.canvas.addEventListener('webglcontextlost', probe);
    env.canvas.removeEventListener('webglcontextlost', probe);
  } catch {
    throw Object.assign(new Error('koi-pond 需要真实 WebGL2 画布'), { code: 'E_UNSUPPORTED' });
  }

  const Q = query();
  const num = (key: string, fallback: number): number => {
    if (!Q.has(key)) return fallback;
    const value = Number.parseFloat(Q.get(key) ?? '');
    return Number.isFinite(value) ? value : fallback;
  };
  const MOBILE = (() => {
    try {
      return globalThis.matchMedia?.('(pointer: coarse)').matches === true
        || Math.min(globalThis.screen?.width ?? 9999, globalThis.screen?.height ?? 9999) < 600;
    } catch {
      return false;
    }
  })();

  const S: KoiState = {
    style: pick(STYLES, Q.get('style') ?? opts.style ?? null, 'ink'),
    mode: pick(MODES, Q.get('mode') ?? opts.mode ?? null, 'ripple'),
    cam: pick(CAMS, Q.get('cam') ?? opts.cam ?? null, 'top'),
    floor: pick(FLOORS, Q.get('floor') ?? opts.floor ?? null, 'pebble'),
    rain: pick(RAINS, Q.get('rain') ?? opts.rain ?? null, 'dry'),
    music: pick(MUSICS, Q.get('music') ?? opts.music ?? null, 'off'),
    fps: Q.has('fps') ? num('fps', 8) : 8,
    still: Q.has('still') && Q.get('still') !== '0',
    motion: Q.has('motion') && Q.get('motion') !== '0',
  };
  const SEED = Q.has('seed') ? num('seed', opts.seed ?? env.seed) : (opts.seed ?? env.seed);
  const rng = mulberry32(SEED);

  let w = Math.max(1, env.width);
  let h = Math.max(1, env.height);
  let dpr = Math.max(1, env.dpr);
  let lod: Lod = env.lod;
  let disposed = false;
  let ready = false;
  let dirty = true;
  let time = 0;
  let inkDt = 0;
  let frames = 0;

  // ── renderer ──────────────────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({
    canvas: env.canvas,
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
    // 与原件 `?shot` 同义：给 QA 抓原始 GL 帧用，平时关掉省带宽。
    preserveDrawingBuffer: Q.has('shot'),
  });
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;
  // 设备丢失不是「这一帧没画」：告诉装配器，让它落进 degraded，而不是假装 ready。
  env.canvas.addEventListener('webglcontextlost', (event) => {
    try { event.preventDefault(); } catch { /* 旧浏览器 */ }
    env.onError?.('WebGL context lost');
  });

  if (!renderer.capabilities.isWebGL2) {
    renderer.dispose();
    throw Object.assign(new Error('koi-pond 需要 WebGL2'), { code: 'E_UNSUPPORTED' });
  }

  const GL2 = true;
  const shared: any = makeShared();
  shared.uFloor = { value: 0 };
  const sun = shared.uSunDir.value as THREE.Vector3;
  shared.uShadowDir.value.set(-sun.x / sun.z, -sun.y / sun.z);

  const D = shared.uD.value as number;
  const painted = (): boolean => S.style === 'paint' || S.style === 'ink';
  const inky = (): boolean => S.style === 'ink';
  const halfShort = (): number => num('view', painted() ? 0.8 : 1.5);

  const cam = new THREE.PerspectiveCamera(FOV, 1, 0.1, 60);
  const ORTHO = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const shadowCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 30);
  const view = { w: 1, h: 1, hx: 1, hy: 1, H: 5, rect: new THREE.Vector4(), q: num('q', 1), pr: 1 };

  const comp: any = makeComposite(shared);
  const grade: any = makeGrade();
  const paint: any = makePaint(comp);
  const cpass: any = makeCausticPass(shared, comp);
  const ink: any = makeInk(renderer, comp);
  const audio: any = makeAudio();
  const announce = (name: string, detail: unknown): void => {
    try {
      if (typeof globalThis.dispatchEvent === 'function' && typeof globalThis.CustomEvent === 'function') {
        globalThis.dispatchEvent(new globalThis.CustomEvent(name, { detail }));
      }
    } catch { /* 非浏览器宿主 */ }
  };

  const compScene = new THREE.Scene(); compScene.add(comp.mesh);
  const gradeScene = new THREE.Scene(); gradeScene.add(grade.mesh);
  const paintScene = new THREE.Scene(); paintScene.add(paint.mesh);
  const fishScene = new THREE.Scene();
  const shadowScene = new THREE.Scene();
  const surfScene = new THREE.Scene();

  let bottomRT: THREE.WebGLRenderTarget | null = null;
  let fishRT: THREE.WebGLRenderTarget | null = null;
  let sceneRT: THREE.WebGLRenderTarget | null = null;
  let shadowRT: THREE.WebGLRenderTarget | null = null;
  let pigRT: THREE.WebGLRenderTarget | null = null;
  let causticRT: THREE.WebGLRenderTarget | null = null;

  const rt = (width: number, height: number, samples: number): THREE.WebGLRenderTarget =>
    new THREE.WebGLRenderTarget(width, height, { samples: GL2 ? samples : 0, depthBuffer: true });

  // ── 池里的居民：鱼群 / 浮萍生态各自一个模块 ─────────────────────────────
  const fishSchool = new FishSchool({
    scene: fishScene,
    shadowScene,
    shared,
    rng,
    count: clamp(Math.round(num('fish', MOBILE ? 9 : 11)), 1, 30),
  });
  const fish = fishSchool.fish;
  const surfaceEcology = new SurfaceEcology({
    shared,
    scene: surfScene,
    shadowScene,
    seed: SEED,
    season: pick(['spring', 'summer', 'autumn', 'winter'], Q.get('season'), seasonNow() as any) as any,
  });
  const surface = surfaceEcology.surface;

  // ── 涟漪 ────────────────────────────────────────────────────────────────
  const ripples: Ripple[] = [];
  function ripple(x: number, y: number, a = 1): void {
    if (ripples.length >= MAXR) ripples.shift();
    ripples.push({ x, y, t0: time, a });
  }
  function uploadRipples(): void {
    while (ripples.length > 0 && time - ripples[0]!.t0 > 7) ripples.shift();
    const U = comp.u.uRip.value as THREE.Vector4[];
    ripples.forEach((r, i) => U[i]!.set(r.x, r.y, r.t0, r.a * 0.0032));
    comp.u.uRipN.value = ripples.length;
  }

  // ── 布局 / RT ────────────────────────────────────────────────────────────
  function sizeTargets(): void {
    const scale = lod === 'low' ? Math.min(view.q, 0.72) : view.q;
    view.pr = Math.min(dpr, 2) * scale * (painted() ? 0.72 : 1);
    renderer.setPixelRatio(Math.min(dpr, 2) * Math.min(1, scale + 0.15));
    const W = Math.max(2, Math.round(w * view.pr));
    const H = Math.max(2, Math.round(h * view.pr));
    shared.uPaint.value = painted() ? 1 : 0;
    paint.u.uInk.value = inky() ? 1 : 0;
    fishSchool.setPainted(painted());
    paint.u.uGrain.value = h / 3.5;
    paint.u.uPx.value = H / 700;
    paint.u.uRes.value.set(W, H);
    ink.vu.uGrain.value = h / 3.5;
    if (inky()) ink.size(W, H); else ink.free();

    if (painted()) {
      fishRT?.dispose(); sceneRT?.dispose(); fishRT = null; sceneRT = null;
      if (pigRT && pigRT.width === W && pigRT.height === H) return;
      pigRT?.dispose();
      pigRT = rt(W, H, 4);
      pigRT.texture.minFilter = THREE.LinearMipmapLinearFilter;
      pigRT.texture.generateMipmaps = true;
      paint.u.uPig.value = pigRT.texture;
      ink.su.uPig.value = pigRT.texture;
      ink.vu.uPig.value = pigRT.texture;
      return;
    }

    pigRT?.dispose(); pigRT = null;
    if (sceneRT && sceneRT.width === W && sceneRT.height === H) return;
    fishRT?.dispose(); sceneRT?.dispose();
    fishRT = rt(W, H, 4);
    sceneRT = rt(W, H, 4);
    comp.u.uFish.value = fishRT.texture;
    grade.u.uScene.value = sceneRT.texture;
    grade.u.uRes.value.set(W, H);
  }

  // ── 镜头：球面轨道独立成 CameraRig ───────────────────────────────────────
  const rig = new CameraRig({ cam, view, depth: D, mode: S.cam, style: S.style });
  const VP = new THREE.Matrix4();

  function resize(): void {
    if (w <= 0) w = 1;
    if (h <= 0) h = 1;
    const aspect = w / h;
    view.w = w;
    view.h = h;
    dirty = true;
    const HS = halfShort();
    if (aspect < 1) { view.hx = HS; view.hy = HS / aspect; } else { view.hy = HS; view.hx = HS * aspect; }
    view.H = view.hy / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    cam.aspect = aspect;
    cam.updateProjectionMatrix();

    // 池底必须覆盖最斜视角能看到的范围；正上方只需要覆盖当前视口，再留 tilt 余量。
    const k = ((view.H + D) / view.H) * 1.18;
    let r = new THREE.Vector4(-view.hx * k, -view.hy * k, 2 * view.hx * k, 2 * view.hy * k);
    if (rig.angled) {
      const rho = rig.reach();
      r = new THREE.Vector4(-rho, -rho, 2 * rho, 2 * rho);
    }
    if (!bottomRT || Math.abs(r.z - view.rect.z) > 1e-3 || Math.abs(r.w - view.rect.w) > 1e-3) {
      view.rect.copy(r);
      bottomRT?.dispose();
      const maxT = Math.min(renderer.capabilities.maxTextureSize, MOBILE ? 2048 : 3072);
      bottomRT = makeBottom(renderer, shared, view.rect, maxT);
      comp.u.uBottom.value = bottomRT.texture;
      comp.u.uRect.value.copy(view.rect);
      Object.assign(shadowCam, { left: r.x, right: r.x + r.z, bottom: r.y, top: r.y + r.w });
      shadowCam.position.set(0, 0, 10);
      shadowCam.lookAt(0, 0, 0);
      shadowCam.updateProjectionMatrix();
      // 焦散 texel 约 1cm（太阳圆盘在这个深度下的模糊尺度）
      const cl = Math.min(MOBILE ? 1024 : 1536, Math.round(Math.max(r.z, r.w) / 0.009));
      const cw = r.z >= r.w ? cl : Math.round(cl * r.z / r.w);
      const ch = r.z >= r.w ? Math.round(cl * r.w / r.z) : cl;
      causticRT?.dispose();
      causticRT = new THREE.WebGLRenderTarget(cw, ch, {
        minFilter: THREE.LinearMipmapLinearFilter,
        magFilter: THREE.LinearFilter,
        generateMipmaps: true,
        depthBuffer: false,
      });
      causticRT.texture.wrapS = causticRT.texture.wrapT = THREE.ClampToEdgeWrapping;
      shared.uCaustic.value = causticRT.texture;
      shared.uCauRect.value.copy(r);
      const sl = rig.angled ? 1024 : 512;
      const sw = r.z >= r.w ? sl : Math.round(sl * r.z / r.w);
      const sh = r.z >= r.w ? Math.round(sl * r.w / r.z) : sl;
      shadowRT?.dispose();
      shadowRT = rt(sw, sh, 0);
      shadowRT.depthBuffer = false;
      comp.u.uShadow.value = shadowRT.texture;
      comp.u.uShadowTexel.value.set(1 / sw, 1 / sh);
      surfaceEcology.layout(view.hx, view.hy, halfShort() / 1.5);
    }
    const kx = Math.PI / (2 * view.hx * 1.15);
    const ky = Math.PI / (2 * view.hy * 1.15);
    comp.u.uSlosh.value.z = kx;
    comp.u.uSlosh.value.w = ky;
    renderer.setSize(w, h, false);
    sizeTargets();
  }

  function setFloor(): void {
    const f = FLOOR_DEF[S.floor];
    shared.uFloor.value = f.id;
    shared.uSigma.value.set(...f.sigma);
    shared.uScatter.value.set(...f.scatter);
    if (bottomRT) {
      bottomRT.dispose();
      bottomRT = null;
      resize();
    }
    dirty = true;
  }
  function setRain(): void {
    const r = RAIN_DEF[S.rain];
    shared.uRain.value = r.level;
    audio.setRain(r.level);
    dirty = true;
  }
  function setCam(nextCam: CameraMode): void {
    S.cam = nextCam;
    rig.setMode(nextCam);
    resize();
    dirty = true;
  }
  function setStyle(nextStyle: KoiStyle): void {
    S.style = nextStyle;
    if (!painted()) S.still = false;
    // 换风格要让 glaze / target / 相机全部按新路径重建
    fishSchool.setPainted(painted());
    rig.setStyle(nextStyle);
    resize();
    dirty = true;
  }

  // ── 输入 ────────────────────────────────────────────────────────────────
  const fingers = new Map<number, { x: number; y: number; lx: number; ly: number; lt: number; sx: number; sy: number }>();
  let lastPointer = { x: 0.5, y: 0.5, down: false };
  let wasDown = false;
  let pointerId = 1;
  let startle: { t: number; x: number; y: number; r: number } | null = null;
  const motion = {
    tilt: [0, 0] as [number, number],
    tiltT: [0, 0] as [number, number],
    base: null as [number, number] | null,
    sx: 0,
    sy: 0,
    vx: 0,
    vy: 0,
    lastShake: -9,
    enabled: S.motion,
  };

  function toWorld(cx: number, cy: number): [number, number] {
    const v = new THREE.Vector3((cx / view.w) * 2 - 1, -(cy / view.h) * 2 + 1, 0.5)
      .unproject(cam)
      .sub(cam.position)
      .normalize();
    const t = -cam.position.z / v.z;
    return [cam.position.x + v.x * t, cam.position.y + v.y * t];
  }

  function padAt(x: number, y: number): any | null {
    for (const p of surfaceEcology.pads) {
      if (Math.hypot(p.x - x, p.y - y) < p.r) return p;
    }
    return null;
  }

  /** 一次按下/拖动：与原件 main.js 的 touch 分支同义。 */
  function pointerDown(x: number, y: number): void {
    const pad = padAt(x, y);
    if (pad) {
      pad.vx += (pad.x - x) * 0.6;
      pad.vy += (pad.y - y) * 0.6;
      pad.vr += (Math.random() - 0.5) * 0.4;
    }
    if (S.mode === 'ripple') {
      ripple(x, y, 1);
      audio.plip(0.16);
    } else if (S.mode === 'feed') {
      surfaceEcology.dropPellets(x, y, 3 + Math.floor(Math.random() * 3), ripple);
      audio.plip(0.08, 900);
    } else {
      ripple(x, y, 0.35);
      audio.plip(0.06, 700);
    }
  }

  function pointerMove(x: number, y: number, f: { lx: number; ly: number; lt: number }): void {
    const moved = Math.hypot(x - f.lx, y - f.ly);
    if (S.mode === 'ripple' && moved > 0.07) {
      ripple(x, y, 0.4 + Math.min(0.6, moved * 2));
      f.lx = x; f.ly = y;
    } else if (S.mode === 'feed' && (moved > 0.12 || time - f.lt > 0.25) && moved > 0.02) {
      surfaceEcology.dropPellets(x, y, 1 + Math.floor(Math.random() * 2), ripple);
      f.lx = x; f.ly = y; f.lt = time;
    }
  }

  // ── 设备倾斜/摇晃（可选；必须由用户手势开启）────────────────────────────
  const motionHandlers: Array<[string, (event: any) => void]> = [];
  function screenAngle(): number {
    try {
      return (((globalThis.screen as any)?.orientation?.angle ?? (globalThis as any).orientation ?? 0) as number) * Math.PI / 180;
    } catch {
      return 0;
    }
  }
  function toScreen(dx: number, dy: number): [number, number] {
    const a = screenAngle(), c = Math.cos(a), s = Math.sin(a);
    return [dx * c - dy * s, dx * s + dy * c];
  }
  function attachMotion(): void {
    if (motion.enabled || typeof globalThis.addEventListener !== 'function') return;
    motion.enabled = true;
    const onOrientation = (e: any): void => {
      if (e.beta == null) return;
      if (!motion.base) motion.base = [e.beta, e.gamma];
      motion.base[0] += (e.beta - motion.base[0]) * 0.004;
      motion.base[1] += (e.gamma - motion.base[1]) * 0.004;
      const gx = clamp((e.gamma - motion.base[1]) / 28, -1, 1);
      const gy = clamp(-(e.beta - motion.base[0]) / 28, -1, 1);
      motion.tiltT = toScreen(gx, gy);
    };
    const onMotion = (e: any): void => {
      const a = e.acceleration && e.acceleration.x != null ? e.acceleration : null;
      if (!a) return;
      const [ax, ay] = toScreen(a.x || 0, a.y || 0);
      motion.vx -= ax * 0.0009;
      motion.vy -= ay * 0.0009;
      const mag = Math.hypot(a.x || 0, a.y || 0, a.z || 0);
      if (mag > 13 && time - motion.lastShake > 1.2) {
        motion.lastShake = time;
        startle = { t: -1, x: 0, y: 0, r: 99 };
        for (let i = 0; i < 6; i += 1) ripple((Math.random() * 2 - 1) * view.hx, (Math.random() * 2 - 1) * view.hy, 1.2);
        audio.plip(0.16);
      }
    };
    globalThis.addEventListener('deviceorientation', onOrientation as any, true);
    globalThis.addEventListener('devicemotion', onMotion as any, true);
    motionHandlers.push(['deviceorientation', onOrientation], ['devicemotion', onMotion]);
  }
  async function enableMotion(): Promise<void> {
    try {
      for (const E of [(globalThis as any).DeviceOrientationEvent, (globalThis as any).DeviceMotionEvent]) {
        if (E && typeof E.requestPermission === 'function') {
          const r = await E.requestPermission();
          if (r !== 'granted') throw new Error(r);
        }
      }
      attachMotion();
      S.motion = true;
      dirty = true;
    } catch {
      S.motion = false;
      motion.enabled = false;
    }
  }

  // ── 模拟 ────────────────────────────────────────────────────────────────
  function simulate(dt: number): void {
    time += dt;
    shared.uTime.value = time;
    // tilt 缓入；slosh 是被倾斜/摇晃驱动的阻尼驻波
    const [tx, ty] = motion.enabled ? motion.tiltT : [0, 0];
    const ptx = motion.tilt[0], pty = motion.tilt[1];
    motion.tilt[0] += (tx - motion.tilt[0]) * Math.min(1, dt * 3);
    motion.tilt[1] += (ty - motion.tilt[1]) * Math.min(1, dt * 3);
    motion.vx += (-(motion.tilt[0] - ptx) * 0.02 - motion.sx * 5 * dt - motion.vx * 0.9 * dt);
    motion.vy += (-(motion.tilt[1] - pty) * 0.02 - motion.sy * 5 * dt - motion.vy * 0.9 * dt);
    motion.sx = clamp(motion.sx + motion.vx * dt * 6, -0.012, 0.012);
    motion.sy = clamp(motion.sy + motion.vy * dt * 6, -0.012, 0.012);
    comp.u.uSlosh.value.x = motion.sx;
    comp.u.uSlosh.value.y = motion.sy;
    if (!motion.enabled) { motion.tiltT[0] = 0; motion.tiltT[1] = 0; }

    if (startle && startle.t === -1) startle.t = time;
    const calls = S.mode === 'call' && lastPointer.down ? [{ x: toWorld(lastPointer.x * view.w, lastPointer.y * view.h)[0], y: toWorld(lastPointer.x * view.w, lastPointer.y * view.h)[1] }] : [];
    const fingersIn = S.mode === 'ripple' && lastPointer.down ? [{ x: toWorld(lastPointer.x * view.w, lastPointer.y * view.h)[0], y: toWorld(lastPointer.x * view.w, lastPointer.y * view.h)[1] }] : [];

    const W = {
      t: time, hx: view.hx, hy: view.hy, fish, pellets: surfaceEcology.pellets, calls, fingers: fingersIn, startle, ripple,
      onEat: (x: number, y: number) => { ripple(x, y, 0.7); audio.gulp(); },
    };
    fishSchool.update(dt, W);
    if (startle && startle.t !== time) startle = null;
    surfaceEcology.update({ dt, t: time, hx: view.hx, hy: view.hy, tilt: motion.tilt, ripples, ripple });
  }

  const _a = new THREE.Vector3();
  const _b = new THREE.Vector3();
  function inkStir(): void {
    const n = Math.min(NF, fish.length);
    ink.su.uFN.value = n;
    const toUV = (v: THREE.Vector3): [number, number] => {
      v.project(cam);
      return [v.x * 0.5 + 0.5, v.y * 0.5 + 0.5];
    };
    for (let i = 0; i < n; i += 1) {
      const k = fish[i];
      const dx = Math.cos(k.h), dy = Math.sin(k.h);
      const [hx, hy] = toUV(_a.set(k.x, k.y, k.z));
      const [fx, fy] = toUV(_b.set(k.x + dx * k.v, k.y + dy * k.v, k.z));
      const [tx2, ty2] = toUV(_a.set(k.x - dx * k.L * 0.85, k.y - dy * k.L * 0.85, k.z));
      const [ex] = toUV(_b.set(k.x + k.L, k.y, k.z));
      ink.su.uFP.value[i].set(hx, hy, fx - hx, fy - hy);
      ink.su.uFT.value[i].set(tx2, ty2, Math.abs(ex - hx) * 1.6, time * (5 + k.v * 12) + i * 1.7);
    }
  }

  // ── 渲染 ────────────────────────────────────────────────────────────────
  function render(key = true): void {
    uploadRipples();
    const [tx, ty] = motion.tilt;
    rig.place(rig.el, rig.az, tx, ty);
    VP.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    comp.u.uInvVP.value.copy(VP).invert();
    comp.u.uCam.value.copy(cam.position);
    comp.u.uVP.value.copy(VP);
    comp.u.uGlint.value.set(-tx * 0.45, -ty * 0.45);

    if (shadowRT) {
      renderer.setRenderTarget(shadowRT);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(shadowScene, shadowCam);
    }

    if (painted()) {
      paint.u.uBoil.value = Math.floor(time * Math.min(S.fps, 12));
      if (!pigRT) return;
      // 颜料在白纸上：深的鱼先画，浅的鱼盖上去，最后浮萍
      renderer.setRenderTarget(pigRT);
      renderer.setClearColor(0xffffff, 1);
      renderer.clear();
      renderer.setClearColor(0x000000, 1);
      if (!inky() || key) {
        renderer.render(fishScene, cam);
        renderer.render(surfScene, cam);
      }
      if (inky()) {
        inkStir();
        ink.step(inkDt, key, ORTHO);
        inkDt = 0;
        renderer.setRenderTarget(null);
        renderer.setClearColor(0x000000, 0);
        renderer.clear();
        ink.show(ORTHO);
        return;
      }
      renderer.setRenderTarget(null);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(paintScene, ORTHO);
      return;
    }

    if (causticRT) {
      renderer.setRenderTarget(causticRT);
      renderer.render(cpass.scene, ORTHO);
    }
    if (fishRT) {
      renderer.setRenderTarget(fishRT);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(fishScene, cam);
    }
    if (sceneRT) {
      renderer.setRenderTarget(sceneRT);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(compScene, ORTHO);
      renderer.render(surfScene, cam);
    }
    renderer.setRenderTarget(null);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(gradeScene, ORTHO);
  }

  // ── 公开状态（仅调试；不参与契约）───────────────────────────────────────
  function stateSnapshot(): unknown {
    return {
      style: S.style, mode: S.mode, cam: S.cam, floor: S.floor, rain: S.rain, music: audio.music,
      fish: fish.length, time, frames, size: { w, h, dpr, lod },
      volume: { ...view.rect }, orbit: { el: rig.el, az: rig.az },
      sound: audio.on, motion: motion.enabled,
    };
  }

  // ── 初始化 ──────────────────────────────────────────────────────────────
  setFloor();
  setRain();
  resize();
  // 原件在首帧前 warm 600 步：鱼先散开、脊线松弛，再让人看见。
  const warm = Math.max(0, Math.round(num('warm', 600)));
  for (let i = 0; i < warm; i += 1) simulate(1 / 30);
  // 600 步 warm 是让鱼脊松弛，不是让构图跑掉；出生斜线必须在 warm 之后才落位。
  fishSchool.arrange(view.hx, view.hy);
  for (let i = 0; i < num('t', 0) * 30; i += 1) simulate(1 / 30);
  ready = true;

  return {
    update(frame: WorldFrame): void {
      if (disposed) return;
      frames += 1;
      const dt = clamp(Number.isFinite(frame.dt) ? frame.dt : 0, 0, 0.1);
      if (dt > 0 && !(S.still && painted())) simulate(dt);
      rig.step(dt, fingers.size > 0);
      if (inky()) inkDt += dt;

      lastPointer = { x: frame.pointer.x, y: frame.pointer.y, down: frame.pointer.down };
      const down = frame.pointer.down;
      const nx = frame.pointer.x * view.w;
      const ny = frame.pointer.y * view.h;
      const [wx, wy] = toWorld(nx, ny);

      if (down && !wasDown) {
        pointerDown(wx, wy);
        fingers.set(pointerId, { x: wx, y: wy, lx: wx, ly: wy, lt: time, sx: nx, sy: ny });
      } else if (down) {
        const f = fingers.get(pointerId);
        if (f) {
          f.sx = nx; f.sy = ny;
          pointerMove(wx, wy, f);
          f.x = wx; f.y = wy;
        }
      } else if (!down && wasDown) {
        fingers.delete(pointerId);
      }
      wasDown = down;
    },

    draw(): void {
      if (disposed) return;
      if (!ready) {
        resize();
        ready = true;
      }
      if (S.still && painted() && !dirty) return;
      const shouldStamp = inky()
        ? (dirty || inkDt >= Math.max(0.0001, 1 / Math.max(0.25, S.fps)) - 0.004)
        : true;
      render(shouldStamp);
      if (inky() && shouldStamp) inkDt = 0;
      dirty = false;
    },

    resize(size: StageSize): void {
      w = Math.max(1, size.w);
      h = Math.max(1, size.h);
      dpr = Math.max(1, size.dpr);
      resize();
    },

    setLod(nextLod: Lod): void {
      if (nextLod === lod) return;
      lod = nextLod;
      fishSchool.setCount(nextLod === 'low' ? FISH_LOW : FISH_HIGH);
      resize();
    },

    cue(verb: string): void {
      if (disposed) return;
      const [head, arg] = verb.split(':');
      if (head === 'style' || head === 'look') {
        const nextStyle = arg && (STYLES as readonly string[]).includes(arg) ? arg as KoiStyle : next(STYLES, S.style);
        setStyle(nextStyle);
        return;
      }
      if (head === 'mode' || head === 'touch') {
        S.mode = arg && (MODES as readonly string[]).includes(arg) ? arg as TouchMode : next(MODES, S.mode);
        return;
      }
      if (head === 'cam' || head === 'camera') {
        setCam(arg && (CAMS as readonly string[]).includes(arg) ? arg as CameraMode : next(CAMS, S.cam));
        return;
      }
      if (head === 'floor' || head === 'bottom') {
        S.floor = arg && (FLOORS as readonly string[]).includes(arg) ? arg as Floor : next(FLOORS, S.floor);
        setFloor();
        return;
      }
      if (head === 'rain' || head === 'weather') {
        S.rain = arg && (RAINS as readonly string[]).includes(arg) ? arg as Rain : next(RAINS, S.rain);
        setRain();
        return;
      }
      if (head === 'music') {
        S.music = arg && (MUSICS as readonly string[]).includes(arg) ? arg as Music : next(MUSICS, S.music);
        void audio.setMusic(S.music).then(() => {
          announce('koi:music', { mode: S.music });
          announce('koi:sound', { on: audio.on });
        }).catch(() => { /* 自动播放策略拒绝 */ });
        return;
      }
      if (head === 'sound') {
        const shouldOn = arg === 'on' ? true : arg === 'off' ? false : !audio.on;
        if (shouldOn !== audio.on) {
          void audio.toggle().then((on: boolean) => {
            announce('koi:sound', { on });
            announce('koi:music', { mode: audio.music });
          }).catch(() => { /* AudioContext 不可用 */ });
        }
        return;
      }
      if (head === 'still') {
        S.still = arg === 'on' ? true : arg === 'off' ? false : !S.still;
        dirty = true;
        return;
      }
      if (head === 'fps') {
        S.fps = arg && Number.isFinite(Number(arg)) ? Number(arg) : next(FPS_STEPS, S.fps as any);
        dirty = true;
        return;
      }
      if (head === 'motion') {
        if (arg === 'off') { S.motion = false; motion.enabled = false; return; }
        void enableMotion();
        return;
      }
      if (verb === 'ripple') {
        ripple((rng() * 2 - 1) * view.hx * 0.7, (rng() * 2 - 1) * view.hy * 0.7, 1);
      } else if (verb === 'reset') {
        time = 0; ripples.length = 0; dirty = true;
      } else if (verb === 'release') {
        for (let i = 0; i < 6; i += 1) ripple((rng() * 2 - 1) * view.hx, (rng() * 2 - 1) * view.hy, 1.1);
      }
    },

    readiness(): number {
      return ready ? 1 : 0.85;
    },

    readinessInfo(): { value: number; label?: string; blocking?: boolean } {
      return ready
        ? { value: 1, blocking: false }
        : { value: 0.85, label: 'water', blocking: false };
    },

    describe(): { sheet: Rect | null } {
      return { sheet: null };
    },

    dispose(): void {
      disposed = true;
      for (const [name, fn] of motionHandlers) globalThis.removeEventListener(name, fn as any, true);
      motionHandlers.length = 0;
      if (audio.on) void audio.toggle().catch(() => { /* 已经关闭 */ });
      bottomRT?.dispose(); fishRT?.dispose(); sceneRT?.dispose();
      shadowRT?.dispose(); pigRT?.dispose(); causticRT?.dispose();
      bottomRT = fishRT = sceneRT = shadowRT = pigRT = causticRT = null;
      ink.free?.();
      fishSchool.dispose();
      renderer.dispose();
    },

    // 调试钩子：只读快照 + 主动重画，不改变舞台契约。
    debug: stateSnapshot,
  } as PartInstance & { debug: () => unknown };
}

/**
 * 零件定义。
 *
 * costMs 取 real 路径（焦散 + 池底 + composite + grade）的申报值；
 * stage 仍会用实测 governor 决定 renderScale。`low` 下鱼 7 条、像素比降到 0.72。
 */
export const part: PartV2 = {
  id: 'koi-pond',
  layer: 'L1',
  blend: 'source-over',
  space: 'screen',
  costMs: 8.5,
  kb: 52,
  z: 0,
  channel: 'world',
  requires: ['webgl2'],
  expendable: false,
  /** 纸面先出、鱼后到：首帧后再同步编译 koi 的 renderer/shader。 */
  defer: 'after-first-frame',
  create,
};

/**
 * 工厂：模板注册表用 `makePart({ style:'ink', cam:'angle' })` 拿到一个固定参数的零件。
 * 不传 opts 时完全保持 `/koi` 的 URL query 行为。
 */
export function makePart(opts: KoiOptions = {}): PartV2 {
  return { ...part, create: (env) => create(env, opts) };
}

export default part;
