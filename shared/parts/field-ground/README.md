# field-ground

`field`（野）biome 的 **L0 底材**：黄昏草甸。只做三件事——铺天光、立三层远山、长一坡草。

- **来源**：自写（不来自 portal）。配色与层次参照 `docs/BIOME-ASSET-MAP.md` 里「四站 L0 全缺」的结论，是补缺口的第一件。
- **成本**：`costMs = 3.4`，为**估算的每帧填充成本**（不是 JS 计时）。依据：1280×720@dpr2 = 3.69 Mpx 下 1 次不透明全屏 blit（0.35 ms/Mpx）+ 3 次实色山体填充（0.30 ms/Mpx × 50% 屏高）+ 520 段描边（0.8 ms/千段）。`node bench.mjs` 会打印指令计数与这份对账。**真实浏览器数值未测**（Node 无 canvas），上站后用 `performance.now()` 采样替换。
- **LOD**：`high` 520 根草 / `low` 160 根，降幅 57–69%（按 `bench.mjs` 曲线段计数）。
- **已知限制**：暗角与雾带在 `low` 档不画（已并入底图，减不掉，所以 `low` 只减草叶）；离屏烘焙依赖 `document.createElement('canvas')`，缺失时降级为每帧现算（慢 3 倍但不白屏）。
