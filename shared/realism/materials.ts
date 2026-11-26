import * as THREE from 'three';
import type { RealismPalette } from './types';

export type Surface =
  | 'cedar'
  | 'cedarVertical'
  | 'redLacquer'
  | 'darkWood'
  | 'plaster'
  | 'roofTile'
  | 'roofEdge'
  | 'mortar'
  | 'stone'
  | 'moss'
  | 'grass'
  | 'gravel'
  | 'bark'
  | 'shoji'
  | 'paper'
  | 'gold'
  | 'copper'
  | 'snow'
  | 'soot';

function mulberry(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  if (!g) throw new Error('MaterialLab 需要 2D 画布');
  return [c, g];
}

function texture(
  paint: (g: CanvasRenderingContext2D, size: number, rng: () => number) => void,
  opts: {
    size?: number;
    seed: number;
    repeat?: readonly [number, number];
    srgb?: boolean;
    mirror?: boolean;
    anisotropy?: number;
  },
): THREE.CanvasTexture {
  const size = opts.size ?? 512;
  const [c, g] = canvas(size);
  paint(g, size, mulberry(opts.seed));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = opts.mirror === false ? THREE.RepeatWrapping : THREE.MirroredRepeatWrapping;
  t.repeat.set(opts.repeat?.[0] ?? 1, opts.repeat?.[1] ?? 1);
  t.anisotropy = opts.anisotropy ?? 4;
  t.needsUpdate = true;
  return t;
}

