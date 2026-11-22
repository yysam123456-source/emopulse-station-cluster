# COPY-SITES — 四站英文文案终稿

> 只放文案，不放议论。作者：产品。**消费者：`shared/sites/copy.mjs`（构建期逐字校验）；四座站。`**
>
> **这份文档现在是一条构建输入的单一来源**：`shared/sites/copy.mjs` 逐字照抄这里，`site-build` 断言每个值都能在本文找到原文（变异验证过：塞回旧句立刻红）。**所以改任何一个字都是协同改动**：先改这里，再改 `copy.mjs`，否则构建红。**不许为了过门去改本文——本文是标准，不是产物。** **`content/*.ts` 是未迁移的旧文案源**：虽被站点 TS 文件 import，但**不进构建产物**；现行门只校验 `copy.mjs`。§5/§6 的替换表是历史迁移记录，今天照它跑 grep 会在 content/ 上全红而构建全绿——这是"两套源并存"的已标注现状，**不是构建坏了**。
>
> **praise = 冻结 legacy**：仓库有 `sites/praise/`（源码完整、仍在注册表），但**无构建产物、不进 `copy.mjs`、不接入本期产品口径**。本文 §5/§6 里所有 `praise.ts` 行都是**历史句式规范**（给将来复用者看），**不是本站待办**。四站口径仍是 `/license` `/hug` `/still` `/koi`。
>

> **2026-11-20 现状（优先于本文历史迁移段）**：路由是 `/koi`（不是 `/koi-pond`），承载 zz85 完整锦鲤池的 ink / paint / real 三种 look。`/koi` 没有主按钮，也没有「Keep this frame」；Look / Touch / Camera / Water / Weather / Music 是 Esc 菜单里的二级控制，`?style=` 是正式深链接。§6.4 中「风格切换器不存在、只做 pond 一条路由」是旧 ASCII 方案的迁移记录，已作废；保留它只为解释历史，不再作为施工口径。

> 三条铁律（每句都过了一遍）：**不声称任何健康/疗愈效果** · **不编造社交证据**（不出现"有人回赠""已送达""有人在等你"——零服务端不可能知道） · **不出现**消费引导、外部链接、注册入口、连续天数、打卡、进度成就、"你今天完成了"。
>
> 词数按 §2.1 的三层限制：H1 ≤ 2 词、hook ≤ 12 词、主按钮 ≤ 3 词。**以下全部是终稿，没有备选。**

---

## 1. 首屏三层

### `/license` · room

| 层 | 英文 | 词数 |
|---|---|---|
| H1 | `License` | 1 |
| hook | `A permit to simply be.` | 5 |
| 主按钮 | `Stamp it` | 2 |

### `/hug` · field

| 层 | 英文 | 词数 |
|---|---|---|
| H1 | `Hug` | 1 |
| hook | `Send a little warmth as a link.` | 7 |
| 主按钮 | `Let it go` | 3 |

### `/still` · tide

| 层 | 英文 | 词数 |
|---|---|---|
| H1 | `Still` | 1 |
| hook | `Nothing here needs an answer.` | 5 |
| 主按钮 | `Sit` | 1 |

### `/koi` · ink / paint / real

| 层 | 英文 | 词数 |
|---|---|---|
| H1 | `Koi Pond` | 2 |
| hook | `Watch the fish. That is all.` | 6 |
| 主按钮 | **无** | 0 |

> **2026-11-19 A1 裁决**：这一站是连续场，读位置不读「决定」；`COPY.koiPond.cta = null`。旧文档里的 `Watch` 按钮**不实现**——一个不改变任何东西的按钮会把「看鱼」降级成「任务」。
| 主按钮 | `Watch` | 1 |

**首屏除此之外一个字都没有。** 没有副标题、没有页脚、没有版本号、没有"向下滚动"、没有第二个按钮、没有跨站链接。

---

## 2. Esc 二级菜单（四站共用一套，标签必须完全一致）

| 位置 | 标签 | 值 / 选项 | 默认 |
|---|---|---|---|
| 菜单标题 | `MENU` | — | — |
| 第 1 项 | `Sound` | `Off` / `On` | `Off` |
| 第 2 项 | `Motion` | `Full` / `Reduced` | 跟随系统；系统为 reduce 时 `Reduced` |
| 第 3 项 | `Quality` | `High` / `Normal` / `Low` | `High` |
| 第 4 项（仅 `/hug`） | `Wind` | `Off` / `On` | `Off` |
| 第 5 项 | `About` | 见下（每站一段，≤ 30 词） | — |
| 第 6 项 | `Credits` | `Parts are adapted from public demos or written here. Each part names its source in its README.` | — |
| 固定末行 | — | `Nothing here is sent anywhere.` | — |
| 关闭 | `Close` | — | — |

### `Wind` 打开后的固定提示（仅 `/hug`）

```
Microphone on. Nothing is recorded. Wind only.
```

关掉即消失。**不出现**"我们听到了你"、"正在聆听"、"吹一下试试"。

### `About` 正文（每站一段，≤ 30 词）

| 站 | 英文 |
|---|---|
| `/license` | `A desk, a sheet of paper, a stamp. The number on your card is the only copy.` |
| `/hug` | `A meadow at dusk. The link carries one thing: which page it came from.` |
| `/still` | `Water, and a light that goes down. No one is counting how long you stay.` |
| `/koi` | `A koi pond in ink, watercolour, or real water. Move the pointer to stir it. Nothing is sent anywhere.` |

### 2.1 每一项走哪条通道（审计结果：**全四站只有 1 处「世界注入」**）

四条通道的定义（来自 `PRODUCT-FORM` §2.3 与 HANDOFF A.3）：

| 通道 | 是什么 | 允许吗 |
|---|---|---|
| **纯 UI** | 只改 DOM / 排版，不触世界 | ✅ 随便加 |
| **世界参数** | 改世界的**持续状态**（LOD、reducedMotion、音频开关），不是事件 | ✅ 允许，但**不得带"决定"语义** |
| **世界输入（连续）** | 连续量（麦克风 level/bands），读的是"多少"，不是"哪一下" | ✅ 允许，只 `/hug` 一处 |
| **世界注入（决定/边沿）** | 一次**决定**，用 `stage.setPointer` 边沿表达 | ⚠️ 每站最多 1 处，且**只准在 UI 真的驱动世界时**用 |

| 站 | 菜单项 | 通道 | 备注 |
|---|---|---|---|
| 四站 | `MENU`（标题）/ `About` / `Credits` / `Close` | 纯 UI | — |
| 四站 | `Sound`（Off/On） | 纯 UI：音频**输出**开关 | 不改世界，只决定你有没有声音 |
| 四站 | `Motion`（Full/Reduced） | 世界参数 | 零件读它降速，是一次设定不是事件 |
| 四站 | `Quality`（High/Normal/Low） | 世界参数 | `setRenderScale` / 预算，同上 |
| `/hug` | `Wind`（Off/On） | 世界输入（连续） | 走 `stage.setAudio`，只有 level/bands，无"决定" |
| `/koi` | `Look`（Ink / Watercolour / Real） | 世界参数 | 切三条渲染路径，不是滤镜 |
| `/koi` | `Touch`（Ripple / Feed / Call） | 世界参数 | 改触摸模式，读位置不读"决定" |
| `/koi` | `Camera`（Top / 2.5D / Orbit） | 世界参数 | 相机档位，可连续转 |
| `/koi` | `Water`（Pebble / Sky / Dark） | 世界参数 | 池底材质 |
| `/koi` | `Weather`（Dry / Drizzle / Rain） | 世界参数 | 雨档 |
| `/koi` | `Music`（Off / Still / Flow） | 世界参数 | 音乐档，Sound 开关仍归零件 |
| — | — | — | **以上全部加起来，世界注入 = 0** |

**菜单之外的两处，也要分清**：

| 站 | 控件 | 通道 | 位置 |
|---|---|---|---|
| `/hug` | `Let it go` | **世界注入（决定）** — 全四站唯一一处 | 首屏 |
| `/license` | `Stamp it` | 纯 UI + 站点内时序 | 首屏（三段仪式由站点自己的 DOM 事件驱动，**不进世界**） |
| `/license` | `Stamp again` | 纯 UI + 站点内时序 | **在纸上，不在 Esc 菜单**——把一次仪式动作藏进菜单，它就不是仪式了 |
| `/license` | `Save it` / 复制编号 | 纯 UI（导出是裁切当前帧） | 纸下方 |
| `/still` | `Sit` | 纯 UI + 站点内状态切换 | 首屏 |
| `/still` | `Copy the line` | 纯 UI（**未实现**） | 停留 ≥60s 后；见 §开放项 |
| `/koi` | **无主按钮** | — | 首屏——连续场，读位置不读"决定"；`cta=null` |
| `/koi` | — | — | 不设带走入口；看鱼本身就是目的 |

**审计结论**：全四站 **1 处世界注入**（`/hug` 的 `Let it go`），且它不在任何菜单里。四站里三站完全不需要注入——**这个比例说明「站点是翻译层」是对的：默认不翻译，只在 UI 真的驱动世界时翻译一次。** 若将来算出多于一处，那不是文案问题，是有地方把 UI 当成了世界入口，要先改设计。

---

## 3. 沉浸期文案（随状态出现，其余时间不显示）

### `/license`

| 触发 | 英文 | 出现位置 |
|---|---|---|
| 盖章落下（章面） | `APPROVED` | 纸面，朱砂 |
| 章下副行（小字） | `NO COPY KEPT.` | 纸面，等宽 |
| 开票即印（盖章前后都在） | `No.` + `EMP-YYYYMMDD-NNN` | 纸面，等宽，**可选中**。编号是这张纸一出生就有的，不是盖章授予的 |
| 审批完成后的唯一按钮 | `Save it` | 纸下方 |
| 审批完成后（低对比，二级） | `Stamp again` | 纸角 |
| 审批完成后（低对比，二级） | `drag to move the light · f to fold the corner` | 纸角，`Stamp again` 下一行 |
| 保存完成 | `Saved.` | 按钮原位，2s 后回退为 `Save it` |

> **2026-11-19 A1 裁决**：三段状态机**不画进度条、不列三步**；只允许一个极小的状态词（`approved`）落在纸面底部，作为「章已落下」的回声。完整三段只在 Esc 的 About 里说明。

### `/hug`

| 状态 | 英文 |
|---|---|
| `ready`（首屏之后稳定态） | `Ready when the wind is.` |
| `drifting` | `It is on its way.` |
| `away`（种子离场 3s 后） | `Gone. Keep some for yourself.` |
| `away` 之后出现的按钮 | `Copy the link` |
| 从 `?from=hug` 进入时的 hook 下加一行 | `Someone sent you a little warmth.` |
| 从 `?from=hug` 进入时主按钮变为 | `Send one on` |
| 麦克风打开后（停留到关闭） | `Microphone on. Nothing is recorded. Wind only.` |

### `/still`

| 触发 | 英文 |
|---|---|
| 按下 `Sit` 后 10s | `Stay as long as you like.` |
| 停留 ≥ 60s 出现入口 | `Copy the line` |
| 复制完成 | `Copied.` |

五档由**光的状态**决定的句子（这就是带走物的正文，见 §4）：

| 光的状态 | 英文 |
|---|---|
| 1 · 光还满 | `The light is still on the water.` |
| 2 · 开始退 | `The light is leaving the surface.` |
| 3 · 过半 | `The light is thinner than when you sat down.` |
| 4 · 快没了 | `The light is almost under.` |
| 5 · 退完 | `The light is gone. The water is still here.` |

> 第 5 句是全站落点，**不要改**。五句都不含数字。

### `/koi`

| 触发 | 英文 |
|---|---|
| 停留 ≥ 60s 出现入口 | `Keep this frame` |
| 保存完成 | `Saved.` |
| 一级下的二级入口 | `Copy the seed link` |
| 复制完成 | `Copied.` |

> 除此之外**没有状态文案**。这一站刻意不给任何提示语——"看就够了"是它的全部内容，一句提示都会把它变成需要回应的东西。

---

## 4. 带走物文案

### `/license` 卡（**1410 × 1000**；与屏上纸同比例 1.41，等比例裁切）

| 字段 | 内容 | 格式 |
|---|---|---|
| 页眉（等宽，大写） | `PERMIT TO REST` | 常量 |
| 编号标签 | `No.` | 常量 |
| 编号值 | `EMP-20261118-317` | `EMP-YYYYMMDD-NNN`，日期为盖章当日，NNN 为 100–999 |
| 日期 | `2026.11.18` | `YYYY.MM.DD` |
| 宣言句（正文，≤ 2 句） | `This permit entitles the holder to rest, to stop explaining, and to take up space.` | 常量 |
| 章（朱砂，右下 1/6 处恒定） | 主 `APPROVED` · 副 `NO COPY KEPT.` | 常量 |
| 光带角度 | 由按下 `Stamp it` 那一刻的 `frame.t` 决定 | 不写字 |

> 编号在屏幕上**可选中**（这是它作为"主带走物"的唯一条件）。`No copy is kept.` 不进卡片正文，只在 Esc 的固定末行出现。

### `/hug` 链接与已寄出文案

| 项 | 内容 |
|---|---|
| 链接形状 | `https://<host>/hug?from=hug`（`from` 走白名单，非白名单值一律落回 `someone`，且**不回显**任意输入） |
| 复制入口 | `Copy the link` |
| 已寄出（屏幕） | `Gone. Keep some for yourself.` |
| 可复制短句（次载体，本地模板） | 见下方 `HUG_LINES` 终稿，一次给一句 |
| 收链接者看到 | `Someone sent you this link.` + 主按钮 `Send one on` |

`HUG_LINES` 终稿（六句，全部无人称或第二人称，**没有"我"**）：

```
May today be gentle with you.
This one is yours.
For whatever today was.
You do not have to carry it all.
Warmth, no questions asked.
No reply needed. None expected.
```

### `/still` 可复制短句

正文即 §3 那五档之一（按当前光的状态），**不含任何数字**：没有时长、没有米数、没有百分比、没有日期时间。复制范围只含那一句，不含站名、不含 URL。

### `/koi` 图与链接

| 项 | 规定 |
|---|---|
| 图 | PNG，一帧池面。**无边框、无标题、无水印、无任何文字**（含站名与编号） |
| 深链接 | `https://<host>/koi?style=ink|paint|real`；另有 `mode/cam/floor/rain/music` 可组合 |
| 链接说明 | 无。由 `Copy the seed link` 的按钮标签自解释，不加提示语 |

---

## 5. 旧文案替换清单

> **两个节分工**：本节按**问题类型**归类，回答"为什么这句不能留"；执行请用 **§6**（按文件逐行，带行号与替换命令）。
>
> **权威口径：24 处改动 = 23 句替换 + 1 条删除**，其中硬违反 12、语体 7、与终稿冲突 4、删除 1。分布见下表（这张表是自洽的，可直接核对）：
>
> **其中 `praise.ts` 的 10 处是历史句式规范**（站不接入、不进 copy.mjs）；其余 14 处对应四站的旧源 `content/*.ts`。

| 文件 | 硬违反 H | 语体 V | 冲突 C | 删除 D | 小计 |
|---|---|---|---|---|---|
| `hug.ts` | 3 | 4 | 0 | 0 | **7** |
| `still.ts` | 0 | 0 | 2 | 1 | **3** |
| `license.ts` | 0 | 1 | 1 | 0 | **2** |
| `koi.ts` | 0 | 1 | 1 | 0 | **2** |
| `praise.ts` | 9 | 1 | 0 | 0 | **10** |
| **合计** | **12** | **7** | **4** | **1** | **24** |

（此前报过 21、22，都是漏计：`praise` 的 `exportedEn` 一度在脚注、`koi` 的 pond `description` 一度只在脚注。以本表为准。）

### 5.1 硬违反 · 必须改（编造社交证据 / 承诺）

| # | 文件 | 键 / 位置 | 旧 | 新 | 问题 |
|---|---|---|---|---|---|
| 1 | `hug.ts` | `hookEn` | `Send a hug. Someone will hug you back.` | `Send a little warmth as a link.` | 声称有人会回赠 |
| 2 | `hug.ts` | `awayEn` | `Delivered. Keep some for yourself.` | `Gone. Keep some for yourself.` | 声称已送达 |
| 3 | `hug.ts` | `HUG_LINES[3]` | `Take a breath. I am with you.` | `No reply needed. None expected.` | 编造一个陪伴者"我" |
| 4 | `praise.ts` | `OPENERS[2]` | `You made someone else feel lighter.` | `You got through the part nobody saw.` | 编造用户对他人的影响 |
| 5 | `praise.ts` | `MIDDLES[1]` | `Your effort has been seen, even when nobody said it.` | `The effort was real, whether or not it was noticed.` | 声称有人看见 |
| 6 | `praise.ts` | `CLOSERS[2]` | `Someone is glad you exist. That someone is here.` | `This page is glad you came by.` | 声称有人在场 |
| 7 | `praise.ts` | `CLOSERS[5]` | `Come back whenever you need to hear it again.` | `Nothing here expires.` | 留存话术 |
| 8 | `praise.ts` | `MIDDLES[4]` | `Your presence makes ordinary places better.` | `Ordinary places are better with someone in them.` | 编造影响 |
| 9 | `praise.ts` | `MIDDLES[2]` | `You turned a small moment into something warm.` | `Small moments count, even unlogged.` | 编造事件 |
| 10 | `praise.ts` | `MIDDLES[3]` | `You did not give up when it would have been easier.` | `Stopping was allowed, and you kept going anyway.` | 编造事实 |
| 11 | `praise.ts` | `MIDDLES[5]` | `You gave yourself permission to rest. That matters.` | `Rest needs no permission, and none was asked for.` | 编造事件 |
| 12 | `praise.ts` | `MIDDLES[0]` | `Even on the hard days, you found a way.` | `Hard days are hard. That is the whole of it.` | 编造事实 |

### 5.2 语体违反或与终稿冲突 · 应改

| # | 文件 | 键 | 旧 | 新 | 问题 |
|---|---|---|---|---|---|
| 13 | `hug.ts` | `backEn` | `Hug them back` | `Send one on` | 暗示有一个"对方"，且"回赠"不成立 |
| 14 | `hug.ts` | `HUG_LINES[1]` | `You deserve a really good hug.` | `This one is yours.` | `deserve` 是价值判断（夸夸专属，不扩散） |
| 15 | `hug.ts` | `HUG_LINES[2]` | `This one is for getting through it.` | `For whatever today was.` | 预设用户经历了某件事 |
| 16 | `hug.ts` | `HUG_LINES[0]` | `I hope today treats you gently.` | `May today be gentle with you.` | 第一人称 = 虚构一个作者 |
| 17 | `still.ts` | `hookEn` | `A quiet corner. Nothing to do here.` | `Nothing here needs an answer.` | "a quiet corner" 与满幅无轴的构图矛盾（全站没有角落） |
| 18 | `still.ts` | `touchHintEn` | `Hold to stay · slide to look around` | **删除** | 与"零动作"矛盾：没有可环顾的操作 |
| 19 | `still.ts` | `leavingEn` | `Take a little quiet with you.` | `Take the line.` | 带走物是一句话，不是一个氛围 |
| 20 | `license.ts` | `hookEn` | `A permit to simply be. No strings attached.` | `A permit to simply be.` | `No strings attached` 是推销腔 |
| 21 | `koi.ts` | `pond.hookEn` | `A pond you can sit beside, anytime.` | `Watch the fish. That is all.` | `anytime` 是承诺；且"坐"与本站的点触语义不符 |
| 22 | `koi.ts` | `pond.description` | `A quiet koi pond. Watch the fish drift and let the day slow down.` | `A koi pond drawn in characters. Slow water, a few fish, nothing to solve.` | `let the day slow down` 是软性功效暗示 |
| 23 | `license.ts` | `declarationEn` | `You are hereby permitted to rest, to begin again, and to take up space.` | `This permit entitles the holder to rest, to stop explaining, and to take up space.` | 与终稿不一致；"to begin again" 是励志腔，`to stop explaining` 才是这一站的情绪 |
| 24 | `praise.ts` | `exportedEn` | `Keep it. You earned it.` | `Keep it. Nothing here is counted.` | `You earned it` 是价值判断，且暗示有账本 |

附（随"站不做"一起消失，但复用前同规则）：`koi.ts` 的 `ink.description` 含 `meditative`（暗示冥想功效）、`watercolor` 整条不再上线——两段整块删（§6.4）。



### 5.3 中文清理（另计）

`content/*.ts` 的 `hookZh` / `noteZh` / `leavingZh` / `labelZh` / `stageZh` / `declarationZh` / `exportedZh` 等 `*Zh` 键、`controlLabel()` 的 `locale` 参数、`sites/*/override/template.html` 的 `#sub-zh`：**全删**。验收：产物内 `[\u4e00-\u9fff]` 计数 = 0。

