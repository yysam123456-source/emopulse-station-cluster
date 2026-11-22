# PRISM · Optical Gallery / Series 01

一个从零实现的全息撕卡包交互：黑绿光学展厅、钴蓝铝箔包装、沿顶部横向撕开、五张卡牌弹出并翻面、3D 倾斜全息卡面、12 格典藏卡册、卡牌详情与再来一包。

- 单文件交付：[`index.html`](./index.html)
- 无构建依赖、无外部图片、无外挂音频文件；所有角色、卡面、光效、粒子与音效均由浏览器实时生成。
- 桌面与移动端均可用；支持鼠标拖动、触屏拖动、点击/键盘开包、静音、`Escape` 关闭弹层与 `prefers-reduced-motion`。

## 视频拆解

参考视频：[`https://v.douyin.com/QVNdKMY9sAk/`](https://v.douyin.com/QVNdKMY9sAk/)（抖音，24.9s，640×360）

| 时间 | 画面与交互 |
| --- | --- |
| 0.7–3s | 近黑绿色展厅，左右密集竖向条纹墙，地面湿亮反射，中央一道绿色/青色竖光缝与薄雾。正中悬浮钴蓝铝箔卡包，上下锯齿封口，包面 `PRISM` 大字、`5 FOIL CARDS`、四角星吉祥物和纵向条码，缓慢漂浮。顶部 `SimpleMkt` 字标与“光学展厅 · 3D 撕铝箔视觉与刷漆高光”说明。 |
| 3–7s | 卡包被拿到灯下检视：倾斜、旋转，包面高光由蓝紫过渡到青绿；随后进入黄铜/金色圆环，像 360° 检视台，底部出现“收集进度 0/12”。 |
| 7–10s | 顶部封口出现洋红/彩虹撕拉条，从左上被拉起；彩虹色带像丝带一样向上蛇形延伸，铝箔边缘被撕开。卡包开口后像素星屑与彩色纸屑爆出。 |
| 10–14s | 五张深海军蓝卡背呈扇形/一字排开，边框分别为黄、粉、青、紫、蓝；底部 UI 出现“一键展开 (5)”“再来一包”“收藏特典”。卡背开始翻转。 |
| 14–21s | 卡面揭晓：**Helios**（黄色星形）、**Prismix**（白/彩虹四角星）、**Astral**（带环行星脸、SECRET RARE）、**Vortex**（紫色球体）、**Orbit**（蓝色带环行星）。卡面有镭射彩虹、3D 凸出角色、发光边框、编号与稀有度标签；Astral 被放大并出现“秘密彩蛋”说明。五卡随视角轻微摆动，底部提示“12 张卡牌典藏图鉴 / 开启闪光灯收录”。 |
| 22–24s | 切入深绿色半透明“典藏卡册”弹窗，标题 `PRISM · Series 01 典藏卡册`，12 格收集网格，显示 `5/12`、已收集缩略图与编号；随后淡出，回到空展厅，形成循环。 |

视频强调“没有游戏引擎、没有外挂音频文件”；因此本项目用 CSS 3D、Canvas 2D、SVG 与 Web Audio 实时合成，而不是引入 Three.js 或音频素材。

## 交互闭环

1. **撕开**：在卡包顶部横向拖动，拖动距离映射为撕开进度；撕拉带、彩虹色带、锯齿银边、碎屑与包装面 `clip-path` 同步变化。
2. **半撕回弹**：松手时进度不足 55% 会弹回封口；超过 55% 自动撕到底。点击/按压或键盘 `Enter` 也可以直接开包。
3. **开包**：五张卡背从包装中弹出、扇形铺开，约 1.18s 后自动翻面；也可点“一键展开”。
4. **卡牌详情**：点击任意已翻面的卡牌，打开大卡面与角色设定、编号、稀有度、抽取率。
5. **典藏卡册**：右上角或“收藏特典”打开 12 格卡册；已收录 5 张显示缩略图，其余为锁定槽位。
6. **再来一包**：清空当前卡牌、重排卡序与撕裂缝，方便反复演示；已收录卡牌保留。
7. **声音**：Web Audio 合成撕铝箔噪声、开包和弦、翻牌声与角色音效；首次指针/键盘操作后才创建 `AudioContext`，静音状态写入 `localStorage`。
8. **无障碍**：卡包是真实 `button`；支持键盘开包、`Escape` 关闭弹层、`aria-live` 播报开包结果、`prefers-reduced-motion` 降低动效。

## 实现说明

- `index.html` 为最终单文件版本，CSS/JS 全部内联；开发期外链的 `app.js` 已合并进单文件，不再单独提供。
- 卡包：`clip-path` 生成不规则撕裂边；`canvas#tearFx` 绘制撕拉带、彩虹射线与碎屑；CSS 变量控制尺寸与配色。
- 卡牌：12 张系列数据；前 5 张为本次可抽取角色，后 7 张为锁定槽位；每张卡用内联 SVG 绘制角色与全息纹理。
- 动效：`Spring` 弹簧驱动撕开/回弹；卡牌进入、翻面、悬浮倾斜使用 CSS 3D 变换与 requestAnimationFrame。
- 音效：噪声 + 滤波器模拟铝箔纤维断裂；振荡器/包络合成翻牌与开包提示音。
- 响应式：桌面横排五卡；窄屏/竖屏改为 3+2 卡扇，保证五个卡名都不被遮挡。

## 开源地址调查

**结论：没有找到 `holo.yashb.xyz` 的官方公开开源仓库。**

- 原站：`https://holo.yashb.xyz/`，标题 `Card pack`。首屏文案 `TEAR HERE ⟶`、`holo`、`COBALT`、`5 cards`、`5 collectible cards`、`One holo in every pack`；可访问名称包含 “Drag across the top to tear it open, or press to open.” 和 “Mute sound”。HTML 中未发现 GitHub / 作者 / LICENSE 外链。
- 视频口播只说明“项目地址已开源在粉丝群中”，视频页与文案没有公开链接；视频里的 `SimpleMkt` 定制版也没有检索到公开仓库。
- 公开可检索到的两份**非官方恢复副本**（并非原作者发布，且均未声明 LICENSE）：
  - [`akasakariko/frontend-components` 的 `holo-card-pack`](https://github.com/akasakariko/frontend-components/tree/main/holo-card-pack)：README 说明是从部署产物恢复的可编辑副本，含 `index.html`、`src/styles.css`、`src/app.js`、`src/art-data.js`、`original/index.html`、`provenance.json` 等；`provenance.json` 记录原站 `sha256` 与字节数。
  - [`xxbb11122/holo-reverse`](https://github.com/xxbb11122/holo-reverse)：README 明确写“并非一作”，是从原站公开返回 HTML 恢复；包含 `reference/original.html`、`src/app.js`、`src/styles.css`、`src/art.js`、31 张 WebP 与 `dist/index.html`。
- 这两份仓库都没有 `LICENSE`；`xxbb11122/holo-reverse` README 明确说明原站代码与美术权利归各自权利人，整理不额外授予许可。**因此不能把它们当作“官方开源地址”，也不应直接搬运其中的代码或 31 张 WebP 素材。**
- 本项目采用原创实现：角色、卡面、卡背、纹样、场景与文案均为本项目重新绘制，仅参考视频中的交互结构与视觉语言。

## 运行

直接双击/打开 `index.html`，或：

```bash
python3 -m http.server 8765
# 浏览器打开 http://127.0.0.1:8765/
```

不需要 Node、npm、构建或网络资源。

## 已验证

- 桌面 1280×960：首屏、拖动撕开、半撕回弹、自动翻面、五卡、卡册 5/12、Astral 详情、再来一包、键盘 `Enter` 开包、`Escape` 关闭、静音切换均跑通。
- 移动端 390×844：首屏、归一化坐标拖动、五卡 3+2 布局、卡册与详情均可用，无横向溢出。
- `prefers-reduced-motion: reduce` 下可开包且无大幅动画；`console` 无报错。
- 卡牌顺序每包打乱，卡册与进度保留。

## 已知边界

- 典藏图鉴为 12 格；当前 Series 01 只提供 5 张可抽取卡，后 7 格为锁定展示，重复开包不会解锁新角色（文案中已说明“重复卡换算为棱镜尘”的设定）。
- 角色使用内联 SVG 与 CSS/Canvas 光效，不是 Blender 网格或图片资产；如果需要逐帧照片级角色，需要另行制作美术资源。
- 本项目是视觉/交互复刻，不是原站代码的分发；原站素材没有明确许可证，商用前请自行确认权利。
