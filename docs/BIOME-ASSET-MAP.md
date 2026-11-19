# BIOME-ASSET-MAP

> 目标：四个 biome（tide / field / room / ink）各一站样板，按 L0–L5 装配。**本文写于 2026-11-18 施工前，是可行性判定；现状已回填（见各节 ✅ 行）。** 历史估算（字节数 / 行数）保留为溯源，不代表当前实现。
>
> **本文已入库**（`docs/BIOME-ASSET-MAP.md`，commit 83e19c9）。现状回填见各节；下文的路径与字节数是**施工前经 GitHub Contents API 实测的素材口径**，不是本仓库当前文件清单。
>
> **证据口径**：所有路径经 GitHub Contents API 目录列举确认存在；字节数取自 API 返回的 `size` 字段（实测，非估算）。标「估算」的只有 gzip 折算与抽取行数。

---

## 一句话总判断

四个 biome 里，**room 只要 2 件、field/tide 各 3 件、ink 2–3 件**就能"看起来像"；真正卡住工作量的不是零件数量，而是 **L0 底材（施工前四 biome 全缺；现 `paper-ink` / `field-ground` / `tide-medium` 均已实现）** 和 **ASCII 的网格分辨率锁死**——ASCII 那 984 件能上色、能透明叠加、能进我们的画布，但永远只能是一个 `cols×rows` 的字符栅格，不能当"高清纹理"用。

---

## 结论 2（先答）：ASCII 984 件到底能不能用

**能，而且比预期好：它们不是预渲染文本，是活的 JS 模拟 + 一张字符栅格 + 一张按字符索引的调色表。颜色、字号、字符集都可改，画布默认透明可叠加。但分辨率锁死在 `meta.cols × meta.rows`。**

### 实测证据（不是推断）

我读了这两套的 runtime 和 3 个 piece 原文，它们的形状是这样的：

**ascii-magic（734 件）**

```js
// public/ascii-magic/pieces/moonlit-sea.js（3,000 B，原文节选）
import { Grid, fbm, gradient, palette, KEYS, rng, clamp } from "../lib/kit.js";

const SKY = gradient(["#0e1838", "#24396e", "#4a6aa8", "#8aa6d6"], 10);   // 0-9
const SEA = gradient(["#071226", "#123063", "#2c5a9a", "#6b93cc"], 10);   // a-j
const pal = palette([...SKY, ...SEA, ...MOON, "#dfe8ff"]);                 // o = star

export const meta = { slug, name, category, note, tags, cols: 96, rows: 36, fps: 20, palette: pal };

export default function create() {
  const g = new Grid(96, 36);
  return (t) => {                       // ← t 是秒，纯函数，无内部状态累积
    g.set(x, y, "░", KEYS[3]);          // ← 第 4 个参数是「调色键」，不是 RGB
    return g.frame();                   // ← {text, color, palette} 或 string
  };
}
```

**ascii-rest（250 件）**

```js
// public/ascii-rest/pieces/pond-ripples.js（6,021 B，原文节选）
export const meta = { name: "pond ripples", category: "physics", note: "...", cols: 64, rows: 20, fps: 20 };
export default function pondRipples() {
  return (time) => lines.join("\n");    // ← 就是一个多行字符串，零依赖，连 import 都没有
}
```

### 四条实测结论

1. **不是预渲染。** 两套的 piece 都是 `export default function()` 返回一个 `(t) => frame` 的闭包，`t` 是秒。这意味着**可以任意 seek、可以暂停、可以多实例并行**，不是一段 MP4 或一段写死的帧数组。反例：`public/ascii-rest/pieces/aquarium.js`（6,003 B）里全是参数化运动（`Math.asin(0.995*Math.sin(th))` 做转身缓动、`hash(k,1)` 决定气泡速度），没有任何逐帧数据。

2. **颜色是可换的，而且是逐格色。** ascii-magic 走 `meta.palette`（一条由多个 `gradient()` 拼成的色带）+ `g.set(x,y,ch,KEY)` 的第四参数；`player.js` 里 `paint(ctx, f, f.palette || meta.palette, ...)` 在渲染时读它。**换色 = 换 `palette` 数组，字符不动**。另外 `player.js` 导出的 `withLook(draw, palette, look)` 支持 `mono`（单色）、`gamma`（对比度）、`chars`（换字符集，从亮到暗）、`look`（dots / ascii / dense / numbers / binary / blocks / dither 等 10 种）——**同一件能出 10 种"笔触"**，这是这批资产最被低估的地方。

