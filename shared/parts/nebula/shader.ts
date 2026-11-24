import * as THREE from 'three';

export const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uPointSize;
  uniform float uPixelRatio;
  uniform float uScale;
  uniform float uPulse;
  attribute float aSize;
  attribute float aMix;
  attribute float aOpacity;
  attribute float aSeed;
  varying float vMix;
  varying float vOpacity;
  varying float vSeed;

  void main() {
    vec3 p = position * uScale;
    float orbit = uTime * (0.22 + aSeed * 0.18);
    float c = cos(orbit);
    float s = sin(orbit);
    p.xz = mat2(c, -s, s, c) * p.xz;
    p.y += sin(uTime * 0.55 + aSeed * 6.2831) * 0.035;
    p *= 1.0 + uPulse * 0.06 * (0.5 + aSeed);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uPointSize * (0.55 + aSize) * uPixelRatio * (1.0 / max(0.8, -mv.z));
    vMix = aMix;
    vOpacity = aOpacity * (0.72 + 0.28 * sin(uTime * 1.7 + aSeed * 12.0));
    vSeed = aSeed;
  }
`;

export const FRAG = /* glsl */ `
  uniform vec3 uCore;
  uniform vec3 uArm;
  uniform vec3 uDust;
  varying float vMix;
  varying float vOpacity;
  varying float vSeed;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float core = smoothstep(0.5, 0.0, d);
    float halo = smoothstep(0.5, 0.12, d) * 0.55;
    vec3 col = mix(uArm, uCore, pow(core, 2.2));
    col = mix(uDust, col, 0.35 + 0.65 * vMix);
    col += uCore * pow(max(0.0, 1.0 - d), 5.0) * 0.18;
    gl_FragColor = vec4(col, (core + halo) * vOpacity);
  }
`;

export interface NebulaUniforms {
  uTime: THREE.IUniform<number>;
  uPointSize: THREE.IUniform<number>;
  uPixelRatio: THREE.IUniform<number>;
  uScale: THREE.IUniform<number>;
  uPulse: THREE.IUniform<number>;
  uCore: THREE.IUniform<THREE.Color>;
  uArm: THREE.IUniform<THREE.Color>;
  uDust: THREE.IUniform<THREE.Color>;
}

/** 所有粒子模块共享同一组 uniform，改一次色/速度全星系同步。 */
export function createUniforms(
  core: number,
  arm: number,
  dust: number,
  dpr: number,
  scale: number,
): NebulaUniforms {
  return {
    uTime: { value: 0 },
    uPointSize: { value: 2.1 * Math.min(1.4, dpr) },
    uPixelRatio: { value: Math.min(1.5, dpr) },
    uScale: { value: scale },
    uPulse: { value: 0 },
    uCore: { value: new THREE.Color(core) },
    uArm: { value: new THREE.Color(arm) },
    uDust: { value: new THREE.Color(dust) },
  };
}

export function createParticleMaterial(u: NebulaUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: u as unknown as Record<string, THREE.IUniform>,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
}
