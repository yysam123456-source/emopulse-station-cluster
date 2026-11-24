# PART-ATLAS · Portal 组件零件图谱

> 生成脚本：`tools/parts/atlas.mjs`；输入：`../../../DoubaoWork/chats/2026-11-23/new-chat/_source/portal-full/frontend-design-portal-3d7c139899417dbceb07be0578ec76b306ee98dc/src/generated/preview-manifest.ts`。
> 全量 CSV：`docs/PART-ATLAS.csv`（6675 行，一行一条 manifest 记录）。

## 1. 这份图谱回答什么

Portal 的 `preview-manifest.ts` 有 **6675 条**组件记录，但“记录数”不等于“零件数”。
真正要进 Stage 的，不是 6,675 个页面，而是能落在 L0–L4 的**效果族**：
底材、世界、粒子/字符场、叠加层、后处理。UI/CSS、视频、图片、embed 只能做站点壳或参考。

这份表给每条记录一个 `family / role / suggested_layer / action`，用来筛选“先做哪些零件”，
而不是假装 6,675 条都能一比一移植。

## 2. 总数与动作分布

| action | 数量 |
|---|---:|
| ui-reference | 4151 |
| port | 1529 |
| archive | 539 |
| reference | 427 |
| skip | 29 |

解释：

- `port`：可以抽象成 Stage 零件，优先做；
- `ui-reference`：UI/CSS 组件，只做站点壳参考；
- `reference`：运动/动画参考，保留逻辑，不整体移植；
- `archive`：视频/图片/embed，留来源路径；
- `review`：React 生成或未归族，按需评估；
- `skip`：manifest 已标 unsupported。

## 3. 项目分布

| project | 数量 |
|---|---:|
| uiverse | 3802 |
| ascii-magic | 734 |
| animejs | 417 |
| react-bits | 269 |
| pixelfx | 244 |
| ascii-rest | 240 |
| shaders | 209 |
| animata | 203 |
| eldoraui | 161 |
| looseleaf | 123 |
| threeui | 120 |
| zelda-hyrule-ui | 93 |
| pinui | 41 |
| pixel2motion | 10 |
| ascii-sharks | 9 |

## 4. 族分布

| family | 数量 |
|---|---:|
| ui | 4151 |
| ascii | 983 |
| motion | 417 |
| media | 416 |
| pixelfx | 244 |
| shader | 209 |
| embed | 123 |
| three | 93 |
| unsupported | 29 |
| effect | 10 |

## 5. 建议层分布

| suggested_layer | 数量 |
|---|---:|
| L5 | 4274 |
| L2 | 1651 |
| - | 445 |
| L1 | 273 |
| L4 | 32 |

## 6. 可移植优先级（port 族）

| project | port 候选数 |
|---|---:|
| ascii-magic | 734 |
| pixelfx | 244 |
| ascii-rest | 240 |
| shaders | 209 |
| threeui | 93 |
| ascii-sharks | 9 |

优先顺序按“对 A2 模板的直接价值”排，而不是按数量排：

1. **pixelfx / shader**：直接补 L2 特效与 L4 后处理，和现有 `pixel-post` 同一层；先挑 weather 与低成本后处理。
2. **threeui**：补 L1 单 GL 场景；与 `nebula` / `temple` 共用“单 GL”约束。
3. **ascii-magic / ascii-rest / ascii-sharks**：补 L2 字符场；和 `ascii-field` 合并成一套字符渲染工具。
4. **looseleaf**：L0 纸/墨底材；优先并入 `paper-ink` 的材质分支，而不是新开零件。
5. **react-bits / animata / eldoraui / pinui / zelda**：UI 或运动参考；不占 Stage 画布层，先做站点壳。

## 7. 与现有零件的对照

| 层 | 现有零件 | 图谱里的补位 |
|---|---|---|
| L0 | field-ground, paper-ink, tide-medium | looseleaf 纸材；pixelfx 背景类 |
| L1 | voxel-world, koi-pond, hug-meadow | threeui 场景；Nebula / AbyssalDescent / temple 参考 |
| L2 | boids, bubbles, dandelion, ascii-field | pixelfx weather；ascii 族；animejs 运动逻辑 |
| L3 | sun, still-sink | 暂无强候选；保持轻量 |
| L4 | pixel-post | shaders 后处理；pixelfx post 类 |
| L5 | 无正式零件 | uiverse / animata / eldoraui / zelda 做站点壳 |

## 8. 关键边界

- **单 GL**：Stage 一份 composition 只能有一个 `gl`/`world` 零件；threeui 与 shader 不能同场叠加，必须按模板选一个。
- **单 L4**：`pixel-post` 已占 L4；shaders 后处理如果要进模板，必须先做“替换 pixel-post”的决策，不能并联。
- **2.59 MB shader bundle**：`public/shaders/runtime/shaders.js` 是 200 个组件的单 bundle，不能按组件 tree-shake；先选 1–2 个后处理重写成独立零件。
- **pixelfx 尺寸锁 320×180**：进 Stage 前要加内部 RT 适配，否则大屏会糊。
- **视频/图片不占层**：268 条 media-video、148 条 media-image 只做来源归档，不包成画布零件。
- **UI 不进画布**：uiverse 3,802 条是 UI/CSS，L5 站点壳参考；不要为了“做全”把它们塞进 L2。

## 9. 和 A2 的关系

A2 报告（`docs/A2-IMPLEMENTATION-PATH-2026-11-23.md`）的结论是：
**多模板在 Stage 构建层已经成立，缺的是模板注册、参数 schema、体积/导出、Studio，以及深海/寺庙两个新 GL 场景。**

本图谱支持这个结论：6,675 条里真正需要补的零件集中在 5 个族；深海/寺庙/星系三个场景已经用
`abyss` / `nebula` / `temple` 三个新零件落地，剩余工作是按模板需要继续挑 pixelfx/shaders/threeui，
而不是逐条复制 manifest。

## 10. 复现

```powershell
node tools/parts/atlas.mjs
node tools/parts/atlas.mjs --portal-root <path-to-frontend-design-portal>
```
