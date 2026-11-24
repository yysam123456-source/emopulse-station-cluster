# A2（Sub1 Studio）架构可行性评审

> **2026-11-24 回看**（正文是 11-23 的原稿，未改；现状见 [`docs/A2-PARTS-AND-TEMPLATES.md`](./A2-PARTS-AND-TEMPLATES.md)，判定见 [`ux-a2/WALKTHROUGH.md`](./review-2026-11-24/ux-a2/WALKTHROUGH.md) §5）
>
> | 本文当时的判断 | 一天后的实测 |
> |---|---|
> | §4 差异 1「架构是站点装配运行时，A2 是模板 + 参数化导出产品」 | **印证**。Studio 只落地了「调参数」和桌面预览；选模板、体积实时反馈、移动端模拟、导出四步仍缺 |
> | §4 差异 4「没有产品级体积门」 | **印证，并出了反例**。构建现在会算 gzip，但没有阈值：temple / gate gzip 3.47 MB 照样 `READY` |
> | §4 差异 6「调试条 ≠ 产品控件」 | **印证**。调试条现在直接出现在 5 个模板页和每个 Studio 预览里 |
> | Must 1「寺庙模板没有」 | **已做出来**：`shared/product/templates.mjs` 注册 5 个模板（deepsea / nebula / temple / gate / koi），`abyss` / `nebula` / `temple` 三个零件落地 |
> | Must 4「参数面板全部不存在」 | **部分做出来**：Studio 有 25 个控件（8 下拉 / 13 滑块 / 4 复选）；没有颜色选择器、没有画质下拉 |
> | Must 3 体积预算检查器、Must 5 单 HTML 导出 | **仍未达成**。Must 2 全程序化、Must 4 参数面板、<1 MB 为「部分」；六项合计 1 达成 / 3 部分 / 2 未达成 |
> | §3 体积实测「全部 < 1 MB」 | **不再成立**：temple / gate gzip 3,473,188 / 3,473,186 B，原因是内嵌 12 张位图贴图（占 gzip 95.3%） |
> | §5 人日估计（M0 4–6、全量 14–22） | 模板与 Studio 当晚落地，未达成的仍是本文标「新建」的体积检查器与用户侧导出。估计不再作排期依据，后续以评审 §5.2 的 A2 条目为准 |

> 评审日期：2026-11-23 ｜ 性质：**立项决策用的只读评审**，不是施工设计
> 输入：`C:/Users/Lenovo/WorkBuddy/2026-10-27-14-44-45/docs/ai-radar-product-designs-2026-11-23.md` §0 / A2 全章 / §5.2 / §5.3 / §六
> 被评审底座：`C:/Users/Lenovo/WorkBuddy/2026-11-17-13-04-03/emopulse_station_cluster`
> 证据口径：本文所有「现成能力」都给 `file:line`；所有体积数字都来自本文第 3 节实际执行的命令输出。**未实测的一律标「未核实」**。
> 已作废的 `PRD-REUSE` / `ARCHITECTURE-REUSE` / D0–D4 / 门 1–10 体系不作为本文依据。

---

## 1. 结论先行

**不能快速实现 A2 的产品整体；但 M0 的体积判断门按本仓库代理场景实测是过的，卡点不在体积，在「模板产品化层」缺失。**

- 三套 3D 模板只现成两套近似（`koi-pond` 锦鲤池、voxel `still` 水下），**深海粒子项目根本不在本仓库**，寺庙模板没有。
- 单 HTML 装配与零外链已经成熟；但 lil-gui 式参数面板、实时 gzip 预算检查器、三格式导出层**全部不存在**。
- 依赖表只有 `three@^0.169.0` + esbuild；**没有 lil-gui、没有 Vite**，A2-5 的技术选型与当前底座不同构。
- 实测代理场景 gzip 最大为 `koi` 站点 **165,268 B**、预览 **160,888 B**，均 **< 300 KB 判断门**且 **< 1 MB 生死线**；但这是"代理场景"，不是 A2 指定的深海粒子项目。
- 以 `koi` 为存量改造样板出 M0 约 **4–6 人日【估计】**；补齐 6 项 Must 的完整产品约 **14–22 人日【估计】**。移动端 60fps 未经真实设备实测。

---

## 2. 能力对齐表（A2 的 6 Must + 2 Should）

工作量均为**粗估人日【估计】**，「改」= 在现有代码上接，「新建」= 本仓库没有对应实现。

