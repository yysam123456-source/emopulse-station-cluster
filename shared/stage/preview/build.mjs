// 单文件预览构建器 —— 把「一份 composition 描述」编成「一个零外部请求的 HTML」。
//
// 为什么必须有这个东西（2026-11-18 的现状）：
//   `dist/` 已清空、0/4 样板站接线、两个预览脚本一个指向从未提交过的 `shared/stage/demo/`、
//   一个指向 gitignore 掉的 `_scratch/`。也就是说：**仓库里没有任何能打开看的页面**。
//   在补零件之前先把这条通路立起来，否则后面每个零件都是盲写 —— 写完只能说「测试绿」，
//   说不出「画面是什么样」。而且它一入库，谁接手都能一条命令复现。
//
// 为什么要入库（不放 `_scratch/`）：
//   `_scratch/` 在 .gitignore 里，等于「本机有效」。目视验收的通路如果在 gitignore 里，
//   下一个人就没有验收能力 —— 这正是上一个 `preview:field` 死掉的方式。
//
// 三条保证（都被 tests/preview-build.mjs 断言）：
//   1. 单 HTML、零外部请求：没有 src / href / <link> / <img> / @import / http(s)://
//   2. 占位符清零：产物里不残留 `__PREVIEW_*__`
//   3. 装进去的零件真的在里面：每个零件 id 都能在产物里按字面命中（防止「构建成功但零件被 tree-shake」）
//
// 一个刻意的设计：**零件清单不从这张表里读，从零件自己的声明里读**。
//   下面 PART_ENTRY 只回答「id → 入口文件」，层 / 混合模式 / 通道 / costMs 全部由
//   `loadPartDefs()` 真实 import 零件拿到，再用装配器自己的 `validateParts` / `sortParts` 校验与排序。
//   如果这里手抄一份层号表，它一定会和零件漂移 —— 那种漂移不会报错，只会让预览和真站点长得不一样。
//
// ⚠️ 已知会腐化的结构（写在这里是为了让它有到期日，而不是烂在"还能用"里）：
//   `tests/preview-build.mjs` 对**每个预设**跑同一组 5 类断言，所以断言数 ≈ 5 × 预设数。
//   14 个预设 = 556 条，其中约 400 条是同一条 × 预设数 —— 一次失败会刷 20 行，真问题会被淹掉。
//   **触发阈值：预设数 ≥ 20 时**，改成「按预设分组汇总 + 失败只列组名与首条」。
//   （同一类：`manifest.bytes`、`engine` 字段 —— 都是"已知会腐化但没有到期日"的结构。）
//
// 用法：
//   node shared/stage/preview/build.mjs                      # 默认 preset=field
//   node shared/stage/preview/build.mjs --preset empty       # 最小可跑基线（不装零件）
//   node shared/stage/preview/build.mjs --preset hug --out dist/preview/hug.html
//   node shared/stage/preview/build.mjs --list               # 列出 preset 与零件清单
import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';

/** 仓库根绝对路径（本文件在 shared/stage/preview/ 下，往上三层）。 */
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** 产物默认目录（`dist/` 已在 .gitignore 里：产物是派生物，不入库）。 */
export const DEFAULT_OUT_DIR = path.join(REPO_ROOT, 'dist', 'preview');

/** 零件 id → 入口文件（只声明入口，不声明任何元数据）。 */
export const PART_ENTRY = Object.freeze({
  'field-ground': 'shared/parts/field-ground/index.ts',
  'voxel-world': 'shared/parts/voxel-world/index.ts',
  'paper-ink': 'shared/parts/paper-ink/index.ts',
  'pixel-post': 'shared/parts/pixel-post/index.ts',
  'ascii-field': 'shared/parts/ascii-field/index.ts',
  bubbles: 'shared/parts/bubbles/index.ts',
  'tide-medium': 'shared/parts/tide-medium/index.ts',
  'koi-pond': 'shared/parts/koi-pond/index.ts',
  dandelion: 'shared/parts/dandelion/index.ts',
  boids: 'shared/parts/boids/index.ts',
  sun: 'shared/parts/sun/index.ts',
  'still-sink': 'shared/parts/still-sink/index.ts',
  'hug-meadow': 'shared/parts/hug-meadow/index.ts',
  'dawn-desk': 'shared/stage/preview/dawn-desk/index.ts',
  // A2 新增：从 Portal 的 Nebula / 深海 / 寺庙参考抽象出的可复用零件。
  nebula: 'shared/parts/nebula/index.ts',
  abyss: 'shared/parts/abyss/index.ts',
  temple: 'shared/parts/temple/index.ts',
});

