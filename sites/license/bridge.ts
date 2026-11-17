// /license 浏览器侧 glue：接 SiteApp 七方法、FSM、匿名埋点；不参与 core 拼接。
import { createAnalytics } from '../../shared/contract/analytics';
import { decode } from '../../shared/contract/short-url';
import type { RuntimeContext } from '../../shared/contract/types';
import { createLicenseApp } from './glue';
import config from './site.config';
import { createLicenseState } from './state';

const analytics = createAnalytics({ enabled: config.analytics.enabled, endpoint: config.analytics.endpoint });
const from = decode(window.location.search);
analytics.track('APP_INIT', {
  site: config.id,
  from: typeof from.site === 'string' ? from.site.slice(0, 40) : 'direct',
});

const app = createLicenseApp();
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
  state: createLicenseState() as unknown as RuntimeContext['state'],
  analytics, store: {},
};

app.init(config, ctx);
app.mount(document.body);
app.start();
window.addEventListener('pagehide', () => app.dispose(), { once: true });
