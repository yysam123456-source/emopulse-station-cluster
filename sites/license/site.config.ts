// /license 站点配置：公文暖白与朱砂印章色（5 色注入 + 文案 + 零件）。
import { LICENSE_COPY } from '../../content/license';
import type { SiteConfig } from '../../shared/contract/index';

const config: SiteConfig = {
  id: 'license',
  route: '/license',
  theme: {
    WCOL: [0.72, 0.66, 0.56],
    PCOL: [0.95, 0.88, 0.74],
    SUNC: [1.45, 1.25, 1.05],
    EXPO: 0.66,
    RAYS: 0.48,
  },
  copy: {
    title: LICENSE_COPY.title,
    subtitle: LICENSE_COPY.hookEn,
    controls: [LICENSE_COPY.stampEn, 'Listen', 'Leave'],
    locale: 'zh-en',
  },
  layout: {
    seed: 20261118,
    viewpoints: [{ position: [0, 1.6, 4], target: [0, 1.4, 0], label: 'desk' }],
    quality: 'auto',
    audio: { enabled: false, volume: 0.4 },
  },
  parts: [
    { id: 'paper', source: 'room-at-dawn', enabled: true },
    { id: 'timeline', source: 'crimson-loong', enabled: true },
    { id: 'stamp', source: 'grand-atelier', enabled: true },
    { id: 'plane', source: 'paper-plane', enabled: true },
  ],
  analytics: { enabled: true },
};

export default config;