3. **画布默认透明，能参与混合。** `player.js` 每帧 `ctx.clearRect(0, 0, W, H)` 后才画；`mount.js`（ascii-rest）只在 `meta.ground` 存在时才 `fillRect` 铺底。所以：**没有 `ground` 的件可以 `drawImage` 叠到我们任意层上**，`source-over` / `lighter` / `overlay` 随我们。这直接否掉"没法参与图层混合"的担心。

4. **分辨率锁死在字符栅格。** `player.js` 的尺寸推导是 `cw = px * CELL_W`，`W = cols * cw`，`H = rows * ch`——**唯一能调的是字号 `px`**，栅格本身（如 96×36）改不了。放大字号只会让字变粗，不会多出细节。这是硬约束，也是它**只能当 L2 生态层或 L0 远景，不能当高清纹理**的原因。

### 怎么用最省（两套差别很大）

| | ascii-magic（734） | ascii-rest（250） |
|---|---|---|
| 单件依赖 | 依赖 `public/ascii-magic/lib/kit.js`（**10,772 B**，提供 `Grid/palette/gradient/KEYS/fbm/noise2/rng/clamp`） | **零依赖**，单文件自包含（抽查的 pond-ripples / aquarium 均无 import） |
| 取用方式 | `import mod from './pieces/x.js'` → `mod.default()` → `draw(t)` | `import mod from './pieces/x.js'` → `mod.default()` → `draw(t)` → **直接拿字符串** |
| 能不能不要 runtime | 能。`g.frame()` 就够，`player.js`（7,618 B）只是为了把它画到 canvas | 能，而且更简单：拿到字符串自己画，`mount.js`（8,871 B）完全不需要 |
| 上色 | `meta.palette` 已带，直接换数组 | **抽查两件都无 `meta.palette`**，即单色；要上色得按行/列自己做渐变映射（或改用带 palette 的件，我没逐件核实） |
| 最小成本 | piece（3–8 KB）+ kit.js（10.8 KB） | **piece 单文件（4–28 KB），拷走即用** |

**给结论：** 按"小、能拆、能参与混合"的标准，**ascii-rest 的单件比 ascii-magic 更值钱**（零依赖、返回纯字符串、我们自己决定字形与颜色）；ascii-magic 的价值在 **`withLook` 那 10 种笔触 + 逐格调色**，适合"要一眼看出是 ASCII 艺术"的场合，不适合当底材。

**能用的最多是哪几件**（按 biome 挑，全部实测存在、字节为实测）：

| piece | 路径 | 字节 | 给谁 | 为什么 |
|---|---|---|---|---|
| `pond-ripples` | `public/ascii-rest/pieces/pond-ripples.js` | 6,021 | ink | 落雨水纹，64×20，单色刚好当墨 |
| `koi-pond-ripples` | `public/ascii-magic/pieces/koi-pond-ripples.js` | 7,151 | ink | 92×34，带 `FISH[]` 参数化摆尾 + `drops[]` 涟漪 |
| `aquarium` | `public/ascii-rest/pieces/aquarium.js` | 6,003 | tide | 鱼群往返 + 水草摆动 + 气泡流，60×20 |
| `jellyfish` | `public/ascii-rest/pieces/jellyfish.js` | 7,605 | tide | 水母 |
| `moonlit-sea` | `public/ascii-magic/pieces/moonlit-sea.js` | 3,000 | tide | 96×36，带完整 palette，可整体改夜色 |
| `deep-reef` | `public/ascii-rest/pieces/deep-reef.js` | 28,169 | tide | 最"满"的一张，但单件偏大 |
| `wind-grass` | `public/ascii-magic/pieces/wind-grass.js` | 3,262 | field | 风过草地，最便宜的一片草 |
| `fireflies` | `public/ascii-magic/pieces/fireflies.js` | 3,761 | field | 萤火，逐格亮点 |
| `coffee-steam` | `public/ascii-magic/pieces/coffee-steam.js` | 4,063 | room | 一杯热气的呼吸感 |
| `rainy-window` | `public/ascii-magic/pieces/rainy-window.js` | 4,593 | room | 窗上雨痕，正是"室"的情绪 |

