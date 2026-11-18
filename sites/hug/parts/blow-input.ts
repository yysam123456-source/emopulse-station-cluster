/**
 * /hug 的吹气输入零件（麦克风 → AudioContext → AnalyserNode → 强度读数 → 放飞）。
 *
 * 数学与门限全部来自 shared/parts-library/blow-input/core/detector.ts
 * （算法移植，D3 级，逐条对应原文 src/utils/BlowInput.ts，摘录见该零件的 EXCERPT.md）。
 * 本文件只负责浏览器侧的资源与生命周期：建流、起停循环、权限竞态、释放。
 *
 * 硬性性质（原文声明，必须保持）：
 *   - 音频节点只接到分析器，**没有连到扬声器**（不会把麦克风声音放出来）；
 *   - 没有录制音频、没有创建音频文件、没有把音频发送到服务器——这里只要当下的强度值；
 *   - 麦克风**只在用户点击后**申请；按钮始终保留（权限被拒 / 无设备 / 不便授权都能玩）。
 */
import {
  BlowDetector,
  FFT_SIZE,
  MIN_BLOW,
  SMOOTHING_TIME_CONSTANT,
} from '../../../shared/parts-library/blow-input/core/detector';

/** 站点零件的最小生命周期契约。 */
export interface BlowInputPart {
  /** 每帧回调（检测在零件内部的 rAF 里跑，站点帧只透传）。 */
  update(seconds: number): void;
  dispose(): void;
  /** 用户点击「Use mic」后调用；成功 true。 */
  enable(): Promise<boolean>;
  /** 主动关闭麦克风并回到未启用状态。 */
  disable(): void;
  readonly enabled: boolean;
  /** 最近一次强度读数（0—1），供调试/可视化。 */
  readonly strength: number;
}

/** 构造参数（与站点 site.config 的 options 对齐）。 */
export interface BlowInputOptions {
  /** 按钮兜底：本站恒为 true（没有麦克风也能完整体验）。 */
  readonly fallbackButton?: boolean;
  /**
   * 站点是否允许自动申请麦克风。本站恒为 false；
   * 即使传 true，本零件也不会在构造期申请（零输入红线：必须由用户点击触发）。
   */
  readonly autoRequest?: boolean;
  /** 触发回调；不传时回落到站点模板的 #act 按钮（见下方 defaultFire）。 */
  readonly onBlow?: (strength: number) => void;
}

/** 浏览器侧约束：关掉降噪等处理，尽量保留吹气的噪声特征（原文原样）。 */
const AUDIO_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  },
  video: false,
};

