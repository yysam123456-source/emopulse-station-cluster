// 装配壳（契约 v1）：room-at-dawn —— depth=D0（原件在库，一字未用）。
//
// 为什么构造即失败：
//   ① 原件 1/7 文件（只剩 main.js），其 import 的 6 个核心模块（core/gi、core/tex、
//      render/{cams,look,pipeline}、scene/index）全部未归集 → 无法运行（F-R5）；
//   ② /license 公文纸纹、/praise 热敏纸纹是站点自写 Canvas 2D，未引用其算法（PRD-REUSE §1.4）。
// 返回空壳会把「没有形态」伪装成「可用但没画」，这里在构造期抛具名错误。
import type { PartInstance, PartOptions } from '../../contract/parts-registry';
import { PartNotMountedError } from '../part-errors';
import manifest from './part.manifest';

export { manifest };

/** 零件 id（与 part.manifest.ts 一致）。 */
export const PART_ID: string = manifest.id;

/** 未装配原因（供诊断与测试打印）。 */
export const NOT_MOUNTED_REASON =
  '原件 1/7 文件、6 个核心模块未归集，无法运行；两站纸纹为自写 Canvas 2D，本簇无装配形态（depth=D0）';

/**
 * 创建 room-at-dawn 零件实例 —— 恒抛 E_PART_NOT_MOUNTED。
 *
 * @param _options 契约 v1 工厂入参（不读取：该零件无装配形态）。
 * @throws {PartNotMountedError} 恒定抛出，错误码 E_PART_NOT_MOUNTED。
 */
export function createPart(_options: PartOptions): PartInstance {
  throw new PartNotMountedError(manifest.id, NOT_MOUNTED_REASON);
}

export default createPart;
