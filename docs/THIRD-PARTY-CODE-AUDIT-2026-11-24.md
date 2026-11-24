# 四个第三方项目：完整源码审计与拆分结论（2026-11-24）

> 本轮口径：先把四个项目的**完整源码**拿到手，再逐项目判断“能不能拆成场景 / 能不能拆成零件”。
> 不再用 2026-11-20 的“子集评估”代替完整代码审计；那份报告保留为历史记录。
> 逐文件清单见 `docs/THIRD-PARTY-FILE-INVENTORY-2026-11-24.csv`（207 行，含路径 / 字节 / 模块组）。
> 源码归档在 `_third_party/2026-11-24/`（`.gitignore` 已忽略，不随产品包分发）。

## 0. 先统一三种“零件”，避免把源码模块冒充可装配件

| 层级 | 定义 | 本轮判定 |
|---|---|---|
| `PartV2` | 站点级零件，占一个槽位，自己画、自己释放、有 `costMs/kb` | 只有能独立成为 L0/L1/L2 的东西才算 |
| `WorldFeature` | world 内部件，共享宿主的 scene / camera / renderer / time，不能单独在 `build.mjs` 里选 | 本轮真正要拆出来的东西 |
| `Tool / 母本` | 烘焙器、SDF/TeX、贴图、shader chunk、构建脚本 | 只做算法/资产参考，不登记成零件 |

Stage 的硬约束没有变：一场只允许一个 L4 后处理（`E_MULTI_POST`）、一个 GL 画布（`E_MULTI_GL`），非空装配至少一件 L0/L1（`E_NO_BASE`）。因此“把第三方整站塞进现有四站”在架构上不成立，能做的只有 **WorldFeature 复用** 或 **另立新 world 站**。

## 1. 总表

| 项目 | 文件 / 体积 | 源码模块 | 可拆 `WorldFeature` | 可组装 `PartV2` | 许可证 | 本轮结论 |
|---|---|---|---|---|---|---|
| `room-at-dawn` | 48 / 19.92 MB | 24 个 `src` 文件 / 0.67 MB | **9 件**：room-shell、sky、exterior、fixtures、bed、desk、plants、clutter、decor | `room-dawn`（L1 world，未来站） | MIT | **已拆并装配冒烟通过**；当前四站无槽位，不能 drop-in |
| `rainy-night-webgpu` | 113 / 40.49 MB | 25 个 `rainy-night` 模块 / 0.25 MB；城模 30.3 MB | **10 个视觉 feature + 1 相机 + 1 音频** | `rain-window`（L1 world，未来站，WebGPU） | 无 LICENSE；城模 CC-BY-4.0 | **可拆，不发货**；许可证与槽位双重阻断 |
| `crimson-loong` | 44 / 11.95 MB | 18 个全局脚本 / 1.23 MB；three vendor 0.72 MB | **9 个视觉 feature + 1 相机 + 1 音频** | `loong-lake`（L1 world，未来站） | 无 LICENSE（仅 vendor three MIT） | **可拆，不发货**；全局单例 + 许可证阻断 |
| `saltline-fable-5.2` | 2 / 1.36 MB | 1 个 HTML / 1,423,569 B，一个 `<script>` | **0** | 无 | 无 LICENSE | **不做**；完整源码证实没有模块边界 |

一句话：**只有 `room-at-dawn` 能把“场景内部件”真的拆出来并跑通装配；另外两个是“结构可拆、许可/宿主不可发”；`saltline` 是单文件状态机，拆任何一件都要先反编译整份文件。**

## 2. `room-at-dawn`：9 件，已实际拆出

### 2.1 完整源码证据