/**
 * 站点 composition 预设。
 *
 * `parts` 是**零件 id 列表**，装配顺序由装配器按「层序 → z → id」自己算，
 * 这里写什么顺序都不影响结果（这正是要验证的语义之一）。
 */
export const PRESETS = Object.freeze({
  empty: {
    title: '空场景 · 最小可跑基线',
    biome: 'field',
    seed: 1,
    parts: [],
    budgetMs: 8,
    glBlend: null,
  },
  field: {
    title: 'field · 黄昏草甸',
    biome: 'field',
    seed: 20261118,
    parts: [
      'field-ground',
      { id: 'pixel-post', opts: { grain: 0.05, scanline: 0, vignette: 0.06 } },
    ],
    budgetMs: 8,
    glBlend: null,
  },
  // 只装 L0 的 field 场景。**画面门（tests/field-visual.mjs）专用**：
  // L4 的颗粒是逐像素高频噪声，会把「草色 + 局部对比」这类像素判据打成假阳性。
  // 检 L0 的画面，就让 L0 单独出镜。
  'field-l0': {
    title: 'field · 仅 L0（画面门用）',
    biome: 'field',
    seed: 20261118,
    parts: ['field-ground'],
    budgetMs: 8,
    glBlend: null,
  },
  // `/hug` 的栈：原站同构的三维蒲公英草甸（10 株 / 1335 颗 / 深橄榄绿 bokeh）。
  // 它是一件完整的 L1 world，不装 L0；画面由 GL 自己铺满，避免旧草坡在底下透出来。
  hug: {
    title: 'hug · 风的来信（三维蒲公英草甸）',
    biome: 'field',
    seed: 20260614,
    parts: ['hug-meadow'],
    budgetMs: 9,
    glBlend: null,
  },
  // `/still` 的完整栈：水底材 + 体素世界 + 气泡 + 沉水渐变 + 后处理。
  // preview 是**形态探针**，预算放到 14ms 以便看到 high 档；出厂 12ms 会按真实成本降 low。
  still: {
    title: 'still · 体素海洋（完整栈，形态探针）',
    biome: 'tide',
    seed: 20260901,
    parts: ['tide-medium', 'voxel-world', 'bubbles', 'still-sink',
      { id: 'pixel-post', opts: { grain: 0.03, scanline: 0, vignette: 0.18 } },
    ],
    budgetMs: 14,
    glBlend: null,
  },
  // `tide` 底材的**并排三版探针**（骨架版，不配门）。差异轴只有一条：色阶 + 焦散形态。
  // C 版是"减法对照"：若看完 A/B 觉得都不如 C 干净，说明这站 L0 本来就不该有焦散。
  'tide-a': {
    title: 'tide A · 沉（深蓝 / 圆斑 / 雾上浓下淡）',
    biome: 'tide', seed: 20260901,
    parts: [{ id: 'tide-medium', opts: { variant: 'A' } }],
    budgetMs: 8, glBlend: null,
  },
  'tide-b': {
    title: 'tide B · 透（青绿 / 光丝 / 雾均匀）',
    biome: 'tide', seed: 20260901,
    parts: [{ id: 'tide-medium', opts: { variant: 'B' } }],
    budgetMs: 8, glBlend: null,
  },
  'tide-c': {
    title: 'tide C · 减法对照（近灰 / 无焦散 / 四周浓）',
    biome: 'tide', seed: 20260901,
    parts: [{ id: 'tide-medium', opts: { variant: 'C' } }],
    budgetMs: 8, glBlend: null,
  },
  // 给 bench 用的探针：廉价 L0 + bubbles，隔离出 `screen` 混合的真实代价
  'bubbles-probe': {
    title: 'probe · bubbles（screen 混合实测）',
    biome: 'tide', seed: 20260901,
    parts: [{ id: 'tide-medium', opts: { variant: 'C' } }, 'bubbles'],
    budgetMs: 8, glBlend: null,
  },
  // 判形态专用：同一套栈但预算放宽（**只用于看形态，不是出厂配置**）。
  // 原件自带纸/水彩/胶片 finish；再叠 pixel-post 会压暗 real、压冷 ink。
  'koi-nolimit': {
    title: 'koi · 锦鲤池不限预算（判形态用，非出厂）',
    biome: 'ink', seed: 20260312,
    parts: ['paper-ink', 'koi-pond'],
    budgetMs: 100,
    glBlend: null,
  },
  // `/koi` 的栈：纸（unsupported 兜底）+ 完整三条渲染路径的 three.js 锦鲤池（world 通道）。
  // 旧版只保留了 ink 单风格；现在 real/paint/ink 都在零件内，由 `?style=` 或 Esc 菜单切换。
  koi: {
    title: 'koi · 纸 + 完整锦鲤池（/koi 的栈）',
    biome: 'ink',
    seed: 20260312,
    parts: ['paper-ink', 'koi-pond'],
    budgetMs: 12,
    glBlend: null,
  },
  // `/license` 的栈：L0 纸 + L4 后处理。**扫描线必须关、不做块量化** ——
  // 那一档是「转场 dissolve」的配方，用在逐帧会把纸纹整片吃掉（上一版的真实事故）。
  room: {
    title: 'room · 纸 + 后处理（/license 的栈）',
    biome: 'room',
    seed: 20261118,
    parts: [
      'paper-ink',
      { id: 'pixel-post', opts: { grain: 0, scanline: 0, vignette: 0.10 } },
    ],
    budgetMs: 8,
    glBlend: null,
  },
  // `dawn-desk` 是**预览专用探针**，不是正式站：只装 room-at-dawn 的 desk 一组（room shell + sky
  // + fixtures + exterior + plants + desk），桌面上放一张 /license 尺寸的纸。
  // 它回答「纸是不是首屏主角 / desk-only 成本 / 40 秒晨光」三件事，不接 /license。
  'dawn-desk': {
    title: 'dawn-desk · 只装 desk 一组的纸面探针',
    biome: 'room',
    seed: 20261120,
    parts: ['dawn-desk'],
    budgetMs: 20,
    glBlend: null,
    chrome: [
      '<div id="dawn-brand"><b>6:51</b><span>permit office / first light</span></div>',
      '<h1 class="sr-only">License</h1>',
      '<p class="sr-only">A permit to simply be.</p>',
      '<div id="dawn-guide" role="status" aria-live="polite"><span id="dawn-guide-text">DRAG THE STAMP TO THE PAPER</span></div>',
      '<div id="dawn-atmos" aria-hidden="true"></div>',
      '<div id="dawn-grain" aria-hidden="true"></div>',
      '<p id="dawn-note">desk only · 1410:1000 · 40s dawn · no export</p>',
      '<section id="dawn-end" aria-hidden="true"><p>NO COPY KEPT.</p><span>You may simply be.</span><button id="dawn-again" type="button" data-cue="reset">Issue another</button></section>',
    ].join(''),
    chromeStyle: [
      '#dawn-atmos{position:fixed;inset:0;z-index:1;pointer-events:none;background:radial-gradient(ellipse at 47% 46%, rgba(20,14,9,0) 44%, rgba(20,14,9,.10) 77%, rgba(18,12,8,.24) 100%),linear-gradient(90deg,rgba(255,214,164,.035),rgba(255,255,255,0) 26%,rgba(255,255,255,0) 72%,rgba(41,30,20,.055));box-shadow:inset 0 0 160px rgba(24,16,10,.14)}',
      '#dawn-grain{position:fixed;inset:0;z-index:1;pointer-events:none;opacity:.038;mix-blend-mode:soft-light;background-image:radial-gradient(circle at 18% 26%,rgba(255,255,255,.30) 0 .55px,rgba(255,255,255,0) .95px),radial-gradient(circle at 72% 64%,rgba(0,0,0,.24) 0 .5px,rgba(0,0,0,0) .88px),radial-gradient(circle at 44% 88%,rgba(255,255,255,.18) 0 .65px,rgba(255,255,255,0) 1px);background-size:3px 3px,4px 4px,6px 6px;background-position:0 0,1.2px 2px,2px .8px}',
      '#dawn-brand{position:fixed;left:28px;top:22px;z-index:2;color:#2b2721;',
      'font:12px/1.35 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.05em;',
      'text-shadow:0 1px 18px rgba(255,251,242,.92);pointer-events:none}',
      '#dawn-brand b{display:block;font:400 28px/1 Georgia,"Times New Roman",serif;letter-spacing:.01em}',
      '#dawn-brand span{display:block;margin-top:5px;color:rgba(43,39,33,.52);font-size:10.5px;text-transform:uppercase}',
      '#dawn-guide{position:fixed;left:50%;bottom:34px;transform:translateX(-50%);z-index:3;',
      'padding:11px 17px;border:1px solid rgba(64,57,46,.18);border-radius:999px;',
      'background:rgba(250,243,230,.82);color:rgba(44,39,32,.78);backdrop-filter:blur(7px);',
      'font:500 10.5px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.13em;',
      'text-transform:uppercase;pointer-events:none;transition:opacity .25s,color .25s}',
      '#dawn-guide[data-mode="quiet"]{opacity:.3}',
      '#dawn-note{position:fixed;left:28px;bottom:32px;z-index:2;margin:0;',
      'color:rgba(43,39,33,.46);font:10.5px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;',
      'letter-spacing:.06em;text-transform:uppercase;pointer-events:none}',
      '#dawn-end{position:fixed;inset:0;z-index:4;display:grid;place-content:center;text-align:center;',
      'background:rgba(6,8,11,.78);backdrop-filter:blur(9px);opacity:0;visibility:hidden;pointer-events:none;',
      'transition:opacity .55s ease,visibility .55s}',
      '#dawn-end.show{opacity:1;visibility:visible;pointer-events:auto}',
      '#dawn-end p{margin:0;color:#f4eee3;font:400 clamp(40px,5.2vw,68px)/1.1 Georgia,"Times New Roman",serif;',
      'letter-spacing:.055em;text-transform:uppercase;text-shadow:0 2px 24px rgba(0,0,0,.4)}',
      '#dawn-end span{display:block;margin-top:18px;color:rgba(244,238,227,.66);',
      'font:400 14px/1.5 Georgia,"Times New Roman",serif;letter-spacing:.05em}',
      '#dawn-again{margin:34px auto 0;min-height:46px;padding:0 22px;border:1px solid rgba(238,230,216,.4);',
      'border-radius:999px;background:transparent;color:#f4eee3;cursor:pointer;',
      'font:500 10.5px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.14em;',
      'text-transform:uppercase;transition:background .2s,border-color .2s}',
      '#dawn-again:hover{background:rgba(244,238,227,.10);border-color:rgba(244,238,227,.72)}',
      '#dawn-again:focus-visible{outline:2px solid #f4eee3;outline-offset:3px}',
      '.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;',
      'clip:rect(0,0,0,0);white-space:nowrap;border:0}',
      '@media(max-width:600px){#dawn-brand{left:16px;top:14px}#dawn-brand b{font-size:22px}',
      '#dawn-brand span{display:none}#dawn-note{display:none}#dawn-guide{bottom:18px;font-size:9.5px;',
      'padding:10px 14px;max-width:calc(100vw - 32px);white-space:normal;text-align:center}',
      '#dawn-end p{font-size:36px}#dawn-end span{font-size:12px}#dawn-again{margin-top:26px}#dawn-grain{opacity:.032}}',
    ].join(''),
  },
  // 同一份零件栈换 biome + 换 seed + 换后处理性格：用来确认「配色/观感确实由站点参数驱动」。
  ink: {
    title: 'ink · 纸 + 后处理（/koi-pond 的栈，宣纸墨点）',
    biome: 'ink',
    seed: 20260312,
    parts: [
      'paper-ink',
      { id: 'pixel-post', opts: { grain: 0.02, scanline: 0, vignette: 0.10 } },
    ],
    budgetMs: 8,
    glBlend: null,
  },
  // A2 深海：L0 程序化海沟 + L2 气泡 + L3 沉水渐变 + L4 后处理。
  // 不装 GL 世界，避免和 `still` 的 voxel 抢同一个 GL 画布。
  'a2-deepsea': {
    title: 'A2 deepsea · 深海光柱（abyss 零件栈）',
    biome: 'tide',
    seed: 20261123,
    parts: [
      { id: 'abyss', opts: { palette: 'abyss', density: 1.1, rays: 0.62, caustics: 0.34 } },
      'bubbles',
      'still-sink',
      { id: 'pixel-post', opts: { grain: 0.035, scanline: 0, vignette: 0.20 } },
    ],
    budgetMs: 10,
    glBlend: null,
  },
  // A2 星系：深海底材 + 四旋臂粒子（GL）+ 后处理。单 GL，符合 Stage 约束。
  'a2-nebula': {
    title: 'A2 nebula · 四旋臂星系（nebula 零件栈）',
    biome: 'tide',
    seed: 20261123,
    parts: [
      { id: 'abyss', opts: { palette: 'abyss', density: 0.8, rays: 0.35, caustics: 0.2 } },
      { id: 'nebula', opts: { palette: 'abyss', density: 1, scale: 1, speed: 0.85, pulse: 0.55 } },
      { id: 'pixel-post', opts: { grain: 0.03, scanline: 0, vignette: 0.18 } },
    ],
    budgetMs: 12,
    glBlend: null,
  },
  // A2 寺庙：写实模块清单装配。GL 零件自带天空与后处理，所以不再叠 abyss / pixel-post。
  'a2-temple': {
    title: 'A2 temple · 晨光山门（写实模块装配）',
    biome: 'room',
    seed: 20261123,
    parts: [
      { id: 'temple', opts: { scene: 'dawn', fog: 1, lanterns: 0.82, orbit: 0.7, torii: true, pines: true } },
    ],
    budgetMs: 14,
    glBlend: null,
  },
  // 同一套零件库的第二次装配：去掉主殿，只留山门/石灯/松林/苔庭。
  // 它证明 temple 不是一个固定整场景，而是 ScenePlan + 模块开关。
  'a2-gate': {
    title: 'A2 gate · 独立山门（同一零件库重装）',
    biome: 'room',
    seed: 20261123,
    parts: [
      { id: 'temple', opts: { scene: 'gate', fog: 1, lanterns: 0.9, orbit: 0.6, hall: false } },
    ],
    budgetMs: 12,
    glBlend: null,
  },
});

