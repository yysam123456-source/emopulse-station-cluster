# A2 产品线实机走查（Studio + 5 模板 + 18 预览页）

> 评审日期：2026-11-24 ｜ 性质：**只读取证**，全部结论来自无头 Edge 实机截图与指标，不是读代码的推断。
> 取证人：ux-a2 ｜ 驱动：`docs/review-2026-11-24/tools/cdp.mjs`（无头 Edge + 原生 CDP）
> 视角：一个想做 3D 网页的真实使用者——「看到了什么、能不能用、能导出什么、手机上什么样、体积多大」。
> 本轮未改任何已跟踪文件、未跑任何 build / verify 命令；脚本与导出物只在 `_scratch/review-1124/ux-a2/`。

## 0. 取证口径（先读这个）

| 项 | 口径 |
|---|---|
| 环境 | Windows 11，无头 Edge，WebGL2 走 Intel Iris Xe（D3D11），WebGPU 可用（adapter: intel），node v22.22.2。桌面 1280×720 @dpr1；手机 390×844 @dpr3 + 触摸模拟 + 移动 UA。 |
| 产物 | `dist/` 为 10:53 重建的版本，走查期间未变（收尾复核字节数一致）。`dist/preview/a2-*.html` 与 `dist/templates/<id>/index.html` **逐字节相同**（`cmp` 5/5 通过），下文按「同一文件的两个路径」记。 |
| 就绪 ms | 页内 `__preview.snapshot().frames >= 4` 的时刻（从导航开始计）；没有句柄的 Studio 页另测「预览出图」时刻。 |
| 空闲 fps | 2–3 秒内 rAF 帧数。**无头 + Iris Xe 的 fps 只能当同机相对值**；同机同时有其他 agent 在跑浏览器与验证门，早期几轮桌面数值明显偏低（deepsea 16、temple 12 等），收尾在机器较闲时复测为 55–57。下表 fps 写「复测值（早期值）」。 |
| 体积 | 原始字节 = `wc -c`；gzip = `gzip -9 -c \| wc -c`（Git Bash gzip，带文件名头）。Studio 页面显示的是构建期 node zlib 的数（manifest），两者差 < 0.5%，在 §2 单列对照。 |
| 像素差 | 两张 JPEG 缩到 256 宽逐像素比：`均差`(0–255) 与 `变化像素占比`(差 > 12)。动画场景自带抖动，所以每个调参都配一组 **A/A**（默认参数原样再装一次、同样的「年龄」截图）作对照；A/B 明显高于 A/A 才算「看得见」。 |
| 标注 | 「实测」= 有截图或指标；「推断」= 由实测 + 代码推出、未直接看到；「未测：原因」= 没测到。 |

**未测项（统一列在这里）**：真实手机上的 fps 与发热（未测：无真机，只有桌面无头浏览器的触摸/UA 模拟）；声音（未测：无头浏览器静音，koi 产物里确有 Web Audio 代码）；交互组件库的抽卡 / 天降硬币 / 祈愿阁（未测：不在 5 个模板的参数与画面里，本轮未专门检索）；Vite 工程 / Toy 包导出（未测：产物与 Studio 里不存在这个功能，无从测）。

---

## 1. 总表

说明：「交互是否可发现」= 页面上有没有任何提示、按钮、光标变化引导用户去操作；括号里是实际操作后的响应。

| 页面 | 就绪 ms | 空闲 fps | 产物原始 / gzip 字节 | console 错误数 | 状态 | 交互是否可发现 | 手机首屏是否正常 |
|---|---|---|---|---|---|---|---|
| `/studio/` | 主文档 load 0.26–0.28 s；5 张预览出图：deepsea 0.9–8.6 s、nebula 与 koi 7.9–10.5 s、temple 16.2–28.3 s、gate 25.7–31.2 s（3 轮） | 41–57（早期 3 轮 5–15） | 12,419 / 4,520 | 0（2 条 warning，见下方补充事实） | Studio 本身无句柄；5 个 iframe 全部 `ready / high` | 控件可操作；无画质、无导出 | 正常：单列、页高 3,226 px、预览 328×185，调试条盖住预览约 6 成 |
| `/templates/deepsea/`（= `/preview/a2-deepsea.html`） | 897–1,584（手机 424–957） | 55.5–57.3（手机 56.4–56.9） | 29,480 / 11,578 | 0 | ready / high | 无提示；指针移 / 点 / 按住 / 拖 / 滚轮均**看不出**响应 | 正常（竖满屏光柱） |
| `/templates/nebula/`（= a2-nebula） | 1,188–1,567（手机 810–910） | 56.9–57.0（手机 51.8–57.3） | 520,388 / 135,269 | 0 | ready / high | 无提示；指针移动时镜头跟随（+200ms 差值 1.56 vs 对照 1.01），点击脉冲很弱 | 正常（星系居中，偏小） |
| `/templates/temple/`（= a2-temple） | 8,447–13,421（手机 9,580–12,533） | 53.3–56.7（手机 48.2–57.3） | 4,992,587 / 3,473,188 | 0 | ready / high（就绪瞬间常是黑屏，见 §3.3） | 无提示；指针移动镜头平移（hover +200ms 4.12/6.3% vs 对照 1.64/0.5%） | 正常（竖屏裁成主殿中景，鸟居不在画面里） |
| `/templates/gate/`（= a2-gate） | 7,193–8,119（手机 8,489–10,869） | 57.1–57.1（手机 34.4–51.3） | 4,992,577 / 3,473,186 | 0 | ready / high（同上） | 无提示；指针移动镜头平移（3.22/3.8% vs 1.32/0.1%） | 正常（鸟居近景） |
| `/templates/koi/`（= a2-koi = `/preview/koi.html`） | 5,047–7,438（手机 5,523–5,732） | 57.1–57.1（手机 14 → 57.3） | 591,332 / 161,248 | 0（2 条 warning） | ready / high（首屏是黑屏，见 §3.5） | 无提示；点击有涟漪（+200ms 0.74 vs 对照 0.16）、拖动有墨迹（1.77/3.7%）、滚轮缩放 | 正常（水墨锦鲤竖屏） |
| `/preview/empty.html` | 703（手机 628） | 56.3（手机 56.9） | 18,105 / 7,286 | 0 | ready / high，drawn 0/0 | 无（空场景，全黑） | 正常（全黑） |
| `/preview/field.html` | 762（手机 721） | 57.0（手机 50.6） | 26,670 / 10,614 | 0 | ready / high | 无提示；未测交互 | 正常 |
| `/preview/field-l0.html` | 657（手机 537） | 57.2（手机 56.5） | 23,702 / 9,592 | 0 | ready / high | 无提示；未测交互 | 正常 |
| `/preview/hug.html` | 932（手机 2,341） | 56.3（手机 22.9） | 524,094 / 135,178 | 0 | ready / high | 无提示；未测交互 | 正常 |
| `/preview/still.html` | 1,550（手机 1,313） | 10–28.6（自报 21–27，帧时 42–169 ms） | 133,404 / 51,121 | 0 | 句柄报 ready / high，**但加载后卡死 8.6–11.3 s、期间全黑**（§4） | 无提示；未测交互 | 正常 |
| `/preview/tide-a.html` | 806（手机 678） | 56.6（手机 56.7） | 22,346 / 8,985 | 0 | ready / high | 无提示；未测交互 | 正常 |
| `/preview/tide-b.html` | 701（手机 800） | 56.8（手机 56.2） | 22,328 / 8,970 | 0 | ready / high | 无提示；未测交互 | 正常 |
| `/preview/tide-c.html` | 935（手机 629） | 57.1（手机 56.5） | 22,364 / 9,014 | 0 | ready / high | 无提示；未测交互 | 正常 |
| `/preview/bubbles-probe.html` | 900（手机 1,592） | 46.7（手机 56.2） | 23,657 / 9,400 | 0 | ready / high | 无提示；未测交互 | 正常 |
| `/preview/koi-nolimit.html` | 7,655（手机 7,262） | 52.0（手机 56.2） | 591,397 / 161,344 | 0（2 warning） | ready / high，budget 100 ms | 同 koi | 正常 |
| `/preview/koi.html` | 6,515（手机 5,054） | 57.3（手机 57.1） | 591,332 / 161,246 | 0（2 warning） | ready / high | 同 koi | 正常 |
| `/preview/room.html` | 745（手机 673） | 56.6（手机 56.9） | 26,837 / 10,462 | 0 | ready / high | 无提示；未测交互 | 正常 |
| `/preview/dawn-desk.html` | **35,971**（手机 13,497） | 22.8（手机 57.6） | 1,778,955 / 937,787 | 0 | ready / high | 有文字提示「DRAG THE STAMP TO THE PAPER」 | 正常 |
| `/preview/ink.html` | 839（手机 596） | 57.2（手机 56.6） | 26,880 / 10,502 | 0 | ready / high | 无提示；未测交互 | 正常 |

