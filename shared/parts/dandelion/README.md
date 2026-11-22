# dandelion · L2 生态零件

**来源**

- 渲染层：`sites/hug/parts/dandelion.ts`（v1 的 Canvas2D 绘制层：LOD 分档、透明度分桶、预渲染缓存）
- 数学层：`shared/parts-library/dandelion/core/meadow.ts`（1335 颗种子 / 44 段伞骨 / 1.8s 错峰脱落 / 三轴异速飘散）

**与 v1 的差异（契约要求）**

1. 不 `clearRect` 主画布：ready 期直接画，drifting 期用零件私有离屏缓冲。
2. 时钟只读 `frame.dt`；reducedMotion 每帧读，不持有时钟。
3. 种子由 `env.seed` 决定（`mulberry32`），同一 seed 同一花球。
4. `frame.audio` 的响度只改**风强**（`DEFAULT_WIND + gust*0.55`），不触发释放；释放仍由 `cue('release')` 决定。

**关键文件**：`index.ts`。依赖 `shared/parts-library/dandelion/core/meadow.ts` 的纯数学，不复制算法。