/** 页面样式。零外部资源：字体只用系统栈，不引任何 URL。 */
const STYLE = [
  'html,body{margin:0;padding:0;height:100%;background:#07080c;overflow:hidden}',
  'body{color:#cfd6e4;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}',
  '#stage,#gl{position:fixed;left:0;top:0;width:100%;height:100%;display:block}',
  // GL 画布只负责"被读走"，不负责"被看见"：装配器按层序把它就地合成进主画布（T18）。
  // 放在最底层 + 无混合模式，保证它不会以任何方式透到主画布上面。
  '#gl{z-index:-1;pointer-events:none}',
  '#dbg{position:fixed;left:8px;bottom:8px;z-index:2;max-width:min(94vw,760px);',
  'padding:6px 9px;border-radius:4px;background:rgba(8,10,16,.74);',
  'border:1px solid rgba(120,140,180,.22);white-space:pre-wrap;pointer-events:none}',
  '#boot-error{position:fixed;left:8px;top:8px;z-index:3;max-width:92vw;padding:8px 10px;',
  'background:rgba(80,12,16,.92);border:1px solid rgba(255,120,120,.45);',
  'color:#ffd7d7;border-radius:4px;white-space:pre-wrap}',
  'body[data-state=failed] #dbg{display:none}',
  'body.clean #dbg{display:none}',
  '__PREVIEW_CHROME_STYLE__',
].join('');

