# 交接书 — 情绪价值单页站 · 零件装配体系

> 写于 2026-11-24。读者是**接手的另一个 agent**：先读 `DECISIONS.md` 与本文，再动任何文件；本文每条「不可违反」都有人在上面栽过。
> 上一版（2026-11-22）归档在 [`archive/2026-11-24/HANDOFF-2026-11-22.md`](./archive/2026-11-24/HANDOFF-2026-11-22.md)。
> 当前健康度与调整依据：[`review-2026-11-24/REVIEW-2026-11-24.md`](./review-2026-11-24/REVIEW-2026-11-24.md)。结构数字只看 [`STATUS.md`](./STATUS.md)，本文不重抄。

## 0. 一句话现状

- 装配运行时（`shared/stage/`）完工并有门锁着；登记 **17 件零件（16 件在 `shared/parts/`）· 18 个预设 · 4 个站 · 5 套模板**（复算：`node tools/docs/status.mjs`）。
- **评审基线（2026-11-24）**：四站没有一站按自己的成立判据全绿——`/license` 桌面走通「打开 → 看懂 → 停留 → 带走」；`/hug` 点草地放飞后不给链接；`/koi` 没有带走物；`/still` 遮罩 17.8 s、手机画面只画左上角。
- **2026-11-25 施工进展**：`/license` 手机排版与保存反馈、`/hug` 因果/链接、`/still` 首帧与 `Sit` 后 40s 带走文本、`/koi` 首帧分期与 40s `Keep this frame` PNG、四站门厅、A2 导出/体积/画质/调试条均已落地；仍以 `verify:dom` 与真机手测为准，CI 尚未在 GitHub 实跑。
- 完整结论、6 个体验阻断、6 个架构根因见评审 §0 / §3 / §4.2。

## 1. 产品前提（已由用户拍板，**不要重新讨论**）

用户原话要点（2026-11-18）：

- 「不要做站群了，做**单域名的链接访问**即可」
- 「我要你爬下来的代码**不用管 LICENSE**」
- 「你现在是做**组合，多种效果叠加**，呈现出我们所设计产品需要的情绪价值网站，应该是和原代码有极大差异的」
- 「把刚才这些组件全部抽象成零件，包括我的 flaxb 项目里的各类 component 和 showcase」
- 「这些零件进行装配到我们网站上需要呈现多种多样的效果，需要能够**复合装配**」

据此已定、不再动摇的四条：

| # | 决策 | 内容 |
|---|---|---|
| 1 | 单站形态 | 不做站群，单域名下按路径分站（`/hug` `/license` `/koi-pond` `/still`） |
| 2 | 不管许可 | 上游代码随便搬。**但仍要记来源路径**（不是为了合规，是为了下一个人能找回去） |
| 3 | 卖点是叠加 | 零件必须能**复合**：分层 + 混合模式 + 后处理链。不是「一个页面一个特效」 |
| 4 | 四 biome 四样板 | `tide`→`/still` · `field`→`/hug` · `room`→`/license` · `ink`→`/koi-pond`，各做一站样板。体素引擎上，4/4 biome 都保 |

**已经作废、不要复活的东西**（上一轮的方向，用户已推翻）：D0–D4 复用深度分档、门 1–10 溯源门、license L1–L4 普查、参数搬运率、算法覆盖门、depth pin、baseline signoff。`docs/ARCHITECTURE-REUSE.md` 与 `docs/PRD-REUSE.md` 是那套体系的遗产，**只当历史档案看**，别按它施工；其中仍有价值的是 `shared/parts-library/dandelion/core/meadow.ts` 与 `blow-input/core/detector.ts` 这两个**真算法移植**（见 §6；两份遗产文档的内容冻结见 [`docs/README.md`](./README.md) 冻结区）。

## 2. 装配模型（整个工程的地基）

### 2.1 六层

