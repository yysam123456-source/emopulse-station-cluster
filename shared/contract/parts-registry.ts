// L1 零件注册中心：零件契约 v1 + 私有 store + 受控总线（E2 / E6 / INV-7）。
// 契约：createPart(opts) => { update?(t), dispose() }，与 parts-library/README.md 既有约定一致；
// 既有 7 站站点侧薄包装 PartInstance { update(t), dispose() } 是本契约的子集，无需改写。
import type { PartClaim, PartLayer } from './composition';
import type { Capability } from './capability';

/** 零件来源类型：决定验收口径（Q-N9）。 */
export type PartOrigin = 'copy' | 'equivalent' | 'port';

/**
 * 复用深度（PRD-REUSE §1.3 / ARCHITECTURE-REUSE §3.2）。
 * 判据严格按 PRD：D4 逐字节进入产物；D3 算法结构与参数进入产物；D2 只搬参数表；
 * D1 只照观感自写；D0 原件在库但一字未用。
 */
export type ReuseDepth = 'D0' | 'D1' | 'D2' | 'D3' | 'D4';

/**
 * 单个原件的完整性（REUSE-3）。
 * `path` 一律相对 `shared/parts-library/`，`bytes` 必须与磁盘一致（QA 会逐条 stat 对账）。
 */
export interface ProvenanceFile {
  /** 相对 shared/parts-library/ 的路径 */
  path: string;
  /** 字节数，必须与磁盘一致（REUSE-1 GWT-3） */
  bytes: number;
  /** 建议填；填了就断言 */
  sha256?: string;
  /** 该文件（及其模块集）的归集完整度 */
  completeness: 'complete' | 'partial' | 'absent';
  /** partial 时必填，列出未归集的上游模块 */
  missing?: readonly string[];
}

/**
 * 一个被移植的原件符号（REUSE-1）。
 * `symbol` 必须能在某个 `files[].path` 中以词边界命中，禁止编造。
 */
export interface PortedSymbol {
  /** 原件中的符号名 */
  symbol: string;
  kind: 'function' | 'constant' | 'table' | 'shader' | 'algorithm';
  /** 已接线且影响输出的数值参数；键名 = 原件参数名，且必须是 paramSurface.enumerated 的子集 */
  params?: Readonly<Record<string, number | string | readonly number[]>>;
  /** kind='table' 时的行数（算作参数单元） */
  rows?: number;
  /** 本站源码中的落点（函数名或文件:行），供 QA 反向查证 */
  portedTo?: string;
  /** 降级三问（REUSE-6）：原件技术 / 我们用什么 / 可见后果 */
  downgrade?: string;
}

/**
 * 零件溯源契约（REUSE-1，ARCHITECTURE-REUSE §3.1）。
 *
 * 为什么是**可选**字段：既有 legacy 7 站目录零新增零改动（主理人 D2 裁决），
 * 其溯源走独立文件 `shared/parts-library/legacy-provenance.ts` 的冻结快照；
 * 只有 `shared/parts-library/<part>/part.manifest.ts` 这一侧强制要求填写。
 */
export interface Provenance {
  /** 复用深度 */
  depth: ReuseDepth;
  /** 上游来源；repo/article 至少要有一个能说明出处，accessed 必填 */
  upstream: {
    /** 上游仓库 URL */
    repo?: string;
    /** commit / branch / tag */
    ref?: string;
    /** 公众号文章 id（无仓库时的唯一依据） */
    article?: string;
    /** 访问日期 'YYYY-MM-DD' */
    accessed: string;
  };
  /** 归集文件清单（含字节数与完整度） */
  files: readonly ProvenanceFile[];
  /** 已移植的原件符号（D0 零件必须为空数组：一字未用） */
  ported: readonly PortedSymbol[];
  /** 原件可调参数面（搬运率分母）：enumerated.length 必须 === total，且每个名字可 grep 命中 */
  paramSurface: {
    total: number;
    enumerated: readonly string[];
    /** 怎么数出来的（可复核的一句话） */
    evidence: string;
  };
  /** 许可证（REUSE-7）：spdx 允许 'NOASSERTION'，但必须给证据 */
  license: {
    spdx: string;
    evidence: string;
    /**
     * 许可证证据分级（ARCHITECTURE-REUSE §3.4，主理人 2026-11-18 核准）：
     * L1 有 LICENSE 文件；L2 无 LICENSE 但明示授权；L3 无任何声明（沉默）；L4 明示不授权。
     * T-R02 的 verify-provenance 会硬断言「L3 条目数恰好等于 8」与「L4 必须 blocked」。
     */
    grade?: 'L1' | 'L2' | 'L3' | 'L4';
    /** L4（明示不授权）必须为 true：进隔离区且禁止装站；其余为 false/省略 */
    blocked?: boolean;
  };
  /**
   * 归集完整度（`files` 为空时的唯一表达方式）。
   * 例：dandelion / blow-input / paper-plane 三个缺口零件没有目录、没有归集文件（`files: []`），
   * 只能在这里标 `'absent'`；有 files 的零件用 `files[].completeness` 表达，无需填本字段。
   */
  completeness?: 'complete' | 'partial' | 'absent';
  /** 进产物字节增量估计 */
  sizeHint?: number;
}

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
  /** 溯源契约（REUSE-1）；legacy 7 站走 legacy-provenance.ts，故为可选 */
  provenance?: Provenance;
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
