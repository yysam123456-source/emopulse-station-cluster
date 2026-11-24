# WALKTHROUGH — 四站实机走查（真实用户视角）

> 走查人：`ux-sites`（只读取证）。日期 2026-11-24。对象：`dist/`（入口页 + `/license` `/hug` `/still` `/koi`，主理人刚重建的产物，本轮**没有 build**）。
> 方法：无头 Edge + 原生 CDP（`docs/review-2026-11-24/tools/cdp.mjs`，未改动），每次走查新开独立 profile，结束即关。
> 本文件第 1、3、4 节是给主理人直接读的；第 2 节是逐站明细；第 5 节是证据表。原始数据全部在 `metrics.json`（各次运行的完整 JSON）。
> **截图位置**：入库的截图在本目录（清单见 `../EVIDENCE-INDEX.md`）；未入库的截图与走查脚本已移到仓库外 `C:\Users\Lenovo\WorkBuddy\2026-11-17-13-04-03\emopulse-review-evidence-2026-11-24\`（保持相对路径，脚本在其 `_scripts\review-1124\` 下）。证据表里的文件名在这两处之一。

## 0. 口径与注意事项（先读这 6 条）

1. **机器**：Windows 11，无头 Edge（`--headless=new`），WebGL2 走 Intel Iris Xe（D3D11），WebGPU 可用。桌面 1280×720 dpr=1；手机 390×844 dpr=3（触摸模拟 + 移动 UA）。
2. **fps 只是同机相对值，而且偏低估不了多少、波动很大**：走查期间同机另有一个 agent 在跑别的浏览器走查，同一个页面不同轮次能差一倍（`/hug` 22.6–63.2 fps，`/koi` 首测 14 fps 而另一轮 56 fps）。**卡顿类结论只在多次都出现时才写**。
3. **桌面截图都在 `frames = 60` 之后取**（`MANUAL-QA §8` 的取证要求），例外只有两处并已在文件名里写明：`still-desktop-01-first-62s.jpg`（主线程被 25 s 长任务卡住，截图排队到 62.5 s 才拍到，不是首屏）和 `koi-desktop-01-first.jpg`（frames=60 时拍到，但那一刻画面还是黑的，见 §2.4）。
4. **「实测」= 有截图或指标；「推断」= 从代码或一次结果外推；「未测：原因」= 这次没量到。** 没写「应该没问题」的地方。
5. **三次无效运行已作废并在 `metrics.json → meta.invalidRuns` 里点名**，不要拿它们当证据：① 本机无头 Edge 把**一切**下载都置为 `canceled`（连普通同源文件的对照组也一样）；② `--disable-features=WebGPU` 压不过驱动自带的 `--enable-unsafe-webgpu`，「无 WebGPU」改用页面侧删 `navigator.gpu` 的方式重做；③ 驱动的 `press('Enter')` 不带 `text`，Enter 的默认动作不触发（H9 首测假红），已用带 `text` 的原生按键事件复核。
6. **文件名约定**：`<站>-desktop-<序号>-<状态>.jpg` 是桌面，`<站>-mobile-…` 是手机（任务里写的「桌面 / 手机」对应 `desktop / mobile`）；`sheet-<站>.jpg` 是该站总览图；操作前的对照图在 `_scratch/review-1124/ux-sites/before-shots/`（不进证据目录，指标已进 `metrics.json`）。

---

## 1. 总表

| 页面 | 就绪 ms（frames=60） | 空闲 fps（无操作 2 s） | 产物 gzip 字节 | console 错误数 | snapshot.state / degraded | 交互是否可发现（有没有提示文字，原文） | 带走路径结果 | 手机首屏是否正常 |
|---|---|---|---|---|---|---|---|---|
| `/`（入口） | 86（load，无 `__site`） | — | 2,886 | 0 | 不适用 | 4 个 14px 蓝色下划线链接（点击高度 16 px），逐个点过，分别落到 `/license/` `/hug/` `/still/` `/koi/` | 无 | 正常（同上，可点） |
| `/license` | 2,065（页内 state ready 305 ms，遮罩淡出后可见 ≈1.5–2.3 s） | 60 | 17,216 | 0 | `ready` / 无（lod high，renderScale 1.0） | **有**：`Stamp it` 按钮 + 纸上已印 `PERMIT TO REST`、宣言句、`No. EMP-…`。盖章后出现 `Stamp again`（11px）与 `drag to move the light · f to fold the corner`（11px） | 下载事件已触发（`emopulse-license-EMP-20261124-370.png`，2,175,361 B）但**落盘未测**（环境把下载全部 canceled）；编号可选中复制 ✓；导出图光带与屏幕不一致（左半暗 6–11 L\*） | **不正常**：approved 后纸上多处文字互相重叠（UX-03） |
| `/hug` | 1,780（state ready 613 ms，可见 ≈0.9–1.2 s） | 56.8（各轮 22.6–63.2） | 140,345 | 0 | `ready` / 无（renderScale 0.85–1，偶降到 0.72） | **只有按钮**：`Let it go`；没有任何「点草地也行」的提示 | 按钮路径：点击即写剪贴板 `…/hug?from=hug` ✓（读回验证），显示 `Link copied. Send it to someone.`（12px）；**草地路径：放飞了但没有任何带走物**；不调用 `navigator.share` | 正常 |
| `/still` | 各轮 frames=60 的墙钟时刻 2.4–49.7 s（主线程被长任务卡住，这个量本身不稳）；**遮罩开始淡出 15.9–45.1 s**（6 次独立运行） | **3.2–4.5**（就绪后首测；之后 10–28，帧耗时 51–307 ms） | 54,835 | 0（浏览器告警 1 条：`powerPreference … ignored`） | **`degraded` / lod low**：`voxel-world` `bubbles` `pixel-post` 三件全部 `budget`（`总开销 13.52ms > 预算 12.00ms，已降 low`），renderScale 0.55 | **只有按钮**：`Sit`；按下去没有任何状态文字（`Stay as long as you like.` 未出现） | **没有带走物**：Sit 后 124 s 仍是 `Still / Nothing here needs an answer. / Sit` | **不正常**：画面只画在左上角一块约 390×260 的区域，其余是横向拖影（UX-02） |
| `/koi` | 7.4–19.3 s（主线程两段长任务 3.5+6.8 s；画面可见 4.7–9.2 s） | 14–26（就绪后 0–20 s），57（约 100 s 后） | 166,200 | 0（console 警告 2 条：`THREE.WebGLProgram … X4000 … (f_shape)`） | `ready` / 无（lod high，但 renderScale 被自动降到 0.55） | **没有提示**：只有 `Koi Pond` 与 `Watch the fish. That is all.`；指针能碰水、Esc 里有 12 项控制，页面上一句说明都没有 | 没有带走入口（≥60 s 后仍只有两个 canvas 可点）；不调用 `navigator.share` | 首屏正常但慢（load 13.5 s，首测 5.6 fps，之后 54）；画面偏软 |

网络（四站一致）：只请求 `127.0.0.1:8093` 下的文档本身 + `favicon.ico`（404，`text/plain`）；**没有任何非 127.0.0.1 的请求**；传输字节 `/license` 49,421 · `/hug` 540,048 · `/still` 146,754 · `/koi` 608,030。

---

## 2. 逐站小节

### 2.0 入口页 `/`

**首屏看到什么**：深色底，左上 `Stations`（28px），下面 4 行 `— A permit to simply be.` 之类的钩子句，每句前面一个蓝色下划线链接（`License` `Hug` `Still` `Koi Pond`，14px，链接框 25–57×16 px）。手机上同版式，`doc` 高 1047 > 844，可滚。
**带走 / 交互**：四个链接在桌面与手机各点一遍，全部落到对应站（URL 以 `/xxx/` 结尾）。
**问题**：见 UX-36（点击目标只有 16 px 高）。

### 2.1 `/license` · room

**首屏看到什么**（`license-desktop-01-first.jpg`）：深棕桌面上居中一张米色纸，纸矩形 916×648 px（占画面 81%，宽高比 1.414），四周留 182 px / 36 px 边。纸上左上 `License`（34px 深墨），其下等宽小字 `PERMIT TO REST` + 一条细分隔线，再下两行衬线宣言 `This permit entitles the holder to rest, to stop explaining, and to take up space.`（19.2px），再下 `No. EMP-20261124-421`（14px 等宽，可选中）与 `2026.11.24`（13px）。纸底部一行 `A permit to simply be.`（15px），纸内底部正中一枚深灰胶囊按钮 `Stamp it`（122×48 px，白字 15px）。整张纸左上亮、右下暗，右缘有一道更暗的带。

**设计意图 vs 实际**

| PRODUCT-FORM §1.1 写的 | 实际看到的 |
|---|---|
| 纸「是空白的——它还不是你的」 | 纸上**盖章前就有**标题行、宣言句、编号、日期（`build.mjs:48-64` 的注释说明是有意的：编号「开票即印」） |
| 按钮「在纸的外侧下方，不压在纸上」 | 按钮**在纸内**底部（y=590，纸到 684） |
| 三段仪式「杠杆下压 → 印头落纸 → 章留在纸上」，不画进度条 | 没有杠杆、没有印头；只有纸底一个 12px 的状态词 `verifying` → `stamping` → `approved`；章（一个 3px 红圈 + `APPROVED`）在 `approved` 那一刻才淡入（`stamping` 期间 `opacity: 0`） |
| 只允许一个极小的 `approved` 状态词 | 三个阶段词都上屏（12px，字距 0.34em，小写） |
| 盖章后可做三件无意义的事 | 三件都在：拖光（`--sun-angle` −25.31° → 6.77°，纸面像素差均值 3.75 L\*，放手后不弹回）、重盖（章倾角变了）、折角（右下 128 px 三角纸背，纸面其余区域像素差 0.045 L\*） |
| 慢变量：光带 4 分钟单调下移 | 变量在走（`--sun-angle` −25.64° → −24.64° → −23.63°，每 40 s +1°），但整帧 L\* 均值 80 s 只变了 0.31 L\*（见 §4 G7） |
| 保存后按钮显示 `Saved.` 2 s | 没有出现：点 `Save it` 后 3 s 内按钮文字一直是 `Save it` |

**交互逐项结果**

| 操作 | 预期 | 实际 | 证据 |
|---|---|---|---|
| 停留 10 s 不动 | 画面基本静止 | 基本静止：整帧像素差均值 0.49 L\*，>3 L\* 的像素 0.96% | `02-idle-10s.jpg`，`metrics.json → license-desktop.idle10s` |
| 只移动指针 | 无反应 | 无反应（纸面差 0.47 L\*，与静止噪声同量级；`tapped` 仍为 false） | `03-pointer-move.jpg` |
| 单击 `Stamp it` | 仪式 6.4 s 后章落在纸上、`Save it` 出现 | +2.2 s 状态词 `verifying`，按钮仍在；+6.3 s `stamping`，按钮仍在、章不可见；+8.7 s `approved`，章淡入、`Stamp it` 隐藏、`Save it` 与 `Stamp again` 与提示出现、`NO COPY KEPT.` 出现。`snapshot()` 前后无差别（state 一直 `ready`） | `04` `05` `06` |
| 在纸上横向拖拽 | 光移动 | 光移动（见上表）；`snapshot.tapped` false → true（画布上的按下被壳记为 tapped） | `07-drag-light.jpg` |
| 按 `f` | 右下纸角翻起 | 翻起：角区像素差均值 8.24 L\*（49% 像素 >3），纸的其余部分 0.045 L\*；再按一次收回 | `08-fold.jpg` |
| 单击 `Stamp again` | 再走一遍仪式 | 走了：1.3 s 时 `verifying`（`Save it`、提示收起，`Stamp it` 仍隐藏），8.4 s `approved`，章倾角 −0.72° → −2.38° | `09` `10` |
| 摆弄后身份不变 | 编号/日期/宣言不变，无第二个编号、无第二个导出入口、无计数 | 三项完全一致；`EMP-` 出现 1 次；可见按钮只有 `Stamp again`、`Save it` | `metrics.json → identityBefore / identityAfter` |
| 滚轮 | 无滚动 | `scrollY` 0 | — |
| Tab ×3 | 有可见焦点框 | 第 1 次 `Save it`（默认 `outline: auto`，1px），第 2 次回到 body，第 3 次 `Stamp again` | `11-tab1/2/3.jpg` |
| Enter（焦点在 `Stamp it`） | 触发盖章 | 触发（状态词 `verifying`） | `metrics.json → hug-keyboard-mic.licenseEnter` |
| Esc | 打开菜单 | 右上深色面板：`MENU` / `Sound Off` / `Motion Full` / `Quality High` / `About` / `Credits Parts are adapted…`（整句）/ `Close` / `Nothing here is sent anywhere.` | `12-esc-menu.jpg` |
| 菜单里点 `Sound` | 只开关声音，世界不动 | 值变 `Sound On`，`tapped` 保持 false，整帧像素差 0.022 L\*（噪声 0.012） | `metrics.json → gseries.perSite.license.g6` |
| 菜单里点 `Motion` `Quality` `About` `Credits` | 值循环 / 显示说明 | `Motion Reduced`、`Quality Normal`；`About` 显示的是 `Nothing here is sent anywhere.`（与末行同一句，不是各站 About 正文）；`Credits` 显示整句 | `13-menu-about.jpg` |
| 长按桌面空白 1 s | 无 | 无（仅 `tapped` 变 true） | — |

**带走路径结果**

- **编号**：`#cert-serial-value` 的 `user-select` 为 `text`，程序选中读回 `EMP-20261124-421`，命中测试顶层元素就是它 ✓。
- **Save it → PNG**：点击后浏览器发出 `Browser.downloadWillBegin`，文件名 `emopulse-license-EMP-20261124-370.png`，总字节 2,175,361；随后进度变成 **`canceled`，文件没有落盘**。对照组（留在 DOM 里的 `<a download>`、点完立刻 `remove()` 的、3 s 后再 `remove()` 的、以及同源普通文件的 blob 下载）**全部同样 `canceled`**，所以这是本机无头环境的限制，不是站点写法的证据 → **落盘：未测：环境**。
- 改为截获 `toDataURL` 的返回值（= 浏览器将写盘的字节）检查导出物：PNG **1410×1000**（比例 1.41 ✓），内容 = 纸矩形裁切 + 标题 / 宣言 / 编号 / 日期 / 红章 / `NO COPY KEPT.`，不含按钮与提示 ✓。
- **导出图 ≠ 屏幕**：4×4 网格对照，**左半边比屏幕暗 5.8 / 9.0 / 10.6 / 10.8 L\***，右半边差 −1.9 ~ +0.9 L\*。目视：屏幕上亮部在左、暗部在右下；导出图暗部在左上、亮带在中偏右。（`sites/license/export.ts:87-99` 自己画了一层渐变，长度按 `W/2`、`H/2` 取，比 CSS 同角度渐变短约 28%。）
- 剪贴板 / 系统分享：页面不调用 `navigator.clipboard`（`/license`），也不调用 `navigator.share`（产物内出现 0 次）。

