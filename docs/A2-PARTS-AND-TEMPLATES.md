# A2 零件与模板 · 现状（2026-11-24）

> 本文回答「A2 现在有什么、和六项 Must 差在哪、下一步做什么」。数字口径都写在表里；结构性的数字今后只在 [`docs/STATUS.md`](./STATUS.md) 维护。
> 依据：[`review-2026-11-24/REVIEW-2026-11-24.md`](./review-2026-11-24/REVIEW-2026-11-24.md) §3.3、§5.2、§5.4、§5.5 与同目录 `ux-a2/WALKTHROUGH.md`（Studio + 5 模板实机走查）。

## 1. 模板清单（5 个，全部 `status: ready`）

| id | 名称 | preset | 零件 | 参数个数 | 通道 | 产物原始字节 | gzip 字节 | ≤ 1 MB |
|---|---|---|---|---:|---|---:|---:|---|
| `deepsea` | 深海信标 | `a2-deepsea` | abyss + bubbles + still-sink + pixel-post | 4 | 2D | 29,480 | 11,578 | 是 |
| `nebula` | 星海旋臂 | `a2-nebula` | abyss + nebula + pixel-post | 5 | GL | 520,388 | 135,269 | 是 |
| `temple` | 晨光山门与主殿 | `a2-temple` | temple | 7 | GL | 4,992,587 | 3,473,188 | **否** |
| `gate` | 独立山门 | `a2-gate` | temple | 4 | GL | 4,992,577 | 3,473,186 | **否** |
| `koi` | 锦鲤池 | `koi` | paper-ink + koi-pond | 5 | GL | 591,332 | 161,248 | 是 |

- **口径**：id / 名称 / preset / 零件 / 参数个数取自 [`shared/product/templates.mjs`](../shared/product/templates.mjs) 的 `TEMPLATES`；preset 的零件装配取自 [`shared/stage/preview/build.mjs`](../shared/stage/preview/build.mjs) 的 `PRESETS`；字节 = `wc -c dist/templates/<id>/index.html` 与 `gzip -9 -c dist/templates/<id>/index.html | wc -c`（本机复算与 [`arch/AUDIT.md`](./review-2026-11-24/arch/AUDIT.md) §7.2 一致）。1 MB 按 gzip 字节 ≤ 1,048,576 算。
- `temple` 与 `gate` 是同一个 `temple` 零件的两次装配（`gate` 关掉主殿、换一套山门方案），不是两个零件。
- 25 个参数 = 8 个下拉 + 13 个滑块 + 4 个复选框。`koi` 的「种子」默认值 20260312 超出滑块上限 999999（走查 U-12）。
- `dist/preview/a2-*.html` 与 `dist/templates/<id>/index.html` 是同一文件的重复副本。

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

判定取自 `ux-a2/WALKTHROUGH.md` §5：**1 达成 / 3 部分 / 2 未达成**。

| Must | 判定 | 实测现状（走查证据） |
|---|---|---|
| 场景模板 ≥ 3 套 | 达成 | 5 套全部 `ready`、0 console 错误、`file://` 直开 5/5。附注：`deepsea` 是 Canvas2D 画的光柱与颗粒，不是粒子（GLSL 着色器 0 个） |
| 全程序化生成 | 部分 | deepsea / nebula / koi 产物里 `data:image` 0 个；temple / gate 各内嵌 12 张 base64 位图（9 JPEG + 3 PNG） |
| 体积预算检查器 | **未达成** | Studio 每卡只有一行构建期静态文字；超 1 MB 无预警，temple / gate 仍是绿色 `READY`；没有 Toy / 独立站门槛切换 |
| lil-gui 风格参数面板 | 部分 | 25 个控件都能用；颜色选择器 0 个；画质下拉不存在；面板不在模板产物里，产物内只有只读调试条 |
| 单 HTML 导出 | **未达成** | Studio 没有导出控件。「另存为」存下的文件与 `dist/templates/<id>/index.html` 逐字节相同，**参数全部丢失** |
| < 1 MB、零外部资源 | 部分 | 零外部资源：达成（走查全部页面只有本机与 `data:` 两类请求）。≤ 1 MB：3 / 5 达成 |

