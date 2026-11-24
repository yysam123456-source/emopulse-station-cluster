# QUARANTINE · 隔离区与底座缺陷台账

> **仓库根目录文件**（不放 `shared/parts-library/` 内）——任何人 clone 下来第一眼能看到。
> 设计依据：`docs/ARCHITECTURE-REUSE.md` §3.4（许可证四级）、§14.1-CF-5（L3 豁免四条硬约束）、§14.1-Q-01（本文件 `Q-01` 条目的唯一来源）。
> **引用口径**：上述章节号**仅用于溯源，非施工依据**。REUSE 文档已标 ⛔、内容冻结（`verify:reuse` 在运行时解析它，删改会红）。
> **`/praise` 口径**：本文中所有 `/praise` 提及均指**冻结的 legacy 站**——旧架构冻结存量、399 行代码完整但未启用、无构建产物；**不接入**。产品口径是四站（hug / still / koi / license），不含 praise。
>
> **本文件当前状态（2026-11-24）**：只有「底座缺陷」一个分区，两条——`Q-01` **已消解**（2026-11-18 落地并复验）；`Q-02` **待用户确认**（四站已改由新装配运行时 `shared/stage/` 构建，Q-02 描述的 v1 装配产线在新体系里不存在，建议随 v1 归档一并处理，见该条的状态行）。
> L1 / L2 / L3 豁免 / L4 硬阻断四个分区至今没有建立。当时计划补写它们的 T-R06 在仓库里没有任何脚本或测试对应：`git grep -n "T-R06" -- . ':!docs'` 只命中本文件正文和 3 处代码注释，没有检查本文件的测试。
> **本文件的信用来自「每条都是真事」**：这里的每一条都对应磁盘上可复跑的证据，不写"可能会"、不写"建议关注"。

---

## 底座缺陷

### Q-01 · 零件增量挂载机制「声明存在、实际失效」 —— 已裁「删除」→ **已消解（已落地）**

> **状态：已消解（2026-11-18，工程师落地并复验）。** 落地方式：① 删除 `license` / `praise` / `hug` 三站的 `for (const ref of config.parts)` 通用挂载循环（含 `extraParts` 字段与它的 update / dispose 两处遍历）；② 原循环位置保留一段真话注释，写明 `parts[]` 只**声明本站装了什么**、**不承诺可挂载**、新增零件必须加硬编码槽位；③ `shared/parts-library/README.md` 的「接入约定」第 2/3 条与 `shared/parts-library/registry/index.ts` 顶部说明同步改成真话；④ `sites/still/glue.ts` 的 `registerPartFactory` 标注为「未接线、当前零调用点、保留作将来接通方案的参考实现」（`still.parts = []`，其循环从不迭代，但它是唯一 fail-fast 的正确写法，故保留而非删除）。
> **本条正文永久保留**（判据：本条存在于本文件 = 本条未裁；已消解后也不得整条删除）——删掉会让后来人以为这个洞从未存在过。
> **验证口径**：`verify-provenance.mjs` 的门 2b 每次扫盘复算「`store.partFactories` 有无写入点」，并在 `resolveRefPaths` 里检查 glue 是否还有 `config.parts` 通用挂载循环（无循环 ⇒ A 路径直接判不成立）。两者都已不成立 ⇒ 三站 A 路径恒死，死引用 8 条全部落到 `E_SITE_REF_UNWIRED`（B 路径槽位不是 `manifest.entry` 的实例化）。
> **原有裁决记录**（保留）：2026-11-18 主理人选「删除」；连带必改 `shared/parts-library/README.md:28-29` 与 `shared/parts-library/registry/index.ts:4-5` 两处描述该已删机制的文案。
>
> **⚠️ Q-01（删除）与 Q-02 相互独立**：删掉 `parts[]` 挂载循环**不影响** `composition` 链路是否可用。两者都坏、但坏在哪一段不同，修法也不同，不要合并处理。