### Must 1 · 三套场景模板（禅意池/锦鲤、深海粒子、寺庙）

| 项 | 内容 |
|---|---|
| 现成 | ① 禅意池/锦鲤：`shared/parts/koi-pond/index.ts:19,171` 用真 three.js，接回 real/paint/ink 三条渲染路径（`DECISIONS.md` ADR-07，`:~100`），11 条鱼、三相机/三触摸/三池底/三档雨；预设 `shared/stage/preview/build.mjs:160` `koi`。② 水下：`shared/parts/voxel-world/index.ts:111-124` 体素 raymarcher（WebGPU），预设 `build.mjs:112` `still`。③ 室内样板 `build.mjs` `dawn-desk`（three.js 桌景，见 `dist/preview/dawn-desk.html`），**不是寺庙**。 |
| 缺 | **深海粒子项目**：全仓无对应零件/预设，`PRD` 里"你的项目"这一存量不在本仓库。寺庙模板没有。 |
| 类型 | 前两套「改」；深海粒子与寺庙「新建」 |
| 人日 | 改 2 套 **2–3**；新建 2 套 **5–8**；合计 **7–11** |

### Must 2 · 全程序化生成（水波高度场 / Beer-Lambert / GLSL 焦散 / 五声音阶）

| 项 | 内容 |
|---|---|
| 现成 | GLSL 焦散：`shared/parts/koi-pond/index.ts:22,211,234` `makeCausticPass` + `causticRT`；Canvas 焦散近似 `shared/parts/tide-medium/index.ts:69,204-249`。**程序化五声音阶**：`shared/parts-library/koi/audio.js:96-103` `SCALE = [0,1,5,7,8] // D Eb G A Bb`，`createOscillator` 拨弦；由 koi 零件 `:825-830` 接到音乐模式。体素引擎是纯程序化密度场（`docs/VOXEL-AS-PART.md`）。 |
| 缺 | **Beer-Lambert 吸收**全仓未命中（grep `beer|lambert|caustic|pentatonic` 仅中 caustic 与音阶）；**双缓冲水波高度场**无实现；`MeshSurfaceSampler` 全仓 0 命中。 |
| 类型 | 「改」+「新建」 |
| 人日 | **3–5** |

### Must 3 · 体积预算检查器（实时 gzip、超 1MB 预警）

| 项 | 内容 |
|---|---|
| 现成 | gzip 代码只有一处：`shared/core/build.mjs:6,34-35` `gzipSync(..., {level:9})` 并打印 kB/KB gzipped——**属于旧单页引擎构建，未接进 stage 预览与站点构建**。零件有 `kb` 字段 `shared/stage/contract.ts:217-218`，但没有任何脚本汇总校验。 |
| 缺 | 实时检查器、阈值切换（Toy/独立站）、超阈预警 UI **全部没有**。 |
| 类型 | 「新建」 |
| 人日 | **0.5–1** |

> ⚠️ 顺带订正：`tests/verify-esm-parts.mjs:19` 仍有 `HARD_LIMIT = 163840`，但它只用于断言一个 10,772 B 的 `ascii-kit/lib/kit.js` 样本体积正常，**不是成品体积门**。「旧 163,840 B 硬门已删除」对成品成立，常量本身仍在。

### Must 4 · 参数控制面板（lil-gui 风格：颜色选择器 / 密度速度滑块 / 画质下拉）

| 项 | 内容 |
|---|---|
| 现成 | ① 预览调试条：`shared/stage/preview/host.ts:28,214-234` 显示 fps / frame / cpu / drawn / budget / declared / degraded，**只读、无输入控件**（`data-cue` 按钮 `:175-181` 是预览专用动词按钮）。② `/koi` 的 Esc 菜单：`sites/koi/attach.ts:87-88` 有 Look/Touch/Camera/Water/Weather/Music 六组枚举切换，`:43-53` 更新按钮文案——这是**预设切换**，不是参数编辑。 |
| 缺 | lil-gui 依赖（`package.json` 无）；颜色选择器、数值滑块、参数 → `PartV2.create` 的传入链路、参数持久化/深链接（现有 `?style=` 是站点级，不是零件参数级）。 |
| 类型 | 「新建」（调试条不能改造成产品面板，受众与信息结构完全不同） |
| 人日 | **3–5** |

### Must 5 · 单 HTML 导出（单文件 / Vite 项目 / Toy 包）

