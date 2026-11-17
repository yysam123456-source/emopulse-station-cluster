// /still 外层统一状态：idle → sitting → leaving（零件内部状态机不改动，由 glue 对齐）。
import { createStateMachine, stateEvent, type StateMachine, type Transition } from '../../shared/contract/index';

export type StillState = 'idle' | 'sitting' | 'leaving';

export const STILL_STATES: readonly StillState[] = ['idle', 'sitting', 'leaving'];

/** 站点自定义事件：请求离开。 */
export const LEAVE_EVENT = stateEvent('LEAVE');

/** 外层状态转移表。离开后再次交互可重新坐下； ANALYTICS_TICK 不改变状态。 */
export const STILL_TRANSITIONS: readonly Transition<StillState>[] = [
  { from: 'idle', event: 'USER_INTERACT', to: 'sitting' },
  { from: 'sitting', event: LEAVE_EVENT, to: 'leaving' },
  { from: 'leaving', event: 'USER_INTERACT', to: 'sitting' },
];

/** 创建 /still 状态机实例。 */
export function createStillState(): StateMachine<StillState> {
  return createStateMachine<StillState>({
    initial: 'idle',
    states: STILL_STATES,
    transitions: STILL_TRANSITIONS,
  });
}