function grain(
  g: CanvasRenderingContext2D,
  size: number,
  rng: () => number,
  vertical: boolean,
  strokes: number,
  dark: string,
  light: string,
): void {
  for (let i = 0; i < strokes; i += 1) {
    const p = rng() * size;
    const amp = 1.5 + rng() * 7;
    const freq = 0.006 + rng() * 0.022;
    const width = 0.5 + rng() * 2.1;
    g.strokeStyle = rng() < 0.28 ? light : dark;
    g.lineWidth = width;
    g.beginPath();
    for (let q = -8; q <= size + 8; q += 7) {
      const offset = p + Math.sin(q * freq + i * 1.7) * amp + Math.sin(q * freq * 3.1) * amp * 0.18;
      const x = vertical ? offset : q;
      const y = vertical ? q : offset;
      if (q === -8) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  for (let i = 0; i < 7; i += 1) {
    const x = rng() * size;
    const y = rng() * size;
    g.strokeStyle = 'rgba(42,24,12,.24)';
    g.lineWidth = 0.8 + rng() * 1.4;
    g.beginPath();
    const rx = (vertical ? 3 : 7) + rng() * 8;
    const ry = (vertical ? 9 : 3) + rng() * 8;
    g.ellipse(x, y, rx, ry, rng() * 3, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = 'rgba(20,10,4,.18)';
    g.beginPath();
    g.ellipse(x, y, rx * 0.5, ry * 0.5, rng() * 3, 0, Math.PI * 2);
    g.stroke();
  }
}

function paintCedar(g: CanvasRenderingContext2D, size: number, rng: () => number): void {
  const grad = g.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, '#86603d');
  grad.addColorStop(0.45, '#936b44');
  grad.addColorStop(1, '#765235');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  grain(g, size, rng, false, 64, 'rgba(46,26,12,.22)', 'rgba(228,188,135,.12)');
  for (let i = 0; i < 18; i += 1) {
    const x = rng() * size;
    const y = rng() * size;
    g.fillStyle = `rgba(30,16,7,${0.05 + rng() * 0.11})`;
    g.beginPath();
    g.ellipse(x, y, 0.8 + rng() * 2.5, 20 + rng() * 55, 0, 0, Math.PI * 2);
    g.fill();
  }
}

function paintRedLacquer(g: CanvasRenderingContext2D, size: number, rng: () => number): void {
  g.fillStyle = '#a43b2e';
  g.fillRect(0, 0, size, size);
  grain(g, size, rng, true, 48, 'rgba(66,22,17,.18)', 'rgba(255,180,140,.10)');
  for (let i = 0; i < 90; i += 1) {
    const x = rng() * size;
    const y = rng() * size;
    const r = 0.4 + rng() * 2.2;
    g.fillStyle = `rgba(${rng() < 0.5 ? '66,30,22' : '220,126,91'},${0.24 + rng() * 0.4})`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 23; i += 1) {
    const y = rng() * size;
    g.strokeStyle = `rgba(226,165,126,${0.05 + rng() * 0.12})`;
    g.lineWidth = 0.4 + rng() * 0.8;
    g.beginPath();
    g.moveTo(0, y);
    g.bezierCurveTo(size * 0.3, y + rng() * 6, size * 0.66, y - rng() * 7, size, y + rng() * 3);
    g.stroke();
  }
}

function paintPlaster(g: CanvasRenderingContext2D, size: number, rng: () => number): void {
  const grad = g.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#d9d0bd');
  grad.addColorStop(0.5, '#e5ddca');
  grad.addColorStop(1, '#cec5b2');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 1900; i += 1) {
    const v = rng();
    g.fillStyle = `rgba(${v < 0.55 ? '83,76,63' : '255,252,238'},${0.015 + rng() * 0.06})`;
    const x = rng() * size;
    const y = rng() * size;
    g.fillRect(x, y, 0.6 + rng() * 2.2, 0.6 + rng() * 2.2);
  }
  for (let i = 0; i < 22; i += 1) {
    let x = rng() * size;
    let y = rng() * size;
    g.strokeStyle = `rgba(68,63,52,${0.08 + rng() * 0.12})`;
    g.lineWidth = 0.7;
    g.beginPath();
    g.moveTo(x, y);
    for (let j = 0; j < 5; j += 1) {
      x += (rng() - 0.5) * 55;
      y += 12 + rng() * 35;
      g.lineTo(x, y);
    }
    g.stroke();
  }
}

function paintSlate(g: CanvasRenderingContext2D, size: number, rng: () => number): void {
  // 真正的本瓦屋面：竖向一垄一垄的半圆筒瓦，横向一皮一皮压叠。
  // 不再画随机矩形，否则近看是棋盘格、远看是马赛克。
  g.fillStyle = '#555855';
  g.fillRect(0, 0, size, size);
  const cols = 8;
  const rows = 4;
  const cw = size / cols;
  const rh = size / rows;
  for (let r = 0; r < rows; r += 1) {
    const y0 = r * rh;
    // 每一皮瓦的压边阴影：上沿亮、下沿暗。
    const course = g.createLinearGradient(0, y0, 0, y0 + rh);
    course.addColorStop(0, 'rgba(180,192,190,.18)');
    course.addColorStop(0.12, 'rgba(120,134,136,.10)');
    course.addColorStop(0.82, 'rgba(18,24,26,.10)');
    course.addColorStop(1, 'rgba(8,12,14,.44)');
    g.fillStyle = course;
    g.fillRect(0, y0, size, rh);
    for (let c = 0; c < cols; c += 1) {
      const x0 = c * cw;
      const tint = 0.86 + rng() * 0.30;
      const ridge = g.createLinearGradient(x0, 0, x0 + cw, 0);
      ridge.addColorStop(0, 'rgba(54,58,56,.55)');
      ridge.addColorStop(0.06, `rgba(${Math.round(94 * tint)},${Math.round(98 * tint)},${Math.round(95 * tint)},1)`);
      ridge.addColorStop(0.52, `rgba(${Math.round(102 * tint)},${Math.round(106 * tint)},${Math.round(103 * tint)},1)`);
      ridge.addColorStop(0.94, `rgba(${Math.round(90 * tint)},${Math.round(94 * tint)},${Math.round(91 * tint)},1)`);
      ridge.addColorStop(1, 'rgba(46,50,48,.48)');
      g.fillStyle = ridge;
      g.fillRect(x0, y0, cw, rh);
      // 筒瓦凸起的窄高光，只有 2–3px，远看才是瓦垄。
      g.fillStyle = `rgba(212,220,214,${0.06 + rng() * 0.07})`;
      g.fillRect(x0 + cw * 0.44, y0 + 2, Math.max(1, cw * 0.045), rh - 4);
      // 单片瓦的色差与缺角。
      if (rng() < 0.55) {
        g.fillStyle = `rgba(${rng() < 0.5 ? '28,36,34' : '128,130,118'},${0.05 + rng() * 0.10})`;
        g.fillRect(x0 + cw * 0.1, y0 + rh * (0.2 + rng() * 0.5), cw * (0.2 + rng() * 0.6), rh * 0.18);
      }
    }
  }
  // 苔痕、雨渍只做低对比，不要盖过瓦垄。
  for (let i = 0; i < 220; i += 1) {
    const x = rng() * size;
    const y = rng() * size;
    g.fillStyle = `rgba(${rng() < 0.62 ? '64,68,58' : '118,120,110'},${0.015 + rng() * 0.055})`;
    g.beginPath();
    g.ellipse(x, y, 3 + rng() * 22, 1 + rng() * 4, rng() * 0.35, 0, Math.PI * 2);
    g.fill();
  }
}

function paintMortar(g: CanvasRenderingContext2D, size: number, rng: () => number): void {
  g.fillStyle = '#66665e';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 1800; i += 1) {
    g.fillStyle = `rgba(${rng() < 0.5 ? '28,28,24' : '180,178,164'},${0.04 + rng() * 0.14})`;
    g.fillRect(rng() * size, rng() * size, 0.7 + rng() * 2.8, 0.5 + rng() * 1.8);
  }
}


