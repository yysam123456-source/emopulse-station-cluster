// L3 零件薄包装 · /license 四零件（来源：Grand Atelier 击弦机 / Crimson Loong 事件表 /
// Room at Dawn 程序化噪声 / 照片折纸飞机 fold()+flightPosition()）。
// 因上游未提供可直接嵌入单 HTML 的原件，按文档 §1 零件描述移植为 Canvas 2D 等效实现，
// 保留原零件的关键参数与联动顺序，不改任何 core 文件。
export interface Part {
  update(seconds: number): void;
  dispose(): void;
}

type Ctx = CanvasRenderingContext2D;

/** Room at Dawn：程序化纸纹（噪声 + 纤维），零外部贴图。 */
export function createPaperPart(ctx: Ctx, opts: { tint?: string } = {}): Part {
  const tile = document.createElement('canvas');
  tile.width = tile.height = 128;
  const tctx = tile.getContext('2d')!;
  const img = tctx.createImageData(128, 128);
  let seed = 1337;
  const rand = (): number => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let y = 0; y < 128; y += 1) {
    for (let x = 0; x < 128; x += 1) {
      const i = (y * 128 + x) * 4;
      const fiber = rand() * 18 + (x % 7 === 0 ? 6 : 0);
      const base = 236 - fiber;
      img.data[i] = base; img.data[i + 1] = base - 4; img.data[i + 2] = base - 12; img.data[i + 3] = 255;
    }
  }
  tctx.putImageData(img, 0, 0);
  const pattern = ctx.createPattern(tile, 'repeat');
  return {
    update(): void {
      const { width: w, height: h } = ctx.canvas;
      ctx.fillStyle = pattern ?? '#eee8dc';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(120,90,60,.25)';
      ctx.lineWidth = 1;
      ctx.strokeRect(8.5, 8.5, w - 17, h - 17);
      if (opts.tint) { ctx.fillStyle = opts.tint; ctx.fillRect(0, 0, w, h); }
    },
    dispose(): void { /* 无监听，pattern 随 canvas 释放 */ },
  };
}

/** Crimson Loong：审查时间轴 verifying → stamping → approved。 */
export function createTimelinePart(ctx: Ctx): Part & { setStage(stage: number): void } {
  let stage = 0;
  const labels = ['VERIFYING', 'STAMPING', 'APPROVED'];
  return {
    setStage(next: number): void { stage = Math.max(0, Math.min(2, next)); },
    update(): void {
      const w = ctx.canvas.width, y = 52;
      ctx.strokeStyle = 'rgba(70,50,30,.35)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(24, y); ctx.lineTo(w - 24, y); ctx.stroke();
      for (let i = 0; i < 3; i += 1) {
        const x = 24 + (i * (w - 48)) / 2;
        ctx.beginPath(); ctx.arc(x, y, i <= stage ? 7 : 4, 0, Math.PI * 2);
        ctx.fillStyle = i <= stage ? '#a3342c' : 'rgba(70,50,30,.25)'; ctx.fill();
        ctx.font = '600 11px ui-monospace, monospace'; ctx.textAlign = 'center';
        ctx.fillStyle = i <= stage ? '#5b251f' : 'rgba(70,50,30,.45)';
        ctx.fillText(labels[i]!, x, y + 22);
      }
    },
    dispose(): void { /* 无监听 */ },
  };
}

/** Grand Atelier：按钮 → 印章 → 出证（原击弦机 key→hammer→damper 联动顺序）。 */
export function createStampPart(ctx: Ctx): Part & { strike(): void; readonly pressed: boolean } {
  let start = -1;
  return {
    get pressed() { return start >= 0; },
    strike(): void { start = performance.now(); },
    update(): void {
      const w = ctx.canvas.width, cx = w / 2, cy = 128;
      const t = start < 0 ? 0 : Math.min(1, (performance.now() - start) / 900);
      const drop = t < 0.45 ? t / 0.45 : t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      // 杠杆与印头联动：按下时活塞下移、两边配重抬起。
      ctx.strokeStyle = '#6d5540'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(cx - 80, cy - 44); ctx.lineTo(cx + 80, cy - 44); ctx.stroke();
      ctx.fillStyle = '#8c6a4c';
      ctx.fillRect(cx - 12, cy - 44 + drop * 26, 24, 34);
      ctx.fillStyle = '#a3342c';
      ctx.fillRect(cx - 26, cy - 10 + drop * 34, 52, 14);
      if (t >= 0.45 && t < 0.95) {
        ctx.globalAlpha = Math.min(1, (t - 0.45) * 6);
        ctx.strokeStyle = '#a3342c'; ctx.lineWidth = 3;
        ctx.strokeRect(cx - 46, cy + 46, 92, 34);
        ctx.font = '700 15px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#a3342c';
        ctx.fillText('APPROVED', cx, cy + 69);
        ctx.globalAlpha = 1;
      }
      if (t >= 1) start = -1;
    },
    dispose(): void { start = -1; },
  };
}

/** 折纸飞机：fold() 折面 + flightPosition(t) 弧线 + 切线转向（飞走彩蛋）。 */
export function createPlanePart(ctx: Ctx): Part & { launch(): void } {
  let launchedAt = -1;
  const flightPosition = (t: number): [number, number] => {
    const x = 24 + t * (ctx.canvas.width - 48);
    const y = ctx.canvas.height - 24 - Math.sin(Math.PI * t) * 64;
    return [x, y];
  };
  return {
    launch(): void { launchedAt = performance.now(); },
    update(): void {
      if (launchedAt < 0) return;
      const t = Math.min(1, (performance.now() - launchedAt) / 1800);
      const [x, y] = flightPosition(t);
      const [x2, y2] = flightPosition(Math.min(1, t + 0.02));
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.atan2(y2 - y, x2 - x));
      const fold = Math.min(1, t * 3); // fold()：机翼折面随飞行收拢
      ctx.fillStyle = '#f7f1e6'; ctx.strokeStyle = '#8c6a4c'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-12, -7 * fold); ctx.lineTo(-6, 0); ctx.lineTo(-12, 7 * fold);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
      if (t >= 1) launchedAt = -1;
    },
    dispose(): void { launchedAt = -1; },
  };
}