另外 `public/ascii-rest/fonts/ascii-rest-mono.woff2`（**2,956 B**）是配套等宽字体；用不用它决定"像不像原作"。**我没确认它是被 piece 引用还是被 `library.js` 引用**（见最后一节）。

---

## 主表

`形态` 一列只写真值：**canvas**（自己持有 2D 上下文）/ **字符串**（返回文本，需我们栅格化）/ **帧缓冲**（写 Uint32 双缓冲）/ **SVG 字符串** / **WebGPU** / **WebGL2** / **DOM+CSS**。
`进 canvas2d` 三态：**能** / **需转换** / **否**。

### L0 底材 / 纸与纹理

| 零件 id | biome | 层 | portal 源路径 | 字节 | 形态 | 进 canvas2d | 复合风险 |
|---|---|---|---|---|---|---|---|
| `paper-ink-core` | room, ink | L0 | `src/looseleaf/vendor/lib/ink/`（8 文件，见下） | 63,048 | SVG 字符串 | 需转换 | 输出是**字符串**不是位图；无 DOM 依赖；不自带不透明底（纸底要另铺）；`toSvg()` 每帧重生成很慢，只适合静态底材 |
| `paper-grain-gen` | 全 | L0, L4 | `src/generated/vendor/pixelfx/core/math.js` | 6,102 | 纯函数 | 能 | 无。`tileNoise/tileFbm` 本就是无缝的，直接拿来做纸纹/焦散 |
| `post-dsl` | 全 | L4 | `src/generated/vendor/pixelfx/fx/transitions/_lib.js` | 8,190 | 纯函数（写帧缓冲） | 能 | **模块常量 `W=320, H=180` 硬编码**；`field()`/`pixels()` 是"后处理 DSL"，grain/vignette/scanline 要靠它自己写（全仓 247 个 fx 文件里**没有**现成后处理件） |
| `frame-api` | 全 | L4 | `src/generated/vendor/pixelfx/core/fx.js` | 5,107 | 帧缓冲 | 能 | `color` 与 `ImageData` 二进制同构，2 行桥接即可；`0` 表示空，需要深色底时配 `scene.js` 的 `backdrop()` |

ink 那 8 个文件（实测字节）：`types.ts` 2,148 / `paint.ts` 2,191 / `rng.ts` 2,448 / `noise.ts` 1,019 / `geom.ts` 15,653 / `pens.ts` 4,381 / `pen.ts` 19,737 / `builder.ts` 15,471。

### L1 世界（3D）

| 零件 id | biome | 层 | portal 源路径 | 字节 | 形态 | 进 canvas2d | 复合风险 |
|---|---|---|---|---|---|---|---|
| `orbit-globe` | tide（勉强） | L1 | `src/generated/vendor/pinui/blocx/orbit-globe.ts` | 11,729 | WebGL2 | 需转换 | 需 4 张 equirect 纹理；`MAX_PIXELS = 5_000_000`；`SECONDS_PER_REVOLUTION = 100`（极慢）；自带 ISO 暂停与 context-loss 处理；要进我们的合成只能 `preserveDrawingBuffer` 或 `drawImage(它自己的 canvas)` |

**L1 在施工前是真缺口；现 `voxel-world` 已实现并用于 `/still`（按能力在场，`gl` 通道，整场唯一）。** portal 侧仍没有"水下 / 草甸 / 室内"现成 3D 场景；`public/showcases/*` 里那些看着像 3D 的是**预构建的 Vite bundle**，整块嵌入，不是零件。

### L2 生态（自走实体）

