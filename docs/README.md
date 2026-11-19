# 文档索引 · 权威链

> 一个仓库里同时躺着四代文档是危险的 —— 读到旧的那份就会按错的方向施工。**本页是索引，不是权威本身**：权威按域分列于下表；⛔ 见各文档头部，下面「已废弃」与「已归档」两张表都算。

## 权威顺序（从高到低）

| 序 | 文档 | 状态 | 什么时候读它 |
|---|---|---|---|
| 1 | [`HANDOFF.md`](./HANDOFF.md) | ⭐ **工程权威** | 接手第一份。装配模型 / 零件口径 / 验证门 / 命令 / 坑；**当前架构设计以其 §3.1「T18：L1 就地合成」为准** |
| 2 | [`PRODUCT-FORM.md`](./PRODUCT-FORM.md) | ⭐ **产品形态权威** | 四站（hug / still / koi / license）用户看到什么、做什么、带走什么；工程约束仍以 HANDOFF 为准 |
| 3 | [`COPY-SITES.md`](./COPY-SITES.md) | ⭐ **文案权威 / 构建输入单一来源** | `shared/sites/copy.mjs` 逐字照抄此处，`site-build` 断言逐字命中；改字必须先改本文 |
| 4 | [`MANUAL-QA.md`](./MANUAL-QA.md) | ⭐ **手测权威** | 唯一能回答「这站能不能给人看」的可执行协议；不靠形容词 |
| 5 | [`BIOME-ASSET-MAP.md`](./BIOME-ASSET-MAP.md) | ✅ 有效 | 决定某个 biome 站要装哪几个零件时 |
| 6 | [`VOXEL-AS-PART.md`](./VOXEL-AS-PART.md) | ✅ 有效 | 动 `shared/parts/voxel-world/` 或想改 `shared/core/` 之前 |
| 7 | [`ASCII-PIECE-CONTRACT.md`](./ASCII-PIECE-CONTRACT.md) | ✅ 有效 | 改 `ascii-field` 零件之前（零件已存在，不是"做之前"） |
| 8 | [`../QUARANTINE.md`](../QUARANTINE.md) | ✅ 有效 | 隔离台账：`Q-01` 已消解，`Q-02` 待裁（见文内状态） |
| 9 | [`evidence/voxel-proof.png`](./evidence/voxel-proof.png) · [`evidence/l2-over-l1-bubbles-on-voxel.png`](./evidence/l2-over-l1-bubbles-on-voxel.png) | 证据 | 两张实机截图：初次体素世界 / L2 气泡叠在 L1 之上 |
| 10 | `docs/system_design.md`（已归档） | ⛔ 归档 | 当前架构设计以 `HANDOFF.md` §2 为准；旧设计见 `archive/2026-11-pre-pivot/system_design.md` |

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
