# A2 Sub1 Studio 实现路径与 Portal 融合评估

> 基于 `emopulse_station_cluster` 与 `frontend-design-portal` 的决策稿  
> 日期：2026-11-23  
> 状态：待拍板 / 可作为 A2 立项与施工依据  
> 范围：A2 产品实现路径、现有资产复用、Portal 融合方式、工期与验收门；不包含具体代码实现。

> **2026-11-23 追问复核修正**
> 上一稿第 4 节只抽读了 8–10 个 Showcase，未做全量；经补扫，Portal Showcases 实际为 **103 个**（27 个本地 + 76 个 Fable 远程），组件为 19 个项目/5,000+。本稿新增 **§17**，修正第 4 节的数量判断。另：复核 `Stage` 装配代码后，**多模板装配可以直接复用 `Stage`**，不需要另造 A2 Runtime；§7 的“独立 A2 Core”应收敛为“Stage + Template 适配层”，详见 §17.3。全量清单见 `docs/A2-SHOWCASE-INVENTORY.csv`。

---

## 0. 结论先行

**结论 1：A2 不能按设计稿的 Week 1–4 直接上线。**  
本仓库是一个“单域名、按路径分站”的情绪价值站点工程，核心是“零件 + 六层装配运行时 + 站点装配”；A2 要的是“模板 + 参数化生成 + 用户侧导出”的产品。两者不是同一个抽象层。把现有四站直接包装成模板，会得到一个没有参数、没有导出、没有模板目录的“四个静态样例站”，不是可售卖产品。

**结论 2：设计稿写的 M0“深海粒子项目存量改造”，在本仓库不成立。**  
本仓库没有“深海粒子项目”：`still` 是 WebGPU 体素水下世界，`bubbles` 是 2D 气泡，Portal 的 `AbyssalDescent` 是图片序列，三者都不是“3D 深海粒子”。本仓库唯一能承接 M0 的现成 3D 模板是 **koi**。所以 M0 要么改为 **koi 模板化**，要么先把原深海粒子项目的路径交出来。

**结论 3：Portal 不是 A2 的模板库，也不是 A2 的运行时。**  
`frontend-design-portal` 是一个 5,000+ 组件、19 个项目、**103 个整页 demo（27 个本地 + 76 个 Fable 远程）**的“前端设计目录 + 预览/代码浏览 + SEO 站”。它可以做 A2 的**展示层、流量入口、设计参考和素材矿**，但不能直接提供 A2 需要的三套可售卖 3D 模板、参数 schema、体积检查器和导出器。

**结论 4：推荐“三平面”架构，而不是代码大合并。**  
A2 渲染层直接用现有 `Stage`（单 GL + L0–L5 合成），上面加 `TemplateSpec`（模板元数据 + composition 工厂 + 参数 schema）、构建/体积/导出层、A2 Studio（参数化生成器）、Portal（展示/SEO/导流）；四者同域、分构建、弱耦合。**不新造 A2 渲染运行时。** Portal 的 React 代码不进入 A2 导出物；A2 的 Three.js 运行时也不进入 Portal 的组件目录。融合点在**产品层和数据层**，不在运行时。

**结论 5：首版应当做“A2 Lite”，不是“A2 Full”。**  
A2 Lite = koi 单模板 + 最小 Studio + 单 HTML 导出 + 体积门 + Portal 展示页，约 **10–15 人日**；复核 Stage 装配后，可下压到 **9–14 人日**，但按 10–15 保守排。验证通过后再做深海、寺庙、付费。A2 Full（3 模板 + Portal + 付费 + 真实移动端）约 **30–45 人日**；设计稿的 14–22 人日只覆盖“代码主体”，不含真实移动端性能、产品化、Portal、支付和权利清理。

**结论 6：最大风险不是“做不出来”，而是“做成了但卖不了”。**  
- 体积：koi 已过门，深海/寺庙是新场景，不是存量改造。  
- 性能：移动端 60fps 未真机验证，`costMs` 存在申报值与实测值的口径矛盾。  
- 权利：Portal 根目录没有 LICENSE；`Kage` 带 © 声明，`Sylva` 明确不再分发，`Fable` 无 LICENSE。把这些 demo 直接当付费模板卖，是产品级风险。  
- 商业：A2 的目标客户是 B 站 Toy 创作者/独立开发者，Portal 的受众是“找前端组件的人”，两者有交集但不重合；Portal 能导流，不能代替 A2 的销售闭环。

**一句话决策：先做 koi，不要先做深海；先把 `Stage` + `TemplateSpec` + 最小 Studio 做出来，再把 Portal 当展示层；先证明“有人愿意导出/付费”，再谈三套模板全量。**

---

## 1. 评估范围、证据与边界

### 1.1 本轮实际读取/核对的内容

| 类别 | 证据 | 用途 |
|---|---|---|
| A2 设计稿 | 用户上传的《AI 机会雷达 · A1–A4 完整产品设计稿》A2 章节 | 产品定位、MoSCoW、技术架构、里程碑 |
| 本仓库权威 | `docs/HANDOFF.md`、`docs/DECISIONS.md`、`docs/PRODUCT-FORM.md` | 当前工程事实、ADR、产品红线 |
| 本仓库既有评审 | `docs/A2-FEASIBILITY-REVIEW.md` | A2 可行性基线；本稿在其上补 Portal 与实现路径 |
| 本仓库代码 | `shared/stage/contract.ts`、`shared/stage/preview/build.mjs`、`package.json`、各站点/零件目录 | 运行时、零件、构建、单 HTML 断言 |
| 本仓库产物 | `dist/koi`、`dist/still`、`dist/hug`、`dist/license`、`dist/preview/*` | 体积实测（本轮复测 + 既有评审） |
| Portal 仓库 | `https://github.com/yysam123456-source/frontend-design-portal` 的 `package.json`、`index.html`、`src/types.ts`、`src/data/projects.ts`、`src/components/ShowcasesPage.tsx`、`src/components/showcases/*`、`public/kage.html`、`public/showcases/starfall.html` | 技术栈、数据模型、showcase 能力、可复用资产、权利状态 |
| Portal 文档 | `docs/SEO_TIER2_DESIGN.md`、`public/llms.txt`、`index.html` 文案 | 定位、构建、SEO、组件数量口径 |

### 1.2 没有验证/不能当成事实的部分

- **Portal 未在本机 clone 成功，未跑 `npm install` / `npm run build`。** Portal 的文件、依赖、构建脚本来自 GitHub 仓库读取；其“dist 6,064 文件、5,000+ 组件”等数字来自仓库文档/HTML，未在本轮重建验证。
- **Portal 的组件数量存在口径漂移。** `docs/SEO_TIER2_DESIGN.md` 写 5,075 组件/9 项目；`index.html` 写 6,425 组件/5,451 预览；`src/data/projects.ts` 当前是 19 个项目。不要把任何一个数字写成硬契约。
- **没有真机测移动端 60fps。** 本稿只做“验收标准设计”，不声称 koi 已在 iPhone/Android 上达标。
- **没有对 A2 新模板做体积实测。** koi 的 165–168KB 是现有站点/预览产物，不是 A2 模板产物；新模板必须重新测。
- **本文不是法律意见。** 权利部分只做工程风险识别，最终商用授权需法务/权利方确认。

### 1.3 状态标签

- **【事实】**：仓库/文档/实测可复核。
- **【推断】**：基于事实的判断，可能被新证据推翻。
- **【建议】**：可执行的决策建议。
- **【假设】**：本稿默认成立、但需要用户确认的前提。

---

## 2. A2 设计稿的目标与验收

### 2.1 设计稿原文的关键主张

【事实】A2 在四产品中“你的实际排序第 1、市场六维 46 分”，定位是 **<1MB、零外部资源、全代码生成的 3D 互动场景模板库**。

| 维度 | 设计稿内容 |
|---|---|
| 价值主张 | 平台（B 站 Toy）入口 ≤1MB，glb 模型方案超限；程序化生成是解；卖“秒开的精美互动场景模板” |
| 目标用户 | B 站 Toy 创作者、互动视频 UP 主、独立游戏开发者、禅意/治愈网页作者、个人主页创作者 |
| 核心场景 | 想上线 3D 互动场景（禅意池/深海/寺庙/水族箱），受 1MB 限制、不会建模、要移动端流畅 |
| 产品形态 | 模板库（买断）+ 参数化生成器（Web 工具）+ 开源核心（引流） |
| 不做什么 | 通用 3D 编辑器、glb 模型托管、游戏引擎 |

### 2.2 MoSCoW（按原文行）

| 优先级 | 功能 | 原文要点 |
|---|---|---|
| Must | 场景模板 3 套 | 禅意池/锦鲤（暮池摸鱼式）、深海粒子（“你的项目”）、寺庙/静寺式 |
| Must | 全程序化生成 | 水波高度场、Beer–Lambert 吸收、GLSL 焦散/贴图、Web Audio 五声音阶——零外部资源 |
| Must | 体积预算检查器 | 实时显示 gzip 后大小，超 1MB 预警，按平台门槛切换 |
| Must | 参数控制面板 | lil-gui 风格：颜色选择器、密度/速度滑块、画质预设下拉 |
| Must | 单 HTML 导出 | 一键导出 dist 单文件 / Vite 项目 / B 站 Toy 适配包 |
| Should | 画质三档预设 | 极致/均衡/省电，移动端自动降档 |
| Should | 交互组件库 | 点击涟漪、撸鱼收集、抽卡、天降硬币、祈愿阁 |
| Could | 场景主题换肤 | 换配色/贴花，同一套代码变深夜图书馆/雨天茶室 |
| Won't | glb 导入、多人场景 | 与 1MB 原则冲突 |

【推断】按“可验收子项”拆，实际是 **3 套模板 + 4 项产品能力（全程序化/体积/面板/导出）= 7 个 Must 子项**；按 MoSCoW 行是 5 个 Must。既有评审说“6 Must”是另一种拆法，不必纠结核销，关键是每一项是否真的存在。

### 2.3 技术架构与设计稿的隐含前提

设计稿的技术选型是：Three.js + GLSL、`MeshSurfaceSampler` 表面采样、Bloom + additive、`lil-gui v0.19.2`、双缓冲高度场 + 折射/焦散、Web Audio 五声音阶、Vite 7 + TypeScript、esbuild/gzip 实时计算。

【事实】这些前提与本仓库现状有明显偏差：

| 设计稿前提 | 本仓库现状 |
|---|---|
| Three.js + Bloom | 有 Three.js，但当前是 `paper-ink + koi-pond + pixel-post` 的 2D 合成链，没有 `EffectComposer` / `UnrealBloomPass` |
| `MeshSurfaceSampler` | 全仓 0 命中 |
| `lil-gui v0.19.2` | 没有依赖；没有 lil-gui |
| 双缓冲高度场/Beer–Lambert | 没有命中；现有水体是 koi 的 GLSL 水面/焦散，不是通用水体方案 |
| Web Audio 五声音阶 | koi 有音频/音乐状态，但需要按“程序化五声音阶”重新确认 |
| Vite 7 | 本仓库是 esbuild + tsx + TypeScript，没有 Vite |
| 单 HTML 导出 | 开发侧 `build:preview` 有单 HTML/零外部断言；没有用户侧一键导出 |

【推断】设计稿把“作者已有的另一个项目经验”当成了“本仓库现成能力”。这不是设计稿错，而是**评估对象错位**：它假设的是“你的深海粒子项目 + 你的 Vite 工程”，不是 `emopulse_station_cluster`。

### 2.4 设计稿的里程碑与验收

| 阶段 | 原文时间 | 原文交付 | 原文验收 |
|---|---|---|---|
| M0 存量改造 | Week 1 | 深海粒子项目 gzip <1MB，参数面板接入 | 移动端 60fps，体积 ≤214KB（暮池基准） |
| M1 MVP | Week 2 | 禅意池模板 + 体积检查器 + 单 HTML 导出 | 不懂 GLSL 的人 30 分钟能导出可玩页面 |
| M2 上架 | Week 3–4 | GitHub 开源核心 + 2 套模板 + 技术复盘文 | 复盘文上掘金热榜；GitHub 首月 ≥100 star |
| M3 变现 | Month 2 | 支付 + 定制入口 | 首个模板付费用户 |

【推断】这个时间表有两个硬伤：

