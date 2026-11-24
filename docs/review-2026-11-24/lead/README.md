# 主理人独立复核证据

环境：无头 Edge（`--headless=new`，D3D11，Intel Iris Xe 核显），Node 22，驱动见 [`../tools/cdp.mjs`](../tools/cdp.mjs)。时间均为 2026-11-24，机器繁忙（4 路取证并行）时测得，数字偏保守；空闲复测见 [`../metrics/clean-metrics.json`](../metrics/clean-metrics.json)。

| 文件 | 怎么来的 | 看到什么 |
|---|---|---|
| `00-entry-desktop-default-html.jpg` | `tools/cdp.mjs --url /` | 入口页是浏览器默认样式：衬线标题 `Stations` + 4 个蓝色下划线链接 |
| `01-four-sites-desktop-first-screen.jpg` | `tools/spot.mjs`（1280×720） | 四站桌面首屏对照：license、hug、koi 正常；still 全黑 |
| `02-four-sites-mobile-first-screen.jpg` | `tools/spot.mjs`（390×844 @2x） | 四站手机首屏对照：license 文字重叠；still 全黑 |
| `03-license-mobile-390-text-overlap.jpg` | 同上 | `/license` 390 宽：宣言句换行后压住 `No.` 与日期 |
| `04-still-desktop-after-36s-veil.jpg` | `tools/probe-boot.mjs` | 遮罩 36.07 s 后才淡出；淡出后是体素海藻林 |
| `05-still-mobile-partial-draw-390x844.jpg` | `tools/probe-still-mobile.mjs` | 手机：画面只在左上角约 213×460，右侧横向拖影，下半屏暗 |
| `06-still-desktop-resize-A-before.jpg` | `tools/probe-still-resize.mjs` | 就绪后、未动窗口：画面满屏 |
| `07-still-desktop-resize-B-after.jpg` | 同上，派发一次 `resize` 事件后 | 画面缩到左上角约 60%×60%，其余变暗 |

## 原始输出（控制台抄录）

**`tools/probe-boot.mjs`（/still，桌面 1280×720）**

```
leftBootMs: 36070
samples: t=657ms state=booting frames=4 readiness=0 | t=9898ms frames=124 readiness=0 | t=31273ms frames=187 readiness=0
          | t=35559ms frames=194 readiness=1 | t=36070ms state=degraded
fps(淡出后 2s): 3.4        ← 繁忙时
```

**`tools/probe-still-mobile.mjs`（/still，390×844 @3x）**

```
leftBootMs: 23538   state: degraded   renderScale: 0.55   lod: low
#stage px [429, 928]  css [0, 0, 390, 844]      #gl px [429, 928]  css [0, 0, 390, 844]
```

**`tools/probe-still-resize.mjs`（/still，桌面 1280×720，单变量：一次 resize 事件）**

```
leftBootMs: 24293   state: degraded   renderScale: 0.55
before: #gl px [422, 238]      ← 引擎写的（engine.js:1942）
after : #gl px [704, 396]      ← 派发 resize 后，运行时写的（stage.ts:629-630；1280×0.55 = 704）
```

**机制**：`shared/stage/stage.ts:629-630` 与 `shared/parts/voxel-world/engine.js:1942` 都在写 `#gl` 画布的 `width/height`。引擎把画布缩到内部渲染尺寸（422×238）；运行时在 resize / 调分辨率时把它改回 704×396 而不通知引擎，引擎继续按 422×238 画在左上角。手机上一开机就处在后一种状态。

**`tools/spot.mjs` 首轮（繁忙，10:57–11:00）**

```
license-desktop  fcp 1004ms  fps 58.7      hug-desktop  fcp 1268ms  fps 53.4
still-desktop    遮罩未过    fps 4.5       koi-desktop   fcp 8680ms  fps 48.9   (DOMContentLoaded 8626ms)
license-mobile / hug-mobile / koi-mobile 同上趋势；still-mobile fps 12.3
```