/** GL 画布片段（只有装配里真有 gl 通道零件时才出现）。 */
const GL_CANVAS = '<canvas id="gl" aria-hidden="true"></canvas>';

/** HTML 模板。占位符个数固定，渲染后必须清零。 */
const TEMPLATE = [
  '<!DOCTYPE html>',
  '<html lang="zh-CN">',
  '<head>',
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1">',
  '<title>__PREVIEW_TITLE__</title>',
  '<!-- __PREVIEW_META__ -->',
  '<style>__PREVIEW_STYLE__</style>',
  '</head>',
  '<body data-state="booting">',
  '<canvas id="stage" aria-hidden="true"></canvas>',
  '__PREVIEW_GL__',
  '__PREVIEW_CHROME__',
  '<div id="dbg" role="status">state booting</div>',
  '<div id="boot-error" hidden></div>',
  '<script>__PREVIEW_BOOT__</script>',
  '</body>',
  '</html>',
].join('\n');

/**
 * 把绝对路径转成可安全嵌进生成代码的 ESM 说明符。
 *
 * 为什么不能直接插值：Windows 路径含反斜杠，`import ... from 'C:\Users\x'` 里的 `\2`
 * 会被 JS 引擎当八进制转义吃掉。tests/lib/load-ts.mjs 里记着这条事故的完整来龙去脉，
 * 这里用同一手法（POSIX 化 + JSON.stringify）。
 *
 * @param {string} absPath 绝对路径
 * @returns {string} 带双引号的说明符字面量
 */
