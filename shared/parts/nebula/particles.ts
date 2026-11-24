import * as THREE from 'three';

export interface ParticleSet {
  pos: Float32Array;
  size: Float32Array;
  mix: Float32Array;
  opacity: Float32Array;
  seed: Float32Array;
  index: number;
}

export function createParticleSet(count: number): ParticleSet {
  return {
    pos: new Float32Array(count * 3),
    size: new Float32Array(count),
    mix: new Float32Array(count),
    opacity: new Float32Array(count),
    seed: new Float32Array(count),
    index: 0,
  };
}

export function put(
  set: ParticleSet,
  x: number,
  y: number,
  z: number,
  r: number,
  m: number,
  alpha: number,
  s: number,
): void {
  const i = set.index;
  set.pos[i * 3] = x;
  set.pos[i * 3 + 1] = y;
  set.pos[i * 3 + 2] = z;
  set.size[i] = s;
  set.mix[i] = m;
  set.opacity[i] = alpha;
  set.seed[i] = r;
  set.index += 1;
}

export function finalize(set: ParticleSet): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(set.pos, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(set.size, 1));
  geometry.setAttribute('aMix', new THREE.BufferAttribute(set.mix, 1));
  geometry.setAttribute('aOpacity', new THREE.BufferAttribute(set.opacity, 1));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(set.seed, 1));
  geometry.computeBoundingSphere();
  return geometry;
}
