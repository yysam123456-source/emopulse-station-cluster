// 预览通路的门 —— 「能构建」不足以说明能用，所以这里断言的是四件更容易骗人的事：
//   1. **零外部请求**：产物里不许出现 http(s):// / src= / href= / <link / @import
//      （file:// 打开就能看的承诺全靠这一条；漏一条就是「离线打不开」）
//   2. **占位符清零**：模板漏替换一处，页面会静默显示 `__PREVIEW_STYLE__` 这种字面量
//   3. **零件真的在里面**：按 id 字面命中。这条防的是「构建成功但零件被 tree-shake 掉了」——
//      产物只有壳、页面一片黑，而所有其它断言全绿。
//   4. **Node 侧 createStage 不抛**：构建器能生成 HTML，不代表这套 composition 装配得起来
//      （重复 L4 / 两个 gl 通道 / costMs 非法都会在 createStage 里抛）。
//
// 用法：node tests/preview-build.mjs
import path from 'node:path';
import vm from 'node:vm';
import { existsSync } from 'node:fs';
import { buildPreview, loadPartDefs, PRESETS, PART_ENTRY, REPO_ROOT, resolvePreset } from '../shared/stage/preview/build.mjs';
import { loadTsModule } from './lib/load-ts.mjs';
import { guardCtx } from './lib/fake-ctx.mjs';

const failures = [];
let checks = 0;

/**
 * 记一次断言。
 *
 * @param {boolean} ok 条件
 * @param {string} msg 失败描述
 */
function check(ok, msg) {
  checks += 1;
  if (!ok) failures.push(msg);
}

// ── 假画布：够 field-ground / paper-ink / pixel-post 三条真实路径跑完 ──
/**
 * 造一个记账用假 2D 上下文。
 *
 * 刻意实现 getImageData / putImageData / createPattern：L4 后处理零件会走这三条，
 * 缺了它们测试就会「因为不支持而跳过」，等于没测。
 *
 * @param {object} counts 计数器（跨 ctx 共享同一份，便于汇总）
 * @returns {object} 假 ctx
 */
/** 所有假 ctx 的守卫（收尾统一断言"没有未实现的方法"） */
const ctxGuards = [];

function makeFakeCtx(counts) {
  const gradient = { addColorStop() { counts.gradientStop += 1; } };
  /** 每个假 canvas 记自己的像素尺寸，供 getImageData 造同尺寸缓冲 */
  const ctx = {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: null,
    strokeStyle: null,
    lineWidth: 1,
    lineCap: 'butt',
    imageSmoothingEnabled: true,
    save() {},
    restore() {},
    setTransform() {},
    resetTransform() {},
    translate() {},
    scale() {},
    rotate() {},
    clip() {},
    createLinearGradient() { counts.gradient += 1; return gradient; },
    createRadialGradient() { counts.gradient += 1; return gradient; },
    createPattern() { counts.pattern += 1; return { __pattern: true }; },
    rect() {},
    fillRect() { counts.fillRect += 1; },
    strokeRect() { counts.strokeRect += 1; },
    clearRect() { counts.clearRect += 1; },
    drawImage() { counts.drawImage += 1; },
    beginPath() { counts.path += 1; },
    moveTo() {},
    lineTo() { counts.segment += 1; },
    quadraticCurveTo() { counts.segment += 1; },
    bezierCurveTo() { counts.segment += 1; },
    arc() {},
    ellipse() {},
    closePath() {},
    fill() { counts.fill += 1; },
    stroke() { counts.stroke += 1; },
    fillText() { counts.text += 1; },
    measureText() { return { width: 0 }; },
    getImageData(x, y, w, h) {
      counts.getImageData += 1;
      const width = Math.max(1, Math.floor(w));
      const height = Math.max(1, Math.floor(h));
      return { data: new Uint8ClampedArray(width * height * 4), width, height };
    },
    createImageData(w, h) {
      counts.createImageData += 1;
      const width = Math.max(1, Math.floor(w));
      const height = Math.max(1, Math.floor(h));
      return { data: new Uint8ClampedArray(width * height * 4), width, height };
    },
    putImageData() { counts.putImageData += 1; },
  };
  const guarded = guardCtx(ctx);
  ctxGuards.push(guarded);
  return guarded.ctx;
}

