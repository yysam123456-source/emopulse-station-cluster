# 27 条文档矛盾 · 逐条处置（2026-11-26）

> 对象：`docs/review-2026-11-24/inventory/INVENTORY.md` §6 的 27 条。该节是 **2026-11-24 的审计快照**，不是现行口径；本页记录每条在 2026-11-26 的最终去向，避免下一个人再按旧文施工。
> 现行权威顺序仍是 `DECISIONS.md` → `HANDOFF.md` → 脚本生成的 `STATUS.md`；结构数字只看 `STATUS.md`。

| # | 处置 | 现行口径 / 证据 |
|---:|---|---|
| 1 | 已消解 | `INTERNAL-SCENE-PARTS.md` 已改为「rain 4/25、crimson 3/18 已入库对照，无 WorldFeature」；`git ls-files` 与 manifest 一致 |
| 2 | 已消解 | `THIRD-PARTY-CODE-AUDIT-2026-11-24.md` 保留「本轮未新增」的历史主语；`INTERNAL-SCENE-PARTS.md` 明确「库里已有子集」 |
| 3 | 已消解 | 根 `README.md` 结构数字改由 `npm run docs:status` 写入 `STATUS` 块：17 件 / 18 预设 / 4 站 / 5 模板；不再手抄 2/6、0/4 |
| 4 | 已消解 | `README.md` 不再写 `verify:stage 28`；`HANDOFF.md` 与 `DECISIONS.md` 用 44 + 6 + 22 的真实拆分 |
| 5 | 已消解 | `REALISM-PARTS-CATALOG.md` §4 已写明 deepsea/nebula/koi 内部模块已拆；`INTERNAL-SCENE-PARTS.md` 为同一口径 |
| 6 | 无需改 | `PART-ATLAS.md` 的 Portal 输入路径在本机存在；它是生成物路径说明，不是运行时依赖 |
| 7 | 已消解 | 18 个 preset 均已有 `preview:*` 脚本；`STATUS.md` 显示「有专用 npm script 18 / 18」 |
| 8 | 已消解 | `DECISIONS.md` 的「当前零件栈」表已改为从 `STATIONS` 指向 `STATUS`；`/koi` 栈为 `paper-ink + koi-pond`，budget 12 ms |
| 9 | 已消解 | `HANDOFF.md` 四站现状按 `STATIONS` 重写：`/hug` 只有 `hug-meadow`，`/koi` 不再带 `pixel-post` |
| 10 | 已消解 | `HANDOFF.md` 不再写 `stage.setAudio → dandelion`；`/hug` 走 `hug-meadow`，`dandelion` 仅为孤儿零件 |
| 11 | 已消解 | ADR-11 不再说 `grand-atelier` 恒抛 `E_PART_NOT_MOUNTED`；代码 `index.ts:32-60` 正常返回，room-at-dawn 已注明 24 个 src + 9 个 WorldFeature |
| 12 | 已消解 | `sites/koi/shared/koi.ts` 改「28 文件」；`parts-library/README.md` / `registry/README.md` 已写 28；`koi/part.manifest.ts` 改为「D1 只描述 v1 壳接线深度，产品渲染另在 koi-pond」 |
| 13 | 已消解 | `parts-library/README.md` 索引已按磁盘 10 个目录重写，含 `ascii-kit`，无 `paper-plane` / `verdant-forest` |
| 14 | 已消解 | `registry/README.md` origin 列已按 manifest 修正：`ascii-kit` copy，`dandelion` / `blow-input` port，其余 equivalent |
| 15 | 已消解 | `shared/sites/build.mjs:4` 与 `shared/stage/preview/build.mjs:25` 已改为 18 个预设的口径 |
| 16 | 已消解 | `A2-PARTS-AND-TEMPLATES.md` 已重写：5 套模板、temple 只装 `temple`；历史 4 套/旧栈不再出现 |
| 17 | 已消解 | `A2-PARTS-AND-TEMPLATES.md` 已删掉错误的 `port` 族分布表；`effect 10` 不再混入 1,529 |
| 18 | 已消解 | `BIOME-ASSET-MAP.md` 与 `tools/parts/atlas.mjs` 统一为 ascii 983 |
| 19 | 已消解 | `REALISM-PARTS-CATALOG.md` §5 已改为程序化 painter 表；旧「真实照片」说法只留在历史对照里，并写明 assets.ts 文件头自述 AI 生成 |
| 20 | 已消解 | `BIOME-ASSET-MAP.md` L2 表已写明 `boids` 自写、animata 只是同题材候选；`HANDOFF` 不再把它写成源 |
| 21 | 已消解 | `THIRD-PARTY-CODE-AUDIT-2026-11-24.md` 合计行已改为 355 objects |
| 22 | 已消解 | 同文子集已改为 6 件（`room-shell`、`sky` + 4 part），837,362 tris 与表一致 |
| 23 | 已归档 | 两份 `THIRD-PARTY-REVIEW-2026-11-20/21.md` 已从 `docs/` 移除，只可从 HEAD `b759bb7` 取回；现行审计为 11-24 版 |
| 24 | 已重算 | `verify:preview` 的 599/617/783 是不同时点旧值；2026-11-26 全量重跑后以当次输出为准，`README` 不再写固定断言数 |
| 25 | 已消解 | `HANDOFF.md` 的四个零件行数与 `STATIONS` 行号已按当前代码重写（field-ground 559、paper-ink 549、pixel-post 363、voxel-world 309 等） |
| 26 | 已消解 | `DECISIONS.md` 第二个 ADR-04 已重编号为 ADR-12；ADR-01 的 `/hug` 理由已改为 `hug-meadow`（three.js L1） |
| 27 | 已归档 | `shared/stage/preview/dawn-desk/upstream/` 已移到 `docs/archive/v1/dawn-desk-upstream/`；现行代码零 import，`docs/archive/v1/README.md` 记录两份上游不一致 |

## 未消解 / 仍需单独决策

- **历史瘦身**：LFS 规则已加（`*.png` / `*.jpg` / `*.jpeg`），但存量对象尚未 `git lfs migrate`，历史体积不会因本次提交下降。按 PLAN 的「历史瘦身单独决策」保留。
- **真机手机**：仍只有 390×844 模拟与桌面 resize，没有真机 Safari/Chrome 手测。
