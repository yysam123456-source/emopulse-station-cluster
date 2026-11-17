// INV-5 / NX-I-01：两个新事件（USER_COMPLETE / ARTIFACT_EXPORT）经 scrubPayload 后无 PII、口径一致。
// 手法：把 analytics.ts / nexus-events.ts / events.ts 打进同一模块实例，用 stub localStorage 观察实际落库内容。
// 用法：node tests/verify-analytics.mjs
import path from 'node:path';
import { loadTsSource, REPO_ROOT } from './lib/load-ts.mjs';

const mod = await loadTsSource(`
export { scrubPayload, bucketDuration, createAnalytics } from '${path.join(REPO_ROOT, 'shared/contract/analytics')}';
export { NEXUS_EVENTS, asAppEvent } from '${path.join(REPO_ROOT, 'shared/contract/nexus-events')}';
export { APP_EVENTS, eventLabel } from '${path.join(REPO_ROOT, 'shared/contract/events')}';
`);

const { scrubPayload, bucketDuration, createAnalytics, NEXUS_EVENTS, asAppEvent, APP_EVENTS, eventLabel } = mod;

let checks = 0;
const failures = [];
function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}
function eq(actual, expected, label) {
  check(JSON.stringify(actual) === JSON.stringify(expected), `${label} 期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
}

// ─── 1. 事件口径：两个新事件名唯一真相源 + 与既有 APP_EVENTS 对齐 ──────────────
eq(NEXUS_EVENTS.USER_COMPLETE, 'USER_COMPLETE', 'NEXUS_EVENTS.USER_COMPLETE');
eq(NEXUS_EVENTS.ARTIFACT_EXPORT, 'ARTIFACT_EXPORT', 'NEXUS_EVENTS.ARTIFACT_EXPORT');
check(APP_EVENTS.USER_COMPLETE === NEXUS_EVENTS.USER_COMPLETE,
  'USER_COMPLETE 必须与既有 APP_EVENTS 口径一致（同一事件不得两个名字）');
eq(asAppEvent(NEXUS_EVENTS.USER_COMPLETE), 'USER_COMPLETE', 'asAppEvent(USER_COMPLETE)');
eq(asAppEvent(NEXUS_EVENTS.ARTIFACT_EXPORT), 'ARTIFACT_EXPORT', 'asAppEvent(ARTIFACT_EXPORT)');
eq(eventLabel(NEXUS_EVENTS.USER_COMPLETE), 'user_complete', 'eventLabel(USER_COMPLETE)');
eq(eventLabel('STATE_SITTING'), 'sitting', 'eventLabel(STATE_SITTING)');

// ─── 2. scrubPayload：PII 键必丢、字符串截断 200、类型收敛 ────────────────────
const dirty = {
  site: 'abyss-descent',
  action: 'descend',
  seconds: 42,
  ok: true,
  email: 'someone@example.com',
  Phone: '13800000000',
  name: '张三',
  user_id: 'u-1',
  token: 'secret',
  nested: { a: 1 },
  fn: () => 1,
  long: 'x'.repeat(500),
};
const clean = scrubPayload(dirty);
eq(Object.keys(clean).sort(), ['action', 'long', 'ok', 'seconds', 'site'], 'scrubPayload 保留键集合');
for (const pii of ['email', 'Phone', 'name', 'user_id', 'token', 'nested', 'fn']) {
  check(!(pii in clean), `scrubPayload 必须丢弃键 ${pii}`);
}
check(clean.long.length === 200, `字符串必须截断到 200，实际 ${clean.long.length}`);
for (const [key, value] of Object.entries(clean)) {
  check(['string', 'number', 'boolean'].includes(typeof value), `payload.${key} 必须是扁平标量，实际 ${typeof value}`);
}

// ─── 3. bucketDuration 分桶边界 ──────────────────────────────────────────────
eq(bucketDuration(0), '0-30s', 'bucketDuration(0)');
eq(bucketDuration(29.9), '0-30s', 'bucketDuration(29.9)');
eq(bucketDuration(30), '30-120s', 'bucketDuration(30)');
eq(bucketDuration(119), '30-120s', 'bucketDuration(119)');
eq(bucketDuration(120), '120-300s', 'bucketDuration(120)');
eq(bucketDuration(299), '120-300s', 'bucketDuration(299)');
eq(bucketDuration(300), '300s+', 'bucketDuration(300)');

// ─── 4. 端到端：两个事件真实上报后落库内容无 PII ─────────────────────────────
const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => (memory.has(key) ? memory.get(key) : null),
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key),
};

const analytics = createAnalytics({ enabled: true, maxQueue: 10 });
analytics.track(asAppEvent(NEXUS_EVENTS.USER_COMPLETE), {
  site: 'abyss-descent',
  state: 'vent',
  email: 'someone@example.com',
  name: '张三',
  seconds: 95,
});
analytics.track(asAppEvent(NEXUS_EVENTS.ARTIFACT_EXPORT), {
  site: 'abyss-descent',
  kind: 'canvas',
  phone: '13800000000',
});
analytics.flush();

const raw = memory.get('emopulse.analytics.queue');
check(typeof raw === 'string' && raw.length > 0, '两个事件应已落本地队列（零网络）');
const queue = raw ? JSON.parse(raw) : [];
check(Array.isArray(queue) && queue.length === 2, `队列应有 2 条记录，实际 ${Array.isArray(queue) ? queue.length : '非数组'}`);

const events = queue.map((record) => record.event);
eq(events, ['USER_COMPLETE', 'ARTIFACT_EXPORT'], '队列事件名');

const PII_KEYS = ['email', 'phone', 'name', 'user_id', 'token', 'id_card', 'cookie', 'ip'];
for (const record of queue) {
  check(typeof record.v === 'number' && typeof record.ts === 'number', '记录必须含 v / ts');
  const payloadKeys = Object.keys(record.payload ?? {});
  for (const pii of PII_KEYS) {
    check(!payloadKeys.includes(pii), `落库 payload 不得含 PII 键 ${pii}（事件 ${record.event}）`);
  }
  for (const [key, value] of Object.entries(record.payload ?? {})) {
    check(['string', 'number', 'boolean'].includes(typeof value), `落库 payload.${key} 必须是扁平标量`);
  }
}
check(queue[0].payload.site === 'abyss-descent', '落库 payload 应保留 site（非 PII）');
check(queue[0].payload.seconds === 95, '落库 payload 应保留数值型 seconds');
check(queue[1].payload.kind === 'canvas', '落库 payload 应保留 kind');

// ─── 5. 关闭埋点时不产生任何记录 ─────────────────────────────────────────────
memory.clear();
const silent = createAnalytics({ enabled: false });
silent.track(asAppEvent(NEXUS_EVENTS.USER_COMPLETE), { site: 'x' });
silent.flush();
check(!memory.has('emopulse.analytics.queue') || memory.get('emopulse.analytics.queue') === '[]',
  'enabled:false 时不得写入任何记录');

if (failures.length > 0) {
  console.error(`[verify-analytics] ❌ ${failures.length}/${checks} 项断言失败：`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`[verify-analytics] ✅ PASS：${checks} 项断言（两事件口径一致 / scrubPayload 去 PII / 分桶边界 / 落库扁平无 PII / 关闭时零写入）`);
console.log('[verify-analytics] 说明：T01 范围内尚无 nexus 站，故「8 站口径一致」以「两个事件共用同一 scrubPayload 与同一常量源」实现并断言；站点侧接入在 T02~T05 落地。');
