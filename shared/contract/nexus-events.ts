// L1 新增事件口径（NX-I-01）：主交互完成 / 凭证导出。
// 为什么不写进 events.ts / state-machine.ts：这两份文件在架构 §4.6 红线清单里是
// 【零改动】冻结项，新增导出可能改变既有 7 站 bridge bundle 字节（INV-3）。
// 因此两个新事件独立成模块，由 nexus 站点与 GenericApp 使用。
import type { AppEvent } from './state-machine';

/** NX-I-01 两个匿名事件的唯一真相源。 */
export const NEXUS_EVENTS = {
  /** 主交互完成（每站唯一主交互跑完一次） */
  USER_COMPLETE: 'USER_COMPLETE',
  /** 凭证导出（本地 Canvas 导出成功） */
  ARTIFACT_EXPORT: 'ARTIFACT_EXPORT',
} as const;

/** 两个新事件的联合类型。 */
export type NexusEventName = (typeof NEXUS_EVENTS)[keyof typeof NEXUS_EVENTS];

/**
 * 把 Nexus 事件名收敛为底座 AppEvent。
 * 唯一的一处类型断言集中在此（ARTIFACT_EXPORT 尚未进入冻结的 AppEvent 联合），
 * 避免各站点各自散落 `as`，也便于未来解冻 state-machine.ts 时一处收口。
 */
export function asAppEvent(event: NexusEventName): AppEvent {
  return event as AppEvent;
}
