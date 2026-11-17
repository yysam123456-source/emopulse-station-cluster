// /license 状态机：idle → verifying → stamping → approved（零件内部状态由 glue 对齐）。
import { createStateMachine, stateEvent, type StateMachine, type Transition } from '../../shared/contract/index';

export type LicenseState = 'idle' | 'verifying' | 'stamping' | 'approved';

export const VERIFY_EVENT = stateEvent('VERIFY');
export const APPROVE_EVENT = stateEvent('APPROVE');
export const RESET_EVENT = stateEvent('RESET');

export const LICENSE_TRANSITIONS: readonly Transition<LicenseState>[] = [
  { from: 'idle', event: 'USER_INTERACT', to: 'verifying' },
  { from: 'verifying', event: VERIFY_EVENT, to: 'stamping' },
  { from: 'stamping', event: APPROVE_EVENT, to: 'approved' },
  { from: 'approved', event: RESET_EVENT, to: 'idle' },
];

export function createLicenseState(): StateMachine<LicenseState> {
  return createStateMachine<LicenseState>({
    initial: 'idle',
    states: ['idle', 'verifying', 'stamping', 'approved'],
    transitions: LICENSE_TRANSITIONS,
  });
}
