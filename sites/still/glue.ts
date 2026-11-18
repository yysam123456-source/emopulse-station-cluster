// /still glue：实现 SiteApp 七方法 + 静坐计时 + 零件挂载位（自研第 4 件事）。
import { createFrameBridge, stateEvent, type FrameBridge } from '../../shared/contract/index';
import type {
  AppEvent, PartRef, RuntimeContext, SiteApp, SiteConfig, SiteId, StateMachine,
} from '../../shared/contract/index';
import { bucketDuration } from '../../shared/contract/analytics';
import { STILL_COPY } from '../../content/still';
import { createStillState, LEAVE_EVENT, type StillState } from './state';

/** 零件统一包装接口：原件不改，站点 parts/ 提供 create 工厂。 */
export interface PartInstance {
  update(seconds: number): void;
  dispose(): void;
}

export type PartFactory = (options: Record<string, unknown>) => PartInstance;

const partFactories = new Map<string, PartFactory>();

/**
 * 注册零件工厂。
 *
 * **⚠️ 未接线 · 当前零调用点**：全仓没有任何地方调用它（`still.site.config.ts` 的
 * `parts: []` 也是空数组，`mountPart()` 的循环从不迭代）。保留它是因为它是
 * 「按配置挂载零件」这条路唯一的**可用参考实现**——`mountPart()` 在工厂缺失时**抛错**
 * （fail-fast），而 `license` / `praise` / `hug` 三站把它抄成了
 * `ctx.store.partFactories`（无人写）+ `if (ref.enabled && factory)`（静默跳过），
 * 于是同一个洞在三站静默存活了很久。Q-01 已裁定删除三站的挂载循环，将来若要接通，
 * 参考本文件的写法，不要参考那三站。
 * @param {string} id 零件 id
 * @param {PartFactory} factory 工厂
 */
export function registerPartFactory(id: string, factory: PartFactory): void {
  partFactories.set(id, factory);
}

/** 已装载的零件实例——唯一的零件挂载位，存在于 ctx.store.parts。 */
function mountedParts(ctx: RuntimeContext): Map<string, PartInstance> {
  let parts = ctx.store.parts as Map<string, PartInstance> | undefined;
  if (!parts) {
    parts = new Map<string, PartInstance>();
    ctx.store.parts = parts;
  }
  return parts;
}

export class StillApp implements SiteApp {
  readonly id: SiteId = 'still';

  private config: SiteConfig | null = null;
  private ctx: RuntimeContext | null = null;
  private bridge: FrameBridge | null = null;
  private container: HTMLElement | null = null;
  private state = createStillState();
  private cleanup: Array<() => void> = [];
  private sitStartedAt = 0;
  private lastBucket = -1;
  private disposed = false;

  /** ② init：读配置、装载启用零件、装载状态定义、订阅进入/退出。 */
  init(config: SiteConfig, ctx: RuntimeContext): void {
    this.config = config;
    this.ctx = ctx;
    // 状态机由 Runtime / 浏览器侧 glue 注入（IoC），不在 SiteApp 内部私自 new。
    this.state = (ctx.state ?? createStillState()) as unknown as StateMachine<StillState>;

    const parts = mountedParts(ctx);
    for (const ref of config.parts) {
      this.mountPart(ref, parts);
    }

    // 进入静坐开始计时；退出静坐结算并上报分桶（唯一轻量反馈）。
    this.state.onEnter('sitting', () => {
      this.sitStartedAt = Date.now();
      this.lastBucket = -1;
      ctx.analytics.startTimer('sit_duration');
      ctx.analytics.track('USER_INTERACT', { site: this.id, action: 'sit' });
      this.updateTimerText(0);
    });
    this.state.onExit('sitting', () => {
      const seconds = ctx.analytics.stopTimer('sit_duration');
      ctx.analytics.track('ANALYTICS_TICK', {
        site: this.id,
        kind: 'sit_complete',
        seconds,
        bucket: bucketDuration(seconds),
      });
      this.sitStartedAt = 0;
      this.updateTimerText(0);
    });

    this.bridge = createFrameBridge({ onFrame: () => this.onFrame(), app: this });
  }

  /** 逐个装载 enabled 零件，缺工厂时明确报错，避免静默漏装。 */
  private mountPart(ref: PartRef, parts: Map<string, PartInstance>): void {
    if (!ref.enabled) return;
    const factory = partFactories.get(ref.source);
    if (!factory) throw new Error(`[still] 零件工厂未注册：${ref.source}（id=${ref.id}）`);
    parts.set(ref.id, factory(ref.options ?? {}));
  }

