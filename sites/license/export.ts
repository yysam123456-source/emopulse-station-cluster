// 自研② Canvas 凭证导出 · /license 许可证（编号 / 日期 / 印章 / 宣言，零外部资源）。
import { LICENSE_COPY, formatDate } from '../../content/license';

export interface LicenseData {
  serial: string;
  date: string;
  /**
   * 光的方向角（度）—— 必须由调用方传 `sunAngleAt(t_press)`（`./stay.ts`）。
   * **不要在这里自己算**：屏幕上的光与这张卡必须是同一个函数算出来的，
   * 否则"图里的光 = 你按下去那一刻"这条承诺就是假的。
   */
  sunAngle?: number;
}

/** 卡片尺寸：1410×1000 = 1.41，与屏上纸同比例（cover 裁切才不会剪掉纸）。 */
export const CARD_W = 1410;
export const CARD_H = 1000;

/** 离屏绘制许可证并返回 PNG dataURL（不触发网络请求）。1410×1000，比例与屏上纸一致。 */
export function renderLicense(data: LicenseData): string {
  const W = CARD_W;
  const H = CARD_H;
  const cx = W / 2;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // 纸纹：程序化噪声，与站点纸零件同源。
  ctx.fillStyle = '#efe7d8'; ctx.fillRect(0, 0, W, H);
  let seed = 20261118;
  const rand = (): number => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 24000; i += 1) {
    ctx.fillStyle = `rgba(120,90,60,${(rand() * 0.05).toFixed(3)})`;
    ctx.fillRect(rand() * W, rand() * H, 2.0, 2.0);
  }
  ctx.strokeStyle = '#9a8468'; ctx.lineWidth = 5; ctx.strokeRect(38, 38, W - 76, H - 76);
  ctx.strokeStyle = '#c6b59b'; ctx.lineWidth = 2; ctx.strokeRect(54, 54, W - 108, H - 108);

  // 方向光：与屏幕**同一个角度**（`sunAngleAt(t_press)`），乘算叠在纸面上
  const angle = typeof data.sunAngle === 'number' ? data.sunAngle : -26;
  const rad = ((angle - 90) * Math.PI) / 180;
  const dx = Math.cos(rad) * W * 0.5;
  const dy = Math.sin(rad) * H * 0.5;
  const lit = ctx.createLinearGradient(cx - dx, H / 2 - dy, cx + dx, H / 2 + dy);
  lit.addColorStop(0, 'rgba(255,248,236,0.42)');
  lit.addColorStop(0.42, 'rgba(255,255,255,0)');
  lit.addColorStop(1, 'rgba(26,18,10,0.42)');
  ctx.fillStyle = lit;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#4a3b2c'; ctx.font = '700 46px system-ui';
  ctx.fillText('LICENSE TO SIMPLY BE', cx, 150);
  ctx.font = '500 20px ui-monospace, monospace'; ctx.fillStyle = '#7c6a55';
  ctx.fillText(`NO. ${data.serial}`, cx, 214);
  ctx.fillText(data.date, cx, 248);

  ctx.fillStyle = '#4a3b2c'; ctx.font = '600 27px system-ui';
  wrapText(ctx, LICENSE_COPY.declarationEn, cx, 360, 900, 44);
  ctx.font = '500 19px system-ui'; ctx.fillStyle = '#8a7660';
  wrapText(ctx, LICENSE_COPY.declarationZh, cx, 520, 900, 34);

  // 朱砂印章：与盖章零件同视觉。
  ctx.strokeStyle = '#a3342c'; ctx.lineWidth = 7;
  ctx.beginPath(); ctx.arc(cx, 700, 86, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#a3342c'; ctx.font = '800 26px system-ui';
  ctx.fillText(LICENSE_COPY.sealText, cx, 694);
  ctx.font = '600 14px ui-monospace, monospace';
  ctx.fillText('EMOPULSE · EST. 2026', cx, 724);

  ctx.fillStyle = '#8a7660'; ctx.font = '500 16px ui-monospace, monospace';
  ctx.fillText('NO PURCHASE. NO STRINGS. JUST PERMISSION.', cx, 900);
  return canvas.toDataURL('image/png');
}

/** 按宽度折行绘制文本。 */
function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number): void {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const word of words) {
    const trial = line ? `${line} ${word}` : word;
    if (ctx.measureText(trial).width > maxWidth && line) {
      ctx.fillText(line, x, yy);
      line = word;
      yy += lineHeight;
    } else line = trial;
  }
  if (line) ctx.fillText(line, x, yy);
}

/** 触发浏览器下载（本地 dataURL，不产生外部请求）。 */
export function downloadLicense(dataUrl: string, serial: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `emopulse-license-${serial}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
