// nebula —— L1 gl 零件：由星场/尘埃晕/四旋臂/核球四个模块装配。
//
// 原件 Portal 的 35,200 粒子被拆成独立模块，每个模块只 build 自己的 geometry，
// 共享同一组 uniforms（时间、脉冲、色板、缩放）。增删一个模块不需要改粒子着色器。
import type { Lod, PartEnv, PartInstance, PartV2, StageSize, WorldFrame } from '../../stage/contract';
import type { NebulaPalette } from './palette';
import type { NebulaOptions } from './options';
import { createNebulaScene } from './scene';

export type { NebulaPalette } from './palette';
export type { NebulaOptions } from './options';

function create(env: PartEnv, opts: NebulaOptions = {}): PartInstance {
  const nebula = createNebulaScene(env, opts);
  return {
    update(frame: WorldFrame): void {
      nebula.update(frame);
    },
    draw(): void {
      nebula.draw();
    },
    resize(size: StageSize): void {
      nebula.resize(size);
    },
    setLod(next: Lod): void {
      nebula.setLod(next);
    },
    readiness(): number {
      return 1;
    },
    describe(): { sheet: null } {
      return { sheet: null };
    },
    dispose(): void {
      nebula.dispose();
    },
    debug: () => nebula.debug(),
  } as PartInstance & { debug: () => unknown };
}

const BASE: PartV2 = {
  id: 'nebula',
  layer: 'L1',
  channel: 'gl',
  blend: 'source-over',
  space: 'screen',
  costMs: 2.4,
  kb: 4,
  z: 0,
  requires: ['webgl2'],
  expendable: false,
  create: (env) => create(env),
};

export function makePart(opts: NebulaOptions = {}): PartV2 {
  return { ...BASE, create: (env) => create(env, opts) };
}

export const part: PartV2 = makePart();
export default part;
