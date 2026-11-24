# 结构事实表（脚本生成）

> **脚本生成，勿手改**；`npm run docs:status` 重新生成（脚本是 `tools/docs/status.mjs`）。
> 只放结构事实，健康度见评审报告 [`review-2026-11-24/REVIEW-2026-11-24.md`](./review-2026-11-24/REVIEW-2026-11-24.md)。

口径：

- 零件取 `shared/stage/preview/build.mjs` 的 `PART_ENTRY`，层 / 通道 / costMs / kb 是 `loadPartDefs()` 真实 import 到的**申报值**（缺省参数，不走工厂 `opts`；带工厂的零件换参数后 costMs 会变）。
- 预设取同文件的 `PRESETS`；站取 `shared/sites/build.mjs` 的 `STATIONS`；模板取 `shared/product/templates.mjs` 的 `TEMPLATES`。
- 源码行 = 零件入口所在目录下全部 `.ts` / `.js`（不含 `.mjs`）的换行符个数，等于 `wc -l`。
- 孤儿 = 不出现在任何站、预设、模板的 `parts` 里。

合计：登记零件 17 件（其中 16 件在 `shared/parts/`）· 预设 18 个 · 站 4 个 · 模板 5 套。

## 1. Stage 零件（`shared/parts/`，16 件）

| 零件 | 层 | 通道 | costMs（申报） | kb（申报） | 源码行 | README.md | bench.mjs | 使用方 | 孤儿 |
|---|---|---|---|---|---|---|---|---|---|
|`abyss`|`L0`|`canvas2d`|2.1|3|496|有|无|预设 a2-deepsea a2-nebula · 模板 deepsea nebula||
|`ascii-field`|`L2`|`canvas2d`|0.48|3|472|有|有|无|**是**|
|`boids`|`L2`|`canvas2d`|0.7|2|246|有|无|无|**是**|
|`bubbles`|`L2`|`canvas2d`|0.27|2|192|有|有|站 /still · 预设 a2-deepsea bubbles-probe still · 模板 deepsea||
|`dandelion`|`L2`|`canvas2d`|2.2|4|418|有|无|无|**是**|
|`field-ground`|`L0`|`canvas2d`|3.5|7|559|有|有|预设 field field-l0||
|`hug-meadow`|`L1`|`world`|4|16|528|有|无|站 /hug · 预设 hug||
|`koi-pond`|`L1`|`world`|8.5|52|1075|有|无|站 /koi · 预设 koi koi-nolimit · 模板 koi||
|`nebula`|`L1`|`gl`|2.4|4|677|有|无|预设 a2-nebula · 模板 nebula||
|`paper-ink`|`L0`|`canvas2d`|1.3|2|549|有|有|站 /koi /license · 预设 ink koi koi-nolimit room · 模板 koi||
|`pixel-post`|`L4`|`canvas2d`|1.85|2|363|有|有|站 /license /still · 预设 a2-deepsea a2-nebula field ink room still · 模板 deepsea nebula||
|`still-sink`|`L3`|`canvas2d`|0.6|1|76|有|无|站 /still · 预设 a2-deepsea still · 模板 deepsea||
|`sun`|`L3`|`canvas2d`|0.3|1|98|有|无|无|**是**|
|`temple`|`L1`|`gl`|7.5|18|443|有|无|预设 a2-gate a2-temple · 模板 temple gate||
|`tide-medium`|`L0`|`canvas2d`|1.8|3|452|有|有|站 /still · 预设 bubbles-probe still tide-a tide-b tide-c||
|`voxel-world`|`L1`|`gl`|9|0|2633|有|有|站 /still · 预设 still||

孤儿 4 件：`ascii-field` `boids` `dandelion` `sun`。有 README.md 的 16 / 16，有 bench.mjs 的 7 / 16。

## 2. 只登记在 `PART_ENTRY`、不在 `shared/parts/` 的条目（1 件）

| 零件 | 层 | 通道 | costMs（申报） | kb（申报） | 源码行 | README.md | bench.mjs | 使用方 | 孤儿 |
|---|---|---|---|---|---|---|---|---|---|
|`dawn-desk`|`L1`|`world`|1.6|1738|11452|无|无|预设 dawn-desk||

入口：`shared/stage/preview/dawn-desk/index.ts`。

## 3. 预设（`PRESETS`，18 个）

