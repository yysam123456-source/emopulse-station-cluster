// 自研① 情绪文案库 · /license 发证机（英文主 + 中文副，locale 可配置）。
export const LICENSE_COPY = {
  title: 'License',
  hookEn: 'A permit to simply be. No strings attached.',
  hookZh: '一张允许你只做自己的许可证。没有其他条件。',
  stampEn: 'Stamp it',
  stampZh: '盖章',
  stages: ['verifying', 'stamping', 'approved'] as const,
  stageZh: ['审查中', '盖章中', '已批准'] as const,
  declarationEn: 'You are hereby permitted to rest, to begin again, and to take up space.',
  declarationZh: '特此允许你休息、重新开始，并占据属于你的空间。',
  serialPrefix: 'EMP',
  sealText: 'APPROVED',
  exportedEn: 'Your license is ready.',
  exportedZh: '你的许可证已生成。',
} as const;

/** 生成情绪许可证编号（无 PII：日期 + 三位随机序号）。 */
export function makeSerial(now = new Date()): string {
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const seq = Math.floor(Math.random() * 900) + 100;
  return `${LICENSE_COPY.serialPrefix}-${ymd}-${seq}`;
}

/** 格式化许可证日期。 */
export function formatDate(now = new Date()): string {
  return `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`;
}
