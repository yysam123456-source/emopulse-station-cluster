// 站内「摆弄」最后一组：重盖 与 折角。两者都不产生结果。
// 重盖：章可以盖歪且**不被纠正**（守身份不守样子）—— 歪角确定性，同一次永远同角度。
//
// ★ 折角的教训（2026-11-19）：第一版是 `#sheet.style.setProperty('--fold','6deg')`，
//   消费方是 `#sheet{transform:rotate(var(--fold))}` —— `#sheet` 只是一个空 div 加
//   1px inset 边框，于是"折角"画出来的效果是**一条 1px 斜线划过整张纸、穿过正文**。
//   变量确实变了（所以 license-stay 当时是绿的），但用户看到的是一道疑似渲染故障的斜杠。
//   现在：`--fold` 只是开关，**看得见的那一面**是 `#fold-flap`（纸角翻起的背面）。
import { STAY } from './stay';

/** 重盖：让章再落一次，角度带确定性偏移（盖歪不是 bug，是身份）。 */
export function restamp(seal: HTMLElement | null, round: number): void {
  if (!seal || !STAY.restamp) return;
  seal.style.setProperty('--seal-tilt', `${(Math.sin(round * 2.7) * 2.4).toFixed(2)}deg`);
  seal.dataset.round = String(round);
}

/**
 * 折角：切换纸角折叠。不改编号/日期/宣言句。
 *
 * @param root 写变量的作用域（必须是 `#fold-flap` 的**祖先**，否则变量继承不到它）
 * @param on 是否折起
 */
export function toggleFold(root: HTMLElement | null, on: boolean): void {
  if (!root || !STAY.fold) return;
  // 两个信号各管一件事，刻意冗余：
  //   `--fold`    给 DOM 读（门要能读到一个确定的开关值）
  //   `data-fold` 给 CSS 读（`body[data-fold=on] #fold-flap{opacity:1}`）
  root.style.setProperty('--fold', on ? 'on' : 'off');
  root.dataset.fold = on ? 'on' : 'off';
}
