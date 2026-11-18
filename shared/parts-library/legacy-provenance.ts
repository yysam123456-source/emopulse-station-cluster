// legacy 7 站零件溯源冻结快照（T-R01 / REUSE-1 / ARCHITECTURE-REUSE §5）。
//
// 为什么需要这张表（不是重复声明）：
//   ① legacy 7 站目录零新增零改动（主理人 D2 裁决），不能给它们补 part.manifest.ts；
//   ② legacy 站走 `parts: PartRef[]` 而非 composition，且引用名与零件 id 可能不同名
//      （`sites/koi/shared/config.ts` 的 source 是 `zz85-koi`，零件 id 是 `koi`）；
//   ③ 所以本表是「legacy 引用名 ↔ 零件 id ↔ provenance」的唯一映射，照抄 LEGACY_SITES 范式：
//      长度恒 7、深冻结、内容哈希（LEGACY_PARTS_HASH）恒定。
//
// 纪律（ARCHITECTURE-REUSE §5.3）：
//   1. **禁止被任何 sites/**/bridge.ts import**（会进产物字节、破坏 INV-3）；由
//      tests/verify-parts-assembly.mjs 用 `grep -r "legacy-provenance" sites/` 断言为空；
//   2. 改内容必须同时改 LEGACY_PARTS_HASH（= 把变更显式化，diff 里一眼可见）；
//   3. 它必须被读取：verify-parts-assembly 用它做覆盖率与一致性对账。
import type { PartManifest, Provenance } from '../contract/parts-registry';
import asciiKit from './ascii-kit/part.manifest';
import crimsonLoong from './crimson-loong/part.manifest';
import grandAtelier from './grand-atelier/part.manifest';
import koi from './koi/part.manifest';
import microScenes from './micro-scenes/part.manifest';
import rainWebgpu from './rain-webgpu/part.manifest';
import roomAtDawn from './room-at-dawn/part.manifest';
import sylva from './sylva/part.manifest';

/** 单个 legacy 零件引用：旧引用名 + 零件 id + 该零件溯源 + 是否已改造。 */
export interface LegacyPartRef {
  /** `site.config.ts` 里 `parts[].source` 的原值（冻结，不得改） */
  readonly legacySource: string;
  /** 对应零件 id（parts-library 目录名） */
  readonly partId: string;
  /** 本专项中该站是否已改造（T-R01 全部 false；改造由 T-R03/R04/R05 推进） */
  readonly migrated: boolean;
  /** 该零件的溯源（与 part.manifest.ts 的 provenance 同源） */
  readonly provenance: Provenance;
}

/** 冻结站点数：恒为 7（still / license / praise / hug / koi×3）。 */
export const LEGACY_PARTS_SITE_COUNT = 7;

/** 深冻结：对象、数组及嵌套值全部只读。 */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

/**
 * 取 manifest 的 provenance（缺失即抛：REUSE-1 要求被引用零件必填）。
 * @param manifest 零件声明
 * @returns 溯源对象
 * @throws 缺 provenance 时抛错
 */
function provenanceOf(manifest: PartManifest): Provenance {
  if (!manifest.provenance) {
    throw new Error(`[legacy-provenance] 零件 ${manifest.id} 缺 provenance（REUSE-1），legacy 快照无法冻结`);
  }
  return manifest.provenance;
}

/**
 * 三个「缺口零件」的溯源：README 列了它们，但磁盘上没有目录、没有 manifest
 * （F-R2 / F-R3：dandelion / blow-input / paper-plane）。
 * 它们只有公众号文章描述，没有任何归集文件，因此 files=[]、ported=[]、分母 0。
 * 这不是省略，而是把缺口如实记为「未归集」——T-R04 建目录后由 manifest 接管。
 *
 * @param what 该缺口的现状说明（写进 evidence，供 QA 复核）
 * @returns 溯源对象（depth=D1：只照观感自写）
 */
function gapProvenance(what: string): Provenance {
  return {
    depth: 'D1',
    upstream: { accessed: '2026-11-18' },
    files: [],
    ported: [],
    // 三个缺口零件没有目录、没有归集文件（files 为空），归集状态只能记在顶层。
    completeness: 'absent',
    paramSurface: {
      // ARCHITECTURE-REUSE §3.3.6 articleMode：无仓库 ⇒ 移植面必须为空数组（不得凭空声明）
      scope: [],
      enumerated: [],
      evidence: `无上游仓库可归集，仅有公众号文章代码片段；${what}（P_scope=0，走文章锚定替代门）`,
    },
    license: {
      spdx: 'NOASSERTION',
      evidence: '仅有文章代码片段，无仓库、无 LICENSE，无任何再分发声明（F-R4）。'
        + '无许可证声明，已签字豁免，仅用于个人展示站，不得再分发。',
      grade: 'L3',
    },
  };
}

/** 零件 id → 溯源（8 个有目录的零件直接引用其 manifest；3 个缺口用 gapProvenance）。 */
const PART_PROVENANCE: Readonly<Record<string, Provenance>> = {
  'ascii-kit': provenanceOf(asciiKit),
  'crimson-loong': provenanceOf(crimsonLoong),
  'grand-atelier': provenanceOf(grandAtelier),
  koi: provenanceOf(koi),
  'micro-scenes': provenanceOf(microScenes),
  'rain-webgpu': provenanceOf(rainWebgpu),
  'room-at-dawn': provenanceOf(roomAtDawn),
  sylva: provenanceOf(sylva),
  dandelion: gapProvenance('站点为 22 颗种子排圆周的自写实现，与文章的 1335 颗球面采样不同'),
  'blow-input': gapProvenance('站点为 fftSize=512 取频域均值的自写实现'),
  'paper-plane': gapProvenance('站点为 2D 直线 + sin 拱高的自写 flightPosition'),
};

