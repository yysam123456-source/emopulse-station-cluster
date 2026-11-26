# INVENTORY · 拆解进度只读盘点（2026-11-24）

> 取证基线：`HEAD = origin/main = 1fce19c`（2026-11-24 10:27）；取证期间 `git status --short` 只有 `?? docs/review-2026-11-24/`，已跟踪文件零改动。
> **本文是取证当时的快照。** 同日下午的文档整理已按本文做了回改（评审提交 b759bb7 之后的提交）：被取代的 `docs/THIRD-PARTY-REVIEW-2026-11-20.md`、`docs/THIRD-PARTY-REVIEW-2026-11-21.md`、`docs/DAWN-DESK-PREVIEW-2026-11-20.md` 已删除（可在 `git show b759bb7:<路径>` 查到）。文中引用的行号、断言数、模板数都是**那一刻**的快照，§6 矛盾清单里各文档的现文以仓库当前内容为准。
> 方法：只读（读文件 / grep / wc / find / cmp / 只读 `import` 两张注册表）。**没有**运行 build、preview、`npm run build:*`，也**没有**运行任何 test / verify 脚本——凡标「未实跑」的数字都是静态计数，不是测试结果。
> 证据等级：【实测】= 命令输出原文；【推断】= 由实测做算术或逻辑延伸；【不知道】= 没查到或只读无法证明。

---

## 1. 一句话结论

- 20 个来源项目里，**6 个**拆出了 Stage 零件或内部模块（体素引擎、koi、hug 原站、room-at-dawn、dandelion 算法、Portal），另 7 个只到「原件整件入库对照、零拆解」，7 个零落点。共 **16 个 Stage 零件**（`shared/parts/` 目录；另有 `dawn-desk` 在 `shared/stage/preview/` 但登记在 `PART_ENTRY` 里）、**28 个内部模块**（temple 7 + abyss 5 + nebula 4 + koi-pond 3 + room-at-dawn 9）。
- 16 个零件里 **4 个是孤儿**：`ascii-field` / `dandelion` / `boids` / `sun` 不在任何站、模板、preset 里；room-at-dawn 的 9 个 `WorldFeature` 连测试都不引用，唯一的装配入口在 gitignore 的 `_scratch/`。
- 最大的没拆的三块：① Portal 6,675 条里 1,529 条 port 候选，只落了 abyss / nebula / boids 三件（外加 pixel-post 借概念），ascii 983 / pixelfx 244 / shaders 209 / threeui 93 基本没动；② rainy-night-webgpu（25 模块 / 10 视觉 feature）与 crimson-loong（18 脚本 / 9 视觉件）拆解数为 0；③ koi 的 water / caustics / paint / ink / grade 渲染链仍是整体 pass，micro-scenes 6 个场景、grand-atelier 击弦机也是 0。

---

## 2. 总表

