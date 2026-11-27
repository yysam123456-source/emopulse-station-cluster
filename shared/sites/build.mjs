// 站点构建器 —— 把「一个站」编成 `dist/<slug>/index.html`（单文件、零外部请求）。
//
// 与 `shared/stage/preview/build.mjs` 的分工：
//   · preview 是**零件探针**（18 个预设，给我和 PM 看零件长什么样）
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
    /** 入口门厅只列 live 的站；四站都不撤，所以四张卡都在。 */
    status: 'live',
    cta: COPY.license.ctaCopy,   // 'Stamp it'：盖章是站点作用域的因果（不是世界注入）
    ctaChannel: 'ui',
    /** 站内接线模块（只有 /license 有） */
    attach: 'sites/license/index.ts',
    /** 站内专用 DOM：纸框（可折角）/ 光层（--sun-angle）/ 阶段词 / 章 / 保存 */
    extra: [
      // 桌面：木纹、左上斜光、右侧印台与印章实物。它们都不是 UI，只负责让这张纸落在桌面上。
      '<div id="desk" aria-hidden="true"><i id="ink-pad"></i><i id="stamp-block"></i></div>',
      // 深绿皮革桌垫：纸不是直接落在木头上，而是落在垫子上；纸边有第二层承重。
      '<div id="desk-pad" aria-hidden="true"></div>',
      // 纸下面垫一张略大的牛皮纸夹：只露出右/下两条边，给纸张一个“被放在桌上”的厚度。
      '<i id="sheet-under" aria-hidden="true"></i>',
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
      '<button id="fold" type="button" data-channel="ui">__FOLD_LABEL__</button>',
      '<span class="play-note">__PLAY_NOTE__</span>',
      '</div>',
      '<button id="save" type="button" data-channel="ui" hidden>__SAVE_LABEL__</button>',
    ].join(''),
    biome: 'room',
    seed: 20261118,
    budgetMs: 8,
    // 纸面要能读：手机盖章后预算再紧，也不把纸压到 0.55 的糊图。
    minRenderScale: 0.8,
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
      // 许可证是一张**静止的纸**：不要 12Hz 闪动的胶片颗粒。
      // 旧值 grain .04 让整纸噪声底 mean 8（压过了拖光的 10.2），
      // 用户看到的"光在动"被颗粒闪动盖掉；纸张自身的纹理已由 paper-ink 烘好。
      { id: 'pixel-post', opts: { grain: 0, scanline: 0, vignette: 0.08 } },
    ],
  },
  hug: {
    slug: 'hug',
    title: COPY.hug.h1,
    lead: COPY.hug.hook,
    status: 'live',
    // /hug 的唯一 CTA：点它 = 放走（世界收到**一次**按下，由壳注入）
    cta: COPY.hug.cta,
    ctaChannel: 'world-inject',
    /** /hug 的放走 = 对蒲公英说 release；站点作用域只负责把 cue 递进去 */
    attach: 'sites/hug/attach.ts',
    biome: 'field',
    seed: 20260614,
    // 原站同构的三维草甸：一件 L1 world 自己铺满整屏。
    // 旧的 field-ground/dandelion/boids/sun 栈是「平面草坡 + 线框球」，
    // 用户已明确否定；这里不再保留任何 2D 底材，避免它从 GL 下面透出来。
    budgetMs: 9,
    parts: ['hug-meadow'],
  },
  still: {
    slug: 'still',
    title: COPY.still.h1,
    lead: COPY.still.hook,
    status: 'live',
    // 定稿 CTA 'Sit'：坐下 = 把体素世界的视角沉到近景（cue('sit')）
    cta: COPY.still.cta,
    ctaChannel: 'ui',
    attach: 'sites/still/attach.ts',
    biome: 'tide',
    seed: 20260901,
    budgetMs: 12,
    /** Sit 之后 40s 才出现的带走入口；不抢首屏。 */
    extra: '<button id="copy-line" type="button" data-channel="ui" hidden>__STILL_COPY__</button>',
    parts: [{ id: 'tide-medium', opts: { still: true } }, 'voxel-world', 'bubbles', 'still-sink',
      { id: 'pixel-post', opts: { grain: 0.03, scanline: 0, vignette: 0.18 } },
    ],
  },
  koi: {
    slug: 'koi',
    title: COPY.koiPond.h1,
    lead: COPY.koiPond.hook,
    status: 'live',
    cta: null,
    attach: 'sites/koi/attach.ts',
    ambience: false,
    biome: 'ink',
    seed: 20260312,
    // real 路径（池底 + 焦散 + composite + grade）申报 8.5ms；paper 只做 unsupported 兜底。
    // 12ms 预算让 11 条鱼保持 high，而不是一上来就被 post 的 1.3ms 拖到 low。
    budgetMs: 12,
    // 原件自带纸/水彩/胶片 finish，不再叠 pixel-post：多一层暗角会把 real 压暗、把 ink 压冷。
    paperSheet: false,
    /** 停留 40s 后才出现的带走物；不是主 CTA，也不进 Esc 菜单。 */
    extra: '<button id="keep" type="button" data-channel="ui" hidden>__KOI_KEEP__</button>',
    parts: [
      'paper-ink',
      'koi-pond',
    ],
  },
});

