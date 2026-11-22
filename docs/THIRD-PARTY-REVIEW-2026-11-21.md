# 第三方仓库拆件与 dawn-desk 装配评估（2026-11-21）

> 目的：把 4 个指定仓库拉到本地，按「场景 / 动画 / 交互」拆到零件级，再判断哪些能真正装进 `license-desk` 小世界。
> 口径：**不是把整个项目当一个小零件**；只收「可单独移除、职责单一、输入输出清楚、不依赖外部资产、许可允许」的做法或子件。

## 0. 结论先说

- 4 个指定仓库已落地：`Claude-Fable-5.2-HTML-Files`、`qingming-riverside`、`gpt6-Astra_3.js`、`awesome-claude-opus-5.5`。
- `awesome` 是索引库，不是代码库；其中真正落到本地并评估的是 `tidewater`、`summer-cycle`、`neon-pixel-city` 三个案例。
- **没有一个仓库的代码被直接复制进 `shared/parts`。** 能装进 `dawn-desk` 的是「做法」：叶簇图集、实例化叶卡、时段调色、局部光范围、低多边形器物比例、层叠远景与晨雾。
- 已装配进 `studio.ts` 的零件共 **6 类 / 9 项**：叶片图集、叶簇实例、枝干管、晨光调色、窗形局部光、远景层叠、胡桃木/黄铜/皮革材质组、桌面器物比例、尘埃与帘动。
- 明确不能装的：整间房、整座桥、水车、水面 shader、像素后处理、Hillaire 大气 LUT、雪景球。它们是另一个世界件的量级，不是桌面零件。
- 许可红线：`Claude-Fable`、`gpt6` 无项目 LICENSE；`qingming` 明确不授予复制/修改/再分发/商用；`neon-pixel-city` 无 LICENSE。以上四者只做“读代码、学做法”，不复制代码与素材。`tidewater`、`summer-cycle` 为 MIT，仍只做“重写成当前 three 栈”，不整模块塞入。

## 1. 拆件标准（PartV2 口径）

一个东西能被称为“可装配零件”，要同时过五关：

1. **可移除**：拿掉它，场景仍成立，不连带拆掉半个世界。
2. **单一职责**：只解决一件事，例如“叶簇画法”“时段调色”“局部光范围”，不是“整个花园”。
3. **输入输出清楚**：给什么参数、产出什么网格/材质/状态，能写成函数边界。
4. **资产自足**：不依赖原仓库的图片、模型、字体、音频；纹理由当前仓库重画。
5. **许可干净 + 预算可控**：许可证允许，且三角面/ draw call 在桌面场景预算内。

按这个口径，4 个仓库里多数东西是“场景作品”，不是“零件”；真正可抽的是隐藏在作品里的**语法**。

## 2. 四个指定仓库的全量盘点

### 2.1 Claude-Fable-5.2-HTML-Files（76 个自包含 HTML）

规模：78 个 HTML，其中 `index.html` + `gallery-template.html`，实际研究 **76 个**；仓库无 LICENSE。

按可拆做法分成 9 族（全量覆盖）：

| 族 | 文件（编号） | 可拆做法 | 对 dawn-desk 的判断 |
| --- | --- | --- | --- |
| 纸/印刷/编辑设计 | 015, 017, 028, 040, 045, 052, 059, 064, 067 | 纸张底色、油墨叠印、网点、栏线、页脚编号、旧印刷色 | **已用**：纸面排版、纸底色、页眉页脚；不复制代码 |
| 窗/光/天气 | 020, 026, 029, 030, 035, 046, 057, 062, 067 | 雾层、霜花、逆光、低太阳、雨雪粒子、窗格投影 | **已用**：晨雾与低太阳；候选：窗角霜花、玻璃冷凝 |
| 器物/材质研究 | 003, 005, 008, 023, 025, 033, 038, 047, 049, 051, 063, 065, 068, 071, 073, 075, 079 | 单体剖面、木纹、陶土、金属高光、透明层、机械咬合 | **已用**：胡桃木/黄铜/皮革/陶盆的材质关系；候选：书页侧边、陶盆釉面 |
| 动态/光学 | 010, 019, 037, 042, 053, 055, 069, 074 | 视错觉、相位差、频闪、砂堆崩塌、混沌轨道 | 不做：与安静签发台的性格冲突 |
| 地点/城市/地图 | 002, 024, 036, 050, 072 | 剖面城市、路线图、航站楼时刻表、河源到海 | 不做：信息密度太高 |
| 自然/程序化 | 009, 012, 013, 021, 043, 049, 060, 061, 062, 071, 074 | 鱼群/鸟群、叶脉、地衣、麦浪、潮汐 ASCII | **已用**：叶簇与晨雾；候选：地衣纹理做墙面/陶盆 |
| 字体/文字 | 011, 027, 041, 045, 064, 070 | 字标、字重、字距、旗语、字母果冻 | **已用**：`License` 的衬线排版与字距 |
| 交互玩具 | 025, 031, 032, 048, 051, 054, 058, 068, 073, 075 | 拖拽、按压、旋转、拼装、织布、拉洋片 | **已用**：拖章/按住/归档的仪式；候选：纸张拖拽的惯性 |
| 仪表/档案/博物馆 | 004, 007, 016, 022, 039, 055, 063, 072, 079 | 表盘、刻度、档案抽屉、观察窗、标本盒 | **已用**：文件盘、抽屉柜、黄铜拉手；候选：桌面小钟 |

