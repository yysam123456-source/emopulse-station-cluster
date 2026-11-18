// 把 shared/core/src（只读基线）拼成一个可在零件里启动的 ES 模块。
//
// 为什么是「生成 + 补丁表」而不是手抄：
//   引擎是 6 个按顺序拼接的脚本（2320 行），彼此靠**同一个作用域**里的全局互相引用。
//   抄成 6 个 ES 模块要重写全部跨文件引用；整段手抄又没法交代「改了哪几行」。
//   这里只保留一张**逐条可审**的补丁表：每条 find 必须在原文里恰好出现 1 次，
//   否则构建直接失败（基线一旦漂移，不会静默生成一个半坏的文件）。
//
// 用法：node shared/parts/voxel-world/build-engine.mjs
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const CORE = path.resolve(here, '..', '..', 'core', 'src');

/** 拼接顺序与 shared/core/build.mjs 的 FILES 一致（顺序有意义）。 */
const FILES = ['quality.js', 'math.js', 'shaders.js', 'world.js', 'main.js', 'audio.js'];

/**
 * 补丁表。`file` 是来源文件，`find` 必须 **恰好出现一次**。
 * 每条都带一句「为什么必须改」，不然半年后没人敢动。
 */
const PATCHES = [
  {
    file: 'quality.js',
    why: '零件不复用独立页面的画质存档：同一 origin 下旧的 abyssal/abyssalLoad 会偷偷改变零件行为',
    find: "try { SV = (localStorage.abyssal || '').split(','); bad = localStorage.abyssalLoad; } catch {}",
    replace: '// [voxel-world] 不读 localStorage：零件行为只由装配器与设备决定',
  },
  {
    file: 'quality.js',
    why: '允许装配器钉住画质档位（env.level=0/1/2）：软件光栅器/低端设备上 LV=0 的 4x MSAA 直接拖死首帧',
    find: 'LV = SV[0] ? +SV[0] : mob ? (mem > 7 ? 1 : 2) : mem <= 4 ? 2 : 0;',
    replace: 'LV = env.level !== undefined ? env.level : SV[0] ? +SV[0] : mob ? (mem > 7 ? 1 : 2) : mem <= 4 ? 2 : 0;',
  },
  {
    file: 'main.js',
    why: '原本向宿主 document 取 id；嵌入后没有首屏 UI，改成惰性桩，不碰宿主 DOM',
    find: "const $ = (id) => document.getElementById(id);",
    replace: [
      'const STUB_EL = { hidden: false, textContent: \'\', className: \'\', onclick: null, focus() {},',
      '  animate: () => ({ ready: Promise.resolve() }), querySelectorAll: () => [], querySelector: () => null,',
      '  addEventListener() {}, style: {} };',
      'const $ = (id) => (env.el && env.el[id]) || STUB_EL;',
    ].join('\n'),
  },
  {
    file: 'main.js',
    why: '画布由装配器传入；body 换成哑对象，绝不给宿主 <body> 写 className（会改掉别人的 CSS 状态）',
    find: "const canvas = $('c'), info = $('i'), body = document.body;",
    replace: "const canvas = env.canvas, info = $('i'), body = { className: '' };",
  },
  {
    file: 'main.js',
    why: '加载条动画改成回调：create() 不应该被 CSS 动画时长卡住',
    find: '  return new Promise((r) => { a.ready.then(() => setTimeout(r)); setTimeout(r, document.hidden ? 0 : 1e3); });',
    replace: '  if (env.onProgress) env.onProgress(to, m);\n  return Promise.resolve();',
  },
  {
    file: 'main.js',
    why: '设备丢失时原页面会 location.reload()；在站群里那是刷新整个站点，必须改为上报',
    find: [
      "  if (LV < 2) { keep('abyssal', LV + 1); location.reload(); }",
      "  dead = body.className = 'l e'; $('s').textContent = 'The graphics device was lost. Reload the page to try again.';",
    ].join('\n'),
    replace: '  dead = true;\n  if (env.onLost) env.onLost(l.message || \'device lost\');',
  },
  {
    file: 'main.js',
    why: '新增两块零件侧的尺寸状态：PX = 画布设备像素（由装配器给），RS = LOD 渲染缩放（setLod 用）',
    find: '// ---------------------------------------------------------------- render targets (rebuilt on resize)',
    replace: [
      '// [voxel-world] PX 由零件注入（CSS 尺寸 × dpr），RS 是 setLod 用的内部渲染缩放。',
      'const PX = { w: max(2, round(env.width * env.dpr)), h: max(2, round(env.height * env.dpr)) };',
      'let RS = 1;',
      '// ---------------------------------------------------------------- render targets (rebuilt on resize)',
    ].join('\n'),
  },
  {
    file: 'main.js',
    why: '尺寸不再读 canvas.clientWidth × devicePixelRatio（那是独立页面的假设），改读零件给的 PX',
    find: '  DW = max(2, round(canvas.clientWidth * devicePixelRatio)); DH = max(2, round(canvas.clientHeight * devicePixelRatio));',
    replace: '  DW = max(2, round(PX.w)); DH = max(2, round(PX.h));',
  },
  {
    file: 'main.js',
    why: 'setLod("low") 必须真的少画像素：用 RS 给内部渲染分辨率封顶，动态分辨率只在封顶内浮动',
    find: '  const s = min(1, sqrt(pix / (DW * DH)));',
    replace: '  const s = min(1, RS, sqrt(pix / (DW * DH)));',
  },
  {
    file: 'main.js',
    why: '不再挂 window resize（宿主页面自己会变，装配器通过 resize() 通知），避免和 stage 抢尺寸',
    find: "resize();\naddEventListener('resize', resize);",
    replace: 'resize();',
  },
  {
    file: 'main.js',
    why: '动态分辨率的存档写入改为回调（唯一一次 localStorage 写也可能污染宿主 origin）',
    find: "    if (was !== pix + det) keep('abyssal', [LV, pix < top ? pix | 0 : '', det]); // nothing kept at full resolution",
    replace: '    if (was !== pix + det && env.onScale) env.onScale(pix, det);',
  },
  {
    file: 'main.js',
    why: '渲染循环由装配器的 rAF 驱动（stage 的 frame.t 已是唯一时钟），引擎自己不再 requestAnimationFrame',
    find: 'function frame(now) {\n  requestAnimationFrame(frame);',
    replace: 'function frame(now) {',
  },
  {
    file: 'main.js',
    why: '指针锁定在站群里会吞掉页面点击；只有明确 env.pointerLock 才装',
    find: "const capture = () => { sound(); const p = canvas.requestPointerLock({ unadjustedMovement: true }); if (p && p.catch) p.catch(() => canvas.requestPointerLock()).catch(() => 0); };\ncanvas.addEventListener('click', capture);",
    replace: "const capture = () => { if (env.audio) sound(); };\nif (env.pointerLock) canvas.addEventListener('click', capture);",
  },
  {
    file: 'main.js',
    why: '键盘监听挂在 window 上：嵌入后会把整个站点的 WASD 都吃掉，默认不装',
    find: "addEventListener('keydown', (e) => { if (menu && e.code !== 'KeyH' && e.code !== 'KeyM') return; sound(); key(e, 1); });\naddEventListener('keyup', (e) => key(e, 0));",
    replace: "if (env.input) addEventListener('keydown', (e) => { if (e.code === 'KeyH' || e.code === 'KeyM') return; sound(); key(e, 1); });\nif (env.input) addEventListener('keyup', (e) => key(e, 0));",
  },
  {
    file: 'main.js',
    why: '鼠标位移只在 pointer lock 下有效，嵌入后由 stage 的 pointer 经 look() 转发',
    find: "addEventListener('mousemove', (e) => { if (document.pointerLockElement === canvas) { mdx += e.movementX; mdy += e.movementY; } });\naddEventListener('blur', release);",
    replace: "if (env.pointerLock) addEventListener('mousemove', (e) => { if (document.pointerLockElement === canvas) { mdx += e.movementX; mdy += e.movementY; } });\nif (env.input) addEventListener('blur', release);",
  },
  {
    file: 'main.js',
    why: '触摸监听会 preventDefault 掉宿主页面的滚动，默认不装',
    find: "for (const n of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) canvas.addEventListener(n, touch, { passive: false });",
    replace: "if (env.input) for (const n of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) canvas.addEventListener(n, touch, { passive: false });",
  },
  {
    file: 'main.js',
    why: '菜单默认关：嵌入形态没有首屏菜单，menu=true 会让键盘与动态分辨率阈值都走错分支',
    find: 'let menu = true;',
    replace: 'let menu = false;',
  },
  {
    file: 'main.js',
    why: 'pointerlockchange 监听会调 ui() 改 body.className，嵌入后没有意义',
    find: "document.addEventListener('pointerlockchange', () => ui(!document.pointerLockElement));",
    replace: '// [voxel-world] 不监听 pointerlockchange：嵌入形态没有指针锁定',
  },
  {
    file: 'main.js',
    why: '启动尾巴（首帧 + rAF 自驱 + 菜单揭示）换成返回控制面：帧由 stage 驱动',
    find: [
      '// draw the first frame and wait for the GPU to finish it (pipelines get compiled on first use) before the reveal',
      'lookAt(...POSES[0]);',
      "await say('Letting the light in…', 1, 400);",
      'render(); await Q.onSubmittedWorkDone();',
      "setTimeout(keep, 15e3, 'abyssalLoad', ''); // the load counts as survived after 15 s of frames",
      'ui(true);',
      'requestAnimationFrame((t) => { F[LAST] = t; requestAnimationFrame(frame); });',
    ].join('\n'),
    replace: [
      '// [voxel-world] 首帧 + 等 GPU 编完管线，然后交出控制面（不再自己 requestAnimationFrame）。',
      'lookAt(...POSES[0]);',
      "await say('Letting the light in…', 1, 400);",
      'render(); await Q.onSubmittedWorkDone();',
      'F[LAST] = -1;',
      'return {',
      '  render(nowMs) { frame(nowMs); },',
      '  look(dxPx, dyPx) { mdx += dxPx; mdy += dyPx; },',
      '  move(forward, strafe, rise) { kf = forward > 0 ? 1 : 0; kb = forward < 0 ? 1 : 0; kr = strafe > 0 ? 1 : 0; kl = strafe < 0 ? 1 : 0; ku = rise > 0 ? 1 : 0; kd = rise < 0 ? 1 : 0; },',
      '  boost(on) { ks = on ? 1 : 0; },',
      '  setView(x, y, z, tx, ty, tz) { lookAt(x, y, z, tx, ty, tz); },',
      '  layout(cssW, cssH, dpr) { PX.w = max(2, round(cssW * dpr)); PX.h = max(2, round(cssH * dpr)); resize(); },',
      '  setScale(scale) { RS = clamp(scale, 0.25, 1); resize(); },',
      '  readbackSize() { return { W, H, DW, DH, level: LV }; },',
      '  dispose() { try { ctx.unconfigure(); } catch {} try { device.destroy(); } catch {} },',
      '};',
    ].join('\n'),
  },
  {
    file: 'audio.js',
    why: 'visibilitychange 监听是独立页面的行为；零件默认不出声（env.audio 才装）',
    find: "document.addEventListener('visibilitychange', () => { if (AC) document.hidden ? AC.suspend() : AC.resume(); });",
    replace: "if (env.audio) document.addEventListener('visibilitychange', () => { if (AC) document.hidden ? AC.suspend() : AC.resume(); });",
  },
];