---

## 6. `content/*.ts` 可执行替换表（24 处：23 句替换 + 1 条删除）

**怎么用**：行号按当前 HEAD 的 `content/*.ts`（`hug` 38 行 / `koi` 29 / `license` 28 / `praise` 66 / `still` 25）。**行号会随改动漂移，所以每条都给了原文——请用原文匹配（`sed`/编辑器查找替换），行号只用来对照。** 替换后跑 §6.7 的校验命令。

**本节编号按文件顺序，§5 的编号按问题类型——两套编号不同，别混用。** 两处条目数都是 24。

**类型**：`H` = 硬违反（编造社交证据/承诺，必须改）· `V` = 语体违反 · `C` = 与终稿冲突 · `D` = 删除。

### 6.1 `content/hug.ts`

| # | 行 | 类型 | 原文 | 新文 |
|---|---|---|---|---|
| 1 | 4 | **H** | `Send a hug. Someone will hug you back.` | `Send a little warmth as a link.` |
| 2 | 9 | V | `Hug them back` | `Send one on` |
| 3 | 15 | **H** | `Delivered. Keep some for yourself.` | `Gone. Keep some for yourself.` |
| 4 | 20 | V | `I hope today treats you gently.` | `May today be gentle with you.` |
| 5 | 21 | V | `You deserve a really good hug.` | `This one is yours.` |
| 6 | 22 | V | `This one is for getting through it.` | `For whatever today was.` |
| 7 | 23 | **H** | `Take a breath. I am with you.` | `No reply needed. None expected.` |

