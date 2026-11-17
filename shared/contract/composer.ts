// L1 组合运行器：固定层序装配、chain 管线仲裁、严格逆序 dispose、诊断输出（INV-7 / §6.3）。
// 纪律：validate() 不创建任何零件实例；init/update/dispose 顺序不可由站点覆盖。
// 本文件的公开接口严格等于架构 §5.4 的 Composer / ComposerDiagnostics，未增删成员。
import {
  chain,
  detectConflicts,
  DISPOSE_ORDER,
  LAYER_ORDER,
  normalizeComposition,
  sortBindings,
  UPDATE_ORDER,
  type CompositionConfig,
  type Conflict,
  type PartBinding,
  type PartClaim,
  type PartLayer,
} from './composition';
import { resolvePart, type LayerBus, type PartInstance } from './parts-registry';
import type { Capability } from './capability';

/** 组合诊断：G4 单测断言的主要信号源（字段与 §5.4 逐字一致）。 */
export interface ComposerDiagnostics {
  conflicts: Conflict[];
  /** 形如 ['narrative:weather-copy', 'scene:micro-scene', ...] */
  initOrder: string[];
  updateOrder: string[];
  /** 严格逆序，供 G4 单测断言 */
  disposeOrder: string[];
  /** dispose 后必须归零 */
  liveListeners: number;
  degraded: boolean;
}

/** 组合运行器契约（§5.4）。 */
export interface Composer {
  readonly layers: CompositionConfig;
  /** 装配前静态冲突检测，不启动任何零件 */
  validate(): Conflict[];
  init(): void;
  update(seconds: number): void;
  dispose(): void;
  readonly diagnostics: ComposerDiagnostics;
}

/** 总线内部形态：在公开契约之外提供统一清理与计数给 Composer 使用（不外泄）。 */
interface ManagedLayerBus extends LayerBus {
  /** 清理全部登记的监听 / 定时器 / 音频节点，并返回剩余登记数（必须为 0）。 */
  releaseAll(): number;
  /** 当前登记的监听 + 定时器数量。 */
  liveCount(): number;
}

/** chain 交换实现的可变引用（总线先于管线建立，故用引用注入）。 */
interface ExchangeRef {
  current: (resource: string, value: unknown) => unknown;
}

/**
 * 创建受控总线。
 * - on/interval 全部登记，releaseAll() 时统一撤销（规则 5：禁止未登记的全局副作用）；
 * - masterGain 惰性创建，无 AudioContext 环境返回 null（零件必须容忍 null）。
 */
function createLayerBus(capability: Capability, exchangeRef: ExchangeRef): ManagedLayerBus {
  const listeners: Array<{ target: EventTarget; type: string; fn: EventListener }> = [];
  const timers: Array<ReturnType<typeof setInterval>> = [];
  const values = new Map<string, unknown>();
  let audioContext: AudioContext | null = null;
  let masterGain: GainNode | null = null;

  const gain = (): GainNode | null => {
    if (masterGain) return masterGain;
    const ctor = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
    if (typeof ctor !== 'function') return null;
    try {
      audioContext = new ctor();
      masterGain = audioContext.createGain();
      return masterGain;
    } catch {
      audioContext = null;
      masterGain = null;
      return null;
    }
  };

  return {
    on(target: EventTarget, type: string, fn: EventListener): void {
      if (!target || typeof target.addEventListener !== 'function') return;
      target.addEventListener(type, fn);
      listeners.push({ target, type, fn });
    },
    interval(fn: () => void, ms: number): void {
      if (typeof fn !== 'function') return;
      timers.push(setInterval(fn, ms));
    },
    exchange(resource: string, value: unknown): unknown {
      return exchangeRef.current(resource, value);
    },
    get<T>(key: string): T | undefined {
      return values.get(key) as T | undefined;
    },
    set<T>(key: string, value: T): void {
      values.set(key, value);
    },
    get capability(): Capability {
      return capability;
    },
    get masterGain(): GainNode | null {
      return gain();
    },
    releaseAll(): number {
      for (const item of listeners) item.target.removeEventListener(item.type, item.fn);
      listeners.length = 0;
      for (const timer of timers) clearInterval(timer);
      timers.length = 0;
      values.clear();
      try {
        masterGain?.disconnect();
      } catch {
        // 已断开或上下文已关闭：静默忽略，绝不影响 dispose。
      }
      try {
        void audioContext?.close();
      } catch {
        // 同上：关闭失败不得打断 dispose。
      }
      audioContext = null;
      masterGain = null;
      return listeners.length + timers.length;
    },
    liveCount(): number {
      return listeners.length + timers.length;
    },
  };
}

/** 已装配零件：layer + ref 唯一标识（同层重复 ref 已在 validate 阶段被拒）。 */
interface MountedPart {
  layer: PartLayer;
  ref: string;
  instance: PartInstance;
}

/**
 * 创建组合运行器。
 * @param config 五层组合描述（缺层按空数组补齐，不修改入参）
 * @param capability 能力快照（由 probeCapability 产出，注入给每个零件）
 */
