# 体素世界 → L1 零件：四问查实、路线选择、移植记录

对象：`shared/core/`（独立单页 WebGPU 体素世界，2320 行源码，`build.mjs` 拼成单 HTML）
产物：`shared/parts/voxel-world/`（一个 `channel: 'gl'`、`layer: 'L1'` 的 PartV2）

本文所有结论都带 `file:line`，行号指向 **`shared/core/` 基线**（字节未改，见 `shared/core/BASELINE.sha256`）。

---

## 一、四问查实

### 1. 引擎能不能脱离自己的 `template.html` 启动？

**不能直接启动，但缺口只有「DOM 取元素」这一层，且可以逐条点名。**

`main.js` 启动期硬依赖的 DOM / 全局，全表如下（`$` 就是 `document.getElementById`，见 `shared/core/src/main.js:4`）：

| 位置 | 取的东西 | 用途 | 缺了会怎样 |
| --- | --- | --- | --- |
| `main.js:5` | `c`（`<canvas>`） | WebGPU 画布本体 | 拿不到画布 = 没有渲染面 |
| `main.js:5` | `i`（`<pre>`） | HUD 文本（默认 `hud=false`，只在按 H 时写） | 只影响调试条 |
| `main.js:12,13` | `s`（状态文案）、`b`（`<i>` 进度条） | 加载态：`textContent` + `Element.animate()` 推进度条 | `say()` 抛错 → 启动中断 |
| `main.js:22` | `w`（提示行） | `hidden = !!navigator.userAgentData`（非 Chromium 才提示） | 抛错 → 启动中断 |
| `main.js:30` | `s` | 设备丢失文案 | 抛错 |
| `main.js:588` | `i` | HUD 清空 | 抛错 |
| `main.js:599-600` | `canvas.requestPointerLock` | 点画布锁定鼠标 | 无指针锁定就不能转视角 |
| `main.js:620-635` | `d`（Dive 按钮）、`o`（菜单按钮）、`q`（Drawer 按钮组） | 首屏菜单、「Dive in」、画质按钮（会 `location.reload()`） | 抛错 |
| `main.js:622` | `document.body.className` | CSS 状态机（`m`/`g`/`p`/`l`/`e`） | 会**改掉宿主页面的 body class** |
| `main.js:16` | `document.hidden` | 隐藏页时不等 1s 兜底定时器 | 抛错 |
| `main.js:29` | `location.reload()` | 设备丢失时自降一档重载 | 在站群里 = 刷新整个站 |
| `main.js:337-338` | `canvas.clientWidth/Height` + `devicePixelRatio` | 决定渲染分辨率 | 尺寸为 0 时退到 2×2 |
| `main.js:634` | `localStorage` 写画质 | 下次进站沿用 | 会污染同 origin 的站群 |
| `quality.js:8-13` | `matchMedia('(pointer:coarse)')`、`navigator.deviceMemory`、`localStorage.abyssal/abyssalLoad` | 选画质档 | 抛错 → 启动中断（`matchMedia` 浏览器都有） |
| `audio.js:71-76` | `AudioContext`、`document.addEventListener('visibilitychange')` | 环境音（首次点击才建图） | 无手势时静音即可，不阻塞渲染 |

**结论**：`template.html` 里 `#a/#l/#p/#g/#k/#f/#m` 这些是纯 CSS 结构，启动代码一个都没取；真正被取的只有
`c/i/s/b/w/d/o/q` 七个 id 和一个 `Element.animate`。所以「剥掉 template」不是重写，而是把「去宿主 DOM 里找元素」
换成「装配器给的画布 + 惰性桩」，共 **20 条具名补丁**（见 `shared/parts/voxel-world/build-engine.mjs` 的 `PATCHES`）。
补丁表每条都断言 `find` 在原文里**恰好出现一次**，基线漂移直接构建失败，不会静默生成一个半坏模块。

### 2. 世界包围盒在 4 个地方重复 —— 现在数值一致吗？

一致。逐个贴实测值：

| # | 位置 | 原文 | 实际值 |
| --- | --- | --- | --- |
| 1 | `math.js:54` | `NX = 512, NY = 80, NZ = 512, VS = 0.75, OX = -192, OY = -56, OZ = -192` | 原点 `(-192,-56,-192)`，尺寸 `512×80×512` 体素 × 0.75 m = **384 × 60 × 384 m** |
| 2 | `shaders.js:258`（`fn vol`） | `(p - vec3f(-192.,-56.,-192.)) / vec3f(384., 60., 384.)` | 同上，归一化到 3D 纹理 |
| 3 | `shaders.js:715`（光柱 `W_RAYS` 的体雾采样） | `vec3f(-192.,-56.,-192.)` / `vec3f(384., 60., 384.)` | 同上 |
| 4 | `world.js:362`（512² ground map） | `(i+0.5)/512*384 - 192`、`(j+0.5)/512*384 - 192` | XZ 各 `[-192,192]`，与 #1 的 XZ 一致 |

