# 架构决策记录 · 2026-11-19 A1

> 这份文件记录的是**已经落地的取舍**，不是方案。每条都写清楚「为什么不是另一个做法」，以及「什么条件下应该推翻」。
> 地位：与 `HANDOFF.md` 同级；当 `HANDOFF.md` 的旧描述与本文冲突时，**以本文 + 代码为准**，并回头修正 HANDOFF。

## 0. 一句话

四个站不再是「四个 Canvas2D 拼贴器」，而是 **一个 2D 合成器（stage）+ 一个 three.js 世界层（world）**。纸、文字、UI 走 2D；鱼、体素海、蒲公英、鸟、太阳走 three/Canvas2D 零件；两者在同一帧、同一张画布上按层序就地合成。

---

## ADR-01 · 世界层必须真的在 `three`，但不需要整站变成 3D

**决定**：`/koi` 用 v1 的 three.js 锦鲤池（`koi-pond`）；`/still` 用 `voxel-world`（three/WebGPU）；`/hug` 用 `hug-meadow`（three.js L1，完整还原原站蒲公英草甸）。**不**把 `/license` 的纸强行做成 3D。

**为什么**：
- 2026-11-19 的实机证据是：仓库有 4,473 行 three 代码，但四个 `dist/*/index.html` 里 `THREE|WebGLRenderer` 出现次数都是 **0**。也就是说，「three.js 项目」只存在于源码，用户看到的是 Canvas2D 拼贴。
- 但「每站都 3D」不是产品目标。`/license` 的价值是**纸的触感**和盖章仪式；把纸做成 3D 房间会牺牲文字清晰度、导出精度和首屏速度。
- 三个世界零件里，`koi` 必须真 3D（鱼体 shader/水墨扩散/浮游植物），`still` 必须真 3D（体素海），`hug` 不必（平面剪影+风场更像纸上的动画）。**此判断已被 ADR-12 推翻**：`/hug` 改为 three 草甸；本条仍然成立的部分是 `/license` 不升级为 3D。

**什么条件下推翻**：如果 `/license` 要做「拖光在纸上产生真实阴影」且 Canvas2D 的假阴影被用户认为假，再把纸升级为 `world` 零件；导出仍必须从同一张合成画布裁切，禁止另画一张。

---

## ADR-02 · `gl` 与 `world` 共用**一块** GL 画布，按层序就地合成

**决定**：`PartChannel` 只有 `'canvas2d' | 'gl' | 'world'`；`gl` 与 `world` 共用唯一 `#gl` 画布、唯一 `WebGLRenderer`。`sortParts` 排好层序后，`renderFrame` **单循环**：轮到 GL 零件时，先让零件画到自己的目标（默认 framebuffer 或 RT），立刻 `compositeGl()` 到主画布，再继续 2D 层。

**为什么**：
- 旧版是「先跑完 2D 全循环，再跑 GL 全循环」，靠 CSS `mix-blend-mode` 把 GL 压在 2D 上；不透明的 GL 会挡住 L2/L3/L4/L5（`/still` 的气泡/墨/后处理全看不见）。
- 两块 GL 画布会带来两个上下文、两套 DPR、两套 resize、两次 readback；`E_MULTI_GL` 就是为此设的硬约束。
- 单循环让「L2 气泡叠在 L1 体素上」成为层序的自然结果，不需要额外排序。

**代价**：GL 零件必须能在**同步块**里完成 draw；跨帧读 GL 画布可能拿到空/上一帧。这是刻意的，换来了可预测的层序。

---

## ADR-03 · stage **永不** `clearRect`；透明动画零件必须自带离屏缓冲

**决定**：主画布的帧循环只铺底、不擦除。任何会「消失」的像素（气泡尾巴、飞走的种子、鱼尾拖墨）必须画在自己的离屏 canvas 上，再整块 blit 回来。

**为什么**：
- 2026-11-18 的 P0：`stage` 不 `clearRect`，但某个透明零件直接画主画布，上一帧的像素留在天上，形成「气泡尾巴」。
- 如果 stage 每帧 `clearRect`，L0 不透明的底件就失去意义，且会破坏「纸/水是一层膜」的合成语义。
- 离屏缓冲让零件可以自由 `clearRect` 而不影响别人；代价是每个动画零件多一块显存/内存，必须按 `kb` 申报。