**现象**：`license` / `praise` / `hug` 三站的 `for (const ref of config.parts)` 循环**永不执行**。其上方注释宣称的

```
// P2 增量零件：site.config.ts.parts 中后续启用的项由此挂载，底座不改。
```

**这句话是假的，挂不上。**

**位置（三站，逐行）**：

| 站 | 注释 | 循环 | skip 名单 | 取工厂 | 装载 |
|---|---|---|---|---|---|
| `/license` | `sites/license/glue.ts:49` | `:50` | `:51` | `:52` | `:53` |
| `/praise` | —（无注释） | `sites/praise/glue.ts:47` | `:48` | `:49` | `:50` |
| `/hug` | —（无注释） | `sites/hug/glue.ts:45` | `:46` | `:47` | `:48` |

> **行号为写作时快照，不作判据**（同 §7.5 的行号纪律）。定位请认这三段代码本身：`for (const ref of config.parts)` / `if (… includes(ref.id)) continue;` / `(ctx.store.partFactories as …)?.get(ref.source)`。

**根因**：`ctx.store.partFactories` 恒为 `undefined`。

1. `shared/contract/runtime.ts:57` 把 `store` 初始化为 `Object.create(null) as Record<string, unknown>`，**没有 `partFactories` 字段**；
2. 全仓 `shared/` **零处**写入该字段（唯一一处在 `shared/parts-library/README.md:28` 的说明文字里，而那段文字描述的是一个不存在的机制）；
3. `sites/still/glue.ts:18` 用的是**模块级** `const partFactories = new Map<string, PartFactory>()`，与 `ctx.store.partFactories` 是**两个不同的东西**；
4. `sites/still/glue.ts:21` 的 `registerPartFactory()` **全仓零调用点**（只有定义，没有任何一处调用）⇒ 那个模块级 Map 也始终是空的；
5. 于是 `(ctx.store.partFactories as …)?.get(ref.source)` 恒得 `undefined`，`if (ref.enabled && factory)` 恒假。

**影响**：

1. `site.config.ts` 的 `parts[]` 读起来像一份功能清单，实际只有 glue 里 `this.parts = { … }` 硬编码的那几个零件生效——**配置声明与实际行为不符**。三站 `parts[]` 里**唯一真正被读取的字段是 `options`**（`sites/hug/glue.ts:36` `config.parts.find((p) => p.source === 'blow-input')` 取 `options.autoRequest`），`source` / `enabled` 都只是文字；
2. **掩盖了 `room-at-dawn` 的真实引用状态**：`sites/license/site.config.ts:28` / `sites/praise/site.config.ts:28` 写着 `source: 'room-at-dawn'` + `enabled: true`，让人以为它在被使用（详见 `docs/ARCHITECTURE-REUSE.md` §14.1-C4；**仅溯源，非施工依据**）；
3. `shared/parts-library/README.md:28` 的「接入约定」第 2 条也在描述这个不存在的机制（`registerPartFactory(id, factory)` 挂到 `ctx.store.partFactories`）——**文档与代码一起在冒充**；
4. 任何人按 README 的约定新增零件（即"不改 glue、只加 `parts[]` 一项"），都会得到「**配置写了、页面不出现、且无任何报错**」的结果——**这正是"底座不改"那句注释承诺的能力，而它从未成立**；
5. `part.manifest.ts` 声明的 `entry`（各零件的 `createPart`）**从未被任何站实例化**：`hug` 的蒲公英/吹气槽位虽然直接 `import` 了 `core/meadow.ts` / `core/detector.ts`（**算法真的搬了**），但走的仍是站点自己的薄包装，不是 `manifest.entry`。**「算法搬了」与「零件被装上了」是两回事。** 这是 `reuse-report.deadRefs[]` 里 5 条红的真正来源（详见 `docs/ARCHITECTURE-REUSE.md` §3.3.5；**仅溯源，非施工依据**）。

**裁决：已裁「删除」**（主理人 2026-11-18，落地时机 **T-R05 之前**）。两个选项的当日评估留档如下——**「接通」未被采纳**：

