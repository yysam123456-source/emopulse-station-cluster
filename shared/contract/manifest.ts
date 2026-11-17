// L1 站点声明协议：追加一个 site.manifest.ts 即可产出新站（NX-A-01 / E1 / INV-6）。
// 适用范围：仅【新增站点】。既有 7 站目录零新增、零改动，其注册信息由
// shared/build/registry.mjs 的冻结快照 LEGACY_SITES 提供（主理人 D2 裁决 / ADR-7）。
// 关键性质：本文件描述的是「构建元信息」，不参与产物字节函数 f()，
// 因此新增 / 修改它不得改变任何既有产物哈希（INV-3 / K3）。
import type { SiteConfig } from './types';

/** 站点渲染策略：本期新站一律 canvas2d 等效；core-wgsl 仅表示 L0 既有能力占位。 */
export type SiteEngine = 'canvas2d' | 'core-wgsl';

/** 站点分组：legacy 受哈希基线约束，nexus 受体积硬门约束。 */
export type SiteCohort = 'legacy' | 'nexus';

/** 站点声明 —— 新站唯一的注册入口。 */
export interface SiteManifest {
  /** 小写连字符 slug，全站唯一；构建期正则 ^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$ 校验 */
  id: string;
  /** 路由，必须 === '/' + id */
  route: string;
  /** 站点目录（相对仓库根），如 'sites/abyss-descent' */
  dir: string;
  /** 产物名，必须 === id + '.html' */
  out: string;
  /** 配置文件名，相对 dir，通常为 'site.config.ts' */
  config: string;
  /** 浏览器侧桥接文件名，相对 dir，通常为 'bridge.ts' */
  bridge: string;
  cohort: SiteCohort;
  engine: SiteEngine;
  /** 可选能力需求，驱动 CapabilityProbe 降级；缺省 'none' */
  requires?: 'webgpu' | 'none';
}

/** 恒等函数，仅用于编译期 `satisfies SiteManifest` 形状校验，运行时原样返回。 */
export function defineSite(m: SiteManifest): SiteManifest {
  return m;
}

/** 站点声明 + 已加载配置的绑定（仅构建期内存对象，不进产物）。 */
export interface RegisteredSite {
  manifest: SiteManifest;
  config: SiteConfig;
}

/** cohort 合法取值（与 shared/build/validate-manifest.mjs 保持一致，双处校验）。 */
export const SITE_COHORTS: readonly SiteCohort[] = ['legacy', 'nexus'] as const;

/** engine 合法取值（与 shared/build/validate-manifest.mjs 保持一致，双处校验）。 */
export const SITE_ENGINES: readonly SiteEngine[] = ['canvas2d', 'core-wgsl'] as const;

/** 存量站点条目：与 SiteManifest 同形，但 cohort 固定 legacy、engine 固定 core-wgsl。 */
export type LegacySiteEntry = Readonly<{
  id: string;
  dir: string;
  out: string;
  route: string;
  config: string;
  bridge: string;
  cohort: 'legacy';
  engine: 'core-wgsl';
}>;

/** 冻结存量表：长度恒为 7，内容哈希恒定，禁止追加 / 修改 / 删除。 */
export type LegacySitesTable = Readonly<Record<string, LegacySiteEntry>>;
