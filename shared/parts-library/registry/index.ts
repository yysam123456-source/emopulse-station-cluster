// L3 零件注册中心索引（只增不改）：汇总全部 part.manifest.ts，供 resolvePart() 查表。
// 说明：本文件**只聚合声明**，不 import 各零件的工厂模块（entry）。
//   - 注册表只提供**零件元数据**（id / depth / requires / license），供门 2、死引用判定、
//     许可分级普查使用。
//   - 站点当前**不经过**本表实例化零件：7 站均由 glue 内硬编码槽位装配；`createPart` 与
//     7 方法契约是**预留 API，未经产线验证**（`mountSite()` 无站点 import、
//     `installParts()` 无产线调用点，见仓库根 `QUARANTINE.md` 的 Q-02）。
import type { PartManifest } from '../../contract/parts-registry';
import blowInput from '../blow-input/part.manifest';
import crimsonLoong from '../crimson-loong/part.manifest';
import dandelion from '../dandelion/part.manifest';
import grandAtelier from '../grand-atelier/part.manifest';
import koi from '../koi/part.manifest';
import microScenes from '../micro-scenes/part.manifest';
import rainWebgpu from '../rain-webgpu/part.manifest';
import roomAtDawn from '../room-at-dawn/part.manifest';
import sylva from '../sylva/part.manifest';
import asciiKit from '../ascii-kit/part.manifest';

/** 全库零件声明（按 id 字典序冻结，保证输出确定性）。 */
export const PART_MANIFESTS: readonly PartManifest[] = Object.freeze(
  [
    blowInput,
    crimsonLoong,
    dandelion,
    grandAtelier,
    koi,
    microScenes,
    rainWebgpu,
    roomAtDawn,
    sylva,
    asciiKit,
  ]
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
);

/** 按 id 查零件声明（未登记返回 undefined，由调用方决定抛错还是降级）。 */
export function findPartManifest(id: string): PartManifest | undefined {
  return PART_MANIFESTS.find((manifest) => manifest.id === id);
}

/** 列出全部已登记零件 id（字典序）。 */
export function listPartIds(): string[] {
  return PART_MANIFESTS.map((manifest) => manifest.id);
}

/**
 * 断言零件 id 唯一且契约版本统一。
 * @throws 重复 id / 非 v1 契约时抛错——零件登记是硬约束，不允许静默共存。
 */
export function assertPartRegistryIntegrity(): void {
  const seen = new Set<string>();
  for (const manifest of PART_MANIFESTS) {
    if (seen.has(manifest.id)) throw new Error(`[parts-registry] 零件 id 重复：${manifest.id}`);
    seen.add(manifest.id);
    if (manifest.contract !== 'v1') {
      throw new Error(`[parts-registry] 零件 ${manifest.id} 的 contract 必须为 'v1'`);
    }
  }
}