export function createComposer(config: CompositionConfig, capability: Capability): Composer {
  const layers = normalizeComposition(config);
  const exchangeRef: ExchangeRef = { current: () => undefined };
  const bus = createLayerBus(capability, exchangeRef);

  const diagnostics: ComposerDiagnostics = {
    conflicts: [],
    initOrder: [],
    updateOrder: [],
    disposeOrder: [],
    liveListeners: 0,
    degraded: false,
  };

  const mounted: MountedPart[] = [];
  let chains = new Map<string, MountedPart[]>();
  let initialized = false;
  let disposed = false;

  /** 零件声明的默认 claims（未注册零件返回空，冲突由 validate 报 unregistered-ref）。 */
  const claimDefaultsOf = (ref: string): PartClaim[] => {
    try {
      return (resolvePart(ref).manifest.claims ?? []).slice();
    } catch {
      return [];
    }
  };

  /** 取绑定的有效 claims：绑定点覆盖优先，其次零件声明。 */
  const effectiveClaims = (binding: PartBinding): PartClaim[] => (
    Array.isArray(binding.claims) ? binding.claims.slice() : claimDefaultsOf(binding.ref)
  );

  /** 静态冲突检测（纯函数式调用，不创建实例）。 */
  const runValidate = (): Conflict[] => {
    const conflicts = detectConflicts(layers, (ref) => {
      if (!isRegistered(ref)) return null;
      return { claims: claimDefaultsOf(ref) };
    });
    diagnostics.conflicts = conflicts;
    diagnostics.degraded = conflicts.length > 0;
    return conflicts;
  };

  /** 建立 resource → chain 管线（按 priority 升序），exchange 时串行执行。 */
  const buildChains = (): Map<string, MountedPart[]> => {
    const result = new Map<string, MountedPart[]>();
    for (const layer of LAYER_ORDER) {
      const bindings = sortBindings(layers[layer]);
      const resources = new Set<string>();
      for (const binding of bindings) {
        for (const claim of effectiveClaims(binding)) {
          if (claim.mode === 'chain') resources.add(claim.resource);
        }
      }
      for (const resource of resources) {
        const ordered = chain(bindings, resource, effectiveClaims);
        const stages: MountedPart[] = [];
        for (const binding of ordered) {
          const found = mounted.find((item) => item.layer === layer && item.ref === binding.ref);
          if (found) stages.push(found);
        }
        if (stages.length > 0) result.set(resource, stages);
      }
    }
    return result;
  };

  exchangeRef.current = (resource: string, value: unknown): unknown => {
    const stages = chains.get(resource) ?? [];
    let current = value;
    for (const stage of stages) {
      if (typeof stage.instance.pipe !== 'function') continue;
      current = stage.instance.pipe(current);
    }
    return current;
  };

  return {
    get layers(): CompositionConfig {
      return layers;
    },

    validate(): Conflict[] {
      return runValidate();
    },

    init(): void {
      if (initialized || disposed) return;
      const conflicts = runValidate();
      if (conflicts.length > 0) {
        // 冲突即进入降级态：一个零件都不启动（规则 2：禁止静默覆盖）。
        diagnostics.degraded = true;
        return;
      }
      initialized = true;
      for (const layer of LAYER_ORDER) {
        for (const binding of sortBindings(layers[layer])) {
          const { factory } = resolvePart(binding.ref);
          const store = Object.create(null) as Record<string, unknown>;
          const instance = factory({
            ref: binding.ref,
            options: binding.options ?? {},
            bus,
            store,
            capability,
          });
          mounted.push({ layer, ref: binding.ref, instance });
          diagnostics.initOrder.push(`${layer}:${binding.ref}`);
        }
      }
      chains = buildChains();
    },

    update(seconds: number): void {
      if (!initialized || disposed) return;
      diagnostics.updateOrder = [];
      for (const layer of UPDATE_ORDER) {
        for (const item of mounted) {
          if (item.layer !== layer) continue;
          if (typeof item.instance.update !== 'function') continue;
          item.instance.update(seconds);
          diagnostics.updateOrder.push(`${layer}:${item.ref}`);
        }
      }
      diagnostics.liveListeners = bus.liveCount();
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      diagnostics.disposeOrder = [];

      // dispose 严格逆序：artifact → audio → interaction → scene → narrative；层内降序。
      for (const layer of DISPOSE_ORDER) {
        const layerParts = mounted.filter((item) => item.layer === layer).reverse();
        for (const item of layerParts) {
          try {
            item.instance.dispose();
          } catch (error) {
            // 单个零件 dispose 失败不得阻断其余零件释放，也不得成为未捕获异常（GM-6）。
            // 已知限制：该异常经 console.warn 记录，不写入 ComposerDiagnostics
            //（接口保持 §5.4 原样，不新增字段）。
            console.warn(`[composer] 零件 dispose 抛错并已被捕获：${layer}:${item.ref}`, error);
          }
          diagnostics.disposeOrder.push(`${layer}:${item.ref}`);
        }
      }

      mounted.length = 0;
      chains.clear();
      diagnostics.liveListeners = bus.releaseAll();
    },

    get diagnostics(): ComposerDiagnostics {
      return diagnostics;
    },
  };
}

/** 轻量注册检查（不抛错版本，供 validate 的 lookup 使用）。 */
function isRegistered(ref: string): boolean {
  try {
    resolvePart(ref);
    return true;
  } catch {
    return false;
  }
}