| 来源项目 | 源头位置（入库?） | 源头规模（计数 + 口径） | 已拆 Stage 零件 | 已拆内部模块 | 没拆的 | 是否被站/模板使用 |
|---|---|---|---|---|---|---|
| 体素引擎 abyssal-garden（/still） | `shared/core/src/`（入库，冻结）；`shared/parts/voxel-world/engine.js` | 6 个 src 文件 2,320 行【实测 `wc -l`】 | `voxel-world` | 无（整引擎包成一件 + 20 条具名补丁） | 引擎内部各系统未模块化 | 是：站 `/still`、preset `still` |
| koi（zz85/random-sketches） | `shared/parts-library/koi/`（入库） | 上游 26 项：10 个渲染 JS + sw.js + index.html 等；目录共 28 文件【实测 `ls`】 | `koi-pond` | FishSchool / SurfaceEcology / CameraRig | water / caustic / paint / ink / grade 渲染链（`pond.js` `paint.js` `ink.js` 整体调用）；`main.js` `smoke.js` `cdp.js` `sw.js` 未接 | 是：站 `/koi`、preset `koi` `koi-nolimit`、模板 `koi` |
| hug 原站（darmk DandelionMeadow） | 无原件入库；`shared/parts/hug-meadow/index.ts:3` 记参考站 URL | 原站体量【不知道】（无源码可数） | `hug-meadow` | 无（单件 L1 world，528 行） | 整件未拆 | 是：站 `/hug`、preset `hug` |
| dandelion 算法（公众号文章） | `shared/parts-library/dandelion/`（入库；`EXCERPT.md` 为文章代码摘录，无仓库） | 库 4 文件；`core/meadow.ts` 551 行 | `dandelion`（零件不 import 库内核，自含 418 行） | 无 | — | **否**：无站 / 模板 / preset；仅 v1 测试（golden-run 等）引用库内核 |
| blow-input 算法（同一篇公众号文章） | `shared/parts-library/blow-input/`（入库；`EXCERPT.md`） | 库 4 文件；`core/detector.ts` 276 行 | 无（`shared/parts/blow-input/` 不存在） | 无 | 吹气检测 → 释放这条链没进 v2 产物 | 仅 v1 `sites/hug/parts/blow-input.ts:18` import |
| room-at-dawn | `shared/parts-library/room-at-dawn/upstream/src/`（入库 24 文件）+ `_third_party/2026-11-24/room-at-dawn`（本机 78 文件，含 .git 30 个）；另有 `shared/stage/preview/dawn-desk/` | 24 个 src 文件；`scene/parts/*.js` 7 个 | 无 PartV2（`index.ts:31` 恒抛 `E_PART_NOT_MOUNTED`）；探针 `dawn-desk`（非正式零件） | 9 个 WorldFeature：room-shell / sky / exterior / fixtures / bed / desk / plants / clutter / decor | render/pipeline、film、bake、game、main 未做成 feature（文档判定属宿主/工具） | **否**：`WorldFeatureHost` / `createRoomFeatureSet` 在已跟踪代码里零 importer；`dawn-desk` 仅 preset `dawn-desk` |
| grand-atelier | `shared/parts-library/grand-atelier/`（入库） | 3 个原件 TS：piano-action 313 / piano-model 1014 / piano-materials 55 行；缺 4 个模块（`part.manifest.ts:27-33`） | 无 | 无（v1 壳只是击弦时序占位） | 整个击弦机 3D 未拆 | 否 |
| crimson-loong | `shared/parts-library/crimson-loong/`（入库 3 个上游 JS，逐字节同上游【实测 cmp】）；`_third_party/…/crimson-loong`（本机 44 文件） | 18 个 src 脚本 10,871 行【实测 `wc -l`】 | 无 | 无（文档列了 9 个视觉 feature，代码 0） | sky / karst / arch / flora / dragon+wake / water / fx / air / post 全部未拆 | 否 |
| rainy-night-webgpu（库目录名 rain-webgpu） | `shared/parts-library/rain-webgpu/`（入库 4 个上游 TS，逐字节同上游【实测 cmp】）；`_third_party/…`（本机 113 文件） | `src/lib/rainy-night/` 25 个 TS | 无（v1 壳恒抛 `E_PART_NOT_MOUNTED`） | 无 | rainfield / wet-road / puddle-reflect / canal-water / night-sky / horizon-fill / night-ambient / lightning / lantern / city-emissive 全部未拆 | 否 |
| saltline-fable-5.2 | 仅 `_third_party/…/saltline-fable-5.2`（本机 2 文件，未入库） | 1 个 HTML（文档称 1,423,569 B） | 无 | 无 | 文档判定 0 个可维护子件 | 否 |
| micro-scenes（gpt6-Astra_3.js） | `shared/parts-library/micro-scenes/`（入库 6 个 HTML） | 6 个自包含 HTML，每个约 5.6 万行【实测 `wc -l`，二进制式长行】 | 无（v1 壳恒抛 `E_PART_NOT_MOUNTED`） | 无 | 6 个场景全部未拆 | 否 |
| sylva | `shared/parts-library/sylva/`（入库 2 个 HTML） | index.html 3,449 行 + liquid-metal-explore.html 950 行 | 无（v1 壳恒抛） | 无 | 液态金属 / 拨纸层未拆 | 否（/praise 冻结） |
| ascii-magic kit | `shared/parts-library/ascii-kit/`（入库） | `lib/kit.js` 220 行 | `ascii-field`（自建，零件只 import `stage/contract` 与 `stage/world`【实测 index.ts:28-29】） | 无 | Portal 侧 ascii-magic 734 / ascii-rest 240 / ascii-sharks 条目未逐件拆 | **否**：`ascii-field` 不在任何 preset |
| prism-pack（抖音视频 PRISM） | `shared/stage/preview/prism-pack/`（入库 2 文件） | index.html 1,795 行 | 无（不在 `PART_ENTRY`） | 无 | 整个撕卡包交互未拆 | 否 |
| Portal（flaxb / frontend-design-portal） | 仓库外 `C:\Users\Lenovo\DoubaoWork\chats\2026-11-23\new-chat\_source\portal-full\frontend-design-portal-3d7c…`（本机存在【实测】，无 `.git`）；盘点结果入库 `docs/PART-ATLAS.csv` | 15 个子项目 6,675 条 manifest 记录；A2 showcase 清单 103 条（local 27 + fable 76）【实测复算】 | `abyss`（← AbyssalDescent.tsx）、`nebula`（← NebulaGalaxyShowcase.tsx）、`temple`（← kage + fable-030，重画）、`boids`（← animata，零件自述自写）、`bubbles`（← AbyssalDescent 第二个 effect）、`pixel-post`（← pixelfx 借概念） | abyss 5 层、nebula 4 模块、temple 7 模块 | port 候选 1,529 条中：ascii 983、pixelfx 244、shaders 209、threeui 93 除 kage 参考外未拆 | abyss / nebula / temple / bubbles / pixel-post 是；ascii-field / boids 否 |
| Claude-Fable-5.2-HTML-Files | 未入库（`_third_party/` 只有 `2026-11-24/`；A2 清单里 76 条 fable 只存远端 URL） | 文档称 76 个自包含 HTML【未实测】 | 无 | 无 | 只「借做法」进了 dawn-desk 的 `studio.ts` | 否 |
| qingming-riverside | 未入库 | 文档称代码约 14,349 行【未实测】 | 无 | 无 | 水面 / 大气 / 夜景灯 / 桥 / 水车 / 漫游全部未拆 | 否 |
| awesome-claude-opus-5.5（tidewater / summer-cycle / neon-pixel-city） | 未入库 | 文档称 1,034 条案例索引【未实测】 | 无 | 无 | 只「借做法」（叶簇图集、时段调色、局部光）进 `studio.ts` | 否 |
| license（站，非独立上游） | `sites/license/`、`shared/sites/build.mjs:33-94` | — | 站内装 `paper-ink` + `pixel-post`（均自建） | 无 | v1 的 4 个 `create*Part`（`sites/license/parts/index.ts`）未迁 PartV2 | 是（站 `/license`） |
| praise（站，非独立上游） | `sites/praise/`（入库） | v1 代码 399 行（HANDOFF:432） | 无 | 无 | 4 个 v1 `create*Part` 未迁；不在 `STATIONS` | 否（冻结） |

