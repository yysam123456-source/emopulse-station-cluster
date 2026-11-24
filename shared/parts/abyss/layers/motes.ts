import { PALETTES, hash, rgba } from '../palette';
import type { AbyssLayer, AbyssView } from './types';

interface Mote {
  x: number;
  y: number;
  r: number;
  speed: number;
  phase: number;
  alpha: number;
}

/** 悬浮微粒：按 seed 生成，随 frame.t 缓慢漂移。 */
export function createMotesLayer(): AbyssLayer {
  let motes: Mote[] = [];

  const seed = (view: AbyssView): void => {
    const n = Math.round((view.lod === 'low' ? 42 : 112) * view.density);
    motes = Array.from({ length: n }, (_, i) => ({
      x: hash(i * 2.37 + 1.1),
      y: hash(i * 3.91 + 2.7),
      r: 0.8 + hash(i * 4.23 + 3.3) * 2.2,
      speed: 0.006 + hash(i * 5.11 + 4.1) * 0.022,
      phase: hash(i * 6.47 + 5.9) * Math.PI * 2,
      alpha: 0.18 + hash(i * 7.21 + 6.3) * 0.42,
    }));
  };

  return {
    id: 'motes',
    label: '悬浮微粒',
    resize: seed,
    draw(g, frame, view): void {
      const palette = PALETTES[view.palette];
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (const m of motes) {
        const yy = ((m.y + frame.t * m.speed) % 1.08) - 0.04;
        const xx = m.x + Math.sin(frame.t * (0.12 + m.speed) + m.phase) * 0.012;
        const alpha = m.alpha * (0.65 + 0.35 * Math.sin(frame.t * 0.4 + m.phase));
        g.fillStyle = rgba(palette.dust, alpha);
        g.beginPath();
        g.arc(xx * view.w, yy * view.h, m.r * (view.lod === 'low' ? 0.8 : 1), 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    },
    dispose(): void {
      motes = [];
    },
  };
}