/**
 * 构造一条 legacy 引用（provenance 与 manifest 同源，避免两处漂移）。
 * @param legacySource site.config.ts 里的原值
 * @param partId 零件 id
 * @returns 冻结前的引用对象
 */
function ref(legacySource: string, partId: string): LegacyPartRef {
  const provenance = PART_PROVENANCE[partId];
  if (!provenance) throw new Error(`[legacy-provenance] 未登记的零件 id：${partId}`);
  return { legacySource, partId, migrated: false, provenance };
}

/**
 * legacy 7 站零件映射冻结快照（长度恒 7，含 still 的空数组）。
 * 顺序与 LEGACY_SITES 一致，便于逐条对照。
 */
export const LEGACY_PARTS: Readonly<Record<string, readonly LegacyPartRef[]>> = deepFreeze({
  still: [],
  license: [
    ref('room-at-dawn', 'room-at-dawn'),
    ref('crimson-loong', 'crimson-loong'),
    ref('grand-atelier', 'grand-atelier'),
    ref('paper-plane', 'paper-plane'),
  ],
  praise: [
    ref('room-at-dawn', 'room-at-dawn'),
    ref('paper-plane', 'paper-plane'),
    ref('sylva', 'sylva'),
  ],
  hug: [
    ref('dandelion', 'dandelion'),
    ref('blow-input', 'blow-input'),
    ref('paper-plane', 'paper-plane'),
  ],
  'koi-pond': [ref('zz85-koi', 'koi')],
  'koi-ink': [ref('zz85-koi', 'koi')],
  'koi-watercolor': [ref('zz85-koi', 'koi')],
}) as Readonly<Record<string, readonly LegacyPartRef[]>>;

/**
 * 冻结快照的内容哈希（恒定量）。
 * 由 `sha256(JSON.stringify(LEGACY_PARTS))` 一次性算出并钉死；改内容不改常量 → 断言失败。
 *
 * 变更记录（每次变动都要写清「改了什么实质」，让后来人一眼知道哈希为什么变）：
 *   - T-R01：e98d5465…
 *     实质：初版快照，`paramSurface` 含人工填写的 `total`（后被判定为自证循环，见架构 §3.3.0）。
 *   - T-R02 第 1 批：7867948d…
 *     实质：**`paramSurface.total` 字段删除 → `gapProvenance()` 改 `scope: []`**
 *     （三个缺口零件无仓库，ARCHITECTURE-REUSE §3.3.6 要求 scope 为空数组）；
 *     同时 8 份 manifest 的 `enumerated` 一律清空为「真接线集合」
 *     （此前把原件符号当已接线参数填进去，属量纲错误，见 §3.3.5）。
 *   - T-R02 第 2 批：364687ec…
 *     实质：**`license.evidence` 补 L3 固定句式的四要素**
 *     （「无许可证声明，已签字豁免，仅用于个人展示站，不得再分发」，§14.1-A-2 要求逐件写明），
 *     外加 `room-at-dawn` / `rain-webgpu` 的 `missing[]` 按门 1 的 import 反查补齐
 *     （原声明 complete/少列依赖，被 import 反查抓出，REUSE-3 不许假装完整）。
 */
export const LEGACY_PARTS_HASH = '364687ecbabbf8984b4f24eb7046c1984dc0e28175a33a26d8e1a0653184dd3e';

/**
 * 按站点 id 取零件引用列表（未登记返回 undefined）。
 * @param siteId 站点 id
 * @returns 引用列表或 undefined
 */
export function findLegacyParts(siteId: string): readonly LegacyPartRef[] | undefined {
  return LEGACY_PARTS[siteId];
}

/**
 * 断言快照自洽：长度恒 7、still 零零件、每条引用有非空 legacySource 与 provenance。
 * @throws 任一条件不满足时抛错
 */
export function assertLegacyPartsIntegrity(): void {
  const ids = Object.keys(LEGACY_PARTS);
  if (ids.length !== LEGACY_PARTS_SITE_COUNT) {
    throw new Error(`[legacy-provenance] 冻结快照长度必须恒为 ${LEGACY_PARTS_SITE_COUNT}，实际 ${ids.length}`);
  }
  const still = LEGACY_PARTS.still;
  if (!still || still.length !== 0) {
    throw new Error('[legacy-provenance] still 必须保持零零件（INV-3 锚点站）');
  }
  for (const id of ids) {
    const refs = LEGACY_PARTS[id] ?? [];
    for (const entry of refs) {
      if (!entry.legacySource || !entry.partId) {
        throw new Error(`[legacy-provenance] ${id} 存在缺 legacySource/partId 的引用`);
      }
      if (!entry.provenance) {
        throw new Error(`[legacy-provenance] ${id}/${entry.partId} 缺 provenance`);
      }
    }
  }
}

export default {
  LEGACY_PARTS,
  LEGACY_PARTS_HASH,
  LEGACY_PARTS_SITE_COUNT,
  findLegacyParts,
  assertLegacyPartsIntegrity,
};
