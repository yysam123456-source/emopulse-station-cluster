# 交接书 — 情绪价值单页站 · 零件装配体系

> 写于 2026-11-18 17:10。读者是**接手的另一个 agent**。请先读完本文再动任何文件，本文里每一条「不可违反」都是有人在上面栽过的。

---

## 0. 一句话现状

**装配运行时已完工并验真；零件只到 2/6；四座样板站一座都没接。** 继续往下做的第一件事是补 4 个零件，第二件是把 `/hug` 接起来。

---

## 1. 产品前提（已由用户拍板，**不要重新讨论**）

用户原话要点（2026-11-18）：

- 「不要做站群了，做**单域名的链接访问**即可」
- 「我要你爬下来的代码**不用管 LICENSE**」
- 「你现在是做**组合，多种效果叠加**，呈现出我们所设计产品需要的情绪价值网站，应该是和原代码有极大差异的」
- 「把刚才这些组件全部抽象成零件，包括我的 flaxb 项目里的各类 component 和 showcase」
- 「这些零件进行装配到我们网站上需要呈现多种多样的效果，需要能够**复合装配**」

据此已定、不再动摇的四条：

| # | 决策 | 内容 |
|---|---|---|
| 1 | 单站形态 | 不做站群，单域名下按路径分站（`/hug` `/license` `/koi-pond` `/still`） |
| 2 | 不管许可 | 上游代码随便搬。**但仍要记来源路径**（不是为了合规，是为了下一个人能找回去） |
| 3 | 卖点是叠加 | 零件必须能**复合**：分层 + 混合模式 + 后处理链。不是「一个页面一个特效」 |
| 4 | 四 biome 四样板 | `tide`→`/still` · `field`→`/hug` · `room`→`/license` · `ink`→`/koi-pond`，各做一站样板。体素引擎上，4/4 biome 都保 |

**已经作废、不要复活的东西**（上一轮的方向，用户已推翻）：D0–D4 复用深度分档、门 1–10 溯源门、license L1–L4 普查、参数搬运率、算法覆盖门、depth pin、baseline signoff。`docs/ARCHITECTURE-REUSE.md` 与 `docs/PRD-REUSE.md` 是那套体系的遗产，**只当历史档案看**，别按它施工；其中仍有价值的是 `shared/parts-library/dandelion/core/meadow.ts` 与 `blow-input/core/detector.ts` 这两个**真算法移植**（见 §3.3）。

---

## 2. 装配模型（这是整个工程的地基）

### 2.1 六层

| 层 | 语义 | 谁在这里 |
|---|---|---|
| `L0` | 底材（纸 / 水 / 草 / 雾） | `field-ground` ✅ · `paper-ink` ⬜ · 水底材 ⬜ |
| `L1` | 世界（3D） | `voxel-world` ✅（`channel: 'gl'`，整场唯一） |
| `L2` | 生态（自走实体） | `boids` ⬜ · `bubbles` ⬜ · `dandelion` ⬜ · ASCII piece ⬜ |
| `L3` | 交互（输入驱动） | `blow-input` ⬜（v1 有，需改 PartV2） |
| `L4` | 后处理（整场唯一） | `pixel-post` ⬜ |
| `L5` | UI（文字 / 指引 / 调试） | 未开始 |

### 2.2 三条硬约束（违反即装配失败）

1. **零件之间不许互相调用。** 唯一共享状态是 `WorldFrame`（只读）。要复合就靠层叠加 + `globalCompositeOperation`，不靠耦合。
2. **L4 整场唯一**，`channel: 'gl'` 整场唯一。两条后处理链会互相抹掉像素；两个 WebGL/WebGPU 上下文会互抢。
3. **`blend` 走白名单**（`BLEND_MODES`，禁 `copy` / `destination-in`，它们会清空整块画布）。

### 2.3 运行时语义（已实现且被断言锁死，改之前先看测试）

- 层序 `L0→L5` 固定；层内 `z` 升序，`z` 同值按 `id` 字典序
- **超预算只 `setLod('low')`，不跳过 `draw`** —— 缺块比掉帧更难看
- 降档后仍超 → **只挂起 `expendable: true` 的**；`L1` 与 `L5` 一律不许把自己设成 expendable
- 零件运行期抛错 → **就地隔离**（记 `broken`、进 `degraded[]`、不再调用），不拖垮整场
- 同 `seed` 必须逐帧确定；`dispose` 逆序且幂等

