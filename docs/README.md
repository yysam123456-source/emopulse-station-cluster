# 文档索引 · 权威链

> 仓库里同时躺着四代文档 —— 读到旧的那份就会按错的方向施工。**本页是索引，不是权威本身**；权威按域分列于下表。

## 权威顺序（从高到低）

| 序 | 文档 | 管什么 |
|---|---|---|
| 1 | [`DECISIONS.md`](./DECISIONS.md) | 架构决策（ADR）。与 HANDOFF 冲突时以本文 + 代码为准 |
| 2 | [`HANDOFF.md`](./HANDOFF.md) | 工程细节：装配模型、零件口径、命令、四站现状、后续路线 |
| 3 | [`STATUS.md`](./STATUS.md) | **结构事实，脚本生成**（`npm run docs:status`）：零件 / 预设 / 站 / 模板的真实数字。其它文档不重抄 |
| 4 | [`PRODUCT-FORM.md`](./PRODUCT-FORM.md) | 产品形态：四站用户看到什么、做什么、带走什么 |
| 5 | [`COPY-SITES.md`](./COPY-SITES.md) | 文案单一来源；`shared/sites/copy.mjs` 逐字照抄，`site-build` 断言命中。改字先改本文 |
| 6 | [`MANUAL-QA.md`](./MANUAL-QA.md) | 手测协议与度量口径（含 §8：饱和度一律 HSV S） |

## 专题文档

| 文档 | 什么时候读 |
|---|---|
| [`BIOME-ASSET-MAP.md`](./BIOME-ASSET-MAP.md) | 决定某个 biome 站要装哪几个零件时 |
| [`VOXEL-AS-PART.md`](./VOXEL-AS-PART.md) | 动 `shared/parts/voxel-world/` 或想改 `shared/core/` 之前 |
| [`ASCII-PIECE-CONTRACT.md`](./ASCII-PIECE-CONTRACT.md) | 改 `ascii-field` 零件之前（零件已存在） |
| [`INTERNAL-SCENE-PARTS.md`](./INTERNAL-SCENE-PARTS.md) | 查 deepsea / nebula / koi 内部拆解落在哪些模块 |
| [`REALISM-PARTS-CATALOG.md`](./REALISM-PARTS-CATALOG.md) | A2 写实模块（temple / gate）的零件目录 |
| [`../QUARANTINE.md`](../QUARANTINE.md) | 隔离台账（Q-01 已消解，Q-02 待裁） |

## A2 线（模板 + Studio）

| 文档 | 内容 |
|---|---|
| [`A2-IMPLEMENTATION-PATH-2026-11-23.md`](./A2-IMPLEMENTATION-PATH-2026-11-23.md) | 实施路径与阶段划分 |
| [`A2-FEASIBILITY-REVIEW.md`](./A2-FEASIBILITY-REVIEW.md) | 可行性评审 |
| [`A2-PARTS-AND-TEMPLATES.md`](./A2-PARTS-AND-TEMPLATES.md) | 零件与模板的对应关系 |
| [`A2-SHOWCASE-INVENTORY.csv`](./A2-SHOWCASE-INVENTORY.csv) | 交互组件库盘点 |
| [`PART-ATLAS.md`](./PART-ATLAS.md) · [`PART-ATLAS.csv`](./PART-ATLAS.csv) | 零件图集（`node tools/parts/atlas.mjs` 生成） |

## 第三方

| 文档 | 内容 |
|---|---|
| [`THIRD-PARTY-CODE-AUDIT-2026-11-24.md`](./THIRD-PARTY-CODE-AUDIT-2026-11-24.md) | 20 个来源项目的逐项清点与拆解判定 |
| [`THIRD-PARTY-FILE-INVENTORY-2026-11-24.csv`](./THIRD-PARTY-FILE-INVENTORY-2026-11-24.csv) | 对应文件清单 |

## 评审

| 文档 | 状态 |
|---|---|
| [`review-2026-11-24/REVIEW-2026-11-24.md`](./review-2026-11-24/REVIEW-2026-11-24.md) | ⭐ **当前路线依据**：拆解盘点、产品/架构/代码问题、P0–P2 与待裁决。原始取证在同目录 `inventory/` `arch/` `ux-sites/` `ux-a2/` `lead/` `tools/` |
| [`REVIEW-2026-11-19.md`](./REVIEW-2026-11-19.md) | 历史诊断（A1 之前的架构 / 产品问题，作为证据保留） |
| [`review-2026-11-19/`](./review-2026-11-19/) · [`review-2026-11-20/`](./review-2026-11-20/) | 上述历史评审的截图与导出物 |

## 冻结区（内容冻结，删改会让门变红）

| 文档 | 为什么冻结 |
|---|---|
| [`ARCHITECTURE-REUSE.md`](./ARCHITECTURE-REUSE.md) | 233,535 B，D0–D4 / 门 1–10 全套，方向已废。但 `tests/verify-provenance.mjs:35` **在运行时解析它**；`shared/parts-library/*/part.manifest.ts` 等也有 20+ 处注释按章节号引用。删改 = `verify:reuse` 变红 |
| [`PRD-REUSE.md`](./PRD-REUSE.md) | 70,151 B，同上方向已废。**没有运行时读者**（只被注释引用）；仍留原位以免引用悬空。两份文件顶部都有醒目废弃抬头 |

## 已删除的历史文档

以下三份已从 `docs/` 移除，内容仍可从 HEAD `b759bb7` 取回：`git show b759bb7:docs/<文件名>`。

- `THIRD-PARTY-REVIEW-2026-11-20.md`
- `THIRD-PARTY-REVIEW-2026-11-21.md`
- `DAWN-DESK-PREVIEW-2026-11-20.md`

## 归档区（⛔ 不要据此施工）

| 路径 | 内容 |
|---|---|
| [`archive/2026-11-24/`](./archive/2026-11-24/) | 上一版交接书 `HANDOFF-2026-11-22.md`（历史细节与已作废口径） |
| [`archive/2026-11-pre-pivot/`](./archive/2026-11-pre-pivot/) | 站群架构 v2.1、12 站矩阵 PRD、旧团队 SOP、四张 mermaid 图、旧 `system_design.md` |
| [`archive/`](./archive/) 根目录 | `ARCHITECTURE-v1.1-superseded.md`、`PRD-v1.0-superseded.md`、`PRD-NEXUS-v1.0-superseded.md`、`QA-REPORT-v1.1-历史证据.md` |

## 产品前提（为什么只剩这些文档）

2026-11-18 用户定了四条前提：不做站群改单域名分站、不管 LICENSE 但记来源、卖点是多层叠加、把 flaxb 的 component / showcase 也抽象成零件。随之作废的有 D0–D4、门 1–10、12 站矩阵、体积门、Frozen Core 站群注册表等 —— 完整表述见 [`HANDOFF.md`](./HANDOFF.md) §1。