**全量清单（76 个研究 + 2 个壳）**：001 Suminagashi、002 Airship Terminal、003 Croissant、004 Lighthouse、005 Slide Rule、006 Volcán Chico、007 Ice Core、008 Impossible Minerals、009 Koi Pond、010 Op Art、011 Hours in Words、012 Murmuration、013 Iron Filings、014 Ulam Spiral、015 Maison Ombre、016 Lunar Descent、017 Spore Print、018 Pen Plotter、019 Bauhaus Drum、020 Aurora、021 Moths、022 Hotel Elevator、023 Walnut Turntable、024 Village of 300、025 Pottery Wheel、026 Frost on Window、027 Calligrams、028 Conservas、029 Skerry Weather、030 Rose Window、031 Tangram、032 Night Typist、033 Lava Lamp、034 Obsolete Sounds、035 Totality、036 Kestrel Bicycles、037 Pendulum Wave、038 Instant Film、039 Mars Greenhouse、040 Harbour Courier、041 Jelly Alphabet、042 Dance of Venus、043 Lichen on Slate、044 Ariadne's Thread、045 Halden Grotesk、046 Snow at the Bridge、047 Atelier Vesper、048 Cross-Stitch、049 Conchology、050 River Source to Sea、051 Pinscreen、052 Béton Brut、053 Sandpile、054 Matryoshka、055 Seismograph、056 The Combination、057 Year of Daylight、058 Drawloom、059 Pluvia Umbrellas、060 ASCII Tide、061 Moon Tonight、062 Wheat Before Rain、063 Astrolabe、064 Par Avion、065 Ripple Tank、066 Night Diner、067 History of Fog、068 Gelato Tower、069 Strange Attractors、070 Semaphore、071 Apiary No. 9、072 Lumen Town Grid、073 Zoetrope、074 Collatz Kelp、075 Wood Type Avalanche、079 Formicarium；另有 `index.html`、`gallery-template.html`。

> 这一族的强项不是 3D，而是**纸、印刷、窗、雾、器物剖面**的视觉语法。对 `dawn-desk` 最有用的三件：纸张底色与油墨层次、窗的逆光/雾层、器物剖面的比例感。

### 2.2 qingming-riverside（清明上河 3D 长卷）

规模：约 895MB（含大量视频/美术源）；本次用 sparse checkout 只取 `src/ docs/ scripts/ vendor/`，代码约 14,349 行。LICENSE 明确：**未授予额外复制、修改、再分发、商业复用**，只可站内查看与 fork。

按子系统拆：

| 子系统 | 文件 | 做法 | 对 dawn-desk 的判断 |
| --- | --- | --- | --- |
| 水面 | `water-three.js`（200 行） | 多层噪声、沿流速的两份纹样 crossfade、河心加速、镜面高光、岸线渐隐 | **不装**：桌面没有水；将来做池塘世界件可重写 |
| 时段大气 | `atlas-atmosphere.js` | 月相/节气/时段驱动的天空与雾色 | **装概念**：晨光色温、雾层；不搬 LUT |
| 夜景灯 | `night.js`（184 行） | 灯笼局部光、纸窗透光、地面光斑、余烬粒子 | **装概念**：台灯局部光与尘埃；代码是 Canvas2D，不搬 |
| 桥 | `bridge-art.js` | 程序化桥体、船、绳、栏杆 | 不装：尺度不对 |
| 水车 | `mill-wheel.js` | 轮辐、叶片、转动节拍 | 不装：另一个世界件 |
| 背景 | `scene-backdrop.js` | 分层远景/视差/画卷边界 | **已用**：窗外三层山与雾；重画为 Canvas |
| 世界/漫游 | `crossing-*`（8 个）、`explore-*`（5 个） | 空间分区、hero 机位、运动、质量分级、隧道 | 不装：长卷漫游框架 |
| 人物/节庆 | `inhabitants.js`、`people-*`、`extension-*`、`sunyang-*`、`tea-study-*`、`festival-*` | 人群、摊位、节日灯、花街、茶室 | 不装：桌面只需要“一个人来过”的痕迹，不需要人群 |

