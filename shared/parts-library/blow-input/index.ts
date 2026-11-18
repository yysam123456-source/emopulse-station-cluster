// 装配壳（契约 v1）：blow-input —— 吹气输入（D3 算法移植）。
//
// 本壳是**无音频**的装配形态：只持有检测状态机，供注册中心构造与单测；
// 真正的 getUserMedia / AudioContext / AnalyserNode 生命周期在 sites/hug/parts/blow-input.ts。
// 硬约束：构造期零 DOM / 零 navigator / 零 AudioContext —— Node 下 import + createPart 均安全。
import type { PartInstance, PartOptions } from '../../contract/parts-registry';
import manifest from './part.manifest';
import {
  BlowDetector,
  CALIBRATION_SECONDS,
  type BlowFrame,
} from './core/detector';

export { manifest };

/** 零件 id（与 part.manifest.ts 一致）。 */
export const PART_ID: string = manifest.id;

/**
 * 创建 blow-input 零件实例。
 *
 * `pipe(frame)` 接收一帧 { wave, freq, sampleRate, dt }，返回读数（含 fired）；
 * `pipe('reset')` 重新校准；其余输入原样回显最近读数。
 */
export function createPart(options: PartOptions): PartInstance {
  const configured = options?.options?.calibrationSeconds;
  const detector = new BlowDetector(typeof configured === 'number' ? configured : CALIBRATION_SECONDS);
  let disposed = false;

  return {
    update(seconds: number): void {
      // 检测节奏由输入帧驱动（真实音频在站点侧是 rAF），此处只做时间兜底
      void seconds;
    },

    pipe(input: unknown): unknown {
      if (disposed) return null;
      if (input === 'reset') {
        detector.reset();
        return detector.reading;
      }
      if (input && typeof input === 'object' && 'wave' in input && 'freq' in input) {
        return detector.push(input as BlowFrame);
      }
      return detector.reading;
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      detector.reset(0);
    },
  };
}

export default createPart;
