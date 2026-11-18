// /hug 三零件入口（薄装配层）。
//
// 蒲公英与吹气输入的算法核心已迁到 shared/parts-library/：
//   - dandelion：core/meadow.ts（Fibonacci 球面 1335 颗 / 44 段种子 / DETACH_SECONDS=1.8 /
//     三轴异速飘散 / fade·attachedAlpha），本站 dandelion.ts 只做 Canvas 2D 渲染；
//   - blow-input：core/detector.ts（fftSize 2048 / smoothing 0.65 / baseline EMA /
//     threshold Max(0.025, baseline*2.8) / broadband / breath 积分），本站 blow-input.ts 只做音频资源生命周期。
// 两件均按公众号原文《Three.js 实战：把愿望交给风，做一个可以吹散的蒲公英网页》的完整代码移植，
// 溯源见 shared/parts-library/{dandelion,blow-input}/part.manifest.ts 与 EXCERPT.md。
//
// 纸飞机不属于本轮移植范围，仍留在本文件（原件的 flightPosition() 弧线 + 切线转向）。
export { createDandelionPart, type MeadowState, type DandelionOptions } from './dandelion';
export { createBlowInputPart, type BlowInputOptions, type BlowInputPart } from './blow-input';

/** 站点零件的最小生命周期契约（与 shared/contract/parts-registry 的 PartInstance 同构）。 */
export interface Part {
  update(seconds: number): void;
  dispose(): void;
}

type Ctx = CanvasRenderingContext2D;

/** 折纸飞机：flightPosition(t) 弧线 + 切线转向（飞向对方）。 */
export function createFlightPart(ctx: Ctx): Part & { launch(): void; readonly active: boolean } {
  let start = -1;
  const flightPosition = (t: number): [number, number] => {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
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
      const scale = Math.max(1, ctx.canvas.height / 160);
      ctx.scale(scale, scale);
      ctx.fillStyle = '#fff6e8';
      ctx.strokeStyle = '#c39b70';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(-10, -6);
      ctx.lineTo(-5, 0);
      ctx.lineTo(-10, 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      if (t >= 1) start = -1;
    },
    dispose(): void { start = -1; },
  };
}