---

## 3. Stage 零件反查表（`shared/parts/` 16 个目录）

| id | 来源 | layer | channel | 代码行数（不含 bench） | 使用方 | 是否孤儿 |
|---|---|---|---|---|---|---|
| `abyss` | Portal `AbyssalDescent.tsx`（程序化重写） | L0 | canvas2d | 496 | preset `a2-deepsea` `a2-nebula`；模板 `deepsea` `nebula` | 否 |
| `ascii-field` | ascii-magic piece 契约，自建 | L2 | canvas2d | 472 | 无 | **是** |
| `boids` | 自写（README:3；HANDOFF:386 记源 animata） | L2 | canvas2d | 246 | 无 | **是** |
| `bubbles` | Portal `AbyssalDescent.tsx` 第二个 effect | L2 | canvas2d | 192 | 站 `/still`；preset `still` `bubbles-probe` `a2-deepsea`；模板 `deepsea` | 否 |
| `dandelion` | 公众号文章算法 + v1 `sites/hug/parts/dandelion.ts` | L2 | canvas2d | 418 | 无 | **是** |
| `field-ground` | 自写（README:5） | L0 | canvas2d | 559 | preset `field` `field-l0` | 否（仅 preset，无站/模板） |
| `hug-meadow` | hug 原站（darmk dandelion-meadow）完整移植 | L1 | world | 528 | 站 `/hug`；preset `hug` | 否 |
| `koi-pond` | zz85/random-sketches 完整移植 | L1 | world | 1,075 | 站 `/koi`；preset `koi` `koi-nolimit`；模板 `koi` | 否 |
| `nebula` | Portal `NebulaGalaxyShowcase.tsx` | L1 | gl | 677 | preset `a2-nebula`；模板 `nebula` | 否 |
| `paper-ink` | 自写（README:5） | L0 | canvas2d | 549 | 站 `/license` `/koi`；preset `koi` `koi-nolimit` `room` `ink`；模板 `koi` | 否 |
| `pixel-post` | 自建，借 pixelfx `core/fx.js` 概念（BIOME-ASSET-MAP） | L4 | canvas2d | 363 | 站 `/license` `/still`；preset 6 个；模板 `deepsea` `nebula` | 否 |
| `still-sink` | 自写（README:3） | L3 | canvas2d | 76 | 站 `/still`；preset `still` `a2-deepsea`；模板 `deepsea` | 否 |
| `sun` | 自写（README:3） | L3 | canvas2d | 98 | 无 | **是** |
| `temple` | Portal kage + fable-030 参考，重画 | L1 | gl | 443（另依赖 `shared/realism/` 3,217 行） | preset `a2-temple` `a2-gate`；模板 `temple` `gate` | 否 |
| `tide-medium` | 自写 | L0 | canvas2d | 452 | 站 `/still`；preset `still` `tide-a/b/c` `bubbles-probe` | 否（无模板） |
| `voxel-world` | `shared/core/`（abyssal-garden @ a596354） | L1 | gl | 309（另 `engine.js` 2,324 行） | 站 `/still`；preset `still` | 否 |

补充【实测】：
- 声明行号：`abyss/index.ts:46-52`、`ascii-field/index.ts:449-456`、`boids/index.ts:235-241`、`bubbles/index.ts:179-185`、`dandelion/index.ts:407-413`、`field-ground/index.ts:548-554`、`hug-meadow/index.ts:515-521`、`koi-pond/index.ts:846-853`、`nebula/index.ts:42-48`、`paper-ink/index.ts:534-540`、`pixel-post/index.ts:348-354`、`still-sink/index.ts:65-71`、`sun/index.ts:87-93`、`temple/index.ts:425-431`、`tide-medium/index.ts:433-439`、`voxel-world/index.ts:111-124`。
- `shared/parts/world-feature.ts`（223 行）**不是 PartV2**：没有 layer / channel，文件头 `:1-6` 自述「不接入 parts registry」。
- `PART_ENTRY` 共 17 项，多出的第 17 项是 `dawn-desk`（`shared/stage/preview/build.mjs:60` → `shared/stage/preview/dawn-desk/index.ts`，L1 / world / costMs 1.6 / kb 1738，`index.ts:1315-1321`），只被 preset `dawn-desk` 使用。

