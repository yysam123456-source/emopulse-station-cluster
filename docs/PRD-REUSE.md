# PRD-REUSE · 零件复用专项（`PRD-REFINE.md` v2.1 增量文档）

> 版本 **v1.0-reuse** ｜ 2026-11-18 ｜ 产品经理：许清楚（PM）
> 文档语言：简体中文 ｜ 站内文案语言：英文
> 上游依据：`docs/PRD-REFINE.md` v2.1-refine（846 行，**当前唯一主线 PRD**）、`docs/ARCHITECTURE-NEXUS.md` v2.1（1457 行，**当前唯一主线架构**）
> 下游：架构师（移植溯源机制 + 任务分解）→ 工程师（零件移植 + 三缺口补齐）→ QA（溯源对账 + 全站回归）
> **本文不推翻 v2.1 的任何裁决，只补「零件复用」这一个维度。**

---

## 0. 文档定位

### 0.1 这是什么 / 不是什么

| 是 | 不是 |
|---|---|
| `PRD-REFINE.md` v2.1 的**增量需求文档**，回答"用户要求『在已有项目代码上复用、合并、优化，不要从 0 造轮子』这条硬需求怎么落地" | 不是新版 PRD，不重新定义产品、不重排 12 站矩阵 |
| 一份**可被构建期断言**的复用契约（provenance 声明 + 对账脚本） | 不是复用率 KPI 表。v2.1 §1.4 已裁决"复用率降级为手段"，本文不复活它 |
| 三个缺口（蒲公英 / 折纸飞机 / verdant-forest）的**算法级需求** | 不是实现代码，不指定具体写法 |
| 既有 5 类零件的**改造需求与验收标准** | 不是对工程师的追责清单。缺陷在流程，不在个人（§2.3） |

### 0.2 与 v2.1 的关系（逐条对照，无一处推翻）

| v2.1 已裁决事项 | 本文是否触碰 | 说明 |
|---|---|---|
| 12 站矩阵 / 10 个产品（§2.4） | ❌ 不碰 | 本文的改造对象全部落在既有 12 条路由内，**不新增站点** |
| 4 个 biome，构建期择一（§2.2、§0.3-A） | ❌ 不碰 | 全部复用件均为 Canvas2D 零件，不新增 WGSL，不影响 biome 择一 |
| `room` / `ink` 走 Canvas2D 不内联 WGSL（§2.2） | ❌ 不碰 | 这是本文能成立的前提：8 站产物体积降到 ~20–40 KB，才装得下移植后的算法 |
| 体积门 163,840 B 不放宽（§8.3） | ❌ 不碰，且**继续收紧** | 本文要求每站 REUSE 增量 ≤ 15,000 B【估计】，见 §9-M6 |
| `shared/core/` 一字节不动（INV-1a） | ❌ 不碰 | 本文全部落点在 L3 `parts-library/` + L4 `sites/*/parts/` + L1 契约（**纯追加可选字段**） |
| `registry.mjs` LEGACY_SITES 冻结快照、7 站目录零新增零改动（INV-3 / ADR-7） | ❌ 不碰，且**照抄其范式** | 本文的"legacy 零件溯源"同样放在构建元信息里（`shared/parts-library/legacy-provenance.ts`），不下发到 7 站目录，见 §3-REUSE-1 |
| koi 三站合并为 1 产品 3 路由（§2.3） | ✅ **强化** | 本文要求三路由的差异必须来自**算法参数层**（品种集合 / 鱼数 / 莲叶 / 水纹周期），不是配色数组 |
| 方案 A：不接 analytics endpoint（§7.2） | ❌ 不碰 | 溯源对账是构建期产物，不是运行时埋点 |

### 0.3 术语

| 术语 | 定义 |
|---|---|
| **原件** | `shared/parts-library/<id>/` 下按上游仓库原样复制的文件，永不参与构建，仅供对照 |
| **移植** | 把原件里的**算法结构与参数值**搬进站点源码；不是"读描述重写一遍" |
| **归集** | 把原件复制进 `parts-library/`。归集 ≠ 复用，本文的全部问题都出在这个等号上 |
| **复用深度 D0–D4** | 见 §1.3，本文的核心度量单位 |

---

## 1. 事实基线（逐条复核，不引用他人结论）

### 1.1 十个来源 × 复用现状矩阵

D 级为本文新增的复用深度评级（定义见 §1.3）。"实测 D 级"是我读源码后判定的，不是声明值。

| # | 来源 | 项目 | 源码 | 归集 | 实进产物 | **实测 D 级** |
|---|---|---|---|---|---|---|
| 1 | `Noniv/abyssal-garden` | 深渊花园（底座） | ✅ | ✅ `shared/core/` 11 文件 | ✅ 逐字节一致 | **D4**（唯一真 D4 的运行时） |
| 2 | 文章 `A49JhwiK4DhzEoODdLtCdg` | zz85 koi 锦鲤 | ✅ `zz85/random-sketches@gh-pages/vibes/koi` | ✅ 10 js / **144,439 B** + index.html + 2 文档 | ❌ 三站 dist 差 **≤ 33 B** | **D1**（观感，连色值都不同源） |
| 3 | 文章 `FwBWw2znYZFayBosZPCzLw` | 吹散蒲公英 | ❌ **无公开仓库** | ❌ 无目录、无声明 | ❌ 自编 | **Equivalent**（无原件） |
| 4 | 文章 `lf0ASNUfFlyfqS4cvixZhA` | yisky rainy-night-webgpu | ✅ | ✅ 4 文件 | ⚠️ 未见站点接入 | **D0**（未装站） |
| 5 | 文章 `S0YCVQLFbQb4wzNl8f1smw` | Room at Dawn + Crimson Loong | ✅ | ✅ room-at-dawn **1 文件** / crimson-loong 3 文件 | ⚠️ 站点为 Canvas2D 重绘 | room-at-dawn **D0**（不可运行）/ crimson **D1** |
| 6 | 文章 `2swG7XlHsROavGDozO-agA` | sylva（MengTo） | ✅ | ✅ 2 HTML | ⚠️ 未进产物 | **D0** + 授权风险（§6） |
| 7 | 文章 `aJnTqH6rtVK15VC796iC3A` | 照片折纸飞机 | ❌ **无公开仓库** | ❌ 无目录、无声明 | ❌ 自编 | **Equivalent**（无原件） |
| 8 | `verdant-forest.lexn8.chatgpt.site` | 程序化森林 | ⚠️ 原站 Cloudflare 拦截；Godot 移植版非 Web 栈 | ❌ | ❌ 仅扩展位 | **无可用原件**（§5.4） |
| 9 | `XinyuWang250428/gpt6-Astra_3.js` | 6 个微缩场景 | ✅ | ✅ 7 文件 / 8.2 MB | ⚠️ 未见接入 | **D0**（未装站） |
| 10 | 文章 `xvTBprUOFHD8ZHuRLlYM0A` | Grand Atelier 钢琴 | ✅ | ✅ 3 文件（依赖缺 4 个同级模块） | ⚠️ 未用击弦机逻辑 | **D1** + 原件不完整 |

### 1.2 我新增核实的七条硬事实（v2.1 未记录的）

| 编号 | 事实 | 证据（可复现） | 为什么重要 |
|---|---|---|---|
| **F-R1** | **8 份 `part.manifest.ts` 的 `entry` 全部指向不存在的文件** | `shared/parts-library/{ascii-kit,crimson-loong,grand-atelier,koi,micro-scenes,rain-webgpu,room-at-dawn,sylva}/index.ts` → **8/8 缺失** | 零件注册中心**从未被真正装配过**。`resolvePart()` 一旦被调用即抛错。声明层与运行层完全脱节 |
| **F-R2** | **README 声称 12 行零件（标题写"11 类"），磁盘上只有 8 个零件目录** | `ls shared/parts-library/` = 8 零件目录 + `registry/`；README 表格第 19–22 行的 `dandelion/`、`paper-plane/`、`blow-input/`、`verdant-forest/` **四个目录不存在** | 三个"缺口"连**目录都没有**，不只是"实现简化"。文档在描述一个不存在的库 |
| **F-R3** | **`registry/index.ts` 只聚合 8 份声明**，三个缺口零件不在注册表内 | `shared/parts-library/registry/index.ts` L17–30 | 缺口零件既不归集也不登记，只在 README 里被提及 |
| **F-R4** | **全库 0 个 LICENSE / COPYING 文件** | `find shared/parts-library -iname '*licen*' -o -iname 'COPYING*'` → 空 | 9 个上游来源的许可证状态**无一被记录**。`sylva` 的风险只是最严重的一例，不是孤例 |
| **F-R5** | **两份"真实复制原件"不是完整仓库，无法运行** | `room-at-dawn/main.js` import 6 个本地模块（`./core/gi.js`、`./core/tex.js`、`./render/{cams,look,pipeline}.js`、`./scene/index.js`）**全部未归集**（1/7）；`grand-atelier/piano-action.ts` import `./music`、`./piano-acoustics`、`./piano-keyboard`、`./piano-pedals` **全部未归集**（3/9） | "原件在库里"这句话是真的，但"原件可对照"是假的——缺的正是核心模块。`origin: 'copy'` 对这两份**不成立** |
| **F-R6** | **koi 站点连配色都不是原件的** | 站点 `sites/koi/shared/koi.ts` 的 `PALETTES` 三个色值（如 `#205b57` / `#e07b48`）与原件 `VARIETIES` 12 品种色值（`#f2eee4` / `#d33a1b` / `#141414`…）**无一相等** | 比 v2.1 §0.2-① 的判断更严重：不是"只取了 3 组配色"，是"连配色都是自己配的"。D1 都得打折 |
| **F-R7** | **原件符号零命中产物**（minify 会改本地名，故此项只作辅助证据） | `dist/{koi-pond,license,hug}.html` 对 `kohaku/fbm3/koiColour/halfWidth/bodyGeometry/uSpine/HAMMER_STROKE/actionPose/halton/upRef` 命中数全为 **0** | 主证据是源码级检查（§1.4），此项仅说明"连字符串痕迹都没有" |

### 1.3 复用深度分级（本文的度量单位，D0–D4）

| 级别 | 名称 | 判据 | 允许的 `origin` 声明 |
|---|---|---|---|
| **D4** | verbatim | 原件逐字节进入产物或哈希锁定 | `copy` |
| **D3** | algorithm | 原件的**算法结构与可调参数**进入产物；数据结构/公式/常量可 grep 对账 | `port` |
| **D2** | params-only | 只搬参数表（阈值/时长/色值），算法自写 | `equivalent` |
| **D1** | visual-only | 只照观感自写，"看起来像" | `equivalent` |
| **D0** | none | 原件在库但一字未用 | `equivalent` |