结论：qingming 的**空间层次、雾/水做法、局部灯**可学；**水面、桥、水车、人群**不能装。许可不允许复制，全部只做参考。

### 2.3 gpt6-Astra_3.js（6 个独立 Three.js 微缩场景）

规模：6 个自包含 HTML，每个约 1.34–1.46MB，内联 Three.js r169 + OrbitControls。`README` 明确：第三方许可不延及原创场景代码；仓库**无项目 LICENSE**。

| 场景 | 文件 | 可拆零件/做法 | 对 dawn-desk 的判断 |
| --- | --- | --- | --- |
| 海风之屿 | `海风之屿.html` | 木屋/灯塔/码头比例、浅海透明层、低多边形礁石 | 候选：木屋榫卯/木板缝做桌体细节；海不装 |
| 雨夜便利店 | `雨夜便利店.html` | 雨丝、积水反射、暖光货架、街角构图 | 不装：气质是夜间城市；可做未来“雨夜世界件” |
| 木漏时光 | `木漏时光.html` | 木制布谷钟、水车、分层流水、夕阳穿林 | **装概念**：木构件比例、暖木配色；机构不装 |
| 晨雾稻田水车村 | `晨雾稻田水车村.html` | 三层稻田、山泉引水、跌水、竹林、飘叶、薄雾 | **已用**：窗外田垄/雾/低太阳；水车不装 |
| 雨后紫藤溪谷温室 | `雨后紫藤溪谷温室.html` | 玻璃温室、紫藤廊架、溪流花池、落花、陶盆 | **装概念**：玻璃/陶盆/落花；温室不装 |
| 北京故宫雪景水晶球 | `北京故宫雪景水晶球.html` | 8200 片八类雪晶、玻璃折射、起风交互 | 不装：雪景球是完整世界件；可做冬季限定 |

结论：gpt6 最有用的是**低多边形器物的比例、暖木配色、玻璃/水/植被的层次**；六个场景本身都不能当零件。

### 2.4 awesome-claude-opus-5.5（案例索引库）

规模：7.4MB，`cases.json` 共 **1,034 条**案例索引，配 `cases.csv`、`ALL_CASES.md`、`index.html`、`media.json`。它本身**不是可运行代码**，只是链接/索引。逐个克隆不现实，本次从中挑出 3 个与书房相关的 Three.js 项目落地：

| 案例 | 许可 | 可拆子件 | 装配判断 |
| --- | --- | --- | --- |
| tidewater | MIT | `PlantGeometry`（叶片/棕榈/蕨类部件 id、茎管、叶簇）；`LocalLights`（最多 8 盏最近局部灯打包 uniform、GGX、范围窗）；`Atmosphere`（Hillaire LUT） | **叶簇语法已用**；局部光范围已用概念；LUT 不装 |
| summer-cycle | MIT | `vegetation.ts`（叶簇卡片、程序化树/灌木）；`leafAtlas.ts`（叶簇图集 + 叶脉/暗边/渐变）；`timeofday.ts`（白天/黄金/黄昏/夜晚调色板 + 雾色 + 曝光）；`lights.ts`、`sky.ts` | **叶图集、实例化叶卡、时段调色已用**；天空模型不装 |
| neon-pixel-city | 无 LICENSE | 像素化后处理、霓虹城市 | 不装：当前书房不需要像素后处理；且无许可 |

结论：`awesome` 的价值是**索引与候选池**，不是代码；只有 MIT 的 tidewater / summer-cycle 可拆“做法”，且仍需重写。

## 3. 零件候选矩阵（22 项）

图例：**已装** = 已进 `studio.ts`；**候选** = 下一版可装；**未来** = 另一个世界件；**拒绝** = 不装。