- 归档：`_third_party/2026-11-24/room-at-dawn`，48 文件 / 19.92 MB。
- 产品库副本：`shared/parts-library/room-at-dawn/upstream/src`，24 个 `src` 文件，MIT LICENSE 同目录。
- 上游装配入口 `src/scene/index.js`：
  - `import.meta.glob('./parts/*.js')` 收集所有 part；
  - 每个 part 导出 `order / label / build(ctx)`；
  - `ctx = { M: makeMaterials(), rng: new RNG(...), scene, colliders: [], animated: [] }`；
  - `buildRoom(ctx)` 先建墙/窗/门，`buildSky()` 建天空，再按 `order` 逐个 `build(ctx)`；
  - 支持 `?only=desk,fixtures,...` 只装子集。
- 这本身就是“场景 + 内部件”结构，不需要反编译；本轮只是把它固定成 `WorldFeature` 契约。

### 2.2 拆出的 9 件

| # | feature id | 上游文件 | order | 上游职责 | 本轮状态 |
|---|---|---|---|---|---|
| 1 | `room-shell` | `src/scene/room.js` | 0 | 墙、窗、门、踢脚、插座、房间包围盒 / bake 包围盒 | 已注册 |
| 2 | `sky` | `src/scene/sky.js` | 1 | 天空穹顶与天空纹理 | 已注册 |
| 3 | `exterior` | `src/scene/parts/exterior.js` | 5 | 窗外树、远景、外部遮挡 | 已注册 |
| 4 | `fixtures` | `src/scene/parts/fixtures.js` | 10 | 窗帘、窗台、暖气、衣柜、床头柜、地毯、灯、画 | 已注册 |
| 5 | `bed` | `src/scene/parts/bed.js` | 20 | 床架、被褥、枕头、书、护理标签 | 已注册 |
| 6 | `desk` | `src/scene/parts/desk.js` | 30 | 书桌、桌面器物、纸张/文具 | 已注册 |
| 7 | `plants` | `src/scene/parts/plants.js` | 40 | 绿萝、花盆、叶片/茎 | 已注册 |
| 8 | `clutter` | `src/scene/parts/clutter.js` | 60 | 衣物、包、杂物 | 已注册 |
| 9 | `decor` | `src/scene/parts/decor.js` | 70 | 海报、书架、收纳、鞋、灯串 | 已注册 |

**没拆成 feature 的上游文件**：
- `src/scene/index.js`：装配器，被本轮 `features.ts` 取代；
- `src/scene/materials.js`：共享材质工厂 `M`，属于 world 级，不是 feature；
- `src/scene/layout.js`：布局常量，属于 world 级；
- `src/core/{geo,gi,rng,tex}.js`：几何/ GI /随机/贴图工具，`WorldFeature` 的公共依赖；
- `src/render/{cams,film,look,pipeline}.js`：宿主渲染管线与镜头，属于 L1 world host；
- `src/bake/{baker,worker}.js`：GI 烘焙工具，属于构建期 / 离线母本；
- `src/game/game.js`、`src/main.js`：整站启动与交互，不属于零件。

### 2.3 代码落地

- 契约：`shared/parts/world-feature.ts`
  - `WorldFeature`：`build / update / draw / dispose / debug` 全部可选，`order` 控制 build 顺序；
  - `WorldFeatureHost`：按 order 装配、维护每件 root、统一 update/draw/dispose；
  - `disposeRoot` 默认 false：room 的 9 件共享 `M`，不能各自递归 dispose 共享材质。
- 适配：`shared/parts-library/room-at-dawn/features.ts`
  - `createRoomFeatureSet({ scene, only? })` 返回 `context + features`；
  - `room-shell` / `sky` / 7 个 part 全部登记；
  - `disposeRoomFeatureSet(set)` 在 world 销毁时统一释放共享材质；
  - `only` 透传上游 `?only=` 语义，可只装 `desk,fixtures,exterior,plants`。

### 2.4 装配冒烟（真实 browser，非静态推断）

