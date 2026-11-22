// 预览宿主 —— 浏览器侧的「站点桥接」最小实现（调试条是 L5 的雏形）。
//
// 为什么它是 .ts 而不是塞进 build.mjs 的字符串：
//   字符串里的 JS 对编译器不可见。零件契约已经用类型锁住了零件，宿主若游离在类型外，
//   第一个受害者是「stage 的 API 改了、宿主还在按旧签名调」这类静默错误 —— 它不会报错，
//   只会表现成「画面不动」。放进 `shared/stage/preview/host.ts` 后 `npx tsc --noEmit` 会一起校验。
//
// 它做的四件事，正好是将来站点要做的四件事：
//   1. 建舞台（createStage）
//   2. 转发指针（stage.setPointer）—— 零件的 addEventListener 是被契约禁止的，
//      浏览器事件必须由宿主收，收敛成 frame.pointer。这条边界就在这里。
//   3. 跟随尺寸（stage.resize）
//   4. 把 degraded[] 显示出来 —— 上面三条是功能，这一条是**不许静默降级**的落地。
//
// 刻意不做：不读 URL、不发请求、不 import 任何零件。装哪些零件由 build.mjs 生成的那一行决定，
// 宿主只接收 `PartV2[]`。这样宿主可以原样搬进真站点。
import {
  createStage,
  type BiomeId,
  type BlendMode,
  type Lod,
  type PartLayer,
  type PartV2,
  type Stage,
} from '../index';

/** 调试条刷新间隔（毫秒）。每帧重建字符串没必要，4~5 Hz 已足够看。 */
const DEBUG_INTERVAL_MS = 220;

/** 生成页面时写死的配置（与 composition 描述一一对应）。 */
export interface PreviewConfig {
  /** 页面标题与调试条上显示的站点名 */
  readonly title: string;
  readonly biome: BiomeId;
  readonly seed: number;
  /** 帧预算（毫秒），超了装配器会降 low / 挂起 expendable */
  readonly budgetMs: number;
  /**
   * GL 层合成进主 2D 画布时的 `globalCompositeOperation`；null = 用 gl 零件自己声明的 blend。
   * 语义已从 CSS `mix-blend-mode` 改为就地合成（2026-11-18 T18），原因见 `StageOptions.glBlend`。
   */
  readonly glBlend: BlendMode | null;
  /** 装配里有 GL 通道零件时才存在 #gl 画布 */
  readonly hasGl: boolean;
  /** 名义视口尺寸（只用于报告；实际尺寸以 window 为准） */
  readonly nominalWidth: number;
  readonly nominalHeight: number;
}

/** boot() 的返回值，同时挂到 globalThis.__preview 上供 CDP / bench 驱动。 */
export interface PreviewHandle {
  readonly stage: Stage;
  readonly config: PreviewConfig;
  /** 读一帧快照（不含任何内部对象引用，便于跨进程序列化） */
  snapshot(): PreviewSnapshot;
  /**
   * 站点把「UI 意图」翻译成**一次**世界级按下（见文件头的输入边界说明）。
   *
   * 用途：CTA（例如 `/hug` 的 `Let it go`）被点击后，让零件收到恰好一个上升沿。
   * 调用方应绑 `click`（覆盖鼠标 / 触屏 / 键盘回车），注入后本方法保证**只有一帧** down=true。
   *
   * @param nx 归一化 x（缺省用最后一次已知位置——**别传 0.5/0.5**，那会让按指针位置算风向的零件抽一下）
   * @param ny 归一化 y
   */
  tap(nx?: number, ny?: number): void;
  /** 模态 UI（Esc 菜单）开关期间，画布上的指针也不转发（冗余防线，见 pointerdown 注释） */
  setModal(open: boolean): void;
}

