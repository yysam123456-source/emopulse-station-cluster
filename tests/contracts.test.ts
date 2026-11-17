// QA 独立单元验证：state-machine / short-url / analytics 纯逻辑。
// 运行：npx tsx tests/contracts.test.ts
// 纪律：不修改任何源码；浏览器 API 用最小 stub 隔离。
import assert from 'node:assert/strict';
import { createStateMachine } from '../shared/contract/state-machine';
import { encode, decode, withFrom, readFromLocation } from '../shared/contract/short-url';
import { scrubPayload, bucketDuration, createAnalytics } from '../shared/contract/analytics';

let pass = 0;
const failures: string[] = [];
function test(name: string, fn: () => void): void {
  try {
    fn();
    pass += 1;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    failures.push(`${name}: ${msg}`);
    console.log(`  FAIL  ${name} -> ${msg}`);
  }
}

// ---------------------------------------------------------------- state-machine
console.log('\n[state-machine]');
type S = 'idle' | 'sitting' | 'leaving';
const def = () => ({
  initial: 'idle' as S,
  states: ['idle', 'sitting', 'leaving'] as S[],
  transitions: [
    { from: 'idle' as S, event: 'USER_INTERACT' as const, to: 'sitting' as S },
    { from: 'sitting' as S, event: 'STATE_LEAVE' as const, to: 'leaving' as S },
    { from: 'leaving' as S, event: 'USER_INTERACT' as const, to: 'sitting' as S },
  ],
});

test('初始状态与元数据正确', () => {
  const m = createStateMachine<S>(def());
  assert.equal(m.current(), 'idle');
  assert.equal(m.initial, 'idle');
  assert.equal(m.states.length, 3);
});

test('正常转移 idle->sitting->leaving->sitting', () => {
  const m = createStateMachine<S>(def());
  assert.equal(m.send('USER_INTERACT'), 'sitting');
  assert.equal(m.send('STATE_LEAVE'), 'leaving');
  assert.equal(m.send('USER_INTERACT'), 'sitting');
});

test('非法事件不改变状态且不抛错', () => {
  const m = createStateMachine<S>(def());
  assert.equal(m.send('STATE_LEAVE'), 'idle'); // idle 无此转移
  assert.equal(m.current(), 'idle');
  assert.equal(m.send('APP_DISPOSE'), 'idle');
  assert.equal(m.current(), 'idle');
});

test('onExit 先于 action，action 先于 onEnter，且各触发一次', () => {
  const order: string[] = [];
  const transitions = [
    { from: 'idle' as S, event: 'USER_INTERACT' as const, to: 'sitting' as S, action: () => order.push('action') },
  ];
  const m = createStateMachine<S>({ ...def(), transitions });
  m.onExit('idle', () => order.push('exit'));
  m.onEnter('sitting', () => order.push('enter'));
  m.send('USER_INTERACT');
  assert.deepEqual(order, ['exit', 'action', 'enter']);
  // 非法事件不触发回调
  m.send('APP_DISPOSE');
  assert.deepEqual(order, ['exit', 'action', 'enter']);
});

test('reset 回到 initial 且不触发回调', () => {
  const order: string[] = [];
  const m = createStateMachine<S>(def());
  m.onEnter('sitting', () => order.push('enter'));
  m.onExit('idle', () => order.push('exit'));
  m.send('USER_INTERACT');
  assert.equal(m.current(), 'sitting');
  order.length = 0;
  m.reset();
  assert.equal(m.current(), 'idle');
  assert.deepEqual(order, []);
});

test('构造期校验：initial 不在 states / 转移含未登记状态均抛错', () => {
  assert.throws(() => createStateMachine<S>({ ...def(), initial: 'ghost' as S }));
  assert.throws(() => createStateMachine<S>({
    ...def(),
    transitions: [{ from: 'idle', event: 'USER_INTERACT', to: 'ghost' as S }],
  }));
});

// ---------------------------------------------------------------- short-url
console.log('\n[short-url]');

test('encode->decode 往返一致（简单对象）', () => {
  const payload = { site: 'still', t: 123, ok: true };
  assert.deepEqual(decode(encode(payload)), payload);
});

test('encode->decode 往返一致（中文 / emoji / 特殊字符）', () => {
  const payload = { site: '赞美站', msg: '今天也要好好生活 🙏✨ <&>"\'', path: '/koi-pond?a=1&b=2' };
  assert.deepEqual(decode(encode(payload)), payload);
});

test('decode 支持 ?from= 前缀与裸 token 两种形态', () => {
  const token = encode({ site: 'hug' });
  assert.deepEqual(decode(`?from=${token}`), { site: 'hug' });
  assert.deepEqual(decode(token), { site: 'hug' });
});