补充事实：

- 19 个预览页在桌面与手机模拟下 **console 错误 0、`degraded` 0、lod 全部 high**。唯一的 warning 来自 koi 栈（`koi`、`koi-nolimit`、`a2-koi`、Studio）：原文 2 条，`THREE.WebGLProgram: Program Info Log: (74,1): warning X4000: use of potentially uninitialized variable (f_shape)` 与 `(129,1)` 同文。
- 所有页面（Studio、5 模板、18 预览）在 network 里**只有本机 `127.0.0.1:8094` 与 `data:` 两类请求，没有任何外部域名**。走 http 时每页多一个 `/favicon.ico` 的 404（239 B）。
- 5 个模板用 `file://` 直接双击打开：5/5 `state ready`、0 错误、网络只有文件自身与 `data:` 图片（temple 13 个请求 = 1 文件 + 12 张内嵌图）。Studio 用 `file://` 打开（显式关掉 file 互访以贴近普通浏览器）：5 个 iframe 全部 ready，0 错误。

---

## 2. Studio 走查（`/studio/`，桌面 1280×720）

### 2.1 首屏看到什么（实测）

- 标题 `Stage Templates · Studio`；副标题「5 个模板 · 单 HTML · 零外部请求 · 参数走 query」；右上段落「第一层：templates.mjs 注册 / 第二层：build-templates.mjs 构建与体积门 / 第三层：这个 Studio。生成于 2026-11-24T02:53:44.207Z」。
- 两列卡片网格，页高 2,306 px。**首屏只看得到 2 张卡（深海信标、星海旋臂）**，晨光山门与主殿、独立山门、锦鲤池在第二屏以下（卡片顶部分别在 898、898、1,621 px）。
- 每张卡：名称、`id · preset · 体积 / gzip`、零件列表、右上徽章（`2D · READY` / `GL · READY`）、一个 16:9 实时预览（预览底部压着工程调试条）、参数控件、「打开独立页」「重置参数」两个按钮和一句「参数写进 query，iframe 即时刷新」。
- 页脚：「参数控件只改 query，不重写构建产物；要固化默认值，改 shared/product/templates.mjs 后重跑构建。独立页打开的是 dist/templates/<id>/index.html；iframe 与它同源，无服务器也能用。」
- 全页可点元素：8 个 `<select>`、13 个滑块、4 个复选框、5 个「打开独立页」链接（`target=_blank`）、5 个「重置参数」按钮。**没有颜色选择器（`input[type=color]` 0 个）、没有下载属性元素（0 个）、没有任何「导出 / 下载 / 画质」字样。**
- 5 个预览**同时在跑**。首次打开共 29 个请求、11,141,787 B（两张 5 MB 的卡片占 89%）。
- 预览出图时间（页内记录器，3 轮）：deepsea 0.95 / 8.6 / 0.89 s；nebula 10.5 / 8.6 / 7.9 s；koi 10.5 / 8.6 / 7.9 s；temple 28.3 / 16.2 / 16.4 s；gate 28.3 / 25.7 / 31.2 s。主文档 `load` 事件在 0.26–0.28 s。
- 证据：`studio-桌面-首屏.jpg`、`studio-桌面-整页.jpg`、`studio-桌面-预览就绪.jpg`、`sheet-studio.jpg`。

### 2.2 每个功能的实测结果

| 功能 | 预期（A2 用户流程） | 实际（实测） | 证据 |
|---|---|---|---|
| 选模板 | 选一个场景开始 | 没有「选」这一步：5 个模板全部平铺、全部同时运行；首屏只见 2 个 | `studio-桌面-首屏.jpg`、`studio-桌面-整页.jpg` |
| 调参数（enum） | 改了立刻看到 | 改下拉 → iframe 的 `src` 被改写 → **整个模板重新加载**。8 个下拉全部生效，重载到第 12 帧 0.8–4.4 s（deepsea 0.84、nebula 0.83、temple 2.1、gate 2.8、koi 4.4 s） | `studio-参数/studio-参数-*-*.jpg`，表见 2.3 |
| 调参数（number） | 拖滑块实时变 | 13 个滑块全部改写 `src` 并重载；**不是实时**，见下面的拖动实测 | 同上 |
| 调参数（boolean） | 勾选即生效 | 4 个复选框生效（koi 无 boolean）。temple 的「主殿」在 720 高视口里位于屏幕外（`elementFromPoint` = null），要把页面滚到卡片下半部才点得到 | `studio-参数/studio-参数-temple-hall.jpg` |
| 拖动一个滑块 | 顺滑跟手 | 1.2 s 的拖动（temple「雾」0.73 → 0.08）两次实测都让 iframe `src` 被改写 **18 次**；拖动本身被卡成 **8.0 s / 15.2 s**；松手后还要 **4.1 s / 3.2 s** 新画面才可用 | `studio-桌面-拖动滑块后-temple.jpg` |
| 重置参数 | 只重置本卡 | 点深海卡的重置 → `location.reload()` 整页刷新；事先改过的星海卡也被一起重置（改后 `tide`、`ember` → 刷新后 `abyss`、`abyss`） | 实测记录，见 §6 U-11 |
| 画质档位 | 极致 / 均衡 / 省电下拉 | **不存在**。Studio 0 个相关控件；模板页正文只有调试条；运行时 Lod 契约只有 `low \| high` 二档（`shared/stage/contract.ts:87`），本轮全程显示 `high`，从未触发降档 | `metrics.json`（`studio.dom`）、各模板 `text` |
| 体积预算检查器 | 实时 gzip、超 1 MB 预警、平台门槛切换 | **只有一行构建期静态文字**。temple / gate 卡片写着「4875.6 KB / gzip 3375.5 KB」，徽章仍是绿色 `GL · READY`；页面里 `.warn` 元素 0 个，没有任何「超限」提示，也没有 Toy / 独立站切换。数字本身与我实测的差 < 0.5%（见 2.4） | `studio-桌面-整页.jpg`、`metrics.json`（`studio.dom`：`warnEls` 0） |
| 导出单 HTML | 一键导出 | **没有导出控件**。只有「打开独立页」（新标签打开带参数的网址）。用户能做的只有另存为——另存得到的文件与 `dist/templates/<id>/index.html` **逐字节相同**（5/5 `identicalToDist=true`），**调好的参数全部丢失**（见 2.5） | `export-*.jpg` |
| 手机预览 | 流程里有「预览（移动端模拟）」 | 没有移动端模拟；预览是固定 16:9 的桌面 iframe | `studio-桌面-首屏.jpg` |
| 用 `file://` 打开 | 「无服务器也能用」 | 成立：双击 `dist/studio/index.html`，5 个 iframe 全部 ready、0 错误 | `studio-桌面-file直开.jpg` |