| 项 | 内容 |
|---|---|
| 现成 | 单 HTML 能力很强：`shared/stage/preview/build.mjs:1,14,254` 明确保证单文件、零外部请求（无 `src`/`href`/`<link>`/`@import`/http(s)），并由 `tests/preview-build.mjs` 逐预设断言；站点侧 `shared/sites/build.mjs` 产出 `dist/<slug>/index.html` 五个单文件（见第 3 节实测）。`/license` 另有 PNG 导出 `DECISIONS.md` ADR-08。 |
| 缺 | 用户侧「一键导出」按钮与三种目标格式打包（Vite 工程目录、Toy 适配包）。当前构建是**开发者 CLI**，不是产品功能。 |
| 类型 | 单 HTML「改」；另两格式「新建」 |
| 人日 | **2–4** |

### Should 6 · 画质三档 + 自动降档

| 项 | 内容 |
|---|---|
| 现成 | 二档 LOD：`shared/stage/contract.ts:87` `type Lod = 'low' \| 'high'`；运行时按预算降档且**不直接不画** `shared/stage/stage.ts:398-494`，`degraded[]` 对外可见（`:346,93`）；自动 governor 按 fps 调 `renderScale`（`DECISIONS.md` ADR-05）；10/13 个零件实现 `setLod`（grep 结果见第 4 节证据）。 |
| 缺 | 第三档（极致/均衡/省电）；移动端自动选档策略（现仅有 coarse pointer/deviceMemory 探测在旧 `shared/core/src/quality.js`，未接 stage）。 |
| 类型 | 「改」 |
| 人日 | **1–2** |

### Should 7 · 交互组件库（点击涟漪 / 撸鱼 / 抽卡 / 天降硬币 / 祈愿阁）

| 项 | 内容 |
|---|---|
| 现成 | 动词白名单 `shared/stage/contract.ts:195` `CUE_VERBS = ['release','sit','stand','ripple','reset']`；`/koi` 的 ripple/feed/call `sites/koi/attach.ts:9-27`；`/still` 的 sit、`/license` 的 stamp、`/hug` 的 release。 |
| 缺 | 抽卡 / 天降硬币 / 祈愿阁没有零件；组件库没有独立打包与文档。 |
| 类型 | 「改」+「新建」 |
| 人日 | **1–2** |

### 合计（粗估）

| 范围 | 人日【估计】 |
|---|---|
| 只做 M0（深海粒子存量改造 + 参数面板原型 + 体积测量） | **4–6** |
| 6 Must + 2 Should 全量 | **14–22** |

---

## 3. 判断门实测（数字全部来自本轮实际命令输出）

### 3.1 命令与原始输出

```bash
$ cd C:/Users/Lenovo/WorkBuddy/2026-11-17-13-04-03/emopulse_station_cluster
$ npm run preview:field
> emopulse-station-cluster@1.0.0 preview:field
> node shared/stage/preview/build.mjs --preset field
[preview] preset=field  parts=field-ground,pixel-post  gl=false
[preview] 脚本 25294 B → 单文件 26646 B（盘上 26646 B）
[preview] 输出 dist\preview\field.html
[preview] 打开方式：浏览器直接开这个文件（file://），不需要服务器，不产生任何外部请求

$ node shared/stage/preview/build.mjs --list
  empty    biome=field  seed=1         parts=(none)
  field    biome=field  seed=20261118  parts=field-ground, pixel-post*
  hug      biome=field  seed=20260614  parts=hug-meadow
  still    biome=tide   seed=20260901  parts=tide-medium, voxel-world, bubbles, still-sink, pixel-post*
  koi      biome=ink    seed=20260312  parts=paper-ink, koi-pond
  room     biome=room   seed=20261118  parts=paper-ink, pixel-post*
  dawn-desk biome=room  seed=20261120  parts=dawn-desk
  ...（其余 tide-a/tide-b/tide-c/bubbles-probe/ink/koi-nolimit 略）

$ for p in hug still koi koi-nolimit dawn-desk; do node shared/stage/preview/build.mjs --preset "$p"; done
[preview] preset=hug  parts=hug-meadow  gl=true     → 单文件 524094 B
[preview] preset=still  parts=tide-medium,voxel-world,bubbles,still-sink,pixel-post  gl=true → 单文件 133380 B
[preview] preset=koi  parts=paper-ink,koi-pond  gl=true → 单文件 589802 B
[preview] preset=dawn-desk  parts=dawn-desk  gl=true → 单文件 1778955 B

$ for f in dist/preview/*.html; do echo "$f raw=$(wc -c < "$f") gzip=$(gzip -9 -c "$f" | wc -c)"; done
dawn-desk.html                     raw=1778955   gzip=937787
field.html                         raw=26646     gzip=10601
hug.html                           raw=524094    gzip=135178
koi-nolimit.html                   raw=589867    gzip=160925
koi.html                           raw=589802    gzip=160888
room.html                          raw=26811     gzip=10445
still.html                         raw=133380    gzip=51117

$ npm run build:sites
[sites] license    48973 B  → dist\license\index.html  parts: paper-ink,pixel-post
[sites] hug       539528 B  → dist\hug\index.html  parts: hug-meadow
[sites] still     146288 B  → dist\still\index.html  parts: tide-medium,voxel-world,bubbles,still-sink,pixel-post
[sites] koi       605981 B  → dist\koi\index.html  parts: paper-ink,koi-pond
[sites] 索引页 9418 B → dist\index.html

$ find dist -name '*.html' -not -path 'dist/preview/*' -print0 | while IFS= read -r -d '' f; do
    echo "$f raw=$(wc -c < "$f") gzip=$(gzip -9 -c "$f" | wc -c)"; done
dist/hug/index.html            raw=539528    gzip=139836
dist/index.html                raw=9418      gzip=2878
dist/koi/index.html            raw=605981    gzip=165268
dist/license/index.html        raw=48973     gzip=17200
dist/still/index.html          raw=146288    gzip=54730
dist/still.html                raw=107773    gzip=43015
```