**这是本文最重要的一条定义**：今天 8 份 manifest **全部**声明 `origin: 'copy'`（D4），实际只有 `ascii-kit` 一份成立，**另 7 份的声明不成立**。

### 1.4 现有零件实测等级表（逐文件读出来的）

| 零件 | 站点落点 | 站点实现（实测） | 原件对照 | 实测 D | 声明 `origin` | 差 |
|---|---|---|---|---|---|---|
| `ascii-kit` | 未装站（仅 `verify-esm-parts.mjs` 作样本） | 经通道 B2 bundle `lib/kit.js` | 与 `.reference/portal/public_ascii-magic_lib_kit.js` 哈希一致 | **D4** | `copy` | ✅ 一致 |
| `koi` | 3 路由 | `sites/koi/shared/koi.ts` 78 行：9 条椭圆鱼 + 3 组自选色 + 同心椭圆涟漪 | `koi.js` 有 `bodyGeometry(52,24)` / `frame()` Catmull-Rom 脊线 / `koiColour()` + `fbm3` / `VARIETIES` 12 品种 / `RESIDENTS` 14 条 / `wobble()` | **D1**（或 D0.5） | `copy` | ❌ 差 3 级 |
| `grand-atelier` | `/license` 印章 | `createStampPart`：两条横线 + 一个矩形按 `drop` 上下移 | `actionPose(depression, hammerAngle)` 的 key→capstan→wippen→jack→repetition→hammer 链；`escape=smoothstep(d,.78,.97)`；`jack=.24*escape`；`HAMMER_STROKE_SECONDS=.13`；`HAMMER_ATTACK_SECONDS=.027` | **D1** | `copy` | ❌ 差 3 级 + 原件缺 4 个同级模块 |
| `crimson-loong` | `/license` 时间轴 | `createTimelinePart`：3 个圆点按 `stage` 着色 | 原件核心是"四层皆为电影时间 t 的纯函数，任意帧可乱序绘制" + `mono()` 单调三次插值 + `keyedLin` 分段表 + `upRef`/`rollLimit` | **D1** | `copy` | ❌ 差 3 级 |
| `room-at-dawn` | `/license` `/praise` 纸纹 | `createPaperPart`：128×128 LCG 噪声 + 纤维 + 描边 | 原件是 3D GI 烘焙（`runBake` spp=64 / halton 序列 / `applyBake`）+ 6 个未归集模块 | **D0** | `copy` | ❌ 差 4 级 + 原件 1/7 |
| `sylva` | `/praise` 指针 | 无对应实现（`/praise` 的拨纸层是自写） | 原件是 WebGL 液态金属 + NDC 射线 | **D0** | `copy` | ❌ + 授权风险 |
| `rain-webgpu` | 未装站 | — | 4 文件（`createHeightMap`/`createRain`/`createRipples`/`createPostPipeline`） | **D0** | `copy` | ❌ 未接 |
| `micro-scenes` | 未装站 | — | 6 个独立 HTML（8.2 MB） | **D0** | `copy` | ❌ 未接 |
| （无目录）`dandelion` | `/hug` | `createDandelionPart` 149 行之一：**22 颗种子排成一个圆**，`DETACH_SECONDS=1.6`，`delay=aRelease*0.9` | 文章：**1335 颗 / Fibonacci 球面**、`DETACH_SECONDS=1.8`、`aRelease` 初值 −1、`travel=age` 秒语义、44 段伞冠 | **Equivalent** | 无声明 | 无原件可对照 |
| （无目录）`blow-input` | `/hug` | `fftSize=512` + `getByteFrequencyData` 求均值 `>48` | 文章：`fftSize=2048`、`smoothing=0.65`、`byteTimeDomainData` RMS、1.2 s 底噪标定、`threshold=max(0.025,baseline*2.8)`、180/4200 Hz 分频、0.12 s 持续判定、竞态 token | **Equivalent** | 无声明 | 无原件 |
| （无目录）`paper-plane` | `/license` 彩蛋 | `flightPosition` 是 **2D 直线 + sin 拱高**；`fold` 只是多边形按 `t*3` 缩放 | 文章：三轴 `flightPosition(t)` 公式、`fold()` UV 保留裁切、`PAPER_GAP=0.004`、四段可逆折叠、双材质 | **Equivalent** | 无声明 | 无原件 |

### 1.5 三个缺口的现状一句话

| 缺口 | 现状 | 定性 |
|---|---|---|
| 蒲公英 | 22 颗种子排圆周，无球形采样、无伞冠几何、无 `travel` 秒语义、`DETACH_SECONDS` 写错（1.6 vs 1.8） | 不是"简化"，是**另一件作品** |
| 麦克风吹气 | `fftSize=512` 取频域均值比 48 | 与原件算法**没有一处相同**，且易被环境噪声误触发 |
| 折纸飞机 | 一个会缩放的多边形 | 没有 `fold()`、没有 UV、没有双材质、没有六阶段 |

---

## 2. 根因分析：为什么"归集"没变成"复用"

### 2.1 四个断点（按严重程度排序）

| # | 断点 | 证据 | 后果 |
|---|---|---|---|
| **① 契约断点** | `PartManifest` **没有任何字段能表达"我移植了原件的哪个函数、照搬了哪个参数"**。`source` 只能填一个路径，`note` 是自由文本 | `shared/contract/parts-registry.ts` L11–26；8 份 manifest 的 `note` 全是"真实复制原件"一句话 | 工程师写"按描述实现"和"移植原件"在**声明层完全无法区分**。这是根因中的根因 |
| **② 装配断点** | 注册中心从未被真正使用：8/8 `entry` 指向空气（F-R1），无任何站点调用 `registerPart(manifest, factory)` | `grep -rn "registerPart" sites/` → 只有 `sites/still/glue.ts:21` 自研的 `registerPartFactory`，与注册中心无关 | 零件库是**文档**，不是**代码**。没有装配，就没有"用不上"的反馈 |
| **③ 验收断点** | 现有 `tests/` 下的检查脚本里，**没有一个读 `parts-library/` 的内容做断言**（`verify-esm-parts.mjs` 除外，它只测 `ascii-kit` 能否被 bundle） | `ls tests/`（22 项，含 2 个目录） | "移植是否发生"从未被机器检查。体积门只约束总量，反而**惩罚**移植（移植会增体积，少写更安全） |
| **④ 激励断点** | 体积门 163,840 B 是**唯一**的机械约束。在它之下，"自己写一个 200 行的简化版"比"移植 3000 行原件算法并调通"**体积更小、工期更短、风险更低** | v2.1 §8.3 全部论证 | 现有制度**主动奖励**了简化。这不是工程师的判断失误，是制度设计的结果 |

### 2.2 反例：`ascii-kit` 是唯一 D4，它证明机制存在，只是没被用在需要的地方

`ascii-kit` 做到了 D4，原因是：它是**纯 ESM、无依赖、10,772 B、无外链**——正好落在 `compileBridge` 的 `bundle:true` 能力内，改动成本为 0。

> **结论**：工程师不是不愿意复用，而是**只有当复用成本低于重写成本时才复用**。`koi`（Three.js + WebGL + 10 文件 + 需重写渲染后端）、`grand-atelier`（three r169 + 6 个缺失模块）的移植成本**高于**重写，于是重写。这个选择在个人层面是理性的，在项目层面是失败的。
>
> **所以本文的着力点不是"要求工程师更努力"，而是"让移植变得可声明、可对账、可被机器奖励"**——把 `origin` 从自由文本变成一条会失败的断言。

### 2.3 三处必须在文档里说清的话（避免变成追责）

1. **没有任何一份文件写过"必须移植算法"**。v2.1 §5.5 的 R1–R8 全是画风与生命周期规范，`R7`（`create→update→dispose`）是形状规范，不是来源规范。工程师按规范交付，规范里没有这一条。
2. **`README.md` 第 5–6 行的措辞给了错误暗示**："站点产物使用按原件视觉/联动参数移植的 Canvas 2D 实现"。这句话把"视觉参数移植"（D1/D2）和"移植"（D3）混为一谈，而 `origin: 'copy'` 又要求 D4。**三层语义在同一段文字里互相打架。**
3. **`origin` 枚举只有 `copy / equivalent / port` 三个值，没有定义任何一个的判据**。`ARCHITECTURE-NEXUS.md` L685 只给了三个字符串。没有判据的枚举，等于没有枚举。

---

## 3. 新增硬约束 `REUSE-1` … `REUSE-8`

> 全部为**可构建期断言**。每条给出：要求 / 落点文件 / 验收脚本 / 不达标后果。
> **总原则：不改 `PartOrigin` 枚举**（`copy|equivalent|port` 三值不动，零类型风险），复用深度的判据放进新增的 `provenance.depth`。

### REUSE-1 · 溯源声明必填（Provenance Declaration）

**要求**：任何被站点引用的零件，必须提供 `provenance` 声明；声明必须包含：上游仓库/文章、访问日期、归集文件清单（含字节数与完整性）、**移植的每一个原件符号名**、**照搬的每一个参数值**、许可证。

`shared/contract/parts-registry.ts` 的 `PartManifest` **追加一个可选字段**（纯追加，不改任何既有字段、不改 `registerPart` 的校验逻辑）：

```ts
/** 复用溯源（REUSE-1）。nexus 站点引用的零件与 legacy 映射零件必填。 */
provenance?: Provenance;
```

```ts
export type ReuseDepth = 'D0' | 'D1' | 'D2' | 'D3' | 'D4';

export interface PortedSymbol {
  /** 原件中的符号名；必须能在 files[].path 中 grep 到 */
  symbol: string;
  kind: 'function' | 'constant' | 'table' | 'shader' | 'algorithm';
  /** 照搬的参数值，key = 原件中的参数名 */
  params?: Record<string, number | string | readonly number[]>;
  /** 本站源码中的落点（函数名或文件:行），供 QA 反向查证 */
  portedTo?: string;
  /** 未 1:1 照搬的部分与原因（depth='D3' 且非 1:1 时必填） */
  downgrade?: string;
}

export interface Provenance {
  depth: ReuseDepth;
  upstream: {
    repo?: string;      // 'https://github.com/zz85/random-sketches'
    ref?: string;       // commit / branch
    article?: string;   // 公众号文章 id，如 'FwBWw2znYZFayBosZPCzLw'
    accessed: string;   // 'YYYY-MM-DD'
  };
  files: Array<{
    path: string;       // 相对 shared/parts-library/
    bytes: number;
    sha256?: string;
    completeness: 'complete' | 'partial' | 'absent';
    missing?: string[]; // partial 时必填，列出未归集的上游模块
  }>;
  ported: PortedSymbol[];
  license: { spdx: string; evidence: string };  // spdx 允许 'NOASSERTION'
  /** 相对移植前的产物体积增量估计（B），用于体积门预算 */
  sizeHint?: number;
}
```

