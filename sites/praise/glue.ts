// /praise glue：SiteApp 七方法 + 指针拨开 / 纸层 / 热敏纸 / 打字机 + 小票导出。
import { createFrameBridge, type FrameBridge } from '../../shared/contract/index';
import type { AppEvent, RuntimeContext, SiteApp, SiteConfig, SiteId, StateMachine } from '../../shared/contract/index';
import { PRAISE_COPY, makeTicket, type PraiseTicket } from '../../content/praise';
import { createPraiseState, PEEK_EVENT, PRINT_EVENT, EXPORT_EVENT, type PraiseState } from './state';
import {
  createReceiptPaperPart, createLayersPart, createPointerPart, createTypewriterPart,
} from './parts/index';
import { renderReceipt, downloadReceipt } from './export';

interface PraiseParts {
  paper: ReturnType<typeof createReceiptPaperPart>;
  layers: ReturnType<typeof createLayersPart>;
  pointer: ReturnType<typeof createPointerPart>;
  typer: ReturnType<typeof createTypewriterPart>;
}

export class PraiseApp implements SiteApp {
  readonly id: SiteId = 'praise';

  private config: SiteConfig | null = null;
  private ctx: RuntimeContext | null = null;
  private state: StateMachine = createPraiseState();
  private bridge: FrameBridge | null = null;
  private container: HTMLElement | null = null;
  private parts: PraiseParts | null = null;
  private cleanup: Array<() => void> = [];
  private ticket: PraiseTicket | null = null;
  private dataUrl = '';
  private disposed = false;

  init(config: SiteConfig, ctx: RuntimeContext): void {
    this.config = config;
    this.ctx = ctx;
    this.state = (ctx.state ?? createPraiseState()) as unknown as StateMachine;
    const stage = document.getElementById('stage') as HTMLCanvasElement | null;
    if (!stage) throw new Error('[praise] 站点模板缺少 #stage canvas');
    const c = stage.getContext('2d');
    if (!c) throw new Error('[praise] 无法取得 2D 上下文');
    this.parts = {
      paper: createReceiptPaperPart(c),
      layers: createLayersPart(c),
      pointer: createPointerPart(c),
      typer: createTypewriterPart(c),
    };
    // 注：`site.config.ts` 的 parts[] 只**声明本站装了什么**（供门 2 / 死引用 / 许可普查读取），
    // **不承诺可挂载**。原来的通用挂载循环（遍历 parts[] 取 ctx.store.partFactories）已删除：
    // 它读的 `ctx.store.partFactories` 全仓无写入点（QUARANTINE.md Q-01），永不生效。
    // 新增零件必须在此处加一个硬编码槽位。

    this.state.onEnter('peeking', () => this.setStatus(PRAISE_COPY.peekZh));
    this.state.onEnter('printing', () => {
      this.setStatus('PRINTING…');
      this.ticket = makeTicket(Date.now());
      this.parts?.typer.setLines([
        PRAISE_COPY.header,
        this.ticket.opener,
        this.ticket.middle,
        this.ticket.closer,
        `NO. ${this.ticket.serial}   ${this.ticket.stamp}`,
      ]);
      ctx.analytics.track('USER_COMPLETE', { site: this.id, action: 'printing' });
    });
    this.state.onEnter('exported', () => {
      this.setStatus(PRAISE_COPY.exportedZh);
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
      if (this.state.current() !== 'idle' && this.state.current() !== 'exported') return;
      this.ticket = null;
      this.dataUrl = '';
      if (this.state.current() === 'exported') this.onEvent(EXPORT_EVENT);
      this.onEvent('USER_INTERACT', { action: 'print' });
    };
    const onDownload = (): void => {
      if (!this.ticket) return;
      if (!this.dataUrl) this.dataUrl = renderReceipt(this.ticket);
      downloadReceipt(this.dataUrl, this.ticket.serial);
      this.ctx?.analytics.track('USER_SHARE', { site: this.id, action: 'save_receipt' });
    };
    const onListen = (): void => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyM', key: 'm', bubbles: true }));
    };
    const onLeave = (): void => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
      if (this.state.current() === 'exported') this.onEvent(EXPORT_EVENT);
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
    this.setStatus(PRAISE_COPY.hookZh);
  }

  start(): void { this.bridge?.start(); }
  pause(): void { this.bridge?.pause(); }
  getScene(): NonNullable<RuntimeContext['scene']> {
    if (!this.ctx) throw new Error('[praise] getScene 在 init 之前被调用');
    return this.ctx.scene;
  }

  onEvent(event: AppEvent, payload?: unknown): void {
    const next = this.state.send(event, payload) as PraiseState;
    if (next === 'idle') {
      this.parts?.layers.setOpen(0);
      this.ticket = null;
      this.dataUrl = '';
      const download = this.container?.querySelector<HTMLElement>('#download');
      if (download) download.hidden = true;
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
    this.parts.paper.update(seconds);
    const amount = this.state.current() === 'idle' ? 0 : Math.abs(this.parts.pointer.ndc[0]) * 0.9;
    this.parts.layers.setOpen(amount);
    this.parts.layers.update(seconds);
    this.parts.pointer.update(seconds);
    this.parts.typer.update(seconds);
    if (this.state.current() === 'peeking' && Math.abs(this.parts.pointer.ndc[0]) > 0.35) {
      this.onEvent(PEEK_EVENT);
    }
    if (this.state.current() === 'printing' && this.parts.typer.done) this.onEvent(PRINT_EVENT);
  }

  private setStatus(text: string): void {
    const el = this.container?.querySelector<HTMLElement>('#status');
    if (el) el.textContent = text;
  }

  dispose(): void {
    if (this.disposed) return;
    this.bridge?.dispose();
    for (const fn of this.cleanup) fn();
    this.cleanup = [];
    this.parts?.paper.dispose(); this.parts?.layers.dispose();
    this.parts?.pointer.dispose(); this.parts?.typer.dispose();
    this.ctx?.analytics.flush();
    this.disposed = true;
  }
}

export function createPraiseApp(): PraiseApp { return new PraiseApp(); }