### 3.2 对照 A2 判断门

| 门槛 | 实测最好/最坏代理 | 结论 |
|---|---|---|
| **§5.3 判断门：深海粒子 gzip ≤300 KB** | 指定对象**不在本仓库，无法直接测**。代理：最难的真实站点 `koi` **165,268 B**、最大预览 `dawn-desk` **937,787 B**；3D 类（`hug` 139,836 / `still` 54,730 / `koi` 165,268）全部 <300 KB | **代理场景过；判定对象未核实**。`dawn-desk` 是一个超预算反例（>300 KB），说明"含 three 的桌面场景"会顶破这条线 |
| **M0 生死线：gzip <1 MB** | 全部实测产物均 <1 MB；最大 `dawn-desk` 937,787 B（约 916 KiB） | **过**，但最大项距 1 MB 只剩约 6%，没有余量 |
| **M0 验收：体积 ≤214 KB（暮池基准）** | `koi` 165,268 B、`still` 54,730 B、`hug` 139,836 B 均 ≤214 KB；`dawn-desk` 937,787 B 不适用 | **koi/代理场景过**；基准对象不同，不可直接等同 |

**诚实提示**：A2 判断门的对象是"深海粒子项目"，本仓库没有这个项目；上面是**同一底座能产出的最重 HTML 的代理实测**，不能替代对目标项目本身的测量。

---

## 4. 结构性差异（当前架构 vs A2 产品定位）

### 差异 1 · 架构是"站点装配运行时"，A2 是"模板 + 参数化导出产品"

**证据**：`shared/stage/preview/build.mjs:69` 的 `PRESETS` 是**开发者手写的静态预设表**（`koi`/`still`/`hug`/`room` 各写死零件 id）；`shared/stage/contract.ts:200-233` 的 `PartV2` 没有 `params` schema、没有取值域/默认值/标签；`shared/stage/preview/host.ts:214-234` 的调试条只读不写。A2-4 的用户流程是「选模板 → 调参数 → 体积实时反馈 → 导出」，其中**后三步在本架构里没有承载层**。

### 差异 2 · three.js 只在少数零件里用，不是通用渲染底座

**证据**：`package.json` 仅 `three@^0.169.0` + esbuild；`import * as THREE` 只出现在 `shared/parts/koi-pond/index.ts:19`、`shared/parts/hug-meadow/index.ts:15`、`shared/stage/preview/dawn-desk/index.ts:8` 三处；全仓 `MeshSurfaceSampler` / `UnrealBloomPass` / `EffectComposer` / `lil-gui` **0 命中**。A2-5 明确要求 Three.js + MeshSurfaceSampler + Bloom + lil-gui 这条链，当前底座走的是 `PartChannel = 'canvas2d' | 'gl' | 'world'`（`shared/stage/contract.ts:40`）的**自研合成器**。

### 差异 3 · WebGPU 体素世界 ≠ Three.js 程序化粒子

