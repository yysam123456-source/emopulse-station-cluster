# abyss

**L0 底材**：深水色阶 → 斜射光柱 → 水面焦散 → 悬浮微粒 → 指针涟漪，五层 canvas2d 水层。

## 装配（`shared/parts/abyss/scene.ts:56-61`，增删/调序只动这个数组）

| 顺序 | 层 | 画什么 |
|---|---|---|
| 1 | `background` | 深水渐变 + 暗角 + 颗粒 |
| 2 | `rays` | 斜射光柱 |
| 3 | `caustics` | 水面焦散 |
| 4 | `motes` | 悬浮微粒 |
| 5 | `ripples` | 指针涟漪 |

每层只拿 `AbyssView` 和 `frame`，不互相持有；与 `temple` 的 `SceneModule` 同原则，只是通道从 GL 换成 2D。

## 参数（`options.ts`，也可用 query 覆盖）

`palette`（默认 `abyss`）、`density` 0.4–1.6（默认 1）、`rays` 0–1（默认 0.55）、`caustics` 0–1（默认 0.35）、`vignette`（默认 true）。

## 成本（申报值，不是真机实测）

`costMs = 2.1`、`kb = 3`、`layer: 'L0'`、`channel: 'canvas2d'`、`blend: 'source-over'`（`index.ts`）。成本口径是整场预算的申报值；评审已指出 `costMs` 多为估算，不可当实测。

## 使用方

- preset `a2-deepsea`（`palette:'abyss', density:1.1, rays:0.62, caustics:0.34`）与 `a2-nebula`（density 0.8 / rays 0.35 / caustics 0.2）；
- 模板 `deepsea`、`nebula`（`shared/product/templates.mjs`）。

单独预览：`npm run preview:a2-deepsea`（生成 `dist/preview/a2-deepsea.html`）。
