// 自研① 情绪文案库 · /hug 拥抱短句（英文主 + 中文副）。
export const HUG_COPY = {
  title: 'Hug',
  hookEn: 'Send a hug. Someone will hug you back.',
  hookZh: '送出一份拥抱。有人会把它还给你。',
  releaseEn: 'Let it go',
  releaseZh: '放飞',
  listenEn: 'Listen',
  backEn: 'Hug them back',
  backZh: '回赠一个拥抱',
  readyEn: 'A little warmth is gathering.',
  readyZh: '一点暖意正在聚拢。',
  driftingEn: 'It is on its way.',
  driftingZh: '它正在路上。',
  awayEn: 'Delivered. Keep some for yourself.',
  awayZh: '已送达。也给自己留一点。',
} as const;

const HUG_LINES = [
  'I hope today treats you gently.',
  'You deserve a really good hug.',
  'This one is for getting through it.',
  'Take a breath. I am with you.',
  'You do not have to carry it all.',
  'Warmth, no questions asked.',
] as const;

/** 取一句拥抱短句（无 PII，纯本地模板）。 */
export function hugLine(seed = Date.now()): string {
  return HUG_LINES[Math.abs(Math.floor(seed)) % HUG_LINES.length]!;
}

/** ?from= 回赠提示：来源站点标识经白名单收敛，绝不回显任意输入。 */
export function backHint(from: string): string {
  const allowed = ['hug', 'still', 'license', 'praise'];
  const source = allowed.includes(from) ? from : 'someone';
  return `${HUG_COPY.backEn} · ${source}`;
}
