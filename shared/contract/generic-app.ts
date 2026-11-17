// L1 通用 SiteApp：8 个新站共用，站点不再自写 glue（INV-8 / E3 / ADR-8）。
// 委托 Composer 驱动五层零件；生命周期七方法与既有 SiteApp 契约逐字一致。
import type * as THREE from 'three';
import type { AppEvent } from './state-machine';
import type { RuntimeContext, SiteApp, SiteConfig, SiteId } from './types';
import type { Composer } from './composer';
import { APP_EVENTS } from './events';
import { asAppEvent, NEXUS_EVENTS } from './nexus-events';

/**
 * 通用站点应用。
 * - init 时按五层装配零件（委托 Composer，层序与逆序 dispose 由 Composer 保证）；
 * - 自身不创建渲染循环，帧驱动由 mountSite() 统一负责（避免多份 RAF 循环）。
 */
export class GenericApp implements SiteApp {
  readonly id: SiteId;

  private readonly composer: Composer;
  private config: SiteConfig | null = null;
  private ctx: RuntimeContext | null = null;
  private container: HTMLElement | null = null;
  private running = false;
  private disposed = false;

  constructor(id: SiteId, composer: Composer) {
    this.id = id;
    this.composer = composer;
  }

  /** ② init：装配五层零件 + 上报 APP_INIT（经 scrubPayload，零 PII）。 */
  init(config: SiteConfig, ctx: RuntimeContext): void {
    if (this.disposed) return;
    this.config = config;
    this.ctx = ctx;
    this.composer.init();
    ctx.analytics.track(APP_EVENTS.APP_INIT, {
      site: this.id,
      layers: this.composer.diagnostics.initOrder.length,
      degraded: this.composer.diagnostics.degraded,
    });
  }

  /** ③ mount：模板 DOM 已存在，仅登记容器（站点专属 DOM 绑定在零件里做）。 */
  mount(container: HTMLElement): void {
    if (this.disposed) return;
    this.container = container;
  }

  /** ④ start：进入渲染循环（帧由 mountSite 的帧桥驱动）。 */
  start(): void {
    if (this.disposed || this.running) return;
    this.running = true;
    this.ctx?.analytics.track(APP_EVENTS.APP_START, { site: this.id });
  }

  /** ⑤ pause：离开渲染循环。 */
  pause(): void {
    if (this.disposed || !this.running) return;
    this.running = false;
    this.ctx?.analytics.track(APP_EVENTS.APP_PAUSE, { site: this.id });
  }

  /** ⑥ getScene：新站主视觉为 Canvas2D，这里如实返回上下文场景（可能为空对象占位）。 */
  getScene(): THREE.Scene {
    if (!this.ctx) throw new Error(`[generic-app] getScene 在 init 之前被调用：${this.id}`);
    return this.ctx.scene;
  }

  /** ⑦ 统一事件入口：先驱动状态机，再按事件口径上报（NX-I-01）。 */
  onEvent(event: AppEvent, payload?: unknown): void {
    const ctx = this.ctx;
    if (!ctx || this.disposed) return;
    const next = ctx.state.send(event, payload);
    if (event === NEXUS_EVENTS.USER_COMPLETE) {
      ctx.analytics.track(asAppEvent(NEXUS_EVENTS.USER_COMPLETE), { site: this.id, state: String(next) });
    } else if (event === asAppEvent(NEXUS_EVENTS.ARTIFACT_EXPORT)) {
      ctx.analytics.track(asAppEvent(NEXUS_EVENTS.ARTIFACT_EXPORT), {
        site: this.id,
        kind: typeof (payload as { kind?: unknown })?.kind === 'string'
          ? String((payload as { kind?: unknown }).kind).slice(0, 40)
          : 'canvas',
      });
    }
  }

  /** ⑧ dispose：逆序释放五层零件 + 冲埋点缓冲；可重复调用。 */
  dispose(): void {
    if (this.disposed) return;
    this.composer.dispose();
    this.ctx?.analytics.track(APP_EVENTS.APP_DISPOSE, { site: this.id });
    this.ctx?.analytics.flush();
    this.container = null;
    this.config = null;
    this.running = false;
    this.disposed = true;
  }

  /** 当前是否在渲染循环内（供 mountSite 的帧桥与 G4 冒烟读取）。 */
  get isRunning(): boolean {
    return this.running;
  }

  /** 已挂载容器（供零件按需查询；未 mount 时为 null）。 */
  get mountedContainer(): HTMLElement | null {
    return this.container;
  }

  /** 已加载配置（未 init 时为 null）。 */
  get loadedConfig(): SiteConfig | null {
    return this.config;
  }
}