- **接通（未采纳）**：`Runtime` 构造 `ctx` 时把 `partFactories` 注入 `store`；`sites/still` 的模块级 Map 改为读写该字段；让 `config.parts` 真正驱动装载。
  **代价**：要改 `shared/contract/runtime.ts`（§4.6 高敏感文件）+ 四个站的 `glue.ts`，与 CF-1「最小足迹」直接冲突，需重新开豁免。
- **删除（采纳）**：删掉三站循环 + 把假注释改成真话 + `registerPartFactory`（连带 `README` 该条约定，已转派工程师）；`parts[]` 语义收敛为「**声明本站装了什么，不承诺可挂载**」；把「增量零件」列入 v2.1 scope。
  **代价**：`site.config.ts` 少一层扩展点，`room-at-dawn` 的两条 `FALSE` 死引用顺着消失。
- **落地前明确不许做的事**：给 `store.partFactories` 打一个空 `Map` 让它"看起来能跑"——那只会把「失效」变成「**静默失效**」，比现状更难查。

**判据（裁决后由 T-R06 补）**：`verify-provenance.mjs` 对三站 `parts[]` 输出 `deadRefs[]`，每条形如 `{ site, id, source, code, reason }`，`code` 取两值之一：

| `code` | 含义 | 修法 | 现状 | T-R03/T-R05 后 |
|---|---|---|---|---|
| `E_SITE_REF_FALSE` | **假声明**：`source` 声称的零件与槽位实现**根本无关** | 改 `site.config.ts`（**配置问题**） | **2**（`license.paper` / `praise.receipt-paper`） | **2**（不随改写消解） |
| `E_SITE_REF_UNWIRED` | **未接线**：`source` 的算法**真的在用**，但 `manifest.entry` 没被实例化 | 接通底座（**架构问题，属 Q-02**） | **8**（`hug` 3 + `license` 3 + `praise` 2） | **3**（`hug.dandelion` / `hug.blow` / `hug.flight`） |

**合计：现状 10 条、T-R03/T-R05 完成后 5 条。** `praise.typewriter`（`source: 'local-template'`）**不计**——它没有对任何上游零件做声明。
**两个码必须分开计数**：混成一个码会让读者以为改配置就能修好全部——而其中 8 条（`UNWIRED`）改配置根本修不掉。
**⚠️ 两码互斥，一个 `ref` 只命中一个码，不许重复计数**：`合计 = FALSE + UNWIRED`（现状 2 + 8 = 10；T-R03/T-R05 后 2 + 3 = 5）。**`license.paper` / `praise.receipt-paper` 已经算在 `FALSE` 里，不得再算进 `UNWIRED`**——这是最容易犯的重复计数。
**⚠️ 门 2b 判「`D0` 是否被引用」只认 `FALSE`**：`UNWIRED` 说明零件确实在被使用（算法在跑），只是没走入口——它**两边界都不进**，既不能当"被引用"的证据，也不能当"未被引用"的证据，只单独报红。**不要写成"任一码成立即视为被引用"。**
**Q-01 落「删除」后 A 路径的变化**：删掉三站挂载循环 ⇒ 通用路径 A **按设计永久不存在** ⇒ `reason` 里 A 一项统一写「已按 Q-01 删除」，判据实际只剩 B（槽位是否 `manifest.entry` 的实例化）。**条数不变**（`FALSE` 2 / `UNWIRED` 8→3）。
**本条目存在于本文件 = 本条未裁，开关未接通。** 删除路径落地并验证后，本条改为「已消解 + 落地 commit + 日期」保留，**不得整条删除**——删掉会让后来人以为这个洞从未存在过。

---

### Q-02 · 零件实例化层在产线上从未执行 —— 「可插拔底座」三层声明、零层承重