- 入口：`_scratch/room-feature-smoke.ts`；bundle 后由 `_scratch/probe-page.mjs` 在 headless Edge / D3D11 里执行。
- 全量 9 件：`ok:true`，build `10,479 ms`，`colliders:10`，`animated:0`，`bake:true`；法线材质诊断渲染 `251 calls / 1,780,144 tris`。
- 子集 `only=desk,fixtures,exterior,plants`：`ok:true`，build `3,607 ms`，5 件，合计 **837,362 tris**；诊断渲染 `184 calls / 1,167,086 tris`。
- 更小的 `desk + room-shell + sky + plants`：**439,718 tris**，接近旧 `dawn-desk` 的 38–50 万面预算。
- 诊断截图：
  - 全量 9 件：`docs/preview/third-party/room-at-dawn-features.png`
  - desk 子集：`docs/preview/third-party/room-at-dawn-features-desk.png`
  - 两张都是 `MeshNormalMaterial` 法线材质，用来证明“9 件都在场景里、位置正确”；**不是 GI/成品光照截图**，不能当写实验收图。

| feature | objects | triangles |
|---|---:|---:|
| room-shell | 33 | 169,862 |
| sky | 2 | 960 |
| exterior | 15 | 172,428 |
| fixtures | 141 | 225,216 |
| bed | 21 | 419,964 |
| desk | 49 | 203,134 |
| plants | 19 | 65,762 |
| clutter | 26 | 87,104 |
| decor | 49 | 132,542 |
| **合计** | **195** | **1,476,972** |

- 结论：**9 件都能独立 build，顺序正确，共享 M 正常；但全量 148 万面，必须按站裁剪，不能整间房塞进首屏。**

### 2.5 为什么还不是 `PartV2`

- `room-at-dawn` 的 `PartV2` 壳仍是 D0，`createPart()` 仍抛 `E_PART_NOT_MOUNTED`；本轮拆的是**内部件**，没有把它注册成站点级 world 件。
- 要变成 `PartV2`，还缺三件事：
  1. world host：`WebGLRenderer` + `Pipeline` + `CAMS` + `applyLook` + GI bake / placeholder；
  2. 镜头与首屏：现有四站没有空余 world 槽位，`/license` 的纸面会遮住 world；
  3. 资产策略：全量 148 万面不适合首屏，必须先选 `desk` 子集并裁 `fixtures/exterior/plants`。
- 这三件是**站级重组**，不是再拆一个 feature 能解决的。

## 3. `rainy-night-webgpu`：25 个模块，结构最干净，但许可与宿主阻断

### 3.1 完整源码证据

- 归档：`_third_party/2026-11-24/rainy-night-webgpu`，113 文件 / 40.49 MB。
- 核心源码：`src/lib/rainy-night`，**25 个 `.ts` / 247.9 KB**；此前 `engine.ts` 的 18 个 missing import 已全部归集。
- 大资产：`public/models/city.glb` 30.3 MB；湿地贴图 3.4 MB；splash 16.5 KB；`basis_transcoder.wasm` 527 KB。
- 架构是 Next.js 外壳 + 纯 WebGPU 引擎；`engine.ts` 只做编排，各系统都是独立 `createXxx()` 工厂，天然适合 `WorldFeature`。

### 3.2 可拆 feature 表

