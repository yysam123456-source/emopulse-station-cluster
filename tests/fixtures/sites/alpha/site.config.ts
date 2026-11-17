// fixture 站点配置（正向）：形状严格满足 SiteConfig，含可选 composition（五层齐全）。
import type { SiteConfig } from '../../../../shared/contract/types';

const config: SiteConfig = {
  id: 'fixture-alpha',
  route: '/fixture-alpha',
  theme: {
    WCOL: [0.11, 0.22, 0.33],
    PCOL: [0.44, 0.55, 0.66],
    SUNC: [1.05, 1.0, 0.95],
    EXPO: 0.55,
    RAYS: 0.41,
  },
  copy: {
    title: 'Fixture Alpha',
    subtitle: 'schema fixture only',
    controls: ['Start'],
    locale: 'zh-en',
  },
  layout: {
    seed: 20261117,
    viewpoints: [{ position: [0, 1.5, 3], target: [0, 1, 0], label: 'main' }],
    quality: 'auto',
    audio: { enabled: false, volume: 0.3 },
  },
  parts: [],
  analytics: { enabled: false },
  composition: {
    narrative: [],
    scene: [{ ref: 'fixture-scene', enabled: true, claims: [{ resource: 'canvas:stage', mode: 'exclusive' }] }],
    interaction: [],
    audio: [],
    artifact: [],
  },
};

export default config;