Studio 另外的严重问题（全文 28 条见 `ux-a2/WALKTHROUGH.md` §6）：

| 编号 | 现象 |
|---|---|
| U-04 | 调参不是实时：拖动 1.2 秒的滑块让 iframe 重载 18 次，拖动被卡成 8–15 秒 |
| U-05 | 没有画质档位：运行时 Lod 契约只有 `low / high`，全程显示 `high` |
| U-07 | 工程调试条（`state / lod / fps / frame / cpu / drawn / budget …`）直接出现在 5 个模板页和每个预览里；手机端盖住预览约 6 成 |
| U-09 | temple / gate / koi 加载期间长时间暗屏（temple 桌面端约 5–12 秒） |
| U-10 | Studio 一打开 5 个场景同时运行，首开 11.1 MB；首屏只看得到 2 / 5 张卡 |

## 4. 体积与「全程序化」

| 项 | 事实 | 口径 |
|---|---|---|
| 位图数量 | temple / gate 各 12 个 `data:image` | `grep -o 'data:image/[a-z]*' dist/templates/temple/index.html \| sort \| uniq -c` |
| 位图占比 | 占原始字节 87.79%、占 gzip 95.3% | `ux-a2/WALKTHROUGH.md` §5（`metrics.json` 的 `assets` 节） |
| 去掉位图后 | temple 的代码部分 gzip 161,477 B | 同上 |
| 位图来源 | `shared/realism/assets.ts` 文件头自述「由 AI 生成并压缩到 1024 JPEG 的写实表面贴图。生成来源：seedream 5.5」 | 不是程序化，也不是上游项目资产（`inventory/INVENTORY.md` §4.6） |
| 对比 | 同样内联 three.js 的 nebula gzip 135 KB、koi 161 KB | 见 §1 |

结论：≤ 1 MB 这条线卡在位图贴图上，不在 three.js 上。位图不解决，`temple` / `gate` 的 gzip 就回不到 1,048,576 B 以内。

## 5. 后续路线

**计划（评审 §5.2「A2」条，P1，下一个迭代）**

1. 导出时内嵌参数。
2. 体积 > 1 MB 红色预警。
3. 调参不重载 iframe。
4. 画质三档。
5. 去掉默认调试条。

**待裁决（评审 §5.4 第 2 条，用户尚未拍板）**：A2 与四站是同仓还是分仓。评审建议**同仓、分线、分入口**，理由是保住「同一套零件」；PM 建议分仓，代价是运行时两份。在拍板之前，本文和其它文档都不把任何一边写成已定。

**评审建议停止做的事（§5.5）**：在导出 / 体积预警 / 实时调参补齐之前，停止给 A2 加新模板；停止继续扩充 Portal 候选、拆第三方 3D 项目（孤儿零件还没有使用方）。

## 6. 相关文档

| 文档 | 用途 |
|---|---|
| [`docs/PART-ATLAS.md`](./PART-ATLAS.md) | Portal 6,675 条 manifest 记录的筛选表（`tools/parts/atlas.mjs` 生成） |
| [`docs/A2-IMPLEMENTATION-PATH-2026-11-23.md`](./A2-IMPLEMENTATION-PATH-2026-11-23.md) | 实现路径与 Portal 融合评估（11-23 计划稿，文件头有状态块） |
| [`docs/A2-FEASIBILITY-REVIEW.md`](./A2-FEASIBILITY-REVIEW.md) | 立项可行性评审（11-23，文件头有回看块） |
| [`docs/STATUS.md`](./STATUS.md) | 结构性数字的唯一维护处 |
