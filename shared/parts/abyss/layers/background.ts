import { PALETTES, hash, rgba } from '../palette';
import type { AbyssLayer, AbyssView } from './types';

/** 深水渐变 + 顶部冷光 + 暗角 + 颗粒；只有离屏缓存，不参与每帧粒子。 */
export function createBackgroundLayer(): AbyssLayer {
  let cache: HTMLCanvasElement | null = null;

  const rebuild = (view: AbyssView): void => {
    // Node 冒烟用假 canvas，没有 document；退回纯色底，不把装配打成 E_PART_THROW。
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
      cache = null;
      return;
    }
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(view.w * view.dpr));
    c.height = Math.max(1, Math.round(view.h * view.dpr));
    const g = c.getContext('2d');
    if (!g) {
      cache = null;
      return;
    }
    g.scale(view.dpr, view.dpr);
    const palette = PALETTES[view.palette];

    const grad = g.createLinearGradient(0, 0, 0, view.h);
    grad.addColorStop(0, rgba(palette.top, 1));
    grad.addColorStop(0.46, rgba(palette.mid, 1));
    grad.addColorStop(1, rgba(palette.bottom, 1));
    g.fillStyle = grad;
    g.fillRect(0, 0, view.w, view.h);

    const top = g.createRadialGradient(view.w * 0.5, -view.h * 0.1, 0, view.w * 0.5, -view.h * 0.1, Math.max(view.w, view.h) * 0.7);
    top.addColorStop(0, rgba(palette.ray, 0.16));
    top.addColorStop(0.5, rgba(palette.ray, 0.04));
    top.addColorStop(1, rgba(palette.ray, 0));
    g.fillStyle = top;
    g.fillRect(0, 0, view.w, view.h);

    if (view.vignette) {
      const v = g.createRadialGradient(
        view.w * 0.5, view.h * 0.48, Math.min(view.w, view.h) * 0.22,
        view.w * 0.5, view.h * 0.5, Math.max(view.w, view.h) * 0.78,
      );
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.42)');
      g.fillStyle = v;
      g.fillRect(0, 0, view.w, view.h);
    }

    const grainCount = Math.round((view.w * view.h) / 5200);
    for (let i = 0; i < grainCount; i += 1) {
      const x = hash(i * 1.37 + 0.4) * view.w;
      const y = hash(i * 2.71 + 0.9) * view.h;
      g.fillStyle = `rgba(255,255,255,${0.008 + hash(i * 3.19 + 1.7) * 0.018})`;
      g.fillRect(x, y, 1, 1);
    }
    cache = c;
  };

  return {
    id: 'background',
    label: '深水底材',
    resize: rebuild,
    draw(g, _frame, view): void {
      if (cache) g.drawImage(cache, 0, 0, view.w, view.h);
      else {
        g.fillStyle = rgba(PALETTES[view.palette].bottom, 1);
        g.fillRect(0, 0, view.w, view.h);
      }
    },
    dispose(): void {
      cache = null;
    },
  };
}
