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
  type DegradedEntry,
  type Lod,
  type PartChannel,
  type PartInstance,
  type PartV2,
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
  readonly reducedMotion?: boolean;
  /**
   * 2D 层整体与 GL 层的合成模式（CSS mix-blend-mode）。
   * 现阶段的真实限制：3D 层与 2D 层之间只能有**一个**整体混合模式，
   * 逐零件跨通道混合要等 WebGL 后处理链，不在本版范围。
   */
  readonly glBlend?: string;
  /** 取当前时间的函数（测试注入，保证确定性） */
  readonly now?: () => number;
}

/** 运行期统计。 */
export interface StageStats {
  /** 平滑后的帧率 */
  readonly fps: number;
  /** 最近一帧的零件总耗时（毫秒） */
  readonly cpuMs: number;
  /** 配置声明的总开销（毫秒） */
  readonly budgetCostMs: number;
  readonly budgetMs: number;
  /** 最近一帧实际绘制的零件数（含被挂起前） */
  readonly drawn: number;
  readonly frames: number;
}

/** 装配好的舞台。 */
export interface Stage {
  readonly degraded: readonly DegradedEntry[];
  readonly stats: StageStats;
  /** 实际绘制顺序（零件 id） */
  readonly order: readonly string[];
  readonly world: World;
  /** 推进并绘制一帧 */
  frame(nowMs?: number): void;
  start(): void;
  stop(): void;
  readonly running: boolean;
  resize(width: number, height: number, dpr?: number): void;
  setBudget(budgetMs: number): void;
  setAudio(audio: AudioState | null): void;
  /** 写入归一化指针（0..1），测试与桥接共用 */
  setPointer(nx: number, ny: number, down?: boolean): void;
  dispose(): void;
}

