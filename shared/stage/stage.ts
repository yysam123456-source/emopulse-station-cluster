// 装配运行时 —— 把一组 PartV2 编成一条可跑的画面。
//
// 这里只做五件事，每件都对应一条验收项：
//   1. 校验：id 唯一 / 层合法 / L4 唯一 / 混合模式白名单 / costMs 是数
//   2. 排序：L0→L5 固定，层内 z 升序、z 同值按 id 字典序（**确定性**）
//   3. 降档：总开销超预算 → 全部降到 low 而不是跳过（**画质与结构解耦**）
//   4. 绘制：逐件 save → 设 globalCompositeOperation → draw → restore（**复合效果**）
//   5. 记账：degraded[] 与 stats 对外可见（**不许静默降级**）
//
// 刻意不做的事：零件之间不传递任何东西。要「复合」，靠层叠加与混合模式，不靠耦合。
import {
  BLEND_MODES,
  LAYER_ORDER,
  StageError,
  type AudioState,
  type BiomeId,
  type BlendMode,
  type DegradedEntry,
  type Lod,
  type PartChannel,
  type PartInstance,
  type PartV2,
  type Rect,
  type StageSize,
  type WorldFrame,
} from './contract';
import { createWorld, hashSeed, planBudget, type World } from './world';

/** 默认帧预算（毫秒）。16.7ms 一帧里留给「我们自己的零件」的额度。 */
export const DEFAULT_BUDGET_MS = 8;

/** 默认 DPR 上限。超过 2 的收益肉眼不可见，成本翻倍。 */
export const DEFAULT_MAX_DPR = 2;

/** 装配选项。 */
export interface StageOptions {
  /** 主 2D 画布（必须） */
  readonly canvas: HTMLCanvasElement;
  /** GL 画布（有 L1 体素零件时必填） */
  readonly glCanvas?: HTMLCanvasElement | null;
  readonly parts: readonly PartV2[];
  readonly biome: BiomeId;
  readonly seed: number;
  readonly budgetMs?: number;
  readonly maxDpr?: number;
  /**
   * 自动降分辨率的下限（0.55–1，默认 0.55）。
   * 纸面类站点（/license）用它保住可读清晰度：预算再紧也不把纸压成糊图。
   */
  readonly minRenderScale?: number;
  readonly reducedMotion?: boolean;
  /** 启动超时（毫秒）。超过后壳应放行首帧可用的 L0 画面并显示一句原因。 */
  readonly bootTimeoutMs?: number;
  /**
   * 是否允许零件申报 `defer`。产品页必须 true（默认）。
   * Node 假 DOM/组合测试可传 false：那里没有真实 rAF/时钟，延后挂载只会让断言少画一件。
   */
  readonly defer?: boolean;
  /**
   * GL 层**合成进主 2D 画布**时用的 `globalCompositeOperation`。
   *
   * 缺省取 gl 零件自己声明的 `blend`；显式传入时必须是 `BLEND_MODES` 白名单里的值，
   * 否则构造期抛 `E_BAD_BLEND`（白名单挡住 `copy` / `destination-in` 这类会清空整块画布的值）。
   *
   * 语义变更（2026-11-18 T18）：它以前是 `glCanvas.style.mixBlendMode`，靠 CSS 把 GL 画布
   * **压在** 2D 画布之上。那条路有个致命后果：GL 是不透明的，它会把 L2/L3/L4/L5 全部挡住
   * （`/still` 不只是 L0 看不见，气泡、墨、后处理、UI 都看不见）。现在改成按层序**就地合成**，
   * GL 画布只负责"被读走"，不再负责"被看见"。
   */
  readonly glBlend?: BlendMode;
  /** 取当前时间的函数（测试注入，保证确定性） */
  readonly now?: () => number;
}

/** 运行期统计。 */
export interface StageStats {
  /** 平滑后的帧率 */
  readonly fps: number;
  /** 最近一帧的零件总耗时（毫秒） */
  readonly cpuMs: number;
  /** 平滑后的帧间隔（毫秒）—— 这是唯一能看见真实瓶颈的数，不是 static costMs */
  readonly frameMs: number;
  /** 配置声明的总开销（毫秒） */
  readonly budgetCostMs: number;
  /** 配置申报的静态总开销（毫秒）—— 与 budgetCostMs 分开，避免把实测当申报 */
  readonly declaredCostMs: number;
  readonly budgetMs: number;
  /** 最近一帧实际绘制的零件数（含被挂起前） */
  readonly drawn: number;
  readonly frames: number;
  /** 当前渲染缩放（1 = 原生 DPR；<1 = 自动降分辨率） */
  readonly renderScale: number;
  /** 所有在画零件的就绪度最小值（0..1） */
  readonly readiness: number;
  /** 未就绪零件上报的第一句可见文案（没有则空串） */
  readonly readinessLabel: string;
  /** 是否有未就绪零件申报「允许挡住启动遮罩」（只有 L1 world 可以） */
  readonly readinessBlocking: boolean;
  /** 装配开始时刻（与 StageOptions.now 同源） */
  readonly bootStartedAt: number;
  /** 启动超时阈值（毫秒） */
  readonly bootTimeoutMs: number;
  /** 是否已超过启动超时 */
  readonly bootTimedOut: boolean;
}

/** 几何快照（壳用它来摆 DOM，不再自己抄一套公式）。 */
export interface StageGeometry {
  /** 纸矩形；无纸站点为 null */
  readonly sheet: Rect | null;
  /** world 通道的合成矩形（subject 空间 = 纸；否则整屏） */
  readonly world: Rect;
}

