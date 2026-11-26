# A2 零件与模板 · 现状（2026-11-26）

> 本文回答「A2 现在有什么、和六项 Must 差在哪、下一步做什么」。数字口径都写在表里；结构性的数字今后只在 [`docs/STATUS.md`](./STATUS.md) 维护。
> 依据：[`review-2026-11-24/REVIEW-2026-11-24.md`](./review-2026-11-24/REVIEW-2026-11-24.md) §3.3、§5.2、§5.4、§5.5 与同目录 `ux-a2/WALKTHROUGH.md`（Studio + 5 模板实机走查）。**2026-11-26 更新**：temple/gate 已改用程序化表面，A2 P1 五项已落地，旧表里的 4.99 MB / 3.47 MB 是历史值，保留在 §4 供对照。

## 1. 模板清单（5 个，全部 `status: ready`）

| id | 名称 | preset | 零件 | 参数个数 | 通道 | 产物原始字节 | gzip 字节 | ≤ 1 MB |
|---|---|---|---|---:|---|---:|---:|---|
| `deepsea` | 深海信标 | `a2-deepsea` | abyss + bubbles + still-sink + pixel-post | 4 | 2D | 32.7 KB | 12.6 KB | 是 |
| `nebula` | 星海旋臂 | `a2-nebula` | abyss + nebula + pixel-post | 5 | GL | 511.9 KB | 134.1 KB | 是 |
| `temple` | 晨光山门与主殿 | `a2-temple` | temple | 7 | GL | 606.0 KB | 160.7 KB | 是 |
| `gate` | 独立山门 | `a2-gate` | temple | 4 | GL | 605.9 KB | 160.8 KB | 是 |
| `koi` | 锦鲤池 | `koi` | paper-ink + koi-pond | 5 | GL | 581.4 KB | 159.8 KB | 是 |

- **口径**：id / 名称 / preset / 零件 / 参数个数取自 [`shared/product/templates.mjs`](../shared/product/templates.mjs) 的 `TEMPLATES`；preset 的零件装配取自 [`shared/stage/preview/build.mjs`](../shared/stage/preview/build.mjs) 的 `PRESETS`；字节 = `wc -c dist/templates/<id>/index.html` 与 `gzip -9 -c dist/templates/<id>/index.html | wc -c`（2026-11-26 本机 `npm run build:templates` 输出）。1 MB 按 gzip 字节 ≤ 1,048,576 算。
- `temple` 与 `gate` 是同一个 `temple` 零件的两次装配（`gate` 关掉主殿、换一套山门方案），不是两个零件。
- 25 个参数 = 8 个下拉 + 13 个滑块 + 4 个复选框。`koi` 的「种子」默认值 20260312 超出滑块上限 999999（走查 U-12）。
- `dist/preview/a2-*.html` 与 `dist/templates/<id>/index.html` 是同一文件的重复副本；**该重复只发生在 `dist/`（gitignore），源码侧不再重复维护**。

## 2. 产品层三个文件

| 层 | 文件 | 做什么 | 不做什么 |
|---|---|---|---|
| 注册 | [`shared/product/templates.mjs`](../shared/product/templates.mjs)、[`template-spec.ts`](../shared/product/template-spec.ts) | 模板 = `id + name + preset + biome + status + parts + params`；`TemplateParam` 只有 `enum / number / boolean` 三种 | 没有颜色类型、没有画质参数 |
| 构建 | [`shared/product/build-templates.mjs`](../shared/product/build-templates.mjs) | 每个 ready 模板跑一次 `buildPreview`，写 `dist/templates/<id>/index.html` 和 `manifest.json`（`bytes`、`gzipBytes`、`hasGl`、`order`、`external`） | 只有两道会失败的门：发现外部请求、残留 `__PREVIEW_` 占位符。gzip 只记录，**没有阈值**；没有导出功能 |
| Studio | [`shared/product/studio.mjs`](../shared/product/studio.mjs) | 读 manifest，生成 `dist/studio/index.html`：每个模板一张卡 = 实时预览 iframe + 参数控件 + 「打开独立页」「重置参数」 | 参数只写进网址 query，改一次就把 iframe 整个重载；不重写产物，所以调好的参数存不下来 |

```bash
npm run build:templates        # node shared/product/build-templates.mjs
npm run build:studio           # node shared/product/studio.mjs
# 然后直接双击 dist/studio/index.html（file:// 可开，不需要服务器）
```

## 3. Studio 与六项 Must

判定：**5 达成 / 1 部分**（2026-11-26 复核；旧版 `1 达成 / 3 部分 / 2 未达成` 是 11-24 走查快照）。

| Must | 判定 | 实测现状（2026-11-26） |
|---|---|---|
| 场景模板 ≥ 3 套 | 达成 | 5 套全部 `ready`、0 console 错误、`file://` 直开 5/5。`deepsea` 是 Canvas2D 画的光柱与颗粒，不是 GLSL 粒子 |
| 全程序化生成 | 达成 | 5 套产物 `data:image` 均为 0；temple/gate 的 12 张基础贴图已换成 `MaterialLab.tex(paint, ...)` 的 Canvas 程序化表面（木/红漆/灰泥/瓦/石/苔/草/砾/树皮/剪纸植被/天空） |
| 体积预算检查器 | 达成 | Studio 每卡显示原始 / gzip 字节与 Toy / 独立站门槛；超线变红；默认 Toy 1,048,576 B |
| lil-gui 风格参数面板 | 部分 | 25 个控件都能用；颜色选择器 0 个；画质三档（Low/Normal/High）已进 Studio，但模板产物内只有只读调试条 |
| 单 HTML 导出 | 达成 | Studio 有导出控件；导出文件注入 `__EMBEDDED_PARAMS__` 垫片，`file://` 直开保留参数 |
| < 1 MB、零外部资源 | 达成 | 5/5 全部 ≤1 MB；零外部资源：只有本机与 `data:` 两类请求 |