**结论：数值一致，结构脆弱。** 三个独立的字面量编码（WGSL 里两处、JS 里一处）没有任何编译期/运行期校验把它们绑在一起；
改 `NX` 或 `VS` 而不改 WGSL，体雾/光柱会**安静地**错位（不是报错，只是雾的浓度图整体缩放）。
另外 `main.js:48` 的体雾纹理是 `NX/2 × NY/2 × NZ/2`（256×40×256），它同样依赖这套归一化约定 ——
这条链上任何一环变动都不会有人报错。移植时**没有**去「顺手修」它（基线只读，且不是本次任务），
但在 `README` 的「已知限制」里记了账。

### 3. 它需要什么输入？哪些是硬依赖？

**硬依赖只有两个：可用 WebGPU 设备 + 一块有尺寸的画布。**

- `main.js:19` `if (!navigator.gpu) fail(...)`；`main.js:20-24` `requestAdapter` → `requestDevice`（`main.js:19-24`）；
  `main.js:32` `canvas.getContext('webgpu')`。**没有 adapter 直接抛错**，不存在退化路径。
  注意：不是 WebGL2 —— 契约里给 L1 预留的 `requires: 'webgl2'` 在这份原件上**不成立**，零件声明的是 `['webgpu']`。
- 尺寸：`main.js:338` 读 `canvas.clientWidth/Height`，为 0 时渲染目标退到 2×2（等于黑屏）。这是移植时改成
  「装配器给 `PX`」的直接原因（补丁 7）。

**软依赖（没有也能出图，只是不能玩）：**

- 指针：`pointerlock` + `mousemove`（`main.js:599-601`）、触摸（`main.js:603-614`）；
- 键盘：WASD/QE/Shift、`H` HUD、`M` 静音、`Esc` 菜单、`1-6` 跳预设机位（`main.js:583-597`）；
- 音频：首次点击/按键/触摸才建 `AudioContext`（`audio.js:71-76`）。**不需要用户手势也能渲染**：
  相机有默认机位（`main.js:638` `lookAt(...POSES[0])`），不动鼠标就是一架缓慢自转的固定视角。

### 4. 真实帧开销：三档做了什么？有没有自适应？

`quality.js:8-14`：

```
LV = pointer:coarse ? (deviceMemory>7 ? 1 : 2) : deviceMemory<=4 ? 2 : 0
THIN = 1<<LV      SHADOW = LV ? 2048 : 4096    AA = LV>1 ? 1 : 4
WATER = LV>1 ? 256 : 512                       RAYN = LV>1 ? 12 : 34
```

| 档 | 阴影贴图 | MSAA 采样数 | 水面纹理 | 光柱步数 | 其它 |
| --- | --- | --- | --- | --- | --- |
| 0 High | 4096² | 4 | 512² | 34 | 小石块/海绵/珊瑚（约 3500 万三角形）参与烘焙（`main.js:320-321` `if (!LV)`） |
| 1 Medium | 2048² | 4 | 512² | 34 | 同上（`!LV` 为假 → 跳过） |
| 2 Low | 2048² | **1（无 MSAA）** | 256² | 12 | 渲染目标直连 resolve（`main.js:352`） |

**分辨率缩放与自适应降档（两套，叠加使用）：**

1. **静态画质档**（`quality.js`）决定 MSAA / 阴影 / 纹理 / 光柱步数，**建场时定死，运行期不可变**。
2. **动态分辨率**（`main.js:531-552`）每秒一次，按最近 1s 的帧时间调 `pix`（像素预算，上限 2560×1440、
   下限桌面 50 万 px / 移动 25 万 px）与 `det`（视距缩放 0.4–1.0）。有 `timestamp-query` 时把 GPU 时间控在
   9.8–13.6 ms；没有时用墙上时间 12.5/17.6 ms 双阈值。调完立即 `resize()` 重建渲染目标。
3. `device.lost` 会把画质档自降一级并 `location.reload()`（`main.js:27-30`）—— 这条在零件里被改掉了。

这三套加起来意味着：**「设置分辨率」这件事原件已经自己做了**，零件只需要给 `setLod` 一个**上限**
（内部缩放 + dpr 封顶），而不是取代它的自适应逻辑。

---

## 二、三条路线：选 B，并给出证据

