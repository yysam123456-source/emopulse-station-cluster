# 写实零件库与模板装配（2026-11-23）

> 这份文件回答一件事：**寺庙场景现在由哪些零件组成、每个零件能不能被别的场景复用**。
> 旧的 `shared/parts/temple/index.ts` 是“一个 GL 零件里画一整个场景”的黑盒实现；本轮已把它拆成 `ScenePlan + SceneModule + MaterialLab`，模板只负责选方案、开零件、调参数。
>
> 其他模板（deepsea / nebula / koi）的内部模块见 [`INTERNAL-SCENE-PARTS.md`](./INTERNAL-SCENE-PARTS.md)。

## 1. 分层

```text
ScenePlan（构图 / 光照 / 雾 / 后处理 / 地形）
  └─ SceneModule 清单（atmosphere / ridge / ground / shrine-hall / torii / stone-lanterns / pine-grove）
       └─ MaterialLab（杉木 / 朱漆 / 灰泥 / 板瓦 / 花岗岩 / 苔地 / 松针 / 障子）
            └─ primitives（box / cylinder / beam / tube / ribbon / rock / contactShadow）
```

- **零件**：一个可独立放置、可开关、可换参数的能力单元，例如“鸟居”“石灯笼”“松林”“苔庭”。
- **方案**：零件清单 + 每个零件的位移/缩放/参数，例如 `TEMPLE_DAWN`。
- **模板**：方案 + 镜头 + 产品参数，例如 `temple` 模板。
- Stage 侧仍只有一个 GL 零件（`PartV2` 单 GL / 单 L4 契约不变），但内部不再是一个整场景。

## 2. 标准零件

| 零件 id | 能力 | 关键参数 | 用在哪些方案 | 能否跨场景 |
|---|---|---|---|---|
| `atmosphere` | 晨空全景、太阳/半球/补光/轮廓光、雾带、尘埃 | 天空贴图、太阳方向/强度、曝光 | dawn / snow / dusk / gate | 可，任何室外场景 |
| `ridge` | 两层远山山脊、雾中空气透视、雪线换色 | 层数、高度、宽度、颜色 | dawn / snow / dusk / gate | 可，任何室外远景 |
| `ground` | 起伏苔庭、碎石路、石板、路肩、草、落叶、散石 | 地形尺寸、路宽、草量、雪、石量 | dawn / snow / dusk / gate | 可，任何地面场景 |
| `shrine-hall` | 石基、石阶、朱漆柱、灰泥墙、障子、斗拱、四坡瓦顶、侧殿、吊灯笼 | 位置、缩放、屋顶举折、材质方案 | dawn / snow / dusk | 可单独作为“主殿”场景 |
| `torii` | 朱漆鸟居、笠木曲线、额束/匾、注连绳、纸垂、石龟趺、苔 | 位置、缩放、旋转、旧化程度 | dawn / snow / dusk / gate | 可，山门/入口/边界 |
| `stone-lanterns` | 石灯笼火袋/笠/宝珠/暖光/苔 | 位置、数量、亮度 | dawn / snow / dusk / gate | 可，庭院/路径/水边 |
| `pine-grove` | 弯曲主干、分层枝、真实松枝 alpha 树冠、灌木、根石 | 位置、高度、倾斜、密度 | dawn / snow / dusk / gate | 可，任何庭院/山林 |

材质不是零件：`MaterialLab` 是共享表面库，零件只按语义取表面（`cedar` / `redLacquer` / `plaster` / `roofTile` / `stone` / `grass` / `moss` / `bark` / `shoji` …），改一处材质所有场景同步生效。

## 3. 方案与模板

| 方案 | 零件清单 | 用途 |
|---|---|---|
| `TEMPLE_DAWN` | atmosphere + ridge + ground + pine-grove + shrine-hall + torii + stone-lanterns | 晨光山门与主殿 |
| `SHRINE_SNOW` | 同上，地形切雪、草量 0、石灯 0.55 | 雪霁 |
| `TEMPLE_DUSK` | 同上，换暮色光照、石灯 1.0 | 暮色 |
| `TORII_GATE` | atmosphere + ridge + ground + pine-grove + torii + stone-lanterns（**去掉主殿**） | 独立山门，证明同一零件库能重装出另一个场景 |

