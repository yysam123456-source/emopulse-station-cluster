# nebula

**L1 世界**：四旋臂星系，three.js + WebGL2（`channel: 'gl'`，`requires: ['webgl2']`）。

## 装配（`shared/parts/nebula/scene.ts:76-80`）

| 顺序 | 模块 | 说明 |
|---|---|---|
| 0 | `starfield` | 背景星场；`starfield:false` 时整块不建（默认 true） |
| 1 | `halo` | 尘埃晕 |
| 2 | `arms` | 四条旋臂 |
| 3 | `core` | 中心核球 + 光晕 |

每个模块只 build 自己的 geometry，共享同一组 uniforms（时间 / 脉冲 / 色板 / 缩放）；增删模块不需要改粒子着色器。原件 Portal 的 35,200 粒子被拆成这四个模块。

## 参数（`options.ts`，也可用 query 覆盖）

`palette`（默认 `violet`）、`density` 0.45–1.35（默认 1）、`scale` 0.6–1.6（默认 1）、`speed` 0.2–2（默认 1）、`pulse` 0–1（默认 0.55）、`coreGlow` / `starfield`（默认 true）。

## 成本（申报值，不是真机实测）

`costMs = 2.4`、`kb = 4`、`layer: 'L1'`、`channel: 'gl'`、`blend: 'source-over'`（`index.ts`）。整场只允许一个 GL 通道，本件与 `voxel-world` / `temple` 互斥。

## 使用方

- preset `a2-nebula`（叠在 `abyss` 底材上，`palette:'abyss', density:1, scale:1, speed:0.85, pulse:0.55`）；
- 模板 `nebula`（`shared/product/templates.mjs`）。

单独预览：`npm run preview:a2-nebula`（生成 `dist/preview/a2-nebula.html`）。
