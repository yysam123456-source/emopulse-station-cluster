# A2 零件与模板产品化 · 落地说明（2026-11-23）

> **2026-11-23 写实重构后，本文第 2.3 节与第 3 节的 `temple` 描述已过期。**
> 当前寺庙已拆成 `ScenePlan + SceneModule`，并新增 `gate` 模板；以 `docs/REALISM-PARTS-CATALOG.md` 为准。
> 本文保留作为早期 4 模板产品化的历史记录。

本文件是 `docs/A2-IMPLEMENTATION-PATH-2026-11-23.md` 的**执行版**：报告回答“为什么这样走”，这里回答“已经落了什么、怎么跑、还差什么”。

## 1. 本轮交付清单

| 类型 | 文件 | 状态 |
|---|---|---|
| 新零件 | `shared/parts/abyss/index.ts` | L0 Canvas 深海光柱/焦散/微粒/涟漪 |
| 新零件 | `shared/parts/nebula/index.ts` | L1 GL 四旋臂星系粒子，可参数化 |
| 新零件 | `shared/parts/temple/index.ts` | L1 GL 夜寺鸟居/石灯/主殿/月轮 |
| 参数工厂 | `shared/parts/koi-pond/index.ts` | 新增 `KoiOptions` / `makePart(opts)` |
| 模板注册 | `shared/product/templates.mjs` | 4 个模板、参数 schema |
| 类型契约 | `shared/product/template-spec.ts` | `TemplateSpec` / `TemplateParam` |
| 构建门 | `shared/product/build-templates.mjs` | 构建、gzip、零外部请求、manifest |
| Studio | `shared/product/studio.mjs` | 参数控件 + iframe + 独立页链接 |
| 零件图谱 | `tools/parts/atlas.mjs` | 6,675 条 manifest → CSV/MD |
| 图谱结果 | `docs/PART-ATLAS.csv` / `docs/PART-ATLAS.md` | 6,675 行 + 统计/边界 |

## 2. 三个新零件

### 2.1 `abyss`（L0 Canvas）

- 来源：Portal `AbyssalDescent.tsx` 是 5 张 JPG 序列；直接搬会换尺寸就糊，也不可叠加。
- 做法：程序化深海底材——深水渐变、暗角、颗粒、顶部斜射光柱（blur 软化）、焦散线、悬浮微粒、指针涟漪。
- 参数：`palette`（`abyss|tide|ink`）、`density`、`rays`、`caustics`、`vignette`。
- 约束：`canvas2d` / `L0` / `source-over`；不占 GL，因此适合做“无 GL 兜底”模板。

### 2.2 `nebula`（L1 GL）

- 来源：Portal `src/components/showcases/NebulaGalaxyShowcase.tsx`（35,200 GPU 粒子、四旋臂、三套 palette）。
- 做法：保留“位置生成 + 粒子着色器 + 指针脉冲”骨架，宿主换成 Stage 的 `update/draw`；粒子数约 28k 起，按 density 缩放。
- 参数：`palette`（`violet|abyss|ember|aurora`）、`density`、`scale`、`speed`、`pulse`、`coreGlow`。
- 约束：`gl` / `L1` / 单 GL；与 `temple` 不能同场。

### 2.3 `temple`（L1 GL）

- 来源：Portal `public/showcases/temple-of-echoes`（Kage 场景）与 `fable-030 Rose Window` 的 temple/culture reference；原件依赖外部 GLB/贴图，不适合直接做零件。
- 做法：无贴图基本体重画——鸟居、石灯（发光灯箱 + 点光）、主殿、石板路、松树剪影、月轮、尘埃；透明背景，L0 的纸/墨仍能从天空边缘透出。
- 参数：`palette`（`night|dawn|ink`）、`fog`、`lanterns`、`orbit`、`moon`。
- 约束：`gl` / `L1` / 单 GL；与 `nebula` 不能同场。

### 2.4 `koi` 参数化

- 新增 `KoiOptions`：`style/mode/cam/floor/rain/music/seed`。
- 新增 `makePart(opts)`；不传 opts 时完全保留 `/koi` 的 URL query 行为。
- 模板注册用 `makePart({ style:'ink', cam:'top' })` 这类固定参数；Studio 仍可用 query 现场覆盖。

## 3. 三层产品化

### 第一层：模板注册（`shared/product/templates.mjs`）

一个模板 = `id + name + preset + biome + status + parts + params`。`preset` 必须能在 `build.mjs` 的 `PRESETS` 里解析，构建门会真实跑一次 `buildPreview`。

已注册 4 个：

| id | preset | 层组合 | 体积 / gzip | GL |
|---|---|---|---:|---|
| `deepsea` | `a2-deepsea` | abyss + bubbles + still-sink + pixel-post | 27.6 KB / 11.1 KB | 否 |
| `nebula` | `a2-nebula` | abyss + nebula + pixel-post | 504.4 KB / 131.8 KB | 是 |
| `temple` | `a2-temple` | abyss + temple + pixel-post | 528.0 KB / 138.2 KB | 是 |
| `koi` | `koi` | paper-ink + koi-pond | 576.1 KB / 158.1 KB | 是 |

### 第二层：构建/体积/导出（`shared/product/build-templates.mjs`）

每个 ready 模板输出：