1. **M0 的对象不存在**（深海粒子项目不在本仓库），所以 M0 不是“改造”，是“0→1 新建”或“先找回原项目”。
2. **M0 验收“移动端 60fps + ≤214KB”没有真机基线**；同时“≤214KB”是暮池基准，不是所有模板的统一门槛。新模板如果按 214KB 卡，会把深海/寺庙直接卡死。

【建议】把里程碑改成：

- **M0′**：koi 模板化（`makeKoiPond(opts)`）+ `TemplateSpec` + 单 HTML 导出（5–8 人日）
- **M1**：Studio MVP + Portal 展示页（3–5 人日）
- **M2**：深海模板 + 寺庙模板（13–19 人日）
- **M3**：付费/白标/定制（4–8 人日）
- **M4**：真实移动端 hardening + 内容冷启动（4–6 人日）

---

## 3. 本仓库现状：它是“站点装配工程”，不是“模板产品”

### 3.1 当前架构事实

【事实】本仓库 `docs/HANDOFF.md` 的权威口径：

- `shared/stage/`：L0–L5 六层、混合模式、唯一 GL 通道、预算降档、错误隔离。
- `shared/parts/`：零件；正式零件 10 个左右，另有 13 个目录 + 1 个预览专用 `dawn-desk` 入口。
- `sites/`：只做装配、文案与站点逻辑；`/license`、`/hug`、`/still`、`/koi` 四个样板站已接回。
- `shared/stage/contract.ts`：`PartV2.create: (env) => PartInstance`；参数在 `opts` 里，不在统一 schema；`costMs`/`kb` 是零件自报；`CUE_VERBS` 是白名单动词。
- `shared/stage/preview/build.mjs`：单 HTML、零外部请求、占位符清零、零件 id 字面命中；这是开发侧构建器，不是用户侧导出器。

【推断】这套架构的抽象是 **“composition → page”**：站点选零件、给 opts、装配、出页面。A2 需要的抽象是 **“params → scene → template”**：模板声明 schema、用户改参数、场景响应、导出。两者可以共享零件和渲染经验，但不能共享产品语义。

### 3.2 可用资产与实测体积

【事实】本轮用 .NET `GZipStream`（Optimal）复测 `dist` 产物；既有评审用 `gzip -9` 的数字一并列出。两者差异来自压缩级别/实现，不应混用。

| 产物 | raw bytes | 本轮 gzip（Optimal） | 既有评审 gzip（-9） | 判断 |
|---|---:|---:|---:|---|
| `dist/koi/index.html` | 605,981 | 167,898 | 165,268 | 通过 214KB/300KB，raw <1MB |
| `dist/preview/koi.html` | 589,802 | 163,346 | 160,888 | 通过 |
| `dist/still/index.html` | 146,288 | 55,894 | 54,730 | 通过；但依赖 WebGPU |
| `dist/hug/index.html` | 539,528 | 142,168 | 139,836 | 通过 |
| `dist/license/index.html` | 48,973 | 17,470 | — | 2D 纸面，不是 3D 模板 |
| `dist/preview/dawn-desk.html` | 1,778,955 | 936,465 | 937,787 | **raw 已超 1MB；gzip 也接近生死线；不能作为 A2 模板** |

【推断】koi 是当前唯一同时满足“3D、零外部、单 HTML、体积过门、有互动/音频”的 A2 候选。`hug` 也过体积门，但它是草甸，不是 A2 设计稿的三套之一；可以作为第 4 套“自然/草甸”扩展。`still` 体积很好，但 WebGPU 是平台风险。`dawn-desk` 不管按 raw 还是 gzip 都不适合 A2。

### 3.3 四站的真实定位

| 站点 | 技术栈 | A2 相关性 | 结论 |
|---|---|---|---|
| `/koi` | `paper-ink + koi-pond + pixel-post`；Three.js 锦鲤池；3 风格/交互/音频 | 最高；禅意池原型 | **M0 唯一候选** |
| `/hug` | `hug-meadow` 单件；Three.js 草甸；10 株/1,335 颗种子 | 中；自然/治愈，但不是三套之一 | 可选第 4 套 |
| `/still` | `tide-medium + voxel-world + bubbles + still-sink + pixel-post`；WebGPU 体素 | 中；水下氛围，但不是“粒子” | 参考，不做 v1 基底 |
| `/license` | `paper-ink + pixel-post`；2D 纸面/印章/导出 PNG | 低；不是 3D 模板 | 不做 |
| `dawn-desk` | 预览专用；3D 桌面/房间 | 低；体积超门 | 排除 |
| `grand-atelier` | 本地缺 4 个模块，D0；Portal 有完整钢琴模块 | 低；钢琴，不是寺庙 | 参考/可选扩展 |

### 3.4 A2 缺的不是“零件”，是“产品层”

【事实】当前没有：

- `paramsSchema` / 参数校验 / 默认值 / 预设；
- `create(env, params)` 的统一模板入口；
- 用户侧“选模板 → 调参 → 体积反馈 → 导出”的 UI；
- 模板目录、模板详情页、购买/授权；
- 用户侧单 HTML 导出（现有 `build:preview` 是开发脚本）；
- 移动端模拟、真实设备性能门；
- 模板级体积 manifest / 零外部网络检查（现有预览构建有断言，但没有产品化）；
- 深海粒子、寺庙两套新场景。

【推断】把这些都做完，才是 A2。只做“参数面板 + 导出按钮”不够；那只是把开发工具开放给用户，不是模板产品。

### 3.5 一个必须避免的路径

**不要把四个站点“包装成模板”。** 原因：

- 站点有各自的文案、菜单、Esc 控制、深链接、站点级 CSS；模板需要把这些剥离，换成 schema + 场景；
- koi 可以抽，因为它的核心是一个 `koi-pond` 零件；`hug` 也可以抽；`still` 是多零件 + WebGPU；`license` 是 2D；
- 站点是“作品”，模板是“可复用的参数化场景”；把作品改成模板，工作量不比新建少，而且会破坏现有站点。

【建议】A2 用**独立目录** `a2/`，与 `shared/stage` / `sites` 解耦；只复用 `shared/parts` 里的场景代码和资产，不复用站点壳。不要为了 A2 改 `shared/stage` 的核心契约，避免把现有四站拖进回归。

---

## 4. Portal 解剖：它是什么、不是什么、能补什么

### 4.1 Portal 的硬事实

【事实】`frontend-design-portal`（owner: `yysam123456-source`）当前仓库特征：

| 项 | 内容 |
|---|---|
| 定位文案 | “Curated open-source front-end components. Browse live, copy the source.” 5,000+ 精选前端组件，纯客户端，不安装包；代码来自上游仓库，许可以上游为准 |
| 技术栈 | React 19.2、Vite 8.0、Tailwind 4.1、TypeScript 5.9、Three 0.185；依赖包含 Radix、React Three Fiber、drei、postprocessing、Sandpack、tsparticles、PixiJS、Matter.js、Dexie、Zustand 等 |
| 数据 | 19 个项目；5,000+ 组件；`public/data/index.json` 约 5MB；`src/generated/preview-manifest.ts` 约 1.2MB；预览注册表约 5,000 行 |
| 页面 | 首页/官方展示、组件目录、组件详情、Showcases（**103 个整页 demo：27 本地 + 76 Fable 远程**）、代码抽屉、Sandpack 预览 |
| 构建 | `vite build` + `generate-previews` + `augment-heavy-demos` + `build:worker`；Cloudflare Pages/Worker 部署 |
| 预览 | 组件用 iframe/Sandpack/React 预览；整页 demo 用 `IframeShowcase`，`allow="autoplay; fullscreen; webgpu"` |
| SEO | `docs/SEO_TIER2_DESIGN.md` 描述纯 CSR + SSG 的第二层 SEO；有 `robots.txt`、`llms.txt`、`_headers`、`_redirects` |
| 商业 | 未发现登录、支付、订单、订阅模块；未发现“模板”SKU、参数 schema 或导出器 |

【事实】Portal 的 103 个 Showcases（27 本地 + 76 Fable 远程）里有大量整页 demo，但**质量/资产形态/权利差异极大**：

| Showcase | 内容 | 对 A2 的价值 | 问题 |
|---|---|---|---|
| Kage | 五章夜游京都山寺；Three.js + 前景 webp + 字体；244,467 B HTML | 寺庙题材/美术方向最接近 | © 2026 Kage；外链 `three.min.js`、字体、webp；不是零外部；旧 Three API 痕迹 |
| Abyssal Descent | 深海下潜图片序列；2D 滚动叙事 | 深海色彩/叙事参考 | 不是 3D 粒子；依赖 `/abyss/*.jpg`；不是零外部 |
| Nebula Core | Three.js 星系粒子，35,200 粒子，加法混合 | 深海粒子的**着色器/粒子结构**参考 | 星系，不是深海；需改分布/颜色/介质 |
| Starfall | 74,077 B 单 HTML，程序化浮岛村落，昼夜/四季 | 程序化建筑/场景组织参考 | 通过 importmap 外链 `unpkg.com/three@0.185.0`；不是零外部 |
| Grand Atelier | Portal 的 `src/grand-atelier` 组件/库集合更完整（19 组件 + lib）；本地缺 4 模块 | 可作为本地缺失模块的参考；PBR/材质参考 | 钢琴，不是寺庙；资产重、不是 A2 三套之一；未构建验证 |
| Chinese Phoenix Crown | 凤冠 + 物理文字帘 | 中式文化母题/音频参考 | 不是寺庙；不是零外部模板 |
| Looseleaf | 纸面手绘 UI | 纸感 UI 参考 | 本仓库 `paper-ink` 已提取；不是 3D |
| Water / Ocean / SSF-Fog | 水面/FFT 海面/屏幕空间雾 | 水体、雾、光照参考 | 大量贴图/GLB；不是零外部 |
| ThreeUI（120 组件） | Three.js 组件/Shader/背景 | Shader/交互组件矿 | 组件级，不是场景模板；许可逐项确认 |

### 4.2 Portal 不是什么

【事实/推断】

1. **不是模板市场**：没有 `Template` 数据模型、没有参数 schema、没有“选模板→调参→导出”的流程。
2. **不是零外部运行时**：`index.html` 引 Google Fonts；Kage 引外部 Three/字体/webp；Starfall 引 unpkg；组件预览大量外链。Portal 本身是“展示站”，不是“单文件产物”。
3. **不是商业闭环**：没有登录/支付/授权/订单/下载鉴权；组件代码是“可复制”的开放目录。
4. **不是 A2 的渲染底座**：Portal 是 React 19 + Vite 8 + Tailwind 4；A2 导出物是单 HTML + Three.js + 原生 DOM。把 Portal 的 React 组件搬进 A2 导出物，体积和依赖会直接破坏 A2 的卖点。
5. **不是无版权风险的素材库**：Portal 根目录没有 LICENSE 文件；`index.html` 明确说“代码来自上游仓库，许可以上游为准”；Kage/Sylva/Fable 等条目还有单独限制。

### 4.3 Portal 对 A2 真正有用的地方

【建议】按价值排序：

1. **展示层/流量入口**：Portal 已经有“Showcases”全屏 demo 浏览器和 `IframeShowcase`，A2 可以作为一个新的 `A2` 分组接入；这是最低成本的融合。
2. **SEO/模板详情页**：Portal 有 SSG/SEO 经验，A2 的 3 个模板可以生成静态详情页，承接“禅意池/深海/寺庙模板”搜索。
3. **设计参考与素材矿**：Nebula 的粒子 shader、Starfall 的程序化村落、Kage 的寺庙美术、Grand Atelier 的 PBR/材质、Phoenix 的中式母题、Looseleaf 的纸感 UI；只取“代码/结构/视觉”，不把整个 React 应用搬过来。
4. **组件级 UI**：Portal 的目录筛选、卡片、预览 iframe、代码抽屉可以借鉴到 A2 的模板列表/文档页；但 A2 Studio 不需要 5,000 组件的复杂度。
5. **已有上游关系**：本仓库的 `bubbles`、`paper-ink` 等零件本来就从 Portal 的 demo 提取过；A2 可以把这条“上游素材 → 下游零件/模板”的链路正式化，而不是重新找素材。

### 4.4 Portal 不能替 A2 解决的问题

- **三套模板**：Portal 没有“禅意池/深海/寺庙”的可售卖模板；Kage 是寺庙 demo 但不是零外部、且有 ©；Abyss 是 2D；Nebula 是星系；Starfall 是村落；Grand Atelier 是钢琴。
- **参数 schema**：Portal 只有组件筛选，没有模板参数。
- **用户导出**：Portal 只有代码复制/沙箱预览，没有单 HTML 导出。
- **体积门**：Portal 没有模板级 gzip 检查。
- **支付/授权**：Portal 没有。
- **移动端 60fps**：Portal 没有 A2 模板的性能门。

