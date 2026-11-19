# 交接书 — 情绪价值单页站 · 零件装配体系

> 写于 2026-11-18 17:10。读者是**接手的另一个 agent**。请先读完本文再动任何文件，本文里每一条「不可违反」都是有人在上面栽过的。

---

## 0. 一句话现状

**装配运行时已完工并验真；7 个正式零件已实现；四站壳与产物已接，`/license` 走通全链。**
仍缺：`boids` / `dandelion` / `blow-input` 三个零件；`/hug` `/still` `/koi` 的**站内逻辑未写**；`/praise` 是**旧架构冻结存量**——代码完整、typecheck 通过、零外链，但**未启用、不进构建**。
（2026-11-19 对齐后的真实现状；旧句"零件只到 2/6、四站一座都没接"已作废。）

---

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

**已经作废、不要复活的东西**（上一轮的方向，用户已推翻）：D0–D4 复用深度分档、门 1–10 溯源门、license L1–L4 普查、参数搬运率、算法覆盖门、depth pin、baseline signoff。`docs/ARCHITECTURE-REUSE.md` 与 `docs/PRD-REUSE.md` 是那套体系的遗产，**只当历史档案看**，别按它施工；其中仍有价值的是 `shared/parts-library/dandelion/core/meadow.ts` 与 `blow-input/core/detector.ts` 这两个**真算法移植**（见 §3.3）。

---

## 2. 装配模型（这是整个工程的地基）

### 2.1 六层

| 层 | 语义 | 谁在这里 |
|---|---|---|
| `L0` | 底材（纸 / 水 / 草 / 雾） | `field-ground` ✅ · `paper-ink` ✅ · 水底材 `tide-medium` ✅ |
| `L1` | 世界（3D） | `voxel-world` ✅（`channel: 'gl'`，整场唯一；`glBlend` 走白名单） |
| `L2` | 生态（自走实体） | `boids` ⬜ · `bubbles` ✅ · `dandelion` ⬜ · `ascii-field` ✅ |
| `L3` | 交互（输入驱动） | `blow-input` ⬜（v1 有 core，未改 PartV2） |
| `L4` | 后处理（整场唯一） | `pixel-post` ✅（暗角 + 扫描线 + 动能颗粒，每帧 1 次 blit） |
| `L5` | UI（文字 / 指引 / 调试） | ✅ **DOM 版**：文案单一来源 `shared/sites/copy.mjs`；`site-dom 80/80`（h1/hook/菜单/通道/注入计数/文案在纸内/CTA 可见可点） |

> **通道字段补注**（架构师指出上表原先缺这三样）：`glBlend` = GL 层合成时的 `globalCompositeOperation`（白名单，见 `contract.ts`）；
> `ctaChannel` = 站点 CTA 属于 `ui` 还是 `world-inject`（**四站合计只允许 `/hug` 一处 world-inject**，见 `site-dom`）；
> `data-channel` = 每个 L5 控件的通道标注（`ui` / `world-param` / `world-input` / `world-inject`）。

### 2.2 三条硬约束（违反即装配失败）

1. **零件之间不许互相调用。** 唯一共享状态是 `WorldFrame`（只读）。要复合就靠层叠加 + `globalCompositeOperation`，不靠耦合。
2. **L4 整场唯一**，`channel: 'gl'` 整场唯一。两条后处理链会互相抹掉像素；两个 WebGL/WebGPU 上下文会互抢。
3. **`blend` 走白名单**（`BLEND_MODES`，禁 `copy` / `destination-in`，它们会清空整块画布）。

### 2.3 运行时语义（已实现且被断言锁死，改之前先看测试）

- 层序 `L0→L5` 固定；层内 `z` 升序，`z` 同值按 `id` 字典序
- **超预算只 `setLod('low')`，不跳过 `draw`** —— 缺块比掉帧更难看
- 降档后仍超 → **只挂起 `expendable: true` 的**；`L1` 与 `L5` 一律不许把自己设成 expendable
- 零件运行期抛错 → **就地隔离**（记 `broken`、进 `degraded[]`、不再调用），不拖垮整场
- 同 `seed` 必须逐帧确定；`dispose` 逆序且幂等

---

### 2.4 三条从事故里长出来的硬规则（2026-11-18，都有门锁着）

| # | 规则 | 为什么（真实事故） | 谁在守 |
|---|---|---|---|
| 1 | **有零件的测试，每帧 `draw` 之后必须断言 `stage.degraded.length === 0`** | `parts-composition` 的假 ctx 缺 `clip` → 零件每帧抛错被隔离 → **画到一半就停**，而「3 次 fill / 3 次 stroke」的计数断言反而"恰好"成立 → **15/15 绿，零件坏了两轮**。这条把「静默失效」变成「立刻红」，而静默失效是这个仓库最贵的失败模式（P0 白屏、缺 `clip`、`& 0xf8` 清零通道，全是静默的） | `parts-composition`、`preview-build` |
| 2 | **L5 的两种形态，义务不同**：<br>· **DOM 版（默认）**：不受本条约束 —— 它是 DOM，L4 的 `clearRect + drawImage` 碰不到它<br>· **canvas 版（仅在必须画进画布时用）**：`draw()` 必须每帧无条件执行 | L4 用 `clearRect + drawImage` 重画整帧，只在变化时重绘的 canvas-L5 会被**抹掉**。层序保证绘制顺序，保证不了"没重绘就在" | 四站 L5 走 DOM（`shared/sites/shell.ts`），本条只在出现 canvas-L5 时适用 |
| 3 | **输入边界成对**：① 世界只接收画布上的指针（`event.target !== canvas` 一律不转发）；② UI 若要引起世界变化，由站点**显式** `stage.setPointer`（宿主提供 `__preview.tap()`）；③ `pointerup` 不过滤且总是释放；④ 模态期间画布上的指针也不转发 | 原来 `host.ts` 无条件转发 window 的 `pointerdown` → 点 Esc 菜单的按钮会让世界同一帧收到按下。`/hug` 的 `ready→drifting→away` 不可逆，一次「想关静音」就毁掉仪式；`/koi-pond` 的墨单向不还原。零件只读 `frame.pointer`，**无从防御**，防线只可能在宿主/站点 | `tests/input-boundary.mjs`（真实 Chromium） |

> 断言必须**成对**：只测「菜单点击不许进世界」的话，把转发整个关掉也能绿 —— 那只证明"不误吃"，证明不了"按钮还能用"。
> **且必须在两个宿主上各跑一遍**：`shared/stage/preview/host.ts`（预览）与 `shared/sites/shell.ts`（上线）是两个独立实现，
> 同一个 bug 在壳里复发就等于没修。`tests/input-boundary.mjs` 现在 21 条 = 10 × 预览宿主 + 11 × 壳（多一条真 CTA 点击）。
> 另：假 ctx 缺方法已经连发三次（`clip` / `rect` / `strokeRect`）。**它是结构性的不是疏忽** —— 假 ctx 是手写的，真 ctx 多一个方法就可能漏。建议改成 Proxy 兜底（未实现的方法自动记一条，测试结束有记录就红）。

### 2.4b 阈值必须标注「地板」还是「目标」

**从失败样本只能反推出地板，推不出目标。** 这是 2026-11-18 一次真实误判换来的规则：

- `1.32 L*` 判失败 → 反推出「地板 = 6 L*」（能区分有无）
- `6.48 L*` 过门 → 主理人复判「眼睛说没有光」
- `11.49 L*` 过门（阈值已抬到 10）→ **眼睛仍说平**
- `16.59 L*` / R² 0.925 → 第一个"眼睛认了"的版本 = **工作点**

所以：**每个阈值都要标注它是地板还是目标，并写出工作点。** 只有地板而没有工作点的门，会奖励"刚好过线"的实现。

> 工作点会随对象变：`room` 的纸是 16.59 L*；换一张更亮的纸，同一个 L* 差会显得更弱。工作点要在**目标对象上**逼近，不能跨对象搬。

### 2.5 门自己也会撒谎

