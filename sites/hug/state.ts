// /hug 状态机：ready → drifting → away → hug-back（回赠闭环由 bridge 注入 USER_SHARE）。
import { createStateMachine, stateEvent, type StateMachine, type Transition } from '../../shared/contract/index';

export type HugState = 'ready' | 'drifting' | 'away' | 'hug-back';

export const RELEASE_EVENT = stateEvent('RELEASE');
export const ARRIVE_EVENT = stateEvent('ARRIVE');
export const BACK_EVENT = stateEvent('BACK');
export const RESET_EVENT = stateEvent('RESET');

export const HUG_TRANSITIONS: readonly Transition<HugState>[] = [
  { from: 'ready', event: 'USER_INTERACT', to: 'drifting' },
  { from: 'drifting', event: RELEASE_EVENT, to: 'away' },
  { from: 'away', event: ARRIVE_EVENT, to: 'hug-back' },
  { from: 'hug-back', event: BACK_EVENT, to: 'ready' },
  { from: 'ready', event: RESET_EVENT, to: 'ready' },
];

export function createHugState(): StateMachine<HugState> {
  return createStateMachine<HugState>({
    initial: 'ready',
    states: ['ready', 'drifting', 'away', 'hug-back'],
    transitions: HUG_TRANSITIONS,
  });
}