**验收**：`verify:stage` 的 `stage-smoke` 有「不 clearRect 仍不残留」的基线；任何新透明零件必须自带缓冲，否则会在 `field-in-stage` 的残留检查里红。

---

## ADR-04 · `world` 的 `space` 只有 `screen` / `subject` 两种，纸矩形由 L0 `describe()` 报出

**决定**：
- `space:'screen'`：零件画到**整块 GL 画布**，stage 全屏 5 参数 `drawImage` 合成（例如 `/still` 的水）。
- `space:'subject'`：零件只画到**纸矩形**，stage 用 9 参数 `drawImage` 裁切合成（例如 `/koi` 的鱼只在纸里）。
- 纸矩形不是 stage 猜的：构造期先让 L0 的 `paper-ink.describe(size, biome)` 返回 `sheet`；`WorldFrame.sheet` 每帧可读；`resize()` 重算并通知 world 零件。

**为什么**：
- 层号 `L0/L1/L2` 是**合成顺序**，不是物理层。旧文档把「纸在房间里 / 膜在水上」当成层号语义，导致「L0 是桌面还是纸」自相矛盾。`space` 把「画在哪」从「画在第几层」里拆出来。
- 全屏合成必须用 5 参数 `drawImage`：`stage-smoke` 的假 ctx 会把设备像素当 CSS 目标，9 参数全屏会画错尺寸。这是 2026-11-19 调试出来的硬事实。

**什么条件下推翻**：如果将来一个站有多张纸（例如翻页书），`sheet` 要从单矩形升级为矩形数组；在那之前不要引入第二套坐标。

---

## ADR-05 · `costMs` 是**申报预算**，不是实测；实测帧时间另有 governor

**决定**：`costMs` 由零件作者按最坏路径申报，用于 `planBudget` 决定 LOD/挂起；`StageStats.frameMs` 是实测帧间隔，`renderScale` 是自动降分辨率系数。两者不许互相冒充。

**为什么**：
- 旧 `voxel-world` 报 `0.05ms`，实测 44ms/帧；唯一真瓶颈在预算表里完全不可见，测试全绿但 `/still` 22.7fps。
- 现在 `voxel-world.costMs = 9`，`still` 总申报 13.52 > 12，诚实地降 `low`（`voxel/bubbles/pixel-post` 降档），用户能在菜单看到 Quality。
- 自动 governor：fps<48 连续 12 帧降 0.85（最低 0.55）；fps>57 连续 240 帧升 1.08；切后台的大 dt 不触发。它只改 `renderScale`，不改 `costMs`，避免「用降分辨率掩盖预算谎报」。

**什么条件下推翻**：如果某个零件在 `low` 下仍然 >16ms，应该优化或减少实体，不是继续调低 `costMs`；预算表必须保持「作者敢负责的数字」。

---

## ADR-06 · 零件可以自报 `E_UNSUPPORTED`；装配器把它记成 `unsupported`，不是 `E_PART_THROW`

**决定**：`create()` 抛出的错误若带 `code:'E_UNSUPPORTED'`，`stage` 记 `degraded`、`suspended`，不中断整页；`replan()` 必须把「instance 为 null、但 requires 已满足」的零件重新记成 `unsupported`，不许静默消失。

**为什么**：
- Node 假 DOM 的 canvas 禁止 `addEventListener`，而 `three.WebGLRenderer` 构造期必须挂 `webglcontextlost`；`koi-pond` 在预览门里会因此抛错。这是**能力不足**，不是运行期 bug。
- 之前 `replan` 清空 `degraded` 后只重算 `requires`，导致「create 自报 unsupported」的零件在 `degraded=[]`、`drawn=2/3` 的状态下消失；这正是 `verify:preview` 最后 4 条失败的原因。

**代价**：`E_UNSUPPORTED` 是一个受控后门，零件作者必须只在「真的没有画布/能力」时用；普通错误仍走 `E_PART_THROW`，不能被吞。

