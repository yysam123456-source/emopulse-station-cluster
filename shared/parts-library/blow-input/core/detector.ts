/**
 * 吹气检测核心（纯函数 · 无 DOM · Node 下可直接单测）。
 *
 * 出处：公众号原文《Three.js 实战：把愿望交给风，做一个可以吹散的蒲公英网页》
 * 原件文件 src/utils/BlowInput.ts（摘录见 ../EXCERPT.md）。逐条对应：
 *   - `analyser.fftSize = 2048` / `smoothingTimeConstant = 0.65` → FFT_SIZE / SMOOTHING_TIME_CONSTANT
 *   - `(value - 128) / 128` 后平方求均值再开方 → rmsOfWave()
 *   - `baseline = baseline * 0.94 + rms * 0.06` 与「先安静 1.2 秒」→ calibrate()
 *   - `threshold = Math.max(0.025, baseline * 2.8)` → thresholdOf()
 *   - `broadband = Math.min(1, high / Math.max(1, low * 2.5))`、`strength = …/0.16 * broadband`
 *     → bandEnergy() + strengthOf()
 *   - `breath = level > 0.12 ? breath + dt : Math.max(0, breath - dt * 2)` → push()
 *   - `if (breath > 0.12 && phase === 'ready') blow(Math.max(0.4, level))` → BlowReading.fired
 *
 * 原文的诚实声明（照抄进代码）：high / low 累计的是分析器给出的频谱字节值，
 * **不能把这个比值当成严格的物理能量比**；频带、门限、倍数都是为交互调的经验值。
 * 本办法能减少部分低频碰撞声的影响，但不能可靠区分吹气、讲话和风扇声。
 */

/** 夹取到 [0,1]（本零件自带，不跨零件依赖）。 */
function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

/** 分析器 FFT 大小（原文 `analyser.fftSize = 2048`；频点宽度 = sampleRate / 2048）。 */
export const FFT_SIZE = 2048;

/** 平滑时间常数（原文 `analyser.smoothingTimeConstant = 0.65`）。 */
export const SMOOTHING_TIME_CONSTANT = 0.65;

/** 校准时长：先安静 1.2 秒估底噪，期间不触发放飞。 */
export const CALIBRATION_SECONDS = 1.2;

/** 底噪指数滑动平均系数（原文 `baseline * 0.94 + rms * 0.06`）。 */
export const BASELINE_DECAY = 0.94;
export const BASELINE_GAIN = 0.06;

/** 门限：`Math.max(0.025, baseline * 2.8)`。 */
export const THRESHOLD_FLOOR = 0.025;
export const THRESHOLD_BASELINE_FACTOR = 2.8;

/** 频带边界：低于约 180 Hz 记 low，约 180—4200 Hz 记 high。 */
export const LOW_BAND_HZ = 180;
export const HIGH_BAND_START_HZ = 180;
export const HIGH_BAND_END_HZ = 4200;

/** 宽频权重：`high / Math.max(1, low * 2.5)`。 */
export const BROADBAND_LOW_FACTOR = 2.5;

/** 强度归一化跨度：`(rms - threshold) / 0.16`。 */
export const STRENGTH_SPAN = 0.16;

/** 连续超阈值才放飞的时长（原文 `breath > 0.12`）。 */
export const BREATH_LEVEL = 0.12;

/** 低于门限时 breath 的衰减速度（`Math.max(0, breath - dt * 2)`）。 */
export const BREATH_DECAY = 2;

/** 触发时传入放飞方法的最小强度（`Math.max(0.4, level)`）。 */
export const MIN_BLOW = 0.4;

/** 时域字节采样的零点与量程（`(value - 128) / 128`）。 */
export const WAVE_OFFSET = 128;
export const WAVE_SCALE = 128;

/** 重新武装前的静默时长【本地补充】：原文用组件 phase 门控，本站没有该相位回调。 */
export const REARM_SECONDS = 0.6;

/** 一帧的输入。 */
export interface BlowFrame {
  /** getByteTimeDomainData 的时域字节（长度 = fftSize） */
  readonly wave: Uint8Array;
  /** getByteFrequencyData 的频谱字节（长度 = fftSize / 2） */
  readonly freq: Uint8Array;
  /** context.sampleRate */
  readonly sampleRate: number;
  /** 相对上一帧的秒数 */
  readonly dt: number;
}

/** 一帧的读数。 */
export interface BlowReading {
  /** 时域 RMS（0—1） */
  readonly rms: number;
  /** 底噪估计 */
  readonly baseline: number;
  /** 当前门限 */
  readonly threshold: number;
  /** 宽频权重（0—1） */
  readonly broadband: number;
  /** 强度读数 strength */
  readonly strength: number;
  /** 连续超阈值的累计时长 */
  readonly breath: number;
  /** 本帧是否应当触发一次放飞 */
  readonly fired: boolean;
  /** 是否仍在校准期 */
  readonly calibrating: boolean;
}

/** 空读数（构造后、首帧前的稳定返回值）。 */
const IDLE: BlowReading = {
  rms: 0,
  baseline: 0,
  threshold: THRESHOLD_FLOOR,
  broadband: 0,
  strength: 0,
  breath: 0,
  fired: false,
  calibrating: true,
};

/**
 * 时域 RMS：字节采样以 128 附近为零点，先平移、缩放，再平方求平均（原文原样）。
 */
