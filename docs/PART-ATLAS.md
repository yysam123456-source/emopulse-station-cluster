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

- `port`：可以抽象成 Stage 零件的候选；做不做取决于有没有站或模板需要它；
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

## 6. port 候选（按来源项目）

| project | port 候选数 |
|---|---:|
| ascii-magic | 734 |
| pixelfx | 244 |
| ascii-rest | 240 |
| shaders | 209 |
| threeui | 93 |
| ascii-sharks | 9 |

这张表是候选存量，不是施工顺序。截至 2026-11-24，从这 1,529 条里落地的是 `abyss` / `nebula` / `temple`（另加 `bubbles`、`pixel-post`，后者只借了概念）；
评审（`docs/review-2026-11-24/REVIEW-2026-11-24.md` §5.5）建议停止继续扩充 Portal 候选，
因为现有零件里还有 4 个没有任何使用方。有站或模板需要时，再按族回来查：

| 族 | port 候选 | 现状 |
|---|---:|---|
| pixelfx | 244 | 未逐条拆；`pixel-post` 只借了 `core/fx.js` 的概念 |
| shaders | 209 | 未拆；2.59 MB 单 bundle |
| threeui | 93 | 未拆 |
| ascii | 983 | 未拆；`ascii-field` 是按 ascii-magic 的 piece 契约自建，且没有使用方 |
| looseleaf | 0 | 不是候选：123 条全是 embed，已归 `archive` |

## 7. 与现有零件的对照

16 个 Stage 零件（`shared/parts/`）按层列出；「孤儿」= 不在任何站、预设、模板里（`docs/review-2026-11-24/inventory/INVENTORY.md` §3、§5）。

| 层 | 现有零件（使用方） | 图谱里的对应 |
|---|---|---|
| L0 | `abyss`（模板 deepsea / nebula）· `paper-ink`（/license /koi，模板 koi）· `field-ground`（仅预设 field / field-l0）· `tide-medium`（/still，仅预设） | 无强候选；looseleaf 123 条是 embed，已归档 |
| L1 | `voxel-world`（/still）· `koi-pond`（/koi，模板 koi）· `hug-meadow`（/hug）· `nebula`（模板 nebula）· `temple`（模板 temple / gate） | threeui 93 条未拆；NebulaGalaxy / AbyssalDescent / kage 参考已落成 `nebula` / `abyss` / `temple` |
| L2 | `bubbles`（/still，模板 deepsea）· 孤儿：`ascii-field` `boids` `dandelion` | pixelfx 244 条、ascii 983 条未拆 |
| L3 | `still-sink`（/still，模板 deepsea）· 孤儿：`sun` | 暂无强候选 |
| L4 | `pixel-post`（/license /still，模板 deepsea / nebula） | shaders / pixelfx 后处理类 |
| L5 | 无正式零件 | uiverse / animata / eldoraui / zelda 做站点壳 |

## 8. 关键边界

- **单 GL**：Stage 一份 composition 只能有一个 `gl`/`world` 零件；threeui 与 shader 不能同场叠加，必须按模板选一个。
- **单 L4**：`pixel-post` 已占 L4；shaders 后处理如果要进模板，必须先做“替换 pixel-post”的决策，不能并联。
- **2.59 MB shader bundle**：`public/shaders/runtime/shaders.js` 是 200 个组件的单 bundle，不能按组件 tree-shake；先选 1–2 个后处理重写成独立零件。
- **pixelfx 尺寸锁 320×180**：进 Stage 前要加内部 RT 适配，否则大屏会糊。
- **视频/图片不占层**：268 条 media-video、148 条 media-image 只做来源归档，不包成画布零件。
- **UI 不进画布**：uiverse 3,802 条是 UI/CSS，L5 站点壳参考；不要为了“做全”把它们塞进 L2。

## 9. 和 A2 的关系

A2 的模板层与 Studio 已经有了，不再缺「模板注册、参数 schema、新场景」：
`shared/product/templates.mjs` 是模板注册表，`shared/product/studio.mjs` 生成 Studio，
深海 / 星系 / 寺庙三个场景分别落在 `abyss` / `nebula` / `temple`（现状见 `docs/A2-PARTS-AND-TEMPLATES.md`）。

缺口在产品层，不在这张图谱里（评审 `docs/review-2026-11-24/REVIEW-2026-11-24.md` §3.3 与 §5.2）：

- **导出**：Studio 没有导出控件，「另存为」存下的是原模板，调好的参数全部丢失；
- **体积预算**：构建只把 gzip 写进 manifest，没有阈值；超 1 MB 的模板照样标 `READY`；
- **实时调参**：改一次参数就把 iframe 整个重载；
- **画质档位**：运行时只有 `low | high` 两档，没有给用户的档位选择。

所以 port 候选目前不是 A2 的待办：评审 §5.5 建议在导出 / 体积预警 / 实时调参补齐之前不给 A2 加新模板，也不扩充 Portal 候选。
有站或模板需要某一条时，再回到 §6 按族查。

## 10. 复现

```powershell
node tools/parts/atlas.mjs
node tools/parts/atlas.mjs --portal-root <path-to-frontend-design-portal>
```