function paintRoof(g: CanvasRenderingContext2D, size: number, rng: () => number): void {
  g.fillStyle = '#4b585c';
  g.fillRect(0, 0, size, size);
  const rows = 16;
  const rowH = size / rows;
  for (let r = 0; r < rows; r += 1) {
    const y = r * rowH;
    const shade = 0.9 + rng() * 0.18;
    g.fillStyle = `rgba(${Math.round(36 * shade)},${Math.round(43 * shade)},${Math.round(46 * shade)},1)`;
    g.fillRect(0, y, size, rowH - 1);
    g.fillStyle = 'rgba(148,158,156,.16)';
    g.fillRect(0, y + 1, size, 1.4);
    g.fillStyle = 'rgba(14,20,22,.34)';
    g.fillRect(0, y + rowH - 2, size, 2.2);
  }
  const cols = 10;
  for (let c = 0; c < cols; c += 1) {
    const x = c * size / cols;
    g.fillStyle = 'rgba(19,24,26,.24)';
    g.fillRect(x, 0, 1.4, size);
    g.fillStyle = 'rgba(133,143,140,.10)';
    g.fillRect(x + 1.4, 0, 2.3, size);
  }
  for (let i = 0; i < 60; i += 1) {
    g.fillStyle = `rgba(${rng() < 0.7 ? '126,134,112' : '24,30,31'},${0.04 + rng() * 0.18})`;
    const x = rng() * size;
    const y = rng() * size;
    g.beginPath();
    g.ellipse(x, y, 1 + rng() * 9, 0.5 + rng() * 3, rng() * 0.4, 0, Math.PI * 2);
    g.fill();
  }
}

function paintStone(g: CanvasRenderingContext2D, size: number, rng: () => number): void {
  const grad = g.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#8e8a7d');
  grad.addColorStop(0.5, '#9d998b');
  grad.addColorStop(1, '#837f73');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 1900; i += 1) {
    const v = rng();
    g.fillStyle = `rgba(${v < 0.5 ? '58,56,50' : '224,222,204'},${0.03 + rng() * 0.11})`;
    g.fillRect(rng() * size, rng() * size, 0.6 + rng() * 3.1, 0.6 + rng() * 2.2);
  }
  for (let i = 0; i < 18; i += 1) {
    let x = rng() * size;
    let y = rng() * size;
    g.strokeStyle = `rgba(49,48,42,${0.08 + rng() * 0.13})`;
    g.lineWidth = 0.6 + rng() * 0.8;
    g.beginPath();
    g.moveTo(x, y);
    for (let j = 0; j < 4; j += 1) {
      x += (rng() - 0.5) * 80;
      y += (rng() - 0.5) * 50;
      g.lineTo(x, y);
    }
    g.stroke();
  }
}

function paintMoss(g: CanvasRenderingContext2D, size: number, rng: () => number): void {
  const grad = g.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#52643a');
  grad.addColorStop(0.5, '#455b34');
  grad.addColorStop(1, '#607346');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 4200; i += 1) {
    const v = rng();
    g.fillStyle = v < 0.45
      ? `rgba(26,38,18,${0.06 + rng() * 0.16})`
      : `rgba(${Math.round(118 + rng() * 50)},${Math.round(139 + rng() * 45)},${Math.round(72 + rng() * 35)},${0.05 + rng() * 0.16})`;
    const x = rng() * size;
    const y = rng() * size;
    g.fillRect(x, y, 0.7 + rng() * 2.8, 0.4 + rng() * 1.3);
  }
  for (let i = 0; i < 120; i += 1) {
    g.fillStyle = `rgba(${rng() < 0.5 ? '147,160,88' : '235,225,168'},${0.04 + rng() * 0.10})`;
    const x = rng() * size;
    const y = rng() * size;
    g.beginPath();
    g.arc(x, y, 0.8 + rng() * 2.8, 0, Math.PI * 2);
    g.fill();
  }
}

function paintGravel(g: CanvasRenderingContext2D, size: number, rng: () => number): void {
  g.fillStyle = '#8f8c7f';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 5200; i += 1) {
    const x = rng() * size;
    const y = rng() * size;
    const r = 0.8 + rng() * 3.4;
    const v = 0.55 + rng() * 0.45;
    g.fillStyle = `rgba(${Math.round(100 + v * 70)},${Math.round(98 + v * 67)},${Math.round(84 + v * 62)},${0.35 + rng() * 0.45})`;
    g.beginPath();
    g.ellipse(x, y, r, r * (0.5 + rng() * 0.5), rng() * Math.PI, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(48,46,40,.22)';
    g.lineWidth = 0.4;
    g.stroke();
  }
}

function paintBark(g: CanvasRenderingContext2D, size: number, rng: () => number): void {
  g.fillStyle = '#5d4735';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 130; i += 1) {
    const x = rng() * size;
    g.strokeStyle = `rgba(${rng() < 0.5 ? '35,24,15' : '128,100,70'},${0.12 + rng() * 0.25})`;
    g.lineWidth = 0.8 + rng() * 3.2;
    g.beginPath();
    for (let y = -4; y <= size + 4; y += 12) {
      const xx = x + Math.sin(y * 0.035 + i) * 4 + Math.sin(y * 0.01 + i * 2) * 3;
      if (y === -4) g.moveTo(xx, y);
      else g.lineTo(xx, y);
    }
    g.stroke();
  }
  for (let i = 0; i < 35; i += 1) {
    g.fillStyle = `rgba(28,18,10,${0.18 + rng() * 0.28})`;
    g.beginPath();
    g.ellipse(rng() * size, rng() * size, 2 + rng() * 8, 1 + rng() * 4, 0, 0, Math.PI * 2);
    g.fill();
  }
}

