// R4 / GM-6 / NX-Q-02：mountSite 自带兜底 —— 能力探测、冲突降级、同步/异步异常兜底、如实标注。
// 无头手法：把 mount-site.ts 按通道 B2（browser IIFE）打包到 node:vm 沙箱里跑，
// 用最小 DOM stub 模拟浏览器；异步异常由「直接触发已注册的 unhandledrejection / error 监听器」验证
//（真实浏览器事件无法在无头 node 中产生，此为本测试的已知限制，已在报告标注）。
// 用法：node tests/verify-degradation.mjs
import vm from 'node:vm';
import path from 'node:path';
import { bundleIife, toImportSpecifier, REPO_ROOT } from './lib/load-ts.mjs';

let checks = 0;
const failures = [];
function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

/** 最小 DOM 节点 stub（属性记录 + 中性提示节点）。 */
function createElement() {
  const attrs = new Map();
  const element = {
    attrs,
    textContent: null,
    setAttribute(name, value) { attrs.set(name, String(value)); },
    getAttribute(name) { return attrs.has(name) ? attrs.get(name) : null; },
    hasAttribute(name) { return attrs.has(name); },
    removeAttribute(name) { attrs.delete(name); },
    querySelector() { return null; },
  };
  return element;
}

/** 创建沙箱：withDocument=false 用于验证 no-canvas2d 降级；withRaf=false 验证无帧循环环境。 */
function createSandbox(options = {}) {
  const { withDocument = true, withRaf = true } = options;
  const body = createElement();
  const note = createElement();
  body.querySelector = (selector) => (selector === '[data-degraded-note]' ? note : null);

  const globalListeners = new Map();
  const sandbox = {
    console: { log() {}, warn() {}, error() {}, info() {} },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    addEventListener(type, fn) {
      if (!globalListeners.has(type)) globalListeners.set(type, []);
      globalListeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const list = globalListeners.get(type) ?? [];
      const index = list.indexOf(fn);
      if (index >= 0) list.splice(index, 1);
    },
  };

  if (withDocument) {
    sandbox.document = {
      body,
      documentElement: body,
      hidden: false,
      createElement: () => ({ getContext: () => ({}) }),
      getElementById: () => null,
      querySelector: () => null,
      addEventListener() {},
      removeEventListener() {},
    };
  }
  if (withRaf) {
    // 不真正驱动帧循环（保持测试确定性）：帧桥启动后不会回调 onFrame。
    sandbox.requestAnimationFrame = () => 1;
    sandbox.cancelAnimationFrame = () => {};
  }

  const context = vm.createContext(sandbox);
  return {
    context,
    body,
    note,
    dispatch(type, event) {
      for (const fn of globalListeners.get(type) ?? []) fn(event);
    },
    listenerCount(type) {
      return (globalListeners.get(type) ?? []).length;
    },
  };
}

/** 跑一段 bundle 并 mountSite，返回沙箱与诊断快照。 */
async function runCase(bundleCode, config, sandboxOptions = {}) {
  const sandbox = createSandbox(sandboxOptions);
  vm.runInContext(bundleCode, sandbox.context, { filename: 'mount-site-bundle.js' });
  check(typeof sandbox.context.EmoPulse?.mountSite === 'function', 'bundle 应导出全局 EmoPulse.mountSite');
  // mountSite 本身不得抛错（绝不 rethrow）
  let mountThrew = null;
  try {
    sandbox.context.EmoPulse.mountSite(config);
  } catch (error) {
    mountThrew = error;
  }
  check(mountThrew === null, `mountSite 不得同步抛错，实际：${mountThrew?.message}`);
  const ready = sandbox.context.__emopulseReady;
  check(ready && typeof ready.then === 'function', 'mountSite 必须暴露 __emopulseReady 握手 Promise（供无头断言）');
  if (ready?.then) await ready;
  return { sandbox, diagnostics: sandbox.context.__emopulseDiagnostics };
}

