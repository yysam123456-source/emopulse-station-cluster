// koi 三风格共享配置工厂：三个落地页各自调用，产物仍相互独立。
import { KOI_STYLES, type KoiStyle } from '../../../content/koi';
import type { SiteConfig, ThemeConfig, SiteId } from '../../../shared/contract/index';

const THEMES: Record<KoiStyle, ThemeConfig> = {
  pond: { WCOL: [0.22, 0.52, 0.48], PCOL: [0.72, 0.88, 0.80], SUNC: [1.30, 1.45, 1.30], EXPO: 0.60, RAYS: 0.50 },
  ink: { WCOL: [0.30, 0.30, 0.32], PCOL: [0.88, 0.88, 0.86], SUNC: [1.20, 1.20, 1.25], EXPO: 0.55, RAYS: 0.35 },
  watercolor: { WCOL: [0.62, 0.55, 0.72], PCOL: [0.94, 0.86, 0.92], SUNC: [1.35, 1.25, 1.45], EXPO: 0.68, RAYS: 0.45 },
};

/** 生成单个 koi 风格站点配置。 */
export function makeKoiConfig(style: KoiStyle): SiteConfig {
  const info = KOI_STYLES[style];
  return {
    id: info.id as SiteId,
    route: `/${info.id}`,
    theme: THEMES[style],
    copy: {
      title: info.title,
      subtitle: info.hookEn,
      controls: ['Watch', 'Listen', 'Leave'],
      locale: 'zh-en',
    },
    layout: {
      seed: 20261121 + Object.keys(KOI_STYLES).indexOf(style),
      viewpoints: [{ position: [0, 1.5, 4], target: [0, 1.2, 0], label: 'pond' }],
      quality: 'auto',
      audio: { enabled: false, volume: 0.35 },
    },
    parts: [{ id: 'koi', source: 'zz85-koi', enabled: true, options: { style } }],
    analytics: { enabled: true },
  };
}
