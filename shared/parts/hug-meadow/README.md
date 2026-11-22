# hug-meadow · L1 world 零件（原站蒲公英草甸完整移植）

**来源**：<https://demo.darmk.com.cn/threejsExample/#/dandelion-meadow>（实验 15 / 风的来信）
原始场景 chunk：`assets/DandelionStage-BVqHDGlE.js`（13,869 B）· 样式：`assets/DandelionStage-BFvFbee1.css`。
本目录只有 `index.ts` 与这份说明；上游源码不复制进仓库，场景常量与着色器按原文件逐段还原。

## 还原了什么

1. **场景结构**：10 株植物（`PLANTS` 即原站 `G` 数组，逐项同值）、固定种子 `31121`、共 **1,335 颗种子**。每颗种子是 **44 段线段 / 88 顶点**：2 段花茎 + 14 根冠毛 × 3 段。
2. **渲染方式**：`InstancedBufferGeometry` + `LineSegments`，`aHome/aAxis/aRelease/aRandom/aSize` 五组实例属性；`release` 初值 `-1`，放飞后按 `0..1.8s` 错峰脱开、飞行 `10s`。风场 x 向右、z 向负后方，与原件同向。
3. **草甸**：每株一根 `CatmullRomCurve3` + `TubeGeometry` 花茎（半径 0.018）、3 片压弯的 `PlaneGeometry` 叶、`SphereGeometry(radius*0.12, 10, 7)` 花托。
4. **背景**：程序化全屏片元，上暗下亮深橄榄渐变 + `vec2(0.72, 0.69)` 暖光；100 颗 bokeh 点位于 `z=-10..-18`。
5. **大气**：`FogExp2('#172c29', 0.046)`、`HemisphereLight('#eedab0','#152e22',3)`、`scene.background = '#172c29'`。**无后处理。**
6. **交互**：`cue('release')` 放飞、`cue('reset')` 收回；`update` 读 `audio.level`，超过 0.12 自动放飞（与原站麦克风路径同义）；`reducedMotion` 关闭常驻摇曳。

## 与原件的有意差异（都在这里，别在别处偷偷改）

- **相机**：桌面保持原站 `PerspectiveCamera(40°) @ (0,3.7,10.8)`，`lookAt` 左移到 `-1.3`，让主花球回到中线、左簇退到约 27%，给左侧标题让位。中间试过 34°，实机对照花球偏大、单位面积线更稀；已回退 40°。手机保持 `42° / (-0.8,3.7,16.8) / lookAt(-0.3,2,-0.6)`。
- **像素比**：高档 `min(dpr, 1.25)`、低档 `min(dpr, 1.0)`。原件是 1.6，但在 Retina 下 1px 种子线被压到 0.625 CSS px，对照 DPR1 参考图显得过分规整；收到 1.25 让线回到约 0.8 CSS px，换回一点毛边。
- **叶片**：几何与朝向不动，三片叶的 mesh 放宽到 `scale(1.35, 1.08, 1.35)`，补回原站 DPR1 下的叶片体量。
- **种子 alpha**：以原站 `0.19 + max(0,aAxis.z)*0.26` / 飞行 `0.62` 为底，抬到 `0.22 + max(0,aAxis.z)*0.30` / `0.64`。原值在 1px 线 + 1.25 DPR 下实机偏灰；这 +0.03 是补线覆盖率，不是改风格。
- **bokeh**：100 颗、尺寸 `16 + rng()*110`、片元 alpha `0.12`（原站尺寸 10–100、alpha 0.12）。
- **无头兜底**：`body[data-slug=hug]` 在构建层有一层草甸色渐变；WebGL2 缺席时页面不会只剩黑幕。L0 仍为空缺，草地由本零件不透明铺满。

## 性能

`costMs: 4`、`kb: 16`；1440×900@dpr2 实测 `fps≈59.9`、`cpuMs≈0.7`。高/低档只改像素比，**不删种子**——删种子会变成秃球。

## 真机对照（2026-11-20）

- 原站静止：`docs/review-2026-11-20/hug/reference-rest.png`（场景 1310×701）
- 本站静止：`docs/review-2026-11-20/hug/after-rest.png`（1440×900，DPR1）
- 本站 Retina：`docs/review-2026-11-20/hug/after-retina.png`（2880×1800，DPR2，检查线感）
- 原站释放 39%：`docs/review-2026-11-20/hug/reference-release.png`
- 本站释放 39%（约 4.6s）：`docs/review-2026-11-20/hug/after-release.png`
- 手机：`docs/review-2026-11-20/hug/after-mobile.png`
- 并排对照：`docs/review-2026-11-20/hug/compare.png`

结论：花球屏占比、5 簇构图、绒毛密度与逆光位置已对齐；种子云散开方向与错峰时序一致。**测试全绿不算验收，以这些同尺寸实机图为准。**

## 契约

`id:'hug-meadow'`、`layer:'L1'`、`channel:'world'`、`space:'screen'`、`blend:'source-over'`、`requires:['webgl2']`、`costMs:4`、`kb:16`、`expendable:false`。
