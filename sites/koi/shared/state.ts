// koi 三风格共享状态机：idle → watching（观赏即内容，无任务）。
import { createStateMachine, type StateMachine, type Transition } from '../../../shared/contract/index';

export type KoiState = 'idle' | 'watching';

export const KOI_TRANSITIONS: readonly Transition<KoiState>[] = [
  { from: 'idle', event: 'USER_INTERACT', to: 'watching' },
];

export function createKoiState(): StateMachine<KoiState> {
  return createStateMachine<KoiState>({
    initial: 'idle',
    states: ['idle', 'watching'],
    transitions: KOI_TRANSITIONS,
  });
}
