// 死参数探针的自检样本（白盒，仅供 tests/mutation-probe.mjs 的 Mode A 自检）。
//
// 为什么需要这个文件：`探针全绿`有两种可能 —— ① 参数真的都活着；② 探针根本没在探。
// 唯一能把两者分开的办法，是拿一个**已知为死**的参数喂进去，看它报不报红。
// 所以本样本**故意**声明了一个不被读取的参数 `deadGain`（这就是「植入的死参数」），
// 同时保留一个真的参与运算的 `gain` 作为反向对照 —— 防止探针变成「什么都判死」的橡皮锤。
//
// 纪律：本文件不参与任何产物构建，也不被任何零件引用；它只被探针加载。
//       若有人把它接进产物，`verify:core` 的产物哈希门会立刻报警。

/** 自检样本的参数面。 */
export interface SpecimenParams {
  /** 活参数：参与运算，变异 ±10% 必须改变输出。 */
  gain: number;
  /** 植入的死参数：声明了但从不读取，探针**必须**抓到它。 */
  deadGain: number;
}

/** 自检样本的基线参数。 */
export const SPECIMEN_PARAMS: SpecimenParams = Object.freeze({ gain: 0.5, deadGain: 3 });

/**
 * 自检样本符号：严格的二次响应，方便手算核对变异方向。
 *
 * `shape(x) = gain · x²` → `shape(1)=0.5`、`shape(2)=2`、`shape(3)=4.5`（gain=0.5）。
 * 三条用例产出三种不同输出，满足 §4.3 规则 ① 的「不得全落在退化点」。
 *
 * @param {number} x 自变量
 * @param {SpecimenParams} p 参数面（显式注入，AD-1 的形状）
 * @returns {number} 输出
 */
export function shape(x: number, p: SpecimenParams = SPECIMEN_PARAMS): number {
  return p.gain * x * x;
}