> 第 24–25 行（`You do not have to carry it all.` / `Warmth, no questions asked.`）**保留**。替换后 `HUG_LINES` 仍为 6 句。
> 第 34–38 行 `backHint()` 的白名单**保留**，但要加一条：`from` 非白名单值落回 `someone` 且**不回显**——现有实现已符合（`allowed.includes`），不动。

### 6.2 `content/still.ts`

| # | 行 | 类型 | 原文 | 新文 |
|---|---|---|---|---|
| 8 | 5 | C | `A quiet corner. Nothing to do here.` | `Nothing here needs an answer.` |
| 9 | 9 | C | `Take a little quiet with you.` | `Take the line.` |
| 10 | 16–17 | **D** | `Hold to stay · slide to look around` + 对应 `touchHintZh`（两行整块删） | — 与"零动作"矛盾：这站没有可环顾的操作 |

> 第 7 行 `noteEn: 'Stay as long as you like.'` **保留**（按 `Sit` 后 10s 出现）。
> 第 12–14 行 `controls` 里的 `labelEn` 保留（`Sit` / `Listen` / `Leave`），但 **`Listen` 与 `Leave` 移入 Esc 菜单**，首屏只留 `Sit`（§2.1 三层限制）。

### 6.3 `content/license.ts`

| # | 行 | 类型 | 原文 | 新文 |
|---|---|---|---|---|
| 11 | 4 | V | `A permit to simply be. No strings attached.` | `A permit to simply be.` |
| 12 | 10 | C | `You are hereby permitted to rest, to begin again, and to take up space.` | `This permit entitles the holder to rest, to stop explaining, and to take up space.` |