**legacy 7 站的零件怎么声明而不碰它们的目录**（照抄 `LEGACY_SITES` 的范式）：
新建 `shared/parts-library/legacy-provenance.ts`（**构建元信息，不进产物字节**），冻结一份 `siteId → partRef[] → Provenance` 快照。**7 站目录零新增、零改动**（INV-3 / ADR-7 原样成立）。

**验收**：`tests/verify-provenance.mjs`
- `GWT-1`：**Given** 任一站点的 `parts`/`composition` 引用了零件 `X`，**When** 运行 `npm run verify:reuse`，**Then** `X` 必须有 `provenance`，且 `provenance.ported.length ≥ 1`（`depth='D0'` 除外，D0 零件不得被任何站点引用）。
- `GWT-2`：**Given** `ported[i].symbol = 'halfWidth'` 且 `files[0].path = 'koi/koi.js'`，**When** 跑验收脚本，**Then** 脚本对 `koi/koi.js` 执行 `grep -w 'halfWidth'` 必须命中；**任一声明符号未命中，构建失败**。
- `GWT-3`：**Given** `files[j].bytes` 声明为 `29545`，**When** 磁盘实际为 `29544`，**Then** 失败（防止归集后又被谁改过）。

### REUSE-2 · 复用深度分级 + `origin` 语义收紧

**要求**：`provenance.depth` 与 `PartManifest.origin` 必须一致，不一致即构建失败：

| depth | 允许的 `origin` | 含义 |
|---|---|---|
| `D4` | `copy` | 逐字节 |
| `D3` | `port` | 算法结构 + 参数进入产物 |
| `D2` `D1` `D0` | `equivalent` | 无原件 / 只借观感或参数 |

**并且**：`note` 与 `README.md` 中，`D1`/`D2` 的零件**禁止使用**"真实复制原件""移植"字样，必须写"观感参考 / 参数参考"。

**验收**：`verify-provenance.mjs` 第 2 组断言；`verify-reuse-wording.mjs`（新增，扫描 8 份 manifest 的 `note` 与 README 表格）。
- `GWT-4`：**Given** `koi/part.manifest.ts` 声明 `origin:'copy'` 但 `provenance.depth='D1'`，**Then** `npm run verify:reuse` 失败，错误信息指明"copy 只允许 D4"。
- `GWT-5`：**Given** 改造完成后的 koi 声明 `origin:'port'` + `depth:'D3'`，**Then** 通过，且 `note` 中不得出现"真实复制原件"。

### REUSE-3 · 原件完整性声明

**要求**：`files[].completeness` 必填；`partial` 必须列 `missing[]`。
- `depth='D4'` 要求全部 `complete`；
- `depth='D3'` 允许 `partial`，但每个缺失模块必须在某个 `ported[].downgrade` 里说明"缺什么 → 用什么替代"。

**已知必须如实声明的两份**（F-R5）：`room-at-dawn` → `partial`，`missing` = 6 个模块；`grand-atelier` → `partial`，`missing` = 4 个同级模块 + `three/addons`。

**验收**：`GWT-6`：**Given** `room-at-dawn` 声明 `completeness:'complete'`，**Then** 脚本比对上游 `main.js` 的 import 语句与 `files[]` 清单，发现 `./core/gi.js` 等 6 项不在清单内 → **失败**。

### REUSE-4 · 参数搬运清单 + 黄金值断言

**要求**：每个 `depth='D3'` 零件必须提供 `tests/golden/<part-id>.json`，对每个 `ported[].params` 给出「输入 → 期望输出」样本，容差 `1e-6`（数值）/ 精确相等（字符串与枚举）。

**参数搬运率** = 已进 `params` 的原件可调参数数 / 原件导出参数总数，**必须 ≥ 60%**（低于 60% 判为"参数没接线"）。

**验收**：`tests/golden-run.mjs`。
- `GWT-7`：**Given** golden 里 `{fn:'halfWidth', s:0.25, expect:0.10}`（按 `0.1*sqrt(1-(1-a)^2)*…` 手算），**When** 跑本站移植函数，**Then** `|actual-0.10| ≤ 1e-6`。
- `GWT-8`：**Given** `params` 只填了 2 个参数而原件导出 12 个可调参数，**Then** 搬运率 17% < 60% → 失败。

### REUSE-5 · 死参数禁令（mutation probe）

**要求**：对 `params` 中每个数值，将其改 ±10% 后重跑 golden，**输出必须发生变化**。不变化的参数即为"声明了但没接线"的死参数。

**这是唯一能杀死"声明得很好看、代码没接上"的机制**，也是本文对"怎么证明不是空壳"最直接的回答。

**验收**：`tests/mutation-probe.mjs`。
- `GWT-9`：**Given** `DETACH_SECONDS` 从 1.8 改到 1.98，**When** 重跑 golden 的 `releaseSchedule(seed=42, t=2.0)`，**Then** 返回的已释放种子数必须变化；不变 → 失败并报告"死参数 DETACH_SECONDS"。

### REUSE-6 · 降级必须显式（不许静默简化）

**要求**：`downgrade` 在两种情况下必填：① `depth='D3'` 但非 1:1 移植；② `completeness='partial'`。内容必须回答三问：**原件用了什么技术 / 我们用什么替代 / 差异导致的可见后果是什么**。

**禁止**的写法（现状都在用）："按文档描述实现""等效实现""保留关键参数"。**必须**的写法示例：`"原件用 InstancedBufferGeometry + LineSegments 单批次绘制 1335 颗种子；本站用 Canvas2D 逐颗 path 绘制，降为 480 颗并在距离 > 0.6 屏宽时停绘；差异：远距离绒毛密度低于原件，近景一致"`。

**验收**：`verify-reuse-wording.mjs`（关键词黑名单）+ 人工签核（架构师）。
- `GWT-10`：**Given** 某零件的 `downgrade` 只有"按描述实现"6 个字，**Then** 失败，错误信息要求补齐三问。

### REUSE-7 · 许可证门

**要求**：`provenance.license.spdx` 必填（`NOASSERTION` 合法）。`NOASSERTION` 的零件必须进 `shared/parts-library/QUARANTINE.md`，且**不得出现在任何站点的 `parts` / `composition` 中**。

**现状**：F-R4 —— 全库 0 个 LICENSE 文件，9 个来源的许可证状态无一被记录。这条门建好当天，**至少 8 份零件会被判定为 `NOASSERTION` 进入隔离区**，这是预期的、也是正确的。

**验收**：`verify-provenance.mjs` 第 4 组断言。
- `GWT-11`：**Given** `sylva` 的 `license.spdx='NOASSERTION'` 且 `/praise` 的 `parts` 含 `sylva`，**Then** 构建失败。

### REUSE-8 · 复用对账报告随构建产出

**要求**：`npm run build:all` 额外产出 `dist/reuse-report.json`（**不进入任何站点产物，零体积影响**）：

```json
{
  "generatedAt": "2026-11-18T...",
  "sites": [{ "site": "koi-pond", "parts": [{ "ref": "koi", "depth": "D3",
    "portedSymbols": 7, "paramsWired": 14, "paramsTotal": 18,
    "completeness": "complete", "license": "MIT" }] }],
  "gaps": [{ "part": "dandelion", "source": "article:FwBWw2znYZFayBosZPCzLw", "depth": "D3" }],
  "quarantine": ["sylva"],
  "drift": { "readmeRows": 12, "diskDirs": 8, "registryEntries": 8 }
}
```

`drift` 一栏专门抓 F-R2 这类"文档说有、磁盘没有"的漂移，随构建自动暴露。

**验收**：`npm run verify:reuse` 成为 `build:all` 的**后置门**（与 `verify:size`、`verify:legacy-hash` 同级），任一断言失败则 exit 1。
- `GWT-12`：**Given** README 表格新增一行但目录未建，**When** 构建，**Then** `reuse-report.json` 的 `drift.readmeRows=13 ≠ diskDirs=8` 且 `verify:reuse` 失败。

### 3.9 八条约束汇总

| 编号 | 一句话 | 杀死哪种失败 | 优先级 |
|---|---|---|---|
| REUSE-1 | 每个复用必须声明移植了哪个符号 | "读描述重写一遍" | **P0** |
| REUSE-2 | 深度分级 + origin 收紧 | "自称 copy 实为 D1" | **P0** |
| REUSE-3 | 原件完整性 | "原件在库里但缺核心模块" | **P0** |
| REUSE-4 | 参数搬运 + 黄金值 | "参数没接线" | **P0** |
| REUSE-5 | 死参数探针 | "声明漂亮、代码空转" | **P0** |
| REUSE-6 | 降级显式化 | "等效实现"四个字糊弄 | P1 |
| REUSE-7 | 许可证门 | 法律风险 | **P0** |
| REUSE-8 | 对账报告 | 文档漂移 | P1 |

---

## 4. 既有零件的改造需求

> 编号 `R-koi` / `R-atelier` / `R-loong` / `R-room` / `R-unused`。全部为 `D3` 目标（除 `R-room` 见 §4.4 的诚实降级）。

### 4.1 `R-koi` · koi 三站（**P0**，最典型的空壳）

**目标**：`depth: D1 → D3`，`origin: 'copy' → 'port'`。

**必须移植的算法（逐条可对账，全部在 `shared/parts-library/koi/koi.js` 中）**