---

## ADR-07 · `/koi` 是 zz85 锦鲤池的**完整移植**，不是「只搬六个 JS 的 ink 近似」

**决定**：`shared/parts-library/koi/` 归档上游 **26 项**（运行源码、PWA、图标、8 张演示图），逐文件 `git hash-object` 与 GitHub blob SHA 一致；`shared/parts/koi-pond/index.ts` 按上游 `main.js` 的帧结构接回 **real / paint / ink 三条渲染路径**，以及相机、触摸、音频、三池底、三档雨。`shared/parts/koi-pond/` 不再保留任何 `.js` 副本。

**为什么**：
- 旧 `/koi` 是 ASCII 字符墙，`fillContent` 只生成水波字符，**永远画不出鱼**，标题被压住。
- A1 第一次接法只把六个 JS 复制进零件、把三条路径压成 ink 一条；结果是「有鱼，但不像原作」：没有池底焦散、没有 2.5D 相机、没有 Feed/Call、没有声音，也没有 paint。
- 用户明确要求以上游源码和真实运行画面为基准，不接受近似实现。完整移植后，三种 look 是三条不同的渲染链，而不是同一个 ink 换名字。

**关键修复**：
- `fishRT` 必须用 alpha **0** 清屏。最初用 `(0,0,0,1)`，空像素 alpha=1，composite 把整张鱼纹理当成不透明黑盖在水面上，real 全黑、池底和焦散全被吃掉。
- `pigRT` 必须用不透明白底；与 fishRT 的透明清屏是两套规则，不能混。
- **不再叠 `pixel-post`**：原件 finish 已完整；多一层暗角会压暗 real、压冷 ink。`/koi` 栈改为 `paper-ink + koi-pond`，预算 12ms，high LOD 11 条鱼。

**站点层**：
- `sites/koi/attach.ts` 把 Look（Ink/Watercolour/Real）、Touch（Ripple/Feed/Call）、Camera（Top/2.5D/Orbit）、Water（Pebble/Sky/Dark）、Weather（Dry/Drizzle/Rain）、Music（Off/Still/Flow）接到 Esc 菜单；Sound 由零件持有真实状态并广播。
- `?style=` / `?mode=` / `?cam=` / `?floor=` / `?rain=` / `?music=` 是正式深链接；`site-visual` 同时测「同会话菜单切换」和「刷新后深链接仍生效」。
- 壳的通用环境声在 `/koi` 关闭，避免两套水声叠加。

**什么条件下推翻**：如果单文件体积成为分发红线，先把 `import * as THREE` 改成命名导入做 tree-shaking；不要退回 ASCII，也不要删掉任何一条渲染路径来省体积。

**证据**：`docs/review-2026-11-19/after/koi-*`（桌面/手机三风格）、`shared/parts-library/koi/shot_*.png`（上游原始演示图）；`verify:site` 的 koi 行同时断言三风格帧差与 real 下标题颜色。

## ADR-08 · `/license` 导出必须裁切**主画布**的纸矩形，不另画一张

**决定**：`exportCard()` 接收 `paper:{canvas,rect}`，从 `stage` 主画布裁出纸矩形；文字/章按与 CSS 同一组百分比重新排；光用按下时的 `sunAngleAt(t_press)`；尺寸 1410×1000。

**为什么**：
- 旧导出是独立重绘：纸纹/光/章/文字各画一套，屏幕和文件必然漂移；用户拿到的是「另一张卡」。
- 裁切主画布保证纸纹、光、章、鱼（如果将来有）与屏幕**同一像素来源**；文字重排是因为 DOM 文字不在画布上，只能用同一组百分比逼近。
- 导出禁止交互提示（`playNote` 不进图）；印章副行 `NO COPY KEPT.` 中心对齐 0.8125W。

**验收**：`verify:license` 34/34 + 17/17；`verify:site` 检查导出 PNG 的 IHDR 是 1410×1000 且 >80KB。

---

## ADR-09 · 文档权威链收敛：README + DECISIONS > REVIEW；HANDOFF 旧段落要改

