# voxel-world

`tide` biome（`/still`）的 **L1 世界层**：把 `shared/core/`（上游 `Noniv/abyssal-garden @ a596354` 的体素海洋世界，2320 行）包成一个 `channel: 'gl'`、`layer: 'L1'` 的 PartV2。

- **来源**：`shared/core/src/{quality,math,shaders,world,main,audio}.js` 按原 `build.mjs` 顺序拼成 `engine.js`（2324 行），由 `build-engine.mjs` 施加 **20 条具名补丁**（不读宿主 DOM / 不写 `body.className` / 不 `location.reload()` / 不抢输入 / 帧由 stage 驱动 / 尺寸由装配器给）。`engine.js` 头部写了 6 个源文件的 sha256 前 12 位，可与 `shared/core/BASELINE.sha256` 对账。**基线零字节改动。**
- **路线裁决**：选「直连」而非 iframe / 搬 shader。理由与证据见 `docs/VOXEL-AS-PART.md` §二（关键一条：它不是 raymarching，是 GPU compute 生成密度场 → CPU surface nets → 实例化网格，只搬 shader 等于重写 2000 行且产出的不是原件）。
- **能力声明**：`requires: ['webgpu']`。原件走 `navigator.gpu` + `getContext('webgpu')`，**没有 WebGL2 回退**；不支持的浏览器上装配器会跳过本零件并记 `degraded: unsupported`，站点必须能不带 L1 也成立。
- **costMs = 9**：**申报值**（`index.ts:123`）。旧值 0.05 ms 是假数（只计 JS 调用、没计 GPU）；现在按 M2 实测 1280×800@dpr2 约 44 ms/帧折算成整场预算权重，真机 GPU 帧时间仍未逐档实测。
- **LOD**：`setLod('low')` 把内部渲染缩放乘 0.6 并封顶 dpr=1（1920×1080 → 384×216 已实测生效）；原件本身有每秒一次的动态分辨率，零件只给上限、不取代它。
- **已知限制**：
  1. 真实 GPU 帧时间**未测**（本机只能 SwiftShader，`boot 92s / fps 44` 不可外推到真机）。
  2. 高画质档（LV=0，4× MSAA + 3500 万三角形）在软件后端跑不完，**端到端未验证**。
  3. 触摸 / 键盘 / 指针锁定三条输入路径默认全部关闭（`env.input=false`），只验证了 stage 指针 → `look()`。
  4. 设备丢失只改成回调，**没做自动重建 device**（世界重建是分钟级，重试策略应由站点决定）。
  5. 世界包围盒在 4 处重复（`math.js:54`、`shaders.js:258`、`shaders.js:715`、`world.js:362`），**当前数值一致但无编译期校验**；基线只读，本轮没去收口。改 `NX`/`VS` 而不改 WGSL 会让体雾与光柱**安静地**错位。
- **bench**：`node bench.mjs` 会起本机 Edge（headless + SwiftShader）。**软件后端跑 90 帧要几分钟**，所以它不进默认验收门，手动跑。没有 Edge/Chrome 时打印「需浏览器环境」并 0 退出。
- **目视证据**：`docs/evidence/voxel-proof.png` —— 同一次 CDP 运行里 `state: ready`、海床/海藻/鱼群/光柱齐全，上面叠着 `lighter` 混合的 2D 光点，即「L1 GL 层 + L2 canvas2d 层复合」跑通的证据。
