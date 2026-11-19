// 站点构建器 —— 把「一个站」编成 `dist/<slug>/index.html`（单文件、零外部请求）。
//
// 与 `shared/stage/preview/build.mjs` 的分工：
//   · preview 是**零件探针**（14 个预设，给我和 PM 看零件长什么样）
//   · 这里是**站点**（4 个 slug，给用户看；有壳、有 L5 位置、有 Esc 菜单、有主按钮）
// 两条都复用同一套：真实 import 零件 → 装配器自己校验排序 → esbuild 打成 IIFE → 内联进单 HTML。
//
// ★ 单域名按路径分站（用户拍板的产品前提）：
//   产物是 `dist/<slug>/index.html`，`serve.mjs` 把 `/hug` 映射到 `/hug/index.html`。
//   没有子域名、没有跨站跳转。
//
// ★ 零外部请求是硬要求，由 `tests/site-build.mjs` 断言（和 preview 一样：无 src/href/http）。
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import { loadPartDefs } from '../stage/preview/build.mjs';
import { COPY, UI } from './copy.mjs';

/** 仓库根（本文件在 shared/sites/ 下，往上两层）。 */
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** 产物目录。 */
export const DIST_DIR = path.join(REPO_ROOT, 'dist');

/**
 * 四个站。
 *
 * `parts` 与 preview 的 preset 同构（字符串或缺省参数 / `{ id, opts }`）。
 * ⚠️ 零件尚未做完的站，这里只装已有的；缺的零件在该站开工时补进 `parts`。
 */
export const STATIONS = Object.freeze({
  license: {
    slug: 'license',
    title: COPY.license.h1,
    lead: COPY.license.hook,
    cta: COPY.license.ctaCopy,   // 'Stamp it'：盖章是站点作用域的因果（不是世界注入）
    ctaChannel: 'ui',
    /** 站内接线模块（只有 /license 有） */
    attach: 'sites/license/index.ts',
    /** 站内专用 DOM：纸框（可折角）/ 光层（--sun-angle）/ 阶段词 / 章 / 保存 */
    extra: [
      '<div id="sheet" aria-hidden="true"></div>',
      // 折角的那一面：纸角翻起来露出的背面（三角形 + 折痕阴影）。默认 opacity:0。
      '<div id="fold-flap" aria-hidden="true"></div>',
      '<div id="sun" aria-hidden="true"></div>',
      '<div id="stage-word" role="status" data-stage="idle" hidden></div>',
      // 许可证正文：定稿要求屏幕上的纸就是一张许可证，而不只是一张有标题的空纸。
      //
      // ★ 哪些内容"盖章前就在"，是语义问题不是视觉问题：
      //   编号与日期是**开票时打印上去的**（这张纸一出生就有编号），
      //   盖章只授予一件事 —— 红章与章下那句 "NO COPY KEPT."。
      //   早前把编号/日期也押到 approved 之后，代价是用户在盖章前看到的
      //   只是一张空纸 + 一个悬浮按钮（"啥都没有"），而且语义也说不通。
      '<div id="cert" aria-live="polite">',
      '<div id="cert-title">__CERT_TITLE__</div>',
      // 页眉下的印刷细线：没有它，标题/宣言/编号是"悬在纸上的一段文字"；
      // 有它，纸才读作一张**有版式**的表单。纯装饰，不承载任何文案。
      '<div id="cert-rule" aria-hidden="true"></div>',
      '<p id="cert-declaration">__CERT_DECLARATION__</p>',
      '<div id="cert-serial"><span class="cert-label">__CERT_SERIAL_LABEL__</span> <span id="cert-serial-value" class="cert-value"></span></div>',
      '<div id="cert-date"></div>',
      '<div id="cert-seal-sub" hidden>__CERT_SEAL_SUB__</div>',
      '</div>',
      '<div id="seal" aria-hidden="true">__SEAL_TEXT__</div>',
      // 纸角的二级提示（COPY-SITES §3 定稿「Stamp again」位置）：盖章完成后才出现，
      // 低对比、不做成按钮外观 —— 它是"这张桌子是活的"的暗示，不是功能菜单。
      // ⚠️ 动作词（__PLAY_NOTE__）在 COPY 里，不许在这里现编：上一版这行是我手写编的，
      //    它宣传的两个动作当时几乎没有可见效果 —— "文字在，效果不在"。
      '<div id="play-hint" hidden>',
      '<button id="again" type="button" data-channel="ui">__AGAIN_LABEL__</button>',
      '<span class="play-note">__PLAY_NOTE__</span>',
      '</div>',
      '<button id="save" type="button" data-channel="ui" hidden>__SAVE_LABEL__</button>',
    ].join(''),
    biome: 'room',
    seed: 20261118,
    budgetMs: 8,
    /**
     * 带走物尺寸。**必须与屏上纸同比例**（`paper-ink` 的 `SHEET_ASPECT`）：
     * cover 裁切横帧到竖版时，比例不一致会把纸左右各切掉一截，章可能落出画外 —— 那种失败不报错。
     * `tests/site-build.mjs` 会断言这个数与零件常量一致。
     */
    exportSize: { w: 1410, h: 1000 },
    /** 这一站的 L0 画的是"一张纸"：L5 文案必须落在纸**内**，不能飘到桌面上 */
    paperSheet: true,
    parts: [
      'paper-ink',
      { id: 'pixel-post', opts: { grain: 0.04, scanline: 0, vignette: 0.08 } },
    ],
  },
  hug: {
    slug: 'hug',
    title: COPY.hug.h1,
    lead: COPY.hug.hook,
    // /hug 的唯一 CTA：点它 = 放走（世界收到**一次**按下，由壳注入）
    cta: COPY.hug.cta,
    ctaChannel: 'world-inject',
    biome: 'field',
    seed: 20260614,
    budgetMs: 8,
    parts: [
      'field-ground',
      { id: 'pixel-post', opts: { grain: 0.05, scanline: 0, vignette: 0.06 } },
    ],
  },
  still: {
    slug: 'still',
    title: COPY.still.h1,
    lead: COPY.still.hook,
    cta: null,
    biome: 'tide',
    seed: 20260901,
    budgetMs: 8,
    parts: ['voxel-world', 'bubbles'],
  },
  koi: {
    slug: 'koi',
    title: COPY.koiPond.h1,
    lead: COPY.koiPond.hook,
    cta: null,
    biome: 'ink',
    seed: 20260312,
    budgetMs: 8,
    paperSheet: true,
    parts: [
      'paper-ink',
      { id: 'ascii-field', opts: { variant: 'plain', ink: 'rgba(34,40,50,0.80)', blend: 'multiply' } },
      { id: 'pixel-post', opts: { grain: 0.02, scanline: 0, vignette: 0.14 } },
    ],
  },
});

