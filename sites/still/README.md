# /still · tide

**一句话**：Water you can sit under, and leave a line behind.

## 产品形态（2026-11-27）

- **进入**：满幅水，无地平线 / 岸 / 边框 / 中心实体。H1 `Still`、hook
  `Nothing here needs an answer.`、按钮 `Sit`。水面在极缓慢地变暗，气泡自发上浮。
- **Sit**：按一次，2.2s 内从「均匀深水」进入「上有水面光、下是深水」的视角；
  `body[data-sit="sit"]`。再按一次回 `stand`。没有第二个动作。
  有 WebGPU 时 `voxel-world` 真的把镜头下潜；没有 GPU 时由 `tide-medium` 的
  `{ still: true }` 产品模式接手（`shared/parts/tide-medium/still-water.ts`）。
- **停留**：光在 4 分钟里单调退走；Sit 后 10s 出 stay hint，40s 才出
  `Copy the line`。五档句子由光的状态决定，不含时长 / 数字，最后一句是
  `The light is gone. The water is still here.`。
- **手机**：390×844@dpr2 下 H1 / hook / CTA 不重叠；气泡按 CSS px 定径，不再被
  dpr 放大成灰盘。

## 画面说明

L0 不是「一条灰蓝渐变」：底是 `#17323d` → `#0e2530` 的连续上亮下暗，顶边一层水面雾，
深水段压近黑；悬浮微粒 84 个 + `bubbles` 70 个上浮。Sit 后顶光从画面上沿连续向下
衰减（无平台、无光带边界、无圆斑 / 焦散），整体亮度略降；慢变量叠加 `still-sink`
的 240s 乘性变暗。所有动画只读 `frame.t` / `dt`，无自持时钟。

## 证据与门

| 项 | 结果 | 证据 |
|---|---|---|
| 站点构建 | `site-build PASS 132/132` | `dist/still/index.html` 167,300 B |
| 成品视觉（真实 Chromium） | `site-visual PASS 49/49`；`still CTA Δ=21.86`、fps 21.2 | `_scratch/still-before-current.png` / `still-after-current.png` |
| 40s 带走物 | `still-takeaway PASS 7/7`，40.1s 出 `Copy the line`，复制成功 | `docs/evidence/plan-2026-11-25/still-mobile-copy-40s.png` |
| 色指纹（记录） | L\* P50 13.0 / 色相 200° / 饱和 0.681（帧 61） | `site-fingerprint PASS 4/4` |
| 手机 | 390×844@dpr2 首屏与 Sit 后各一张 | `docs/evidence/plan-2026-11-25/still-mobile.png` / `still-mobile-sit.png` |

**怎么验**：`export CHROME_PATH=/usr/local/bin/chromium`，`node tests/site-visual.mjs`
（四站约 1 分钟）；`node tests/still-takeaway.mjs`（约 40s）。本轮云 Chromium 无
WebGPU，上面的 21.86 是**无 L1 的 fallback** 帧差，不是拿 GPU 镜头位移冒充。
