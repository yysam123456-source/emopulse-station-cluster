// L1 新站统一入口：能力探测 → 冲突检测 → 五层装配 → 帧桥 → 全局异常兜底 → 降级如实标注。
// 背景（架构 F18）：/*RUNTIME*/ 是独立于 core catch 之外的 IIFE，其异常不会被 core 捕获，
// 因此保护必须放进本入口；本文件绝不 rethrow、绝不吞掉诊断（R4 / GM-6 / NX-Q-02）。
// 纪律：不修改 inline.mjs / build.mjs 的注入逻辑（改了会破坏 7 站产物字节，INV-3）。
import { probeCapability, type Capability } from './capability';
import { createComposer, type Composer } from './composer';
import { createEmptyComposition, normalizeComposition, type CompositionConfig, type Conflict } from './composition';
import { GenericApp } from './generic-app';
import { resolvePart } from './parts-registry';
import { createAnalytics } from './analytics';
import { createFrameBridge, type FrameBridge } from './bridge';
import { createStateMachine } from './state-machine';
import type { RuntimeContext, SiteConfig } from './types';

/** 写进 window.__emopulseDiagnostics 的诊断快照（G4 CDP / 无头断言读取）。 */
export interface SiteDiagnostics {
  /** 站点 id */
  site: string;
  /** 是否处于降级态 */
  degraded: boolean;
  /** 降级原因码：no-webgpu-adapter | no-canvas2d | conflict | runtime-error | uncaught-error */
  reason?: string;
  /** 实际渲染通道 */
  renderer: 'webgpu' | 'canvas2d' | 'static' | 'unknown';
  /** 冲突明细（冲突即降级，不启动任何零件） */
  conflicts: Conflict[];
  /** 未捕获异常计数（目标恒为 0；被兜底捕获的异常也会记入 captured） */
  uncaught: number;
  /** 逐条兜底记录（诊断用，不 rethrow） */
  captured: Array<{ kind: 'error' | 'rejection' | 'runtime'; message: string }>;
  /** 成功装配的零件数 */
  parts: number;
  /** 启动时间戳（毫秒） */
  startedAt: number;
}

/** 站点根节点最小形状（避免依赖完整 DOM 类型，无头环境下也能安全探测）。 */
interface ElementLike {
  setAttribute?(name: string, value: string): void;
  getAttribute?(name: string): string | null;
  querySelector?(selector: string): ElementLike | null;
  textContent?: string | null;
}

/** document 最小形状。 */
interface DocumentLike {
  body?: ElementLike | null;
  documentElement?: ElementLike | null;
  hidden?: boolean;
  createElement?(tag: string): { getContext?(id: string): unknown } | null;
  getElementById?(id: string): ElementLike | null;
  addEventListener?(type: string, fn: (event: unknown) => void): void;
  removeEventListener?(type: string, fn: (event: unknown) => void): void;
}

/** mountSite 需要的全局能力（全部按可选处理）。 */
interface MountScope {
  document?: DocumentLike;
  requestAnimationFrame?: (cb: (time: number) => void) => number;
  cancelAnimationFrame?: (handle: number) => void;
  addEventListener?(type: string, fn: (event: unknown) => void): void;
  removeEventListener?(type: string, fn: (event: unknown) => void): void;
  __emopulseDiagnostics?: SiteDiagnostics;
  __emopulseReady?: Promise<void>;
  __emopulseGuardsInstalled?: boolean;
}

/** 降级文案：中性表述，不出现「rendered / passed / 渲染通过」类措辞（NX-Q-02）。 */
const DEGRADED_NOTE = 'Static view / 静态视图：当前环境未启用动态渲染。';

/** 取全局作用域（统一走 globalThis，不引用 window，便于无头复跑）。 */
function scope(): MountScope {
  return globalThis as unknown as MountScope;
}

/** 解析站点根节点：优先 body，其次 documentElement，都没有则返回 null。 */
function resolveRoot(): ElementLike | null {
  const doc = scope().document;
  if (!doc) return null;
  return doc.body ?? doc.documentElement ?? null;
}

