// NX-A-02 / NX-A-06 / INV-7：五层 schema、claim 冲突检测、层序、逆序 dispose、liveListeners 归零。
// 手法：用 esbuild 把 composer / composition / parts-registry 打进同一个模块实例后直接单测
//（不能分别 import，否则 parts-registry 的私有 store 会被复制成两份）。
// 用法：node tests/verify-composition.mjs
import path from 'node:path';
import { loadTsSource, REPO_ROOT } from './lib/load-ts.mjs';

const mod = await loadTsSource(`
export { createComposer } from '${path.join(REPO_ROOT, 'shared/contract/composer')}';
export { registerPart, clearPartRegistry } from '${path.join(REPO_ROOT, 'shared/contract/parts-registry')}';
export { LAYER_ORDER, UPDATE_ORDER, DISPOSE_ORDER, detectConflicts, normalizeComposition } from '${path.join(REPO_ROOT, 'shared/contract/composition')}';
export { probeCapability, staticCapability } from '${path.join(REPO_ROOT, 'shared/contract/capability')}';
`);

const {
  createComposer, registerPart, clearPartRegistry,
  LAYER_ORDER, UPDATE_ORDER, DISPOSE_ORDER, detectConflicts, normalizeComposition,
  staticCapability,
} = mod;

let checks = 0;
const failures = [];
function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}
function eq(actual, expected, label) {
  check(JSON.stringify(actual) === JSON.stringify(expected), `${label} 期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
}

/** 假事件目标：用于断言 LayerBus.on 登记后在 dispose 时被注销。 */
function createTarget() {
  const listeners = new Set();
  return {
    listeners,
    addEventListener(_type, fn) { listeners.add(fn); },
    removeEventListener(_type, fn) { listeners.delete(fn); },
  };
}

// ─── 0. 层序常量必须与 §6.3 写死的一致 ────────────────────────────────────────
eq(LAYER_ORDER, ['narrative', 'scene', 'interaction', 'audio', 'artifact'], 'LAYER_ORDER');
eq(UPDATE_ORDER, ['scene', 'interaction', 'audio', 'artifact'], 'UPDATE_ORDER');
eq(DISPOSE_ORDER, ['artifact', 'audio', 'interaction', 'scene', 'narrative'], 'DISPOSE_ORDER');

// ─── 1. 正常装配：五层 + chain 管线 + 逆序 dispose ────────────────────────────
const capability = staticCapability('no-webgpu-adapter');
clearPartRegistry();

const pipeLog = [];
let capturedBus = null;
const target = createTarget();

const factory = (id, extra = {}) => (opts) => {
  capturedBus = opts.bus;
  return {
    update() {
      // 每帧经总线交换后处理帧（chain 模式）
      if (id === 'stage') opts.bus.exchange('postprocess', 0);
    },
    dispose() { extra.onDispose?.(); },
    ...(extra.pipe ? { pipe: (input) => { pipeLog.push(id); return opts.bus.exchange ? input + 1 : input; } } : {}),
  };
};

registerPart({ id: 'stage', layer: 'scene', origin: 'equivalent', entry: 'x', contract: 'v1', claims: [{ resource: 'canvas:stage', mode: 'exclusive' }] },
  (opts) => {
    capturedBus = opts.bus;
    opts.bus.on(target, 'click', () => {});
    opts.bus.interval(() => {}, 1000);
    opts.store.hits = 0;
    return {
      update() { opts.bus.exchange('postprocess', 0); },
      dispose() { opts.store.hits = -1; },
    };
  });
registerPart({ id: 'chain-b', layer: 'scene', origin: 'equivalent', entry: 'x', contract: 'v1', claims: [{ resource: 'postprocess', mode: 'chain' }] },
  () => ({ dispose() {}, pipe: (v) => { pipeLog.push('chain-b'); return v + 1; } }));
registerPart({ id: 'chain-a', layer: 'scene', origin: 'equivalent', entry: 'x', contract: 'v1', claims: [{ resource: 'postprocess', mode: 'chain' }] },
  () => ({ dispose() {}, pipe: (v) => { pipeLog.push('chain-a'); return v + 1; } }));
registerPart({ id: 'fsm', layer: 'interaction', origin: 'equivalent', entry: 'x', contract: 'v1', claims: [{ resource: 'fsm:main', mode: 'exclusive' }] },
  factory('fsm'));
registerPart({ id: 'audio-master', layer: 'audio', origin: 'equivalent', entry: 'x', contract: 'v1', claims: [{ resource: 'audio:master', mode: 'exclusive' }] },
  factory('audio-master'));
registerPart({ id: 'stamp', layer: 'artifact', origin: 'equivalent', entry: 'x', contract: 'v1' }, factory('stamp'));
registerPart({ id: 'copy-text', layer: 'narrative', origin: 'equivalent', entry: 'x', contract: 'v1' }, factory('copy-text'));

const composition = {
  narrative: [{ ref: 'copy-text', enabled: true }],
  scene: [
    { ref: 'chain-a', enabled: true, order: 2, priority: 20 },
    { ref: 'stage', enabled: true, order: 0 },
    { ref: 'chain-b', enabled: true, order: 1, priority: 10 },
  ],
  interaction: [{ ref: 'fsm', enabled: true }],
  audio: [{ ref: 'audio-master', enabled: true }],
  artifact: [{ ref: 'stamp', enabled: true }],
};

const composer = createComposer(composition, capability);
const conflicts = composer.validate();
eq(conflicts, [], 'validate() 无冲突时应返回空数组');
check(composer.diagnostics.degraded === false, '无冲突时 degraded 必须为 false');

composer.init();
const initOrder = composer.diagnostics.initOrder;
eq(initOrder, [
  'narrative:copy-text',
  'scene:stage', 'scene:chain-b', 'scene:chain-a',
  'interaction:fsm',
  'audio:audio-master',
  'artifact:stamp',
], 'initOrder（层序固定 + 层内 order 升序）');
check(composer.diagnostics.liveListeners === 0, 'init 后 update 前 liveListeners 未采集，应为 0');

composer.update(0.016);
// chain-b / chain-a 是纯 pipe 零件（无 update），按 PartInstance 契约不进入 updateOrder。
eq(composer.diagnostics.updateOrder, [
  'scene:stage',
  'interaction:fsm',
  'audio:audio-master',
  'artifact:stamp',
], 'updateOrder（narrative 无 update；无 update 的纯 pipe 零件不进入 updateOrder）');
check(composer.diagnostics.liveListeners === 2, `liveListeners 应为 2（1 监听 + 1 定时器），实际 ${composer.diagnostics.liveListeners}`);

// chain 管线：priority 升序（chain-b 10 → chain-a 20）
pipeLog.length = 0;
composer.update(0.032);
eq(pipeLog, ['chain-b', 'chain-a'], 'chain 管线执行顺序（priority 升序）');

composer.dispose();
eq(composer.diagnostics.disposeOrder, [...initOrder].reverse(), 'disposeOrder 必须严格等于 initOrder 的逆序');
check(composer.diagnostics.liveListeners === 0, `dispose 后 liveListeners 必须归零，实际 ${composer.diagnostics.liveListeners}`);
check(target.listeners.size === 0, `dispose 后事件目标上的监听必须被注销，实际剩余 ${target.listeners.size}`);
check(capturedBus !== null, '零件应能通过 PartOptions 拿到 LayerBus');
check(capturedBus.capability.renderer === 'static', 'LayerBus.capability 必须透传能力快照');
check(capturedBus.masterGain === null, '无 AudioContext 环境下 masterGain 必须为 null（零件要容忍）');

// ─── 2. 冲突检测：四类 reason 各自命中，且冲突时不启动任何零件 ─────────────────
clearPartRegistry();
registerPart({ id: 'post-exclusive-1', layer: 'scene', origin: 'equivalent', entry: 'x', contract: 'v1', claims: [{ resource: 'postprocess', mode: 'exclusive' }] },
  () => ({ dispose() {} }));
registerPart({ id: 'post-exclusive-2', layer: 'scene', origin: 'equivalent', entry: 'x', contract: 'v1', claims: [{ resource: 'postprocess', mode: 'exclusive' }] },
  () => ({ dispose() {} }));
registerPart({ id: 'bad-claim', layer: 'scene', origin: 'equivalent', entry: 'x', contract: 'v1', claims: [{ resource: 'x', mode: 'bogus' }] },
  () => ({ dispose() {} }));

const conflictCases = [
  {
    label: 'duplicate-exclusive',
    config: {
      narrative: [], interaction: [], audio: [], artifact: [],
      scene: [{ ref: 'post-exclusive-1', enabled: true }, { ref: 'post-exclusive-2', enabled: true }],
    },
  },
  { label: 'unregistered-ref', config: { narrative: [], interaction: [], audio: [], artifact: [], scene: [{ ref: 'ghost-part', enabled: true }] } },
  { label: 'duplicate-ref', config: { narrative: [], interaction: [], audio: [], artifact: [], scene: [{ ref: 'post-exclusive-1', enabled: true }, { ref: 'post-exclusive-1', enabled: true, order: 1 }] } },
  { label: 'invalid-claim', config: { narrative: [], interaction: [], audio: [], artifact: [], scene: [{ ref: 'bad-claim', enabled: true }] } },
];

for (const testCase of conflictCases) {
  const c = createComposer(normalizeComposition(testCase.config), capability);
  const found = c.validate();
  check(found.some((conflict) => conflict.reason === testCase.label),
    `期望命中冲突 reason=${testCase.label}，实际 ${JSON.stringify(found.map((x) => x.reason))}`);
  c.init();
  eq(c.diagnostics.initOrder, [], `冲突（${testCase.label}）时不得启动任何零件`);
  check(c.diagnostics.degraded === true, `冲突（${testCase.label}）时 degraded 必须为 true`);
  c.dispose();
  check(c.diagnostics.liveListeners === 0, `冲突（${testCase.label}）后 liveListeners 必须为 0`);
}

// ─── 3. 纯函数 detectConflicts 与空配置 ──────────────────────────────────────
eq(detectConflicts(normalizeComposition(null), () => null), [], '空配置不应有冲突');
const emptyComposer = createComposer(normalizeComposition(undefined), capability);
eq(emptyComposer.validate(), [], '空组合 validate 应为空');
emptyComposer.init();
emptyComposer.update(0.016);
eq(emptyComposer.diagnostics.updateOrder, [], '空组合 updateOrder 应为空');
emptyComposer.dispose();
check(emptyComposer.diagnostics.liveListeners === 0, '空组合 dispose 后 liveListeners 为 0');

// ─── 汇总 ────────────────────────────────────────────────────────────────────
if (failures.length > 0) {
  console.error(`[verify-composition] ❌ ${failures.length}/${checks} 项断言失败：`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`[verify-composition] ✅ PASS：${checks} 项断言（层序 / chain 管线 / 逆序 dispose / liveListeners→0 / 四类冲突）`);