---

## 3. 已完成（含验证证据）

### 3.1 装配运行时 `shared/stage/` — 1101 行

| 文件 | 内容 |
|---|---|
| `contract.ts` | `PartV2` / `PartInstance` / `PartEnv` / `WorldFrame` / `BlendMode` 白名单 / `StageError` |
| `world.ts` | `mulberry32` · `hashSeed`(FNV-1a，带分隔符防 `('ab','c')` 与 `('a','bc')` 撞种) · `createWorld` · `createPointerTracker` · `planBudget` |
| `stage.ts` | `createStage` · `validateParts` · `sortParts` · 预算降档 · 故障隔离 |
| `index.ts` | 唯一对外入口（站点与零件只从这里 import） |

**验证**：`node tests/stage-smoke.mjs` → **28/28 PASS**；`node tests/stage-mutation.mjs` → **6/6 变异全部被抓住**（层内 z 排序被删 / 超预算跳过 draw / dispose 改正序 / 不设 blend / 缺能力照构造 / 抛错不隔离）；`npx tsc --noEmit` → 0 error。

> 变异探针的价值：第一版 smoke 测试全绿，但删掉 z 排序也照样全绿 —— 因为测试用的 id 字典序恰好等于 z 序。**「全绿」不等于「测到了」**，加探针才发现 6 条里有 2 条是假绿（另两条见 `git log` 里的测试注释）。

### 3.2 两个零件

| 零件 | 层 | 行数 | 状态 |
|---|---|---|---|
| `shared/parts/field-ground/` | L0 | 343 | 黄昏草甸：天光 + 雾带 + 三层丘陵视差 + 520 根按风摆动的草。`costMs 3.4`（**估算**，见下） |
| `shared/parts/voxel-world/` | L1 `gl` | 265 + `engine.js` 2324 | `shared/core` 体素海洋世界包成零件，20 条具名补丁，基线零字节改动 |

**两个都实测过组合**：`node tests/parts-composition.mjs` → **15/15 PASS**（单件装配 / 与 L5 叠加的层序 / 无离屏能力时的降级路径）。

**voxel-world 是真的画出来了**，不是「能 import」：`docs/evidence/voxel-proof.png` 是同一次 headless Edge + CDP 运行的截图，`state: ready`，海床/海藻/鱼群/光柱齐全，上面叠着 `lighter` 混合的 2D 光点 —— 即「L1 GL 层 + L2 canvas2d 层复合」跑通的证据。

**`costMs` 的口径必须看清**（这是本轮最容易自欺的一处）：

- `field-ground` 的 3.4 ms 是**按填充率常数估的**（`0.35 ms/Mpx` 不透明 blit、`0.30` 实色填充、`0.8 ms/千段` 描边），不是浏览器实测。Node 里没有 canvas 实现，假 ctx 测出来是 **0.004 ms**，那是个陷阱 —— 它只测 JS 指令发射，不含 GPU 填充，而本件 99% 的成本在填充。
- `voxel-world` 的 0.05 ms 是 SwiftShader 软件后端下的 CPU 提交耗时，**不能外推到真机**。
- **上站后必须用 `performance.now()` 在真实浏览器采一次替换掉。** `shared/parts/*/bench.mjs` 会打印指令计数与估算对账，那两项是可核对的。

### 3.3 两份能直接用的算法内核（上一轮的遗产，别删）

| 文件 | 行数 | 内容 |
|---|---|---|
| `shared/parts-library/dandelion/core/meadow.ts` | 501 | 1335 颗种子 / 44 段伞骨 / `DETACH_SECONDS=1.8` 错峰脱落 / 三轴异速飘散 / `PALETTE` 与 `PLANT_LAYOUT`（10 株，seeds 求和 = 1335） |
| `shared/parts-library/blow-input/core/detector.ts` | 276 | FFT 2048 / 平滑 0.65 / 底噪 EMA 0.94 / 阈值 `max(0.025, baseline*2.8)` / 分频与宽带判定 |

这两个是**逐常量对齐原文**的移植，且被 `tests/golden-run.mjs`（4 份 89 条，100% 通过）与 `tests/mutation-probe.mjs`（死参数 = 0）验过。**它们只是数学内核，没有画布渲染** —— 对应的 Canvas 渲染层在 `sites/hug/parts/dandelion.ts`（396 行）与 `sites/hug/parts/blow-input.ts`（247 行），是 v1 形态，要包成 PartV2 才能进新装配（见 §4 任务 1）。