**决定**：
- `REVIEW-2026-11-19.md` 是**评审输入**，不是施工依据；它的第 0/1/2/3/4 步已经被 A1 执行，读它要知道哪些已落地。
- `DECISIONS.md`（本文）记录落地取舍；`HANDOFF.md` 保留工程细节，但 §0/§3.1/§3.2 的旧状态必须随代码更新。
- `COPY-SITES.md` 是文案单一来源；站点栈变化（`Sit`、`koi` 无 CTA）要同步，否则下一个人会按旧文案接。

**为什么**：
- 旧 README 的权威顺序把 HANDOFF 放第一，但 HANDOFF 仍写「7 个零件、koi 未接」；同时 PRODUCT-FORM 与 HANDOFF 对「三段词是否上屏」直接对立。读到哪份，决定施工方向完全不同。
- 这不是「文档写得不够多」，是**没有单一事实来源**。A1 后以代码 + 本文为准，旧文档只保留历史。

---

## ADR-10 · 成品视觉门独立于零件门

**决定**：新增 `tests/site-visual.mjs` / `npm run verify:site`。它只回答四个用户看得见的问题：画面不空白、四站到 ready/degraded、CTA 真改变画面、`/license` 导出真出 1410×1000 PNG。

**为什么**：
- 2026-11-19 的教训：`verify:sites` 124/124、`verify:dom` 82/82（当时）、`verify:stage` 44/44 全绿时，`/koi` 没有鱼、`/hug` 没有蒲公英、`/still` 没有 Sit。零件统计正确 ≠ 成品画面正确。
- 这个门不做像素级审美判断，只做「有没有」和「动不动」；审美仍由 `docs/review-2026-11-19/after/` 的截图与人工评审负责。

---

## ADR-11 · v1 的 `room-at-dawn` / `grand-atelier` 保持 D0，不强行接入

**决定**：`shared/parts-library/room-at-dawn`（v1 壳 `index.ts` 恒抛 `E_PART_NOT_MOUNTED`；上游 24 个 `src` 文件已入库，2026-11-24 从中拆出 9 个 `WorldFeature`，目前没有任何站或模板使用）与 `grand-atelier`（3 个原件 `.ts` 已入库；`piano-model.ts` 依赖 4 个未入库模块，v1 壳 `index.ts` 不 import 原件，只返回击弦时序占位）**不**升级为正式零件；`/license` 仍用 `paper-ink`。

**为什么**：
- 两个资产都不是「可直接接」的完整实现：一个 D0 未用，一个缺模块且只有击弦时序占位。
- 为了「用了 v1 资产」而把 `/license` 的纸换成不完整 3D 房间，会牺牲导出精度和首屏速度；这不是产品收益。
- 保留它们在 `parts-library` 作为参考，等有完整源码 + 明确的视觉收益再升级。

**什么条件下推翻**：拿到 `grand-atelier` 缺失的 4 个模块，且 `/license` 要做「房间里的一张桌子」而不是「一张纸」时。

---

## ADR-12 · `/hug` 推翻“纯 Canvas2D”裁决，完整移植原站草甸

**决定**：`/hug` 只装一件 `hug-meadow`（L1 / `world` / WebGL2）。它按原站 `DandelionStage` chunk 还原 10 株、1,335 颗种子、44 段/颗的 `InstancedBufferGeometry` + `LineSegments`、背景/雾/逆光/bokeh 与放飞时序；旧的 `field-ground` / `dandelion` / `boids` / `sun` / `pixel-post` 从站点栈移除。

**为什么**：
- 用户对照原站实机画面后明确否定近似版（“一坨屎”）。问题不在测试，而在**花球数量、绒毛密度、景深与构图**都是另一套东西；补丁式调参无法到同一画面。
- 原站代码体量小（13.9KB chunk）、无外部贴图、无后处理，完整移植的成本低于继续修旧 Canvas2D 栈。
- 旧 `dandelion` 源码仍被 preview / golden-run 引用，因此**不删除**，只从 `/hug` 栈摘掉。

**什么条件下推翻**：若目标设备大面积无 WebGL2，且不满足于构建层的草甸色渐变兜底，再补一件不透明的 L0 静态草甸；不要退回旧五件套。

