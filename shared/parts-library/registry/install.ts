// L3 装配器（T-R01 P0-R0 修复）：把 10 个零件的「声明 + 工厂」真正装进私有注册中心。
//
// 为什么单独一个文件、不改 registry/index.ts：
//   registry/index.ts 只聚合声明（并被各零件入口间接依赖）；若把 installParts 塞进去，
//   它会 import 各零件 index.ts，而 index.ts 又 import part.manifest.ts，
//   形成 `entry <-> registry/index` 的循环依赖。放在 registry/install.ts 后依赖是单向的：
//     install.ts -> registry/index.ts（声明）
//     install.ts -> <part>/index.ts -> <part>/part.manifest.ts
//
// 幂等语义（T-R01 硬要求）：
//   重复调用 installParts() 安全：已注册的零件计入 reused，不重复 registerPart
//   （registerPart 对重复注册是抛错的，这里必须先查 hasPart）。
import { PART_MANIFESTS } from './index';
import type { PartFactory, PartManifest } from '../../contract/parts-registry';
import { hasPart, registerPart, resolvePart } from '../../contract/parts-registry';
import {
  E_PART_ENTRY_MISMATCH,
  E_PART_ID_MISMATCH,
  E_PART_PROVENANCE_MISSING,
  E_PART_UNDECLARED,
  PartAssemblyError,
  PartNotMountedError,
} from '../part-errors';
import * as asciiKit from '../ascii-kit/index';
import * as blowInput from '../blow-input/index';
import * as crimsonLoong from '../crimson-loong/index';
import * as dandelion from '../dandelion/index';
import * as grandAtelier from '../grand-atelier/index';
import * as koi from '../koi/index';
import * as microScenes from '../micro-scenes/index';
import * as rainWebgpu from '../rain-webgpu/index';
import * as roomAtDawn from '../room-at-dawn/index';
import * as sylva from '../sylva/index';

/** 一个可装配零件的模块形态（entry 必须同时导出 manifest 与 createPart）。 */
export interface AssembledPartModule {
  readonly manifest: PartManifest;
  readonly createPart: PartFactory;
}

/**
 * 全部 10 个零件的装配模块表（顺序固定为 id 字典序，保证报告确定性）。
 * 新增零件：在此追加一行 + 一份 index.ts + 一份 part.manifest.ts，别处不用动。
 */
export const PART_ASSEMBLY_MODULES: readonly AssembledPartModule[] = [
  { manifest: asciiKit.manifest, createPart: asciiKit.createPart },
  { manifest: blowInput.manifest, createPart: blowInput.createPart },
  { manifest: crimsonLoong.manifest, createPart: crimsonLoong.createPart },
  { manifest: dandelion.manifest, createPart: dandelion.createPart },
  { manifest: grandAtelier.manifest, createPart: grandAtelier.createPart },
  { manifest: koi.manifest, createPart: koi.createPart },
  { manifest: microScenes.manifest, createPart: microScenes.createPart },
  { manifest: rainWebgpu.manifest, createPart: rainWebgpu.createPart },
  { manifest: roomAtDawn.manifest, createPart: roomAtDawn.createPart },
  { manifest: sylva.manifest, createPart: sylva.createPart },
];

/** 装配报告：本次新装 / 复用（此前已装）/ 已注册但无构造形态（depth=D0）。 */
export interface InstallReport {
  /** 本次调用真正 registerPart 的 id（按装配表顺序） */
  readonly installed: readonly string[];
  /** 此前已注册、本次跳过的 id */
  readonly reused: readonly string[];
  /** 已注册但 depth=D0（createPart 恒抛 E_PART_NOT_MOUNTED）的 id */
  readonly notMounted: readonly string[];
  /** 装配表覆盖的零件总数 */
  readonly total: number;
}

/**
 * 校验单个装配模块与其注册表声明一致（真正的「契约对齐」检查）。
 *
 * @param module 装配模块
 * @returns 与之对应的注册表声明（后续 registerPart 用声明而非模块内副本，
 *   保证 `listPartManifests()` 的引用恒等于 registry/index.ts 的冻结声明）
 * @throws {PartNotMountedError} 模块缺 createPart（声明存在但没有装配形态）
 * @throws {PartAssemblyError} 未声明 / id 不一致 / entry 不一致 / 缺 provenance
 */
