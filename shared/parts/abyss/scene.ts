import type { Lod, PartEnv, StageSize, WorldFrame } from '../../stage/contract';
import { clamp, isPalette, type AbyssPalette } from './palette';
import type { AbyssOptions } from './options';
import type { AbyssLayer, AbyssView } from './layers/types';
import { createBackgroundLayer } from './layers/background';
import { createRaysLayer } from './layers/rays';
import { createCausticsLayer } from './layers/caustics';
import { createMotesLayer } from './layers/motes';
import { createRipplesLayer } from './layers/ripples';

export interface AbyssScene {
  resize(size: StageSize): void;
  setLod(next: Lod): void;
  update(frame: WorldFrame): void;
  draw(frame: WorldFrame): void;
  dispose(): void;
  debug(): { palette: AbyssPalette; density: number; lod: Lod; layers: string[] };
}

function readQuery(): URLSearchParams | null {
  try {
    const search = globalThis.location?.search;
    return search ? new URLSearchParams(search) : null;
  } catch {
    return null;
  }
}

/** 五层装配；顺序就是画面层级，换方案只改这个数组。 */
export function createAbyssScene(env: PartEnv, opts: AbyssOptions = {}): AbyssScene {
  const ctx = env.ctx;
  if (!ctx) throw new Error('abyss 需要 2D 画布');

  const Q = readQuery();
  const paletteName = isPalette(Q?.get('palette'))
    ? Q!.get('palette') as AbyssPalette
    : (opts.palette ?? 'abyss');
  const num = (key: string, fallback: number): number => {
    const raw = Q?.get(key);
    const value = raw == null ? Number.NaN : Number.parseFloat(raw);
    return Number.isFinite(value) ? value : fallback;
  };
  const view: AbyssView = {
    w: Math.max(1, env.width),
    h: Math.max(1, env.height),
    dpr: Math.max(1, env.dpr),
    lod: env.lod,
    time: 0,
    palette: paletteName,
    density: clamp(num('density', opts.density ?? 1), 0.4, 1.6),
    rayAmount: clamp(num('rays', opts.rays ?? 0.55), 0, 1),
    causticAmount: clamp(num('caustics', opts.caustics ?? 0.35), 0, 1),
    vignette: Q?.has('vignette') ? Q.get('vignette') !== '0' : opts.vignette !== false,
  };

  const layers: AbyssLayer[] = [
    createBackgroundLayer(),
    createRaysLayer(),
    createCausticsLayer(),
    createMotesLayer(),
    createRipplesLayer(),
  ];
  let disposed = false;

  const resize = (size: StageSize): void => {
    view.w = Math.max(1, size.w);
    view.h = Math.max(1, size.h);
    view.dpr = Math.max(1, size.dpr);
    for (const l of layers) l.resize?.(view);
  };
  for (const l of layers) l.resize?.(view);

  return {
    resize,
    setLod(next: Lod): void {
      view.lod = next;
      for (const l of layers) l.resize?.(view);
    },
    update(frame: WorldFrame): void {
      view.time = frame.t;
      for (const l of layers) l.update?.(frame, view);
    },
    draw(frame: WorldFrame): void {
      if (disposed) return;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, view.w * view.dpr, view.h * view.dpr);
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      for (const l of layers) l.draw(ctx, frame, view);
      ctx.restore();
    },
    dispose(): void {
      disposed = true;
      for (const l of layers) l.dispose?.();
    },
    debug(): { palette: AbyssPalette; density: number; lod: Lod; layers: string[] } {
      return { palette: view.palette, density: view.density, lod: view.lod, layers: layers.map((l) => l.id) };
    },
  };
}
