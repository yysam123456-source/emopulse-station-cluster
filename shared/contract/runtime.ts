// 底座运行时：加载 config、驱动 SiteApp 生命周期、桥接状态机与埋点。
import { APP_EVENTS } from './events';
import { createAnalytics, type AnalyticsApi } from './analytics';
import { createStateMachine, type AppEvent, type StateMachine, type Transition } from './state-machine';
import type { AnalyticsConfig, AudioApi, QualityApi, RuntimeContext, SiteApp, SiteAppFactory, SiteConfig, SiteId } from './types';

import type * as THREE from 'three';

const configs = new Map<SiteId, SiteConfig>();
const appFactories = new Map<SiteId, SiteAppFactory>();

/** 站点注册配置（由各站 index.ts 在装载时调用，底座不反向 import 站点）。 */
export function registerConfig(config: SiteConfig): void {
  configs.set(config.id, config);
}

/** 站点注册插件工厂。 */
export function registerApp(id: SiteId, factory: SiteAppFactory): void {
  appFactories.set(id, factory);
}

/** 按 ID 读取配置；未注册时明确失败。 */
export function loadConfig(siteId: SiteId): SiteConfig {
  const config = configs.get(siteId);
  if (!config) throw new Error(`[runtime] 站点配置未注册：${siteId}`);
  return config;
}

export interface StateDefinition<S extends string = string> {
  initial: S;
  states: readonly S[];
  transitions: readonly Transition<S>[];
}

export interface RuntimeEnvironment {
  scene: THREE.Scene;
  camera: THREE.Camera;
  renderer: THREE.WebGLRenderer;
  quality: QualityApi;
  audio: AudioApi;
  container: HTMLElement;
  state?: StateDefinition;
  analytics?: AnalyticsApi;
  analyticsConfig?: AnalyticsConfig;
}

/** 创建 RuntimeContext：站点只依赖此上下文，不自行 new 引擎。 */
export function createContext(config: SiteConfig, env: RuntimeEnvironment, state: StateMachine, analytics: AnalyticsApi): RuntimeContext {
  return {
    scene: env.scene,
    camera: env.camera,
    renderer: env.renderer,
    quality: env.quality,
    audio: env.audio,
    state,
    analytics,
    store: Object.create(null) as Record<string, unknown>,
  };
}

/** 运行时：持有应用实例，按 SiteApp 契约驱动 init → mount → start / pause → dispose。 */
export class Runtime {
  readonly config: SiteConfig;
  readonly app: SiteApp;
  readonly state: StateMachine;
  readonly ctx: RuntimeContext;
  private readonly container: HTMLElement;
  private running = false;
  private disposed = false;

  constructor(config: SiteConfig, app: SiteApp, ctx: RuntimeContext, container: HTMLElement) {
    this.config = config;
    this.app = app;
    this.state = ctx.state;
    this.ctx = ctx;
    this.container = container;
  }

  /** 装载：APP_INIT → init → mount → APP_READY。 */
  boot(): void {
    if (this.disposed) throw new Error('[runtime] 已释放的 Runtime 不能再次 boot');
    this.state.send(APP_EVENTS.APP_INIT);
    this.app.init(this.config, this.ctx);
    this.app.mount(this.container);
    this.state.send(APP_EVENTS.APP_READY);
  }

  /** 进入渲染循环。 */
  start(): void {
    if (this.disposed || this.running) return;
    this.running = true;
    this.app.start();
    this.state.send(APP_EVENTS.APP_START);
  }

  /** 离开渲染循环。 */
  pause(): void {
    if (this.disposed || !this.running) return;
    this.running = false;
    this.app.pause();
    this.state.send(APP_EVENTS.APP_PAUSE);
  }

  /** 统一事件入口：先驱动状态机，再通知站点。 */
  dispatch(event: AppEvent, payload?: unknown): void {
    if (this.disposed) return;
    this.state.send(event, payload);
    this.app.onEvent(event, payload);
  }

  /** 卸载：释放零件、监听与埋点缓冲，站点热切换不泄漏。 */
  teardown(): void {
    if (this.disposed) return;
    this.pause();
    this.app.dispose();
    this.state.send(APP_EVENTS.APP_DISPOSE);
    this.ctx.analytics.flush();
    this.disposed = true;
  }
}

/** 完整启动：读取注册表 → 建上下文 → 创建站点实例 → boot → start。 */
export function boot(siteId: SiteId, env: RuntimeEnvironment): Runtime {
  const config = loadConfig(siteId);
  const factory = appFactories.get(siteId);
  if (!factory) throw new Error(`[runtime] 站点插件未注册：${siteId}`);

  const state = createStateMachine(env.state ?? {
    initial: 'idle',
    states: ['idle', 'active'],
    transitions: [],
  });
  const analytics = env.analytics ?? createAnalytics({
    enabled: env.analyticsConfig?.enabled ?? false,
    endpoint: env.analyticsConfig?.endpoint,
  });
  const ctx = createContext(config, env, state, analytics);
  const runtime = new Runtime(config, factory(), ctx, env.container);
  runtime.boot();
  runtime.start();
  return runtime;
}
