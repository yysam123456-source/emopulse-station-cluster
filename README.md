# 情绪脉冲站群（emopulse_station_cluster）

稳固共享底座 + 可插拔单 HTML 站点。详见 `deliverables/software-company/emopulse/ARCHITECTURE.md` v1.1。

## 分层

| 层 | 目录 | 纪律 |
| --- | --- | --- |
| L0 Frozen Core | `shared/core/` | abyssal-garden @ a596354 整仓原样，`BASELINE.sha256` 锁定，一行不改 |
| L1 协议与运行时 | `shared/contract/` | SiteApp 七方法、SiteConfig、统一 FSM、Runtime、埋点、短 URL |
| L2 构建流水线 | `shared/build/` | L1 同名覆盖 + L2 五常量锚点注入 + 拼接 IIFE + esbuild 压缩 + 模板内联 |
| L3 零件总库 | `shared/parts-library/` | 只增不改（T04/T05 归集） |
| L4 站点 | `sites/<id>/` | 配置 + glue + 可选 `override/`，站点间互不读写 |

## 命令

```bash
npm install
npm run verify:core          # 校验 Frozen Core 哈希基线
npm run build -- still       # 或 node build.mjs still → dist/still.html
npm run build:all            # 构建全部已注册站点
npm run typecheck            # 协议/站点 TypeScript 类型检查
```

## 新增站点（不碰底座）

1. 在 `shared/contract/types.ts` 的 `SiteId` 中登记新 ID（只加不改）；
2. 在 `shared/build/sites.config.mjs` 注册目录与路由；
3. 新建 `sites/<id>/{index,site.config,state,glue}.ts`，实现 `SiteApp` 七方法；
4. 需要整段替换引擎文件时才放 `sites/<id>/override/<同名文件>`；配色走 `site.config.ts.theme`，无需 `shaders.js` 副本。

## 构建机制（不可变更）

`FILES = ['quality','math','shaders','world','main','audio'].js` 按序读取（站点 `override/` 同名优先）→ L2 五常量锚点注入（唯一性校验）→ `join('\n')` → 单个 `async IIFE` → esbuild `transformSync` 压缩（非 bundle）→ `template.html` 的 `/*SCRIPT*/` 占位符内联 → `dist/<id>.html`（零外部资源）。

站点侧 `sites/<id>/bridge.ts` 由构建流水线单独编译内联到站点模板的 `/*RUNTIME*/` 占位符，用于把 `SiteApp` / FSM / 埋点接进浏览器；它不参与 core 的 6 文件拼接，也不写入 core。
