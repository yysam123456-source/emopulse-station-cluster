// koi 三风格共享 glue：实现 SiteApp 七方法（观赏即内容，无任务、无消费引导）。
import { createFrameBridge, type FrameBridge } from '../../../shared/contract/index';
import type { AppEvent, RuntimeContext, SiteApp, SiteConfig, SiteId, StateMachine } from '../../../shared/contract/index';
import type { KoiStyle } from '../../../content/koi';
import { createKoiState, type KoiState } from './state';
import { createKoiPart, type Part } from './koi';

export class KoiApp implements SiteApp {
  readonly id: SiteId;

  private config: SiteConfig | null = null;
  private ctx: RuntimeContext | null = null;
  private state: StateMachine = createKoiState();
  private bridge: FrameBridge | null = null;
  private container: HTMLElement | null = null;
  private part: Part | null = null;
  private cleanup: Array<() => void> = [];
  private disposed = false;

  constructor(id: SiteId) { this.id = id; }

  init(config: SiteConfig, ctx: RuntimeContext): void {
    this.config = config;
    this.ctx = ctx;
    this.state = (ctx.state ?? createKoiState()) as unknown as StateMachine;
    const stage = document.getElementById('stage') as HTMLCanvasElement | null;
    if (!stage) throw new Error(`[koi:${this.id}] 站点模板缺少 #stage canvas`);
    const c = stage.getContext('2d');
    if (!c) throw new Error(`[koi:${this.id}] 无法取得 2D 上下文`);
    const style = (config.parts.find((p) => p.source === 'zz85-koi')?.options?.style ?? 'pond') as KoiStyle;
    this.part = createKoiPart(c, style);
    this.state.onEnter('watching', () => ctx.analytics.track('USER_INTERACT', { site: this.id, action: 'watch' }));
    this.bridge = createFrameBridge({ onFrame: (t) => this.onFrame(t), app: this });
  }

  mount(container: HTMLElement): void {
    this.container = container;
    const act = container.querySelector<HTMLElement>('#act');
    const listen = container.querySelector<HTMLElement>('#listen');
    const leave = container.querySelector<HTMLElement>('#leave');
    const onAct = (): void => this.onEvent('USER_INTERACT', { action: 'watch' });
    const onListen = (): void => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyM', key: 'm', bubbles: true }));
    };
    const onLeave = (): void => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
    };
    act?.addEventListener('click', onAct);
    listen?.addEventListener('click', onListen);
    leave?.addEventListener('click', onLeave);
    this.cleanup.push(
      () => act?.removeEventListener('click', onAct),
      () => listen?.removeEventListener('click', onListen),
      () => leave?.removeEventListener('click', onLeave),
    );
  }

  start(): void { this.bridge?.start(); }
  pause(): void { this.bridge?.pause(); }
  getScene(): NonNullable<RuntimeContext['scene']> {
    if (!this.ctx) throw new Error(`[koi:${this.id}] getScene 在 init 之前被调用`);
    return this.ctx.scene;
  }

  onEvent(event: AppEvent, payload?: unknown): void {
    this.state.send(event, payload) as KoiState;
  }

  private onFrame(seconds: number): void {
    const stage = document.getElementById('stage') as HTMLCanvasElement | null;
    if (stage) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.floor(stage.clientWidth * dpr), h = Math.floor(stage.clientHeight * dpr);
      if (stage.width !== w || stage.height !== h) { stage.width = w; stage.height = h; }
    }
    this.part?.update(seconds);
  }

  dispose(): void {
    if (this.disposed) return;
    this.bridge?.dispose();
    for (const fn of this.cleanup) fn();
    this.cleanup = [];
    this.part?.dispose();
    this.ctx?.analytics.flush();
    this.disposed = true;
  }
}

/** 按站点 ID 创建对应实例。 */
export function createKoiApp(id: SiteId): KoiApp { return new KoiApp(id); }