> **状态（2026-11-24）：仍待裁，但两个选项针对的产线已被替换。** 四站现在由新装配运行时 `shared/stage/` 构建（站点表在 `shared/sites/build.mjs` 的 `STATIONS`），不再经过 `mount-site.ts` / `composer.ts` / `generic-app.ts` / `parts-registry.ts`；`git grep -n -E "partFactories|composition" shared/stage shared/sites` 里 `partFactories` 零命中，`composition` 只出现在注释和预览页的标签字符串里。下文「接通 / 降级声明」二选一是 v1 时期的问题，原文保留。
> **建议**：本条随 v1 归档一并处理——`shared/contract`、`shared/build`、`parts-library/registry` 里仅 v1 引用的文件移入 `archive/v1/`，并且先废 `verify:reuse` 对 `ARCHITECTURE-REUSE.md` 的运行时解析、再移文档（[`REVIEW-2026-11-24.md`](docs/review-2026-11-24/REVIEW-2026-11-24.md) §5.3）。**待用户确认**；确认前本条保持「待裁」，下文「裁决前明确不许做的事」里的三件事照旧不许做。
> **本条比 Q-01 更严重**：Q-01 坏的是"零件怎么被挂上"，Q-02 坏的是"**零件实例化这条产线本身从未通电**"。

**现象**：`mount-site.ts` / `composer.ts` / `generic-app.ts` / `parts-registry.ts` 这一整条装配链，**在 7 个站点的产物里一次都没跑过**。当前实际装配完全依赖各站 `glue.ts` 里的硬编码 `this.parts = { … }`。

**链条（四步，每步都可复跑；第 3、4 步是我在 Q-02 之外追出来的两个同方向断点）**

| # | 事实 | 位置 / 复核 |
|---|---|---|
| 1 | **7 站 `site.config.ts` 全无 `composition` 字段** ⇒ `composition` 恒为「五层皆空」 | `mount-site.ts:231` `const composition = config.composition ? normalizeComposition(config.composition) : createEmptyComposition();`；实测 `grep -rn "composition" sites/*/site.config.ts` → **空** |
| 2 | 空 composition ⇒ `bindings` 恒空 ⇒ **工厂调用永不执行** | `composer.ts:196` `const bindings = sortBindings(layers[layer]);`（`layers` 全空）⇒ `composer.ts:248` `const instance = factory({ … });` **不可达** |
| 3 | **`mountSite()` 没有任何站点 import** —— 整条链连产物都进不去 | `shared/build/build.mjs:38` 入口 `entryPoints: [configPath]`（`site.config.ts`）、`:57` 入口 `entryPoints: [bridgePath]`（`bridge.ts`）；全仓 `grep -rn "mount-site\|mountSite"` 除文档注释外，**唯一调用方是 `tests/verify-degradation.mjs`（vm 沙箱）** |
| 4 | **即便将来填了 `composition`，也会在 `resolvePart()` 处抛「未注册」** | `registerPart()` 只在 `install.ts:136` 被 `installParts()` 调用；而 **`installParts()` 零生产调用点**（只有 `tests/verify-parts-assembly.mjs` 调）⇒ 注册表恒空 ⇒ `resolvePart()` 抛错 ⇒ 降级 static |

> **第 4 步同时订正本文档 §0 的一处过期表述**：F2 行原写「**`registerPart()` 全仓 0 调用点**」，现已在 `shared/parts-library/registry/install.ts:136` 出现一处——**真正零调用点的是 `installParts()`**，结论（注册表恒空）不变，但病名要改，否则下一个人去 grep `registerPart` 会找到调用点、以为已修好。

**影响**：

1. **「新增站点只能照抄 glue 硬编码」**：底座那条路从未通电，所以不给新站 glue 就等于建不出站——这与主理人最初的要求「底层架构一定要搭建好，坚实的基础架构方便后续应用层面不断增加的新应用」**正面冲突**；
2. **三层声明全部落空**：

   | 声明 | 实际情况 | 编号 |
   |---|---|---|
   | `site.config.composition` | 从未填写 → composer 恒空 → `createPart` 从未调用 | **Q-02** |
   | `site.config.parts[].enabled` | 只有 `options` 被真读（`sites/hug/glue.ts:36`），挂载循环恒假 | Q-01 |
   | `ctx.store.partFactories` | `Object.create(null)`，全仓零写入 | Q-01 |