function paintShoji(g: CanvasRenderingContext2D, size: number, rng: () => number): void {
  g.fillStyle = '#eee0c6';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 900; i += 1) {
    g.strokeStyle = `rgba(${rng() < 0.5 ? '150,120,79' : '255,250,231'},${0.02 + rng() * 0.06})`;
    g.lineWidth = 0.4 + rng() * 0.7;
    const y = rng() * size;
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(size, y + (rng() - 0.5) * 4);
    g.stroke();
  }
  for (let i = 0; i < 16; i += 1) {
    g.fillStyle = `rgba(150,120,80,${0.03 + rng() * 0.08})`;
    g.beginPath();
    g.arc(rng() * size, rng() * size, 4 + rng() * 18, 0, Math.PI * 2);
    g.fill();
  }
}

function paintPaper(g: CanvasRenderingContext2D, size: number, rng: () => number): void {
  g.fillStyle = '#f8f2e3';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 700; i += 1) {
    g.fillStyle = `rgba(${rng() < 0.5 ? '180,164,133' : '255,255,246'},${0.02 + rng() * 0.05})`;
    g.fillRect(rng() * size, rng() * size, 0.8 + rng() * 2.2, 0.8 + rng() * 2.2);
  }
}

function paintLeafAlpha(g: CanvasRenderingContext2D, size: number, rng: () => number): void {
  g.clearRect(0, 0, size, size);
  const cx = size * 0.5;
  const cy = size * 0.52;
  const shape = new Path2D();
  shape.moveTo(cx, cy - size * 0.39);
  for (let i = 0; i <= 26; i += 1) {
    const a = -Math.PI / 2 + (i / 26) * Math.PI * 2;
    const r = size * (0.26 + 0.11 * Math.sin(i * 1.9 + 1.2) + 0.035 * Math.sin(i * 5.1));
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r * 0.92;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  g.fillStyle = '#ffffff';
  g.fill(shape);
  g.strokeStyle = 'rgba(255,255,255,.72)';
  g.lineWidth = size * 0.012;
  g.beginPath();
  g.moveTo(cx, cy + size * 0.33);
  g.lineTo(cx, cy - size * 0.33);
  g.stroke();
  for (let i = 0; i < 7; i += 1) {
    const y = cy + size * 0.2 - i * size * 0.085;
    g.lineWidth = size * 0.006;
    g.beginPath();
    g.moveTo(cx, y);
    g.lineTo(cx + (rng() < 0.5 ? -1 : 1) * size * (0.16 + rng() * 0.05), y - size * 0.055);
    g.stroke();
  }
}

function paintNeedleAlpha(g: CanvasRenderingContext2D, size: number, rng: () => number): void {
  g.clearRect(0, 0, size, size);
  // 松针不是“几根线”，而是一簇一簇压在枝上；先用软簇填出体积，再补针叶。
  const cx = size * 0.52;
  const cy = size * 0.58;
  for (let i = 0; i < 26; i += 1) {
    const t = rng();
    const x = size * 0.18 + size * 0.66 * t;
    const y = size * 0.82 - size * 0.55 * t + Math.sin(t * Math.PI) * size * 0.04;
    const r = size * (0.05 + rng() * 0.09);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(92,112,62,.40)');
    grad.addColorStop(0.5, 'rgba(64,86,48,.22)');
    grad.addColorStop(1, 'rgba(64,86,48,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(x, y, r * 1.4, r * 0.72, -0.35 + rng() * 0.7, 0, Math.PI * 2);
    g.fill();
  }

  g.strokeStyle = 'rgba(58,78,44,.85)';
  g.lineWidth = size * 0.010;
  g.beginPath();
  g.moveTo(size * 0.10, size * 0.88);
  g.quadraticCurveTo(cx, cy, size * 0.92, size * 0.22);
  g.stroke();
  for (let i = 0; i < 900; i += 1) {
    const t = 0.08 + rng() * 0.88;
    const x = size * 0.10 + (size * 0.82) * t;
    const y = size * 0.88 - (size * 0.66) * t + Math.sin(t * Math.PI) * size * 0.035;
    const angle = -0.85 + (rng() - 0.5) * 2.5 + (t < 0.5 ? -0.22 : 0.20);
    const len = size * (0.09 + rng() * 0.20);
    const x2 = x + Math.cos(angle) * len;
    const y2 = y + Math.sin(angle) * len;
    g.strokeStyle = rng() < 0.16 ? 'rgba(138,158,94,.95)' : 'rgba(76,100,58,.72)';
    g.lineWidth = size * (0.0028 + rng() * 0.0045);
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + (x2 - x) * 0.4, y + (y2 - y) * 0.4 - size * 0.01, x2, y2);
    g.stroke();
  }
  for (let i = 0; i < 120; i += 1) {
    const t = rng();
    const x = size * 0.12 + size * 0.76 * t;
    const y = size * 0.86 - size * 0.62 * t + Math.sin(t * Math.PI) * size * 0.035;
    g.fillStyle = 'rgba(110,130,74,.55)';
    g.beginPath();
    g.arc(x, y, size * (0.004 + rng() * 0.010), 0, Math.PI * 2);
    g.fill();
  }
}

function paintGrass(g: CanvasRenderingContext2D, size: number, rng: () => number): void {
  // 草地的“远看是绒、近看有针”：底色只负责大块色差，高频靠短草叶。
  const grad = g.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, '#53633b');
  grad.addColorStop(0.55, '#667645');
  grad.addColorStop(1, '#4b5b36');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 2600; i += 1) {
    const x = rng() * size;
    const y = rng() * size;
    const len = 3 + rng() * 12;
    g.strokeStyle = rng() < 0.42
      ? `rgba(32,44,24,${0.10 + rng() * 0.20})`
      : `rgba(${Math.round(118 + rng() * 42)},${Math.round(136 + rng() * 38)},${Math.round(64 + rng() * 32)},${0.10 + rng() * 0.22})`;
    g.lineWidth = 0.5 + rng() * 1.1;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + (rng() - 0.5) * 5, y - len * 0.55, x + (rng() - 0.5) * 3, y - len);
    g.stroke();
  }
}