const HEADER = `// ⚠️ 生成文件，不要手改 —— 改 shared/parts/voxel-world/build-engine.mjs 里的补丁表后重跑。
//
// 来源（只读基线，字节未动）：shared/core/src/{${FILES.join(', ')}}，按此顺序拼成同一作用域。
// 生成命令：node shared/parts/voxel-world/build-engine.mjs
`;

/**
 * 计算文件 sha256 前 12 位，写进产物头部便于对账。
 *
 * @param {string} file 绝对路径
 * @returns {string}
 */
function digest(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 12);
}

const sources = FILES.map((f) => ({ file: f, text: readFileSync(path.join(CORE, f), 'utf8') }));

// 逐条应用补丁；find 必须唯一命中，否则说明基线变了，立刻报错而不是生成一个半坏的模块。
for (const p of PATCHES) {
  const src = sources.find((s) => s.file === p.file);
  const hits = src.text.split(p.find).length - 1;
  if (hits !== 1) {
    throw new Error(`[build-engine] 补丁未命中：${p.file} 中 ${JSON.stringify(p.find.slice(0, 60))} 出现 ${hits} 次（期望 1）`);
  }
  src.text = src.text.replace(p.find, p.replace);
}

const provenance = sources.map((s) => `//   ${s.file}: sha256:${digest(path.join(CORE, s.file))}`).join('\n');
const body = sources.map((s) => `// ---- ${s.file} ----\n${s.text}`).join('\n');

const out = `${HEADER}// 基线指纹：\n${provenance}
//
// 对外的唯一入口：createVoxelEngine(env) → Promise<控制面>。
// env: { canvas, width, height, dpr, el?, onProgress?, onLost?, onScale?,
//        input?, pointerLock?, audio? } —— 全部可选，缺省即「不接管宿主」。
export async function createVoxelEngine(env) {
${body}
}
`;

writeFileSync(path.join(here, 'engine.js'), out);
const kb = (Buffer.byteLength(out) / 1024).toFixed(1);
console.log(`engine.js: ${kb} kB, ${sources.reduce((n, s) => n + s.text.split('\n').length, 0)} 行源码, ${PATCHES.length} 条补丁`);
