// /hug 站点配置：黄昏暖橙（5 色注入 + 文案 + 零件）。
import { HUG_COPY } from '../../content/hug';
import type { SiteConfig } from '../../shared/contract/index';

const config: SiteConfig = {
  id: 'hug',
  route: '/hug',
  theme: {
    WCOL: [0.78, 0.52, 0.38],
    PCOL: [0.98, 0.82, 0.66],
    SUNC: [1.60, 1.25, 0.95],
    EXPO: 0.62,
    RAYS: 0.58,
  },
  copy: {
    title: HUG_COPY.title,
    subtitle: HUG_COPY.hookEn,
    controls: [HUG_COPY.releaseEn, 'Listen', 'Leave'],
    locale: 'zh-en',
  },
  layout: {
    seed: 20261120,
    viewpoints: [{ position: [0, 1.7, 4.2], target: [0, 1.3, -0.5], label: 'meadow' }],
    quality: 'auto',
    audio: { enabled: false, volume: 0.45 },
  },
  parts: [
    { id: 'dandelion', source: 'dandelion', enabled: true },
    { id: 'blow', source: 'blow-input', enabled: true, options: { fallbackButton: true, autoRequest: false } },
    { id: 'flight', source: 'paper-plane', enabled: true },
  ],
  analytics: { enabled: true },
};

export default config;
