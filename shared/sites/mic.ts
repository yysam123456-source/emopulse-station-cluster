// 麦克风输入 —— /hug 的 Wind，只读响度/分频，不录音、不上传、不落盘。
//
// 边界：
//   · 只有用户点 Wind 才 getUserMedia（不在首屏自动弹权限）。
//   · 数据只活在内存里的 AnalyserNode；`stop()` 立刻停轨、关 AudioContext。
//   · 站点把 `read()` 的结果交给 `stage.setAudio()`，零件通过 `frame.audio` 读；
//     麦克风本身不碰世界，也不知道蒲公英存在。
import type { AudioState } from '../stage/contract';

export interface MicInput {
  /** 请求权限并开始分析；用户拒绝/设备不可用时返回 false。 */
  start(): Promise<boolean>;
  /** 每帧读一次；未开启返回 null。 */
  read(): AudioState | null;
  stop(): void;
  readonly enabled: boolean;
}

/** 8 段分频的中心频率（Hz），覆盖人声/吹气的主要能量。 */
const BAND_HZ = [125, 250, 500, 1000, 2000, 4000, 6000, 8000] as const;

/**
 * 创建麦克风输入。
 *
 * @returns 控制器；`start()` 之前 `read()` 恒为 null。
 */
export function createMic(): MicInput {
  let ctx: AudioContext | null = null;
  let stream: MediaStream | null = null;
  let analyser: AnalyserNode | null = null;
  let timeData: Uint8Array<ArrayBuffer> | null = null;
  let freqData: Uint8Array<ArrayBuffer> | null = null;
  /** 每帧复用：8 个 float 不该在 60fps 下反复分配。 */
  let bandData: Float32Array | null = null;
  let enabled = false;

  const stop = (): void => {
    enabled = false;
    try {
      stream?.getTracks().forEach((track) => track.stop());
    } catch {
      // 设备已拔出：停轨失败不影响把状态清干净
    }
    stream = null;
    try {
      analyser?.disconnect();
    } catch {
      // 同上
    }
    analyser = null;
    timeData = null;
    freqData = null;
    const closing = ctx;
    ctx = null;
    if (closing) void closing.close().catch(() => undefined);
  };

  const start = async (): Promise<boolean> => {
    if (enabled) return true;
    if (!navigator.mediaDevices?.getUserMedia) return false;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          // 不做自动增益：吹气/说话的响度差异要保留，否则 Wind 永远是满的
          autoGainControl: false,
        },
        video: false,
      });
      const AudioCtor = window.AudioContext;
      if (!AudioCtor) {
        stop();
        return false;
      }
      ctx = new AudioCtor();
      if (ctx.state === 'suspended') await ctx.resume();
      const source = ctx.createMediaStreamSource(stream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      analyser.minDecibels = -90;
      analyser.maxDecibels = -10;
      source.connect(analyser);
      timeData = new Uint8Array(analyser.fftSize);
      freqData = new Uint8Array(analyser.frequencyBinCount);
      enabled = true;
      return true;
    } catch {
      stop();
      return false;
    }
  };

  const read = (): AudioState | null => {
    if (!enabled || !analyser || !timeData || !freqData) return null;
    analyser.getByteTimeDomainData(timeData);
    let sum = 0;
    for (let i = 0; i < timeData.length; i += 1) {
      const v = (timeData[i]! - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / timeData.length);
    // 人吹气/说话的 RMS 通常 0.02–0.35；放大 3 倍后落进 0..1，超过 1 截断。
    const level = Math.min(1, rms * 3);

    analyser.getByteFrequencyData(freqData);
    if (!bandData) bandData = new Float32Array(BAND_HZ.length);
    const bands = bandData;
    const binHz = ctx ? ctx.sampleRate / analyser.fftSize : 44100 / 256;
    for (let b = 0; b < BAND_HZ.length; b += 1) {
      const center = BAND_HZ[b]!;
      const lo = Math.max(0, Math.floor((center * 0.7) / binHz));
      const hi = Math.min(freqData.length - 1, Math.ceil((center * 1.4) / binHz));
      let peak = 0;
      for (let i = lo; i <= hi; i += 1) peak = Math.max(peak, freqData[i]!);
      bands[b] = Math.min(1, peak / 180);
    }
    return { level, bands };
  };

  return {
    start,
    read,
    stop,
    get enabled() { return enabled; },
  };
}
