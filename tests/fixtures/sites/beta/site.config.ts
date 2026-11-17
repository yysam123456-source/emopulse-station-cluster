// fixture 站点配置（正向，第二条）：不提供 composition，验证可选字段的双轨兼容。
import type { SiteConfig } from '../../../../shared/contract/types';

const config: SiteConfig = {
  id: 'fixture-beta',
  route: '/fixture-beta',
  theme: {
    WCOL: [0.21, 0.32, 0.43],
    PCOL: [0.54, 0.65, 0.76],
    SUNC: [1.11, 1.06, 1.01],
    EXPO: 0.61,
    RAYS: 0.47,
  },
  copy: {
    title: 'Fixture Beta',
    subtitle: 'schema fixture only',
    controls: ['Start'],
    locale: 'zh-en',
  },
  layout: {
    seed: 20261118,
    viewpoints: [{ position: [0, 1.8, 3.4], target: [0, 1, 0], label: 'main' }],
    quality: 'auto',
    audio: { enabled: false, volume: 0.35 },
  },
  parts: [],
  analytics: { enabled: false },
};

export default config;