- `dist/templates/<id>/index.html`：单 HTML、零外部请求；
- `dist/templates/manifest.json`：`bytes`、`gzipBytes`、`hasGl`、`order`、`external`、`placeholder`、`buildMs`；
- 失败即 `process.exitCode=1`，不会把失败模板写进 ready 清单。

命令行：

```powershell
node shared/product/build-templates.mjs --list
node shared/product/build-templates.mjs
node shared/product/build-templates.mjs --only nebula
node shared/product/build-templates.mjs --out dist/templates
```

### 第三层：Studio（`shared/product/studio.mjs`）

读 `dist/templates/manifest.json`，生成 `dist/studio/index.html`：

- 每个模板一张卡：名称、preset、parts、体积、GL 标记；
- 参数控件（enum / number / boolean）直接写 query，iframe 即时刷新；
- “打开独立页”指向 `dist/templates/<id>/index.html`；
- 全部内联 CSS/JS，无服务器、无外部字体。

```powershell
node shared/product/build-templates.mjs
node shared/product/studio.mjs
# 打开 dist/studio/index.html
```

## 4. 零件图谱：6,675 条怎么读

`docs/PART-ATLAS.csv` 一行一条 manifest 记录，列为：

`id, project, kind, status, family, role, suggested_layer, action, registry_entry, media_label, note`

统计：

| action | 数量 | 含义 |
|---|---:|---|
| `port` | 1,529 | 可抽象成 Stage 零件，优先做 |
| `ui-reference` | 4,151 | UI/CSS，做站点壳参考，不进画布 |
| `archive` | 539 | 视频/图片/embed，留来源路径 |
| `reference` | 427 | 运动/动画参考，保留逻辑不整体移植 |
| `skip` | 29 | manifest 已标 unsupported |

`port` 的族分布：ascii 983、pixelfx 244、shader 209、three 93、effect 10（其余为未归族/媒体边界）。这说明“做全”不是 6,675 条逐条复制，而是按**效果族**补：

1. `pixelfx`：先挑 weather；尺寸锁 320×180，进 Stage 要加内部 RT 适配。
2. `shaders`：先挑 1–2 个后处理重写；2.59 MB 单 bundle 不能按组件 tree-shake。
3. `threeui`：补 L1 单 GL 场景；与 nebula/temple 共用单 GL 约束。
4. `ascii`：与 `ascii-field` 合并成一套字符渲染工具。
5. `uiverse/animata/eldoraui/pinui/zelda`：只做 L5 站点壳，不进画布。

## 5. 验证与门

```powershell
npx tsc --noEmit                 # 通过
node tests/preview-build.mjs     # 783/783 通过
node tools/parts/atlas.mjs       # 6,675 行
node shared/product/build-templates.mjs
node shared/product/studio.mjs
```

构建门检查：

- `bytes` 与 HTML 实际长度一致；
- 无 `http(s)://`、`src=`、`href=`、`<link>`、`<img>`、`@import`、`url(`；
- 无 `__PREVIEW_*__` 占位符；
- `hasGl` 与模板是否真装 GL 零件一致；
- `order` 来自 Stage 装配器，不是注册表顺序。

## 6. 已知边界（不要用“做全”绕过）

- **单 GL**：一份 composition 只能有一个 `gl`/`world` 零件；`nebula` 与 `temple` 必须按模板选一个。
- **单 L4**：`pixel-post` 已占 L4；`shaders` 后处理要进模板，必须先决定“替换 pixel-post”，不能并联。
- **媒体不占层**：268 条 media-video、148 条 media-image 只归档，不包成画布零件。
- **UI 不进画布**：uiverse 3,802 条是 UI/CSS；把它们塞进 L2 只会让装配器变重，不会让画面更好。
- **`abyss` 的离屏底图**：Node 假 DOM 没有 `document` 时退回纯色底；真实浏览器才走离屏缓存。
- **`nebula`/`temple` 的 Node 冒烟**：假 canvas 禁止 `addEventListener`，零件按 `E_UNSUPPORTED` 让装配器跳过；真实浏览器正常。
- **截图验收**：本轮不再并发开浏览器；视觉截图只在单实例、用完即关的条件下补。

## 7. 下一步建议（按收益排序）

1. **pixelfx weather 零件**：`snow/rain/fog/god-rays/aurora` 五个里先做 `rain` + `fog`，验证 320×180 内部 RT 适配与 L2 叠加。
2. **shaders 后处理替换实验**：挑一个轻量后处理（不是整包 2.59 MB），与 `pixel-post` 做 A/B；通过体积门后再进模板。
3. **threeui 单 GL 场景**：优先能复用 `nebula` 相机/粒子骨架的条目，不引入新渲染器。
4. **ascii 合并**：把 `ascii-magic/rest/sharks` 的字符映射抽成 `ascii-field` 的 `charset/ramp` 参数，而不是新开三个零件。
5. **L5 站点壳**：从 uiverse/animata 挑 3–5 个控件做模板页头/参数面板，不放进 Stage。

## 8. 清理约定

本轮产生的临时调试脚本只在 `_scratch/`（已 gitignore），交付物不引用。浏览器验收遵守：

- 同一时间最多一个 Edge 实例；
- 用完关闭该实例的进程；
- 任务结束清理测试 profile（`%TEMP%\edge-*`）与 `_scratch/cdp-*.mjs`；
- 不清理用户正常浏览器、不清理仓库 `node_modules`、不清理 `dist` 交付物。