> ## 总纲一：**判据的算法里，应当出现它要排除的那个变量。**
>
> ## 总纲二：**新判据落地前，必须与全部已有硬判据做一次互检。**
>
> 出处：`tide` 的五条判据全在测"斑的分布/大小/软硬"，测了一轮又一轮全绿，
> 而 **圆盘本身就是"可指认的实体"，直接违反早已存在的 S2「中心 60% 内零实体」** ——
> 没有一条判据回头和 S2 互检，所以每轮数字都过、画面都错。
>
> 同类：`koi` 的"任意两行不得平移重合"与"相邻行固定横向偏移"**数学上冲突**
> （固定偏移的后果就是行是彼此的平移副本）。互检后保留更根本的那条（不得有**完全相同**的两行）。
>
> **冲突时以更早、更根本的那条为准**；测不了的判据删掉，别留着当仪式。

>
> 这一节的 14 例（表内编号 1–14，按出现顺序）几乎都栽在同一件事上。修法一句话就能记住：
> - 相对背景阈值 = 把**背景**写进算法
> - 去趋势（40px 高通）= 把**光平面**写进算法
> - HSV 而非 HSL = 把"你要**纯度**还是**明度**"写进算法
> - 与颜色无关的"上半幅必须平滑" = 把**配色**排除在判据之外
>
> 只说"绝对量会被其它因素影响"不够 —— 那句话不给修法。**判据必须自己消掉那个干扰项。**

### 2.5 门自己也会撒谎（14 种假绿，一个来源）

这个仓库最贵的失败不是"写错"，是**"绿着但东西是坏的"**。下面 14 例全部真实发生过，全部当时所有门都绿：

| # | 假绿长什么样 | 为什么测不到 | 解药 |
|---|---|---|---|
| 1 | `manifest.bytes` 七个值与磁盘不符 | 声明值在 CRLF 工作区上量的，`.gitattributes` 换了 LF 就全错 | 用 `wc -c` 复核声明值；`eol=lf` 钉死 |
| 2 | **P0 白屏**：真浏览器里每个页面都抛「主画布拿不到 2d 上下文」 | 假画布 `getContext('webgl2')` 恒返回 `null`（把规范语义写反了），于是"在主画布上探测 webgl2"这条路径在测试里永不触发 | `makeStrictCanvas`（一种上下文模式、先到先得）+ 变异复现 |
| 3 | `parts-composition` **15/15 绿而零件每帧抛错** | 假 ctx 缺 `clip` → 装配器隔离 → **画到一半就停** → 「3 次 fill / 3 次 stroke」反而"恰好"成立 | 每帧 `draw` 后断言 `degraded.length === 0` |
| 4 | presets 的 `opts` 对产物**完全无效** | Node 侧校验走了工厂，浏览器 bundle 只取 `ns.part`；`ink` 的 dither 静默失效，别的断言全绿 | 断言「产物内 `budgetCostMs` 必须等于构建器算出的 costMs」。**补充：dither 已从 `pixel-post` 删除，这个特定事故不可复现；但"opts 不进产物"那半条仍是活的门** |
| 5 | 输入边界门 `B1` 恒绿 | `page.click()` = down+up **同帧互相抵消**，采样器两帧都是 false → 删掉 `target` 过滤也照样绿 | 改成「按住不放」，让某一帧真的看到 `down=true` |
| 6 | 「草不在天上」判据 v1/v2/v3 恒 0 或恒红 | v1 绝对色阈（细线抗锯齿达不到）；v2 加 `b/r` 比值（压在蓝天上仍不达）；v3 放宽后把**暖雾带**算进来 | v4 加**局部对比**（比左右 8px 背景亮 22 以上） |
| 7 | 纸纹自相关 v1 = 0.986 | **方向光本身就是平滑梯度**，自相关≈1 —— 把"有光"判成"有周期" | 先去趋势（40px 高通）+ 在 **CSS 像素栅格**上算 |
| 8 | **合成目标矩形传设备像素**这条变异抓不到 | `dpr=1` 时 CSS 像素 ≡ 设备像素，两个值在当时的环照里**恰好相等** → 变异完全等价，断言再对也红不了 | 先造出差异（`globalThis.devicePixelRatio = 2`），再断言差异存在（`canvas.width === 2560`，否则本条没有辨别力） |
| 9 | `bubbles` 的速度慢 60 倍但"看起来还行" | 原文 `speed` 是**每帧**位移（归一化坐标），契约的时间单位是**秒** → 不 ×60 就慢 60 倍。**单位不同、没有报错、也没人会觉得不对** | 换算时把两边的单位写进注释（`(0.0004+r*0.0012) × 60`），bench 用 `reducedMotion` 位移比 0.30 顺手锁住量级 |
| 10 | `field-visual` 的「草不在天上」判据**照蓝天空调色**，天空改暖后误判 342 像素 | 判据验的不是"结构"，而是**当前这套配色**；改配色就崩 | v5 改成与颜色无关：上半幅只该平滑，与左右各 8px 均值差 >18 的像素必须为 0（变异复现 4584 命中） |
| 11 | `/still` 在 `frames=12` 取样 → 量到一片黑（L\*0/0°/0） | **"没画完"被记成了"色相不合格"**（体素世界要几十秒才出画面） | 等到画布非黑再取样；等不到就红，且消息区分"未出画面"与"色相不对" |
| 12 | `/koi` 的画框风险靠"看图"把关 | **画框是字符集问题，不是渲染问题** —— 看截图只能看到"这一次有没有" | 静态断言：字符斜坡不得含 `┌─┐│└┘...`，且零件定义不得有 `ground` 字段（变异验证：塞进 `┌─┐│` 立刻红） |
| 13 | `paper-visual` 用固定亮度阈值找纸 | 方向光把暗侧角压到阈值以下 → 纸被裁小 → **面积/比例偏低，会把正确产物判红**（PM 量出 59.3% / 1.531） | 阈值改成**相对背景**：`L > 背景P50 + 15`（实测回到 64.4% / 1.415） |
| 14 | **`bubbles` 的 `screen` 代价被量成 −1.00 ms**（负差值） | 强制同步法的同步税 ~8ms、抖动 ±1ms，而效应只有 0.05–0.25ms —— **效应只有噪声底的 1/160**，任何结论都是掷硬币 | 放大信号：同一组画 50 遍再除以 50（第二次才拿到 0.052 ms/帧）；**方法失败的过程留在脚本里**，标注「这个量级测不了」 |

**同一个来源**：测量点选在了**观察不到现象的地方** —— 假环境语义写反、假 ctx 缺方法、断言被截断的绘制"恰好"满足、检查的是缺省零件而不是产物里那个、事件在同一帧内自我抵消、判据对被测对象本身敏感。

### 2.5d2 口径没钉死，数字就不是证据（饱和度那件事）

同一张 `/hug`，产品经理量 **饱和 0.472**，我量 **0.315**，色相与 L\* 却完全一致（35° / 43.0 vs 43.1）。
原因只有一个：**公式不同** —— 他用 HSV `S=(max−min)/max`，我用 HSL `S=(max−min)/(1−|2L−1|)`。

两边都"有依据"、都报得出数、都算得出平均值，**却谁也说不清差的 0.157 是什么**。
这跟"阈值没有样本"是同一类问题：**口径不统一时，数字不是证据。**

现在钉死：**饱和度一律用 HSV S**（`MANUAL-QA §8` 附录），`paper-visual` 与 `site-fingerprint` 都已改。
改后四站与 PM 独立量的值对上（license 0.100/0.098 · hug 0.475/0.472 · koi 0.034/0.033；still 0.617/0.580 有 7% 差，属取样帧不同）。

> 通则：**任何给出去的数字，必须同时给出算法。** 只报数不报算法的指标，迟早会有两个版本。

### 2.5e 凡是"有文档定稿"的字段，代码里的值必须能被断言追溯回文档

事故：`STATIONS.license.lead` 是我**手写编的**（`A permit for a small, unreasonable thing.`），
而 `COPY-SITES.md` 的定稿是 `A permit to simply be.` —— **两份文案，且代码那份是编的**。
`still` / `koi` 的 hook 也一并是编的，只有 `hug` 恰好与文档一致。

解药不是"请注意不要编文案"，而是**编了就构建失败**：

```
site-build: FAIL 1/102
  - copy.mjs license.hook = "A permit for a small, unreasonable thing."
    在 COPY-SITES.md 里找不到 —— 代码里的文案不能自己编，必须先改文档
```

