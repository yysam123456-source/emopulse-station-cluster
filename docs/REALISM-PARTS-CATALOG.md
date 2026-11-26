# 写实零件库与模板装配（2026-11-24）

> 这份文件回答一件事：**寺庙场景现在由哪些零件组成、每个零件能不能被别的场景复用**。
> `shared/parts/temple/index.ts` 不是“一个 GL 零件里画一整个场景”的黑盒：场景由 `ScenePlan + SceneModule + MaterialLab` 装配，模板只负责选方案、开零件、调参数。
>
> 其他模板（deepsea / nebula / koi）的内部模块见 [`INTERNAL-SCENE-PARTS.md`](./INTERNAL-SCENE-PARTS.md)，零件总数与使用方见 [`STATUS.md`](./STATUS.md)。

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

五个模板的内部都已拆到模块级，但各用各的模块类型（下表「装配方式」列），没有共用同一套接口；逐层职责见 [`INTERNAL-SCENE-PARTS.md`](./INTERNAL-SCENE-PARTS.md) §2–§4。

| 模板 | 现有 Stage 零件 | 装配方式（装配数组所在文件） | 内部模块，按装配顺序 | 还没拆的部分 |
|---|---|---|---|---|
| `deepsea` | `abyss` / `bubbles` / `still-sink` / `pixel-post` | `abyss` 内 `AbyssScene` + 5 个 `AbyssLayer`（`shared/parts/abyss/scene.ts`） | background → rays → caustics → motes → ripples | `bubbles` / `still-sink` / `pixel-post` 是独立的 Stage 零件，内部没有再分模块 |
| `nebula` | `abyss` / `nebula` / `pixel-post` | `nebula` 内 `NebulaScene` + 4 个 `NebulaModule`（`shared/parts/nebula/scene.ts`），共享一组 uniforms | starfield → halo → arms → core | 同上 |
| `koi` | `paper-ink` / `koi-pond` | `koi-pond` 内三个类（`shared/parts/koi-pond/modules/`） | FishSchool / SurfaceEcology / CameraRig | water / caustics / paint / ink / grade 仍按上游整体 pass 调用，没有拆成 pass 模块 |
| `temple` | `temple` | `ScenePlan` + `SceneModule` + `MaterialLab`（`shared/realism/scene.ts`） | atmosphere / ridge / ground / pine-grove / shrine-hall / torii / stone-lanterns（顺序取自 `shared/realism/plans.ts` 的 `TEMPLE_DAWN`） | 无 |
| `gate` | `temple` | 同上，`TORII_GATE` 方案 | atmosphere / ridge / ground / pine-grove ×3 / torii / stone-lanterns | 无 |

装配入口：五个模板分别对应 `a2-deepsea` / `a2-nebula` / `koi` / `a2-temple` / `a2-gate` 五个 preset（`shared/stage/preview/build.mjs` 的 `PRESETS`），模板注册表在 `shared/product/templates.mjs`。

还没拆、也没有排期的：`koi` 的渲染链（拆之前要先定 RT 所有权和 pass 顺序，见 [`INTERNAL-SCENE-PARTS.md`](./INTERNAL-SCENE-PARTS.md) §7）。

## 5. 写实资产（2026-11-26 起为程序化表面）

**现行实现**：temple/gate 的材质不再依赖 `shared/realism/assets.ts` 的 base64 贴图；`materials.ts` 用 Canvas2D  painter 生成 `CanvasTexture`：

