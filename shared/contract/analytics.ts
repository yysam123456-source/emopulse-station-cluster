// 自研③ 埋点：匿名事件上报 + 静坐计时。零 PII、零外部资源（未配置端点时只写本地队列）。
import type { AppEvent } from './state-machine';

export interface AnalyticsOptions {
  enabled: boolean;
  /** 为空则不上报网络，仅写入本地队列（可插拔，零基础设施上线）。 */
  endpoint?: string;
  /** 本地队列最大条数，默认 100。 */
  maxQueue?: number;
}

export interface AnalyticsApi {
  track(event: AppEvent, payload?: Record<string, unknown>): void;
  startTimer(key: string): void;
  stopTimer(key: string): number;
  flush(): void;
}

/** 已知 PII 键名（大小写不敏感，命中即丢弃该键）。 */
const PII_KEYS = new Set([
  'email', 'phone', 'mobile', 'name', 'username', 'userid', 'user_id',
  'ip', 'address', 'idcard', 'id_card', 'passport', 'token', 'cookie',
  'birthday', 'birthdate', 'realname', 'real_name',
]);

const QUEUE_KEY = 'emopulse.analytics.queue';

/** 清洗为扁平匿名 payload：丢 PII 键、丢对象/函数、字符串截断。 */
export function scrubPayload(payload: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (PII_KEYS.has(key.toLowerCase())) continue;
    if (typeof value === 'string') out[key] = value.slice(0, 200);
    else if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    else if (typeof value === 'boolean') out[key] = value;
  }
  return out;
}

/** 静坐时长分桶（秒）：与站点侧埋点口径共用。 */
export function bucketDuration(seconds: number): string {
  if (seconds < 30) return '0-30s';
  if (seconds < 120) return '30-120s';
  if (seconds < 300) return '120-300s';
  return '300s+';
}

/** 读取本地队列。 */
function readQueue(): Array<Record<string, unknown>> {
  try {
    const raw = globalThis.localStorage?.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** 写入本地队列（超出上限丢弃最旧的）。 */
function writeQueue(queue: Array<Record<string, unknown>>, maxQueue: number): void {
  try {
    globalThis.localStorage?.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-maxQueue)));
  } catch {
    // 隐私模式 / 存储配额不足：静默降级，不影响体验。
  }
}

/**
 * 创建埋点实例。
 * - 未配置 endpoint：事件进本地队列，零网络请求；
 * - 配置 endpoint：优先 sendBeacon，失败回退 fetch keepalive，再失败落本地队列。
 */
export function createAnalytics(options: AnalyticsOptions): AnalyticsApi {
  const { enabled } = options;
  const endpoint = options.endpoint?.trim() ?? '';
  const maxQueue = Math.max(1, options.maxQueue ?? 100);
  const timers = new Map<string, number>();
  const localQueue: Array<Record<string, unknown>> = [];

  const persist = (record: Record<string, unknown>): void => {
    localQueue.push(record);
    if (localQueue.length > maxQueue) localQueue.splice(0, localQueue.length - maxQueue);
    const merged = [...readQueue(), ...localQueue];
    writeQueue(merged, maxQueue);
    localQueue.length = 0;
  };

  const deliver = (record: Record<string, unknown>): void => {
    if (!endpoint) {
      persist(record);
      return;
    }
    try {
      const body = JSON.stringify(record);
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        if (navigator.sendBeacon(endpoint, body)) return;
      }
      if (typeof fetch === 'function') {
        void fetch(endpoint, { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true })
          .catch(() => persist(record));
        return;
      }
    } catch {
      // 网络异常或 CSP 拦截：落本地队列，不打断用户。
    }
    persist(record);
  };

  return {
    track(event, payload = {}): void {
      if (!enabled) return;
      deliver({ v: 1, event, ts: Date.now(), payload: scrubPayload(payload) });
    },
    startTimer(key): void {
      if (!enabled) return;
      timers.set(key, Date.now());
    },
    stopTimer(key): number {
      const started = timers.get(key);
      timers.delete(key);
      if (started === undefined) return 0;
      return Math.round((Date.now() - started) / 100) / 10;
    },
    flush(): void {
      if (!enabled || localQueue.length === 0) return;
      const batch = localQueue.splice(0);
      writeQueue([...readQueue(), ...batch], maxQueue);
    },
  };
}
