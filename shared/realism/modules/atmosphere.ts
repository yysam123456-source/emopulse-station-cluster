import * as THREE from 'three';
import type { ModuleContext, SceneModule } from '../types';
import { mesh, mulberry } from '../primitives';
import { SKY2_JPG } from '../assets';

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAG = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uGround;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform float uSunSize;
  uniform float uCloud;
  uniform float uHaze;
  uniform float uTime;
  uniform float uNight;
  varying vec3 vDir;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += noise(p) * a;
      p = p * 2.03 + vec2(17.3, 9.7);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = clamp(d.y, 0.0, 1.0);
    vec3 sky = mix(uHorizon, uTop, pow(h, 0.52));
    if (d.y < 0.0) sky = mix(uHorizon, uGround, clamp(-d.y * 5.0, 0.0, 1.0));
    float horizonGlow = exp(-abs(d.y) * 8.0) * uHaze;
    sky += uHorizon * horizonGlow * 0.34;

    // 太阳：圆盘 + 大范围暖晕，不用后期 bloom 也成立。
    float cosA = clamp(dot(d, normalize(uSunDir)), -1.0, 1.0);
    float disc = smoothstep(1.0 - uSunSize, 1.0, cosA);
    float glow = pow(max(cosA, 0.0), 42.0);
    sky += uSunColor * (disc * 2.4 + glow * 0.42);
    sky = mix(sky, uSunColor * 2.0, disc * 0.34);

    // 云：低层横向絮状，靠近太阳一侧被染暖。
    if (uCloud > 0.001 && d.y > -0.02) {
      vec2 q = d.xz / max(0.18, d.y + 0.35);
      q *= 0.85;
      q.x += uTime * 0.0012;
      float n = fbm(q * 1.35 + vec2(1.3, 4.1));
      float band = smoothstep(0.10, 0.72, d.y) * (1.0 - smoothstep(0.74, 1.0, d.y));
      float cl = smoothstep(0.50, 0.78, n) * band * uCloud;
      vec3 cloudCol = mix(uHorizon, uSunColor, 0.42 + 0.28 * glow);
      sky = mix(sky, cloudCol, cl * 0.58);
      float wisp = smoothstep(0.60, 0.84, fbm(q * 3.1 + vec2(-4.2, 2.6))) * band * uCloud;
      sky = mix(sky, vec3(0.94, 0.86, 0.74), wisp * 0.12);
    }

    // 夜晚的星点，只在 night 方案出现。
    if (uNight > 0.01 && d.y > 0.06) {
      vec2 sp = vec2(atan(d.z, d.x) * 8.0, d.y * 16.0);
      float star = step(0.996, hash(floor(sp * 42.0))) * (0.4 + 0.6 * hash(floor(sp * 42.0) + 3.1));
      sky += vec3(0.78, 0.86, 1.0) * star * uNight * smoothstep(0.02, 0.20, d.y);
    }

    gl_FragColor = vec4(sky, 1.0);
    #include <colorspace_fragment>
  }
`;

function mountainLayer(color: number, z: number, baseY: number, height: number, seed: number, width: number): THREE.Mesh {
  const rng = mulberry(seed);
  const verts: number[] = [];
  const idx: number[] = [];
  const n = 48;
  let prev = baseY + height * 0.18;
  for (let i = 0; i <= n; i += 1) {
    const x = -width / 2 + (i / n) * width;
    const peak = Math.sin(i * 0.41 + seed) * 0.45 + Math.sin(i * 0.17 + 2.1) * 0.27 + (rng() - 0.5) * 0.25;
    const y = baseY + height * (0.28 + peak * 0.5);
    prev = prev * 0.7 + y * 0.3;
    verts.push(x, baseY, z, x, prev, z);
    if (i < n) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({ color, fog: true, side: THREE.DoubleSide });
  return mesh(geo, mat, 0, 0, 0, undefined, false);
}

function mistPlane(color: number, opacity: number, y: number, z: number): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(90, 9);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        float a = smoothstep(0.0, 0.34, vUv.y) * (1.0 - smoothstep(0.58, 1.0, vUv.y));
        a *= 0.65 + 0.35 * sin(vUv.x * 42.0 + vUv.y * 8.0);
        gl_FragColor = vec4(uColor, a * uOpacity);
      }
    `,
  });
  return mesh(geo, mat, 0, y, z, undefined, false);
}