**手机结果**（`license-mobile-01-first.jpg` `03-approved.jpg`）：视口 390×844，无横向溢出，文档高 844（不可滚）。纸只有 **320×226 px**，落在 y=309–535，上下各留约 300 px 的空桌面。`Stamp it` 在纸下方 y=699（首屏内）✓。**approved 后纸上文字重叠**：宣言句（5 行，y=399–492）压住编号（y=448）和日期（y=456）；`approved` 状态词（y=481）压住宣言末行和 `A permit to simply be.`；红章（208–310, 397–499）压住宣言右端；`Save it`（y=489–525）压住 `Stamp again`（y=503）；`drag to move the light · f to fold the corner` 被纸的下边缘裁掉。提示里的 `f` 键在手机上不存在，也没有折角的可点入口。Esc 菜单在手机上**没有入口**（点右上角无反应，那一下被当成点了画布）；用按键强行打开后面板宽 382 px，不出屏。

**问题清单**：UX-03、UX-15、UX-16、UX-17、UX-18、UX-19、UX-20、UX-21、UX-32、UX-33、UX-34。

### 2.2 `/hug` · field

**首屏看到什么**（`hug-desktop-01-first.jpg`）：墨绿到灰绿的渐变底，没有任何地平线或地面；右上偏中一团暖色光斑（约 x=760–830, y=180–210），全屏散着大小不一的模糊亮斑。左上 `Hug`（104px 白色衬线），其下 `Send a little warmth as a link.`（26.9px，两行）。画面中下部 5 根细茎顶着 **9 个白色绒球**（直径约 50–130 px），茎上有少量深绿叶片。右下角一枚半透明深色胶囊按钮 `Let it go`（121×48 px）。整帧 L\* P50 29.4，色相 P50 103°，饱和 0.26。

**设计意图 vs 实际**

| PRODUCT-FORM §1.2 写的 | 实际看到的 |
|---|---|
| 地平线压在下 1/3；整片草原 | 看不到地平线，也看不到「草原」——只有 5 根茎，背景是渐变 + 模糊亮斑 |
| 10 株蒲公英形成 5 簇花球 | 画面里数得出 9 个绒球 |
| 绒毛随微风轻晃但不飞走 | 是：花球区 10 s 内像素差均值 2.58 L\*（21% 像素 >3 L\*），停留 10 s 后绒球仍在 |
| 首屏只有三层 | 是：`H1` + `p#lead` + `button#cta`，可见 h1/p/button 合计 3 |
| 按画面上任何地方都等于「放开它」 | 是，但**两条路径的后果不一样**（见下） |
| 状态文案 `Ready when the wind is.` / `It is on its way.` / `Gone. Keep some for yourself.`，以及按钮 `Copy the link` | **四样都没有出现**。全站唯一的反馈是一行 12px 的 `Link copied. Send it to someone.` |
| 麦克风是连续输入，不出「决定」 | 麦克风一有声音输入就触发了不可逆的放飞（UX-07） |
| 慢变量 | 没有：0 / 40 / 80 s 三张图的 L\* P50 / 均值 / 色相 / 饱和**完全相同**（文档自己也写了「当前实现不做」） |

**交互逐项结果**

| 操作 | 预期 | 实际 | 证据 |
|---|---|---|---|
| 停留 10 s | 绒毛在晃、不飞走 | 在晃（花球区差 2.58 L\*），不飞 | `02-idle-10s.jpg` |
| 指针在草地上移动 / 悬停 | 无招徕（不变手型、无高亮） | 画布 `cursor: auto`，无高亮（花球区差 2.31 L\* = 晃动噪声） | `03` |
| 悬停按钮 | 有 hover | 边框色从 72% 不透明变成 100%（区域差均值 1.0 L\*，很淡） | `04-hover-cta.jpg` |
| 滚轮 / 方向键 | 无 | `scrollY` 0，`tapped` false | — |
| Tab ×3 | 焦点落在 `Let it go`，有可见焦点框 | 第 1 次 `Let it go`，2px 白色实线外框（偏移 3px）；第 2 次 body；第 3 次回到按钮 | `05-tab1/2/3.jpg` |
| Enter / Space（焦点在按钮） | 放飞 + 拿到链接 | 两者都触发 `click` 1 次、放飞、`Link copied. Send it to someone.` | `18-keyboard-enter.jpg`、`18-keyboard-space.jpg` |
| **点草地（980,560）** | 放飞 + 种子离场后拿到链接 | **放飞了，但什么都没给**：0.8 s 绒毛开始脱开，2.4 s 大片飞散，5.5 s 花球基本空，14.6 s 全空；全程 `share-note` 隐藏、按钮仍是 `Let it go`、剪贴板读回空字符串、`snapshot.tapped` true | `08` `09` `10` `11` `12-release-*.jpg` |
| **只点按钮 `Let it go`** | 同上 | 放飞 + 立即写剪贴板 `http://127.0.0.1:8093/hug?from=hug`（读回一致）+ 按钮上方 14 px 处出现 `Link copied. Send it to someone.`（12px，右对齐） | `13-button-release-2s.jpg`、`14-button-release-9s.jpg` |
| Esc | 打开菜单 | `MENU` / `Sound Off` / `Motion Full` / `Quality High` / `Wind Off` / `About` / `Credits …` / `Close` / `Nothing here is sent anywhere.` | `06-esc-menu.jpg` |
| 菜单里点 `Sound` | 不放飞 | 不放飞：`tapped` false | `07-menu-sound-on.jpg` |
| 菜单开着时点画布 | 不进世界 | 不进（`tapped` false，菜单仍开） | `metrics.json → koi-menu.koiMenu.menu.canvasTapWhileOpen`（壳逻辑四站相同，/koi 上实测） |
| `?from=hug` 打开 | 多一行 `Someone sent you this link.`，按钮变 `Send one on` | 多一行 `Someone sent you a little warmth.`（12px），按钮 `Send one on` | `17-from-hug.jpg` |

**带走路径结果**

- **主载体（链接）**：只在**按钮 / 键盘**路径上给。点的那一刻页面**未经确认直接写剪贴板**，然后显示 `Link copied. Send it to someone.`；没有 `Copy the link` 按钮，用户没有第二次复制的机会（那一行字不接收点击）。
- **草地路径**：没有链接、没有文字、没有剪贴板写入。
- **系统分享**：`navigator.share` 在浏览器里存在，但产物内对它的调用是 **0 次** → 没有调起系统分享这条路。
- **次载体（可复制短句 `HUG_LINES`）**：页面上没有出现任何一句。

**Wind（麦克风）三种权限**（都是打开 Esc 后点 `Wind`）

| 权限 | 页面显示（原文） | 能否继续 | 证据 |
|---|---|---|---|
| **denied** | 立即 `Wind Off` + 菜单备注 `Microphone unavailable.`（11px）；再点一次同样 | 能，关菜单后 56.7 fps，`tapped` false | `19-mic-denied-*.jpg`、`20-mic-denied-off.jpg` |
| **prompt** | **未测：无头浏览器没有权限框**，`getUserMedia` 立刻被拒，表现与 denied 完全相同（`Microphone unavailable.`）。真实浏览器里「权限框悬着没点」时按代码会停在 `Wind On` + `Requesting microphone…`（`sites/hug/attach.ts:42`），这一态没有实机验证 | — | `19-mic-prompt-*.jpg` |
| **granted** | 0.3 s `Wind On` + `Requesting microphone…`；2.5 s 起 `Wind On` + `Microphone on. Nothing is recorded. Wind only.`；再点一次回 `Wind Off`、备注消失 | 能 | `19-mic-granted-*.jpg`、`20-mic-granted-off.jpg` |

**但是 granted 这一档出了一个产品级问题（UX-07）**：任务前提写的是「假设备是静音输入」，实测 **Chromium 默认假麦克风是会响的**（世界收到的 `audio.level` 在 +1.84 s 首次非零 0.273，之后到 1.0）。结果：**打开 Wind 后约 2 s，蒲公英在菜单开着、指针没碰画布的情况下被全部放飞**（花球区亮像素占比 8.4% → 10.8% → 0.7% → 0.2%），`tapped` 仍为 false，没有链接、没有任何文字。用真正的静音 WAV 做输入重跑（`level` 全程 0）则**不放飞**。对应代码：`shared/parts/hug-meadow/index.ts:478` 的 `if (phase === 'ready' && f.audio.level > 0.12) blow(...)`，而 `mic.ts:105` 把 RMS 乘了 3，所以很轻的声音就会过线。