| # | feature | 上游模块 | 工厂 / 依赖 | 能否独立 | 结论 |
|---|---|---|---|---|---|
| 1 | `rainfield` | `rain/rain.ts` + `rain/height-map.ts` | `createRain` + `createHeightMap`；需 Scene + WebGPURenderer | 是（需一个地面/场景写高度） | **最值得拆**；雨丝 + 水花 + 高度图一对 |
| 2 | `wet-road` | `ground/road-wet.ts` | `createRoadBridgeWet({scene, cityRoot})` | 否，依赖城模 mesh 名 | 只能跟城模一起用 |
| 3 | `puddle-reflect` | `ground/planar-reflect.ts` | `createPlanarPuddleReflect` | 半独立，需反射面 / 裁剪面 | 可作为雨窗地面件 |
| 4 | `canal-water` | `water/canal.ts` | `createCanalWater({scene, cityRoot})` | 否，依赖河道几何 | 跟城模绑定 |
| 5 | `night-sky` | `atmosphere/sky.ts` | `createNightSky({scene,renderer,camera})` | 是 | 可独立成夜空件 |
| 6 | `horizon-fill` | `atmosphere/horizon.ts` | `createHorizonFill({scene,cityRoot})` | 半独立，需城市轮廓 | 跟城模绑定 |
| 7 | `night-ambient` | `atmosphere/ambient.ts` | `createNightAmbient(scene)` | 是 | 可独立 |
| 8 | `lightning` | `lightning/lightning.ts` | `createLightning({scene,camera})` | 是 | 可独立；需天气节奏 |
| 9 | `lantern-system` | `city/lantern-{emissive,flicker,lights}.ts` | `setupLanternEmissive` + `createLanternFlicker` + `setupLanternTableLights` | 半独立，需灯位/城模 | 必须跟城市件 |
| 10 | `city-emissive` | `city/{window,texture}-emissive.ts` | `setupWindowEmissive` / `setupTextureEmissive` | 否，需城模 | 跟城模绑定 |
| 11 | `post` | `atmosphere/post.ts` + `bloom/ssf/dither` | `createPostPipeline({renderer,scene,camera})` | 是，但**占 L4 整场唯一后处理** | 不能与现有 stage 后处理共存 |
| 12 | `tour` | `tour/tour.ts` | `createSceneTour` | 是 | 镜头件，不是视觉件 |
| 13 | `rain-audio` | `audio/rain-audio.ts` | `createRainAudio()` | 是 | 音频服务，不是视觉件 |

**真正的视觉 feature 是 10 个**（1–10），`post` 是 L4 边界，`tour` 是相机，`rain-audio` 是服务。

### 3.3 结论

- **可拆，但不能发货**：仓库没有 LICENSE；城模是 CC-BY-4.0，代码没有对应授权。现有库已按“仅个人展示、不再分发”签过豁免；这次完整源码审计不改变该结论。
- **WebGPU 版本也不兼容**：上游 `package.json` 是 `three@0.186.0`，产品仓是 `three@^0.169.0`。本轮实际把 `rain.ts + height-map.ts` 接成 `WorldFeature` 时，`instancedArray`、`time` 等 TSL 导出的类型在 0.169 下不存在，`tsc` 直接报错；因此适配文件没有保留在编译面，避免用 `@ts-nocheck` 把不兼容藏起来。要真拆，先统一到 0.186 或做 API 适配。
- **宿主必须是 WebGPU**：`createRain` / `createHeightMap` / `createPostPipeline` 都要 `WebGPURenderer`，与当前四站的 WebGL2 管线不是同一套。
- **不能进现有四站**：一场只允许一个 GL/world 件，`/hug`、`/still`、`/koi`、`/license` 都已占用；要做只能是未来 `rain-window` 新站。
- 本轮没有把 rain 模块复制进 `shared/parts-library`：不是不会拆，而是**没有许可证 + three 版本不匹配 + 没有 WebGPU 新站**三个前提同时缺失。

## 4. `crimson-loong`：18 个全局脚本，9 个视觉件，拆得出来但不能直接 import

### 4.1 完整源码证据

- 归档：`_third_party/2026-11-24/crimson-loong`，44 文件 / 11.95 MB。
- `src`：18 个 `.js` / 1.23 MB；`vendor/three` 0.72 MB；`index.html` 2.0 MB（已内联 three + 全部脚本）。
- 构建方式 `tools/build.py`：把 `src/*.js` 按文件名排序**拼成一个 classic script**，再内联 three。不是 ESM，没有 import/export。
- 每个模块用 IIFE 返回一个命名空间：`Sky`、`Rock`、`Arch`、`Flora`、`Dragon`、`Wake`、`Water`、`FX`、`Air`、`Post`、`Film`、`Daylight`、`Score`、`Tex` 等；共享全局 `G`、`SUN`、`SUN_COL`、`Q`、`lerp` 等。
- 因此“模块边界存在，但模块加载边界不存在”：不能 `import { Dragon } from './60_dragon.js'`，只能按顺序执行或包一层沙箱。