---

## 4. 逐项明细（每个来源一小节）

### 4.1 体素引擎（/still）
- 源头：`shared/core/src/` 6 文件 2,320 行，入库且冻结（`BASELINE.sha256`）。`voxel-world/README.md:5`：6 文件按原 `build.mjs` 顺序拼成 `engine.js`（2,324 行）+ `build-engine.mjs` 施加 20 条具名补丁。
- 拆出：1 个 Stage 零件 `voxel-world`（L1 / gl / costMs 9 / kb 0）。内部未模块化。
- 使用：`shared/sites/build.mjs:123`（/still）、`shared/stage/preview/build.mjs:120`（preset still）。
- 没拆：引擎内部各系统（画质档、着色器、世界生成、音频）未拆成独立单元。

### 4.2 koi（zz85/random-sketches）
- 源头：`shared/parts-library/koi/` 共 28 文件 = 上游 26 项 + `index.ts` + `part.manifest.ts`【实测 `ls | wc -l`】。
- 拆出：Stage 零件 `koi-pond`（L1 / world / costMs 8.5 / kb 52），内部 3 模块——`FishSchool`（`modules/fish-school.ts`，71 行）、`SurfaceEcology`（`modules/surface-ecology.ts`，43 行）、`CameraRig`（`modules/camera-rig.ts`，94 行），实例化于 `index.ts:249` `:257` `:319`。零件 import 库里 7 个上游 JS：`glsl.js` `pond.js` `surface.js` `paint.js` `ink.js` `audio.js` `koi.js`【实测 grep】。
- 没拆：`INTERNAL-SCENE-PARTS.md:13`、`:48-50` 自述 water / caustics / paint / ink / grade 仍是共享 `comp` uniform 与多个 RT 的整体 pass；`main.js` `smoke.js` `cdp.js` `sw.js` 未被 import。
- 使用：站 `/koi`（`shared/sites/build.mjs:141-144`）、preset `koi` `koi-nolimit`、模板 `koi`（`templates.mjs:73-88`）。

### 4.3 hug 原站 + dandelion / blow-input
- `hug-meadow`（L1 / world / 528 行）参考站 URL 在 `index.ts:3`，仓库里没有原站源码，源头规模【不知道】。
- `shared/parts/dandelion`（L2，418 行）不 import `parts-library/dandelion/core/meadow.ts`，只 import `stage/contract` 与 `stage/world`（`index.ts:39-40`）；`index.ts:3-4` 自述来源是 v1 渲染层 + 库内核。
- blow-input：`shared/parts/blow-input/` 不存在；库内核 `core/detector.ts` 的唯一生产 importer 是 v1 的 `sites/hug/parts/blow-input.ts:18`。
- /hug 站只装 `hug-meadow`（`shared/sites/build.mjs:110`），`dandelion` / `boids` / `sun` 已从站点栈摘掉。

### 4.4 room-at-dawn / dawn-desk
- 源头：库里 `upstream/src` 24 文件，与本机 `_third_party/2026-11-24/room-at-dawn` 对应文件逐字节一致【实测 cmp，24/24 IDENTICAL】；本机目录 78 文件中 30 个是 `.git`，非 .git 文件 48 个，与 `THIRD-PARTY-FILE-INVENTORY` 的 48 行一致。
- 拆出：9 个 WorldFeature（`features.ts:57-65` 7 个 part + `:78-96` room-shell / sky）；契约 `world-feature.ts:92` `WorldFeatureHost`。
- 使用【实测 grep】：`WorldFeatureHost` 与 `createRoomFeatureSet` 在 `shared/` `sites/` `tests/` `tools/` 里零 importer；唯一调用方是 `_scratch/room-feature-smoke.ts:4-5`（`_scratch/` 在 `.gitignore`）。
- 同一上游有两份内容不同的副本：`shared/stage/preview/dawn-desk/upstream/`（13 文件）与 `parts-library/room-at-dawn/upstream/src/` 对应文件 `cmp` 全部 DIFF【实测】；且 `dawn-desk/index.ts` `studio.ts` 不 import 自己那份副本（grep 零命中）。

