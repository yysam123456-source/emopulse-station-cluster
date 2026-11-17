// 自研① 情绪文案库 + SEO · koi 三风格搜索长尾站。
export const KOI_STYLES = {
  pond: {
    id: 'koi-pond',
    title: 'Koi Pond',
    hookEn: 'A pond you can sit beside, anytime.',
    hookZh: '一座随时可以坐下来的池塘。',
    keywords: 'koi pond, koi fish, calm water, pond scene',
    description: 'A quiet koi pond. Watch the fish drift and let the day slow down.',
  },
  ink: {
    id: 'koi-ink',
    title: 'Ink Koi',
    hookEn: 'Ink, water, and a little luck.',
    hookZh: '墨、水，和一点好运。',
    keywords: 'ink koi, sumi koi, Japanese ink painting, koi art',
    description: 'Ink-wash koi drifting across paper. A meditative, searchable koi scene.',
  },
  watercolor: {
    id: 'koi-watercolor',
    title: 'Watercolor Koi',
    hookEn: 'Soft colors, slow fins.',
    hookZh: '柔软的颜色，缓慢的鳍。',
    keywords: 'watercolor koi, koi painting, watercolor fish, koi art',
    description: 'Watercolor koi in a gentle wash of color. A quiet place to watch fish swim.',
  },
} as const;

export type KoiStyle = keyof typeof KOI_STYLES;
