import { PALETTES, rgba } from '../palette';
import type { AbyssLayer } from './types';

interface Ripple {
  x: number;
  y: number;
  born: number;
  strength: number;
}

/** 指针按下时的扩散涟漪：只负责水面一圈，不抢 L2 的 bubbles。 */
export function createRipplesLayer(): AbyssLayer {
  let ripples: Ripple[] = [];
  let lastDown = false;

  return {
    id: 'ripples',
    label: '指针涟漪',
    update(frame, _view): void {
      const down = frame.pointer.down;
      if (down && !lastDown) {
        ripples.push({ x: frame.pointer.x, y: frame.pointer.y, born: frame.t, strength: 1 });
        if (ripples.length > 8) ripples.shift();
      }
      lastDown = down;
      if (ripples.length > 16) ripples = ripples.slice(-16);
    },
    draw(g, frame, view): void {
      const palette = PALETTES[view.palette];
      g.save();
      g.strokeStyle = rgba(palette.ray, 0.22);
      for (const r of ripples) {
        const age = frame.t - r.born;
        if (age < 0 || age > 1.8) continue;
        g.globalAlpha = (1 - age / 1.8) * 0.55 * r.strength;
        g.lineWidth = 1.2;
        g.beginPath();
        g.arc(r.x * view.w, r.y * view.h, 10 + age * 130, 0, Math.PI * 2);
        g.stroke();
      }
      g.globalAlpha = 1;
      g.restore();
    },
    dispose(): void {
      ripples = [];
      lastDown = false;
    },
  };
}