**手机结果**（`hug-mobile-button-01-first.jpg`）：视口 390×844，无溢出。`Hug` 52px 在左上，钩子句 14px 两行在标题下，绒球 6 个偏左下（最大的一个中心约 (90,320)），`Let it go` 在底部正中 y=699（首屏内）。点草地 → 绒毛向右飞出屏幕，没有任何文字；之后再点按钮 → `Link copied. Send it to someone.`。只点按钮 → 放飞 + 同一行字。双指张开 → **页面被浏览器放大到 5×**（UX-12）。Esc 菜单：可点元素只有两个 canvas 和 `cta`，没有入口。

**问题清单**：UX-06、UX-07、UX-11、UX-12、UX-22、UX-23、UX-35。

### 2.3 `/still` · tide

**首屏看到什么**：**黑屏**。frames=60 刚到时（页内约 2.4 s）整屏是 `#07090c–#141922` 的径向渐变，没有任何文字、进度或提示（`still-desktop-00-frames60-veil.jpg`）。遮罩开始淡出的时刻 6 次独立运行分别是 **31–41 s、45.1 s、21.0 s、25.9 s（手机）、16.4 s、26.4 s**（前四次读页内 `stateAt.degraded`，后两次是小裁剪连拍量到的画面变亮时刻）。
淡出后（`still-desktop-03-idle-10s.jpg`）：一幅**水下海藻林**——左中一根灰白沉木，中右 3–5 根竖直的深绿海藻，右侧一整面深色岩壁，左下与右下的粉紫色珊瑚，成群的小鱼，偶尔一条蝠鲼；顶部亮、底部暗的青蓝色调，L\* P50 约 47–50，色相 P50 约 70°。左上 `Still`（34px 白），左下 `Nothing here needs an answer.`（15px），底部正中 `Sit`（80×48 px 胶囊按钮）。内部渲染分辨率被自动降到 472×264 / 704×396 再拉到 1280×720。

**设计意图 vs 实际**

| PRODUCT-FORM §1.3 写的 | 实际看到的 |
|---|---|
| 满幅的水。没有地平线、没有岸、没有边框、没有中心物体 | 没有边框和地平线 ✓；但有大量可指认的物体（沉木、海藻、岩壁、珊瑚、鱼群、蝠鲼），中心 60% 区域内就有海藻和沉木 |
| 暗、冷：L\* P50 26，明度带 8–15 | 实测整帧 L\* P50 47–50（偏亮偏饱和的青色）；某一轮镜头移到岩壁近景后 22–24 |
| 按 `Sit`：镜头下潜到水位线以下，上方出现折射光带 | `Sit` 后镜头**硬切**到岩石与珊瑚的近景（+8 s 的截图里画面完全换了），没有折射光带；按钮文字不变 |
| 10 s 后出现 `Stay as long as you like.` | 没有出现（Sit 后 124 s 全文只有标题、钩子、按钮） |
| ≥60 s 出现 `Copy the line`，复制五档句子之一 | **没有带走入口**，全文无变化 |
| 气泡自己往上走、光 4 分钟单调变暗 | 没有看到可分辨的气泡；亮度随镜头位置时亮时暗（见 §4 G7），读不出「光在退」 |
| 无 WebGPU 时退回「一片水」（连续的上亮下暗 + 雾 + 微粒，气泡仍有） | 见下「特殊环境」：一张静止的灰蓝渐变，4 s 内像素差 0.009 L\*，`Sit` 无任何变化 |

**交互逐项结果**（主线程很卡，下列「实际」里括号内是名义时刻与实际时刻）

| 操作 | 预期 | 实际 | 证据 |
|---|---|---|---|
| 停留 10 s | 画面在动 | 在动但**很慢**：rAF 实测 3.2 fps，帧耗时 277 ms | `02`→`03`，像素差均值 12.4 L\* |
| 单击 `Sit` | 镜头下潜 | 镜头切换到岩石珊瑚近景；名义 +1 s 的截图实际在点击后 8.0 s 才拍到（CDP 请求排在长帧后面）；全文无变化 | `04-sit-1s.jpg` `05` `06` `07` `08` `09-sit-60s.jpg` |
| 再按 `Sit` | 站起来 | 画面又换了一次（与 124 s 那张差均值 20.6 L\*） | `17-stand-4s.jpg` |
| 移动指针 / 拖拽 / 按住 1 s、3 s / 滚轮 | 没有第二个动作 | **量不出来**：画面自身每 1.5 s 就差 5.5–12.4 L\*，任何操作的差值（3.8–16.6 L\*）都落在这个范围内；`scrollY` 0，`tapped` true | `10` `11` `12` `13` |
| Tab ×3 | 可见焦点框 | 第 1 次 `Sit`（2px 白色外框），第 2 次 body，第 3 次 `Sit` | `15-tab1/2/3.jpg` |
| Esc | 菜单 | `MENU` / `Sound Off` / `Motion Full` / `Quality High` / `About` / `Credits …` / `Close` / `Nothing here is sent anywhere.` | `14-esc-menu.jpg` |
| 菜单里点 `Sound` | 世界不动 | `tapped` false；像素差 12.2 L\* 对噪声 5.5 L\*（画面自己在动，分不出） | `metrics.json → still-env.g6` |

**带走路径结果**：**没有**。Sit 后 61.7 s 与 124 s 两次读全文都是 `Still\nNothing here needs an answer.\nSit`；可点元素只有两个 canvas 和 `Sit`。页面没有调用剪贴板、下载或 `navigator.share`。

**特殊环境结果**

| 环境 | snapshot | 画面 | fps | 用户看到的提示 | 证据 |
|---|---|---|---|---|---|
| 默认（Iris Xe，WebGPU 可用） | `degraded`，lod low，drawn 5/5，三件 `budget`，renderScale 0.55 | 海藻林，偏软 | 3–28 | 无 | `03-idle-10s.jpg` |
| **无 WebGPU**（页面侧删 `navigator.gpu`；浏览器开关的方式实测无效，见口径第 5 条） | `degraded`，lod high，drawn **4/5**，`voxel-world` `unsupported`：`没有可用实例（环境缺少该零件需要的画布/能力）` | 一张**静止的**灰蓝竖向渐变加几粒小点，上略亮下略暗（十分位均值 40.8 → 23.6 单调下降 ✓），没有可分辨的雾、微粒或气泡 | 57（但画面不动） | **没有任何文字**：`#boot-error` 隐藏，全文与默认档相同 | `still-nowebgpu-02-revealed.jpg`、`still-nowebgpu-04-sit-6s.jpg` |
| **swiftshader**（无独显 / 核显很弱） | `degraded`，lod low，drawn **4/5**，三件 `budget` + `voxel-world` `suspended`：`异步失败：No WebGPU adapter found.` | 同上一张灰蓝渐变，略暗（L\* P50 31.6） | **1.3–1.7**（帧耗时约 880 ms） | 没有任何文字；浏览器控制台有 4 条告警（`No available adapters.` 等） | `still-swiftshader-02-revealed.jpg` |

两种降级环境下：**4 秒内像素差均值 0.009 / 0.006 L\*（画面完全静止）；按 `Sit` 后 6 s 像素差 0.015 / 1.011 L\*（没有可见反应）**。

**手机结果**（`still-mobile-02-revealed.jpg`）：视口 390×844，无溢出。遮罩 25.9 s 后露出的画面是**坏的**：海藻林只画在左上角约 390×260 的一块横向区域里（占屏幕高度 31%），其余部分是从这块区域的边缘像素拉出来的横向拖影条纹，外加一个大暗角。`Still` 在左上，`Sit` 在底部正中 y=699，`Nothing here needs an answer.` 在左下。`Sit` 之后同样只换掉了左上那一块。fps 25.6（renderScale 0.55，内部 429×928）。没有 Esc 菜单入口。双指张开 → 页面被放大 5×。

**问题清单**：UX-01、UX-02、UX-04、UX-08、UX-09、UX-13、UX-14、UX-24、UX-25、UX-26。

### 2.4 `/koi` · ink / paint / real

**首屏看到什么**：frames=60 时（`koi-desktop-01-first.jpg`，实际在导航后约 19 s 拍到）**还是黑的**：深色底上只能隐约看到 `Koi Pond` 几个字，没有别的。用小裁剪连拍量「画面何时变亮」：两次分别是 4.7 s 与 7.2–9.2 s（`metrics.json → boot.koi`）。期间主线程有两段长任务：3.46 s + 6.76 s（手机那轮 3.9 s + 9.2 s）。
亮了之后（`koi-desktop-02b-idle-12s.jpg`）：整屏米白宣纸纹，纸面略暗的横向颗粒；约 11 条墨色锦鲤（深墨、灰墨、白身黑斑三种），四角一圈灰蓝荷叶与两朵粉色荷花，几片橙色小花；墨鱼边缘发毛，整体偏软（内部 704×396 拉到 1280×720）。左上 `Koi Pond`（34px 深墨），左下 `Watch the fish. That is all.`（15px）。**没有按钮**。

**设计意图 vs 实际**

| PRODUCT-FORM §1.4 写的 | 实际看到的 |
|---|---|
| 首屏只有 H1 / hook / 池塘，没有主按钮 ✓ | 一致（可见 h1/p/button = 2） |
| 默认宣纸水墨：纸白、墨鱼、浮萍、落叶，右下角莲叶 | 一致；`?style=paint` 水彩、`?style=real` 真水也都在，三种差别明显（见下） |
| 指针：`Ripple` 推开鱼、`Feed` 撒食、`Call` 按住聚鱼 | Ripple：划过水面有很淡的同心环，点一下 / 按住 1 s、3 s 的像素差 0.10–0.32 L\*，**低于** 1.5 s 自然运动噪声 0.83 L\*；Feed：点一下后 28% 像素变化（鱼群明显反应）；Call：按住 2.7 s 的截图里鱼没有聚拢（像素差 0.1–0.19 L\*） |
| 相机 Top / 2.5D / Orbit，双指或右键也能转 | 菜单里三档都切得动；右键拖拽 300 px 画面差 0.25 L\*（低于噪声，没转）；手机双指 → **浏览器页面缩放**，不是转相机（UX-12） |
| 池底 Pebble / Sky / Dark，天气 Dry / Drizzle / Rain | 在 **ink 档**下切 Water、Weather：L\* P50 恒为 82.74，目视无差别（real 档未测） |
| 设备倾斜 / 摇摆 `?motion=1` | 未测：本轮没做传感器模拟 |
| 移动端 9 条鱼、桌面 11 条、降档 7 条 | 未量：没有逐条数鱼（截图里约 11 条） |
| 不设带走入口 | 一致：≥60 s 后全文与可点元素都不变 |

**交互逐项结果**

