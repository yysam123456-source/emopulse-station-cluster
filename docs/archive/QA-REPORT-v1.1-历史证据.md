# QA 独立验证报告 — 情绪脉冲站群

- 验证人：严过关（QA 工程师 / Yan）
- 验证日期：2026-11-17
- 版本：v1.1（Round 2 回归后更新——Minor-1 已由 Engineer 修复并复测通过）
- 对象：`emopulse_station_cluster/`（7 站单 HTML 站群：Frozen Core + 两级覆盖 + SiteApp 插件协议）
- 依据：`ARCHITECTURE.md` v1.1、`PRD.md`、README 构建纪律
- 立场：**证伪优先**。不复述工程师自测命令；重点覆盖负向路径、边界与一致性。

## 0. 总览

| 验证项 | 结论 | 关键证据 |
| --- | --- | --- |
| V1 构建可复现性（删产物全量重建） | **PASS** | 7 站全部重建，哈希与基线逐字节一致 |
| V2a 底座哈希护栏负向（篡改 math.js） | **PASS** | build 被 verify-core 拦截 exit=1；恢复后 11 文件 OK |
| V2b 配色锚点唯一性负向（inject-theme） | **PASS** | 重复/缺失锚点、非法参数均按预期抛错 |
| V3 站点隔离（改 praise 只重建 praise） | **PASS** | 其余 6 站哈希逐一未变；恢复后回到原值 |
| V4 配色注入正确性（7 站 × 5 字段） | **PASS** | config 与产物注入值逐一比对一致，TANH/NEAR 保持原值 |
| V5 纯逻辑单元（状态机/短URL/埋点/Runtime） | **PASS** | 19 + 7 = 26 用例全过 |
| V6 运行时冒烟（无头 Edge + CDP） | **部分**：glue 交互 4/4 PASS；**core 渲染未测（环境无 WebGPU adapter）** | 4 站点击后 DOM 状态/埋点队列均变化；core 因无 adapter 进入正确降级态 `l e` |
| V7 反向设计与合规（7 站） | **PASS** | 147 项检查 0 失败，零外链/零注册消费导流 |
| V8 类型与死代码 | **PASS（带观察项）** | tsc strict 0 错误；无 TODO/FIXME；发现若干未用导出（Minor） |

**测试脚本落盘目录**：`emopulse_station_cluster/tests/`
- `contracts.test.ts`（26→19 用例：state-machine / short-url / analytics）
- `runtime.test.ts`（7 用例：Runtime 生命周期 / 插件协议 / events）
- `theme-injection.test.mjs`（15 用例：inject-theme 负向 + 7 站注入正确性）
- `site-isolation.sh`（站点隔离负向测试，含自动恢复）
- `compliance.test.mjs`（147 项合规断言）
- `runtime-smoke.mjs` / `probe-webgpu.mjs` / `runtime-smoke.log`（CDP 冒烟与 WebGPU 探测）
- `baseline-dist.sha256`（7 站产物基线哈希）

## 1. V1 构建可复现性

**命令/输入**
```bash
sha256sum dist/*.html > tests/baseline-dist.sha256
rm -f dist/*.html          # 确认 dist 清空
node build.mjs all
sha256sum -c tests/baseline-dist.sha256
```

**关键输出**：7 站全部重建，`[verify-core] ✅ 11 文件逐字节一致`，`sha256sum -c` 7/7 `OK`。

| 站点 | 体积(kB, esbuild 报告) | 字节数 | sha256 前 12 |
| --- | --- | --- | --- |
| still | 105.2 | 107773 | `a8a9882dc03c` |
| license | 110.0 | 112590 | `4ddbe7764135` |
| praise | 109.6 | 112270 | `1a3632ab4bc6` |
| hug | 109.3 | 111896 | `5ddaef56b722`（Round 2 修复后；修复前 `fdf5cd3b8a17`） |
| koi-pond | 105.3 | 107851 | `93c76a7689f7` |
| koi-ink | 105.3 | 107849 | `7f91476f8186` |
| koi-watercolor | 105.4 | 107882 | `d7ecc827d348` |