| 层 | 语义 | 当前谁在这里 |
|---|---|---|
| `L0` | 底材（纸 / 水 / 草 / 雾） | `abyss` · `field-ground` · `paper-ink` · `tide-medium` |
| `L1` | 世界 | `voxel-world`(gl) · `nebula`(gl) · `temple`(gl) · `koi-pond`(world) · `hug-meadow`(world) |
| `L2` | 生态（自走实体） | `ascii-field` · `boids` · `bubbles` · `dandelion` |
| `L3` | 交互 / 氛围 | `still-sink` · `sun` |
| `L4` | 后处理（整场唯一） | `pixel-post` |
| `L5` | UI（文字 / 指引 / 调试） | DOM 版：`shared/sites/shell.ts`；文案单一来源 `shared/sites/copy.mjs` |

> **L5 的 z 序（`/license` 在用，改层级前先读）**：`#sheet`/`#fold-flap`(z1) < `#sun`(z2) < `#cert`/`#seal`(z3) < `#stage-word`/`#play-hint`/`#save`(z4) < `#boot-error`(z7)。
> 纸框与折角**必须在光层之下**：折角要吃到同一束阴影，放到光之上会变成一块亮斑。
> **通道字段**：`glBlend` = GL 层合成时的 `globalCompositeOperation`（白名单，见 `contract.ts`）；`ctaChannel` = 站点 CTA 属于 `ui` 还是 `world-inject`（四站合计只允许 `/hug` 一处 world-inject）；`data-channel` = 每个 L5 控件的通道标注。

### 2.2 三条硬约束（违反即装配失败）

1. **零件之间不许互相调用。** 唯一共享状态是 `WorldFrame`（只读）。要复合就靠层叠加 + `globalCompositeOperation`，不靠耦合。
2. **L4 整场唯一，`gl` / `world` 通道整场唯一。** 两条后处理链会互相抹掉像素；两个 WebGL/WebGPU 上下文会互抢。违反分别抛 `E_MULTI_POST` / `E_MULTI_GL`（`shared/stage/stage.ts:158-167`）。
3. **`blend` 走白名单**（`BLEND_MODES`，`shared/stage/contract.ts:81`）：禁 `copy` / `destination-in`，它们会清空整块画布。

### 2.3 运行时语义（已实现且被断言锁死，改之前先看测试）

- 层序 `L0→L5` 固定；层内 `z` 升序，`z` 同值按 `id` 字典序（`sortParts`，`stage.ts:189`）。
- **超预算只 `setLod('low')`，不跳过 `draw`** —— 缺块比掉帧更难看。
- 降档后仍超 → 按 `costMs` 降序**只挂起 `expendable: true` 的**（`planBudget`）。L1 零件当前都申报 `expendable: false`。
- 零件运行期抛错 → **就地隔离**（记 `broken`、进 `degraded[]`、不再调用），不拖垮整场；自报 `E_UNSUPPORTED` 记成 `unsupported`，不算抛错。
- `stage` **从不 `clearRect`**：整幅画面靠一件不透明底件每帧铺满；L0/L1 全空会在构造期抛 `E_NO_BASE`。
- 同 `seed` 必须逐帧确定（`mulberry32` + `hashSeed`）；`dispose` 逆序且幂等。

### 2.4 三条从事故里长出来的硬规则（都有门锁着）

