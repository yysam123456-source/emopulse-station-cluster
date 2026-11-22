# 四个第三方项目拆件评估（2026-11-20）

> 口径修正：上一版把每个项目当成“整站”来判断，只回答了“整站能不能接”。这一版按你的口径拆到场景、动画、特效，回答“里面的内容能不能做成零件”。整站结论仍保留，但不再是唯一结论。

## 0. 先分清三种“零件”

当前 `PartV2` 只支持站点级零件：自己 `draw`、自己 `dispose`、自己申报 `costMs` / `kb`，并且一场只允许一个 `world` / `gl` 件。项目内部的场景、动画、特效，绝大多数不满足这个条件。为了避免把“源码模块”和“可装配零件”混在一起，这里分三层：

| 层级 | 是什么 | 能否在 `build.mjs` 里直接选 | 本次例子 |
|---|---|---|---|
| `PartV2` | 站点级零件，自己画、自己释放、有预算 | 能 | `license-desk`（由多个场景子件组装成的一个 L1 world） |
| `WorldFeature` | world 内部子件，共享宿主的 scene / camera / material / time；不能单独注册（暂称，当前契约未正式定义） | 不能，只能被某个 world 件组装 | `desk`、`rainfield`、`dragon`、`wake` |
| `Tool / 母本` | 构建期工具、算法、shader chunk、贴图、烘焙数据 | 不能 | GI baker、heightmap、SDF/TeX kit、post shader |

**所以“能不能做成零件”要分两问：**

1. **能不能做成独立 `PartV2`？** 只有能自己画、且能占一个站点槽位的东西才可以。按这个口径，本次能新增的只有“整站世界”级的组装件，不是小特效。
2. **能不能做成 `WorldFeature`，被别的 world 复用？** 这个口径下，四个项目都有东西可拆，但拆出来的东西不能单独在 `build.mjs` 里选。

## 1. 结论

| 项目 | 可拆出的 `WorldFeature` | 可组装的 `PartV2` | 当前四站槽位 | 判断 |
|---|---|---|---|---|
| `room-at-dawn` | 8–10 个：`desk`、`fixtures`、`plants`、`exterior`、`room-shell`、`sky`、`bed`、`clutter`、`decor`、`pipeline` | `license-desk`（L1 / world，用 desk + fixtures + exterior + plants 组装） | `/license` 没有 world 件 | **唯一值得做试装** |
| `rainy-night-webgpu` | 6 个：`rainfield`、`wet-surface`、`canal-water`、`lightning`、`night-sky`、`post` | `rain-window`（未来雨站，不是现站） | 无 | **拆得出来，现站不接** |
| `crimson-loong` | 9 个：`dragon`、`wake`、`water`、`flora`、`sky`、`karst`、`arch`、`air`、`fx` | `loong-lake`（未来龙/影片站，不是现站） | 无 | **拆得出来，现站不接** |
| `saltline-fable-5.2` | 0 个可维护的子件；只有概念上的 `port-env` / `rain` | 无 | 无 | **不做** |

一句话：**按“场景/动画/特效”拆，四个项目都有内容；但按当前 `PartV2` 装，只有 `room-at-dawn` 的 desk 一组能组装成一个当前有槽位的 world 件，其他都只能做未来站或技术母本。**

## 2. `room-at-dawn`：拆得最干净的一组

它本来就是按 `parts/*.js` 组装的：每个文件导出 `order` 和 `build(ctx)`，由 `scene/index.js` 排序装配。这是四个项目里最适合拆件的一个。