### 4.5 grand-atelier / crimson-loong / rainy-night-webgpu / saltline / micro-scenes / sylva
- 四者 + micro-scenes / sylva 的共同点：库目录里是**原件整件复制 + 一个 v1 壳**，没有拆出任何模块。
- crimson-loong：库里 3 个上游 JS（`00_util.js` `15_tex.js` `60_dragon.js`）与 `_third_party` 逐字节一致；`index.ts:38-69` 是一个三阶段时间轴状态机，不建几何。
- rain-webgpu：库里 `engine.ts` `rain.ts` `height-map.ts` `post.ts` 4 个与上游逐字节一致；`index.ts:26-28` 恒抛。`engine.ts:21-38` 的 18 个相对 import 在库内不存在。
- grand-atelier：`index.ts:32-60` 返回击弦时序占位，不 import 原件。
- 规模：crimson 上游 18 个 JS 10,871 行；rain 上游 25 个 TS；micro-scenes 6 个 HTML。

### 4.6 ascii-magic / Portal
- `ascii-kit`（库内 `lib/kit.js` 220 行）是唯一 D4 件，整件入库未拆。
- `ascii-field` 零件自带「内置水波纹样例」（`index.ts:238-239`、`README.md:39`），上游 piece 到位后替换。
- Portal 本机路径存在；`preview-manifest.ts` 43,806 行，解析出 6,675 条记录，id 集合与 `docs/PART-ATLAS.csv` 完全一致（差集双向为 0）【实测只读解析】。该目录无 `.git`，目录名里的 commit 哈希无法核对。
- 落地的 Portal 来源零件：`abyss`（5 层：background / rays / caustics / motes / ripples，`abyss/scene.ts:56-61`）、`nebula`（starfield / halo / arms / core，`nebula/scene.ts:76-80`）、`temple`（atmosphere / ridge / ground / shrine-hall / torii / stone-lanterns / pine-grove，`shared/realism/scene.ts:13-20`）、`bubbles`、`boids`。
- `temple` 的贴图来自 `shared/realism/assets.ts`（5,021,017 B 的 base64 JPEG），文件头 `:1-2` 写「由 AI 生成…seedream 5.5」，不是上游项目资产。

### 4.7 模板与站（装配现状）
- `PRESETS` 18 个、`PART_ENTRY` 17 项、`STATIONS` 4 站、`TEMPLATES` 5 个【实测只读 import】。
- 站栈：/license `paper-ink + pixel-post`（8ms）；/hug `hug-meadow`（9ms）；/still `tide-medium + voxel-world + bubbles + still-sink + pixel-post`（12ms）；/koi `paper-ink + koi-pond`（12ms）（`shared/sites/build.mjs:76-144`）。
- 模板：deepsea → a2-deepsea；nebula → a2-nebula；temple → a2-temple；gate → a2-gate；koi → koi（`templates.mjs`）。

---

## 5. 孤儿零件

| 类型 | 对象 | 证据 |
|---|---|---|
| Stage 零件，无站 / 模板 / preset | `ascii-field` | `PRESETS` 内 `'ascii-field'` 出现 0 次【实测】 |
| 同上 | `dandelion` | 0 次；仅 tests/lib/part-adapters、golden-run 等 v1 测试引用库内核 |
| 同上 | `boids` | 0 次；无测试按 id 点名 |
| 同上 | `sun` | 0 次；无测试按 id 点名 |
| 内部件，无任何已跟踪装配入口 | room-at-dawn 9 个 WorldFeature + `WorldFeatureHost` | 唯一 importer 在 `_scratch/room-feature-smoke.ts:4-5` |
| 预览件，未登记 | `shared/stage/preview/prism-pack/index.html` | 不在 `PART_ENTRY`，无 preset |
| 库存件，无生产调用 | `rain-webgpu` `micro-scenes` `sylva` `room-at-dawn` 的 v1 壳 | `createPart` 恒抛 `E_PART_NOT_MOUNTED` |
| 死副本 | `shared/stage/preview/dawn-desk/upstream/`（13 文件） | 无 importer，且与库内另一份上游副本内容不同 |

半孤儿（只在 preset、没有任何站或模板）：`field-ground`（field / field-l0）、`tide-medium`（still 以外只在 tide-a/b/c 与 bubbles-probe）、`dawn-desk`。

---

## 6. 文档与代码矛盾

> **历史快照（2026-11-24）**。27 条的逐条处置与现行口径见 [`../../CONTRADICTIONS-RESOLVED-2026-11-26.md`](../../CONTRADICTIONS-RESOLVED-2026-11-26.md)；本表保留原始证据，不再直接据此施工。