/** 页面样式。零外部资源：字体只用系统栈。 */
const STYLE = [
  ':root{--veil:#0a0c10;--ink:#e8eef5;--dim:#9aa7b8}',
  'html,body{margin:0;padding:0;height:100%;background:var(--veil);overflow:hidden}',
  // 触屏：画布上的拖动不能被浏览器抢去滚动/缩放；按钮仍可点。
  'body{touch-action:none;color:var(--ink);font:14px/1.6 ui-serif,Georgia,"Songti SC",serif}',
  '#stage,#gl{position:fixed;left:0;top:0;width:100%;height:100%;display:block;touch-action:none}',
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
  'body[data-sheet=on] #h1{font-size:clamp(28px,3.4vw,42px);letter-spacing:-.01em}',
  '.menu-title{font-size:11px;letter-spacing:.22em;color:var(--dim);margin-bottom:10px}',
  '.menu-item{display:block;width:100%;text-align:left;background:none;border:0;color:var(--ink);',
  'font:inherit;font-size:13px;padding:5px 0;cursor:pointer}',
  '.menu-item:hover{color:#fff}',
  '.menu-value{color:var(--dim);font-size:12px}',
  '.menu-privacy{margin-top:10px;font-size:11px;color:var(--dim)}',
  '#menu-note{margin-top:8px;max-width:230px;font-size:11px;line-height:1.5;color:var(--dim)}',
  '#menu-note[hidden]{display:none}',
  '#lead{position:fixed;z-index:3;margin:0;',
  'color:rgba(232,238,245,.82);font-size:15px;line-height:1.5;letter-spacing:.01em}',
  // L5 文字压在"有内容的画布"上（草地 / ASCII 水纹）时，靠**柔和描边**而不是底色块：
  // 加底会把文字变成贴纸，而这一站的红线是"文字属于纸/场景"。描边只提高可读性，不改变语义。
  'body[data-sheet=off] #lead{left:5vw;bottom:6vh;max-width:44ch;',
  'text-shadow:0 1px 3px rgba(0,0,0,.6),0 0 12px rgba(0,0,0,.35)}',
  // `/hug` 是编辑式版面：大字标题 + 标题下的一行说明，不要「左上角一个 34px 标签 +
  // 左下角一句孤立 hook」的展示页默认排版。花球从画面中部开始，左上留白正好给字。
  // GL 不可用时不能只剩一块黑幕：这层草甸色只在 WebGL2 缺席时露出来。
  'body[data-slug=hug]{background:radial-gradient(140% 110% at 72% 22%,#4a3520 0%,#2a1c12 46%,#140c08 100%)}',
  'body[data-slug=hug] #h1{left:5vw;top:8.5vh;font-size:clamp(52px,8.6vw,104px);',
  'line-height:.94;letter-spacing:-.015em;text-shadow:0 2px 24px rgba(0,0,0,.38)}',
  // 桌面把 hook 放大成原站那种「画面左侧的一句正文」，而不是标题下的 15px 注脚。
  'body[data-slug=hug] #lead{left:5vw;bottom:auto;max-width:20ch;top:27vh;',
  'font-size:clamp(24px,2.1vw,30px);line-height:1.26;color:rgba(238,240,226,.88);text-wrap:balance;',
  'text-shadow:0 2px 18px rgba(0,0,0,.35)}',
  // 手机上大字号会压到花球，保留标题下的小注脚。
  '@media (max-width:600px){body[data-slug=hug] #lead{top:calc(8.5vh + 62px + 16px);',
  'max-width:26ch;font-size:14px;line-height:1.6;color:rgba(232,238,226,.78)}}',
  // 手机 CTA 在底部居中，复制成功的提示必须再往上让一格，不能压在按钮上。
  '@media (max-width:600px){body[data-slug=hug] #share-note{bottom:20vh}}',
  // 桌面上按钮让开主花茎，落到右下角，和左上标题形成对角；窄屏仍居中，拇指够得着。
  '@media (min-width:601px){body[data-slug=hug] #cta{left:auto;right:5vw;transform:none;bottom:9vh}}',
  '@media (min-width:601px){body[data-slug=hug] #share-note{left:auto;right:5vw;transform:none;text-align:right;bottom:15vh;max-width:26ch}}',
  // ink 是**整屏浅纸**：浅字会直接消失（/koi 第一版标题就是白纸白字）。
  'body[data-biome=ink] #h1{color:rgba(38,42,48,.92);text-shadow:0 1px 2px rgba(250,248,242,.45)}',
  'body[data-biome=ink] #lead{color:rgba(42,46,52,.80);text-shadow:0 1px 2px rgba(250,248,242,.40)}',
  // 纸内文字用深墨（纸是亮的），与桌面上的浅字分开。
  // 这条声明必须并进 sheet-on 的 #lead 规则里 —— 它曾作为孤立声明单独成行（带 }），
  // 让 CSS 解析器吞掉后面的 #cta 规则，CTA 退回 static 跑到 (0,0) 被 canvas 盖住，肉眼看不见。
  'body[data-sheet=on] #lead{left:calc(var(--sheet-x) + var(--sheet-w)*0.075);',
  'top:calc(var(--sheet-y) + var(--sheet-h)*0.80);max-width:calc(var(--sheet-w)*0.62);',
  'text-shadow:0 1px 2px rgba(250,248,242,.55);color:rgba(58,48,38,.82)}',
  // /hug 的分享状态：落在 CTA 上方，低对比，和 hook 同一套衬线。
  // 它**不是**第二个 CTA：不接收点击，只报告一次已经发生的动作。
  '#share-note{position:fixed;z-index:3;left:50%;bottom:18.5vh;transform:translateX(-50%);',
  'margin:0;font:400 12px/1.5 ui-serif,Georgia,"Songti SC",serif;letter-spacing:.02em;',
  'color:rgba(255,244,226,.88);max-width:min(44ch,80vw);text-align:center;',
  'text-shadow:0 1px 3px rgba(40,24,12,.55)}',
  '#share-note[hidden]{display:none}',
  '#cta{position:fixed;left:50%;bottom:11.5vh;transform:translateX(-50%);z-index:3;',
  'background:rgba(10,12,16,.46);border:1px solid rgba(232,238,245,.72);border-radius:999px;',
  'color:var(--ink);font:inherit;font-size:15px;letter-spacing:.06em;padding:.72em 1.9em;',
  'cursor:pointer;box-shadow:0 2px 18px rgba(0,0,0,.35)}',
  '#cta[hidden]{display:none}',
  '#cta:hover{border-color:var(--ink)}',
  '#cta:focus-visible{outline:2px solid var(--ink);outline-offset:3px}',
  // 纸上的 CTA 不能还是深色胶囊：它看起来像贴纸，且和“纸/章”不是同一套材质。
  // 做成一张窄的纸质签条：纸色底、棕墨字、细边、下方短影，读作“桌上压着的标签”。
  'body[data-sheet=on] #cta{background:linear-gradient(#faf4e8,#e7d8c2);',
  'border:1px solid rgba(94,68,44,.38);border-radius:3px;color:#3a2a1e;',
  'font:600 12px/1 ui-monospace,Menlo,monospace;letter-spacing:.2em;text-transform:uppercase;',
  'padding:1em 1.7em;box-shadow:0 10px 18px rgba(30,18,8,.24),inset 0 1px rgba(255,255,255,.7)}',
  'body[data-sheet=on] #cta:hover{background:linear-gradient(#fffaf0,#efe2cf);border-color:rgba(94,68,44,.6)}',
  // /koi 的带走物：40s 后出现在右下，不与左下 hook 抢位置；手机居中。
  '#keep{position:fixed;right:5vw;bottom:9vh;z-index:3;background:rgba(10,12,16,.42);',
  'border:1px solid rgba(232,238,245,.64);border-radius:999px;color:var(--ink);',
  'font:inherit;font-size:13px;letter-spacing:.06em;padding:.6em 1.4em;cursor:pointer;',
  'box-shadow:0 2px 16px rgba(0,0,0,.28)}',
  '#keep[hidden]{display:none}',
  '#keep:focus-visible{outline:2px solid var(--ink);outline-offset:3px}',
  '@media (max-width:600px){#keep{left:50%;right:auto;transform:translateX(-50%);bottom:8vh;min-height:44px}}',
  // 带走入口在 Sit 上方：不能和常驻 CTA 叠在同一底线。
  '#copy-line{position:fixed;left:50%;bottom:17vh;transform:translateX(-50%);z-index:3;',
  'background:rgba(10,12,16,.44);border:1px solid rgba(232,238,245,.62);border-radius:999px;',
  'color:var(--ink);font:inherit;font-size:13px;letter-spacing:.06em;padding:.6em 1.4em;cursor:pointer}',
  '#copy-line[hidden]{display:none}',
  '#copy-line:focus-visible{outline:2px solid var(--ink);outline-offset:3px}',
  // /still 的停留提示要同时在 Copy the line 之上，不能三条底栏叠在一起。
  'body[data-slug=still] #share-note{bottom:24vh}',
  '@media (max-width:600px){#copy-line{min-height:44px;bottom:18vh}}',
  '#menu{position:fixed;right:2vw;top:2vh;z-index:4;padding:14px 18px;border-radius:6px;',
  'background:rgba(10,12,16,.88);border:1px solid rgba(232,238,245,.18);font-size:13px;',
  'max-height:88vh;overflow:auto;touch-action:manipulation}',
  '#menu[hidden]{display:none}',
  // 模态打开时，页面底栏不能从菜单半透明底下面露出来；世界也暂停，UI 一起退场。
  'body[data-modal=open] #lead,body[data-modal=open] #cta,body[data-modal=open] #share-note,',
  'body[data-modal=open] #copy-line,body[data-modal=open] #keep,body[data-modal=open] #save,',
  'body[data-modal=open] #play-hint,body[data-modal=open] #cert-seal-sub{visibility:hidden}',
  // 触屏没有 Esc：给一个 44px 的常驻菜单入口。桌面不显示它，首屏仍然只有 H1/hook/CTA 三个可点物。
  '#menu-open{display:none;position:fixed;right:2.4vw;top:2.4vh;z-index:8;',
  'min-width:44px;min-height:44px;padding:0 .7em;border-radius:999px;',
  'background:rgba(10,12,16,.58);border:1px solid rgba(232,238,245,.38);color:var(--ink);',
  'font:11px/1 ui-monospace,Menlo,monospace;letter-spacing:.16em;cursor:pointer;touch-action:manipulation}',
  '@media (hover:none),(pointer:coarse){#menu-open{display:block}}',
  '@media (hover:none),(pointer:coarse){#menu{left:0;right:0;top:auto;bottom:0;border-radius:12px 12px 0 0;',
  'max-height:72vh;padding:16px 18px 22px}',
  '.menu-item{min-height:44px;padding:10px 0}}',
  '#menu-open:focus-visible{outline:2px solid var(--ink);outline-offset:3px}',
  // 调试条是**开发工具**，默认不显示：它第一版会压住站点文案（截图发现），而且它不该属于产品。
  // 需要时加 `?debug` 打开。
  '#dbg{display:none;position:fixed;left:8px;bottom:8px;z-index:2;max-width:min(94vw,760px);',
  'padding:6px 9px;border-radius:4px;background:rgba(8,10,16,.72);',
  'border:1px solid rgba(120,140,180,.22);font:11px/1.5 ui-monospace,Menlo,monospace;',
  'white-space:pre-wrap;pointer-events:none;color:var(--dim)}',
  'body[data-debug=on] #dbg{display:block}',
  // ── /license 的桌面（世界层，不是 UI）──
  // 纸上盖章如果没有桌面承重，整页会读成“棕色背景上浮着一张图”。
  // #desk 放在 #stage 后面；#stage 无 z-index，#desk 用 -1 压在它下面，纸仍是主体。
  // body 自己的 --veil 会盖住负 z-index 的桌面；这里只对 license 让 body 透明，
  // 保留 html 的深色兜底。不能全局改 body，否则另外三站的底色一起变。
  'body[data-station=license]{background:transparent}',
  '#desk{position:fixed;inset:0;z-index:1;pointer-events:none;overflow:hidden;',
  'background:',
  'radial-gradient(58% 46% at 23% 3%,rgba(255,208,150,.20),transparent 64%),',
  'radial-gradient(90% 72% at 54% 46%,rgba(118,73,43,.18),transparent 72%),',
  'linear-gradient(155deg,#120c09 0%,#2a1a11 32%,#3d2819 58%,#1c110b 100%)}',
  // 木纹用极低对比的斜向条纹，不能变成“棕白条纹背景板”。
  '#desk::before{content:"";position:absolute;inset:-8%;opacity:.5;transform:rotate(-.4deg);',
  'filter:blur(.6px);background:',
  'repeating-linear-gradient(6deg,rgba(255,222,180,.026) 0 2px,transparent 2px 9px),',
  'repeating-linear-gradient(176deg,rgba(0,0,0,.05) 0 1px,transparent 1px 14px,',
  'rgba(255,218,175,.02) 14px 22px)}',
  // 四周压暗：桌面要有深度，纸才有被灯照着的中心感。
  '#desk::after{content:"";position:absolute;inset:0;',
  'background:radial-gradient(ellipse at 50% 43%,transparent 34%,rgba(0,0,0,.34) 72%,rgba(0,0,0,.72) 100%)}',
  // #stage 的 paper-ink 会画满整块画布（含桌面底色）。桌面要压在它上面，
  // 但必须在纸矩形上挖一个洞，否则会盖掉纸纹理。
  '#desk{mask-image:linear-gradient(#000,#000),linear-gradient(#000,#000);',
  'mask-size:100% 100%,calc(var(--sheet-w) + 2px) calc(var(--sheet-h) + 2px);',
  'mask-position:0 0,calc(var(--sheet-x) - 1px) calc(var(--sheet-y) - 1px);',
  'mask-repeat:no-repeat;mask-composite:exclude}',
  // 皮革桌垫：只保留纸外的一圈，中心用 mask 挖掉，纸面仍由 canvas 绘制。
  '#desk-pad{position:fixed;left:calc(var(--sheet-x) - 52px);top:calc(var(--sheet-y) - 52px);',
  'width:calc(var(--sheet-w) + 104px);height:calc(var(--sheet-h) + 104px);z-index:1;pointer-events:none;',
  'border-radius:4px;background:',
  'radial-gradient(80% 60% at 30% 8%,rgba(126,164,136,.16),transparent 68%),',
  'repeating-linear-gradient(115deg,rgba(255,255,255,.018) 0 1px,transparent 1px 4px),',
  'linear-gradient(145deg,#1b2f25,#0f1d16 58%,#182a20);',
  'box-shadow:0 26px 48px rgba(0,0,0,.5),inset 0 0 0 1px rgba(197,170,115,.26),',
  'inset 0 0 26px rgba(0,0,0,.5);',
  'mask-image:linear-gradient(#000,#000),linear-gradient(#000,#000);',
  'mask-size:100% 100%,var(--sheet-w) var(--sheet-h);mask-position:0 0,52px 52px;',
  'mask-repeat:no-repeat;mask-composite:exclude}',
  '#desk-pad::before{content:"";position:absolute;inset:14px;border-radius:2px;',
  'border:1px dashed rgba(201,172,116,.34)}',
  '@media (max-width:900px){#desk-pad{display:none}}',
  // 牛皮纸夹：只画右/下两条边，不盖住纸面；box-sizing 让内边正好贴住纸边。
  '#sheet-under{position:fixed;left:var(--sheet-x);top:var(--sheet-y);width:calc(var(--sheet-w) + 14px);',
  'height:calc(var(--sheet-h) + 14px);z-index:1;pointer-events:none;box-sizing:border-box;',
  'border-right:14px solid #c8ad83;border-bottom:14px solid #c8ad83;',
  'background:transparent;transform:rotate(.45deg);transform-origin:50% 50%;',
  'box-shadow:8px 10px 22px rgba(0,0,0,.32)}',
  '@media (max-width:700px){#sheet-under{display:none}}',
  // 右侧：一块深色木印台 + 一支斜放的印章。位置跟着纸走，纸动它们不动。
  '#ink-pad{position:absolute;left:calc(var(--sheet-x) + var(--sheet-w) + 6.2vw);',
  'top:calc(var(--sheet-y) + var(--sheet-h)*.80);width:clamp(82px,7vw,112px);height:clamp(34px,3vw,48px);',
  'border-radius:10px 10px 14px 14px;transform:rotate(-7deg);opacity:.92;',
  'background:linear-gradient(150deg,#2b1710,#6a3a27 42%,#24120d 100%);',
  'box-shadow:0 14px 22px rgba(0,0,0,.55),inset 0 0 0 2px rgba(255,214,166,.08)}',
  '#ink-pad::after{content:"";position:absolute;inset:7px 9px;border-radius:7px;',
  'background:radial-gradient(circle at 38% 32%,#b84537,#7a2821 58%,#3e1210 100%);',
  'box-shadow:inset 0 2px 4px rgba(0,0,0,.55),0 0 14px rgba(190,62,48,.2)}',
  '#stamp-block{position:absolute;left:calc(var(--sheet-x) + var(--sheet-w) + 7.6vw);',
  'top:calc(var(--sheet-y) + var(--sheet-h)*.66);width:clamp(24px,2.4vw,38px);height:clamp(64px,6vw,92px);',
  'border-radius:8px 8px 4px 4px;transform:rotate(23deg);opacity:.9;',
  'background:linear-gradient(90deg,#2b160d,#8b5a36 46%,#3a2011 100%);',
  'box-shadow:0 12px 18px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,220,170,.18)}',
  '#stamp-block::after{content:"";position:absolute;left:-4px;right:-4px;bottom:-7px;height:12px;',
  'border-radius:3px;background:linear-gradient(#9d3029,#4c1413);box-shadow:0 3px 6px rgba(0,0,0,.5)}',
  '@media (max-width:1100px){#ink-pad,#stamp-block{display:none}}',
  // ── /license 的站内叠层（纸框 / 光 / 阶段词 / 章 / 保存）──
  // 它们都是 DOM 叠在画布之上：L5 走 DOM，所以这些不占 `costMs`、不需要每帧重绘。
  'body[data-sheet=on] #sheet{position:fixed;left:var(--sheet-x);top:var(--sheet-y);',
  'width:var(--sheet-w);height:var(--sheet-h);z-index:1;pointer-events:none;',
  'box-shadow:0 32px 68px rgba(0,0,0,.55),0 5px 14px rgba(0,0,0,.34),',
  'inset 0 0 0 1px rgba(120,100,80,.25)}',
  // 纸边：内圈压印线 + 极细亮边，纸才不是一块贴图。
  'body[data-sheet=on] #sheet::before{content:"";position:absolute;inset:2px;',
  'border:1px solid rgba(92,68,44,.18);box-shadow:inset 0 0 0 7px rgba(255,250,238,.16);pointer-events:none}',
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
  'font:600 13px/1.4 ui-monospace,Menlo,monospace;letter-spacing:.24em;color:rgba(74,59,44,.88)}',
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
  'font:400 13px/1.4 ui-monospace,Menlo,monospace;color:rgba(74,59,44,.86)}',
  // 章下副行贴着红章（章在纸右下），不能放在纸底中央 —— 那里有 hook、纸角提示、Save，会叠成一团。
  // 宽度只到 86%：纸角那 128px 是折角的地盘（折起来会盖住纸角），
  // 章下副行探进去就会被盖掉半截 —— 折角后截图上确实发生了。
  '#cert-seal-sub{position:absolute;top:calc(var(--sheet-y) + var(--sheet-h)*0.855);',
  // 中心对齐朱砂章（章心 = 86% - 48px ≈ 81.3%）。
  // #cert 本身从 7.5% 起、宽 85%，所以这里的百分比是**相对 #cert** 算的；
  // 直接用 sheet 宽折算：left .648w + width .18w → 中心 .738w，再加 #cert 的 .075 = .813。
  'left:calc(var(--sheet-w)*0.648);width:calc(var(--sheet-w)*0.18);text-align:center;',
  'font:500 11px/1.4 ui-monospace,Menlo,monospace;letter-spacing:.1em;color:rgba(163,52,44,.86)}',
  // 只有章下副行跟着章走；编号/日期是纸自带的，不随 approved 变化。
  '#cert-seal-sub[hidden]{display:none}',
  '#stage-word{position:fixed;z-index:4;left:50%;transform:translateX(-50%);',
  'bottom:calc(6vh + 46px);letter-spacing:.34em;text-transform:lowercase;',
  'font-size:12px;color:rgba(232,238,245,.8);pointer-events:none}',
  // 状态词放到纸的右上角，像档案上的状态戳；不要和朱砂章下面的副行挤在一起。
  '@media (min-width:601px){body[data-sheet=on] #stage-word{left:auto;',
  'right:calc((100vw - var(--sheet-w)) / 2 + var(--sheet-w) * .075);transform:none;',
  'top:calc(var(--sheet-y) + var(--sheet-h) * .135);bottom:auto;',
  'letter-spacing:.24em;font-size:10px;color:rgba(163,52,44,.72)}}',
  '#seal{position:fixed;z-index:3;right:calc((100vw - var(--sheet-w)) / 2 + var(--sheet-w) * .14);',
  'bottom:calc((100vh - var(--sheet-h)) / 2 + var(--sheet-h) * .16);',
  'width:96px;height:96px;border:3px solid rgba(163,52,44,.85);border-radius:50%;',
  'color:rgba(163,52,44,.9);font:700 13px/1 ui-monospace,monospace;letter-spacing:.08em;',
  'display:flex;align-items:center;justify-content:center;transform:rotate(var(--seal-tilt,0deg));',
  'opacity:0;transition:opacity .28s ease}',
  '#seal.is-set{opacity:1}',
  // Save 是纸边下方的一张签条，不是纸面上的深色胶囊。
  // 纸缩到 80% 高以后，纸底到视口有 72px：正好放一条“带走”签条。
  '#save{position:fixed;z-index:4;left:50%;transform:translateX(-50%);',
  'bottom:calc((100vh - var(--sheet-h)) / 2 - 34px);',
  'background:linear-gradient(#f6ecd8,#ddc9a8);border:1px solid rgba(92,66,42,.42);border-radius:3px;',
  'color:#3a2a1e;font:600 11px/1 ui-monospace,Menlo,monospace;letter-spacing:.16em;',
  'text-transform:uppercase;padding:.8em 1.3em;cursor:pointer;',
  'box-shadow:0 7px 14px rgba(0,0,0,.3),inset 0 1px rgba(255,255,255,.65)}',
  '#save[hidden]{display:none}',
  // 二级提示留在纸的左下角：产品门的定义是“纸上的低对比提示”，不是桌垫 UI。
  // 纸缩到 80% 高后，左下角终于空出来；Save 已移到纸外，这里不再和任何按钮抢位置。
  '#play-hint{position:fixed;z-index:4;left:calc(var(--sheet-x) + var(--sheet-w)*0.075);',
  'top:calc(var(--sheet-y) + var(--sheet-h)*0.855);max-width:calc(var(--sheet-w)*0.34);',
  'font:11.5px/1.35 ui-serif,Georgia,serif;color:rgba(64,52,40,.70);letter-spacing:.02em}',
  '#play-hint[hidden]{display:none}',
  '#again,#fold{background:none;border:0;padding:0;margin:0 12px 2px 0;cursor:pointer;',
  'font:inherit;color:inherit;letter-spacing:.06em;text-decoration:underline;',
  'text-underline-offset:3px;text-decoration-color:rgba(64,52,40,.25)}',
  '#again:hover,#fold:hover{color:rgba(64,52,40,.82)}',
  '.play-note{display:block;opacity:.85}',
  // 桌面把 Save 贴到纸的右下角，和朱砂章同一列；手机上仍居中（见媒体块）。
  '@media (min-width:601px){#save{left:auto;right:calc((100vw - var(--sheet-w)) / 2);transform:none}}',
  // 启动遮罩：不是装饰，是「世界还没就绪」的唯一诚实表达（/still 的体素要 2–4s）。
  // 无文字（文案只能来自 COPY），只有一层与 --veil 同色的渐变；就绪后淡出。
  '#veil{position:fixed;inset:0;z-index:6;display:flex;align-items:center;justify-content:center;',
  'padding:24px;background:radial-gradient(120% 90% at 50% 42%,#141922 0%,#07090c 72%);',
  'opacity:1;transition:opacity 1.4s ease;pointer-events:none}',
  'body[data-state=ready] #veil,body[data-state=degraded] #veil,body[data-state=failed] #veil{opacity:0}',
  // 有启动说明时，遮罩必须留着；否则「正在准备」的字会浮在已经出现的画面上。
  'body[data-boot=on] #veil{opacity:1}',
  // 超时后世界还没来：放 L0 底材进来，遮罩只留一层很薄的暗和一句说明。
  // 这不是「假装就绪」—— state 仍是 degraded，调试条仍报 readiness=0。
  'body[data-boot=slow] #veil{opacity:1;background:rgba(7,9,12,.28)}',
  // 启动遮罩上唯一允许的字：进度/超时/不支持，全部来自 COPY.boot。不是营销文案。
  '#boot-note{margin:0;max-width:38ch;text-align:center;font:400 13px/1.6 ui-serif,Georgia,serif;',
  'letter-spacing:.02em;color:rgba(232,238,245,.72);text-shadow:0 1px 3px rgba(0,0,0,.5)}',
  '#boot-note[hidden]{display:none}',
  '#boot-error{position:fixed;left:8px;top:8px;z-index:7;max-width:92vw;padding:8px 10px;',
  'background:rgba(80,12,16,.92);border:1px solid rgba(255,120,120,.45);border-radius:4px;',
  'font:12px/1.5 ui-monospace,monospace;white-space:pre-wrap;color:#ffd7d7}',
  // ── /license 手机排版：390×844 时纸约 370×262，桌面百分比会把正文挤成重叠 ──
  '@media (max-width:600px){',
  'body[data-sheet=on] #h1{left:calc(var(--sheet-x) + var(--sheet-w)*0.07);',
  'top:calc(var(--sheet-y) + var(--sheet-h)*0.10);font-size:clamp(18px,6vw,24px)}',
  'body[data-sheet=on] #lead{left:calc(var(--sheet-x) + var(--sheet-w)*0.07);',
  'top:calc(var(--sheet-y) + var(--sheet-h)*0.20);max-width:calc(var(--sheet-w)*0.82);',
  'font-size:12px;line-height:1.35}',
  '#cert{width:calc(var(--sheet-w)*0.86)}',
  '#cert-title{top:calc(var(--sheet-y) + var(--sheet-h)*0.35);font-size:11px;letter-spacing:.16em}',
  '#cert-rule{top:calc(var(--sheet-y) + var(--sheet-h)*0.385)}',
  '#cert-declaration{top:calc(var(--sheet-y) + var(--sheet-h)*0.41);',
  'max-width:calc(var(--sheet-w)*0.78);font-size:11.5px;line-height:1.4}',
  '#cert-serial{top:calc(var(--sheet-y) + var(--sheet-h)*0.64);font-size:11px}',
  '#cert-date{top:calc(var(--sheet-y) + var(--sheet-h)*0.69);font-size:11px}',
  '#cert-seal-sub{top:calc(var(--sheet-y) + var(--sheet-h)*0.825);',
  'left:calc(var(--sheet-w)*0.63);width:calc(var(--sheet-w)*0.22);font-size:12px}',
  '#seal{width:64px;height:64px;border-width:2px;font-size:10px}',
  // Save 单独一条：在 play-hint 下方 12px，避免 390×844 上压住 Stamp again / Fold。
  '#save{top:calc((100vh - var(--sheet-h)) / 2 + var(--sheet-h) + 50px);bottom:auto;',
  'font-size:12px;padding:.45em 1em}',
  // 手机把二级动作与 Save 移到纸下方：纸内底部同时站着 approved、章下副行和章，放不下第三排。
  '#play-hint{top:calc((100vh - var(--sheet-h)) / 2 + var(--sheet-h) + 10px);',
  'left:calc(var(--sheet-x) + var(--sheet-w)*0.07);max-width:calc(var(--sheet-w)*0.9);',
  'font-size:12px;line-height:1.5;color:rgba(232,238,245,.82)}',
  '#again,#fold{font-size:12px;line-height:1.5;color:rgba(232,238,245,.82);text-decoration-color:rgba(232,238,245,.32)}',
  '#stage-word{bottom:calc((100vh - var(--sheet-h)) / 2 + var(--sheet-h)*0.085);font-size:12px}',
  '.play-note{display:none}',
  '}',
  // /koi 的 real 是深色水面：ink 站默认的深墨标题会沉进水里。
  // 只改这一种 look 的文字角色，不动站点骨架；paint/ink 仍是浅纸深墨。
  'body[data-koi-style=real] #h1{color:rgba(246,242,232,.96);',
  'text-shadow:0 1px 2px rgba(0,0,0,.7),0 0 20px rgba(0,0,0,.55)}',
  'body[data-koi-style=real] #lead{color:rgba(242,238,228,.9);',
  'text-shadow:0 1px 3px rgba(0,0,0,.7),0 0 14px rgba(0,0,0,.45)}',
].join('');