### 2.3 参数逐个实测（25 个控件，真实鼠标 / 键盘操作）

操作方式：下拉 = 聚焦后按方向键；滑块 = 鼠标点击轨道一端；复选框 = 鼠标点击。「重载」= 从操作到新文档画满 12 帧。A/A、A/B 是 §0 定义的像素差（均差 / 变化占比）。

| 卡 | 参数 | 控件值变化 | `src` 改写次数 | 重载 ms | A/A | A/B | 结论 |
|---|---|---|---|---|---|---|---|
| deepsea | 色板 | abyss → ink | 2 | 838 | 1.39 / 1.6% | **11.68 / 45.7%** | 生效 |
| deepsea | 微粒密度 | 1 → 1.6 | 1 | 511 | 4.15 / 7.1% | 4.30 / 7.5% | 同龄看不出；直开网址对照：调到 0.4 有变化（4.98 / 8.8%，对照 0.85），调到 1.6 无变化（0.11 / 0.1%） |
| deepsea | 光柱 | 0.55 → 0 | 1 | 654 | 4.17 / 7.1% | 5.55 / 11.9% | 生效：光柱消失（直开网址对照 4.30 / 9.3%） |
| deepsea | 焦散 | 0.35 → 1 | 1 | 508 | 4.52 / 9.5% | 4.54 / 9.5% | **看不出**：直开网址 0 与 1 都和默认一样（0.93 / 0.2%、0.15 / 0%） |
| nebula | 色板 | abyss → aurora | 2 | 828 | 6.34 / 16.4% | 6.52 / 17.0% | 同龄看不出；violet / ember 换色明显（见 §3.2） |
| nebula | 粒子密度 | 1 → 0.45 | 1 | 595 | 4.35 / 8.0% | 4.39 / 8.2% | 同龄看不出（对照本身抖动大） |
| nebula | 星系半径 | 1 → 1.6 | 1 | 581 | 4.44 / 8.4% | 2.66 / 6.4% | 同龄看不出；截图里 0.6 / 1.6 的大小差别肉眼可见 |
| nebula | 自转速度 | 0.85 → 2 | 1 | 696 | 2.35 / 4.8% | 3.96 / 9.5% | 弱 |
| nebula | 指针脉冲 | 0.55 → 0 | 1 | 1,666 | 4.46 / 7.3% | 7.13 / 18.7% | 弱 |
| temple | 方案 | dawn → snow | 1 | 2,146 | 1.58 / 0.5% | **43.17 / 70.2%** | 生效 |
| temple | 雾 | 1 → 0 | 1 | 8,173 | 5.53 / 12.3% | 5.07 / 10.3% | 看不出 |
| temple | 石灯 | 0.82 → 0 | 1 | 19,849 | 3.89 / 6.0% | 6.01 / 14.4% | 弱：石灯笼还在，亮度变化小 |
| temple | 镜头环绕 | 0.7 → 0 | 1 | 7,575 | 5.70 / 12.5% | 3.08 / 3.2% | 看不出（静帧比不出环绕） |
| temple | 鸟居 | 勾 → 不勾 | 1 | 8,094 | 1.67 / 0.7% | 7.73 / 18.5% | 生效：鸟居消失 |
| temple | 松林 | 勾 → 不勾 | 1 | 10,044 | 5.04 / 11.0% | **19.26 / 19.2%** | 生效 |
| temple | 主殿 | 勾 → 不勾 | 1 | 4,844（高视口复测） | — | 24.57 / 32.3% | 生效：主殿消失 |
| gate | 方案 | gate → dawn | 1 | 2,803 | 1.42 / 0.4% | **38.17 / 47.5%** | 生效 |
| gate | 雾 | 1 → 0 | 1 | 1,999 | 1.45 / 0.4% | 2.83 / 3.5% | 弱 |
| gate | 石灯 | 0.9 → 0 | 1 | 6,671 | 1.42 / 0.3% | 3.14 / 5.6% | 弱 |
| gate | 主殿 | 不勾 → 勾 | 1 | 11,449 | 4.47 / 9.7% | 4.11 / 8.7% | 看不出（画面里没出现主殿） |
| koi | 风格 | ink → real | 2 | 4,391 | 17.83 / 24.5% | **111.57 / 97.3%** | 生效 |
| koi | 镜头 | top → orbit | 2 | 8,112 | 17.21 / 23.5% | 24.23 / 30.8% | 生效（第 40 帧同龄对照 19.45 / 27.5%，对照 2.61） |
| koi | 池底 | pebble → dark | 2 | 8,212 | 3.05 / 5.7% | 2.14 / 3.4% | 水墨风格下看不出；写实风格下生效（19.25 / 56%，对照 1.18） |
| koi | 雨 | dry → rain | 2 | 2,114 | 2.55 / 4.4% | 14.46 / 20.9% | 生效但弱（写实风格 4.67 / 8.6%） |
| koi | 种子 | 999999 → 191411 | 2 | 1,428 | 17.83 / 24.5% | 18.23 / 22.5% | 鱼群布局改变（截图可核对） |

读法：25 个控件 **全部能把参数写进网址并让预览重新加载**；其中「肉眼一眼可见」的是方案 / 风格 / 镜头 / 色板（ink、violet、ember）/ 开关类；雾、石灯、焦散、镜头环绕、密度这几项在静帧对照里**看不出或很弱**。

另外两个实测事实：

- koi 的「种子」滑块默认值 20260312 **超出了滑块上限 999999**：页面上一开始滑块球停在最右端（值 999999），旁边读数却是 20260312；一碰滑块种子就变成 ≤ 999999 的数。
- 下拉每按一次方向键就重载一次（`src` 改写 2 次 = 按了 2 次），没有防抖。

### 2.4 体积数字对照（Studio 显示 vs 我自己量）

