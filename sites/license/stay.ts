// 站内「停留」层：慢变量（光线角度）+ 拖光。**不产生任何结果。**
// 光角由 `sunAngleAt(t)` 决定，屏幕与导出卡 import 同一个函数；导出读 `stay.angle()`，
// 也就是「保存那一刻屏幕上的角」（含拖光偏移），不再用按下盖章那一刻的角。
// 拖光"看得出"的像素证据与踩过的坑见 `docs/HANDOFF.md` §4.1。
export const STAY: { drift: boolean; dragLight: boolean; restamp: boolean; fold: boolean } = {
  drift: true, dragLight: true, restamp: true, fold: true,
};

const SUN_START = -26;   // 起始光角（度），负 = 光从左上斜切进来
// 4 分钟单调下移 30°。6° 那版在 40s/80s 的像素差落在世界噪声里（G7 看不出单调）；
// 30° 仍慢，但 40s 已有可测的 5°，且不会在首屏就明显偏。
const SUN_DRIFT = 30;
export const STAY_SECONDS = 240;

/**
 * 光的方向角（度）—— 屏幕与导出**共用这一个函数**。
 * @param t 世界时间（秒）
 */
export function sunAngleAt(t: number): number {
  const clamped = t < 0 ? 0 : t > STAY_SECONDS ? STAY_SECONDS : t;
  return SUN_START + (clamped / STAY_SECONDS) * SUN_DRIFT;
}

// 满量程 32°、7px/°（拖 100px ≈ 14°）。14° 那版实测像素差 ≈ 世界噪声 —— 动了，看不出。
const DRAG_RANGE = 32;
const DRAG_PX_PER_DEG = 7;

/**
 * 把慢变量写到 CSS 变量（DOM 只叠一层光，不重绘世界）。
 * @param root 作用域元素（一般是 `body`）
 */
export function createStay(root: HTMLElement): { tick: (t: number, dragDx: number) => void; angle: () => number } {
  let dragOffset = 0;
  let current = SUN_START;
  return {
    tick(t: number, dragDx: number): void {
      if (STAY.dragLight) dragOffset = Math.max(-DRAG_RANGE, Math.min(DRAG_RANGE, dragDx / DRAG_PX_PER_DEG));
      current = (STAY.drift ? sunAngleAt(t) : SUN_START) + dragOffset;
      root.style.setProperty('--sun-angle', `${current.toFixed(2)}deg`);
    },
    /** 当前屏幕上的光角（含拖光偏移）；导出必须读它，否则导出与屏幕差一个拖光量。 */
    angle(): number {
      return current;
    },
  };
}