| # | 原件符号 | 位置 | 本站落点 | 关键参数 | 为什么必须搬 |
|---|---|---|---|---|---|
| K1 | `halfWidth(s)` `topH(s)` `botH(s)` `close(s)` `S_END` | `koi.js` L15–22 | `createKoiBody()` 体形剖面 | `S_END=0.875`；`halfWidth=0.1*sqrt(1-(1-a)²)*(1-0.8*sm(0.25,0.83,s)^1.2)*close(s)`，`a=min(s/0.25,1)`；`topH=0.096*(…)*(1-0.66*sm(0.32,0.83,s)^1.1)*close(s)`；`botH=0.118*(…)*(1-0.70*sm(0.36,0.83,s)^1.1)*close(s)` | 这三条曲线决定"是不是锦鲤"。现在画的是椭圆，所以三条鱼看起来像三条蝌蚪 |
| K2 | `bodyGeometry(NS=52, NT=24)` 的采样规则 | `koi.js` L24–46 | `sampleBody()` 采样点表 | `s = S_END*(i/NS)^1.25`（**幂次 1.25 是头部加密的关键**）；`th = -π/2 + (j/NT)*2π`；法线用中心差分 `e=1e-3` 的叉积 | 1.25 次幂让头部顶点密、尾部稀，2D 轮廓的头部才圆 |
| K3 | `frame(s)` 脊线 | `koi.js` L124–137 | `spineAt(s)` | Catmull-Rom `cr()`；`env(s)=0.1+0.9*smoothstep(0.04,1,s)^1.4`；`ph=uSwim.x-uSwim.z*s`；`off=uSwim.y*e*sin(ph)`；切线 `t=normalize(tt-n*doff)` | 这是"游动"的全部来源。少了它，鱼只能整条平移 |
| K4 | `koiColour(rest, up, out white)` | `koi.js` L216–231 | `paintPattern(s, y)` | `fbm3`；`q=vec3(s*4.2, rest.y*7., rest.z*7.)*uPat3.x + uPat2.w`；`dors=smoothstep(-0.6,0.15,up+uPat.z*0.4)`；`ew=mix(0.018,0.05,uPaint)`；三种 mode（0 patches / 1 asagi / 2 tancho） | 花纹是"锦鲤"与"金鱼"的唯一区别。现在每条鱼身上都是一块固定椭圆斑 |
| K5 | `VARIETIES` 12 品种表 | `koi.js` L345–358 | `varieties.ts` 常量表 | `kohaku/sanke/showa/ogon/platinum/chagoi/asagi/tancho/kujaku/kigoi/utsuri/benigoi` 的 `t1/t2/dorsal/head/mode/net/metal/fin/white` | 12 个品种 = 三路由可差异化的**真实素材**。这直接解决 §2.3 "三站只是 meta 不同"的风险 |
| K6 | `RESIDENTS` 14 条 | `koi.js` L360–365 | `residents.ts` | 14 条 `[品种, 体长 m, 蝶尾?]`：0.70/0.62/0.60/0.64/0.56(蝶)/0.78/0.52/0.54/0.50(蝶)/0.46/0.50/0.58/0.48/0.44(蝶) | 体长差 0.44–0.78 是"池塘有大小鱼"的观感来源 |
| K7 | `wobble(t)` | `koi.js` L12 | `wobble(t)` | `0.5*sin(t)+0.3*sin(1.618t+1.3)+0.2*sin(2.71t+4.1)`（三个无理比例叠加，避免周期感） | 现在用单 `sin(t*0.7+phase)`，5 分钟内会被看出循环 |

**Canvas2D 落地方式（给架构师的最小可行路径）**：`bodyGeometry` 的 `(s, θ)` 采样在 2D 下退化为"沿脊线取 24 个 `s`，每个 `s` 取左右边缘 `±halfWidth(s)`、上下 `topH/botH`"，得到一条闭合轮廓 → `Path2D`；`koiColour` 的 `fbm3` 用 2D value noise 在 `(s, y)` 上求值，按 8×32 网格填色（不必逐像素）。**这是 D3（算法 + 参数照搬），不是 D1。**

**三路由差异化（继承 v2.1 §2.3，但把差异从"配色"升级为"算法参数"）**

| 项 | `/koi-pond` | `/koi-ink` | `/koi-watercolor` |
|---|---|---|---|
| 鱼数（`RESIDENTS` 截取） | 9 | 5 | 13 |
| 品种集合 | kohaku/ogon/sanke/showa/platinum/chagoi | tancho/utsuri/kohaku | 全 12 品种 |
| 莲叶 | 有 | 无 | 有（更小） |
| 水纹相位周期 | 60 s | 48 s（墨扩散更快） | 90 s（最慢） |
| 花纹 mode | 0 patches + net | 2 tancho 为主 + 高对比 | 0 patches + 低 `uWhite`（更透） |
| 蝶尾 | 1 条 | 0 | 2 条 |

> **注意**：这六项差异**不会**产生显著的产物体积差（都是数字常量）。所以 §9-M9 明确写了"体积差不是复用证据"，这是我对主理人第 10 条建议的一处修正，理由见 §7-C3。

**验收（GWT）**
- `GWT-K1`：**Given** `s=0.25`，**When** 调移植后的 `halfWidth(0.25)`，**Then** 返回 `0.1*sqrt(1-(1-1)²)*(1-0.8*sm(0.25,0.83,0.25)^1.2)*1 = 0.1`（`sm` 在 `s=0.25` 处为 0），误差 ≤ 1e-6。
- `GWT-K2`：**Given** 同一 `seed` 与 `t`，**When** 连续两次渲染，**Then** 逐像素相等（确定性；现在用 `performance.now()` 相对时间，不可复现，`?s=<seed>` 也救不回来）。
- `GWT-K3`：**Given** 三条路由的渲染一帧，**When** 提取"鱼数 / 品种集合 / 有无莲叶 / 水纹周期"四项，**Then** 两两不等（构建期断言，继承 v2.1 P1-2 并加严）。
- `GWT-K4`：**Given** 移植完成，**When** 比对 `dist/*.html` 与移植前基线，**Then** 每站**至少变化 3,000 B**（证明代码真的进了产物；这是**下限**，不是"三站之间的差"）。

### 4.2 `R-atelier` · Grand Atelier 击弦机（**P1**，`/license`）

**目标**：`D1 → D3`。

| # | 原件符号 | 关键参数 | 落点 | 可见后果 |
|---|---|---|---|---|
| A1 | `actionPose(depression, hammerAngle)` | `keyAngle=d*ACTION.keyAngle`；`capstanY=.821-.025*cos(keyAngle)+ACTION.capstanArm*sin(keyAngle)`；`escape=smoothstep(d,.78,.97)`；`jack=.24*escape`；`wippen=atan2(capZ,capY)+acos(-.009/hypot(capY,capZ))` | `stampPose(depression)` | 印章下压时会有**真实的杠杆放大**（键角小、锤角大）；现在是线性平移 |
| A2 | `HAMMER_STROKE_SECONDS=.13` / `HAMMER_ATTACK_SECONDS=.027` / `hammerStroke()` | 击弦 0.13 s，其中 0.027 s 是击弦瞬间 | `stampTimeline()` | `APPROVED` 的出现时刻必须由 `contact` 决定，不能像现在这样硬编码 `t≥0.45` |
| A3 | `supportedHammerAngle()` / `jackRollerClearance()` | — | 断言用 | 可做"印章不会穿过纸面"的几何断言（现在没有） |

**验收**：`GWT-A1`：**Given** `depression=0.9`，**When** 求 `escape`，**Then** `smoothstep(0.9,.78,.97) = 0.514…`（可手算），误差 ≤ 1e-6；`GWT-A2`：**Given** `elapsed=0.027`，**Then** 锤头角度 = `contactAngle`（接触点），而非现在的中途值。

### 4.3 `R-loong` · Crimson Loong 时间轴（**P1**，`/license`）

**目标**：`D1 → D3`。原件最有价值的一句话写在 `60_dragon.js` L9：

> "A loong's motion is four layers, every one a pure function of film time **t** (so any frame can be drawn in any order)"

| # | 原件符号 | 关键点 | 落点 |
|---|---|---|---|
| L1 | 四层纯函数结构 | 任意帧可乱序求值 | `timelineAt(t)`：必须支持 `?t=4.2` 直接定位到任意时刻（现在基于 `performance.now()` 累计，不可重放） |
| L2 | `mono(xs, ys)` 单调三次插值 | Fritsch–Carlson 单调性，避免过冲 | 时间轴缓动（替代 `ease=t*t*(3-2*t)` 的单一 S 曲线） |
| L3 | `keyedLin([[0,0.64],[5,0.68],[15,1.0],…])` 分段线性表 | 9 个控制点的段表 | 三段时长的节奏表（现在 2.5–4 s 是估的） |
| L4 | `upRef()` / `rollLimit()` | 法线翻转保护 | 2D 下不需要，但 `downgrade` 里必须说明"2D 无翻转问题，故不移植" |

**验收**：`GWT-L1`：**Given** `t=2.0` 与 `t=7.0`，**When** 以任意顺序调用 `timelineAt` 三次（2→7→2），**Then** 两次 `t=2.0` 输出完全相同（纯函数性）；`GWT-L2`：**Given** `mono` 的 9 点表，**Then** 输出序列单调且无过冲。

### 4.4 `R-room` · Room at Dawn（**P1，但诚实降级**）

**目标**：`D0/copy → D2/equivalent`，**不是 D3**。理由必须写进文档：

1. 原件是 **3D GI 烘焙**（`runBake(spp=64, workers=6)` + `applyBake` + halton 采样 + `packBake` 二进制），产物是一个 `gi.bin` 光照贴图。**它与"2D 纸纹"没有任何算法交集**。
2. 归集了 **1/7 文件**（F-R5），缺的正好是 `core/gi.js`（烘焙核心）。
3. 因此"Room at Dawn 是纸纹来源"这个说法**在物理上不成立**。纸纹（v2.1 §5.1 的 `drawPaper`）是自研资产，应当**如实标注为自研**，而不是挂一个拿不到的上游。

**处置**：`origin:'equivalent'` + `depth:'D1'` + `downgrade` 写明"原件为 3D GI 烘焙，本件仅借用『程序化纹理』思路并自研 2D 噪声，未搬运任何函数"；`completeness:'partial'` + `missing` 列 6 项。

> **这是本文唯一一处把"复用"降级的零件**，因为它本来就不是可复用对象。承认它，比继续声明 `copy` 更有价值——**空壳的代价是让人以为这里有资产。**

### 4.5 `R-unused` · micro-scenes / rain-webgpu（**P2**）

两个都已归集、未装站、`D0`。v2.1 §2.4 的 12 站里没有它们的位置（`micro-scenes` 曾对 `/still` P2，`rain-webgpu` 曾对 `/still` P2）。

**处置**：本期**不装站**。但 `verify:reuse` 必须报告"2 个零件 D0 已归集未使用"，把"归集了不用"变成可见事实，而不是藏在 README 里。**是否删除由主理人裁决**，本文不建议删（它们是 8.2 MB 的 micro-scenes，删了不可恢复，且未来 P2 可能用）。

---

## 5. 三个缺口补齐（P0）

> **口径声明（不臆造）**：以下三个来源**无公开仓库**，`shared/parts-library/` 下**无目录、无声明**（F-R2/F-R3）。
> 因此本节全部参数**以文章公开代码片段为唯一依据**，`provenance.upstream.article` 填文章 id，`files[]` 用 `completeness:'absent'` + `article` 字段替代。
> **凡文中出现 `【原文待补】` 的参数，工程师必须回原文取全值或写 `downgrade`，禁止猜测。**

### 5.1 `GAP-DANDELION` · 蒲公英花田（`/hug` · field · `scene` 层）

**必须移植（D3，逐条对账）**

