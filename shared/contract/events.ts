// 统一事件名常量：跨站点口径一致，供 glue 与埋点共用。
export const APP_EVENTS = {
  APP_INIT: 'APP_INIT',
  APP_READY: 'APP_READY',
  APP_START: 'APP_START',
  APP_PAUSE: 'APP_PAUSE',
  APP_DISPOSE: 'APP_DISPOSE',
  USER_INTERACT: 'USER_INTERACT',
  USER_COMPLETE: 'USER_COMPLETE',
  USER_SHARE: 'USER_SHARE',
  ANALYTICS_TICK: 'ANALYTICS_TICK',
} as const;

/** 站点自定义事件统一前缀。 */
export const STATE_EVENT_PREFIX = 'STATE_';

/** 构造站点自定义事件名，如 stateEvent('SIT') → 'STATE_SIT'。 */
export function stateEvent(name: string): `STATE_${string}` {
  return `${STATE_EVENT_PREFIX}${name.toUpperCase()}`;
}

/** 判断事件名是否属于站点自定义事件。 */
export function isStateEvent(event: string): event is `STATE_${string}` {
  return event.startsWith(STATE_EVENT_PREFIX);
}

/** 把事件名收敛为埋点用的短标签（去掉 STATE_ 前缀并转小写）。 */
export function eventLabel(event: string): string {
  return isStateEvent(event) ? event.slice(STATE_EVENT_PREFIX.length).toLowerCase() : event.toLowerCase();
}
