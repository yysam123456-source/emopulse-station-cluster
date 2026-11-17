// 自研② Canvas 凭证导出 · /license 许可证（编号 / 日期 / 印章 / 宣言，零外部资源）。
import { LICENSE_COPY, formatDate } from '../../content/license';

export interface LicenseData {
  serial: string;
  date: string;
}

/** 离屏绘制许可证并返回 PNG dataURL（不触发网络请求）。 */
export function renderLicense(data: LicenseData): string {
  const canvas = document.createElement('canvas');
  canvas.width = 640; canvas.height = 880;
  const ctx = canvas.getContext('2d')!;

  // 纸纹：程序化噪声，与站点纸零件同源。
  ctx.fillStyle = '#efe7d8'; ctx.fillRect(0, 0, 640, 880);
  let seed = 20261118;
  const rand = (): number => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 24000; i += 1) {
    ctx.fillStyle = `rgba(120,90,60,${(rand() * 0.05).toFixed(3)})`;
    ctx.fillRect(rand() * 640, rand() * 880, 1.4, 1.4);
  }
  ctx.strokeStyle = '#9a8468'; ctx.lineWidth = 3; ctx.strokeRect(26, 26, 588, 828);
  ctx.strokeStyle = '#c6b59b'; ctx.lineWidth = 1; ctx.strokeRect(38, 38, 564, 804);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#4a3b2c'; ctx.font = '700 34px system-ui';
  ctx.fillText('LICENSE TO SIMPLY BE', 320, 122);
  ctx.font = '500 15px ui-monospace, monospace'; ctx.fillStyle = '#7c6a55';
  ctx.fillText(`NO. ${data.serial}`, 320, 176);
  ctx.fillText(data.date, 320, 206);

  ctx.fillStyle = '#4a3b2c'; ctx.font = '600 20px system-ui';
  wrapText(ctx, LICENSE_COPY.declarationEn, 320, 300, 480, 34);
  ctx.font = '500 14px system-ui'; ctx.fillStyle = '#8a7660';
  wrapText(ctx, LICENSE_COPY.declarationZh, 320, 440, 480, 26);

  // 朱砂印章：与盖章零件同视觉。
  ctx.strokeStyle = '#a3342c'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(320, 628, 66, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#a3342c'; ctx.font = '800 19px system-ui';
  ctx.fillText(LICENSE_COPY.sealText, 320, 623);
  ctx.font = '600 10px ui-monospace, monospace';
  ctx.fillText('EMOPULSE · EST. 2026', 320, 648);

  ctx.fillStyle = '#8a7660'; ctx.font = '500 12px ui-monospace, monospace';
  ctx.fillText('NO PURCHASE. NO STRINGS. JUST PERMISSION.', 320, 790);
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