| # | 规则 | 为什么（真实事故） | 谁在守 |
|---|---|---|---|
| 1 | **有零件的测试，每帧 `draw` 之后必须断言 `stage.degraded.length === 0`** | 假 ctx 缺 `clip` → 零件每帧抛错被隔离 → **画到一半就停**，而「3 次 fill / 3 次 stroke」的计数断言反而"恰好"成立 → 15/15 绿，零件坏了两轮。静默失效是这个仓库最贵的失败模式 | `tests/parts-composition.mjs:125,136`、`tests/preview-build.mjs:369` |
| 2 | **L5 目前只有 DOM 一种实现**（`shared/sites/shell.ts`）。若将来必须做 canvas-L5，它的 `draw()` 必须每帧无条件执行 | 层序只保证绘制顺序，保证不了"没重绘还在"；只在变化时重绘的 canvas 层会被整幅覆盖 | 四站 L5 走 DOM；当前无 canvas-L5 零件 |
| 3 | **输入边界成对**：① 世界只接收画布上的指针（`event.target !== canvas` 一律不转发）；② UI 要引起世界变化由站点**显式** `stage.setPointer`（宿主提供 `__preview.tap()`）；③ `pointerup` 不过滤且总是释放；④ 模态期间画布上的指针也不转发 | 宿主原先无条件转发 window 的 `pointerdown` → 点 Esc 菜单按钮让世界同帧收到按下。`/hug` 的 `ready→drifting→away` 不可逆，一次「想关静音」就毁掉仪式。零件只读 `frame.pointer`，**无从防御** | `tests/input-boundary.mjs`（真实 Chromium，预览宿主 + 上线壳各跑一遍） |

> 断言必须**成对**：只测「菜单点击不许进世界」的话，把转发整个关掉也能绿 —— 那只证明"不误吃"，证明不了"按钮还能用"。
> 且必须在两个宿主上各跑一遍：`shared/stage/preview/host.ts`（预览）与 `shared/sites/shell.ts`（上线）是两个独立实现，同一个 bug 在壳里复发就等于没修。

### 2.5 阈值必须标注「地板」还是「目标」

**从失败样本只能反推出地板，推不出目标。** 这是 2026-11-18 一次真实误判换来的规则：

- `1.32 L*` 判失败 → 反推出「地板 = 6 L*」（能区分有无）
- `16.59 L*` / R² 0.925 → 第一个"眼睛认了"的版本 = **工作点**

所以：**每个阈值都要标注它是地板还是目标，并写出工作点。** 只有地板而没有工作点的门，会奖励"刚好过线"的实现。工作点会随对象变，要在**目标对象上**逼近，不能跨对象搬。

### 2.6 门自己也会撒谎

> **总纲一：判据的算法里，应当出现它要排除的那个变量。**
> **总纲二：新判据落地前，必须与全部已有硬判据做一次互检。**
> 冲突时以更早、更根本的那条为准；测不了的判据删掉，别留着当仪式。

修法一句话：相对背景阈值 = 把**背景**写进算法；去趋势（40px 高通）= 把**光平面**写进算法；HSV 而非 HSL = 把"要纯度还是明度"写进算法；与颜色无关的"上半幅必须平滑" = 把**配色**排除在判据之外。

**每条门都要能回答三个问题**：① 它现在还在验什么？② 把它验的东西弄坏，它会不会红（每个门至少一条变异/阴性对照）？③ 它依赖的前提，在测试环境里成立吗（`dpr=1` 抹平过 CSS/设备像素的区分，`getContext` 语义写反过，`navigator.gpu:false` 抹平过 WebGPU 分支）？

> **口径没钉死，数字就不是证据。** 同一张 `/hug`，HSV 饱和度 0.472 与 HSL 饱和度 0.315 都"有依据"，差的 0.157 说不清。现在钉死：饱和度一律用 HSV S（`MANUAL-QA §8`）。**任何给出去的数字必须同时给出算法。**

### 2.7 「会腐化的结构」清单（每项都要有到期日）

| 结构 | 为什么会腐化 | 触发条件 |
|---|---|---|
| `tests/preview-build.mjs` 的断言数 ≈ 5 × 预设数（现 18 个预设 → 811 条） | 每个预设跑同一组 5 类断言，一次失败刷一屏 | **预设 ≥20** 时改成「按预设分组汇总 + 失败只列组名与首条」（已写进 `shared/stage/preview/build.mjs:23-27`） |
| `tests/lib/browser.mjs` 的 `waitForPreview` 只认 `__preview` / `__site` 两个句柄 | 加第三个宿主时会又只认前两个 | **出现第三个宿主**时改成注册式（`registerSnapshotProvider(name, fn)`） |
| 假 ctx（`tests/lib/fake-ctx.mjs`） | 真 ctx 多一个方法就可能漏（已连发三次：`clip`/`strokeRect`/`rect`） | 已用 `guardCtx` 的 Proxy 兜底（§2.9）；再漏就是新问题 |

