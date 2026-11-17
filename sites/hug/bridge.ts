// /hug 浏览器侧 glue：?from= 解码 → 回赠闭环；默认不请求麦克风；SiteApp 七方法接入。
import { createAnalytics } from '../../shared/contract/analytics';
import { decode, withFrom } from '../../shared/contract/short-url';
import type { RuntimeContext } from '../../shared/contract/types';
import { createHugApp } from './glue';
import config from './site.config';
import { createHugState } from './state';

const analytics = createAnalytics({ enabled: config.analytics.enabled, endpoint: config.analytics.endpoint });
const from = decode(window.location.search);
const fromSource = typeof from.site === 'string' ? from.site.slice(0, 40) : '';
analytics.track('APP_INIT', { site: config.id, from: fromSource || 'direct' });

const app = createHugApp();
const noopQuality: RuntimeContext['quality'] = {
  level: 'high', auto: true,
  setLevel() { /* 画质由 core/quality.js 自适应 */ },
};
const noopAudio: RuntimeContext['audio'] = {
  enabled: false, volume: config.layout.audio.volume,
  setEnabled() { /* 音频由 core KeyM 控制 */ }, setVolume() { /* 由 core 管理 */ },
};
const ctx: RuntimeContext = {
  scene: {} as RuntimeContext['scene'],
  camera: {} as RuntimeContext['camera'],
  renderer: {} as RuntimeContext['renderer'],
  quality: noopQuality, audio: noopAudio,
  state: createHugState() as unknown as RuntimeContext['state'],
  analytics,
  store: { fromSource },
};

app.init(config, ctx);
app.mount(document.body);
app.start();

// 分享链接：只带站点标识，无 PII；接收方 ?from= 会显示 Hug them back。
const share = (): string => withFrom('/hug', { site: config.id, v: 1 });
window.setTimeout(() => { ctx.store.shareUrl = share(); }, 0);
window.addEventListener('pagehide', () => app.dispose(), { once: true });