> 第 8 行 `stages` **保留**（`verifying` / `stamping` / `approved`），但**不画进度条/不列三步**；首屏只允许一个极小的 `approved` 状态词，完整说明在 Esc 的 About 里（§1.1 的形状裁决，2026-11-19 A1）。
> 第 13 行 `sealText: 'APPROVED'` 保留；章下副行 `NO COPY KEPT.` 是本轮新增，加在 `LICENSE_COPY` 里（键名建议 `sealSub`）。
> 第 14 行 `exportedEn: 'Your license is ready.'` 保留。

### 6.4 `content/koi.ts`

| # | 行 | 类型 | 原文 | 新文 |
|---|---|---|---|---|
| 13 | 6 | C | `A pond you can sit beside, anytime.` | `Watch the fish. That is all.` |
| 14 | 9 | V | `A quiet koi pond. Watch the fish drift and let the day slow down.` | `A koi pond drawn in characters. Slow water, a few fish, nothing to solve.` |

> **整块删除**：第 11–18 行（`ink`）与第 19–26 行（`watercolor`）——本期只做 `/koi-pond` 一条路由，风格切换器不存在（§4.1）。`KoiStyle` 类型收成 `'pond'`。
> 删除理由不只"站不做"：`ink.description` 里的 `meditative` 是**暗示冥想功效**的措辞。