### 3.4 四份研究文档

| 文档 | 行数 | 用途 |
|---|---|---|
| `docs/BIOME-ASSET-MAP.md` | 303 | 4 个 biome 各需哪些零件（结论：**room 只要 2 件、field/tide 各 3 件、ink 2–3 件**）；ASCII 984 件能不能用；shaders 200 件的真实约束 |
| `docs/ASCII-PIECE-CONTRACT.md` | 570 | ASCII 两套 piece 的渲染契约钉死到可照抄：闭包返回什么、frame 结构、调色注入点、`CELL_W=0.602`、成本与四种合并方案 |
| `docs/VOXEL-AS-PART.md` | 189 | 体素引擎四问查实（DOM 依赖全表 / 包围盒 4 处实测值 / 硬依赖 / 三档画质）+ 三条路线裁决 + 20 条补丁表 |
| `docs/QUARANTINE.md`（仓库根 `QUARANTINE.md`） | — | 上一轮遗留的两个隔离项（Q-01 已裁删除并落地；Q-02 零件实例化层产线从未执行 —— **这一条就是你接手后要补的洞**） |

---

## 4. 缺口（按依赖顺序，这就是你的 TODO）

### 任务 1｜把 dandelion / blow-input 改成 PartV2（**最高优先，`/hug` 只差这个**）

- 新建 `shared/parts/dandelion/`：复用 `shared/parts-library/dandelion/core/meadow.ts` 的全部数学 + `sites/hug/parts/dandelion.ts` 的绘制层（LOD 分档 44/23/14/5/2 段、8 档透明度分桶）。`layer: 'L2'`，`blend: 'source-over'`。
- 新建 `shared/parts/blow-input/`：**不要**把麦克风塞进零件。`WorldFrame.audio` 是**stage 级输入**（和 pointer 同级），由 `stage.setAudio({level, bands})` 注入，麦克风采集是零件之外的一个小服务。零件本身只读 `frame.audio.level` 画风痕。这样做是因为契约禁止零件间通信 —— 而「吹气」本质是输入，不是视觉。
- ⚠️ `sites/hug/parts/dandelion.ts` 的 `update(seconds)` **内部会画**。装配器是「`update` → 设 blend → `draw`」的顺序，所以适配器的写法是：`update` 只存 `dt`，真正的 `legacy.update(pendingDt)` 放到 `draw` 里调。

### 任务 2｜四个真零件（`engineer-hug-gaps` 已接到口径但未交付）

全部在 `shared/parts/<id>/{index.ts,README.md,bench.mjs}`。**实现口径已订正过一轮，照下面的来，别再按直觉写**：

| id | layer | blend | 关键口径 |
|---|---|---|---|
| `paper-ink` | L0 | `source-over` | 程序化纸纹（128×128 **无缝**瓦片 + 暗角）。**不要碰 ink 引擎那 273KB base64 纸纹**（gzip 后仍约 205KB，直接爆 40KB 预算），也不要 port 它的 SVG 管线 |
| `boids` | L2 | `lighter` | 源 `public/…/animata/background/boids-ecosystem.tsx`（7,672 B）。`count=120` `PERCEPTION=36` `MAX_SPEED=1.8` 分离半径 `18` 权重 `0.04/0.0006/0.06`。**原文无 dt**（速度是 px/帧），只改积分 `x += vx*dt*60`，**力不要乘 dt**（双重积分会让群炸）。**原文每帧铺 `bg+'dd'` 87% 不透明底做拖尾 —— 绝对禁止**，那会抹掉 L0；改成内部离屏 canvas + `destination-out` 衰减 + `drawImage` 上来 |
| `bubbles` | L2 | `screen` | 源 `src/components/showcases/AbyssalDescent.tsx` 第二个 `useEffect`（54 行）。70 个；`r=(0.6+rand*2.2)*dpr`；`speed=0.0004+rand*0.0012`；`sway=0.3+rand*0.9`。**高光是第二个更小的圆**（`(x-0.3r, y-0.3r)` 半径 `0.35r`，`rgba(220,245,255,0.5)`），不是渐变 |
| `pixel-post` | L4 | `source-over` | 自己写后处理 pass（`getImageData` → 处理 → `putImageData`）。**pixelfx 里没有后处理文件**，只有数值配方可抄：扫描线 `y&1 ? 0.08*sq : 0`（`crt-off.js`）、20px 块网格 + fbm 排序（`pixel-dissolve.js`）、静电配色白/青/品红（`glitch-wipe.js`）、alpha<1 用 **4×4 Bayer 有序抖动**（`_lib.js`）。按**索引**写像素，不要一块一个 `fillRect` |

