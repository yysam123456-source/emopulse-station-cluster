// /praise 站点配置：热敏纸冷白与淡青（5 色注入 + 文案 + 零件）。
import { PRAISE_COPY } from '../../content/praise';
import type { SiteConfig } from '../../shared/contract/index';

const config: SiteConfig = {
  id: 'praise',
  route: '/praise',
  theme: {
    WCOL: [0.74, 0.78, 0.80],
    PCOL: [0.96, 0.97, 0.95],
    SUNC: [1.25, 1.30, 1.35],
    EXPO: 0.72,
    RAYS: 0.38,
  },
  copy: {
    title: PRAISE_COPY.title,
    subtitle: PRAISE_COPY.hookEn,
    controls: [PRAISE_COPY.printEn, 'Listen', 'Leave'],
    locale: 'zh-en',
  },
  layout: {
    seed: 20261119,
    viewpoints: [{ position: [0, 1.5, 3.6], target: [0, 1.2, 0], label: 'counter' }],
    quality: 'auto',
    audio: { enabled: false, volume: 0.4 },
  },
  parts: [
    { id: 'receipt-paper', source: 'room-at-dawn', enabled: true },
    { id: 'layers', source: 'paper-plane', enabled: true },
    { id: 'pointer', source: 'sylva', enabled: true },
    { id: 'typewriter', source: 'local-template', enabled: true },
  ],
  analytics: { enabled: true },
};

export default config;