**证据**：`shared/parts/voxel-world/index.ts:111-124` 声明 `channel:'gl'`、`requires:['webgpu']`、`costMs:9`，引擎是 2324 行 GPU compute 密度场 + CPU surface nets（`docs/VOXEL-AS-PART.md`）；`koi-pond` 才是 three 渲染。A2 说的"深海粒子"要 `MeshSurfaceSampler` 表面采样 + Bloom additive——**本仓库没有这条技术路径**，把体素当"深海粒子模板"是把两种渲染范式混为一谈。

### 差异 4 · 没有产品级体积门，且体积口径不同

**证据**：gzip 只在 `shared/core/build.mjs:6,34-35` 的**旧引擎构建**里；`shared/stage/preview/build.mjs` 与 `shared/sites/build.mjs` 只打印 raw 字节；`tests/verify-esm-parts.mjs:19` 的 `HARD_LIMIT` 只守一个样本文件。A2 要求的是**面向用户的实时 gzip 预算检查器**，两者不在一个抽象层。`dawn-desk` 预览 gzip 937,787 B 说明"只要装 three 桌景就接近 1MB"，与 A2 的"≤300KB 深海粒子"不是同一量纲。

### 差异 5 · 画质只有二档，且 `costMs` 是**申报值**不是实测值

**证据**：`shared/stage/contract.ts:87` `Lod = 'low' | 'high'`；`DECISIONS.md` ADR-05 明确写「`costMs` 是**申报预算**，不是实测；实测帧时间另有 governor」，并给出 `voxel-world` 曾报 0.05ms、实测 44ms 的事故。A2 Should 要"极致/均衡/省电"三档 + 移动端自动降档。注意 `contract.ts:214` 的注释写「必须实测」，与 ADR-05 的「申报」口径**自相矛盾**（见第 7 节）。

### 差异 6 · 参数面板的受众不同：调试条 ≠ 产品控件

**证据**：`host.ts:223-234` 输出的是 `state / lod / fps / frame / cpu / drawn / budget / declared / degraded` 这类工程师指标；`sites/koi/attach.ts:87-88` 是 Look/Water/Weather 等**预设枚举**，不是连续参数。A2-3 要的是颜色选择器 + 密度/速度滑块 + 画质下拉，面向不会 GLSL 的买家。

---

## 5. 最快路径建议

**目标：先用现有 `koi-pond` 当"存量场景"，把 M0 的四项验收里能验的验掉，再谈三套模板。**

### 第 0 步（0.5 人日）：把体积测量接进构建链

把 `shared/core/build.mjs:34-35` 的 `gzipSync` 口径挪成共用函数，在 `shared/stage/preview/build.mjs` 与 `shared/sites/build.mjs` 每次构建后输出 raw/gzip；加 1MB 预警（先只告警、不阻断）。**这一步同时就是 A2 Must 3 的原型。**

### 第 1 步（2–3 人日）：新建"参数化导出层"（本仓库完全缺失的一层）

- 定义模板描述文件：`{ id, biome, parts[{id, channel, paramsSchema}], presets }`，复用 `PartV2` 的 `id/layer/blend/costMs/kb`，**不把这些常量复制成第二份表**（`build.mjs:24-29` 已经吃过"手抄元数据会漂移"的亏）。
- 参数注入路径：参数 → `create(env, params)` → 重建实例；现有 `PartV2.create(env)` 只有 `env`，需要**向后兼容地扩展**第二参数（`contract.ts:232`）。
- 面板：不用引入 lil-gui（会增加依赖与 gzip）；做一个 30–60 行的最小控件层（color / range / select）接到参数 schema，产物仍零外链。

### 第 2 步（1–2 人日）：M0 存量改造

以 `koi-pond` 为对象：用第 1 步的面板接 3 个参数（配色 / 鱼的密度 / 画质），跑第 0 步的 gzip 检查。当前 `koi` 站点实测 **165,268 B gzip**，离 214 KB 基准还有约 **49–53 KB** 余量（KB 按 1000 或 1024 取整不同）。**移动端 60fps 必须在真机测**（本轮只做了体积实测）。

### 第 3 步（M1，5–8 人日）：补三套模板

- 禅意池：`koi-pond` 直接改（现成）。
- 深海粒子：**新建**，不要拿 `voxel-world` 冒充——若坚持复用体素，需明确它要 WebGPU（A2 目标平台 B站 Toy 是否给 WebGPU 未核实）。
- 寺庙：可用 `dawn-desk`（room / three）改主题，但它 gzip 已 937,787 B，**必须先做命名导入 tree-shaking**，否则单独就吃掉 1MB 预算的 92%。