/** 装配好的舞台。 */
export interface Stage {
  readonly degraded: readonly DegradedEntry[];
  readonly stats: StageStats;
  /** 实际绘制顺序（零件 id） */
  readonly order: readonly string[];
  readonly world: World;
  /** 当前几何（纸/世界矩形），壳可直接读 */
  readonly geometry: StageGeometry;
  /** 推进并绘制一帧 */
  frame(nowMs?: number): void;
  start(): void;
  stop(): void;
  readonly running: boolean;
  resize(width: number, height: number, dpr?: number): void;
  setBudget(budgetMs: number): void;
  setAudio(audio: AudioState | null): void;
  /** 无障碍降级：传给 world，零件每帧读 frame.reducedMotion */
  setReducedMotion(value: boolean): void;
  /** 手动渲染缩放（0.55..1）；调用后默认关闭自动缩放，避免和用户选择打架 */
  setRenderScale(scale: number): void;
  /** 自动分辨率开关（菜单 Quality 用） */
  setAutoScale(enabled: boolean): void;
  /** 对零件说一句动词（release / sit / ripple / reset）；不认识的静默忽略 */
  cue(verb: string): void;
  /** 写入归一化指针（0..1），测试与桥接共用 */
  setPointer(nx: number, ny: number, down?: boolean): void;
  dispose(): void;
}

/** 内部：装配后的一件零件。 */
interface Mounted {
  readonly def: PartV2;
  readonly channel: PartChannel;
  readonly blend: string;
  readonly space: 'screen' | 'subject';
  /** 延后零件在首帧后才会填；这里不能是 readonly */
  instance: PartInstance | null;
  /** 该零件被声明为延后构造；instance 为 null 且 deferred=true 时不是「不可用」 */
  readonly deferred: boolean;
  lod: Lod;
  suspended: boolean;
  broken: boolean;
}

/**
 * 校验零件清单。任何一条不满足都抛 StageError，**不做静默容忍**。
 *
 * @param parts 零件定义
 */
export function validateParts(parts: readonly PartV2[]): void {
  const seen = new Set<string>();
  let postCount = 0;
  let glCount = 0;

  for (const part of parts) {
    if (!part || typeof part.id !== 'string' || part.id.length === 0) {
      throw new StageError('E_DUP_PART_ID', String(part && part.id), 'id 必须是非空字符串');
    }
    if (seen.has(part.id)) {
      throw new StageError('E_DUP_PART_ID', part.id, '同 id 零件重复装配（后者会覆盖前者，故直接报错）');
    }
    seen.add(part.id);

    if (!LAYER_ORDER.includes(part.layer)) {
      throw new StageError('E_BAD_LAYER', part.id, `层必须是 L0..L5，收到 ${String(part.layer)}`);
    }
    if (part.layer === 'L4') {
      postCount += 1;
      if (postCount > 1) {
        throw new StageError('E_MULTI_POST', part.id, 'L4 后处理整场唯一（两条后处理链会互相抹掉像素）');
      }
    }
    const channel = part.channel ?? 'canvas2d';
    if (channel === 'gl' || channel === 'world') {
      glCount += 1;
      if (glCount > 1) {
        throw new StageError('E_MULTI_GL', part.id, 'GL 通道整场唯一（gl 与 world 共用同一块画布/上下文）');
      }
    }
    if (part.space === 'subject' && channel !== 'world') {
      throw new StageError('E_PART_THROW', part.id, "space:'subject' 只对 channel:'world' 有意义");
    }
    if (part.blend !== undefined && !BLEND_MODES.includes(part.blend)) {
      throw new StageError('E_BAD_BLEND', part.id, `混合模式不在白名单：${String(part.blend)}`);
    }
    if (typeof part.costMs !== 'number' || !Number.isFinite(part.costMs) || part.costMs < 0) {
      throw new StageError('E_BAD_COST', part.id, `costMs 必须是有限非负数，收到 ${String(part.costMs)}`);
    }
    if (typeof part.create !== 'function') {
      throw new StageError('E_PART_THROW', part.id, 'create 必须是函数');
    }
  }
}

/**
 * 排序零件：层序固定，层内 z 升序，z 同值按 id 字典序。
 *
 * @param parts 零件定义
 * @returns 新数组（不改入参）
 */