### 2.8 豁免要能自我失效（`part-clock` 的模式，值得复用）

`tests/part-clock.mjs` 扫「零件不许持有自己的时钟」。处置不是"放宽规则"，而是**带理由的豁免清单 + 清单会自己失效**：

- 每条豁免必须写 `why`（当前只有 `voxel-world/index.ts` 的 boot 遥测一条）。
- **若某个豁免一次都没命中，门报「豁免已失效」** —— 代码改了/删了而豁免留着，等于开了个后门。
- 门自带**变异自检**：喂一段故意违规的示例给同一个扫描器，必须命中（防"扫了空目录 / 正则写错 / 永远 0 命中"）。

> **注释不会自己失效，清单会。** 任何"允许违规"的机制都该长成这个形状。

### 2.9 假 ctx 用 Proxy 兜底（手写假 ctx 漏方法是**结构性**问题）

`tests/lib/fake-ctx.mjs` 的 `guardCtx(base)` 用 Proxy 包住手写假 ctx：

- 访问**没实现**的方法 → 记录方法名 + **抛错并喊出名字**（不是吞成 `undefined`：零件会继续跑、只少画几笔，测试全绿而画面错）。
- 测试收尾断言「未实现方法清单为空」。
- 已接入 `parts-composition`、`preview-build` 与多个零件 bench。变异验证：删掉假 ctx 的 `clip` → 立刻红。

## 3. 怎么跑

| 命令 | 做什么 | 备注 |
|---|---|---|
| `npm install` | 装依赖（`three` + `esbuild` / `tsx` / `typescript`） | 唯一需要联网的一步 |
| `npx tsc --noEmit` | 类型检查 | 应 0 error |
| `npm run verify:stage` | 44 断言 + 6 变异 + 22 接合 | ⚠️ `tests/stage-mutation.mjs` **原地改写** `shared/stage/stage.ts` 6 次后还原；有人并发施工时不要跑 |
| `npm run verify:preview` | 811 断言（逐预设） | 只读，不写 `dist/` |
| `npm run verify:sites` | 119 断言（屏幕文字必须在 COPY/UI 里） | 只读 |
| `npm run verify:core` | 11 个基线文件零改动 | 只读 |
| `npm run verify:nexus` / `verify:nexus:full` | 注册表 / 零写入 / 组合 / 降级 / ESM / analytics | 只读 |
| `npm run docs:status` | 重新生成 [`STATUS.md`](./STATUS.md) | 幂等；结构数字的唯一出处 |
| `npm run build:sites` | 四站 → `dist/<slug>/index.html` + `dist/index.html` | 写 `dist/`（已 gitignore） |
| `npm run build:templates` / `build:studio` | 5 套模板 / Studio | 写 `dist/templates/`、`dist/studio/` |
| `npm run serve` | `127.0.0.1:8080`，只绑本机 | 演示入口 `http://127.0.0.1:8080/` |
| `node tools/parts/atlas.mjs` | 生成 `PART-ATLAS.csv` | 写 docs |

**本机（Windows 11）跑不了的**：所有依赖 `tests/lib/browser.mjs` 的门与 bench —— 它只认 macOS 的 playwright 缓存路径。包括 `verify:dom`、`verify:fingerprint`、`verify:license`、`verify:input`、`verify:field`、`verify:paper`、`verify:site`、`shot`、`bench:parts`、`bench:gl`、`bench:blend`。
**取证替代**：用评审目录的零依赖 CDP 驱动 `docs/review-2026-11-24/tools/cdp.mjs`（无头 Edge）。
**两条已知红**：`verify:reuse`（本机 99 个文件 CRLF/混合行尾，声明字节 ≠ 磁盘字节；LF 副本里绿）、`verify:clock`（`shared/parts/dandelion/index.ts:291,337` 调 `performance.now()`）。

