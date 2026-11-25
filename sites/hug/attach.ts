// /hug 的站内接线：把「Let it go」翻译成蒲公英听得懂的动词，并把一次温暖带走成链接。
//
// 这里有两件**站点作用域**的事，都进不了世界：
//   1. `site:cta` → `stage.cue('release')`（一次决定，不是持续参数）
//   2. 复制 `?from=hug` 链接（URL 不是画面；世界不该知道剪贴板）
//   3. Wind：麦克风响度 → `stage.setAudio` → 零件 `frame.audio`（可选输入，不自动弹权限）
import { createMic } from '../../shared/sites/mic';
import type { SiteHandle } from '../../shared/sites/shell';

export function attach(handle: SiteHandle): void {
  const note = document.getElementById('share-note');
  const say = (text: string): void => {
    if (!note) return;
    note.textContent = text;
    note.hidden = false;
  };

  // ── Wind（仅 /hug 有 #menu-wind）──
  const windButton = document.getElementById('menu-wind');
  const windValue = windButton?.querySelector('.menu-value') ?? null;
  const menuNote = document.getElementById('menu-note');
  const mic = createMic();
  const setWind = (on: boolean, message?: string): void => {
    if (windValue) windValue.textContent = on ? 'On' : 'Off';
    if (!menuNote) return;
    if (message) {
      menuNote.textContent = message;
      menuNote.hidden = false;
    } else {
      menuNote.hidden = true;
    }
  };
  if (windButton) {
    windButton.addEventListener('click', () => {
      if (mic.enabled) {
        mic.stop();
        handle.stage.setAudio(null);
        setWind(false);
        return;
      }
      // 必须在这个 click 的调用栈里申请权限；先写 On 再回滚，避免用户看到按钮「没反应」
      setWind(true, 'Requesting microphone…');
      void mic.start().then((ok) => {
        if (!ok) {
          setWind(false, 'Microphone unavailable.');
          return;
        }
        setWind(true, 'Microphone on. Nothing is recorded. Wind only.');
      });
    });
  }
  // 打开菜单就关掉麦克风：菜单是「暂停世界」的模态，不能后台还在收音。
  window.addEventListener('site:modal', (event) => {
    const open = (event as CustomEvent<{ open?: boolean }>).detail?.open === true;
    if (!open || !mic.enabled) return;
    mic.stop();
    handle.stage.setAudio(null);
    setWind(false);
  });
  // 每帧只在开启时读一次；关闭后不再碰 AnalyserNode
  handle.onFrame(() => {
    if (mic.enabled) handle.stage.setAudio(mic.read());
  });
  window.addEventListener('pagehide', () => {
    mic.stop();
  });

  // 收到回赠：`?from=` 只做一次提示，不回显任意输入。
  // 不改变「Let it go」这一个 CTA —— 产品口径是一站一个决定，不是一进来就被要求回赠。
  const from = new URLSearchParams(window.location.search).get('from');
  if (from) {
    // 白名单：只有 /hug 是已知的寄出站；其它值一律落回「someone」，且不回显任意输入。
    const known = from === 'hug';
    say(known ? 'Someone sent you a little warmth.' : 'Someone sent you this link.');
    // 收到回赠时 CTA 变成「Send one on」：不是新按钮，还是同一个动作 —— 放走自己的，
    // 再把链接递出去。按钮文案由站点层改，世界不知道「回赠」这件事。
    if (known) {
      const cta = document.getElementById('cta');
      if (cta) cta.textContent = 'Send one on';
    }
  }

  /**
   * 放走一次，并把链接递出去。
   *
   * 因果在站点层，不在零件里：画布上的 pointerdown 与主按钮 click 都走这里；
   * `released` 保证一次页面里只放走一次（重置只能在测试/深链里发生）。
   */
  let released = false;
  const release = (): void => {
    if (released) return;
    released = true;
    handle.stage.cue('release');

    // 带走链接：同一路径 + `?from=hug`，零 PII、零外部请求。
    // 剪贴板权限被拒时静默降级为展示链接（用户仍可手动复制），不弹第二个权限框。
    const base = window.location.href.replace(/[?#].*$/, '');
    const url = `${base}?from=hug`;
    const copy = navigator.clipboard?.writeText;
    if (copy) {
      void copy.call(navigator.clipboard, url)
        .then(() => say('Link copied. Send it to someone.'))
        .catch(() => say(url));
    } else {
      say(url);
    }
  };

  // 画布本身就是触发区：点草地/蒲公英与按主按钮是同一个决定。
  const canvas = document.getElementById('stage');
  canvas?.addEventListener('pointerdown', release, { passive: true });

  window.addEventListener('site:cta', release);
}

export default attach;
