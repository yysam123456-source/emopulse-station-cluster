// /koi 的站内接线：把原作的三个「看的档位」和输入模式接到 Esc 菜单。
//
// 首屏仍然只有 H1 / lead / 画面 —— 这是 PRODUCT-FORM 的红线；
// 但原作不是只有 ink 一张图：它有 real / paint / ink 三条渲染路径、
// Ripple / Feed / Call 三种触摸、Top / 2.5D / Orbit 三个相机、三种池底、三档雨。
// 这些不该被"藏掉"，只能被收进二级菜单。
import type { SiteHandle } from '../../shared/sites/shell';
import { COPY } from '../../shared/sites/copy.mjs';

const KEEP_SECONDS = 40;

type Look = 'ink' | 'paint' | 'real';
type Touch = 'ripple' | 'feed' | 'call';
type Camera = 'top' | 'angle' | 'orbit';
type Water = 'pebble' | 'sky' | 'dark';
type Weather = 'dry' | 'drizzle' | 'rain';
type Music = 'off' | 'still' | 'flow';

const LOOKS: readonly Look[] = ['ink', 'paint', 'real'];
const LOOK_LABEL: Record<Look, string> = { ink: 'Ink', paint: 'Watercolour', real: 'Real' };
const TOUCHES: readonly Touch[] = ['ripple', 'feed', 'call'];
const TOUCH_LABEL: Record<Touch, string> = { ripple: 'Ripple', feed: 'Feed', call: 'Call' };
const CAMERAS: readonly Camera[] = ['top', 'angle', 'orbit'];
const CAMERA_LABEL: Record<Camera, string> = { top: 'Top', angle: '2.5D', orbit: 'Orbit' };
const WATERS: readonly Water[] = ['pebble', 'sky', 'dark'];
const WATER_LABEL: Record<Water, string> = { pebble: 'Pebble', sky: 'Sky', dark: 'Dark' };
const WEATHERS: readonly Weather[] = ['dry', 'drizzle', 'rain'];
const WEATHER_LABEL: Record<Weather, string> = { dry: 'Dry', drizzle: 'Drizzle', rain: 'Rain' };
const MUSICS: readonly Music[] = ['off', 'still', 'flow'];
const MUSIC_LABEL: Record<Music, string> = { off: 'Off', still: 'Still', flow: 'Flow' };

function query(): URLSearchParams {
  try {
    return new URLSearchParams(globalThis.location?.search ?? '');
  } catch {
    return new URLSearchParams();
  }
}

function pick<T extends string>(list: readonly T[], value: string | null, fallback: T): T {
  return value && (list as readonly string[]).includes(value) ? value as T : fallback;
}

/** 改一个菜单项的可见值；模板里已有 .menu-value 就复用。 */
function setMenu(id: string, value: string): void {
  const button = document.getElementById(id);
  if (!button) return;
  let span = button.querySelector<HTMLElement>('.menu-value');
  if (!span) {
    span = document.createElement('span');
    span.className = 'menu-value';
    button.appendChild(span);
  }
  span.textContent = value;
  const label = button.dataset.label;
  if (label) button.setAttribute('aria-label', `${label} ${value}`);
}

function markBody(look: Look): void {
  if (!document.body) return;
  document.body.dataset.koiStyle = look;
}

/**
 * 接线。
 *
 * @param handle 壳句柄
 */