| 子件 | 代码边界 | 类型 | 依赖 | 能否单独画 | 结论 |
|---|---|---|---|---|---|
| `desk` | `src/scene/parts/desk.js`，1,660 行 | 场景 | `ctx.M`、`geo/tex/rng`、`layout`、批处理 | 否，返回 Group | **最强候选**；桌/椅/灯/书架/卡片都在里面，可裁成 `license-desk` 的桌面 |
| `fixtures` | `fixtures.js`，1,462 行 | 场景 + 动画 | 同上；窗帘有 `uTime` 摆动 | 否 | **强候选**；窗帘、窗台、地毯、床头柜、吊灯；可拆 `curtains` / `sill` |
| `plants` | `plants.js`，624 行 | 场景 + 动画 | 藤蔓、叶片实例、风 shader | 否 | **强候选**；绿萝可复用，但它是 3D，不能当 L2 生态件 |
| `exterior` | `exterior.js`，912 行 | 场景 + 动画 | 树、草坪、邻居房子、风 shader | 否 | **强候选**；窗外景，适合 `/license` 的晨光背景 |
| `room-shell` | `room.js`，280 行 | 场景 | 墙/窗/地板、材质 | 否 | 必要宿主件，单独没有意义 |
| `sky` | `sky.js`，71 行 | 场景 | 天空穹顶、GI 时间 uniform | 否 | 可复用的小件 |
| `bed` / `clutter` / `decor` | 1,141 / 845 / 845 行 | 场景 | 床、衣物、杂物 | 否 | 对 `/license` 不需要；留给“房间站” |
| `GI baker` | `src/bake/` | 工具 | CPU 路径追踪 + `gi.bin` | 否 | **不是零件**；是构建期烘焙，12 MB 结果 |
| `pipeline` | `src/render/pipeline.js`，323 行 | 特效 | AO / bloom / grade / 累积 | 否 | **world 内部后处理**，不是 L4；L4 拿不到深度 |
| `film` | `src/render/film.js`，165 行 | 动画 / 相机 | 镜头轨道、累积帧 | 否 | world 内部相机件，不是 PartV2 |
| `audio` | `src/audio/` | 服务 | 音乐/环境声 | 否 | 站点级服务，不是零件 |

**关键实测：** 全房间 `desk` 机位是 1,289 次 draw call、183 万三角面；只装 `desk`（保留 room shell + sky）是 **511 次 draw call、38 万三角面**。这说明“拆 desk 一组”确实能把成本砍下来，不需要把整间房都装进去。

**但 desk 不是现成的纸面场景：** desk 机位的桌子在窗光阴影里，纸放上去不会自动成为主角；要把它变成 `/license` 的纸面，需要重新布光、重新定机位、把纸做成桌面上的实体。这是**场景重组**，不是把 `desk.js` 抄过去。

## 3. `rainy-night-webgpu`：六个可复用天气/地面件，但都离不开宿主

它的源码边界其实比整站看起来好：每个系统都有 `createX(options) → handle`，返回 `update` / `dispose` / 参数。问题不是“不能拆”，而是“拆出来仍然需要一个 3D 宿主”。

| 子件 | 代码边界 | 类型 | 依赖 | 做成 WorldFeature | 做成独立 PartV2 |
|---|---|---|---|---|---|
| `rainfield` | `createRain.ts` 517 行 + `createHeightMap.ts` 197 行 + 水花图集 | 天气 / 特效 | `scene`、`camera`、WebGPU renderer、heightmap RT、`water-splash.png` | **可以**；这是最值得抽的雨件 | 不行；它要宿主场景和高度图 |
| `wet-surface` | `createRoadBridgeWet.ts` 901 行 + `createPuddleMask.ts` + `createRipples.ts` 125 行 | 地面材质 / 特效 | 地面几何、heightmap、天空层、相机 | **可以**；可拆成 `wet-road` + `ripple-fn` | 不行；材质必须挂在已有地面 |
| `canal-water` | `createCanalWater.ts` 631 行 | 水面场景 | 水面几何、`rippleFn`、反射 | **可以** | 不行；要有水面宿主 |
| `lightning` | `createLightning.ts` 612 行 | 特效 | scene、相机、天空 | **可以**；可做 `sky-fx` | 不行；3D 闪电，不是 L2 |
| `night-sky` | `createNightSky.ts` 139 行 + horizon/ambient | 场景 | 天空穹顶、renderer | **可以** | 不行；世界背景 |
| `post` | `createPostPipeline.ts` 358 行 | 后处理 | WebGPU scene color/depth、SSF/bloom/dither | **可以**，但只能在该 world 内部 | 不行；当前 L4 是 2D 后处理，拿不到 3D 深度 |
| `heightmap` | `createHeightMap.ts` | 工具 | 正交相机、城市深度 | 作为 `rainfield` 的内部工具 | 不行 |
| `audio` / `tour` | `createRainAudio.ts` / `createSceneTour.ts` | 服务 / 站点控制 | 音频、相机轨道 | 不是零件 | 不行 |