| 路线 | 判定 | 证据 |
| --- | --- | --- |
| A iframe | 放弃 | ① `shared/core/index.html` **不在仓库里**（`build.mjs` 产物落在 `shared/index.html`，当前不存在），零件会依赖一个仓库外的构建产物；② 指针事件被困在 iframe，stage 的 `setPointer` 送不进去；③ 首屏文案/进度条/菜单会露出来（`template.html:124-153`）；④ `frame.t` 与 iframe 自己的 rAF 不同源，暂停/降档都对不上。 |
| **B 直连** | **采用** | 引擎只认「一块 canvas + WebGPU device」，不认自己的 HTML（见四问 1）；把它挂到装配器给的 GL 画布上、用 `frame.t` 驱动，是唯一能同时满足「stage 时钟 / stage 指针 / setLod / dispose」的形态。 |
| C 搬 shader | 不成立 | 它**不是 raymarching 体素世界**：世界是 GPU compute 生成密度场（`main.js:150-170`）→ CPU surface nets（`math.js:57+`）→ 实例化网格；着色器里只有**光柱**是光线步进（`shaders.js:696-720`，`RAYN` 步）。「只搬 shader」等于丢掉世界生成、网格、碰撞、雾，重写 2000 行，产出的也不是原件。 |

### 路线 B 的最小 spike（真的跑了，不是推演）

- 脚本：`tests/probe-webgpu.mjs`（不同无头 Edge 启动参数下的 WebGPU adapter 探测）。原文这里的
  `_scratch/cdp-run.mjs` + `_scratch/voxel-proof.html` 随 `_scratch/`（gitignore）一起不在库内，**已不可复跑**。
- 环境：Windows 11 / Edge headless / `--enable-unsafe-webgpu --use-webgpu-adapter=swiftshader`（软件光栅器）
- 结果：**`state: ready`**，首帧完成，世界真的画出来了。截图已入库：
  [`docs/evidence/voxel-proof.png`](./evidence/voxel-proof.png)（初次体素世界：海床、海藻、鱼群、光柱、漂浮颗粒，
  上面叠着 screen 混合的光点）；另有更新的 [`docs/evidence/l2-over-l1-bubbles-on-voxel.png`](./evidence/l2-over-l1-bubbles-on-voxel.png)
  （L2 气泡叠在 L1 体素世界之上）。原文写的 `_scratch/voxel-proof.png` 已不在库内。

实测（同一次运行，HUD 原文）：

```
voxel-world ready · fps 44 · drawn 2 · render 384×216 (LV2) · draw 1.62ms · boot 91957ms · degraded none
```

三处必须如实说明：

1. `boot 91957ms` 是 **SwiftShader 软件后端**的数字。其中世界生成（2070 万体素 compute + surface nets）约 49s，
   其余是阴影烘焙 + 管线编译。真实 GPU 上这段是「一到两秒」量级，本机无法验证（见第五节）。
2. `render 384×216` 正是 `setLod('low')` 生效的证据：640×360 CSS × dpr1，先被 dpr 上限夹到 1，
   再乘内部缩放 0.6 → 384×216。`LV2` 说明画质档也真的落到了低档（无 4× MSAA）。
3. `fps 44` 是低分辨率 + 低档下的软件后端结果，不代表真机；但足以证明**主循环是通的**（不是只有一帧）。

**第一次 spike 的失败也记下来**（避免下一个人重踩）：
在 LV=0（4× MSAA）+ 960×540 下，首帧的 `Q.onSubmittedWorkDone()` 超过 6 分钟没有返回（不是报错，
是软件光栅器在 MSAA resolve + 3500 万三角形上跑不完）。这直接促成了 `env.level` 这个补丁 ——
它同时是低端设备的真实需求，不只是为了跑通测试。

---

## 三、移植做法（可审计的最小改造）

`shared/parts/voxel-world/build-engine.mjs` 把 6 个源文件按 `shared/core/build.mjs` 的顺序拼成
**同一个作用域**的 `engine.js`，外面包一层 `export async function createVoxelEngine(env)`，并逐条应用补丁：

