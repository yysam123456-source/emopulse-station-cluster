import { PALETTES, rgba } from '../palette';
import type { AbyssLayer } from './types';

/** 水面焦散线：只画上三分之一，正弦叠加，不参与几何。 */
export function createCausticsLayer(): AbyssLayer {
  return {
    id: 'caustics',
    label: '水面焦散',
    draw(g, _frame, view): void {
      if (view.causticAmount <= 0) return;
      const palette = PALETTES[view.palette];
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.lineWidth = 1;
      const lines = view.lod === 'low' ? 5 : 9;
      for (let i = 0; i < lines; i += 1) {
        const y = view.h * (0.04 + i * 0.013);
        g.strokeStyle = rgba(palette.ray, (0.055 - i * 0.0035) * view.causticAmount);
        g.beginPath();
        for (let x = -view.w * 0.1; x <= view.w * 1.1; x += 12) {
          const yy = y
            + Math.sin(x * 0.009 + view.time * 0.55 + i * 0.7) * (3 + i * 0.7)
            + Math.sin(x * 0.021 - view.time * 0.31 + i * 1.3) * 2.2;
          if (x === -view.w * 0.1) g.moveTo(x, yy);
          else g.lineTo(x, yy);
        }
        g.stroke();
      }
      g.restore();
    },
  };
}