四个都必须：`costMs` 用 `bench.mjs` 实测口径（同 §3.2 的说明）；`setLod('low')` 真减量（boids 120→40、bubbles 70→24、pixel-post 块 20→40px、paper-ink 瓦片 128→64）；`draw`/`update` 零每帧分配；`dispose` 幂等；单文件 ≤400 行；零外部依赖；`reducedMotion` 时速度 ×0.3、关掉抖动闪烁；**不许 `Math.random`**（用 `env.seed` + `mulberry32`）；**不许 `addEventListener`**（指针从 `frame.pointer` 取）。

### 任务 3｜L0 另两块底材（无人做）

- `tide` 水底材：水体渐变 + 焦散光斑 + 悬浮微粒 + 水下雾。约 250 行。
- `room` 室内底材：**`docs/BIOME-ASSET-MAP.md` 的结论是「room 只需要 paper-ink + pixel-post 两件」**，晨光用一条 canvas 渐变 + 一个 fbm 光斑就够。**不要给 room 加 L2 自走实体 —— 那是负资产**，室内加飘浮物立刻变成「特效演示」。

### 任务 4｜四座样板站（**一座都还没接**）

| 站 | biome | 零件栈（`✅` 有 / `⬜` 缺） | 自写 |
|---|---|---|---|
| `/license` | room | `paper-ink`⬜(L0) + `pixel-post`⬜(L4) + L5 UI⬜ | **0** |
| `/hug` | field | `field-ground`✅ + `voxel-world`✅(L1) + `dandelion`⬜ + `boids`⬜ + `blow-input`⬜ + `pixel-post`⬜ | 0 |
| `/still` | tide | 水底材⬜ + `voxel-world`✅ + `bubbles`⬜ + `blow-input`⬜ + `pixel-post`⬜ | 1 |
| `/koi-pond` | ink | `paper-ink`⬜ + ASCII piece⬜ + 墨扩散⬜(L3) + `pixel-post`⬜ | 0–1 |

**`/license` 是最快的样板**（只要 2 件），**建议从它开始**，用来验证「两份零件就能立住一个站」这个产品假设。

`/hug` 的 L1 已经是现成的：`voxel-world` 声明 `requires: ['webgpu']`，不支持的浏览器上装配器会跳过并记 `degraded`，站点必须能不带 L1 也成立 —— 这条路径已通过测试。

### 任务 5｜ASCII 通用零件（**杠杆最大的一件**）

`docs/ASCII-PIECE-CONTRACT.md` 已经把契约钉死。结论是**要拆成两个零件类型，不是一个**：

- `ASCII-keys`（对应 ascii-magic 734 件）：`default()` → `(t) => {text, color}`，颜色是**与 text 同几何的字符键字符串**，`palette` 是 `{"0":"#…","a":"#…"}` 对象。渲染用 **GlyphAtlas**（每个字符每种颜色预烘一次到离屏 tile，再 `drawImage` 盖印）。
- `ASCII-plain`（对应 ascii-rest 250 件）：`default()` → `(t) => string`，**零依赖单文件**，单色。渲染用**按行合并**（96×36 → 36 次 `fillText`，降 96 倍）。

三条必须处理的差异（不处理就静默出错）：
1. `meta.cell` **同名不同义**：ascii-magic 是字符串 `"square"`，ascii-rest 是数字 `2`（行高倍数）。`cell === "square"` 对后者恒 false，**行高会错一倍**。
2. `meta.ground` 存在时会 `fillRect` 整块不透明底，**并且会翻转 `env().paper` 让 piece 按浅色纸重画**。拷 piece 后**必须删掉 `ground`**。
3. 行高基准不同：`CELL_W = 0.602`（文本件行高 `1/0.602 ≈ 1.6611`）vs ascii-rest `2.0`，**差 20%**，同页混排必须统一缩一边。
4. `t` 的所有权建议定为「站点级时钟，进站归零，`>=0`，边界 clamp」，不要零件自己从 0 起（否则同画面两次进入不一样）。
5. `█` 等块元素必须走 `fillRect`，用字形画会出缝。