/**
 * 造一个假 canvas（可带 ownerDocument 以启用离屏路径）。
 *
 * ★ 这里实现的是**严格语义**：一个 canvas 只有一种上下文模式，先到先得。
 *   之前写的是 `getContext(id){ return id === '2d' ? ctx : null }`，即对 'webgl2'
 *   永远返回 null —— 真实浏览器里 `getContext('webgl2')` 会成功并锁定模式，
 *   随后 `getContext('2d')` 恒为 null。正是这条写反了的语义把 2026-11-18 的
 *   P0 白屏（stage 在主画布上探测 webgl2）藏了整整一轮。
 *
 * @param {number} w CSS 宽
 * @param {number} h CSS 高
 * @param {object} counts 计数器
 * @returns {object} 假 canvas（`__mode` 暴露最终锁定的上下文模式）
 */
function makeFakeCanvas(w, h, counts) {
  const ctx = makeFakeCtx(counts);
  /** 已锁定的上下文模式（null = 还没有人请求过） */
  let mode = null;
  const el = {
    width: Math.round(w),
    height: Math.round(h),
    clientWidth: w,
    clientHeight: h,
    style: {},
    get mode() { return mode; },
    getContext(id) {
      // 真实的 webgl2 上下文对象我们只需要「非 null」这一件事
      const handle = id === '2d' ? ctx : {};
      if (mode === null) { mode = id; return handle; }
      return mode === id ? handle : null;
    },
    addEventListener() { throw new Error('零件不许 addEventListener（宿主负责收浏览器事件）'); },
  };
  el.ownerDocument = {
    createElement() { return makeFakeCanvas(1, 1, counts); },
  };
  return el;
}

const stageMod = await loadTsModule(path.join(REPO_ROOT, 'shared/stage/index.ts'));

/**
 * 从产物 HTML 里取出那唯一一段内联脚本。
 *
 * @param {string} html 产物
 * @returns {string} 脚本源码
 */
function extractScript(html) {
  const start = html.indexOf('<script>');
  const end = html.lastIndexOf('</script>');
  if (start < 0 || end < 0) throw new Error('产物里找不到内联 <script>');
  return html.slice(start + '<script>'.length, end);
}

/**
 * 在 Node 的 vm 里**真的执行**产物脚本（假 DOM）。
 *
 * 为什么必须有这一步：`shared/stage/preview/host.ts` 是 300 行浏览器侧代码，
 * 除了 `tsc --noEmit` 之外没有任何东西碰过它 —— 类型对不等于能跑。
 * 这一步把产物里那段真实脚本跑起来，验证四件事：
 *   ① host 能拿到 #stage/#dbg，能建舞台
 *   ② rAF 循环真的推进了帧（`stats.frames` 增长）
 *   ③ 调试条被真的写入了（`#dbg.textContent` 含 `state`）
 *   ④ 缺能力的零件走 degraded 分支（hug 预设没有 WebGPU → voxel-world 应被标 unsupported）
 *
 * @param {string} html 产物
 * @param {string} name preset 名
 * @returns {{ snapshot: object, dbg: string, bodyState: string, canvasMode: string|null, declaredCost: number }}
 */
