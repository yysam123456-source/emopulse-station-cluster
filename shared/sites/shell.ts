// 站点壳的宿主 —— **真正上线的那个宿主**（`shared/stage/preview/host.ts` 只是预览用）。
//
// 为什么壳必须自己实现一遍输入边界（T20）：
//   预览宿主修好了不代表线上修好了。同一个 bug 在壳里复发 = 没修。
//   所以这里逐条复刻并**在壳上重跑同一组断言**（`tests/input-boundary.mjs` 两个页面都跑）。
//
// 输入边界四条（缺一不可）：
//   ① 世界只接收**画布上**的指针：`event.target !== canvas` 一律不转发
//   ② UI 若要引起世界变化，由壳**显式** `stage.setPointer` 表达（`cta` 注入，保证恰好一帧）
//   ③ `pointerup` 不过滤且总是释放（否则 down 卡死，比不响应更糟）
//   ④ 模态 UI（Esc 菜单）打开期间，画布上的指针也不转发
//
// ★ 介质前提（§2.5b）：壳本身不画任何东西，它是"宿主"；所有像素来自零件。
//   壳唯一能影响观感的是 `--stage-veil`（页面底色），它必须与 L0 的介质同色 ——
//   否则 L1 失败时会露出白底（那一条 `/still` 尤其致命）。
import {
  createStage,
  type BlendMode,
  type BiomeId,
  type Lod,
  type PartLayer,
  type PartV2,
  type Stage,
} from '../stage/index';

/** 站点配置（生成期写死进 HTML）。 */
export interface SiteConfig {
  readonly slug: string;
  readonly title: string;
  /** 首屏一行说明（L5 内容由 T13 接管，这里先占位） */
  readonly lead: string;
  /** 主按钮文案（缺省表示本站在这一版没有 CTA） */
  readonly cta: string | null;
  readonly biome: BiomeId;
  readonly seed: number;
  readonly budgetMs: number;
  readonly glBlend: BlendMode | null;
  readonly hasGl: boolean;
  /** L0 画的是"一张纸"时，L5 文案要落在纸内（纸的几何由 `paper-ink` 的 `SHEET_ASPECT` 决定） */
  readonly paperSheet?: boolean;
}

/** 站点快照（供 CDP / 测试读取）。 */
export interface SiteSnapshot {
  readonly slug: string;
  readonly state: 'ready' | 'degraded';
  readonly lod: Lod;
  readonly order: readonly string[];
  readonly drawn: number;
  readonly frames: number;
  readonly fps: number;
  readonly cpuMs: number;
  readonly degraded: readonly { id: string; layer: PartLayer; reason: string; detail: string }[];
  /** 主按钮是否已经可以按（L5 的显示时机由壳决定，先暴露成数据） */
  readonly ctaEnabled: boolean;
  /** 世界是否被按过（`/hug` 一次即不可逆，壳用它决定后续） */
  readonly tapped: boolean;
}

/** 壳暴露给外部的句柄。 */
export interface SiteHandle {
  readonly stage: Stage;
  readonly config: SiteConfig;
  snapshot(): SiteSnapshot;
  /** UI 意图 → 一次世界级按下（绑 click，覆盖鼠标/触屏/键盘回车） */
  tap(nx?: number, ny?: number): void;
  /** 模态开关（Esc 菜单） */
  setModal(open: boolean): void;
  /** 每帧回调：时间来自 `stage.frame`（站内不许自持时钟） */
  onFrame(fn: (t: number, dt: number) => void): void;
}

/** 调试条刷新间隔（毫秒）。 */
const DEBUG_INTERVAL_MS = 220;

/**
 * 取一个必定存在的元素。
 *
 * @param id 元素 id
 * @returns 元素
 */
function requireElement<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`壳缺少 #${id}（模板与宿主不同步）`);
  return node as unknown as T;
}

/**
 * 启动一个站点。
 *
 * @param parts 已静态 import 的零件定义
 * @param config 站点配置
 * @returns 句柄；启动失败返回 null（错误写进 #boot-error，页面可截图取证）
 */