## 4. 四站与 A2 现状

四站由 `shared/sites/build.mjs` 的 `STATIONS` 注册；栈、预算、CTA 与产物路径见 [`STATUS.md`](./STATUS.md) §4。实机走查见 [`ux-sites/WALKTHROUGH.md`](./review-2026-11-24/ux-sites/WALKTHROUGH.md)。

**`/license`**（`paper-ink` + `pixel-post`，budget 8 ms）—— 桌面**唯一走通全链**的一站：打开 0.7 s / 57 fps，盖章仪式、编号、日期、红章、`Save it` 导出 1410×1000 都成立。阻断：手机 390 宽下盖章后宣言句压编号与日期、红章压宣言、`Save it` 压 `Stamp again`。一般问题：盖章 6.4 s 只有一个 12px 状态词在变、`Save it` 无完成反馈、二级文字对比度 2.5–2.9:1、手机提示 `f` 键。导出图与屏幕光照不一致（左半边暗 5.8–10.8 L*）。详见评审 §3.2 #4/#10。

**`/hug`**（`hug-meadow` 一件，budget 9 ms）—— 首屏 0.55 s / 57 fps，蒲公英会晃不会自己飞。阻断在前一步：**点草地放飞后没有任何带走物**（只有按钮/键盘路径写剪贴板）。严重：开 `Wind` 后环境噪音把蒲公英**不可逆全部放飞**（`hug-meadow/index.ts:478` 的 `audio.level > 0.12`，`mic.ts:105` 把 RMS 乘了 3）。详见评审 §3.2 #5/#6。

**`/still`**（`tide-medium` + `voxel-world` + `bubbles` + `still-sink` + `pixel-post`，budget 12 ms）—— 三个阻断独占：黑屏遮罩无文字、空闲 17.8 s 才淡出；手机/桌面 resize 后画面只画在左上角约 213×460；无 WebGPU 时静止渐变、`Sit` 无反应、无提示。空闲帧率 32、`renderScale 0.55`、`degraded`。这套 5 件栈只有站 `/still` 与预设 `still` 在用，**Sit 后 124 s 仍无带走物**。详见评审 §3.2 #1–#3 与 §4.2 的 R1/R2。

**`/koi`**（`paper-ink` + `koi-pond`，budget 12 ms）—— 首屏 4.3 s 全黑（主线程长任务 3.5 s + 6.8 s）；菜单 12 项、面板盖住画面 26%；**没有可聚焦元素**（菜单隐藏时 Tab 焦点一直在 body）。无带走物、无导出。`?style=ink/paint/real` 三档都通，real 档 `+cam=angle&rain=rain` 只有 4.1 fps。详见评审 §3.2 #9 与 `ux-sites/WALKTHROUGH.md` §2.4。

**A2 线**（`shared/product/` + `shared/stage/preview/` 的 `a2-*` 预设）—— 6 项 Must：模板数 5 套**达成**；全程序化 **3/5**（temple/gate 内含 12 张 base64 位图，占 gzip 95.3%）；体积预算检查器**未达成**（只有一行构建期静态文字，3.47 MB 照样 READY）；lil-gui 面板**部分**（Studio 25 个控件、无颜色选择器；模板内无面板；调试条直接给用户看）；单 HTML 导出**未达成**（Studio 无导出，「另存为」丢参数）；<1MB **部分**（deepsea 11.6 KB · nebula 135 KB · koi 161 KB ✓；temple/gate 各 3.47 MB）。调参靠整页重载 iframe。详见评审 §3.3、`ux-a2/WALKTHROUGH.md`。

### 4.1 `/license` 的「三处坑」（改这几处之前先读）

