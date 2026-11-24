# 架构体检表（只读取证）· 2026-11-24

- 对象：`emopulse_station_cluster`，HEAD = `1fce19c`（`feat: complete third-party audit and room feature split`）。审计期间 `git status` 除未跟踪的 `docs/review-2026-11-24/` 外始终干净，结束时 HEAD 未变。
- 角色：arch-audit（架构师 + QA）。只读：未改任何已跟踪文件，未执行 add/commit/push/stash/checkout/reset/pull，未碰 `shared/core/`（verify:core 前后均 11/11 一致）。
- 证据标注：**[实测]** = 本机跑出来的；**[推断]** = 读源码得出、未执行；**[不知道]** = 查不到。
- 日志：`docs/review-2026-11-24/arch/logs/<脚本名>.log`（每份首部有 cwd / HEAD / 命令 / 退出码 / 毫秒用时）。

### 执行位置说明（必读）

有两条腿**不能在真实工作区跑**，我改在隔离副本里跑：

1. `tests/stage-mutation.mjs` 会**原地改写已跟踪文件** `shared/stage/stage.ts` 共 6 次（`tests/stage-mutation.mjs:9,60,71,82`），与硬约束 1 冲突；另一 agent 正在同一目录施工，回写 `original` 可能覆盖其对 `stage.ts` 的并发修改。
2. `tests/verify-no-core-write.mjs:49` 会 spawn `node shared/build/build.mjs still`，即 **v1 构建，写 `dist/still.html`**，与硬约束 2 冲突。