/** HTML 模板（注意：**不允许任何 src/href/http**，由测试断言）。 */
const TEMPLATE = [
  '<!DOCTYPE html>',
  '<html lang="en">',
  '<head>',
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">',
  '<title>__SITE_TITLE__</title>',
  '<!-- __SITE_META__ -->',
  '<style>__SITE_STYLE__</style>',
  '</head>',
  '<body data-station="__SITE_STATION__" data-state="booting" data-modal="closed" data-debug="off" data-sheet="off" data-biome="neutral">',
  '<canvas id="stage" aria-hidden="true"></canvas>',
  '__SITE_GL__',
  // L5 的第一块内容：站点的一句话。**必须真的渲染出来** ——
  // 之前 `lead` 只存在于配置里、模板没有对应节点，那是个死字段（声明了但没人用）。
  '<h1 id="h1">__SITE_H1__</h1>',
  '<p id="lead">__SITE_LEAD__</p>',
  // /hug 的「带走链接」状态行：默认不占位；只有复制成功/收到回赠时才出现。
  // 它不是第二个 CTA —— 不接收点击，只报告一次已发生的动作。
  '<p id="share-note" role="status" hidden></p>',
  '__SITE_EXTRA__',
  '<div id="veil" aria-hidden="true"><p id="boot-note">__BOOT_NOTE__</p></div>',
  // 触屏入口在 CSS 里只对 coarse pointer 显示；桌面首屏仍恰好三个可点/可见文字。
  '<button id="menu-open" type="button" data-channel="ui" aria-label="__SITE_MENU_TITLE__">__SITE_MENU_TITLE__</button>',
  '<div id="menu" role="dialog" aria-label="__SITE_MENU_TITLE__" hidden>',
  '<div class="menu-title">__SITE_MENU_TITLE__</div>',
  '__SITE_MENU_ITEMS__',
  '<div id="menu-note" hidden></div>',
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
  const hasGl = defs.some((def) => {
    const channel = def.channel ?? 'canvas2d';
    return channel === 'gl' || channel === 'world';
  });

  const config = {
    slug: station.slug,
    title: station.title,
    lead: station.lead,
    cta: station.cta,
    biome: station.biome,
    seed: station.seed,
    budgetMs: station.budgetMs,
    minRenderScale: station.minRenderScale ?? null,
    glBlend: null,
    hasGl,
    paperSheet: station.paperSheet === true,
    privacy: UI.privacy,
    credits: UI.creditsValue,
    // /koi 的声音由零件自己持有（原作的水声/音乐），壳的通用环境声必须让位。
    ambience: station.ambience !== false,
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
    .replace('__SITE_STATION__', () => station.slug)
    .replace('__SITE_TITLE__', () => station.title)
    .replace('__SITE_META__', () => meta)
    .replace('__SITE_STYLE__', () => STYLE)
    .replace('__SITE_GL__', () => (hasGl ? GL_CANVAS : ''))
  .replace('__SITE_H1__', () => escapeHtml(COPY[station.slug === 'koi' ? 'koiPond' : station.slug].h1))
    .replace('__SITE_LEAD__', () => escapeHtml(station.lead))
    // ⚠️ 必须 replaceAll：模板里 `__SITE_MENU_TITLE__` 出现两次（aria-label 与可见标题），
    //   `String.replace` 只换第一处 → 可见标题直接显示占位符（截图抓到过）。
    .replaceAll('__SITE_MENU_TITLE__', escapeHtml(UI.menuTitle))
    .replace('__BOOT_NOTE__', () => escapeHtml(COPY.boot.preparing))
    .replace('__SITE_MENU_ITEMS__', () => UI.items
      .filter((item) => (item.only ? item.only === station.slug : true)
        && (item.id !== 'menu-wind' || station.slug === 'hug'))
      .map((item) => {
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
    .replace('__FOLD_LABEL__', () => escapeHtml(COPY.license.foldLabel))
    .replace('__KOI_KEEP__', () => escapeHtml(COPY.koiPond.keepLabel))
    .replace('__STILL_COPY__', () => escapeHtml(COPY.still.copyLine))
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
  // 索引页：不是裸 `<ul>`，是门厅 —— 四张卡、每张有编号/名字/一句/状态。
  // 用户已拍板四站都不撤，所以这里只列 live，且四张都在。
  const live = Object.values(STATIONS).filter((station) => station.status === 'live');
  const cards = live.map((station, index) => [
    `<a class="card" href="${station.slug}/">`,
    `<span class="card-no">${String(index + 1).padStart(2, '0')}</span>`,
    `<span class="card-title">${station.title}</span>`,
    `<span class="card-lead">${station.lead}</span>`,
    '<span class="card-state">Open</span>',
    '</a>',
  ].join('')).join('');
  const indexHtml = [
    '<!DOCTYPE html>',
    '<html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>Emopulse · Stations</title>',
    '<style>',
    ':root{--ink:#e8eef5;--dim:#9aa7b8;--veil:#0a0c10}',
    '*{box-sizing:border-box}',
    'html,body{margin:0;min-height:100%;background:radial-gradient(120% 90% at 50% 0%,#151b24 0%,#07090c 70%);color:var(--ink)}',
    'body{font:15px/1.6 ui-serif,Georgia,"Songti SC",serif;padding:9vh 6vw 7vh}',
    '.wrap{max-width:1120px;margin:0 auto}',
    '.kicker{margin:0 0 18px;font:11px/1 ui-monospace,Menlo,monospace;letter-spacing:.22em;color:var(--dim);text-transform:uppercase}',
    'h1{margin:0;font-weight:400;font-size:clamp(34px,6vw,72px);line-height:.96;letter-spacing:-.02em}',
    '.sub{margin:22px 0 46px;max-width:42ch;color:var(--dim);font-size:16px}',
    '.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}',
    '.card{position:relative;display:flex;flex-direction:column;min-height:210px;padding:20px 20px 18px;',
    'border:1px solid rgba(232,238,245,.18);border-radius:10px;background:rgba(255,255,255,.025);',
    'color:inherit;text-decoration:none;transition:border-color .2s ease,background .2s ease,transform .2s ease}',
    '.card:hover,.card:focus-visible{border-color:rgba(232,238,245,.55);background:rgba(255,255,255,.055);transform:translateY(-2px);outline:none}',
    '.card-no{font:11px/1 ui-monospace,Menlo,monospace;letter-spacing:.18em;color:var(--dim)}',
    '.card-title{margin-top:auto;font-size:clamp(24px,2.4vw,34px);line-height:1.05;font-weight:400}',
    '.card-lead{margin-top:10px;color:var(--dim);font-size:13px;line-height:1.55;max-width:26ch}',
    '.card-state{margin-top:18px;font:10px/1 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:rgba(190,220,190,.86);text-transform:uppercase}',
    '@media (max-width:600px){body{padding:7vh 5vw}.sub{margin-bottom:30px}.card{min-height:180px}}',
    '</style>',
    '</head><body>',
    '<main class="wrap">',
    '<p class="kicker">Four rooms · one house</p>',
    '<h1>Stations</h1>',
    '<p class="sub">Small places to stop, look, and take one thing with you. No account. No feed.</p>',
    `<div class="grid">${cards}</div>`,
    '</main>',
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