| 预设 | 标题 | 零件 | 含 GL / world 零件 | budgetMs | npm script |
|---|---|---|---|---|---|
| `a2-deepsea` | A2 deepsea · 深海光柱（abyss 零件栈） | `abyss`（带 opts） `bubbles` `still-sink` `pixel-post`（带 opts） | 否 | 10 | `preview:a2-deepsea` |
| `a2-gate` | A2 gate · 独立山门（同一零件库重装） | `temple`（带 opts） | 是 | 12 | 无 |
| `a2-nebula` | A2 nebula · 四旋臂星系（nebula 零件栈） | `abyss`（带 opts） `nebula`（带 opts） `pixel-post`（带 opts） | 是 | 12 | `preview:a2-nebula` |
| `a2-temple` | A2 temple · 晨光山门（写实模块装配） | `temple`（带 opts） | 是 | 14 | `preview:a2-temple` |
| `bubbles-probe` | probe · bubbles（screen 混合实测） | `tide-medium`（带 opts） `bubbles` | 否 | 8 | 无 |
| `dawn-desk` | dawn-desk · 只装 desk 一组的纸面探针 | `dawn-desk` | 是 | 20 | `preview:dawn-desk` |
| `empty` | 空场景 · 最小可跑基线 |  | 否 | 8 | `preview:empty` |
| `field` | field · 黄昏草甸 | `field-ground` `pixel-post`（带 opts） | 否 | 8 | `preview` `preview:field` |
| `field-l0` | field · 仅 L0（画面门用） | `field-ground` | 否 | 8 | `preview:field-l0` |
| `hug` | hug · 风的来信（三维蒲公英草甸） | `hug-meadow` | 是 | 9 | `preview:hug` |
| `ink` | ink · 纸 + 后处理（/koi-pond 的栈，宣纸墨点） | `paper-ink` `pixel-post`（带 opts） | 否 | 8 | `preview:ink` |
| `koi` | koi · 纸 + 完整锦鲤池（/koi 的栈） | `paper-ink` `koi-pond` | 是 | 12 | 无 |
| `koi-nolimit` | koi · 锦鲤池不限预算（判形态用，非出厂） | `paper-ink` `koi-pond` | 是 | 100 | 无 |
| `room` | room · 纸 + 后处理（/license 的栈） | `paper-ink` `pixel-post`（带 opts） | 否 | 8 | `preview:room` |
| `still` | still · 体素海洋（完整栈，形态探针） | `tide-medium` `voxel-world` `bubbles` `still-sink` `pixel-post`（带 opts） | 是 | 14 | 无 |
| `tide-a` | tide A · 沉（深蓝 / 圆斑 / 雾上浓下淡） | `tide-medium`（带 opts） | 否 | 8 | 无 |
| `tide-b` | tide B · 透（青绿 / 光丝 / 雾均匀） | `tide-medium`（带 opts） | 否 | 8 | 无 |
| `tide-c` | tide C · 减法对照（近灰 / 无焦散 / 四周浓） | `tide-medium`（带 opts） | 否 | 8 | 无 |

有对应 npm script 的预设 10 个，没有的 8 个：`a2-gate` `bubbles-probe` `koi` `koi-nolimit` `still` `tide-a` `tide-b` `tide-c`（没有专用 script，直接跑 `node shared/stage/preview/build.mjs --preset <名字>`；`npm run preview` 固定是 field，追加 `--preset` 不生效）。

## 4. 站点（`STATIONS`，4 个）

| 站 | 名称 | biome | budgetMs | 零件 | 站内模块 | 状态 |
|---|---|---|---|---|---|---|
|`/hug`|Hug|`field`|9|`hug-meadow`|`sites/hug/attach.ts`|已登记；产物 `dist/hug/index.html`；零件 id 序列相同的预设：`hug`|
|`/koi`|Koi Pond|`ink`|12|`paper-ink` `koi-pond`|`sites/koi/attach.ts`|已登记；产物 `dist/koi/index.html`；零件 id 序列相同的预设：`koi` `koi-nolimit`|
|`/license`|License|`room`|8|`paper-ink` `pixel-post`（带 opts）|`sites/license/index.ts`|已登记；产物 `dist/license/index.html`；零件 id 序列相同的预设：`ink` `room`|
|`/still`|Still|`tide`|12|`tide-medium` `voxel-world` `bubbles` `still-sink` `pixel-post`（带 opts）|`sites/still/attach.ts`|已登记；产物 `dist/still/index.html`；零件 id 序列相同的预设：`still`|

## 5. 模板（`TEMPLATES`，5 套）

| 模板 | 名称 | preset | 零件（取自 preset） | 状态 |
|---|---|---|---|---|
|`deepsea`|深海信标|`a2-deepsea`|`abyss` `bubbles` `still-sink` `pixel-post`|`ready`（注册表声明值，产物 `dist/templates/deepsea/index.html`）|
|`nebula`|星海旋臂|`a2-nebula`|`abyss` `nebula` `pixel-post`|`ready`（注册表声明值，产物 `dist/templates/nebula/index.html`）|
|`temple`|晨光山门与主殿|`a2-temple`|`temple`|`ready`（注册表声明值，产物 `dist/templates/temple/index.html`）|
|`gate`|独立山门|`a2-gate`|`temple`|`ready`（注册表声明值，产物 `dist/templates/gate/index.html`）|
|`koi`|锦鲤池|`koi`|`paper-ink` `koi-pond`|`ready`（注册表声明值，产物 `dist/templates/koi/index.html`）|

Studio（`npm run build:studio` → `dist/studio/index.html`）读的是 `dist/templates/manifest.json`，自身不登记零件。

## 6. npm script 事实（读 `package.json`）

- 仍指向 v1 构建器 `shared/build/build.mjs` 的 script（5 个）：`build` `build:all` `build:nexus` `build:readable` `dev`。产物写 `dist/<id>.html`，与新体系不兼容。
- 依赖 `tests/lib/browser.mjs` 的 script（11 个）：`bench:blend` `bench:gl` `bench:parts` `shot` `verify:dom` `verify:field` `verify:fingerprint` `verify:input` `verify:license` `verify:paper` `verify:site`。`browser.mjs` 只认 macOS 的 playwright 缓存路径，其它机器上跑不了；`verify:field` 拿不到浏览器时打印 SKIP 并以 0 退出。
- `verify:stage` 会由 `tests/stage-mutation.mjs` 原地改写 `shared/stage/stage.ts` 后还原；有人并发施工时不要跑。

---

健康度与路线依据：[`review-2026-11-24/REVIEW-2026-11-24.md`](./review-2026-11-24/REVIEW-2026-11-24.md) · 权威链：[`README.md`](./README.md)