| 用途 | painter | 用法 |
|---|---|---|
| 杉木 / 深木 / 立柱 | `paintCedar` | `cedar` / `cedarVertical` / `darkWood`，重复 1.2–2.2× |
| 朱漆 | `paintRedLacquer` | 鸟居、柱、门窗框，重复 2.1× |
| 灰泥 | `paintPlaster` | 墙面，map + bump 各一份，重复 2.6×2.2 |
| 板瓦 | `paintSlate` | 屋顶，map + bump，旋转 -45°，重复 3×1.55 |
| 花岗岩 / 碎石 / 苔 / 草 | `paintStone` / `paintGravel` / `paintMoss` / `paintGrass` | 石基、砾石路、苔庭、草地；草与苔重复 18–20× |
| 树皮 | `paintBark` | 松树干，重复 2.2×5.5 |
| 植被剪影 | `paintNeedleAlpha` / `paintGrassClumpAlpha` / `paintShrubAlpha` | 松针 / 草丛 / 灌木卡片，带 alpha，`alphaTest` 0.4–0.42 |
| 天空 | `paintSky` | 1024×512 等矩形全景，`EquirectangularReflectionMapping`，天空球 |

历史对照：旧版 `shared/realism/assets.ts` 有 15 个 `data:image` 常量（12 JPEG + 3 PNG），文件头自述由 AI 生成（seedream 5.5）并压缩；本次已从 `materials.ts` / `atmosphere.ts` 的 import 图里移除，产物 `data:image` 计数为 0。该文件保留在仓库作历史对照，不再参与 temple/gate 构建。

## 6. 实时预览与摄影模式

- **运行入口**：`dist/templates/temple/index.html`、`dist/templates/gate/index.html`（`npm run build:templates`）。`dist/preview/a2-temple.html`、`a2-gate.html`（`npm run preview:a2-temple`）与它们逐字节相同。后处理链是景深（含屏幕空间遮蔽）→ bloom → ACES 色调映射 + 暗角 + 颗粒（`shared/parts/temple/index.ts`）。
- **摄影模式**：`_scratch/pt/`（不入库）。同一套 `buildScene()` + `ScenePlan`，改用 `three-gpu-pathtracer` 做路径追踪；用于检查全局光照、接触阴影和材质在物理光照下的表现。
- **照片级验收帧**：`dist/templates/temple/preview-photo.jpg`。它由实时装配帧做神经精修输出，保留原构图与物体位置，用于对外展示；**不是实时 WebGL 的帧**，不能替代模板运行验证。

## 7. 已验证 / 未达成

已验证：
- 同一 `temple` 零件可装配出 dawn / snow / dusk / gate 四种方案。
- `gate` 模板证明“关掉主殿”后仍是完整场景，不再需要新写一个寺庙。
- GPU 截图下方向光阴影正常（SwiftShader 下阴影缺失是环境限制，不是代码问题）。
- `tsc --noEmit` 0 error（2026-11-24 实跑，见 [`STATUS.md`](./STATUS.md)）；`dist/templates` 5 个模板 + `manifest.json` + Studio 已重建。

未达成（2026-11-24 实测，取证见 [`review-2026-11-24/ux-a2/WALKTHROUGH.md`](./review-2026-11-24/ux-a2/WALKTHROUGH.md) U-02、U-08、U-09；2026-11-26 已部分收口）：
- 实时 WebGL 画面仍是“高精度游戏资产”级，不是照片级；屋顶、松针、草地细节在近景仍能看出卡片/重复纹理。程序化表面替代照片贴图后，近景细节进一步简化，换来体积可分发。
- 路径追踪摄影模式仍有采样噪声，96 samples / 0.65 renderScale 下需要后续接 OIDN 或提高采样。
- **已闭**：temple 606.0 KB / gzip 160.7 KB，gate 605.9 KB / gzip 160.8 KB，均 ≤1 MB（2026-11-26 `build:templates` 实测）；Studio 已显示 Toy / 独立站门槛并红色预警。
- **已闭**：“全程序化”5/5 成立：temple/gate 产物 `data:image` 0 个；12 张 base64 贴图已换成 Canvas painter。
- **已显著缓解**：加载期暗屏从 4.99 MB 单文件降到 606 KB，桌面完整画面时间不再以 5–12 s 计；仍受主线程解析内联脚本影响。
- 体积怎么继续降（纹理分级 512/1024、按方案按需打包）已不再是 Toy 门槛的阻塞项；后续只在需要更高质量时再评估。
