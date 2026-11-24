// temple —— L1 gl 零件：用写实模块清单装配，而不是在零件里直接画一整个场景。
//
// 结构：
//   scene plan（构图/光照/雾/后处理） → module 清单（天空/地面/主殿/鸟居/石灯/松林）
//   每个 module 只依赖 MaterialLab + placement，不读其他 module。
//   Stage 侧仍只有一个 GL 零件（契约限制），但内部已经是可替换的标准件。
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import type { Lod, PartEnv, PartInstance, PartV2, StageSize, WorldFrame } from '../../stage/contract';
import { buildScene } from '../../realism/scene';
import { PLANS, type PlanId } from '../../realism/plans';

export type TempleScene = 'dawn' | 'snow' | 'dusk' | 'gate' | 'night';

export interface TempleOptions {
  /** 装配方案：晨光 / 雪霁 / 暮色；night 是 dusk 的兼容别名。 */
  readonly scene?: TempleScene;
  /** 兼容旧模板参数：dawn / dusk / night / ink 都会映射到写实方案。 */
  readonly palette?: TempleScene | 'ink';
  /** 雾密度倍率，0–1.4；默认 1。 */
  readonly fog?: number;
  /** 石灯亮度，0–1；默认 0.82。 */
  readonly lanterns?: number;
  /** 镜头环绕幅度，0–1；默认 0.7。 */
  readonly orbit?: number;
  /** 保留旧参数，不改成月亮，避免模板 manifest 失效。 */
  readonly moon?: boolean;
  /** 是否装配鸟居，默认 true。 */
  readonly torii?: boolean;
  /** 是否装配松林，默认 true。 */
  readonly pines?: boolean;
  /** 是否装配石灯，默认 true。 */
  readonly stoneLanterns?: boolean;
  /** 是否装配主殿，默认 true；关掉后同一个零件就是独立山门。 */
  readonly hall?: boolean;
}