| 操作 | 预期 | 实际 | 证据 |
|---|---|---|---|
| 停留 10 s | 鱼在游 | 在游（之后 1.5 s 的自然运动噪声：均值 0.83 L\*，7% 像素 >3） | `02-idle-10s.jpg` |
| 指针从 (300,500) 划到 (950,260) | 涟漪推开鱼 | 划过的路径上有很淡的同心环；像素差 0.23 L\*（≤ 噪声） | `03-move-across.jpg` |
| 单击（70 ms） | 涟漪 | 像素差 0.10 L\*；手机上能看到一个清楚的圆环 | `04-tap.jpg`、`koi-mobile-02-tap.jpg` |
| 按住 1 s / 3 s | 涟漪 | 0.32 / 0.32 L\*，松手 0.27 L\*（都低于噪声） | `05-hold-1s.jpg`、`06-hold-3s.jpg`、`06b-hold-release-1_5s.jpg` |
| 右键拖拽 | 转视角 | 画面差 0.25 L\*（低于噪声），`data-koi-style` 不变 | `07-right-drag.jpg` |
| 滚轮 | 缩放 | 画面差均值 21.3 L\*，但中位数 0.26 L\*、70% 像素不变——是局部墨晕在动，不像缩放；`scrollY` 0 | `08-wheel.jpg` |
| Tab ×3 | — | 三次焦点都在 `body`：页面上**没有任何可聚焦元素**（菜单隐藏时） | `19-tab1.jpg` |
| Esc | 菜单 | 右上深色面板 **595×455 px**（盖住画面 26%），12 行：`Sound Off` `Motion Full` `Quality High` `Look Ink` `Touch Ripple` `Camera Top` `Water Pebble` `Weather Dry` `Music Off` `About` `Credits …` `Close`，末行 `Nothing here is sent anywhere.` | `09-esc-menu.jpg` |
| 菜单里点 `Look` ×3 | Ink → Watercolour → Real → Ink | 值依次变；画面 L\* P50 82.7 → 90.5 → 20.9 → 82.7 | `11-look-paint.jpg`、`12-look-real.jpg`、`13-look-ink.jpg` |
| `Camera` ×2 | Top → 2.5D → Orbit | 值变；2.5D 下鱼被拉长、画面倾斜；Orbit 下构图继续变化 | `14-cam-angle.jpg`、`15-cam-orbit.jpg` |
| `Touch` ×3 | Ripple → Feed → Call → Ripple | 值变，画面不变（0.06–0.09 L\*） | `10d/10e/10f-touch-*.jpg` |
| `Water` ×2、`Weather` ×2 | 池底与雨变化 | 值变（`Water Sky` → `Dark`；`Weather Drizzle` → `Rain`）；ink 档画面看不出差别 | `16-water-sky.jpg`、`16b-water-dark.jpg`、`17-weather-drizzle.jpg`、`18-weather-rain.jpg` |
| `Music`、`Sound` | 声音开关 | 点 `Music`（`Off → Still`）的同时 `Sound` 从 `Off` 变成了 `On`（单独复核过：18 次菜单点击里只有这一步会翻转 `Sound`）；之后点 `Sound` 变 `Off`，再点变 `On`。无头环境是静音的，**是否真的出声未测** | `10b-music-still.jpg`、`10a`、`10c-sound-on.jpg` |
| `About`、`Credits` | 说明 | `About` → `Nothing here is sent anywhere.`；`Credits` → 整句 | `09b-menu-about.jpg`、`09c-menu-credits.jpg` |
| 菜单里点 `Sound` | 世界不动 | `tapped` false | `metrics.json → gseries.perSite.koi.g6` |
| `?style=paint` | 水彩 | 纸白底，红白 / 蓝灰 / 金黄的水彩鱼，颜色晕开的荷叶与荷花 | `21-style_paint.jpg` |
| `?style=real` | 真水 | 深色水、卵石池底、焦散光斑、彩色锦鲤；标题换成浅色字；就绪 6.5 s，57 fps | `21-style_real.jpg` |
| `?style=real&cam=angle&rain=rain` | — | 就绪 23.8 s，**4.1 fps** | `21-style_real_cam_angle_rain_rain.jpg` |
| `?cam=angle` / `?cam=orbit` | 斜看 / 绕池 | 首屏即为对应视角 | `21-cam_angle.jpg`、`21-cam_orbit.jpg` |
| `?mode=feed` 点击 | 撒食 | 点击后 28% 像素变化，鱼群明显游向点击处 | `22-feed-tap.jpg`、`23-feed-drag.jpg` |
| `?mode=call` 按住 2.7 s | 聚鱼 | 1.2 s 与 2.7 s 的截图里鱼没有向按点聚拢 | `24` `25-call-hold-2_7s.jpg` `26-call-release.jpg` |

**带走路径结果**：**没有带走入口，也没有导出、下载、剪贴板或 `navigator.share` 调用**（产物内 0 次）。停留 103 s 后全文仍是 `Koi Pond\nWatch the fish. That is all.`。

**手机结果**（`koi-mobile-01-first.jpg`）：视口 390×844，无溢出；移动 UA。load 13.5 s、frames=60 在 18.9 s 才到；首测 5.6 fps，约 20 s 后 53.9 fps；renderScale 0.55。首屏 `Koi Pond` 左上、`Watch the fish. That is all.` 左下，纸白墨鱼，画面偏软。点一下出现清楚的圆环；按住 2.5 s、单指拖拽画面正常；**双指张开 → `visualViewport.scale` 1 → 5**，整页被放大成一片模糊的白纸。右上角没有菜单入口，`Look / Touch / Camera / Water / Weather / Music` 六项在手机上到不了。

**问题清单**：UX-05、UX-10、UX-11、UX-12、UX-27、UX-28、UX-29、UX-30、UX-31、UX-37。

---

## 3. 问题清单（合并总表）

严重度：**阻断** = 用户走不下去或画面坏掉；**严重** = 核心体验明显受损；**一般**；**建议**。