【推断】Portal 是 A2 的“前台/橱窗/素材库”，不是“后台/工厂/收银台”。把两者混成一个应用，会让 A2 失去“超轻单文件”的核心差异化。

---

## 5. A2 要求 × 本仓库 × Portal 的交叉映射

状态：`有` = 可直接用；`部分` = 有基础但需改造；`缺` = 需要新建；`不可用` = 有但不适合 A2。

| A2 要求 | 本仓库 | Portal | 判断 | 需要做什么 |
|---|---|---|---|---|
| 禅意池/锦鲤模板 | **有**：`koi-pond` 完整 3D，3 风格/交互/音频，165–168KB gzip | 无直接模板；Looseleaf 可参考纸感 | **最接近可交付** | 抽场景、参数 schema、导出、Studio；5–7 人日 |
| 深海粒子模板 | **缺**：无 3D 深海粒子；`still` 是 WebGPU 体素，`bubbles` 是 2D | `Abyss` 2D；`Nebula` 星系粒子 shader；`Water/Ocean` 水体参考 | **0→1 新建** | 新 WebGL2 粒子/水体/生物/相机；6–9 人日 |
| 寺庙模板 | **缺**：无寺庙；`grand-atelier` 是钢琴且缺模块 | `Kage` 寺庙美术（©/外链）；`Starfall` 村落；`Phoenix` 中式母题 | **0→1 新建** | 程序化殿堂/灯笼/香火/钟声/水面；8–11 人日 |
| 全程序化 | **部分**：koi 焦散/水面、五声音阶、体素密度；缺 Beer–Lambert/双缓冲高度场/`MeshSurfaceSampler` | Shader/粒子/水体 demo 可参考 | **部分** | 按模板实际需要实现；不必为清单硬凑算法 |
| 体积预算检查器 | **部分**：预览构建有体积断言；无用户侧 UI | 无 | **缺产品化** | 构建期 gzip + Studio 侧 `CompressionStream` + manifest |
| 参数控制面板 | **缺**：只有 `PRESETS` + 只读调试条；无 schema | 有组件筛选/预览，无模板参数 | **缺** | schema 驱动面板；Studio 内使用，导出物不带面板 |
| 单 HTML 导出 | **部分**：`build:preview` 单 HTML/零外部；非用户侧 | 只有代码复制 | **缺产品化** | `buildTemplate(template, params)` + download；复用零外部断言 |
| 画质三档 | **部分**：Stage 有 budget/LOD；不是 A2 三档 | 无 | **部分** | `high/balanced/low` + 自动降档 + 移动端 |
| 交互组件库 | **部分**：koi 有涟漪/喂鱼/呼叫/音乐；深海/寺庙缺 | 103 个 Showcase 可参考（其中 19 个标 Scene） | **部分** | 先做每模板 2–3 个核心交互，不做大而全 |
| 主题换肤 | **部分**：koi 3 风格 | 组件主题多，模板无 | **部分** | 先做 koi 三风格；主题换肤放 Could |
| Three.js + Bloom | **部分**：有 Three；无 Bloom/Composer | 有 R3F/postprocessing demo | **部分** | A2 新 runtime；Bloom 可选、按体积 |
| Vite 7 + TS | **部分**：TS + esbuild；无 Vite | Vite 8 + React 19 | **不兼容** | Studio 用 Vite 7/8；模板构建用 esbuild；不强行统一 |
| lil-gui 面板 | **缺** | 有 UI 库，但不是 lil-gui | **不建议照搬** | Studio 自研轻面板；导出物不带 lil-gui |
| 移动端 60fps | **未验证**；`costMs` 申报 vs 实测有矛盾 | 无 | **高风险** | 真机测试 + 三档 + 动态 DPR/粒子数 |
| 支付/授权/白标 | **缺** | 无 | **缺** | 另做，不塞进 Portal 静态目录 |
| 开源核心 + 付费模板 | **部分**：有工程，无产品分层 | 开放目录，无付费 | **需设计** | 免费样例 + 付费模板 + 授权；或全免费+定制 |

【推断】这张表说明：**A2 的完成度不是由“零件数量”决定，而是由“产品层 + 两套新场景”决定**。koi 是唯一能把“技术存量”变成“模板”的资产；深海/寺庙是新产品。

---

## 6. 五种融合模型与取舍

### 6.1 模型对比

| 模型 | 做法 | 优点 | 代价/风险 | 结论 |
|---|---|---|---|---|
| A. 运行时合并 | 把 Portal 的 React/Three 场景直接嵌入 A2 单 HTML | 视觉素材多、开发看似快 | 依赖 React/R3F/Tailwind/Sandpack；体积、外部资源、版本冲突；A2 不再是“超轻单文件” | **否** |
| B. Studio 放进 Portal | 在 Portal React 应用里加 `/studio` 路由，复用 Portal UI | 一套站点、统一导航、可复用筛选/卡片 | Portal 5,000 组件/6,000 文件/大依赖；Studio 受 React 构建约束；模板层与 Portal 耦合 | **条件可行，二期** |
| C. Portal 做展示层 | A2 作为 Portal 的 `A2` showcase 分组；模板详情页 + Studio 外链 | 最低成本；利用 Portal 的 SEO/流量/预览；不破坏 A2 运行时 | 需要 Portal 仓库写权限；模板不能走组件目录；付费需另做 | **推荐** |
| D. Portal 做素材矿 | 只提取 shader/场景结构/UI 参考，重写进 A2 | 可控、可授权、可 tree-shake | 需要工程判断；不能直接复制受版权保护 demo | **推荐（带权利门）** |
| E. Portal 做商店 | 在 Portal 里卖 A2 模板/订阅 | 统一品牌、流量闭环 | Portal 无登录/支付/授权；公开源码与付费冲突；许可复杂 | **否/三期再说** |

### 6.2 为什么“运行时合并”不可行

【事实】Portal 是 5,000+ 组件、19 项目、1.2MB 预览清单、5MB 数据索引的 React 19 应用；A2 要求是 **单 HTML、零外部、gzip ≤300KB、移动端 60fps**。两者在体积/依赖/运行模型上是相反的。

【推断】即使只把 Portal 的某个 Three.js 场景搬进 A2，也会带入：
- React/R3F 或 Three 的版本差异（Portal 0.185 vs 本仓库 0.169）；
- Tailwind/字体/图标/预览壳；
- Portal 的 iframe/预览约定；
- 无法 tree-shake 的组件边界。

**A2 导出物必须是一个“无框架、无 React、无 CDN、无外部字体”的原生 Three.js 页面**；Portal 只能作为“外部预览器”。这条边界必须写进 ADR。

### 6.3 为什么“Portal 做组件目录”也不合适

Portal 的 `ComponentEntry` 是**开源组件条目**：有 `codeSnippet`、`previewRecord`、`sourceUrl`、`projectId`，详情页会展示代码。A2 模板是**产品 SKU**：有参数 schema、预设、体积、授权、导出；把模板塞进组件目录会导致：
- 源码公开，付费模板被直接复制；
- 组件卡片/筛选语义不匹配（模板不是“一个组件”）；
- 5,000 组件目录的 SEO/导航稀释 A2 的转化；
- 模板的“全屏体验”在小组件卡片里展示不出来。

【建议】A2 在 Portal 走 **`ShowcaseEntry`**（整页 demo）而不是 **`ComponentEntry`**（组件目录）。这是两个数据模型，不要混。

### 6.4 推荐的融合边界

```
Portal（展示/SEO/导流）
  ├─ /showcases 增加 A2 分组
  ├─ /a2/templates/koi 静态预览页（免费/水印）
  ├─ /a2/templates/abyss /temple（预告/等待名单）
  └─ /a2-studio 外链（独立 Studio）
          │
          ▼
A2 Studio（独立 Vite 应用，参数化工具）
  ├─ 模板选择
  ├─ schema 面板
  ├─ iframe 预览
  ├─ 体积表
  └─ 单 HTML 导出
          │
          ▼
Template Registry（TEMPLATES）
  ├─ TemplateSpec（元数据 + 参数 schema + composition 工厂）
  ├─ a2/templates/koi
  ├─ a2/templates/abyss
  └─ a2/templates/temple
          │
          ▼
shared/stage Stage（现有：L0–L5、单 GL、单 L4、预算降档、dispose）
          │
          ▼
dist/a2/<template>/index.html  ← 单文件、零外部、≤300KB gzip
```

【建议】Portal 与 A2 的“融合”用**同域 + 静态产物 + 外链**，不用“同仓库 + 同 React 应用”。这样：
- Portal 可以独立演进，不被 A2 的 Three.js/构建拖慢；
- A2 可以独立构建/测试/部署，不被 Portal 的 5,000 组件数据影响；
- 双方只共享 URL、视觉语言、模板元数据，不共享运行时。

---

## 7. 推荐架构：Stage + TemplateSpec + A2 Studio + Portal

> **2026-11-23 复核修正**：本节最初建议“独立 A2 Core 运行时”；复核 `shared/stage` 后，`Stage` 已能承载“一模板一 composition（单 GL 场景 + 2D 叠加）”，不需要另造渲染循环。`a2/core` 只保留**参数 schema、体积门、导出、模板注册**，渲染层直接用 `Stage`。详见 §17.3。

### 7.1 目录建议

```
a2/
  core/
    contract.ts          # TemplateSpec / A2Scene / ParamSchema / A2Env
    params.ts            # 校验、默认值、预设、种子
    budget.ts            # raw/gzip 体积、阈值、manifest
    export.ts            # 单 HTML 组装、注入、清理
    zero-network.ts      # 静态扫描与运行时断言
  templates/
    koi/
      template.ts        # schema + presets + create
      scene.ts           # 从 shared/parts/koi-pond 抽取/适配的场景
      copy.ts            # 标题、说明、SEO 文案
    abyss/
      template.ts
      particles.ts
      water.ts
      copy.ts
    temple/
      template.ts
      hall.ts
      lantern.ts
      audio.ts
      copy.ts
  studio/
    index.html
    src/
      main.ts
      panel.ts
      preview.ts
      budget.ts
      export.ts
      styles.css
  build/
    build-template.mjs   # esbuild 打包 + 参数占位替换
    check-budget.mjs     # raw/gzip 门 + manifest
    check-zero-network.mjs
  tests/
    contract.test.ts
    budget.test.ts
    export.test.ts
    visual.test.ts
```

【建议】`a2/` 与 `shared/` 的关系：
- **复用**：`shared/parts/koi-pond` 的场景代码、材质、音频；`shared/stage/preview/build.mjs` 的零外部断言思路；`shared/parts` 的 GLSL 经验。
- **不复用**：`sites/` 的站点壳、Esc 菜单、文案、深链接；`shared/stage` 的六层装配器（A2 是单场景，不需要 L0–L5 合成）。
- **不改动**：`shared/stage/contract.ts` 的 `PartV2` 契约、现有四站；A2 是并行产品，不是第五个站点。

### 7.2 核心契约

```ts
// a2/core/contract.ts
export type ParamValue = number | string | boolean;
export type Params = Record<string, ParamValue>;

export interface ParamField {
  key: string;
  label: string;
  type: 'range' | 'color' | 'select' | 'toggle' | 'seed';
  default: ParamValue;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
  affects: 'visual' | 'audio' | 'camera' | 'quality';
}

export interface TemplateSpec<P extends Params = Params> {
  id: string;
  title: string;
  version: string;
  schema: ParamField[];
  presets: Record<string, P>;
  create(env: A2Env, params: P): A2Scene;
  budget: {
    targetGzip: number;   // e.g. 214_000
    hardGzip: number;     // e.g. 300_000
    hardRaw: number;      // e.g. 1_000_000
  };
  export: {
    fileName: string;
    bodyClass: string;
  };
}

export interface A2Scene {
  mount(canvas: HTMLCanvasElement): void;
  apply(params: Params): void;
  setQuality(quality: 'high' | 'balanced' | 'low'): void;
  render(nowMs: number): void;
  resize(width: number, height: number, dpr: number): void;
  dispose(): void;
}
```

【关键设计】