export function boot(parts: readonly PartV2[], config: SiteConfig): SiteHandle | null {
  const canvas = requireElement<HTMLCanvasElement>('stage');
  const glCanvas = config.hasGl ? requireElement<HTMLCanvasElement>('gl') : null;
  const dbg = requireElement<HTMLElement>('dbg');
  const errBox = document.getElementById('boot-error');
  const cta = document.getElementById('cta');
  const menu = document.getElementById('menu');

  if (document.body) {
    document.body.dataset.state = 'booting';
    // 调试条只在 `?debug` 时出现：它是开发工具，默认不该出现在产品画面里
    document.body.dataset.debug = /(?:^|[?&])debug\b/.test(window.location.search) ? 'on' : 'off';
  }

  let stage: Stage;
  try {
    stage = createStage({
      canvas,
      glCanvas,
      parts,
      biome: config.biome,
      seed: config.seed,
      budgetMs: config.budgetMs,
      glBlend: config.glBlend === null ? undefined : config.glBlend,
      reducedMotion: typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (errBox) {
      errBox.hidden = false;
      errBox.textContent = `启动失败：${message}`;
    }
    if (document.body) document.body.dataset.state = 'failed';
    dbg.textContent = `state failed · ${message}`;
    return null;
  }

  const layerOf = new Map<string, PartLayer>();
  for (const part of parts) layerOf.set(part.id, part.layer);
  const orderLabel = stage.order.map((id) => `${layerOf.get(id) ?? '?'}:${id}`).join(' → ');

  // ── 指针状态（①③④ 的实现都在这一段）──
  let nx = 0.5;
  let ny = 0.5;
  let down = false;
  let uiModalOpen = false;
  let pendingTap = false;
  let tapped = false;

  /** 推一次指针状态给舞台。 */
  const pushPointer = (): void => {
    stage.setPointer(nx, ny, down);
  };

  window.addEventListener('pointermove', (event: PointerEvent) => {
    // ① 位置也只从画布来：UI 上的移动不该带着世界视差走
    if (event.target !== canvas || uiModalOpen) return;   // 或，不是与（见 host.ts 同处注释）
    const w = canvas.clientWidth > 0 ? canvas.clientWidth : window.innerWidth;
    const h = canvas.clientHeight > 0 ? canvas.clientHeight : window.innerHeight;
    nx = Math.min(1, Math.max(0, event.clientX / (w > 0 ? w : 1)));
    ny = Math.min(1, Math.max(0, event.clientY / (h > 0 ? h : 1)));
    pushPointer();
  }, { passive: true });

  window.addEventListener('pointerdown', (event: PointerEvent) => {
    if (event.target !== canvas) return; // ①
    if (uiModalOpen) return;             // ④
    down = true;
    tapped = true;
    pushPointer();
  }, { passive: true });

  window.addEventListener('pointerup', () => {
    // ③ 不过滤、总是释放
    down = false;
    pushPointer();
  }, { passive: true });

  /** ② UI 意图 → 一次世界级按下（只有一帧为 true）。 */
  function tap(tapX?: number, tapY?: number): void {
    if (typeof tapX === 'number' && Number.isFinite(tapX)) nx = Math.min(1, Math.max(0, tapX));
    if (typeof tapY === 'number' && Number.isFinite(tapY)) ny = Math.min(1, Math.max(0, tapY));
    pendingTap = true;
    tapped = true;
  }

  function setModal(open: boolean): void {
    uiModalOpen = open === true;
    if (menu) menu.hidden = !uiModalOpen;
    if (document.body) document.body.dataset.modal = uiModalOpen ? 'open' : 'closed';
    if (uiModalOpen) {
      down = false;
      pushPointer();
    }
  }

  // 主按钮：**绑 click**（覆盖鼠标 / 触屏 / 键盘回车与空格）—— 键盘用户唯一的路径
  // 主按钮的通道由 `data-channel` 决定：
  //   · `world-inject`（/hug）→ 注入一次世界按下
  //   · 其它（/license 的 'Stamp it'：盖章是站点作用域的因果）→ 只派发 DOM 事件
  const frameHooks: ((t: number, dt: number) => void)[] = [];
  if (cta) {
    const channel = cta.getAttribute('data-channel');
    cta.addEventListener('click', () => {
      if (uiModalOpen) return;
      if (channel === 'world-inject') tap();
      else window.dispatchEvent(new CustomEvent('site:cta'));
    });
  }

  // Esc 菜单：模态期间世界不接收指针（④）
  window.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Escape') setModal(!uiModalOpen);
  });

  /**
   * 把纸的几何算成 CSS 变量（与 `paper-ink` 的布局公式**必须一致**）。
   *
   * 为什么放在壳里：L5 是 DOM，它不知道画布里的纸在哪。而"文字只能落在纸内或 UI 层"是产品红线。
   * 两边算同一个公式 = 一个隐式耦合，所以这里把公式抄成一行注释，并让 `paper-visual` 的
   * 实测比例（1.415）与 `SHEET_ASPECT` 互相印证 —— 任何一边改了，另一边的门会红。
   */
  function layoutSheet(): void {
    if (!config.paperSheet || !document.body) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const aspect = 1.4142;
    let h = vh * 0.90;
    let w = h * aspect;
    const maxW = vw * 0.82;
    if (w > maxW) {
      w = maxW;
      h = w / aspect;
    }
    const x = (vw - w) / 2;
    const y = (vh - h) / 2;
    const root = document.documentElement;
    root.style.setProperty('--sheet-x', `${x}px`);
    root.style.setProperty('--sheet-y', `${y}px`);
    root.style.setProperty('--sheet-w', `${w}px`);
    root.style.setProperty('--sheet-h', `${h}px`);
    document.body.dataset.sheet = 'on';
  }

  // ── 尺寸 ──
  const onResize = (): void => {
    layoutSheet();
    stage.resize(
      window.innerWidth > 0 ? window.innerWidth : canvas.clientWidth,
      window.innerHeight > 0 ? window.innerHeight : canvas.clientHeight,
      window.devicePixelRatio > 0 ? window.devicePixelRatio : 1,
    );
    pushPointer();
  };
  layoutSheet();
  window.addEventListener('resize', onResize, { passive: true });

  // ── 帧循环 ──
  let lastPaint = -Infinity;
  let frameMs = 0;
  let prevTs = -1;

  const currentLod = (): Lod => {
    for (let i = 0; i < stage.degraded.length; i += 1) {
      if (stage.degraded[i].reason === 'budget') return 'low';
    }
    return 'high';
  };

  function paint(ts: number): void {
    if (ts - lastPaint < DEBUG_INTERVAL_MS) return;
    lastPaint = ts;
    const stats = stage.stats;
    const degraded = stage.degraded;
    const state = degraded.length === 0 ? 'ready' : 'degraded';
    const lines: string[] = [];
    lines.push(
      `state ${state}   lod ${currentLod()}   fps ${stats.fps.toFixed(0)}`
      + `   frame ${frameMs.toFixed(1)}ms   cpu ${stats.cpuMs.toFixed(2)}ms`
      + `   drawn ${stats.drawn}/${parts.length}   budget ${stats.budgetMs.toFixed(1)}ms`,
    );
    lines.push(`order ${orderLabel}`);
    for (let i = 0; i < degraded.length; i += 1) {
      const entry = degraded[i];
      lines.push(`degraded ${entry.id} ${entry.layer} [${entry.reason}] ${entry.detail}`);
    }
    dbg.textContent = lines.join('\n');
    if (document.body) document.body.dataset.state = state;
  }

  function tick(ts: number): void {
    const delta = prevTs >= 0 ? ts - prevTs : 1000 / 60;
    prevTs = ts;
    frameMs = frameMs === 0 ? delta : frameMs * 0.9 + delta * 0.1;
    // 注入的按下：frame 前置 true、frame 后立刻释放 —— 零件看到恰好一个上升沿
    if (pendingTap) stage.setPointer(nx, ny, true);
    stage.frame(ts);
    if (pendingTap) {
      pendingTap = false;
      stage.setPointer(nx, ny, false);
    }
    // 站内每帧回调：时间与 dt 都取自世界帧，**不是自持时钟**
    const world = stage.world.frame;
    for (let i = 0; i < frameHooks.length; i += 1) frameHooks[i](world.t, world.dt);
    paint(ts);
    requestAnimationFrame(tick);
  }

  const handle: SiteHandle = {
    stage,
    config,
    snapshot(): SiteSnapshot {
      const stats = stage.stats;
      const degraded = stage.degraded.map((entry) => ({
        id: entry.id,
        layer: entry.layer,
        reason: entry.reason,
        detail: entry.detail,
      }));
      return {
        slug: config.slug,
        state: degraded.length === 0 ? 'ready' : 'degraded',
        lod: currentLod(),
        order: stage.order.slice(),
        drawn: stats.drawn,
        frames: stats.frames,
        fps: stats.fps,
        cpuMs: stats.cpuMs,
        degraded,
        ctaEnabled: config.cta !== null,
        tapped,
      };
    },
    tap,
    setModal,
    onFrame(fn: (t: number, dt: number) => void): void {
      frameHooks.push(fn);
    },
  };

  (globalThis as unknown as { __site?: SiteHandle }).__site = handle;
  requestAnimationFrame(tick);
  return handle;
}

export default boot;