| # | 项 | 参数 / 算法 | 现状差异 |
|---|---|---|---|
| D1 | 球面采样 | **Fibonacci 球面**：`ny = 1-(i+0.5)/count*2`；`angle = i*2.39996323` | 现状把 22 颗种子排在一个圆周上（`cos/sin(phase*2π)`）——**这是"花球"变成"蒲公英钟面"的原因** |
| D2 | 规模 | 10 株共 **1335** 颗种子 | 现状 22 颗（少 98.4%）。允许降规模（Canvas2D 成本），但必须写 `downgrade` 且保留**采样方式**与**每株比例** |
| D3 | 单颗几何 | 瘦果（`y<0`）+ 细柄（`0→0.16`）+ 伞冠（`0.16~0.19`）；**44 条线段 / 88 端点** | 现状 8 条放射线 + 一个点。伞冠的"半球罩"完全缺失 |
| D4 | 顶点属性 | `aHome` / `aAxis` / `aSize` / `aRandom` / `aRelease` 五个同名语义字段 | 现状只有一个 `phase`。缺 `aAxis` 就没有"朝着球面法线方向"的释放 |
| D5 | 局部→球面正交基 | `axis` 近竖直时改用 X 轴做 helper，否则叉积退化 | 现状无。这是"天空中的绒毛方向看起来对"的关键 |
| D6 | 释放调度 | `aRelease` 初值 **−1**；触发时 `releases[i] = time + random()*DETACH_SECONDS`；**`DETACH_SECONDS = 1.8`** | 现状 `DETACH_SECONDS = 1.6`（**写错**），且用 `delay = aRelease[i]*0.9` 取代"错峰随机"——数值与语义双错 |
| D7 | 时间语义 | `age = max(0, uTime - aRelease)`；**`travel = age`（单位秒，不是 0–1 进度）** | 现状用 `t` 做 0–1 进度。这是"飘 6 秒"与"飘 2.6 秒"的区别 |
| D8 | 三轴位移 | 三轴系数不同：`x = 0.35+aRandom*1.6`、`y = 0.08+【原文待补】`、`z = -0.5-【原文待补】`；用 `fract(aRandom*17/31)` 打散；两组正弦摆动 | 现状 `drift*1.4 / -drift*0.55 - t²*8`（单抛物线，无摆动） |
| D9 | 朝向过渡 | 约 **1.3 秒**内从"径向"过渡到"略倾斜向上" | 现状无（种子永远是圆的，看不出朝向） |
| D10 | 透明度 | `fade = 1 - smoothstep(7, 10, travel)`；`attachedAlpha = 0.19 + max(0, aAxis.z)*0.26`；飞行中 **0.62** | 现状 `1 - t/6`（线性）。**`attachedAlpha` 的 0.19 是"未释放时若隐若现"的全部来源** |
| D11 | 三状态机 | `ready → drifting → away`；**重置只 `releases.fill(-1)`，不销毁场景** | 现状有状态机 ✅，但 reset 会重建数组。这条**现有实现是对的**，保留 |
| D12 | 生命周期 | `dispose` 可重复调用；停 rAF / 断 ResizeObserver / 按集合去重释放材质几何 / `renderer.dispose()` | 现状 `dispose(){ state='ready'; releasedAt=-1 }`（无监听登记，可接受） |

**验收（GWT）**
- `GWT-D1`：**Given** `count=1335`，**When** 取第 0 颗与第 1334 颗的 `ny`，**Then** 分别为 `+0.9996…` 与 `−0.9996…`（分布对称，不是从 0 开始的半球）。
- `GWT-D2`：**Given** 任意两颗相邻 `i`、`i+1` 的 `angle`，**Then** 差值恒为 `2.39996323` rad（黄金角），不是 `2π/count`。
- `GWT-D3`：**Given** `DETACH_SECONDS=1.8`，**When** `t=1.8`，**Then** 所有种子必须已释放（`releases[i] ≤ t` 全部成立）。
- `GWT-D4`：**Given** `travel=7.5`，**Then** `fade=0.5`（`smoothstep(7,10,7.5)=0.5`）。
- `GWT-D5`：**Given** `aAxis=(0,1,0)`（正竖直），**When** 构造正交基，**Then** 不产生 `NaN`（helper 轴切换生效）。
- `GWT-D6`（死参数探针）：**Given** 把 `DETACH_SECONDS` 改 ±10%，**Then** `releaseSchedule(seed, t=2.0)` 的已释放数必须变化。

**体积预算**：`/hug` 现 111,961 B，余量 51,879 B。本件移植【估计】+8,000 ~ +12,000 B（Canvas2D 下 480 颗 × 44 段，代码量主要在调度与投影，不在几何）。**须与 v2.1 的 `field` biome fork（+8~18 KiB）叠加核算**，合计【估计】+16~30 KiB，仍在余量内但**已过半**——见 §7-C7。

### 5.2 `GAP-BLOW` · 麦克风吹气（`/hug` · field · `interaction` 层）

| # | 项 | 参数 / 算法 | 现状差异 |
|---|---|---|---|
| B1 | 分析器 | `AudioContext` + `AnalyserNode(fftSize=2048, smoothingTimeConstant=0.65)` | 现状 `fftSize=512`（频率分辨率差 4 倍） |
| B2 | 采集约束 | `getUserMedia` 显式关闭 `echoCancellation` / `noiseSuppression` / `autoGainControl` | 现状只传 `{audio:true}`。**开了 AGC 就永远测不到"吹气"的动态**——这是最致命的一条 |
| B3 | 底噪标定 | 先静默 **1.2 秒**估底噪：`baseline = baseline*0.94 + rms*0.06` | 现状无底噪概念，用绝对阈值 48 |
| B4 | 时域 RMS | `byteTimeDomainData` 以 128 为中心平移到 `[-1,1]`，平方均值开方 | 现状用 `getByteFrequencyData`（**频域均值**）。频域均值对环境噪声极敏感，必然误触发 |
| B5 | 分频宽带判定 | `<180 Hz` 与 `180–4200 Hz` 分别累计；`broadband = min(1, high / max(1, low*2.5))` | 现状无分频。"吹气"是宽带噪声，"说话/空调"是低频——**不分频就分不出人声与吹气** |
| B6 | 阈值 | `threshold = max(0.025, baseline*2.8)` | 现状 48 是魔数 |
| B7 | 强度 | `strength = clamp((rms - threshold)/0.16) * broadband` | 现状只有布尔触发，无强度（所以蒲公英只能"全放"不能"逐渐吹散"） |
| B8 | 持续判定 | `breath = level > 0.12 ? breath + dt : max(0, breath - dt*2)`；**持续 0.12 s 才触发** | 现状单帧超过就触发（一次咳嗽会放飞整片花田） |
| B9 | 竞态防护 | `const token = ++requestToken; stream = await getUserMedia(); if (token !== requestToken) { stream.getTracks().forEach(t => t.stop()); return false }` | 现状无。**连点两次"Use mic"会泄漏一条 track** |
| B10 | 兜底 | 按钮永远可用，麦克风失败不影响主流程 | 现状 ✅ 保留 |

**验收（GWT）**
- `GWT-B1`：**Given** 注入一段"底噪 0.01 + 0.05 s 的 0.06 RMS 脉冲"，**Then** 不触发（持续 < 0.12 s）。
- `GWT-B2`：**Given** 注入"底噪 0.02 + 0.3 s 的 0.12 RMS 宽带噪声（>180 Hz 为主）"，**Then** 触发且 `strength > 0.5`。
- `GWT-B3`：**Given** 注入"0.2 RMS 的 100 Hz 低频（空调）"，**Then** `broadband < 0.3`，不触发。
- `GWT-B4`：**Given** 并发两次 `enable()`，**Then** 只有 1 条 `MediaStream` 存活，另一个的 track 已被 stop。

**红线（继承 v2.1 §4.4 / §8.1）**：麦克风**必须**用户显式点击后才请求，`autoRequest=false`，默认零授权弹窗。音频不落盘、不上传、不进 DOM。

### 5.3 `GAP-PLANE` · 照片折纸飞机（**P0，但有一处硬冲突需裁决，见 §7-C1/C2**）

| # | 项 | 参数 / 算法 | 现状差异 |
|---|---|---|---|
| P1 | 六阶段状态机 | `photo → folding → ready → aiming → flying → away` | 现状无（只有"启动/未启动"） |
| P2 | 印刷版面 | Canvas **1024×1448**；纸底 **`#fcf9f0`**；内容区 `x=45, y=45, w=934, h=1212`；`contain` / `cover` 两种 fit；`CanvasTexture` + `SRGBColorSpace` | 现状无版面概念 |
| P3 | 纸张尺寸 | **4.2 × 5.94** | — |
| P4 | 顶点结构 | `{ p: Vector3, uv: Vector2 }`；**UV 永远保留原始印刷坐标** | **这是最关键的一条**：图案能跨折痕接上，全靠 UV 不随折叠变动 |
| P5 | 裁切 | `t = da/(da - db)`；**位置与 UV 用同一个 `t` 插值** | 现状无 |
| P6 | 折叠算子 | `fold(faces, a, b, side, angle)`：轴 `= normalize(b-a)`；定侧用二维叉积 `(b.x-a.x)*(p.y-a.y) - (b.y-a.y)*(p.x-a.x)` 乘 `side`；每面裁出 fixed/moving；moving 顶点 `p.sub(a).applyAxisAngle(axis, angle).add(a)` | 现状 `fold` 只是把多边形顶点按 `t*3` 缩放——**不是折叠** |
| P7 | 四段进度 | `0–31%` 收两角 / `32–62%` 内折 / `64–81%` 合机身 / `82–100%` 展机翼；**每次都从初始矩形重算**（不是累加）；`ease = t*t*(3-2*t)` | 现状无。"从初始矩形重算"是**进度条可回拖**的唯一实现方式 |
| P8 | 机身/机翼切分 | 沿 `x = -KEEL / 0 / KEEL` 三条线切开再分别算转角 | 现状无 |
| P9 | 正反面双材质 | `front = FrontSide` 贴印刷面；`back = BackSide` 纸色 **`#f3eee0`**（只用 `DoubleSide` 会让背面也显示图案） | 现状单色多边形 |
| P10 | 纸层间隙 | `PAPER_GAP = 0.004`；`cornerHeight = gap/2`；`dartHeight = gap*1.5`；绕高度 `h` 转 180° 后 `z_after = 2h - z_before`；**不要折完清零高度** | 现状无。这是"折起来的纸有厚度、不会 z-fighting"的全部来源 |
| P11 | 法线 | 逐多边形用**一圈顶点叉积求和**（不能只取前三点，避免共线退化） | 现状无 |
| P12 | 飞行曲线 | `flightPosition(t) = ( t*10 + sin(tπ)*(1.3 + aim*2), 0.48 + sin(tπ*0.78)*(2.4 + strength*2.2) + t*0.7, -t*(14 + strength*7) + sin(tπ)*1.5 )` | 现状 `x = 24 + t*(w-48)`，`y = h-24 - sin(tπ)*64`。**原件是 3D 三轴且带 `aim`/`strength` 耦合**，现状是 2D 平抛 |
| P13 | 机头朝向 | 用 `flightPosition(t+0.005)` 前后两点算切线 + 一点滚转 | 现状用 `t+0.02`（粗 4 倍），且无滚转 |
| P14 | 拖拽 | `aim.x = clamp(dx/180)`；`charge = min(1, hypot(dx,dy)/180)`；`flightStrength = 0.5 + charge*0.5`；`setPointerCapture`；`pointercancel` 必须复位 | 现状无瞄准、无蓄力 |
| P15 | 资源 | 换图时旧 `texture.dispose()` + `URL.revokeObjectURL`；图片异步加载要序号校验；DPR 上限 **1.6**；阴影贴图 **1024** | 现状无 |