/** 页面样式。零外部资源：字体只用系统栈。 */
const STYLE = [
  ':root{--veil:#0a0c10;--ink:#e8eef5;--dim:#9aa7b8}',
  'html,body{margin:0;padding:0;height:100%;background:var(--veil);overflow:hidden}',
  'body{color:var(--ink);font:14px/1.6 ui-serif,Georgia,"Songti SC",serif}',
  '#stage,#gl{position:fixed;left:0;top:0;width:100%;height:100%;display:block}',
  '#gl{z-index:-1;pointer-events:none}',
  // 主按钮是页面上唯一"像按钮"的东西：草地本身不得有任何可点外观
  // 主按钮必须是页面上**唯一能被找到**的可点物：草地本身不得有任何可点外观。
  // 第一版只给了 1px 半透明描边，压在亮草地上几乎看不见（截图发现）—— 所以给它一层暗底。
  // L5 的位置规则：**这一站有纸就落在纸内，没有纸才用视口边距**。
  // 第一版写死在 `left:5vw;bottom:6vh`，结果文案压在桌面角落、贴画幅左缘 —— 那是"桌子上的字"，不是"纸上的字"。
  '#h1{position:fixed;z-index:3;margin:0;font-weight:400;font-size:clamp(22px,3.2vw,34px);',
  'letter-spacing:.01em;color:var(--ink)}',
  'body[data-sheet=off] #h1{left:5vw;top:12vh}',
  'body[data-sheet=on] #h1{left:calc(var(--sheet-x) + var(--sheet-w)*0.075);',
  'top:calc(var(--sheet-y) + var(--sheet-h)*0.13);color:rgba(52,42,32,.92);',
  'text-shadow:0 1px 2px rgba(250,248,242,.55)}',
  '.menu-title{font-size:11px;letter-spacing:.22em;color:var(--dim);margin-bottom:10px}',
  '.menu-item{display:block;width:100%;text-align:left;background:none;border:0;color:var(--ink);',
  'font:inherit;font-size:13px;padding:5px 0;cursor:pointer}',
  '.menu-item:hover{color:#fff}',
  '.menu-value{color:var(--dim);font-size:12px}',
  '.menu-privacy{margin-top:10px;font-size:11px;color:var(--dim)}',
  '#lead{position:fixed;z-index:3;margin:0;',
  'color:rgba(232,238,245,.82);font-size:15px;line-height:1.5;letter-spacing:.01em}',
  // L5 文字压在"有内容的画布"上（草地 / ASCII 水纹）时，靠**柔和描边**而不是底色块：
  // 加底会把文字变成贴纸，而这一站的红线是"文字属于纸/场景"。描边只提高可读性，不改变语义。
  'body[data-sheet=off] #lead{left:5vw;bottom:6vh;max-width:44ch;',
  'text-shadow:0 1px 3px rgba(0,0,0,.6),0 0 12px rgba(0,0,0,.35)}',
  // 纸内文字用深墨（纸是亮的），与桌面上的浅字分开。
  // 这条声明必须并进 sheet-on 的 #lead 规则里 —— 它曾作为孤立声明单独成行（带 }），
  // 让 CSS 解析器吞掉后面的 #cta 规则，CTA 退回 static 跑到 (0,0) 被 canvas 盖住，肉眼看不见。
  'body[data-sheet=on] #lead{left:calc(var(--sheet-x) + var(--sheet-w)*0.075);',
  'top:calc(var(--sheet-y) + var(--sheet-h)*0.80);max-width:calc(var(--sheet-w)*0.62);',
  'text-shadow:0 1px 2px rgba(250,248,242,.55);color:rgba(58,48,38,.82)}',
  '#cta{position:fixed;left:50%;bottom:11.5vh;transform:translateX(-50%);z-index:3;',
  'background:rgba(10,12,16,.46);border:1px solid rgba(232,238,245,.72);border-radius:999px;',
  'color:var(--ink);font:inherit;font-size:15px;letter-spacing:.06em;padding:.72em 1.9em;',
  'cursor:pointer;box-shadow:0 2px 18px rgba(0,0,0,.35)}',
  '#cta[hidden]{display:none}',
  '#cta:hover{border-color:var(--ink)}',
  '#cta:focus-visible{outline:2px solid var(--ink);outline-offset:3px}',
  '#menu{position:fixed;right:2vw;top:2vh;z-index:4;padding:14px 18px;border-radius:6px;',
  'background:rgba(10,12,16,.88);border:1px solid rgba(232,238,245,.18);font-size:13px}',
  '#menu[hidden]{display:none}',
  // 调试条是**开发工具**，默认不显示：它第一版会压住站点文案（截图发现），而且它不该属于产品。
  // 需要时加 `?debug` 打开。
  '#dbg{display:none;position:fixed;left:8px;bottom:8px;z-index:2;max-width:min(94vw,760px);',
  'padding:6px 9px;border-radius:4px;background:rgba(8,10,16,.72);',
  'border:1px solid rgba(120,140,180,.22);font:11px/1.5 ui-monospace,Menlo,monospace;',
  'white-space:pre-wrap;pointer-events:none;color:var(--dim)}',
  'body[data-debug=on] #dbg{display:block}',
  // ── /license 的站内叠层（纸框 / 光 / 阶段词 / 章 / 保存）──
  // 它们都是 DOM 叠在画布之上：L5 走 DOM，所以这些不占 `costMs`、不需要每帧重绘。
  'body[data-sheet=on] #sheet{position:fixed;left:var(--sheet-x);top:var(--sheet-y);',
  'width:var(--sheet-w);height:var(--sheet-h);z-index:1;pointer-events:none;',
  'box-shadow:inset 0 0 0 1px rgba(120,100,80,.25)}',
  // ★ 折角**不许**用 transform 转 #sheet。上一版就是 `transform:rotate(var(--fold))`，
  //   而 #sheet 只是一个空 div + 1px inset 边框，于是"折角"的实际效果是
  //   **一条 1px 斜线划过整张纸**（穿过正文），纸本身没动 —— 既不像折角，还像渲染故障。
  //   折角必须是一个**看得见的面**：纸角被翻起来的背面 + 折痕阴影。
  //   ★ 对比度是这件的全部难点：第一版用了 #f8f3e8→#b6a687（都是浅纸色），
  //   实测纸角差异 mean 3.33 ≈ 噪声 3.43 —— 三角形**画了，但看不出来**。
  //   纸的背面必须比正面明显更深，折痕必须有影，否则读者只会觉得"角落有点脏"。
  '#fold-flap{position:fixed;z-index:1;pointer-events:none;',
  'left:calc(var(--sheet-x) + var(--sheet-w) - 128px);top:calc(var(--sheet-y) + var(--sheet-h) - 128px);',
  'width:128px;height:128px;opacity:0;transition:opacity .22s ease;',
  //   方向要物理对：折起来的那一面，**贴折痕处最暗**（离开桌面、被折痕挡住光），
  //   翘起的尖端略暗一点（纸往下卷）—— 中间才是同一批纸的背面本色。
  //   上一版把尖端做成 #fbf6ea（比被阴影压暗的纸面亮得多），读起来像"角落漏光"。
  // ★ 必须**半透明着色**，不能刷不透明色。纸是画布画的，四角被像素后处理的暗角压着；
  //   不透明色等于把暗角抹掉 —— 于是折角永远比周围亮，读作"角落漏光"（实测了三版）。
  //   半透明色让纸自己的明暗透上来，折角才和纸是一体的。
  'background:linear-gradient(135deg,rgba(64,44,22,.78) 0%,rgba(122,98,62,.50) 6%,',
  'rgba(255,253,248,.66) 21%,rgba(252,245,229,.56) 52%,rgba(122,98,62,.42) 100%);',
  'clip-path:polygon(100% 0,100% 100%,0 100%);',
  'filter:drop-shadow(-3px -3px 4px rgba(40,26,10,.62)) drop-shadow(-11px -11px 17px rgba(40,26,10,.30))}',
  // ★ z-index 是这一件的关键：折角必须**排在光层之下**（z1 < 光的 z2），
  //   这样同一束阴影也压在它身上，它的明暗才跟纸一致；放在光之上就会变成一块亮斑。
  'body[data-fold=on] #fold-flap{opacity:1}',
  'body[data-sheet=on] #sun{position:fixed;left:var(--sheet-x);top:var(--sheet-y);',
  'width:var(--sheet-w);height:var(--sheet-h);z-index:2;pointer-events:none;',
  // 光要**看得见**才叫"拖光"。第一版：soft-light + 两端 0.55 不透明度，
  // 实测满量程拖动的整纸像素差 mean 3.85 ≈ 世界噪声 3.24 —— 拖了，看不见。
  // 第二版改成 **multiply 阴影带**（物理上"光被挡住的地方变暗"就是这么来的）：
  // 白 = 不改变纸面，深棕 = 阴影；转角度就是把这道影子的边界扫过纸面。
  'mix-blend-mode:multiply;',
  'background:linear-gradient(var(--sun-angle,-26deg),#fff 0%,#fff 44%,rgba(96,74,50,.48) 100%)}',
  // 许可证正文（定稿 COPY-SITES §1）：深墨、等宽/衬线混排，落在纸内，避开标题/hook/章/提示。
  '#cert{position:fixed;z-index:3;pointer-events:none;',
  'left:calc(var(--sheet-x) + var(--sheet-w)*0.075);width:calc(var(--sheet-w)*0.85);color:rgba(52,42,32,.86)}',
  '#cert-title{position:absolute;top:calc(var(--sheet-y) + var(--sheet-h)*0.30);',
  'font:600 13px/1.4 ui-monospace,Menlo,monospace;letter-spacing:.24em;color:rgba(74,59,44,.75)}',
  // 页眉线：1px 深墨、22% 不透明度 —— 只做版式分隔，不抢宣言句。
  '#cert-rule{position:absolute;top:calc(var(--sheet-y) + var(--sheet-h)*0.345);left:0;right:0;',
  'height:1px;background:rgba(74,59,44,.22)}',
  '#cert-declaration{position:absolute;top:calc(var(--sheet-y) + var(--sheet-h)*0.40);margin:0;',
  'max-width:calc(var(--sheet-w)*0.62);font:400 clamp(15px,1.5vw,20px)/1.55 ui-serif,Georgia,serif;',
  'color:rgba(52,42,32,.9)}',
  // 编号/日期 60%/65%：要同时满足两件事 —— 宣言句下面不留空洞、
  // 又不要挤进纸底那一条已经站着 hook / approved / 章下副行 / 纸角提示的带子。
  '#cert-serial{position:absolute;top:calc(var(--sheet-y) + var(--sheet-h)*0.60);',
  'font:500 14px/1.5 ui-monospace,Menlo,monospace;letter-spacing:.04em;pointer-events:auto;',
  'user-select:text;-webkit-user-select:text;color:rgba(52,42,32,.92)}',
  '.cert-label{opacity:.6}.cert-value{letter-spacing:.08em}',
  '#cert-date{position:absolute;top:calc(var(--sheet-y) + var(--sheet-h)*0.65);',
  'font:400 13px/1.4 ui-monospace,Menlo,monospace;color:rgba(74,59,44,.72)}',
  // 章下副行贴着红章（章在纸右下），不能放在纸底中央 —— 那里有 hook、纸角提示、Save，会叠成一团。
  // 宽度只到 86%：纸角那 128px 是折角的地盘（折起来会盖住纸角），
  // 章下副行探进去就会被盖掉半截 —— 折角后截图上确实发生了。
  '#cert-seal-sub{position:absolute;top:calc(var(--sheet-y) + var(--sheet-h)*0.855);',
  'left:calc(var(--sheet-w)*0.58);width:calc(var(--sheet-w)*0.28);text-align:center;',
  'font:500 11px/1.4 ui-monospace,Menlo,monospace;letter-spacing:.1em;color:rgba(163,52,44,.72)}',
  // 只有章下副行跟着章走；编号/日期是纸自带的，不随 approved 变化。
  '#cert-seal-sub[hidden]{display:none}',
  '#stage-word{position:fixed;z-index:4;left:50%;transform:translateX(-50%);',
  'bottom:calc(6vh + 46px);letter-spacing:.34em;text-transform:lowercase;',
  'font-size:12px;color:rgba(232,238,245,.8);pointer-events:none}',
  'body[data-sheet=on] #stage-word{bottom:calc(var(--sheet-y) + var(--sheet-h) * 0.155);color:rgba(64,52,40,.85)}',
  '#seal{position:fixed;z-index:3;right:calc((100vw - var(--sheet-w)) / 2 + var(--sheet-w) * .14);',
  'bottom:calc((100vh - var(--sheet-h)) / 2 + var(--sheet-h) * .16);',
  'width:96px;height:96px;border:3px solid rgba(163,52,44,.85);border-radius:50%;',
  'color:rgba(163,52,44,.9);font:700 13px/1 ui-monospace,monospace;letter-spacing:.08em;',
  'display:flex;align-items:center;justify-content:center;transform:rotate(var(--seal-tilt,0deg));',
  'opacity:0;transition:opacity .28s ease}',
  '#seal.is-set{opacity:1}',
  '#save{position:fixed;z-index:4;left:50%;transform:translateX(-50%);bottom:4.5vh;',
  'background:rgba(10,12,16,.5);border:1px solid rgba(232,238,245,.6);border-radius:999px;',
  'color:var(--ink);font:inherit;font-size:13px;padding:.5em 1.3em;cursor:pointer}',
  '#save[hidden]{display:none}',
  // 纸角二级提示：定稿要求低对比、在纸上、不是按钮样式。仅盖章完成后出现。
  '#play-hint{position:fixed;z-index:4;left:calc(var(--sheet-x) + var(--sheet-w)*0.075);',
  'top:calc(var(--sheet-y) + var(--sheet-h)*0.86);max-width:calc(var(--sheet-w)*0.85);',
  'font:11px/1.7 ui-serif,Georgia,serif;color:rgba(64,52,40,.52);letter-spacing:.02em}',
  '#play-hint[hidden]{display:none}',
  '#again{background:none;border:0;padding:0;margin:0 0 2px;cursor:pointer;',
  'font:inherit;color:inherit;letter-spacing:.06em;text-decoration:underline;',
  'text-underline-offset:3px;text-decoration-color:rgba(64,52,40,.25)}',
  '#again:hover{color:rgba(64,52,40,.78)}',
  '.play-note{display:block;opacity:.85}',
  '#boot-error{position:fixed;left:8px;top:8px;z-index:5;max-width:92vw;padding:8px 10px;',
  'background:rgba(80,12,16,.92);border:1px solid rgba(255,120,120,.45);border-radius:4px;',
  'font:12px/1.5 ui-monospace,monospace;white-space:pre-wrap;color:#ffd7d7}',
].join('');