| 编号 | 站 | 严重度 | 现象（可核对） | 复现步骤 | 证据文件 | 代码位置 |
|---|---|---|---|---|---|---|
| UX-01 | `/still`（桌面 + 手机） | **阻断** | 打开后是**纯黑渐变、没有任何文字**的遮罩；遮罩开始淡出的时刻 6 次实测 45.1 s / 31–41 s / 21.0 s / 25.9 s（手机）/ 16.4 s / 26.4 s。其间有一段 25.3 s 的长任务（页内 15.8 s 起） | 桌面 1280×720 打开 `/still`，计时到画面出现 | `still-desktop-00-frames60-veil.jpg`、`sheet-still.jpg`；`metrics.json → boot.still#1/#2`、`still-desktop.desktop.timelineAtReveal` | 遮罩无文字：`shared/sites/build.mjs:325-327`；长任务来源**未定位**（`voxel-world` 首帧编译是嫌疑，没有实测） |
| UX-02 | `/still`（手机） | **阻断** | 390×844 下，海藻林只画在**左上角约 390×260**（占屏高 31%）的区域里；其余是从这块区域边缘拉出来的横向拖影 + 一个大暗角 | 手机 390×844 dpr3 打开 `/still`，等遮罩过去 | `still-mobile-02-revealed.jpg`、`still-mobile-03-sit-6s.jpg`、`sheet-still-mobile.jpg` | 未定位（`shared/parts/voxel-world/index.ts:267` 的 `resize` 是嫌疑入口） |
| UX-03 | `/license`（手机） | **阻断** | approved 后纸上文字互相重叠：宣言句（y=399–492）压住编号（y=448）和日期（y=456）；`approved`（y=481）压住宣言末行与钩子句；红章（x 208–310, y 397–499）压住宣言右端；`Save it`（y=489–525）压住 `Stamp again`（y=503）；提示行被纸的下边缘裁掉。首屏的宣言句就已经压住编号 | 手机 390×844 打开 `/license`，点 `Stamp it`，等 8 s | `license-mobile-03-approved.jpg`、`sheet-license-mobile.jpg`；`metrics.json → mobile.license.after.texts` | 文字位置按纸高的百分比排：`shared/sites/build.mjs:268-291`；`#save` `:308-311`；`#play-hint` `:314-316` |
| UX-04 | `/still`（无 WebGPU / 软件渲染） | **阻断**（仅这两种环境） | ① 没有 WebGPU：画面是一张**静止**的灰蓝渐变（4 s 像素差 0.009 L\*），按 `Sit` 后 6 s 像素差 0.015 L\*，**没有任何提示文字**；`snapshot.degraded` 记着 `voxel-world unsupported`。② swiftshader：同一张渐变，**1.3–1.7 fps**，画面同样静止（0.006 L\*），`Sit` 无可见反应，无提示 | ① 在页面脚本运行前把 `navigator.gpu` 置空后打开 `/still`；② `launch({ gpu: 'swiftshader' })` 打开 `/still` | `still-nowebgpu-02-revealed.jpg`、`still-nowebgpu-04-sit-6s.jpg`、`still-swiftshader-02-revealed.jpg`、`still-swiftshader-04-sit-6s.jpg`、`sheet-still-env.jpg` | 降级时没有面向用户的文案：`shared/sites/shell.ts:363-384`（降级只写进隐藏的 `#dbg`）；`sites/still/attach.ts:7-14`（`sit` 只是发一个 cue） |
| UX-05 | `/koi`（桌面 + 手机） | 严重 | 打开后先是一段**没有任何文字的深色遮罩**：画面变亮的时刻两次实测 4.7 s 与 7.2–9.2 s（手机更长：load 13.5 s，frames=60 在 18.9 s）；主线程长任务 3.5 s + 6.8 s | 桌面打开 `/koi`，计时到纸面出现 | `koi-desktop-01-first.jpg`（frames=60 时仍是黑的）；`metrics.json → boot.koi#1/#2`、`koi-menu.koiMenu.nav` | 遮罩：`shared/sites/build.mjs:325-327`；首帧着色器编译位置未定位 |
| UX-06 | `/hug` | 严重 | **点草地放飞后没有任何带走物**：绒毛全飞走了，但 `share-note` 隐藏、按钮仍是 `Let it go`、剪贴板读回为空、没有任何状态文字。只有点按钮（或键盘）才给链接 | 桌面打开 `/hug`，在 (980,560) 点一下，等 15 s | `hug-desktop-08`–`12-release-*.jpg`、`hug-mobile-02-meadow-2_5s.jpg`；`metrics.json → hug-desktop.releaseMeadow` | 链接只在 `sites/hug/attach.ts:75-90` 的 `site:cta` 里复制；草地按下走的是零件自触发（`shared/parts/hug-meadow/index.ts:470-474`、`shell.ts:177-183`），不经过站点 |
| UX-07 | `/hug` | 严重 | **打开 Wind 后，麦克风一有声音输入，蒲公英就被不可逆地全部放飞**：菜单开着、指针没碰画布，约 2 s 后花球全空；不给链接、没有任何文字（`tapped` 仍为 false）。静音输入（`level` 恒 0）时不放飞 | 授予麦克风权限，用会出声的输入（默认假麦克风即可），Esc → 点 `Wind`，等 6 s | `hug-desktop-21-wind-default-fake-device-6000ms.jpg`（放飞）对 `hug-desktop-21-wind-silent-file-10000ms.jpg`（未放飞）；`metrics.json → hug-mic-probe` | `shared/parts/hug-meadow/index.ts:478`（`phase === 'ready' && f.audio.level > 0.12` → `blow`）；`shared/sites/mic.ts:105`（RMS×3）；`shared/sites/shell.ts:199-213`（模态只挡指针，不挡音频） |
| UX-08 | `/still` | 严重 | **没有带走物**：Sit 之后 124 s，全文仍是 `Still / Nothing here needs an answer. / Sit`，可点元素只有两个 canvas 和 `Sit`；没有 `Copy the line`，没有可复制的句子 | 打开 `/still`，点 `Sit`，等 2 分钟 | `still-desktop-16-after-60s.jpg`；`metrics.json → still-desktop.desktop.takeaway` | `sites/still/attach.ts`（只处理 `sit` / `stand`）；`docs/COPY-SITES.md:125` 自己标着「未实现」 |
| UX-09 | `/still`（桌面） | 严重 | 遮罩过去后**持续卡顿**：rAF 实测 3.2–4.5 fps（之后 10–28），帧耗时 51–307 ms，内部渲染分辨率降到 0.55，`snapshot.state = degraded`（lod low，三件零件 `budget`）。点 `Sit` 后 8.0 s 才拿到第一张截图 | 同 UX-01，遮罩过去后测 2 s 的 rAF | `still-desktop-04`–`09`；`metrics.json → still-desktop.desktop.snap / idle10s / sit` | 预算判定与自动降分辨率：`shared/stage/`（未逐行定位）；配置 `shared/sites/build.mjs:122-124` |
| UX-10 | `/koi` | 严重 | 就绪后 0–20 s 实测 14–26 fps，**内部渲染分辨率被自动降到 0.55**（`#stage` 704×396 拉到 1280×720，画面发软，而 DOM 文字是清晰的）；菜单操作期间 7–17 fps；`real + 2.5D + Rain` 就绪 23.8 s、4.1 fps；手机首测 5.6 fps | 桌面打开 `/koi`，就绪后立刻测 rAF；或打开 `/koi?style=real&cam=angle&rain=rain` | `koi-desktop-02b-idle-12s.jpg`、`21-style_real_cam_angle_rain_rain.jpg`；`metrics.json → koi-desktop.main.fpsSeries`、`koi-menu.koiMenu.canvases` | `shared/sites/build.mjs:137-138`（预算 12 ms）；自动降分辨率逻辑在 `shared/stage/`（未逐行定位） |
| UX-11 | 四站（手机） | 严重 | **触屏上打不开 Esc 菜单**：页面上没有任何菜单按钮，`/license` `/koi` `/still` 点右上角无反应（那一记被当成点了画布）；`/hug` 可点元素只有 canvas 与 `cta`。后果：手机用户到不了 `Sound / Motion / Quality / About / Credits`，`/koi` 的六项二级控制完全不可达，`/license` 的折角（`f` 键）不可达 | 手机 390×844 打开任一站，找菜单入口 | `koi-mobile-01-first.jpg`、`license-mobile-04-esc-menu-via-key.jpg`（用按键才开得了）；`metrics.json → mobile.*.menu` | 菜单只由 `Escape` 键打开：`shared/sites/shell.ts:310-315`；模板里没有菜单按钮：`shared/sites/build.mjs:362-367` |
| UX-12 | 四站（手机） | 严重 | **双指捏合触发的是浏览器页面缩放**：四站 `visualViewport.scale` 都从 1 变成 5，之后停在 5；`/koi` 文档里的「双指也能转」实际转到的是页面 | 手机 390×844，在画面中部做一次双指张开 | `koi-mobile-11-after-pinch-out.jpg`、`license-mobile-11-after-pinch-out.jpg`、`hug-mobile-11-after-pinch-out.jpg`、`still-mobile-11-after-pinch-out.jpg`；`metrics.json → mobile-pinch` | 画布没有 `touch-action`：`shared/sites/build.mjs:153`；viewport 没有限制缩放：`shared/sites/build.mjs:345` |
| UX-13 | `/still` | 严重 | **画面不是「一片水」**：中心 60% 区域里有沉木、海藻、岩壁、珊瑚、鱼群、蝠鲼；整帧 L\* P50 47–50、色相 P50 约 50–70°（设计口径是暗、冷，L\* P50 26）。`MANUAL-QA` S2「零实体」不成立 | 打开 `/still`，等遮罩过去，看截图 | `still-desktop-03-idle-10s.jpg`、`still-desktop-18-probe-60s.jpg`；`metrics.json → still-desktop.desktop.revealed.L` | `shared/parts/voxel-world`（场景内容；未逐行定位）；设计口径 `docs/PRODUCT-FORM.md:216` |
| UX-14 | `/still` | 一般 | **没按 `Sit`，镜头也会自己移走并变暗**：一轮 0 → 40 s 整帧 L\* P50 44.8 → 23.6（画面从海藻林变成岩壁近景），40 → 80 s 23.6 → 22.4；另两轮 170 s 内均值停在 47–51。读不出「光在慢慢退」 | 打开 `/still`，不点任何东西，0 / 40 / 80 s 各截一张 | `metrics.json → gseries.perSite.still.g7`（对照图在 `_scratch/review-1124/ux-sites/tmp/_g-still-t0.png` 与 `_g-still-t40000.png`） | 未定位（`shared/parts/still-sink` 是嫌疑） |
| UX-15 | `/license` | 一般 | 盖章的 6.4 s 里，画面上唯一的变化是纸底一个 12px 状态词（`verifying` → `stamping` → `approved`）；没有杠杆、印头或下压动作；章到 `approved` 才淡入，`stamping` 期间 `opacity: 0` | 桌面点 `Stamp it`，在 +1.3 s、+3.9 s 截图 | `license-desktop-04-stamp-verifying.jpg`、`05-stamp-stamping.jpg`、`06-approved.jpg` | `sites/license/ritual.ts:58-78`；`shared/sites/build.mjs:295-305` |
| UX-16 | `/license` | 一般 | **导出的 PNG 与屏幕不同光**：4×4 网格对照，导出图左半边比屏幕暗 5.8 / 9.0 / 10.6 / 10.8 L\*，右半边差 −1.9 ~ +0.9 L\*（目视：屏幕亮部在左、暗部在右下；导出图暗部在左上） | 盖章后点 `Save it`，把导出图与屏幕的纸矩形逐块比 | `metrics.json → license-export.grid`、`license-export.compare`（导出原件在 `_scratch/review-1124/ux-sites/tmp/license-export.png`）；屏幕对照 `license-desktop-14-after-save.jpg` | `sites/license/export.ts:87-99`（自己画渐变，长度取 `W/2`、`H/2`）对 `shared/sites/build.mjs:263-264`（CSS 渐变） |
| UX-17 | `/license` | 一般 | 点 `Save it` 后**没有任何完成反馈**：按钮文字 3 s 内一直是 `Save it`（`COPY-SITES` 写的 `Saved.` 没有出现）。下载本身已发起（文件名与 2,175,361 B 的事件都在），**落盘未测：环境** | 盖章后点 `Save it` | `license-desktop-14-after-save.jpg`；`metrics.json → license-desktop.takeaway.buttonTextPoll_250ms`、`license-takeaway.dl` | `sites/license/index.ts:111-119` |
| UX-18 | `/license` | 一般 | 盖章后的二级文字对比度低（取文字框内最深与最浅像素算，是上限）：`Stamp again` **2.88:1**、提示行 **2.49:1**、章下 `NO COPY KEPT.` **2.59:1**，都是 11px；同纸上编号 7.48:1、状态词 5.75:1 | 盖章后截图量像素 | `license-desktop-06-approved.jpg`；`metrics.json → license-takeaway.contrast` | `shared/sites/build.mjs:287-292`、`314-321` |
| UX-19 | `/license`（手机） | 一般 | 提示写着 `f to fold the corner`，手机没有 `f` 键，也没有可点的折角入口 | 手机盖章后看纸角 | `license-mobile-03-approved.jpg`；`metrics.json → mobile.license.foldEntry` | `sites/license/index.ts:85-91`（只监听键盘） |
| UX-20 | 四站 | 一般 | Esc 菜单的 `About` 显示的是 `Nothing here is sent anywhere.`——和面板末行是同一句；`COPY-SITES §2` 给每站写的 About 正文一句都没出现 | Esc → 点 `About` | `license-desktop-13-menu-about.jpg`、`koi-desktop-09b-menu-about.jpg`；`metrics.json → *.menu.afterAbout.note` | `shared/sites/shell.ts:280-282`（`showMenuNote(config.privacy)`） |
| UX-21 | 四站 | 一般 | `Credits` 的整句话（513 px 长）直接塞在菜单项里当作「当前值」，12px 灰字；而 `About` 是空的 | Esc 看菜单 | `license-desktop-12-esc-menu.jpg`、`hug-desktop-06-esc-menu.jpg` | `shared/sites/build.mjs:510-515`；`shared/sites/copy.mjs`（`items` 里 `menu-credits`） |
| UX-22 | `/hug` | 一般 | 没有任何状态文案：`Ready when the wind is.` / `It is on its way.` / `Gone. Keep some for yourself.` 与按钮 `Copy the link` 都没出现；全站反馈只有一行 12px 的 `Link copied. Send it to someone.`，并且**点按钮的那一刻就未经确认写入剪贴板** | 点 `Let it go` | `hug-desktop-13-button-release-2s.jpg`；`metrics.json → hug-desktop.releaseButton` | `sites/hug/attach.ts:75-90` |
| UX-23 | `/hug` | 一般 | 带 `?from=hug` 打开显示 `Someone sent you a little warmth.`，`MANUAL-QA H12` 写的是 `Someone sent you this link.`（两份文档不一致，页面跟的是 `COPY-SITES`） | 打开 `/hug?from=hug` | `hug-desktop-17-from-hug.jpg` | `sites/hug/attach.ts:62-72`；`docs/MANUAL-QA.md:115` |
| UX-24 | `/still` | 一般 | 按 `Sit` 后：没有 `Stay as long as you like.`（`MANUAL-QA S7`）；镜头是**硬切**到岩石与珊瑚近景，没有「下潜到水位线以下 + 折射光带」；按钮文字不变，没有「已坐下」的任何标志 | 点 `Sit`，在 +8 s、+15 s 截图 | `still-desktop-04-sit-1s.jpg`、`06-sit-10s.jpg`；`metrics.json → still-desktop.desktop.sit.seq[*].texts` | `sites/still/attach.ts:7-14` |
| UX-25 | `/still` | 建议 | 站点配置里 `vignette: 0.18`，超过 `PRODUCT-FORM §2.2-A-4` 的红线 ≤ 0.14（零件会夹到 0.14；实际生效值**未量**） | — | 源码事实，无截图 | `shared/sites/build.mjs:124` |
| UX-26 | `/still` | 建议 | 运行时 DOM 里有 **21 个 CJK 字符**（可见文本 0 个）：`#dbg` 的降级明细 `总开销 13.52ms > 预算 12.00ms，已降 low` ×3。默认隐藏，加 `?debug` 就会显示中文 | 降级档下读 `document.body.textContent` | `metrics.json → gseries.perSite.still.dom.cjk`（`textContent: 21`） | `shared/sites/shell.ts:371-381`；明细文案来自 `shared/stage/`（未逐行定位） |
| UX-27 | `/koi` | 一般 | **ink 档下 `Water` 与 `Weather` 切了看不出变化**：`Water Pebble → Sky → Dark`、`Weather Dry → Drizzle → Rain`，整帧 L\* P50 恒为 82.74，目视一致（`real` 档未测） | Esc 里依次点 `Water`、`Weather`，每点一次截一张 | `koi-desktop-16-water-sky.jpg`、`16b-water-dark.jpg`、`17-weather-drizzle.jpg`、`18-weather-rain.jpg` | `shared/parts/koi-pond/index.ts`（`floor` / `rain` 在 ink 路径下的用途未定位） |
| UX-28 | `/koi` | 一般 | 默认 `Ripple` 模式下，点一下、按住 1 s、按住 3 s 的像素差 0.10–0.32 L\*，都低于 1.5 s 的自然运动噪声 0.83 L\*——按住没有可分辨的反应；`Call` 模式按住 2.7 s 鱼没有聚拢 | 见 §2.4 交互表 | `koi-desktop-05-hold-1s.jpg`、`06-hold-3s.jpg`、`25-call-hold-2_7s.jpg` | `shared/parts/koi-pond/index.ts:461-478`、`562` |
| UX-29 | `/koi` | 一般 | 页面上**没有任何可聚焦元素**：Tab 三次焦点都在 `body`；键盘用户只能按 Esc | 桌面按 Tab | `koi-desktop-19-tab1.jpg`；`metrics.json → koi-desktop.main.tab` | `cta: null`：`shared/sites/build.mjs:131`；菜单隐藏时按钮不可聚焦：`build.mjs:362` |
| UX-30 | `/koi` | 建议 | Esc 菜单有 **12 项**（`MANUAL-QA G5` 写的是 6–7 项）；每一项都是「点一下换下一档」的循环按钮，没有箭头或说明；面板 595×455 px，盖住画面 26% | 按 Esc | `koi-desktop-09-esc-menu.jpg` | `shared/sites/copy.mjs`（`items`）；`sites/koi/attach.ts:96-126` |
| UX-31 | `/koi` | 建议 | console 警告 2 条：`THREE.WebGLProgram: Program Info Log: (74,1): warning X4000: use of potentially uninitialized variable (f_shape)`（另一条在 `(129,1)`） | 打开 `/koi` 看 console | `metrics.json → koi-desktop.main.summary.consoleWarnings` | `shared/parts/koi-pond/modules/`（着色器；未定位到行） |
| UX-32 | 四站 + 入口 | 建议 | 每次加载都请求 `/favicon.ico` 并得到 404（`text/plain`）——`MANUAL-QA G2`「除文档本身外请求数 = 0」字面上不成立（同源、非外联） | 打开任一站看网络面板 | `metrics.json → gseries.perSite.*.requests / faviconStatus` | 模板没有 icon 链接：`shared/sites/build.mjs:340-348` |
| UX-33 | `/license` | 建议 | 重盖的章倾角实际是随机的：`paint('stamping')` 在 `stamping` 期间**每帧**都执行一次，`round` 一次仪式累加约 35 次（实测 172 → 207、423），倾角 `sin(round × 2.7) × 2.4°` | 点两次 `Stamp again`，读 `#seal` 的 `--seal-tilt` | `metrics.json → license-desktop.stamp.seq[*].seal.round` | `sites/license/ritual.ts:73-76`、`92-93` |
| UX-34 | `/license` | 建议 | 与 §1.1 的两处出入（可能是有意的）：① 按钮在纸内底部，不是纸外下方；② 盖章前纸上已有标题行、宣言句、编号、日期，不是「空白的纸」 | 看首屏 | `license-desktop-01-first.jpg` | `shared/sites/build.mjs:212-216`（`#cta` 定位）、`48-64` |
| UX-35 | `/hug` | 建议 | 画面里没有地平线、没有草原：只有 5 根茎和约 9 个白色绒球，背景是渐变加模糊亮斑；整帧 L\* P50 29.4、色相 103°（`MANUAL-QA §11b` 的基线是 43.1 / 35°，那是旧方案） | 看首屏 | `hug-desktop-01-first.jpg`；`metrics.json → hug-desktop.first.stats` | `shared/parts/hug-meadow/index.ts` |
| UX-37 | `/koi` | 一般 | 在菜单里点 `Music`（`Off → Still`）会把 `Sound` 一并变成 `On`：用户只是想看看音乐有哪几档，声音开关就被打开了。产品口径是「四站默认全静音，音频只能在 Esc 里**显式**打开」。是否真的出声未测（无头环境静音） | Esc → 点 `Music`，读 `Sound` 的值 | `koi-desktop-10b-music-still.jpg`；`metrics.json → koi-sound` | `sites/koi/attach.ts:122-126`（`cue(`music:${music}`)`）；`shared/parts/koi-pond/index.ts`（音乐开启时的音频联动，未定位到行） |
| UX-36 | `/`（入口） | 建议 | 四个链接是 14px 蓝色下划线，点击高度只有 16 px（手机上偏小） | 打开 `/` | `index-mobile-01-first.jpg`、`index-desktop-01-first.jpg`；`metrics.json → index.*.links` | `shared/sites/build.mjs:578-586`（入口页模板） |

