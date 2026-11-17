// 自研③ 短 URL：纯前端 ?from=<base64url(JSON)> 编解码，无后端依赖。
const MAX_KEYS = 20;
const MAX_VALUE_LENGTH = 200;

/** UTF-8 字符串 → base64url。 */
function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** base64url → UTF-8 字符串。 */
function fromBase64Url(token: string): string {
  const padded = token.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** 把扁平对象编码为 ?from= 的 token（不含问号与键名）。 */
export function encode(payload: Record<string, unknown>): string {
  const safe: Record<string, string | number | boolean> = {};
  let count = 0;
  for (const [key, value] of Object.entries(payload)) {
    if (count >= MAX_KEYS) break;
    if (typeof value === 'string') safe[key] = value.slice(0, MAX_VALUE_LENGTH);
    else if (typeof value === 'number' && Number.isFinite(value)) safe[key] = value;
    else if (typeof value === 'boolean') safe[key] = value;
    else continue;
    count += 1;
  }
  return toBase64Url(JSON.stringify(safe));
}

/** 解析 ?from=<token> 或直接传 token；失败返回空对象（绝不抛错到 UI）。 */
export function decode(query: string): Record<string, string | number | boolean> {
  try {
    const raw = query.startsWith('?') ? query.slice(1) : query;
    const params = new URLSearchParams(raw);
    const token = params.get('from') ?? (raw.includes('=') ? '' : raw);
    if (!token) return {};
    const parsed = JSON.parse(fromBase64Url(token));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const out: Record<string, string | number | boolean> = {};
    let count = 0;
    for (const [key, value] of Object.entries(parsed)) {
      if (count >= MAX_KEYS) break;
      if (typeof value === 'string') out[key] = value.slice(0, MAX_VALUE_LENGTH);
      else if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
      else if (typeof value === 'boolean') out[key] = value;
      else continue;
      count += 1;
    }
    return out;
  } catch {
    return {};
  }
}

/** 从 location.search 读取来源信息（浏览器侧便利方法）。 */
export function readFromLocation(search: string): Record<string, string | number | boolean> {
  return decode(search);
}

/** 生成带 ?from= 的站群链接（站内路径 + 编码 payload）。 */
export function withFrom(pathname: string, payload: Record<string, unknown>): string {
  return `${pathname}?from=${encode(payload)}`;
}