**折角（`f`）**：
1. **不许用 `#sheet{transform:rotate(var(--fold))}`**。`#sheet` 只是空 div + 1px 边框，转它的实际效果是**一条 1px 斜线划过整张纸、穿过正文**，纸本身没动。看得见的那一面必须是 `#fold-flap`（128px 三角 = 纸背 + 折痕投影）。
2. **`#fold-flap` 的 z-index 必须低于 `#sun`**（z1 对 z2）。放到光层之上，它吃不到同一束阴影，在一张被压暗的纸上变成一块亮斑（读作"角落漏光"）。
3. **必须半透明着色**。纸角的暗角是画布画的，刷不透明色等于把暗角抹掉 → 折角永远比周围亮。用 alpha 档位，让纸自己的明暗透上来。配套：`#cert-seal-sub` 宽度只能到 86%——纸角那 128px 是折角的地盘。

**拖光**：`soft-light` + `DRAG_RANGE=14` 时整纸像素差 mean 3.85 ≈ 世界噪声 3.24，肉眼分不出。现在是 `multiply` 阴影带（白=不改变纸面、深棕=阴影，转角度=把影子边界扫过纸面）+ `DRAG_RANGE=32` + `7px/°`：整纸 mean 10.2、>8 的像素 45%，噪声底 1.5。

**尺（`tests/license-stay.mjs` 的 F 段）**：先量**噪声底**（什么都不做连拍两帧），再比交互差异 —— 不比字节，世界自己每帧都在动。拖光看整纸 `mean` / `pctOver8`；折角只看纸角一块，**并要求纸的其余部分基本不动**（上一版那条划过正文的斜线正是被这条抓出来的）。截图必须 `scale:'css'`（页面 dpr=2，默认截图是设备像素，而 `getBoundingClientRect` 给 CSS 像素）。阈值是 `max(噪声×2.5, 绝对值下限)` —— 必须有绝对下限。

## 5. 后续路线

依据评审 §5；这里只列标题，改什么 / 改哪里 / 完成判定看原文。执行排期、里程碑与验收总表见 [`PLAN-2026-11-25.md`](./PLAN-2026-11-25.md)。

**P0（不做就不能给人看，10 条）**：① `/still` 画布尺寸只留一个责任人；② 就绪协议加进度 + 超时 + 可见文案；③ 状态单一真相源 `deriveState()`；④ `/hug` 零件只发意图、站点定因果（草地放飞也给链接、模态静音、Wind 首次提示）；⑤ 触屏常驻菜单 + `touch-action:none` + 禁页面缩放；⑥ `/license` 手机流式排版 + 保存反馈 + 折角按钮 + 对比度；⑦ 入口页从裸列表改成门厅；⑧ `/koi` 启动分期（纸面先出）；⑨ 验证安全（SKIP 非 0、变异在临时副本、dandelion 时钟改读 `frame.t`）；⑩ 浏览器驱动统一为零依赖 CDP。

**P1（下一个迭代）**：`/still` 的 `Sit` 40 s 后浮出文案 + Copy、世界生成分帧上报；`/hug` 补 ≥40 s 单向慢变量、菜单 About 与末行去重；`/license` 慢变量在像素上量得出、桌面首屏减一个文字元素；预算按实测帧时间逐件降档、`costMs` 注释与 ADR-05 对齐；行尾 `git add --renormalize .` 单独提交；CI 最小集；A2 导出内嵌参数 / 体积预警 / 不重载调参 / 画质三档 / 去掉调试条；5 个 npm script 停止指向 v1 构建器。

**P2（可排期）**：v1 归档（先废 `verify:reuse` 对 `ARCHITECTURE-REUSE.md` 的运行时解析，再移文档）；构建并成一条、README 状态表改脚本生成、补齐 8 个预设脚本；大二进制出仓或 LFS；孤儿零件与 9 个 WorldFeature 不新增装配投入；清重复（dandelion 渲染层、`dawn-desk/upstream/`）。

**三项已拍板（2026-11-25，按决策执行）**：