| 模板 | Studio 显示（node zlib，构建期） | `gzip -9 -c \| wc -c`（实测） | 差 |
|---|---|---|---|
| deepsea | 11.4 KB（11,684 B） | 11,578 B | −0.9% |
| nebula | 132.9 KB（136,102 B） | 135,269 B | −0.6% |
| temple | 3375.5 KB（3,456,486 B） | 3,473,188 B | +0.5% |
| gate | 3375.5 KB（3,456,483 B） | 3,473,186 B | +0.5% |
| koi | 158.4 KB（162,204 B） | 161,248 B | −0.6% |

数字是准的（两种 gzip 实现的差异），问题在于它只是文字，不是检查器：3.4 MB 的两套模板与 11 KB 的那套拿到的是同一枚绿色 `READY`。

### 2.5 导出结果

- Studio 里没有导出 / 下载控件，所以「导出」这一步**走不到**；用户唯一能做的是点「打开独立页」后用浏览器另存为。
- 把带参数网址的字节存下来（等价于「网页，仅 HTML」）：5 个文件都与 `dist/templates/<id>/index.html` **逐字节相同**，raw / gzip = 29,480 / 11,684、520,388 / 136,102、4,992,587 / 3,456,486、4,992,577 / 3,456,483、591,332 / 162,204（zlib）。
- 用 `file://` 打开另存的文件：5/5 `ready`、0 错误、只有文件自身与 `data:` 请求（就绪 0.4–12.0 s）。
- 打开后看到的是**默认样子，不是调过的样子**。第 30 帧同龄像素差：另存文件 vs 默认网址 = 0.87 / 2.16 / 7.01 / 1.32（deepsea / temple / koi / gate）；另存文件 vs 带参数网址 = **11.11 / 58.98 / 140.29 / 46.97**。
- 证据：`export-deepsea-另存后file直开.jpg`、`export-temple-另存后file直开.jpg`、`export-temple-带参数网址.jpg`、`export-koi-另存后file直开.jpg`、`export-koi-带参数网址.jpg`、`export-gate-另存后file直开.jpg`。导出物在 `_scratch/review-1124/ux-a2/export/`。

### 2.6 手机结果（390×844 @dpr3，触摸）

- 单列布局，页高 3,226 px；标题占两行，说明段落三行；每张卡预览 328×185，控件在预览**下方**（不重叠）。首屏能看到标题、说明和第一张卡的预览 + 全部控件。
- **调试条盖住预览约 6 成**（预览高 185 px，调试条 5 行等宽字约 117 px）。
- 控件偏小：复选框 13×13 px、滑块轨道高 16 px、标签字号 10 px、下拉高 28 px。
- 真实触摸点击滑块 80% 处：微粒密度 1 → 1.45，预览 867 ms 后重载完成。
- fps 52–57（复测；首轮 57）；首次打开 30 个请求、11,171,476 B；0 错误。
- 证据：`studio-手机-首屏.jpg`、`studio-手机-控件区.jpg`、`studio-手机-调参后.jpg`、`studio-手机-整页.jpg`、`sheet-studio-mobile.jpg`。

### 2.7 Studio 问题清单（编号在 §6 合并）

阻断：U-01。严重：U-03、U-04、U-05、U-06、U-07、U-10。一般：U-11、U-12、U-13、U-14、U-21、U-22、U-23。建议：U-24、U-25。

---

## 3. 5 个模板逐个

通用事实：5 个页面**都没有标题、说明、按钮或操作提示**，页面可见文字只有左下角调试条；桌面可点元素只有画布本身。

### 3.1 deepsea「深海信标」

- **首屏**：深青色水体，顶部 6–7 道竖向亮光柱，散布悬浮亮点，四周暗角，细颗粒。就绪 0.9–1.6 s；就绪瞬间调试条写着 `fps 6 · frame 160.6ms`（前几帧很重），之后 55–57。
- **停留 10 秒**：画面稳定，`state ready / lod high`，fps 55–57。
- **交互**：指针移动、点击、按住 1.5 s、拖动、滚轮、Esc、空格——动作后 200 / 600 / 1,200 / 2,000 ms 的像素差与「什么都不做」的对照组一致（点击 +200 ms 0.49 vs 0.31）。**看不出任何响应。**代码里有按下涟漪层（`shared/parts/abyss/layers/ripples.ts:20-22`），推断是涟漪太弱（推断）。
- **参数变体**（直开网址，同龄）：`palette=tide` 9.51 / 23.2% ✓；`palette=ink` 10.99 / 35.3% ✓（画面转暖灰）；`rays=0` 4.30 / 9.3% ✓（光柱消失）；`rays=1` 2.69 / 0.2%（整体略亮）；`caustics=0` 0.93 / 0.2%、`caustics=1` 0.15 / 0%（**无可见变化**）；`density=0.4` 4.98 / 8.8% ✓、`density=1.6` 0.11 / 0.1%（无变化）。
- **手机**：竖满屏光柱，正常；就绪 424–957 ms，fps 56–57。
- **问题**：U-15、U-26。

### 3.2 nebula「星海旋臂」

- **首屏**：深蓝底 + 细星点，中央偏下一个青白色四旋臂星系（占画面宽约 3 成），底部有海底光柱透出来。就绪 1.2–1.6 s；画面在 1.3 s 出现、约 4.3 s 稳定（亮度 30 → 38）。
- **停留 10 秒**：星系缓慢自转，镜头轻微游移；fps 57。
- **交互**：指针移动时镜头跟随（+200 ms 1.56 vs 对照 1.01，之后回到对照水平）；点击触发核心脉冲，但 +200 ms 差值 1.53 vs 1.01，**肉眼在截图里看不出**。代码：`shared/parts/nebula/scene.ts:108-110`。
- **参数变体**：`palette=violet`（蓝紫核心）与 `palette=ember`（暖橙核心）截图可辨；`scale=0.6` / `1.6` 星系明显变小 / 变大；`density=0.45` 粒子更稀；`speed=2`、`pulse` 静帧比不出。
- **手机**：星系居中，画面上下大面积是空底；就绪 0.8–0.9 s，fps 52–57。
- **问题**：U-16、U-15。

### 3.3 temple「晨光山门与主殿」