**最值得抽的组合：** `rainfield` + `wet-surface` + `canal-water` 可以组成一个 `rain-kit`；它需要一个有地面、有相机、有高度图的 world 宿主。这个组合可以服务未来的 `/rain`，但不是现四站里的任何一个。

**代价：** 全部基于 `three 0.186` 的 WebGPU/TSL；当前零件层是单份 `three 0.169`。要抽，等于另起一份 renderer 或重写成 GLSL/WebGL2。代码仓库还没有 LICENSE，城模 30 MB 是 CC-BY-4.0；不能直接合并。

## 4. `crimson-loong`：动画和特效件最好，但全局耦合最重

它的源文件是按系统命名的，内部 API 其实不差；问题是所有模块都是 `const X = (() => { ... })()` 的全局单例，靠 `G` / `Film` / `Score` 串起来。

| 子件 | 代码边界 | 类型 | 依赖 | 做成 WorldFeature | 做成独立 PartV2 |
|---|---|---|---|---|---|
| `dragon` | `60_dragon.js` 707 行 + `58_dlook.js` 828 行 | 动画 / 生物 | `Rock`、`Film`、`Score`、`Water`、`FX`；13 个文件引用 `Dragon` | **可以**；最适合做成 `rail-creature`：路径 + 脊柱截面 + 头部姿态 | 不行；要整个龙/山谷宿主 |
| `wake` | `66_wake.js` 461 行 | 特效 / 场 | `Dragon`、`Film`、`Air`；纯函数 `windAt` + GLSL `clWake` | **可以**；可泛化成“任何移动体对草/尘/叶的扰动场” | 不行；它没有自己的 draw，只提供场 |
| `water` | `68_water.js` 1,252 行 | 场景 / 特效 | `Rock`、`Arch`、`Film`、`Dragon` | **可以**；湖面镜面、瀑布、水花 | 不行；要有湖/地形宿主 |
| `flora` | `40_flora.js` 853 行 | 场景 / 动画 | `Wake`、`Air`、`Film` | **可以**；枫树/松树/草 | 不行 |
| `sky` / `karst` / `arch` / `air` | `20_sky.js` 799、`30_rock.js` 481、`35_arch.js` 1,121、`72_air.js` 774 | 场景 / 生态 | `G`、`Tex`、`SDF`、`Film` | **可以** | 不行 |
| `fx` | `70_fx.js` 1,187 行 | 特效 | `Dragon`、`Film`、`Rock`、`Flora`、`Lantern` | **可以**；火/冰/闪电/光束/爆炸/水花 | 不行；3D FX，不是 L2/L4 |
| `post` | `80_post.js` 244 行 | 后处理 | HDR、AO、bloom、god rays、grade | **可以**，world 内部 | 不行；不是 2D L4 |
| `film` | `88_film.js` 221 行 | 时间轴 / 相机 | 90 秒 beat sheet、相机轨道 | 站点级控制 | 不行 |
| `audio` | `85_audio.js` 946 行 | 服务 | Web Audio + Worker | 不是零件 | 不行 |
| `glsl/sdf/tex` | `05_glsl.js`、`10_sdf.js`、`15_tex.js` | 工具 | shader chunk / SDF / 贴图 | 母本 | 不行 |

**最值得抽的：** `dragon` + `wake` 是一对很好的“动画 + 响应场”组合；`flora` / `karst` / `water` 是场景件；`fx` 是特效件。它们可以组成未来的 `loong-lake` world，但不是现四站。

**代价：** 要把 `G` / `Film` / `Score` 这些全局单例改成宿主注入；`Dragon` 在 13 个文件里被引用，拆的时候不是搬一个文件，而是切一层依赖。代码仓库没有 LICENSE，不能直接合并；只能重写或取得授权。