- 单一代码来源：`shared/sites/copy.mjs`（值逐字照抄文档）
- 结构：`tests/site-build.mjs` 断言**每个值都能在 `COPY-SITES.md` 里逐字找到**
- 将来适用于：**色值、时长、比例** —— 任何有"文档定稿"的字段都照这个形状做

**两条前置规则，缺一条数字就只是噪声的形状**：
- **先问"这个数是什么意思"** → 任何给出去的数字必须同时给出**算法**（§2.5d2 饱和度事件）
- **再问"这个数有没有意义"** → 先算「预期效应 ÷ 已知噪声」，< 3 就不要测（第 10 例）

**动手测之前，先算「预期效应 ÷ 已知噪声」，< 3 就不要测。**
要么改方法放大信号（画 50 遍除以 50），要么直接报「这个量级测不了」。
这条比「多测几次取平均」更硬：**平均降的是随机抖动，降不了系统性的同步税。**
（第 10 例就是这么来的：效应 0.25ms、噪声 ±1ms，比值 0.25。）

**所以每条门都要能回答三个问题**：
1. **它现在还在验什么？**（`paper-ink/bench.mjs` 里那条"瓦片无缝"在取消平铺后必然永绿 → 已换成"纸面场边缘连续性"并写明"周期性归浏览器门管"）
2. **把它验的东西弄坏，它会不会红？**（每个门至少配一条变异/阴性对照）
3. **它依赖的那个前提，在我的测试环境里成立吗？**（第 8 例就是这条：`dpr=1` 让"CSS 像素 vs 设备像素"这条真实区分**被环境抹平**。同族还有 `getContext` 语义写反、`navigator.gpu: false` —— 三者都是环境抹平了区分，不是门写错了）

### 2.5b 反面：不是"测量点错了"，是「隐喻选错了」

上面八例都是"门看不见现象"。还有一类更隐蔽：**门的数字全对，但物理前提选错了。**

实例（2026-11-18，`ascii-field`）：ASCII 的第一版给了 `blend: 'lighter'`，理由是"ASCII 是光"。
在暗场景上 `lighter` = 发光；在 `/koi-pond` 的**浅纸**上，同一个 `lighter` 变成**提亮**，墨几乎不可见 ——
**同一个词在两种背景里语义相反**。所有指令计数断言当时全绿，是截图发现的。

根因不是疏忽，是**我动手前没有先写下"这一站在什么介质上"**。混合模式、墨色、阴影、发光——
这些量都依附于介质，没有介质前提时只能靠直觉选词。

**所以新零件的第一段注释必须回答**：这件东西在**什么底**上、用**什么混合**、**为什么**（不是"看起来对"）。

> **同一族还有一条：混合模式的 alpha 不是"不透明度"。**
> `screen` 的 alpha 是"**加多少光**"，`1.0` 就是全加 —— `tide-medium` 的精灵峰值给 1.0 时直接爆成白球/雪球。
> 换句话说：**在乘法/加算混合下，`0.5` 才是"半透明"的视觉直觉。** 这条和 `lighter` 在浅纸上变成"提亮"是同一类错误（同一个词在两种语境里语义相反）。

> **零件模板固定第二项：静态形态 + 动态位置 → 烘精灵 + 盖印。**
> 每帧 56 次 `drawImage` vs 每帧 56 个 `createRadialGradient`，后者在真机上 5–8ms。
> 与 `paper-ink` 的"能烘就烘"是同一条。

> **这是零件模板的固定第一项**（`bubbles` 是第一个照此写的）：
> ```
> // ★ 介质前提：底是<什么>，所以<这件东西的物理性质>：
> //   · blend: '<x>' —— <为什么是它，换个模式会怎样>
> //   · <形态选择> —— <为什么不用另一种（渐变/描边/图案）>
> ```
> 这段话的作用不是给评审看，是**让下一个改这行的人不用重新推理一遍**。

### 2.5c 「骨架转正」要按**已定 / 待定**切，两边都要有门

`tide-medium` 的骨架是三版并排探针（防锚定：看到一版就会拿它当基准去「调」，而不是从产品意图去「选」）。
转正时**不要整体转**，按两组切：

| 组 | 状态 | 门 |
|---|---|---|
| 微粒 / 雾 | **已定** | `shared/parts/tide-medium/bench.mjs`：数量、随 LOD、可独立关闭、烘焙期建过渐变 |
| 色阶 / 焦散形态 | **待裁** | 只断言「**可以独立关掉**」（`caustic:none` / `grade:false` 仍能画、不白屏），**不评判形态好不好看** |

两边的边界写进代码：参数接口里直接标 `（待裁）` / `（已定）`。
**别让「转正」只发生在待裁的那一半上** —— 已定那一半也要有门，否则它只是「不再改了」，不是「已经对了」。

### 2.5d 「会腐化的结构」清单（每项都要有到期日）

一个已知会腐化的结构，如果不写明"到什么时候改"，它就会一直烂在"还能用"的状态里。

| 结构 | 为什么会腐化 | 触发条件 |
|---|---|---|
| `tests/preview-build.mjs` 的断言数 ≈ 5 × 预设数 | 14 个预设 556 条，约 400 条是同一条 ×14，一次失败刷 20 行 | **预设 ≥20** 时改成「按预设分组汇总 + 失败只列组名与首条」（已写进 `preview/build.mjs` 顶部） |
| `tests/lib/browser.mjs` 的 `waitForPreview` 认 `__preview` / `__site` 两个句柄 | 加第三个宿主时会又只认前两个（`__preview` 那次就是这样：加壳时 15s 超时） | **出现第三个宿主**时改成注册式（`registerSnapshotProvider(name, fn)`） |
| 假 ctx（`tests/lib/fake-ctx.mjs`） | 真 ctx 多一个方法就可能漏（已连发三次：`clip`/`strokeRect`/`rect`） | 已有 `guardCtx` 记录+抛错；**若再出现一次，改成 Proxy 自动生成全部方法** |

### 2.6 豁免要能自我失效（`part-clock` 的模式，值得复用）

`tests/part-clock.mjs` 扫「零件不许持有自己的时钟」，第一次跑就抓到 `voxel-world/index.ts` 的 `nowMs()`（boot 遥测）。
处置不是"放宽规则"，而是**带理由的豁免清单 + 清单会自己失效**：

- 每条豁免必须写 `why`（这里是「boot 遥测，不参与任何绘制决策；引擎构造是异步的、拿不到注入的 now()」）
- **若某个豁免一次都没命中，门报「豁免已失效」** —— 代码改了/删了而豁免留着，等于开了个后门
- 门自带**变异自检**：喂一段故意违规的示例给同一个扫描器，必须命中 4/4（防"扫了空目录 / 正则写错 / 永远 0 命中"）

> **注释不会自己失效，清单会。** 任何"允许违规"的机制都该长成这个形状。

### 2.7 假 ctx 用 Proxy 兜底（手写假 ctx 漏方法是**结构性**问题）

假 ctx 缺方法已经连发三次（`clip` / `strokeRect` / `rect`），每次后果都是「零件在假环境里行为与真机不同」，其中一次还让 15/15 全绿而零件每帧抛错。

解药是 `tests/lib/fake-ctx.mjs` 的 `guardCtx(base)`：
- 访问**没实现**的方法时 → 记录方法名 + **抛错并喊出名字**（不是吞成 `undefined`，那更糟：零件继续跑、只少画几笔）
- 测试收尾断言「未实现方法清单为空」
- 已接入：`parts-composition`（22/22）、`preview-build`（337/337）、`paper-ink/bench.mjs`、`pixel-post/bench.mjs`

变异验证（删掉假 ctx 的 `clip`）：
```
field-in-stage: FAIL 8/22
  - 首帧后不应有降级/隔离记录：[{... "detail":"运行期抛错已隔离：[fake-ctx] 假 ctx 未实现 clip() —— 请补进假 ctx。零件不得在假环境里静默降级..."}]
```

## 3. 已完成（含验证证据）

### 3.1 装配运行时 `shared/stage/` — 1101 行

