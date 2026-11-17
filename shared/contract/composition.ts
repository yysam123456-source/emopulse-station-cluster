// L1 五层组合描述：把 scene / interaction / artifact / audio / narrative 的差异
// 全部收敛到配置层（E2 / E6 / INV-7 / INV-8）。既有 7 站不提供 composition，零回归。
// 单向依赖约定：composition.ts 不 import 任何其他新增 L1 模块（PartClaim 在此定义，
// parts-registry.ts 反向 import 本文件的 PartClaim），避免循环依赖。

/** 五层固定枚举 —— 差异全部落在配置里（E2 / INV-8）。 */
export type PartLayer = 'scene' | 'interaction' | 'artifact' | 'audio' | 'narrative';

/**
 * 装配 / 更新层序（固定，不可由站点覆盖）：
 * narrative(纯数据/文案/FSM定义) → scene(建场景/画布) → interaction(绑事件/FSM)
 * → audio(音景，需 user gesture 解锁) → artifact(凭证导出，最后消费前面产物)。
 * dispose 严格逆序：artifact → audio → interaction → scene → narrative。
 */
export const LAYER_ORDER: readonly PartLayer[] = [
  'narrative', 'scene', 'interaction', 'audio', 'artifact',
] as const;

/** 每帧更新层序（narrative 无 update）。 */
export const UPDATE_ORDER: readonly PartLayer[] = [
  'scene', 'interaction', 'audio', 'artifact',
] as const;

/** dispose 层序：严格逆序，保证依赖方先于被依赖方释放。 */
export const DISPOSE_ORDER: readonly PartLayer[] = [
  'artifact', 'audio', 'interaction', 'scene', 'narrative',
] as const;

/** 资源声明模式合法取值。 */
export type ClaimMode = 'exclusive' | 'chain' | 'shared';

/** 资源声明：解决「同层零件互相踩」的仲裁基础（E6 / INV-7）。 */
export interface PartClaim {
  /** 资源标识，建议命名域：'postprocess' | 'audio:master' | 'canvas:stage' | 'fsm:main' | 'timer:sit' */
  resource: string;
  /**
   * exclusive：同层内该 resource 只能有 1 个零件声明，重复即装配失败（不静默覆盖）
   * chain    ：允许多个，按 priority 升序串成管线，经 LayerBus.exchange 传递上游输出
   * shared   ：只读共享，多个零件可并存，禁止写入
   */
  mode: ClaimMode;
}

/** 单个零件绑定。 */
export interface PartBinding {
  /** 指向零件注册中心的 part id（必须命中 registry，否则装配期报错） */
  ref: string;
  enabled: boolean;
  /** 同层 init/update 顺序，升序；缺省 0；同值时按 ref 字典序保证确定性 */
  order?: number;
  /** chain 模式管线优先级，升序；缺省 0 */
  priority?: number;
  /** 覆盖零件的默认 claims（用于按站点收紧） */
  claims?: PartClaim[];
  /** 零件私有参数，透传给 PartFactory */
  options?: Record<string, unknown>;
}

/** 五层组合描述：每层一个绑定数组，可为空数组。 */
export type CompositionConfig = Record<PartLayer, PartBinding[]>;

/** 冲突检测结果：非空即进入降级态，不启动零件。 */
export interface Conflict {
  layer: PartLayer;
  resource: string;
  refs: string[];
  reason: 'duplicate-exclusive' | 'unregistered-ref' | 'duplicate-ref' | 'invalid-claim';
}

/** 冲突原因合法取值（供诊断输出与测试断言）。 */
export const CONFLICT_REASONS: readonly Conflict['reason'][] = [
  'duplicate-exclusive', 'unregistered-ref', 'duplicate-ref', 'invalid-claim',
] as const;

/** 资源声明模式合法取值。 */
export const CLAIM_MODES: readonly ClaimMode[] = ['exclusive', 'chain', 'shared'] as const;

/** 冲突检测所需的零件查表回调：命中返回默认 claims，未命中返回 null。 */
export type PartClaimLookup = (ref: string) => { claims: readonly PartClaim[] } | null;

/** 生成五层皆空的组合描述（缺省值，供 mountSite 在无 composition 时兜底）。 */
export function createEmptyComposition(): CompositionConfig {
  return {
    narrative: [],
    scene: [],
    interaction: [],
    audio: [],
    artifact: [],
  };
}

