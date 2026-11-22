// 站点文案的**唯一代码来源**。
//
// ★ 为什么需要这个文件：`shared/sites/build.mjs` 里的 `lead` 曾经是我**手写编出来的**
//   （`A permit for a small, unreasonable thing.`），而 `docs/COPY-SITES.md` 的定稿是
//   `A permit to simply be.` —— **两份文案、且代码里那份是编的**。
//   这正是「一致不是目标，单一来源才是」那条规则被违反的样子：
//   当时两份不一样，三个月后只会更不一样。
//
// ★ 纪律：
//   1. 值**逐字**来自 `docs/COPY-SITES.md` 的常量表（文末那张 `UI` / `ENTRY` 表）。
//   2. `tests/site-build.mjs` 会断言**每个值都能在 COPY-SITES.md 里逐字找到** ——
//      所以这里不能悄悄改文案；改文案必须先改文档。
//   3. 这里只放**已经定稿**的文案。`About` / `Credits` 等长文案由 T13 按文档补，不在这里现编。
//
// ⚠️ 未定稿的一律留空字符串并在注释里写"待 PM"，**不许写占位句子** ——
//   占位句子会被当成真文案上屏，这正是本次事故的形态。
export const COPY = Object.freeze({
  license: {
    h1: 'License',
    hook: 'A permit to simply be.',
    /** 定稿 CTA 文案（`ENTRY.license.cta`）。盖章交互整件在站点作用域（T12 已收缩），
     *  现在没有触发者，所以**不挂 CTA 节点** —— 挂一个点了没反应的按钮比没有更糟。 */
    cta: null,
    ctaCopy: 'Stamp it',
    // 许可证正文（COPY-SITES §1「/license 卡」+ §5 第 23 条终稿）。
    // 此前只画在导出 PNG 上、屏幕上没有 —— 纸看起来是空的，就是漏了这一层。
    cardTitle: 'PERMIT TO REST',
    serialLabel: 'No.',
    declaration: 'This permit entitles the holder to rest, to stop explaining, and to take up space.',
    sealSub: 'NO COPY KEPT.',
    /** 纸角二级提示里的两个动作词（COPY-SITES §3「审批完成后（低对比，二级）」）。
     *  ⚠️ 这两个动作必须**真的看得见**才配写在这儿：`tests/license-stay.mjs` 的像素段
     *  会量"拖光 / 折角"各自改变了多少像素，低于世界自身噪声就算失败。 */
    playNote: 'drag to move the light · f to fold the corner',
    /** 终态唯一按钮（COPY-SITES §3:130「审批完成后的唯一按钮 | Save it」）。
     *  此前模板里手写着 `Save this card`，与定稿不一致 —— 属于"代码自己编文案"的同一个洞。 */
    saveLabel: 'Save it',
    /** 章面文字（COPY-SITES §3:127）。此前写在模板里，属于"屏幕上的字不都来自 COPY"。 */
    sealText: 'APPROVED',
    /** 纸角二级按钮（COPY-SITES §3:131）。同上。 */
    againLabel: 'Stamp again',
  },
  hug: {
    h1: 'Hug',
    hook: 'Send a little warmth as a link.',
    cta: 'Let it go',
  },
  still: {
    h1: 'Still',
    hook: 'Nothing here needs an answer.',
    /** 定稿 CTA 是 'Sit' —— 现在真的把世界视角沉下去（cue('sit')）。 */
    cta: 'Sit',
    ctaCopy: 'Sit',
  },
  // 注意：文档里这一项的 key 是 `koiPond`，站点 slug 是 `koi`
  koiPond: {
    h1: 'Koi Pond',
    hook: 'Watch the fish. That is all.',
    /** 定稿 CTA 是 'Watch' —— 没有实现，先不挂。 */
    cta: null,
    ctaCopy: 'Watch',
  },
});

/**
 * L5 UI 文案（四站一致，不得逐站改写）—— 逐字来自 `docs/COPY-SITES.md` 的 `UI` 表。
 *
 * `channel` 是**每个控件属于哪条通道**（`COPY-SITES.md` §通道四分类）：
 *   · `ui`          —— 纯 UI，不改世界
 *   · `world-param` —— 改世界的**持续状态**（LOD / reducedMotion / 音频输出），不是事件
 *   · `world-input` —— 世界输入（指针）
 *   · `world-inject`—— 世界**注入**（一次"决定"）
 * 四站合计只允许 **1 处 world-inject**（`#cta`）。`tests/site-dom.mjs` 会数。
 */
export const UI = Object.freeze({
  menuTitle: 'MENU',
  items: [
    { id: 'menu-sound', label: 'Sound', value: 'Off', channel: 'ui' },
    { id: 'menu-motion', label: 'Motion', value: 'Full', channel: 'world-param' },
    { id: 'menu-quality', label: 'Quality', value: 'High', channel: 'world-param' },
    // 只给 /hug：麦克风是**可选输入**，不是默认权限请求。build.mjs 按 slug 过滤。
    { id: 'menu-wind', label: 'Wind', value: 'Off', channel: 'world-input' },
    // /koi 的原作控制：都藏在 Esc 里，首屏仍然只有标题、引导和画面。
    { id: 'menu-look', label: 'Look', value: 'Ink', channel: 'world-param', only: 'koi' },
    { id: 'menu-touch', label: 'Touch', value: 'Ripple', channel: 'world-param', only: 'koi' },
    { id: 'menu-camera', label: 'Camera', value: 'Top', channel: 'world-param', only: 'koi' },
    { id: 'menu-water', label: 'Water', value: 'Pebble', channel: 'world-param', only: 'koi' },
    { id: 'menu-weather', label: 'Weather', value: 'Dry', channel: 'world-param', only: 'koi' },
    { id: 'menu-music', label: 'Music', value: 'Off', channel: 'world-param', only: 'koi' },
    { id: 'menu-about', label: 'About', value: '', channel: 'ui' },
    { id: 'menu-credits', label: 'Credits', value: '', channel: 'ui' },
    { id: 'menu-close', label: 'Close', value: '', channel: 'ui' },
  ],
  creditsValue: 'Parts are adapted from public demos or written here. Each part names its source in its README.',
  privacy: 'Nothing here is sent anywhere.',
});

export default COPY;
