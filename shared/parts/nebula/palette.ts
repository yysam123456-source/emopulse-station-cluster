export type NebulaPalette = 'violet' | 'abyss' | 'ember' | 'aurora';

export interface PaletteDef {
  readonly core: number;
  readonly arm: number;
  readonly dust: number;
  readonly background: number;
}

export const PALETTES: Record<NebulaPalette, PaletteDef> = {
  violet: { core: 0xfff1d6, arm: 0x7d5cff, dust: 0x2a155e, background: 0x05030d },
  abyss: { core: 0xc9fff4, arm: 0x2fd7c8, dust: 0x062b3d, background: 0x01080f },
  ember: { core: 0xffe3b0, arm: 0xff6b3d, dust: 0x3a0d08, background: 0x100402 },
  aurora: { core: 0xe8fff2, arm: 0x8bf7c8, dust: 0x123b52, background: 0x020a10 },
};

export function isPalette(value: string | null | undefined): value is NebulaPalette {
  return value != null && value in PALETTES;
}

export function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

export function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