function paintGrassClumpAlpha(g: CanvasRenderingContext2D, size: number, rng: () => number): void {
  g.clearRect(0, 0, size, size);
  for (let i = 0; i < 46; i += 1) {
    const x0 = size * (0.32 + rng() * 0.36);
    const bend = (rng() - 0.5) * size * 0.42;
    const tipX = x0 + bend;
    const tipY = size * (0.10 + rng() * 0.34);
    g.strokeStyle = `rgba(104,132,72,${0.55 + rng() * 0.45})`;
    g.lineWidth = size * (0.006 + rng() * 0.012);
    g.beginPath();
    g.moveTo(x0, size * 0.96);
    g.quadraticCurveTo(x0 + bend * 0.35, size * 0.55, tipX, tipY);
    g.stroke();
  }
  g.fillStyle = 'rgba(74,96,50,.30)';
  g.beginPath();
  g.ellipse(size * 0.5, size * 0.92, size * 0.22, size * 0.04, 0, 0, Math.PI * 2);
  g.fill();
}

function paintShrubAlpha(g: CanvasRenderingContext2D, size: number, rng: () => number): void {
  g.clearRect(0, 0, size, size);
  for (let i = 0; i < 34; i += 1) {
    const a = rng() * Math.PI * 2;
    const r = size * (0.06 + rng() * 0.22);
    const x = size * 0.5 + Math.cos(a) * r;
    const y = size * 0.56 + Math.sin(a) * r * 0.72;
    const rx = size * (0.06 + rng() * 0.10);
    const ry = size * (0.045 + rng() * 0.075);
    const grad = g.createRadialGradient(x, y, 0, x, y, rx);
    grad.addColorStop(0, 'rgba(92,118,66,.95)');
    grad.addColorStop(0.72, 'rgba(72,96,52,.72)');
    grad.addColorStop(1, 'rgba(72,96,52,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(x, y, rx, ry, a, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = 'rgba(62,82,44,.55)';
  g.lineWidth = size * 0.008;
  g.beginPath();
  g.moveTo(size * 0.5, size * 0.96);
  g.lineTo(size * 0.5, size * 0.62);
  g.stroke();
}

function paintSky(g: CanvasRenderingContext2D, w: number, h: number, rng: () => number): void {
  // 等矩形全景：上冷下暖，地平线附近一团低太阳；远山用低对比剪影压住地平线。
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(36,52,78,1)');
  grad.addColorStop(0.34, 'rgba(82,88,103,1)');
  grad.addColorStop(0.50, 'rgba(156,119,92,1)');
  grad.addColorStop(0.58, 'rgba(92,73,57,1)');
  grad.addColorStop(1, 'rgba(38,32,26,1)');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);

  const sx = w * 0.70;
  const sy = h * 0.47;
  const glow = g.createRadialGradient(sx, sy, 0, sx, sy, w * 0.32);
  glow.addColorStop(0, 'rgba(255,214,154,.88)');
  glow.addColorStop(0.26, 'rgba(238,166,103,.45)');
  glow.addColorStop(1, 'rgba(238,166,103,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, w, h);

  // 远山：两层低饱和剪影，避免一条直线把球体贴图切出接缝。
  for (let layer = 0; layer < 2; layer += 1) {
    const base = h * (0.505 + layer * 0.045);
    const amp = h * (0.035 + layer * 0.012);
    g.fillStyle = layer === 0 ? 'rgba(42,50,56,.72)' : 'rgba(28,34,38,.78)';
    g.beginPath();
    g.moveTo(0, h * 0.8);
    for (let x = 0; x <= w; x += 8) {
      const y = base + Math.sin(x * 0.012 + layer * 2.1 + rng() * 0.02) * amp
        + Math.sin(x * 0.031 + layer * 3.7) * amp * 0.32;
      g.lineTo(x, y);
    }
    g.lineTo(w, h * 0.8);
    g.closePath();
    g.fill();
  }

  // 云带：只用稀疏、低透明度的横向软椭圆。
  for (let i = 0; i < 34; i += 1) {
    const x = rng() * w;
    const y = h * (0.18 + rng() * 0.28);
    const rx = w * (0.03 + rng() * 0.10);
    const ry = h * (0.006 + rng() * 0.018);
    const cloud = g.createRadialGradient(x, y, 0, x, y, rx);
    cloud.addColorStop(0, `rgba(218,210,199,${0.06 + rng() * 0.08})`);
    cloud.addColorStop(1, 'rgba(218,210,199,0)');
    g.fillStyle = cloud;
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
  }
}

export class MaterialLab {
  private readonly cache = new Map<string, THREE.Material>();
  private readonly textures: THREE.Texture[] = [];
  private readonly anisotropy: number;

  constructor(
    renderer: THREE.WebGLRenderer,
    readonly palette: RealismPalette,
    readonly snow: boolean,
  ) {
    this.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  }

  private tex(
    key: string,
    paint: (g: CanvasRenderingContext2D, size: number, rng: () => number) => void,
    repeat: readonly [number, number],
    opts: { size?: number; seed?: number; srgb?: boolean; mirror?: boolean } = {},
  ): THREE.CanvasTexture {
    const t = texture(paint, {
      size: opts.size ?? 512,
      seed: opts.seed ?? 1,
      repeat,
      srgb: opts.srgb,
      mirror: opts.mirror,
      anisotropy: this.anisotropy,
    });
    this.textures.push(t);
    return t;
  }

  sky(): THREE.Texture {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 512;
    const g = c.getContext('2d');
    if (!g) throw new Error('MaterialLab 需要 2D 画布');
    paintSky(g, c.width, c.height, mulberry(9));
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.wrapS = THREE.RepeatWrapping;
    t.anisotropy = this.anisotropy;
    t.needsUpdate = true;
    this.textures.push(t);
    return t;
  }

  get(kind: Surface): THREE.Material {
    const key = `${kind}:${this.palette}:${this.snow}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    let material: THREE.Material;
    switch (kind) {
      case 'cedar': {
        const map = this.tex('cedar', paintCedar, [1.4, 1.2], { seed: 11 });
        material = new THREE.MeshPhysicalMaterial({
          map,
          bumpMap: map,
          bumpScale: 0.022,
          roughness: 0.66,
          metalness: 0,
          clearcoat: 0.10,
          clearcoatRoughness: 0.72,
        });
        break;
      }
      case 'cedarVertical': {
        const map = this.tex('cedar-v', paintCedar, [1.2, 1.1], { seed: 12 });
        map.center.set(0.5, 0.5);
        map.rotation = Math.PI / 2;
        material = new THREE.MeshPhysicalMaterial({
          map,
          bumpMap: map,
          bumpScale: 0.020,
          roughness: 0.70,
          metalness: 0,
          clearcoat: 0.08,
          clearcoatRoughness: 0.74,
        });
        break;
      }
      case 'redLacquer': {
        const map = this.tex('red-lacquer', paintRedLacquer, [2.1, 2.1], { seed: 21 });
        material = new THREE.MeshPhysicalMaterial({
          map,
          bumpMap: map,
          bumpScale: 0.014,
          roughness: 0.58,
          metalness: 0,
          clearcoat: 0.28,
          clearcoatRoughness: 0.58,
        });
        break;
      }
      case 'darkWood': {
        const map = this.tex('dark-wood', paintCedar, [2.2, 2.2], { seed: 13 });
        material = new THREE.MeshPhysicalMaterial({
          map,
          color: 0x6b4b34,
          bumpMap: map,
          bumpScale: 0.018,
          roughness: 0.74,
          metalness: 0,
        });
        break;
      }
      case 'plaster':
        material = new THREE.MeshStandardMaterial({
          map: this.tex('plaster', paintPlaster, [2.6, 2.2], { seed: 31 }),
          bumpMap: this.tex('plaster-bump', paintPlaster, [2.6, 2.2], { seed: 31, srgb: false }),
          bumpScale: 0.026,
          color: 0xd9d0c2,
          roughness: 0.94,
          metalness: 0,
        });
        break;
      case 'roofTile': {
        const map = this.tex('roof-tile', paintSlate, [3, 1.55], { seed: 41 });
        map.center.set(0.5, 0.5);
        map.rotation = -Math.PI / 4;
        const bump = this.tex('roof-tile-bump', paintSlate, [3, 1.55], { seed: 41, srgb: false });
        bump.center.set(0.5, 0.5);
        bump.rotation = -Math.PI / 4;
        material = new THREE.MeshPhysicalMaterial({
          map,
          bumpMap: bump,
          bumpScale: 0.05,
          color: 0xd8d8cf,
          roughness: 0.78,
          metalness: 0,
          clearcoat: 0,
          envMapIntensity: 0.14,
        });
        break;
      }
      case 'roofEdge':
        material = new THREE.MeshStandardMaterial({
          color: 0x657176,
          roughness: 0.60,
          metalness: 0.12,
          envMapIntensity: 0.4,
        });
        break;
      case 'mortar':
        material = new THREE.MeshStandardMaterial({
          map: this.tex('mortar', paintMortar, [3, 3], { seed: 97 }),
          color: 0x8a877a,
          roughness: 0.96,
          metalness: 0,
        });
        break;
      case 'stone':
        material = new THREE.MeshStandardMaterial({
          map: this.tex('stone', paintStone, [4, 4], { seed: 51 }),
          bumpMap: this.tex('stone-bump', paintStone, [4, 4], { seed: 51, srgb: false }),
          bumpScale: 0.035,
          color: 0xa7a093,
          roughness: 0.9,
          metalness: 0,
        });
        break;
      case 'moss':
        material = new THREE.MeshStandardMaterial({
          map: this.tex('moss', paintMoss, [18, 18], { seed: 61 }),
          bumpMap: this.tex('moss-bump', paintMoss, [18, 18], { seed: 61, srgb: false }),
          bumpScale: 0.028,
          roughness: 1,
          metalness: 0,
        });
        break;
      case 'grass':
        material = new THREE.MeshStandardMaterial({
          map: this.tex('grass', paintGrass, [20, 20], { seed: 71 }),
          bumpMap: this.tex('grass-bump', paintGrass, [20, 20], { seed: 71, srgb: false }),
          bumpScale: 0.018,
          color: 0xd3d0bc,
          roughness: 1,
          metalness: 0,
        });
        break;
      case 'gravel':
        material = new THREE.MeshStandardMaterial({
          map: this.tex('gravel', paintGravel, [1.4, 7], { seed: 81 }),
          bumpMap: this.tex('gravel-bump', paintGravel, [1.4, 7], { seed: 81, srgb: false }),
          bumpScale: 0.038,
          roughness: 0.96,
          metalness: 0,
        });
        break;
      case 'bark':
        material = new THREE.MeshStandardMaterial({
          map: this.tex('bark', paintBark, [2.2, 5.5], { seed: 521 }),
          bumpMap: this.tex('barkbump', paintBark, [2.2, 5.5], { seed: 521, srgb: false }),
          bumpScale: 0.04,
          roughness: 0.95,
          metalness: 0,
        });
        break;
      case 'shoji':
        material = new THREE.MeshStandardMaterial({
          map: this.tex('shoji', paintShoji, [2.3, 2.3], { seed: 244 }),
          color: this.palette === 'snow' ? 0xfff1d8 : 0xffe6b9,
          emissive: 0xffb765,
          emissiveIntensity: this.palette === 'night' ? 0.32 : this.palette === 'dusk' ? 0.22 : 0.10,
          roughness: 0.86,
          metalness: 0,
          side: THREE.DoubleSide,
        });
        break;
      case 'paper':
        material = new THREE.MeshStandardMaterial({
          map: this.tex('paper', paintPaper, [1, 2], { seed: 613 }),
          roughness: 0.94,
          side: THREE.DoubleSide,
        });
        break;
      case 'gold':
        material = new THREE.MeshPhysicalMaterial({
          color: this.palette === 'snow' ? 0xb29453 : 0xc8a252,
          metalness: 0.72,
          roughness: 0.34,
          clearcoat: 0.38,
          clearcoatRoughness: 0.38,
        });
        break;
      case 'copper':
        material = new THREE.MeshPhysicalMaterial({
          color: 0x62776a,
          metalness: 0.56,
          roughness: 0.44,
          clearcoat: 0.18,
          clearcoatRoughness: 0.55,
        });
        break;
      case 'snow':
        material = new THREE.MeshStandardMaterial({
          color: 0xf0f2ef,
          roughness: 0.78,
          metalness: 0,
        });
        break;
      case 'soot':
        material = new THREE.MeshStandardMaterial({
          color: 0x2e2c28,
          roughness: 0.82,
          metalness: 0,
        });
        break;
      default:
        material = new THREE.MeshStandardMaterial({ color: 0x999999 });
    }
    this.cache.set(key, material);
    return material;
  }

  private cutout(
    paint: (g: CanvasRenderingContext2D, size: number, rng: () => number) => void,
    seed: number,
    flip = false,
  ): THREE.Texture {
    const t = this.tex(`cutout-${seed}`, paint, [1, 1], { size: 512, seed });
    t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping;
    if (flip) {
      t.repeat.x = -1;
      t.offset.x = 1;
    }
    // 透明底 cutout 的透明像素是白 RGB；premultiply 后 mipmap 才不会把白边混进叶面。
    t.premultiplyAlpha = true;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.anisotropy = this.anisotropy;
    return t;
  }

  needleMaterial(color = 0xffffff, flip = false): THREE.MeshStandardMaterial {
    const key = `cutout:pine:${color}:${flip}`;
    const cached = this.cache.get(key);
    if (cached) return cached as THREE.MeshStandardMaterial;
    // 真透明 PNG：alpha 不再靠黑底亮度猜，针叶边缘干净，逆光也不会整片发灰。
    const map = this.cutout(paintNeedleAlpha, 91, flip);
    const mat = new THREE.MeshStandardMaterial({
      map,
      color,
      alphaTest: 0.42,
      side: THREE.FrontSide,
      roughness: 0.78,
      metalness: 0,
      transparent: false,
      envMapIntensity: 0.45,
    });
    this.cache.set(key, mat);
    return mat;
  }

  grassClumpMaterial(color = 0xffffff): THREE.MeshStandardMaterial {
    const key = `cutout:grass:${color}`;
    const cached = this.cache.get(key);
    if (cached) return cached as THREE.MeshStandardMaterial;
    const map = this.cutout(paintGrassClumpAlpha, 92);
    const mat = new THREE.MeshStandardMaterial({
      map,
      color,
      alphaTest: 0.4,
      side: THREE.FrontSide,
      roughness: 0.9,
      metalness: 0,
      transparent: false,
      envMapIntensity: 0.4,
    });
    this.cache.set(key, mat);
    return mat;
  }

  shrubMaterial(color = 0xffffff): THREE.MeshStandardMaterial {
    const key = `cutout:shrub:${color}`;
    const cached = this.cache.get(key);
    if (cached) return cached as THREE.MeshStandardMaterial;
    const map = this.cutout(paintShrubAlpha, 93);
    const mat = new THREE.MeshStandardMaterial({
      map,
      color,
      alphaTest: 0.4,
      side: THREE.FrontSide,
      roughness: 0.88,
      metalness: 0,
      transparent: false,
      envMapIntensity: 0.4,
    });
    this.cache.set(key, mat);
    return mat;
  }

  mapleLeafMaterial(color = 0xa25d3b): THREE.MeshStandardMaterial {
    const key = `leaf:${color}`;
    const cached = this.cache.get(key);
    if (cached) return cached as THREE.MeshStandardMaterial;
    const alphaMap = this.tex('leaf', paintLeafAlpha, [1, 1], { size: 256, seed: 71, srgb: false });
    const mat = new THREE.MeshStandardMaterial({
      color,
      alphaMap,
      alphaTest: 0.24,
      side: THREE.DoubleSide,
      roughness: 0.85,
      metalness: 0,
    });
    this.cache.set(key, mat);
    return mat;
  }

  glowMap(): THREE.CanvasTexture {
    const key = 'glow';
    const cached = this.cache.get(key);
    if (cached) return (cached as unknown as THREE.MeshBasicMaterial).map as THREE.CanvasTexture;
    const [c, g] = canvas(128);
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,226,177,.95)');
    grad.addColorStop(0.25, 'rgba(255,185,105,.55)');
    grad.addColorStop(0.65, 'rgba(255,154,70,.16)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    this.textures.push(t);
    this.cache.set(key, new THREE.MeshBasicMaterial({ map: t }) as unknown as THREE.Material);
    return t;
  }

  weatherMap(): THREE.CanvasTexture {
    const key = 'weather';
    const cached = this.cache.get(key);
    if (cached) return (cached as unknown as THREE.MeshBasicMaterial).map as THREE.CanvasTexture;
    const [c, g] = canvas(256);
    g.clearRect(0, 0, 256, 256);
    // 下重上轻的潮气带：石基返潮、墙面雨痕，都从这里来。
    const grad = g.createLinearGradient(0, 256, 0, 40);
    grad.addColorStop(0, 'rgba(22,20,16,.86)');
    grad.addColorStop(0.28, 'rgba(28,25,20,.52)');
    grad.addColorStop(0.62, 'rgba(34,31,24,.16)');
    grad.addColorStop(1, 'rgba(34,31,24,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    const rng = mulberry(881);
    for (let i = 0; i < 160; i += 1) {
      const x = rng() * 256;
      const y = 90 + rng() * 166;
      const r = 3 + rng() * 26;
      g.fillStyle = `rgba(${18 + Math.round(rng() * 22)},${17 + Math.round(rng() * 18)},${13 + Math.round(rng() * 16)},${0.03 + rng() * 0.10})`;
      g.beginPath();
      g.ellipse(x, y, r * (0.35 + rng() * 0.9), r, -0.6 + rng() * 1.2, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 12; i += 1) {
      const x = 8 + rng() * 240;
      g.strokeStyle = `rgba(20,19,15,${0.06 + rng() * 0.12})`;
      g.lineWidth = 1 + rng() * 3;
      g.beginPath();
      g.moveTo(x, 20 + rng() * 30);
      g.bezierCurveTo(x + 5, 90, x - 4, 150, x + 2, 250);
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    this.textures.push(t);
    const mat = new THREE.MeshBasicMaterial({
      map: t,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      color: 0x40382d,
    });
    this.cache.set(key, mat as unknown as THREE.Material);
    return t;
  }

  weather(opacity: number): THREE.MeshBasicMaterial {
    // weatherMap 第一次调用时才会建立并缓存基础材质，必须先确保它存在。
    this.weatherMap();
    const base = this.cache.get('weather') as unknown as THREE.MeshBasicMaterial;
    const mat = base.clone();
    mat.map = this.weatherMap();
    mat.opacity = opacity;
    return mat;
  }

  contactShadow(): THREE.CanvasTexture {
    const key = 'shadow';
    const cached = this.cache.get(key);
    if (cached) return (cached as unknown as THREE.MeshBasicMaterial).map as THREE.CanvasTexture;
    const [c, g] = canvas(128);
    const grad = g.createRadialGradient(64, 64, 2, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,.78)');
    grad.addColorStop(0.5, 'rgba(255,255,255,.34)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    this.textures.push(t);
    this.cache.set(key, new THREE.MeshBasicMaterial({ map: t }) as unknown as THREE.Material);
    return t;
  }

  dispose(): void {
    for (const material of this.cache.values()) material.dispose();
    for (const t of this.textures) t.dispose();
    this.cache.clear();
  }
}
