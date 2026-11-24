# 情绪价值单页站 · 零件装配体系

用「零件 + 装配」的方式做情绪价值页面：每个零件只管一层画面，靠**图层叠加 + 混合模式 + 后处理链**复合出效果。零件之间不互相调用，也不共享状态（唯一共享是只读的 `WorldFrame`）。

当前有两条产品线：**四站**（`/license` `/hug` `/still` `/koi`，单域名按路径分站）与 **A2 模板线**（5 套单 HTML 模板 + 一个 Studio）。两条线共用同一套零件与装配运行时。

> 接手先读 [`docs/HANDOFF.md`](./docs/HANDOFF.md)；文档权威链见 [`docs/README.md`](./docs/README.md)。

## 当前状态

装配运行时完工并有门锁着；**登记 17 件零件（16 件在 `shared/parts/`）· 18 个预设 · 4 个站 · 5 套模板**（复算：`npm run docs:status`，唯一出处 [`docs/STATUS.md`](./docs/STATUS.md)）。但四站**没有一站按自己的成立判据全绿**：`/license` 桌面走通全链，`/hug` 点草地不给链接，`/koi` 没有带走物，`/still` 遮罩 17.8 s 且手机画面只画左上角。详见评审 §3。

## 三分钟上手

```bash
npm install
npm run build:sites      # 四站 → dist/<slug>/index.html + dist/index.html
npm run serve            # 127.0.0.1:8080
# 打开 http://127.0.0.1:8080/
```

模板与 Studio：

```bash
npm run build:templates  # 5 套模板 → dist/templates/<id>/index.html
npm run build:studio     # Studio → dist/studio/index.html（读 dist/templates/manifest.json）
```

## 命令

```bash
npx tsc --noEmit          # 类型检查，应 0 error
npm run verify:stage      # 44 断言 + 6 变异 + 22 接合
                          # ⚠️ 会原地改写 shared/stage/stage.ts 6 次后还原；有人并发施工时不要跑
npm run verify:preview    # 811 断言（逐预设）
npm run verify:sites      # 119 断言（屏幕文字必须在 COPY/UI 里）
npm run verify:core       # 11 个冻结基线文件零改动
npm run verify:nexus      # 注册表 + 冻结基线零写入
npm run verify:nexus:full # 上面 + 组合 / 降级 / ESM / analytics
npm run docs:status       # 重新生成 docs/STATUS.md（幂等）
npm run preview           # 单文件预览 → dist/preview/field.html（file:// 直开）
node tools/parts/atlas.mjs # 生成零件图集 docs/PART-ATLAS.csv
```

**本机（Windows）跑不了的**：所有依赖 `tests/lib/browser.mjs` 的门与 bench —— 它只认 macOS 的 playwright 缓存路径。包括 `verify:dom` `verify:fingerprint` `verify:license` `verify:input` `verify:field` `verify:paper` `verify:site` `shot` `bench:parts` `bench:gl` `bench:blend`。需要浏览器取证时用 [`docs/review-2026-11-24/tools/cdp.mjs`](./docs/review-2026-11-24/tools/cdp.mjs)（无头 Edge + 原生 CDP，零依赖）。

**两条已知红**：`verify:reuse`（本机 99 个文件 CRLF/混合行尾，声明字节 ≠ 磁盘字节；LF 副本里绿）、`verify:clock`（`shared/parts/dandelion/index.ts:291,337` 调 `performance.now()`）。

## 目录地图

```
shared/stage/        装配运行时（唯一入口 index.ts）+ preview/ 单文件预览构建器
shared/parts/        16 件 Stage 零件（含 4 件孤儿：ascii-field / boids / dandelion / sun）
shared/product/      模板注册表 + 模板构建 + Studio
shared/sites/        上线壳 + 站点构建器 + 本地 serve + 文案单一来源
shared/core/         体素引擎冻结基线（BASELINE.sha256 锁 11 个文件）
shared/parts-library/ v1 零件，含两份真算法内核（dandelion / blow-input），别删
sites/               四站站内代码（hug / license / still / koi）、praise（冻结未启用）
tests/               全部门；tests/lib/ 是假 ctx、假画布、浏览器驱动
tools/               docs/status.mjs、parts/atlas.mjs
docs/                文档，权威链见 docs/README.md；评审在 docs/review-2026-11-24/
dist/                产物（gitignore，按需重建）
```

## 三条不可违反

1. **`shared/core/` 一个字节都不许改** —— 有 `BASELINE.sha256` 和 `npm run verify:core` 盯着。要改就抄到 `shared/parts/voxel-world/` 再改。
2. **零件之间不许互相调用** —— 只读 `WorldFrame`，要复合就叠层。
3. **别把估算当实测** —— `costMs` 是**申报预算**，不是浏览器实测；Node 里假 ctx 测出来接近 0，真实成本全在 GPU 填充。

## 已知问题与后续路线

评审依据：[`docs/review-2026-11-24/REVIEW-2026-11-24.md`](./docs/review-2026-11-24/REVIEW-2026-11-24.md)。

- 体验阻断：`/still` 3 个（黑屏 17.8 s、画面只画左上角、无 WebGPU 无提示）、`/license` 手机排版重叠、`/hug` 点草地不给链接、四站手机打不开 Esc 菜单且双指放大 5 倍；A2 另有 2 个。见评审 §3。
- 6 个架构根因全部定位到文件:行；`verify:stage` 会改写源码；没有 CI。见评审 §4。
- P0 共 10 条、P1 / P2 见评审 §5；三件事待拍板（`/still` `/koi` 是否撤出入口、A2 同仓还是分仓、`/koi` 算不算成立的站）见 [`docs/HANDOFF.md`](./docs/HANDOFF.md) §5。

## 旧方向

仓库里仍有上一轮「站群 + 多 showcase」的归档，用户已推翻那个方向；读到旧文档按错方向施工的风险与「哪份能读」见 [`docs/README.md`](./docs/README.md)。