| 零件 id | biome | 层 | portal 源路径 | 字节 | 形态 | 进 canvas2d | 复合风险 |
|---|---|---|---|---|---|---|---|
| `boids` | field | L2 | `src/generated/vendor/animata/background/boids-ecosystem.tsx` | 7,672 | canvas | 能 | **零 dt**，速度是"每帧像素"（`MAX_SPEED=1.8`），隐含 60fps；`background + 'dd'` 只对 6 位 hex 成立（`rgba()` 会拼出非法色）；自带全屏 canvas，需改成可嵌套尺寸 |
| `bubbles` | tide | L2 | `src/components/showcases/AbyssalDescent.tsx` | 22,000（整文件；抽取值约 2,000，估算） | canvas | 能 | 归一化 0..1 坐标绑在**它自己的容器**上；高光是**两个叠加圆**不是渐变；整个文件还含别的展示逻辑，要剥 |
| `koi-pond-ripples` | ink | L2 | `public/ascii-magic/pieces/koi-pond-ripples.js` | 7,151 | 字符栅格 | 能 | 网格锁 92×34；依赖 `lib/kit.js`（10,772） |
| `moonlit-sea` | tide | L2 | `public/ascii-magic/pieces/moonlit-sea.js` | 3,000 | 字符栅格 | 能 | 96×36；带 palette，可整片换色 |
| `wind-grass` | field | L2 | `public/ascii-magic/pieces/wind-grass.js` | 3,262 | 字符栅格 | 能 | 同上 |
| `fireflies` | field | L2 | `public/ascii-magic/pieces/fireflies.js` | 3,761 | 字符栅格 | 能 | 同上 |
| `pond-ripples` | ink | L2 | `public/ascii-rest/pieces/pond-ripples.js` | 6,021 | 字符串 | 能 | 单色；64×20；无 `ground` → 透明可叠 |
| `aquarium` | tide | L2 | `public/ascii-rest/pieces/aquarium.js` | 6,003 | 字符串 | 能 | 单色；60×20；**自带 `┌─│` 画框**，嵌进页面会像 UI 窗口 |
| `jellyfish` | tide | L2 | `public/ascii-rest/pieces/jellyfish.js` | 7,605 | 字符串 | 能 | 单色 |
| `rain`（像素版） | tide, room | L2 | `src/generated/vendor/pixelfx/fx/weather/rain.js` | 7,142 | 帧缓冲 320×180 | 能（ImageData 桥） | 必须扣掉 `_lib.js`（14,751）的成本；尺寸锁 320×180 |
| `god-rays`（像素版） | room | L2 | `src/generated/vendor/pixelfx/fx/weather/god-rays.js` | 5,344 | 帧缓冲 320×180 | 能 | 同上；这是全仓最贴"晨光"的一件 |
| `fog`（像素版） | room, field | L2 | `src/generated/vendor/pixelfx/fx/weather/fog.js` | 4,719 | 帧缓冲 320×180 | 能 | 同上 |
| `shooting-stars` | room, field | L2 | `src/generated/vendor/animata/background/shooting-stars.tsx` | 7,847 | DOM + CSS | 否 | 是 DOM 节点 + `@keyframes`，**不是 canvas**，只能当独立 DOM 层 |

（pixelfx `fx/weather/` 全家 13 个：`_lib.js` 14,751 / `aurora.js` 8,025 / `blizzard.js` 5,471 / `cherry-blossoms.js` 5,654 / `clouds.js` 5,370 / `falling-leaves.js` 6,755 / `fireflies.js` 5,751 / `fog.js` 4,719 / `god-rays.js` 5,344 / `rain.js` 7,142 / `shooting-stars.js` 6,319 / `snow.js` 6,142 / `storm.js` 18,149。）

### L4 后处理

| 零件 id | biome | 层 | portal 源路径 | 字节 | 形态 | 进 canvas2d | 复合风险 |
|---|---|---|---|---|---|---|---|
| `pixel-post`（自建） | 全 | L4 | 基于 `pixelfx/core/fx.js` + `fx/transitions/_lib.js` | 5,107 + 8,190 | 帧缓冲 | 能 | 见 §A 说明书：**没有现成 grain/vignette/scanline 文件**，要用 `field()`+`pixels()` 自己写 |
| `FilmGrain` | 全 | L4 | `public/shaders/runtime/shaders.js`（整包） | 2,594,656（整包；单组件未知） | WebGPU | 否 | 见结论 3 |
| `Vignette` | 全 | L4 | 同上 | 同上 | WebGPU | 否 | 同上 |
| `Halftone` / `Dither` | ink, field | L4 | 同上 | 同上 | WebGPU | 否 | **本轮无消费者**——产品已裁定 `/koi-pond` 不要半调网点（`dither` 从未执行、已删），见 `PRODUCT-FORM §1.4` |

---

## 结论 1：每个 biome 最少需要哪几件

「现有」= 已完成或已在做；**当前实况：`shared/parts/` 7 个正式零件，`shared/parts-library/` 63 个文件**。以下表格里的"现有/自写"是施工前口径，**✅ 行才是现状**；「提取」= 从 portal 直接拿；「自写」= 仓库里没有，必须写。

### tide `/still` — 3 件