## 5. `saltline-fable-5.2`：没有可维护的子件

单 HTML、一个 `<script>`、three 内联；没有模块边界。概念上可以拆成 `port-env`、`rain/fog`、`Gulls/Hounds` AI、武器、pointer lock、uplink、HUD、audio，但代码里它们是一个状态机，拆任何一件都要先反编译整份文件。

| 概念子件 | 类型 | 结论 |
|---|---|---|
| `port-env` | 场景 | 概念上有，代码上不可维护；不做 |
| `rain/fog` | 特效 | 同上 |
| `Gulls` / `Hounds` | 游戏 AI | 与四站的静观/触摸相反；不做 |
| 武器 / pointer lock / uplink | 交互 | FPS 玩法；不做 |
| HUD / audio | UI / 服务 | 不是零件；不做 |

没有 LICENSE，且字体走 Google Fonts，违反零外部请求。**0 个可维护子件；不做。**

## 6. 产品适配：哪些子件能进当前四站

| 子件/组合 | 能进哪一站 | 形态 | 判断 |
|---|---|---|---|
| `desk` + `fixtures` + `exterior` + `plants` | `/license` | 组装成 `license-desk` L1 world；纸在桌上、晨光在走 | **唯一值得试装**；不是 drop-in |
| `rainfield` + `wet-surface` + `canal-water` | 无现站；未来 `/rain` | 雨窗/雨夜城景 | 现站不接 |
| `dragon` + `wake` + `water` + `flora` | 无现站；未来 `/loong` | 龙/湖/山 | 现站不接 |
| `saltline` 任何子件 | 无 | FPS | 不做 |

**为什么 `desk` 不能直接进 `/license`：** `/license` 的纸是 L0，world 是 L1；L0 先画，L1 后画并覆盖上去。`space: 'screen'` 会把纸遮掉，`space: 'subject'` 只能把房间塞进纸的矩形里。要让“纸在桌上”成立，必须把纸做成 world 内的实体，或者重排 L0/L1；这是首屏重组，不是换零件。

**为什么 `rain`/`loong` 不能进现站：** 一场只允许一个 world/GL 件；`/hug`、`/still`、`/koi` 都已被占用。`/license` 又被纸面占据。它们的组合只能另立新站，不能塞进现有四站。

## 7. “纸面 preview”具体做什么

这里说的“纸面 preview”不是写一页纸方案，也不是改 `/license` 正式站；它是在 `shared/stage/preview` 里搭一个临时的 `dawn-desk` 试装，用来回答三个未知数。

### 7.1 装什么

- **只装 `room-at-dawn` 的 desk 一组**：`desk` + `fixtures` 里的窗帘/窗台 + `exterior` 的窗外树 + `plants` 的一盆绿萝；**不装** `bed`、`clutter`、`decor`。
- 保留 `room-shell` 和 `sky` 作为宿主；GI 先用 `room` 的 baked GI 或 desk-only 的精简烘焙。
- 桌面上放一张与 `/license` 同尺寸的纸（先用纸纹平面，不做完整纸张物理）。
- 画面只留最小 UI：H1 + 一行 hook + 一个按钮的占位；用来判断“首屏三层”是否还成立。

### 7.2 测什么

1. **纸是不是主角**：1440×900 和 390×844 两档，纸是否仍然是最先被读到的对象；desk 机位的阴影是否把纸吃掉。
2. **成本**：desk-only 已经量到 511 次 draw call / 38 万三角面；preview 要记录 `costMs`、`tris`、`calls`，看 low LOD 后能不能进 stage 预算。
3. **晨光慢变量**：做两个版本——
   - A：只做色温/亮度漂移，便宜，但不是真的 4 分钟晨光；
   - B：在 baked GI 上叠一盏可移动方向光/阴影，跑 40 秒压缩版，看能不能成立。
   如果 B 不成立，`/license` 的 4 分钟慢变量就没有着落，preview 直接判失败。
