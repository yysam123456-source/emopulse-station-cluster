// /still 的站内接线：Sit → 体素世界沉到近景。
//
// 第一次按是「坐下」，再按一次是「站起来」——同一个按钮，两个方向。
// 不新增文案：按钮上始终是定稿的 'Sit'，状态由世界自己表达（视角下去/回来）。
import type { SiteHandle } from '../../shared/sites/shell';
import { COPY } from '../../shared/sites/copy.mjs';

const SHOW_AFTER = 40;
const STAY_LINE_AT = 10;

export function attach(handle: SiteHandle): void {
  let seated = false;
  const copyLine = document.getElementById('copy-line');
  const note = document.getElementById('share-note');
  let lineShown = false;
  let stayLineShown = false;
  let lastT = 0;
  let seatedAt = 0;

  const lightLine = (t: number): string => {
    const index = Math.max(0, Math.min(4, Math.floor(t / 48)));
    return COPY.still.lines[index] ?? COPY.still.lines[4];
  };

  const toggle = (): void => {
    seated = !seated;
    if (seated) seatedAt = lastT;
    handle.stage.cue(seated ? 'sit' : 'stand');
  };
  window.addEventListener('site:cta', toggle);

  handle.onFrame((t) => {
    lastT = t;
    if (!seated) return;
    // 门槛按「坐下之后」算，不是页面打开后；否则用户晚坐下会提前拿到带走文本。
    const sinceSeated = t - seatedAt;
    if (!stayLineShown && sinceSeated >= STAY_LINE_AT) {
      stayLineShown = true;
      if (note) {
        note.textContent = COPY.still.stayHint;
        note.hidden = false;
      }
    }
    if (!lineShown && sinceSeated >= SHOW_AFTER) {
      lineShown = true;
      if (copyLine) copyLine.hidden = false;
    }
  });

  copyLine?.addEventListener('click', () => {
    const text = lightLine(lastT);
    const done = (): void => {
      if (!note) return;
      note.textContent = COPY.still.copied;
      note.hidden = false;
    };
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text).then(done).catch(() => {
        if (note) {
          note.textContent = text;
          note.hidden = false;
        }
      });
    } else {
      if (note) {
        note.textContent = text;
        note.hidden = false;
      }
    }
  });
}

export default attach;