| 文件 | 内容 |
|---|---|
| `contract.ts` | `PartV2` / `PartInstance` / `PartEnv` / `WorldFrame` / `BlendMode` 白名单 / `StageError` |
| `world.ts` | `mulberry32` · `hashSeed`(FNV-1a，带分隔符防 `('ab','c')` 与 `('a','bc')` 撞种) · `createWorld` · `createPointerTracker` · `planBudget` |
| `stage.ts` | `createStage` · `validateParts` · `sortParts` · 预算降档 · 故障隔离 |
| `index.ts` | 唯一对外入口（站点与零件只从这里 import） |

**验证**：`node tests/stage-smoke.mjs` → **44/44 PASS**；`node tests/stage-mutation.mjs` → **6/6 变异全部被抓住**（层内 z 排序被删 / 超预算跳过 draw / dispose 改正序 / 不设 blend / 缺能力照构造 / 抛错不隔离）；`npx tsc --noEmit` → 0 error。

> **2026-11-18 P0 白屏修复（T17）**：`detectCapabilities` 原来在**主画布**上探测 `getContext('webgl2')`，而 canvas 只有一种上下文模式 —— webgl2 成功之后 `getContext('2d')` 恒为 null，于是**真浏览器里每个页面都在构造期抛错白屏**。
> 修法：能力探测改用一次性探针画布，并把「先取主画布 2d」提到探测之前（共改 2 处、约 15 行，逻辑不变）。
> 为什么之前测不出来：`tests/stage-smoke.mjs` 的 `makeCanvas` 写的是 `getContext(id){ return id==='2d'?ctx:null }` —— 对 'webgl2' 永远返回 null，把规范语义**写反了**。已新增 `makeStrictCanvas`（一种模式、先到先得）+ 3 条断言锁死；`tests/preview-build.mjs` 的假画布也改成严格语义，并在产物脚本里断言「主画布最终模式必须是 2d」。
> **未在真浏览器验证**（本机只有 Safari，GUI 截图是全黑）：这条修复的正确性由「严格画布断言 + 变异复现」保证，不是由目视保证。

> **2026-11-18 T18：L1 就地合成**（`renderFrame` 改单循环）。原先是「先跑完 2D 全循环、再跑 GL 全循环」，靠 CSS `mix-blend-mode` 把 GL 画布压在 2D 之上 —— 后果是**不透明的 GL 会挡住 L2/L3/L4/L5**（`/still` 不只是 L0 看不见，气泡/墨/后处理/UI 都看不见）。现在 GL 在自己该出现的层位就地 `drawImage(glCanvas, 0, 0, width, height)` 然后 `continue`。
> 三个必须守住的点：① 目标矩形用 **CSS 尺寸**（`ctx` 已被 `setTransform(dpr)` 缩放过，传设备像素会放大 dpr 倍，且**只有 dpr>1 时才测得出**）；② 合成必须在 `instance.draw()` 之后的**同一个同步块**（跨帧读 GL 画布可能拿到空或上一帧）；③ `glBlend` 语义从 CSS `mix-blend-mode` 改为合成时的 `globalCompositeOperation`，走 `BLEND_MODES` 白名单。
> 新断言：层序 `L0.draw → gl.draw → composite → L2.draw`、目标矩形 = CSS 尺寸、`glBlend='copy'` → `E_BAD_BLEND`、gl 抛错后不再合成（残影）。`stage-mutation` 只改了 M2 一处锚点，M4/M5/M6 一行未动。

> 变异探针的价值：第一版 smoke 测试全绿，但删掉 z 排序也照样全绿 —— 因为测试用的 id 字典序恰好等于 z 序。**「全绿」不等于「测到了」**，加探针才发现 6 条里有 2 条是假绿（另两条见 `git log` 里的测试注释）。

### 3.2 四个零件

| 零件 | 层 | 行数 | 状态 |
|---|---|---|---|
| `shared/parts/field-ground/` | L0 | 343 | 黄昏草甸：天光 + 雾带 + 三层丘陵视差 + 520 根按风摆动的草。`costMs 3.4`（**估算**，见下） |
| `shared/parts/voxel-world/` | L1 `gl` | 265 + `engine.js` 2324 | `shared/core` 体素海洋世界包成零件，20 条具名补丁，基线零字节改动 |
| `shared/parts/paper-ink/` | L0 | 465 | **一张纸**（不是底纹）：台面 + 投影 + 纸面场 + 方向光 + 双线框，全烘在离屏，每帧 1 次 blit。**不平铺**（整张一次生成，无周期）；**暗角不在这里**（归 L4）。`costMs 1.3`（估算；真浏览器 JS 侧 0.00ms，成本全在填充）。`tests/paper-visual.mjs` 10 条断言 |
| `shared/parts/pixel-post/` | L4 | 330 | **只走快路径**：烘一张覆盖图（暗角 + 扫描线 + 动能颗粒），每帧 1 次带 alpha 的 blit。`costMs 1.85`（估算；带扫描线 2.21）。**无 `getImageData`；仅 `bakeGrainTile` 在离屏 tile 上一次性 `putImageData`，不写主画布，每帧为 0** —— 删掉了 dither 与 blockPx，`expendable: true` |

> **纸的宽高比 = 1.4142（A4 横），这是导出的前置条件**：`/license` 的带走物是 1410×1000（同比例）。
> 比例不一致时 `cover` 裁切会把纸左右各切一截、**章落出画外**，而那种失败不报错。
> `tests/site-build.mjs` 断言「站点 `exportSize` 比例 === 零件 `SHEET_ASPECT`」，已做变异验证（改回 720×1000 会红）。

> **`paper-visual` 的判据重写过一次（v3）**，因为头三条是错的：
> ① 「背景取中心 60%」在 `/license` 上取到的是**纸**（L* 82.6）→ 改成**画幅色指纹**（全帧 L* P50 / 色相 / 饱和，只报数不断言）；
> ② 「lag 4–32 自相关 ≤0.35」**永远不过**（平滑纹理短 lag 必然相关）→ 改成 **tile 周期（128px）自相关 ≤0.35**（实测 0.060）+ **功率谱峰值比 ≤400**（实测 3）；
> ③ 「四角比中心 ≤8%」有方向光后**必然失败** → 改成**先减光平面再看残差角/中比**（实测 0.992）。
> 但 ② 我实现时**又漏了去趋势**（方向光的斜坡在任何 lag 上都相关 → 首次量出 0.517），补 40px 高通后才到 0.060。**同一个坑认了两次。**

**组合都实测过**：`node tests/parts-composition.mjs` → **22/22 PASS**（单件装配 / 与 L5 叠加的层序 / 无离屏能力时的降级路径）；`node tests/preview-build.mjs` → **738/738**（逐 preset 的零外链 / 占位符 / 零件真在产物里 / Node 装配冒烟 / **产物脚本在假 DOM 里真跑 3 帧**）。

**voxel-world 是真的画出来了**，不是「能 import」：`docs/evidence/voxel-proof.png` 是同一次 headless Edge + CDP 运行的截图，`state: ready`，海床/海藻/鱼群/光柱齐全，上面叠着 `lighter` 混合的 2D 光点 —— 即「L1 GL 层 + L2 canvas2d 层复合」跑通的证据。

**本轮已用真 Chromium 取证**（`tests/lib/browser.mjs`：`launch` / `openFile` / `waitForPreview` / `screenshot` / `capture`），
四站产物与零件画面都有 2560×1440 的浏览器截图与 `__site.snapshot()` 状态快照；`browser.mjs --shot` 现在默认 `frames=60`，
并对 `frames<60` / 宽<1280 / 降档图**拒收退出**（证据资格）。
`node shared/parts/pixel-post/bench.mjs` 仍出六条断言（含**每帧 `getImageData`/`putImageData` = 0**、**颗粒换相**、**vignette/grain/scanline 的开/关一对数字**）。
旧句"本机没有 Edge/Chrome、Safari 截图全黑、画面证据只有零件自算像素"已作废。

**`costMs` 的口径必须看清**（这是本轮最容易自欺的一处）：

- `field-ground` 的 3.4 ms 是**按填充率常数估的**（`0.35 ms/Mpx` 不透明 blit、`0.30` 实色填充、`0.8 ms/千段` 描边），不是浏览器实测。Node 里没有 canvas 实现，假 ctx 测出来是 **0.004 ms**，那是个陷阱 —— 它只测 JS 指令发射，不含 GPU 填充，而本件 99% 的成本在填充。
- `voxel-world` 的 0.05 ms 是 SwiftShader 软件后端下的 CPU 提交耗时，**不能外推到真机**。
- **上站后必须用 `performance.now()` 在真实浏览器采一次替换掉。** `shared/parts/*/bench.mjs` 会打印指令计数与估算对账，那两项是可核对的。