export function sortParts(parts: readonly PartV2[]): readonly PartV2[] {
  return parts.slice().sort((a, b) => {
    const layerDiff = LAYER_ORDER.indexOf(a.layer) - LAYER_ORDER.indexOf(b.layer);
    if (layerDiff !== 0) return layerDiff;
    const zDiff = (a.z ?? 0) - (b.z ?? 0);
    if (zDiff !== 0) return zDiff;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * 探测运行时能力，供 requires 过滤。
 *
 * ★ 绝不能在**主画布**上试 `getContext('webgl2')`（2026-11-18 P0 白屏的根因）：
 *   Canvas 只有一种上下文模式。在真浏览器里 `getContext('webgl2')` 会成功并锁定模式，
 *   随后 `getContext('2d')` **恒返回 null** —— 于是每一个预览页/站点都在构造期抛
 *   `主画布拿不到 2d 上下文`，页面白屏。Node 里的假画布对 'webgl2' 一律返回 null，
 *   所以这个 bug 在测试里是隐形的（假绿），只有按规范写严格的假画布才复现。
 *   现在的做法：用一次性探针画布探测 WebGL2；拿不到 `document` 就当作「探测不到」，
 *   不抛错、不影响 2D 主路径。
 *
 * @returns 能力集合
 */
function detectCapabilities(): Set<string> {
  const caps = new Set<string>();
  try {
    const doc = (globalThis as unknown as {
      document?: { createElement(tag: string): { getContext(id: string): unknown } };
    }).document;
    if (doc && typeof doc.createElement === 'function') {
      const probe = doc.createElement('canvas');
      const gl2 = probe.getContext('webgl2');
      if (gl2) caps.add('webgl2');
    }
    const gpu = (globalThis as unknown as { navigator?: { gpu?: unknown } }).navigator?.gpu;
    if (gpu) caps.add('webgpu');
    const md = (globalThis as unknown as { navigator?: { mediaDevices?: unknown } }).navigator?.mediaDevices;
    if (md) caps.add('mic');
  } catch {
    // 探测失败按「不支持」处理，不让它阻断装配
  }
  caps.add('pointer');
  return caps;
}

/**
 * 装配运行时。
 *
 * @param options 装配选项
 * @returns 舞台
 */
export function createStage(options: StageOptions): Stage {
  validateParts(options.parts);

  const now = options.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  const maxDpr = options.maxDpr && options.maxDpr > 0 ? options.maxDpr : DEFAULT_MAX_DPR;
  const ordered = sortParts(options.parts);

  // 顺序很重要：**先**锁死主画布的 2d 模式，**再**探测能力。
  // 反过来的话能力探测会把画布锁成 webgl2（见 detectCapabilities 的注释），主画布就再也拿不到 2d。
  // 拆成两步：TS 在嵌套函数里不保留 `if (!x) throw` 的收窄，必须换成非空别名，
  // 否则后面几十处 ctx.xxx 全部报 possibly null。
  const maybeCtx = options.canvas.getContext('2d') as CanvasRenderingContext2D | null;
  if (!maybeCtx) throw new StageError('E_PART_THROW', '<stage>', '主画布拿不到 2d 上下文');
  const ctx: CanvasRenderingContext2D = maybeCtx;
  const caps = detectCapabilities();

  let budgetMs = options.budgetMs && options.budgetMs > 0 ? options.budgetMs : DEFAULT_BUDGET_MS;
  // 初始尺寸优先取 CSS 尺寸；拿不到才退回属性值。属性值是设备像素，直接当 CSS 尺寸会放大 dpr 倍。
  const canvasAny = options.canvas as unknown as { clientWidth?: number; clientHeight?: number };
  let width = canvasAny.clientWidth && canvasAny.clientWidth > 0 ? canvasAny.clientWidth : options.canvas.width || 1;
  let height = canvasAny.clientHeight && canvasAny.clientHeight > 0 ? canvasAny.clientHeight : options.canvas.height || 1;
  let dpr = Math.min(
    (globalThis as unknown as { devicePixelRatio?: number }).devicePixelRatio ?? 1,
    maxDpr,
  );
  /** 用户/自动降分辨率系数（1 = 原生；与 dpr 相乘后才是真正的像素比）。 */
  let renderScale = 1;
  /** 本场自动降分辨率的下限；默认保持历史行为 0.55。 */
  const minRenderScale = Math.min(1, Math.max(0.55, options.minRenderScale ?? 0.55));
  let autoScale = true;

  // ---- 几何：先让 L0 底材报出纸矩形，world 通道才能在 create 前知道画在哪 ----
  let sheet: Rect | null = null;
  for (const def of ordered) {
    if (def.layer !== 'L0' || typeof def.describe !== 'function') continue;
    try {
      const g = def.describe({ w: width, h: height, dpr }, options.biome);
      if (g?.sheet && g.sheet.w > 0 && g.sheet.h > 0) sheet = g.sheet;
    } catch {
      // 描述失败不阻断装配：没有纸就按整屏处理
    }
  }
  const wantsSubject = ordered.some((p) => (p.channel ?? 'canvas2d') === 'world' && p.space === 'subject');
  let worldRect: Rect = wantsSubject && sheet
    ? { x: sheet.x, y: sheet.y, w: sheet.w, h: sheet.h }
    : { x: 0, y: 0, w: width, h: height };
  const geometry: StageGeometry = {
    get sheet() { return sheet; },
    get world() { return worldRect; },
  };

  // GL 画布只在真的有 gl/world 零件时才需要
  const glCanvas = options.glCanvas ?? null;
  const hasGl = ordered.some((p) => {
    const channel = p.channel ?? 'canvas2d';
    return channel === 'gl' || channel === 'world';
  });
  if (hasGl && !glCanvas) {
    const offender = ordered.find((p) => {
      const channel = p.channel ?? 'canvas2d';
      return channel === 'gl' || channel === 'world';
    }) as PartV2;
    throw new StageError('E_PART_THROW', offender.id, '存在 gl/world 通道零件，但未提供 glCanvas');
  }
  /**
   * 底件不变量：**非空装配必须有至少一件 L0 或 L1**。
   *
   * 为什么需要：`renderFrame` **从不 `clearRect`** —— 整幅画面靠一件不透明底件每帧铺满。
   * 少了底件，切换画面时会残留上一帧像素（气泡尾巴留在天上），而**所有门都是绿的**。
   *
   * 两个必须守住的细节（写错会红一片）：
   * ① **空装配必须放行**（`empty` preset、以及过滤掉 gl 后的空列表走同一条路）；
   * ② 检查放在**所有既有校验之后**，否则会抢走 `E_MULTI_POST` / `E_DUP_PART_ID` / `E_BAD_BLEND`
   *    的抛点，`stage-smoke §3` 那三条会红。
   *
   * 文案要诚实：只说"L0/L1 全空"，**不写"底不透明"** —— 那半个不变量无法机械校验，
   * 写上去就是一句假承诺。
   */
  if (ordered.length > 0 && !ordered.some((p) => p.layer === 'L0' || p.layer === 'L1')) {
    throw new StageError('E_NO_BASE', '<stage>', 'L0/L1 全空，画面会残留上一帧像素（stage 不 clearRect）');
  }

  // GL 层不再靠 CSS 叠加（见 StageOptions.glBlend 的注释）。这里只做白名单校验。
  if (options.glBlend !== undefined && !BLEND_MODES.includes(options.glBlend)) {
    throw new StageError('E_BAD_BLEND', '<stage>', `glBlend 不在白名单：${String(options.glBlend)}`);
  }
  /**
   * GL 层合成进主画布时用的 blend：显式传入优先，否则用 gl 零件自己声明的 blend。
   * 装配期算一次（gl 零件整场唯一，见 validateParts 的 E_MULTI_GL）。
   */
  const glComposite: GlobalCompositeOperation = (() => {
    if (options.glBlend) return options.glBlend as GlobalCompositeOperation;
    const glPart = ordered.find((p) => {
      const channel = p.channel ?? 'canvas2d';
      return channel === 'gl' || channel === 'world';
    });
    return (glPart?.blend ?? 'source-over') as GlobalCompositeOperation;
  })();

  const world = createWorld({
    seed: options.seed,
    biome: options.biome,
    width,
    height,
    dpr,
    reducedMotion: options.reducedMotion === true,
  });

  const degraded: DegradedEntry[] = [];
  const mounted: Mounted[] = [];
  /** 启动时钟：从装配开始算，不是首帧；超时后壳放行已有底材。 */
  const bootStartedAt = now();
  const bootTimeoutMs = options.bootTimeoutMs && options.bootTimeoutMs > 0 ? options.bootTimeoutMs : 8000;
  const deferEnabled = options.defer !== false;
  let deferredStarted = false;
  let frame = 0;
  let drawn = 0;
  let cpuMs = 0;
  let fps = 0;
  let frameMs = 0;
  let running = false;
  let disposed = false;
  let rafId: number | null = null;
  let lastNow = -1;
  let pendingScale: number | null = null;
  let slowFrames = 0;
  let fastFrames = 0;
  let lastScaleAt = 0;

  /**
   * 逐件实测耗时（EWMA）。`def.costMs` 是装配期的静态估算，用来决定「装不装/降不降档」；
   * 这里回答「装完以后实际是多少」——它是预算红警与后续 governor 的唯一可信口径。
   * 键是零件 id；同一 id 不允许重复装配，所以不需要按实例分桶。
   */
  const measuredMs = new Map<string, number>();
  const EWMA_ALPHA = 0.2;
  function recordCost(id: string, sampleMs: number): void {
    const prev = measuredMs.get(id);
    const next = prev === undefined ? sampleMs : prev * (1 - EWMA_ALPHA) + sampleMs * EWMA_ALPHA;
    measuredMs.set(id, next);
  }

  const stats: StageStats = {
    get fps() { return fps; },
    get cpuMs() { return cpuMs; },
    get frameMs() { return frameMs; },
    get budgetCostMs() { return totalCost(); },
    get declaredCostMs() { return declaredCost(); },
    get budgetMs() { return budgetMs; },
    get drawn() { return drawn; },
    get frames() { return frame; },
    get renderScale() { return renderScale; },
    get readiness() { return readinessSnapshot().value; },
    get readinessLabel() { return readinessSnapshot().label; },
    get readinessBlocking() { return readinessSnapshot().blocking; },
    get bootStartedAt() { return bootStartedAt; },
    get bootTimeoutMs() { return bootTimeoutMs; },
    get bootTimedOut() { return now() - bootStartedAt > bootTimeoutMs; },
  };

  /**
   * 聚合所有在画零件的就绪度。
   *
   * 规则：
   *   · 只有未挂载的 deferred 零件不算「不可用」，也不阻塞；
   *   · 只有 L1 world 可以申报 blocking，L0/L2–L5 的 blocking 一律忽略；
   *   · label 取第一件未就绪零件上报的文案，供壳直接显示。
   */
  function readinessSnapshot(): { value: number; label: string; blocking: boolean } {
    let value = 1;
    let label = '';
    let blocking = false;
    for (const m of mounted) {
      if (m.suspended || m.broken || !m.instance) continue;
      if (m.deferred && !m.instance) continue;
      const detail = m.instance.readinessInfo?.();
      const raw = typeof detail?.value === 'number'
        ? detail.value
        : m.instance.readiness?.();
      const v = typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 1;
      value = Math.min(value, v);
      if (v < 1) {
        if (!label && detail?.label) label = detail.label;
        if (m.def.layer === 'L1' && detail?.blocking === true) blocking = true;
      }
    }
    return { value, label, blocking };
  }

  /**
   * 按声明计算总开销（不受降档影响，反映配置本身）。
   *
   * @returns 毫秒
   */
  function declaredCost(): number {
    let sum = 0;
    for (const m of mounted) sum += m.def.costMs;
    return sum;
  }

  function totalCost(): number {
    let sum = 0;
    for (const m of mounted) {
      // 有实测就用实测；还没跑过帧（或假 ctx 计时为 0）的零件退回静态估算，
      // 否则首帧 dbg 是 0、smoke 的申报告警也会被误读成“没有成本”。
      const measured = measuredMs.get(m.def.id);
      sum += measured !== undefined && measured > 0 ? measured : m.def.costMs;
    }
    return sum;
  }

  /**
   * 解析能力过滤 + 预算方案，并把结论写进 degraded。
   *
   * @returns void
   */
  function replan(): void {
    degraded.length = 0;
    // 构造期自报 `E_UNSUPPORTED` 的零件：instance 为 null，但它们的 def.requires 可能是满足的
    // （例如 fake DOM 里 webgl2 探针为真、真实画布事件却不可用）。replan 必须把这类零件
    // 重新记成 unsupported，否则 `degraded` 被清空后它会**静默消失**，而 drawn 又少一件。
    for (const m of mounted) {
      if (m.instance !== null || m.broken || (m.deferred && !m.broken)) continue;
      m.suspended = true;
      degraded.push({
        id: m.def.id,
        layer: m.def.layer,
        reason: 'unsupported',
        detail: '没有可用实例（环境缺少该零件需要的画布/能力）',
      });
    }
    // 能力不足的直接标记 unsupported，不构造
    for (const m of mounted) {
      const requires = m.def.requires;
      if (requires && requires.some((cap) => !caps.has(cap))) {
        m.suspended = true;
        if (degraded.some((entry) => entry.id === m.def.id && entry.reason === 'unsupported')) continue;
        degraded.push({
          id: m.def.id,
          layer: m.def.layer,
          reason: 'unsupported',
          detail: `缺少能力：${requires.filter((c) => !caps.has(c)).join(',')}`,
        });
      }
    }

    const candidates = mounted.filter((m) => !m.suspended && !m.broken);
    const lodCapable = new Set<string>(
      candidates.filter((m) => m.instance && typeof m.instance.setLod === 'function').map((m) => m.def.id),
    );
    const plan = planBudget(
      candidates.map((m) => ({
        id: m.def.id,
        layer: m.def.layer,
        costMs: m.def.costMs,
        expendable: m.def.expendable === true,
        hasLod: lodCapable.has(m.def.id),
      })),
      budgetMs,
      lodCapable,
    );

    if (plan.over) {
      for (const m of candidates) {
        if (lodCapable.has(m.def.id) && m.lod !== 'low') {
          try {
            m.instance?.setLod?.('low');
            m.lod = 'low';
          } catch {
            m.broken = true;
          }
          degraded.push({
            id: m.def.id,
            layer: m.def.layer,
            reason: 'budget',
            detail: `总开销 ${plan.totalCostMs.toFixed(2)}ms > 预算 ${budgetMs.toFixed(2)}ms，已降 low`,
          });
        }
      }
      for (const id of plan.suspend) {
        const m = mounted.find((item) => item.def.id === id);
        if (!m) continue;
        m.suspended = true;
        degraded.push({
          id: m.def.id,
          layer: m.def.layer,
          reason: 'suspended',
          detail: '降档后仍超预算，且该零件声明 expendable',
        });
      }
    }
  }

  // ---- 构造实例 ----
  for (let i = 0; i < ordered.length; i += 1) {
    const def = ordered[i];
    const channel: PartChannel = def.channel ?? 'canvas2d';
    const space: 'screen' | 'subject' = channel === 'world' ? (def.space ?? 'screen') : 'screen';

    const requires = def.requires;
    const missing = requires ? requires.filter((cap) => !caps.has(cap)) : [];
    if (missing.length > 0) {
      mounted.push({
        def,
        channel,
        blend: def.blend ?? 'source-over',
        space,
        instance: null,
        deferred: false,
        lod: 'high',
        suspended: true,
        broken: false,
      });
      degraded.push({
        id: def.id,
        layer: def.layer,
        reason: 'unsupported',
        detail: `缺少能力：${missing.join(',')}`,
      });
      continue;
    }

    // 延后构造：L0 底材必须在首帧前；L1 只有在已有 L0 底材时才允许延后（/koi 的纸面先出）。
    if (def.defer && deferEnabled && def.layer === 'L0') {
      throw new StageError('E_PART_THROW', def.id, 'defer 不能用于 L0 底材：首帧没有纸/水会露黑');
    }
    if (def.defer && deferEnabled && def.layer === 'L1' && !ordered.some((p) => p.layer === 'L0')) {
      throw new StageError('E_PART_THROW', def.id, 'L1 defer 需要同场有 L0 底材，否则首帧没有可画内容');
    }
    if (def.defer && deferEnabled) {
      mounted.push({
        def,
        channel,
        blend: def.blend ?? 'source-over',
        space,
        instance: null,
        deferred: true,
        lod: 'high',
        suspended: false,
        broken: false,
      });
      continue;
    }

    let instance: PartInstance | null = null;
    // 异步失败要落进 degraded；create() 还没返回时先攒着，返回后立刻补记。
    let mountedEntry: Mounted | null = null;
    const pendingErrors: string[] = [];
    const onError = (detail: string): void => {
      if (disposed) return;
      if (!mountedEntry) {
        pendingErrors.push(detail);
        return;
      }
      if (mountedEntry.broken) return;
      mountedEntry.broken = true;
      mountedEntry.suspended = true;
      degraded.push({
        id: def.id,
        layer: def.layer,
        reason: 'suspended',
        detail: `异步失败：${detail}`,
      });
    };
    try {
      const isWorld = channel === 'world';
      instance = def.create({
        canvas: channel === 'canvas2d' ? options.canvas : (glCanvas as HTMLCanvasElement),
        ctx: channel === 'canvas2d' ? ctx : null,
        width: isWorld ? worldRect.w : width,
        height: isWorld ? worldRect.h : height,
        dpr,
        seed: hashSeed(options.seed, def.id, i),
        biome: options.biome,
        lod: 'high',
        onError,
      });
    } catch (error) {
      // 零件可以自报「这个环境没有我要的画布/能力」（E_UNSUPPORTED）：
      // 例如 koi-pond 在 Node 假 DOM 里没有真实 WebGL 画布。
      // 这是**能力不足**，不是运行期 bug，必须落到 unsupported 而不是 E_PART_THROW。
      const code = (error as { code?: string } | null)?.code;
      if (code === 'E_UNSUPPORTED') {
        mounted.push({
          def,
          channel,
          blend: def.blend ?? 'source-over',
          space,
          instance: null,
          deferred: false,
          lod: 'high',
          suspended: true,
          broken: false,
        });
        degraded.push({
          id: def.id,
          layer: def.layer,
          reason: 'unsupported',
          detail: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
      throw new StageError(
        'E_PART_THROW',
        def.id,
        `create 抛错：${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (!instance || typeof instance.draw !== 'function') {
      throw new StageError('E_PART_THROW', def.id, 'create 必须返回带 draw(frame) 的实例');
    }

    mounted.push({
      def,
      channel,
      blend: def.blend ?? 'source-over',
      space,
      instance,
      deferred: false,
      lod: 'high',
      suspended: false,
      broken: false,
    });
    mountedEntry = mounted[mounted.length - 1]!;
    for (const detail of pendingErrors) onError(detail);
  }

  replan();

  /**
   * 首帧后挂载 defer 零件。
   *
   * 为什么必须等首帧：`koi-pond` 的 create() 是同步重活（renderer/shader/pass），
   * 在首帧前调用会把纸面和文字一起挡黑。先让 L0/L5 出一帧，再在空闲任务里编译。
   */
  function mountDeferred(): void {
    if (deferredStarted || disposed) return;
    deferredStarted = true;
    for (const m of mounted) {
      if (!m.deferred || m.instance || m.broken || m.suspended) continue;
      const def = m.def;
      let created = false;
      const onError = (detail: string): void => {
        if (disposed || !created || m.broken) return;
        m.broken = true;
        m.suspended = true;
        degraded.push({
          id: def.id,
          layer: def.layer,
          reason: 'suspended',
          detail: `异步失败：${detail}`,
        });
      };
      try {
        const isWorld = m.channel === 'world';
        const instance = def.create({
          canvas: m.channel === 'canvas2d' ? options.canvas : (glCanvas as HTMLCanvasElement),
          ctx: m.channel === 'canvas2d' ? ctx : null,
          width: isWorld ? worldRect.w : width,
          height: isWorld ? worldRect.h : height,
          dpr,
          seed: hashSeed(options.seed, def.id, mounted.indexOf(m)),
          biome: options.biome,
          lod: 'high',
          onError,
        });
        if (!instance || typeof instance.draw !== 'function') {
          throw new StageError('E_PART_THROW', def.id, 'defer create 必须返回带 draw(frame) 的实例');
        }
        m.instance = instance;
        created = true;
        // 首次尺寸：defer 期间窗口可能已经 resize，必须补一次
        if (isWorld) instance.resize?.({ w: worldRect.w, h: worldRect.h, dpr });
        else instance.resize?.({ w: width, h: height, dpr });
      } catch (error) {
        const code = (error as { code?: string } | null)?.code;
        m.broken = true;
        m.suspended = true;
        degraded.push({
          id: def.id,
          layer: def.layer,
          reason: code === 'E_UNSUPPORTED' ? 'unsupported' : 'suspended',
          detail: code === 'E_UNSUPPORTED'
            ? (error instanceof Error ? error.message : String(error))
            : `defer create 抛错：${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }
    replan();
    notifyResize({ w: width, h: height, dpr: dpr * renderScale });
  }

  /**
   * 尺寸落盘：改画布像素、改 CSS 尺寸、通知零件。
   * 构造期与 resize() 走同一条路径 —— 免得「初始状态」和「resize 后状态」两套逻辑漂移。
   *
   * @param nextWidth CSS 宽
   * @param nextHeight CSS 高
   * @param nextDpr 设备像素比（会被 maxDpr 夹住）
   */
  function applyResize(nextWidth: number, nextHeight: number, nextDpr?: number): void {
    width = nextWidth > 0 ? nextWidth : 1;
    height = nextHeight > 0 ? nextHeight : 1;
    if (nextDpr && nextDpr > 0) dpr = Math.min(nextDpr, maxDpr);

    // 纸矩形可能随视口比例变化（paper-ink 的 0.90/0.82 规则），所以每次 resize 重算，
    // 而不是只信构造期那一次。world 零件据此换画布尺寸。
    let nextSheet: Rect | null = null;
    for (const def of ordered) {
      if (def.layer !== 'L0' || typeof def.describe !== 'function') continue;
      try {
        const g = def.describe({ w: width, h: height, dpr }, options.biome);
        if (g?.sheet && g.sheet.w > 0 && g.sheet.h > 0) nextSheet = g.sheet;
      } catch {
        // 忽略：没有纸就整屏
      }
    }
    sheet = nextSheet;
    worldRect = wantsSubject && sheet
      ? { x: sheet.x, y: sheet.y, w: sheet.w, h: sheet.h }
      : { x: 0, y: 0, w: width, h: height };
    world.setSheet(sheet);

    const effDpr = dpr * renderScale;
    const pxW = Math.max(1, Math.round(width * effDpr));
    const pxH = Math.max(1, Math.round(height * effDpr));

    options.canvas.width = pxW;
    options.canvas.height = pxH;
    options.canvas.style.width = `${width}px`;
    options.canvas.style.height = `${height}px`;

    if (glCanvas) {
      // ★ 画布像素尺寸的唯一责任人是 world/engine（见 `engine.js` 的 resize()）。
      //   Stage 只负责它在页面上的矩形；如果这里也写 `glCanvas.width/height`，
      //   engine 的 `pix` 上限与 Stage 的 effDpr 会打架，手机 `/still` 只画左上角。
      const glW = worldRect.w;
      const glH = worldRect.h;
      glCanvas.style.left = `${worldRect.x}px`;
      glCanvas.style.top = `${worldRect.y}px`;
      glCanvas.style.width = `${glW}px`;
      glCanvas.style.height = `${glH}px`;
    }

    if (typeof ctx.setTransform === 'function') ctx.setTransform(effDpr, 0, 0, effDpr, 0, 0);
    world.resize(width, height, effDpr);
    notifyResize({ w: width, h: height, dpr: effDpr });
  }

  // 构造期就落一次尺寸：否则零件拿到的 width/height 与画布像素不一致
  applyResize(width, height, dpr);

  /**
   * 通知所有活着的零件尺寸变化。
   *
   * @param size 新尺寸
   */
  function notifyResize(size: StageSize): void {
    for (const m of mounted) {
      if (!m.instance || m.broken) continue;
      try {
        if (m.channel === 'world') {
          m.instance.resize?.({ w: worldRect.w, h: worldRect.h, dpr: size.dpr });
        } else {
          m.instance.resize?.(size);
        }
      } catch {
        m.broken = true;
      }
    }
  }

  /**
   * 推进并绘制一帧。`nowMs` 缺省取注入的 now()。
   *
   * @param nowMs 当前时间（毫秒）
   */
  /**
   * 把 GL 画布**就地**合成进主 2D 画布。
   *
   * ★ 目标矩形必须用 **CSS 尺寸 `width/height`**，不是设备像素 `pxW/pxH`：
   *   `ctx` 已经在上面的 `applyResize` 里被 `setTransform(dpr,0,0,dpr,0,0)` 缩放过，
   *   传设备像素会把整幅 GL 画面放大 dpr 倍。现有测试抓不到这个 —— 只有眼睛能看到。
   *   （`parts-composition` 那条「主画布每帧恰好 1 次 drawImage」是免费的护栏：
   *   若哪天 compositeGl 变成无条件调用，它会立刻红。）
   *
   * ★ 必须在 `instance.draw(f)` 之后的**同一个同步块**里调用：GL/WebGPU 画布的内容是
   *   "最近一次 present 的纹理"，跨帧去读在某些实现上会拿到空或上一帧。
   *
   * @param blend 合成模式（取自 StageOptions.glBlend 或 gl 零件自己的 blend）
   */
  function compositeGl(blend: GlobalCompositeOperation, rect: Rect | null): void {
    if (!glCanvas) return;
    const target = rect ?? { x: 0, y: 0, w: width, h: height };
    ctx.save();
    ctx.globalCompositeOperation = blend;
    const full = target.x === 0 && target.y === 0 && target.w === width && target.h === height;
    if (full) {
      // 全屏：5 参数形式，源画布的整块像素铺满 CSS 尺寸（不是设备像素）
      ctx.drawImage(glCanvas as unknown as CanvasImageSource, 0, 0, width, height);
    } else {
      // world/subject：源画布的像素尺寸就是 worldRect，铺到纸矩形里
      ctx.drawImage(
        glCanvas as unknown as CanvasImageSource,
        0,
        0,
        glCanvas.width || 1,
        glCanvas.height || 1,
        target.x,
        target.y,
        target.w,
        target.h,
      );
    }
    ctx.restore();
  }

  function renderFrame(nowMs?: number): void {
    if (disposed) return;
    const timestamp = typeof nowMs === 'number' ? nowMs : now();
    const dt = lastNow < 0 ? 0 : (timestamp - lastNow) / 1000;
    lastNow = timestamp;
    const f: WorldFrame = world.tick(dt);

    const started = now();
    drawn = 0;
    // 每帧重设：零件可能改过（不许，但防御）
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // **单循环按层序走**（T18）。GL 零件不再"另跑一轮"，而是在它该出现的位置
    // 就地合成进主画布 —— 插入点由 sortParts 排好的层序决定，不需要额外排序逻辑。
    // 这样 L2/L3/L4/L5 都能画在 L1 之上（以前它们全被不透明的 GL 画布挡住了）。
    for (const m of mounted) {
      if (m.suspended || m.broken || !m.instance) continue;
      const instance = m.instance;

      if (m.channel === 'gl' || m.channel === 'world') {
        const partStarted = now();
        try {
          instance.update?.(f);
          instance.draw(f);
          // 同一个同步块里立刻读走：跨帧读 GL 画布可能拿到空或上一帧
          compositeGl(
            glComposite,
            m.channel === 'world' && m.space === 'subject' ? worldRect : null,
          );
          drawn += 1;
          recordCost(m.def.id, now() - partStarted);
        } catch (error) {
          m.broken = true;
          degraded.push({
            id: m.def.id,
            layer: m.def.layer,
            reason: 'suspended',
            detail: `GL 通道抛错已隔离：${error instanceof Error ? error.message : String(error)}`,
          });
        }
        continue;
      }

      try {
        const partStarted = now();
        instance.update?.(f);
        ctx.save();
        ctx.globalCompositeOperation = m.blend as GlobalCompositeOperation;
        instance.draw(f);
        ctx.restore();
        drawn += 1;
        recordCost(m.def.id, now() - partStarted);
      } catch (error) {
        // 零件炸了不许拖垮整场：隔离它、记一笔、继续画别的
        try { ctx.restore(); } catch { /* 已经 restore 过 */ }
        m.broken = true;
        degraded.push({
          id: m.def.id,
          layer: m.def.layer,
          reason: 'suspended',
          detail: `运行期抛错已隔离：${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }

    cpuMs = now() - started;
    frame += 1;
    // 先让纸面/文字真实出一帧，再把 koipond 这类同步重活排到**1.2s 之后**。
    // 嵌套 rAF 在无头 Edge 上仍可能和首次合成抢在同一帧；给浏览器一个明确的空闲窗口。
    if (frame === 1 && deferEnabled && mounted.some((m) => m.deferred && !m.instance)) {
      setTimeout(() => { mountDeferred(); }, 1200);
    }
    if (dt > 0) {
      const instant = 1 / dt;
      fps = fps === 0 ? instant : fps * 0.9 + instant * 0.1;
      frameMs = frameMs === 0 ? dt * 1000 : frameMs * 0.9 + dt * 1000 * 0.1;
    }

    // ---- 实测 governor：static costMs 只能做装配决策，真实瓶颈只能用帧间隔抓 ----
    // 只在「看起来像正常前台帧」的间隔上判断（<80ms），避免切后台回来把分辨率误降到底。
    if (autoScale && dt > 0 && frame > 3 && dt < 0.08) {
      if (fps < 48) {
        slowFrames += 1;
        fastFrames = 0;
      } else if (fps > 57) {
        fastFrames += 1;
        slowFrames = 0;
      } else {
        slowFrames = 0;
        fastFrames = 0;
      }
      if (slowFrames >= 12 && renderScale > minRenderScale + 0.01 && timestamp - lastScaleAt > 1200) {
        pendingScale = Math.max(minRenderScale, renderScale * 0.85);
        slowFrames = 0;
      } else if (fastFrames >= 240 && renderScale < 1 && timestamp - lastScaleAt > 3000) {
        pendingScale = Math.min(1, renderScale * 1.08);
        fastFrames = 0;
      }
    }
    if (pendingScale !== null) {
      renderScale = pendingScale;
      pendingScale = null;
      lastScaleAt = timestamp;
      applyResize(width, height, dpr);
    }
  }

  /**
   * rAF 循环。
   *
   * @param ts rAF 时间戳
   */
  function loop(ts: number): void {
    if (!running) return;
    renderFrame(ts);
    rafId = requestAnimationFrame(loop);
  }

  return {
    degraded,
    stats,
    get order() { return ordered.map((p) => p.id); },
    world,
    geometry,
    frame(nowMs?: number): void {
      renderFrame(nowMs);
    },
    start(): void {
      if (running || disposed) return;
      running = true;
      lastNow = -1;
      rafId = requestAnimationFrame(loop);
    },
    stop(): void {
      running = false;
      if (rafId !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId);
      rafId = null;
    },
    get running() { return running; },
    resize(nextWidth: number, nextHeight: number, nextDpr?: number): void {
      applyResize(nextWidth, nextHeight, nextDpr);
    },
    setBudget(next: number): void {
      budgetMs = next > 0 ? next : DEFAULT_BUDGET_MS;
      // 预算放宽时要能升回 high，所以先把状态清干净再重排
      for (const m of mounted) {
        if (m.suspended && !m.broken) m.suspended = false;
        if (m.lod === 'low' && m.instance?.setLod) {
          try { m.instance.setLod('high'); } catch { m.broken = true; }
          m.lod = 'high';
        }
      }
      replan();
    },
    setAudio(audio: AudioState | null): void {
      world.setAudio(audio);
    },
    setReducedMotion(value: boolean): void {
      world.setReducedMotion(value);
    },
    setRenderScale(scale: number): void {
      autoScale = false;
      renderScale = Math.min(1, Math.max(minRenderScale, scale));
      applyResize(width, height, dpr);
    },
    setAutoScale(enabled: boolean): void {
      autoScale = enabled === true;
    },
    cue(verb: string): void {
      for (const m of mounted) {
        if (m.suspended || m.broken || !m.instance) continue;
        try {
          m.instance.cue?.(verb);
        } catch {
          // cue 是「建议」不是「命令」：零件不接/接错都不该让整场崩
        }
      }
    },
    setPointer(nx: number, ny: number, down?: boolean): void {
      world.pointer.move(nx * width, ny * height);
      if (typeof down === 'boolean') world.pointer.setDown(down);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      running = false;
      if (rafId !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId);
      rafId = null;
      // 逆序释放：后建的先拆
      for (let i = mounted.length - 1; i >= 0; i -= 1) {
        try {
          mounted[i].instance?.dispose?.();
        } catch {
          // dispose 抛错不该阻断后面零件的释放
        }
      }
      mounted.length = 0;
      degraded.length = 0;
    },
  };
}