const DOF_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    uTexel: { value: new THREE.Vector2(1 / 1280, 1 / 720) },
    uNear: { value: 0.08 },
    uFar: { value: 120 },
    uFocus: { value: 19 },
    uAperture: { value: 1.0 },
    uMaxBlur: { value: 4.5 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform vec2 uTexel;
    uniform float uNear;
    uniform float uFar;
    uniform float uFocus;
    uniform float uAperture;
    uniform float uMaxBlur;
    varying vec2 vUv;

    float viewDistance(vec2 uv) {
      float d = texture2D(tDepth, uv).x;
      return (uNear * uFar) / max(0.0001, uFar - d * (uFar - uNear));
    }

    void main() {
      vec3 base = texture2D(tDiffuse, vUv).rgb;
      float dist = viewDistance(vUv);
      float coc = abs(dist - uFocus) / max(0.35, uFocus);
      if (dist < uFocus) coc *= 0.55;
      float radius = clamp(coc * uAperture, 0.0, 1.0) * uMaxBlur;

      // 屏幕空间环境遮蔽：近圈抓缝隙，外圈抓檐下、墙角、石阶和树根。
      // 旧版把 AO 写在景深早退之后，焦点区其实完全没有遮蔽，画面才会像塑料模型。
      float center = viewDistance(vUv);
      float ao = 1.0;
      if (center < 80.0) {
        float occ = 0.0;
        for (int i = 0; i < 12; i++) {
          float a = float(i) * 0.5236;
          vec2 q = vUv + vec2(cos(a), sin(a)) * uTexel * 4.5;
          if (viewDistance(q) < center - 0.42) occ += 1.0;
        }
        ao *= 1.0 - (occ / 12.0) * 0.55;
        float farOcc = 0.0;
        for (int i = 0; i < 12; i++) {
          float a = float(i) * 0.5236 + 0.26;
          vec2 q = vUv + vec2(cos(a), sin(a)) * uTexel * 13.0;
          if (viewDistance(q) < center - 0.86) farOcc += 1.0;
        }
        ao *= 1.0 - (farOcc / 12.0) * 0.32;
      }

      if (radius < 0.6) {
        gl_FragColor = vec4(base * ao, 1.0);
        return;
      }
      vec2 r = uTexel * radius;
      vec3 col = base * 0.20;
      col += texture2D(tDiffuse, vUv + vec2(1.0, 0.0) * r).rgb * 0.12;
      col += texture2D(tDiffuse, vUv + vec2(-1.0, 0.0) * r).rgb * 0.12;
      col += texture2D(tDiffuse, vUv + vec2(0.0, 1.0) * r).rgb * 0.12;
      col += texture2D(tDiffuse, vUv + vec2(0.0, -1.0) * r).rgb * 0.12;
      col += texture2D(tDiffuse, vUv + vec2(0.70, 0.70) * r).rgb * 0.08;
      col += texture2D(tDiffuse, vUv + vec2(-0.70, 0.70) * r).rgb * 0.08;
      col += texture2D(tDiffuse, vUv + vec2(0.70, -0.70) * r).rgb * 0.08;
      col += texture2D(tDiffuse, vUv + vec2(-0.70, -0.70) * r).rgb * 0.08;
      gl_FragColor = vec4(col * ao, 1.0);
    }
  `,
};

class DofPass extends Pass {
  readonly material: THREE.ShaderMaterial;
  private readonly quad: FullScreenQuad;

  constructor() {
    super();
    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(DOF_SHADER.uniforms),
      vertexShader: DOF_SHADER.vertexShader,
      fragmentShader: DOF_SHADER.fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    const u = this.material.uniforms;
    u.tDiffuse!.value = readBuffer.texture;
    u.tDepth!.value = readBuffer.depthTexture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  override dispose(): void {
    this.quad.dispose();
    this.material.dispose();
  }
}

const FILM_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uExposure: { value: 1.06 },
    uVignette: { value: 0.18 },
    uGrain: { value: 0.035 },
    uAberration: { value: 0.0025 },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1280, 720) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uExposure;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uAberration;
    uniform float uTime;
    uniform vec2 uResolution;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime * 0.37) * 43758.5453);
    }
    vec3 aces(vec3 x) {
      return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
    }

    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec2 off = c * (0.4 + r2) * uAberration;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      col = aces(col * uExposure);
      float vig = smoothstep(0.92, 0.18, r2 * 2.1);
      col *= mix(1.0, vig, uVignette);
      float n = hash(floor(vUv * uResolution)) - 0.5;
      col += n * uGrain;
      col = pow(max(col, 0.0), vec3(1.0 / 2.2));
      // 胶片分级：加对比、提饱和，阴影偏冷、高光偏暖，避免“灰蒙蒙的游戏截图”。
      float luma = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(luma), col, 1.16);
      col = (col - 0.5) * 1.13 + 0.5;
      float hi = smoothstep(0.42, 0.92, luma);
      float lo = 1.0 - smoothstep(0.08, 0.5, luma);
      col += vec3(0.022, 0.008, -0.008) * hi;
      col += vec3(-0.008, 0.004, 0.030) * lo;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `,
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function readQuery(): URLSearchParams | null {
  try {
    const search = globalThis.location?.search;
    return search ? new URLSearchParams(search) : null;
  } catch {
    return null;
  }
}

function planId(value: string | null | undefined, fallback: PlanId): PlanId {
  if (value === 'snow') return 'snow';
  if (value === 'gate' || value === 'torii' || value === 'gate-only') return 'gate';
  if (value === 'dusk' || value === 'night' || value === 'ink') return 'dusk';
  if (value === 'dawn') return 'dawn';
  return fallback;
}

function create(env: PartEnv, opts: TempleOptions = {}): PartInstance {
  if (!env.canvas) throw Object.assign(new Error('temple 需要 GL 画布'), { code: 'E_UNSUPPORTED' });
  try {
    const probe = (): void => {};
    env.canvas.addEventListener('webglcontextlost', probe);
    env.canvas.removeEventListener('webglcontextlost', probe);
  } catch {
    throw Object.assign(new Error('temple 需要真实 WebGL2 画布'), { code: 'E_UNSUPPORTED' });
  }

  const Q = readQuery();
  const num = (key: string, fallback: number): number => {
    const raw = Q?.get(key);
    const value = raw == null ? Number.NaN : Number.parseFloat(raw);
    return Number.isFinite(value) ? value : fallback;
  };
  const flag = (key: string, fallback: boolean): boolean => {
    const raw = Q?.get(key);
    if (raw == null) return fallback;
    return raw !== '0' && raw !== 'false';
  };
  const sceneName = planId(Q?.get('scene') ?? Q?.get('palette') ?? opts.scene ?? opts.palette, 'dawn');
  const plan = PLANS[sceneName];
  const fogAmount = clamp(num('fog', opts.fog ?? 1), 0, 1.4);
  const lanternAmount = clamp(num('lanterns', opts.lanterns ?? 0.82), 0, 1);
  const orbitAmount = clamp(num('orbit', opts.orbit ?? 0.7), 0, 1);
  const showTorii = flag('torii', opts.torii !== false);
  const showPines = flag('pines', opts.pines !== false);
  const showLanterns = flag('stoneLanterns', opts.stoneLanterns !== false);
  const showHall = flag('hall', opts.hall !== false);
  const moduleFilter: string[] = [];
  for (const m of plan.modules) {
    if (!showTorii && m.id === 'torii') continue;
    if (!showPines && m.id === 'pine-grove') continue;
    if (!showLanterns && m.id === 'stone-lanterns') continue;
    if (!showHall && m.id === 'shrine-hall') continue;
    moduleFilter.push(m.id);
  }
  const uniqueModules = [...new Set(moduleFilter)];

  const renderer = new THREE.WebGLRenderer({
    canvas: env.canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(plan.fog.color, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = true;

  let width = Math.max(1, env.width);
  let height = Math.max(1, env.height);
  let dpr = Math.max(1, env.dpr);
  let lod: Lod = env.lod;

  const camera = new THREE.PerspectiveCamera(plan.camera.fov, width / height, 0.08, 120);
  camera.position.set(plan.camera.x, plan.camera.y, plan.camera.z);
  camera.lookAt(plan.camera.tx, plan.camera.ty, plan.camera.tz);

  const built = buildScene(renderer, plan, lod === 'high' ? 'high' : 'low', {
    width,
    height,
    fog: fogAmount,
    lanterns: lanternAmount,
    modules: uniqueModules,
  });
  const scene = built.scene;

  const depthTexture = new THREE.DepthTexture(width, height);
  depthTexture.format = THREE.DepthFormat;
  depthTexture.type = THREE.UnsignedIntType;
  const sceneTarget = new THREE.WebGLRenderTarget(width, height, {
    type: THREE.HalfFloatType,
    depthBuffer: true,
    depthTexture,
  });
  const composer = new EffectComposer(renderer, sceneTarget);
  composer.renderTarget2.depthTexture = new THREE.DepthTexture(width, height);
  composer.renderTarget2.depthTexture.format = THREE.DepthFormat;
  composer.renderTarget2.depthTexture.type = THREE.UnsignedIntType;
  composer.addPass(new RenderPass(scene, camera));
  const dof = new DofPass();
  const focus = camera.position.distanceTo(new THREE.Vector3(plan.camera.tx, plan.camera.ty, plan.camera.tz));
  dof.material.uniforms.uNear!.value = camera.near;
  dof.material.uniforms.uFar!.value = camera.far;
  dof.material.uniforms.uFocus!.value = focus;
  dof.material.uniforms.uAperture!.value = 0.95;
  dof.material.uniforms.uMaxBlur!.value = 4.2;
  if (lod === 'high') {
    composer.addPass(new UnrealBloomPass(
      new THREE.Vector2(width, height),
      plan.post.bloomStrength,
      plan.post.bloomRadius,
      plan.post.bloomThreshold,
    ));
  }
  composer.addPass(dof);
  const film = new ShaderPass(FILM_SHADER);
  film.material.uniforms.uExposure!.value = plan.light.exposure;
  film.material.uniforms.uVignette!.value = plan.post.vignette;
  film.material.uniforms.uGrain!.value = plan.post.grain;
  film.material.uniforms.uAberration!.value = plan.post.aberration;
  composer.addPass(film);

  let time = 0;
  let disposed = false;
  let first = true;
  let pointerX = 0.5;
  let pointerY = 0.5;

  const applySize = (): void => {
    const pixelRatio = Math.min(dpr, 1.65) * (lod === 'low' ? 0.9 : 1);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    film.material.uniforms.uResolution!.value.set(width, height);
    dof.material.uniforms.uTexel!.value.set(1 / Math.max(1, width), 1 / Math.max(1, height));
    renderer.shadowMap.needsUpdate = true;
  };
  applySize();

  return {
    update(frame: WorldFrame): void {
      time = frame.t;
      pointerX = frame.pointer.x;
      pointerY = frame.pointer.y;
      built.tick(time, frame.dt);
      film.material.uniforms.uTime!.value = time;
      // 灯笼轻微闪烁已经在 scene.tick 里处理；这里只保留低幅呼吸。
    },

    draw(_frame: WorldFrame): void {
      if (disposed) return;
      const orbit = Math.sin(time * 0.08) * 0.52 * orbitAmount;
      const driftX = (pointerX - 0.5) * 0.30 * orbitAmount;
      const driftY = (pointerY - 0.5) * 0.14 * orbitAmount;
      camera.position.set(
        plan.camera.x + orbit + driftX,
        plan.camera.y + Math.sin(time * 0.17) * 0.045 * orbitAmount - driftY,
        plan.camera.z,
      );
      camera.lookAt(plan.camera.tx + orbit * 0.16, plan.camera.ty, plan.camera.tz);
      // 呼吸式手持，幅度小于 0.05°，只在长时间观看时感到“活的”。
      camera.rotation.z += Math.sin(time * 0.91) * 0.0007 * plan.post.handHeld * 40;
      composer.render();
      if (first) {
        first = false;
        renderer.shadowMap.autoUpdate = false;
      }
    },

    resize(size: StageSize): void {
      width = Math.max(1, size.w);
      height = Math.max(1, size.h);
      dpr = Math.max(1, size.dpr);
      applySize();
    },

    setLod(next: Lod): void {
      lod = next;
      applySize();
    },

    readiness(): number {
      return 1;
    },

    describe(): { sheet: null } {
      return { sheet: null };
    },

    dispose(): void {
      disposed = true;
      built.dispose();
      composer.dispose();
      renderer.dispose();
    },

    debug: () => ({
      plan: plan.id,
      modules: built.stats.modules,
      triangles: built.stats.triangles,
      objects: built.stats.objects,
      fog: fogAmount,
      lanterns: lanternAmount,
    }),
  } as PartInstance & { debug: () => unknown };
}

const BASE: PartV2 = {
  id: 'temple',
  layer: 'L1',
  channel: 'gl',
  blend: 'source-over',
  space: 'screen',
  costMs: 7.5,
  kb: 18,
  z: 0,
  requires: ['webgl2'],
  expendable: false,
  create: (env) => create(env),
};

export function makePart(opts: TempleOptions = {}): PartV2 {
  return { ...BASE, create: (env) => create(env, opts) };
}

export const part: PartV2 = makePart();
export default part;