export function attach(handle: SiteHandle): void {
  const Q = query();
  let look = pick(LOOKS, Q.get('style'), 'ink');
  let touch = pick(TOUCHES, Q.get('mode'), 'ripple');
  let camera = pick(CAMERAS, Q.get('cam'), 'top');
  let water = pick(WATERS, Q.get('floor'), 'pebble');
  let weather = pick(WEATHERS, Q.get('rain'), 'dry');
  let music = pick(MUSICS, Q.get('music'), 'off');

  markBody(look);
  setMenu('menu-look', LOOK_LABEL[look]);
  setMenu('menu-touch', TOUCH_LABEL[touch]);
  setMenu('menu-camera', CAMERA_LABEL[camera]);
  setMenu('menu-water', WATER_LABEL[water]);
  setMenu('menu-weather', WEATHER_LABEL[weather]);
  setMenu('menu-music', MUSIC_LABEL[music]);
  // 真的声音状态来自零件，不在站点猜；先按默认 Off 标。
  setMenu('menu-sound', 'Off');

  // 菜单按钮在模板里没有 data-label，补齐给读屏；不用标题去猜。
  for (const [id, label] of [
    ['menu-look', 'Look'], ['menu-touch', 'Touch'], ['menu-camera', 'Camera'],
    ['menu-water', 'Water'], ['menu-weather', 'Weather'], ['menu-music', 'Music'],
  ] as const) {
    document.getElementById(id)?.setAttribute('data-label', label);
  }

  const cycle = <T extends string>(list: readonly T[], value: T): T =>
    list[(list.indexOf(value) + 1) % list.length] as T;

  document.getElementById('menu-look')?.addEventListener('click', () => {
    look = cycle(LOOKS, look);
    markBody(look);
    setMenu('menu-look', LOOK_LABEL[look]);
    handle.stage.cue(`style:${look}`);
  });
  document.getElementById('menu-touch')?.addEventListener('click', () => {
    touch = cycle(TOUCHES, touch);
    setMenu('menu-touch', TOUCH_LABEL[touch]);
    handle.stage.cue(`mode:${touch}`);
  });
  document.getElementById('menu-camera')?.addEventListener('click', () => {
    camera = cycle(CAMERAS, camera);
    setMenu('menu-camera', CAMERA_LABEL[camera]);
    handle.stage.cue(`cam:${camera}`);
  });
  document.getElementById('menu-water')?.addEventListener('click', () => {
    water = cycle(WATERS, water);
    setMenu('menu-water', WATER_LABEL[water]);
    handle.stage.cue(`floor:${water}`);
  });
  document.getElementById('menu-weather')?.addEventListener('click', () => {
    weather = cycle(WEATHERS, weather);
    setMenu('menu-weather', WEATHER_LABEL[weather]);
    handle.stage.cue(`rain:${weather}`);
  });
  document.getElementById('menu-music')?.addEventListener('click', () => {
    music = cycle(MUSICS, music);
    setMenu('menu-music', MUSIC_LABEL[music]);
    handle.stage.cue(`music:${music}`);
  });
  document.getElementById('menu-sound')?.addEventListener('click', () => {
    handle.stage.cue('sound:toggle');
  });

  // 零件是声音状态的唯一事实源：它 toggle 完会广播，菜单只负责显示。
  globalThis.addEventListener?.('koi:sound', (event: Event) => {
    const on = Boolean((event as CustomEvent<{ on: boolean }>).detail?.on);
    setMenu('menu-sound', on ? 'On' : 'Off');
  });
  globalThis.addEventListener?.('koi:music', (event: Event) => {
    const mode = (event as CustomEvent<{ mode: Music }>).detail?.mode;
    if (mode && (MUSICS as readonly string[]).includes(mode)) {
      music = mode;
      setMenu('menu-music', MUSIC_LABEL[mode]);
    }
  });

  // ── 带走物：停留 40s 后才出现，保存的是**当前这一帧** ──
  // 不设主 CTA、不进 Esc；这一站先让人看，再给一个「把此刻带走」的出口。
  const keep = document.getElementById('keep');
  const canvas = document.getElementById('stage') as HTMLCanvasElement | null;
  let keepShown = false;
  let keepTimer = 0;
  handle.onFrame((t) => {
    if (keepShown || !keep || t < KEEP_SECONDS) return;
    keepShown = true;
    keep.hidden = false;
  });
  keep?.addEventListener('click', () => {
    if (!canvas) return;
    // 导出用「一帧原始分辨率」：画面 governor 可能已把 renderScale 降到 0.55，
    // 直接 toDataURL 会得到 704×396 的糊图。临时升到 1、等 shell 下一帧画完再抓，
    // 抓完立刻恢复用户当前档位（不改变他正在看的画面）。
    const previousScale = handle.stage.stats.renderScale;
    keep.textContent = COPY.koiPond.saveNote;
    window.clearTimeout(keepTimer);
    handle.stage.setRenderScale(1);
    requestAnimationFrame(() => {
      let url = '';
      try {
        url = canvas.toDataURL('image/png');
      } catch {
        handle.stage.setRenderScale(previousScale);
        return;
      }
      const a = document.createElement('a');
      a.href = url;
      a.download = `emopulse-koi-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      handle.stage.setRenderScale(previousScale);
      keepTimer = window.setTimeout(() => {
        keep.textContent = COPY.koiPond.keepLabel;
      }, 1800);
    });
  });
}
