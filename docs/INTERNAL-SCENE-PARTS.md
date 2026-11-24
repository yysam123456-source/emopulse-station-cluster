# 内部场景零件化清单（2026-11-24）

> 目标：每个模板不再是一个“整场黑盒”，而是由可独立增删/开关/调序的内部零件装配。
> 这份清单只记录**已经落到代码里**的模块；计划中的不算。

## 1. 总览

| 模板 | 内部装配方式 | 已拆出的零件 | 还没拆的部分 |
|---|---|---|---|
| `temple` | `ScenePlan` + `SceneModule` | atmosphere / ridge / ground / shrine-hall / torii / stone-lanterns / pine-grove | 无（写实室外链已拆完） |
| `deepsea` | `AbyssScene` + 5 个 `AbyssLayer` | background / rays / caustics / motes / ripples；另有 Stage 层 bubbles / still-sink / pixel-post | 无（水层已拆完） |
| `nebula` | `NebulaScene` + 4 个 `NebulaModule` | starfield / halo / arms / core | 无（星系层已拆完） |
| `koi` | `koi-pond` 内三个独立模块 + 上游 pass | FishSchool / SurfaceEcology / CameraRig | water / caustics / paint / ink / grade 仍按上游 `comp` / `paint` / `ink` 整体调用，尚未拆成 pass 模块 |

## 2. deepsea：五层水

| 零件 id | 职责 | 私有状态 | 每帧动作 |
|---|---|---|---|
| `background` | 深水渐变、顶部冷光、暗角、颗粒 | 离屏 canvas 缓存 | 画缓存或纯色底 |
| `rays` | 顶部斜射光柱 | 无 | 加法混合 + blur |
| `caustics` | 水面焦散线 | 无 | 9 条正弦线（low 5 条） |
| `motes` | 悬浮微粒 | 固定 seed 的微粒数组 | 漂移 + 呼吸透明度 |
| `ripples` | 指针涟漪 | 涟漪数组 | 按下沿生成、1.8s 衰减 |

装配顺序写在 `shared/parts/abyss/scene.ts` 的 `layers` 数组里；删掉一层不用改任何绘制代码。`abyss` 本体只剩 `PartV2` 声明和 `update/draw/resize` 转发。

## 3. nebula：四个星系件

| 零件 id | 职责 | 几何/材质 | 是否可关 |
|---|---|---|---|
| `starfield` | 背景星场 | 900 颗球面分布点，冷/暖双色 | `?starfield=0` |
| `halo` | 尘埃晕 | 1,800 颗大半径低透明粒子 | 装配时移除 |
| `arms` | 四旋臂主粒子 | 22,000 颗粒子，半径 5.4 | 装配时移除 |
| `core` | 中心核球 + 光晕 | 4,200 颗粒子 + 加法 sprite | `?coreGlow=0` |

四个模块共享同一组 `NebulaUniforms`（时间、脉冲、色板、缩放），所以改色/改速度不需要逐个模块同步。装配顺序写在 `shared/parts/nebula/scene.ts` 的 `modules` 数组里。

## 4. koi：鱼群 / 生态 / 镜头

| 零件 | 文件 | 职责 | 对外接口 |
|---|---|---|---|
| `FishSchool` | `shared/parts/koi-pond/modules/fish-school.ts` | 创建 Koi、挂鱼体/鱼影、按 LOD 增减数量、切换 glaze | `add / setCount / setPainted / update / dispose` |
| `SurfaceEcology` | `shared/parts/koi-pond/modules/surface-ecology.ts` | 浮萍、浮叶、投食、阴影层 | `layout / update / dropPellets / pads / pellets` |
| `CameraRig` | `shared/parts/koi-pond/modules/camera-rig.ts` | Top / Angle / Orbit、elevation 缓动、最斜视角覆盖半径 | `place / step / setMode / setStyle / reach` |

这三块已经从 930 行的 `index.ts` 闭包里拿出来；水体颜色、焦散、鱼体着色器、水彩/水墨仍来自 `shared/parts-library/koi/` 上游文件，没有重写。

**为什么 water/paint/ink 没继续拆**：它们不是三个独立零件，而是一条共享 `comp`、`shared` uniform、多个 RT 的渲染链：
`shadowRT → causticRT → fishRT → sceneRT → composite → grade`，以及 `pigRT → paint/ink`。
把其中一段单独抽出去，必须把 RT 生命周期和 `comp` uniform 一起搬走；这会改变上游逐帧行为。当前先保留整体 pass，等鱼群/生态/镜头稳定后再做 pass 级拆分。

## 5. 装配入口