**结论：PASS**。删除全部产物后可完整重建，逐字节复现；`still` 哈希前缀 `a8a9882dc03c` 与已知基线一致（新增 6 站后仍未变）。

## 2. V2a 底座哈希护栏负向测试（关键）

**命令/输入**
```bash
cp shared/core/src/math.js /tmp/math.js.qabak
printf '\n// QA-TAMPER\n' >> shared/core/src/math.js   # 篡改一个字节
node build.mjs still        # 期望被拦截
cp /tmp/math.js.qabak shared/core/src/math.js         # 恢复
node shared/build/verify-core.mjs
```

**关键输出**
```
篡改后 math.js sha256 = 32e0bf4374d7...（原 d85f097764c9...）
build exit code = 1
[verify-core] ❌ Frozen Core 校验失败（1 项）：
  - 已改动：src/math.js（期望 d85f0977...，实际 32e0bf43...）
[build] Frozen Core 校验失败，构建终止
--- 恢复后 ---
[verify-core] ✅ Frozen Core 校验通过：11 个文件逐字节一致
```
- 恢复后 `sha256sum -c shared/core/BASELINE.sha256`：11/11 `OK`
- `dist/still.html` 哈希仍为 `a8a9882dc03c...`（失败构建未写出任何产物）
- `math.js` 哈希回到 `d85f097764c9...`

**结论：PASS**。护栏确实能在篡改时拦截并终止构建，且失败不污染产物；core 最终恢复原状。**负向测试后已用哈希证明 core 与产物完全回归基线。**

## 3. V2b 配色锚点唯一性负向（inject-theme 纯函数）

**命令**：`node tests/theme-injection.test.mjs`（A 段 7 用例）

**关键输出（全部 PASS）**
- 正向：5 锚点精确注入，`TANH=0.6`/`NEAR=0.1` 原值不动。
- 负向：WCOL 锚点重复（2 次匹配）→ 抛 `锚点 WCOL 匹配 2 次`；EXPO 锚点缺失 → 抛错；vec3 长度非 3 → 抛错；NaN/Infinity → 抛错；js 空串/缺 theme → 抛错；外部改动 TANH→0.7 → 二次校验抛错。

**结论：PASS**。唯一性校验与非有限数防护真实有效。

## 4. V3 站点隔离（关键）

**脚本**：`bash tests/site-isolation.sh`

**输入**：将 `sites/praise/site.config.ts` 的 `WCOL[0]` 由 `0.74` 改为 `0.11`，仅 `node build.mjs praise`，随后恢复并重建。

**关键输出**
```
praise: 1a3632ab... -> e330b31b...（随配置改变）
still / license / hug / koi-pond / koi-ink / koi-watercolor：哈希逐一未变
恢复配置并重建 praise 后：sha256sum -c tests/baseline-dist.sha256 → 7/7 OK
```

**结论：PASS**。单站配置只影响本站产物，其余 6 站字节级隔离；恢复后 praise 回到原值。

## 5. V4 配色注入正确性（7 站 × 5 字段）

**命令**：`node tests/theme-injection.test.mjs`（B 段，含 minify `0.58→.58` 形态处理）

**方法**：用 esbuild 将各站 `site.config.ts` 转为 data URL 导入取 `ThemeConfig`，与产物中（1）注入的 `vec3f(r,g,b)` 常量、（2）内嵌 config theme 对象、`EXPO/RAYS` 数值（两形态）、（3）`TANH(.6)/NEAR(.1)` 原值痕迹逐一比对。

