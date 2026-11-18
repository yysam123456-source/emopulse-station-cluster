// /hug glue：SiteApp 七方法 + 蒲公英三状态 + 错峰释放 + 飞行 + ?from= 回赠闭环。
import { createFrameBridge, type FrameBridge } from '../../shared/contract/index';
import type { AppEvent, RuntimeContext, SiteApp, SiteConfig, SiteId, StateMachine } from '../../shared/contract/index';
import { HUG_COPY, hugLine, backHint } from '../../content/hug';
import { createHugState, RELEASE_EVENT, ARRIVE_EVENT, BACK_EVENT, type HugState } from './state';
import { createDandelionPart, createBlowInputPart, createFlightPart } from './parts/index';

interface HugParts {
  dandelion: ReturnType<typeof createDandelionPart>;
  blow: ReturnType<typeof createBlowInputPart>;
  flight: ReturnType<typeof createFlightPart>;
}

export class HugApp implements SiteApp {
  readonly id: SiteId = 'hug';

  private config: SiteConfig | null = null;
  private ctx: RuntimeContext | null = null;
  private state: StateMachine = createHugState();
  private bridge: FrameBridge | null = null;
  private container: HTMLElement | null = null;
  private parts: HugParts | null = null;
  private cleanup: Array<() => void> = [];
  private timers: number[] = [];
  private disposed = false;

  init(config: SiteConfig, ctx: RuntimeContext): void {
    this.config = config;
    this.ctx = ctx;
    this.state = (ctx.state ?? createHugState()) as unknown as StateMachine;
    const stage = document.getElementById('stage') as HTMLCanvasElement | null;
    if (!stage) throw new Error('[hug] 站点模板缺少 #stage canvas');
    const c = stage.getContext('2d');
    if (!c) throw new Error('[hug] 无法取得 2D 上下文');
    const blowRef = config.parts.find((p) => p.source === 'blow-input');
    this.parts = {
      dandelion: createDandelionPart(c),
      blow: createBlowInputPart({
        fallbackButton: true,
        autoRequest: blowRef?.options?.autoRequest === true, // 默认 false：绝不主动弹授权
      }),
      flight: createFlightPart(c),
    };
    // 注：`site.config.ts` 的 parts[] 只**声明本站装了什么**（供门 2 / 死引用 / 许可普查读取），
    // **不承诺可挂载**。原来的通用挂载循环（遍历 parts[] 取 ctx.store.partFactories）已删除：
    // 它读的 `ctx.store.partFactories` 全仓无写入点（QUARANTINE.md Q-01），永不生效。
    // 新增零件必须在此处加一个硬编码槽位。

    this.state.onEnter('drifting', () => {
      this.parts?.dandelion.release();
      this.setStatus(HUG_COPY.driftingZh);
      ctx.analytics.track('USER_INTERACT', { site: this.id, action: 'release_hug' });
    });
    this.state.onEnter('away', () => {
      this.parts?.flight.launch();
      this.setStatus(hugLine(Date.now()));
      ctx.analytics.track('USER_COMPLETE', { site: this.id, action: 'hug_sent' });
    });
    this.state.onEnter('hug-back', () => {
      this.setStatus(backHint(String(ctx.store.fromSource ?? 'someone')));
      const back = this.container?.querySelector<HTMLElement>('#back');
      if (back) back.hidden = false;
    });

    this.bridge = createFrameBridge({ onFrame: (t) => this.onFrame(t), app: this });
  }