### 6.5 `content/praise.ts` — **历史句式规范，非本站待办**（praise = 冻结 legacy，无产物、不进 `copy.mjs`）

| # | 行 | 类型 | 原文 | 新文 |
|---|---|---|---|---|
| 15 | 10 | V | `Keep it. You earned it.` | `Keep it. Nothing here is counted.` |
| 16 | 19 | **H** | `You made someone else feel lighter.` | `Warmth you gave away is still warmth.` |
| 17 | 26 | **H** | `Even on the hard days, you found a way.` | `Hard days are hard. That is the whole of it.` |
| 18 | 27 | **H** | `Your effort has been seen, even when nobody said it.` | `Effort does not need a witness to be real.` |
| 19 | 28 | **H** | `You turned a small moment into something warm.` | `Small moments are allowed to count.` |
| 20 | 29 | **H** | `You did not give up when it would have been easier.` | `Stopping was allowed. It still is.` |
| 21 | 30 | **H** | `Your presence makes ordinary places better.` | `Ordinary places are better with someone in them.` |
| 22 | 31 | **H** | `You gave yourself permission to rest. That matters.` | `Rest needs no permission, and none was asked for.` |
| 23 | 37 | **H** | `Someone is glad you exist. That someone is here.` | `This page is glad you came by.` |
| 24 | 40 | **H** | `Come back whenever you need to hear it again.` | `Nothing here expires.` |