1. **`params` 必须可序列化**：不能把回调、DOM、类实例放进参数；否则导出/分享/预设都不可复现。
2. **`create` 必须是纯工厂**：不在模块加载时访问 `window`/`document`；所有环境依赖从 `A2Env` 注入，便于测试和 SSR/构建。
3. **`apply` 必须是幂等的**：同一组参数重复应用结果一致；不能靠“重建整个场景”来更新一个颜色。
4. **`quality` 是独立维度**：不是参数 schema 里的一个普通 select，而是装配器/Studio/导出共用的三档。
5. **`budget` 写在模板里**：每个模板有自己的目标/硬门；koi 214KB，深海/寺庙 300KB；不要用一个全局阈值卡所有模板。

### 7.3 版本与依赖策略

【建议】

- **A2 模板运行时统一 `three@0.169.x`**，与本仓库一致；不从 Portal 的 `three@0.185` 抄运行时，只抄 shader/思路，必要时改 API。
- **命名导入**：`import { Scene, PerspectiveCamera, WebGLRenderer } from 'three'`，不要 `import * as THREE`；为 tree-shaking 留空间。
- **Bloom 可选**：先不用 `EffectComposer + UnrealBloomPass`；如果必须，先测 gzip/移动端；也可以做轻量加法辉光（低分辨率 render target + blur）而不是全量后处理。
- **不使用 lil-gui 作为导出物依赖**：Studio 面板自研，或者只在 Studio 内用 lil-gui；导出物不带面板，保持“可玩场景”而不是“调试工具”。
- **不引入 React/R3F/Tailwind 到模板/Stage 层**：Studio 可以用 Vite + 原生 TS；Portal 可以用 React；三条构建互不污染。
- **不引入外部字体/图标/图片**：所有视觉资产程序化；字体用系统字体或内联 WOFF2（如果必须，先测体积）。

### 7.4 体积门：raw 与 gzip 双门

【事实】设计稿只强调“gzip 后大小”，但平台“入口 ≤1MB”可能是 raw 文件大小。`dawn-desk` 的 raw 是 1,778,955 B，已经超过 1MB；如果平台按 raw 计，它已经死了。

【建议】A2 使用**双门**：

| 门 | 阈值 | 说明 |
|---|---:|---|
| `hardRaw` | ≤ 1,000,000 B | 平台入口/文件大小的保守上限；如果平台明确按 gzip，可放宽，但不要假设 |
| `hardGzip` | ≤ 300,000 B | A2 判断门；超过不进模板库 |
| `targetGzip` | koi ≤ 214,000 B；深海/寺庙 ≤ 280,000 B | 目标值；不是硬门，但用于“是否值得发布” |
| `studio` | 不计入模板门 | Studio 是网页工具，不是导出物 |

【建议】构建期用 `zlib.gzipSync(html, { level: 9 })` 作为权威数字；Studio 侧用 `CompressionStream('gzip')` 做实时估算，无法使用时回退到构建期 manifest；两者不一致时以构建期为准。

### 7.5 单 HTML 导出流水线

```
template.ts + scene.ts
   │ esbuild bundle（three 命名导入，tree-shake）
   ▼
template.runtime.js（IIFE/ESM 内联）
   │ 注入 HTML 模板：<style> + <canvas> + <script> + 参数 JSON
   ▼
raw HTML
   │ 零外部扫描：src/href/@import/http(s)/fetch/importmap
   │ gzip 9 测量
   ▼
dist/a2/<template>/index.html + manifest.json
```

【建议】导出物必须满足：
- 一个 `.html` 文件，双击 `file://` 可打开；
- 0 个外部请求（首屏后也不请求）；
- 不含 source map、不含 dev 调试条、不含模板 schema 编辑 UI；
- 参数以 `JSON` 注入（转义 `<`、`>`、`&`，防止 XSS/提前闭合 script）；
- 导出物与 Studio 预览使用同一 `buildTemplate` 函数，保证一致；
- 导出文件名可读：`koi-zen-<preset>.html`，不要用 hash。

---

## 8. 三套模板的实现路径

### 8.1 禅意池 / 锦鲤（M0，最高优先级）

#### 现状

【事实】`/koi` 是完整的 Three.js 锦鲤池，`paper-ink + koi-pond + pixel-post`，budget 9ms，high LOD 11 条鱼；有 Ink/Watercolour/Real 三风格、Touch（Ripple/Feed/Call）、Camera（Top/2.5D/Orbit）、Water（Pebble/Sky/Dark）、Weather（Dry/Drizzle/Rain）、Music（Off/Still/Flow）；有正式深链接 `?style=&mode=&cam=&floor=&rain=&music=`。

【事实】`dist/koi/index.html` raw 605,981 B，gzip 167,898 B（本轮）/165,268 B（既有 -9）；`dist/preview/koi.html` raw 589,802 B，gzip 163,346 B/160,888 B。均低于 214KB/300KB，raw <1MB。

#### 为什么它是 M0

- 唯一“3D + 零外部 + 有互动/音频 + 体积过门”的现成场景；
- 三风格本身就是“参数化”的雏形，容易映射成 schema；
- 禅意池是 A2 三套模板的第一套，用户画像最匹配；
- 不需要新建视觉，只需要“抽场景 + 产品化”，风险最低；
- 可以作为 `Stage` 模板装配线的“金标准”：所有契约、导出、体积、性能测试先在这套上跑通。

#### 需要做的工作

1. **抽场景工厂**：在 `shared/parts/koi-pond/index.ts` 加 `makeKoiPond(opts)`（内部 `createKoi(env, opts)`），用 `opts` 覆盖当前从 `Q` 读取的 `style/mode/cam/floor/rain/music/...`；不依赖 `sites/koi/attach.ts` 的菜单/文案；保留 `WorldFrame` 所需的最小接口。**不要直接改 `PartV2` 全局契约。**
2. **参数 schema**（建议 9 个，具体字段以 koi 代码为准）：
   - `style`: `ink | watercolor | real`
   - `fishCount`: 3–15
   - `waterHue`: color
   - `caustics`: 0–1
   - `ripples`: boolean
   - `camera`: `top | 2.5d | orbit`
   - `quality`: `high | balanced | low`
   - `music`: `off | still | flow`
   - `seed`: integer
3. **预设**：`Dawn`（real/暖）、`Ink`（ink/冷）、`Rain`（watercolor/雨）——对应 A2 设计稿的禅意/治愈。
4. **构建/导出**：`build-template.mjs` 把 koi 场景打到单 HTML；去除 `paper-ink/pixel-post` 或按需保留；用 `check-zero-network` + `check-budget`。
5. **视觉回归**：与 `/koi` 同尺寸截图对比三风格；不是“看起来像”，而是“同一场景同一构图”。
6. **Studio**：模板选择、schema 面板、预览、体积条、导出。
7. **Portal**：静态 `/a2/templates/koi` 预览页 + `A2` showcase 分组。

#### 验收门

- raw ≤1,000,000 B；gzip ≤214,000 B（先按暮池基准；如果包装后超，优先 tree-shake、去 paper/post、降鱼数，不要先加新效果）。
- 移动端 60fps：iPhone 12/13 + 中端 Android，390×844，DPR 2；30s 平均 ≥55fps，p95 ≤20ms；这不是本轮已验证项，必须真机跑。
- 单 HTML 零外部：静态扫描 0 命中；运行时 Network 0 请求（首屏加载完 HTML 后）。
- 三风格可视差异：同一参数下三风格帧差/截图可辨；不能只是换滤镜。
- 参数全生效：每个 schema 字段至少有一项可观察变化；无 dead param。
- 导出与预览一致：同参数导出 HTML 与 Studio iframe 的截图/哈希一致。

#### 工期

- 场景抽取 + 参数 + 构建/导出/体积/零外部：**5–7 人日**
- Studio MVP：**3–4 人日**
- Portal 展示页：**1–2 人日**
- 合计 **A2 Lite 10–15 人日**（含 P0/Portal；不含真机 hardening 的额外返工）

### 8.2 深海粒子（第二套，0→1）

#### 现状

【事实】本仓库没有“深海粒子项目”。`still` 是 `tide-medium + voxel-world + bubbles + still-sink + pixel-post` 的 WebGPU 体素水下世界；`bubbles` 是 2D 气泡；Portal 的 `AbyssalDescent` 是 `/abyss/*.jpg` 图片序列；Portal 的 `NebulaGalaxyShowcase` 是 Three.js 星系粒子。

【推断】设计稿的“深海粒子项目已具备 80% 技术存量”不适用于本仓库；M0 不能写成“改造深海粒子”。如果原项目在别的路径，必须先拿到；否则深海是**新模板**，不是 M0。

#### 可复用与不可复用

| 资产 | 用途 | 结论 |
|---|---|---|
| `NebulaGalaxyShowcase`（Portal） | 粒子 points、加法混合、gl_PointSize/圆形 alpha 的 shader 结构 | **参考/重写**；不要直接搬 React 组件 |
| `bubbles`（本仓库） | 2D 气泡/悬浮粒子叠加 | 可做 L2 叠加，不是 3D 主体 |
| `still` / `voxel-world` | 水下氛围、雾、青色光 | **参考**；WebGPU 不作为 v1 基底 |
| `tide-medium` | 水面/介质 | 需确认是否 2D；不要假设是 3D 水体 |
| `Water` / `Ocean`（Portal） | 水体/焦散/雾的视觉参考 | 参考；资产重、不是零外部 |
| `Abyss`（Portal） | 深海色彩/叙事 | 参考；2D 图片，不是粒子 |

#### 建议方案

**WebGL2 单文件深海粒子**，分三层：

1. **水体介质层**：全屏/半屏 shader，深度渐变 + Beer–Lambert 风格吸收 + 轻雾；不用真实折射/双缓冲高度场（成本高，视觉收益有限）。
2. **粒子层**：GPU points / instanced quads；海洋雪 + 浮游生物 + 少量发光水母；用种子分布，深度越深越稀疏；加法混合、软边圆点。
3. **生物/叙事层**：1–3 只可交互水母/鱼群；点击发光/散开；不要做复杂骨骼。
4. **音频**：Web Audio 低频水声/气泡/五声音阶（可选）；用户手势后启动。
5. **相机**：缓慢下潜/环绕；参数控制深度、粒子密度、发光强度、雾浓度、相机速度。

#### 参数 schema（建议）

`depth`（0–1）、`particleCount`（低/中/高）、`bioluminescence`（0–1）、`current`（0–1）、`fog`（0–1）、`jellyfish`（0–3）、`camera`（dive/orbit）、`quality`（三档）、`seed`。

#### 风险与门

- **Visual risk**：最容易做成“蓝色星系”；必须有水体深度、粒子分层、生物剪影，不能只是黑底白点。
- **Size risk**：粒子 shader + three + 音频；目标 ≤300KB，先按 280KB 设计。
- **Perf risk**：移动端粒子数要动态降；不要用全屏高分辨率 bloom。
- **Platform risk**：不要依赖 WebGPU；v1 只 WebGL2。
- **工期**：**6–9 人日**（含视觉调优/移动端降档），不含真机返工。

#### 验收门

- 与 koi 明显不同：深海不是“锦鲤池换蓝色”。
- 深度/粒子/生物三要素可见；点击有反馈；音频可选。
- gzip ≤300KB；raw ≤1MB；移动端 60fps 目标（至少 45fps 保底，低于则降档）。
- 零外部；无 WebGPU 依赖。

### 8.3 寺庙 / 静寺式（第三套，0→1）

#### 现状

【事实】本仓库没有寺庙模板；`grand-atelier` 是钢琴工坊（本地缺 4 模块，Portal 有完整版），不是寺庙；Portal 的 `Kage` 是京都山寺夜游（244,467 B HTML，带 © 声明，外链 three/字体/webp），是最接近的美术参考，但不是零外部、不是可直接售卖资产。

【推断】寺庙是 A2 三套里**视觉门槛最高、工期最长、权利最敏感**的一套。它不能靠“把 Kage 改一改”完成；Kage 是“带贴图的叙事场景”，A2 要的是“程序化、可参数化、零外部”的模板。

#### 建议方案

**程序化静寺庭院**，不是“钢琴房”，也不是“Kage 复刻”：

1. **建筑**：木构大殿/山门/廊柱，低多边形但比例准确；用 BoxGeometry/ExtrudeGeometry/程序化屋瓦；不做精细雕花。
2. **环境**：石灯笼、枯山水、苔藓、松树、月色/雾气；用程序化纹理（CanvasTexture/Shader）而不是 webp。
3. **水**：庭院池水/雨面；可复用 koi 的水面/焦散 shader，但不要带入锦鲤。
4. **氛围**：灯笼暖光、香火粒子、钟声/磬声（Web Audio 程序化）；夜晚/黄昏两档。
5. **交互**：点击灯笼/钟/水面；祈愿/敲钟；不要做复杂游戏。
6. **相机**：固定斜俯视 + 缓慢环绕；移动端降低阴影/粒子。