### 3.3 两份能直接用的算法内核（上一轮的遗产，别删）

| 文件 | 行数 | 内容 |
|---|---|---|
| `shared/parts-library/dandelion/core/meadow.ts` | 501 | 1335 颗种子 / 44 段伞骨 / `DETACH_SECONDS=1.8` 错峰脱落 / 三轴异速飘散 / `PALETTE` 与 `PLANT_LAYOUT`（10 株，seeds 求和 = 1335） |
| `shared/parts-library/blow-input/core/detector.ts` | 276 | FFT 2048 / 平滑 0.65 / 底噪 EMA 0.94 / 阈值 `max(0.025, baseline*2.8)` / 分频与宽带判定 |

这两个是**逐常量对齐原文**的移植，且被 `tests/golden-run.mjs`（4 份 89 条，100% 通过）与 `tests/mutation-probe.mjs`（死参数 = 0）验过。**它们只是数学内核，没有画布渲染** —— 对应的 Canvas 渲染层在 `sites/hug/parts/dandelion.ts`（396 行）与 `sites/hug/parts/blow-input.ts`（247 行），是 v1 形态，要包成 PartV2 才能进新装配（见 §4 任务 1）。

### 3.4 文档与权威链

**先看 [`docs/README.md`](./README.md)** —— 那是唯一的权威声明。仓库里同时躺着四代文档（v1.0 / v1.1 / v2.1 站群 / 当前零件体系），读到旧的那份就会按错方向施工。

| 文档 | 行数 | 用途 |
|---|---|---|
| `docs/README.md` | — | **权威链索引**：哪份能读、哪份只是留档、哪份已归档 |
| `docs/BIOME-ASSET-MAP.md` | 303 | 4 个 biome 各需哪些零件（结论：**room 只要 2 件、field/tide 各 3 件、ink 2–3 件**）；ASCII 984 件能不能用；shaders 200 件的真实约束 |
| `docs/ASCII-PIECE-CONTRACT.md` | 570 | ASCII 两套 piece 的渲染契约钉死到可照抄：闭包返回什么、frame 结构、调色注入点、`CELL_W=0.602`、成本与四种合并方案 |
| `docs/VOXEL-AS-PART.md` | 189 | 体素引擎四问查实（DOM 依赖全表 / 包围盒 4 处实测值 / 硬依赖 / 三档画质）+ 三条路线裁决 + 20 条补丁表 |
| 仓库根 `QUARANTINE.md` | — | 上一轮遗留的两个隔离项（Q-01 已裁删除并落地；Q-02 零件实例化层产线从未执行 —— **这一条就是你接手后要补的洞**） |
| `docs/evidence/voxel-proof.png` | — | 唯一被浏览器真实跑出来的画面（CDP 驱动 Edge，水下世界 + 2D 光点叠加） |

**已归档、不要读**：`docs/archive/2026-11-pre-pivot/`（站群架构 124 KB + 12 站矩阵 PRD 83 KB + 旧团队 SOP + 四张 mermaid 图）。
**已废弃但留在原位**：`docs/ARCHITECTURE-REUSE.md`（232 KB）与 `docs/PRD-REUSE.md`（69 KB）—— 因为代码里有 20+ 处注释按 §章节号引用它们，移走会让引用悬空。两份顶部都有醒目废弃抬头。
**`ARCHITECTURE-REUSE.md` 文件与内容冻结**：虽然标了 ⛔「不得作为施工依据」，但 `tests/verify-provenance.mjs:34-35` **在运行时解析它** —— 删改会让 `verify:reuse` 变红。

---

## 4. 缺口（按依赖顺序）—— 2026-11-19 对齐后的真实状态

> 旧标题"这就是你的 TODO"已作废：下面多数项**已经交付**，只有明确标 ⬜ 的才是缺口。

### 任务 1｜把 dandelion / blow-input 改成 PartV2（⬜ **确实未做**）
- 新建 `shared/parts/dandelion/`：复用 `shared/parts-library/dandelion/core/meadow.ts` 的全部数学 + `sites/hug/parts/dandelion.ts` 的绘制层（LOD 分档 44/23/14/5/2 段、8 档透明度分桶）。`layer: 'L2'`，`blend: 'source-over'`。
- 新建 `shared/parts/blow-input/`：**不要**把麦克风塞进零件。`WorldFrame.audio` 是**stage 级输入**（和 pointer 同级），由 `stage.setAudio({level, bands})` 注入，麦克风采集是零件之外的一个小服务。
- 机器证据：`shared/parts/{dandelion,blow-input}/` 均不存在；`verify:reuse` 尾行报两者 `ported[].params 全空 → 死参数探针无可测面`，`Mode B ⏳ 无目标`。

### 任务 2｜四个真零件（✅ 已交付三个，⬜ 仅余 boids）
| id | 状态 | 证据 |
|---|---|---|
| `paper-ink` | ✅ | L0 一张纸（台面 + 投影 + 纸面场 + 方向光 + 双线框），无平铺、暗角归 L4；`paper-visual 10/10` |
| `pixel-post` | ✅ | L4 只走快路径（暗角 + 扫描线 + 动能颗粒），每帧 1 次 blit；无 `getImageData`；bench 六条断言 |
| `bubbles` | ✅ | L2 70 个气泡 + 第二个实心圆高光，`screen` 混合；bench PASS |
| `tide-medium` | ✅ | L0 潮：上亮下暗连续梯度 + 雾下厚 + 微粒，**无圆盘**（`glow:'none'`）；`tide-visual 2/2` |
| `boids` | ⬜ | `shared/parts/boids/` 不存在；全仓只命中 `preview/build.mjs:97` 的一句"还没做"注释 |

已交付四件均满足：`costMs` bench 对账、`setLod('low')` 真减量、`draw`/`update` 零每帧分配、`dispose` 幂等、不碰 core、零外部依赖、`reducedMotion` 降速、不许 `Math.random` / `addEventListener`。
**boids 的旧口径仍有效**（将来做时照这个来）：源 `animata/background/boids-ecosystem.tsx`（7,672 B），`count=120` `PERCEPTION=36` `MAX_SPEED=1.8`，分离半径 `18` 权重 `0.04/0.0006/0.06`；原文无 dt（px/帧），只改积分 `x += vx*dt*60`，**力不要乘 dt**；原文每帧铺 87% 不透明底做拖尾 —— **绝对禁止**，改成内部离屏 `destination-out` 衰减后 `drawImage`。

### 任务 3｜L0 底材（✅ 已实现，不再是"无人做"）
- `tide-medium` ✅：`glow` 删斑（圆盘 = 可指认实体，违反 S2 零实体）；光只靠 **① 顶部亮往下暗的连续梯度 ② 雾越往下越厚 ③ 微粒（点不是盘）**。判据：顶部 20% vs 中部 60% 差 ≥8 L*、中心 60% 亮区连通域（≥15 格）≤3。
- `room` ✅：沿用 `paper-ink` + `pixel-post`（BIOME-ASSET-MAP 的结论），晨光走纸内渐变 + L4 暗角；**不要给 room 加 L2 自走实体**。

### 任务 4｜四座样板站（✅ 壳 + 产物已接；站内逻辑部分未写）
| 站 | 状态 | 实际零件栈 / 站内 |
|---|---|---|
| `/license` | ✅ **全链完成** | `paper-ink` + `pixel-post`；`ritual.ts` 三段出字 + `stay.ts`/`fold.ts` 四开关 + 1410×1000 导出；屏上纸=许可证（页眉 / 印刷线 / 宣言 / 编号 / 日期 / 红章 / 章下副行），`license-ritual 34/34`、`license-stay 13/13`、`site-dom 80/80` |
| `/hug` | ⬜ 站内未写 | 壳 + `dist/hug/index.html` 已接；栈 `field-ground` + `pixel-post`；`sites/hug/` 只有 v1 的 bridge/glue/state，**无新架构 ritual/stay**；且依赖任务 1 的 dandelion/blow-input/boids |
| `/still` | ⬜ 站内未写 | 壳已接；栈 `voxel-world`(L1) + `bubbles`(L2)；**`tide-medium` 已实现但尚未装进 `/still` 栈**，L4 也未装 —— PM 判过「L0 合格 ≠ 站合格」，装 L2/L4 后必须整站复判且不能重新长出圆盘 |
| `/koi-pond` | ⬜ 站内未写 | 壳已接；栈 `paper-ink` + `ascii-field` + `pixel-post`；K1/K1b 形态判据已绿；**墨扩散（L3）仍无** |