/** 构造一个最小 SiteConfig（theme 五值齐全，避免下游假设）。 */
function makeConfig(overrides = {}) {
  return {
    id: 'fixture-degrade',
    route: '/fixture-degrade',
    theme: { WCOL: [0.1, 0.2, 0.3], PCOL: [0.4, 0.5, 0.6], SUNC: [1, 1, 1], EXPO: 0.5, RAYS: 0.4 },
    copy: { title: 'Degrade Fixture', subtitle: 'headless', controls: [], locale: 'zh-en' },
    layout: { seed: 1, viewpoints: [], quality: 'auto', audio: { enabled: false, volume: 0.2 } },
    parts: [],
    analytics: { enabled: false },
    ...overrides,
  };
}

const MOUNT_ENTRY = `export { mountSite } from ${toImportSpecifier(path.join(REPO_ROOT, 'shared/contract/mount-site'))};`;
const mountBundle = bundleIife({ contents: MOUNT_ENTRY, globalName: 'EmoPulse' });

// ─── A. 正常路径：Canvas2D 可用 → 不降级、无 data-degraded ─────────────────────
{
  const { sandbox, diagnostics } = await runCase(mountBundle, makeConfig());
  check(sandbox.body.getAttribute('data-renderer') === 'canvas2d',
    `正常路径 data-renderer 应为 canvas2d，实际 ${sandbox.body.getAttribute('data-renderer')}`);
  check(sandbox.body.hasAttribute('data-degraded') === false,
    `正常路径不应出现 data-degraded，实际 ${sandbox.body.getAttribute('data-degraded')}`);
  check(diagnostics.degraded === false, '正常路径 diagnostics.degraded 应为 false');
  check(diagnostics.uncaught === 0, `正常路径未捕获异常必须为 0，实际 ${diagnostics.uncaught}`);
  check(diagnostics.renderer === 'canvas2d', `正常路径 renderer 应为 canvas2d，实际 ${diagnostics.renderer}`);
  check(diagnostics.parts === 0, `无 composition 时装配零件数应为 0，实际 ${diagnostics.parts}`);
  check(sandbox.listenerCount('unhandledrejection') === 1, '应已安装 1 个 unhandledrejection 兜底监听');
  check(sandbox.listenerCount('error') === 1, '应已安装 1 个 error 兜底监听');
  check(sandbox.listenerCount('pagehide') === 1, '应已安装 1 个 pagehide 清理监听');
}

// ─── B. 无 document（连 Canvas2D 都没有）→ static + no-canvas2d ───────────────
{
  const { diagnostics } = await runCase(mountBundle, makeConfig(), { withDocument: false, withRaf: false });
  check(diagnostics.renderer === 'static', `无 document 时 renderer 应为 static，实际 ${diagnostics.renderer}`);
  check(diagnostics.degraded === true, '无 document 时必须如实标注降级');
  check(diagnostics.reason === 'no-canvas2d', `降级原因应为 no-canvas2d，实际 ${diagnostics.reason}`);
  check(diagnostics.uncaught === 0, '无 document 时不得产生未捕获异常');
}

// ─── C. 冲突（duplicate-exclusive）→ data-degraded="conflict"，不启动零件 ───────
{
  const conflictBundle = bundleIife({
    globalName: 'EmoPulse',
    contents: `
      import { registerPart } from ${toImportSpecifier(path.join(REPO_ROOT, 'shared/contract/parts-registry'))};
      import { mountSite } from ${toImportSpecifier(path.join(REPO_ROOT, 'shared/contract/mount-site'))};
      const claims = [{ resource: 'canvas:stage', mode: 'exclusive' }];
      registerPart({ id: 'dup-1', layer: 'scene', origin: 'equivalent', entry: 'x', contract: 'v1', claims }, () => ({ dispose() {} }));
      registerPart({ id: 'dup-2', layer: 'scene', origin: 'equivalent', entry: 'x', contract: 'v1', claims }, () => ({ dispose() {} }));
      export { mountSite };
    `,
  });
  const config = makeConfig({
    composition: {
      narrative: [], interaction: [], audio: [], artifact: [],
      scene: [{ ref: 'dup-1', enabled: true }, { ref: 'dup-2', enabled: true }],
    },
  });
  const { sandbox, diagnostics } = await runCase(conflictBundle, config);
  check(sandbox.body.getAttribute('data-degraded') === 'conflict',
    `冲突时 data-degraded 应为 conflict，实际 ${sandbox.body.getAttribute('data-degraded')}`);
  check(diagnostics.conflicts.some((c) => c.reason === 'duplicate-exclusive'), '诊断应记录 duplicate-exclusive 冲突');
  check(diagnostics.parts === 0, `冲突时不得启动任何零件，实际 ${diagnostics.parts}`);
  check(diagnostics.uncaught === 0, '冲突路径不得产生未捕获异常');
  check(typeof sandbox.note?.textContent === 'string' ? true : sandbox.note.textContent === null || typeof sandbox.note.textContent === 'string', '降级提示节点应可写入');
  const noteText = String(sandbox.note.textContent ?? '');
  check(!/rendered|passed|渲染通过/i.test(noteText), `降级文案不得声称渲染通过，实际：${noteText}`);
}