#### 可复用的东西

| 来源 | 用途 | 边界 |
|---|---|---|
| `koi-pond` 水面/焦散/石材 | 庭院池水、石头材质 | 只复用 shader/材质经验，不复制鱼/纸 |
| `grand-atelier`（Portal 的组件/库集合） | PBR 木材/金属/灯光、房间构图 | 不是寺庙；只参考材质/灯光；不要把钢琴搬进来 |
| `Kage`（Portal） | 寺庙美术方向、五章叙事、灯笼/月色 | **不复制代码/贴图**；权利未清 |
| `Phoenix Crown`（Portal） | 中式母题、红金配色、文字帘 | 参考；不是寺庙 |
| `Starfall`（Portal） | 程序化建筑/季节/昼夜 | 参考；外链 Three，不是零外部 |
| `dawn-desk` | PBR/室内光照经验 | 体积超门，不能做基底 |

#### 参数 schema（建议）

`hall`（山门/大殿/庭院）、`lanterns`（0–12）、`incense`（0–1）、`moon`（0–1）、`water`（0–1）、`bell`（on/off）、`camera`（still/orbit）、`quality`、`seed`。

#### 风险与门

- **Rights**：Kage ©、Sylva 不再分发、Fable 无 LICENSE；不要用它们的代码/贴图做付费模板。若要做“Kage 风格”，应自建美术或取得授权。
- **Visual**：最容易做成“低多边形小屋 + 红灯笼”；必须有大殿比例、庭院层次、夜色/月光，不是“中式元素堆叠”。
- **Size**：建筑几何 + 阴影 + 粒子 + 音频；目标 ≤300KB；不要用 GLB/贴图。
- **Perf**：阴影/灯笼点光/粒子是移动端杀手；三档 quality 必须真降。
- **工期**：**8–11 人日**（程序化建筑 + 材质 + 灯光 + 音频 + 调优），不含权利谈判/真机返工。

#### 验收门

- 一眼是“寺庙/静寺”，不是“钢琴房/日式小屋”。
- 与 koi 的差异是“建筑/庭院/钟声”，不是“同一个池子换颜色”。
- 零外部；gzip ≤300KB；raw ≤1MB；移动端目标 60fps（至少 45fps 保底）。
- 权利台账完整；无 Kage/Sylva/Fable 代码/贴图。

### 8.4 可选第四套：草甸（不是 Must）

【事实】`/hug` 是完整 Three.js 草甸，10 株/1,335 颗种子，`dist/hug` gzip 142,168 B，过体积门。

【建议】如果 A2 Lite 验证成功，`hug` 可以作为第 4 套“自然/治愈”模板（2–3 人日模板化），用于扩展 SKU；但不要放进首版 Must，否则会把“3 套”变成“4 套”，稀释工期。

### 8.5 明确排除的资产

| 资产 | 原因 |
|---|---|
| `dawn-desk` | raw 1.78MB >1MB；gzip 936KB 接近生死线；室内桌面，不是三套之一 |
| `license` | 2D 纸面；不是 3D 模板 |
| `grand-atelier`（本地） | 缺 4 模块；钢琴，不是寺庙；D0 |
| Kage / Sylva / Fable | 权利不清；不是零外部；不能作为付费模板 |
| Portal 的 5,000 组件 | 组件级，不是模板级；不能直接变成 A2 模板 |

---

## 9. 产品层设计：Studio 与导出

### 9.1 用户流程（A2 Lite）

```
打开 A2 Studio
  → 选模板（koi）
  → 选预设（Dawn/Ink/Rain）
  → 调 9 个参数
  → iframe 预览（桌面/移动模拟）
  → 体积条（raw/gzip/目标）
  → 导出单 HTML
  → 本地打开/上传平台
```

### 9.2 Studio 的边界

【建议】

- **Studio 是网页工具，不是导出物的一部分**：用户可以调参，但导出的是一个“干净的可玩场景”，不带编辑面板。
- **面板自研，不用 lil-gui**：lil-gui 适合开发者调试，不适合 C 端；自研 6 种控件（range/color/select/toggle/seed/button）即可，体积更小、样式统一。
- **预览 iframe 用 `srcDoc` + `sandbox="allow-scripts"`**：不要给 `allow-same-origin`（预览不需要访问父页面）；音频需要用户手势，预览默认静音。
- **体积条显示三项**：raw、gzip、目标；超门红色，接近目标黄色；不是只显示一个“gzip”。
- **移动模拟是“尺寸模拟”，不是“性能模拟”**：要明确标注；真实 60fps 必须真机。
- **导出不依赖服务器**：A2 Lite 可以纯客户端生成/下载；付费模板才需要服务端授权。
- **不把模板源码放进 Portal 的公共数据**：Studio 构建产物可以公开；付费模板的完整源码/导出物不能公开。

### 9.3 导出格式的取舍

设计稿写“单 HTML / Vite 项目 / B 站 Toy 适配包”，但 Must 行只写“单 HTML 导出”。【建议】分层：

| 格式 | 优先级 | 说明 | 首版 |
|---|---|---|---|
| 单 HTML | **Must** | 一个文件，零外部，file:// 可开 | 做 |
| Vite 项目 | Should | 源码工程，方便二次开发 | 二期 |
| Toy 适配包 | Should | 平台清单/入口/尺寸约定 | 二期，先核实平台规则 |
| zip 模板包 | Could | 多预设/多文件 | 暂不做 |

【推断】三种格式同时做会把“导出器”变成“项目脚手架”，工期至少翻倍；首版只做单 HTML，才符合“超轻、秒开、可上传”的卖点。

### 9.4 参数 schema 的验收

每个字段必须满足：
- 有默认值、范围/选项、单位；
- 改变它，画面/音频/相机至少一项可观察变化；
- 非法值被 clamp/回退，不崩溃；
- 参与导出 JSON，刷新/分享可复现；
- 不包含函数/DOM/类实例；
- 有 `affects` 标记，Studio 可以按“视觉/音频/相机/画质”分组。

【建议】写一个 **param coverage test**：遍历每个字段的边界值/默认值，生成截图或读取 `renderer.info`，断言“有变化/不崩溃”。这比手工点一遍可靠。

### 9.5 体积检查器的实现

- **构建期**：`check-budget.mjs` 读 `dist/a2/<template>/index.html`，`zlib.gzipSync(level:9)`，写 `manifest.json`；超过 `hardRaw/hardGzip` 直接非零退出。
- **Studio 侧**：`CompressionStream('gzip')` 计算当前生成的 HTML；不支持时读 `manifest.json`；显示“估算/权威”标签。
- **Portal 侧**：只展示 manifest 数字，不重新计算；避免浏览器差异。
- **报告**：每个模板一张卡：raw、gzip、target、hard、状态、生成时间。

### 9.6 体积门与“1MB”口径

【建议】在文档和产品里统一写：

> “A2 模板按两道门验收：单文件 raw ≤1MB（平台入口保守上限），gzip ≤300KB（A2 质量门）；koi 目标 gzip ≤214KB。平台若明确按 gzip 计，raw 门可放宽，但发布前必须用平台真实规则复核。”

不要只写“<1MB”而不说 raw/gzip；这是当前评审里最容易造成误判的地方。

---

## 10. Portal 融合的落地方案

### 10.1 推荐路径：Portal 做“A2 展示层”，不做“A2 工厂”

**Phase P0：权利与资产台账（1–2 天）**

- 建 `docs/A2-ASSET-LEDGER.md`（或表）：每个资产来源、作者、许可证、是否可商用、是否可修改、是否可再分发。
- 明确 Portal 的定位：如果 Portal 是你自有/有授权，可以用它的 UI/Showcases；如果只是公开参考，只能“看”，不能“抄”。
- 明确 Kage/Sylva/Fable 为**不可直接商用**；Kage 只做美术参考，Sylva/Fable 不做代码/资产复用。

**Phase P1：Portal 增加 A2 showcase 分组（1–2 天）**

在 `src/components/ShowcasesPage.tsx`：

- `ShowcaseGroup` 增加 `'A2'`；`BrowserGroup` 增加 `'A2'`；`counts`/`order`/`groupLabel` 同步。
- `SHOWCASES` 增加 3 条：
  - `a2-koi`：`frame: true`，`src: '/a2/templates/koi/index.html'`，tags `Nature/Fluid/Interaction`。
  - `a2-abyss`：`frame: true`，`src: '/a2/templates/abyss/index.html'`（预告/水印版）。
  - `a2-temple`：`frame: true`，`src: '/a2/templates/temple/index.html'`（预告/水印版）。
- `activeId` 分支加 `IframeShowcase`；已有 `allow="autoplay; fullscreen; webgpu"` 可直接用（A2 只 WebGL2）。
- 注意：`ShowcasesPage` 是硬编码大文件，新增分组会触碰筛选/计数/标签；改动不大，但要回归搜索/筛选/键盘/全屏。

**Phase P2：静态模板页 + Studio 入口（1–2 天）**

- `public/a2/templates/koi/index.html`：A2 构建产物（免费预览/水印版）；页内 CTA “Open Studio”。
- `public/a2/templates/abyss/index.html`、`temple/index.html`：预告页/等待名单；不要放完整付费源码。
- `public/a2-studio/index.html`：独立 Studio 构建；Portal 通过链接/iframe 打开。
- `public/a2/index.html`：A2 落地页（3 模板、体积数字、对比、FAQ）。
- `public/_headers`：CSP/缓存；`public/_redirects`：`/a2`、`/a2/studio` 路由。
- `public/llms.txt`：加 A2 条目，便于 AI 搜索引用。

**Phase P3：SEO/内容/分析（1–2 天）**

- 3 个模板详情页：独立 title/description/canonical/OG；内容包含“体积、平台、参数、适用人群、FAQ”。
- 文章：`《780KB 全程序化 3D 场景怎么做》`、`《深海粒子压缩到 214KB》`；链到 Portal/A2。
- 事件：`a2_template_view`、`a2_studio_open`、`a2_export_click`、`a2_download`；不采集敏感信息。

**Phase P4：付费/授权（3–5 天，可选）**

- 如果免费：全部模板公开，靠定制/白标收费；Portal 可以直接放完整 HTML。
- 如果付费：不要把完整 HTML 放 `public/`；只放水印预览。导出走 API/授权：
  - `POST /api/a2/export` 带 license key，返回签名下载 URL；
  - 或使用 Lemon Squeezy/Paddle/Stripe 的 hosted checkout + 许可文件；
  - Studio 预览可以用低质/水印版；付费后下载完整版。
- 不要“前端藏 source”当付费墙：单 HTML 的源码天然可见；付费卖的是**模板使用权/更新/支持**，不是“看不见的代码”。

### 10.2 Portal 代码融合的“不要”

- 不要 `import` Portal 的 React 组件到 A2 模板导出物；
- 不要把 A2 HTML 塞进 `ComponentEntry` / `index.json` / `preview-manifest`；
- 不要使用 Portal 的 `Sandpack` 作为 A2 预览（Sandpack 是代码沙箱，A2 是整页 3D）；
- 不要在 Portal 的组件目录里做 A2 的筛选（模板不是组件）；
- 不要把 Kage/Sylva/Fable 的代码/贴图复制到 A2 模板；
- 不要让 Portal 的公开目录成为付费模板的源站。

### 10.3 Portal 代码融合的“要”

- 用 `ShowcasesPage` 的整页 demo 浏览器 + `IframeShowcase` 做 A2 预览；
- 用 Portal 的 SEO/静态页/`llms.txt` 做 A2 模板详情页；
- 用 Portal 的 `_headers`/`_redirects` 做 A2 路由/CSP；
- 用 Portal 的视觉语言（深色、卡片、标签、全屏）做 A2 落地页；
- 用 Portal 的资产目录/项目元数据做“来源/作者/许可”台账；
- 用 Portal 的 Cloudflare 部署做 A2 静态页/CDN。

### 10.4 如果 Portal 不是你的仓库

【建议】不要写它的仓库；把本稿作为“参考方案”，另建一个**独立 A2 展示页**（可以复用视觉语言，但不复制代码/数据）。A2 与 Portal 的关系改为“互相链接”，不是“同一代码库”。

---

## 11. 工期、依赖与排期

### 11.1 人日估算

