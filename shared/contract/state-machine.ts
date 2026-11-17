// 通用有限状态机：外层统一 FSM 不替代零件内部 FSM，glue 负责把两者对齐。
export type AppEvent =
  | 'APP_INIT' | 'APP_READY' | 'APP_START' | 'APP_PAUSE' | 'APP_DISPOSE'
  | 'USER_INTERACT' | 'USER_COMPLETE' | 'USER_SHARE'
  | 'ANALYTICS_TICK'
  | `STATE_${string}`;

export interface Transition<S extends string = string> {
  from: S;
  event: AppEvent;
  to: S;
  action?: (payload?: unknown) => void;
}

export interface StateMachine<S extends string = string> {
  readonly initial: S;
  readonly states: readonly S[];
  readonly transitions: readonly Transition<S>[];
  current(): S;
  send(event: AppEvent, payload?: unknown): S;
  onEnter(state: S, cb: () => void): void;
  onExit(state: S, cb: () => void): void;
  reset(): void;
}

export interface StateMachineOptions<S extends string> {
  initial: S;
  states: readonly S[];
  transitions: readonly Transition<S>[];
}

/**
 * 创建状态机。
 * - send 找不到匹配转移时保持当前状态（返回 current），不抛错，保证 UI 事件洪流不打断体验；
 * - onExit 先于 action，onEnter 后于 action，二者在每次成功转移时各触发一次；
 * - reset 回到 initial 但不触发回调（与页面首次装载语义一致）。
 */
export function createStateMachine<S extends string>(options: StateMachineOptions<S>): StateMachine<S> {
  const { initial, states, transitions } = options;
  if (!states.includes(initial)) throw new Error(`[state-machine] 初始状态 ${initial} 不在 states 中`);
  for (const t of transitions) {
    if (!states.includes(t.from) || !states.includes(t.to)) {
      throw new Error(`[state-machine] 转移 ${t.from} --${t.event}--> ${t.to} 含未登记状态`);
    }
  }

  let currentState: S = initial;
  const enterCbs = new Map<S, Array<() => void>>();
  const exitCbs = new Map<S, Array<() => void>>();

  const fire = (bucket: Map<S, Array<() => void>>, state: S): void => {
    for (const cb of bucket.get(state) ?? []) cb();
  };

  return {
    initial,
    states,
    transitions,
    current: () => currentState,
    send(event: AppEvent, payload?: unknown): S {
      const transition = transitions.find((t) => t.from === currentState && t.event === event);
      if (!transition) return currentState;
      fire(exitCbs, currentState);
      currentState = transition.to;
      transition.action?.(payload);
      fire(enterCbs, currentState);
      return currentState;
    },
    onEnter(state: S, cb: () => void): void {
      if (!enterCbs.has(state)) enterCbs.set(state, []);
      enterCbs.get(state)!.push(cb);
    },
    onExit(state: S, cb: () => void): void {
      if (!exitCbs.has(state)) exitCbs.set(state, []);
      exitCbs.get(state)!.push(cb);
    },
    reset(): void {
      currentState = initial;
    },
  };
}
