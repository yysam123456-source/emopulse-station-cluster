// 装配壳（契约 v1）：sylva —— depth=D0（原件在库，一字未用）。
//
// 为什么构造即失败：
//   ① 原件是 index.html / liquid-metal-explore.html 两个整页内联 WebGL 文档，无模块入口；
//   ② /praise 的「指针拨开纸层」是站点自写实现，未引用其算法（PRD-REUSE §1.4）；
//   ③ 许可为 L4（文章明示不授予再分发），T-R06 将进隔离区。
// 返回空壳会把「没有形态」伪装成「可用但没画」，这里在构造期抛具名错误（Tier-D0 断言错误码）。
import type { PartInstance, PartOptions } from '../../contract/parts-registry';
import { PartNotMountedError } from '../part-errors';
import manifest from './part.manifest';

export { manifest };

/** 零件 id（与 part.manifest.ts 一致）。 */
export const PART_ID: string = manifest.id;

/** 未装配原因（供诊断与测试打印）。 */
export const NOT_MOUNTED_REASON =
  '原件为整页内联 WebGL 文档（无模块入口），且许可为 L4（明示不授权）；本簇无装配形态（depth=D0）';

/**
 * 创建 sylva 零件实例 —— 恒抛 E_PART_NOT_MOUNTED。
 *
 * @param _options 契约 v1 工厂入参（不读取：该零件无装配形态）。
 * @throws {PartNotMountedError} 恒定抛出，错误码 E_PART_NOT_MOUNTED。
 */
export function createPart(_options: PartOptions): PartInstance {
  throw new PartNotMountedError(manifest.id, NOT_MOUNTED_REASON);
}

export default createPart;