| 阶段 | 范围 | 乐观 | 保守 | 依赖 |
|---|---|---:|---:|---|
| P0 | 决策/权利/资产台账/契约冻结 | 1 | 2 | 用户拍板 |
| M0 | koi 抽取 + schema + 构建/导出/体积/零外部 | 5 | 7 | koi 代码、Three |
| S0 | Studio MVP（面板/预览/体积/导出） | 3 | 4 | M0 |
| P1 | Portal A2 分组 + 静态页 | 1 | 2 | Portal 写权限 |
| M1 | 深海模板 | 6 | 9 | Nebula 参考、新场景 |
| M2 | 寺庙模板 | 8 | 11 | 美术/程序化建筑 |
| P2 | 付费/授权/白标 | 3 | 5 | 商业模式 |
| H0 | 真机性能 + 跨浏览器 + 安全 + 文档 | 3 | 5 | 设备/测试 |
| **合计** | **A2 Full** | **30** | **45** | — |
| **A2 Lite** | P0 + M0 + S0 + P1 | **10** | **15** | — |

【推断】设计稿 14–22 人日对应的是“代码主体 + 少量产品化”，不含：
- 深海/寺庙 0→1（约 14–20 人日）；
- 真实移动端 hardening（3–5 人日）；
- Portal 展示/SEO（2–4 人日）；
- 付费/授权/白标（3–5 人日）；
- 权利清理/资产台账（1–2 人日）。
所以 **Full 30–45 人日** 是更现实的。

### 11.2 日历排期（按 1 人 / 2 人）

- **1 人**：A2 Lite 2 周；Full 7–9 周；如果穿插现有站点维护，再加 20–30%。
- **2 人**：A2 Lite 1–1.5 周；Full 4–6 周；一人负责 Core/koi，一人负责 Studio/Portal；深海/寺庙可并行但需要同一契约先冻结。
- **3 人**：不建议把 3 人全压 A2；Portal/内容/美术可以并行，Core 仍需一个 owner。

### 11.3 关键路径

```
P0 决策/权利
  → M0 koi 契约/构建/导出
  → S0 Studio
  → P1 Portal
  → 真实移动端门
  → M1 深海 / M2 寺庙（可并行，但共用 Stage + TemplateSpec）
  → P2 付费
```

【建议】**不要在 koi 契约冻结前开工深海/寺庙**；否则两个模板会各自长一套参数/导出，最后合并成本更高。

### 11.4 72 小时最小行动

**Day 1**
- 确认 5 个决策点（见 §14）；
- 建资产台账，标出 Kage/Sylva/Fable/Abyss 的权利状态；
- 冻结 `TemplateSpec` + `A2Scene`；
- 测 koi 当前 raw/gzip 与真机基线（至少一台手机）。

**Day 2**
- 从 `shared/parts/koi-pond` 抽 `a2/templates/koi/scene.ts`；
- 建 `build-template.mjs` + `check-budget.mjs` + `check-zero-network.mjs`；
- 产出 `dist/a2/koi-spike.html`；
- 截图对比 `/koi` 三风格。

**Day 3**
- 建最小 Studio（3 个滑块 + 1 个颜色 + 1 个导出按钮）；
- 产出 `a2-studio` 可点；
- 决策：如果 koi-spike gzip ≤214KB、视觉不崩、导出可开，进入 M0；否则先优化，不开展深海/寺庙。

---

## 12. 验收门与测试矩阵

### 12.1 产品级验收

| 门 | 标准 | 证据 |
|---|---|---|
| 单文件 | 一个 `.html`；无 source map；无调试面板 | 文件检查 |
| 零外部 | 静态扫描 `src/href/@import/http(s)/fetch/importmap` 0 命中；运行时 Network 0 请求 | `check-zero-network` + 浏览器 |
| 体积 | raw ≤1,000,000 B；gzip ≤300,000 B；koi target ≤214,000 B | `manifest.json` + gzip 9 |
| 可打开 | `file://` 双击可开；Chrome/Safari/Edge 无阻塞错误 | 手动/Playwright |
| 参数 | 每个 schema 字段有可观察变化；非法值不崩；seed 可复现 | coverage test |
| 导出一致 | Studio 预览与导出 HTML 同参数截图/哈希一致 | E2E |
| 视觉 | 三套模板一眼可辨；无空白/黑屏；首帧 <3s（目标） | 截图/视觉门 |
| 移动端 | 目标 60fps：30s 平均 ≥55fps，p95 ≤20ms；至少 45fps 保底 | 真机 |
| 音频 | 用户手势后启动；可关闭；无自动播放阻塞 | 手动 |
| 安全 | 参数 JSON 转义；iframe 预览 sandbox；无 XSS | 代码审查/测试 |
| 权利 | 每个资产有来源/许可证/可商用标记 | 台账 |
| 文档 | 模板说明、参数、平台、FAQ、体积 | 静态页 |

### 12.2 性能测试口径

【建议】不要再用“申报 `costMs`”当验收。A2 的 `A2Scene` 应暴露/记录：
- `renderer.info.render.calls`、`triangles`、`points`；
- `frameTime` 的 p50/p95；
- 分辨率/DPR/粒子数/鱼数；
- 首帧时间、内存（如可用）。

测试设备：
- iPhone 12/13（Safari，390×844，DPR 2/3）；
- 中端 Android（Chrome，360×800，DPR 2）；
- 桌面 Chrome（1440×900，DPR 1）。
- 每台设备跑 30s，记录平均/p95；热机后复测；低电量模式单独测。

【建议】三档 quality：
- `high`：桌面/旗舰；全粒子、全阴影、DPR 2；
- `balanced`：中端；降粒子/阴影/DPR 1.5；
- `low`：低端/省电；半粒子/无阴影/DPR 1；必要时 30fps 目标。
- 自动降档：连续 3 秒 p95 > 24ms 降一档；不要只靠 UA。

### 12.3 体积测试口径

- 构建期 `zlib.gzipSync(html, { level: 9 })` 为权威；
- raw 用文件 `stat`；
- 每个模板独立，不把三套模板加总；
- Portal/Studio 不计入模板门；
- 导出物内联的 Three 版本固定，记录版本号；
- 任何外部字体/图片/音频都算失败（除非 data URI 且已计入体积）。

### 12.4 Portal E2E

- `/showcases` A2 分组可见；搜索/筛选/分组计数正确；
- `/a2/templates/koi` iframe 可开；全屏/退出；无 404；
- `/a2-studio` 可开；参数/预览/导出可用；
- 移动端视口不溢出；键盘 Esc/搜索可用；
- Lighthouse：性能/可访问性/SEO 不低于现有 Portal 页面基线；
- `_headers` CSP 不阻断 A2 的内联脚本/Worker（如有）；
- 付费：未授权不能拿到完整 HTML；授权后下载可打开。

---

## 13. 风险登记与 Kill Criteria

| 风险 | 等级 | 说明 | 缓解 |
|---|---|---|---|
| 权利风险 | **高** | Portal 无根 LICENSE；Kage ©；Sylva 不再分发；Fable 无 LICENSE；上游组件许可不一 | 资产台账；只用自有/明确许可；Kage 仅参考；付费前法务确认 |
| 深海/寺庙 0→1 | **高** | 不是存量改造；视觉/性能/工期都不确定 | 先 koi；新场景独立立项；每个模板先做 3 天 spike |
| 移动端 60fps | **高** | 未真机验证；粒子/阴影/后处理易掉帧 | 三档 + 自动降档；WebGL2；真机门；不承诺未测数字 |
| 体积 | **中高** | koi 过门，但深海/寺庙可能超 300KB | 双门；tree-shake；程序化纹理；无外部；按模板卡 |
| WebGPU 平台 | **中** | `still`/Portal 部分 demo 依赖 WebGPU；Toy 是否支持未知 | v1 只 WebGL2；WebGPU 只做可选 high 档 |
| Portal 耦合 | **中** | 5,000 组件/6,000 文件/React 19/Vite 8；合并会拖垮 A2 | 三平面；Portal 只做展示/SEO；不 import 运行时 |
| 付费墙 | **中** | 单 HTML 源码可见；前端藏不住 | 卖授权/更新/支持；服务端签名下载；不要假装“源码保密” |
| 市场 | **高** | 46 分；C 端付费意愿未知；Portal 受众不完全匹配 | A2 Lite 先验证下载/转化；内容引流；不要先做 3 套全量 |
| 平台规则 | **中** | Toy 的 1MB 按 raw/gzip、入口形态、审核规则未核实 | 发布前用官方规则复核；双门保守 |
| 产品范围 | **高** | 3 模板 + 3 导出格式 + Portal + 支付，容易失控 | 首版只做 koi + 单 HTML；其余分期 |
| 维护 | **中** | Portal 5,000 组件/19 项目本身是重资产 | 不把 A2 塞进组件目录；独立构建/测试 |
| `costMs` 口径 | **中** | 申报值 vs 实测值矛盾；会误导降档 | A2 用实测 p50/p95；不用自报 |
| 安全 | **中** | iframe 预览、参数 JSON、付费下载 | sandbox、转义、CSP、签名 URL |
| 法律意见 | — | 本文不是法律意见 | 商用前请专业确认 |

### Kill Criteria（建议写进立项）

1. **koi-spike** 在目标移动设备上连续 30s 平均 <45fps，且降档后仍 <45fps → 停止新模板，先做性能重构。
2. **koi-spike** raw >1MB 或 gzip >300KB，且 tree-shake/去 paper/post 后仍超 → 停止 A2 Full，先解决体积。
3. 无法确认 Portal/上游资产的**可商用权** → 不进入付费模板；只做免费/自建美术。
4. 深海/寺庙 spike 3 天后仍无“可辨识的视觉母题” → 回退，不硬做三套。
5. A2 Lite 上线 4 周内下载/咨询转化低于预设阈值（需商业侧定） → 不投入 Full，转定制/白标。

---

## 14. 需要拍板的事项与默认假设

### 14.1 本稿默认假设

【假设】如果以下任一不成立，结论要改：

1. **A2 仍是 C 端模板产品**（B 站 Toy 创作者/独立开发者/禅意内容作者），不是 ToB/ToG 站点产品。
2. **Portal 是你自有或有使用权的仓库**；如果只是公开参考，不能复制其代码/资产，只能做视觉参考与互链。
3. **原“深海粒子项目”不在本仓库**；如果它在别处，M0 可以改为深海，但仍需产品层。
4. **目标是付费/半付费产品**；如果完全免费开源，可以去掉支付/授权，Portal 直接放完整 HTML。
5. **需要覆盖 B 站 Toy + 独立站**；如果只做独立站，1MB 门可以放宽，但仍建议保留 300KB 质量门。

### 14.2 建议拍板的 6 件事

| 编号 | 决策 | 选项 | 建议默认 |
|---|---|---|---|
| D1 | 目标客户 | C 端模板 / ToB 站点 / 两者 | C 端模板，先做 A2 Lite |
| D2 | Portal 权利 | 自有 / 有授权 / 仅参考 | 先按“有使用权”做展示；代码复用前出 ledger |
| D3 | 深海项目 | 原项目可用 / 不在 / 放弃 | 不在则 M0 改 koi；深海另立 0→1 |
| D4 | 付费模式 | 全免费 / 免费+付费 / 全付费 | 免费 koi 样例 + 付费深海/寺庙；或先全免费验证 |
| D5 | 分发 | Toy / 独立站 / 两者 | 两者；先单 HTML，Toy 包二期 |
| D6 | Three 版本 | 本仓库 0.169 / Portal 0.185 | 0.169；不跨版本合并 |

### 14.3 如果只能做一件事

**做 koi A2 Lite，并把 Portal 当展示页。**  
理由：它是唯一能在 10–15 人日内产生“可导出、可测量、可展示、可验证需求”的资产；深海/寺庙在没有验证前投入，容易变成“三套半成品”。

---

## 15. 一页式路线图（给决策会用）

```
2026-11 第 4 周    P0 决策/权利/契约              1–2 人日
2026-12 第 1 周    M0 koi 模板 + 构建/导出/体积    5–7 人日
2026-12 第 2 周    S0 Studio MVP + P1 Portal 展示  4–6 人日
2026-12 第 3 周    真机性能门 + A2 Lite 发布        3–5 人日
2027-01 第 1–2 周   M1 深海模板                    6–9 人日
2027-01 第 3–4 周   M2 寺庙模板                    8–11 人日
2027-02            P2 付费/授权/白标 + H0 hardening 6–10 人日
```

