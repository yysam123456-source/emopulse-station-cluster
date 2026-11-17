// 自研① 情绪文案库 + 自研夸夸句式引擎 · /praise 热敏打印机（本地模板，无网络调用）。
export const PRAISE_COPY = {
  title: 'Praise',
  hookEn: 'A small receipt of good things, printed just for you.',
  hookZh: '一张只为你打印的好事小票。',
  printEn: 'Print one',
  printZh: '打印一张',
  peekEn: 'Move closer to open the paper.',
  peekZh: '靠近一点，把纸层拨开。',
  exportedEn: 'Keep it. You earned it.',
  exportedZh: '收好它。你值得。',
  header: 'E M O P U L S E   R E C E I P T',
  footer: 'NO PURCHASE. JUST PRAISE.',
} as const;

const OPENERS = [
  'You showed up today, and that counts.',
  'The way you keep going is quietly remarkable.',
  'You made someone else feel lighter.',
  'Your patience is a kind of superpower.',
  'You notice things other people miss.',
  'You are allowed to be proud of yourself.',
] as const;

const MIDDLES = [
  'Even on the hard days, you found a way.',
  'Your effort has been seen, even when nobody said it.',
  'You turned a small moment into something warm.',
  'You did not give up when it would have been easier.',
  'Your presence makes ordinary places better.',
  'You gave yourself permission to rest. That matters.',
] as const;

const CLOSERS = [
  'Please keep being exactly you.',
  'This is your reminder: enough is enough.',
  'Someone is glad you exist. That someone is here.',
  'Take this with you, no questions asked.',
  'You are more than your output.',
  'Come back whenever you need to hear it again.',
] as const;

/** 本地伪随机种子：同一会话内句式稳定可复现。 */
function pick<T>(items: readonly T[], seed: number): T {
  return items[seed % items.length]!;
}

export interface PraiseTicket {
  opener: string;
  middle: string;
  closer: string;
  serial: string;
  stamp: string;
}

/** 生成一张夸夸小票（本地模板引擎，确定性种子）。 */
export function makeTicket(seed = Date.now()): PraiseTicket {
  const n = Math.abs(Math.floor(seed));
  return {
    opener: pick(OPENERS, n),
    middle: pick(MIDDLES, Math.floor(n / 7) + 1),
    closer: pick(CLOSERS, Math.floor(n / 13) + 2),
    serial: `P-${String(n % 100000).padStart(5, '0')}`,
    stamp: 'A+',
  };
}