| # | 文档 A 位置 + 原文 | 文档 / 代码 B 位置 + 原文 | 以代码为准的结论 |
|---|---|---|---|
| 1 | `docs/INTERNAL-SCENE-PARTS.md:87`「`rainy-night-webgpu` / `crimson-loong` 只完成边界与许可审计，未搬进可分发库」 | `git ls-files shared/parts-library` 列出 `rain-webgpu/` 6 文件、`crimson-loong/` 5 文件；`cmp` 证实其中 4 个 .ts / 3 个 .js 与 `_third_party` 逐字节一致 | **已搬**，且是 11-17 首个提交 `30847cb` 就入库的（`git log --diff-filter=A`）。搬的是上游原件的子集（rain 4/25、crimson 3/18），加一个 v1 壳。manifest 自己的写法更准：「库内仍只保留 N 文件做对照」（`rain-webgpu/part.manifest.ts:15`、`crimson-loong/part.manifest.ts:3`） |
| 2 | `docs/THIRD-PARTY-CODE-AUDIT-2026-11-24.md:148`「本轮没有把 rain 模块复制进 `shared/parts-library`」；`:188`「没有把 18 个脚本硬塞进 `shared/parts`」 | 同 #1；`:148` 的主语是「本轮」，但读者会理解成库里没有 | 库里有 4 + 3 个原件文件；「本轮没新增」成立，「库里没有」不成立 |
| 3 | 根 `README.md:12`「零件 🟡 2 / 6」；`:13`「四座样板站 ❌ 0 / 4」；`:48`「field-ground ✅ / voxel-world ✅ / 其余待补」 | `ls shared/parts` 16 个目录；`STATIONS` 4 站（`shared/sites/build.mjs:32-146`）；`HANDOFF.md:13` 写「10 个正式零件已注册」 | README 严重过期：16 ≠ 2 ≠ 10；四站已全部注册 |
| 4 | 根 `README.md:11` `:29`「verify:stage 28 断言」 | `tests/stage-smoke.mjs` 中 `check(` 调用点 44 处（45 个 token 含 1 处定义）【实测 grep】；`HANDOFF.md:288` 写「44/44」 | 静态调用点是 44，不是 28。实跑数字未核（没跑测试） |
| 5 | `docs/REALISM-PARTS-CATALOG.md:58-60` deepsea / nebula / koi「否（内部未拆）」；`:63`、`:90` 同义 | `docs/INTERNAL-SCENE-PARTS.md:11-13` 写已拆；代码：`abyss/scene.ts:56-61`（5 层）、`nebula/scene.ts:76-80`（4 模块）、`koi-pond/index.ts:249,257,319`（3 模块） | **INTERNAL-SCENE-PARTS 对**。REALISM-PARTS-CATALOG §4 是 11-23 的旧状态，未回改；koi 的渲染链部分它说对了一半（pass 未拆） |
| 6 | `docs/PART-ATLAS.md:3` 输入路径 `../../../DoubaoWork/chats/2026-11-23/.../preview-manifest.ts` | 本机 `C:\Users\Lenovo\DoubaoWork\chats\2026-11-23\new-chat\_source\portal-full\frontend-design-portal-3d7c…\src\generated\preview-manifest.ts` 存在，1,214,870 B【实测】；`tools/parts/atlas.mjs:21-33` 的 `DEFAULT_PORTAL` 解析到同一路径 | 路径**存在**，且在本机可解析。输入侧 6,675 条、id 集合与 CSV 一致。`atlas.mjs` 会写 `docs/PART-ATLAS.csv` `.md`（`:46-47`），**我没有运行**，输出是否逐字节可复现【不知道】。Portal 目录无 `.git`，哈希 `3d7c139…` 无法核对 |
| 7 | `package.json` preview 脚本 | `PRESETS` 18 个【实测】 | 实测覆盖 **10 个**（empty / field / field-l0 / hug / room / dawn-desk / ink / a2-deepsea / a2-nebula / a2-temple），缺 **8 个**：still、tide-a、tide-b、tide-c、bubbles-probe、koi、koi-nolimit、a2-gate。主理人给的「9 / 18、缺 6」差在漏算 `preview:field-l0`。`koi` preset 只能经 `build:templates` 间接产出 |
| 8 | `docs/DECISIONS.md:181`「/koi：`paper-ink` + `koi-pond` + `pixel-post`，9ms」 | `shared/sites/build.mjs:138-144`：parts `['paper-ink','koi-pond']`，`budgetMs: 12`；`DECISIONS.md:103` 自己写「不再叠 pixel-post」 | DECISIONS 的「当前零件栈」表过期；代码与 ADR-07 正文对 |
| 9 | `docs/HANDOFF.md:396`「/hug 栈 `field-ground + dandelion + boids + sun + pixel-post`」；`:398`「/koi-pond 栈 `paper-ink + koi-pond + pixel-post`」 | `shared/sites/build.mjs:110` `:141-144` | 两行都是旧栈 |
| 10 | `docs/HANDOFF.md:14`「`stage.setAudio` → `dandelion` 风强」；`DECISIONS.md:170`「旧 dandelion 源码仍被 preview / golden-run 引用」 | `PRESETS` 里 `'dandelion'` 0 次 | /hug 不再装 `dandelion`；preview 不引用，只有测试引用 |
| 11 | `docs/DECISIONS.md:152`（ADR-11）「grand-atelier…`index.ts` 恒抛 `E_PART_NOT_MOUNTED`」 | `shared/parts-library/grand-atelier/index.ts:32-60` 正常返回实例 | ADR-11 这句与代码不符。同段「room-at-dawn（7.3KB 单文件）」也已过期（现 24 个 src + 9 个 WorldFeature） |
| 12 | `shared/parts-library/README.md:16`「koi…共 13 文件」；`registry/README.md:49`「共 13 文件」；`sites/koi/shared/koi.ts:2`「13 文件 166 KB」；`koi/part.manifest.ts:17`「depth D1…三站为自写 Canvas 2D」 | 目录 28 文件（上游 26 项）；`koi-pond/index.ts:1`「完整移植」；`DECISIONS.md:93`「26 项」 | 三处「13 文件」与 manifest 的 D1 定级都是 ADR-07 之前的旧状态 |
| 13 | `shared/parts-library/README.md:8`「索引表（11 类零件）」，表内列 `paper-plane/`、`verdant-forest/`，无 `ascii-kit` | `ls shared/parts-library`：零件目录 9 个（含 `ascii-kit`），无 `paper-plane` `verdant-forest` | 索引表与磁盘不对应 |
| 14 | `shared/parts-library/registry/README.md:47-53` 已登记表 origin 全写 `copy` | `crimson-loong/part.manifest.ts:10`、`grand-atelier/part.manifest.ts:9` 等写 `origin: 'equivalent'` | manifest 为准 |
| 15 | `shared/sites/build.mjs:4`「preview 是零件探针（14 个预设）」；`shared/stage/preview/build.mjs:25`「14 个预设 = 556 条」 | `PRESETS` 18 个 | 注释过期 |
| 16 | `docs/A2-PARTS-AND-TEMPLATES.md:17`「4 个模板」；`:65`「temple：abyss + temple + pixel-post」 | `templates.mjs` 5 个；`:47` temple `parts: ['temple']`；`PRESETS['a2-temple'].parts` 只有 temple | 文件头 `:3-5` 已自认 §2.3 / §3 过期，属已标注的旧记录 |
| 17 | `docs/A2-PARTS-AND-TEMPLATES.md:116`「`port` 的族分布：ascii 983、pixelfx 244、shader 209、three 93、effect 10」 | CSV 复算：port 共 1,529 = 983 + 244 + 209 + 93；family `effect` 的 10 条不在 port 里（加起来 1,539 ≠ 1,529） | `effect 10` 不属于 port |
| 18 | `docs/BIOME-ASSET-MAP.md:13`「ASCII 那 984 件」；`tools/parts/atlas.mjs:5`「ascii 974」 | `docs/PART-ATLAS.csv` family=ascii **983**【实测】；`PART-ATLAS.md:60` 也是 983 | 三个数字里 983 可由 CSV 复算 |
| 19 | `docs/REALISM-PARTS-CATALOG.md:67-69`「`ROOF_JPG` **真实**板瓦照片」「`GRASS_JPG` **正俯拍**苔庭…」「`SKY2_JPG` 2:1 晨空全景」 | `shared/realism/assets.ts:1-2`「由 AI 生成并压缩到 1024 JPEG 的写实表面贴图。生成来源：seedream 5.5」 | 代码注释说是 AI 生成，文档说是照片。图片实际来源只读无法判定【不知道】，但两份说法互斥 |
| 20 | `shared/parts/boids/README.md:3`「本站自写…没有从上游仓库搬运具体代码」 | `docs/HANDOFF.md:386`、`docs/BIOME-ASSET-MAP.md` L2 表把 boids 的源写成 `animata/background/boids-ecosystem.tsx` | 零件自述为准（自写）；BIOME 表把它当 Portal 候选，口径不同 |
| 21 | `docs/THIRD-PARTY-CODE-AUDIT-2026-11-24.md:100`「合计 195 objects」 | 同表各行 objects 相加 = 355【推断，算术】 | 合计行算错 |
| 22 | 同文 `:82`「子集 `only=desk,fixtures,exterior,plants`：5 件，合计 837,362 tris」 | 同文 `:91-98` 表：这 4 件相加 666,540；837,362 = 全量 1,476,972 减 bed / clutter / decor【推断】 | 837,362 对应的是 7 件（含 room-shell、sky），不是 5 件 |
| 23 | `docs/THIRD-PARTY-REVIEW-2026-11-20.md:26` room-at-dawn「8–10 个」feature（含 `pipeline`）；`:61-66` `createRain.ts 517 行` 等文件名 | 11-24 审计定为 9 个；归档里对应文件是 `rain/rain.ts` 467 行、`rain/height-map.ts` 172 行、`atmosphere/post.ts` 292 行【实测 `wc -l`】 | 11-20 报告是子集评估，文件名与行数都和归档对不上；其文件头 `:1` 已声明被 11-24 补证据 |
| 24 | `docs/HANDOFF.md:5` `verify:preview` **599/599**；`:7` `:320` 与 `DECISIONS.md:189` **617/617**；`A2-PARTS-AND-TEMPLATES.md:128` **783/783** | `tests/preview-build.mjs:244` 按 preset 逐个循环，断言数随 preset 数变；现 18 个 preset | 四个数字对应不同时点，没有一个是 18-preset 下的值。当前值【不知道】（未实跑） |
| 25 | `docs/HANDOFF.md:301-308`「四个零件」及行数（field-ground 343、paper-ink 465、pixel-post 330、voxel-world 265）；`:340` meadow.ts 501 行；`:343` dandelion.ts 396 / blow-input.ts 247 行；`:400`「`STATIONS`（`:32-103`）」 | 实测 559 / 549 / 363 / 309；meadow.ts 551；403 / 254；`STATIONS` 在 `:32-146` | 全部过期 |
| 26 | `docs/DECISIONS.md:19`「hug 不必（平面剪影+风场更像纸上的动画）」 | 同文 `:14`「/hug 用 hug-meadow（three.js L1）」、`:163-172` 第二个「ADR-04」 | 文件里有两个 ADR-04 编号；ADR-01 的「为什么」段没随 /hug 改裁决而更新 |
| 27 | `shared/stage/preview/dawn-desk/upstream/UPSTREAM.md`「The files are unmodified upstream source…snapshot `_third_party/2026-11-20/room-at-dawn`」 | `_third_party/` 下只有 `2026-11-24/`【实测】；这 13 个文件与库内 `room-at-dawn/upstream/src/` 同名文件 `cmp` 全部不同 | 引用的快照目录本机不存在；两份「未修改的上游源码」互相不一致，哪份对应哪个 commit【不知道】 |