test('decode 畸形输入容错，绝不抛错', () => {
  const bad = ['', '???', '?from=!!!not-base64!!!', '?from=eyJhIjoxfQ==garbage', '?from=%E0%A4%A', 'null', '?x=1'];
  for (const input of bad) {
    const out = decode(input);
    assert.equal(typeof out, 'object', `输入 ${input} 未返回对象`);
  }
  assert.deepEqual(decode('?from=!!!'), {});
});

test('?from= 缺失时降级：其他查询参数不误当 token', () => {
  assert.deepEqual(decode('?other=1&foo=2'), {});
  assert.deepEqual(readFromLocation('?utm=abc'), {});
});

test('encode 过滤非标量并截断键数/值长', () => {
  const many: Record<string, unknown> = {};
  for (let i = 0; i < 25; i += 1) many[`k${i}`] = `v${i}`;
  const out = decode(encode(many));
  assert.equal(Object.keys(out).length, 20, '应最多保留 20 个键');
  const long = decode(encode({ s: 'x'.repeat(500) }));
  assert.equal((long.s as string).length, 200, '字符串应截断到 200');
  const filtered = decode(encode({ obj: { a: 1 }, fn: () => 1, nan: NaN, ok: 1 }));
  assert.deepEqual(filtered, { ok: 1 });
});

test('withFrom 生成带 ?from= 的链接（decode 契约只吃 query 部分）', () => {
  const url = withFrom('/still', { site: 'praise' });
  assert.ok(url.startsWith('/still?from='));
  // decode 契约：接受 ?from=<token> 或裸 token，不接受带 pathname 的完整链接。
  // 浏览器侧应传 location.search；这里从完整链接中截出 query 再解码。
  const search = url.slice(url.indexOf('?'));
  assert.deepEqual(decode(search), { site: 'praise' });
  assert.deepEqual(readFromLocation(search), { site: 'praise' });
});

// ---------------------------------------------------------------- analytics
console.log('\n[analytics]');

test('scrubPayload 丢弃 PII 键（大小写不敏感）与非标量，截断长字符串', () => {
  const out = scrubPayload({
    email: 'a@b.com', Phone: '123', user_id: 'u1', Token: 't',
    action: 'sit', n: 3, ok: true, obj: { x: 1 }, fn: () => 1,
    long: 'y'.repeat(300), nan: NaN,
  });
  assert.deepEqual(out, { action: 'sit', n: 3, ok: true, long: 'y'.repeat(200) });
});

test('bucketDuration 分桶边界正确', () => {
  assert.equal(bucketDuration(0), '0-30s');
  assert.equal(bucketDuration(29.9), '0-30s');
  assert.equal(bucketDuration(30), '30-120s');
  assert.equal(bucketDuration(119), '30-120s');
  assert.equal(bucketDuration(120), '120-300s');
  assert.equal(bucketDuration(299), '120-300s');
  assert.equal(bucketDuration(300), '300s+');
});

/** 最小 localStorage stub。 */
function installLs(store: Map<string, string>): void {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    },
  });
}

test('队列 push 与上限截断 slice(-maxQueue)', () => {
  const store = new Map<string, string>();
  installLs(store);
  const a = createAnalytics({ enabled: true, maxQueue: 3 });
  for (let i = 1; i <= 5; i += 1) a.track('USER_INTERACT', { i });
  const queue = JSON.parse(store.get('emopulse.analytics.queue') ?? '[]');
  assert.equal(queue.length, 3);
  assert.deepEqual(queue.map((r: { payload: { i: number } }) => r.payload.i), [3, 4, 5]);
});

test('localStorage 完全不可用（undefined）时不崩溃', () => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: undefined });
  const a = createAnalytics({ enabled: true });
  assert.doesNotThrow(() => {
    a.track('USER_INTERACT', { action: 'sit' });
    a.startTimer('sit');
    a.stopTimer('sit');
    a.flush();
  });
});

test('localStorage 抛异常（隐私模式）时静默降级', () => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
    },
  });
  const a = createAnalytics({ enabled: true });
  assert.doesNotThrow(() => {
    a.track('USER_COMPLETE', { x: 1 });
    a.flush();
  });
});

test('enabled=false 不写队列；start/stopTimer 计时与未启动返回 0', () => {
  const store = new Map<string, string>();
  installLs(store);
  const off = createAnalytics({ enabled: false });
  off.track('USER_SHARE');
  assert.equal(store.has('emopulse.analytics.queue'), false);
  const on = createAnalytics({ enabled: true });
  assert.equal(on.stopTimer('never'), 0);
  on.startTimer('k');
  const t = on.stopTimer('k');
  assert.ok(t >= 0 && t < 5);
});

console.log(`\n[结果] PASS=${pass} FAIL=${failures.length}`);
if (failures.length) {
  console.log('失败明细：');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