/** 安全设置属性（节点或 setAttribute 缺失时静默跳过）。 */
function setAttribute(root: ElementLike | null, name: string, value: string): void {
  try {
    root?.setAttribute?.(name, value);
  } catch {
    // 极端环境（分离节点等）下设置属性失败不影响其余降级路径。
  }
}

/** 把诊断写到根节点 + 全局快照 + 中性提示文案。 */
function markDegraded(root: ElementLike | null, diagnostics: SiteDiagnostics, reason: string): void {
  diagnostics.degraded = true;
  diagnostics.reason = reason;
  setAttribute(root, 'data-degraded', reason);
  try {
    const note = root?.querySelector?.('[data-degraded-note]');
    if (note) note.textContent = DEGRADED_NOTE;
  } catch {
    // 提示文案写入失败不影响降级标注本身。
  }
}

/** 初始化诊断快照（同一页面多次 mountSite 复用同一份，站点字段取最后一次）。 */
function ensureDiagnostics(config: SiteConfig): SiteDiagnostics {
  const global = scope();
  const existing = global.__emopulseDiagnostics;
  if (existing) {
    existing.site = config.id;
    return existing;
  }
  const created: SiteDiagnostics = {
    site: config.id,
    degraded: false,
    renderer: 'unknown',
    conflicts: [],
    uncaught: 0,
    captured: [],
    parts: 0,
    startedAt: Date.now(),
  };
  global.__emopulseDiagnostics = created;
  return created;
}

/** 记录一次被兜底捕获的异常（绝不 rethrow）。 */
function record(diagnostics: SiteDiagnostics, kind: 'error' | 'rejection' | 'runtime', error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  if (diagnostics.captured.length < 32) diagnostics.captured.push({ kind, message: message.slice(0, 200) });
  if (kind !== 'runtime') diagnostics.uncaught += 1;
}

/**
 * 安装全局异常兜底（幂等）：把异步未捕获异常转成降级标注 + 诊断，不 rethrow、不静默。
 * 注意：监听器只做「记录 + 标注」，不调用 preventDefault，不改变浏览器默认行为。
 */
function installGlobalGuards(diagnostics: SiteDiagnostics): void {
  const global = scope();
  if (global.__emopulseGuardsInstalled) return;
  if (typeof global.addEventListener !== 'function') return;
  global.addEventListener('unhandledrejection', (event) => {
    const reason = (event as { reason?: unknown })?.reason;
    record(diagnostics, 'rejection', reason);
    markDegraded(resolveRoot(), diagnostics, 'uncaught-error');
  });
  global.addEventListener('error', (event) => {
    const error = (event as { error?: unknown })?.error ?? (event as { message?: unknown })?.message;
    record(diagnostics, 'error', error);
    markDegraded(resolveRoot(), diagnostics, 'uncaught-error');
  });
  global.__emopulseGuardsInstalled = true;
}

/** 构造降级/无引擎场景下可用的 RuntimeContext（不持有引擎构造权，符合 IoC 纪律）。 */
function createFallbackContext(config: SiteConfig, capability: Capability): RuntimeContext {
  const analytics = createAnalytics({
    enabled: config.analytics.enabled,
    endpoint: config.analytics.endpoint,
    maxQueue: 50,
  });
  const state = createStateMachine({ initial: 'idle', states: ['idle', 'active'], transitions: [] });
  const quality: RuntimeContext['quality'] = {
    level: 'high',
    auto: true,
    setLevel() {
      // 画质由 core/quality.js 自适应；新站不接管引擎。
    },
  };
  const audio: RuntimeContext['audio'] = {
    enabled: false,
    volume: config.layout.audio.volume,
    setEnabled() {
      // 音景开关由 audio 层零件经 LayerBus.masterGain 控制。
    },
    setVolume() {
      // 同上：新站不直接操作 core 音频。
    },
  };
  void capability;
  return {
    scene: {} as RuntimeContext['scene'],
    camera: {} as RuntimeContext['camera'],
    renderer: {} as RuntimeContext['renderer'],
    quality,
    audio,
    state,
    analytics,
    store: Object.create(null) as Record<string, unknown>,
  };
}

