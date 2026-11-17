// 把 core/main.js 的渲染循环与 SiteApp.start/pause 桥接。
// core 是单个 async IIFE，不导出 scene；bridge 只驱动 glue 的零件 update，不触碰渲染。
export interface FrameBridge {
  readonly running: boolean;
  start(): void;
  pause(): void;
  dispose(): void;
}

export interface FrameBridgeOptions {
  /** 每帧回调，参数为相对秒数；glue 在此调用零件 update(t)。 */
  onFrame: (seconds: number) => void;
  /** 同时驱动 SiteApp.start/pause（可选）。 */
  app?: { start(): void; pause(): void };
  /** 页面隐藏时自动 pause、恢复可见时自动 start，默认 true。 */
  autoVisibility?: boolean;
}

/** 全局帧钩子：站点 L1 替换的 world.js/main.js 可调用 globalThis.__emopulseFrame?.(t) 接入。 */
export type FrameHook = (seconds: number) => void;

/** 安装全局帧钩子（同一时刻只有一个，返回卸载函数）。 */
export function attachGlobalFrameHook(hook: FrameHook): () => void {
  const scope = globalThis as typeof globalThis & { __emopulseFrame?: FrameHook };
  scope.__emopulseFrame = hook;
  return () => {
    if (scope.__emopulseFrame === hook) delete scope.__emopulseFrame;
  };
}

/** 创建帧桥：requestAnimationFrame 循环 + 可见性联动 + 全局钩子联动。 */
export function createFrameBridge(options: FrameBridgeOptions): FrameBridge {
  const { onFrame, app, autoVisibility = true } = options;
  const startedAt = Date.now();
  const detachHook = attachGlobalFrameHook(onFrame);
  let rafId = 0;
  let running = false;
  let disposed = false;

  const loop = (): void => {
    if (!running || disposed) return;
    const seconds = (Date.now() - startedAt) / 1000;
    onFrame(seconds);
    const scope = globalThis as typeof globalThis & { __emopulseFrame?: FrameHook };
    scope.__emopulseFrame?.(seconds);
    rafId = requestAnimationFrame(loop);
  };

  const onVisibility = (): void => {
    if (document.hidden) bridge.pause();
    else bridge.start();
  };

  const bridge: FrameBridge = {
    get running() { return running; },
    start(): void {
      if (disposed || running) return;
      running = true;
      app?.start();
      rafId = requestAnimationFrame(loop);
    },
    pause(): void {
      if (disposed || !running) return;
      running = false;
      cancelAnimationFrame(rafId);
      app?.pause();
    },
    dispose(): void {
      if (disposed) return;
      bridge.pause();
      detachHook();
      document.removeEventListener('visibilitychange', onVisibility);
      disposed = true;
    },
  };

  if (autoVisibility) document.addEventListener('visibilitychange', onVisibility);
  return bridge;
}