## 当前零件栈

四站的零件栈、预算与 CTA 只在 [`STATUS.md`](./STATUS.md) 维护，本文不再复制这张表。核对命令：`sed -n 30,146p shared/sites/build.mjs`，看 `STATIONS` 里每站的 `parts` / `budgetMs` / `cta`。

## 当前验证门（2026-11-24 实测）

口径：Windows 11、无 playwright、无头 Edge；评审基线 HEAD `1fce19c`；按 npm script / 命令计 19 条，复合脚本取其中最差的结果。逐命令输出见 [`review-2026-11-24/arch/AUDIT.md`](./review-2026-11-24/arch/AUDIT.md) §1。

| 结果 | 数量 | 命令 | 备注 |
|---|---|---|---|
| 绿 | 7 | `typecheck` · `verify:stage` · `verify:core` · `verify:nexus` · `verify:nexus:full` · `verify:sites` · `verify:preview` | `verify:stage` = stage-smoke 44/44 + mutation 6/6 + parts-composition 22/22；`verify:sites` 119/119；`verify:preview` 811/811 |
| 红 | 2 | `verify:reuse` · `verify:clock` | 原因见下 |
| 本机不可跑 | 10 | `verify:dom` · `verify:fingerprint` · `verify:license` · `verify:input` · `verify:field` · `verify:paper` · `bench:parts` · `bench:gl` · `bench:blend` · `shot` | 全部依赖 `tests/lib/browser.mjs`，它只认 macOS 的 playwright 缓存路径；其中包括全部成品视觉门和 3 条 bench |

两条红的原因：

- **`verify:reuse` —— 行尾，不是声明写错。** 本机工作区有 99 个已跟踪文件是 CRLF / 混合行尾（`git ls-files --eol`：`w/crlf` 85 个、`w/mixed` 14 个），manifest 里声明的字节数等于 git blob，磁盘字节 = blob + 文件内 CR 个数，于是「声明 ≠ 磁盘」。同一份代码在 LF 副本里两个红脚本都是绿的（50 项、90 项断言）。
- **`verify:clock` —— 与行尾无关。** `shared/parts/dandelion/index.ts:291` 与 `:337` 调 `performance.now()`，与同文件 `:14` 的注释相反，LF 副本同样 `FAIL 2/5`。

跑之前要知道的四件事（同见评审 §4.1）：

1. `npm run verify:stage` 会原地改写 `shared/stage/stage.ts` 6 次（`tests/stage-mutation.mjs:60,71,82`）；有人并发施工时不要在真实工作区跑。
2. `verify:field` 拿不到浏览器时打印 SKIP 并以 0 退出（`tests/field-visual.mjs:177`），在这台机器上是假绿，所以上表记为「不可跑」。
3. `verify:site` 不在这 19 条里；它同样依赖 `tests/lib/browser.mjs`，并且会往 `dist/qa/` 写文件。
4. 没有 CI、没有 lint，所有门靠手动跑。

## 待裁决（2026-11-24 评审提出）

下列三件事用户尚未拍板，**都还不是决策**。「建议」取自 [`REVIEW-2026-11-24.md`](./review-2026-11-24/REVIEW-2026-11-24.md) §5.4；「拍板前不执行」是护栏。拍板后把结论写成新的 ADR，并删掉本节对应那一行。

| # | 问题 | 选项 | 建议 | 拍板前不执行 |
|---|---|---|---|---|
| 1 | `/still`、`/koi` 是否先从入口撤下 | ① 先撤；② 不撤，修好之前照常列出 | 撤。顺序：`/license` 先做透 → `/hug` 补链接 → `/koi` 移出四站、保留为 A2 模板 → `/still` 修好引擎再回归 | 不改入口页的站清单；不删两站的源码、预设与模板。评审 §5.1 第 7 条里「`/still`、`/koi` 标预览或下架」这半句一并挂起 |
| 2 | A2 与四站：同仓还是分仓 | ① 同仓、分线、分入口；② 分仓（运行时两份） | 同仓、分线、分入口，保住「同一套零件」。PM 建议分仓，代价是运行时两份 | 不搬 `shared/product/`；不改模板构建对 `shared/stage/`、`shared/parts/` 的 import 路径 |
| 3 | `/koi`「不设带走入口」与成立判据③（离开时手上有一件东西）冲突，以谁为准 | ① 以「不设带走入口」为准，承认它是场景不是站；② 以判据③为准，给它带走物 | 以判据③为准：要么给它带走物，要么承认它是场景不是站 | 不给 `/koi` 加按钮、导出或剪贴板；不改 `COPY-SITES.md` 的 `/koi` 行；不把 `/koi` 从四站口径里除名 |

