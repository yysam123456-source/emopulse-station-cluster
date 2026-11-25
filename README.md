# 情绪价值单页站 · 零件装配体系

用「零件 + 装配」的方式做情绪价值页面：每个零件只管一层画面，靠**图层叠加 + 混合模式 + 后处理链**复合出效果。零件之间不互相调用，也不共享状态（唯一共享是只读的 `WorldFrame`）。

当前有两条产品线：**四站**（`/license` `/hug` `/still` `/koi`，单域名按路径分站）与 **A2 模板线**（5 套单 HTML 模板 + 一个 Studio）。两条线共用同一套零件与装配运行时。

> 接手先读 [`docs/HANDOFF.md`](./docs/HANDOFF.md)；文档权威链见 [`docs/README.md`](./docs/README.md)。

## 当前状态

2026-11-25 的 P0 收口后，四站全部可上线：`/license` 桌面与手机全链、`/hug` 点草地/CTA 同一 release、`/still` 首帧可读且 40s 不挡门、`/koi` 40s 后 `Keep this frame` 保存 PNG。A2 五套模板与 Studio 同仓、分线、分入口；Studio 支持 Toy / 独立站两档体积门槛、运行时 `postMessage` 调参与单 HTML 导出。

> 接手先读 [`docs/HANDOFF.md`](./docs/HANDOFF.md)；文档权威链见 [`docs/README.md`](./docs/README.md)。
> 本机浏览器门已全部换成零依赖 CDP（`tests/lib/cdp-browser.mjs`），不再依赖 Playwright / macOS 缓存；调试只启动一个 Edge，跑完由测试 `close()` 收进程。

## 三分钟上手

```bash
npm install
npm run build:sites      # 四站 → dist/<slug>/index.html + dist/index.html
npm run serve            # 127.0.0.1:8080
# 打开 http://127.0.0.1:8080/
```

模板与 Studio：

```bash
npm run build:templates             # 5 套模板 → dist/templates/<id>/index.html（Toy 1 MB 门槛）
npm run build:templates:standalone  # 同上，独立站 5 MB 门槛（temple/gate 不再红）
npm run build:studio                # Studio → dist/studio/index.html（读 manifest）
```

模板参数在浏览器里是运行期参数：URL query（`?density=1.4&rays=.9`）和 Studio 的 `postMessage` 都走零件工厂重建，不重载 iframe。导出的单 HTML 在 `</head>` 前注入 `__EMBEDDED_PARAMS__` 垫片，`file://` 直开也保留当前参数。

## 命令

```bash
npx tsc --noEmit          # 类型检查，应 0 error
npm run verify:stage      # 运行时门；会原地改写 shared/stage/stage.ts 后还原，勿与施工并发
npm run verify:preview    # 逐预设预览构建门
npm run verify:sites      # 四站文本/结构门
npm run verify:site       # 四站像素门（启动一个 Edge，跑完关闭）
npm run verify:dom        # 四站 DOM / 菜单 / 注入通道门
npm run verify:fingerprint# 四站色相/明度/饱和度指纹
npm run verify:license    # /license 盖章与 Save 全链
npm run verify:input      # 四站输入边界
npm run verify:mobile     # 手机 390×844：license/hug/entry/menu
npm run verify:still-takeaway # /still Sit 40s 后 Copy（真等 40s）
npm run verify:koi-keep   # /koi 40s 后 Keep PNG（真等 40s）
npm run verify:a2         # A2 运行时参数 / Studio 双门槛
npm run verify:core       # 11 个冻结基线文件零改动
npm run verify:nexus      # 注册表 + 冻结基线零写入
npm run verify:nexus:full # 上面 + 组合 / 降级 / ESM / analytics
npm run docs:status       # 重新生成 docs/STATUS.md（幂等）
npm run preview           # 单文件预览 → dist/preview/field.html（file:// 直开）
node tools/parts/atlas.mjs # 生成零件图集 docs/PART-ATLAS.csv
```

浏览器门共用 `tests/lib/cdp-browser.mjs`；每条 `launch()` 只起一个 Edge，`close()` 先发 CDP `Browser.close`，再按唯一 profile 收整棵 Windows 进程树并清 profile。UI 调试请只保留一个 Edge 窗口，跑完关闭并清 `qa-review-*` / `qa-download-*` 临时 profile。

**本机基线门均已绿**：`verify:reuse`（含 CRLF/声明字节、溯源、黄金值、变异探针）与 `verify:clock`（42 个 .ts、真实违规 0）本轮复核 PASS；不再保留“已知红”清单。

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

- **A2 体积**：temple/gate gzip 约 3.3 MB，Toy 1 MB 档必红；独立站 5 MB 档已绿。要进 Toy 需把 12 张 base64 图换成程序化表面，属 P2，不是本轮门禁失败。
- **指纹门的假样本已撤**：旧 `site-fingerprint` 用 `field-l0`（field-ground）去断言 `/hug` 的草/地色相，样本与结论不同源、还会随摆动相位漂；现在只保留四站全帧色相/饱和 4 条，`field-l0` 调色板回到 MANUAL-QA §8 目视。
- CI 已补 `build:templates` / `build:studio` / `verify:site` / `verify:dom` / `verify:fingerprint` / `verify:license` / `verify:input` / `verify:mobile` / `verify:state` / `verify:readiness` / `probe:still` / `verify:a2` / `verify:still-takeaway` / `verify:koi-keep`；本机 `github.com:443` 不通，**尚未在 GitHub Actions 实跑**。`ci.yml` 的浏览器门只在 `windows-latest` 跑，`ubuntu-latest` 跑构建与 Node 门。

## 旧方向

仓库里仍有上一轮「站群 + 多 showcase」的归档，用户已推翻那个方向；读到旧文档按错方向施工的风险与「哪份能读」见 [`docs/README.md`](./docs/README.md)。