> 这里实际是 **10 条**（上一版把第 15 条放在脚注）。第 17–24 行（`OPENERS[0..1]`、`OPENERS[3..5]`）本轮**不动**，但要登记它们的性质：
> - `You showed up today, and that counts.` —— **允许**："你在这儿"是本页可观测的事实。
> - 其余四条（`The way you keep going…` / `Your patience…` / `You notice things…` / `You are allowed to be proud…`）—— **若将来复用此站，必须重写**：它们对用户的经历下断言，而我们一无所知。

### 6.6 中文清理清单（逐行）

| 文件 | 删除行 |
|---|---|
| `hug.ts` | 5、7、10、12、14、16（`*Zh` 共 6 行）；文件头注释里的"英文主 + 中文副"一并改掉 |
| `still.ts` | 6、8、10、17，以及 12–14 的 `labelZh` 三个值；**并删 `controlLabel()` 的 `locale` 参数**（21–25 行收成 `controlLabel(id)`） |
| `license.ts` | 5、7、9（`stageZh`）、11、15 |
| `koi.ts` | 7、15、23（随 `ink`/`watercolor` 整块删除，18、26 一并消失） |
| `praise.ts` | 5、7、9、11 |

### 6.7 校验命令（**历史迁移记录，不是现行门**）

⚠️ `content/*.ts` 被站点 TS 文件 import，但**不参与构建**；产物文案只认 `shared/sites/copy.mjs`（已兑付终稿）。所以今天直接跑下面四条 grep，**会在 content/ 上全红而构建全绿**——这是"两套源并存"的真实状态，不是构建坏了。**别为让这些命令变绿去改 `copy.mjs`，也别删 content/**；如要消除并存，需主理人另立迁移任务。

```bash
# 1) 中文归零（产物级，dev 期可先只看 content/）
grep -rnP '[\x{4e00}-\x{9fff}]' content/ | grep -v '^content/[a-z]*\.ts:[0-9]*:\s*//' | wc -l   # 期望 0（注释除外）

