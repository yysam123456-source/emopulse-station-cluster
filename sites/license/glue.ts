// /license glue：SiteApp 七方法 + 盖章/时间轴/纸纹/飞走四零件联动 + Canvas 导出。
import { createFrameBridge, type FrameBridge } from '../../shared/contract/index';
import type { AppEvent, RuntimeContext, SiteApp, SiteConfig, SiteId, StateMachine } from '../../shared/contract/index';
import { LICENSE_COPY, makeSerial, formatDate } from '../../content/license';
import { createLicenseState, VERIFY_EVENT, APPROVE_EVENT, RESET_EVENT, type LicenseState } from './state';
import {
  createPaperPart, createTimelinePart, createStampPart, createPlanePart,
} from './parts/index';
import { renderLicense, downloadLicense } from './export';

interface LicenseParts {
  paper: ReturnType<typeof createPaperPart>;
  timeline: ReturnType<typeof createTimelinePart>;
  stamp: ReturnType<typeof createStampPart>;
  plane: ReturnType<typeof createPlanePart>;
}

export class LicenseApp implements SiteApp {
  readonly id: SiteId = 'license';

  private config: SiteConfig | null = null;
  private ctx: RuntimeContext | null = null;
  private state: StateMachine = createLicenseState();
  private bridge: FrameBridge | null = null;
  private container: HTMLElement | null = null;
  private parts: LicenseParts | null = null;
  private cleanup: Array<() => void> = [];
  private timers: number[] = [];
  private serial = '';
  private dataUrl = '';
  private disposed = false;

  init(config: SiteConfig, ctx: RuntimeContext): void {
    this.config = config;
    this.ctx = ctx;
    this.state = (ctx.state ?? createLicenseState()) as unknown as StateMachine;
    const stage = document.getElementById('stage') as HTMLCanvasElement | null;
    if (!stage) throw new Error('[license] 站点模板缺少 #stage canvas');
    const c = stage.getContext('2d');
    if (!c) throw new Error('[license] 无法取得 2D 上下文');

    this.parts = {
      paper: createPaperPart(c),
      timeline: createTimelinePart(c),
      stamp: createStampPart(c),
      plane: createPlanePart(c),
    };
    // 注：`site.config.ts` 的 parts[] 只**声明本站装了什么**（供门 2 / 死引用 / 许可普查读取），
    // **不承诺可挂载**。原来的通用挂载循环（遍历 parts[] 取 ctx.store.partFactories）已删除：
    // 它读的 `ctx.store.partFactories` 全仓无写入点（QUARANTINE.md Q-01），永不生效。
    // 新增零件必须在此处加一个硬编码槽位。

    this.state.onEnter('verifying', () => this.setStatus(LICENSE_COPY.stageZh[0]));
    this.state.onEnter('stamping', () => this.setStatus(LICENSE_COPY.stageZh[1]));
    this.state.onEnter('approved', () => {
      this.setStatus(`${LICENSE_COPY.stageZh[2]} · ${this.serial}`);
      ctx.analytics.track('USER_COMPLETE', { site: this.id, action: 'license_approved' });
      const download = this.container?.querySelector<HTMLElement>('#download');
      if (download) download.hidden = false;
    });
    this.bridge = createFrameBridge({ onFrame: (t) => this.onFrame(t), app: this });
  }

  mount(container: HTMLElement): void {
    this.container = container;
    const act = container.querySelector<HTMLElement>('#act');
    const download = container.querySelector<HTMLElement>('#download');
    const listen = container.querySelector<HTMLElement>('#listen');
    const leave = container.querySelector<HTMLElement>('#leave');

    const onAct = (): void => {
      if (this.state.current() !== 'idle') return;
      this.serial = makeSerial();
      this.onEvent('USER_INTERACT', { action: 'stamp' });
      // 审查时间轴：verifying → stamping → approved（零件内部状态由 glue 对齐）。
      this.timers.push(window.setTimeout(() => {
        this.parts?.timeline.setStage(1);
        this.parts?.stamp.strike();
        this.onEvent(VERIFY_EVENT);
      }, 700));
      this.timers.push(window.setTimeout(() => {
        this.parts?.timeline.setStage(2);
        this.parts?.plane.launch();
        this.onEvent(APPROVE_EVENT);
      }, 1900));
    };
    const onDownload = (): void => {
      if (!this.dataUrl) {
        this.dataUrl = renderLicense({ serial: this.serial, date: formatDate() });
      }
      downloadLicense(this.dataUrl, this.serial);
      this.ctx?.analytics.track('USER_SHARE', { site: this.id, action: 'save_license' });
    };
    const onListen = (): void => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyM', key: 'm', bubbles: true }));
    };
    const onLeave = (): void => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
      this.onEvent(RESET_EVENT);
    };

    act?.addEventListener('click', onAct);
    download?.addEventListener('click', onDownload);
    listen?.addEventListener('click', onListen);
    leave?.addEventListener('click', onLeave);
    this.cleanup.push(
      () => act?.removeEventListener('click', onAct),
      () => download?.removeEventListener('click', onDownload),
      () => listen?.removeEventListener('click', onListen),
      () => leave?.removeEventListener('click', onLeave),
    );
    this.setStatus(LICENSE_COPY.hookZh);
  }

  start(): void { this.bridge?.start(); }
  pause(): void { this.bridge?.pause(); }
  getScene(): NonNullable<RuntimeContext['scene']> {
    if (!this.ctx) throw new Error('[license] getScene 在 init 之前被调用');
    return this.ctx.scene;
  }

  onEvent(event: AppEvent, payload?: unknown): void {
    const next = this.state.send(event, payload) as LicenseState;
    if (next === 'idle') {
      this.parts?.timeline.setStage(0);
      const download = this.container?.querySelector<HTMLElement>('#download');
      if (download) download.hidden = true;
      this.dataUrl = '';
      this.serial = '';
    }
  }

  private onFrame(seconds: number): void {
    if (!this.parts) return;
    const stage = document.getElementById('stage') as HTMLCanvasElement | null;
    if (stage) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.floor(stage.clientWidth * dpr), h = Math.floor(stage.clientHeight * dpr);
      if (stage.width !== w || stage.height !== h) { stage.width = w; stage.height = h; }
      const c = stage.getContext('2d');
      if (c) c.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    this.parts.paper.update(seconds);
    this.parts.timeline.update(seconds);
    this.parts.stamp.update(seconds);
    this.parts.plane.update(seconds);
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
    this.parts?.paper.dispose(); this.parts?.timeline.dispose();
    this.parts?.stamp.dispose(); this.parts?.plane.dispose();
    this.ctx?.analytics.flush();
    this.disposed = true;
  }
}

export function createLicenseApp(): LicenseApp { return new LicenseApp(); }