对应产品模板：

| 模板 id | 方案 | 零件 | 说明 |
|---|---|---|---|
| `temple` | dawn（可切 snow/dusk/gate） | `temple` | 主殿+鸟居完整场景 |
| `gate` | gate | `temple` | 同一个 `temple` 零件，关掉主殿，换 `TORII_GATE` 方案 |

`temple` 零件新增的开关：`scene`、`fog`、`lanterns`、`orbit`、`torii`、`pines`、`stoneLanterns`、`hall`。模板参数直接映射这些开关，不再需要改代码。

## 4. 其他模板的零件化现状

| 模板 | 现有 Stage 零件 | 内部是否已拆到能力级 | 说明 |
|---|---|---|---|
| `deepsea` | `abyss` / `bubbles` / `still-sink` / `pixel-post` | 否（仍是各零件内部整段实现） | 已是多零件装配，但零件内部没有 SceneModule 化 |
| `nebula` | `abyss` / `nebula` / `pixel-post` | 否 | 同上 |
| `koi` | `paper-ink` / `koi-pond` | 否 | `koi-pond` 仍是单文件整场景 |
| `temple` | `temple` | **是**（7 个 SceneModule + MaterialLab） | 本轮完成 |

结论：本轮把“写实室外场景”这条链拆到了能力级，并新增 `gate` 方案验证复用；`deepsea / nebula / koi` 仍停在“多 Stage 零件装配”，下一步应按同一套 `SceneModule` 规则继续拆，而不是继续在单文件里调参。

## 5. 写实资产

- 屋顶：`ROOF_JPG` 真实板瓦照片，世界坐标 UV，横向按宽度、纵向按坡高，瓦垄竖直。
- 地面：`GRASS_JPG` 正俯拍苔庭/短草地表，重复 20×20；不再用“绿圆片”苔藓球。
- 天空：`SKY2_JPG` 2:1 晨空全景，暖金到冷蓝过渡，作为天空球 + IBL。
- 植被：`PINE_CUT_PNG` / `GRASS_CUT_PNG` / `SHRUB_CUT_PNG` 真透明 PNG，alphaTest + normal-up 卡片。
- 材质：杉木/朱漆/灰泥/花岗岩/碎石/松树皮均为照片贴图 + 程序化 bump；板瓦 roughness 0.78、metalness 0、clearcoat 0。

## 6. 实时预览与摄影模式

- **实时预览**：`dist/preview/a2-temple.html`、`a2-gate.html`。WebGL 光栅 + GPU 阴影 + 景深 + SSAO + ACES/胶片分级。这是模板真正运行的东西。
- **摄影模式**：`_scratch/pt/`。同一套 `buildScene()` + `ScenePlan`，改用 `three-gpu-pathtracer` 做路径追踪；用于检查全局光照、接触阴影和材质在物理光照下的表现。
- **照片级验收帧**：`dist/templates/temple/preview-photo.jpg`。它由实时装配帧做神经精修输出，保留原构图与物体位置，用于对外展示；**不是实时 WebGL 的帧**，不能替代模板运行验证。

## 7. 已验证 / 未达成

已验证：
- 同一 `temple` 零件可装配出 dawn / snow / dusk / gate 四种方案。
- `gate` 模板证明“关掉主殿”后仍是完整场景，不再需要新写一个寺庙。
- GPU 截图下方向光阴影正常（SwiftShader 下阴影缺失是环境限制，不是代码问题）。
- 全量 `tsc --noEmit` 通过；`dist/templates` 5 个模板 + `manifest.json` + Studio 已重建。

未达成：
- 实时 WebGL 画面仍是“高精度游戏资产”级，不是照片级；屋顶、松针、草地细节在近景仍能看出卡片/重复纹理。
- 路径追踪摄影模式仍有采样噪声，96 samples / 0.65 renderScale 下需要后续接 OIDN 或提高采样。
- `deepsea / nebula / koi` 内部尚未拆到 SceneModule 级。
- 模板单文件约 4.87 MB（gzip 3.37 MB），体积仍偏大；下一步应做纹理分级（512/1024）和按方案按需打包。