| # | 来源 | 零件/做法 | 类型 | 许可 | 判断 |
| --- | --- | --- | --- | --- | --- |
| 1 | summer-cycle | 2×2 叶簇图集，叶脉/暗边/渐变 | 纹理 | MIT | 已装：`paintLeafAtlas` |
| 2 | summer-cycle | 叶簇卡片 + 实例化 | 几何/动画 | MIT | 已装：`InstancedMesh` |
| 3 | tidewater | 叶片/茎管部件拆分 | 几何 | MIT | 已装概念：TubeGeometry 枝干 |
| 4 | summer-cycle | 时段调色板 + 雾色 + 曝光 | 灯光 | MIT | 已装：`dawn()` 的暖光曲线 |
| 5 | tidewater | 最近局部灯 + 范围窗 | 灯光 | MIT | 已装概念：窗形 RectAreaLight + 台灯 PointLight |
| 6 | qingming | 分层远景/雾/画卷边界 | 场景 | 禁止复制 | 已装概念：窗外三山与雾 |
| 7 | gpt6 | 低多边形木构件比例 | 造型 | 无许可 | 已装：桌/灯/书/盘 |
| 8 | gpt6 | 暖木 + 黄铜 + 陶土配色 | 材质 | 无许可 | 已装：胡桃木/黄铜/陶盆 |
| 9 | gpt6 | 玻璃/陶盆/落花层次 | 材质 | 无许可 | 候选：窗玻璃冷凝、陶盆釉面 |
| 10 | Claude-Fable | 纸张底色/油墨/栏线/页脚 | 排版 | 无许可 | 已装：`paintPaper` |
| 11 | Claude-Fable | 窗霜/冷凝/逆光 | 纹理 | 无许可 | 候选：窗角霜花 |
| 12 | Claude-Fable | 雾层与低太阳 | 场景 | 无许可 | 已装：`paintSky` |
| 13 | Claude-Fable | 器物剖面/书页侧边 | 造型 | 无许可 | 候选：书页白边、抽屉缝 |
| 14 | qingming | 灯笼局部光/余烬 | 灯光/粒子 | 禁止复制 | 已装概念：尘埃粒子 |
| 15 | qingming | 水面 crossfade/镜面 | shader | 禁止复制 | 未来：池塘世界件 |
| 16 | qingming | 程序化桥/水车 | 几何 | 禁止复制 | 拒绝：尺度不对 |
| 17 | gpt6 | 雨丝/积水反射 | shader | 无许可 | 未来：雨夜世界件 |
| 18 | gpt6 | 雪晶/玻璃球 | 粒子 | 无许可 | 未来：冬季限定 |
| 19 | tidewater | Hillaire 大气 LUT | 天空 | MIT | 拒绝：桌面场景过重 |
| 20 | summer-cycle | 程序化树/灌木 | 几何 | MIT | 候选：更密的榕树冠 |
| 21 | neon-pixel-city | 像素后处理 | 后处理 | 无 | 拒绝：气质不合 |
| 22 | 自建 | 拖章/按住/落章/归档/复位 | 交互 | 自有 | 已装：vertical slice 主链路 |

## 4. 已装配进 `studio.ts` 的零件

### 4.1 场景（Scene）

- **房间**：8.0m 宽石膏墙、木地板、旧羊毛地毯、深色踢脚线 + 黄铜压条。
- **窗**：1.02×0.63m 低窗，深色木框 + 竖梃/横梃，窗台高出桌面 8cm；窗外是 Canvas 画的晨雾、三层远山、低太阳、田垄、柏树剪影。
- **桌**：1.5×0.78m 胡桃木写字台，圆角桌板、薄木裙、右侧双抽屉 + 黄铜拉手/锁孔、四条锥形腿 + 黄铜脚箍；桌面 0.96×0.67m 深绿皮革桌垫，四角黄铜钉。
- **装饰**：黄铜台灯（弯管、奶油色锥形灯罩、暖色灯泡）、三本旧书、木文件盘（黄铜唇边）、陶盆榕树、墙面植物版画、圆形黄铜挂镜、左下角皮革笔记本 + 铜笔、地毯、尘埃。
- **纸**：0.78×0.552m，宽屏约 53.9%、移动端约 88%；unlit 纸材质 + 边缘接触阴影，优先保正文可读性。

### 4.2 动画（Animation）

- 叶片毫米级摆动（两个不同频率叠加，避免水草感）。
- 亚麻窗帘微动（几何褶皱，非贴图）。
- 尘埃粒子沿窗光缓慢漂移。
- 40s 晨光：太阳位置/强度、窗形区域光、半球光、曝光随 `p` 推进。
- 纸张归档时抬起、缩小、淡出；落章时红墨扩散 `inkRipple`。

### 4.3 交互（Interaction）