3. **文档与代码在互相冒充**（三处）：
   - `shared/parts-library/README.md:28-29`：「通过 `registerPartFactory(id, factory)` 挂到 `ctx.store.partFactories`」——机制不存在（Q-01）；
   - `shared/parts-library/registry/index.ts:4-5`：「站点接线方式：`import { createPart } from '<entry>'` + `registerPart(manifest, createPart)`」——**没有任何站点这样做**；
   - `docs/archive/2026-11-pre-pivot/ARCHITECTURE-NEXUS.md`（已归档）多处把 `composition` 当作"8 站已提供"来写验收（如 §28 行「新站不写 glue」、§49 行「8 站 `composition` 每层 `ref` 均命中注册中心」）——**那是 v2.1 的设计目标，不是现状**；现状是 7 站全部走 glue、`composition` 一个都没有。
4. **测试给了虚假信心**：`tests/verify-composition.mjs` / `verify-degradation.mjs` / `verify-config-driven.mjs` 都在工装里跑通了装配链，但**工装里的 config 是测试自己造的**，没有一个来自真实站点。绿灯证明"API 可用"，不证明"站点在用"。

**待裁（二选一，各附代价）**：

- **A · 接通**：为 7 站填 `composition`，把现有 glue 里的硬编码槽位改写成 `PartBinding`，并把各站 `bridge.ts` 改走 `mountSite()`。
  **代价**：最大且四条叠加——① **7 站产物全变** ⇒ **7 条签字**（`verify-baseline-signoff` 全量重签）；② 与 CF-1「最小足迹（4 个文件）」直接冲突，**需重新开豁免**；③ `mount-site` + `composer` + `generic-app` 进入浏览器 bundle ⇒ **`dist` 体积增加**（`/hug` 已逼近 160 KiB，见 §13）；④ `installParts()` 必须在 bridge 里真正被调用一次，否则第 4 步照样断。
  **收益**：唯一让底座真正承重的做法，也是"新增站点不必写 glue"这句话唯一能成立的前提。
- **B · 降级声明**：明确写「当前**全部**站点走 glue 硬编码；`composition` / `mountSite` / `createPart` / 7 方法契约是**预留 API，未经产线验证**」，并把 `tests/verify-composition.mjs` 的定位从"验底座"改为"验预留 API 的单元行为"。
  **代价**：小，但有两笔——① **`quarantine` 长期挂一条**（本条不会消解，只是从"待裁"变"已定性"）；② **必须同时删掉文档里任何"站点已通过可插拔底座装配"的表述**（含 NEXUS 那些按"已提供"口吻写的验收项，或明确标注为"目标态"），否则降级声明就是自欺。
  **不可省略的连带动作**：`README.md:28-29` 与 `registry/index.ts:4-5` 两处注释必须改成"预留，未接入"，**不许留在代码里冒充已完成的能力**。
- **裁决前明确不许做的事（三件，全是把「失效」变成「静默失效」）**：
  1. 给 `composition` 填一个空壳让它"看起来能跑"；
  2. 给 `store.partFactories` 打一个空 `Map`；
  3. **把 `mountSite()` 硬塞进某个 `bridge.ts` 让它"至少被 import 了"**——这比前两件更坏：它会让第 3 步的"零导入者"证据消失，而链路依旧不通，将来再查就得从头查。

**判据（裁决后由 T-R06 补）**：建议加一条**"产线证据"断言**——任一站的 `bridge.ts` 依赖树里若不含 `mount-site`，则 `composition` 字段要么不存在、要么必须被标注为"未接线"。**不允许"配置里写着 composition、却没有任何东西读它"这种状态存在。**
**本条目存在于本文件 = 本条未裁。** 裁决落地后改为「已消解 + 落地方式 + 日期」保留，**不得整条删除**。
