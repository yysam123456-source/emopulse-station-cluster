// 站内「停留」层：慢变量（光线角度）+ 拖光。**不产生任何结果。**
// 光角由 `sunAngleAt(t)` 决定，屏幕与导出卡 import 同一个函数（导出传 `sunAngleAt(t_press)`）。
// 拖光"看得出"的像素证据与踩过的坑见 `docs/HANDOFF.md` §4.1。
export const STAY: { drift: boolean; dragLight: boolean; restamp: boolean; fold: boolean } = {
  drift: true, dragLight: true, restamp: true, fold: true,
};

const SUN_START = -26;   // 起始光角（度），负 = 光从左上斜切进来
const SUN_DRIFT = 6;     // 4 分钟单调下移 6°：慢到"看一会儿才发现变了"
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
export function createStay(root: HTMLElement): { tick: (t: number, dragDx: number) => void } {
  let dragOffset = 0;
  return {
    tick(t: number, dragDx: number): void {
      if (STAY.dragLight) dragOffset = Math.max(-DRAG_RANGE, Math.min(DRAG_RANGE, dragDx / DRAG_PX_PER_DEG));
      root.style.setProperty('--sun-angle', `${((STAY.drift ? sunAngleAt(t) : SUN_START) + dragOffset).toFixed(2)}deg`);
    },
  };
}