function runProductInShim(html, name) {
  const script = extractScript(html);
  const counts = {
    gradient: 0, gradientStop: 0, pattern: 0, fillRect: 0, clearRect: 0, drawImage: 0,
    path: 0, segment: 0, fill: 0, stroke: 0, text: 0,
    getImageData: 0, createImageData: 0, putImageData: 0,
    strokeRect: 0,
  };

  const mainCanvas = makeFakeCanvas(1280, 720, counts);
  const glCanvas = makeFakeCanvas(1280, 720, counts);
  const dbg = { textContent: '' };
  const errBox = { hidden: true, textContent: '' };
  const elements = { stage: mainCanvas, gl: glCanvas, dbg, 'boot-error': errBox };
  const body = { dataset: /** @type {Record<string, string>} */ ({}) };

  /** 待执行的 rAF 回调队列（我们手动 tick，不靠真实时钟） */
  const rafQueue = [];

  const sandbox = {
    document: {
      getElementById(id) { return Object.prototype.hasOwnProperty.call(elements, id) ? elements[id] : null; },
      body,
      // 能力探针会在**一次性画布**上试 getContext('webgl2')：这里给它一张真画布语义的假画布。
      // （沙箱里没有 navigator.gpu，所以 voxel-world 仍然走 unsupported —— 这正是要测的分支。）
      createElement() { return makeFakeCanvas(1, 1, counts); },
    },
    requestAnimationFrame(callback) { rafQueue.push(callback); return rafQueue.length; },
    cancelAnimationFrame() {},
    matchMedia() { return { matches: false }; },
    addEventListener() {},
    performance: { now: () => Date.now() },
    console,
  };
  // 宿主脚本里既用 `window` 也用 `globalThis`：让它们都指向同一个沙箱
  sandbox.window = sandbox;
  sandbox.self = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(script, sandbox, { timeout: 10000, filename: `${name}-preview.js` });

  const handle = vm.runInContext('globalThis.__preview', sandbox);
  if (!handle) {
    throw new Error(`产物没暴露 __preview（host 启动失败）：${errBox.textContent || '(无错误信息)'}`);
  }

  // 手动推三帧：每帧回调会再注册下一帧，所以每轮都要从队列里取
  let ts = 0;
  for (let i = 0; i < 3; i += 1) {
    const callback = rafQueue.shift();
    if (!callback) break;
    ts += 16.7;
    callback(ts);
  }

  return {
    snapshot: handle.snapshot(),
    dbg: dbg.textContent,
    bodyState: String(body.dataset.state),
    canvasMode: mainCanvas.mode,
    // 产物里声明的总成本：用来验证「presets 里的 opts 真的进了产物」
    declaredCost: handle.stage.stats.budgetCostMs,
  };
}

// ── 0. 登记表自洽：PART_ENTRY 指向的入口都真的存在 ──
for (const [id, rel] of Object.entries(PART_ENTRY)) {
  check(existsSync(path.join(REPO_ROOT, rel)), `PART_ENTRY[${id}] 指向不存在的文件：${rel}`);
}