function matchDeclaration(module: AssembledPartModule): PartManifest {
  const manifest = module.manifest;
  if (!manifest || typeof manifest.id !== 'string' || manifest.id.length === 0) {
    throw new PartNotMountedError('(unknown)', '装配模块没有导出 manifest');
  }
  if (typeof module.createPart !== 'function') {
    throw new PartNotMountedError(manifest.id, '装配模块没有导出 createPart 函数');
  }
  if (!manifest.provenance) {
    throw new PartAssemblyError(E_PART_PROVENANCE_MISSING, `零件 ${manifest.id} 的 manifest 缺 provenance（REUSE-1）`);
  }

  const declared = PART_MANIFESTS.find((candidate) => candidate.id === manifest.id);
  if (!declared) {
    throw new PartAssemblyError(E_PART_UNDECLARED, `零件 ${manifest.id} 未在 registry/index.ts 的 PART_MANIFESTS 中声明`);
  }
  if (declared.entry !== manifest.entry) {
    throw new PartAssemblyError(
      E_PART_ENTRY_MISMATCH,
      `零件 ${manifest.id} 的 entry 不一致：声明 ${declared.entry}，模块 ${manifest.entry}`,
    );
  }
  // part.manifest.ts 是 registry/index.ts 的同一个模块实例；引用不一致说明出现了两份副本。
  if (declared !== manifest && JSON.stringify(declared) !== JSON.stringify(manifest)) {
    throw new PartAssemblyError(
      E_PART_ID_MISMATCH,
      `零件 ${manifest.id} 的模块 manifest 与注册表声明内容不一致（疑似重复实现）`,
    );
  }
  return declared;
}

/**
 * 幂等安装全部零件。
 *
 * @returns 安装报告（新装 / 复用 / 未装配清单）
 * @throws {PartNotMountedError} 某声明零件缺装配模块或工厂函数
 * @throws {PartAssemblyError} id / entry / provenance 契约不一致
 */
export function installParts(): InstallReport {
  const installed: string[] = [];
  const reused: string[] = [];
  const notMounted: string[] = [];

  for (const module of PART_ASSEMBLY_MODULES) {
    const declared = matchDeclaration(module);

    if (hasPart(declared.id)) {
      const existing = resolvePart(declared.id);
      if (existing.manifest !== declared) {
        throw new PartAssemblyError(
          E_PART_ID_MISMATCH,
          `零件 ${declared.id} 已被另一份 manifest 注册（禁止静默覆盖）`,
        );
      }
      reused.push(declared.id);
    } else {
      registerPart(declared, module.createPart);
      installed.push(declared.id);
    }

    if (declared.provenance?.depth === 'D0') notMounted.push(declared.id);
  }

  return { installed, reused, notMounted, total: PART_ASSEMBLY_MODULES.length };
}

/**
 * 断言「注册表里每一条声明都有装配模块」，然后执行安装。
 *
 * 与 installParts 的区别：installParts 只保证「有模块的都装上」，
 * 本函数额外反向检查「有声明但没模块」——这正是 T-R01 之前的真实故障点
 * （8/8 entry 指向不存在的文件、registerPart 零调用），必须报错而不是静默跳过。
 *
 * @returns 安装报告
 * @throws {PartNotMountedError} 存在无装配模块的声明零件
 */
export function assertAllPartsInstalled(): InstallReport {
  const declaredIds = PART_MANIFESTS.map((manifest) => manifest.id);
  const moduleIds = new Set(PART_ASSEMBLY_MODULES.map((module) => module.manifest?.id));
  const missing = declaredIds.filter((id) => !moduleIds.has(id));
  if (missing.length > 0) {
    throw new PartNotMountedError(missing.join(','), '注册表声明存在，但没有对应的装配模块（禁止静默跳过）');
  }
  return installParts();
}

export default {
  PART_ASSEMBLY_MODULES,
  installParts,
  assertAllPartsInstalled,
};