- **首屏**：阴天晨光下的日式主殿（灰瓦、朱漆柱、发光障子）、左前景一座朱红鸟居、两三座石灯笼、两侧松树、石板路、远处淡山。画面完成度是「游戏资产」级：近看松针是卡片、屋顶贴图有重复。就绪 8.4–13.4 s；**就绪瞬间调试条是 `fps 30 · frame 426.0ms`，snow 方案 `fps 12 · frame 581.6ms`**（前几帧每帧 0.4–0.6 s）。
- **出图过程**（页内记录器）：桌面端 0.1 → 4.8 s 完全无法采样（主线程在解析 5 MB 内联脚本），4.8 s 采到近黑画面（亮度 24.7），下一次能采样已是 12.0 s、画面完整（亮度 94.7）；手机端 0.2 → 8.6 s 无法采样，8.6 s 时亮度 28.6（暗），20 s 时 104.9。也就是说**用户要盯 5–12 秒的暗屏**。多次加载里「就绪瞬间截图」有时直接是黑屏。
- **停留 10 秒**：镜头缓慢环绕，灯笼呼吸；fps 53–57（早期并发时 12–33）。
- **交互**：指针从左扫到右，镜头跟着平移（hover +200 ms 4.12 / 6.3% vs 对照 1.64 / 0.5%；+2,000 ms 4.76 / 8.2% vs 2.70 / 2.4%）。点击/按住/拖动与对照一致。代码：`shared/parts/temple/index.ts:359-370`。
- **参数变体**（同龄首屏，A/A 1.66 / 0.2%）：`scene=snow` **62.47 / 76.8%** ✓（屋顶、地面、石灯积雪）；`scene=dusk` 20.82 / 54.4% ✓（暗蓝夜空、灯更亮）；`scene=gate` 45.39 / 64.2% ✓（只剩鸟居，无主殿）；`hall=0` 83.98 / 92.7% ✓；`pines=0` 83.97 / 92.7% ✓；`torii=0` 4.58 / 8.3% ✓（鸟居消失）；`fog=0` 2.62 / 0.9%、`orbit=0` 2.19 / 1.1%、`lanterns=0` 2.53 / 2.1%（弱 / 看不出）。
- **手机**：竖屏把横构图裁成主殿中景，鸟居不在画面里；就绪 9.6–12.5 s，fps 48–57。
- **问题**：U-02、U-08、U-09、U-27。

### 3.4 gate「独立山门」

- **首屏**：晨光下一座朱红鸟居居中偏左，右侧石灯笼与松树，碎石路，远山薄雾；右侧一簇橙色亮光（灯笼火）。就绪 7.2–8.1 s；手机首屏截图的调试条（读图）是 `fps 0 · frame 581.3ms`，桌面一次读到 `fps 42 · frame 27.1ms`。
- **出图过程**：桌面端主线程 0.2 → 5.3 s 无法采样，5.3 s 时亮度 27.4（近黑），12 s 时 115.7（完整）；手机端 0.2 → 4.3 s 无法采样，4.3 s 时 19.4，12 s 时 104.3。
- **停留 10 秒**：镜头缓动；fps 57。
- **交互**：指针移动镜头平移（3.22 / 3.8% vs 对照 1.32 / 0.1%）。
- **参数变体**：`scene=dawn` 40.30 / 59.3% ✓（换成晨光配色、无主殿的构图）；`scene=snow` 75.73 / 74.0% ✓；`hall=1` 3.85 / 7.4%（画面里没有出现主殿，推断主殿在这个机位之外）；`fog`、`lanterns` 弱。
- **手机**：鸟居近景占满竖屏，正常；就绪 8.5–10.9 s，fps 34–51。
- **问题**：U-02、U-08、U-09、U-18。

### 3.5 koi「锦鲤池」

- **首屏**：**就绪瞬间是全黑**（`template-koi-桌面-首屏.jpg`）。页内记录器在桌面端 6.0 s 前、手机端 5.4 s 前连画布都读不到，8 s 时才是完整画面（亮度 206 / 224）。完整画面是俯视水墨：白宣纸、若干尾灰墨锦鲤、淡墨浮萍与花影。就绪 5.0–7.4 s。
- **停留 10 秒**：鱼在游，纸面有手绘抖动；fps 57。
- **交互**：点击出现一圈墨色涟漪（+200 ms 0.74 / 1.5% vs 对照 0.16，1.2 s 后淡去）；拖动有墨迹（1.77 / 3.7%）；滚轮一次实测把画面放大（17.87 / 23.1%），复测单次滚轮只有 0.51——**缩放行为不稳定（未定位）**。代码：`shared/parts/koi-pond/index.ts:454-471, 694-707`。
- **参数变体**：`style=paint` 水彩（白纸、淡彩鱼、绿红点缀）；`style=real` 写实俯拍（碎石池底、彩色锦鲤）；两者与水墨一眼可辨。写实风格同龄对照（第 40 帧，A/A 1.18 / 0.2%）：`cam=orbit` 44.20 / 76.4% ✓；`floor=sky` 85.65 / 93.6% ✓；`floor=dark` 19.25 / 56.0% ✓；`rain=rain` 4.67 / 8.6%（弱）。**水墨风格下** `floor=dark` 4.00 / 8.3%、`rain=rain` 4.16 / 8.4%（对照 2.61）——几乎看不出。
- **手机**：竖屏水墨，首帧只画了一部分（第 19 帧），完整后正常；就绪 5.5–5.7 s，fps 14 → 57。
- **问题**：U-09、U-17、U-20。

---

## 4. 12 个预览页速查表

桌面 1280×720 首屏；fps 为就绪后 2.5 s 的 rAF 值。

| 预览页 | 就绪 ms | fps | 首屏内容 | 状态 / 错误 | 手机 |
|---|---|---|---|---|---|
| empty | 703 | 56.3 | 全黑（不装任何零件，drawn 0/0） | ready / 0 | 正常 |
| field | 762 | 57.0 | 像素风晚霞草地：橙色渐层天空、两层山、草丛剪影 | ready / 0 | 正常，50.6 fps |
| field-l0 | 657 | 57.2 | 同上，无后处理 | ready / 0 | 正常 |
| hug | 932 | 56.3 | 暗绿底，几团发光蒲公英绒球 | ready / 0 | 正常，22.9 fps |
| still | 1,550 | 10（20 s 时 28.6） | 3 s：蓝灰渐层无物体；**13–15 s：全黑**；20 s：体素海底（海带、礁石、鱼群、鲸骨） | 句柄 ready / 0 错误，**实际黑屏** | 正常 |
| tide-a | 806 | 56.6 | 蓝灰渐层水面 | ready / 0 | 正常 |
| tide-b | 701 | 56.8 | 青绿色水面波纹 | ready / 0 | 正常 |
| tide-c | 935 | 57.1 | 蓝灰渐层 | ready / 0 | 正常 |
| bubbles-probe | 900 | 46.7 | 蓝灰底，气泡不明显 | ready / 0 | 正常 |
| koi-nolimit | 7,655 | 52.0 | 水墨锦鲤（与 koi 同栈，budget 100 ms） | ready / 0（2 warning） | 正常 |
| koi | 6,515 | 57.3 | 水墨锦鲤 | ready / 0（2 warning） | 正常 |
| room | 745 | 56.6 | 深色底上一张米色宣纸 | ready / 0 | 正常 |
| dawn-desk | **35,971** | 22.8 | 写实书桌：台灯、绿植、文件、窗外晨光；有引导文字 | ready / 0 | 正常，13,497 ms |
| ink | 839 | 57.2 | 米白宣纸纹理 | ready / 0 | 正常 |

对照表：`sheet-previews.jpg`（14 格）。

**单独展开：`still`（2/2 复现）**

- 第 1 次：3.3–3.4 s 画面正常（蓝灰渐层，亮度 74）→ 3.4 s 起页面卡住 11.3 s（期间只画了 13 帧，帧时 642 ms；截图指令 11.3 s 才返回，返回的是**全黑**，亮度 9.1）→ 20 s 恢复为体素海底（亮度 108，帧时 43 ms）。
- 第 2 次：同样在 4.6 s 后卡住 8.6 s，13.2 s 时截到黑屏（9.1），20.3 s 恢复。
- 全程 `__preview.snapshot()` 都是 `state ready / lod high / degraded 0`，console 0 错误 0 警告。
- 证据：`preview-still-桌面-3s.jpg`、`preview-still-桌面-14s黑屏.jpg`、`preview-still-桌面-20s.jpg`。
- 说明：这是 WebGPU 体素预览页，不是 A2 的 5 个模板之一；但它说明「句柄说 ready」不等于「画面没坏」。