---

## 7. 纪律缺口

| 项 | 事实【实测】 |
|---|---|
| 缺 `README.md` | `abyss`、`nebula`、`temple`（3 / 16） |
| 缺 `bench.mjs` | `abyss`、`boids`、`dandelion`、`hug-meadow`、`koi-pond`、`nebula`、`still-sink`、`sun`、`temple`（9 / 16）。README 与 bench 都有的只有 7 个：ascii-field、bubbles、field-ground、paper-ink、pixel-post、tide-medium、voxel-world |
| import `three` | `hug-meadow`、`koi-pond`（index + camera-rig）、`nebula`（8 个文件）、`temple`（含 `three/addons/postprocessing/*` 5 个）、`shared/parts/world-feature.ts`。`voxel-world` 不 import three（引擎是自含的 `engine.js`） |
| 其他依赖 | `koi-pond` import `shared/parts-library/koi/*.js` 7 个文件；`temple` import `shared/realism/`（3,217 行 + 5.02 MB 贴图）；其余 9 个只 import `stage/contract`（类型）与 `stage/world`（`mulberry32`） |
| 与 README:20 的出入 | README 写零件声明是 `{ id, layer, blend, costMs, kb, create(env) }`，代码里 16 个零件全部另外声明 `channel`（`contract.ts` 的 `PartChannel`），README 没提；`world-feature.ts` 放在 `shared/parts/` 下却不是 PartV2 |
| 零每帧分配 / dispose 幂等 | **未核实**——只读静态分析证明不了。能说的只有：16 个零件都有 `dispose()` 定义且出现 `disposed` 类标志位（grep），HANDOFF:385 只对 4 个零件做过断言 |
| 溯源声明 | `shared/parts/` 16 个目录下没有任何 `part.manifest.ts`（`find` 零命中）；v1 的 provenance 体系只覆盖 `shared/parts-library/` |
| 登记表混入预览件 | `dawn-desk` 自述「不是产品代码：不进 shared/parts」（`dawn-desk/index.ts:6`），却在 `PART_ENTRY` 里与正式零件同表 |
| 测试覆盖 | `boids` / `sun` / `ascii-field` / `still-sink` / `abyss` 没有任何测试按 id 点名（grep）；它们只经 `tests/preview-build.mjs:238` 的 `PART_ENTRY` 遍历间接过一遍 import。`world-feature` 零测试引用 |