export const atmosphereModule: SceneModule = {
  id: 'atmosphere',
  label: '天空 / 远山 / 雾 / 尘埃 / 晨光',
  build(ctx: ModuleContext): THREE.Group {
    const { plan, quality } = ctx;
    const g = new THREE.Group();
    // 天空用真实晨空全景，而不是手搓渐变；地平线自带远山，场景只保留一层薄雾。
    const skyTex = ctx.lab.skyPhoto(SKY2_JPG);
    const sky = mesh(new THREE.SphereGeometry(78, 64, 34), new THREE.MeshBasicMaterial({
      map: skyTex,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      color: new THREE.Color(2.05, 1.72, 1.34),
    }), 0, 4, 0, g, false);
    sky.rotation.y = Math.PI * 0.10;
    sky.renderOrder = -100;
    sky.frustumCulled = false;
    (sky.material as THREE.MeshBasicMaterial).depthTest = false;

    // 两条横向雾带，压住主殿基座与全景地平线之间的接缝。
    g.add(mistPlane(plan.fog.color, 0.10, 1.65, -9.4));
    g.add(mistPlane(plan.fog.color, 0.15, 2.6, -15.0));

    // 尘埃：逆光下的小颗粒，给空气一点体积感。
    const rng = mulberry(92711);
    const n = quality === 'high' ? 340 : 140;
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      pos[i * 3] = (rng() - 0.5) * 20;
      pos[i * 3 + 1] = 0.3 + rng() * 6.2;
      pos[i * 3 + 2] = (rng() - 0.5) * 18 + 1;
      seed[i] = rng();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const dust = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        attribute float aSeed;
        uniform float uTime;
        uniform float uSize;
        varying float vA;
        void main() {
          vec3 p = position;
          p.y += sin(uTime * 0.32 + aSeed * 6.2831) * 0.13;
          p.x += cos(uTime * 0.21 + aSeed * 4.7) * 0.07;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uSize * (0.45 + aSeed) * (1.0 / max(0.7, -mv.z));
          vA = 0.18 + 0.52 * aSeed;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main() {
          vec2 q = gl_PointCoord - 0.5;
          float d = length(q);
          if (d > 0.5) discard;
          gl_FragColor = vec4(1.0, 0.86, 0.66, smoothstep(0.5, 0.0, d) * vA * 0.24);
        }
      `,
      uniforms: { uTime: { value: 0 }, uSize: { value: quality === 'high' ? 2.3 : 1.7 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const dustPoints = new THREE.Points(geo, dust);
    dustPoints.frustumCulled = false;
    g.add(dustPoints);

    // 光照：冷环境 + 暖阳光 + 弱补光 + 后方轮廓光。
    const target = new THREE.Vector3(0, 2.6, -2.2);
    const sunDir = new THREE.Vector3(...plan.light.sunDir).normalize();
    const sun = new THREE.DirectionalLight(plan.light.sunColor, plan.light.sunIntensity);
    sun.position.copy(target).addScaledVector(sunDir, 32);
    sun.target.position.copy(target);
    sun.castShadow = true;
    sun.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
    Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -12, near: 4, far: 70 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.00012;
    sun.shadow.normalBias = 0.018;
    sun.shadow.radius = 3;
    g.add(sun, sun.target);

    const hemi = new THREE.HemisphereLight(plan.light.hemiSky, plan.light.hemiGround, plan.light.hemiIntensity);
    g.add(hemi);
    const fill = new THREE.DirectionalLight(plan.light.fillColor, plan.light.fillIntensity * 2.1);
    fill.position.set(12, 8, 14);
    g.add(fill);
    // 后方冷轮廓，把屋脊和松针从天空里剥出来。
    const rim = new THREE.DirectionalLight(0x9ab7dc, plan.palette === 'snow' ? 0.55 : 0.38);
    rim.position.set(-8, 9, -22);
    g.add(rim);

    g.userData.skyTexture = skyTex;    g.userData.dustUniforms = dust.uniforms;
    g.userData.sun = sun;
    g.userData.hemi = hemi;
    return g;
  },
};