四站均由 `shared/sites/build.mjs` 的 `STATIONS` 注册（`:32-103`），`npm run build:sites` 产出 `dist/<slug>/index.html`，`npm run serve` 绑 `127.0.0.1:8080`。

### 任务 5｜ASCII 通用零件（✅ 已实现，不再是"拆成两个零件"）
`shared/parts/ascii-field/index.ts` 是**单一零件**，`variant: 'keys' | 'plain'`：
- `keys`：字符 + 同几何的颜色键字符串 + `palette` 对象，GlyphAtlas 预烘；
- `plain`：单色按行合并（76×28，比旧 96×36 大一号），`█` 走 `fillRect` 而非字形；
- 契约已落门：`meta.ground` 必须不存在（静态断言）、字符斜坡不得含画框字符 `┌─┐│└┘…`、cell 归一化（按 `measureText` 实测步进反推字号，铺满画布宽）、
  K1（隔 1 行偏移非零且同号）+ K1b（δ 在 {2,3,4} 轮转、三值各 ≥15%）、行内同字符连续 ≤14、无完全相同的两行。
- **互检记录**：① "任意两行不得平移重合"与"固定偏移"数学上冲突 → 保留"不得完全相同"；② K1b 的 δ 变化与旧的"隔 4 行恒定"冲突 → K1 改看隔 1 行。

### 任务 6｜/praise 状态（**旧架构冻结存量，不启用**）
- 代码完整且**通过主 typecheck**：`sites/praise/{bridge.ts 37, export.ts 57, glue.ts 168, index.ts 8, site.config.ts 40, state.ts 23}` + `sites/praise/parts/index.ts` 4 个 `create*Part` + `content/praise.ts 66`，合计 399 行；`template.html` 零外链。
- 它跑在**旧架构**：`sites/praise/index.ts:2,7` 用 `registerApp`/`registerConfig`，`glue.ts:18` 是 `PraiseApp implements SiteApp`（七方法），`site.config.ts:5` 是旧 `SiteConfig`。
- **未进新体系**：`copy.mjs` 无 praise 键、`STATIONS` 无 praise 项、`PART_ENTRY` 无它的 4 个零件 id；`dist/` 无 praise 产物；`analytics` 无 endpoint（`site.config.ts:37`）→ 零网络请求。
- **决定：冻结为将来迁移的源，当前不启用、不接入。** 接入需 6 步（STATIONS / copy.mjs+COPY-SITES / 4 个 PartV2 包装 / PART_ENTRY / `attach` 适配器 / 三套测试扩 5 站），工作量接近做一个新站；现在做会为了过门造出假绿。

### 任务 7｜已知但未处理的技术债

1. `shared/parts-library/` 那 10 份 v1 manifest 与新体系**并存但互不相通**。`QUARANTINE.md` 的 Q-02 说得很清楚：`mountSite()` 全仓零导入者、`installParts()` 零生产调用点、7 站 `site.config.ts` 无 `composition` —— **零件实例化产线从未真正执行过**。要么把它接到新 `createStage`，要么整体废弃。**别让它继续「声明存在、实际失效」。**
2. `shared/core/` 的体素引擎包围盒在 4 处重复（见 `docs/VOXEL-AS-PART.md` §一.2），数值当前一致但无编译期校验。基线只读，本轮没动。
3. `shared/build/` + `shared/contract/` + `sites/<id>/{glue,site.config,state,bridge}.ts` 是 v1 站群流水线，与 `createStage` 体系**完全不通**（旧产物里 `createStage` / `PartV2` / 零件 id 命中数全为 0）。产物已删、`dist/` 已 gitignore，但**源码还在**，因为它里面有 `sites/hug/parts/{dandelion,blow-input}.ts` 两个仍然要用的渲染层。等任务 1 的 PartV2 包装做完，这条流水线就可以整体删除。

---

## 5. 命令表

```bash
# 装配运行时 + 变异探针
node tests/stage-smoke.mjs            # 44 断言（2026-11-19 实测；旧 28 已过时）
node tests/stage-mutation.mjs         # 6 变异（会临时改写 shared/stage/stage.ts 再还原）
node tests/parts-composition.mjs      # 22 断言，零件 × 装配器的接合（旧 15 已过时）
npx tsc --noEmit                      # 必须 0 error

# 单个零件的成本对账（打印画布指令计数 + 估算对账）
node shared/parts/field-ground/bench.mjs
node shared/parts/paper-ink/bench.mjs
node shared/parts/pixel-post/bench.mjs
node shared/parts/voxel-world/bench.mjs   # ⚠️ 会起 Edge headless + SwiftShader，几分钟

# 可运行通路（本轮新增）：单文件预览构建器 + 它的门
npm run preview:empty                 # → dist/preview/empty.html（不装任何零件的最小基线）
npm run preview:field                 # → dist/preview/field.html（field-ground L0）
npm run preview:hug                   # → dist/preview/hug.html（L1 GL 单通道）
npm run preview:room                  # → dist/preview/room.html（paper-ink + pixel-post = /license 的栈）
npm run preview:ink                   # → dist/preview/ink.html（同一栈换冷色 biome）
npm run preview -- --list             # 列 preset
npm run verify:preview                # 243 断言：零外链 / 占位符清零 / 零件真在产物里 /
                                      #            产物内 costMs 必须等于构建器算出的值（防 opts 没进产物）/
                                      #            产物脚本在假 DOM 里真跑 3 帧（含 degraded 分支）
npm run verify:field                  # field-ground 画面门（真 Chromium）：无硬边横缝 / 草不在天上
npm run verify:paper                  # paper-ink 画面门（真 Chromium）：方向光≥6L* / 无周期 / 纸边 / 面积 / 背景
npm run verify:input                  # 输入边界门（真 Chromium）：误吃 / 该吃没吃到，成对
npm run verify:clock                  # 零件时钟门（静态）：禁 performance.now / Date.now / rAF / setTimeout
npm run bench:gl                      # GL 合成成本（真 WebGPU）：drawImage ≤3ms 才允许 /still 走 L1 就地合成
npm run bench:parts                   # 真浏览器每帧耗时：①同步计时（指令发射）②rAF 间隔（真实帧率）

# 真实浏览器（本机已可用！见 §8.3）
node tests/lib/browser.mjs --where          # 打印用到的 chromium / playwright
npm run build:sites                         # → dist/<slug>/index.html × 4 + dist/index.html
npm run serve                               # 127.0.0.1:8080（只绑本机，不绑 0.0.0.0）
#   演示：http://127.0.0.1:8080/          → 四站索引
#         /license  ← **唯一走通全链的站**（L5 + 三段仪式 + 停留 + 导出）
#         /hug /still /koi ← 壳与零件已通、**站内逻辑未写**（只有首屏与 Esc 菜单）
#   ⚠️ 别让看的人以为四座都能演示：只有 /license 是完整的。
npm run verify:sites                        # 102 断言
npm run verify:dom                          # 70 断言：L5（DOM）的 h1/hook/菜单/通道/文案在纸内
npm run verify:fingerprint                  # 7 断言：四站色相（抓"方向反了"）：零外链 / 单脚本 / 零件真在产物里 / 壳骨架齐全
npm run shot                                # → dist/preview/shot-field.png
node tests/lib/browser.mjs --shot dist/preview/room.html --out dist/preview/shot-room.png
npm run verify:field                        # field-ground 的**画面门**：无硬边横缝 / 草不在天上 / 阴性对照

# 无浏览器时的像素取证（导出零件自己算出的像素，PNG）
node shared/parts/paper-ink/bench.mjs --png   # → dist/preview/paper-tile.png（256×256 真实瓦片）
node shared/parts/pixel-post/bench.mjs --png  # → dist/preview/pixel-post-still.png（960×540）

# 上一轮遗产（仍应保持绿）
npm run verify:reuse                  # 5 个门：装配 / 溯源 / 措辞 / 黄金值 / 死参数
```