  mount(container: HTMLElement): void {
    this.container = container;
    const act = container.querySelector<HTMLElement>('#act');
    const back = container.querySelector<HTMLElement>('#back');
    const share = container.querySelector<HTMLElement>('#share');
    const mic = container.querySelector<HTMLElement>('#mic');
    const listen = container.querySelector<HTMLElement>('#listen');
    const leave = container.querySelector<HTMLElement>('#leave');

    const startFlight = (): void => {
      if (this.state.current() !== 'ready' && this.state.current() !== 'hug-back') return;
      this.onEvent('USER_INTERACT', { action: 'hug' });
      this.timers.push(window.setTimeout(() => this.onEvent(RELEASE_EVENT), 2600));
      this.timers.push(window.setTimeout(() => this.onEvent(ARRIVE_EVENT), 5400));
    };
    const onBack = (): void => {
      // ?from= 回赠：把对方的来源标识原样带回，再放飞一次（不回显任意输入）。
      this.ctx?.analytics.track('USER_SHARE', { site: this.id, action: 'hug_back' });
      this.onEvent(BACK_EVENT);
      startFlight();
    };
    const onShare = (): void => {
      // ?from= 回赠闭环的发送端：复制带来源标识的站内链接，零 PII、零外部请求。
      const url = String(this.ctx?.store.shareUrl ?? '');
      if (url && navigator.clipboard?.writeText) {
        try {
          void navigator.clipboard.writeText(url)
            .then(() => this.setStatus('Link copied. Send it to someone.'))
            .catch(() => this.setStatus(url)); // 权限被拒：静默降级为展示链接，无未处理拒绝
        } catch {
          this.setStatus(url); // 同步抛错同样兜底（与 onMic / analytics 的静默降级哲学一致）
        }
      } else if (url) this.setStatus(url);
      this.ctx?.analytics.track('USER_SHARE', { site: this.id, action: 'copy_hug_link' });
    };
    const onMic = (): void => {
      // 只在用户显式点击后请求麦克风；失败静默保持按钮兜底。
      void this.parts?.blow.enable();
      if (mic) mic.textContent = 'Mic on';
    };
    const onListen = (): void => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyM', key: 'm', bubbles: true }));
    };
    const onLeave = (): void => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
    };

    act?.addEventListener('click', startFlight);
    back?.addEventListener('click', onBack);
    share?.addEventListener('click', onShare);
    mic?.addEventListener('click', onMic);
    listen?.addEventListener('click', onListen);
    leave?.addEventListener('click', onLeave);
    this.cleanup.push(
      () => act?.removeEventListener('click', startFlight),
      () => back?.removeEventListener('click', onBack),
      () => share?.removeEventListener('click', onShare),
      () => mic?.removeEventListener('click', onMic),
      () => listen?.removeEventListener('click', onListen),
      () => leave?.removeEventListener('click', onLeave),
    );

    // ?from= 来源存在时显示回赠入口（由 bridge 写入 ctx.store）。
    if (typeof this.ctx?.store.fromSource === 'string' && back) {
      back.hidden = false;
      back.textContent = HUG_COPY.backEn;
    }
    this.setStatus(HUG_COPY.readyZh);
  }

  start(): void { this.bridge?.start(); }
  pause(): void { this.bridge?.pause(); }
  getScene(): NonNullable<RuntimeContext['scene']> {
    if (!this.ctx) throw new Error('[hug] getScene 在 init 之前被调用');
    return this.ctx.scene;
  }

  onEvent(event: AppEvent, payload?: unknown): void {
    const next = this.state.send(event, payload) as HugState;
    if (next === 'ready' && event === BACK_EVENT) {
      const back = this.container?.querySelector<HTMLElement>('#back');
      if (back) back.hidden = typeof this.ctx?.store.fromSource !== 'string';
    }
  }

  private onFrame(seconds: number): void {
    if (!this.parts) return;
    const stage = document.getElementById('stage') as HTMLCanvasElement | null;
    if (stage) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.floor(stage.clientWidth * dpr), h = Math.floor(stage.clientHeight * dpr);
      if (stage.width !== w || stage.height !== h) { stage.width = w; stage.height = h; }
    }
    this.parts.dandelion.update(seconds);
    this.parts.flight.update(seconds);
  }

  private setStatus(text: string): void {
    const el = this.container?.querySelector<HTMLElement>('#status');
    if (el) el.textContent = text;
  }

  dispose(): void {
    if (this.disposed) return;
    for (const id of this.timers) window.clearTimeout(id);
    this.timers = [];
    this.bridge?.dispose();
    for (const fn of this.cleanup) fn();
    this.cleanup = [];
    this.parts?.dandelion.dispose(); this.parts?.blow.dispose(); this.parts?.flight.dispose();
    this.ctx?.analytics.flush();
    this.disposed = true;
  }
}

export function createHugApp(): HugApp { return new HugApp(); }
