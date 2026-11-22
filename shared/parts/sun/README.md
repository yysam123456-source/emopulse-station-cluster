# sun · L3 光感零件

**来源**：本站自写。不是从上游仓库复制的太阳：它把「日盘 + 两层晕 + 地面反光」烘进一张
512×512 离屏精灵，每帧只 `drawImage` 一次；`screen` 混合只加光、不压暗。

**行为**：`t/120` 的慢呼吸 + 缓慢下沉；`reducedMotion` 时完全静止。
`costMs 0.3`、`expendable: true`。

**关键文件**：`index.ts`。