// ── 1. 每个 preset 逐条断言 ──
const summary = [];
for (const name of Object.keys(PRESETS)) {
  const preset = resolvePreset(name);
  const first = await buildPreview({ preset: name, out: null });
  const second = await buildPreview({ preset: name, out: null });
  const html = first.html;

  check(first.bytes > 512, `${name}: 产物过小（${first.bytes} B），模板可能没渲染`);
  check(first.bytes === Buffer.byteLength(html, 'utf8'), `${name}: bytes 与 html 实际长度不一致`);
  check(html === second.html, `${name}: 两次构建产物不逐字节一致（构建不确定，无法复现画面）`);

  // 零外部请求
  // ★ 例外：three.js 内部用 `http://www.w3.org/1999/xhtml` 作为 createElementNS 的
  //   **XML 命名空间**，它不是网络请求。只放行这一个字面量，其余 http(s) 仍然红。
  const htmlExternal = html.replace(/http:\/\/www\.w3\.org\/1999\/xhtml/g, 'urn:xhtml');
  const externalPatterns = [
    [/https?:\/\//i, 'http(s)://'],
    [/\bsrc\s*=\s*["']/i, 'src='],
    [/\bhref\s*=\s*["']/i, 'href='],
    [/<link\b/i, '<link>'],
    [/<img\b/i, '<img>'],
    [/@import/i, '@import'],
    [/\burl\s*\(/i, 'url('],
  ];
  for (const [pattern, label] of externalPatterns) {
    check(!pattern.test(htmlExternal), `${name}: 产物里出现了 ${label}（零外部请求被破坏）`);
  }

  // 占位符清零
  check(!/__PREVIEW_[A-Z]+__/.test(html), `${name}: 残留未替换占位符 ${(html.match(/__PREVIEW_[A-Z]+__/g) ?? []).join(',')}`);

  // 结构：恰好一个内联 script，且没有任何带属性的 script
  const scriptTags = (html.match(/<script\b/gi) ?? []).length;
  check(scriptTags === 1, `${name}: 应恰好 1 个 <script>，实得 ${scriptTags}`);
  check(!/<script\s+[^>]/i.test(html), `${name}: <script> 带属性（外部脚本的入口）`);
  check(html.includes('id="stage"'), `${name}: 缺 #stage 画布`);
  // 脚本体里若出现 `</script` 会提前闭合标签。文档里合法的 `</script` 只有一个（自己的闭合标签），
  // 所以判据是「出现次数恰好 1」——写成 `!includes('</script')` 会永远为假，那是一条恒红断言。
  const closeTags = (html.match(/<\/script/gi) ?? []).length;
  check(closeTags === 1, `${name}: </script 出现 ${closeTags} 次（应恰好 1 次；多余即脚本被截断）`);

  // 零件真的装进去了（按 id 字面命中）
  const partIds = preset.parts.map((item) => (typeof item === 'string' ? item : item.id));
  for (const id of partIds) {
    check(html.includes(id), `${name}: 零件 id "${id}" 未出现在产物里（很可能被 tree-shake 掉了）`);
  }

  // GL 画布只在有 gl 通道零件时出现
  // world 与 gl 共用 #gl：任何一个 world 零件都要求画布存在。
  const expectsGl = partIds.some((id) => id === 'voxel-world' || id === 'koi-pond' || id === 'hug-meadow' || id === 'dawn-desk' || id === 'nebula' || id === 'temple');
  check(first.hasGl === expectsGl, `${name}: hasGl=${first.hasGl}，期望 ${expectsGl}`);
  check(html.includes('id="gl"') === expectsGl, `${name}: #gl 画布存在性与 hasGl 不一致`);

  // 装配顺序来自装配器，不是写入顺序
  const expectedOrder = partIds.slice().sort();
  check(
    JSON.stringify(first.order.slice().sort()) === JSON.stringify(expectedOrder),
    `${name}: order=${first.order.join(',')}，期望零件集合 ${expectedOrder.join(',')}`,
  );

  // ── Node 侧 createStage 冒烟（跳过 gl 通道：Node 里没有 WebGPU）──
  // 用构建器**同一套**加载逻辑（含工厂参数），否则 smoke 测的是「缺省零件」而不是「产物里那个零件」。
  // 曾经这里逐个 loadTsModule 拿 `part`，于是 ink 的 pixel-post 一直按缺省参数（快路径）被冒烟，
  // 而产物里跑的是 dither 读回路径 —— 两条路的每帧指令完全不同，等于没测到。
  const { defs } = await loadPartDefs(preset.parts);

  // ── 底件必须存在（隐性不变量）──
  // 帧循环**从不 clearRect**，整幅画面靠一件不透明的 L0/L1 每帧铺满。
  // 若某个 composition 里没有 L0/L1，切换画面时会残留上一帧像素（气泡尾巴留在天上）。
  // 空 parts 合法（empty 预设就是最小基线），所以只在非空时要求。
  if (preset.parts.length > 0) {
    check(
      defs.some((def) => def.layer === 'L0' || def.layer === 'L1'),
      `${name}: 装配里没有任何 L0/L1 底件 —— 帧循环没有 clearRect，缺底件会残留上一帧像素`,
    );
  }
  // ★ Node 里没有 WebGPU，所以 gl 零件**换成同层同 id 的 canvas2d 替身**，而不是直接过滤掉。
  //   直接过滤会让 `still`（voxel-world L1 + bubbles L2）退化成"只有 L2"，
  //   触发 `E_NO_BASE` —— 那不是装配错了，是**测试环境把底件摘掉了**。
  //   替身保留 layer 与 id，所以层序断言仍然成立，也不会误报缺底件。
  const stubGl = (def) => ({
    ...def,
    channel: 'canvas2d',
    // 替身不需要真能力，否则仍会被装配器标成 unsupported
    requires: undefined,
    // `space:'subject'` 只对 world 有意义；换成 canvas2d 后必须一起摘掉，
    // 否则装配器会在 Node 里报「subject 只对 world 有意义」——那是替身造出来的假错。
    space: undefined,
    create: () => ({
      update() {},
      draw() {},
      resize() {},
      setLod() {},
      dispose() {},
    }),
  });
  const canvas2dDefs = defs.map((def) => ((def.channel ?? 'canvas2d') === 'canvas2d' ? def : stubGl(def)));
  const counts = {
    gradient: 0, gradientStop: 0, pattern: 0, fillRect: 0, clearRect: 0, drawImage: 0,
    path: 0, segment: 0, fill: 0, stroke: 0, text: 0,
    getImageData: 0, createImageData: 0, putImageData: 0,
  };
  const canvas = makeFakeCanvas(1280, 720, counts);
  let clock = 0;
  let smokeError = null;
  let stage = null;
  try {
    stage = stageMod.createStage({
      canvas,
      parts: canvas2dDefs,
      biome: preset.biome,
      seed: preset.seed,
      budgetMs: 100, // 给足预算：这一条测「装得起来」，降档行为归 stage-smoke 管
      now: () => clock,
    });
    clock += 16;
    stage.frame(clock);
    clock += 16;
    stage.frame(clock);
  } catch (error) {
    smokeError = error instanceof Error ? error.message : String(error);
  }

  check(smokeError === null, `${name}: Node 侧 createStage/frame 抛错：${smokeError}`);
  if (stage) {
    check(stage.stats.frames === 2, `${name}: 应推进 2 帧，实得 ${stage.stats.frames}`);
    check(stage.degraded.length === 0, `${name}: 预算 100ms 下不应降档，实得 ${JSON.stringify(stage.degraded)}`);
    check(
      stage.stats.drawn === canvas2dDefs.length,
      `${name}: 应绘制 ${canvas2dDefs.length} 件，实得 ${stage.stats.drawn}`,
    );
    stage.dispose();
    stage.dispose(); // 幂等
    check(stage.degraded.length === 0, `${name}: dispose 后 degraded 应清空`);
  }

  // ── 产物脚本真的跑起来（假 DOM + vm）──
  let shim = null;
  let shimError = null;
  try {
    shim = runProductInShim(html, name);
  } catch (error) {
    shimError = error instanceof Error ? error.message : String(error);
  }
  check(shimError === null, `${name}: 产物脚本在假 DOM 里跑不起来：${shimError}`);
  if (shim) {
    const snap = shim.snapshot;
    check(
      JSON.stringify(snap.order.slice().sort()) === JSON.stringify(expectedOrder),
      `${name}: 产物里实际装配顺序=${snap.order.join(',')}，期望集合 ${expectedOrder.join(',')}`,
    );
    check(snap.frames === 3, `${name}: rAF 推 3 帧后 frames=${snap.frames}（应 3，说明循环没跑起来）`);
    check(shim.dbg.includes('state'), `${name}: 调试条没被写入（#dbg 仍是空的：${JSON.stringify(shim.dbg)}）`);

    // degraded 只允许是**两种正当理由**之一：
    //   ① unsupported：沙箱里没有 WebGPU，voxel-world 必须被标出来；
    //   ② budget：声明成本超预算（例如 ink 的 dither 实测 7.9ms + paper-ink 1.3 > 8ms）。
    // 任何 'suspended'（运行期抛错被隔离）都是 bug，必须红。
    // 之前这里写的是「非 GL 站必须 ready」——那会逼着我把 ink 的成本报低才不红，方向反了。
    const reasons = snap.degraded.map((entry) => entry.reason);
    check(!reasons.includes('suspended'), `${name}: 出现运行期抛错隔离：${JSON.stringify(snap.degraded)}`);
    if (expectsGl) {
      check(
        reasons.includes('unsupported'),
        `${name}: 无 WebGPU 时应记 unsupported，实得 ${JSON.stringify(snap.degraded)}`,
      );
    }
    const overBudget = shim.declaredCost > preset.budgetMs;
    check(
      overBudget ? reasons.includes('budget') : !reasons.includes('budget'),
      `${name}: 声明 ${shim.declaredCost.toFixed(2)}ms / 预算 ${preset.budgetMs}ms，budget 记录=${JSON.stringify(reasons)}`,
    );
    check(shim.bodyState === snap.state, `${name}: body[data-state]=${shim.bodyState} 与快照 ${snap.state} 不一致`);
    check(
      shim.canvasMode === '2d',
      `${name}: 主画布被锁成 '${shim.canvasMode}'（应为 '2d'；为 'webgl2' 即 P0 白屏回归）`,
    );
    // ★ 产物里实际装配到的 costMs 必须等于构建器（含工厂参数）算出来的 costMs。
    //   这条防的是「presets 的 opts 只作用于 Node 侧校验、没进浏览器 bundle」——
    //   那个 bug 让 ink 的 dither 静默失效，而所有别的断言都是绿的。
    const expectedCost = defs.reduce((sum, def) => sum + def.costMs, 0);
    check(
      Math.abs(shim.declaredCost - expectedCost) < 0.02,
      `${name}: 产物内 costMs 合计 ${shim.declaredCost.toFixed(2)} ≠ 构建器算出的 ${expectedCost.toFixed(2)}（opts 没进产物？）`,
    );
    if (expectsGl) {
      const hit = snap.degraded.some((entry) => entry.reason === 'unsupported');
      check(hit, `${name}: 无 GL 时 world/gl 零件应记 unsupported，实得 ${JSON.stringify(snap.degraded)}`);
    }
  }

  summary.push({
    name,
    bytes: first.bytes,
    script: first.sourceBytes,
    parts: first.order.join(',') || '(none)',
    canvasOps: `drawImage=${counts.drawImage} fillRect=${counts.fillRect} stroke=${counts.stroke} clearRect=${counts.clearRect} getImageData=${counts.getImageData} putImageData=${counts.putImageData}`,
  });
}

// ── 2. 组合真的改变了产物：空场景必须比装了零件的场景小 ──
// 这条防的是「构建器把 parts 忽略了，所有 preset 都产同一个壳」——那种情况下上面每条都绿。
{
  const emptyBytes = summary.find((row) => row.name === 'empty')?.bytes ?? 0;
  const fieldBytes = summary.find((row) => row.name === 'field')?.bytes ?? 0;
  check(emptyBytes > 0 && fieldBytes > emptyBytes, `field(${fieldBytes} B) 应大于 empty(${emptyBytes} B)：零件可能没被打进去`);
}

// ── 3. 未知 preset 必须报错，且报错信息里带可用清单 ──
{
  let message = '';
  try {
    resolvePreset('nope');
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  check(message.includes('nope') && message.includes('empty'), `未知 preset 的报错不合格：${message || '(没抛错)'}`);
}

// ── 4. 最小基线可跑：预设名为 empty 时确实不装任何零件 ──
check(resolvePreset('empty').parts.length === 0, 'preset empty 必须不装任何零件（它是最小可跑基线）');

// ── 报告 ──
console.log('预览通路：\n');
console.log('  preset  单文件字节  脚本字节  零件            Node 假 canvas 每帧指令');
for (const row of summary) {
  console.log(
    `  ${row.name.padEnd(7)} ${String(row.bytes).padStart(9)}  ${String(row.script).padStart(8)}  `
    + `${row.parts.padEnd(15)} ${row.canvasOps}`,
  );
}
console.log('');

// ── 假 ctx 必须覆盖零件调用过的所有方法 ──
for (const guard of ctxGuards) {
  checks += 1;
  if (guard.missing.size > 0) {
    failures.push(`假 ctx 缺少方法：${[...guard.missing].join(', ')}（被零件调用过；等于测试跑在了不同的环境里）`);
  }
}

if (failures.length === 0) {
  console.log(`preview-build: PASS ${checks}/${checks}`);
  process.exit(0);
}
console.error(`preview-build: FAIL ${failures.length}/${checks}`);
for (const failure of failures) console.error(`  - ${failure}`);
process.exit(1);