/** 注册 pagehide 清理（幂等；无 addEventListener 环境跳过）。 */
function installTeardown(dispose: () => void): void {
  const global = scope();
  if (typeof global.addEventListener !== 'function') return;
  let done = false;
  global.addEventListener('pagehide', () => {
    if (done) return;
    done = true;
    dispose();
  });
}

/**
 * 推导运行期能力需求。
 * 为什么不是 config.requires：§5.2 规定 SiteConfig 的唯一改动是可选 composition，
 * 站点级 requires 属于 SiteManifest（构建期元信息），运行期不可见。
 * 因此这里按 composition 各层零件的声明聚合：任一零件声明 requires:'webgpu' → 'webgpu'。
 * 未注册零件不抛错（其冲突由 Composer.validate 报 unregistered-ref）。
 */
function requiredCapability(composition: CompositionConfig): 'webgpu' | 'none' {
  for (const layer of Object.keys(composition) as Array<keyof CompositionConfig>) {
    for (const binding of composition[layer] ?? []) {
      if (!binding || typeof binding.ref !== 'string') continue;
      try {
        if (resolvePart(binding.ref).manifest.requires === 'webgpu') return 'webgpu';
      } catch {
        // 未注册零件：跳过能力聚合，交由冲突检测如实报错。
      }
    }
  }
  return 'none';
}

/** 启动主流程：任何一步失败都只降级，不向上抛错。 */
async function bootstrap(config: SiteConfig, diagnostics: SiteDiagnostics): Promise<void> {
  const root = resolveRoot();
  setAttribute(root, 'data-site', config.id);

  const composition = config.composition ? normalizeComposition(config.composition) : createEmptyComposition();
  const capability = await probeCapability(requiredCapability(composition));
  diagnostics.renderer = capability.renderer;
  setAttribute(root, 'data-renderer', capability.renderer);
  if (capability.degraded) {
    markDegraded(root, diagnostics, capability.reason ?? 'degraded');
    if (capability.renderer === 'static') return;
  }

  const composer: Composer = createComposer(composition, capability);
  const conflicts = composer.validate();
  diagnostics.conflicts = conflicts;
  if (conflicts.length > 0) {
    // 冲突即降级：一个零件都不启动（§6.3 规则 2，禁止静默覆盖）。
    markDegraded(root, diagnostics, 'conflict');
    return;
  }

  const ctx = createFallbackContext(config, capability);
  const app = new GenericApp(config.id, composer);
  app.init(config, ctx);
  if (root) app.mount(root as unknown as HTMLElement);
  app.start();
  diagnostics.parts = composer.diagnostics.initOrder.length;

  // 帧桥：requestAnimationFrame 缺失（无头/纯静态环境）时跳过，不报错。
  const global = scope();
  if (typeof global.requestAnimationFrame === 'function') {
    let bridge: FrameBridge | null = null;
    try {
      bridge = createFrameBridge({
        onFrame: (seconds: number) => composer.update(seconds),
        app: { start: () => app.start(), pause: () => app.pause() },
        autoVisibility: true,
      });
      bridge.start();
    } catch (error) {
      record(diagnostics, 'runtime', error);
    }
  }

  installTeardown(() => {
    try {
      app.dispose();
    } catch (error) {
      record(diagnostics, 'runtime', error);
    }
  });
}

/**
 * 新站 bridge.ts 的唯一调用：`mountSite(config)`。
 * 自带能力探测 + 冲突检测 + 装配 + 帧桥 + try/catch + 全局异常兜底 + data-degraded 如实标注。
 * 绝不 rethrow；诊断写入 globalThis.__emopulseDiagnostics（同 window.__emopulseDiagnostics）。
 * 诊断握手：globalThis.__emopulseReady 在装配完成后 resolve（供无头断言等待，恒不 reject）。
 */
export function mountSite(config: SiteConfig): void {
  const diagnostics = ensureDiagnostics(config);
  installGlobalGuards(diagnostics);

  const ready = (async (): Promise<void> => {
    try {
      await bootstrap(config, diagnostics);
    } catch (error) {
      record(diagnostics, 'runtime', error);
      markDegraded(resolveRoot(), diagnostics, 'runtime-error');
    }
  })();

  scope().__emopulseReady = ready;
}
