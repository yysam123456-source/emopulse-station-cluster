// L1 零件注册中心：零件契约 v1 + 私有 store + 受控总线（E2 / E6 / INV-7）。
// 契约：createPart(opts) => { update?(t), dispose() }，与 parts-library/README.md 既有约定一致；
// 既有 7 站站点侧薄包装 PartInstance { update(t), dispose() } 是本契约的子集，无需改写。
import type { PartClaim, PartLayer } from './composition';
import type { Capability } from './capability';

/** 零件来源类型：决定验收口径（Q-N9）。 */
export type PartOrigin = 'copy' | 'equivalent' | 'port';

/** 零件声明 —— 每份 part.manifest.ts 一份（SOP §7「零件先入库」）。 */
export interface PartManifest {
  /** 全库唯一 id，小写连字符 */
  id: string;
  layer: PartLayer;
  origin: PartOrigin;
  /** 工厂模块路径（相对仓库根），被站点 bridge 依赖树 import 后经通道 B2 bundle */
  entry: string;
  /** 原件路径（相对 parts-library），仅供对照，永不参与构建；equivalent 件可省略 */
  source?: string;
  contract: 'v1';
  /** 默认资源声明，可被 PartBinding.claims 覆盖 */
  claims?: PartClaim[];
  requires?: 'webgpu' | 'none';
  /** 来源与处置说明，写入 registry/README.md 索引 */
  note?: string;
}

/** 零件实例契约（与 parts-library/README.md 既有约定一致，扩展可选方法）。 */
export interface PartInstance {
  /** 每帧回调，相对秒数；纯数据零件可不实现 */
  update?(seconds: number): void;
  /** 必须实现：释放监听/定时器/节点/画布；由 Composer 逆序调用 */
  dispose(): void;
  /** chain 模式：接收上游输出并返回本零件输出；非 chain 零件可不实现 */
  pipe?(input: unknown): unknown;
}

/** 受控总线：代理一切全局副作用，dispose 时自动清理。 */
export interface LayerBus {
  on(target: EventTarget, type: string, fn: EventListener): void;
  interval(fn: () => void, ms: number): void;
  /** chain 管线传递（同 resource 内按 priority 串联） */
  exchange(resource: string, value: unknown): unknown;
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
  readonly capability: Capability;
  /** 音频层统一主增益，零件只连自己的 GainNode */
  readonly masterGain: GainNode | null;
}

/** 工厂入参：ref / options / bus / 私有 store / capability。 */
export interface PartOptions {
  ref: string;
  options: Record<string, unknown>;
  bus: LayerBus;
  /** 该零件私有命名空间，禁止写入其他零件命名空间 */
  store: Record<string, unknown>;
  capability: Capability;
}

/** 零件工厂契约（契约 v1）。 */
export type PartFactory = (o: PartOptions) => PartInstance;

/** 注册中心条目。 */
export interface PartRegistration {
  manifest: PartManifest;
  factory: PartFactory;
}

/** 私有注册表：模块级单例，禁止外部直接改写。 */
const partStore = new Map<string, PartRegistration>();

/** 零件 id 语法：小写连字符（与站点 slug 同规格）。 */
const PART_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/**
 * 注册一个零件工厂。
 * @throws 当 id 非法、契约版本不是 v1、或工厂不是函数、或重复注册时抛错（禁止静默覆盖）。
 */
export function registerPart(manifest: PartManifest, factory: PartFactory): void {
  if (!manifest || typeof manifest.id !== 'string' || !PART_ID_PATTERN.test(manifest.id)) {
    throw new Error(`[parts-registry] 非法零件 id：${String(manifest?.id)}（要求小写连字符）`);
  }
  if (manifest.contract !== 'v1') {
    throw new Error(`[parts-registry] 零件 ${manifest.id} 的 contract 必须为 'v1'，实际 ${String(manifest.contract)}`);
  }
  if (typeof factory !== 'function') {
    throw new Error(`[parts-registry] 零件 ${manifest.id} 的 factory 必须是函数`);
  }
  if (partStore.has(manifest.id)) {
    throw new Error(`[parts-registry] 零件 ${manifest.id} 重复注册（禁止静默覆盖）`);
  }
  partStore.set(manifest.id, { manifest, factory });
}

/**
 * 按 ref 查表。
 * @throws 未注册时抛错——构建期与装配期都必须显式失败，不允许静默漏装。
 */
export function resolvePart(ref: string): PartRegistration {
  const entry = partStore.get(ref);
  if (!entry) {
    const known = [...partStore.keys()].sort().join(', ') || '(空)';
    throw new Error(`[parts-registry] 未注册的零件 ref：${ref}（已注册：${known}）`);
  }
  return entry;
}

/** 是否已注册（供 detectConflicts 的 lookup 使用，不抛错）。 */
export function hasPart(ref: string): boolean {
  return partStore.has(ref);
}

/** 列出全部已注册零件声明（按 id 字典序，保证输出确定性）。 */
export function listPartManifests(): PartManifest[] {
  return [...partStore.values()]
    .map((entry) => entry.manifest)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** 清空注册中心（仅供单测复位，站点代码禁止调用）。 */
export function clearPartRegistry(): void {
  partStore.clear();
}
