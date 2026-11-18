// 装配壳（契约 v1）：micro-scenes —— depth=D0（未装站）。
//
// 为什么构造即失败而不是返回空壳：
//   原件是 6 个独立 HTML 文档（内联 canvas 场景），没有模块入口可装配；本簇 ⑧ 微缩雪晶球
//   图鉴尚未建站，运行期不存在任何可用的装配形态。静默返回 null 会让调用方在 update() 才崩，
//   堆栈指向无关代码；这里在构造期抛具名错误，把「未装站」变成可断言事实（Tier-D0）。
import type { PartInstance, PartOptions } from '../../contract/parts-registry';
import { PartNotMountedError } from '../part-errors';
import manifest from './part.manifest';

export { manifest };

/** 零件 id（与 part.manifest.ts 一致）。 */
export const PART_ID: string = manifest.id;

/** 未装配原因（供诊断与测试打印）。 */
export const NOT_MOUNTED_REASON =
  '原件为 6 个独立 HTML 文档（内联 canvas，无模块入口），本簇 ⑧ 微缩雪晶球图鉴尚未建站（depth=D0）';

/**
 * 创建 micro-scenes 零件实例 —— 恒抛 E_PART_NOT_MOUNTED。
 *
 * @param _options 契约 v1 工厂入参（不读取：该零件无装配形态）。
 * @throws {PartNotMountedError} 恒定抛出，错误码 E_PART_NOT_MOUNTED。
 */
export function createPart(_options: PartOptions): PartInstance {
  throw new PartNotMountedError(manifest.id, NOT_MOUNTED_REASON);
}

export default createPart;
