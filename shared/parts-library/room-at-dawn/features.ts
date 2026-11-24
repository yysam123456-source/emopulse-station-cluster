// room-at-dawn 的 WorldFeature 适配层。
//
// 上游 src/scene/parts/*.js 本来就是“每个文件导出一个 order + build(ctx)”，
// 这里不再重写场景，只把它的装配上下文固定下来，并暴露成统一的
// WorldFeature。room-shell / sky 也按同一契约登记，因此整间房可以被拆成
// 9 件独立挂载的内部件，而不是一个不可分的 L1 黑盒。
//
// 重要边界：
// - 材质 M 由 createRoomFeatureContext() 创建一次，所有 feature 共享；
//   因此 feature 的 disposeRoot 默认为 false，不能各自递归 dispose 共享材质。
// - 这套 feature 只解决“装配”，不包含 GI bake / pipeline；宿主必须自己提供
//   光照或 baked GI。没有 bake 时只能得到占位光照，不能冒充成品渲染。
import { RNG } from './upstream/src/core/rng.js';
import { makeMaterials } from './upstream/src/scene/materials.js';
import { buildRoom } from './upstream/src/scene/room.js';
import { buildSky } from './upstream/src/scene/sky.js';
import * as exteriorPart from './upstream/src/scene/parts/exterior.js';
import * as fixturesPart from './upstream/src/scene/parts/fixtures.js';
import * as bedPart from './upstream/src/scene/parts/bed.js';
import * as deskPart from './upstream/src/scene/parts/desk.js';
import * as plantsPart from './upstream/src/scene/parts/plants.js';
import * as clutterPart from './upstream/src/scene/parts/clutter.js';
import * as decorPart from './upstream/src/scene/parts/decor.js';
import type * as THREE from 'three';
import type { WorldFeature } from '../../parts/world-feature';

/** 上游 part 模块的最小形状：order + label + build(ctx)。 */
interface RoomPartModule {
  readonly order: number;
  readonly label: string;
  build(ctx: RoomFeatureContext): THREE.Object3D | Promise<THREE.Object3D>;
}

export interface RoomFeatureContext {
  readonly M: ReturnType<typeof makeMaterials>;
  readonly rng: RNG;
  readonly scene: THREE.Scene;
  readonly colliders: unknown[];
  readonly animated: Array<(time: number) => void>;
  bake?: unknown;
  roomBox?: unknown;
  glass?: unknown;
}

export interface RoomFeatureOptions {
  readonly scene: THREE.Scene;
  readonly seed?: number;
  /** 只装这些 part；不传=全部。id 用 part 文件名，与上游 ?only= 一致。 */
  readonly only?: readonly string[];
}

export interface RoomFeatureSet {
  readonly context: RoomFeatureContext;
  readonly features: readonly WorldFeature[];
}

const PARTS: ReadonlyArray<{ id: string; module: RoomPartModule }> = [
  { id: 'exterior', module: exteriorPart },
  { id: 'fixtures', module: fixturesPart },
  { id: 'bed', module: bedPart },
  { id: 'desk', module: deskPart },
  { id: 'plants', module: plantsPart },
  { id: 'clutter', module: clutterPart },
  { id: 'decor', module: decorPart },
];

function partFeature(id: string, module: RoomPartModule, ctx: RoomFeatureContext): WorldFeature {
  return {
    id,
    label: module.label,
    order: module.order,
    build: () => module.build(ctx),
    // 共享 M：不要递归 dispose。
    disposeRoot: false,
  };
}

function roomShell(ctx: RoomFeatureContext): WorldFeature {
  return {
    id: 'room-shell',
    label: 'walls',
    order: 0,
    build: () => buildRoom(ctx),
    disposeRoot: false,
  };
}

function sky(): WorldFeature {
  return {
    id: 'sky',
    label: 'sky',
    order: 1,
    build: () => buildSky(),
    disposeRoot: false,
  };
}

/**
 * 创建 room-at-dawn 的完整 feature 集。
 *
 * 注意：context.scene 必须与之后 WorldFeatureHost 的 scene 是同一个；
 * 上游的 colliders / animated 都挂在这个 context 上，换 scene 会断。
 */
export function createRoomFeatureSet(options: RoomFeatureOptions): RoomFeatureSet {
  const ctx: RoomFeatureContext = {
    M: makeMaterials(),
    rng: new RNG(options.seed ?? 20261112),
    scene: options.scene,
    colliders: [],
    animated: [],
  };
  const only = options.only ? new Set(options.only) : null;
  const features: WorldFeature[] = [roomShell(ctx), sky()];
  for (const part of PARTS) {
    if (only && !only.has(part.id)) continue;
    features.push(partFeature(part.id, part.module, ctx));
  }
  return { context: ctx, features };
}

/** 释放共享材质；由 world 宿主在整场销毁时调用一次。 */
export function disposeRoomFeatureSet(set: RoomFeatureSet): void {
  const mats = set.context.M as unknown as Record<string, unknown>;
  for (const value of Object.values(mats)) {
    const mat = value as { dispose?: () => void };
    mat.dispose?.();
  }
}
