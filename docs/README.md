# 文档索引 · 权威链

> 一个仓库里同时躺着四代文档是危险的 —— 读到旧的那份就会按错的方向施工。**本页是唯一的权威声明**：标 ⛔ 的一律不要作为施工依据。

## 权威顺序（从高到低）

| 序 | 文档 | 状态 | 什么时候读它 |
|---|---|---|---|
| 1 | [`HANDOFF.md`](./HANDOFF.md) | ⭐ **唯一权威** | 接手第一份。产品前提 / 已完成 / 缺口任务 / 命令 / 坑 |
| 2 | [`BIOME-ASSET-MAP.md`](./BIOME-ASSET-MAP.md) | ✅ 有效 | 决定某个 biome 站要装哪几个零件时 |
| 3 | [`VOXEL-AS-PART.md`](./VOXEL-AS-PART.md) | ✅ 有效 | 动 `shared/parts/voxel-world/` 或想改 `shared/core/` 之前 |
| 4 | [`ASCII-PIECE-CONTRACT.md`](./ASCII-PIECE-CONTRACT.md) | ✅ 有效 | 做 `ascii-frame` 零件之前 |
| 5 | [`../QUARANTINE.md`](../QUARANTINE.md) | ✅ 有效 | 想知道为什么 `mountSite()` 没人调用时（Q-02） |
| 6 | [`evidence/voxel-proof.png`](./evidence/voxel-proof.png) | 证据 | 唯一被浏览器真实跑出来的画面截图 |

## 已废弃但**故意留在原位**

| 文档 | 为什么留 |
|---|---|
| [`ARCHITECTURE-REUSE.md`](./ARCHITECTURE-REUSE.md) | 232 KB，D0–D4 / 门 1–10 全套。**方向已废**，但 `shared/parts-library/*/part.manifest.ts`、`shared/contract/parts-registry.ts`、`tests/lib/*.mjs` 里有 20+ 处注释按 §章节号引用它，移动或删除会让引用全部悬空。查阅遗留零件溯源依据时仍需它。 |
| [`PRD-REUSE.md`](./PRD-REUSE.md) | 69 KB，同上。 |

两份文件顶部都有醒目废弃抬头，读到会立刻知道。

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