| 层 | 零件 | 状态 |
|---|---|---|
| L0 底材 | 深水色阶 + 焦散 | ✅ **`tide-medium` 已实现**；定稿为 `glow`（连续上亮下暗 + 雾 + 微粒，**无圆斑、无焦散**，`tide-visual` 2/2）。施工前估算：自写约 60 行，噪声用 `tileFbm`（现成） |
| L1 世界 | —— | ✅ **`voxel-world` 已实现**（按 webgpu 能力在场；无能力时记 unsupported）。施工前写「省略（没有水下 3D，硬做会假）」 |
| L2 生态 | `bubbles` | **现有** |
| L3 交互 | `blow-input` | ✅ **不装**（已裁决）：`/still` 是零动作站，用 pointer 连续场，装了就违反界说。施工前写「现有（本地）」 |
| L4 后处理 | `pixel-post` | **现有** |

✅ **现状：三个 L0/L1/L4 零件均已装配，L3 不装；新增工作量为 0。** 施工前原文：新增工作量 = 1 个底材。若还想加"有东西在游"，加 `aquarium` 或 `jellyfish` 会把画面语言拉到"ASCII 水族箱"，**二选一，不要叠**。

### field `/hug` — 3 件

| 层 | 零件 | 状态 |
|---|---|---|
| L0 底材 | 暖色纸/草底 + 斜射光 | ✅ **`field-ground` 已完成**（施工前估算：自写约 40 行） |
| L1 世界 | —— | **省略** |
| L2 生态 | `boids` | **现有** |
| L3 交互 | `blow-input` | **现有**（本地） |
| L4 后处理 | `pixel-post` | **现有** |

✅ **现状：L0 `field-ground` 已完成，新增工作量为 0**（`boids` / `dandelion` / `blow-input` / `pixel-post` 均已装配）。施工前原文：新增工作量 = 1 个底材。`boids` 在这层是"飞虫/鸟群"，不是"鸟群演示"，必须把 `count=120` 往下调、把光标斥力调小（参数见 §B）。**不要**再叠 `wind-grass`——两套自走实体抢同一层注意力，画面会脏。

### room `/license` — 2 件

| 层 | 零件 | 状态 |
|---|---|---|
| L0 底材 | `paper-ink` 的纸底部分 | ✅ **已完成**（施工前标「现有（在建）」） |
| L1 世界 | —— | 省略 |
| L2 生态 | —— | **省略（这一层在 room 里是负资产）** |
| L3 交互 | —— | ✅ **仪式在站内 DOM**（`ritual.ts` / `stay.ts` / `fold.ts`），不是"纸本身响应指针"；与 `PRODUCT-FORM §1.1` 对齐 |
| L4 后处理 | `pixel-post`（只开 grain + 极轻 vignette） | **现有** |

✅ **现状：非 0**——`paper-ink` + `pixel-post` 两件零件之外，站内还有仪式 / 停留代码（`stay.ts` + `fold.ts`，wc -l 相加 ≤60 行）。施工前原文：新增工作量 = **0**，这是四个 biome 里最省的。晨光本身用 canvas 线性渐变 + `fbm` 镂空光斑就够，未引 `god-rays`。

### ink `/koi-pond` — 2–3 件

| 层 | 零件 | 状态 |
|---|---|---|
| L0 底材 | `paper-ink`（纸 + 描边） | **现有** |
| L1 世界 | —— | 省略 |
| L2 生态 | ✅ **`ascii-field` 已实现**（76×28 字符栅格，δ∈{2,3,4} 轮转，斜向流动；`koi-pond-ripples` 92×34 提取方案未采用） |
| L3 交互 | 指针 → 墨在水中扩散 | ✅ **站内已实现，约 60 行**（施工前估算 30 行；一个位移场 + 迭代模糊） |
| L4 后处理 | `pixel-post` | ✅ **已实现（宣纸 grain，无抖动）**——`dither` 从未执行、已删 |

✅ **现状：整站 ASCII 墨，无风格二选一问题**（矢量墨方案未采用）。施工前原文：若不用 ASCII 鱼，ink 只要 2 件；`koi-pond-ripples` 的 92×34 栅格叠在 SVG 描边上会风格打架——要么整站 ASCII 墨、要么整站矢量墨。

### 汇总

