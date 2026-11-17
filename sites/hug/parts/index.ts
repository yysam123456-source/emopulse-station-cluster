// L3 零件薄包装 · /hug 三零件。
// DandelionMeadow.ts / BlowInput.ts / 折纸飞机 flightPosition()：
// 上游未提供可直接嵌入单 HTML 的原件，依文档 §1 零件描述移植为 Canvas 2D 等效实现；
// 保留三状态 ready→drifting→away、错峰释放 aRelease / DETACH_SECONDS、飞行弧线与切线转向。
export interface Part { update(seconds: number): void; dispose(): void; }
type Ctx = CanvasRenderingContext2D;

export type MeadowState = 'ready' | 'drifting' | 'away';

/** 蒲公英：ready → drifting → away；aRelease 种子错峰，DETACH_SECONDS 后脱离花托。 */
export function createDandelionPart(ctx: Ctx): Part & {
  release(): void;
  readonly state: MeadowState;
  readonly released: number;
} {
  const DETACH_SECONDS = 1.6;
  const aRelease: number[] = Array.from({ length: 22 }, (_, i) => (i * 0.618) % 1);
  let state: MeadowState = 'ready';
  let releasedAt = -1;

  const drawSeed = (x: number, y: number, angle: number, alpha: number): void => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#f6e6cf'; ctx.lineWidth = 1;
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * 7, Math.sin(a) * 7); ctx.stroke();
    }
    ctx.fillStyle = '#e8c79a'; ctx.beginPath(); ctx.arc(0, 0, 1.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };

  return {
    get state() { return state; },
    get released() { return state === 'ready' ? 0 : aRelease.length; },
    release(): void { if (state === 'ready') { state = 'drifting'; releasedAt = performance.now(); } },
    update(seconds: number): void {
      const w = ctx.canvas.width, h = ctx.canvas.height;
      ctx.clearRect(0, 0, w, h);
      const cx = w * 0.5, cy = h * 0.66;
      const elapsed = releasedAt < 0 ? 0 : (performance.now() - releasedAt) / 1000;
      if (state === 'drifting' && elapsed > DETACH_SECONDS) state = 'away';

      // 花托与花茎
      ctx.strokeStyle = '#7d8a67'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(cx, h * 0.98); ctx.lineTo(cx, cy + 20); ctx.stroke();

      if (state === 'ready') {
        for (const phase of aRelease) {
          const a = phase * Math.PI * 2;
          drawSeed(cx + Math.cos(a) * 26, cy + Math.sin(a) * 26, a, 0.95);
        }
      } else {
        for (let i = 0; i < aRelease.length; i += 1) {
          // 错峰释放：每颗种子有自己的起飞延迟，DETACH_SECONDS 后完全脱离。
          const delay = aRelease[i]! * 0.9;
          const t = Math.max(0, elapsed - delay);
          const drift = t * 58;
          const x = cx + aRelease[i]! * 40 + drift * 1.4;
          const y = cy + Math.sin(aRelease[i]! * 6.28) * 30 - drift * 0.55 - t * t * 8;
          drawSeed(x, y, aRelease[i]! * 6.28 + t, Math.max(0, 1 - t / 6));
        }
      }
      void seconds;
    },
    dispose(): void { state = 'ready'; releasedAt = -1; },
  };
}

/** BlowInput：默认不主动请求麦克风授权；按钮兜底；用户显式启用后才接 AudioContext。 */
export function createBlowInputPart(opts: { fallbackButton: boolean; autoRequest: boolean }): Part & {
  enable(): Promise<boolean>;
  readonly enabled: boolean;
} {
  let stream: MediaStream | null = null;
  let audio: AudioContext | null = null;
  let raf = 0;
  let enabled = false;
  const onBlow: Array<() => void> = [];

  /** 用户显式点击后才调用；autoRequest=false 时绝不自动弹出授权框。 */
  const enable = async (): Promise<boolean> => {
    if (enabled) return true;
    if (opts.autoRequest) return false;
    try {
      if (!navigator.mediaDevices?.getUserMedia) return false;
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audio = new AudioContext();
      const source = audio.createMediaStreamSource(stream);
      const analyser = audio.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const check = (): void => {
        analyser.getByteFrequencyData(data);
        const level = data.reduce((sum, v) => sum + v, 0) / data.length;
        if (level > 48) for (const cb of onBlow) cb();
        raf = requestAnimationFrame(check);
      };
      raf = requestAnimationFrame(check);
      enabled = true;
      return true;
    } catch {
      // 用户拒绝或无设备：保持按钮兜底路径，不影响体验。
      return false;
    }
  };

  return {
    get enabled() { return enabled; },
    enable,
    update(): void { /* 检测在独立 rAF 中，站点帧只透传 */ },
    dispose(): void {
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      void audio?.close();
      onBlow.length = 0;
      enabled = false;
    },
  };
}

/** 折纸飞机：flightPosition(t) 弧线 + 切线转向（飞向对方）。 */
export function createFlightPart(ctx: Ctx): Part & { launch(): void; readonly active: boolean } {
  let start = -1;
  const flightPosition = (t: number): [number, number] => {
    const w = ctx.canvas.width, h = ctx.canvas.height;
    return [w * (0.3 + 0.5 * t), h * (0.55 - Math.sin(Math.PI * t) * 0.34)];
  };
  return {
    get active() { return start >= 0; },
    launch(): void { start = performance.now(); },
    update(): void {
      if (start < 0) return;
      const t = Math.min(1, (performance.now() - start) / 2600);
      const [x, y] = flightPosition(t);
      const [x2, y2] = flightPosition(Math.min(1, t + 0.01));
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.atan2(y2 - y, x2 - x));
      ctx.fillStyle = '#fff6e8'; ctx.strokeStyle = '#c39b70'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-10, -6); ctx.lineTo(-5, 0); ctx.lineTo(-10, 6);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
      if (t >= 1) start = -1;
    },
    dispose(): void { start = -1; },
  };
}
