// /praise 状态机：idle → peeking → printing → exported。
import { createStateMachine, stateEvent, type StateMachine, type Transition } from '../../shared/contract/index';

export type PraiseState = 'idle' | 'peeking' | 'printing' | 'exported';

export const PEEK_EVENT = stateEvent('PEEK');
export const PRINT_EVENT = stateEvent('PRINT');
export const EXPORT_EVENT = stateEvent('EXPORT');

export const PRAISE_TRANSITIONS: readonly Transition<PraiseState>[] = [
  { from: 'idle', event: 'USER_INTERACT', to: 'peeking' },
  { from: 'peeking', event: PEEK_EVENT, to: 'printing' },
  { from: 'printing', event: PRINT_EVENT, to: 'exported' },
  { from: 'exported', event: EXPORT_EVENT, to: 'idle' },
];

export function createPraiseState(): StateMachine<PraiseState> {
  return createStateMachine<PraiseState>({
    initial: 'idle',
    states: ['idle', 'peeking', 'printing', 'exported'],
    transitions: PRAISE_TRANSITIONS,
  });
}