**Canvas2D 可行性裁决**：`fold()` 是 3D 顶点运算，但**不需要 WebGL**——自己算顶点、正交投影到 2D、按 UV 填 `Path2D` 即可。规模：约 124 面 × 4 段，每帧重算 ≤ ~500 顶点【估计】，60 fps 可行。**这是 D3（算法照搬），不是 equivalent。**

**验收（GWT）**
- `GWT-P1`：**Given** `fold(angle=π)`（对折 180°），**Then** moving 顶点的 `z_after = 2h - z_before`（用 `PAPER_GAP=0.004` 验证，`h=0.002` 时 `z` 由 `0.002→0.002`、`0→0.004`）。
- `GWT-P2`：**Given** 折叠进度 `t=0.5` 与 `t=0.9`，**When** 回拖到 `t=0.2`，**Then** 顶点位置与直接从初始状态算 `t=0.2` 完全相同（可逆性）。
- `GWT-P3`：**Given** 任意折叠角度，**Then** 每个顶点的 UV 恒等于其初始印刷 UV（`uv` 不变式）。
- `GWT-P4`：**Given** `flightPosition(0)` 与 `flightPosition(1)`，**Then** 起点 `z=0`、终点 `z = -(14+strength*7)`（飞离屏幕，不是飞过屏幕）。
- `GWT-P5`：**Given** `charge=1`，**Then** `flightStrength=1.0`；`charge=0`，**Then** `0.5`（弱投也能飞，只是近）。

### 5.4 `GAP-VERDANT` · verdant-forest（**P2，诚实结论：不做复用承诺**）

| 项 | 事实 |
|---|---|
| 原站 | `verdant-forest.lexn8.chatgpt.site` 被 Cloudflare 拦截，**无源码可取** |
| 移植版 | `masonblake26/verdant-forest` 是 **Godot 项目**（GDScript），非 Web 栈 |
| 可移植的 Web 算法 | **0 个**。GDScript 的 `noise` + 场景树 + shader 与 Canvas2D 无对应关系 |
| PRD v2.1 现状 | 列为 P2 可选场景零件（§1.1 表第 8 行） |

**需求**：**不列为复用目标**。若未来要做，`provenance` 必须是 `depth:'D0'` + `completeness:'absent'` + `downgrade:"GDScript 无 Web 等价物，本件为原创"`。**不允许**在 README / manifest 里写"移植自 verdant-forest"。

> 这是本文对"尽量复用"这条用户指令的一处**诚实边界**：三个缺口里有两个（蒲公英、折纸飞机）有完整文章代码可搬，**第三个没有**。把"没有"说成"做了简化版"，才是真正的浪费——它会让人以后再来找一遍。

---

## 6. `sylva` 授权风险处置

### 6.1 事实

| 项 | 状态 |
|---|---|
| 上游 | `github.com/MengTo/sylva` |
| 归集内容 | `sylva/index.html` + `sylva/liquid-metal-explore.html`（2 文件） |
| 许可证文件 | **无**（F-R4：全库 0 个 LICENSE） |
| 源码内许可声明 | **无**（`grep -niE "licen|copyright"` → 0 命中） |
| 文章说明 | 文章明确：**README 不授予代码/设计/作品的再分发许可** |
| 实际使用 | `/praise` 的"指针拨开纸层"是**自写**，`sylva` **D0，未进任何产物** |
| 体积影响 | **0 B**（从未参与构建） |

### 6.2 三个选项

| 选项 | 做法 | 成本 | 收益 | 风险 |
|---|---|---|---|---|
| **S1 · 隔离**（推荐） | 移入 `shared/parts-library/_quarantine/sylva/`；`part.manifest.ts` 保留但标 `license.spdx='NOASSERTION'`；`entry` 置空并在 `QUARANTINE.md` 登记；`verify:reuse` 断言它不被任何站点引用 | 0.25 人日 | 法律风险归零；素材仍在本地供"观感参考"（**不进入代码**） | 若将来要"参考着写"，边界靠人守——需在 README 写死"只能看，不能抄代码行" |
| **S2 · 移除** | 直接删除目录与 manifest | 0.1 人日 | 最干净 | 丢失观感参考；且**删除本身不产生任何合规收益**（风险已在"不内联"时消除） |
| **S3 · 替换** | `/praise` 的拨纸层改为自研，`origin:'equivalent'` + `depth:'D1'` + `downgrade` 说明 | 0.5 人日 | 语义干净 | — |

### 6.3 建议：**S1 + S3 组合**

理由：

1. **S2 是过度反应**。风险来自"再分发"，而不内联就已经不是再分发。删掉它只是让仓库少两个 HTML，**不增加任何合规确定性**，却丢掉了一份有价值的观感参考。
2. **S1 才是真正的修复**：把"许可未知"从**隐式**（没人知道）变成**显式**（`QUARANTINE.md` 里列着、`verify:reuse` 拦着）。这与 REUSE-7 是同一套机制，**零额外成本**。
3. **必须配 S3**：`/praise` 的零件声明要从"`sylva` 是我的一部分"改成"`paper-reveal` 自研，观感参考 sylva"。否则隔离区里还挂着一个被引用的零件，等于隔离无效。
4. **诚实口径**：`downgrade` 必须写"原件为 WebGL 液态金属 + NDC 平面射线；本站为 Canvas2D 遮罩位移；未使用原件任何代码行；许可状态 NOASSERTION，故不引用其代码"。

---

## 7. 与 v2.1 的一致性声明 + 冲突清单

### 7.1 一致性声明（逐条可验证）

| v2.1 硬门 | 本专项是否可能破坏 | 保证机制 | 验收 |
|---|---|---|---|
| **Frozen Core 一字不动**（INV-1a） | ❌ 不会 | 全部落点在 L3 `parts-library/`、L1 `contract/parts-registry.ts`（**只追加可选字段**）、L4 `sites/*/parts/`、`tests/`。**`shared/core/` 零文件触碰** | `cd shared/core && sha256sum -c BASELINE.sha256` → 11/11；`verify-no-core-write.mjs` 继续绿 |
| **7 站目录零新增零改动**（INV-3 / ADR-7） | ❌ 不会（结构性保证） | legacy 零件溯源放 `shared/parts-library/legacy-provenance.ts`（**构建元信息，照抄 LEGACY_SITES 范式**），不下发到站点目录 | `git diff -- sites/license sites/praise sites/hug sites/still` 中**无新增文件**；`verify-append-only.mjs` 继续绿 |
| **体积门 163,840 B** | ⚠️ 有增量 | 每站 REUSE 增量 ≤ 15,000 B【估计】；`sizeHint` 进入 `reuse-report.json` 做预算追踪 | `verify-size.mjs` 继续硬门；新增"REUSE 增量"软观测 |
| **12 站矩阵 / 10 产品** | ❌ 不会 | **不新增站点、不新增路由**；三个缺口全部落在既有 `/hug`、`/license` | `verify-registry.mjs`：站点数 = 12（7 legacy + 5 nexus 待建），无新增 |
| **4 biome / 构建期择一** | ❌ 不会 | 全部零件为 Canvas2D，**不新增任何 WGSL** | `verify-biome-fork.mjs` 的通用段哈希不变 |
| **Canvas2D 裁决（room/ink）** | ✅ 被强化 | 复用件全走 Canvas2D，正好利用"8 站降到 20–40 KB"腾出的预算 | 产物体积 |
| **零外部请求 / 零 CJK / 零跨站链接** | ⚠️ 需守住 | 移植代码可能带入原件的 `https://` 注释或 CJK（如 micro-scenes 的中文文件名） | `assertArtifact` 的 `/https?:\/\//i` 继续拦；`compliance.test.mjs` 扩展到新代码 |

**一句话**：本专项**不新增任何机制**，它把已有的 `PartManifest`（L1）和 `parts-library`（L3）从"文档"变成"断言"，**不动任何已有裁决**。

### 7.2 冲突清单（**我不自行裁决，列出待主理人定夺**）