- `deepsea`：`a2-deepsea` preset，Stage 顺序 `abyss → bubbles → still-sink → pixel-post`
- `nebula`：`a2-nebula` preset，Stage 顺序 `abyss → nebula → pixel-post`
- `koi`：`koi` preset，Stage 顺序 `paper-ink → koi-pond`
- `temple` / `gate`：`a2-temple` / `a2-gate` preset，单 `temple` 零件内部 7 个 SceneModule

## 6. 本轮验证

| 场景 | 验证方式 | 结果 |
|---|---|---|
| `deepsea` | `tsc --noEmit` + `a2-deepsea.html` 1280×720 GPU 截图 | `ready`，4 零件绘制，无报错 |
| `nebula` | `tsc --noEmit` + `a2-nebula.html` 1280×720 GPU 截图 | `ready`，3 零件绘制，星场/核球正常 |
| `koi` ink | `a2-koi.html` 1280×720 GPU 截图 | `ready`，纸/墨/鱼正常 |
| `koi` paint | `?style=paint&cam=angle&mode=feed&floor=pebble` | `ready`，水彩纸纹/浮萍正常 |
| `koi` real | `?style=real&cam=angle&floor=sky&rain=drizzle` | `ready`，水面焦散/锦鲤/雨纹正常 |
| `koi` feed | `?style=real&mode=feed&cam=angle` + 3 次 `tap` | `ready`，鱼群向投食点聚拢 |
| `koi` call | `?style=paint&mode=call&cam=orbit` + 2 次 `tap` | `ready`，无异常；单帧 tap 不足以模拟“按住唤鱼”，交互效果待长按验证 |
| `temple` / `gate` | 已交付，模板与 Studio 重建 | `ready` |

## 7. 还没做

- `koi` 的 water/caustic/paint/ink/grade 仍是整体 pass，不是独立零件；下一步要拆必须先定 RT 所有权和 pass 顺序。
- `paper-ink` 仍是单张烘焙纸（一次生成、不平铺），内部没有可拆的零件；它是 L0 底材，不是场景层。
- `deepsea` 的 `bubbles` / `still-sink` / `pixel-post` 是 Stage 零件，不是 `abyss` 的内部层；它们本来就已经独立。

## 8. 第三方项目的同层拆分

内部场景的 `SceneModule` 经验已抽成 `shared/parts/world-feature.ts`，并先落到 `room-at-dawn`：

- 9 个 `WorldFeature`：`room-shell`、`sky`、`exterior`、`fixtures`、`bed`、`desk`、`plants`、`clutter`、`decor`；
- 契约：`shared/parts/world-feature.ts`（`WorldFeature`、`WorldFeatureHost`；不是 PartV2，不进零件注册表）；
- 适配文件：`shared/parts-library/room-at-dawn/features.ts`；
- 装配冒烟（入口 `_scratch/room-feature-smoke.ts`，不入库）：全量 9 件 build 10,479 ms；子集 `only=desk,fixtures,exterior,plants` build 3,607 ms、837,362 tris（`room-shell`、`sky` 恒装，所以子集实际是 6 件）；
- 诊断截图：`docs/preview/third-party/room-at-dawn-features.png`（9 件全量）、`docs/preview/third-party/room-at-dawn-features-desk.png`（desk 子集），法线材质，不是成品光照；
- 逐文件审计：`docs/THIRD-PARTY-CODE-AUDIT-2026-11-24.md`；
- `rainy-night-webgpu` / `crimson-loong`：拆解数为 0，没有 `WorldFeature`，也没有 PartV2。库里各有上游原件的一个子集作对照——`shared/parts-library/rain-webgpu/` 4 个 `.ts`（上游 25 个模块）、`shared/parts-library/crimson-loong/` 3 个 `.js`（上游 18 个脚本），加一个 v1 壳；这些文件在 2026-11-17 的首个提交 `30847cb` 就已入库。审计里列的 10 / 9 个视觉 feature 只是边界划分，代码里不存在；
- `saltline` 不做（单文件状态机，没有模块边界）。

## 9. 后续（2026-11-24 评审）

- 已落地：9 个 `WorldFeature` + `WorldFeatureHost` 契约；但已跟踪代码里没有任何装配入口，唯一调用方在 `_scratch/`。
- 评审建议（P2）：出现使用方（站或模板）之前，不再给 9 个 `WorldFeature` 新增装配投入；要接就先进一个 preset 并跑 bench。
- 待裁决：是否为 `room-at-dawn` 立新站、是否为 `rainy-night-webgpu` 立 WebGPU 新站（前提：许可证、three 版本、`WebGPURenderer`）、是否允许无 LICENSE 源码进可分发仓库。见 `docs/THIRD-PARTY-CODE-AUDIT-2026-11-24.md` §6.2。