### 4.2 可拆 feature 表

| # | feature | 上游文件 | 上游入口 | 依赖 | 拆分结论 |
|---|---|---|---|---|---|
| 1 | `sky` | `20_sky.js` | `Sky.init/bakeStep/makeEnv/update` | `Tex`、`G`、`THREE` | 9 个视觉件里最独立 |
| 2 | `karst` | `30_rock.js` | `Rock.build(scene,prog,tick)` | `SDF/Tex/GLSL` | 山体件，可独立 |
| 3 | `arch` | `35_arch.js` | `Arch.build(scene,prog,tick)` | `Rock` 的 sites、`Tex` | 建筑/灯笼/布幔 |
| 4 | `flora` | `40_flora.js` | `Flora.build(scene,prog,tick)` | `Tex`、`G` | 枫/松/灌木 |
| 5 | `dragon-wake` | `60_dragon.js` + `66_wake.js` | `Dragon.build(scene,fx,...)` + `Wake.build` | `Film` 时间轴、`G`、`SDF/Tex` | 必须成对拆；Wake 是 Dragon 的响应 |
| 6 | `water` | `68_water.js` | `Water.build(scene,fx,tick)` / `Water.update(t)` | `Sky`、`Flora.T`、`Post` 尺寸 | 湖面/倒影/瀑布/水花 |
| 7 | `fx` | `70_fx.js` | `FX.build(scene,fx,...)` | `Water`、`Dragon`、`Post` | 火/霜/闪电/光束/爆点 |
| 8 | `air` | `72_air.js` | `Air.build(scene,fx)` | `Flora.T`、`G` | 雾/鸟/叶/烟/萤火 |
| 9 | `post` | `80_post.js` | `Post.init/render/size` | `Sky`、`G` | L4 整场唯一后处理 |
| 10 | `film-camera` | `88_film.js` + `05_glsl.js` | `Film.apply` / `Daylight.apply` | `G`、`Sky`、`Post` | 相机/时间轴/天色，宿主级 |
| 11 | `score` | `85_audio.js` | `Score.start` | Web Audio | 音频服务 |
| 12 | `tex-sdf` | `10_sdf.js` + `15_tex.js` + `05_glsl.js` | `SDF` / `Tex` / GLSL chunks | `THREE` | 工具母本，不是 feature |

**视觉 feature 9 个**（1–9）；`film-camera` 是宿主，`score` 是服务，`tex-sdf` 是工具。

### 4.3 结论

- **可拆，但不能发货**：仓库没有代码 LICENSE，只有 vendor three 的 MIT；`README` 也未声明代码授权。现有 manifest 按“个人展示、不再分发”L3 处理。
- **不能 import 进产品**：`60_dragon.js` 顶层就 `new THREE.Vector3()`，依赖全局 `THREE`；`Dragon` / `Water` 等还依赖 `G` 单例和 `Film` 时间轴。直接 `import` 会在模块顶层报 `THREE is not defined`。
- 若要真正复用，需要一次**包装工程**：
  1. 为每个脚本包一层 `function(THREE, G, Q, ...){ ... return { Dragon } }`；
  2. 按 `00→05→10→15→20→30→35→40→58→60→66→68→70→72→80→85→88→90` 顺序执行；
  3. 把 `G` 变成宿主注入的 context，而不是全局单例；
  4. 再把 `Dragon/Wake/Water/FX/Air` 映射成 `WorldFeature`。
- 这是“可拆”，但不是“今天就能装”。本轮只做到**边界确认**，没有把 18 个脚本硬塞进 `shared/parts` 冒充 ESM。

## 5. `saltline-fable-5.2`：完整源码证实 0 个可维护子件

