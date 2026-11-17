// QA 独立单元验证：Runtime 生命周期 / SiteApp 七方法协议 / events 事件标签。
// 运行：npx tsx tests/runtime.test.ts
import assert from 'node:assert/strict';
import { Runtime, createContext, registerConfig, registerApp, loadConfig, boot } from '../shared/contract/runtime';
import { createStateMachine, type AppEvent, type StateMachine, type Transition } from '../shared/contract/state-machine';
import { stateEvent, isStateEvent, eventLabel, APP_EVENTS } from '../shared/contract/events';
import type { AnalyticsApi, SiteApp, SiteConfig, RuntimeContext, SiteId } from '../shared/contract/types';

let pass = 0;
const failures: string[] = [];
function test(name: string, fn: () => void): void {
  try { fn(); pass += 1; console.log(`  PASS  ${name}`); }
  catch (e) { const m = e instanceof Error ? e.message : String(e); failures.push(`${name}: ${m}`); console.log(`  FAIL  ${name} -> ${m}`); }
}

console.log('\n[events]');
test('stateEvent / isStateEvent / eventLabel', () => {
  assert.equal(stateEvent('sit'), 'STATE_SIT');
  assert.equal(stateEvent('USER_x'), 'STATE_USER_X');
  assert.ok(isStateEvent('STATE_SIT'));
  assert.ok(!isStateEvent('USER_SIT'));
  assert.equal(eventLabel('STATE_SIT'), 'sit');
  assert.equal(eventLabel('USER_COMPLETE'), 'user_complete');
  assert.equal(APP_EVENTS.APP_INIT, 'APP_INIT');
});

/** 记录调用的假 SiteApp（实现七方法）。 */
class SpyApp implements SiteApp {
  readonly id: SiteId = 'still';
  calls: string[] = [];
  init(_c: SiteConfig, _ctx: RuntimeContext): void { this.calls.push('init'); }
  mount(_c: HTMLElement): void { this.calls.push('mount'); }
  start(): void { this.calls.push('start'); }
  pause(): void { this.calls.push('pause'); }
  getScene(): NonNullable<RuntimeContext['scene']> { this.calls.push('getScene'); return {} as never; }
  onEvent(e: AppEvent): void { this.calls.push(`onEvent:${e}`); }
  dispose(): void { this.calls.push('dispose'); }
}

/** 带事件轨迹的真实状态机。 */
type St = 'idle' | 'ready' | 'active' | 'disposed';
const sent: string[] = [];
function makeState(): StateMachine<St> {
  const transitions: Transition<St>[] = [
    { from: 'idle', event: 'APP_INIT', to: 'ready' },
    { from: 'ready', event: 'APP_READY', to: 'ready' },
    { from: 'ready', event: 'APP_START', to: 'active' },
    { from: 'active', event: 'APP_PAUSE', to: 'ready' },
    { from: 'ready', event: 'APP_DISPOSE', to: 'disposed' },
  ];
  const m = createStateMachine<St>({ initial: 'idle', states: ['idle', 'ready', 'active', 'disposed'], transitions });
  const original = m.send.bind(m);
  return { ...m, send: (e: AppEvent, p?: unknown) => { sent.push(e); return original(e, p); } } as StateMachine<St>;
}

function makeAnalytics(): AnalyticsApi & { flushed: number } {
  return {
    flushed: 0, track() {}, startTimer() {}, stopTimer() { return 0; }, flush() { this.flushed += 1; },
  };
}

const fakeConfig = { id: 'still', route: '/still' } as SiteConfig;
const container = {} as HTMLElement;

console.log('\n[runtime 生命周期]');
test('createContext 注入 store 且为空对象', () => {
  const ctx = createContext(fakeConfig, {} as never, makeState(), makeAnalytics());
  assert.ok(ctx.store);
  assert.equal(Object.keys(ctx.store).length, 0);
});

test('boot: APP_INIT → init → mount → APP_READY 顺序正确', () => {
  sent.length = 0;
  const app = new SpyApp();
  const st = makeState();
  const a = makeAnalytics();
  const ctx = createContext(fakeConfig, {} as never, st, a);
  const rt = new Runtime(fakeConfig, app, ctx, container);
  rt.boot();
  assert.deepEqual(app.calls, ['init', 'mount']);
  assert.deepEqual(sent, ['APP_INIT', 'APP_READY']);
});

test('start/pause 幂等，且驱动 app 与状态事件', () => {
  sent.length = 0;
  const app = new SpyApp();
  const st = makeState();
  const ctx = createContext(fakeConfig, {} as never, st, makeAnalytics());
  const rt = new Runtime(fakeConfig, app, ctx, container);
  rt.boot(); sent.length = 0;
  rt.start(); rt.start();
  assert.equal(app.calls.filter((c) => c === 'start').length, 1);
  assert.deepEqual(sent, ['APP_START']);
  rt.pause(); rt.pause();
  assert.equal(app.calls.filter((c) => c === 'pause').length, 1);
  assert.deepEqual(sent, ['APP_START', 'APP_PAUSE']);
});

test('dispatch 同时驱动状态机与 app.onEvent', () => {
  sent.length = 0;
  const app = new SpyApp();
  const st = makeState();
  const ctx = createContext(fakeConfig, {} as never, st, makeAnalytics());
  const rt = new Runtime(fakeConfig, app, ctx, container);
  rt.boot(); sent.length = 0;
  rt.dispatch('USER_INTERACT', { x: 1 });
  assert.ok(app.calls.includes('onEvent:USER_INTERACT'));
  assert.deepEqual(sent, ['USER_INTERACT']);
});

test('teardown: pause → dispose → APP_DISPOSE → flush，且幂等', () => {
  sent.length = 0;
  const app = new SpyApp();
  const st = makeState();
  const a = makeAnalytics();
  const ctx = createContext(fakeConfig, {} as never, st, a);
  const rt = new Runtime(fakeConfig, app, ctx, container);
  rt.boot(); rt.start(); sent.length = 0;
  rt.teardown(); rt.teardown();
  assert.equal(app.calls.filter((c) => c === 'dispose').length, 1);
  assert.equal(a.flushed, 1);
  assert.ok(sent.includes('APP_PAUSE'));
  assert.ok(sent.includes('APP_DISPOSE'));
  assert.throws(() => rt.boot(), /已释放/);
});

console.log('\n[插件注册表]');
test('registerConfig/registerApp/loadConfig 按 ID 注册与读取', () => {
  const cfg = { ...fakeConfig, id: 'praise' as SiteId } as SiteConfig;
  registerConfig(cfg);
  assert.equal(loadConfig('praise'), cfg);
  assert.throws(() => loadConfig('hug'), /未注册/);
  registerApp('praise', () => new SpyApp());
  // boot 完整链路（用最小 env）
  const env = {
    scene: {} as never, camera: {} as never, renderer: {} as never,
    quality: { level: 'high' as const, auto: true, setLevel() {} },
    audio: { enabled: false, volume: 0, setEnabled() {}, setVolume() {} },
    container,
  };
  const rt = boot('praise', env);
  assert.equal(rt.config.id, 'praise');
  rt.teardown();
});

console.log(`\n[结果] PASS=${pass} FAIL=${failures.length}`);
if (failures.length) { failures.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