Studio 另外的历史问题（全文 28 条见 `ux-a2/WALKTHROUGH.md` §6，以下是 11-24 走查记录，除注明外均已修）：

| 编号 | 现象 | 2026-11-26 状态 |
|---|---|---|
| U-04 | 调参不是实时：拖动 1.2 秒的滑块让 iframe 重载 18 次 | 已修：`postMessage` 重建零件，不重载 iframe |
| U-05 | 没有画质档位：运行时 Lod 契约只有 `low / high` | 已修：Studio Low/Normal/High → renderScale 0.7/0.85/1 |
| U-07 | 工程调试条直接出现在 5 个模板页和每个预览里；手机端盖住预览约 6 成 | 已修：默认 `clean`，调试条仅在显式 debug query 下出现 |
| U-09 | temple / gate / koi 加载期间长时间暗屏 | temple/gate 已从 4.99 MB 降到 606 KB，暗屏时间显著缩短；koi 仍保留纸面先行 |
| U-10 | Studio 一打开 5 个场景同时运行，首开 11.1 MB | 模板总体积从 6.1 MB 量级降到约 2.3 MB 量级；Studio 仍保留 5 卡，未改按需加载 |

## 4. 体积与「全程序化」

| 项 | 事实 | 口径 |
|---|---|---|
| 位图数量 | temple / gate 各 0 个 `data:image` | `Select-String -Pattern 'data:image'`（2026-11-26） |
| 历史位图占比 | 旧版 12 张 base64 占原始字节 87.79%、gzip 95.3% | `ux-a2/WALKTHROUGH.md` §5（历史快照） |
| 旧版代码部分 | temple 的代码部分 gzip 161,477 B | 同上；新程序化版本 gzip 160.7 KB，几乎持平 |
| 新表面来源 | `shared/realism/materials.ts` 内的 `paintCedar` / `paintRedLacquer` / `paintPlaster` / `paintSlate` / `paintStone` / `paintMoss` / `paintGrass` / `paintGravel` / `paintBark` / `paintNeedleAlpha` / `paintGrassClumpAlpha` / `paintShrubAlpha` / `paintSky` | 全部 Canvas2D 程序化，无外部图片 |
| 旧资产 | `shared/realism/assets.ts` 仍是 5.0 MB 的 base64 源文件，已不被 `materials.ts` / `atmosphere.ts` import；保留作历史对照，LFS 规则覆盖图片而不是该 TS | `rg "from './assets'" shared/realism` 0 命中 |
| 对比 | 同样内联 three.js 的 nebula gzip 134.1 KB、koi 159.8 KB | 见 §1 |

结论：≤ 1 MB 这条线已经不再卡在位图贴图上；temple/gate 的 606 KB 与 nebula/koi 同一量级。程序化表面牺牲了一部分照片级细节，换来 Toy 档可分发。

## 5. 后续路线

**A2 P1（评审 §5.2「A2」条）—— 2026-11-26 已完成**

1. 导出时内嵌参数：已完成（`__EMBEDDED_PARAMS__`）。
2. 体积 > 1 MB 红色预警：已完成（Toy / 独立站两档）。
3. 调参不重载 iframe：已完成（`postMessage`）。
4. 画质三档：已完成（Low / Normal / High）。
5. 去掉默认调试条：已完成（默认 `clean`）。

**已拍板**：A2 与四站**同仓、分线、分入口**，保住「同一套零件」；`/` 四站门厅，`/studio` + `/templates` A2。不再保留「待裁决」表述。

**评审建议停止做的事（§5.5）**：在导出 / 体积预警 / 实时调参补齐之前，停止给 A2 加新模板；停止继续扩充 Portal 候选、拆第三方 3D 项目（孤儿零件还没有使用方）。这三项现已补齐，但「停止扩张」仍是当前口径：不加新模板，除非有明确的产品使用方。

## 6. 相关文档

| 文档 | 用途 |
|---|---|
| [`docs/PART-ATLAS.md`](./PART-ATLAS.md) | Portal 6,675 条 manifest 记录的筛选表（`tools/parts/atlas.mjs` 生成） |
| [`docs/A2-IMPLEMENTATION-PATH-2026-11-23.md`](./A2-IMPLEMENTATION-PATH-2026-11-23.md) | 实现路径与 Portal 融合评估（11-23 计划稿，文件头有状态块） |
| [`docs/A2-FEASIBILITY-REVIEW.md`](./A2-FEASIBILITY-REVIEW.md) | 立项可行性评审（11-23，文件头有回看块） |
| [`docs/STATUS.md`](./STATUS.md) | 结构性数字的唯一维护处 |