| biome | L0 | L1 | L2 | L3 | L4 | 需自写 |
|---|---|---|---|---|---|---|
| tide | `tide-medium` ✅ | `voxel-world` ✅（按能力） | `bubbles` ✅ | **不装** | `pixel-post` ✅ | 0（均已实现） |
| field | `field-ground` ✅ | — | `boids` ✅ + `dandelion` ✅ | `blow-input` ✅ | `pixel-post` ✅ | 0 |
| room | `paper-ink` ✅ | — | — | 仪式在站内 DOM ✅ | `pixel-post` ✅ | 0（零件），站内 ≤165 行 |
| ink | `paper-ink` ✅（满幅、无边界、无台面） | — | `ascii-field` ✅（76×28，δ 轮转） | 墨扩散（站内 ~60 行）✅ | `pixel-post` ✅（无抖动） | 0 |

---

## 结论 3：shaders 200 件与 WebGPU 的实际约束

### 先纠正一个前提

**没有任何一件"必须独占一个 WebGPU 上下文"。** 实证在 `public/shaders/playground.html`（5,820 B）原文：

```js
shader = await createShader(canvas, {
  components: [
    { type: 'Aurora',        id: 'aurora',  props: { colorA:'#070b2a', colorB:'#16e0ff', colorC:'#9b5cff',
                                                    intensity:82, speed:6, waviness:72, height:155, seed:17 } },
    { type: 'CursorRipples', id: 'ripples', props: {} },
    { type: 'FilmGrain',     id: 'grain',   props: {} },
  ]
})
```

三个组件挂在**同一个 canvas、同一个上下文**上，页面上还明写着 "Aurora and cursor ripples are layered on one canvas"。所以"整场只有一个 GL 通道"这个约束**不是障碍——它就是设计用法**：一个 `createShader` 里塞 N 个 component，按数组顺序叠。

另外封面目录里有 **`Group.jpg`（2,043 B）** 和 **`KeyFrames.jpg`（37,724 B）** 两张，说明这套库自带"分组嵌套"和"关键帧编排"两个容器组件——这也是"可叠"的旁证（**推断**：`Group` 用于把若干组件当一层合成；我没读到源码，只看到封面名）。

### 数量分布（按组件名归类，**估算**，不是库自带分类）

`public/shaders/covers/` 精确 **200** 个封面文件（逐项计数），即 200 个组件。按名字粗分成六类：

| 类别 | 大致占比 | 代表 | 在我们体系里的位置 |
|---|---|---|---|
| 后处理 / 滤镜（吃下层画面） | ~27% | Blur, AngularBlur, Vignette, FilmGrain, Halftone, Dither, Duotone, Saturation, ChromaticAberration, Pixelate, Glitch, VHS, LensFlare, LightLeak, DisplacementMap | **L4**，替代 `pixel-post` |
| 生成器（自带整幅画面，通常不透明） | ~25% | Aurora, MeshGradient, Plasma, Nebula, Water, Smoke, Voronoi, Truchet, Marble, Paper, Boids, ParticleField | **L0/L1**，站点底色 |
| 形状 / 遮罩 | ~10% | Circle, Ellipse, Ring, Star, Polygon, RoundedRect, Heart, Flower, Teardrop | L0/L4，做光斑/窗形 |
| 转场 / 擦除（时间驱动的一次性） | ~6% | BarnDoors, CheckerWipe, IrisWipe, LinearWipe, PagePeel, VenetianBlinds | 路由切换，不属于 biome |
| 噪声基元 | ~7% | BlueNoise, PerlinNoise, SimplexNoise, WorleyNoise, FractalNoise, GaborNoise, CurlNoise | L4 材料 |
| 输入 / 容器 / 交互 | ~7% | Group, KeyFrames, SolidColor, Text, ImageTexture, VideoTexture, WebcamTexture, CursorRipples, CursorTrail, MagneticFilings, ReactionDiffusion | 装配件 |
| 混合型 / 难归类 | ~18% | Form3D, Surface3D, Voxels, IsometricCubes, GlassTiles, FlutedGlass, Hologram | 逐件判断 |

**"能塞进我们自己的全屏 quad"这个问法要改。** 这 200 件不是可摘的 `.wgsl` 片段——它们是 JS 类，各自带 uniform 声明、pipeline 与 props 归一化，**全部打包在 `public/shaders/runtime/shaders.js` 一个 2,594,656 B 的文件里**，无法按组件 tree-shake（**估算**：这是单 bundle，没有独立模块边界）。能叠，但不能"摘一片"。