隔离副本的做法：`git archive HEAD`（只读）解到 `C:\Users\Lenovo\AppData\Local\Temp\emo-audit-arch-1fce19c\`（排除与不排除 docs 各解一次，共 484 个文件 = 全部已跟踪文件），`node_modules` 用目录联接指向仓库的那份（只读使用）。副本内文件为 LF（= git blob 原样）。副本在收尾时已删除。真实仓库的 `shared/stage/stage.ts` 事后与 HEAD blob 逐字节比对一致 [实测]。

其余只读门（typecheck、stage-smoke、parts-composition、verify-core、verify:reuse 五个、verify-registry、nexus:full 另四个、verify:sites、verify:preview、part-clock）都在**真实工作区**跑的。

---

## 1. 跑门结果表

| # | 脚本 | 结果 | 用时 | 关键输出摘要 |
|---|---|---|---|---|
| 1 | `npx tsc --noEmit`（typecheck） | **绿** | 7.6 s | exit 0，无输出 |
| 2 | `verify:stage` → `tests/stage-smoke.mjs` | **绿** | 0.6 s | `stage-smoke: PASS 44/44` |
| 3 | `verify:stage` → `tests/stage-mutation.mjs`（**隔离副本**） | **绿** | 3.1 s | `CAUGHT M1…M6` 6/6，`mutation-probe: PASS` |
| 4 | `verify:stage` → `tests/parts-composition.mjs` | **绿** | 0.7 s | `field-in-stage: PASS 22/22` |
| 5 | `verify:core` | **绿** | 0.5 s | `防伪 pin 校验通过`；`Frozen Core 校验通过：11 个文件逐字节一致` |
| 6 | `verify:reuse` → `verify-parts-assembly.mjs` | **红** | 2.9 s | `❌ 7 项失败`：`ascii-kit/lib/kit.js bytes 声明 10772 ≠ 磁盘 10992`；micro-scenes 6 个 .html 各差 3–410 字节。**同脚本在 LF 副本：`✅ PASS：50 项断言`** |
| 7 | `verify:reuse` → `verify-provenance.mjs` | **红** | 4.2 s | `❌ FAIL：2 项失败（断言 90 项）`：门1 溯源完整性（ascii-kit）（micro-scenes），同样是 bytes 声明 ≠ 磁盘。**LF 副本：`✅ PASS：90 项断言`** |
| 8 | `verify:reuse` → `verify-reuse-wording.mjs` | **绿** | 1.1 s | `✅ PASS：12 项断言` |
| 9 | `verify:reuse` → `golden-run.mjs` | **绿** | 2.6 s | `通过率 100.0%（89/89）`；`✅ PASS：10 项断言` |
| 10 | `verify:reuse` → `mutation-probe.mjs` | **绿** | 2.5 s | `✅ PASS：9 项断言`；另有 2 条 ⏳：blow-input / dandelion 的 `ported[].params` 全空，死参数探针无可测面 |
| 11 | `verify:nexus` → `verify-registry.mjs` | **绿** | 1.0 s | `✅ PASS：199 项断言全通过`；`sites/ 扫描到 0 条新站 manifest` |
| 12 | `verify:nexus` → `verify-no-core-write.mjs`（**隔离副本**） | **绿** | 1.4 s | `✅ PASS：构建前后 shared/core 逐字节一致（12 个文件，零写入），Frozen Core 11/11 OK` |
| 13 | `verify:nexus:full` → `verify-composition.mjs` | **绿** | 0.9 s | `✅ PASS：36 项断言` |
| 14 | `verify:nexus:full` → `verify-degradation.mjs` | **绿** | 0.9 s | `✅ PASS：43 项断言`；自述「WebGPU 渲染本身未验证」 |
| 15 | `verify:nexus:full` → `verify-esm-parts.mjs` | **绿** | 1.0 s | `✅ PASS：16 项断言`；提示 `.reference/` 不在版本库，跳过与参考原件逐字节比对 |
| 16 | `verify:nexus:full` → `verify-analytics.mjs` | **绿** | 0.9 s | `✅ PASS：58 项断言` |
| 17 | `verify:sites`（`tests/site-build.mjs`） | **绿** | 2.5 s | `site-build: PASS 119/119`；4 站字节 license 48973 / hug 539528 / still 146288 / koi 607501 |
| 18 | `verify:preview`（`tests/preview-build.mjs`） | **绿** | 40.4 s | `preview-build: PASS 811/811` |
| 19 | `verify:clock`（`tests/part-clock.mjs`） | **红** | 1.1 s | `part-clock: FAIL 2/5`：`shared/parts/dandelion/index.ts:291` 与 `:337` 使用了 `performance.now()` |
| 20 | `verify:dom`（`tests/site-dom.mjs`） | **未跑** | — | import `./lib/browser.mjs`（`tests/site-dom.mjs:16`） |
| 21 | `verify:fingerprint`（`tests/site-fingerprint.mjs`） | **未跑** | — | import `./lib/browser.mjs`（`:14`） |
| 22 | `verify:license`（`license-ritual.mjs` + `license-stay.mjs`） | **未跑** | — | 两个脚本都 import `./lib/browser.mjs`（`:8` / `:12`） |
| 23 | `verify:input`（`tests/input-boundary.mjs`） | **未跑** | — | import `./lib/browser.mjs`（`:19`） |
| 24 | `verify:field`（`tests/field-visual.mjs`） | **未跑** | — | import `./lib/browser.mjs`（`:14`） |
| 25 | `verify:paper`（`tests/paper-visual.mjs`） | **未跑** | — | import `./lib/browser.mjs`（`:18`） |
| 26 | `bench:parts`（`tests/bench-parts-browser.mjs`） | **未跑** | — | import `./lib/browser.mjs`（`:15`） |
| 27 | `bench:gl`（`tests/bench-gl-composite.mjs`） | **未跑** | — | import `./lib/browser.mjs`（`:19`） |
| 28 | `bench:blend`（`tests/bench-blend.mjs`） | **未跑** | — | import `./lib/browser.mjs`（`:18`） |
| 29 | `shot`（`tests/lib/browser.mjs --shot …`） | **未跑** | — | 即 browser.mjs 本体 |

**总计（按 npm script / 命令计 19 条）：7 绿 / 2 红 / 10 未跑，其中 10 条因本机无 playwright 不可跑。**
（上表把复合脚本拆到每个 node 脚本一行，共 29 行。复合脚本口径：绿 = typecheck、verify:stage、verify:core、verify:nexus、verify:nexus:full、verify:sites、verify:preview；红 = verify:reuse、verify:clock；未跑 = verify:dom、verify:fingerprint、verify:license、verify:input、verify:field、verify:paper、bench:parts、bench:gl、bench:blend、shot。）

两条红的定性 [实测]：

- **verify:reuse 的红 = 本机工作区行尾是 CRLF，不是声明写错。** 7 个不符文件逐一核对：磁盘字节 = git blob 字节 + 文件内 CR 个数，差值与 CR 数完全相等（例：`ascii-kit/lib/kit.js` blob 10772 / CR 220 / 磁盘 10992；`雨夜便利店.html` blob 1377922 / CR 3 / 磁盘 1377925）。manifest 里声明的 bytes 与 blob 完全相等。同一份代码在 LF 副本里两个脚本都是绿的。`git ls-files --eol`：`i/lf w/crlf` 85 个、`i/lf w/mixed` 14 个、`i/lf w/lf` 313 个；`git config core.autocrlf` = false，`.gitattributes:14` 写的是 `* text=auto eol=lf`。
- **verify:clock 的红与行尾无关**（LF 副本同样 `FAIL 2/5`）：`shared/parts/dandelion/index.ts:291` `const started = … performance.now() …`，`:337` `const cost = performance.now() - started;`。同文件头注释第 14 行写的是「时钟只读 `frame.dt`，不读 `performance.now()`」。

未在真实工作区跑、但在副本里额外跑过的构建（全部 exit 0，输出见第 7 节）：`node shared/build/build.mjs all`（v1，7 站）、`node shared/sites/build.mjs`（4 站 + 索引）、`node shared/product/build-templates.mjs`（5 模板）、`node shared/product/studio.mjs`、18 个 preview 预设逐个构建。

---

## 2. 依赖 tests/lib/browser.mjs 的门

判定依据 [实测]：`grep -nE "browser\.mjs" -r tests shared tools` 的直接 import 命中，共 13 个脚本。

| npm script | 测试文件 | import 行 | 拿不到浏览器时的行为 |
|---|---|---|---|
| `verify:dom` | `tests/site-dom.mjs` | `:16` | 无 SKIP 分支 → 抛「找不到 playwright」[推断] |
| `verify:fingerprint` | `tests/site-fingerprint.mjs` | `:14` | 同上；且 `:219` 还读 `dist/preview/field-l0.html` |
| `verify:license` | `tests/license-ritual.mjs`、`tests/license-stay.mjs` | `:8`、`:12` | 同上 [推断] |
| `verify:input` | `tests/input-boundary.mjs` | `:19` | 同上 [推断] |
| `verify:field` | `tests/field-visual.mjs` | `:14` | **打印 SKIP 并以 0 退出**（`:10` 注释、`:177` `console.log('[field-visual] SKIP：本机起不了浏览器，画面未验证。')`）——即这条门在无 playwright 的机器上是「假绿」[推断，未执行] |
| `verify:paper` | `tests/paper-visual.mjs` | `:18` | 无 SKIP 分支 [推断] |
| `bench:parts` | `tests/bench-parts-browser.mjs` | `:15` | 无 SKIP 分支 [推断] |
| `bench:gl` | `tests/bench-gl-composite.mjs` | `:19` | 无 SKIP 分支 [推断] |
| `bench:blend` | `tests/bench-blend.mjs` | `:18` | 无 SKIP 分支 [推断] |
| `shot` | `tests/lib/browser.mjs`（本体） | `:257-318` | `--where` 即报「找不到 playwright」（主理人已实测） |
| （无 script） | `tests/tide-visual.mjs` | `:17` | 无 SKIP 分支；读 `dist/preview/tide-a.html` |
| （有 script `verify:site`，不在本次清单） | `tests/site-visual.mjs` | `:17` | **会写 dist**：`:22` `mkdirSync(path.join(REPO_ROOT, 'dist', 'qa'))`，`:224` 往 `dist/qa/` 写 png |

browser.mjs 自身的事实 [实测]：`tests/lib/browser.mjs:40-69` `resolvePlaywright()` 依次试 `PLAYWRIGHT_MODULE`、`playwright`、`NODE_PATH`、`~/.npm/_npx/*/node_modules/playwright`；`:76-113` `resolveChromium()` 认 `CHROMIUM_PATH` 环境变量，否则只扫 `~/Library/Caches/ms-playwright`（`:79`，macOS 路径），其下候选含 `chrome-win/chrome.exe`（`:89`）。本机无 playwright 包，也无该缓存目录。

与 playwright 无关、用无头 Edge + CDP 的另一套（见第 3 节）：`tests/runtime-smoke.mjs`、`tests/regression-hug-share.mjs`、`tests/probe-webgpu.mjs`，三者在 `:12`/`:13`/`:4` 写死 `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`。

---

## 3. 未被 npm script 引用的测试

判定方法 [实测]：对 `tests/` 下每个已跟踪文件（不含 fixtures/golden/lib）查 package.json 引用、其它测试引用、docs 引用；「本机能否跑」一列，除注明外都在**隔离副本**里实际执行过（副本内先用 v1 `build all` 生成了 `dist/*.html`）。

| 文件 | 被谁引用 | 运行器 | 本机能否跑 |
|---|---|---|---|
| `tests/compliance.test.mjs` | 无 npm script；docs 提及 3 处 | `node` 直接跑；读 `dist/*.html` | **能跑，绿**：`站点数=8 合规检查 PASS=168 FAIL=0`（0.3 s） |
| `tests/contracts.test.ts` | 无；文件头写「运行：npx tsx tests/contracts.test.ts」 | `tsx`（已装）+ `node:assert/strict` | **能跑，绿**：`PASS=19 FAIL=0`（2.4 s）；测的是 v1 `shared/contract/` |
| `tests/runtime.test.ts` | 无；同上 | `tsx` + assert | **能跑，绿**：`PASS=7 FAIL=0`（2.0 s）；测的是 v1 `shared/contract/runtime` |
| `tests/theme-injection.test.mjs` | 无；文件头写「node tests/theme-injection.test.mjs」 | `node` + assert；读 `dist/<id>.html` | **能跑，绿**：`PASS=15 FAIL=0`（0.5 s）；测的是 v1 `shared/build/inject-theme.mjs` |
| `tests/runtime-smoke.mjs` | 无；docs 提及 2 处 | `node` spawn 无头 Edge + CDP；读 `dist/{still,license,praise,hug}.html` | **能跑，绿**：`PASS=4 FAIL=0`，`CDP 运行时异常数: 0`（47.9 s）；但 3 站 `core渲染=未测（环境无 WebGPU adapter…）` |
| `tests/regression-hug-share.mjs` | 无；docs 提及 2 处 | 无头 Edge + CDP；读 `dist/hug.html` | **能跑，绿**：`PASS=3 FAIL=0`（37.5 s） |
| `tests/probe-webgpu.mjs` | 无；docs 提及 3 处 | 无头 Edge，试 3 组启动参数 | 未执行。源码写死 profile 路径 `C:/Users/Lenovo/AppData/Local/Temp/qa-wgpu-<port>`（`:15`）[实测] |
| `tests/site-isolation.sh` | 无；docs 提及 3 处 | bash | **不能跑**：`:10` 依赖 `tests/baseline-dist.sha256`，该文件不在仓库（`ls tests` 无此文件）；`:17`、`:23-24` 会 `sed -i` 改已跟踪的 `sites/praise/site.config.ts` 并重建 dist |
| `tests/tide-visual.mjs` | 无；docs 提及 1 处 | playwright（browser.mjs） | 不能跑（无 playwright） |
| `tests/runtime-smoke.log` | 无 | — | 是一份被跟踪的日志文件（541 B），与 `*.log` 忽略规则并存 |
| `tests/lib/probe-site.mjs` | 无任何文件 import；注释说「verify-append-only / verify-config-driven 共用」，这两个测试在仓库里不存在 | — | 死文件。它会在 `sites/<dirName>/` 下建临时站点并 `rmSync` `dist/<out>`（`:48-51,110-112`） |

小结 [实测]：9 个测试文件没有任何 npm script 指向它们；其中 6 个本机实际能跑且全绿（4 个纯 node/tsx，2 个走无头 Edge），1 个不能跑（site-isolation.sh，缺基线文件且会改源码），1 个因无 playwright 不能跑（tide-visual），1 个未执行（probe-webgpu，是探针不是断言）。仓库里没有 vitest / jest / pytest；两个 `.test.ts` 不是 node:test 格式，是自带 `test()` 计数器的 tsx 脚本，且不在 tsconfig include 内（见第 9 节）。

---

## 4. v1 遗留引用关系

判定方法 [实测]：对 89 个目标文件建全仓 import 图（314 个 .ts/.mjs/.js/.sh，652 条边，路径别名 `@contract/*`、`@content/*` 已解析），再叠加字面路径引用扫描。分类口径：A = 被 `shared/sites`、`shared/stage`、`shared/product`、`shared/parts` import；B = 新体系只在字符串里提到；C = 只被 v1 自己或 tests import；D = 只有字面引用；E = 无人引用。

| 目录 | 文件数 | A | B | C | D | E | 说明 |
|---|---|---|---|---|---|---|---|
| `shared/contract/` | 16 | 0 | 0 | 15 | 1 | 0 | import 者 = contract 内部、`sites/*`、`shared/parts-library/*/part.manifest.ts` 与 `*/index.ts`（都 import `contract/parts-registry`）、`shared/parts-library/registry/install.ts`、tests。`mount-site.ts` 无 import 者，仅 `tests/verify-degradation.mjs` 字面引用 |
| `shared/build/` | 8 | 0 | 0 | 6 | 2 | 0 | `build.mjs` 属 D：被 npm `build`/`build:all`/`build:readable`/`dev`/`build:nexus`、根 `build.mjs`、`tests/verify-no-core-write.mjs` 以脚本 / spawn 方式调；`verify-core.mjs` 属 D：npm `verify:core`、`build.mjs:26`、`verify-no-core-write.mjs:64`。其余 6 个只被 `shared/build` 自己 import（`registry.mjs`、`sites.config.mjs` 另被 `tests/verify-registry.mjs`，`inject-theme.mjs` 被 `tests/theme-injection.test.mjs`） |
| `sites/` | 56 | 0 | 5 | 31 | 0 | 20 | 无一是被新体系源码 `import` 的：4 个 attach / 入口是 `shared/sites/build.mjs` 按字符串路径取（`:40,103,119,132`），再在生成的入口代码里 import（`:469`）。B 类 5 个 = 这 4 个 + `sites/hug/parts/dandelion.ts`（只在新零件的注释里被提到）。见下 |
| `content/` | 5 | 0 | 0 | 5 | 0 | 0 | 5 个都只被 `sites/*` import；其中 `content/license.ts` 经 `sites/license/index.ts:10` 进入新 /license 的产物 |
| `shared/parts-library/registry/` | 3 | 0 | 0 | 1 | 0 | 2 | `index.ts` 只被 `install.ts` import（另有 `tests/lib/param-pool.mjs`、`tests/verify-registry.mjs` 字面提到它的路径）；`install.ts` 与 `README.md` 无人引用 |

新体系对 v1 的 import 关系**只有一条通路**：`shared/sites/build.mjs` 的 4 个 `attach` 入口。

- `shared/sites/build.mjs:40` `attach: 'sites/license/index.ts'`（字符串，`:469` 生成 import）→ `sites/license/{ritual,stay,fold,export}.ts` + `content/license.ts`
- `shared/sites/build.mjs:103/119/132` → `sites/hug/attach.ts`、`sites/still/attach.ts`、`sites/koi/attach.ts`（都只 `import type { SiteHandle } from '../../shared/sites/shell'`；hug 另 import `shared/sites/mic`）

新站点构建的传递闭包（不含零件）[实测]：`shared/sites/{build.mjs,copy.mjs,shell.ts,mic.ts,audio.ts}`、`shared/stage/{contract,index,stage,world}.ts`、`shared/stage/preview/{build.mjs,host.ts}`、`sites/license/{index,ritual,stay,fold,export}.ts`、`sites/{hug,still,koi}/attach.ts`、`content/license.ts`。**闭包里没有 `shared/contract`、`shared/build`、`shared/parts-library/registry`。**

`sites/` 的 56 个文件细分 [实测]：

- 进新产物闭包的 9 个（与下面两类有重叠）：`sites/license/{index,ritual,stay,fold,export}.ts` 与 `sites/{hug,still,koi}/attach.ts`。其中 license 的 5 个同时仍是 v1 `sites/license` 的源码；3 个 `attach.ts` 不是任何 v1 站的源码（v1 注册表取的是各站的 `bridge.ts`）。
- 只被 v1 自己或 tests import（31）：7 个 `site.config.ts`、8 个 `state.ts`、5 个 `glue.ts`、`sites/koi/shared/{config,koi}.ts`、`sites/license/{ritual,stay,fold,export}.ts`（这 4 个同时在新体系闭包里）、`sites/license/parts/index.ts`、`sites/praise/export.ts` 与 `sites/praise/parts/index.ts`、`sites/hug/parts/{blow-input,index}.ts`。
- 无人 import 的 20 个：7 站各自的 `bridge.ts`（v1 注册表以字符串 `bridge: 'bridge.ts'` 取，`shared/build/registry.mjs:46-75`；`shared/build/build.mjs:54` 按该路径读）、7 个 `override/template.html`（`shared/build/build.mjs:129-130` 按字符串路径读）、6 个 `index.ts`（hug、praise、still 与 koi 的 ink / pond / watercolor；仓库里**查不到**谁用它们——无 import、无字符串路径引用，license 的 `index.ts` 不在此列）[实测]。
- `shared/parts/dandelion/index.ts:3` 与 `shared/parts/koi-pond/index.ts:16` 的注释提到 `sites/hug/parts/dandelion.ts`、`sites/koi/attach.ts`（仅注释）。

### /praise 结论

- 新体系里**没有** /praise：`shared/sites/build.mjs:33-141` 的 `STATIONS` 只有 `license`、`hug`、`still`、`koi` 四个键；`shared/stage/preview/build.mjs` 的 18 个预设里也没有 [实测]。
- v1 里**能构建**：`shared/build/registry.mjs:55-56` 把 praise 登记为 legacy 站；隔离副本执行 `node shared/build/build.mjs all` 输出 `[build] praise: …/dist/praise.html 109.4 kB`、`override=[none] route=/praise`，exit 0 [实测]。即 `npm run build:all` / `build:nexus` / `node build.mjs praise` 都会产出 `dist/praise.html`。
- `sites/praise/` 11 个文件 [实测]：v1 构建在用；测试侧只有 `tests/site-isolation.sh:7`（改它的配色）与 `tests/verify-provenance.mjs`（字面引用）提到；无任何新体系引用。
- 文档口径：`QUARANTINE.md:6`「`/praise` … 冻结的 legacy 站——旧架构冻结存量、399 行代码完整但未启用、无构建产物；不接入」；`README.md:53` 把它列在「v1 站点」里。「无构建产物」与「v1 `build all` 会产出它」是两件同时成立的事。
- 真实 `dist/` 里当前没有 `praise.html`，但有 `dist/still.html`（107,773 B，mtime 11-18 17:20）——v1 `build` 的默认目标就是 still（`package.json:8`）。

---

## 5. 构建流水线

### 依赖图（→ = import 或 spawn；[npm: …] = 哪些 script 会调它）

```
根 build.mjs ──spawn──▶ shared/build/build.mjs（v1）        [npm: build / build:all / build:readable / dev / build:nexus]
                           ├─ spawn shared/build/verify-core.mjs   ◀── 亦被 npm verify:core、tests/verify-no-core-write.mjs:64 调
                           ├─ shared/build/sites.config.mjs ─▶ registry.mjs ─▶ validate-manifest.mjs
                           │      └─ LEGACY_SITES 7 站（registry.mjs:46-75）+ sites/**/site.manifest.ts 扫描
                           ├─ shared/build/resolve-overlay.mjs · inject-theme.mjs · inline.mjs
                           ├─ 输入：shared/core/src/*.js（6 个拼接）+ shared/core/template.html + sites/<id>/{site.config.ts,bridge.ts,override/}
                           └─ 输出：dist/<id>.html（hug, koi-ink, koi-pond, koi-watercolor, license, praise, still）

shared/stage/preview/build.mjs（预览）                      [npm: preview / preview:<preset>]
                           ├─ PART_ENTRY（17 条，:46-63）· PRESETS（18 个，:67-）
                           ├─ esbuild ×2：loadPartDefs（:417，data URL import 取零件定义）· buildPreview（:541，stdin→IIFE）
                           └─ 输出：dist/preview/<preset>.html

shared/sites/build.mjs（站点）                              [npm: build:sites]
                           ├─ import { loadPartDefs }（:17）+ await import { PART_ENTRY }（:560）  ← 都来自 preview/build.mjs
                           ├─ import { COPY, UI } from './copy.mjs'（:18）
                           ├─ 生成的入口再 import：shared/sites/shell.ts、各零件入口、4 个 attach
                           ├─ 自带 TEMPLATE（:340-392）· STYLE（:149-339）· GL_CANVAS（:393）· buildSite（esbuild :473）
                           └─ 输出：dist/<slug>/index.html ×4 + dist/index.html

shared/product/build-templates.mjs（模板）                  [npm: build:templates]
                           ├─ import { buildPreview, resolvePreset } from '../stage/preview/build.mjs'（:19）
                           ├─ import { TEMPLATES } from './templates.mjs'（:20；deepsea / nebula / temple / gate / koi）
                           ├─ gzipSync(level 9) 算 gzip 字节写进 manifest（:94）
                           └─ 输出：dist/templates/<id>/index.html ×5 + dist/templates/manifest.json

shared/product/studio.mjs                                   [npm: build:studio]
                           ├─ 读 dist/templates/manifest.json
                           └─ 输出：dist/studio/index.html（12,419 B）

tests/lib/load-ts.mjs（测试专用第四套 esbuild 封装：loadTsModule / loadTsSource / bundleIife，全部 write:false）
tools/parts/atlas.mjs → docs/PART-ATLAS.csv / .md（写 docs）
```

### 共用与重复点 [实测]

- **共用**：站点构建与模板构建都复用 preview/build.mjs 的 `PART_ENTRY`、`loadPartDefs`、`buildPreview`/`resolvePreset`——零件登记表只有一份（`shared/sites/build.mjs:546-560` 注释明说是为「避免两张表漂移」）。v1 流水线与其余四条**零共用**。
- **HTML 内联壳有两套**：`shared/sites/build.mjs` 的 `STYLE`（191 行 / 15,998 B）+ `TEMPLATE`（53 行）与 `shared/stage/preview/build.mjs` 的 `STYLE`（19 行 / 1,200 B）+ `TEMPLATE`（31 行）各写一份；`GL_CANVAS` 同一字符串在两处各定义一次（`sites/build.mjs:393`、`preview/build.mjs:329`）。模板构建与 Studio 没有自己的壳，套的是 preview 的壳。
- **「浏览器侧 IIFE 打包」配置有两份近乎相同**：`shared/sites/build.mjs:473-483` 与 `shared/stage/preview/build.mjs:541-556`，选项逐项相同（bundle / write:false / platform:browser / format:iife / target:es2022 / minify / legalComments:none / logLevel:silent），diff 只有 stdin 的变量名和 `sourcefile`。紧随其后的「`</script` 截断守卫」与 meta 注释也各写一份（`sites/build.mjs:485-496`、`preview/build.mjs:561-573`）。
- **路径安全说明符函数有 3 份**：`toSpecifier`（`shared/sites/build.mjs:401`、`shared/stage/preview/build.mjs:363`）、`toImportSpecifier`（`tests/lib/load-ts.mjs:77`），做的事相同（反斜杠转正斜杠 + JSON.stringify）。
- **「esbuild 打成 ESM 再 data URL import」有 4 处**：`shared/build/build.mjs:37-47`、`shared/build/registry.mjs:120`、`shared/stage/preview/build.mjs:417-434`、`tests/lib/load-ts.mjs:16-42`。
- **gzip 体积计算只有一处**：`shared/product/build-templates.mjs:94`（`gzipSync(…, { level: 9 })`）。站点构建（`shared/sites/build.mjs`）与预览构建都不算 gzip；`kb` 字段的契约语义是「gzip 后体积」，但没有任何构建脚本读它（见第 7 节）。
- **产物断言各写各的**：v1 在 `shared/build/build.mjs:78-102`（`assertArtifact`：占位符清零 / 零外链 / 5 常量注入 / canvas）；新体系把断言放在测试里（`tests/site-build.mjs`、`tests/preview-build.mjs`），构建脚本本身除了 `</script` 守卫没有产物断言。
- 根 `build.mjs` 不解析参数，原样转发：`node build.mjs --help` 会直接构建 still（隔离副本里实测，输出 `[build] 完成：still`）。
- v1 与新体系的产物在 `dist/` 里**同目录混放**：v1 写 `dist/<id>.html`（扁平），新体系写 `dist/<slug>/index.html`，真实 dist 里 `dist/still.html`（v1）与 `dist/still/index.html`（新）并存。

---

## 6. parts 与 parts-library 对照

| 新零件 | 对库目录的关系 | 事实 | 证据 |
|---|---|---|---|
| `shared/parts/dandelion/`（418 行） | **直接 import** 算法核 + **另有一份 Canvas2D 渲染层副本** | `index.ts:38` `from '../../../shared/parts-library/dandelion/core/meadow'`（算法只有一份：`core/meadow.ts` 551 行）。渲染层存在两份：v1 `sites/hug/parts/dandelion.ts`（403 行）与新 `shared/parts/dandelion/index.ts`（418 行）。两份都 import 同一个 `meadow.ts`。逐函数 diff：`buildMidTier` / `buildLowTier` / `buildRichTier` 三函数逐字相同；常量块 `PAPPUS_REACH`…`PAPPUS_COLOR`（v1 `:104-122`，新 `:92-102`）逐字相同；`drawStems`+`plotSeed`+`pickTier` 只差参数改名和 v1 多一个 `* ratio()`；`buildCache` 两份有 49 行不同（v1 39 行、新 34 行）。整文件 diff：约 208 行相同。差异点：v1 `buildSeedField()` 用默认 `Math.random`（`:136`），新用 `mulberry32(env.seed)`（`:121-123`）；新零件头注释「与 v1 的三处不同」在 `index.ts:10-15` | [实测] |
| `shared/parts/koi-pond/`（5 文件，40,436 B） | **直接 import**，未复制 | `index.ts:21-29` import `parts-library/koi/{glsl,pond,surface,paint,ink,audio}.js`；`modules/fish-school.ts:1-2` import `koi.js`、`paint.js`；`modules/surface-ecology.ts:1` import `surface.js`。合计用到库目录 28 个文件中的 7 个 .js。库目录其余：`main.js`（30,364 B，新零件不 import）、`cdp.js`/`smoke.js`（工具）、`index.html`/`sw.js`/`manifest.webmanifest`/图标（PWA 壳）、8 张截图 png（合计约 11.7 MB）、`README.md`/`BLOG.md`、`part.manifest.ts`/`index.ts`（v1 库壳）。`index.ts:4` 注释写「26 个上游文件」，磁盘上目录有 28 个文件 | [实测] |
| `shared/parts/temple/`（443 行） | **直接 import** `shared/realism/` | `index.ts:14-15` `from '../../realism/scene'`、`'../../realism/plans'`。`shared/realism/` 14 文件 3,217 行，其中 `assets.ts` 5,021,017 B（15 个 base64 贴图：12 JPEG + 3 PNG），由 `realism/materials.ts:3` 与 `realism/modules/atmosphere.ts:4` import。realism 目录只有 temple 一个使用者 | [实测] |
| `shared/parts/voxel-world/` | **生成式副本**：从 `shared/core/src/` 抄出 `engine.js` | `index.ts:18` `import { createVoxelEngine } from './engine.js'`。`build-engine.mjs:19` `FILES = ['quality.js','math.js','shaders.js','world.js','main.js','audio.js']`，`:25` 起 `PATCHES` 表共 **20** 条，`:227` 写出 `engine.js`。隔离副本里重跑生成器后与已跟踪的 `engine.js` 逐字节相同 [实测]。`engine.js` 152,202 B / 2,324 行；core 六个源文件合计 147,093 B。`index.ts:4` 注释写「19 条具名补丁」，实际 `PATCHES.length` = 20 | [实测] |
| （无对应新零件） | — | `shared/parts-library/blow-input/`（4 文件 534 行）：只被 `sites/hug/parts/blow-input.ts`（v1）经字面路径关联，新体系无 blow-input 零件 | [实测] |
| （库目录，D0） | — | `rain-webgpu`、`grand-atelier`、`room-at-dawn` 的源码有**悬空 import**：`rain-webgpu/engine.ts:20-37` 的 18 条、`post.ts:41-45` 的 5 条、`grand-atelier/piano-model.ts:4-8` 的 4 条、`room-at-dawn/main.js:1-133` 的 9 条，指向仓库里不存在的文件。`rain-webgpu` 还 import `three/tsl`、`three/webgpu`；`room-at-dawn/upstream/src/bake/worker.js` import `three-mesh-bvh`（不在 package.json） | [实测] |
| （库目录 vs 预览） | **两份逐字节相同的上游副本** | `shared/stage/preview/dawn-desk/upstream/{core,scene}/*.js` 12 个文件（约 410 KB）与 `shared/parts-library/room-at-dawn/upstream/src/{core,scene}/*.js` 对应 12 个文件 `cmp` 全部相同；后者另有 13 个文件前者没有。前者**没有任何代码 import**（`dawn-desk/index.ts:8-12` 只 import three、contract、`./studio`；`studio.ts:12-16` 只 import three、`./window-photo`、`./leaf-atlas`）。其 `UPSTREAM.md` 自述「preview-only subset」「must not be imported by shared/parts, shared/sites, or any production build」 | [实测] |

规模对照 [实测]：`shared/parts/` 16 个目录，`.ts` 共 7,176 行（另有 `engine.js` 2,324 行、bench/build-engine 脚本）；`shared/parts-library/` 11 个目录 + 3 个顶层文件，代码约 19,700 行、约 21.1 MB（其中 8.5 MB 是 micro-scenes 的 6 个上游 .html、11.5 MB 是 koi 目录）。

---

## 7. 申报值 vs 实际值

### 7.1 零件自报值

契约原文 [实测]：`shared/stage/contract.ts:214-216`「实测单帧开销（毫秒）。**必须实测**，不接受估计值」；`:218`「gzip 后体积（KB），用于站点体积门」。`docs/DECISIONS.md:66` ADR-05 标题：「`costMs` 是**申报预算**，不是实测」。两处口径相反。

「单零件 gzip」列是我自己用 esbuild 把每个零件入口单独打包（browser / esm / minify）后 `gzipSync` 量的，仓库里没有这个数 [实测]。`three` 外置列是把 `three` 标为 external 后的同一度量。

| 零件 | 申报 `kb` | 申报 `costMs` | `costMs` 来源（代码注释原文） | 运行时源码字节（不含 bench） | gzip B（含 three） | gzip B（three 外置） |
|---|---|---|---|---|---|---|
| field-ground | 7 | 3.5 | `:539-540`「**不是浏览器实测，别当实测用** … 估算的**主画布填充成本**」 | 22,060 | 2,729 | 2,729 |
| voxel-world | 0 | 9 | `:120-123`「旧值 0.05ms 是**假数** … 实测 1280×800@dpr2 在 M2 上 22.7fps（≈44ms/帧）… 现在按实测填 9ms」 | 163,573（含 `engine.js` 152,202） | 40,414 | 40,414 |
| paper-ink | 2 | 1.3 | `:527`「**估算**」；`:528`「真浏览器 JS 侧实测 0.00 ms（填充不进 JS 计时）」 | 21,213 | 2,553 | 2,553 |
| pixel-post | 2 | 表达式（`:151` `allNeutral ? 0.01 : overlayMs * …`） | `:136-138`「所以这是**估算**」 | 13,786 | 1,700 | 1,700 |
| ascii-field | 3 | 表达式（按 `variant`，`:167-173`） | `:167`「**估算，不是实测**；常数与 field-ground 同源」 | 21,183 | 2,202 | 2,202 |
| bubbles | 2 | 0.27 | `:169`「**真浏览器实测**（`tests/bench-blend.mjs`，Metal，1280×720@dpr2）」 | 7,360 | 955 | 955 |
| tide-medium | 3 | 1.8 | `:413-414`「**估算，未实测** —— 骨架版不配 bench」 | 18,650 | 2,063 | 2,063 |
| koi-pond | 52 | 8.5 | `:842`「取 real 路径 … 的申报值」 | 40,436 | 153,342 | 33,605 |
| dandelion | 4 | 2.2 | `:403-404`「实测在 M2 上约 1.6–2.6ms，取 2.2ms」 | 14,740 | 4,169 | 4,169 |
| boids | 2 | 0.7 | `:232`「实测约 0.6ms」 | 7,563 | 1,735 | 1,735 |
| sun | 1 | 0.3 | `:85`「实测约 0.25ms」 | 3,335 | 835 | 835 |
| still-sink | 1 | 0.6 | `:63`「实测约 0.6ms」 | 2,596 | 588 | 588 |
| hug-meadow | 16 | 4 | `:520-521` 无来源注释 | 19,377 | 129,325 | 4,136 |
| nebula | 4 | 2.4 | `:47-48` 无来源注释 | 21,905 | 125,680 | 4,204 |
| abyss | 3 | 2.1 | `:51-52` 无来源注释 | 16,020 | 2,708 | 2,708 |
| temple | 18 | 7.5 | `:430-431` 无来源注释 | 15,845（另依赖 realism 3,217 行 / 5.13 MB） | 3,450,312 | 3,314,720 |

读法 [实测]：

- `kb` **没有任何消费者**：`grep -rnE "\.kb\b"` 在 `shared/stage`、`shared/sites`、`shared/product`、`tools` 里只命中 `shared/stage/preview/dawn-desk/index.ts:1321`（它自己写自己的 `kb: DECLARED_KB`）；tests 里只有 `stage-smoke.mjs:95`、`parts-composition.mjs:176` 的假零件 `kb: 1`。契约注释说的「站点体积门」在仓库里不存在。
- `costMs` 的 16 个零件里：注释自称实测的 6 个（voxel-world、bubbles、dandelion、boids、sun、still-sink），注释明说估算的 5 个（field-ground、paper-ink、pixel-post、ascii-field、tide-medium），无来源注释的 4 个（hug-meadow、nebula、abyss、temple），只说「申报值」的 1 个（koi-pond）。
- `voxel-world` 申报 `kb: 0`，实测单零件 gzip 40 KB；`temple` 申报 18 KB，实测 3.3–3.45 MB（差值即 `shared/realism/assets.ts` 的 base64 贴图）。
- 7 个零件带 `bench.mjs`（ascii-field、bubbles、field-ground、paper-ink、pixel-post、tide-medium、voxel-world）；13 个零件有 `README.md`（abyss、nebula、temple 没有）。`README.md:20` 写的是每个零件「自带 README.md 与 bench.mjs」。

### 7.2 dist 产物体积（真实 `dist/`，只读）

稳定性 [实测]：11:13:19 与 11:49:27 两次列目录（大小 + mtime + 路径，41 个文件）完全相同，取稳定值。字节与隔离副本在 HEAD 上的全新构建逐项相同（站点 4 个、索引、18 个预设、5 个模板、studio）。gzip = `gzip -9 -c | wc -c`。

| 产物 | 原始字节 | gzip 字节 | 内联 three | 内联 realism 贴图 | 备注 |
|---|---|---|---|---|---|
| `dist/license/index.html` | 48,973 | 17,200 | 否 | 否 | parts: paper-ink, pixel-post |
| `dist/hug/index.html` | 539,528 | 139,836 | 是 | 否 | parts: hug-meadow |
| `dist/still/index.html` | 146,288 | 54,730 | 否 | 否 | parts: tide-medium, voxel-world, bubbles, still-sink, pixel-post |
| `dist/koi/index.html` | 607,501 | 165,714 | 是 | 否 | parts: paper-ink, koi-pond |
| `dist/index.html` | 9,418 | 2,878 | 否 | 否 | 站点索引页 |
| `dist/studio/index.html` | 12,419 | 4,520 | 否 | 否 | |
| `dist/templates/deepsea/index.html` | 29,480 | 11,578 | 否 | 否 | |
| `dist/templates/nebula/index.html` | 520,388 | 135,269 | 是 | 否 | |
| `dist/templates/koi/index.html` | 591,332 | 161,248 | 是 | 否 | |
| `dist/templates/temple/index.html` | 4,992,587 | 3,473,188 | 是 | 是 | |
| `dist/templates/gate/index.html` | 4,992,577 | 3,473,186 | 是 | 是 | |
| `dist/preview/empty.html` | 18,105 | 7,286 | 否 | 否 | |
| `dist/preview/field.html` | 26,670 | 10,614 | 否 | 否 | |
| `dist/preview/field-l0.html` | 23,702 | 9,592 | 否 | 否 | |
| `dist/preview/hug.html` | 524,094 | 135,178 | 是 | 否 | |
| `dist/preview/still.html` | 133,404 | 51,121 | 否 | 否 | |
| `dist/preview/tide-a.html` / `tide-b` / `tide-c` | 22,346 / 22,328 / 22,364 | 8,985 / 8,970 / 9,014 | 否 | 否 | |
| `dist/preview/bubbles-probe.html` | 23,657 | 9,400 | 否 | 否 | |
| `dist/preview/koi.html` | 591,332 | 161,246 | 是 | 否 | |
| `dist/preview/koi-nolimit.html` | 591,397 | 161,344 | 是 | 否 | |
| `dist/preview/room.html` | 26,837 | 10,462 | 否 | 否 | |
| `dist/preview/ink.html` | 26,880 | 10,502 | 否 | 否 | |
| `dist/preview/dawn-desk.html` | 1,778,955 | 937,787 | 是 | 否 | 内联 1 JPEG + 1 PNG data URI |
| `dist/preview/a2-deepsea.html` | 29,480 | 11,583 | 否 | 否 | |
| `dist/preview/a2-nebula.html` | 520,388 | 135,273 | 是 | 否 | |
| `dist/preview/a2-temple.html` | 4,992,587 | 3,473,192 | 是 | 是 | |
| `dist/preview/a2-gate.html` | 4,992,577 | 3,473,188 | 是 | 是 | |
| `dist/preview/a2-koi.html` | 591,332 | 161,249 | 是 | 否 | mtime 11-24 09:07；预设表里**没有** `a2-koi` 这个名字，是遗留文件 |
| `dist/still.html` | 107,773 | 43,015 | 否 | 否 | v1 产物，mtime 11-18 17:20 |

判定列的依据 [实测]：three = 在 `node_modules/three@0.169.0/build/three.module.js` 出现 22 次的字符串 `THREE.WebGLRenderer:` 在产物里的命中数（命中的产物都是 22）；realism 贴图 = 取 `assets.ts` 里 `ROOF_JPG`、`PINE_CUT_PNG`、`SKY2_JPG` 的 base64 前 80 字符做 needle。temple/gate 四个产物里 data URI 计数为 9 JPEG + 3 PNG = 12，源文件是 12 JPEG + 3 PNG = 15，即有 3 张 JPEG 未进产物。

`dist/` 里另有 10 个非 HTML 文件（8 张截图 / 预览图 png、1 张 `preview-photo.jpg`、`templates/manifest.json`），合计约 8.96 MB；`dist/` 总计约 35 MB。

---

## 8. 大文件与复杂度热点

### 8.1 最大的代码 / 文本文件（前 25，按 git blob 字节；不含 node_modules、_third_party、docs、.git，不含图片）

| # | 字节 | 行 | 文件 |
|---|---|---|---|
| 1 | 5,021,017 | 33 | `shared/realism/assets.ts` |
| 2 | 438,004 | 2 | `shared/stage/preview/dawn-desk/leaf-atlas.ts` |
| 3 | 432,878 | 3 | `shared/stage/preview/dawn-desk/window-photo.ts` |
| 4 | 154,931 | 4,180 | `shared/stage/preview/dawn-desk/studio.ts` |
| 5 | 152,202 | 2,324 | `shared/parts/voxel-world/engine.js` |
| 6 | 125,899 | 1,660 | `shared/stage/preview/dawn-desk/upstream/scene/parts/desk.js` |
| 7 | 125,899 | 1,660 | `shared/parts-library/room-at-dawn/upstream/src/scene/parts/desk.js` |
| 8 | 104,163 | 1,462 | `shared/stage/preview/dawn-desk/upstream/scene/parts/fixtures.js` |
| 9 | 104,163 | 1,462 | `shared/parts-library/room-at-dawn/upstream/src/scene/parts/fixtures.js` |
| 10 | 89,676 | 1,141 | `shared/parts-library/room-at-dawn/upstream/src/scene/parts/bed.js` |
| 11 | 86,897 | 707 | `shared/parts-library/crimson-loong/60_dragon.js` |
| 12 | 68,227 | 1,315 | `tests/verify-provenance.mjs` |
| 13 | 64,031 | 912 | `shared/stage/preview/dawn-desk/upstream/scene/parts/exterior.js` |
| 14 | 64,031 | 912 | `shared/parts-library/room-at-dawn/upstream/src/scene/parts/exterior.js` |
| 15 | 63,112 | 845 | `shared/parts-library/room-at-dawn/upstream/src/scene/parts/decor.js` |
| 16 | 58,207 | 845 | `shared/parts-library/room-at-dawn/upstream/src/scene/parts/clutter.js` |
| 17 | 50,544 | 1,326 | `shared/stage/preview/dawn-desk/index.ts` |
| 18 | 46,049 | 643 | `shared/core/src/main.js` |
| 19 | 43,579 | 782 | `shared/core/src/shaders.js` |
| 20 | 42,331 | 1,014 | `shared/parts-library/grand-atelier/piano-model.ts` |
| 21 | 41,049 | 557 | `shared/core/src/world.js` |
| 22 | 40,352 | 624 | `shared/stage/preview/dawn-desk/upstream/scene/parts/plants.js` |
| 23 | 40,352 | 624 | `shared/parts-library/room-at-dawn/upstream/src/scene/parts/plants.js` |
| 24 | 35,426 | 630 | `shared/sites/build.mjs` |
| 25 | 34,282 | 867 | `shared/parts/koi-pond/index.ts` |

第 26、27 位：`shared/stage/stage.ts` 33,387 B / 902 行、`package-lock.json` 32,651 B。

同口径下最大的二进制资产 [实测]：`shared/stage/preview/dawn-desk/assets/window-dawn.jpg` 3,517,418 B；`shared/parts-library/koi/` 8 张 png 合计约 11.7 MB；`shared/parts-library/micro-scenes/` 6 个 .html 合计 8.5 MB（每个 5.5–5.6 万行）。

### 8.2 base64 与 three.js 进了哪些产物

- `shared/realism/assets.ts`（15 个贴图）→ 只有 `shared/parts/temple` 用 → 进 4 个产物：`dist/templates/{temple,gate}/index.html`、`dist/preview/a2-{temple,gate}.html`，各内联 12 个 data URI，单文件约 4.99 MB、gzip 约 3.47 MB [实测]。
- dawn-desk 的 `leaf-atlas.ts` + `window-photo.ts`（合计约 871 KB，各是一个 base64 data URL）→ 进 `dist/preview/dawn-desk.html`（1.78 MB，内联 1 JPEG + 1 PNG data URI）[实测]。同目录的 `assets/window-dawn.jpg`（3,517,418 B）小于产物总字节与两个 data URL 之和的差额，**未内联进产物**（产物 JPEG / PNG data URI 各只有 1 个）[实测]。
- three.js（`three@0.169.0`）被内联进 14 个产物 [实测]：`dist/hug/index.html`、`dist/koi/index.html`、`dist/templates/{koi,nebula,temple,gate}/index.html`、`dist/preview/{hug,koi,koi-nolimit,dawn-desk,a2-nebula,a2-temple,a2-gate,a2-koi}.html`。**没有**内联 three 的 17 个：`license`、`still` 两站、`templates/deepsea`、studio、索引页、v1 的 `dist/still.html`，以及 `dist/preview/` 里其余 11 个（a2-deepsea、bubbles-probe、empty、field、field-l0、ink、room、still、tide-a/b/c）。
- 用 three 的源码文件 [实测]：`shared/parts/{hug-meadow,koi-pond}/index.ts`、`koi-pond/modules/camera-rig.ts`、`shared/parts/nebula/` 的 9 个文件、`shared/parts/temple/index.ts`、`shared/parts/world-feature.ts`、`shared/realism/` 12 个文件、`shared/stage/preview/dawn-desk/{index,studio}.ts`。 voxel-world 不用 three（走 `engine.js` + WebGPU）。

### 8.3 三个大文件的结构（只描述）

| 文件 | 字节 / 行 | 顶层函数（有块体） | 最长函数 | 结构 |
|---|---|---|---|---|
| `shared/stage/stage.ts` | 33,387 / 902 | 4 | `createStage` L240–L902，**663 行**（占全文 73%） | 顶层：`validateParts`（L138，44 行）、`sortParts`（L189，9 行）、`detectCapabilities`（L212，21 行）、`createStage`（L240）。`createStage` 内部嵌套函数：`totalCost`（L387）、`replan`（L398–L592，约 195 行）、`applyResize`（L594–L649）、`notifyResize`（L650–L683）、`compositeGl`（L684–L709）、`renderFrame`（L710–L813）、`loop`（L814–），其后是返回的 API 对象。状态是 L243–L386 的约 30 个闭包变量（`degraded`、`mounted`、`frame`、`fps`、`slowFrames`、`stats` 等），被上述全部嵌套函数共享 |
| `shared/sites/build.mjs` | 35,426 / 630 | 6 | `buildSite` L414–L543，130 行 | 前半是数据：`STATIONS`（L33–L141）、`STYLE`（L149–L339）、`TEMPLATE`（L340–L392）、`GL_CANVAS`（L393）。后半：`escapeHtml`（7 行）、`toSpecifier`（3 行）、`buildSite`（130 行：生成 import 清单 → esbuild → 模板占位符替换 → 可选写盘）、`stationEntry`（7 行）、`buildAllSites`（25 行）、`main`（26 行） |
| `shared/stage/preview/build.mjs` | 32,524 / 701 | 6 | `buildPreview` L508–L603，96 行；其次 `main` L640–L693，54 行 | 前半是数据：`PART_ENTRY`（L46–L63）、`PRESETS`（L67–约 L300）、`STYLE`（L310–L328）、`GL_CANVAS`、`TEMPLATE`（L332–L362）。后半：`toSpecifier`（3 行）、`resolvePreset`（19 行）、`loadPartDefs`（L407–L455，49 行）、`bootSource`（L464–L492，29 行）、`buildPreview`（96 行）、`FLAGS`/`USAGE` 常量、`main`（54 行） |

---

## 9. 类型检查覆盖面

`tsconfig.json`（`:25-39`）include：`shared/contract/**/*.ts`、`shared/stage/**/*.ts`、`shared/parts/**/*.ts`、`shared/realism/**/*.ts`、`shared/parts-library/registry/**/*.ts`、`shared/parts-library/*/part.manifest.ts`、`shared/parts-library/*/index.ts`、`shared/parts-library/*/features.ts`、`shared/parts-library/part-errors.ts`、`shared/parts-library/legacy-provenance.ts`、`sites/**/*.ts`、`content/**/*.ts`、`tests/fixtures/**/*.ts`。exclude：`node_modules`、`dist`、`shared/core`。`allowJs: true`、`checkJs: false`（`:22-23`）。

实际程序内容 [实测，`npx tsc --noEmit --listFilesOnly`]：共 512 个文件，其中仓库内 200 个、node_modules 312 个。

| 目录 | 是否在 include | 程序里实际有的文件 | 说明 |
|---|---|---|---|
| `shared/contract/` | 是 | 16 / 16 | v1 协议层全部被类型检查 |
| `shared/stage/` | 是 | 9 | `contract/index/stage/world.ts`、`preview/{build.mjs,host.ts}`、`preview/dawn-desk/{index,studio}.ts` 等 |
| `shared/parts/` | 是 | 41 | 含 `voxel-world/engine.js`——因 `allowJs: true` 且被 `index.ts:18` import 而进程序，但 `checkJs: false`，不做类型检查；`.mjs` 的 bench 不在程序里 |
| `shared/realism/` | 是 | 14 / 14 | 含 5 MB 的 `assets.ts` |
| `shared/parts-library/` | 部分 | 50 | 进了程序的：room-at-dawn 18、koi 9、ascii-kit / blow-input / dandelion 各 3、crimson-loong / grand-atelier / micro-scenes / rain-webgpu / sylva / registry 各 2、`legacy-provenance.ts`、`part-errors.ts`。**未进程序的 7 个 .ts**：`rain-webgpu/` 4 个、`grand-atelier/` 3 个 |
| `sites/` | 是 | 49 / 49 | 7 站全部 |
| `content/` | 是 | 5 / 5 | |
| `shared/sites/` | **否**（不在 include） | 3 个 .ts + `copy.mjs` | `shell.ts`、`mic.ts`、`audio.ts` 是被 `sites/hug/attach.ts` 等 include 内文件 import 才进程序的 |
| `shared/product/` | **否** | 0 | `template-spec.ts` **不在类型检查内**（`templates.mjs`、两个构建脚本本就不在） |
| `shared/build/` | 否 | 0 | 全是 .mjs |
| `tests/` | 仅 `fixtures/**/*.ts` | 12（全是 fixtures） | **`tests/contracts.test.ts`、`tests/runtime.test.ts` 不在类型检查内** |
| 所有 `.mjs` 构建脚本 | 否 | — | `shared/sites/build.mjs`、`shared/stage/preview/build.mjs`、`shared/product/*.mjs`、`shared/build/*.mjs`、`tools/parts/atlas.mjs` 均无类型检查（`copy.mjs` 仅因被 import 而进程序，且 `checkJs: false`） |

已跟踪的 185 个 .ts 里，不在 tsc 程序内的共 9 个：上表 rain-webgpu 4、grand-atelier 3、`shared/product/template-spec.ts`、`tests/contracts.test.ts`、`tests/runtime.test.ts`。

抑制写法统计 [实测，`git grep`，不含 docs]：

| 写法 | 总数 | 位置 |
|---|---|---|
| `// @ts-nocheck` | 0 | — |
| `// @ts-ignore` | 0 | — |
| `// @ts-expect-error` | 0 | — |
| `as any` | 7 | 全部在 `shared/parts/koi-pond/index.ts` |
| `as unknown as` | 89 | shared/stage 20、shared/parts 36、shared/realism 7、sites 15、shared/contract 3、shared/sites 4、shared/parts-library 4；单文件最多：`shared/stage/stage.ts` 7、`shared/stage/preview/dawn-desk/index.ts` 7、`shared/realism/materials.ts` 7 |
| `eslint-disable` | 14 | `shared/parts-library/micro-scenes/*.html` 6 个各 2、`shared/parts-library/rain-webgpu/height-map.ts` 2。仓库里没有 eslint 配置，也没有任何 lint / CI 配置文件 |

---

## 10. 文档健康度

- `docs/` 已跟踪 101 个文件，合计 66,907,652 B（约 63.8 MiB）；其中 `.md` 31 个（含 `docs/archive/` 与 `docs/review-2026-11-19/` 下的），合计 1,177,687 B [实测]。根目录另有 `README.md` 3,474 B、`QUARANTINE.md` 16,995 B。
- 最大的几份 .md [实测]：`ARCHITECTURE-REUSE.md` 231,188 B / 2,356 行；`archive/2026-11-pre-pivot/ARCHITECTURE-NEXUS.md` 123,371；`A2-IMPLEMENTATION-PATH-2026-11-23.md` 87,494；`archive/2026-11-pre-pivot/PRD-REFINE.md` 82,732；`PRODUCT-FORM.md` 73,218；`PRD-REUSE.md` 70,151；`HANDOFF.md` 66,608 / 675 行。

### README「当前状态」（`README.md:7-13`，标题日期 2026-11-18）与现状对账

| README 原文 | 现状 [实测] | 位置 |
|---|---|---|
| 装配运行时：`28 断言 + 6 变异探针 + 15 接合断言全绿` | `stage-smoke` 44、`stage-mutation` 6、`parts-composition` 22 | `README.md:11`、`:29`；`docs/HANDOFF.md:288` 自己写的是 44/44，`:451` 写 `parts-composition` 22 断言（旧 15 已过时）；README 的 28 + 15 是更早的数 |
| 零件：`🟡 2 / 6（field-ground L0 · voxel-world L1）` | `shared/parts/` 有 16 个零件目录；`PART_ENTRY` 17 条（多一个 dawn-desk） | `README.md:12`、`:48` |
| 四座样板站：`❌ 0 / 4` | `STATIONS` 4 站全部可构建；`site-build: PASS 119/119` | `README.md:13` |
| `verify:reuse # 零件溯源五门（仍绿）` | 本机 5 个脚本里 2 个红（CRLF 所致，LF 下绿） | `README.md:39` |
| 每个零件「自带 `README.md` 与 `bench.mjs`」 | 13 / 16 有 README，7 / 16 有 bench | `README.md:20` |
| `shared/contract/`、`shared/build/`「待裁」 | 仍在，引用关系见第 4 节 | `README.md:51-52` |

### `docs/HANDOFF.md`

- 带编号标题共 27 个；**「2.5」出现两次**：`:106`「### 2.5 门自己也会撒谎」与 `:130`「### 2.5 门自己也会撒谎（14 种假绿，一个来源）」。2.5 之后的子编号顺序是 2.5、2.5、2.5d2（`:153`）、2.5e（`:166`）、2.5b（`:199`）、2.5c（`:228`）、2.5d（`:241`）[实测]。
- `:301`「### 3.2 四个零件」、`:279`「约 1.5k 行」——`shared/stage` 四个核心文件实测 1,499 行，行数对得上；零件数与 16 个目录不符。
- 更正类标记出现次数 [实测，`grep -c`]：`补注` 3 行 / 4 次；`作废` 5 行（含「已作废」2 行）；`更正` 2 行；`已废` 1 行；`旧口径` 1 行；`已取代` 0；`以本文为准` 0；`勘误` 0；`已修正` 0。合并去重后 12 行。
- `:269` 写 `preview-build`（337/337），现状 `preview-build: PASS 811/811`；`:320`、`:451` 写 `parts-composition` 22/22，与现状一致。
- 标题层级：`#` 11、`##` 10、`###` 28、`####` 1。

### `docs/DECISIONS.md`

- ADR 标题 12 个，编号 11 个：**`ADR-04` 出现两次**——`:51`「`world` 的 `space` 只有 `screen` / `subject` 两种」与 `:163`「`/hug` 推翻"纯 Canvas2D"裁决，完整移植原站草甸」。全文 `ADR-04` 被提及 2 次，其余各 1 次 [实测]。
- `:66` ADR-05「`costMs` 是**申报预算**，不是实测」与 `shared/stage/contract.ts:214-216`「**必须实测**，不接受估计值」口径相反（见第 7 节）。

---

## 11. 技术债命中

范围：`shared/`、`sites/`、`tests/`，HEAD，正则 `TODO|FIXME|HACK|XXX|待裁|临时|workaround` [实测]。

总量：200 行命中、21 个文件。按词：`TODO` 156、`XXX` 18、`待裁` 10、`临时` 10、`workaround` 6、`HACK` 1、`FIXME` 0。

命中里有 178 行来自上游原件或 base64（`shared/parts-library/micro-scenes/*.html` 6 个各 28 行 = 168、`shared/realism/assets.ts` 8、`shared/parts-library/koi/*.png` 2），不是人写的标记。剔除后剩 22 行，其中 2 行是 dawn-desk 两个 base64 文件里的偶然命中，**人写的标记 20 行**：

| 文件 | 命中行 | 内容摘要 |
|---|---|---|
| `shared/parts/tide-medium/bench.mjs` | 5 | `:6` 「色阶与焦散形态仍在待裁状态」；`:180`、`:183`、`:189`、`:191` 焦散 / 色阶「待裁」层的断言与输出 |
| `shared/parts/tide-medium/index.ts` | 3 | `:35` 「`grade`（色阶）/ `glow`（光斑形态）—— **待裁**，PM 判完再定稿」；`:41`、`:280` |
| `shared/parts/tide-medium/README.md` | 2 | `:23-24` 参数表 `grade` / `glow` 状态「待裁」 |
| `tests/lib/probe-site.mjs` | 4 | `:1`、`:51`、`:67`、`:95` 「临时探针」——该文件本身无人引用（第 3 节） |
| `shared/build/build.mjs` | 1 | `:33` 「无临时文件」 |
| `shared/build/registry.mjs` | 1 | `:115` 「无临时文件」 |
| `shared/parts-library/rain-webgpu/height-map.ts` | 1 | `:50` 上游原件「临时隐藏」 |
| `sites/hug/parts/dandelion.ts` | 1 | `:159` 「逐帧复用的临时对象」 |
| `shared/sites/serve.mjs` | 1 | `:95` 「要临时对外请显式传 --host」 |
| `tests/lib/browser.mjs` | 1 | `:49` 「npx playwright 的临时安装目录」 |
| `shared/stage/preview/dawn-desk/{leaf-atlas,window-photo}.ts` | 各 1 | base64 内的偶然命中，非标记 |

按区域：`shared/parts-library` 171、`shared/parts` 10、`shared/realism` 8、`tests/lib` 5、`shared/stage` 2、`shared/build` 2、`sites/hug` 1、`shared/sites` 1。

「待裁」在 README / HANDOFF 里的位置 [实测]：`README.md:51`、`:52`（`shared/contract`、`shared/build`）；`docs/HANDOFF.md:236`、`:238`、`:239`、`:517`（「manifest 体系待裁」）、`:526`。

---

## 12. 事实清单

1. **两条腿不能在真实工作区跑**：`tests/stage-mutation.mjs:60,71,82` 原地改写已跟踪的 `shared/stage/stage.ts`；`tests/verify-no-core-write.mjs:49` 会跑 v1 构建写 `dist/still.html`。`npm run verify:stage` 与 `npm run verify:nexus` 在有人并发施工时并不安全。[实测]
2. **本机工作区有 99 个已跟踪文件是 CRLF / 混合行尾**（`git ls-files --eol`：`w/crlf` 85、`w/mixed` 14），而 `core.autocrlf=false`、`.gitattributes` 要求 LF。`verify:reuse` 两个脚本的红由此而来；任何用「磁盘字节 == 声明字节」做判据的门在这台机器上都会红。[实测]
3. **`verify:clock` 是与行尾无关的真红**：`shared/parts/dandelion/index.ts:291`、`:337` 调 `performance.now()`，与同文件 `:14` 的注释相反。[实测]
4. **`verify:field` 在没有 playwright 的机器上以 0 退出**（`tests/field-visual.mjs:177`），其余 11 个 browser.mjs 依赖脚本没有 SKIP 分支。[推断，未执行]
5. **19 条门里 10 条因 playwright 不可跑**，其中包括全部成品视觉门与 3 条 bench；`costMs` 注释里引用的「真浏览器实测」（如 `bubbles/index.ts:169` → `tests/bench-blend.mjs`）在本机无法复现。[实测]
6. **仓库里另有一套不依赖 playwright 的浏览器门**：`tests/runtime-smoke.mjs`、`tests/regression-hug-share.mjs` 用无头 Edge + CDP，本机能跑且绿，但没有 npm script 指向它们，而且测的是 v1 产物 `dist/<id>.html`。[实测]
7. **新体系对 v1 的依赖只有一条通路**：`shared/sites/build.mjs:40,103,119,132` 的 4 个 attach → `sites/license/{index,ritual,stay,fold,export}.ts`、`sites/{hug,still,koi}/attach.ts`、`content/license.ts`。`shared/contract` 16 文件、`shared/build` 8 文件、`shared/parts-library/registry` 与新产物无关。[实测]
8. **/praise 在新体系里不存在，在 v1 里能构建**：`STATIONS` 只有 4 站；`node shared/build/build.mjs all` 产出 `dist/praise.html` 109.4 kB。`npm run build`（默认 still）、`build:all`、`build:nexus`、`dev`、`build:readable` 五个 script 至今指向 v1 构建器。[实测]
9. **v1 与新产物在 `dist/` 同目录混放**：`dist/still.html`（v1，11-18）与 `dist/still/index.html`（新）并存；`dist/preview/a2-koi.html` 对应的预设名已不存在。[实测]
10. **`kb` 字段没有消费者**：契约写「用于站点体积门」（`contract.ts:218`），但 stage / sites / product / tools 里没有任何代码读 `.kb`。`costMs` 的契约注释（「必须实测」）与 ADR-05（「不是实测」）相反；16 个零件里注释明说估算的 5 个、无来源的 4 个。[实测]
11. **申报与实际体积差距最大的两件**：`voxel-world` 申报 `kb: 0`，单零件 gzip 约 40 KB；`temple` 申报 18 KB，单产物约 4.99 MB（gzip 3.47 MB），来源是 `shared/realism/assets.ts` 的 15 个 base64 贴图。[实测]
12. **`shared/realism/assets.ts`（5.02 MB，仓库最大源码文件）在 tsc 程序里**，`shared/product/template-spec.ts` 与两个 `.test.ts` 不在；`shared/sites/*.ts` 与 `shared/product/` 不在 tsconfig include 里。[实测]
13. **dandelion 的 Canvas2D 渲染层有两份**（`sites/hug/parts/dandelion.ts` 403 行、`shared/parts/dandelion/index.ts` 418 行，约 208 行相同），算法核 `parts-library/dandelion/core/meadow.ts` 只有一份、两处共用。[实测]
14. **room-at-dawn 上游源码有两份逐字节相同的副本**：`shared/stage/preview/dawn-desk/upstream/`（12 文件，约 410 KB）没有任何代码 import；在用的是 `shared/parts-library/room-at-dawn/upstream/src/`（25 文件）。[实测]
15. **`voxel-world/engine.js` 是生成文件且可复现**：在副本里重跑 `build-engine.mjs`，输出与已跟踪文件逐字节相同；`PATCHES` 实际 20 条，`index.ts:4` 注释写 19 条。[实测]
16. **koi-pond 直接 import `shared/parts-library/koi/` 的 7 个 .js**；该目录 28 个文件里还有 8 张截图（约 11.7 MB）、PWA 壳与两个工具脚本；`index.ts:4` 注释写「26 个上游文件」。[实测]
17. **parts-library 里 3 个目录有悬空 import**：`rain-webgpu` 23 条、`grand-atelier/piano-model.ts` 4 条、`room-at-dawn/main.js` 9 条，指向仓库里不存在的文件；`rain-webgpu` import `three/tsl`、`three/webgpu`，`room-at-dawn/upstream/src/bake/worker.js` import 不在 package.json 里的 `three-mesh-bvh`。[实测]
18. **三份文档数字已过期**：`README.md:11-13` 写「28 断言 / 零件 2/6 / 样板站 0/4」，现状是 44+6+22、16 个零件、4 站可构建；`docs/HANDOFF.md:301`「四个零件」；`docs/DECISIONS.md` 的 `ADR-04` 用了两次（`:51`、`:163`），`HANDOFF.md` 的「2.5」也用了两次（`:106`、`:130`）。[实测]
19. **仓库里没有 lint 配置、没有 CI 配置**；`@ts-nocheck` / `@ts-ignore` / `@ts-expect-error` 均为 0，`as any` 7 处全在 `koi-pond/index.ts`，`as unknown as` 89 处。[实测]
20. **HTML 壳与浏览器侧打包在站点构建和预览构建里各写一份**：`STYLE` / `TEMPLATE` / `GL_CANVAS` / esbuild 选项块 / `</script` 守卫；站点与模板构建共用的只有 `PART_ENTRY`、`loadPartDefs`、`buildPreview`。gzip 体积只有模板构建在算。[实测]
21. **`shared/stage/stage.ts` 的 902 行里 663 行是一个函数 `createStage`**（L240–L902），内含 7 个嵌套函数和约 30 个共享的闭包状态变量。[实测]
22. **`tests/site-isolation.sh` 依赖不存在的 `tests/baseline-dist.sha256`**（`:10`），并会 `sed -i` 改 `sites/praise/site.config.ts`；`tests/lib/probe-site.mjs` 无人引用。[实测]
23. **`npm run build`、`build:all`、`dev` 等入口不解析未知参数**：`node build.mjs --help` 直接构建 still（隔离副本实测）。[实测]
24. **手写代码里的技术债标记很少**：`TODO` / `FIXME` 在人写的代码里为 0；`待裁` 集中在 `tide-medium` 的 `grade` / `glow` 两个参数（10 行）。[实测]
25. **`docs/review-2026-11-24/arch/logs/*.log` 被 `.gitignore:8` 的 `*.log` 忽略**，提交时需要 `git add -f` 或改名；`tests/runtime-smoke.log` 是一份被跟踪的日志文件。[实测]

---

## 附：未查到 / 不确定

- 各零件注释里写的「M2 实测」「Metal 实测」原始数据（哪台机器、哪次运行、原始输出）在仓库里**查不到**独立记录，只能看到注释里的数字。
- `costMs` 的「真浏览器实测」值在本机无法复现（无 playwright），本报告未做任何帧时间测量。
- `dist/preview/a2-koi.html`（11-24 09:07）由哪条命令产出，仓库里**查不到**对应的预设名。