| # | 文件 | 改了什么 | 为什么必须改 |
| --- | --- | --- | --- |
| 1 | quality.js | 不读 `localStorage.abyssal` | 同 origin 的旧画质存档会偷偷改零件行为 |
| 2 | quality.js | `LV = env.level ?? 自动` | 装配器/LOD 需要能钉住档位 |
| 3 | main.js | `$` 换成惰性桩 | 嵌入后没有首屏元素，且**不许读宿主 DOM** |
| 4 | main.js | canvas 由 `env.canvas` 给；`body` 换成哑对象 | 绝不给宿主 `<body>` 写 className |
| 5 | main.js | `say()` 的 CSS 动画等待改成 `env.onProgress` 回调 | create 不该被动画时长卡住 |
| 6 | main.js | `device.lost` 不再 `location.reload()`，改 `env.onLost` | 站群里重载 = 刷新整个站 |
| 7 | main.js | 新增 `PX`（设备像素）与 `RS`（渲染缩放） | 尺寸来自装配器，LOD 要能改分辨率 |
| 8 | main.js | `DW/DH = PX` | 不再假设「画布铺满窗口」 |
| 9 | main.js | `s = min(1, RS, sqrt(pix/(DW*DH)))` | `setLod('low')` 真的少画像素 |
| 10 | main.js | 摘掉 `window resize` 监听 | 尺寸只有一个来源（stage） |
| 11 | main.js | 动态分辨率的 localStorage 写 → `env.onScale` | 不污染宿主 origin |
| 12 | main.js | 摘掉 `requestAnimationFrame(frame)` | 帧由 stage 的 rAF 驱动 |
| 13-16 | main.js | 指针锁定 / 键盘 / 鼠标 / 触摸监听加 `env.input`/`env.pointerLock` 守卫 | 不抢宿主的输入 |
| 17 | main.js | `menu` 默认 `false` | 嵌入形态没有首屏菜单 |
| 18 | main.js | 不监听 `pointerlockchange` | 同上 |
| 19 | main.js | 启动尾巴 → `return 控制面`（render/look/layout/setScale/dispose） | 交出时钟与尺寸 |
| 20 | audio.js | `visibilitychange` 加 `env.audio` 守卫 | 零件默认不出声 |

`engine.js` 头部写入了 6 个源文件的 sha256 前 12 位，可直接和 `shared/core/BASELINE.sha256` 对账。

**没有做的事**：没有把 4 处包围盒收成一个常量（基线只读 + 会改变原件行为）；没有动 `shared/stage/*.ts`
（**截至移植时**；T18 之后 `stage.ts` 已改，见 `HANDOFF.md` §3.1「T18：L1 就地合成」—— 本件声明的 `blend: 'source-over'`
现在被 stage 的 `compositeGl` / `glBlend` 消费，改这个值会影响 L1 合成进主画布的方式）。

---

## 四、验收

见 `shared/parts/voxel-world/README.md` 与本轮汇报。要点：

- `node tests/stage-smoke.mjs` → **44/44**（2026-11-19 实测；零件声明 `requires: ['webgpu']`，Node 里没有 `navigator.gpu`，
  装配器按契约跳过它，不构造、不抛错）
- `npx tsc --noEmit` → 0 error
- `node shared/core/build.mjs` 后 `git status --short shared/core` 为空（基线零改动）

## 五、我没验证到的（不粉饰）

1. **真实 GPU 上的帧时间**。本机验证只能走 headless + SwiftShader，`fps 44 / draw 1.6ms` 与 `boot 92s`
   都不能外推到真机。`costMs` 填的是软件后端下**CPU 提交耗时**，是这份环境下唯一诚实的数字。
2. **LV=0（High）档在真实设备上的首帧**。软件后端跑不完（见上），我没能证明高画质路径端到端可用；
   代码路径与原件一致（只是没动 AA/阴影），但「一致」不等于「跑过」。
3. **触摸/键盘/指针锁定三条输入路径**：零件默认全部关闭（`env.input=false`），只验证了 stage 指针 →
   `look()` 这一条。原件自带的触摸摇杆语义没有移植（它是为全屏手机页写的）。
4. **设备丢失恢复**：只把 `location.reload()` 换成回调，没有做「自动重建 device」。世界重建代价是分钟级，
   重试策略应该由站点决定，不该塞进零件。

## 六、已知问题（2026-11-24 实测）

1. **遮罩 17.8 s**：`/still` 打开后黑屏遮罩无文字，空闲机 17.8 s 才淡出（繁忙时 16–45 s；主理人另测 36 s）。异步世界生成期间壳没有可见进度或文案（评审 R1）。
2. **画布像素尺寸双写**：`shared/stage/stage.ts:629-630` 写 704×396，`shared/parts/voxel-world/engine.js:1942` 写 422×238，引擎仍按旧尺寸画 → 手机一开机即「画面只在左上角」、桌面 resize 后同样坏（评审 R2；单变量实验见 `docs/review-2026-11-24/lead/README.md`、[probe-still-resize.mjs](review-2026-11-24/tools/probe-still-resize.mjs)）。
3. **无 WebGPU / 软件渲染时无提示**：画面是静止渐变，`Sit` 无反应，页面上没有任何「不支持」文案（评审 R1）。
4. 以上三条的修复分别属评审 **P0-1**（尺寸单一责任人）与 **P0-2**（就绪协议加进度 / 超时 / 不支持提示），不在本文移植范围内。