function toSpecifier(absPath) {
  return JSON.stringify(absPath.split(path.sep).join('/'));
}

/**
 * 解析 preset 名，并校验零件 id 都登记过。
 *
 * @param {string} name preset 名
 * @returns {{ name: string, title: string, biome: string, seed: number, parts: string[], budgetMs: number, glBlend: string|null }}
 */
export function resolvePreset(name) {
  const preset = PRESETS[name];
  if (!preset) {
    throw new Error(
      `未知 preset：${name}（可用：${Object.keys(PRESETS).join(', ')}）`,
    );
  }
  // parts 里的每一项允许两种写法：字符串（缺省参数）或 { id, opts }（站点参数）
  const parts = preset.parts.map((entry) => {
    const id = typeof entry === 'string' ? entry : entry && entry.id;
    if (!PART_ENTRY[id]) {
      throw new Error(
        `preset ${name} 引用了未登记的零件 id：${String(id)}（PART_ENTRY 里有：${Object.keys(PART_ENTRY).join(', ')}）`,
      );
    }
    return typeof entry === 'string' ? { id, opts: null } : { id, opts: entry.opts ?? null };
  });
  return { name, ...preset, parts };
}

/**
 * 真实 import 零件，拿到它们的声明（层 / 混合模式 / 通道 / costMs / id）。
 *
 * 每项允许 `{ id, opts }`：零件若导出了工厂（如 `makePixelPost`），用工厂按站点参数造实例；
 * 否则退回 `part` / `default`。**工厂造出来的 id 必须与登记表一致** —— 装配器的 id 唯一性、
 * 层内排序、以及测试里 `html.includes(id)` 全靠它。
 *
 * 为什么要走 esbuild + data URL 而不是 `tsx`：
 *   `tsx` 不是依赖；esbuild 已是既有 devDependency，且 tests/lib/load-ts.mjs 用的是同一手法，
 *   两处一致意味着「构建器看到的零件」与「测试看到的零件」是同一份模块语义。
 *
 * @param {string[]} ids 零件 id 列表
 * @returns {Promise<{ defs: object[], validateParts: Function, sortParts: Function }>}
 */