**`dist/` 已 gitignore**（v1 站群产物，2026-11-18 删除出库；`node shared/build/build.mjs <id>` 仍能重新生成，但产出的页面与新体系不兼容，只作历史对照）。

**目视验收**：`npm run preview:field` → `dist/preview/field.html`（**单文件、零外部请求**，`file://` 直接打开即可）。
`shared/stage/preview/build.mjs` 已入库（`_scratch/` 是 gitignore 目录，验收通路放那里等于下一个人没有验收能力 —— 上一轮就是这样丢的）。
产物路径 `dist/preview/<preset>.html`；构建器还提供 `--preset / --seed / --width / --height / --budget / --gl-blend / --out / --readable`。
页面左下角有一条调试条（L5 雏形）：`state ready|degraded · lod · fps · frame ms · cpu ms · drawn · budget · 逐条 degraded[]`。

---

## 6. 文件地图

```
shared/stage/              ← 新装配体系（唯一入口 index.ts）
shared/stage/preview/      ← 单文件预览构建器（build.mjs）+ 浏览器侧宿主（host.ts）——**入库，不放 _scratch/**
shared/sites/              ← **上线**：壳（shell.ts）+ 站点构建器（build.mjs）+ 本地 serve（serve.mjs）
shared/parts/              ← 7 个正式零件全 ✅：field-ground / voxel-world / paper-ink / pixel-post / ascii-field / bubbles / tide-medium；⬜ boids / dandelion / blow-input 未做
shared/parts-library/      ← 上一轮的 v1 零件（含两份真算法内核，别删；manifest 体系待裁）
shared/core/               ← 体素引擎基线，BASELINE.sha256 锁着，**一个字节都不许改**
sites/{hug,license,still,koi}/ ← license 已走**新全链**；hug/still/koi 只有 v1 站内文件 + 新壳（站内逻辑未写）
sites/praise/              ← 旧架构完整（399 行、typecheck 通过、零外链），**冻结未启用**，不进构建
tests/                     ← 门都在这里；stage-* / parts-composition / preview-build 是新体系的
tests/lib/png.mjs          ← 零依赖 PNG 编码器（无浏览器时导出零件像素取证用）
docs/                      ← 架构 / 研究 / 交接
docs/evidence/             ← 目视证据（voxel-proof.png）
dist/preview/              ← 预览产物与取证图（gitignore，按需重建）
QUARANTINE.md              ← 两个待裁隔离项，Q-02 就是 §4 任务 6.1
```

---

## 7. 建议的接手顺序

1. **先跑 §5 的四个命令**，确认基线是绿的（不绿先修环境，别急着写代码）
2. **任务 2 的四个零件**（口径已钉死，照着写最省事）
3. **`/license` 站**（只要 2 件，最快验证「2 件零件能否立住一个站」）
4. **任务 1 的两个 wrap**（`dandelion` / `blow-input`）→ 接 `/hug`
5. 任务 5 的 ASCII 零件 → 接 `/koi-pond`
6. 任务 3 的水底材 → 接 `/still`

---

## 8. 三条给下一个 agent 的提醒

1. **别信「全绿」。** 本轮 6 条变异里 2 条一开始是假绿的（断言恒真 / 断言与实现巧合相等）。写完测试后自己改坏一处看它会不会红，红不了就是没测到。
2. **别把假数字当实测。** `costMs` 尤其危险：Node 里没有 canvas，假 ctx 测出来永远是接近 0 的数，而真实成本全在 GPU 填充。估算就写估算，并在代码注释里写清口径。
3. **别在没有浏览器证据的情况下说「效果很好」。** ~~本机只有 Safari，无 Playwright~~ —— **这句已经过期（2026-11-18 更正）**：`~/Library/Caches/ms-playwright/` 里有 chromium-1223/1228/1243，`npx playwright` 1.65.1。
   坑：那个 playwright 版本要 `chromium-1255`（不存在），所以**必须显式传 `executablePath`**；已封装成 `tests/lib/browser.mjs`（自动扫缓存目录、不写死版本号）。
   ```
   node tests/lib/browser.mjs --where
   node tests/lib/browser.mjs --shot dist/preview/field.html --out /tmp/x.png
   ```
   它把「打开预览页 → 等 `__preview` 就绪 → 打印快照 → 截图」四步做成一句话，并收集 console error。
   **⚠️ 2026-11-18 更正：`navigator.gpu` 在这台机器上是 `true`，且 `requestAdapter()` 拿到 `apple/metal-3`（真 Metal，不是 SwiftShader）。**
   之前那句「默认 false、voxel-world 的真实验证做不到」是**错的**，据此得出的「`bench-gl-composite` 无法测量」也一起作废。
   现在 `npm run bench:gl` 有真实数字：
   ```
   WebGPU: gpu=true adapter=true (apple/metal-3)
   drawImage → 1280x720 ：中位 0.00 ms · p95 0.10 · 最大 0.50
   drawImage → 2560x1440：中位 0.00 ms · p95 0.10 · 最大 0.10
   稳态：rAF 33.20 ms = 30.1 fps
   ```
   结论：**`drawImage(WebGPU canvas → 2D canvas)` 没有 CPU 回读**（判据 ≤3ms 通过，实测 ~0.1ms 的提交侧）。
   `/still` 的 30fps 是**体素引擎自己**的成本（33ms/帧），不是合成成本。仍不能外推到低端集显/移动端。

   **`/still` 的性能记账（三句事实，不要合并）**：
   1. 本机（Metal + headless，1280×720@dpr2）稳态 **30fps**，瓶颈是**体素引擎**（33ms/帧）；
   2. **合成不是瓶颈**（`drawImage` 0.1ms 量级）；
   3. 低端集显/移动端会更慢，**不可外推**。
   **不要为它优化**（没有证据说 30fps 让这站不成立——它是静水站），也**不要隐瞒**（Esc → About 该能看到）。够不够由产品判断。

**四站的帧率不一样，这是事实，不是缺陷**（并列记账，别合并、别外推）：
| 站 | 稳态 fps（本机 Metal + headless，1280×720@dpr2） | 瓶颈 |
|---|---|---|
| `/license`、`/hug` | 60 | 无（快路径 L4 ≈1.85ms） |
| `/still` | 30 | **体素引擎**（33ms/帧） |
| `/koi-pond` | ~49（headless） | 后处理 1.85 + ASCII 0.56 + 纸 1.3 ≈ **7.08ms < 8ms → 不再降档**（删 dither/blockPx 之后） |

**预算 `DEFAULT_BUDGET_MS = 8` 不许为任何一站提高。** 它是一条**产品级声明**（"普通机器上跑满 60fps"），
不是某台机器的实测值；为一站放宽到 12，下一站会要 16。
**旧句"若产品要 /koi-pond 上 60fps，唯一合法杠杆是降 pixel-post 的 dither 采样"整段作废** ——
dither 已从 `pixel-post` 删除；koi 栈现在是 1.85 + 0.56 + 1.3 ≈ **7.08ms < 8ms，不再降档**（浏览器快照 `degraded=0 · lod=high`）。
若将来还要提速，应当**裁零件栈**，而不是回到一个已删除的能力。
   另：`screencapture`（macOS 全屏截图）在这台机器上拿到的是**全黑**，别用它取证。

---

## 附录 A · 两条工程裁决的完整推理

> 由 `docs/PRODUCT-FORM.md` §5-H / §5-I 迁入（2026-11-18）。产品文档只留结论，推理记在这里。三条裁决由架构师给出，产品侧认领后果。

### A.1 `/still` 的 L0 与 L1 能否同时可见？—— 不能，L0 常驻但被遮挡

**物理事实**：`shared/core/src/main.js:344` 是 `alphaMode:'opaque'`、`:353` 是 `clearValue:[0,0,0,1]`，voxel 层每像素 alpha=1。所以有 L1 时，画在 L0 的任何东西是 **0 个像素**——不是"少了一层"，是"从来没显示过"。任何分层方案都改不了这一点。