---

## 8. 计数口径说明

1. 「来源项目」= 文档或代码里出现过的上游；站（license / praise）单列且注明无独立原件。hug 原站与 dandelion / blow-input 出自同一篇公众号文章，按主理人给的清单分三行。
2. 「拆出来」分两档：拆出 Stage 零件或内部模块（6 个）；只到原件整件入库（7 个）。
3. 「Stage 零件」= `shared/parts/<id>/` 目录数（16），不含 `world-feature.ts` 与 `dawn-desk`。
4. 「内部模块」= temple 7 + abyss 5 + nebula 4 + koi-pond 3 + room-at-dawn 9 = 28，按代码里的 id / 类名数。
5. 「孤儿」= 在 `PRESETS`、`STATIONS`、`TEMPLATES` 三张表里 id 出现 0 次（只读 import 后逐 id 比对）。
6. 「代码行数」= 零件目录内 `.ts/.mjs/.js` 的 `wc -l`，扣除 `bench.mjs`；`voxel-world` 另注 `engine.js`。
7. 「入库」= `git ls-files` 可见；`_third_party/` 在 `.gitignore`，只算本机存在。
8. Portal 数字来自只读解析本机 `preview-manifest.ts` 与 `docs/PART-ATLAS.csv`，未运行 `atlas.mjs`。
9. 所有断言数、帧率、tris 等运行期数字一律未实跑，只做静态计数并标明。
10. 源头规模优先用磁盘实测；只有文档数字的标【未实测】。
