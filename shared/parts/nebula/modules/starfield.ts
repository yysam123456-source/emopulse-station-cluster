import * as THREE from 'three';
import { hash } from '../palette';
import type { NebulaModule } from '../types';

const VERT = /* glsl */ `
  uniform float uPixelRatio;
  attribute float aSize;
  attribute float aTint;
  varying float vTint;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPixelRatio * (1.0 / max(0.8, -mv.z));
    vTint = aTint;
  }
`;

const FRAG = /* glsl */ `
  varying float vTint;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.0, d);
    vec3 cold = vec3(0.62, 0.76, 1.0);
    vec3 warm = vec3(1.0, 0.86, 0.66);
    gl_FragColor = vec4(mix(cold, warm, vTint), a * 0.85);
  }
`;

/** 背景星场：把透明背景填成“深空”，和星系主体分开装配。 */
export function createStarfieldModule(density: number, dpr: number): NebulaModule {
  const count = Math.round(900 * Math.min(1.35, density));
  const pos = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const tint = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const u = hash(i * 1.73 + 21.1) * Math.PI * 2;
    const v = Math.acos(2 * hash(i * 2.91 + 22.7) - 1);
    const r = 24 + hash(i * 3.17 + 23.3) * 8;
    pos[i * 3] = Math.sin(v) * Math.cos(u) * r;
    pos[i * 3 + 1] = Math.cos(v) * r * 0.55;
    pos[i * 3 + 2] = Math.sin(v) * Math.sin(u) * r;
    size[i] = 0.55 + Math.pow(hash(i * 4.41 + 24.9), 3) * 2.4;
    tint[i] = hash(i * 5.13 + 25.1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geometry.setAttribute('aTint', new THREE.BufferAttribute(tint, 1));
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uPixelRatio: { value: Math.min(1.6, dpr) },
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = -4;
  const group = new THREE.Group();
  group.name = 'nebula-starfield';
  group.add(points);
  return {
    id: 'starfield',
    label: '背景星场',
    group,
    materials: [material],
    dispose(): void {
      geometry.dispose();
    },
  };
}
