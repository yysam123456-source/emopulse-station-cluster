// L3 零件薄包装 · /praise 四零件（来源：Room at Dawn 热敏纸纹 / 折纸 PAPER_GAP 双材质 /
// sylva 指针 NDC + 平面射线 / 自研打字机逐行吐出）。
// 上游未提供可直接嵌入单 HTML 的原件，依文档 §1 零件描述移植为 Canvas 2D 等效实现。
export interface Part { update(seconds: number): void; dispose(): void; }
type Ctx = CanvasRenderingContext2D;

/** Room at Dawn：热敏纸纹 + 锯齿边（程序化，零贴图）。 */
export function createReceiptPaperPart(ctx: Ctx): Part {
  return {
    update(): void {
      const w = ctx.canvas.width, h = ctx.canvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#f6f5ef';
      ctx.beginPath();
      ctx.moveTo(20, 8);
      ctx.lineTo(w - 20, 8);
      for (let x = w - 20; x > 20; x -= 12) ctx.lineTo(x - 6, 18);
      ctx.lineTo(20, h - 8);
      for (let x = 20; x < w - 20; x += 12) ctx.lineTo(x + 6, h - 18);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(110,110,100,.05)';
      let seed = 4242;
      const rand = (): number => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      for (let i = 0; i < 3000; i += 1) ctx.fillRect(20 + rand() * (w - 40), 10 + rand() * (h - 20), 1, 1);
    },
    dispose(): void { /* 无监听 */ },
  };
}

/** 折纸飞机 PAPER_GAP：正反面双材质 + 纸层前后关系。 */
export function createLayersPart(ctx: Ctx): Part & { setOpen(amount: number): void } {
  let open = 0;
  return {
    setOpen(amount: number): void { open = Math.max(0, Math.min(1, amount)); },
    update(): void {
      const w = ctx.canvas.width, h = ctx.canvas.height;
      const gap = 18 * open;
      // 后层（反面材质）
      ctx.fillStyle = '#d9ded9';
      ctx.fillRect(w * 0.22 + 14 + gap, 26, w * 0.56, h - 52);
      ctx.strokeStyle = '#b3bbb3'; ctx.lineWidth = 1; ctx.strokeRect(w * 0.22 + 14 + gap, 26, w * 0.56, h - 52);
      // 前层（正面材质）：指针拨开时左右位移
      ctx.fillStyle = '#f6f5ef';
      ctx.fillRect(w * 0.22 - gap, 26, w * 0.56, h - 52);
      ctx.strokeStyle = '#c9c9bf'; ctx.strokeRect(w * 0.22 - gap, 26, w * 0.56, h - 52);
    },
    dispose(): void { open = 0; },
  };
}

/** sylva：指针 NDC + 平面射线 → 纸层拨开量。 */
export function createPointerPart(ctx: Ctx): Part & { setPointer(clientX: number, clientY: number): void; readonly ndc: [number, number] } {
  let ndc: [number, number] = [0, 0];
  const onMove = (e: PointerEvent): void => {
    const rect = ctx.canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    ndc = [Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, y))];
  };
  ctx.canvas.addEventListener('pointermove', onMove);
  return {
    get ndc() { return ndc; },
    setPointer(clientX: number, clientY: number): void { onMove({ clientX, clientY } as PointerEvent); },
    update(): void { /* 仅维护 NDC，绘制由 layers 完成 */ },
    dispose(): void { ctx.canvas.removeEventListener('pointermove', onMove); },
  };
}

/** 打字机：按秒逐行吐出（自研 glue，非复制零件）。 */
export function createTypewriterPart(ctx: Ctx): Part & { setLines(lines: string[]): void; readonly done: boolean } {
  let lines: string[] = [];
  let startedAt = -1;
  return {
    get done(): boolean { return startedAt >= 0 && (performance.now() - startedAt) / 420 >= lines.length; },
    setLines(next: string[]): void { lines = next; startedAt = performance.now(); },
    update(): void {
      if (startedAt < 0) return;
      const count = Math.min(lines.length, Math.floor((performance.now() - startedAt) / 420));
      const w = ctx.canvas.width;
      ctx.fillStyle = '#3c3c38';
      ctx.font = `500 ${Math.max(11, Math.round(w / 30))}px ui-monospace, Consolas, monospace`;
      ctx.textAlign = 'left';
      for (let i = 0; i < count; i += 1) {
        ctx.fillText(lines[i] ?? '', w * 0.26, 62 + i * 22);
      }
      if (count > 0 && count <= lines.length) {
        const caretX = w * 0.26 + ctx.measureText(lines[count - 1] ?? '').width;
        ctx.fillRect(caretX + 2, 52 + count * 22, 7, 2);
      }
    },
    dispose(): void { lines = []; startedAt = -1; },
  };
}
