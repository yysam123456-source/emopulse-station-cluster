// 装配壳（契约 v1）：rain-webgpu —— depth=D0（未装站 + requires=webgpu）。
//
// 为什么构造即失败而不是返回空壳：
//   原件 API 全部要求 WebGPU device/adapter（createRain 返回 Promise<RainHandle>），且本簇
//   ① 气象静室尚未建站；无宿主站 = 无 device = 无装配形态。返回空壳会把「没有 adapter」
//   误报成「可用但没画」，这里在构造期抛具名错误（Tier-D0 断言错误码）。
import type { PartInstance, PartOptions } from '../../contract/parts-registry';
import { PartNotMountedError } from '../part-errors';
import manifest from './part.manifest';

export { manifest };

/** 零件 id（与 part.manifest.ts 一致）。 */
export const PART_ID: string = manifest.id;

/** 未装配原因（供诊断与测试打印）。 */
export const NOT_MOUNTED_REASON =
  '原件为 WebGPU 引擎（requires=webgpu，createRain/createPostPipeline 均需 device），本簇 ① 气象静室尚未建站（depth=D0）';

/**
 * 创建 rain-webgpu 零件实例 —— 恒抛 E_PART_NOT_MOUNTED。
 *
 * @param _options 契约 v1 工厂入参（不读取：该零件无装配形态）。
 * @throws {PartNotMountedError} 恒定抛出，错误码 E_PART_NOT_MOUNTED。
 */
export function createPart(_options: PartOptions): PartInstance {
  throw new PartNotMountedError(manifest.id, NOT_MOUNTED_REASON);
}

export default createPart;
