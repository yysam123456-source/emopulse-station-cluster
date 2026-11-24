// 站内「摆弄」：重盖 与 折角。两者都不产生结果。
// ⚠️ 折角**不许**用 `#sheet{transform:rotate()}` 做：`#sheet` 只是空 div + 1px 边框，
//    "折角"会变成一条划过正文的斜线。看得见的那一面是 `#fold-flap`（纸背 + 折痕投影），
//    三处坑（z-index 须在光层之下 / 必须半透明着色 / 章下副行要避开）见 `docs/HANDOFF.md` §4.1。
import { STAY } from './stay';

/** 重盖：让章再落一次，角度带确定性偏移（盖歪不是 bug，是身份）。 */
export function restamp(seal: HTMLElement | null, round: number): void {
  if (!seal || !STAY.restamp) return;
  seal.style.setProperty('--seal-tilt', `${(Math.sin(round * 2.7) * 2.4).toFixed(2)}deg`);
  seal.dataset.round = String(round);
}

/** 折角：切换纸角折叠。不改编号/日期/宣言句。`root` 必须是 `#fold-flap` 的祖先。 */
export function toggleFold(root: HTMLElement | null, on: boolean): void {
  if (!root || !STAY.fold) return;
  // `--fold` 给门读、`data-fold` 给 CSS 读（`body[data-fold=on] #fold-flap{opacity:1}`）。
  root.style.setProperty('--fold', on ? 'on' : 'off');
  root.dataset.fold = on ? 'on' : 'off';
}