/** HTML 模板（注意：**不允许任何 src/href/http**，由测试断言）。 */
const TEMPLATE = [
  '<!DOCTYPE html>',
  '<html lang="en">',
  '<head>',
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1">',
  '<title>__SITE_TITLE__</title>',
  '<!-- __SITE_META__ -->',
  '<style>__SITE_STYLE__</style>',
  '</head>',
  '<body data-state="booting" data-modal="closed" data-debug="off" data-sheet="off">',
  '<canvas id="stage" aria-hidden="true"></canvas>',
  '__SITE_GL__',
  // L5 的第一块内容：站点的一句话。**必须真的渲染出来** ——
  // 之前 `lead` 只存在于配置里、模板没有对应节点，那是个死字段（声明了但没人用）。
  '<h1 id="h1">__SITE_H1__</h1>',
  '<p id="lead">__SITE_LEAD__</p>',
  '__SITE_EXTRA__',
  '<div id="menu" role="dialog" aria-label="__SITE_MENU_TITLE__" hidden>',
  '<div class="menu-title">__SITE_MENU_TITLE__</div>',
  '__SITE_MENU_ITEMS__',
  '<div class="menu-privacy">__SITE_PRIVACY__</div>',
  '</div>',
  '__SITE_CTA__',
  // 调试条内容由使用者写入；这里**不放占位句** —— `state booting` 从来没被任何代码更新过，
  // 它是一句只会在 ?debug 下出现、且永远显示"正在启动"的假文案（被 site-build 的 E 段抓出来）。
  '<div id="dbg" role="status"></div>',
  '<div id="boot-error" hidden></div>',
  '<script>__SITE_BOOT__</script>',
  '</body>',
  '</html>',
].join('\n');