export async function loadPartDefs(entries) {
  const lines = [];
  entries.forEach((entry, index) => {
    const id = typeof entry === 'string' ? entry : entry.id;
    const entryPath = path.join(REPO_ROOT, PART_ENTRY[id]);
    lines.push(`export * as __part${index} from ${toSpecifier(entryPath)};`);
  });
  // 装配器自己的校验与排序 —— 构建期就报错，而不是等到浏览器里白屏
  lines.push(`export { validateParts, sortParts } from ${toSpecifier(path.join(REPO_ROOT, 'shared/stage/index.ts'))};`);

  const built = buildSync({
    stdin: {
      contents: lines.join('\n'),
      resolveDir: REPO_ROOT,
      loader: 'ts',
      sourcefile: 'preview-metadata.ts',
    },
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    target: 'node18',
    logLevel: 'silent',
    legalComments: 'none',
  });

  const code = built.outputFiles[0].text;
  const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

  const defs = entries.map((entry, index) => {
    const id = typeof entry === 'string' ? entry : entry.id;
    const opts = typeof entry === 'string' ? null : entry.opts ?? null;
    const ns = mod[`__part${index}`];
    // 工厂优先：pixel-post 这类「观感由站点拥有」的零件必须能按站点参数造
    // 工厂约定：优先 `makePart`（统一名），兼容早期的 `makePixelPost`
    const factory = ns?.makePart ?? ns?.makePixelPost;
    const made = typeof factory === 'function' && opts ? factory(opts) : null;
    const def = made ?? ns?.part ?? ns?.default;
    if (!def || typeof def !== 'object') {
      throw new Error(`零件 ${id} 没有导出 part（或 default）：${PART_ENTRY[id]}`);
    }
    if (def.id !== id) {
      throw new Error(`零件 ${id} 的入口导出的 id 是 ${String(def.id)} —— 登记表与零件不一致，先修表再构建`);
    }
    return def;
  });

  return { defs, validateParts: mod.validateParts, sortParts: mod.sortParts };
}

/**
 * 生成浏览器侧入口源码（esbuild 的 stdin）。
 *
 * @param {object[]} defs 零件定义（用其 id 回查入口）
 * @param {object} config 预览配置
 * @returns {string} TS 源码
 */
function bootSource(defs, config) {
  const lines = [
    `import { boot } from ${toSpecifier(path.join(REPO_ROOT, 'shared/stage/preview/host.ts'))};`,
  ];
  defs.forEach((def, index) => {
    lines.push(`import * as __p${index} from ${toSpecifier(path.join(REPO_ROOT, PART_ENTRY[def.id]))};`);
  });
  // 运行期参数：query 是 Studio 的现场调参，__EMBEDDED_PARAMS__ 是导出文件自带的固化值。
  // 两者都在零件工厂之前合并，所以 `?palette=` 不是装饰，真的会改零件 opts。
  lines.push('function __coerce(v){');
  lines.push('  if (v === "1" || v === "true") return true;');
  lines.push('  if (v === "0" || v === "false") return false;');
  lines.push('  if (typeof v === "string" && v !== "" && Number.isFinite(Number(v))) return Number(v);');
  lines.push('  return v;');
  lines.push('}');
  lines.push('function __queryValues(){');
  lines.push('  const out = {};');
  lines.push('  try {');
  lines.push('    for (const [k, v] of new URLSearchParams(location.search)) out[k] = __coerce(v);');
  lines.push('  } catch { /* file:// 假 DOM 下没有 location.search */ }');
  lines.push('  return out;');
  lines.push('}');
  lines.push('const __initialValues = Object.assign({}, __queryValues(), globalThis.__EMBEDDED_PARAMS__ || {});');
  lines.push('delete __initialValues.quality; delete __initialValues.clean; delete __initialValues.debug;');
  lines.push('function __makeParts(values){');
  lines.push('  const V = Object.assign({}, __initialValues, values || {});');
  lines.push('  return [');
  defs.forEach((def, index) => {
    const opts = config.__opts?.[index] ?? null;
    const factory = `(__p${index}.makePart ?? __p${index}.makePixelPost)`;
    if (opts) {
      // 工厂优先；没有工厂时退回 part，不能生成 `(undefined)(opts)`。
      lines.push(`    (${factory} ? ${factory}(Object.assign({}, ${JSON.stringify(opts)}, V)) : (__p${index}.part ?? __p${index}.default)),`);
    } else {
      // 没有 preset opts 的零件也可能有工厂；参数是模板级的，仍应交给它自己忽略未知键。
      lines.push(`    (${factory} ? ${factory}(V) : (__p${index}.part ?? __p${index}.default)),`);
    }
  });
  lines.push('  ];');
  lines.push('}');
  lines.push('const __parts = __makeParts(null);');
  const publicConfig = { ...config };
  delete publicConfig.__opts;
  lines.push(`boot(__parts, ${JSON.stringify(publicConfig)}, __makeParts);`);
  return lines.join('\n');
}