| # | 冲突 | 两边的主张 | 建议 | 谁定 |
|---|---|---|---|---|
| **C1** | **照片折纸飞机需要照片输入，违反 v2.1 §4.4 零输入白名单** | 用户：复用照片折纸飞机（`<input type=file>` 或剪贴板粘贴）<br>v2.1 §4.4：「全站只允许 1 类输入：`/miss` 的玻璃写字」 | **建议方案 A1**：不引入用户照片，印刷面改为**程序化凭证**（纸底 `#fcf9f0` + 编号 + 一句），`fold()` / `flightPosition()` 全部算法照搬 → `D3` 成立且零输入。<br>备选 A2：允许 `/hug` 一处 file input，仅本地读、绝不外发（比 `/miss` 写字更安全，因为照片是用户自己的）——但**违反字面**，需签字 | 主理人 |
| **C2** | **v2.1 的 12 站矩阵里没有"折纸飞机"的位置** | 现状 `/license` 有一个 `plane` 彩蛋（`createPlanePart`）；v2.1 §3.5 的 `/license` 只有"盖章→出证" | **建议移到 `/hug`**：`/hug` 的已有语义是"送出去"，`flightPosition` 的三轴 `-z` 正是"飞离"；且 v2.1 §3.3 已写"回赠必须是一次点击可完成"——折纸飞机比复制链接更接近"一次点击"。**但 `/hug` 是 field biome（raymarcher）**，塞一个 3D 顶点折纸件会与"草原"世界争夺焦点，需架构师确认 | 主理人 + 架构师 |
| **C3** | **"同类三站产物差异 > 阈值"不能作为复用证据** | 主理人第 10 条建议：如"同类三站产物差异必须 > 阈值"<br>v2.1 §2.3：koi 三站 = 1 产品 3 路由，差异只在**参数**（鱼数/莲叶/水纹周期/品种） | **建议改成"体积下限"**：`GWT-K4`——移植后单站比移植前**至少 +3,000 B**（证明代码进了产物）。三站之间的差**允许很小**（30–300 B 都正常），因为参数化复用本来就不该产生大字节差。**用"三站之差不达标"当失败信号，会惩罚正确的参数化复用，反而奖励"三站各写一套"** | 主理人 |
| **C4** | **`room-at-dawn` 若要求 D3，必须补全 6 个模块** | 用户要求"尽量复用"<br>F-R5：只归集 1/7 文件，缺 `core/gi.js` 等 | **建议降为 D1 + 如实标注自研**（§4.4）。理由：原件是 3D GI 烘焙，与 2D 纸纹无算法交集，**补全也无用**。补全需网络且不改变结论 | 主理人 |
| **C5** | **koi 三站改源码 → 产物字节必变，与 INV-3 冲突** | INV-3：legacy 7 站逐字节相等<br>v2.1 §9.1：已改为"逐站锁定 + 换 biome 需显式签字" | 无需新裁决：koi 的改造在 v2.1 P0-10（5 条既有路由改造）授权内。**仅需在 `tests/baseline-dist.sha256` 的提交信息里记一条签字**：`koi-{pond,ink,watercolor} / biome=ink / 授权=v2.1 P0-10 / 签字人=主理人` | 主理人（记录即可） |
| **C6** | **verdant-forest 无 Web 源码，"复用"无从谈起** | 用户：10 个链接都要复用<br>实际：Godot 项目 | **建议移出复用承诺**（§5.4），标 `D0/absent`。若坚持要那片森林，正确表述是"新增原创件"，工期另计 | 主理人 |
| **C7** | **`/hug` 体积余量是否够（REUSE + field fork 叠加）** | 余量 51,879 B（111,961 → 163,840）<br>蒲公英 +8~12 KiB【估计】+ field biome fork +8~18 KiB【估计】= 16~30 KiB | **建议**：可过门，但**余量已用掉 31–58%**。若 fork 实际超 18 KiB，按 v2.1 §8.3-4「砍内容不放宽门」：优先砍蒲公英株数（10 株 → 6 株），**不砍 Fibonacci 采样与伞冠几何**（那是复用本体） | 架构师实测 |
| **C8** | **是否给 `PartOrigin` 加 `'self'` 值** | 自研件塞进 `'equivalent'` 语义不准 | **建议不加**。`'equivalent'` 在 Q-N9 口径下就是"无原件/按描述实现"，自研属于此列；`provenance.depth='D1'` + `downgrade` 足以表达"自研"。**改枚举有类型风险，收益为零** | 架构师确认 |

---

## 8. 需求池

### P0 · Must have（不做则"复用"仍是空话）

| 编号 | 需求 | 验收要点 | 对应 |
|---|---|---|---|
| **P0-R1** | **`Provenance` 契约 + `PartManifest.provenance?` 追加** | 类型纯追加；`registerPart` 零改动；`tsc --noEmit` 通过 | REUSE-1 |
| **P0-R2** | **`tests/verify-provenance.mjs`**：符号 grep 对账 + 完整性 + 深度/`origin` 一致性 + 授权隔离 | `GWT-1`~`GWT-6` 全绿；`npm run verify:reuse` 进 `build:all` 后置门 | REUSE-1/2/3/7 |
| **P0-R3** | **`shared/parts-library/legacy-provenance.ts`** 冻结快照 | 7 站目录零新增；`git diff` 为空；`verify-append-only.mjs` 绿 | REUSE-1 |
| **P0-R4** | **`R-koi` 移植**（K1–K7 七项算法） | `GWT-K1`~`K4` 全绿；`origin:'port'` + `depth:'D3'`；每站比移植前 ≥ +3,000 B | §4.1 |
| **P0-R5** | **`GAP-DANDELION`**（D1–D12） | `GWT-D1`~`D6` 全绿；`【原文待补】` 参数必须回原文取全或写 `downgrade` | §5.1 |
| **P0-R6** | **`GAP-BLOW`**（B1–B10） | `GWT-B1`~`B4` 全绿；默认零授权弹窗 | §5.2 |
| **P0-R7** | **`GAP-PLANE`**（P1–P15） | `GWT-P1`~`P5` 全绿；**输入方式按 C1 裁决执行** | §5.3 |
| **P0-R8** | **`sylva` 隔离（S1）+ `/praise` 拨纸层改自研（S3）** | `QUARANTINE.md` 建；`verify:reuse` 断言 sylva 不被引用 | §6 |
| **P0-R9** | **`tests/golden/` + `tests/golden-run.mjs` + `tests/mutation-probe.mjs`** | `GWT-7`~`GWT-9` 全绿；死参数数 = 0 | REUSE-4/5 |

### P1 · Should have

| 编号 | 需求 | 验收要点 |
|---|---|---|
| P1-R1 | `R-atelier` 击弦机联动（A1–A3） | `GWT-A1`/`A2` |
| P1-R2 | `R-loong` 时间轴纯函数（L1–L4） | `GWT-L1`/`L2`；支持 `?t=` 定位 |
| P1-R3 | `R-room` 诚实降级（D1/partial/missing 6 项） | `GWT-6` |
| P1-R4 | `REUSE-6` 降级措辞校验 + 架构师签核 | `GWT-10`；`README.md` 措辞重写 |
| P1-R5 | `REUSE-8` `dist/reuse-report.json` + `drift` 栏 | `GWT-12` |
| P1-R6 | `README.md` 重写：12 行 → 与磁盘一致的 8 行 + 3 个缺口 + 隔离区 | `drift.readmeRows === diskDirs` |

### P2 · Nice to have

| 编号 | 需求 | 说明 |
|---|---|---|
| P2-R1 | `R-unused`：micro-scenes / rain-webgpu 是否装站或删除 | 本文不建议删（8.2 MB 不可恢复），交主理人 |
| P2-R2 | `GAP-VERDANT` | 明确不做复用承诺（§5.4）；若要做，按原创件另估工期 |
| P2-R3 | `reuse-report.json` 的可视化 diff | 便于签核 |

---

## 9. 可验收的度量：怎么证明"不是空壳"

### 9.1 反空壳四指标（缺一不可）

| # | 指标 | 阈值 | 为什么它能杀死空壳 | 脚本 |
|---|---|---|---|---|
| **A1** | **溯源命中率** = 声明符号在原件中 `grep -w` 命中数 / 声明符号数 | **= 100%** | 空壳无法凭空写出原件里的函数名（`halfWidth`/`actionPose`/`upRef` 这种名字，只有真读过原件才知道） | `verify-provenance.mjs` |
| **A2** | **参数搬运率** = 已进 `params` 的原件可调参数 / 原件导出可调参数 | **≥ 60%** | "只搬了名字没搬数值"会被抓出 | `verify-provenance.mjs` |
| **A3** | **死参数数** = mutation probe 改 ±10% 后输出不变的数量 | **= 0** | 这是最狠的一条：**声明得再漂亮，参数没接线就会暴露** | `mutation-probe.mjs` |
| **A4** | **黄金值通过率** | **= 100%**，容差 `1e-6` | 用原件公式手算的期望值。空壳算不出来 | `golden-run.mjs` |

### 9.2 体积的正确用法（对主理人第 10 条建议的一处修正）

| 错误用法 | 为什么错 | 正确用法 |
|---|---|---|
| "同类三站产物差异必须 > 阈值" | koi 三站按 v2.1 §2.3 是**1 产品 3 路由**，差异是参数（鱼数 9/5/13、莲叶、水纹周期、品种集合），**参数化复用不产生大字节差**。若以此判失败，唯一"通过"的方式是三站各写一套——**恰好奖励我们要消除的行为** | ① **单站体积下限**：移植后比移植前 **≥ +3,000 B**（证明代码真进了产物）；② **三站差异看结构快照**（鱼数/莲叶/周期/品种两两不等），不看字节 |

### 9.3 门禁清单（`npm run verify:reuse` 一次跑完）

| # | 断言 | 失败即阻断 |
|---|---|---|
| 1 | 每个被引用零件有 `provenance` 且 `ported.length ≥ 1`（D0 不得被引用） | ✅ |
| 2 | `depth` 与 `origin` 一致 | ✅ |
| 3 | 每个 `ported[].symbol` 在 `files[].path` 中命中 | ✅ |
| 4 | `files[].bytes` / `sha256` 与磁盘一致 | ✅ |
| 5 | `completeness:'partial'` 必有 `missing[]` | ✅ |
| 6 | `license.spdx === 'NOASSERTION'` 的零件不被任何站点引用 | ✅ |
| 7 | 参数搬运率 ≥ 60% | ✅ |
| 8 | 死参数数 = 0 | ✅ |
| 9 | 黄金值通过率 = 100% | ✅ |
| 10 | `drift.readmeRows === drift.diskDirs === drift.registryEntries` | ⚠️ 警告（P1 转阻断） |

### 9.4 与 v2.1 既有度量的关系

| v2.1 指标 | 本文是否改变 |
|---|---|
| 北极星「带走物完备度」 | ❌ 不变 |
| 单站 ≤ 163,840 B | ❌ 不变，且新增"REUSE 增量 ≤ 15,000 B【估计】"软观测 |
| 产物内 0 网络符号 / 0 CJK / 0 跨站链接 | ❌ 不变，且**新代码必须同样通过**（移植可能带入原件的 `https://` 与中文注释） |
| 首屏可见元素 ≤ 3 | ❌ 不变 |
| `site.biome === part.biome` | ❌ 不变（本文零件全部沿用原站 biome） |
| 站点隔离（改 A 站 B 站字节不变） | ❌ 不变。**新增分支**：`legacy-provenance.ts` 属构建元信息，改它不得改变任何产物 |

---

## 10. 工时、排期与风险

### 10.1 工时【估计，非实测】

| 工作项 | 人日 | 依赖 | 说明 |
|---|---|---|---|
| P0-R1~R3 溯源机制（schema + 2 脚本 + legacy 快照） | 1.5 | 无 | **必须最先做**：它是后面所有工作的验收工具，先做才能边做边验 |
| P0-R9 golden + mutation probe 框架 | 1.0 | R1 | 与 R1 并行 |
| P0-R4 koi 移植（7 项算法 + 3 路由参数化） | 2.5 | R9 | 独立于 biome fork，可并行 |
| P0-R5 蒲公英（12 项，含 `【原文待补】` 回查） | 2.0 | field fork | 依赖 `field` biome 分叉（v2.1 4–6 天） |
| P0-R6 麦克风（10 项） | 1.0 | 无 | 纯音频算法，可并行 |
| P0-R7 折纸飞机（15 项） | 2.5 | C1/C2 裁决 | 最重的一块：fold + UV + 投影 |
| P0-R8 sylva 隔离 | 0.25 | 无 | 立即可做 |
| P1-R1/R2 击弦机 + 时间轴 | 1.5 | R1 | |
| P1-R3~R6 降级 + 报告 + README | 0.75 | R1 | |
| **合计** | **≈ 13 人日** | | 不含 v2.1 的 field biome fork（4–6 天）与首屏重构 |

