import { PALETTES, hash, rgba } from '../palette';
import type { AbyssLayer } from './types';

/** 顶部斜射光柱：加法混合，横向边缘用 blur 软化。 */
export function createRaysLayer(): AbyssLayer {
  return {
    id: 'rays',
    label: '斜射光柱',
    draw(g, _frame, view): void {
      if (view.rayAmount <= 0) return;
      const palette = PALETTES[view.palette];
      const beams = view.lod === 'low' ? 3 : 5;
      g.save();
      g.globalCompositeOperation = 'lighter';
      if (view.lod !== 'low') g.filter = 'blur(9px)';
      for (let i = 0; i < beams; i += 1) {
        const phase = view.time * (0.045 + i * 0.007) + i * 1.63;
        const x = view.w * (0.16 + i * 0.17) + Math.sin(phase) * view.w * 0.06;
        const width = view.w * (0.05 + hash(i * 3.7 + 1.3) * 0.09);
        const angle = -0.18 + Math.sin(phase * 0.7) * 0.09;
        g.save();
        g.translate(x, -view.h * 0.12);
        g.rotate(angle);
        const grad = g.createLinearGradient(0, 0, 0, view.h * 1.35);
        grad.addColorStop(0, rgba(palette.ray, 0.22 * view.rayAmount));
        grad.addColorStop(0.35, rgba(palette.ray, 0.09 * view.rayAmount));
        grad.addColorStop(0.78, rgba(palette.ray, 0.02 * view.rayAmount));
        grad.addColorStop(1, rgba(palette.ray, 0));
        g.fillStyle = grad;
        g.fillRect(-width / 2, 0, width, view.h * 1.35);
        g.restore();
      }
      g.restore();
    },
  };
}