/**
 * 构建一个预览页。
 *
 * @param {object} [options]
 * @param {string} [options.preset] preset 名
 * @param {number} [options.seed] 覆盖种子
 * @param {number} [options.width] 名义视口宽（只用于报告）
 * @param {number} [options.height] 名义视口高
 * @param {number} [options.budgetMs] 覆盖帧预算
 * @param {string|null} [options.glBlend] 覆盖 2D/GL 整体混合模式
 * @param {boolean} [options.minify] 是否压缩（默认 true；调试时用 false）
 * @param {string|null} [options.out] 写盘路径；null = 不写盘（测试用）
 * @returns {Promise<{ html: string, bytes: number, preset: string, order: string[], hasGl: boolean, outPath: string|null, sourceBytes: number }>}
 */
export async function buildPreview(options = {}) {
  const preset = resolvePreset(options.preset ?? 'field');
  const seed = Number.isFinite(options.seed) ? options.seed : preset.seed;
  const budgetMs = Number.isFinite(options.budgetMs) ? options.budgetMs : preset.budgetMs;
  const glBlend = options.glBlend === undefined ? preset.glBlend : options.glBlend;
  const nominalWidth = Number.isFinite(options.width) ? options.width : 1280;
  const nominalHeight = Number.isFinite(options.height) ? options.height : 720;
  const minify = options.minify !== false;

  const { defs, validateParts, sortParts } = await loadPartDefs(preset.parts);  // [{id,opts}]，见 resolvePreset
  // 装配器自己的校验：重复 id / 双层 L4 / 两个 gl 通道 / 混合模式白名单 / costMs 合法
  validateParts(defs);
  const order = sortParts(defs).map((def) => def.id);
  const hasGl = defs.some((def) => {
    const channel = def.channel ?? 'canvas2d';
    return channel === 'gl' || channel === 'world';
  });

  const config = {
    title: preset.title,
    biome: preset.biome,
    seed,
    budgetMs,
    glBlend,
    hasGl,
    nominalWidth,
    nominalHeight,
    // 每个零件的站点参数（与 defs 同序）。宿主不读它，只有 bootSource 用它生成工厂调用；
    // 生成完就删掉，别把内部细节塞进页面的 config。
    __opts: preset.parts.map((item) => item.opts ?? null),
  };

  const source = bootSource(defs, config);
  const bundled = buildSync({
    stdin: {
      contents: source,
      resolveDir: REPO_ROOT,
      loader: 'ts',
      sourcefile: 'preview-entry.ts',
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    target: 'es2022',
    minify,
    legalComments: 'none',
    logLevel: 'silent',
  });
  const script = bundled.outputFiles[0].text.trim();
  const sourceBytes = Buffer.byteLength(script, 'utf8');

  // `<script>` 里出现 `</script>` 会提前闭合标签（零件里目前没有，但这是一条不值得赌的边界）
  if (script.includes('</script')) {
    throw new Error('打包产物含 `</script`，内联会截断脚本；请检查零件里是否写了 HTML 片段');
  }

  const meta = [
    `composition: ${preset.name}`,
    `parts: ${order.length === 0 ? '(none)' : order.join(' ')}`,
    `biome: ${preset.biome}`,
    `seed: ${seed}`,
    `budget: ${budgetMs}ms`,
    `nominal-viewport: ${nominalWidth}x${nominalHeight}`,
    'generated-by: shared/stage/preview/build.mjs',
  ].join(' | ');

  const html = TEMPLATE
    .replace('__PREVIEW_TITLE__', () => `${preset.title} · ${preset.name}`)
    .replace('__PREVIEW_META__', () => meta)
    .replace('__PREVIEW_STYLE__', () => STYLE.replace('__PREVIEW_CHROME_STYLE__', preset.chromeStyle ?? ''))
    .replace('__PREVIEW_GL__', () => (hasGl ? GL_CANVAS : ''))
    .replace('__PREVIEW_CHROME__', () => preset.chrome ?? '')
    .replace('__PREVIEW_BOOT__', () => script);

  let outPath = null;
  if (options.out !== null && options.out !== undefined) {
    outPath = options.out;
  } else if (options.write === true) {
    outPath = path.join(DEFAULT_OUT_DIR, `${preset.name}.html`);
  }
  if (outPath) {
    mkdirSync(path.dirname(outPath), { recursive: true });
    writeFileSync(outPath, html, 'utf8');
  }

  return {
    html,
    bytes: Buffer.byteLength(html, 'utf8'),
    preset: preset.name,
    order,
    hasGl,
    outPath,
    sourceBytes,
  };
}

/**
 * 命令行入口。
 *
 * @returns {Promise<void>}
 */
/** 所有合法参数（含是否带值）。未知参数一律报错退出 —— 见 main() 的注释。 */
const FLAGS = Object.freeze({
  '--preset': true,
  '--out': true,
  '--seed': true,
  '--width': true,
  '--height': true,
  '--budget': true,
  '--gl-blend': true,
  '--readable': false,
  '--list': false,
  '--help': false,
});

/** 用法说明。 */
const USAGE = [
  '用法：node shared/stage/preview/build.mjs [选项]',
  '',
  '  --preset <name>    预设（默认 field；--list 看全部）',
  '  --out <path>       输出路径（默认 dist/preview/<preset>.html）',
  '  --seed <n>         覆盖站点种子',
  '  --width <n>        名义视口宽（只用于报告，不锁页面尺寸）',
  '  --height <n>       名义视口高',
  '  --budget <ms>      帧预算（默认取预设值 8ms）',
  '  --gl-blend <mode>  2D/GL 整体混合模式（缺省不设）',
  '  --readable         不压缩（调试用）',
  '  --list             列出预设',
  '  --help             显示本说明',
].join('\n');

async function main() {
  let argv = process.argv.slice(2);

  // ★ 未知参数必须报错。上一版会把 `--help` 当 preset 名查，查不到再 fallback 到 field 并**真的构建**——
  //   「我明明传了参数但它没生效」比崩溃难查一个数量级。宁可退出码 2。
  const unknown = argv.filter((token) => token.startsWith('--') && !(token in FLAGS));
  if (unknown.length > 0) {
    console.error(`[preview] 未知参数：${unknown.join(' ')}\n\n${USAGE}`);
    process.exit(2);
  }
  if (argv.includes('--help')) {
    console.log(USAGE);
    return;
  }
  argv = argv.filter((token) => token !== '--help');
  const flag = (name, fallback) => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 && argv[index + 1] !== undefined ? argv[index + 1] : fallback;
  };
  const numberFlag = (name, fallback) => {
    const raw = flag(name, null);
    const value = raw === null ? NaN : Number(raw);
    return Number.isFinite(value) ? value : fallback;
  };

  if (argv.includes('--list')) {
    for (const [name, preset] of Object.entries(PRESETS)) {
      const parts = preset.parts.length === 0
        ? '(none)'
        : preset.parts.map((item) => (typeof item === 'string' ? item : `${item.id}${item.opts ? '*' : ''}`)).join(', ');
      console.log(`  ${name.padEnd(8)} biome=${preset.biome.padEnd(6)} seed=${String(preset.seed).padEnd(9)} parts=${parts}`);
    }
    return;
  }

  const preset = flag('preset', 'field');
  const out = flag('out', path.join(DEFAULT_OUT_DIR, `${preset}.html`));
  const result = await buildPreview({
    preset,
    seed: numberFlag('seed', undefined),
    width: numberFlag('width', undefined),
    height: numberFlag('height', undefined),
    budgetMs: numberFlag('budget', undefined),
    glBlend: flag('gl-blend', undefined),
    minify: !argv.includes('--readable'),
    out,
  });

  const check = statSync(out);
  console.log(`[preview] preset=${result.preset}  parts=${result.order.length === 0 ? '(none)' : result.order.join(',')}  gl=${result.hasGl}`);
  console.log(`[preview] 脚本 ${result.sourceBytes} B → 单文件 ${result.bytes} B（盘上 ${check.size} B）`);
  console.log(`[preview] 输出 ${path.relative(REPO_ROOT, out)}`);
  console.log('[preview] 打开方式：浏览器直接开这个文件（file://），不需要服务器，不产生任何外部请求');
}

// 只在被当作脚本直接执行时跑 CLI；被 import 时（测试）不跑
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[preview] 构建失败：${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