export function createBlowInputPart(options: BlowInputOptions = {}): BlowInputPart {
  const detector = new BlowDetector();
  let stream: MediaStream | null = null;
  let context: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let analyser: AnalyserNode | null = null;
  let wave: Uint8Array<ArrayBuffer> | null = null;
  let freq: Uint8Array<ArrayBuffer> | null = null;

  /** 请求序号：停止时递增，让尚未返回的 getUserMedia 结果过期（原文第八节）。 */
  let requestToken = 0;
  let enabled = false;
  let disposed = false;
  let raf = 0;
  let lastFrameAt = 0;
  let strength = 0;

  /**
   * 默认放飞入口：站点模板把放飞按钮固定为 #act（ready 态才生效），
   * BlowInput 只是替用户按下同一个入口，不复制状态机、不直接改种子。
   *
   * 强调：**这是刻意复用站点入口，不是权宜之计。** 吹气与点击是同一件事的两种触发方式，
   * 本来就该走同一条路径——#act 的 handler 里已经有「ready 才生效 / 放飞 / 记台账」的全部逻辑。
   * 如果这里复制一份状态机（自己判 state、自己调 release、自己写 DOM），
   * 就会出现两条真相：吹气放飞后按钮文案不更新、点击被静默忽略、台账少记一次，
   * 而且站点以后改放飞流程时必须同时改两处，漏一处就是线上 bug。
   * 复制状态机才是错的；点同一个按钮才是对的。
   */
  const defaultFire = (): void => {
    if (typeof document === 'undefined') return;
    const act = document.getElementById('act');
    if (act instanceof HTMLElement) act.click();
  };

  const fire = (level: number): void => {
    const value = Math.max(MIN_BLOW, level);
    if (options.onBlow) options.onBlow(value);
    else defaultFire();
  };

  const stopLoop = (): void => {
    if (raf !== 0) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };

  const tick = (): void => {
    raf = 0;
    if (!enabled || disposed || !analyser || !wave || !freq) return;

    const now = performance.now();
    const dt = lastFrameAt === 0 ? 0.016 : Math.min(0.1, (now - lastFrameAt) / 1000);
    lastFrameAt = now;

    analyser.getByteTimeDomainData(wave);
    analyser.getByteFrequencyData(freq);

    const reading = detector.push({ wave, freq, sampleRate: context?.sampleRate ?? 48000, dt });
    strength = reading.strength;
    if (reading.fired) fire(reading.strength);

    raf = requestAnimationFrame(tick);
  };

  const startLoop = (): void => {
    if (raf !== 0 || !enabled) return;
    lastFrameAt = 0;
    raf = requestAnimationFrame(tick);
  };

  /**
   * 释放音频资源：先递增序号让在途请求过期，再逐条 stop() 轨道、断开节点、关闭上下文。
   * 可重复调用（原文：dispose() 必须可重复调用；构造失败也走清理路径）。
   */
  const teardown = (): void => {
    requestToken += 1;
    stopLoop();
    enabled = false;
    strength = 0;

    if (source) {
      try { source.disconnect(); } catch { /* 已断开 */ }
      source = null;
    }
    if (analyser) {
      try { analyser.disconnect(); } catch { /* 已断开 */ }
      analyser = null;
    }
    if (stream) {
      for (const track of stream.getTracks()) {
        try { track.stop(); } catch { /* 已停止 */ }
      }
      stream = null;
    }
    if (context) {
      const pending = context;
      context = null;
      void pending.close().catch(() => { /* 已关闭 */ });
    }
    wave = null;
    freq = null;
    detector.reset();
  };

  const onVisibility = (): void => {
    if (typeof document === 'undefined') return;
    if (document.hidden) stopLoop();
    else startLoop();
  };

  const onPageHide = (): void => {
    teardown();
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
  }

  const enable = async (): Promise<boolean> => {
    if (disposed) return false;
    if (enabled) return true;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return false;

    const token = ++requestToken;
    let nextStream: MediaStream | null = null;
    try {
      nextStream = await navigator.mediaDevices.getUserMedia(AUDIO_CONSTRAINTS);

      // 权限框还没处理完就取消/离开：后到的流不能继续占着麦克风。
      if (token !== requestToken || disposed) {
        for (const track of nextStream.getTracks()) track.stop();
        return false;
      }

      const Ctor = window.AudioContext;
      if (!Ctor) {
        for (const track of nextStream.getTracks()) track.stop();
        return false;
      }
      const ctx = new Ctor();
      await ctx.resume();
      if (token !== requestToken || disposed) {
        for (const track of nextStream.getTracks()) track.stop();
        void ctx.close().catch(() => { /* 已关闭 */ });
        return false;
      }

      const node = ctx.createMediaStreamSource(nextStream);
      const nextAnalyser = ctx.createAnalyser();
      nextAnalyser.fftSize = FFT_SIZE;
      nextAnalyser.smoothingTimeConstant = SMOOTHING_TIME_CONSTANT;
      node.connect(nextAnalyser); // 只接分析器：不接 destination，不放音

      stream = nextStream;
      context = ctx;
      source = node;
      analyser = nextAnalyser;
      wave = new Uint8Array(nextAnalyser.fftSize);
      freq = new Uint8Array(nextAnalyser.frequencyBinCount);
      detector.reset();
      enabled = true;
      startLoop();
      return true;
    } catch {
      // 拒绝授权 / 无设备 / 不安全上下文：静默降级，按钮兜底路径照常可用。
      if (nextStream) for (const track of nextStream.getTracks()) track.stop();
      teardown();
      return false;
    }
  };

  return {
    get enabled(): boolean {
      return enabled;
    },
    get strength(): number {
      return strength;
    },
    enable,
    disable: teardown,
    update(): void {
      /* 检测在内部 rAF 中推进，站点帧只透传时间 */
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('pagehide', onPageHide);
      }
      teardown();
    },
  };
}

export default createBlowInputPart;