> 这是“1 人全职 + 少量协作”的粗排；2 人可把深海/寺庙并行，但 `TemplateSpec` 契约必须先冻结。

---

## 16. 证据与来源

### 16.1 本仓库

- `docs/HANDOFF.md`：装配模型、六层、零件口径、四站状态。
- `docs/DECISIONS.md`：ADR-04/08/09/10/11；koi 栈、`costMs` 口径、grand-atelier D0。
- `docs/PRODUCT-FORM.md`：四站产品形态与红线。
- `docs/A2-FEASIBILITY-REVIEW.md`：A2 既有可行性评审；本稿在其上补 Portal 与实现路径。
- `package.json`：`three@^0.169.0`、`esbuild`、`tsx`、`typescript`；无 Vite/lil-gui。
- `shared/stage/contract.ts`：`PartV2.create(env)`、`costMs`/`kb` 自报、`CUE_VERBS`。
- `shared/stage/preview/build.mjs`：`PART_ENTRY`、`PRESETS`、单 HTML/零外部断言。
- `dist` 实测：2026-11-23 本轮 .NET GZip Optimal；既有评审 `gzip -9` 数字并列。

### 16.2 A2 设计稿

- 用户上传《AI 机会雷达 · A1–A4 完整产品设计稿》，A2 章节。
- 原始 URL：`https://aka.doubaocdn.com/s/OLrtNkmCyi`
- 本地副本：`C:\Users\Lenovo\DoubaoWork\chats\2026-11-23\new-chat\_source\ai-radar-product-designs-2026-11-23.md`

### 16.3 Portal

- 仓库：`https://github.com/yysam123456-source/frontend-design-portal`
- `package.json`：React 19/Vite 8/Tailwind 4/TS 5.9/Three 0.185；Sandpack/Pixi/R3F 等。
- `index.html`：5,000+ 组件、纯客户端、上游许可声明、Google Fonts 外链。
- `src/data/projects.ts`：19 个项目；`threeui`/`ui`/`looseleaf`/`ascii`/`shaders`/`pinui` 等。
- `src/components/ShowcasesPage.tsx`：**103 个 Showcases（27 本地 + 76 Fable 远程）**；`IframeShowcase`；Kage/Abyss/Nebula/Starfall/Grand Atelier 等；`src/components/fableCatalog.ts`：Fable 76 条远程 iframe，上游无 LICENSE，只作视觉参考。全量清单见 `docs/A2-SHOWCASE-INVENTORY.csv`。
- `src/components/showcases/AbyssalDescent.tsx`：图片序列，不是 3D。
- `src/components/showcases/NebulaGalaxyShowcase.tsx`：Three.js 星系粒子。
- `public/showcases/starfall.html`：程序化村落；外链 `unpkg.com/three@0.185.0`。
- `public/kage.html`：244,467 B；© 2026 Kage；外链 `three.min.js`、字体、webp。
- `src/grand-atelier`：组件/库集合较完整（19 组件 + lib），可作本地缺失模块参考；本仓库 `grand-atelier` 缺 4 模块；未构建验证。
- `docs/SEO_TIER2_DESIGN.md`：5,075 组件/9 项目（与 `index.html`/数据漂移）。
- `public/_headers`、`_redirects`、`llms.txt`：部署/SEO/路由。
- 说明：Portal 未在本机 clone/构建；以上为源码/文档读取，非运行实测。

### 16.4 未验证清单

- Portal `npm install` / `npm run build` 未执行；其 dist/构建时间未复现。
- A2 深海/寺庙未做 spike；工期是估算。
- 移动端 60fps 未真机验证；`costMs` 口径未重新审计。
- Toy 平台 1MB 的真实计量方式（raw/gzip/包）未核实。
- Kage/Sylva/Fable/Abyss 的具体权利未做法务确认；只按仓库声明标记风险。

---

## 17. 追问复核：多模板装配与 Showcase 全量

### 17.1 先给结论

| 追问 | 结论 | 证据 |
|---|---|---|
| 当前零件架构能否装配多模板？ | **能，构建/composition 层已经具备** | `shared/stage/preview/build.mjs` 的 `PRESETS` 有 14 个 composition；`build:preview --preset` 一次构建一个独立单 HTML；`Stage` 支持多零件、L0–L5、单 GL、单 L4、预算降档、错误隔离、`dispose` |
| 一个 Stage 能否同时挂多套 3D 世界？ | **不能，也不建议** | `validateParts` 强制单 GL（`E_MULTI_GL`）、单 L4（`E_MULTI_POST`）；一个模板应收敛为“一个 GL 场景 + 若干 2D 叠加层” |
| 能否在运行时切模板/调参数？ | **当前不能直接做** | `PartV2.create(env)` 不接收参数，`PartEnv` 没有 `opts`；`koi-pond` 从 URL 查询串读 `style/mode/cam/...`，没有 `makeKoiPond(opts)` 工厂；`hug-meadow` 同样只有 `create(env)` |
| 能否直接作为 A2 多模板产品交付？ | **还不能** | 缺模板注册表、参数 schema、模板级体积门、用户导出、Studio UI；`PRESETS` 是开发预设，不是产品模板 |
| Portal Showcase 到底有多少？ | **103 个**：27 个本地 + 76 个 Fable 远程 | `ShowcasesPage.tsx` 本地 `SHOWCASES` 27 条；`fableCatalog.ts` 声明 76 条；合计 103；全量清单见 `docs/A2-SHOWCASE-INVENTORY.csv` |
| Showcase 能否直接变成 A2 模板？ | **大部分不能** | 76 条 Fable 全部是远程 iframe，上游无 LICENSE，不能复制源码/截图；本地 27 条中多数是 demo/资产重，真正零外部、可产品化的只有 koi（站点）和少量零件 |

**一句话回答**：**“多模板装配”在当前零件架构上已经成立，甚至已经有 14 个 composition 作为雏形；真正缺的不是 runtime，而是模板注册、参数化、体积/导出和 Studio 这层产品化，以及深海/寺庙两个新的 GL 场景。** 上一稿把“产品层缺口”写成了“运行时缺口”，这是过度设计；用户的判断是对的。

### 17.2 “多模板”要拆成五件事

| 层次 | 当前现状 | A2 需要做什么 | 判断 |
|---|---|---|---|
| 多 composition（多个模板构建） | `PRESETS` 14 个；每个 preset 一个独立 HTML | 把 `PRESETS` 升级为 `TEMPLATES` 注册表，循环构建 | **已有 80%**，不需要新 runtime |
| 多模板注册/发现 | 只有开发用 `PRESETS`，没有产品元数据 | `TemplateSpec`：id、标题、schema、composition、预算、封面 | 新增薄层 |
| 一个页面内运行时切换 | 没有；`Stage` 是一份 composition | 切换 = `dispose` + 重建 Stage；可做但不急 | 可选，不是首版必须 |
| 多 GL 场景同屏 | 不支持（单 GL） | 每个模板一个 GL 场景；多 3D 物体在同一个 GL 零件内部组 scene graph | **不要改 Stage 契约** |
| 参数化/用户导出 | 没有；koi 读 URL，导出是开发脚本 | `makePart(opts)` 工厂 + 参数 schema + 构建循环 + Studio | 主要工作量 |

### 17.3 架构修正：`Stage` + `TemplateSpec`，不是新 Runtime

#### 17.3.1 为什么 Stage 够用

`Stage` 已经承担了模板运行时最难的通用部分：

- L0–L5 六层、按层/按 z 排序；
- 单 GL 通道、单 L4 后处理；
- 2D canvas 叠加层（UI、标题、按钮、HUD）；
- 预算降档、DPR 钳制、错误隔离；
- `Stage.dispose()` 生命周期。

这些正是“模板外壳”需要的能力。koi、hug、still 已经是三种不同的 composition，说明 Stage 不是只能跑一个固定场景。**再写一个 A2 Core 渲染循环，会把 Stage 已经解决的问题重新做一遍。**

#### 17.3.2 薄层应该加在哪

```
Stage（现有，渲染/合成/预算）
   ↑
TemplateSpec（新增，模板元数据 + composition 工厂 + 参数 schema）
   ↑
Template Registry（新增，模板列表/构建/体积门）
   ↑
Studio（新增，参数面板/预览/导出）
Portal（现有，展示/SEO/导流）
```

`TemplateSpec` 只需要把“参数 → Stage 的 parts 列表”映射出来，不碰渲染循环：

```ts
interface TemplateSpec {
  id: string;
  title: string;
  schema: ParamSchema;            // 用户可调参数 + 默认值 + 范围
  composition: (params: Params) => {
    parts: Array<string | { id: string; opts?: Record<string, unknown> }>;
    seed: number;
    budgetMs: number;
    glBlend: 'normal' | 'screen' | null;
  };
  build: { title: string; slug: string; cover: string };
}
```

`composition(params)` 的输出就是 `build.mjs` 现在吃的 `parts/seed/budgetMs/glBlend`；`Stage` 直接消费。换句话说：**A2 的“core”= `TemplateSpec` + `Stage` + 构建/体积/导出，不是一个新引擎。**

#### 17.3.3 koi 需要的一步改造

`koi-pond/index.ts` 当前：

```ts
function create(env: PartEnv): PartInstance {
  // S.style = pick(STYLES, Q.get('style'), 'ink')
  // ...
}
```

它从 `Q`（URL 查询串）读参数。`build.mjs` 的 `koi` preset 没有给 `opts`；`koi-nolimit` 也没有。也就是说：

- **构建时多模板**：可以，`koi` preset 已能构建；
- **模板参数化**：不行，`style/fish/cam/rain` 只能靠 URL，导出文件没有 URL 查询串时无法稳定复现。

最小改造是加一个工厂，而不是改 `PartV2` 全局契约：

```ts
export function makeKoiPond(opts: KoiOptions = {}): PartV2 {
  return {
    ...part,
    create(env) {
      return createKoi(env, opts); // 内部用 opts 覆盖 Q
    },
  };
}
```

这样 `build.mjs` 可以写：

```js
parts: [
  'paper-ink',
  { id: 'koi-pond', opts: { style: 'ink', fish: 9, cam: 'angle' } },
]
```

`hug-meadow` 同理：如果 A2 要调风速/蒲公英密度，加 `makeHugMeadow(opts)`；如果首版不参数化，可以先不动。

#### 17.3.4 单 GL 约束下的模板形态

每个模板一个 GL 场景零件：

| 模板 | GL 零件 | 2D 叠加 | 备注 |
|---|---|---|---|
| 禅意池 koi | `koi-pond` | `paper-ink`（L0）、标题/菜单 | 已有 |
| 深海 abyss | `abyss-scene`（新） | `tide-medium`（L0）、bubbles、still-sink | 需要新 GL 零件 |
| 寺庙 temple | `temple-scene`（新） | 纸/雾 L0、UI | 需要新 GL 零件 |

不要拆成“寺庙建筑 GL + 香火 GL + 佛像 GL”三个 GL 零件；应在 `temple-scene` 内部组一个 scene graph，外部仍是一个 GL 零件。Stage 的 L2/L4/L5 只做 2D 叠加和后处理，不承担第二个 3D 世界。

#### 17.3.5 运行时切换/调参

首版不需要“无刷新实时调参”。可行顺序：

1. **构建时参数**：`TEMPLATES` 的 `composition(params)` 在构建时生成；
2. **Studio 预览**：用户改参数 → `dispose` 旧 Stage → 用新 composition 重建 Stage（200–300ms debounce）；
3. **后续优化**：如果重建太慢，再给 GL 零件加 `apply(params)` 增量接口；不要一上来做。

这样既不新造 runtime，也不把 Stage 改造成 React 式响应系统。

#### 17.3.6 目录修正

原 §7.1 的 `a2/core` 可以保留，但只放“非渲染”的薄层：

```
a2/
  core/
    template-spec.ts        // 类型 + 注册表
    params.ts               // schema/默认值/校验
    budget.ts               // raw/gzip/外部资源门
    export.ts               // 构建/写盘/断言
  templates/
    koi/
      composition.ts        // parts + opts + seed + budget
      schema.ts
      part.ts               // makeKoiPond(opts)
    abyss/
    temple/
  build/
    build-templates.mjs     // 循环 TEMPLATES，复用 shared/stage/preview/build.mjs 的单 HTML 逻辑
  studio/                   // Vite + 原生 TS，不引 React 到 core
```

