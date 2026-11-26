# v1 归档（2026-11-26）

> 本目录只放**不再参与当前四站 / A2 构建**的 v1 资产。不要按这里的路径施工；现行入口是 `npm run build`（四站 + 模板 + Studio）。

## 已移入

| 路径 | 原位置 | 为什么归档 |
|---|---|---|
| `dawn-desk-upstream/` | `shared/stage/preview/dawn-desk/upstream/` | 14 文件 / 411,635 B；`dawn-desk/index.ts`、`studio.ts` 零 import；与 `shared/parts-library/room-at-dawn/upstream/src/` 是两份互相不一致的「未修改上游源码」，留着只会误导。`UPSTREAM.md` 里引用的 `_third_party/2026-11-20/` 本机不存在，一并作为历史证据保留 |

## 仍在原位、但已冻结的 v1

| 路径 | 为什么没移 |
|---|---|
| `shared/build/` | `verify:core` 还依赖 `verify-core.mjs`；`verify:nexus` / `verify-registry` 仍会 import `registry.mjs`。移动会先打断现行门。现行 `build` 已不指向它，只有显式 `build:v1` / `build:v1:readable` 两个别名会调用 |
| `shared/contract/` | 仍是四站与 Stage 的**现行**契约（`PartV2` / `WorldFrame` / `BLEND_MODES`），不是 v1 遗留；只是名字沿用 `contract` |
| `shared/parts-library/` | 10 个原件目录 + `registry/`；`verify:reuse` 按 manifest 字节数逐件比对磁盘。其中 `koi/`、`dandelion/` 仍被产品渲染 import，不能整库归档 |
| `sites/praise/` | v1 构建注册表仍列 `praise`；当前四站不构建它，但 `verify:registry` 还按旧注册表断言。删除会让旧门变红，先保留并标冻结 |

## 规则

- 新代码不得 import 本目录。
- 本目录内容不再修，除非是补历史证据或修错别字。
- 历史瘦身（`git filter-repo` / LFS 迁移存量）是单独决策，不在本目录处理。