### 任务 6｜已知但未处理的技术债

1. `shared/parts-library/` 那 10 份 v1 manifest 与新体系**并存但互不相通**。`QUARANTINE.md` 的 Q-02 说得很清楚：`mountSite()` 全仓零导入者、`installParts()` 零生产调用点、7 站 `site.config.ts` 无 `composition` —— **零件实例化产线从未真正执行过**。要么把它接到新 `createStage`，要么整体废弃。**别让它继续「声明存在、实际失效」。**
2. `tests/verify-registry.mjs` 第 140 行硬编码 `PART_MANIFESTS.length === 8`，现在实际 10 份，**1 项断言失败至今未修**。
3. `shared/core/` 的体素引擎包围盒在 4 处重复（见 `docs/VOXEL-AS-PART.md` §一.2），数值当前一致但无编译期校验。基线只读，本轮没动。
4. 三个旧站（`hug` / `license` / `praise`）的 `dist/*.html` 有待签基线（`tests/baseline-signoff.json` 三站未签）。新方向下这些站会被重做，**签不签先问用户**。

---

## 5. 命令表

```bash
# 装配运行时 + 变异探针
node tests/stage-smoke.mjs            # 28 断言
node tests/stage-mutation.mjs         # 6 变异（会临时改写 shared/stage/stage.ts 再还原）
node tests/parts-composition.mjs      # 15 断言，零件 × 装配器的接合
npx tsc --noEmit                      # 必须 0 error

# 单个零件的成本对账（打印画布指令计数 + 估算对账）
node shared/parts/field-ground/bench.mjs
node shared/parts/voxel-world/bench.mjs   # ⚠️ 会起 Edge headless + SwiftShader，几分钟

# 上一轮遗产（仍应保持绿）
npm run verify:reuse                  # 5 个门：装配 / 溯源 / 措辞 / 黄金值 / 死参数
```

**目视验收**：`node _scratch/build-field-preview.mjs` → `_scratch/field-preview.html`（单文件、零外部请求）。`_scratch/` 已进 `.gitignore`，是临时产物目录，别往里放正式代码。

---

## 6. 文件地图

```
shared/stage/              ← 新装配体系（唯一入口 index.ts）
shared/parts/              ← 新零件（field-ground ✅ / voxel-world ✅ / 其余 ⬜）
shared/parts-library/      ← 上一轮的 v1 零件（含两份真算法内核，别删；manifest 体系待裁）
shared/core/               ← 体素引擎基线，BASELINE.sha256 锁着，**一个字节都不许改**
sites/{hug,license,praise,still,koi}/   ← 旧 v1 站点，新方向下要重做
tests/                     ← 门都在这里；stage-* 与 parts-composition 是新体系的
docs/                      ← 架构 / 研究 / 交接
docs/evidence/             ← 目视证据（voxel-proof.png）
QUARANTINE.md              ← 两个待裁隔离项，Q-02 就是 §4 任务 6.1
```

---

## 7. 建议的接手顺序

1. **先跑 §5 的四个命令**，确认基线是绿的（不绿先修环境，别急着写代码）
2. **任务 2 的四个零件**（口径已钉死，照着写最省事）
3. **`/license` 站**（只要 2 件，最快验证「2 件零件能否立住一个站」）
4. **任务 1 的两个 wrap**（`dandelion` / `blow-input`）→ 接 `/hug`
5. 任务 5 的 ASCII 零件 → 接 `/koi-pond`
6. 任务 3 的水底材 → 接 `/still`

---

## 8. 三条给下一个 agent 的提醒

1. **别信「全绿」。** 本轮 6 条变异里 2 条一开始是假绿的（断言恒真 / 断言与实现巧合相等）。写完测试后自己改坏一处看它会不会红，红不了就是没测到。
2. **别把假数字当实测。** `costMs` 尤其危险：Node 里没有 canvas，假 ctx 测出来永远是接近 0 的数，而真实成本全在 GPU 填充。估算就写估算，并在代码注释里写清口径。
3. **别在没有浏览器证据的情况下说「效果很好」。** 本轮唯一被真实验证过的画面是 `docs/evidence/voxel-proof.png`（CDP 驱动 Edge 跑出来的）。`field-ground` 的预览页 `_scratch/field-preview.html` 只保证「构建通过、无外部请求、装配断言绿」，**画面好不好看没人看过** —— 要评价得先截图。
