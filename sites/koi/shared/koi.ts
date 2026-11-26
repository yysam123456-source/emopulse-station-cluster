// L3 零件 · koi 三风格（写实 / 水墨 / 水彩）。
// 原件已整段归集于 shared/parts-library/koi/（zz85/random-sketches @ gh-pages，28 文件；上游 26 项 + v1 壳）。
// 站点产物受"单 HTML + 零外部资源"约束，这里按原件三着色器的视觉参数移植为 Canvas 2D 实现；
// 原件文件未被改写，也不参与 core 的 6 文件拼接。
import { KOI_STYLES, type KoiStyle } from '../../../content/koi';

export interface Part { update(seconds: number): void; dispose(): void; }
type Ctx = CanvasRenderingContext2D;

interface Fish {
  x: number; y: number; size: number; speed: number; phase: number; hue: number;
}

const PALETTES: Record<KoiStyle, { water: string[]; fish: string[]; ink: boolean }> = {
  pond: { water: ['#205b57', '#2f7a70', '#123d3b'], fish: ['#f6efe3', '#e07b48', '#2b2b2b'], ink: false },
  ink: { water: ['#e7e5df', '#d3d1c9', '#f2f0ea'], fish: ['#29282a', '#5b5a5c', '#a8a6a2'], ink: true },
  watercolor: { water: ['#cbbbd8', '#e7c9d6', '#b9d1dc'], fish: ['#fdf6ef', '#e89c8f', '#8f7fb0'], ink: false },
};

/** 创建三风格锦鲤场景零件。 */
export function createKoiPart(ctx: Ctx, style: KoiStyle): Part {
  const palette = PALETTES[style];
  const seed = 2026 + style.length * 17;
  let s = seed;
  const rand = (): number => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const fish: Fish[] = Array.from({ length: 9 }, () => ({
    x: rand(), y: 0.15 + rand() * 0.7, size: 12 + rand() * 16,
    speed: 0.012 + rand() * 0.018, phase: rand() * 6.28, hue: Math.floor(rand() * 3),
  }));

  const drawFish = (f: Fish, t: number): void => {
    const w = ctx.canvas.width, h = ctx.canvas.height;
    const x = ((f.x + t * f.speed) % 1.2) * w - 0.1 * w;
    const y = f.y * h + Math.sin(t * 0.7 + f.phase) * 14;
    const tail = Math.sin(t * 5 + f.phase) * 0.35;
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = palette.fish[f.hue]!;
    ctx.globalAlpha = palette.ink ? 0.78 : 0.94;
    // 尾鳍：摆动角度来自原件 fish school 的相位错峰思路。
    ctx.beginPath(); ctx.moveTo(-f.size * 0.8, 0);
    ctx.lineTo(-f.size * 1.7, -f.size * (0.45 + tail));
    ctx.lineTo(-f.size * 1.7, f.size * (0.45 - tail));
    ctx.closePath(); ctx.fill();
    // 身体
    ctx.beginPath(); ctx.ellipse(0, 0, f.size, f.size * 0.46, 0, 0, Math.PI * 2); ctx.fill();
    // 斑纹（写实 / 水彩用暖色，水墨用浓墨）
    ctx.fillStyle = palette.ink ? '#151516' : (f.hue === 1 ? '#b9562f' : '#d8cbb4');
    ctx.globalAlpha = palette.ink ? 0.6 : 0.75;
    ctx.beginPath(); ctx.ellipse(f.size * 0.2, -f.size * 0.1, f.size * 0.3, f.size * 0.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };

  return {
    update(seconds: number): void {
      const w = ctx.canvas.width, h = ctx.canvas.height;
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, palette.water[0]!);
      grad.addColorStop(0.5, palette.water[1]!);
      grad.addColorStop(1, palette.water[2]!);
      ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);

      // 水面涟漪：多圈同心椭圆，随相位缓慢扩散。
      ctx.strokeStyle = palette.ink ? 'rgba(30,30,30,.10)' : 'rgba(255,255,255,.14)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i += 1) {
        const r = ((seconds * 14 + i * 48) % 190) + 12;
        ctx.beginPath(); ctx.ellipse(w * 0.6, h * 0.42, r, r * 0.3, 0, 0, Math.PI * 2); ctx.stroke();
      }
      for (const f of fish) drawFish(f, seconds);

      // 风格标签：让三个落地页首屏即可区分（SEO 标题在 template 中）。
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.font = '600 11px ui-monospace, monospace'; ctx.textAlign = 'left';
      ctx.fillText(KOI_STYLES[style].title.toUpperCase(), 14, 22);
    },
    dispose(): void { fish.length = 0; },
  };
}
