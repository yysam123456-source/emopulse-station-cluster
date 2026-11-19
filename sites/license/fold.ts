// 站内「摆弄」最后一组：重盖 与 折角。两者都不产生结果。
// 重盖：章可以盖歪且**不被纠正**（守身份不守样子）—— 歪角确定性，同一次永远同角度。
import { STAY } from './stay';
const FOLD_DEG = 6;

/** 折角：切换纸角折叠。不改编号/日期/宣言句。 */
export function toggleFold(sheet: HTMLElement | null, on: boolean): void {
  if (!sheet || !STAY.fold) return;
  sheet.style.setProperty('--fold', on ? `${FOLD_DEG}deg` : '0deg');
}

/** 重盖：让章再落一次，角度带确定性偏移（盖歪不是 bug，是身份）。 */
export function restamp(seal: HTMLElement | null, round: number): void {
  if (!seal || !STAY.restamp) return;
  seal.style.setProperty('--seal-tilt', `${(Math.sin(round * 2.7) * 2.4).toFixed(2)}deg`);
  seal.dataset.round = String(round);
}
