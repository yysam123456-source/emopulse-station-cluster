// 装配壳（契约 v1）：room-at-dawn —— depth=D0（站点级 PartV2 未接线）。
//
// 2026-11-24 更新：完整源码已归集到 `upstream/src`，并拆出 9 个 WorldFeature
// （room-shell / sky / exterior / fixtures / bed / desk / plants / clutter / decor）。
// 但站点级 PartV2 仍不能构造，原因不再是“缺文件”：
//   ① 还没有 world host 接 GI / Pipeline / CAMS / applyLook；
//   ② 当前四站没有空余 world 槽位，/license 的纸面会遮住 world；
//   ③ 全量 148 万面不适合首屏，必须先裁子集。
// 返回空壳会把「没有形态」伪装成「可用但没画」，这里仍在构造期抛具名错误。
import type { PartInstance, PartOptions } from '../../contract/parts-registry';
import { PartNotMountedError } from '../part-errors';
import manifest from './part.manifest';

export { manifest };
export { createRoomFeatureSet, disposeRoomFeatureSet } from './features';
export type { RoomFeatureOptions, RoomFeatureSet } from './features';

/** 零件 id（与 part.manifest.ts 一致）。 */
export const PART_ID: string = manifest.id;

/** 未装配原因（供诊断与测试打印）。 */
export const NOT_MOUNTED_REASON =
  '完整源码已归集并拆出 9 个 WorldFeature，但站点级 PartV2 未接 world host，且当前四站无 world 槽位（depth=D0）';

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