### 真正的约束是这四条

1. **只有 WebGPU，没有 WebGL2 回退。** `playground.html` 是两道门：`if (!('gpu' in navigator)) showFallback()` 和 `isWebGPUSupported()`，两者任一为假就整块换成一张 JPG 封面。**没有 `requires: ['webgpu']` 这种零件元数据**——这个字段在 portal 的零件清单里，不在这套库里。
2. **2.59 MB 单文件。** 要么走 `esm.sh/shaders@4.0.7`（playground 的做法，外网依赖），要么把 2.59 MB 塞进产物。**估算**：gzip 后 ~600 KB，对"情绪页面"是可接受的，但必须是**全站一个实例**共享。
3. **组件顺序 = 合成顺序**，后加的盖前面的。这决定了它不能和我们的 canvas2d 层自由穿插——只能是"我画完，交给它一层"或"它画完，我 `drawImage` 上来"。
4. **不透明的生成器会毁掉下层。** `Aurora` 有 `colorA/colorB/colorC` 且铺满整帧（**从 props 与页面上它与 ripples 同挂推断**），`MeshGradient` 同理。后处理件（`FilmGrain`/`Vignette`/`Halftone`）才是能安全叠的。

### 给四个 biome 的建议

- **tide**：唯一值得为它引 WebGPU 的是 `Water`。但如果 canvas2d 底材已经能做出焦散，就别引——为了一个背景把 600 KB + WebGPU 门槛押上去不划算。
- **field / room / ink**：**一件都不用**。`FilmGrain` 用我们自己的 20 行 grain 就够（还能和 canvas2d 同管线）。
- 如果将来要做 WebGPU 站点，正确姿势是：**全站一个 `<canvas>` + 一次 `createShader`，`components` 数组按路由换**，而不是每个 biome 建一个。

---

## 结论 4：看起来能用、实际是坑的

按"会返工"的严重程度排。

| # | 名字 | 坑 | 改哪一处 |
|---|---|---|---|
| 1 | `public/showcases/*`（rain 等） | 名字像"粒子雨零件"，实际是**预构建 Vite bundle**：`<script type="module" crossorigin src="./assets/index-BbXOYgkq.js">`，还外挂 7.6 / 12.4 / 17.5 MB 的 `.glb` | 整块嵌入都不划算。别碰 |
| 2 | `src/generated/vendor/threeui/koi-studies/KoiStudies.tsx` | 看着是"锦鲤组件"，实际是 **`<iframe src="/synthralaos-halftone.html">`** | 一个 iframe 外壳，零可提取物 |
| 3 | `src/generated/vendor/threeui/landscape/LandscapeScene.tsx` | 同上，`<iframe src="/landscape.html?variant=...">` | 同上 |
| 4 | `ascii-rest` 的 `meta.ground` | `mount.js`：`if (ground) ctx.fillStyle = ground; fillRect(0,0,w,h)` → **整块不透明铺底，毁掉下层** | 拷贝 piece 后把 `ground` 删掉，或在我们自己渲染时忽略它 |
| 5 | `ascii-magic` 的 `play()` | 会 `pre.style.display = "none"` 并在 `<pre>` **后面 append 一个新 canvas**，尺寸由 `fontSize × cols` 推出 | 别用 `play()`；直接用 `mod.default()` 拿 `g.frame()`，自己画。要用它的画布就 `drawImage(它的canvas, ...)` |
| 6 | `boids` 的 `ctx.fillStyle = background + 'dd'` | 87% 透明抹除靠**字符串拼接**。`background` 是 6 位 hex 才成立，传 `rgba()` / `hsl()` 会拼出非法色，浏览器静默忽略 → 拖尾变成不消失 | 要么强制 6 位 hex，要么改成 `ctx.globalAlpha = 0.87; fillRect(...)` |
| 7 | `boids` 的 `MAX_SPEED = 1.8` | 单位是**像素/帧**，全段无 dt。120Hz 屏上速度翻倍，切标签页回来会瞬移 | 3 处改 `dtScale = clamp(dt,0,0.05)*60`：位置积分、朝向积分、（**不要**改 trail 的 `'dd'`） |
| 8 | pixelfx 的 `W = 320, H = 180` | 硬编码在 `fx/transitions/_lib.js` 模块顶部，不是参数 | 想换尺寸只能改常量，且所有 `fx/*` 的构图假设都基于它 |
| 9 | pixelfx 没有"后处理文件" | 247 个 fx 文件里**没有** grain / vignette / scanline / noise | 用 `field(fn,gmin,gmax)` + `pixels(p)` 自己写，别去文件树里找 |
| 10 | `ink` 的 `toSvg()` | 输出是 **SVG 字符串**，进 canvas 只能 `new Image()` + `blob:` URL（异步，逐帧不可行）或 `Path2D`（要自己解析 `parts[].d`） | 静态底材走 Image 一次性贴；动态走 Path2D；别指望逐帧重生成 |
| 11 | `ink` 的 `misreg` | 不在 `builder.ts`（只接收 knobs 不读），不在 `pen.ts`（完全没有）；真正生效在 `fills.ts` 的 `misreg()` | 找错文件会以为参数失效 |
| 12 | `orbit-globe` 的 `SECONDS_PER_REVOLUTION = 100` | 一圈 100 秒，当作 hero 会显得卡住 | 要么改常量，要么用 `signal` 外部驱动时间 |
| 13 | `shooting-stars` | 名字像 canvas 粒子，实际是 **DOM 节点 + `@keyframes`**（`ss-twinkle` / `ss-shoot`） | 只能当独立 DOM 层，不能混进我们的 canvas 管线 |
| 14 | `aquarium`（ascii-rest） | 自带 `┌─┐│└─┘` 玻璃柜画框，直接用会像嵌了个终端窗口 | 拷走后把首末行与外框列去掉，或当"真的水族箱"用（那就别去掉） |

