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
  // `/hug` 的栈：**纯 Canvas2D**（产品裁定：黄昏草原底下塞体素海洋＝两个介质）。
  // 「L0 与 L1 不能共存」是**旧裁决，已撤回**：T18 之后装配器按层序把 GL 就地合成，
  // L2 及以上的 2D 零件都能正常画在 L1 之上。所以 `/still` 可以同时装水底材与 voxel-world；
  // 唯一的事实是「不透明的 L1 会挡住 L0」（遮挡，不是分层缺陷）。
  // dandelion / boids / blow-input 还没做，先只装已有的两件；零件到位后往这里加。
  hug: {
    title: 'hug · 黄昏草原（纯 2D）',
    biome: 'field',
    seed: 20260614,
    parts: [
      'field-ground',
      { id: 'pixel-post', opts: { grain: 0.05, scanline: 0, vignette: 0.06 } },
    ],
    budgetMs: 8,
    glBlend: null,
  },
  // 唯一的 GL 站。L1 与 L0 能共存（终裁）：T18 之后就地合成，L2+ 画在 L1 之上；
  // L0 被不透明的水体遮挡是设计（0 像素），不是缺陷。
  still: {
    title: 'still · 体素海洋（L1 GL 单通道，/still 的降级档骨架）',
    biome: 'tide',
    seed: 20260901,
    parts: ['voxel-world', 'bubbles'],
    budgetMs: 8,
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
  // 出厂 `koi` 是 9.78ms > 8ms → 三件全降 low，低档的粗格子会把"条带感"放大 4 倍，
  // 所以判形态必须在**不降档**的画面上判（PM 明确要求先修这笔账）。
  'koi-nolimit': {
    title: 'koi · 不限预算（判形态用，非出厂）',
    biome: 'ink', seed: 20260312,
    parts: [
      'paper-ink',
      { id: 'ascii-field', opts: { variant: 'plain', ink: 'rgba(34,40,50,0.80)', blend: 'multiply' } },
      { id: 'pixel-post', opts: { grain: 0.02, scanline: 0, vignette: 0.10 } },
    ],
    budgetMs: 100,
    glBlend: null,
  },
  // `/koi-pond` 的栈：纸 + ASCII 水纹 + 后处理（宣纸墨点）。
  // ascii-field 用 **plain**（按行合并，0.56ms）；**keys**（GlyphAtlas，12.5ms）留给
  // "需要多色字符"的场景，它自己会超预算并被挂起 —— 见 ascii-field/README。
  koi: {
    title: 'koi · 纸 + ASCII 水纹 + 墨点（/koi-pond 的栈）',
    biome: 'ink',
    seed: 20260312,
    parts: [
      'paper-ink',
      { id: 'ascii-field', opts: { variant: 'plain', ink: 'rgba(34,40,50,0.80)', blend: 'multiply' } },
      { id: 'pixel-post', opts: { grain: 0.02, scanline: 0, vignette: 0.10 } },
    ],
    budgetMs: 8,
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
      { id: 'pixel-post', opts: { grain: 0.04, scanline: 0, vignette: 0.10 } },
    ],
    budgetMs: 8,
    glBlend: null,
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
  lines.push('const __parts = [');
  defs.forEach((def, index) => {
    // ★ 必须在这里**也**走工厂：`loadPartDefs`（Node 侧校验用）走了工厂，但浏览器 bundle
    //   曾经只取 `ns.part`，于是 presets 里的 opts 对产物**完全无效** —— 表现是
    //   `ink` 预设声明 dither bayer4，页面里跑的却是缺省快路径（costMs 1.85 而不是 3.17）。
    const opts = config.__opts?.[index];
    if (opts) {
      lines.push(`  ((__p${index}.makePart ?? __p${index}.makePixelPost)(${JSON.stringify(opts)})),`);
    } else {
      lines.push(`  (__p${index}.part ?? __p${index}.default),`);
    }
  });
  lines.push('];');
  const publicConfig = { ...config };
  delete publicConfig.__opts;
  lines.push(`boot(__parts, ${JSON.stringify(publicConfig)});`);
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
  const hasGl = defs.some((def) => (def.channel ?? 'canvas2d') === 'gl');

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
    .replace('__PREVIEW_STYLE__', () => STYLE)
    .replace('__PREVIEW_GL__', () => (hasGl ? GL_CANVAS : ''))
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
