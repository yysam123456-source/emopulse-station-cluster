# temple

**L1 世界**：写实寺庙/山门，`ScenePlan + SceneModule + MaterialLab` 装配（three.js，`channel: 'gl'`，`requires: ['webgl2']`）。

## 装配（方案 `TEMPLE_DAWN`，`shared/realism/plans.ts:32-41`；模块实现 `shared/realism/scene.ts`）

| 顺序 | SceneModule | 画什么 |
|---|---|---|
| 1 | `atmosphere` | 晨空、太阳/半球/补光、雾带、尘埃 |
| 2 | `ridge` | 两层远山山脊与空气透视 |
| 3 | `ground` | 起伏苔庭、碎石路、石板、草与落叶 |
| 4 | `pine-grove` | 松树、灌木、根石（`gate` 方案会放 3 次） |
| 5 | `shrine-hall` | 石基 / 石阶 / 朱漆柱 / 斗拱 / 瓦顶（`hall:false` 时整块不建） |
| 6 | `torii` | 朱漆鸟居、笠木、注连绳、纸垂 |
| 7 | `stone-lanterns` | 石灯笼、暖光、苔 |

`SCENE_MODULES` 共 7 个（`shared/realism/scene.ts:13-21`）；四种方案分别为 dawn / snow / dusk / gate（gate 去掉主殿，`plans.ts`）。

## 参数（`TempleOptions`，`index.ts`）

`scene`（dawn/snow/dusk/gate）、`fog` 0–1.4、`lanterns` 0–1（默认 0.82）、`orbit` 0–1（默认 0.7）、`torii` / `pines` / `stoneLanterns` / `hall`（默认 true）。

## 成本（申报值，不是真机实测）

`costMs = 7.5`、`kb = 18`、`layer: 'L1'`、`channel: 'gl'`、`blend: 'source-over'`（`index.ts`）。另依赖 `shared/realism/`（约 3,217 行 + `assets.ts` 5,021,017 B 的 base64 贴图）；12 张位图使 temple / gate 产物约 4.99 MB，申报 `kb: 18` 与产物不符，评审已记为契约问题（P1 体积预警）。

## 使用方

- preset `a2-temple`（dawn）与 `a2-gate`（gate，`hall:false`）；
- 模板 `temple`、`gate`（`shared/product/templates.mjs`）。

单独预览：`npm run preview:a2-temple`（生成 `dist/preview/a2-temple.html`）。