**单独展开：`dawn-desk`**：桌面就绪 36.0 s（首次内容绘制 35.6 s，DOMContentLoaded 34.9 s），1.78 MB 的文件里有 2 张内嵌图（870,544 个 base64 字符，占 48.9%）。无错误。

---

## 5. A2 六项 Must 对照表

定义出处：`C:\Users\Lenovo\WorkBuddy\2026-10-27-14-44-45\docs\ai-radar-product-designs-2026-11-23.md`（下称「产品定义」）。原文表格列了 5 行 Must（:181–185）；「<1MB、零外部资源」来自一句话定位（:156）与平台约束（:162），主理人要求一并核对，故列为第 6 项。

| Must | 定义原文（出处） | 实测现状 | 证据 | 判定 |
|---|---|---|---|---|
| 1 场景模板 3 套 | 「场景模板 3 套：禅意池/锦鲤（暮池摸鱼式）、深海粒子（你的项目）、寺庙/静寺式」（产品定义:181） | 有 5 套 ready 模板：锦鲤池（koi）、寺庙（temple + gate）、深海（deepsea）。**deepsea 的徽章是 `2D · READY`，产物里 GLSL 着色器 0 个**——它是 Canvas2D 画的光柱与颗粒，不是粒子项目；nebula 才是 GL 粒子（50 个 `void main`）。5 套都能开、0 错误。移动端 60 fps：未测（无真机）。 | `sheet-templates.jpg`、`metrics.json`（`studio.dom`）、§3 | **达成（附注：deepsea 不是粒子实现）** |
| 2 全程序化生成 | 「全程序化生成：水波高度场、Beer-Lambert 吸收、GLSL 焦散/贴图、Web Audio 五声音阶——零外部资源」（:182） | 零外部资源：成立（19 页 + Studio 的 network 无外部域名）。程序化：deepsea / nebula / koi 产物里 `data:image` **0 个**，koi 里有 Web Audio（`AudioContext` 2、`createOscillator` 10）与焦散（`caustic` 12 处）；**temple / gate 产物里 12 张 base64 位图（9 JPEG + 3 PNG），占原始字节 87.79%、占 gzip 95.3%**，来源注释写明「由 AI 生成并压缩到 1024 JPEG 的写实表面贴图。生成来源：seedream 5.5」（`shared/realism/assets.ts:1-2`）。全仓 `beer` 0 命中；`lambert` 35 处是 three.js 自带材质名（推断）；`MeshSurfaceSampler` 0。 | `metrics.json` 的 `assets` 节 | **部分**（3 套程序化，2 套靠位图贴图；Beer-Lambert 无） |
| 3 体积预算检查器 | 「实时显示 gzip 后大小，超 1MB 预警，按平台门槛（Toy/独立站）切换」（:183） | Studio 每卡一行构建期静态文字，数字准确（差 < 0.5%）；**超 1 MB 无预警**（temple / gate gzip 3.47 MB 仍是绿色 `READY`，`.warn` 元素 0 个）；**无平台门槛切换**；不是实时的（调参不改体积，因为参数不进产物）。 | `studio-桌面-整页.jpg`、`metrics.json`（`studio.dom`：`warnEls` 0） | **未达成**（只有只读数字） |
| 4 参数控制面板 | 「lil-gui 风格：颜色选择器、密度/速度滑块、画质预设下拉」（:184） | Studio 有 25 个控件（8 下拉 / 13 滑块 / 4 复选），全部能用；**颜色选择器 0 个**（颜色只能从下拉里选预设英文名）；**画质下拉不存在**；面板不在模板产物里——抽查 9 个产物文件（Studio、5 个模板、a2-temple、preview/koi、preview/still）`lil-gui` / `dat.gui` / `new GUI(` 0 命中，实机 19 个页面的画面都没有面板（只有只读调试条）；`package.json` 无 lil-gui，`node_modules` 里也没有。 | `metrics.json` 的 `studio.dom` 与 `assets.gui`、§2.2–2.3 | **部分** |
| 5 单 HTML 导出 | 「一键导出 dist 单文件 / Vite 项目 / B站 Toy 适配包」（:185） | 单 HTML 文件本身成立：5/5 `file://` 直开正常、零外部请求。**一键导出不存在**（Studio 无导出控件）；另存会丢参数；**Vite 项目 / Toy 包不存在**。 | `export-*.jpg`、`metrics.json`（`fileDirect`、`studio.saved`） | **未达成**（「导出」这一步缺失） |
| 6 <1MB、零外部资源 | 「<1MB、零外部资源、全代码生成的 3D 互动场景模板库」（:156）；「平台（B站 Toy）要求入口 ≤1MB」（:162） | 零外部资源：达成。gzip：deepsea 11,578 B ✓、nebula 135,269 B ✓、koi 161,248 B ✓、**temple 3,473,188 B ✗（超 3.4 倍）**、**gate 3,473,186 B ✗**。把 12 张位图拿掉后 temple 的代码部分 gzip 是 161,477 B。 | §1 总表、`metrics.json` 的 `assets` 节 | **部分**（3/5 达标） |

与设计意图文档的对照（`docs/A2-FEASIBILITY-REVIEW.md` §4 实际列了六条结构性差异，与本次实测直接对应的三条）：

- 差异 1「架构是站点装配运行时，A2 是模板 + 参数化导出产品」（:171–173）：实测吻合。A2-4 流程「选场景模板 → 调参数 → 体积检查器实时反馈 → 预览（移动端模拟）→ 导出」五步里，Studio 只落地了「调参数」（且是整页重载，不是实时）和桌面预览；选模板、体积实时反馈、移动端模拟、导出四步缺失。
- 差异 4「没有产品级体积门，且体积口径不同」（:183–185）：实测吻合，且现在有了反例——temple / gate gzip 3.47 MB 照样 `READY`。
- 差异 6「参数面板的受众不同：调试条 ≠ 产品控件」（:191–193）：实测吻合，并且调试条现在直接出现在 5 个模板页和每个 Studio 预览里。

---

## 6. 问题清单（合并）

严重度口径：阻断 = 走不下去或画面坏掉；严重 = 核心体验明显受损；一般；建议。