/** 快照结构（与 stage 的只读视图同源，便于测试断言）。 */
export interface PreviewSnapshot {
  readonly state: 'ready' | 'degraded';
  readonly lod: Lod;
  readonly order: readonly string[];
  readonly drawn: number;
  readonly frames: number;
  readonly fps: number;
  readonly cpuMs: number;
  readonly frameMs: number;
  readonly degraded: readonly { id: string; layer: PartLayer; reason: string; detail: string }[];
}

/**
 * 按 id 取一个必定存在的元素。
 *
 * @param id 元素 id
 * @returns 元素
 */
function requireElement<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`预览模板缺少 #${id} 元素（模板与宿主不同步）`);
  return node as unknown as T;
}

/**
 * 启动预览：建舞台、接事件、跑 rAF、刷调试条。
 *
 * 失败时**不抛**：把错误写进 #boot-error 并让 body[data-state=failed]，页面能被截图取证。
 * 抛出去只会让控制台多一行，而「为什么白屏」恰恰是预览要回答的问题。
 *
 * @param parts 已由 build.mjs 静态 import 进来的零件定义
 * @param config 生成期写死的配置
 * @returns 句柄；启动失败返回 null
 */
export function boot(parts: readonly PartV2[], config: PreviewConfig): PreviewHandle | null {
  const canvas = requireElement<HTMLCanvasElement>('stage');
  const dbg = requireElement<HTMLElement>('dbg');
  const errBox = document.getElementById('boot-error');
  const glCanvas = config.hasGl ? requireElement<HTMLCanvasElement>('gl') : null;

  if (document.body) document.body.dataset.state = 'booting';

  // `?clean=1` 只隐藏调试条，给“产品截图”用；不影响装配、成本、快照。
  try {
    if (new URLSearchParams(location.search).get('clean') === '1') {
      (document.body?.classList as { add?: (name: string) => void } | undefined)?.add?.('clean');
    }
  } catch {
    // file:// / 假 DOM 下 classList 可能缺失；失败不影响装配。
  }

  // 零件的“仪式提示”走自定义事件，不把印章/归档的业务文案硬编码进宿主。
  // 监听必须在 createStage 之前挂上：零件第一帧就会派发初始提示。
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('preview:dawn-desk', (event: Event) => {
      const detail = (event as CustomEvent<{ phase?: string; hint?: string; end?: boolean }>).detail;
      const guide = document.getElementById('dawn-guide');
      const guideText = document.getElementById('dawn-guide-text');
      const end = document.getElementById('dawn-end');
      if (guideText && detail?.hint) guideText.textContent = detail.hint;
      if (guide) guide.dataset.mode = detail?.end ? 'quiet' : detail?.phase ?? '';
      if (end) {
        end.classList.toggle('show', Boolean(detail?.end));
        end.setAttribute('aria-hidden', detail?.end ? 'false' : 'true');
      }
      if (detail?.end) {
        const again = document.getElementById('dawn-again');
        (again as HTMLElement | null)?.focus?.();
      }
    });
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
      // 只声明了 requires 的零件由装配器自己判能力；这里不重复探测
      glBlend: config.glBlend === null ? undefined : config.glBlend,
      reducedMotion:
        typeof window.matchMedia === 'function'
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

  /** 层查表：一次建好，刷新调试条时不再遍历零件找层。 */
  const layerOf = new Map<string, PartLayer>();
  for (const part of parts) layerOf.set(part.id, part.layer);

  // 预览页里的按钮只声明「要对世界说哪个动词」，不把站点业务塞进宿主。
  // `data-cue` 是预览专用接线：按钮 click → stage.cue(verb)，未知动词由零件静默忽略。
  // 假 DOM（预览构建测试）没有 querySelectorAll，这里必须容错，否则整个预览脚本跑不起来。
  if (typeof document.querySelectorAll === 'function') {
    for (const node of document.querySelectorAll<HTMLElement>('[data-cue]')) {
      const verb = node.dataset?.cue;
      if (!verb) continue;
      node.addEventListener('click', () => stage.cue(verb));
    }
  }

  /** 绘制顺序（层 + id），只算一次 —— 装配后顺序不会变。 */
  const orderLabel = stage.order
    .map((id) => `${layerOf.get(id) ?? '?'}:${id}`)
    .join(' → ');
  const compositionLabel = orderLabel.length === 0 ? '（空场景：不装任何零件）' : orderLabel;

  let lastPaint = -Infinity;
  let frameMs = 0;
  let prevTs = -1;

  /**
   * 当前 LOD：装配器的降档是「全部有 setLod 能力的件一起降」，
   * 所以只要有一条 budget 记录，整场就是 low。这里不假装能报逐件 LOD。
   *
   * @returns 'low' | 'high'
   */
  function currentLod(): Lod {
    for (let i = 0; i < stage.degraded.length; i += 1) {
      if (stage.degraded[i].reason === 'budget') return 'low';
    }
    return 'high';
  }

  /**
   * 刷新调试条（节流）。
   *
   * @param ts rAF 时间戳
   */
  function paint(ts: number): void {
    if (ts - lastPaint < DEBUG_INTERVAL_MS) return;
    lastPaint = ts;

    const stats = stage.stats;
    const degraded = stage.degraded;
    const state: 'ready' | 'degraded' = degraded.length === 0 ? 'ready' : 'degraded';

    const lines: string[] = [];
    lines.push(
      `state ${state}   lod ${currentLod()}   fps ${stats.fps.toFixed(0)}`
      + `   frame ${frameMs.toFixed(1)}ms   cpu ${stats.cpuMs.toFixed(2)}ms`
      + `   drawn ${stats.drawn}/${parts.length}   budget ${stats.budgetMs.toFixed(1)}ms`
      + `   declared ${stats.budgetCostMs.toFixed(2)}ms`,
    );
    lines.push(`biome ${config.biome}   seed ${config.seed}   frames ${stats.frames}`);
    lines.push(`order ${compositionLabel}`);
    for (let i = 0; i < degraded.length; i += 1) {
      const entry = degraded[i];
      lines.push(`degraded ${entry.id} ${entry.layer} [${entry.reason}] ${entry.detail}`);
    }
    dbg.textContent = lines.join('\n');
    if (document.body) document.body.dataset.state = state;
  }

  // ── 指针：浏览器事件 → 归一化坐标，零件只读 frame.pointer ──
  //
  // ★ 输入边界（2026-11-18，T20）：**世界只接收「画布上的」指针**。
  //   原来这里无条件转发：点 Esc 菜单的按钮会冒泡到 window → down=true → 同一帧世界就收到按下。
  //   后果按站排序：`/hug` 的 ready→drifting→away 不可逆，一次「想关静音」就把仪式毁掉；
  //   `/koi-pond` 会在菜单后面按下一团墨，墨单向不还原；`/license` 误触盖章。
  //   零件只读 `frame.pointer`，**完全无从防御**，所以这条防线只可能在宿主/站点。
  let nx = 0.5;
  let ny = 0.5;
  let down = false;
  /** 模态 UI（Esc 菜单）打开期间：画布上的指针也不转发（第 ① 条挡不住"点穿透明遮罩"） */
  let uiModalOpen = false;
  /** 待注入的一次按下（站点 CTA 用 tap() 设置，tick 里保证恰好一帧为 true） */
  let pendingTap = false;

  /** 把当前指针状态推给舞台。 */
  function pushPointer(): void {
    stage.setPointer(nx, ny, down);
  }

  window.addEventListener('pointermove', (event: PointerEvent) => {
    // 指针位置也只从画布来：UI 上的移动不该带着世界视差走
    // ★ 条件是**或**不是与：`&& !uiModalOpen` 的实际效果是"只在模态**关闭**时过滤"，
    //   与上面注释说的正相反（菜单上移动、画布上移动，模态打开时都在转发）。
    //   这条线的性质是"看起来在守、实际没守"，比不写更糟 —— 所以有 input-boundary 的断言钉住。
    if (event.target !== canvas || uiModalOpen) return;
    const w = canvas.clientWidth > 0 ? canvas.clientWidth : window.innerWidth;
    const h = canvas.clientHeight > 0 ? canvas.clientHeight : window.innerHeight;
    nx = Math.min(1, Math.max(0, event.clientX / (w > 0 ? w : 1)));
    ny = Math.min(1, Math.max(0, event.clientY / (h > 0 ? h : 1)));
    pushPointer();
  }, { passive: true });

  window.addEventListener('pointerdown', (event: PointerEvent) => {
    if (event.target !== canvas) return; // ① 世界只接收画布上的指针
    if (uiModalOpen) return;             // ② 模态期间一律不转发
    down = true;
    pushPointer();
  }, { passive: true });

  // up **不做** target 过滤，而且总是释放：按下在画布、松开在按钮上时，
  // 若也过滤掉，`down` 会永久卡在 true（世界永远按着），那比不响应更糟。
  window.addEventListener('pointerup', () => {
    down = false;
    pushPointer();
  }, { passive: true });

  // ── 尺寸 ──
  window.addEventListener('resize', () => {
    stage.resize(
      window.innerWidth > 0 ? window.innerWidth : config.nominalWidth,
      window.innerHeight > 0 ? window.innerHeight : config.nominalHeight,
      window.devicePixelRatio > 0 ? window.devicePixelRatio : 1,
    );
    pushPointer();
  }, { passive: true });

  /**
   * 一帧。
   *
   * 自己驱动 rAF 而不是 `stage.start()`：只有拿到 rAF 时间戳才能算出**真实帧时**，
   * 而帧时正是这个调试条存在的理由。stage.start() 内部用的是同一套时间戳，
   * 两条路不会产生不同的世界时钟。
   *
   * @param ts rAF 时间戳
   */
  function tick(ts: number): void {
    const delta = prevTs >= 0 ? ts - prevTs : 1000 / 60;
    prevTs = ts;
    frameMs = frameMs === 0 ? delta : frameMs * 0.9 + delta * 0.1;
    // 注入的按下：**在 frame 之前置 true、之后立刻释放**，保证零件看到恰好一个上升沿。
    // 顺序错了就是两帧按下（蒲公英连放两次）或零帧（放不出来）。
    if (pendingTap) stage.setPointer(nx, ny, true);
    stage.frame(ts);
    if (pendingTap) {
      pendingTap = false;
      stage.setPointer(nx, ny, false);
    }
    paint(ts);
    requestAnimationFrame(tick);
  }

  const handle: PreviewHandle = {
    stage,
    config,
    tap(tapX?: number, tapY?: number): void {
      if (typeof tapX === 'number' && Number.isFinite(tapX)) nx = Math.min(1, Math.max(0, tapX));
      if (typeof tapY === 'number' && Number.isFinite(tapY)) ny = Math.min(1, Math.max(0, tapY));
      pendingTap = true;
    },
    setModal(open: boolean): void {
      uiModalOpen = open === true;
      if (uiModalOpen) {
        down = false;
        pushPointer();
      }
    },
    snapshot(): PreviewSnapshot {
      const stats = stage.stats;
      const degraded = stage.degraded.map((entry) => ({
        id: entry.id,
        layer: entry.layer,
        reason: entry.reason,
        detail: entry.detail,
      }));
      return {
        state: degraded.length === 0 ? 'ready' : 'degraded',
        lod: currentLod(),
        order: stage.order.slice(),
        drawn: stats.drawn,
        frames: stats.frames,
        fps: stats.fps,
        cpuMs: stats.cpuMs,
        frameMs,
        degraded,
      };
    },
  };

  // 供 CDP / bench 从页面外部驱动与取证（同时也是测试的注入点）
  (globalThis as unknown as { __preview?: PreviewHandle }).__preview = handle;

  requestAnimationFrame(tick);
  return handle;
}

export default boot;
