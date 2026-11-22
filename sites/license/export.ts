// 自研② Canvas 凭证导出 · /license 许可证（编号 / 日期 / 印章 / 宣言，零外部资源）。
//
// ★ 2026-11-19 修正（这是本文件第二次返工）：
//   旧版根本没有读主画布 —— 它新建一张 canvas，程序化画纸纹、光照、文字、章，
//   再手写一句 COPY 里不存在的 `NO PURCHASE. NO STRINGS. JUST PERMISSION.`。
//   于是「保存的卡」和「屏幕上的纸」是两张不同的设计，而测试只验了 PNG 能解码。
//   现在：**纸面 = 主画布的纸矩形裁切**，文字/章 = 与 CSS 同一组百分比，
//   光 = 同一个 `sunAngleAt(t_press)`。唯一允许的差异是**不印交互提示**
//   （`drag to move the light` 是 UI，不属于一张可以带走的许可证）。
import { COPY } from '../../shared/sites/copy.mjs';
import { LICENSE_COPY } from '../../content/license';
import type { Rect } from '../../shared/stage/contract';

export interface LicensePaper {
  /** 主画布（`#stage`）—— 纸面从它裁切，而不是重画 */
  canvas: HTMLCanvasElement;
  /** 纸矩形（CSS px），来自 `stage.geometry.sheet` */
  rect: Rect;
}

export interface LicenseData {
  serial: string;
  date: string;
  /**
   * 光的方向角（度）—— 必须由调用方传 `sunAngleAt(t_press)`（`./stay.ts`）。
   * **不要在这里自己算**：屏幕上的光与这张卡必须是同一个函数算出来的，
   * 否则"图里的光 = 你按下去那一刻"这条承诺就是假的。
   */
  sunAngle?: number;
  /** 主画布 + 纸矩形；没有时退回程序化纸面（单测/无 DOM 环境） */
  paper?: LicensePaper | null;
}

/** 卡片尺寸：1410×1000 = 1.41，与屏上纸同比例（cover 裁切才不会剪掉纸）。 */
export const CARD_W = 1410;
export const CARD_H = 1000;

/** 屏上纸的基准宽（1280×800 的 82% 上限 → 1024）：所有字号按它换算到卡宽。 */
const BASE_SHEET_W = 1024;

/**
 * 离屏绘制许可证并返回 PNG dataURL（不触发网络请求）。1410×1000，比例与屏上纸一致。
 *
 * @param data 编号/日期/光角/纸面来源
 * @returns PNG dataURL
 */
