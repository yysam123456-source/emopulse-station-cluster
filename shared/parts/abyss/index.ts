// abyss —— L0 canvas2d 零件：由 5 个标准水层装配，不再是一个大 draw。
//
// 水层零件：
//   background（深水渐变/暗角/颗粒）→ rays（斜射光柱）→ caustics（水面焦散）
//   → motes（悬浮微粒）→ ripples（指针涟漪）
//
// 每个水层只拿 `AbyssView` 和 frame，不互相持有；增删/调序只动 scene.ts 的数组。
// 这和 temple 的 SceneModule 是同一原则，只是渲染通道从 GL 换成 2D。
import type { Lod, PartEnv, PartInstance, PartV2, StageSize, WorldFrame } from '../../stage/contract';
import type { AbyssPalette } from './palette';
import type { AbyssOptions } from './options';
import { createAbyssScene } from './scene';

export type { AbyssPalette } from './palette';
export type { AbyssOptions } from './options';

function create(env: PartEnv, opts: AbyssOptions = {}): PartInstance {
  const scene = createAbyssScene(env, opts);
  return {
    update(frame: WorldFrame): void {
      scene.update(frame);
    },
    draw(frame: WorldFrame): void {
      scene.draw(frame);
    },
    resize(size: StageSize): void {
      scene.resize(size);
    },
    setLod(next: Lod): void {
      scene.setLod(next);
    },
    readiness(): number {
      return 1;
    },
    describe(): { sheet: null } {
      return { sheet: null };
    },
    dispose(): void {
      scene.dispose();
    },
    debug: () => scene.debug(),
  } as PartInstance & { debug: () => unknown };
}

const BASE: PartV2 = {
  id: 'abyss',
  layer: 'L0',
  channel: 'canvas2d',
  blend: 'source-over',
  space: 'screen',
  costMs: 2.1,
  kb: 3,
  z: 0,
  expendable: false,
  create: (env) => create(env),
};

export function makePart(opts: AbyssOptions = {}): PartV2 {
  return { ...BASE, create: (env) => create(env, opts) };
}

export const part: PartV2 = makePart();
export default part;
