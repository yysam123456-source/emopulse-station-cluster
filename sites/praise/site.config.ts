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
    // 热敏纸纹观感参考 room-at-dawn（D0：3D GI 与 2D 纸纹无算法交集，C4 裁「仅取观感」），
    // 实现为本站 createReceiptPaperPart。T-R05 真移植后再改回 source: 'room-at-dawn' 并升 D1。
    // 为什么现在写 'local'：`source` 声称「装的是哪个上游零件」，而 createReceiptPaperPart 是
    // 本站自写的 2D 纸纹，不是 manifest.entry 的实例化。写 room-at-dawn 即 E_SITE_REF_DEAD。
    { id: 'receipt-paper', source: 'local', enabled: true },
    { id: 'layers', source: 'paper-plane', enabled: true },
    { id: 'pointer', source: 'sylva', enabled: true },
    { id: 'typewriter', source: 'local-template', enabled: true },
  ],
  analytics: { enabled: true },
};

export default config;
