// /still 站点配置：静室暖灰 5 配色值（L2 注入）+ 文案 + 布局 + 零件位 + 埋点。
import { STILL_COPY } from '../../content/still';
import type { SiteConfig } from '../../shared/contract/index';

const stillConfig: SiteConfig = {
  id: 'still',
  route: '/still',
  theme: {
    // WCOL / PCOL / SUNC → shaders.js 的 vec3f(...)；SUNC 为 HDR 光强，可 >1。
    WCOL: [0.36, 0.34, 0.31],
    PCOL: [0.82, 0.76, 0.66],
    SUNC: [1.35, 1.18, 0.98],
    // EXPO / RAYS → main.js:393 的 JS 浮点字面量（TANH/NEAR 保持原值）。
    EXPO: 0.58,
    RAYS: 0.42,
  },
  copy: {
    title: STILL_COPY.title,
    subtitle: STILL_COPY.hookEn,
    controls: STILL_COPY.controls.map((c) => c.labelEn),
    locale: 'zh-en',
  },
  layout: {
    seed: 20261117,
    viewpoints: [
      { position: [0, 1.6, 4], target: [0, 1.4, 0], label: 'threshold' },
      { position: [2.4, 1.2, 3.2], target: [0, 1.2, -0.4], label: 'left' },
      { position: [-2.4, 1.2, 3.2], target: [0, 1.2, -0.4], label: 'right' },
      { position: [0, 2.8, 2.2], target: [0, 0.8, -1], label: 'above' },
      { position: [0, 0.9, 5], target: [0, 1.5, 0], label: 'far' },
      { position: [1.4, 1.6, 1.6], target: [-0.6, 1.4, -1.2], label: 'near' },
    ],
    quality: 'auto',
    audio: { enabled: false, volume: 0.45 },
  },
  // P0 不叠加零件；P2 雨效/锦鲤/微缩场景在此登记并从 glue 的零件工厂装载。
  parts: [],
  analytics: { enabled: true, sitTiming: true },
};

export default stillConfig;