/**
 * 极简 HTML 转义（文案进模板前必须转义：文案来自配置，将来会来自 COPY-SITES）。
 *
 * @param {string} text 原文
 * @returns {string} 转义后
 */
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** GL 画布片段。 */
const GL_CANVAS = '<canvas id="gl" aria-hidden="true"></canvas>';

/**
 * 把绝对路径转成可安全嵌入生成代码的说明符。
 *
 * @param {string} absPath 绝对路径
 * @returns {string} 带双引号的说明符
 */
function toSpecifier(absPath) {
  return JSON.stringify(absPath.split(path.sep).join('/'));
}

/**
 * 构建一个站。
 *
 * @param {object} options
 * @param {string} options.slug 站 slug（必须是 STATIONS 的键）
 * @param {boolean} [options.write] 是否写盘（默认 true）
 * @param {boolean} [options.minify] 是否压缩
 * @returns {Promise<{ html: string, bytes: number, slug: string, order: string[], hasGl: boolean, outPath: string|null }>}
 */
export async function buildSite(options) {
  const station = STATIONS[options.slug];
  if (!station) {
    throw new Error(`未知站点 slug：${options.slug}（可用：${Object.keys(STATIONS).join(', ')}）`);
  }
  const write = options.write !== false;
  const minify = options.minify !== false;

  const { defs, validateParts, sortParts } = await loadPartDefs(station.parts);
  validateParts(defs);
  const order = sortParts(defs).map((def) => def.id);
  const hasGl = defs.some((def) => (def.channel ?? 'canvas2d') === 'gl');

  const config = {
    slug: station.slug,
    title: station.title,
    lead: station.lead,
    cta: station.cta,
    biome: station.biome,
    seed: station.seed,
    budgetMs: station.budgetMs,
    glBlend: null,
    hasGl,
    paperSheet: station.paperSheet === true,
  };

  // 浏览器入口：壳 + 零件（工厂优先，opts 与 preview 同一套规则）
  const lines = [
    `import { boot } from ${toSpecifier(path.join(REPO_ROOT, 'shared', 'sites', 'shell.ts'))};`,
  ];
  defs.forEach((def, index) => {
    const entry = station.parts[index];
    const id = typeof entry === 'string' ? entry : entry.id;
    // 用 registry 里的顺序找入口：与 loadPartDefs 同源，避免这里再维护一张表
    lines.push(`import * as __p${index} from ${toSpecifier(path.join(REPO_ROOT, stationEntry(id)))};`);
  });
  lines.push('const __parts = [');
  defs.forEach((def, index) => {
    const entry = station.parts[index];
    const opts = typeof entry === 'string' ? null : entry.opts ?? null;
    lines.push(opts
      ? `  ((__p${index}.makePart ?? __p${index}.makePixelPost)(${JSON.stringify(opts)})),`
      : `  (__p${index}.part ?? __p${index}.default),`);
  });
  lines.push('];');
  lines.push(`const __handle = boot(__parts, ${JSON.stringify(config)});`);
  if (station.attach) {
    // 站内接线：只有 /license 有（盖章仪式 + 停留 + 导出）。放在 boot 之后，能拿到句柄。
    lines.push(`import { attach as __attach } from ${toSpecifier(path.join(REPO_ROOT, station.attach))};`);
    lines.push('if (__handle) __attach(__handle);');
  }

  const bundled = buildSync({
    stdin: { contents: lines.join('\n'), resolveDir: REPO_ROOT, loader: 'ts', sourcefile: 'site-entry.ts' },
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
  if (script.includes('</script')) {
    throw new Error(`${station.slug}: 打包产物含 </script，内联会截断脚本`);
  }

  const meta = [
    `station: ${station.slug}`,
    `parts: ${order.length === 0 ? '(none)' : order.join(' ')}`,
    `biome: ${station.biome}`,
    `seed: ${station.seed}`,
    `budget: ${station.budgetMs}ms`,
    'generated-by: shared/sites/build.mjs',
  ].join(' | ');

  const html = TEMPLATE
    .replace('__SITE_TITLE__', () => station.title)
    .replace('__SITE_META__', () => meta)
    .replace('__SITE_STYLE__', () => STYLE)
    .replace('__SITE_GL__', () => (hasGl ? GL_CANVAS : ''))
  .replace('__SITE_H1__', () => escapeHtml(COPY[station.slug === 'koi' ? 'koiPond' : station.slug].h1))
    .replace('__SITE_LEAD__', () => escapeHtml(station.lead))
    // ⚠️ 必须 replaceAll：模板里 `__SITE_MENU_TITLE__` 出现两次（aria-label 与可见标题），
    //   `String.replace` 只换第一处 → 可见标题直接显示占位符（截图抓到过）。
    .replaceAll('__SITE_MENU_TITLE__', escapeHtml(UI.menuTitle))
    .replace('__SITE_MENU_ITEMS__', () => UI.items.map((item) => {
      const value = item.id === 'menu-credits' ? UI.creditsValue : item.value;
      return '<button class="menu-item" type="button" id="' + item.id
        + '" data-channel="' + item.channel + '">'
        + escapeHtml(item.label) + (value ? ' <span class="menu-value">' + escapeHtml(value) + '</span>' : '')
        + '</button>';
    }).join(''))
    .replace('__SITE_PRIVACY__', () => escapeHtml(UI.privacy))
    .replace('__SITE_CTA__', () => (station.cta
      ? `<button id="cta" type="button" data-channel="${station.ctaChannel ?? 'world-inject'}">${escapeHtml(station.cta)}</button>`
      : ''))
    .replace('__SITE_EXTRA__', () => (station.extra ? station.extra : ''))
    // 许可证正文：从文案单一来源 COPY.license 注入，逐字可追溯到 COPY-SITES §1。
    // 占位符只出现在 license 的 extra 里；其他站没有这些串，replace 是空操作。
    .replace('__CERT_TITLE__', () => escapeHtml(COPY.license.cardTitle))
    .replace('__CERT_DECLARATION__', () => escapeHtml(COPY.license.declaration))
    .replace('__CERT_SERIAL_LABEL__', () => escapeHtml(COPY.license.serialLabel))
    .replace('__CERT_SEAL_SUB__', () => escapeHtml(COPY.license.sealSub))
    .replace('__PLAY_NOTE__', () => escapeHtml(COPY.license.playNote))
    .replace('__SAVE_LABEL__', () => escapeHtml(COPY.license.saveLabel))
    .replace('__SEAL_TEXT__', () => escapeHtml(COPY.license.sealText))
    .replace('__AGAIN_LABEL__', () => escapeHtml(COPY.license.againLabel))
    .replace('__SITE_BOOT__', () => script);

  let outPath = null;
  if (write) {
    outPath = path.join(DIST_DIR, station.slug, 'index.html');
    mkdirSync(path.dirname(outPath), { recursive: true });
    writeFileSync(outPath, html, 'utf8');
  }

  return { html, bytes: Buffer.byteLength(html, 'utf8'), slug: station.slug, order, hasGl, outPath };
}

/**
 * 零件 id → 入口（复用 preview 的登记表，避免两张表漂移）。
 *
 * @param {string} id 零件 id
 * @returns {string} 相对仓库根的入口路径
 */
function stationEntry(id) {
  // 动态 import 会让 esbuild 把整棵树都打进来，所以这里同步读表。
  // 表在 preview/build.mjs 里，是 ESM 静态导入的常量，安全。
  const entry = PART_ENTRY_REF[id];
  if (!entry) throw new Error(`零件 ${id} 没有登记入口（见 shared/stage/preview/build.mjs 的 PART_ENTRY）`);
  return entry;
}

/** preview 的零件登记表（与 preview 共用，避免两处维护）。 */
const PART_ENTRY_REF = (await import('../stage/preview/build.mjs')).PART_ENTRY;

/**
 * 构建全部站点 + 一张索引页（`dist/index.html`，列出四个路径）。
 *
 * @returns {Promise<{ results: object[], indexBytes: number }>}
 */
export async function buildAllSites() {
  const results = [];
  for (const slug of Object.keys(STATIONS)) {
    results.push(await buildSite({ slug }));
  }
  // 索引页：单域名下按路径分站，这里给一个最小的入口列表
  const links = Object.values(STATIONS)
    .map((station) => `<li><a href="${station.slug}/">${station.title}</a> — ${station.lead}</li>`)
    .join('');
  const indexHtml = [
    '<!DOCTYPE html>',
    '<html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>Stations</title>',
    `<style>${STYLE}</style>`,
    '</head><body style="overflow:auto;padding:12vh 10vw">',
    '<h1 style="font-weight:400">Stations</h1>',
    `<ul style="line-height:2">${links}</ul>`,
    '</body></html>',
  ].join('\n');
  const indexPath = path.join(DIST_DIR, 'index.html');
  mkdirSync(DIST_DIR, { recursive: true });
  writeFileSync(indexPath, indexHtml, 'utf8');
  return { results, indexBytes: Buffer.byteLength(indexHtml, 'utf8') };
}

/**
 * 命令行入口。
 *
 * @returns {Promise<void>}
 */
async function main() {
  const argv = process.argv.slice(2);
  const wantsHelp = argv.includes('--help');
  const unknown = argv.filter((t) => t.startsWith('--') && t !== '--help' && t !== '--only');
  if (unknown.length > 0) {
    console.error(`[sites] 未知参数：${unknown.join(' ')}\n用法：node shared/sites/build.mjs [--only <slug>]`);
    process.exit(2);
  }
  if (wantsHelp) {
    console.log('用法：node shared/sites/build.mjs [--only <slug>]');
    console.log(`站点：${Object.keys(STATIONS).join(', ')}`);
    return;
  }
  const onlyIndex = argv.indexOf('--only');
  if (onlyIndex >= 0) {
    const slug = argv[onlyIndex + 1];
    const one = await buildSite({ slug });
    console.log(`[sites] ${one.slug}: ${one.bytes} B → ${path.relative(REPO_ROOT, one.outPath)}（parts: ${one.order.join(',') || '(none)'}）`);
    return;
  }
  const { results, indexBytes } = await buildAllSites();
  for (const row of results) {
    console.log(`[sites] ${row.slug.padEnd(8)} ${String(row.bytes).padStart(7)} B  → ${path.relative(REPO_ROOT, row.outPath)}  parts: ${row.order.join(',') || '(none)'}`);
  }
  console.log(`[sites] 索引页 ${indexBytes} B → dist/index.html`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[sites] 失败：${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
