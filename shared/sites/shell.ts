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
import { createAmbience, type Ambience } from './audio';
import { COPY } from './copy.mjs';

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
  /** 自动降分辨率下限；纸面站用它保清晰度（0.55–1，缺省 0.55）。 */
  readonly minRenderScale?: number;
  readonly glBlend: BlendMode | null;
  /** 站内自持声音时关掉壳的通用环境声（/koi 的原作水声/音乐）。 */
  readonly ambience?: boolean;
  readonly hasGl: boolean;
  /** L0 画的是"一张纸"时，L5 文案要落在纸内（纸的几何由 `paper-ink` 的 `SHEET_ASPECT` 决定） */
  readonly paperSheet?: boolean;
  /** 菜单 About 的一句（来自 COPY/UI，不在壳里现编） */
  readonly privacy: string;
  /** 菜单 Credits 的一句（来自 COPY/UI） */
  readonly credits: string;
}

/** 站点快照（供 CDP / 测试读取）。 */
export interface SiteSnapshot {
  readonly slug: string;
  /**
   * 单一真相源：与 `body.dataset.state` 由同一个 `deriveState()` 计算。
   * `booting` 只在首帧前且未超时；超时后降到 degraded，但页面仍可看。
   */
  readonly state: 'booting' | 'ready' | 'degraded';
  readonly lod: Lod;
  readonly order: readonly string[];
  readonly drawn: number;
  readonly frames: number;
  readonly fps: number;
  readonly cpuMs: number;
  readonly frameMs: number;
  readonly readiness: number;
  readonly renderScale: number;
  /** 渲染分辨率被预算压到 0.75 以下；不是错，但要在调试条上说明画面为什么软 */
  readonly resolutionStarved: boolean;
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
  /** 释放舞台与环境声（测试/热重载用） */
  dispose(): void;
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
  const bootNote = document.getElementById('boot-note');
  const cta = document.getElementById('cta');
  const menu = document.getElementById('menu');
  const menuOpen = document.getElementById('menu-open');
  const menuNote = document.getElementById('menu-note');
  const ambience: Ambience | null = config.ambience === false ? null : createAmbience(config.biome);

  if (document.body) {
    document.body.dataset.state = 'booting';
    document.body.dataset.slug = config.slug;
    document.body.dataset.biome = config.biome;
    // 调试条只在 `?debug` 时出现：它是开发工具，默认不该出现在产品画面里
    document.body.dataset.debug = /(?:^|[?&])debug\b/.test(window.location.search) ? 'on' : 'off';
  }
  // favicon 走 data URI，不产生任何网络请求；也避免构建期在 markup 里写 <link> 触发零请求断言。
  if (!document.querySelector('link[rel="icon"]')) {
    const icon = document.createElement('link');
    icon.rel = 'icon';
    icon.href = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='14' fill='%230a0c10'/%3E%3Ccircle cx='16' cy='16' r='6' fill='%23e8eef5'/%3E%3C/svg%3E";
    document.head.appendChild(icon);
  }