`shared/stage/preview/build.mjs` 继续作为“单模板单 HTML”的底层构建器；A2 只在上层加循环、模板元数据和体积断言。**不需要复制一份 build.mjs 到 a2/core，也不需要新写 renderer。**

### 17.4 Showcase 全量：103 个，不是 30 个

#### 17.4.1 计数

| 来源 | 条数 | 形态 | 权利/可复用性 |
|---|---:|---|---|
| `ShowcasesPage.tsx` 本地 `SHOWCASES` | 27 | 20 个 `THREE.JS`、4 个 `LOCAL`、3 个 `ASCII` | 混合；`Kage` ©、`Sylva` 明确不再分发；其余多为 upstream/unknown |
| `fableCatalog.ts` `FABLE_SHOWCASES` | 76 | 全部 `IframeShowcase` 远程 iframe | **上游无 LICENSE**；只嵌入作者托管页面，不复制源码/截图 |
| **合计** | **103** | 27 本地 + 76 远程 | 可产品化比例低 |

标签统计（可重叠）：

| 标签 | 数量 | 说明 |
|---|---:|---|
| Interface | 24 | 全在 Fable；Portal 的 UI 演示，不是 A2 场景 |
| Scene | 19 | **全在 Fable**；视觉场景参考，但全部远程/无 LICENSE |
| Typography | 17 | 字体/排版演示，不是 A2 模板 |
| Interaction | 14 | 交互演示，部分可参考 |
| Nature | 13 | 自然/植被/水/雪，部分可参考 |
| Generative | 12 | 生成式视觉，部分 shader 参考 |
| Physics | 11 | 物理/粒子，部分可参考 |
| Culture | 7 | 文化母题，部分可参考 |
| Particles | 6 | 粒子，可参考 |
| Atmosphere | 5 | 雾/极光/大气，可参考 |
| Space | 3 | 星系/行星，非 A2 |
| Mechanical | 3 | 机械，非 A2 |
| Architecture | 3 | 建筑，寺庙参考 |
| Scroll | 2 | 滚动叙事，非 A2 |
| Fluid | 2 | 水体，参考 |

**关键事实：19 个 `Scene` 标签全部落在 Fable 远程条目上，没有一条是本地可打包代码。** 所以“Showcase 很多”与“A2 可直接用的 3D 模板很多”不是同一件事。

#### 17.4.2 本地 27 条里，哪些跟 A2 有关

| 本地条目 | 形态 | 对 A2 的价值 | 能不能直接用 |
|---|---|---|---|
| `kage` | Three.js 寺庙/鸟居，外链 three/webp/字体，© 2026 Kage | **寺庙美术方向、构图、色彩** | **不能**：© + 外链资源 |
| `abyss` | 2D 深海图片序列 | 深海氛围/分镜参考 | 不能做 3D 模板；可做 L0/转场参考 |
| `nebula` | Three.js 星系粒子 shader | 深海粒子/生物发光的技术参考 | 不能直接当深海场景；可参考 shader 结构 |
| `water` / `ocean` | Three.js 水体/FFT 海面 | 水体材质、焦散、波浪参考 | 资产/性能重，不能直接产品化 |
| `ssf-fog` | 屏幕空间雾 | 深海/寺庙雾层参考 | 可参考算法，不是模板 |
| `starfall` | 程序化村落，外链 unpkg three | 寺庙/山地村落布局参考 | 外链 + 非零外部，不能直接打包 |
| `grand-atelier` | 钢琴 PBR/室内 | PBR、室内材质参考 | 不是寺庙；资产重 |
| `phoenix` | 中式凤冠/文化母题 | 寺庙文化符号、配色参考 | 文化参考，不是 3D 场景 |
| `snow` / `rain` / `grass` / `vegetation` / `crystal` | 雪/雨/草/WebGPU 生长/晶体 | 自然/粒子/生长参考 | 多数资产重或 WebGPU，不是 A2 必选 |
| `building` | 程序化建筑 | 寺庙建筑体块参考 | 参考，不是成品 |
| `looseleaf` | 纸感 UI | 本仓库已提取 `paper-ink` | 已复用 |
| `pixijs` / `mecha` / `ascii*` | 2D/机械/ASCII | 与 A2 三套 3D 模板无关 | 不相关 |

#### 17.4.3 Fable 76 条里，哪些跟 A2 有关

只列与 A2 视觉/技术直接相关的代表条目：

| Fable 条目 | 对 A2 的价值 | 使用方式 |
|---|---|---|
| `fable-009 Koi Pond, Noon` | 锦鲤池的视觉基准（构图、光、鱼群） | **只看**，远程 iframe，无 LICENSE；不能复制 |
| `fable-030 Rose Window` | 寺庙/教堂建筑、彩窗、光束参考 | 只看，不能复制 |
| `fable-008 Cabinet of Impossible Minerals` | raymarch 晶体/矿物材质 | 技术参考；不能复制 |
| `fable-012 Murmuration` | 群集/鸟群物理 | 粒子/群集参考 |
| `fable-013 Iron Filings` | 铁屑/磁场物理 | 粒子/物理参考 |
| `fable-020 Aurora` | 极光/大气 | 氛围参考 |
| `fable-026 Frost on the Window` | 冰花/近景材质 | 材质参考 |
| `fable-067 A Short History of Fog` | 雾/叙事 | 氛围参考 |
| `fable-046 Evening Snow at the Bridge` | 雪/桥/村落 | 场景参考 |
| `fable-062 Wheat, Before Rain` | 麦田/风雨 | 自然参考 |
| `fable-022 The Hotel Meridian` | 室内/电梯/建筑 | 室内参考 |
| `fable-073 Zoetrope` | 动画/机械 | 动画参考 |
| `fable-079 Formicarium` | 蚁群/生态 | 群集参考 |

其余 Fable 条目大多是 Interface、Typography、Generative、Physics 的视觉实验；它们是 Portal 的内容资产，不是 A2 的模板资产。

#### 17.4.4 对 A2 三套模板的映射

| A2 模板 | 最强本地参考 | 最强 Fable 参考 | 可直接复用的代码 | 结论 |
|---|---|---|---|---|
| 禅意池 koi | `koi-pond`（站点代码） | `fable-009 Koi Pond, Noon` | `koi-pond` + `paper-ink` | 唯一接近产品化的模板 |
| 深海 abyss | `abyss`（2D）、`nebula`（粒子）、`water/ocean`（水体） | `fable-020`、`fable-026`、`fable-067`、`fable-008` | 无现成 3D 场景 | 需要新 `abyss-scene` |
| 寺庙 temple | `kage`（©）、`starfall`（村落）、`grand-atelier`（PBR）、`phoenix`（文化） | `fable-030 Rose Window` | 无现成 3D 场景；Kage 不可用 | 需要新 `temple-scene` |

**这意味着“多模板装配”可以先用现有零件跑出 3–5 个 composition，但 A2 的三套商用品仍然只有 koi 一套接近交付；深海/寺庙不是“装配问题”，是“新 GL 场景问题”。**

#### 17.4.5 权利结论

- **Fable 76 条**：上游无 LICENSE，Portal 只远程 iframe；A2 不能复制源码、不能截图打包、不能作为付费模板素材。最多做“视觉参考/对比图”，且要注明来源。
- **Kage**：页面带 `© 2026 Kage — Kage no Michi`；不能把寺庙页面/美术资源直接并入 A2。
- **Sylva / Sylva Bloom**：Portal 条目注明上游不授予代码/设计/作品再分发许可；不能复用。
- **本地其余**：仓库无根 LICENSE；即使代码可用，素材（贴图/模型/字体）也可能另有权利。A2 商用前必须逐项确认。
- **Portal 代码本身**：根目录无 LICENSE，`index.html` 说组件代码许可以上游为准；不能因为“在 GitHub 上”就默认可商用。

### 17.5 修正后的路线与工期

| 阶段 | 内容 | 工期 | 备注 |
|---|---|---:|---|
| M0-a | `PRESETS` → `TEMPLATES` 注册表；循环构建；先跑通 koi/hug/still 三条 composition | 1–2 人日 | 证明“多模板装配” |
| M0-b | `makeKoiPond(opts)` / composition 参数化；koi 参数不依赖 URL | 1–2 人日 | 模板化关键一步 |
| M0-c | `TemplateSpec` schema + 体积门 + 单 HTML 导出 | 2–3 人日 | 产品化 |
| S0 | 最小 Studio（参数面板/预览/导出） | 3–4 人日 | 可后置 |
| P1 | Portal A2 分组 + 3 张卡 + iframe | 1–2 人日 | 展示层 |
| **A2 Lite** | koi + registry + Studio + Portal | **9–14 人日**（保守 10–15） | Stage 复用省 1–2 天 |
| A2 Full | 3 模板 + 付费 + 真机 | **30–45 人日**（Stage 复用后可压到 28–42） | 新场景/权利/移动端不变 |

**多模板的“演示版”可以更快**：用现有 `koi`、`hug`、`still` 三条 composition，1–2 天就能做出“三个模板切换/三个独立 HTML”的 demo；但它不是 A2 的三套商用品，因为 `hug` 是草甸、`still` 是 WebGPU 体素，和“禅意池/深海/寺庙”不是同一产品线。**可以用它证明架构，不要用它冒充 SKU。**

### 17.6 修正后的判断

1. **用户的判断成立**：当前零件架构可以装配多模板；`PRESETS`/`build:preview` 已经是雏形，不需要另造 A2 运行时。
2. **上一稿的“独立 A2 Core”过度设计**：应改为 `Stage` + `TemplateSpec` + 构建/体积/导出；`a2/core` 只放薄层，不写 renderer。
3. **仍不能直接产品化的三件事**：模板参数化（koi 读 URL）、模板注册/导出、两个新 GL 场景（深海/寺庙）。
4. **Showcase 数量判断修正**：从“30+”修正为 **103**（27 本地 + 76 Fable）；用户是对的，上一稿扫描不全。
5. **但“数量多”不等于“可复用多”**：19 个 Scene 全在 Fable 远程、无 LICENSE；本地 27 里真正零外部可产品化的只有 koi 和少量零件。Portal 是**视觉参考库/展示层**，不是**模板库**。
6. **推荐路径不变但更轻**：先做 koi 的参数工厂 + `TEMPLATES` 注册表 + 体积/导出，再把 hug/still 作为多模板证明；深海/寺庙作为下一批新 GL 场景，不要塞进 M0。

## 18. 最后一句话（修订）

**A2 不是“再建一个运行时”，而是“把现有 Stage 升级成模板装配线”：koi 是第一条可交付产线，hug/still 是多模板的证明，深海/寺庙是下一条产线；Portal 的 103 个 Showcase 是橱窗和参考库，不是可直接搬运的模板仓。**

## 19. 落地进度（2026-11-23 晚）

本轮已从“报告”推进到“可构建实体”，详见 `docs/A2-PARTS-AND-TEMPLATES.md`：

- **新增 3 个 Stage 零件**：`shared/parts/abyss/index.ts`（L0 Canvas 深海光柱）、`shared/parts/nebula/index.ts`（L1 GL 四旋臂星系）、`shared/parts/temple/index.ts`（L1 GL 夜寺鸟居）。
- **koi 参数化**：`shared/parts/koi-pond/index.ts` 新增 `KoiOptions` / `makePart(opts)`，保留 `/koi` 原有 query 行为。
- **新增 3 个 preset**：`a2-deepsea`、`a2-nebula`、`a2-temple`；`PRESETS` 从 14 个增至 17 个。
- **三层产品化落地**：`shared/product/templates.mjs`（注册表）→ `shared/product/build-templates.mjs`（构建/体积/零外部门）→ `shared/product/studio.mjs`（Studio 生成器）。
- **4 个可构建模板**：`deepsea` 27.6 KB / gzip 11.1 KB；`nebula` 504.4 KB / gzip 131.8 KB；`temple` 528.0 KB / gzip 138.2 KB；`koi` 576.1 KB / gzip 158.1 KB。
- **全量零件图谱**：`docs/PART-ATLAS.csv` 6,675 行 + `docs/PART-ATLAS.md`；`port` 1,529 条，`ui-reference` 4,151 条，`archive` 539 条，`reference` 427 条，`skip` 29 条。
- **验证**：`npx tsc --noEmit` 通过；`node tests/preview-build.mjs` 783/783 通过。

**结论更新**：深海/寺庙不再是“下一条产线”的空白，已有可构建零件与模板；剩余补零件工作应按图谱的 `pixelfx → shaders → threeui → ascii` 顺序挑，而不是按 6,675 条逐条复制。

