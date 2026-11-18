# 情绪价值单页站 · 零件装配体系

> **接手请先读 [`docs/HANDOFF.md`](./docs/HANDOFF.md)。** 那份是交接书，本文只做入口。

用「零件 + 装配」的方式做情绪价值页面：每个零件只管一层画面，靠**图层叠加 + 混合模式 + 后处理链**复合出复合效果。零件之间不互相调用，也不共享状态（唯一共享是只读的 `WorldFrame`）。

## 当前状态（2026-11-18）

| 部分 | 状态 |
|---|---|
| 装配运行时 `shared/stage/` | ✅ 完工，28 断言 + 6 变异探针 + 15 接合断言全绿 |
| 零件 `shared/parts/` | 🟡 2 / 6（`field-ground` L0 · `voxel-world` L1） |
| 四座样板站 | ❌ 0 / 4（`/license` 最快，只需 2 个零件） |

## 三层结构

| 层 | 目录 | 纪律 |
|---|---|---|
| 装配运行时 | `shared/stage/` | 六层序 `L0–L5` 固定、层内 `z` 排序、L4 与 GL 通道整场唯一、超预算只降档不跳画、零件抛错就地隔离 |
| 零件 | `shared/parts/<id>/` | 每个零件 `{ id, layer, blend, costMs, kb, create(env) }`，自带 `README.md` 与 `bench.mjs`。零依赖、零每帧分配、`dispose` 幂等 |
| 站点 | `sites/<id>/` | 只做装配与文案，不含算法 |

## 命令

```bash
npm install

# 新体系（必须全绿）
npm run verify:stage          # 28 断言 + 6 变异 + 15 接合断言
npx tsc --noEmit              # 0 error

# 单零件成本对账（打印画布指令计数 + 估算对账）
node shared/parts/field-ground/bench.mjs

# 冻结基线（一个字节都不许改）
npm run verify:core

# 旧体系（v1 站群）：源码还在，产物已删出库
npm run verify:reuse      # 零件溯源五门（仍绿）
npm run verify:nexus      # 注册表 + Frozen Core 零写入
npm run build:all         # 产物写 dist/（已 gitignore），仅作历史对照，与新体系不兼容
```

## 目录地图

```
shared/stage/          装配运行时 —— 唯一入口 index.ts
shared/parts/          新零件（field-ground ✅ / voxel-world ✅ / 其余待补）
shared/core/           体素引擎冻结基线（BASELINE.sha256 锁定）
shared/parts-library/  v1 零件（含两份真算法内核：dandelion / blow-input，别删）
shared/contract/       v1 协议层（SiteApp / SiteConfig / FSM）—— 待裁
shared/build/          v1 构建流水线（6 文件拼接 + 锚点注入）—— 待裁
sites/                 v1 站点（hug / license / praise / still / koi）
tests/                 全部门都在这里
docs/                  文档，权威链见 docs/README.md
docs/evidence/         目视证据（体素世界 CDP 截图）
QUARANTINE.md          两个遗留隔离项，Q-02 就是「零件实例化产线从未执行」
```

## 三条不可违反

1. **`shared/core/` 一个字节都不许改** —— 有 `BASELINE.sha256` 和 `npm run verify:core` 盯着。要改就抄到 `shared/parts/voxel-world/` 再改。
2. **零件之间不许互相调用** —— 只读 `WorldFrame`，要复合就叠层。
3. **别把估算当实测** —— `costMs` 尤其危险：Node 里没有 canvas，假 ctx 测出来的数接近 0，而真实成本全在 GPU 填充。

## 旧方向说明

仓库里仍有上一轮「站群 + 多 showcase」的产物（已移入 `docs/archive/2026-11-pre-pivot/`）。用户已推翻那个方向：不做站群、改单域名按路径分站、不管 LICENSE、卖点是叠加复合而非单页特效。**归档文档不要据此施工。**