### 10.2 排期建议（三批，每批可独立验收）

| 批 | 内容 | 出口条件 |
|---|---|---|
| **批 1（机制先立）** | P0-R1/R2/R3/R8/R9 + P1-R5 | `verify:reuse` 能跑，**它会把现有 8 份零件全部判红**——这是预期结果，不是回归 |
| **批 2（koi + 音频）** | P0-R4 + P0-R6 | koi 三站 `D3`；麦克风 `GWT-B1~B4` 绿；不依赖 field fork |
| **批 3（两缺口 + 既有件）** | P0-R5 + P0-R7 + P1-R1/R2/R3 | 全部 P0 绿；`reuse-report.json` 无 `drift` |

### 10.3 风险

| # | 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|---|
| 1 | **蒲公英三轴系数原文缺失**（`0.08+…` / `-0.5-…`） | 高 | 中 | 标 `【原文待补】`；engineer 回原文取全值或在 `downgrade` 写"用 0.08 与 −0.5 作常数，摆动幅度按 1.3 s 朝向过渡反推"——**禁止编造** |
| 2 | 批 1 上线时 8 份零件全红，被误读为"项目崩了" | 高 | 中 | 在 PR 描述里写明"这是**存量债务显影**，不是新增回归"；`verify:reuse` 首版以 `--warn` 上线，批 1 结束时转硬门 |
| 3 | 折纸飞机的 3D 顶点在 Canvas2D 下性能不足 | 中 | 高 | `DPR ≤ 1.6`（原件参数）+ 面数上限；若仍不行，按 v2.1 §8.3-4 **降到 2 段折叠**（保留 `fold()` 与 UV，不减算法） |
| 4 | `/hug` 体积 REUSE + field fork 叠加超门（C7） | 中 | 中 | 实测优先；超门先砍株数，**不砍采样与几何** |
| 5 | koi 移植后三站视觉趋同（都用同一套算法） | 中 | 中 | 六项差异化参数（§4.1）+ `GWT-K3` 构建期断言 |
| 6 | `legacy-provenance.ts` 变成第二个"声明了没人用"的库 | 中 | 高 | 它必须被 `verify:reuse` **读取并断言**，而不是只存在。这是本文对 F-R1 的唯一防线 |

---

## 附录 A · 溯源声明填写示例（`koi`，改造后）

```ts
// shared/parts-library/koi/part.manifest.ts（改造后）
const manifest = {
  id: 'koi',
  layer: 'scene',
  origin: 'port',                       // ← 由 'copy' 改为 'port'（REUSE-2）
  entry: 'shared/parts-library/koi/index.ts',
  source: 'koi/koi.js',
  contract: 'v1',
  claims: [{ resource: 'canvas:stage', mode: 'exclusive' }],
  requires: 'none',
  note: '观感与算法移植自 zz85/random-sketches；渲染后端由 WebGL 降级为 Canvas2D，差异见 provenance.downgrade。',
  provenance: {
    depth: 'D3',
    upstream: {
      repo: 'https://github.com/zz85/random-sketches',
      ref: 'gh-pages/vibes/koi',
      accessed: '2026-11-18',
    },
    files: [
      { path: 'koi/koi.js', bytes: 29545, completeness: 'complete' },
      // … 其余 9 个 js + index.html
    ],
    ported: [
      { symbol: 'halfWidth', kind: 'function', portedTo: 'sites/koi/shared/body.ts:profileWidth',
        params: { headPow: 0.25, taperStart: 0.25, taperEnd: 0.83, taperAmt: 0.8, taperPow: 1.2, maxHalfWidth: 0.1 } },
      { symbol: 'topH', kind: 'function', portedTo: 'sites/koi/shared/body.ts:topHeight',
        params: { maxTopH: 0.096, taperAmt: 0.66, taperPow: 1.1 } },
      { symbol: 'bodyGeometry', kind: 'function', portedTo: 'sites/koi/shared/body.ts:sampleBody',
        params: { NS: 52, NT: 24, sEnd: 0.875, sPow: 1.25, normalEps: 1e-3 } },
      { symbol: 'frame', kind: 'function', portedTo: 'sites/koi/shared/spine.ts:spineAt',
        params: { envBase: 0.1, envAmp: 0.9, envPow: 1.4, envStart: 0.04 } },
      { symbol: 'koiColour', kind: 'function', portedTo: 'sites/koi/shared/pattern.ts:paintPattern',
        params: { scaleS: 4.2, scaleY: 7, scaleZ: 7, edgeW0: 0.018, edgeW1: 0.05 },
        downgrade: '原件在片元着色器逐像素求 fbm3；本站用 2D value noise 按 8×32 网格求值后填色。差异：花纹边缘在放大时略粗糙，1x 下不可辨。' },
      { symbol: 'VARIETIES', kind: 'table', portedTo: 'sites/koi/shared/varieties.ts:VARIETIES' },
      { symbol: 'RESIDENTS', kind: 'table', portedTo: 'sites/koi/shared/residents.ts:RESIDENTS' },
      { symbol: 'wobble', kind: 'function', portedTo: 'sites/koi/shared/spine.ts:wobble',
        params: { a: 0.5, b: 0.3, bFreq: 1.618, bPhase: 1.3, c: 0.2, cFreq: 2.71, cPhase: 4.1 } },
    ],
    license: { spdx: 'MIT', evidence: 'upstream repo LICENSE（归集时未复制，待补：shared/parts-library/koi/LICENSE）' },
    sizeHint: 7200,
  },
} satisfies PartManifest;
```

## 附录 B · 三个缺口的黄金参数速查表（工程师直接可用）

| 参数 | 值 | 来源 | 对账方式 |
|---|---|---|---|
| 蒲公英 · Fibonacci `ny` | `1-(i+0.5)/count*2` | 文章 `FwBWw2znYZFayBosZPCzLw` | `GWT-D1` |
| 蒲公英 · 黄金角 | `2.39996323` rad | 同上 | `GWT-D2` |
| 蒲公英 · `DETACH_SECONDS` | **1.8** | 同上 | `GWT-D3` |
| 蒲公英 · 伞冠区间 | `0.16 ~ 0.19` | 同上 | 几何断言 |
| 蒲公英 · 细柄区间 | `0 ~ 0.16` | 同上 | 几何断言 |
| 蒲公英 · 每颗线段 | 44 条 / 88 端点 | 同上 | 顶点数断言 |
| 蒲公英 · `fade` | `1-smoothstep(7,10,travel)` | 同上 | `GWT-D4` |
| 蒲公英 · `attachedAlpha` | `0.19 + max(0,aAxis.z)*0.26` | 同上 | 黄金值 |
| 蒲公英 · 飞行 `alpha` | `0.62` | 同上 | 黄金值 |
| 蒲公英 · 朝向过渡 | 约 `1.3 s` | 同上 | 黄金值 |
| 蒲公英 · 三轴系数 | `0.35+aRandom*1.6` / `0.08+【原文待补】` / `-0.5-【原文待补】` | 同上 | **必须回原文取全** |
| 麦克风 · `fftSize` | `2048` | 文章同篇 | `GWT-B2` |
| 麦克风 · `smoothing` | `0.65` | 同上 | 黄金值 |
| 麦克风 · 底噪标定 | 静默 `1.2 s`；`baseline*0.94 + rms*0.06` | 同上 | `GWT-B1` |
| 麦克风 · 分频 | `<180 Hz` / `180–4200 Hz`；`min(1, high/max(1,low*2.5))` | 同上 | `GWT-B3` |
| 麦克风 · 阈值 | `max(0.025, baseline*2.8)` | 同上 | 黄金值 |
| 麦克风 · 强度 | `clamp((rms-threshold)/0.16)*broadband` | 同上 | 黄金值 |
| 麦克风 · 持续 | `0.12 s`；`breath>0.12? +dt : -dt*2` | 同上 | `GWT-B1` |
| 折纸 · 版面 | `1024×1448`；纸底 `#fcf9f0`；内容 `45,45,934,1212` | 文章 `aJnTqH6rtVK15VC796iC3A` | 黄金值 |
| 折纸 · 纸张 | `4.2 × 5.94` | 同上 | 黄金值 |
| 折纸 · `PAPER_GAP` | `0.004`；`cornerHeight=gap/2`；`dartHeight=gap*1.5` | 同上 | `GWT-P1` |
| 折纸 · 四段 | `0–31 / 32–62 / 64–81 / 82–100` (%) | 同上 | `GWT-P2` |
| 折纸 · 缓动 | `t*t*(3-2*t)` | 同上 | 黄金值 |
| 折纸 · 背面色 | `#f3eee0` | 同上 | 黄金值 |
| 折纸 · 拖拽 | `aim.x=clamp(dx/180)`；`charge=min(1,hypot/180)`；`flightStrength=0.5+charge*0.5` | 同上 | `GWT-P5` |
| 折纸 · DPR / 阴影 | `1.6` / `1024` | 同上 | 黄金值 |

## 附录 C · 本文的不确定项（不装懂）

| # | 不确定项 | 处理 |
|---|---|---|
| 1 | 蒲公英三轴系数 `y`、`z` 的完整表达式 | 标 `【原文待补】`；工程师回原文取全或写 `downgrade`，**禁止猜数** |
| 2 | 折纸飞机 `KEEL` 的具体数值 | 文章未给；标 `【原文待补】`，或用 `4.2` 纸宽按"机身占 1/3"反推并在 `downgrade` 说明 |
| 3 | 三个缺口的零件代码体积 | 全部标【估计】（蒲公英 8–12 KiB、折纸 8–10 KiB） |
| 4 | 13 人日工时 | 标【估计】，无历史同类数据可比 |
| 5 | `sylva` 上游 LICENSE 的实际内容 | 本机无网络、归集副本无 LICENSE；按"文章明确不授予再分发许可"从严处理为 `NOASSERTION` |
| 6 | 9 个上游来源的许可证 | **全部未核实**（F-R4）。REUSE-7 上线后会被逐个判为 `NOASSERTION` 并进隔离区，需主理人安排一次集中核实 |

---

> **本文档不修改任何代码，不修改 `PRD-REFINE.md` 与 `ARCHITECTURE-NEXUS.md`。**
> **本文档不推翻 v2.1 的任何裁决；8 处冲突已列在 §7.2，等主理人裁决，我不自行定夺。**
