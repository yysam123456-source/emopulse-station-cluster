# boids · L2 生态零件

**来源**：本站自写。算法是 Reynolds boids（separation / alignment / cohesion）的常用变体；
没有从上游仓库搬运具体代码。鸟的 V 形两笔线、天空带裁剪、指针排斥与 `release` 炸群是本实现自己的取舍。

**为什么不是 three.js**：60 只鸟 × 2 笔 = 120 次 `stroke`，Canvas2D 在 0.7ms 量级；
three.js 要建几何、上传矩阵、处理透明排序，反而不划算。

**离屏缓冲**：主画布从不 `clearRect`，所以细线必须画在只覆盖天空带（`BAND=0.58`）的私有 canvas 上，
每帧 clear 这块小缓冲再 blit 回去；否则会留下上一帧的鸟尾。

**关键文件**：`index.ts`（`costMs 0.7`、`expendable: true`、`cue('release')`）。