/** 把可能缺层的部分配置补齐为完整 CompositionConfig（不修改入参）。 */
export function normalizeComposition(input?: Partial<CompositionConfig> | null): CompositionConfig {
  const base = createEmptyComposition();
  if (!input) return base;
  for (const layer of LAYER_ORDER) {
    const bindings = input[layer];
    base[layer] = Array.isArray(bindings) ? bindings.slice() : [];
  }
  return base;
}

/** 层内绑定排序：order 升序，同值按 ref 字典序（保证构建/装配确定性，K9）。 */
export function sortBindings(bindings: readonly PartBinding[]): PartBinding[] {
  return bindings
    .filter((binding) => binding && binding.enabled !== false)
    .slice()
    .sort((a, b) => {
      const orderDiff = (a.order ?? 0) - (b.order ?? 0);
      if (orderDiff !== 0) return orderDiff;
      return a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0;
    });
}

/** 取某层里声明了指定 resource 且为 chain 模式的绑定，按 priority 升序（chain 管线）。 */
export function chain(
  bindings: readonly PartBinding[],
  resource: string,
  claimsOf?: (binding: PartBinding) => readonly PartClaim[],
): PartBinding[] {
  return bindings
    .filter((binding) => {
      if (!binding || binding.enabled === false) return false;
      const claims = claimsOf ? claimsOf(binding) : (binding.claims ?? []);
      return claims.some((claim) => claim.resource === resource && claim.mode === 'chain');
    })
    .slice()
    .sort((a, b) => {
      const priorityDiff = (a.priority ?? 0) - (b.priority ?? 0);
      if (priorityDiff !== 0) return priorityDiff;
      return a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0;
    });
}

/** 取绑定的有效 claims：绑定级覆盖优先，其次零件声明，最后空数组。 */
export function effectiveClaims(binding: PartBinding, defaults: readonly PartClaim[] = []): PartClaim[] {
  if (Array.isArray(binding.claims)) return binding.claims.slice();
  return defaults.slice();
}

/**
 * 静态冲突检测（不创建任何零件实例）：见 §6.3 冲突仲裁七条规则中的 1/2/6。
 * 规则：
 *  1. ref 未命中注册中心 → unregistered-ref；
 *  2. 同层出现重复 ref → duplicate-ref；
 *  3. claim.mode 非法 / resource 为空 → invalid-claim；
 *  4. 同层同一 resource 出现 ≥2 个 exclusive → duplicate-exclusive（禁止静默覆盖）。
 */
export function detectConflicts(config: CompositionConfig, lookup: PartClaimLookup): Conflict[] {
  const conflicts: Conflict[] = [];

  for (const layer of LAYER_ORDER) {
    const bindings = sortBindings(config[layer] ?? []);
    const seenRefs = new Set<string>();
    const exclusiveOwner = new Map<string, string[]>();

    for (const binding of bindings) {
      if (typeof binding.ref !== 'string' || binding.ref.length === 0) {
        conflicts.push({ layer, resource: '', refs: [String(binding.ref)], reason: 'invalid-claim' });
        continue;
      }
      if (seenRefs.has(binding.ref)) {
        conflicts.push({ layer, resource: '', refs: [binding.ref], reason: 'duplicate-ref' });
        continue;
      }
      seenRefs.add(binding.ref);

      const manifest = lookup(binding.ref);
      if (!manifest) {
        conflicts.push({ layer, resource: '', refs: [binding.ref], reason: 'unregistered-ref' });
        continue;
      }

      const claims = effectiveClaims(binding, manifest.claims);
      for (const claim of claims) {
        if (!claim || typeof claim.resource !== 'string' || claim.resource.length === 0
          || !CLAIM_MODES.includes(claim.mode)) {
          conflicts.push({ layer, resource: claim?.resource ?? '', refs: [binding.ref], reason: 'invalid-claim' });
          continue;
        }
        if (claim.mode !== 'exclusive') continue;
        const owners = exclusiveOwner.get(claim.resource);
        if (owners) owners.push(binding.ref);
        else exclusiveOwner.set(claim.resource, [binding.ref]);
      }
    }

    for (const [resource, refs] of exclusiveOwner) {
      if (refs.length > 1) {
        conflicts.push({ layer, resource, refs: refs.slice(), reason: 'duplicate-exclusive' });
      }
    }
  }

  return conflicts;
}
