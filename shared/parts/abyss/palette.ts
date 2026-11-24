export type AbyssPalette = 'abyss' | 'tide' | 'ink';

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export const PALETTES: Record<AbyssPalette, { top: Rgb; mid: Rgb; bottom: Rgb; ray: Rgb; dust: Rgb }> = {
  abyss: {
    top: { r: 10, g: 40, b: 58 },
    mid: { r: 4, g: 18, b: 31 },
    bottom: { r: 1, g: 6, b: 12 },
    ray: { r: 78, g: 210, b: 220 },
    dust: { r: 150, g: 240, b: 230 },
  },
  tide: {
    top: { r: 26, g: 58, b: 72 },
    mid: { r: 12, g: 30, b: 44 },
    bottom: { r: 5, g: 12, b: 20 },
    ray: { r: 132, g: 224, b: 236 },
    dust: { r: 210, g: 245, b: 240 },
  },
  ink: {
    top: { r: 24, g: 26, b: 30 },
    mid: { r: 10, g: 12, b: 16 },
    bottom: { r: 2, g: 3, b: 5 },
    ray: { r: 206, g: 186, b: 150 },
    dust: { r: 240, g: 224, b: 192 },
  },
};

export function isPalette(value: string | null | undefined): value is AbyssPalette {
  return value != null && value in PALETTES;
}

export function rgba(c: Rgb, a: number): string {
  return `rgba(${c.r},${c.g},${c.b},${a})`;
}

export function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