4. **纸+章的唯一动作**：点击/空格触发一次盖章占位（shader 或 canvas 贴图），不做导出；验证“纸是主角、盖章是唯一动作”是否仍然成立。
5. **首屏三层**：H1、hook、按钮是否仍然读得清；room 的 3D 背景是否抢字。

### 7.3 产出与门槛

- 产出：一个 preview 路由、两张截图（rest / stamped）、一份 `cost` 记录、一页 go/no-go。
- 门槛：**纸仍是首屏主角；`costMs` 在 stage 预算内；40 秒晨光有可行路径；三项有一项不过就停**，不进入 `/license` 正式站。
- 这个 preview 只改 `preview`，不改 `shared/parts`、不改 `/license`、不把 `room` 代码搬进产物。

### 7.4 已执行结果（2026-11-20）

`dawn-desk` preview 已经搭好，结论是 **Conditional GO**：

- 纸仍是首屏主角：1440 下纸宽 483px（33.5%），390 下 317px（81.4%）。
- 成本：裁面 + 窗形区域光后，1440 为 68 calls / 497,052 三角面 / 145 mesh / 59.9fps；390 为 61 calls / 464,564 三角面 / 59.9fps；`?full=1` 为 81 calls / 906,140 三角面。
- 单文件从 769 KB 涨到 1,019,044 B（995 KB），增量来自 `RectAreaLightUniformsLib` 的 LTC 表；正式站不应直接带这 250 KB。
- 40 秒晨光：A 色温漂移成立；B 目前只有光带移动，没有可读的窗格/物件投影。`SpotLight + cookie` 和窗框投影都试过，硬边/灯罩大影压纸，已回退；所以“真实窗光阴影”仍是未过项。
- 盖章动作成立，章在纸面纹理里，不切 DOM。

完整记录和四组截图在 [`docs/DAWN-DESK-PREVIEW-2026-11-20.md`](DAWN-DESK-PREVIEW-2026-11-20.md)，实现只在 `shared/stage/preview/dawn-desk/**`。没有改 `shared/parts`、`shared/sites` 或 `/license`。

## 8. 建议

1. **`dawn-desk` preview 已完成，结论 Conditional GO**：纸与成本两项已过，光只过了 A（色温），B 还没过。下一步不要再做形态探针；先定 desk-only 光方案：优先 GI 烘焙，工期不允许就用假窗格投影/接触阴影，不要直接把 RectAreaLight 的 LTC 表带进 `/license`。裁面策略已验证，见 `docs/DAWN-DESK-PREVIEW-2026-11-20.md`。
2. **把 `room` 的 desk/fixtures/exterior/plants 抽成 `WorldFeature`**，不要直接抽成四个 `PartV2`；`WorldFeature` 可以共享宿主 scene/camera/material/time，符合它们现在的 `build(ctx)` 形态。
3. **`rainy` / `crimson` 只做未来站的 world kit**：`rainfield`+`wet-surface` 是雨站候选；`dragon`+`wake`+`water` 是龙站候选；不要现在接。
4. **`saltline` 不做**。
5. 如果要把 `WorldFeature` 正式化，再改契约；当前 `PartV2` 一场一个 world，无法把多个 3D 子件当独立零件装配。这是结构问题，不是这些项目的问题。

## 9. 许可证（仍然有效）

| 项目 | 代码 | 资产 | 能否直接合并 |
|---|---|---|---|
| `room-at-dawn` | MIT | 音频 CC-BY-4.0，需署名；静音可去掉 | 代码可以；音频有条件 |
| `rainy-night-webgpu` | 无 LICENSE | 城模 CC-BY-4.0，30 MB | 不可以 |
| `crimson-loong` | 无 LICENSE（仅 three MIT） | 全程序化，无外部资产 | 不可以 |
| `saltline-fable-5.2` | 无 LICENSE，镜像 | Google Fonts 外链 | 不可以 |

如果只是抽“做法/参数”重写，不受这份代码许可证约束；如果要把代码搬进 `shared/parts`，只有 `room-at-dawn` 的 MIT 代码是干净的。
