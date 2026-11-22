// 站点环境声 —— 程序化、零采样、零外部请求。
//
// 为什么放在壳里而不是某个零件：声音是**站点级状态**（四站共用一套开关与菜单），
// 不是「鱼在游」这种零件行为。零件不该拿到 AudioContext，否则每个零件都会自己建一张图。
//
// 纪律：
//   1. 只在用户显式点 Sound 后才创建 AudioContext（自动播放策略）。
//   2. 全部用噪声/正弦 + 滤波，不加载任何音频文件（单文件站点不许外部请求）。
//   3. 音量压得很低（≈ -30 LUFS），它是「有空气」而不是「有配乐」。
//   4. dispose 必须 close()，否则反复开关会漏 AudioContext（浏览器上限约 6 个）。
import type { BiomeId } from '../stage/contract';

/** 环境声句柄。 */
export interface Ambience {
  readonly enabled: boolean;
  /** 打开（必须在用户手势的同步调用栈里）；返回是否成功 */
  start(): boolean;
  /** 关掉并释放 AudioContext */
  stop(): void;
  dispose(): void;
}

/** 每站的基础音色：噪声经过的滤波中心频率与增益。 */
const VOICE: Readonly<Record<BiomeId, { freq: number; q: number; gain: number; hum: number }>> = {
  field: { freq: 780, q: 0.55, gain: 0.045, hum: 0 },
  tide: { freq: 260, q: 0.7, gain: 0.05, hum: 0 },
  room: { freq: 420, q: 0.5, gain: 0.032, hum: 0.012 },
  ink: { freq: 1100, q: 0.9, gain: 0.03, hum: 0 },
};

/**
 * 建一个环境声（懒创建：start 之前不碰 AudioContext）。
 *
 * @param biome 站点 biome
 */
export function createAmbience(biome: BiomeId): Ambience {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let enabled = false;

  const voice = VOICE[biome] ?? VOICE.field;

  function build(): boolean {
    const Ctor = (globalThis as unknown as {
      AudioContext?: new () => AudioContext;
      webkitAudioContext?: new () => AudioContext;
    }).AudioContext ?? (globalThis as unknown as {
      webkitAudioContext?: new () => AudioContext;
    }).webkitAudioContext;
    if (!Ctor) return false;
    try {
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);

      // 2 秒噪声循环：足够长，听不出周期；单声道即可（环境声不需要空间化）。
      const seconds = 2;
      const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * seconds)), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < data.length; i += 1) {
        // 粉红化：一阶低通的白噪，比纯白噪更接近风/水
        const white = Math.random() * 2 - 1;
        last = last * 0.94 + white * 0.06;
        data[i] = last * 4;
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      const band = ctx.createBiquadFilter();
      band.type = biome === 'tide' ? 'lowpass' : 'bandpass';
      band.frequency.value = voice.freq;
      band.Q.value = voice.q;

      const gain = ctx.createGain();
      gain.gain.value = voice.gain;

      source.connect(band);
      band.connect(gain);
      gain.connect(master);
      source.start();

      if (voice.hum > 0) {
        const hum = ctx.createOscillator();
        hum.type = 'sine';
        hum.frequency.value = 55;
        const humGain = ctx.createGain();
        humGain.gain.value = voice.hum;
        hum.connect(humGain);
        humGain.connect(master);
        hum.start();
      }

      // 潮水的慢呼吸：0.08 Hz 的 LFO 推增益，幅度只有 ±18%，不形成明显节奏
      if (biome === 'tide') {
        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 0.08;
        const depth = ctx.createGain();
        depth.gain.value = 0.012;
        lfo.connect(depth);
        depth.connect(gain.gain);
        lfo.start();
      }
      return true;
    } catch {
      ctx = null;
      master = null;
      return false;
    }
  }

  return {
    get enabled() { return enabled; },
    start(): boolean {
      if (enabled && ctx) {
        void ctx.resume();
        return true;
      }
      if (!ctx && !build()) return false;
      if (!ctx || !master) return false;
      void ctx.resume();
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setTargetAtTime(0.9, now, 0.6);
      enabled = true;
      return true;
    },
    stop(): void {
      enabled = false;
      if (!ctx || !master) return;
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setTargetAtTime(0, now, 0.25);
      // 不 close：关掉再开要重建整张图；保留一个静音图直到 dispose。
    },
    dispose(): void {
      enabled = false;
      try { void ctx?.close(); } catch { /* 已关闭 */ }
      ctx = null;
      master = null;
    },
  };
}