# 2) 硬违反词归零
grep -rn 'will hug you back\|Delivered\.\|I am with you\|someone else feel\|has been seen\|glad you exist\|Come back whenever\|makes ordinary places\|turned a small moment\|did not give up\|gave yourself permission\|found a way' content/

# 3) 旧 hook 归零（确认新终稿已生效）
grep -rn "A quiet corner\|No strings attached\|sit beside, anytime\|let the day slow down" content/

# 4) 每站 hook 词数（人工核对，≤12）
grep -n "hookEn" content/*.ts
```

---

## 7. 可直接抄进 T13 的常量表

```ts
// L5 UI 共用文案（四站一致，不得逐站改写）
export const UI = {
  menuTitle: 'MENU',
  sound: { label: 'Sound', off: 'Off', on: 'On' },
  motion: { label: 'Motion', full: 'Full', reduced: 'Reduced' },
  quality: { label: 'Quality', low: 'Low', normal: 'Normal' },
  wind: { label: 'Wind', off: 'Off', on: 'On', onNote: 'Microphone on. Nothing is recorded. Wind only.' },
  credits: { label: 'Credits', value: 'Parts adapted from public demos. Each part names its source in its README.' },
  privacy: 'Nothing here is sent anywhere.',
  close: 'Close',
} as const;

// 每站三个入口（首屏三层 + 带走入口）
export const ENTRY = {
  license:   { h1: 'License',  hook: 'A permit to simply be.',            cta: 'Stamp it' },
  hug:       { h1: 'Hug',      hook: 'Send a little warmth as a link.',   cta: 'Let it go' },
  still:     { h1: 'Still',    hook: 'Nothing here needs an answer.',     cta: 'Sit' },
  koiPond:   { h1: 'Koi Pond', hook: 'Watch the fish. That is all.',      cta: null },
} as const;
```