**关键输出**（7 站全部 PASS，示例）
```
still:  WCOL=[0.36,0.34,0.31] PCOL=[0.82,0.76,0.66] SUNC=[1.35,1.18,0.98] EXPO=0.58 RAYS=0.42
praise: WCOL=[0.74,0.78,0.8]  PCOL=[0.96,0.97,0.95] SUNC=[1.25,1.3,1.35]  EXPO=0.72 RAYS=0.38
hug:    WCOL=[0.78,0.52,0.38] PCOL=[0.98,0.82,0.66] SUNC=[1.6,1.25,0.95] EXPO=0.62 RAYS=0.58
（koi 三站 distinct 主题亦逐一 PASS）
站点差异化：still / praise / hug 的 WCOL 注入值互不相同 PASS
```
产物实例：`vec3f(0.36,0.34,0.31)`（注入常量保留 `0.` 前缀）、内嵌 `WCOL:[.36,.34,.31],...,EXPO:.58,RAYS:.42`（minify 形态）、`.6,Ar=.1`（TANH/NEAR 原值）。

**结论：PASS**。覆盖 still + 6 个不同配色站，五字段注入与未注入字段均正确。

## 6. V5 纯逻辑单元验证

**命令**：`npx tsx tests/contracts.test.ts` → `PASS=19 FAIL=0`；`npx tsx tests/runtime.test.ts` → `PASS=7 FAIL=0`

覆盖：
- **state-machine**：初始/正常转移/非法事件不改状态/onExit→action→onEnter 顺序/reset 不触发回调/构造期校验。
- **short-url**：编解码往返（中文/emoji/特殊字符）、`?from=` 与裸 token、畸形输入容错、`?from=` 缺失降级、键数(20)/值长(200)截断、非标量过滤、`withFrom`。
- **analytics**：scrubPayload PII 丢弃、bucketDuration 边界、队列 push 与 `slice(-maxQueue)` 截断、localStorage 不可用/抛异常时静默降级、enabled 开关、计时器。
- **Runtime/插件协议**：createContext、boot 顺序、start/pause 幂等、dispatch、teardown 幂等、注册表与插件工厂、events 标签。

**期间发现并自修的测试 Bug（QA 自身，非源码）**：`withFrom` 用例最初把完整链接 `/still?from=...` 直接喂给 `decode()`；按其契约 `decode` 只接受 `?from=` 或裸 token。修正为截出 query 部分后通过。**属测试代码错误 → QA 自行修复（Round 1）**，非源码缺陷。

## 7. V6 运行时冒烟（无头 Edge + CDP）

**命令**：`node tests/runtime-smoke.mjs`（脚本自启 Edge headless，CDP 驱动点击）；`node tests/probe-webgpu.mjs`

**环境事实（如实记录，未谎报）**
```
Edge: Edg/157.0.4341.60
WebGPU 探测：{ "gpu": true, "adapter": false } => adapterAvailable = false
各站 #s 文案："No WebGPU adapter found." → body class = "l e"
```
尝试 3 组软件后端参数（`--use-webgpu-adapter=swiftshader` / `--enable-dawn-features=allow_unsafe_apis` / `--enable-features=Vulkan --use-angle=vulkan`）均无法获得 adapter。**本环境无法验证 core 的 WebGPU 渲染路径**；`l e` 是 core 在无 adapter 时的正确降级（inline.mjs 的 catch 包装），**不是源码 Bug**。

**站点 glue 交互（与 core 解耦，实测 4/4 PASS）**

| 站点 | 主交互按钮 | 点击前 | 点击后 | 判定 |
| --- | --- | --- | --- | --- |
| still | `#d` Sit | `#sit-timer`="想待多久，就待多久。" | "00:00"（进入 sitting 计时） | PASS |
| license | `#act` Stamp it | `#status`="一张允许你只做自己的许可证…" | "盖章中" | PASS |
| praise | `#act` Print one | `#status`="一张只为你打印的好事小票。" | "靠近一点，把纸层拨开。" | PASS |
| hug | `#act` Let it go / `#share` | `#back` hidden；状态="一点暖意正在聚拢。" | `#back` 显示；状态变化；埋点队列 1→2→3 | PASS |

