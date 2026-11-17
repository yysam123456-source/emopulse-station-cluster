// 自研① 情绪文案库 · /still 首发站（B2：03 文案库缺失，按 PRD 基线自撰）。
// 英文主文案 + 中文副文案（架构 Q2 默认 zh-en，可配置）。
export const STILL_COPY = {
  title: 'Still',
  hookEn: 'A quiet corner. Nothing to do here.',
  hookZh: '一个安静的角落。这里什么都不必做。',
  noteEn: 'Stay as long as you like.',
  noteZh: '想待多久，就待多久。',
  leavingEn: 'Take a little quiet with you.',
  leavingZh: '带走一点安静就好。',
  controls: [
    { id: 'sit', labelEn: 'Sit', labelZh: '坐下' },
    { id: 'listen', labelEn: 'Listen', labelZh: '倾听' },
    { id: 'leave', labelEn: 'Leave', labelZh: '离开' },
  ],
  touchHintEn: 'Hold to stay · slide to look around',
  touchHintZh: '按住停留 · 滑动环顾',
} as const;

/** 取控件标签：zh-en 主标签为英文，中文作副标签。 */
export function controlLabel(id: 'sit' | 'listen' | 'leave', locale: 'zh' | 'en' | 'zh-en'): string {
  const item = STILL_COPY.controls.find((c) => c.id === id);
  if (!item) return '';
  return locale === 'zh' ? item.labelZh : item.labelEn;
}