export function rmsOfWave(wave: Uint8Array): number {
  if (wave.length === 0) return 0;
  let energy = 0;
  for (let i = 0; i < wave.length; i += 1) {
    const v = (wave[i]! - WAVE_OFFSET) / WAVE_SCALE;
    energy += v * v;
  }
  return Math.sqrt(energy / wave.length);
}

/**
 * 分频带累计频谱字节值。
 *
 * 原文：
 *   const hzPerBin = context.sampleRate / 2048
 *   const hz = index * hzPerBin
 * 低于 180 Hz 记 low，180—4200 Hz 记 high。
 * 注意：累计的是**字节值**，不是物理能量（原文明确声明）。
 */
export function bandEnergy(
  freq: Uint8Array,
  sampleRate: number,
  fftSize: number = FFT_SIZE,
): { low: number; high: number } {
  const hzPerBin = sampleRate / fftSize;
  let low = 0;
  let high = 0;
  for (let index = 0; index < freq.length; index += 1) {
    const hz = index * hzPerBin;
    if (hz < LOW_BAND_HZ) low += freq[index]!;
    else if (hz >= HIGH_BAND_START_HZ && hz <= HIGH_BAND_END_HZ) high += freq[index]!;
  }
  return { low, high };
}

/** 门限：`Math.max(0.025, baseline * 2.8)`。 */
export function thresholdOf(baseline: number): number {
  return Math.max(THRESHOLD_FLOOR, baseline * THRESHOLD_BASELINE_FACTOR);
}

/** 宽频权重：`Math.min(1, high / Math.max(1, low * 2.5))`。 */
export function broadbandOf(low: number, high: number): number {
  return Math.min(1, high / Math.max(1, low * BROADBAND_LOW_FACTOR));
}

/** 强度：`max(0, min(1, (rms - threshold) / 0.16)) * broadband`。 */
export function strengthOf(rms: number, threshold: number, broadband: number): number {
  return clamp01((rms - threshold) / STRENGTH_SPAN) * broadband;
}

/**
 * 吹气检测器（纯状态机）。
 *
 * 使用方式：每帧 push({ wave, freq, sampleRate, dt })，`fired === true` 时调用放飞方法，
 * 强度取 `Math.max(0.4, reading.strength)`。检测器不碰相机、不碰种子、不建音频节点。
 */
export class BlowDetector {
  private baseline = 0;
  private calibrateLeft: number;
  private breath = 0;
  private armed = true;
  private quiet = 0;
  private last: BlowReading = IDLE;

  constructor(calibrationSeconds: number = CALIBRATION_SECONDS) {
    this.calibrateLeft = calibrationSeconds;
  }

  /** 是否仍在校准期。 */
  get calibrating(): boolean {
    return this.calibrateLeft > 0;
  }

  /** 最近一帧读数（未 push 过时返回待机读数）。 */
  get reading(): BlowReading {
    return this.last;
  }

  /** 重置到「刚启用」状态（底噪清零、重新校准、重新武装）。 */
  reset(calibrationSeconds: number = CALIBRATION_SECONDS): void {
    this.baseline = 0;
    this.calibrateLeft = calibrationSeconds;
    this.breath = 0;
    this.armed = true;
    this.quiet = 0;
    this.last = IDLE;
  }

  /** 手动重新武装（例如站点回到 ready 态时）。 */
  rearm(): void {
    this.armed = true;
    this.breath = 0;
    this.quiet = 0;
  }

  /**
   * 推进一帧。
   *
   * 校准期只更新底噪并返回 0；校准结束后按原文公式算 strength，
   * 再由 breath 积分决定是否触发（抑制一帧杂音把花吹完）。
   */
  push(frame: BlowFrame): BlowReading {
    const dt = Number.isFinite(frame.dt) && frame.dt > 0 ? Math.min(frame.dt, 0.25) : 0;
    const rms = rmsOfWave(frame.wave);

    if (this.calibrateLeft > 0) {
      this.baseline = this.baseline * BASELINE_DECAY + rms * BASELINE_GAIN;
      this.calibrateLeft -= dt;
      this.last = {
        rms,
        baseline: this.baseline,
        threshold: thresholdOf(this.baseline),
        broadband: 0,
        strength: 0,
        breath: this.breath,
        fired: false,
        calibrating: true,
      };
      return this.last;
    }

    const threshold = thresholdOf(this.baseline);
    const { low, high } = bandEnergy(frame.freq, frame.sampleRate);
    const broadband = broadbandOf(low, high);
    const strength = strengthOf(rms, threshold, broadband);

    // breath = level > 0.12 ? breath + dt : max(0, breath - dt * 2)
    this.breath = strength > BREATH_LEVEL
      ? this.breath + dt
      : Math.max(0, this.breath - dt * BREATH_DECAY);

    let fired = false;
    if (this.breath > BREATH_LEVEL && this.armed) {
      fired = true;
      this.armed = false;
      this.quiet = 0;
    } else if (!this.armed && strength <= BREATH_LEVEL) {
      this.quiet += dt;
      if (this.quiet > REARM_SECONDS) this.armed = true;
    }

    this.last = {
      rms,
      baseline: this.baseline,
      threshold,
      broadband,
      strength,
      breath: this.breath,
      fired,
      calibrating: false,
    };
    return this.last;
  }
}

/** 创建一个检测器（工厂，与 class 二选一）。 */
export function createDetector(calibrationSeconds?: number): BlowDetector {
  return new BlowDetector(calibrationSeconds);
}