**结论**：glue 插件协议在真实浏览器中按预期工作；**core 渲染态：未测（环境限制）**，非产品缺陷。

**Round 1 冒烟中发现 1 个源码缺陷**：hug 点击 Share 时 CDP 捕获
```
Uncaught (in promise) NotAllowedError: Failed to execute 'writeText' on 'Clipboard': Write permission denied.
```
**Round 2 已由 Engineer 修复并通过针对性回归**（见第 10 节 Minor-1 与新增第 14 节）：用 CDP 注入 3 种 `clipboard.writeText` stub，异步拒绝/成功/同步抛错三路径均 PASS，未处理异常归零。

## 8. V7 反向设计与合规

**命令**：`node tests/compliance.test.mjs` → `站点数=7 合规检查 PASS=147 FAIL=0`

- 7 站产物：零 `http(s)` 外链、零外部资源标签、零 `target=_blank`、零 form/input。
- 禁止词全清：github / ko-fi / patreon / donate / subscribe / signup / 赞助 / 打赏 / 购买 / 订阅 等均 0 命中。
- `purchase` 共 3 处（license 1、praise 2），**全部处于 "NO PURCHASE / No purchase" 否定式免责声明上下文**（如 `NO PURCHASE. NO STRINGS. JUST PERMISSION.` / `No purchase, just praise.`），非消费引导，已白名单核实。
- core 原始模板含 GitHub/Ko-fi 链接，但 7 站均使用 `override/template.html` 替换，产物已彻底移除。

**结论：PASS**。无注册/消费/导流引导，符合"无打扰、零外部资源"设计。

## 9. V8 类型与死代码

- `npm run typecheck`（`tsc --noEmit`, strict）：**0 错误**。
- `TODO/FIXME/XXX/HACK` 扫描：**0 命中**。
- `console.log`：仅存在于 `shared/build/*.mjs` 构建 CLI 输出（合理），站点/契约源码 0 命中。
- 占位符 `/*SCRIPT*/`、`/*RUNTIME*/`：7 站产物均 0 残留。
- **观察项（Minor，非阻塞）**：若干导出未被生产代码引用——`readFromLocation`、`eventLabel`（仅在测试用到）、`registerPartFactory`、`STILL_EVENTS`、`FUTURE_SITES`。属预留 API/自研预留位，不影响功能；建议后续版本评估保留或清理。

## 10. 问题清单（按严重度）

### Minor-1｜hug 分享按钮剪贴板失败未捕获（已修复并回归通过 ✅）
- **状态**：**RESOLVED**（Round 2）。Engineer 已修复，QA 已针对性回归验证通过。
- **位置**：`sites/hug/glue.ts` 的 `onShare`。
- **原问题（Round 1）**：仅注册 `.then()`，无 `.catch()`；权限被拒时产生未处理 Promise 拒绝（`Uncaught (in promise) NotAllowedError: ... Write permission denied.`），状态文案不更新。
- **修复内容**：`.then(...).catch(() => this.setStatus(url))` 处理异步拒绝，外层再加 `try/catch` 覆盖同步抛错，两条失败路径均 `setStatus(url)` 兜底。
- **回归证据**：`tests/regression-hug-share.mjs` 注入三种 stub —— A 异步拒绝 / B 成功 / C 同步抛错，均 **PASS**，未处理异常=0，埋点正常上报（详见第 14 节）。
- **残留影响**：无。修复后 hug 产物哈希更新为 `5ddaef56b722...`（可复现）。

### Minor-2｜未使用的导出/预留符号（观察项，可不修）
- `readFromLocation`、`eventLabel`、`registerPartFactory`、`STILL_EVENTS`、`FUTURE_SITES` 未见生产引用。属预留扩展位，建议后续评估。

### 环境限制（非缺陷）
- 无头 Edge 无 WebGPU adapter → core 渲染路径未能运行时验证；`l e` 为正确降级。需在具备 WebGPU 的真实 GPU 环境补测首屏渲染与主场景加载。