| 编号 | 页面 | 严重度 | 现象（可核对） | 复现步骤 | 证据文件 | 代码位置 |
|---|---|---|---|---|---|---|
| U-01 | Studio | **阻断** | 没有导出功能。A2 主流程最后一步「导出」在 Studio 里走不到；用户只能「打开独立页 → 另存为」，而另存文件与 `dist/templates/<id>/index.html` 逐字节相同（5/5），调好的参数全部丢失（另存后画面 vs 带参数网址：均差 11–140；vs 默认：0.9–7.0）。 | 打开 `/studio/` → 改 temple 方案为 snow → 点「打开独立页」→ 另存为 HTML → 双击打开：是晨光不是雪。 | `export-temple-另存后file直开.jpg`、`export-temple-带参数网址.jpg`、`export-koi-*.jpg`、`export-deepsea-*.jpg`、`export-gate-*.jpg` | `shared/product/studio.mjs:190-207`（动作区只有链接与重置）；页脚 `:100` 明写「不重写构建产物」 |
| U-02 | temple / gate 模板、Studio | **严重** | 单文件 4,992,587 B，gzip 3,473,188 B，是 1 MB 线的 3.4 倍；A2 的平台约束是入口 ≤ 1 MB。 | `gzip -9 -c dist/templates/temple/index.html \| wc -c`。 | §1 总表、`studio-桌面-整页.jpg`（卡片上「4875.6 KB / gzip 3375.5 KB」） | `shared/stage/preview/build.mjs:285-306`；`shared/realism/assets.ts:4-32` |
| U-03 | Studio | 严重 | 体积预算检查器不存在：只有构建期静态文字；>1 MB 无预警（`.warn` 0 个，徽章绿色 READY）；无 Toy / 独立站门槛切换。 | 打开 Studio，看 temple 卡。 | `studio-桌面-整页.jpg`、`metrics.json`（`studio.dom`：`warnEls` 0） | `shared/product/studio.mjs:125`（文字）、`:85`（`.warn` 样式定义了没用）；`shared/product/build-templates.mjs:94`（构建期 gzip） |
| U-04 | Studio | 严重 | 调参不是实时：每次 input 重载整个 iframe。拖 1.2 s 的滑块 → `src` 改写 18 次、拖动卡成 8.0 / 15.2 s、松手后 4.1 / 3.2 s 才可用；temple 单次调参要等 2.1–19.8 s；下拉每按一次方向键重载一次。 | Studio → temple 卡 → 拖「雾」滑块。 | `studio-桌面-拖动滑块后-temple.jpg`、`studio-参数/*.jpg`、§2.3 | `shared/product/studio.mjs:179-183`（input 即 update）、`:212-217`（`iframe.src = url`） |
| U-05 | Studio、全部模板 | 严重 | 没有画质档位：Studio 0 个相关控件；模板页无面板；运行时 Lod 只有 `low \| high`，全程显示 high、从未降档。 | 在 Studio 与任一模板页找「画质」。 | `metrics.json` 的 `studio.dom`（`qualityWords` 0） | `shared/stage/contract.ts:87` |
| U-06 | Studio | 严重 | 参数面板不是 lil-gui 风格：颜色选择器 0 个，颜色只能选预设英文名（abyss / tide / ink / violet…）；产物内无任何参数面板（`lil-gui` 0 命中）；标签把内部 key 大写显示（「色板 · PALETTE」）。 | 打开 Studio；打开任一模板页。 | `studio-桌面-首屏.jpg`、`metrics.json` 的 `assets.gui` | `shared/product/studio.mjs:141-155`；`shared/product/templates.mjs:18,33,49,67,82` |
| U-07 | 全部模板、Studio 预览 | 严重 | 工程调试条直接给用户看：`state / lod / fps / frame / cpu / drawn / budget / declared / biome / seed / order`。Studio 手机端盖住预览约 6 成。 | 打开任一模板或 Studio。 | `studio-手机-控件区.jpg`、`template-*-桌面-首屏.jpg` | `shared/stage/preview/host.ts:221-234`；样式 `shared/stage/preview/build.mjs:317`；隐藏开关 `?clean=1`（`host.ts:115`）Studio 没有传 |
| U-08 | temple / gate | 严重 | 「全程序化」不成立：12 张 base64 位图（AI 生成贴图）占原始字节 87.79%、gzip 的 95.3%。 | 见 §5 Must 2。 | `metrics.json`（`assets` 节） | `shared/realism/assets.ts:1-32`；`shared/realism/materials.ts:3`；`shared/realism/modules/atmosphere.ts:150` |
| U-09 | temple / gate / koi | 严重 | 加载期间长时间暗屏（页内记录器采不到样）：temple 桌面 0.1–4.8 s 与 4.8–12 s、手机 0.2–8.6 s；gate 桌面 0.2–5.3 s 与 5.3–12 s、手机 0.2–4.3 s；koi 桌面 6.0 s、手机 5.4 s 前没有画布。就绪瞬间的截图常是黑屏（koi 首屏、temple hall=0 / pines=0 首屏重截前）。前几帧帧时 426–642 ms。 | 打开 `/templates/koi/index.html`，就绪那一刻截图。 | `template-koi-桌面-首屏.jpg`（全黑）、`template-koi-桌面-停留10s.jpg`、`sheet-templates-mobile.jpg`（调试条 `fps 0 frame 581.3ms`） | 未定位 |
| U-10 | Studio | 严重 | 5 个场景同时常驻运行；首次打开 29 个请求 11.1 MB（本机）；temple / gate 预览 16–31 s 才出图；首屏只见 2/5 个模板。 | 打开 Studio 计时。 | `studio-桌面-首屏.jpg`、`studio-桌面-预览就绪.jpg` | `shared/product/studio.mjs:118-219`（无条件全部 `update()`）、`:130`（`loading="lazy"` 但实测 5 个都立即加载） |
| U-11 | Studio | 一般 | 「重置参数」重载整页，连带重置其他卡。 | 改 deepsea 与 nebula 的色板 → 点 deepsea 卡「重置参数」。 | 实测记录（`metrics.json` 的 `studio.reset`） | `shared/product/studio.mjs:196-203` |
| U-12 | Studio（koi 卡） | 一般 | 种子滑块默认 20260312 > 上限 999999：球停在最右、读数是 20260312，一碰就变。 | 打开 Studio 看 koi 卡「种子 · SEED」。 | `studio-桌面-整页.jpg`、`metrics.json`（`studio.dom.koiSeed`） | `shared/product/templates.mjs:86` |
| U-13 | Studio | 一般 | 界面是开发者口吻：`templates.mjs`、`build-templates.mjs`、`query`、`iframe`、`preset a2-deepsea`、`abyss + bubbles + still-sink + pixel-post`、页脚让用户「改 shared/product/templates.mjs 后重跑构建」。 | 读 Studio 文字。 | `studio-桌面-首屏.jpg`、`studio-桌面-整页.jpg` | `shared/product/studio.mjs:94,96,100-101,125,206` |
| U-14 | Studio | 一般 | 没有移动端模拟（A2-4 流程里的一步）。 | — | `studio-桌面-首屏.jpg` | `shared/product/studio.mjs:72-73`（固定 16:9 iframe） |
| U-15 | deepsea、nebula | 一般 | 页面无任何操作提示；deepsea 实测看不出交互响应，nebula 的点击脉冲看不出来。 | 打开 deepsea，点、拖、滚轮。 | `template-deepsea-桌面-交互-tap+600ms.jpg`、`sheet-templates-interactions.jpg` | `shared/parts/abyss/layers/ripples.ts:20-22`；`shared/parts/nebula/scene.ts:108-110` |
| U-16 | nebula、Studio | 一般 | 色板 abyss 与 aurora 肉眼几乎相同；同一个 `palette` 键同时喂给 L0 海底与 L1 星系，选 violet / ember / aurora 时背景层不变。 | Studio nebula 卡选 aurora。 | `studio-参数/studio-参数-nebula-palette.jpg`、`template-nebula-桌面-palette-violet.jpg` | `shared/parts/nebula/palette.ts:10-15`；`shared/parts/abyss/scene.ts:35-38` |
| U-17 | koi | 一般 | 默认水墨风格下「池底」「雨」几乎看不出变化（4.00 / 8.3%、4.16 / 8.4%，对照 2.61）；写实风格下正常。 | `/templates/koi/index.html?floor=dark`。 | `template-koi-桌面-floor-dark.jpg`、`template-koi-桌面-real-floor-dark.jpg` | 未定位 |
| U-18 | gate | 一般 | `hall=1` 画面里没有出现主殿（3.85 / 7.4%）。 | `/templates/gate/index.html?hall=1`。 | `template-gate-桌面-hall-1.jpg` | 未定位（推断主殿在该机位之外） |
| U-19 | 全部 http 页面 | 建议 | 每页一个 `/favicon.ico` 404（239 B）。 | 看 network。 | `metrics.json`（`requests` 节：每页 1 个 `/favicon.ico`，239 B） | 未定位 |
| U-20 | koi 栈 | 建议 | 着色器警告 ×2：`THREE.WebGLProgram: Program Info Log: (74,1): warning X4000: use of potentially uninitialized variable (f_shape)`。 | 打开任一 koi 页看 console。 | §1 补充事实 | 未定位 |
| U-21 | Studio（手机） | 一般 | 控件偏小：复选框 13×13 px、滑块轨道 16 px、标签 10 px。 | 390×844 打开 Studio。 | `studio-手机-控件区.jpg` | `shared/product/studio.mjs:76-78` |
| U-22 | Studio | 一般 | 标签与控件没有关联（`label` 无 `for`，控件无 `id`），点标签不聚焦控件。 | 点「色板」二字。 | `metrics.json`（`studio.first.layout`：`labelFor: null`） | `shared/product/studio.mjs:141-143` |
| U-23 | Studio（桌面） | 一般 | 1280×720 首屏只见 2/5 个模板，页高 2,306 px；没有模板选择 / 导航。 | 打开 Studio。 | `studio-桌面-首屏.jpg` | `shared/product/studio.mjs:66` |
| U-24 | Studio | 建议 | 观察到 1 次：主文档 `load` 事件 30–35 s 才触发（另 3 次是 0.26–0.28 s），当时同机并发负载很重。不定性，记录备查。 | — | `metrics.json`（`studio.first.env.loadEventEnd` 35,630） | 未定位 |
| U-25 | 模板页 | 建议 | 模板页没有标题、品牌、说明；`dist/preview/a2-*.html` 是 `dist/templates/<id>/index.html` 的重复副本（5/5 逐字节相同）。 | `cmp`。 | §0 | `shared/product/build-templates.mjs:87-91` |
| U-26 | deepsea | 一般 | 「焦散」参数 0 与 1 都和默认无差别；「微粒密度」调高到 1.6 无差别（调低到 0.4 有）。 | `/templates/deepsea/index.html?caustics=0`、`?caustics=1`。 | `template-deepsea-桌面-caustics-0.jpg`、`template-deepsea-桌面-caustics-1.jpg`、`template-deepsea-桌面-density-1.6.jpg` | `shared/parts/abyss/scene.ts:50-52` |
| U-27 | temple / gate | 建议 | 近景可核对：松针是卡片、屋顶贴图重复（设计文档 `docs/REALISM-PARTS-CATALOG.md:88` 自己也承认不是照片级）。 | 打开 temple 看松树与屋顶。 | `template-temple-桌面-首屏.jpg` | — |
| P-01 | `/preview/still.html` | **阻断（仅该预览页）** | 加载后约 3.4–4.6 s 起页面卡死 8.6–11.3 s，期间截图全黑（帧时 460–642 ms），2/2 复现；句柄全程报 `ready / high / degraded 0`。 | 打开 still，等 14 s 截图。 | `preview-still-桌面-14s黑屏.jpg`、`preview-still-桌面-20s.jpg` | `shared/stage/preview/build.mjs:116-120`（`voxel-world`）；根因未定位 |

