// 站内「停留」层：慢变量（光线角度）+ 拖光。**不产生任何结果。**
// 光角由 `sunAngleAt(t)` 决定，屏幕与导出卡 import 同一个函数 —— 导出传 `sunAngleAt(t_press)`，
// "图里的光 = 你按下去那一刻"才是真的；导出自己再算一遍角度会让这条承诺变假。
// 四件摆弄都挂 `STAY` 开关，关掉后画面必须变（死 flag 由 tests/license-stay.mjs 抓）。
// 四件摆弄的开关。**故意可变**：门要能逐项置 false 验「画面确实变了」；不可变会让死 flag 测不出来。
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

const DRAG_RANGE = 32;   // 一次停留里最多把光挪这么多度，挪完不回弹（摆弄，不是动画）
const DRAG_PX_PER_DEG = 7;   // 手感：拖 100px ≈ 14°，满量程约 224px

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