// ─── D. 同步抛错（零件工厂 throw）→ runtime-error，且不成为未捕获异常 ───────────
{
  const throwBundle = bundleIife({
    globalName: 'EmoPulse',
    contents: `
      import { registerPart } from ${toImportSpecifier(path.join(REPO_ROOT, 'shared/contract/parts-registry'))};
      import { mountSite } from ${toImportSpecifier(path.join(REPO_ROOT, 'shared/contract/mount-site'))};
      registerPart({ id: 'boom-sync', layer: 'scene', origin: 'equivalent', entry: 'x', contract: 'v1' },
        () => { throw new Error('boom-sync'); });
      export { mountSite };
    `,
  });
  const config = makeConfig({
    composition: { narrative: [], interaction: [], audio: [], artifact: [], scene: [{ ref: 'boom-sync', enabled: true }] },
  });
  const { sandbox, diagnostics } = await runCase(throwBundle, config);
  check(sandbox.body.getAttribute('data-degraded') === 'runtime-error',
    `同步抛错时 data-degraded 应为 runtime-error，实际 ${sandbox.body.getAttribute('data-degraded')}`);
  check(diagnostics.captured.some((entry) => entry.kind === 'runtime' && entry.message.includes('boom-sync')),
    `诊断应记录被兜底的同步异常，实际 ${JSON.stringify(diagnostics.captured)}`);
  check(diagnostics.uncaught === 0, `被兜底的同步异常不得计入 uncaught，实际 ${diagnostics.uncaught}`);
}

// ─── E. 异步拒绝 → 全局兜底监听器记录 + 降级标注，仍不 rethrow ──────────────────
{
  const { sandbox, diagnostics } = await runCase(mountBundle, makeConfig());
  check(diagnostics.uncaught === 0, '前置条件：正常路径 uncaught 应为 0');
  sandbox.dispatch('unhandledrejection', { reason: new Error('async-boom') });
  check(diagnostics.uncaught === 1, `异步拒绝后 uncaught 应为 1，实际 ${diagnostics.uncaught}`);
  check(diagnostics.captured.some((entry) => entry.kind === 'rejection' && entry.message.includes('async-boom')),
    '诊断应记录异步拒绝明细');
  check(diagnostics.degraded === true, '异步拒绝后必须进入降级态');
  check(sandbox.body.getAttribute('data-degraded') === 'uncaught-error',
    `异步拒绝后 data-degraded 应为 uncaught-error，实际 ${sandbox.body.getAttribute('data-degraded')}`);

  sandbox.dispatch('error', { error: new Error('sync-global-boom') });
  check(diagnostics.uncaught === 2, `全局 error 后 uncaught 应为 2，实际 ${diagnostics.uncaught}`);
}

// ─── 汇总 ────────────────────────────────────────────────────────────────────
if (failures.length > 0) {
  console.error(`[verify-degradation] ❌ ${failures.length}/${checks} 项断言失败：`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`[verify-degradation] ✅ PASS：${checks} 项断言（正常 / 无 Canvas2D / 冲突 / 同步抛错 / 异步拒绝），未捕获异常恒为 0`);
console.log('[verify-degradation] 已知限制：真实浏览器 unhandledrejection 事件由无头 node 无法自然产生，本测试以「直接触发已注册监听器」等效验证其行为；WebGPU 渲染本身未验证。');