export function renderLicense(data: LicenseData): string {
  const W = CARD_W;
  const H = CARD_H;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const unit = W / BASE_SHEET_W; // 屏上 1px → 卡上多少 px

  // ── 纸面：优先用屏幕画布的纸矩形裁切 ──
  const paper = data.paper;
  let cropped = false;
  if (paper && paper.canvas && paper.rect) {
    const cssW = paper.canvas.clientWidth || (paper.canvas.width / (window.devicePixelRatio || 1));
    if (cssW > 0) {
      const k = paper.canvas.width / cssW;
      const sx = paper.rect.x * k;
      const sy = paper.rect.y * k;
      const sw = paper.rect.w * k;
      const sh = paper.rect.h * k;
      try {
        ctx.drawImage(paper.canvas, sx, sy, sw, sh, 0, 0, W, H);
        cropped = true;
      } catch {
        cropped = false;
      }
    }
  }

  if (!cropped) {
    // 退化路径：程序化纸纹（与 paper-ink 同一套参数；仅无 DOM/测试用）
    ctx.fillStyle = '#efe7d8'; ctx.fillRect(0, 0, W, H);
    let seed = 20261118;
    const rand = (): number => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 24000; i += 1) {
      ctx.fillStyle = `rgba(120,90,60,${(rand() * 0.05).toFixed(3)})`;
      ctx.fillRect(rand() * W, rand() * H, 2.0, 2.0);
    }
  }

  // ── 光：与屏幕 #sun 的 CSS 渐变**同一角度语义** ──
  const angle = typeof data.sunAngle === 'number' ? data.sunAngle : -26;
  const rad = ((angle - 90) * Math.PI) / 180;
  const dx = Math.cos(rad) * W * 0.5;
  const dy = Math.sin(rad) * H * 0.5;
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  const lit = ctx.createLinearGradient(W / 2 - dx, H / 2 - dy, W / 2 + dx, H / 2 + dy);
  lit.addColorStop(0, 'rgba(255,255,255,1)');
  lit.addColorStop(0.44, 'rgba(255,255,255,1)');
  lit.addColorStop(1, 'rgba(96,74,50,0.48)');
  ctx.fillStyle = lit;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  // ── 纸边：与 #sheet 的 inset 1px 同值 ──
  ctx.strokeStyle = 'rgba(120,100,80,0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, W - 1, H - 1);

  const left = W * 0.075;
  const serif = 'Georgia, "Songti SC", serif';
  const mono = 'ui-monospace, Menlo, monospace';
  const topY = (fraction: number, size: number): number => H * fraction + size * 0.78;

  // ── H1（屏上 left 7.5% / top 13%）──
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(52,42,32,0.92)';
  ctx.font = `400 ${34 * unit}px ${serif}`;
  ctx.letterSpacing = '0.01em';
  ctx.fillText(COPY.license.h1, left, topY(0.13, 34 * unit));

  // ── hook（屏上 left 7.5% / top 80% / max 62%）──
  ctx.fillStyle = 'rgba(58,48,38,0.82)';
  ctx.font = `400 ${15 * unit}px ${serif}`;
  ctx.letterSpacing = '0.01em';
  wrapText(ctx, COPY.license.hook, left, topY(0.80, 15 * unit), W * 0.62, 22 * unit);

  // ── 表单（屏上：标题 30% / 页眉线 34.5% / 宣言 40% / 编号 60% / 日期 65%）──
  ctx.fillStyle = 'rgba(74,59,44,0.75)';
  ctx.font = `600 ${13 * unit}px ${mono}`;
  ctx.letterSpacing = '0.24em';
  ctx.fillText(COPY.license.cardTitle, left, topY(0.30, 13 * unit));

  ctx.letterSpacing = '0em';
  ctx.fillStyle = 'rgba(74,59,44,0.22)';
  ctx.fillRect(left, H * 0.345, W * 0.85, 1);

  ctx.fillStyle = 'rgba(52,42,32,0.90)';
  ctx.font = `400 ${19 * unit}px ${serif}`;
  wrapText(ctx, COPY.license.declaration, left, topY(0.40, 19 * unit), W * 0.62, 30 * unit);

  ctx.fillStyle = 'rgba(52,42,32,0.92)';
  ctx.font = `500 ${14 * unit}px ${mono}`;
  ctx.letterSpacing = '0.04em';
  ctx.fillText(`${COPY.license.serialLabel} ${data.serial}`, left, topY(0.60, 14 * unit));

  ctx.fillStyle = 'rgba(74,59,44,0.72)';
  ctx.font = `400 ${13 * unit}px ${mono}`;
  ctx.letterSpacing = '0em';
  ctx.fillText(data.date, left, topY(0.65, 13 * unit));

  // ── 朱砂印章（屏上：right 14% / bottom 16% / 96px / 3px 描边）──
  const sealR = W * 0.0469; // 96 / 1024
  const cx = W * 0.86 - sealR;
  const cy = H * 0.84 - sealR;
  ctx.strokeStyle = 'rgba(163,52,44,0.85)';
  ctx.lineWidth = 3 * unit;
  ctx.beginPath();
  ctx.arc(cx, cy, sealR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(163,52,44,0.90)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${13 * unit}px ${mono}`;
  ctx.letterSpacing = '0.08em';
  ctx.fillText(COPY.license.sealText, cx, cy + 1 * unit);

  // 章下副行：屏上 left 58% / width 28%（中心 72%）
  ctx.fillStyle = 'rgba(163,52,44,0.72)';
  ctx.font = `500 ${11 * unit}px ${mono}`;
  ctx.letterSpacing = '0.10em';
  ctx.fillText(COPY.license.sealSub, W * 0.8125, H * 0.855 + 11 * unit * 0.78);

  // 复原，避免影响后续（本函数每次新建 ctx，但显式复位是好习惯）
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.letterSpacing = '0em';
  void LICENSE_COPY;
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
