# koi-pond · L1 world 零件（zz85 完整移植）

**来源**：<https://github.com/zz85/random-sketches/tree/gh-pages/vibes/koi>

上游原件归档在 `shared/parts-library/koi/`，共 **26 项**。逐文件用 `git hash-object` 与 GitHub blob SHA 比对，结果 `missing []`、`mismatch []`。包含：

- 运行源码：`main.js`、`index.html`、`audio.js`、`koi.js`、`surface.js`、`paint.js`、`ink.js`、`pond.js`、`glsl.js`
- 辅助：`cdp.js`、`smoke.js`、`sw.js`、`manifest.webmanifest`、`BLOG.md`、`README.md`
- 图标 3 个、上游演示截图 8 张

本目录只有 `index.ts` 与这份说明；**没有任何 .js 副本**。上游 JS 只从 `shared/parts-library/koi/` 导入，避免「零件目录里一份、原件目录里一份，各自漂移」。

## 适配了什么

1. **宿主**：原件在 `document.body` 上自己建 `WebGLRenderer` 和 `requestAnimationFrame`；这里使用 stage 给的 GL 画布，帧循环由 `update/draw` 驱动。场景、相机、着色器、鱼体、浮萍、焦散、水彩、水墨全部来自原件，**没有重写渲染逻辑**。
2. **三条渲染路径**都接回，不是把三条压成 ink：
   - `real`：池底 RT → 焦散 RT → 阴影 RT → 鱼 RT → composite → grade；水面折射、吸收、池底焦散、鱼影都在。
   - `paint`：pigRT 白底，鱼与浮萍以 pigment/glaze 画入，再走水彩 pass；纸纹、晕染、颜色来自原件。
   - `ink`：pigRT → `ink.step`（默认每 0.12s stamp 一次）→ `ink.show`；鱼头/尾投影到 UV 让水卷墨。
3. **相机**：Top / 2.5D / Orbit 三个档位，球面轨道、elevation 缓动、双指/右键盘旋转都接回。
4. **交互**：Ripple / Feed / Call 三种触摸模式；涟漪、投食、唤鱼、落叶、浮萍漂移都在。
5. **场景控制**：Pebble / Sky / Dark 三种池底，Dry / Drizzle / Rain 三档雨，Off / Still / Flow 三种音乐，程序化水声与鱼群声。
6. **设备**：倾斜/摇晃（`?motion=1` 或 `cue('motion:on')`）；移动端鱼数 9，桌面 11，`low` 降 7。
7. **站点层**：DOM 控件、localStorage、Wake Lock、PWA/manifest 不进零件，留在 `sites/koi/attach.ts` 与构建层。标题/引导文案由站点 `COPY` 持有。

## 产品级改写（不是原件逐项照搬）

原件的鱼出生点是 `x∈±1.2, y∈±2` 的随机撒点；但 ink/paint 的可见半高只有 **0.8**，一半鱼一出生就在画外。再加上首帧前 600 步 warm 模拟，鱼会先游散——首屏就变成「鱼挤四边、中心一块空纸」。现在的处理：

- **出生构图**：`FishSchool.arrange()` 在 **600 步 warm 之后** 才落位，11 条鱼分三簇沿左下→右上对角线铺开：左下 4、中央 3、右上 4；x 最远 ±0.9、y 最远 ±0.55，鱼体再留 0.35 余量，首屏不再有整条鱼被裁掉。
- **朝向**：边缘鱼头朝池心，鱼身向里收；中央鱼各有横/斜朝向，不做「一排同向鱼」。初始速度 `0.16L`（低于原件的 `0.3L`），前几秒构图不会立刻塌成一团。
- **脊线**：`arrange()` 末尾对每条鱼跑一次 `updateSpine(1/30)`，否则身体仍留在 warm 模拟的旧位置，首帧会拉出一条长线。
- **池边莲叶**：`SurfaceEcology.composePads()` 把原件三簇（左上 / 右下 / 右上）改成 **右下 4 + 右中 3 + 左下 2**；上边留干净纸面给 `Koi Pond` H1，不再让莲叶压字。
- 只改出生构图与池边落位，鱼群模拟、三风格渲染、涟漪/投食/唤鱼、Keep this frame 全部保持原件路径。

## 关键坑（不要再踩）

- **real 全黑**：`fishRT` 最初用 `setClearColor(0, 0, 0, 1)` 清屏，空像素 alpha=1；composite 把整张鱼纹理当成不透明黑盖在水面上，池底和焦散全被吃掉。改为 alpha **0** 清屏后恢复。`renderer.setClearColor(0x000000, 0)` 也必须是全局 0 alpha。
- **pigRT 白底**：paint/ink 的 pigRT 必须用不透明白清屏；它与 fishRT 的透明清屏是两套规则，不能混。
- **不要再叠 `pixel-post`**：原件 `grade` / `paint` / `ink` 已经完成最终成片。再叠暗角/扫描线会压暗 real、压冷 ink。`/koi` 的栈因此只有 `paper-ink + koi-pond`，预算 12ms；`paper-ink` 只在 WebGL 不可用时兜底纸底。
- **`?shot=1`** 只用于调试原始 GL 抓帧（打开 `preserveDrawingBuffer`），正式默认关闭。

## 对外 query（便于与上游逐项对照）

`?style=ink|paint|real`、`?mode=ripple|feed|call`、`?cam=top|angle|orbit`、`?floor=pebble|sky|dark`、`?rain=dry|drizzle|rain`、`?music=off|still|flow`、`?fps=`、`?still`、`?motion=1`、`?seed=`、`?fish=`、`?view=`、`?warm=`、`?t=`、`?shot=1`。

Esc 菜单提供同名控制：Look / Touch / Camera / Water / Weather / Music；Sound 由零件持有真实状态并经 `koi:sound` 广播，菜单不猜。

## 真机证据（2026-11-27，1280×720 / 390×844）

- ink 首屏：`docs/evidence/plan-2026-11-25/koi-ink-1280.png`
- paint 首屏：`docs/evidence/plan-2026-11-25/koi-paint-1280.png`
- real 首屏：`docs/evidence/plan-2026-11-25/koi-real-1280.png`
- 手机竖屏：`docs/evidence/plan-2026-11-25/koi-mobile.png`
- 40s 带走帧：`docs/evidence/plan-2026-11-25/koi-keep-40s.png`

判读：首屏不再有整条鱼被画框裁掉（只有池沿处鱼尾自然出画）；11 条鱼从左上到右下都有自己的位置，中央空水有一条回游鱼，H1 左上角没有被莲叶压住。三 style 共用同一套出生构图，但渲染路径各自成立。

## 契约

`id:'koi-pond'`、`layer:'L1'`、`channel:'world'`、`space:'screen'`、`blend:'source-over'`、`requires:['webgl2']`、`costMs:8.5`（real 路径）、`kb:52`、`expendable:false`。