| # | 问题 | 决策 |
|---|---|---|
| 1 | `/still`、`/koi` 是否先从入口撤下 | **不撤**：四站全部 live，入口门厅四卡都在；不删源码、预设、模板 |
| 2 | A2 与四站：同仓分线 / 分仓 | **同仓、分线、分入口**，保住「同一套零件」；不搬 `shared/product/`，不改模板 import 路径 |
| 3 | `/koi`「不设带走入口」与成立判据③冲突 | **给 `/koi` 带走物**：40s 后 `Keep this frame`，保存当前帧 PNG |

**停止做的事**：停止继续拆第三方 3D、扩充 Portal 候选；停止给 `/still` 加视觉内容、给 `/koi` 加菜单项；停止给 A2 加新模板（导出 / 体积预警 / 实时调参未补齐前）；不要让 `costMs` 被 governor 自动回写；不要继续把 `renderScale` 压到 0.55 以下换帧率；不要先删 `shared/contract` 再处理 `verify:reuse` 的运行时解析；不要用全局 autocrlf 修行尾；不要为了修门去装 playwright。

## 6. 文件地图

```
shared/stage/              装配运行时（唯一入口 index.ts）+ preview/（单文件预览构建器 + 浏览器宿主）
shared/parts/              16 件 Stage 零件（含 4 件孤儿：ascii-field / boids / dandelion / sun）
shared/product/            模板注册表 templates.mjs + template-spec.ts + build-templates.mjs + studio.mjs
shared/sites/              上线壳 shell.ts + 站点构建器 build.mjs + serve.mjs + copy.mjs + mic.ts + audio.ts
shared/core/               体素引擎冻结基线（BASELINE.sha256 锁 11 个文件，一个字节都不许改）
shared/parts-library/      v1 零件与两份真算法内核（dandelion / blow-input，别删）
shared/contract/ shared/build/  v1 协议层与流水线（与新体系不通，待归档）
shared/realism/            A2 写实模块（materials / scene / roof …）
sites/{hug,license,still,koi}/  四站站内代码（attach / ritual / export / fold / stay）
sites/praise/              旧架构完整但冻结，不进构建
tests/                     全部门；tests/lib/ 是假 ctx、假画布、浏览器驱动
tools/                     docs/status.mjs（生成 STATUS.md）、parts/atlas.mjs（生成 PART-ATLAS.csv）
docs/                      文档；权威链见 docs/README.md
docs/review-2026-11-24/    当前评审与取证（含零依赖 CDP 驱动 tools/cdp.mjs）
docs/archive/              归档（2026-11-24 的上一版 HANDOFF、2026-11-pre-pivot 站群架构）
QUARANTINE.md              隔离台账（Q-01 已消解，Q-02 待裁）
dist/                      产物（gitignore，按需重建）
```

## 7. 给下一个 agent 的提醒

1. **别信「全绿」。** 写完测试后自己改坏一处看它会不会红；红不了就是没测到。本仓库最贵的失败是「绿着但东西是坏的」。
2. **别把估算当实测。** `costMs` 是**申报预算**，不是浏览器实测；Node 里假 ctx 测出来接近 0，真实成本全在 GPU 填充。改口径先改 ADR-05 与注释。
3. **别在没有浏览器证据的情况下说「效果很好」。** 本机（Windows）没有 playwright 时用 `docs/review-2026-11-24/tools/cdp.mjs`（无头 Edge + 原生 CDP）取证；不要为了修门去装 playwright。
4. **另一位 agent 可能共用同一个工作区。** 不确定的文件先 `git status` / `git diff` 看一眼；不要 `git add` / `commit` / `reset`，不要跑会原地改写源码或写 `dist/` 的命令。
5. **文档只留一个事实来源。** 结构数字写进 `STATUS.md`（脚本生成），其它文档链接过去；别再手抄零件数、预设数、断言数。
6. **先问「契约里有没有通道」，再问「功能需不需要」。** 零件 → 站点的反向通道一条都没有，这是刻意的；语义绑在 UI 上的交互只能由站点持有（完整推理见归档件附录 A.2）。