## 11. 智能路由判定

- **Engineer**：Minor-1（Round 1 发现 → 已修复 → Round 2 回归通过，现为 **RESOLVED**）。
- **QA 自行修复（已完成）**：`withFrom` 测试用例断言错误（Round 1）；V2a 基线复核命令路径格式错误（Round 1）；`regression-hug-share.mjs` 的 stubCheck 探测未捕获 rejected promise 污染异常计数（Round 2）——均为测试代码 Bug，已修正并复跑通过。
- **NoOne**：其余全部验证项（V1/V2a/V2b/V3/V4/V5/V6-glue/V7/V8）通过。

> 测试轮次：Round 1（写测试→运行→分析→自修测试 Bug→报 Minor-1 给 Engineer）→ Round 2（Engineer 修复后全量回归 + 针对性剪贴板回归，全部通过）。**2 轮硬上限内完成，无遗留失败**；唯一源码缺陷 Minor-1 已闭环。

## 12. 最终完整性核验（所有篡改后）

```bash
cd shared/core && sha256sum -c BASELINE.sha256     # 11/11 OK
cd .. && sha256sum -c tests/baseline-dist.sha256   # 7/7 OK
```
- core 7 个 js + template + 构建文件：与原始克隆仓 `_source_probe/abyssal-garden/source/` 逐字节一致，11/11 OK。
- 7 站产物：全部回到基线哈希；`still` 前缀 `a8a9882dc03c`。
- 篡改文件（math.js、praise/site.config.ts）均已恢复原状。

## 13. 总体结论

**站群核心机制经独立证伪验证成立**：底座哈希护栏、两级覆盖、配色锚点唯一性、站点隔离、插件协议、零外部资源与合规均通过，且负向路径按预期失败。**未发现 Critical/Major 级问题**。Round 1 发现的唯一 Minor 源码缺陷（hug 剪贴板未捕获拒绝）已由 Engineer 修复并经 Round 2 针对性回归验证闭环。剩余仅若干可选清理的未用导出（架构预留位，本批次保留不改）。core 渲染因环境无 WebGPU adapter 未能运行时验证（如实标注，非产品缺陷）。**总体结论：QA 验证通过，无阻塞项，建议发布；如有条件在真实 GPU 环境补一轮 core 渲染冒烟。**

## 14. Round 2 回归专项（Minor-1 修复验证）

**命令**：`node tests/regression-hug-share.mjs`（CDP 在文档加载前注入 `clipboard.writeText` stub，确定性触发三条路径）

| 场景 | stub | 点击 #share 后 status | 未处理异常 | 埋点队列 | 判定 |
| --- | --- | --- | --- | --- | --- |
| A 异步拒绝 | `Promise.reject(QA_FORCED_DENY)` | `/hug?from=eyJzaXRl…`（兜底展示链接） | 0 | 1→2 | **PASS** |
| B 成功 | `Promise.resolve()` | `Link copied. Send it to someone.` | 0 | 3→4 | **PASS** |
| C 同步抛错 | `throw QA_SYNC_THROW` | `/hug?from=eyJzaXRl…`（兜底展示链接） | 0 | 5→6 | **PASS** |

`PASS=3 FAIL=0`。修复前场景 A/B 类路径会抛出 `Uncaught (in promise) NotAllowedError`，修复后异常归零且状态文案正确降级。

**修复后全量回归**：typecheck 0 错误；core 11/11 OK；contracts 19/19、runtime 7/7、theme-injection 15/15、compliance 147/147 全通过；hug 产物连续两次构建哈希一致（`5ddaef56b722...`，可复现）；其余 6 站产物哈希未变。

> 备注：回归过程中 CDP 冒烟脚本曾因本机残留 63 个 QA 自启的 headless Edge 进程出现超时，清理残留进程后干净复跑即全绿——属测试环境进程泄漏，非产品问题。已在新脚本中使用独立 user-data-dir + 端口，并在 finally 中清理。