- 归档：`_third_party/2026-11-24/saltline-fable-5.2`（镜像 `realcodebear/saltline-fable-5.2`），2 文件 / 1.36 MB。
- `index.html` 1,423,569 B；一个 `<script>`；three 内联；没有 `src/`、没有模块、没有 import/export、没有 LICENSE。
- README 明确说“one HTML file”；页面请求 Google Fonts 外链，违反零外部请求。
- 概念上能叫出 `port-env`、`rain/fog`、`Gulls/Hounds`、武器、pointer lock、uplink、HUD、audio，但代码里是一个状态机；拆任何一件都要先反编译整份 1.4 MB 文件，且没有授权。
- **结论：不做。** 不是“本轮没时间”，是完整源码审计后仍然 0 个可维护子件。

## 6. 四项目统一判定

| 项目 | 拆场景？ | 拆零件？ | 进现有四站？ | 做新站？ | 许可证 |
|---|---|---|---|---|---|
| `room-at-dawn` | 已完成：9 个 feature | **已落地并通过装配冒烟** | 否，无 world 槽位 | 可做 `room-dawn` L1 world | MIT，可干净合并 |
| `rainy-night-webgpu` | 可拆 10 视觉 feature | 结构最干净，但未搬进库 | 否，WebGPU + 无槽位 | 可做 `rain-window` | 代码无 LICENSE，城模 CC-BY-4.0 |
| `crimson-loong` | 可拆 9 视觉 feature | 全局脚本，需包装工程 | 否，无槽位 | 可做 `loong-lake` | 代码无 LICENSE |
| `saltline-fable-5.2` | 否 | 否（0） | 否 | 否 | 无 LICENSE |

### 6.1 现在能交付的

- **room-at-dawn**：`WorldFeature` 契约 + 9 件适配 + 装配冒烟；可作为未来 `room-dawn` world 的底座。
- **rain / crimson**：完整源码、逐文件清单、feature 边界表、阻断条件；不是可运行模板。
- **saltline**：明确不做。

### 6.2 下一步的前置条件（不是本轮能擅自决定的）

1. **room-dawn 要不要立新站**：现有四站没有空余 world 槽位；如果不动首屏，就只能停在 feature 库。
2. **rain 要不要立 WebGPU 新站**：需要 `WebGPURenderer` + 新站 + 许可证确认 + three 0.186（或 API 适配），四者缺一不可。
3. **crimson 要不要做包装工程**：18 个全局脚本 → ESM/沙箱 + `G` 注入，工作量大于 room 的适配。
4. **是否允许把无 LICENSE 源码放进可分发仓库**：当前结论是不允许；只能留在 `_third_party` 做审计和私用展示。

## 7. 本轮验证

- `npx tsc --noEmit` 通过（含新增 `shared/parts/world-feature.ts`、`room-at-dawn/features.ts`）。
- room feature 装配冒烟：`_scratch/room-feature-smoke.html`，headless Edge / D3D11，`ok:true`，9 件 / 1,476,972 tris / 10,479 ms。
- 子集冒烟：`only=desk,fixtures,exterior,plants`，5 件 / 837,362 tris / 3,607 ms。
- 诊断截图：`docs/preview/third-party/room-at-dawn-features.png`（全量 9 件）与 `...-desk.png`（desk 子集）；法线材质，证明装配，不是 GI/成品光照。
- **未做**：room 的 GI/成品光照截图（缺 world host/pipeline，不用黑屏冒充成品）；rain/crimson 的运行时模板（许可证/版本/宿主未定）；saltline 任何移植。

## 8. 与旧报告的关系

- `docs/THIRD-PARTY-REVIEW-2026-11-20.md` 是**子集评估**，结论“room 唯一值得试装、rain/crimson 只能未来站、saltline 不做”仍然成立。
- 本文件把“值得试装”推进到“9 件已拆 + 装配冒烟通过”，并把 rain/crimson 的模块边界从概念表推进到**完整源码逐文件清单**。
- 本文件不修改旧报告的结论，只补完整证据和代码落点。