### 工期结论

**M0（可演示、能测体积、能调参）约 4–6 人日【估计】**；6 Must + 2 Should 完整产品 **14–22 人日【估计】**。两者都**不含**真实移动端性能达标的时间——那可能需要重构渲染路径，是另一个量级。

---

## 6. 风险与诚实提示

| 风险 | 证据 / 说明 |
|---|---|
| **变现天花板低** | A2-9 自己给"变现天花板低（6分）"🟠；第 5.1 节也写 A2 是"原料/组件"位，难独立收费，靠定制与白标拉客单价。 |
| **移动端 60fps 未实测** | `DECISIONS.md` 仍开放项 1：`/still` 在 headless WebGPU 约 39–55fps、`renderScale ~0.72`、`degraded low`。本轮**没有跑真机性能**，不能宣称 60fps 可达。 |
| **体积余量不均** | `dawn-desk` gzip 937,787 B（离 1MB 仅约 6%）；`koi` 165,268 B。`three` 全量 import 未 tree-shake（ADR-07 的"什么条件下推翻"明确提到这一点）。 |
| **WebGPU 可用性** | `voxel-world.requires:['webgpu']`（`index.ts:119`）；A2 目标平台 Toy 是否提供 WebGPU **未核实**。 |
| **判断门对象缺失** | 深海粒子项目不在本仓库；第 3 节是代理实测，不能替代对目标项目的测量。 |
| **性能申报口径矛盾** | `contract.ts:214` 写 costMs「必须实测」，ADR-05 写「申报预算、不是实测」；`tests/bench-parts-browser.mjs:1-14` 存在且区分 sync 与 raf 两种口径，但 `costMs` 字段本身未与 bench 联动。 |
| **本轮未经实测的结论** | 所有"人日"工作量是【估计】；参数化导出层、lil-gui 风格面板、三格式导出、三套模板的可行性推演**未做原型验证**；移动端性能、Toy 平台限制、真实用户付费意愿均未验证。 |
| **评审本身不改代码** | 本轮只生成 `dist/` 派生产物（已被 gitignore）与本文档；未改任何源码，未提交 git。 |

---

## 7. 复核后与主理人给定事实不一致的地方

1. **「旧 163,840 B 体积硬门已删除」——只对成品成立。** `tests/verify-esm-parts.mjs:19` 仍有 `const HARD_LIMIT = 163840`，`:21` 用它断言一个 10,772 B 样本文件。它是样本 sanity check，不是成品体积门；所以结论（成品没有 1MB/163KB 门）正确，但"常量已删除"不准确。

2. **「4 站已接回，走 `shared/stage/preview/build.mjs` 出单 HTML 到 `dist/preview/`」——这是预览链，不是站点产物链。** 真实站点由 `shared/sites/build.mjs` 产出到 `dist/<slug>/index.html`（本轮实测五份）；两条链各自独立，A2 的"导出产品"要接的是后者或新建一个统一出口。

3. **「各零件有 `setLod('low'/'high')`，原件有画质三档」——当前契约只有 2 档。** 13 个零件目录中 10 个实现 `setLod`（ascii-field / boids / bubbles / dandelion / field-ground / hug-meadow / koi-pond / paper-ink / pixel-post / voxel-world）；`contract.ts:87` 的类型是二值。三档是 A2 要求，不是现状。

4. **「零件 `costMs` 必须实测」（来自新方向那份骨架）与代码事实冲突。** `contract.ts:214-216` 注释写「实测、不接受估计」，但 `DECISIONS.md` ADR-05 记录的是"申报预算、 authored worst-case"，且有 0.05ms→44ms 的事故教训；真实性能另有 `bench:parts` 与 governor。若要 A2 的 60fps 承诺可信，必须统一口径，否则预算检查器会建立在两种互不兼容的数字上。

5. **「13 个零件」需注明口径。** `shared/parts/` 有 13 个目录；`shared/stage/preview/build.mjs:46-61` 的 `PART_ENTRY` 另有 `dawn-desk`（`:60`，在 `shared/stage/preview/dawn-desk/`），共 14 个可装配入口。本文按"13 个 parts 目录 + 1 个预览专用件"表述。

6. **A2 判断门本身无法按字面执行。** 文档指定测"深海粒子项目"，本仓库没有该项目；第 3 节给的是代理实测与明确标注的未核实项，不把"代理过线"包装成"判断门通过"。
