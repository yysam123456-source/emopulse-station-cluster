# 文档索引 · 权威链

> 一个仓库里同时躺着四代文档是危险的 —— 读到旧的那份就会按错的方向施工。**本页是索引，不是权威本身**：权威按域分列于下表；⛔ 见各文档头部，下面「已废弃」与「已归档」两张表都算。

## 权威顺序（从高到低）

> **2026-11-20 现状**：`/koi` 已从「六个 JS + 只 ink」升级为 zz85 上游 **26 个文件逐 SHA 对齐**的完整移植；real / paint / ink 三条渲染路径、相机、触摸、池底、雨、音乐全部接回。对应决策见 `DECISIONS.md` ADR-07，工程补注见 `HANDOFF.md` 顶部，产品形态见 `PRODUCT-FORM.md` §1.4。

| 序 | 文档 | 状态 | 什么时候读它 |
|---|---|---|---|
| 1 | [`DECISIONS.md`](./DECISIONS.md) | ⭐ **当前架构决策权威（2026-11-20 koi 完整移植）** | 先读这份：`world` 通道、单 GL 画布、`costMs` 与实测、`E_UNSUPPORTED`、`/koi` 为什么用 three、导出为什么裁主画布。**与 HANDOFF 旧段落冲突时以本文 + 代码为准。** |
| 2 | [`HANDOFF.md`](./HANDOFF.md) | ⭐ **工程细节权威** | 接手第一份。装配模型 / 零件口径 / 验证门 / 命令 / 坑；§0/§3.1 的旧状态已由 DECISIONS 取代，读时以文内「2026-11-20 koi 完整移植补注」为准 |
| 3 | [`PRODUCT-FORM.md`](./PRODUCT-FORM.md) | ⭐ **产品形态权威** | 四站（hug / still / koi / license）用户看到什么、做什么、带走什么；工程约束仍以 DECISIONS / HANDOFF 为准 |
| 4 | [`COPY-SITES.md`](./COPY-SITES.md) | ⭐ **文案权威 / 构建输入单一来源** | `shared/sites/copy.mjs` 逐字照抄此处，`site-build` 断言逐字命中；改字必须先改本文 |
| 5 | [`MANUAL-QA.md`](./MANUAL-QA.md) | ⭐ **手测权威** | 唯一能回答「这站能不能给人看」的可执行协议；不靠形容词 |
| 6 | [`BIOME-ASSET-MAP.md`](./BIOME-ASSET-MAP.md) | ✅ 有效 | 决定某个 biome 站要装哪几个零件时 |
| 7 | [`VOXEL-AS-PART.md`](./VOXEL-AS-PART.md) | ✅ 有效 | 动 `shared/parts/voxel-world/` 或想改 `shared/core/` 之前 |
| 8 | [`ASCII-PIECE-CONTRACT.md`](./ASCII-PIECE-CONTRACT.md) | ✅ 有效 | 改 `ascii-field` 零件之前（零件已存在，不是"做之前"） |
| 9 | [`../QUARANTINE.md`](../QUARANTINE.md) | ✅ 有效 | 隔离台账：`Q-01` 已消解，`Q-02` 待裁（见文内状态） |
| 10 | [`evidence/voxel-proof.png`](./evidence/voxel-proof.png) · [`evidence/l2-over-l1-bubbles-on-voxel.png`](./evidence/l2-over-l1-bubbles-on-voxel.png) | 证据 | 两张实机截图：初次体素世界 / L2 气泡叠在 L1 之上 |
| 11 | `docs/system_design.md`（已归档） | ⛔ 归档 | 当前架构设计以 `HANDOFF.md` §2 为准；旧设计见 `archive/2026-11-pre-pivot/system_design.md` |

## 评审（输入，不是施工依据）

| 文档 | 状态 | 用途 |
|---|---|---|
| [`REVIEW-2026-11-19.md`](./REVIEW-2026-11-19.md) | ✅ 已执行 · 评审输入 | 2026-11-19 的架构 / 产品诊断：四站实机截图（`review-2026-11-19/`）、五个结构性问题、分步调整方案、three.js 落地映射。**第 0/1/2 步已由 A1 落地；第 3 步按 ADR-11 只归位、不硬接 D0 资产；第 4 步文档已收敛。本文现在只作为诊断证据，不再作为施工清单。** 落地取舍见 [`DECISIONS.md`](./DECISIONS.md)。 |

## 已废弃但**故意留在原位**

| 文档 | 为什么留 |
|---|---|
| [`ARCHITECTURE-REUSE.md`](./ARCHITECTURE-REUSE.md) | 232 KB，D0–D4 / 门 1–10 全套。**方向已废**，但 `shared/parts-library/*/part.manifest.ts`、`shared/contract/parts-registry.ts`、`tests/lib/*.mjs` 里有 20+ 处注释按 §章节号引用它；**更要紧的是 `verify:reuse` 在运行时解析它**（见下）。移动或删除会让引用悬空并让门变红。查阅遗留零件溯源依据时仍需它。 |
| [`PRD-REUSE.md`](./PRD-REUSE.md) | 69 KB，同上。 |

两份文件顶部都有醒目废弃抬头，读到会立刻知道。

> ⚠️ **双重身份，别误处置**：这两份文档是 ⛔ **不得作为施工依据**，但同时也是 **`verify:reuse` 的实时数据输入** —— `tests/verify-provenance.mjs:34-35` 在运行时解析 `ARCHITECTURE-REUSE.md`（注释原文：「算法清单与规则的唯一来源」），`package.json:16` 的 `verify:reuse` 会执行它。
> **内容冻结；删改会让门变红。** ⛔ 只约束「不要按它施工」，不表示可以清理掉它。

## 已归档（⛔ 不要据此施工）

| 目录 / 文档 | 内容 |
|---|---|
| [`archive/2026-11-pre-pivot/ARCHITECTURE-NEXUS.md`](./archive/2026-11-pre-pivot/ARCHITECTURE-NEXUS.md) | 站群（7 站 + 8 showcase）架构 v2.1，124 KB |
| [`archive/2026-11-pre-pivot/PRD-REFINE.md`](./archive/2026-11-pre-pivot/PRD-REFINE.md) | 12 站矩阵产品设计 v2.1-refine，83 KB |
| [`archive/2026-11-pre-pivot/TEAM-SOP.md`](./archive/2026-11-pre-pivot/TEAM-SOP.md) | 旧团队协作规范（团队名 `software-emopulse-nexus` 已不存在） |
| [`archive/2026-11-pre-pivot/system_design.md`](./archive/2026-11-pre-pivot/system_design.md) | 旧导航页，指向的文件多数已归档 |
| `archive/2026-11-pre-pivot/*.mermaid` | 旧站群与复用专项的类图 / 时序图 |
| `archive/*-superseded.md` | 更早的 v1.0 / v1.1 版本，2026-11-17 已归档 |

## 归档的依据

2026-11-18 用户明确了四条产品前提，推翻了此前全部方向：

1. 不做站群，改**单域名按路径分站**
2. 爬下来的代码**不用管 LICENSE**
3. 卖点是**多种效果叠加的复合页面**，与原代码有极大差异
4. 把 flaxb（frontend-design-portal）的 component / showcase 也抽象成零件，零件必须能**复合装配**

随之作废：D0–D4 复用深度分档、门 1–10 溯源门、license L1–L4 普查、参数搬运率、算法覆盖门、depth pin、baseline signoff、12 站矩阵、体积门 163,840 B、Frozen Core 站群注册表。
