// 自研② Canvas 凭证导出 · /praise 夸夸小票（热敏纸 + 锯齿边 + 本地句式）。
import { PRAISE_COPY, type PraiseTicket } from '../../content/praise';

/** 把小票文字按宽度折行。 */
function wrap(text: string, maxChars: number): string[] {
  const out: string[] = [];
  const words = text.split(' ');
  let line = '';
  for (const word of words) {
    if ((line ? `${line} ${word}` : word).length > maxChars && line) { out.push(line); line = word; }
    else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  return out;
}

/** 离屏绘制小票并返回 PNG dataURL。 */
export function renderReceipt(ticket: PraiseTicket): string {
  const canvas = document.createElement('canvas');
  canvas.width = 360; canvas.height = 720;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f6f5ef'; ctx.fillRect(0, 0, 360, 720);
  ctx.fillStyle = '#3c3c38'; ctx.textAlign = 'center';
  ctx.font = '700 15px ui-monospace, monospace';
  ctx.fillText(PRAISE_COPY.header, 180, 48);
  ctx.strokeStyle = '#aaa'; ctx.beginPath(); ctx.moveTo(28, 64); ctx.lineTo(332, 64); ctx.stroke();

  ctx.font = '500 15px ui-monospace, monospace';
  let y = 104;
  for (const line of [...wrap(ticket.opener, 34), '', ...wrap(ticket.middle, 34), '', ...wrap(ticket.closer, 34)]) {
    ctx.fillText(line, 180, y); y += 26;
  }
  ctx.strokeStyle = '#aaa'; ctx.beginPath(); ctx.moveTo(28, y + 8); ctx.lineTo(332, y + 8); ctx.stroke();
  ctx.textAlign = 'left'; ctx.font = '500 13px ui-monospace, monospace';
  ctx.fillText(`NO. ${ticket.serial}`, 36, y + 40);
  ctx.textAlign = 'right'; ctx.fillText(ticket.stamp, 324, y + 40);
  ctx.textAlign = 'center'; ctx.font = '500 12px ui-monospace, monospace';
  ctx.fillText(PRAISE_COPY.footer, 180, 690);

  // 锯齿边：沿上下边界打齿孔。
  ctx.fillStyle = '#241d17';
  for (let x = 12; x < 360; x += 14) {
    ctx.beginPath(); ctx.arc(x, 8, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x, 712, 3, 0, Math.PI * 2); ctx.fill();
  }
  return canvas.toDataURL('image/png');
}

/** 触发本地下载。 */
export function downloadReceipt(dataUrl: string, serial: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `emopulse-praise-${serial}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