**没量到的（未测：原因）**

- `MANUAL-QA` 各站的像素门（L1–L15、S1、S3–S6、S10–S15、K1–K7、K9–K10）：本轮是用户视角走查，没有逐条跑像素算法；只顺手量了能从截图直接算的几项（L\* P50、色相、饱和、十分位均值、区域像素差）。
- `/license` 下载**落盘**、真实浏览器里的权限框悬停态、真实手机（都是无头模拟）。
- `/koi` 的 `real` 档下 Water / Weather 是否可见、`?motion=1`、鱼数。
- `/hug` 的风向 / 受光慢变量（H10）：0 / 40 / 80 s 整帧统计量完全相同，没有可量的位移。
- `G11`（`costMs` 纯函数等号）与 `G12`（暗角三段）：页面句柄 `__site.stage` 不暴露 `costMs`；`v = 0` 的对照组需要改构建配置，本轮禁止 build。

---

## 4. G 系列阻断项核对表

| # | 判据 | license | hug | still | koi | 依据 |
|---|---|---|---|---|---|---|
| **G1** | 首屏「文字 + 可点」恰好 3 个（可见 h1 + p + button = 3） | **否：4**（h1 1 + p 2 + button 1；多出的是 `p#cert-declaration`） | 是：3 | 是：3 | **否：2**（无按钮，设计如此；`cta: null`） | `gseries.perSite.*.dom.counts` |
| **G2** | 无外部请求：除文档与同源静态资源外请求数 = 0 | 字面否：多一个同源 `favicon.ico`（404）。**非 127.0.0.1 的请求 0 个** | 同左 | 同左 | 同左 | `gseries.perSite.*.requests`；`hosts` 只有 `127.0.0.1:8093` |
| **G3** | 无 CJK（可见文本 = 0） | 是：0 | 是：0 | 可见文本 **0**；但 `textContent / outerHTML` 里 **21 个**（隐藏的 `#dbg` 降级明细） | 是：0 | `gseries.perSite.*.dom.cjk` |
| **G4** | 无跨站链接 | 是：`a[href]` 0 个 | 是 | 是 | 是 | `gseries.perSite.*.dom.links` |
| **G5** | Esc 菜单与定稿一致：`MENU / Sound / Motion / Quality / About / Credits / Close`（`/hug` 多 `Wind`），末行 `Nothing here is sent anywhere.` | **是**（7 项 + 末行） | **是**（多 `Wind`） | **是** | **否（字面）**：12 项，多 `Look Touch Camera Water Weather Music`（`PRODUCT-FORM §1.4` 允许，但 `MANUAL-QA` 没同步）。另：`About` 点开显示的是末行那句，Credits 整句在菜单项里 | `gseries.perSite.*.dom.menuItems`；`koi-menu.koiMenu.menu` |
| **G6** | Esc 菜单不吃进世界事件（点 `Sound` 后 `frame.pointer.down` 无上升沿） | 是：`tapped` false；整帧差 0.022 L\*（噪声 0.012） | 是：`tapped` false；差 0.54（噪声 0.47，画面自己在晃） | 是：`tapped` false；差 12.2（噪声 5.5，画面自己在动，像素分不出，只以 `tapped` 为准） | 是：`tapped` false；差 0.30（噪声 0.12）；菜单开着时点画布也不进世界 | `gseries.perSite.*.g6` |
| **G7** | 存在 ≥ 40 s 单向慢变量：0 / 40 / 80 s 单调，累计 ≥ 3 L\* 或 ≥ 3° 色相 | **像素口径否**：整帧均值 51.68 → 51.39 → 51.37（80 s 共 0.31 L\*），色相不变；但光角变量 `--sun-angle` −25.64° → −24.64° → −23.63° 单调在走 | **否**：三张图 L\* P50 29.31 / 均值 31.52 / 色相 103° / 饱和 0.26 完全相同 | **未能确认**：一轮 44.8 → 23.6 → 22.4（P50，伴随镜头自己移到岩壁近景），另两轮 170 s 内均值停在 47–51；分不清是「光退」还是「镜头动」 | **否**：88.85 → 88.9 → 88.9 | `gseries.perSite.*.g7.samples` |
| **G10** | L4 每帧不读回像素（`getImageData` / `putImageData` 每帧 0 次） | 是：0 / 5 次（5009 帧内，烘焙期） | 是：0 / 0 | 是：0 / 2 | 是：0 / 5 | 页内注入的计数器：`gseries.perSite.*.readback` |
| **G12** | 连续量量级对得上（暗角 v=0 / 0.08 / 0.14 三段） | **未量**：需要 `v = 0` 的对照组，要改构建配置重新 build，本轮禁止 | 不适用（未装 `pixel-post`） | **未量**：同左；另配置值是 0.18（UX-25） | 不适用 | — |
| **G11** | `costMs` 账实一致（`pixel-post` 纯函数 `=== 1.85` / `2.21`） | **未量**：页面句柄 `__site.stage` 的键里没有 `costMs`；在 node 里直接 import 零件需要先编译 TS，会和正在跑的验证门抢目录 | 不适用 | **未量**：同左 | 不适用 | `gseries.perSite.*.stageKeys` |
| **G9** | 颗粒随时间变化（间隔 ≥ 1/24 s 两帧像素差中位 ≥ 0.5 L\*，仅 `grain > 0` 的站） | 不适用（`grain: 0`） | 不适用 | **量到了但无法归因**：左上角 200×100 区域两次连拍的中位差 1.20 / 1.92 / 4.81 L\*（≥ 0.5 ✓），但两次连拍之间隔了 43–47 帧而不是 1 帧（本机一帧 50–300 ms），且海藻和鱼自己在动 | 不适用 | `still-env.g9` |
| **G8** | 带走入口按时出现，文案与定稿一致 | 时序 ✓（`Save it` 只在 `approved` 出现，`verifying` / `stamping` 期间隐藏）；文案 `Save it` ✓；但 `Saved.` 未出现 | **否**：入口在点击的那一刻出现（不是种子离场 3 s 后），而且是一行不接收点击的状态字，不是 `Copy the link` 按钮；草地路径没有入口 | **否**：Sit 后 124 s 仍无入口 | **文档冲突**：`COPY-SITES` 说不设带走入口，`MANUAL-QA K8` 说 60 s 后有 `Keep this frame`；实测没有 | `license-desktop.stamp.seq[*].hidden`、`hug-desktop.releaseButton`、`still-desktop.desktop.takeaway`、`koi-desktop.main.after60s` |

**一句话结论**：按 `MANUAL-QA` 的字面，四站**没有一站全绿**——`/license` 卡在 G1（多一个 `p`）与 G7（像素量不够），`/hug` 卡在 G7 与 G8，`/still` 卡在 G7、G8（外加 UX-01 / UX-02 两个阻断），`/koi` 卡在 G1（无按钮）、G5（12 项）、G7。其中 **G6（菜单不吃世界事件）四站都过**，这是上一轮最容易出事的一条。

---

## 5. 证据表

说明：所有截图都是 JPEG，在 `docs/review-2026-11-24/ux-sites/`；单张 ≤ 300 KB，合计约 12.1 MB（180 张：9 张总览图、12 张 G7 三时刻图、其余是过程截图）。`metrics.json` 是同一目录下的原始数据（约 335 KB，结构：`meta` + `runs`；像素缓冲已剥离）。操作前的对照图（文件名以 `_` 开头）在 `_scratch/review-1124/ux-sites/before-shots/`。