## 2026-11-24 评审输入

评审 §4.2 把实测到的问题归并成 6 个根因。**它们尚未成为决策**：下表只记录评审的归因，对应的调整在评审 §5.1（P0，10 条）；其中会碰到本文 ADR-06（就绪与降级）、ADR-05（申报预算）、ADR-12（零件自触发）的几项，等调整落地后再决定是改写还是新写 ADR。

| # | 根因 | 一句话 |
|---|---|---|
| R1 | 异步零件的生命周期不在壳的管辖内 | `/still` 黑屏 17.8 s，无 WebGPU 时没有提示 |
| R2 | 画布像素尺寸有两个责任人 | 画面只画在左上角，桌面 resize 后同样坏 |
| R3 | 状态有两个真相源 | 遮罩还在时 `snapshot().state` 已报 degraded；卡死时句柄仍报 ready |
| R4 | 预算建立在申报值上，降档一刀切 | `/still` 三件零件同时降 low；`kb` 没有任何代码在读 |
| R5 | 输入没有「模态 / 因果」层 | 菜单开着噪音也放飞；点草地不带链接；手机无菜单入口；捏合缩放 |
| R6 | 重活排在首帧之前且同步阻塞 | `/koi` 4.3 s 全黑；`/still` 25 s 长任务 |

## 仍开放（不是「已完成」）

1. `/still` 在本机（无头 Edge、Intel Iris Xe 核显）是 `degraded low`、`renderScale 0.55`：空闲机 32 fps，走查期间就绪后首测 3.2–4.5 fps（[`ux-sites/WALKTHROUGH.md`](./review-2026-11-24/ux-sites/WALKTHROUGH.md) §1、评审 §3.1）。真机独显可能 60；如果目标机器是核显，需要减实体/换低档，不是继续压 `costMs`。
2. `/koi` 单文件 607,501 B（`verify:sites` 输出，2026-11-24；three 全量）。可做命名导入 tree-shaking，但不要为体积退回 ASCII。
3. `/hug` 放飞后的种子云密度/透明度是审美判断，需人工看 `after/hug-release.png` 再定，不是测试能判。
4. `/hug` 的 Wind 已接（`shared/sites/mic.ts` → `stage.setAudio()` → `hug-meadow` 读 `frame.audio.level`，`shared/parts/hug-meadow/index.ts:475-478`），响度超过 0.12 就触发放飞；但只有**真实设备/权限**能验，而且 2026-11-24 实测到环境噪音就会把蒲公英全部放飞（走查 UX-07，评审 §5.1 第 4 条）。`blow-input` 的原始算法没有进产物。麦克风仍是可选项（点 Wind 才申请），不是首屏权限。
5. `/license` 屏幕 vs 导出只做了尺寸/体积门，没有逐像素比对；文字重排是百分比逼近，不是同一字体渲染路径。
6. `voxel-world` 的异步设备丢失现在会通过 `PartEnv.onError` 落进 `degraded`（2026-11-19 A1 修复），但**还没有用户可读的恢复路径**：世界没了，页面只剩 tide 底材和「Quality Low」。下一步要么给一句「水静下来了」的诚实文案，要么重建设备；不要靠测试顺序掩盖。`site-visual` 把 `still` 放最前跑，仍是为了避免前三个页面的 GL 上下文把它拖成 flaky。
7. `site-visual` 的「CTA 帧差」对 `/hug` 是 1.5 阈值、`/still` 是 8；这两个阈值是经验值，换机器/换 LOD 可能误报。