/** 内部：装配后的一件零件。 */
interface Mounted {
  readonly def: PartV2;
  readonly channel: PartChannel;
  readonly blend: string;
  readonly instance: PartInstance | null;
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
    if (channel === 'gl') {
      glCount += 1;
      if (glCount > 1) {
        throw new StageError('E_MULTI_GL', part.id, 'GL 通道整场唯一（单 WebGL 上下文）');
      }
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
 * @param canvas 主画布
 * @returns 能力集合
 */
function detectCapabilities(canvas: HTMLCanvasElement): Set<string> {
  const caps = new Set<string>();
  try {
    const gl2 = (canvas as unknown as { getContext(id: string): unknown }).getContext('webgl2');
    if (gl2) caps.add('webgl2');
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
  const caps = detectCapabilities(options.canvas);

  // 拆成两步：TS 在嵌套函数里不保留 `if (!x) throw` 的收窄，必须换成非空别名，
  // 否则后面几十处 ctx.xxx 全部报 possibly null。
  const maybeCtx = options.canvas.getContext('2d') as CanvasRenderingContext2D | null;
  if (!maybeCtx) throw new StageError('E_PART_THROW', '<stage>', '主画布拿不到 2d 上下文');
  const ctx: CanvasRenderingContext2D = maybeCtx;

  let budgetMs = options.budgetMs && options.budgetMs > 0 ? options.budgetMs : DEFAULT_BUDGET_MS;
  // 初始尺寸优先取 CSS 尺寸；拿不到才退回属性值。属性值是设备像素，直接当 CSS 尺寸会放大 dpr 倍。
  const canvasAny = options.canvas as unknown as { clientWidth?: number; clientHeight?: number };
  let width = canvasAny.clientWidth && canvasAny.clientWidth > 0 ? canvasAny.clientWidth : options.canvas.width || 1;
  let height = canvasAny.clientHeight && canvasAny.clientHeight > 0 ? canvasAny.clientHeight : options.canvas.height || 1;
  let dpr = Math.min(
    (globalThis as unknown as { devicePixelRatio?: number }).devicePixelRatio ?? 1,
    maxDpr,
  );

  // GL 画布只在真的有 gl 零件时才需要
  const glCanvas = options.glCanvas ?? null;
  const hasGl = ordered.some((p) => (p.channel ?? 'canvas2d') === 'gl');
  if (hasGl && !glCanvas) {
    const offender = ordered.find((p) => (p.channel ?? 'canvas2d') === 'gl') as PartV2;
    throw new StageError('E_PART_THROW', offender.id, '存在 gl 通道零件，但未提供 glCanvas');
  }
  if (glCanvas && options.glBlend) {
    glCanvas.style.mixBlendMode = options.glBlend;
  }

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
  let frame = 0;
  let drawn = 0;
  let cpuMs = 0;
  let fps = 0;
  let running = false;
  let disposed = false;
  let rafId: number | null = null;
  let lastNow = -1;

  const stats: StageStats = {
    get fps() { return fps; },
    get cpuMs() { return cpuMs; },
    get budgetCostMs() { return totalCost(); },
    get budgetMs() { return budgetMs; },
    get drawn() { return drawn; },
    get frames() { return frame; },
  };

  /**
   * 按声明计算总开销（不受降档影响，反映配置本身）。
   *
   * @returns 毫秒
   */
  function totalCost(): number {
    let sum = 0;
    for (const m of mounted) sum += m.def.costMs;
    return sum;
  }

  /**
   * 解析能力过滤 + 预算方案，并把结论写进 degraded。
   *
   * @returns void
   */
  function replan(): void {
    degraded.length = 0;
    // 能力不足的直接标记 unsupported，不构造
    for (const m of mounted) {
      const requires = m.def.requires;
      if (requires && requires.some((cap) => !caps.has(cap))) {
        m.suspended = true;
        degraded.push({
          id: m.def.id,
          layer: m.def.layer,
          reason: 'unsupported',
          detail: `缺少能力：${requires.filter((c) => !caps.has(c)).join(',')}`,
        });
      }
    }

    const candidates = mounted.filter((m) => !m.suspended);
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

    const requires = def.requires;
    const missing = requires ? requires.filter((cap) => !caps.has(cap)) : [];
    if (missing.length > 0) {
      mounted.push({
        def,
        channel,
        blend: def.blend ?? 'source-over',
        instance: null,
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

    let instance: PartInstance | null = null;
    try {
      instance = def.create({
        canvas: channel === 'gl' ? (glCanvas as HTMLCanvasElement) : options.canvas,
        ctx: channel === 'gl' ? null : ctx,
        width,
        height,
        dpr,
        seed: hashSeed(options.seed, def.id, i),
        biome: options.biome,
        lod: 'high',
      });
    } catch (error) {
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
      instance,
      lod: 'high',
      suspended: false,
      broken: false,
    });
  }

  replan();

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

    const pxW = Math.max(1, Math.round(width * dpr));
    const pxH = Math.max(1, Math.round(height * dpr));
    for (const target of [options.canvas, glCanvas]) {
      if (!target) continue;
      target.width = pxW;
      target.height = pxH;
      target.style.width = `${width}px`;
      target.style.height = `${height}px`;
    }
    if (typeof ctx.setTransform === 'function') ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    world.resize(width, height, dpr);
    notifyResize({ w: width, h: height, dpr });
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
        m.instance.resize?.(size);
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

    for (const m of mounted) {
      if (m.suspended || m.broken || !m.instance) continue;
      const instance = m.instance;
      if (m.channel !== 'canvas2d') continue;
      // GL 零件自己管上下文，不参与 2D 合成
      try {
        instance.update?.(f);
        ctx.save();
        ctx.globalCompositeOperation = m.blend as GlobalCompositeOperation;
        instance.draw(f);
        ctx.restore();
        drawn += 1;
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

    // GL 通道独立推进（不参与 2D 合成，靠 CSS mix-blend-mode 叠在外层）
    for (const m of mounted) {
      if (m.suspended || m.broken || !m.instance) continue;
      if (m.channel !== 'gl') continue;
      try {
        m.instance.update?.(f);
        m.instance.draw(f);
        drawn += 1;
      } catch (error) {
        m.broken = true;
        degraded.push({
          id: m.def.id,
          layer: m.def.layer,
          reason: 'suspended',
          detail: `GL 通道抛错已隔离：${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }

    cpuMs = now() - started;
    frame += 1;
    if (dt > 0) {
      const instant = 1 / dt;
      fps = fps === 0 ? instant : fps * 0.9 + instant * 0.1;
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