---

## 我没读到的 / 无法确认的

按影响排序，避免下游误以为已核实。

1. **`public/shaders/runtime/shaders.js`（2,594,656 B）我只读到大小，没读内容。** 200 个组件的清单来自 `public/shaders/covers/` 的 200 个封面文件名（逐项计数），**不是**源码里的导出表——两者应当一一对应，但我没有验证。
2. **组件"是否吃下层画面"是推断。** 依据是 `playground.html` 把 `Aurora + CursorRipples + FilmGrain` 叠在一个 canvas 上；单组件源码（uniform 里有没有 `u_back` / `u_texture` 之类的输入）我没看。
3. **`public/ascii-magic/lib/kit.js`（10,772 B）没读。** `palette()` 的返回结构（数组？看起来可被字符索引的对象？）是我从 `moonlit-sea.js` 的 `palette[key]` 用法和 `player.js` 的 `palette[key]` 反推的，不是读定义得来的。
4. **ascii-rest 250 件的配色情况只抽查了 2 件**（`pond-ripples`、`aquarium`），两件都没有 `meta.palette`。**不能推广成"250 件全单色"**——`mount.js` 里明确有 `color` 通道，说明至少有些件是带 palette 的。
5. **`public/ascii-rest/library.js`（14,830 B）、`mount.js` 以外的 `ascii-art.js`（3,450 B）、`banner.js`（33,904 B）没读。** 因此 `public/ascii-rest/fonts/ascii-rest-mono.woff2`（2,956 B）到底被谁引用、是不是必需，我不确定。
6. **`public/ascii-magic/lib/scene.js`（26,024 B）与 `lib/image.js`（7,499 B）没读。** 若 `scene.js` 里有"整场布景"能力，可能会改变 L0 的结论。
7. **`public/blocx` 下 6 个目录只核对了 `orbit-globe` 这一路**（caremetric-footer / contact-form / orbit-hero / partylabs-hero / smart-pricing / storybook-hero）。其余 5 个我只知道目录名，**没确认里面是不是 3D**。
8. **两个 44 KB 的异常大件没查**：`public/ascii-magic/pieces/ocean-sunset.js`（44,062 B）、`temple-sunset.js`（44,009 B）、`starry-ridge.js`（44,096 B）。同目录其它件是 3–8 KB，这三件大 6 倍，**疑似内嵌了预计算数据或字模**——我没读，所以也没推荐它们。
9. **没有 clone。** "路径能在 clone 里 ls 到"是通过 GitHub Contents API 的目录列举逐项验证的（返回里带 `name/size/type`），不是本地 `ls`。字节数同源。
10. **gzip 折算全部是估算**（沿用上一份说明书的 ~4.2–4.8 倍），只有 `shaders` 那 2.59 MB 的 ~600 KB 是我按包体量粗估的，误差可能很大。