- 桌面端：拖起印章 → 移到纸上 → 按住 0.8s → 红章出现 → 印章回印台 → 纸拖入文件盘 → 纸抬起缩小淡出。
- 移动端：先点印章，再点纸；`mobileMode` 分支。
- 最终覆盖层：`NO COPY KEPT. / You may simply be. / Issue another`，可复位。
- 交互提示：`DRAG THE STAMP TO THE PAPER` / `TAP THE STAMP`，深色 HUD 适配亮背景。

## 5. 性能与预算

- 宽屏 1440×900：约 148 draw calls / 18,238 tris / 74 meshes / 59.89fps（加挂镜与笔记本后略增）。
- 移动端 390×844：约 129 calls / 16,150 tris / 74 meshes / 59.90fps（同上）。
- 预算红线：桌面场景 ≤ 200 calls / ≤ 30k tris；当前余量充足，挂镜/笔记本/更密叶簇仍可承受。
- 大件（水面、桥、水车、雪晶、Hillaire）单件就会把 draw call 或 shader 复杂度推到另一个量级，因此不进桌面。

## 6. 许可与“没有复制”的证明

- `Claude-Fable`：无 LICENSE → 只读，不复制 HTML/CSS/Canvas 代码或图片。
- `qingming`：LICENSE 明确不授予复制/修改/再分发/商用 → 只读，不复制 `water-three.js`、`night.js` 等。
- `gpt6`：无项目 LICENSE，仅 Three.js MIT → 只读，不复制场景 HTML 或贴图。
- `awesome`：索引库；`tidewater`、`summer-cycle` 为 MIT，但本次只把“叶图集/实例化/时段调色”的**做法**重写成当前 three 栈，没有把第三方模块放进 `shared/parts`。
- 当前 `studio.ts` 的叶片图集、桌体、灯、窗、纸面、挂镜均为自绘/自建；第三方仓库只提供“语法参考”。

## 7. 风险与未决

1. **纸的 3D 感 vs 可读性**：unlit 纸解决了正文被灯光洗白，但纸面偏平；下一版用纹理内的斜向渐变 + 接触阴影补回“纸”的体积，不回到 Standard 材质。
2. **移动端纸占比 86.6%**：纸是主角但已接近屏幕边缘；当前保留，若还要更多桌面环境可再把相机后撤到 80–84%。
3. **右侧墙面**：曾误判为“墙体缺口”，实为台灯 PointLight 的硬范围光斑 + 地面未铺满；地面已扩到 8m，PointLight 改为无 distance 截止，光斑已消失。
4. **40s 暖光**：已把曝光压到 1.04–1.06、窗光 4.0、太阳 1.47；40s 桌面不再过曝，纸面仍是最亮面。
5. **交互回归**：桌面拖章→按住→落章→拖纸归档→复位已通过；移动端两击盖章也通过。手机点击必须像真人一样按住 100ms 以上，瞬时 click 不会跨帧，不作为失败。移动端新增 58px 章命中半径。
6. **架构**：`WorldFeature` 仍未定义；`dawn-desk` 仍是预览专用 L1 world 件，不进 `shared/parts` 或正式 `/license`。

## 8. 下一版装配优先级

**P0（本轮已做）**：叶图集/实例、晨光调色、窗形光、层叠远景、木/铜/皮革材质、桌面器物、拖章闭环。
**P1（下一版，低成本）**：窗角霜花（Claude-Fable 026）、书页白边/抽屉缝（Claude-Fable 器物族）、陶盆釉面高光（gpt6 温室）、榕树叶背透光（summer-cycle）、更密的树冠（summer-cycle vegetation）。
**P2（另一个世界件）**：池塘水面（qingming water）、雨夜街角（gpt6 便利店）、雪景球（gpt6 故宫）、像素后处理（neon-pixel-city）。
**拒绝**：整间房、整座桥、水车、人群、Hillaire LUT、把四个项目整包当零件。

## 9. 最终验收

- `npx tsc --noEmit`：0 errors。
- `npm run preview:dawn-desk`：构建成功，`dist/preview/dawn-desk.html` 819,487 B。
- `npm run verify:preview`：**PASS 625/625**。
- 桌面真实浏览器：拖章→按住 0.8s→落章→拖纸入盘→`NO COPY KEPT`→`Issue another` 复位，全部通过，`errors []`。
- 移动端真实浏览器：点章（按住 140ms）→点纸→落章→拖纸入盘→复位，全部通过，`errors []`。
- 截图：`slice-wide-1440.png`、`slice-mobile-390.png`、`slice-wide-warm-1440.png`、`slice-mobile-warm-390.png`、`slice-mobile-tapped-stamp.png`、`slice-mobile-filed.png` 均为最新构建。

---

*本报告只记录拆件判断与自建实现，不包含任何第三方代码或素材。*