| 分组 | 文件名 | 大小 | 说明 |
|---|---|---|---|
| 入口 | `index-desktop-01-first.jpg` | 16 KB | 入口页桌面首屏 |
| 入口 | `index-mobile-01-first.jpg` | 49 KB | 入口页手机整页 |
| 总览图 | `sheet-license.jpg` | 143 KB | 总览：/license 桌面 12 格 |
| 总览图 | `sheet-hug.jpg` | 229 KB | 总览：/hug 桌面 15 格 |
| 总览图 | `sheet-still.jpg` | 252 KB | 总览：/still 桌面 12 格 |
| 总览图 | `sheet-koi.jpg` | 294 KB | 总览：/koi 桌面 15 格 |
| 总览图 | `sheet-hug-mobile.jpg` | 108 KB | 总览：/hug 手机 5 格 |
| 总览图 | `sheet-koi-mobile.jpg` | 124 KB | 总览：/koi 手机 8 格（含入口页） |
| 总览图 | `sheet-license-mobile.jpg` | 77 KB | 总览：/license 手机 5 格 |
| 总览图 | `sheet-still-env.jpg` | 52 KB | 总览：/still 降级环境 6 格 |
| 总览图 | `sheet-still-mobile.jpg` | 80 KB | 总览：/still 手机 4 格 |
| license（桌面） | `license-desktop-01-first.jpg` | 54 KB | 首屏（frames=60）：纸上已印标题行 / 宣言 / 编号 / 日期，纸内底部 Stamp it |
| license（桌面） | `license-desktop-02-idle-10s.jpg` | 44 KB | 停留 10 s（不操作） |
| license（桌面） | `license-desktop-03-pointer-move.jpg` | 43 KB | 只移动指针后 |
| license（桌面） | `license-desktop-04-stamp-verifying.jpg` | 44 KB | 点 Stamp it +2.2 s：纸底状态词 verifying，按钮仍在 |
| license（桌面） | `license-desktop-05-stamp-stamping.jpg` | 54 KB | +6.3 s：stamping，章不可见（opacity 0） |
| license（桌面） | `license-desktop-06-approved.jpg` | 57 KB | +8.7 s：红章淡入，Stamp it 隐藏，Save it / Stamp again / 提示 / NO COPY KEPT. 出现 |
| license（桌面） | `license-desktop-07-drag-light.jpg` | 57 KB | 在纸上从 (420,300) 拖到 (980,300) 后：光带移动 |
| license（桌面） | `license-desktop-08-fold.jpg` | 58 KB | 按 f 后：右下 128 px 折角 |
| license（桌面） | `license-desktop-09-again-verifying.jpg` | 55 KB | 点 Stamp again +1.3 s：verifying，Save it 与提示收起 |
| license（桌面） | `license-desktop-10-again-approved.jpg` | 57 KB | +8.4 s：approved，章倾角改变 |
| license（桌面） | `license-desktop-11-tab1.jpg` | 57 KB | Tab 第 1 次：焦点在 Save it |
| license（桌面） | `license-desktop-11-tab2.jpg` | 57 KB | Tab 第 2 次：焦点回到 body |
| license（桌面） | `license-desktop-11-tab3.jpg` | 57 KB | Tab 第 3 次：焦点在 Stamp again |
| license（桌面） | `license-desktop-12-esc-menu.jpg` | 63 KB | Esc 菜单 |
| license（桌面） | `license-desktop-13-menu-about.jpg` | 54 KB | 菜单里点过 Sound / Motion / Quality / About 后 |
| license（桌面） | `license-desktop-14-after-save.jpg` | 57 KB | 点 Save it 后 3 s（按钮文字未变） |
| license（手机） | `license-mobile-01-first.jpg` | 66 KB | 手机首屏：纸 320×226，宣言已压住编号 |
| license（手机） | `license-mobile-02-stamp-verifying.jpg` | 67 KB | 点 Stamp it +1.4 s |
| license（手机） | `license-mobile-03-approved.jpg` | 72 KB | approved：宣言 / approved / 红章 / Save it / Stamp again 互相重叠（UX-03） |
| license（手机） | `license-mobile-04-esc-menu-via-key.jpg` | 105 KB | 手机上用按键打开的 Esc 菜单（正常情况下没有入口） |
| license（手机） | `license-mobile-10-before-pinch.jpg` | 66 KB | 双指张开前 |
| license（手机） | `license-mobile-11-after-pinch-out.jpg` | 18 KB | 双指张开后：页面被放大 5×（UX-12） |
| license（手机） | `license-mobile-12-after-pinch-in.jpg` | 18 KB | 再做一次捏合后：仍是 5× |
| hug（桌面） | `hug-desktop-01-first.jpg` | 49 KB | 首屏（frames=60） |
| hug（桌面） | `hug-desktop-02-idle-10s.jpg` | 49 KB | 停留 10 s：绒球在晃、未飞走 |
| hug（桌面） | `hug-desktop-03-pointer-on-meadow.jpg` | 49 KB | 指针移到草地上：无高亮、不变手型 |
| hug（桌面） | `hug-desktop-04-hover-cta.jpg` | 49 KB | 悬停 Let it go |
| hug（桌面） | `hug-desktop-05-tab1.jpg` | 50 KB | Tab 第 1 次：Let it go 上 2px 焦点框 |
| hug（桌面） | `hug-desktop-05-tab2.jpg` | 49 KB | Tab 第 2 次：body |
| hug（桌面） | `hug-desktop-05-tab3.jpg` | 50 KB | Tab 第 3 次：回到按钮 |
| hug（桌面） | `hug-desktop-06-esc-menu.jpg` | 58 KB | Esc 菜单（含 Wind） |
| hug（桌面） | `hug-desktop-07-menu-sound-on.jpg` | 58 KB | 菜单里点 Sound 后：Sound On |
| hug（桌面） | `hug-desktop-08-release-0_5s.jpg` | 58 KB | 点草地 (980,560) +0.8 s：绒毛开始脱开，无任何文字 |
| hug（桌面） | `hug-desktop-09-release-2s.jpg` | 80 KB | +2.4 s：大片飞散 |
| hug（桌面） | `hug-desktop-10-release-5s.jpg` | 77 KB | +5.5 s |
| hug（桌面） | `hug-desktop-11-release-9s.jpg` | 62 KB | +9.8 s |
| hug（桌面） | `hug-desktop-12-release-14s.jpg` | 26 KB | +14.6 s：花球全空，按钮仍是 Let it go（UX-06） |
| hug（桌面） | `hug-desktop-13-button-release-2s.jpg` | 64 KB | 只点 Let it go +2.3 s：放飞 + 按钮上方 12px「Link copied. Send it to someone.」 |
| hug（桌面） | `hug-desktop-14-button-release-9s.jpg` | 57 KB | +9.4 s |
| hug（桌面） | `hug-desktop-15-keyboard-focus.jpg` | 43 KB | Tab 后的焦点框 |
| hug（桌面） | `hug-desktop-17-from-hug.jpg` | 51 KB | ?from=hug：多一行 Someone sent you a little warmth.，按钮 Send one on |
| hug（桌面） | `hug-desktop-18-keyboard-enter.jpg` | 64 KB | 焦点在按钮上按 Enter +3 s：放飞 + Link copied |
| hug（桌面） | `hug-desktop-18-keyboard-space.jpg` | 62 KB | 按 Space +3 s：同上 |
| hug（桌面） | `hug-desktop-19-mic-denied-300ms.jpg` | 49 KB | Wind · 权限 denied +0.3 s：Wind Off + Microphone unavailable. |
| hug（桌面） | `hug-desktop-19-mic-denied-2500ms.jpg` | 49 KB | denied +2.5 s |
| hug（桌面） | `hug-desktop-19-mic-denied-6000ms.jpg` | 48 KB | denied +6 s |
| hug（桌面） | `hug-desktop-19-mic-granted-300ms.jpg` | 50 KB | Wind · 权限 granted +0.3 s：Wind On + Requesting microphone… |
| hug（桌面） | `hug-desktop-19-mic-granted-2500ms.jpg` | 59 KB | granted +2.5 s：Microphone on. Nothing is recorded. Wind only. |
| hug（桌面） | `hug-desktop-19-mic-granted-6000ms.jpg` | 49 KB | granted +6 s：蒲公英已被全部放飞（UX-07） |
| hug（桌面） | `hug-desktop-19-mic-prompt-300ms.jpg` | 56 KB | Wind · 权限 prompt +0.3 s（无头环境没有权限框，表现同 denied） |
| hug（桌面） | `hug-desktop-19-mic-prompt-2500ms.jpg` | 56 KB | prompt +2.5 s |
| hug（桌面） | `hug-desktop-19-mic-prompt-6000ms.jpg` | 56 KB | prompt +6 s |
| hug（桌面） | `hug-desktop-20-mic-denied-off.jpg` | 48 KB | denied：再点一次 Wind 后 |
| hug（桌面） | `hug-desktop-20-mic-granted-off.jpg` | 44 KB | granted：再点一次 Wind 后：Wind Off |
| hug（桌面） | `hug-desktop-20-mic-prompt-off.jpg` | 56 KB | prompt：再点一次 Wind 后 |
| hug（桌面） | `hug-desktop-21-wind-default-fake-device-300ms.jpg` | 48 KB | 复核 · 会出声的假麦克风 +0.3 s |
| hug（桌面） | `hug-desktop-21-wind-default-fake-device-2000ms.jpg` | 50 KB | +2.0 s：绒毛开始飞散 |
| hug（桌面） | `hug-desktop-21-wind-default-fake-device-6000ms.jpg` | 50 KB | +6 s：花球全空（UX-07 主证据） |
| hug（桌面） | `hug-desktop-21-wind-default-fake-device-10000ms.jpg` | 46 KB | +10 s |
| hug（桌面） | `hug-desktop-21-wind-silent-file-300ms.jpg` | 48 KB | 复核 · 真静音输入 +0.3 s |
| hug（桌面） | `hug-desktop-21-wind-silent-file-2000ms.jpg` | 48 KB | +2.0 s：未放飞 |
| hug（桌面） | `hug-desktop-21-wind-silent-file-6000ms.jpg` | 48 KB | +6 s：未放飞 |
| hug（桌面） | `hug-desktop-21-wind-silent-file-10000ms.jpg` | 48 KB | +10 s：未放飞（对照） |
| hug（手机） | `hug-mobile-02-button-2_5s.jpg` | 113 KB | 只点按钮 +2.5 s |
| hug（手机） | `hug-mobile-02-meadow-2_5s.jpg` | 108 KB | 点草地 +2.5 s：放飞，无文字 |
| hug（手机） | `hug-mobile-03-meadow-then-button.jpg` | 99 KB | 点草地之后再点按钮：出现 Link copied |
| hug（手机） | `hug-mobile-10-before-pinch.jpg` | 71 KB | 双指张开前 |
| hug（手机） | `hug-mobile-11-after-pinch-out.jpg` | 35 KB | 双指张开后：页面被放大 5× |
| hug（手机） | `hug-mobile-12-after-pinch-in.jpg` | 37 KB | 再做一次捏合后 |
| hug（手机） | `hug-mobile-button-01-first.jpg` | 71 KB | 手机首屏（按钮路径那一轮） |
| hug（手机） | `hug-mobile-meadow-01-first.jpg` | 72 KB | 手机首屏（草地路径那一轮） |
| still（桌面） | `still-desktop-00-frames60-veil.jpg` | 7 KB | frames=60 刚到时（页内约 2.4 s）：纯黑遮罩、无任何文字（UX-01） |
| still（桌面） | `still-desktop-01-first-62s.jpg` | 7 KB | 整页走查的「第一张」：实际拍到于 62.5 s（截图排队） |
| still（桌面） | `still-desktop-02-revealed.jpg` | 91 KB | 遮罩淡出后 72 s |
| still（桌面） | `still-desktop-03-idle-10s.jpg` | 87 KB | 再停留 10 s（Sit 前）：海藻林 |
| still（桌面） | `still-desktop-04-sit-1s.jpg` | 75 KB | 点 Sit（名义 +1 s，实际 +8.0 s）：镜头已切到岩石珊瑚近景 |
| still（桌面） | `still-desktop-05-sit-5s.jpg` | 89 KB | Sit +11.3 s |
| still（桌面） | `still-desktop-06-sit-10s.jpg` | 90 KB | Sit +14.6 s |
| still（桌面） | `still-desktop-07-sit-20s.jpg` | 92 KB | Sit +21.8 s |
| still（桌面） | `still-desktop-08-sit-40s.jpg` | 98 KB | Sit +41.4 s |
| still（桌面） | `still-desktop-09-sit-60s.jpg` | 106 KB | Sit +61.7 s：仍无带走入口 |
| still（桌面） | `still-desktop-10-pointer-move.jpg` | 96 KB | 移动指针后 |
| still（桌面） | `still-desktop-11-drag.jpg` | 95 KB | 拖拽后 |
| still（桌面） | `still-desktop-12-hold-3s.jpg` | 103 KB | 按住 3 s 后 |
| still（桌面） | `still-desktop-13-wheel.jpg` | 102 KB | 滚轮后 |
| still（桌面） | `still-desktop-14-esc-menu.jpg` | 103 KB | Esc 菜单 |
| still（桌面） | `still-desktop-15-tab1.jpg` | 114 KB | Tab 第 1 次：Sit 上 2px 焦点框 |
| still（桌面） | `still-desktop-15-tab2.jpg` | 114 KB | Tab 第 2 次：body |
| still（桌面） | `still-desktop-15-tab3.jpg` | 113 KB | Tab 第 3 次：Sit |
| still（桌面） | `still-desktop-16-after-60s.jpg` | 114 KB | Sit 后 124 s：全文仍是 Still / Nothing here needs an answer. / Sit（UX-08） |
| still（桌面） | `still-desktop-17-stand-4s.jpg` | 82 KB | 再按 Sit +4 s |
| still（桌面） | `still-desktop-18-probe-60s.jpg` | 87 KB | 60 s 探针那轮的末帧 |
| still（无 WebGPU） | `still-nowebgpu-02-revealed.jpg` | 29 KB | 无 WebGPU（页面侧删 navigator.gpu）：静止的灰蓝渐变，无提示（UX-04） |
| still（无 WebGPU） | `still-nowebgpu-04-sit-6s.jpg` | 29 KB | 同上，Sit +6 s：无变化 |
| still（swiftshader） | `still-swiftshader-01-first.jpg` | 32 KB | swiftshader：frames=60 时 |
| still（swiftshader） | `still-swiftshader-02-revealed.jpg` | 32 KB | swiftshader：静止的灰蓝渐变，1.3–1.7 fps（UX-04） |
| still（swiftshader） | `still-swiftshader-03-idle-5s.jpg` | 32 KB | 再停留 5 s |
| still（swiftshader） | `still-swiftshader-04-sit-6s.jpg` | 32 KB | Sit +6 s |
| still（手机） | `still-mobile-01-first.jpg` | 95 KB | frames=60 时（遮罩未退，但左上角已露出一块画面） |
| still（手机） | `still-mobile-02-revealed.jpg` | 107 KB | 遮罩过去后：场景只在左上角约 390×260，其余是拖影（UX-02） |
| still（手机） | `still-mobile-03-sit-6s.jpg` | 115 KB | Sit +6 s |
| still（手机） | `still-mobile-10-before-pinch.jpg` | 106 KB | 双指张开前 |
| still（手机） | `still-mobile-11-after-pinch-out.jpg` | 59 KB | 双指张开后：页面被放大 5× |
| still（手机） | `still-mobile-12-after-pinch-in.jpg` | 63 KB | 再做一次捏合后 |
| koi（桌面） | `koi-desktop-01-first.jpg` | 80 KB | frames=60 时（导航后约 19 s）：仍是深色遮罩（UX-05） |
| koi（桌面） | `koi-desktop-02-idle-10s.jpg` | 61 KB | +10 s：宣纸水墨锦鲤 |
| koi（桌面） | `koi-desktop-02b-idle-12s.jpg` | 70 KB | 另一轮就绪后 12 s（菜单重做那轮的基准） |
| koi（桌面） | `koi-desktop-03-move-across.jpg` | 62 KB | 指针从左下划到右上：很淡的同心环 |
| koi（桌面） | `koi-desktop-04-tap.jpg` | 61 KB | 点一下后 |
| koi（桌面） | `koi-desktop-05-hold-1s.jpg` | 66 KB | Ripple 模式按住 1 s |
| koi（桌面） | `koi-desktop-06-hold-3s.jpg` | 66 KB | 按住 3 s |
| koi（桌面） | `koi-desktop-06b-hold-release-1_5s.jpg` | 66 KB | 松手 1.5 s 后 |
| koi（桌面） | `koi-desktop-07-right-drag.jpg` | 61 KB | 右键拖拽后 |
| koi（桌面） | `koi-desktop-08-wheel.jpg` | 66 KB | 滚轮后 |
| koi（桌面） | `koi-desktop-09-esc-menu.jpg` | 70 KB | Esc 菜单：12 项（UX-30） |
| koi（桌面） | `koi-desktop-09b-menu-about.jpg` | 66 KB | 点 About：显示末行那句（UX-20） |
| koi（桌面） | `koi-desktop-09c-menu-credits.jpg` | 67 KB | 点 Credits |
| koi（桌面） | `koi-desktop-10a-sound-after-first-click.jpg` | 66 KB | 点 Sound（此前显示 On）后：Off |
| koi（桌面） | `koi-desktop-10b-music-still.jpg` | 66 KB | 点 Music 后：Music Still 且 Sound 变 On（UX-37） |
| koi（桌面） | `koi-desktop-10c-sound-on.jpg` | 66 KB | 再点 Sound 后：On |
| koi（桌面） | `koi-desktop-10d-touch-call.jpg` | 65 KB | Touch → Call |
| koi（桌面） | `koi-desktop-10e-touch-feed.jpg` | 65 KB | Touch → Feed |
| koi（桌面） | `koi-desktop-10f-touch-ripple.jpg` | 65 KB | Touch → Ripple |
| koi（桌面） | `koi-desktop-11-look-paint.jpg` | 73 KB | Look → Watercolour |
| koi（桌面） | `koi-desktop-12-look-real.jpg` | 123 KB | Look → Real |
| koi（桌面） | `koi-desktop-13-look-ink.jpg` | 65 KB | Look → Ink |
| koi（桌面） | `koi-desktop-14-cam-angle.jpg` | 68 KB | Camera → 2.5D |
| koi（桌面） | `koi-desktop-15-cam-orbit.jpg` | 65 KB | Camera → Orbit |
| koi（桌面） | `koi-desktop-15b-cam-top.jpg` | 65 KB | Camera → Top |
| koi（桌面） | `koi-desktop-16-water-sky.jpg` | 66 KB | Water → Sky（ink 档看不出差别，UX-27） |
| koi（桌面） | `koi-desktop-16b-water-dark.jpg` | 67 KB | Water → Dark |
| koi（桌面） | `koi-desktop-16c-water-pebble.jpg` | 61 KB | Water → Pebble |
| koi（桌面） | `koi-desktop-17-weather-drizzle.jpg` | 65 KB | Weather → Drizzle |
| koi（桌面） | `koi-desktop-18-weather-rain.jpg` | 66 KB | Weather → Rain（ink 档看不出差别） |
| koi（桌面） | `koi-desktop-19-tab1.jpg` | 61 KB | Tab 第 1 次：焦点在 body（UX-29） |
| koi（桌面） | `koi-desktop-20-after-60s.jpg` | 61 KB | 停留 103 s 后：无带走入口 |
| koi（桌面） | `koi-desktop-21-cam_angle.jpg` | 69 KB | ?cam=angle 首屏 |
| koi（桌面） | `koi-desktop-21-cam_orbit.jpg` | 69 KB | ?cam=orbit 首屏 |
| koi（桌面） | `koi-desktop-21-mode_call.jpg` | 70 KB | ?mode=call 首屏 |
| koi（桌面） | `koi-desktop-21-mode_feed.jpg` | 70 KB | ?mode=feed 首屏 |
| koi（桌面） | `koi-desktop-21-style_paint.jpg` | 79 KB | ?style=paint 首屏 |
| koi（桌面） | `koi-desktop-21-style_real_cam_angle_rain_rain.jpg` | 156 KB | ?style=real&cam=angle&rain=rain 首屏（就绪 23.8 s，4.1 fps） |
| koi（桌面） | `koi-desktop-21-style_real.jpg` | 147 KB | ?style=real 首屏 |
| koi（桌面） | `koi-desktop-22-feed-tap.jpg` | 7 KB | Feed 模式点一下后 |
| koi（桌面） | `koi-desktop-23-feed-drag.jpg` | 71 KB | Feed 模式拖拽后 |
| koi（桌面） | `koi-desktop-24-call-hold-1s.jpg` | 70 KB | Call 模式按住 1.2 s |
| koi（桌面） | `koi-desktop-25-call-hold-2_7s.jpg` | 70 KB | 按住 2.7 s：鱼未聚拢（UX-28） |
| koi（桌面） | `koi-desktop-26-call-release.jpg` | 70 KB | 松手后 |
| koi（手机） | `koi-mobile-01-first.jpg` | 102 KB | 手机首屏 |
| koi（手机） | `koi-mobile-02-tap.jpg` | 100 KB | 点一下：清楚的圆环 |
| koi（手机） | `koi-mobile-03-hold-2_5s.jpg` | 93 KB | 按住 2.5 s |
| koi（手机） | `koi-mobile-04-drag.jpg` | 89 KB | 单指拖拽后 |
| koi（手机） | `koi-mobile-05-pinch-out.jpg` | 28 KB | 双指张开（第一次）：页面被放大（UX-12） |
| koi（手机） | `koi-mobile-06-esc-menu-via-key.jpg` | 29 KB | 用按键打开的 Esc 菜单（此时页面仍是放大状态） |
| koi（手机） | `koi-mobile-10-before-pinch.jpg` | 94 KB | 双指张开前（复核） |
| koi（手机） | `koi-mobile-11-after-pinch-out.jpg` | 28 KB | 双指张开后：visualViewport.scale = 5 |
| koi（手机） | `koi-mobile-12-after-pinch-in.jpg` | 28 KB | 再做一次捏合后 |
| G7 三时刻 | `g7-hug-t0.jpg` | 40 KB | G7：/hug t=0 |
| G7 三时刻 | `g7-hug-t40000.jpg` | 40 KB | G7：/hug t=40 s |
| G7 三时刻 | `g7-hug-t80000.jpg` | 40 KB | G7：/hug t=80 s |
| G7 三时刻 | `g7-koi-t0.jpg` | 65 KB | G7：/koi t=0 |
| G7 三时刻 | `g7-koi-t40000.jpg` | 65 KB | G7：/koi t=40 s |
| G7 三时刻 | `g7-koi-t80000.jpg` | 65 KB | G7：/koi t=80 s |
| G7 三时刻 | `g7-license-t0.jpg` | 44 KB | G7：/license t=0 |
| G7 三时刻 | `g7-license-t40000.jpg` | 45 KB | G7：/license t=40 s |
| G7 三时刻 | `g7-license-t80000.jpg` | 45 KB | G7：/license t=80 s |
| G7 三时刻 | `g7-still-t0.jpg` | 84 KB | G7：/still t=0（海藻林） |
| G7 三时刻 | `g7-still-t40000.jpg` | 71 KB | G7：/still t=40 s（镜头已自行移到岩壁近景并变暗，UX-14） |
| G7 三时刻 | `g7-still-t80000.jpg` | 58 KB | G7：/still t=80 s |

**原始数据**：`metrics.json` —— `meta`（环境、方法、gzip 字节、截图清单、作废运行）+ `runs`（每次运行一份）：`boot`（四站启动连拍）、`index`、`license-desktop`、`license-takeaway`、`license-download-modes / -control / -control2`（下载取消的对照）、`license-export`（导出 PNG 与屏幕 4×4 对照）、`hug-desktop`、`hug-keyboard-mic`、`hug-mic-probe`、`still-desktop`、`still-env`（swiftshader + G6 + G9）、`still-nowebgpu`、`koi-desktop`、`koi-menu`、`koi-menu-diffs`、`koi-sound`、`mobile`、`mobile-pinch`、`gseries`、`probe-still`。