  let stage: Stage;
  if (bootNote) {
    bootNote.textContent = COPY.boot.preparing;
    bootNote.hidden = false;
  }
  try {
    stage = createStage({
      canvas,
      glCanvas,
      parts,
      biome: config.biome,
      seed: config.seed,
      budgetMs: config.budgetMs,
      minRenderScale: config.minRenderScale,
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
    const next = open === true;
    if (next === uiModalOpen) return;
    uiModalOpen = next;
    if (menu) menu.hidden = !uiModalOpen;
    if (menuOpen) menuOpen.hidden = uiModalOpen;
    if (document.body) document.body.dataset.modal = uiModalOpen ? 'open' : 'closed';
    // 站点副作用：/hug 在菜单打开时关掉麦克风/风，避免「菜单里还开着录音」。
    window.dispatchEvent(new CustomEvent('site:modal', { detail: { open: uiModalOpen } }));
    if (uiModalOpen) {
      down = false;
      pushPointer();
      // 焦点进入模态：键盘用户按 Esc 打开后，下一次 Tab 不该从页面顶部重新开始
      window.setTimeout(() => {
        (document.getElementById('menu-sound') as HTMLElement | null)?.focus();
      }, 0);
    } else {
      (document.activeElement as HTMLElement | null)?.blur?.();
    }
  }

  // ── Esc 菜单：六个按钮必须真的做事（第一版全是死按钮，点了没反应）──
  const menuValue = (id: string): HTMLElement | null => {
    const button = document.getElementById(id);
    if (!button) return null;
    let span = button.querySelector<HTMLElement>('.menu-value');
    if (!span) {
      span = document.createElement('span');
      span.className = 'menu-value';
      button.appendChild(span);
    }
    return span;
  };

  const setMenuValue = (id: string, text: string): void => {
    const span = menuValue(id);
    if (span) span.textContent = text;
  };

  const showMenuNote = (text: string): void => {
    if (!menuNote) return;
    if (menuNote.hidden || menuNote.textContent !== text) {
      menuNote.textContent = text;
      menuNote.hidden = false;
    } else {
      menuNote.hidden = true;
    }
  };

  const motionQuery = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;
  let reducedMotion = motionQuery?.matches === true;
  setMenuValue('menu-motion', reducedMotion ? 'Reduced' : 'Full');
  setMenuValue('menu-quality', 'High');
  setMenuValue('menu-sound', 'Off');

  let qualityStep = 0; // 0=High(1.0) 1=Normal(0.85) 2=Low(0.7)
  const QUALITY: readonly { label: string; scale: number }[] = [
    { label: 'High', scale: 1 },
    { label: 'Normal', scale: 0.85 },
    { label: 'Low', scale: 0.7 },
  ];

  document.getElementById('menu-sound')?.addEventListener('click', () => {
    // 站内自持声音：/koi 的 attach 接管这个按钮，壳不叠第二套水声。
    if (!ambience) return;
    if (ambience.enabled) {
      ambience.stop();
      setMenuValue('menu-sound', 'Off');
      return;
    }
    const ok = ambience.start();
    setMenuValue('menu-sound', ok ? 'On' : 'Off');
  });
  document.getElementById('menu-motion')?.addEventListener('click', () => {
    reducedMotion = !reducedMotion;
    stage.setReducedMotion(reducedMotion);
    setMenuValue('menu-motion', reducedMotion ? 'Reduced' : 'Full');
  });
  document.getElementById('menu-quality')?.addEventListener('click', () => {
    qualityStep = (qualityStep + 1) % QUALITY.length;
    const item = QUALITY[qualityStep]!;
    stage.setRenderScale(item.scale);
    setMenuValue('menu-quality', item.label);
  });
  document.getElementById('menu-about')?.addEventListener('click', () => {
    showMenuNote(config.privacy);
  });
  document.getElementById('menu-credits')?.addEventListener('click', () => {
    showMenuNote(config.credits);
  });
  document.getElementById('menu-close')?.addEventListener('click', () => {
    setModal(false);
  });
  menuOpen?.addEventListener('click', () => {
    setModal(true);
  });

  // 主按钮：**绑 click**（覆盖鼠标 / 触屏 / 键盘回车与空格）—— 键盘用户唯一的路径
  // 主按钮的通道由 `data-channel` 决定：
  //   · `world-inject`（/hug）→ 注入一次世界按下
  //   · 其它（/license 的 'Stamp it'：盖章是站点作用域的因果）→ 只派发 DOM 事件
  const frameHooks: ((t: number, dt: number) => void)[] = [];
  if (cta) {
    const channel = cta.getAttribute('data-channel');
    cta.addEventListener('click', () => {
      if (uiModalOpen) return;
      if (channel === 'world-inject') {
        // 世界注入：一次按下（零件看到上升沿），同时派发站点因果（/hug 的 release）
        tap();
        window.dispatchEvent(new CustomEvent('site:cta'));
      } else {
        window.dispatchEvent(new CustomEvent('site:cta'));
      }
    });
  }

  // Esc 菜单：模态期间世界不接收指针（④）
  window.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setModal(!uiModalOpen);
    }
  });

  /**
   * 把纸的几何写成 CSS 变量。
   *
   * 公式**只在 `paper-ink.sheetRect()` 里存在一份**，壳通过 `stage.geometry.sheet` 读结果。
   * 从前这里手抄了 1.4142 / 0.90 / 0.82 三个数字 —— 纸一改比例，DOM 文字和画布纸面就会错位，
   * 而所有门都测不出来。现在两边读同一个矩形。
   */
  function layoutSheet(): void {
    if (!document.body) return;
    const rect = stage.geometry.sheet;
    if (!config.paperSheet || !rect) {
      document.body.dataset.sheet = 'off';
      return;
    }
    const root = document.documentElement;
    root.style.setProperty('--sheet-x', `${rect.x}px`);
    root.style.setProperty('--sheet-y', `${rect.y}px`);
    root.style.setProperty('--sheet-w', `${rect.w}px`);
    root.style.setProperty('--sheet-h', `${rect.h}px`);
    document.body.dataset.sheet = 'on';
  }

  // ── 尺寸 ──
  const onResize = (): void => {
    stage.resize(
      window.innerWidth > 0 ? window.innerWidth : canvas.clientWidth,
      window.innerHeight > 0 ? window.innerHeight : canvas.clientHeight,
      window.devicePixelRatio > 0 ? window.devicePixelRatio : 1,
    );
    // 先 resize（stage 会重算纸矩形），再读 geometry 写 CSS 变量
    layoutSheet();
    pushPointer();
  };
  onResize();
  window.addEventListener('resize', onResize, { passive: true });

  // ── 帧循环 ──
  let lastPaint = -Infinity;

  const currentLod = (): Lod => {
    for (let i = 0; i < stage.degraded.length; i += 1) {
      if (stage.degraded[i].reason === 'budget') return 'low';
    }
    return 'high';
  };

  /**
   * 站点状态的**唯一**计算处。
   *
   * 从前 `paint()` 用 readiness 算 state，`snapshot()` 只用 degraded.length ——
   * 于是调试条写着 booting、CDP 读到 ready，两边都「有测试」。现在两边调用它。
   */
  function deriveState(): 'booting' | 'ready' | 'degraded' {
    const stats = stage.stats;
    if (stats.frames === 0 && !stats.bootTimedOut) return 'booting';
    // 超时只在「一帧都没出」时算异常；站点跑过 8s 后还叫 degraded 会把所有长寿站点永久标红。
    if (stats.frames === 0) return 'degraded';
    // 只有 L1 世界可以申报 blocking；非阻塞零件（koi 水面、纸下世界）慢不该把站点标红。
    if (stats.readiness < 1 && stats.readinessBlocking) return 'degraded';
    if (stage.degraded.length > 0) return 'degraded';
    return 'ready';
  }

  function updateBootNote(state: 'booting' | 'ready' | 'degraded'): void {
    if (!bootNote) return;
    const stats = stage.stats;
    const unsupported = stage.degraded.some((entry) => entry.reason === 'unsupported');
    let text = '';
    let mode: 'on' | 'slow' = 'on';
    if (state === 'booting') text = COPY.boot.preparing;
    else if (unsupported) text = COPY.boot.unsupported;
    else if (stats.readiness < 1 && stats.readinessBlocking) {
      // 没到超时前只说「正在准备」；到了 bootTimeoutMs 才承认慢。
      // 否则第一帧就把「用得更久」甩给用户，哪怕只等了 1s。
      const waited = (typeof performance !== 'undefined' ? performance.now() : 0) - stats.bootStartedAt;
      if (waited >= stats.bootTimeoutMs) {
        text = COPY.boot.slow;
        mode = 'slow';
      } else {
        text = COPY.boot.preparing;
      }
    }
    if (!text) {
      bootNote.hidden = true;
      bootNote.textContent = '';
      if (document.body) document.body.dataset.boot = 'off';
      return;
    }
    if (bootNote.textContent !== text) bootNote.textContent = text;
    bootNote.hidden = false;
    if (document.body) document.body.dataset.boot = mode;
  }

  function paint(ts: number): void {
    if (ts - lastPaint < DEBUG_INTERVAL_MS) return;
    lastPaint = ts;
    const stats = stage.stats;
    const degraded = stage.degraded;
    const state = deriveState();
    const lines: string[] = [];
    lines.push(
      `state ${state}   lod ${currentLod()}   fps ${stats.fps.toFixed(0)}`
      + `   frame ${stats.frameMs.toFixed(1)}ms   cpu ${stats.cpuMs.toFixed(2)}ms`
      + `   scale ${stats.renderScale.toFixed(2)}   ready ${stats.readiness.toFixed(2)}`
      + `   boot ${Math.round((stats.bootStartedAt + stats.bootTimeoutMs - performance.now()) / 1000)}s`
      + `   drawn ${stats.drawn}/${parts.length}   budget ${stats.budgetMs.toFixed(1)}ms`,
    );
    if (stats.renderScale < 0.75) lines.push(`resolution-starved scale ${stats.renderScale.toFixed(2)}（预算压分辨率，不是画错）`);
    lines.push(`order ${orderLabel}`);
    for (let i = 0; i < degraded.length; i += 1) {
      const entry = degraded[i];
      lines.push(`degraded ${entry.id} ${entry.layer} [${entry.reason}] ${entry.detail}`);
    }
    dbg.textContent = lines.join('\n');
    if (document.body) document.body.dataset.state = state;
    updateBootNote(state);
  }

  // 站内 UI 的时间轴：用 rAF 的真实时间，不用 `world.dt`。
  // `world.dt` 被 MAX_DT_SECONDS 夹到 0.1s 是给物理/水波用的；慢机上盖章的
  // 6.4s 仪式会被它拉长到 9s 以上，用户看到"stamping 卡住"。UI 计时必须是墙钟。
  let hookStartTs = -1;
  let lastHookTs = -1;

  function tick(ts: number): void {
    // 注入的按下：frame 前置 true、frame 后立刻释放 —— 零件看到恰好一个上升沿
    if (pendingTap) stage.setPointer(nx, ny, true);
    stage.frame(ts);
    if (pendingTap) {
      pendingTap = false;
      stage.setPointer(nx, ny, false);
    }
    if (hookStartTs < 0) hookStartTs = ts;
    const realT = (ts - hookStartTs) / 1000;
    const realDt = lastHookTs < 0 ? 0 : (ts - lastHookTs) / 1000;
    lastHookTs = ts;
    for (let i = 0; i < frameHooks.length; i += 1) frameHooks[i](realT, realDt);
    paint(ts);
    requestAnimationFrame(tick);
  }

  const handle: SiteHandle = {
    stage,
    config,
    snapshot(): SiteSnapshot {
      const stats = stage.stats;
      const state = deriveState();
      // 单一真相源不仅要在 paint() 里写：慢帧/首帧延迟时 CDP 可能在两次 paint
      // 之间读快照，body 还是上一帧的 degraded。读快照时同步一次，保证
      // `snapshot().state === body[data-state]` 在任何时刻都成立。
      if (document.body && document.body.dataset.state !== state) document.body.dataset.state = state;
      const degraded = stage.degraded.map((entry) => ({
        id: entry.id,
        layer: entry.layer,
        reason: entry.reason,
        detail: entry.detail,
      }));
      return {
        slug: config.slug,
        state,
        lod: currentLod(),
        order: stage.order.slice(),
        drawn: stats.drawn,
        frames: stats.frames,
        fps: stats.fps,
        cpuMs: stats.cpuMs,
        frameMs: stats.frameMs,
        readiness: stats.readiness,
        renderScale: stats.renderScale,
        resolutionStarved: stats.renderScale < 0.75,
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
    dispose(): void {
      ambience?.dispose();
      stage.dispose();
    },
  };

  (globalThis as unknown as { __site?: SiteHandle }).__site = handle;
  requestAnimationFrame(tick);
  return handle;
}

export default boot;