---

## 7. 证据表

全部在 `docs/review-2026-11-24/ux-a2/`，JPEG，单张 < 300 KB，合计约 12 MB。指标原始数据：`metrics.json`。

| 文件 | 说明 |
|---|---|
| `sheet-studio.jpg` | Studio 桌面：首屏 / 拖动滑块后 / file 直开 |
| `sheet-studio-mobile.jpg` | Studio 手机：首屏 / 控件区 / 调参后 |
| `sheet-templates.jpg` | 5 模板桌面首屏（3 列 × 640×360） |
| `sheet-templates-mobile.jpg` | 5 模板手机首屏（5 列 × 260×563） |
| `sheet-templates-interactions.jpg` | 交互后截图 14 格 |
| `sheet-previews.jpg` | 12 个预览页 + a2-* 首屏 14 格（4 列 × 480×270） |
| `sheet-variants-1.jpg` … `sheet-variants-3.jpg` | 参数变体 33 格（5 列 × 384×216） |
| `studio-桌面-首屏.jpg`、`studio-桌面-整页.jpg`、`studio-桌面-预览就绪.jpg`、`studio-桌面-拖动滑块后-temple.jpg`、`studio-桌面-file直开.jpg` | Studio 桌面各状态 |
| `studio-手机-首屏.jpg`、`studio-手机-控件区.jpg`、`studio-手机-调参后.jpg`、`studio-手机-整页.jpg` | Studio 手机 |
| `studio-参数/studio-参数-<模板>-<参数>.jpg`（25 张） | 每个控件操作后的预览裁剪 |
| `template-<id>-桌面-首屏.jpg`、`-停留10s.jpg` | 模板桌面首屏与 10 秒后（koi 首屏为黑屏证据） |
| `template-<id>-桌面-<参数>-<值>.jpg` | 参数变体首屏（deepsea 7、nebula 6、temple 9、gate 3、koi 8） |
| `template-<id>-桌面-交互-<动作>+600ms.jpg` | 交互后 600 ms 截图 8 张 |
| `template-koi-桌面-点击后.jpg`、`template-koi-桌面-拖动后.jpg` | koi 交互响应 |
| `template-<id>-手机-首屏.jpg` | 模板手机首屏 5 张 |
| `preview-<name>-桌面-首屏.jpg`（18 张） | 预览页桌面首屏 |
| `preview-still-桌面-3s.jpg`、`-14s黑屏.jpg`、`-20s.jpg` | still 黑屏过程 |
| `export-<id>-另存后file直开.jpg`（4 张）、`export-temple-带参数网址.jpg`、`export-koi-带参数网址.jpg` | 另存丢参数对照 |
| `metrics.json` | 全部指标（体积、就绪、fps、像素差、资产统计、文件清单） |

脚本与中间产物（不入库）：`_scratch/review-1124/ux-a2/`（`lib.mjs`、`studio-*.mjs`、`templates.mjs`、`previews.mjs`、`extra2.mjs`、`final.mjs`、`sheets.mjs` 等；`export/` 下是另存得到的 5 个 HTML）。