  /** ③ mount：模板 DOM 已存在，这里只绑定控制项与轻量计时显示。 */
  mount(container: HTMLElement): void {
    if (this.disposed) return;
    this.container = container;
    const sit = container.querySelector<HTMLElement>('#d');
    const listen = container.querySelector<HTMLElement>('#listen');
    const leave = container.querySelector<HTMLElement>('#leave');

    const onSit = (): void => { this.onEvent('USER_INTERACT', { action: 'sit' }); };
    const onListen = (): void => {
      this.onEvent('USER_INTERACT', { action: 'listen' });
      // core 的 KeyM 切换静音（菜单中同样有效）；不改 core，一行派发完成桥接。
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyM', key: 'm', bubbles: true }));
    };
    const onLeave = (): void => {
      this.onEvent(LEAVE_EVENT, { action: 'leave' });
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
    };

    sit?.addEventListener('click', onSit);
    listen?.addEventListener('click', onListen);
    leave?.addEventListener('click', onLeave);
    this.cleanup.push(() => sit?.removeEventListener('click', onSit));
    this.cleanup.push(() => listen?.removeEventListener('click', onListen));
    this.cleanup.push(() => leave?.removeEventListener('click', onLeave));

    // core 点击 Sit 后会把按钮文案改为 'Resume'；用 DOM 适配改回本站文案，不动 core 源码。
    if (sit) {
      const observer = new MutationObserver(() => {
        if (sit.textContent === 'Resume') sit.textContent = STILL_COPY.controls[0].labelEn;
      });
      observer.observe(sit, { childList: true, characterData: true, subtree: true });
      this.cleanup.push(() => observer.disconnect());
    }

    // 静坐计时是唯一轻量反馈：初始显示副文案，进入 sitting 后切换为 mm:ss。
    this.updateTimerText(0);
  }

  /** ④ start：驱动帧桥（零件 update 在此发生）。 */
  start(): void {
    this.bridge?.start();
  }

  /** ⑤ pause：离开渲染循环。 */
  pause(): void {
    this.bridge?.pause();
  }

  /** ⑥ getScene：暴露场景给 core 渲染。 */
  getScene(): NonNullable<RuntimeContext['scene']> {
    if (!this.ctx) throw new Error('[still] getScene 在 init 之前被调用');
    return this.ctx.scene;
  }

  /** ⑦ 统一事件入口：驱动状态机 → 更新零件 → 埋点。 */
  onEvent(event: AppEvent, payload?: unknown): void {
    const next = this.state.send(event, payload) as StillState;
    if (next === 'sitting' && event === 'USER_INTERACT') {
      this.updateTimerText(0);
    }
    if (event === 'ANALYTICS_TICK' && next === 'sitting') this.reportBucket();
    if (event === LEAVE_EVENT && this.ctx) {
      this.ctx.analytics.track('APP_PAUSE', { site: this.id, action: 'leave' });
    }
  }

  /** 每 30 秒分桶上报静坐时长（无人打扰的轻量反馈）。 */
  private reportBucket(): void {
    if (!this.ctx) return;
    const seconds = (Date.now() - this.sitStartedAt) / 1000;
    const bucket = Math.floor(seconds / 30);
    if (bucket <= this.lastBucket) return;
    this.lastBucket = bucket;
    this.ctx.analytics.track('ANALYTICS_TICK', {
      site: this.id,
      kind: 'sit_tick',
      bucket: bucketDuration(seconds),
    });
  }

  /** 每帧更新零件与静坐计时文本。 */
  private onFrame(): void {
    if (!this.ctx) return;
    for (const part of mountedParts(this.ctx).values()) part.update((Date.now() - this.sitStartedAt) / 1000);
    if (this.sitStartedAt > 0) this.updateTimerText((Date.now() - this.sitStartedAt) / 1000);
  }

  /** 静坐计时显示 mm:ss（唯一轻量反馈，无任务、无进度条、无消费引导）。 */
  private updateTimerText(seconds: number): void {
    const el = this.container?.querySelector<HTMLElement>('#sit-timer');
    if (!el) return;
    if (seconds <= 0) {
      el.textContent = STILL_COPY.noteZh;
      return;
    }
    const total = Math.floor(seconds);
    const mm = String(Math.floor(total / 60)).padStart(2, '0');
    const ss = String(total % 60).padStart(2, '0');
    el.textContent = `${mm}:${ss}`;
  }

  /** ⑧ dispose：释放零件、监听、帧桥，站点热切换不泄漏。 */
  dispose(): void {
    if (this.disposed) return;
    this.bridge?.dispose();
    for (const fn of this.cleanup) fn();
    this.cleanup = [];
    if (this.ctx) {
      for (const part of mountedParts(this.ctx).values()) part.dispose();
      mountedParts(this.ctx).clear();
      this.ctx.analytics.flush();
    }
    this.container = null;
    this.disposed = true;
  }
}

/** 工厂：供 Runtime 注册与浏览器侧桥接共用。 */
export function createStillApp(): StillApp {
  return new StillApp();
}

/** 便于 T04 参考的站点事件名（当前只使用 LEAVE_EVENT）。 */
export const STILL_EVENTS = {
  LEAVE: LEAVE_EVENT,
  RETURN: stateEvent('RETURN'),
} as const;