**两个不可走的口子**（都试过、都否掉）：
1. 让 GL 走透明通道：要改 `shared/core` 基线，`BASELINE.sha256` 锁着 11 个文件，`npm run verify:core` 必须 11/11。没得谈。
2. "把底材画在 GL 之后"：那它就不再是底材，是覆盖层——产品语义上那是 L2，不是 L0。

**裁决（方案 A）：膜留在 L0。** 有 webgpu 时被水体盖住（0 像素）；无 webgpu 时它就是整幅水。理由：`voxel-world` 自带水体、光柱、海藻、水雾，那层膜在好机器上本来就与它重复。**产品侧的定式必须连着说**：被遮挡是设计，**所以 L0 只能是骨架/底，要有可见的膜它必须是 L2**——拆开就会被读成"L0 没用，删了吧"。

**为什么不摘掉 L0 省那 2–3ms**（`without:['webgpu']` 字段因此撤回）：`stage.ts` 的帧循环**从不 `clearRect`**，全靠有件不透明底材每帧把画布铺满。摘掉 L0 会留下气泡残影，还得补一次全屏清屏（≈0.35ms/Mpx，省下的钱又花回去），外加"有 `navigator.gpu` 但 adapter 失败"那条黑屏失败面。**花 2–3ms 买一条代码路径 + 无残影 + 无黑屏，划算。**

**长期正解（P2，本期不做）**：把"焦散 + 悬浮微粒 + 折射光带"升格成 L2 零件（`blend:'screen'`，天然画在 GL 之上），届时 `/still` 声明栈 4 → 5。纯加法，不返工。

**两档补偿一律不做**：`vignette 14→18%` 会破产品侧 `PRODUCT-FORM §2.2-A-3` 的 `≤14%` 上限（且是最看不见的一档差异）；`bubbles` 增密有顺序悖论——构造参数必须在 `createStage` **之前**定，而 `degraded` 在它**之后**才有。**所以"两档看起来一样"不承诺。** 唯一能合法拿到能力位的方式是 `probeCapabilities()` + `StageOptions.caps`；那笔账挂在「**修 P0 + 让 requires 正路第一次可测**」上，**不挂在体验上**。注意：**P0 不是可选项，也不等 T17**——提取 `probeCapabilities` 是修 P0 最省的方式（同一处改动），可选的是"导出它 + 加 `StageOptions.caps`"这两步。

### A.2 反向通道法则：为什么"由站点驱动时序"的交互不可能是零件

**契约事实**：`createStage(options)` 返回的 `Stage` 只有 `degraded / stats / order / world / frame / start / stop / resize / setBudget / setAudio / setPointer / dispose`；`Mounted` 是内部结构；**零件实例一旦被 `create` 出来就归装配器私有**。`contract.ts:99-101` 明确写着"零件拿不到 stage，就拿不到别的零件，也就无法形成隐式耦合"，`WorldFrame` 是**只读**的。**零件 → 站点的反向通道一条也没有，这是刻意的。**

**于是**：`setStage()` / `strike()` / `launch()` 这类方法没有任何调用者能拿到。

**三重封口**（由软到硬）：
1. **位置**：`/license` 的按钮在纸下方、冲压区在纸中央（`cy=128`），要免疫误触就必须知道"按的是不是那个按钮"，零件做不到。
2. **判定**：零件**能**看见"某处被按了一下"——`host.ts:199` 的监听挂在 **window** 上，点 DOM 按钮的 `pointerdown` 会冒泡进去。它看不见的是"**这次按下算不算一个决定**"。
3. **出字（最硬）**：三段的名字 `verifying / stamping / approved` 必须显示，而**任何能被读成一句话的文字只能由 L5/站点出**。于是站点必须知道当前阶段 → 通道不存在 → 这件交互不可能在零件里。这条比位置判断硬：就算零件能自己判定"按钮被按了"，阶段文案也回不到站点。

**所以法则写成两根并行，不许压成一句**：

> **按哪里都同义**（整屏草原、整个池面）→ 零件可以由 `frame.pointer.down` 的按下沿自触发。
> **语义绑在 UI 上**（按钮位置有意义、要免疫误触、要出阶段文案）→ 因果必须由站点持有，那件交互只能是站内代码。

**四站落位**：`/license` 第二类 · `/hug` 第一类（整片草原就是按钮，误触在这站不构成错误）· `/koi-pond` 属"连续场输入"，读指针位置、无"决定"语义。

**一个反例值得记住**：`/hug` 的"按钮 → 放飞"和 `/license` 的"按钮 → 盖章"结构一样，但前者**没有落到站内**——因为按哪里都同义。**如果规则压成一句"交互都是站内代码"，`/hug` 会多出 ~400 行站内代码，从 5 件零件掉到 4 件 + 自建。规则差一句，成本差一倍。**

**跨文档的一条元规则**（产品侧两次栽在上面：`progress`、`done`）：

> **先问「契约里有没有通道」，再问「功能需不需要」。**

### A.3 UI 的指针事件不得进入世界（会真的上线的一个 bug）

`host.ts:199` 的监听是**无条件**的：

```js
window.addEventListener('pointerdown', () => { down = true; pushPointer(); }, { passive: true });
```

而 Esc 二级菜单是有按钮的 DOM。用户点 `Sound` / `Quality` / `Close` → `pointerdown` 冒泡到 window → `down = true` → **同一帧里世界收到了"按下"**。

后果（按严重程度）：
- **`/hug`**：想关静音的人把蒲公英放飞了。`ready → drifting → away` **不可逆**，仪式被一次 UI 操作毁掉。
- **`/koi-pond`**：菜单背后按下一团墨，而墨**不回到原状** → 错误永久留在画面上。
- **`/still`**：唯一不受影响的站（它没有第二个动作）。

**修法（落在站点的指针转发层；不碰契约、不碰零件）——两半，缺一半就把主按钮变成假的**：

```js
// ① 世界只接收「画布上的」指针：不在画布上 → 不转发
if (event.target !== canvas) return;

// ② UI 元素要引起世界变化 → 由站点显式注入（stage.setPointer 是 Stage 的公开 API）
button.addEventListener('click', () => stage.setPointer({ ...last, down: true }));
// 随后在下一帧或 100ms 内归还 down=false，形成一个"决定"的边沿

// ③ 任何模态 UI 打开时 → down 一律为 false（兜底：菜单内空白处 target 可能是容器）
if (menuOpen) { stage.setPointer({ ...last, down: false }); return; }
```

**为什么必须有 ②**：只做 ① 的话，点 `Let it go` 的 `target` 是按钮、不是 canvas，事件被过滤掉 → 蒲公英（L2 零件，只能由 `frame.pointer.down` 上升沿触发）**永远不飞** → 用户点主按钮什么都没发生。**不招徕 ≠ 不响应。**

**② 必须绑 `click` 而不是 `pointerdown`**：`click` 覆盖键盘回车/空格，于是**键盘用户走的正是注入这条路**——删掉真按钮就等于删掉键盘唯一的路径。这是技术性保证，比在文档里写"必须保留"硬。

**按站落地**：注入表只维护一份，见 [`PRODUCT-FORM.md`](./PRODUCT-FORM.md) §2.3（此处不复制，避免两处漂移）。一句话概括：**四站里只有 `/hug` 需要注入**（草地转发 + `Let it go` 注入）；`/license` 因果整件在站点；`/koi-pond` 是连续场、注入会凭空造出决定且墨不可还原；`/still` 没有第二个动作。

**断言（必须有，否则静默回归）**：*「Esc 菜单打开时合成一个 `pointerdown`，零件收到的 `frame.pointer.down` 不得出现上升沿。」*
`tests/stage-smoke.mjs` 测不了这条（它没有 DOM）——要落在浏览器门或宿主单测里。两条都还没有时，**至少写进手测协议；不许只停在"我们知道"这一层**。

**法则（原文，进产品文档 §2.3）**：

> **世界只接收「画布上的」指针。**
> **UI 元素若要引起世界变化，由站点显式调用 `stage.setPointer` 表达，且必须能自证"这一次是一个决定"。**
> **站点是 UI 意图与世界事件之间唯一的翻译层。**

零件侧完全无从防御（它只读 `frame.pointer`，碰不到 DOM），所以这条防线**只可能建在站点**——而站点现在还没建（`host.ts` 是唯一实现，且是无条件转发）。
