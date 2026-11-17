// koi-ink 浏览器侧 glue。
import { createAnalytics } from '../../../shared/contract/analytics';
import { decode } from '../../../shared/contract/short-url';
import type { RuntimeContext } from '../../../shared/contract/types';
import { createKoiApp } from '../shared/glue';
import { createKoiState } from './state';
import config from './site.config';

const analytics = createAnalytics({ enabled: config.analytics.enabled, endpoint: config.analytics.endpoint });
const from = decode(window.location.search);
analytics.track('APP_INIT', { site: config.id, from: typeof from.site === 'string' ? from.site.slice(0, 40) : 'direct' });
const app = createKoiApp('koi-ink');
const ctx: RuntimeContext = {
  scene: {} as RuntimeContext['scene'], camera: {} as RuntimeContext['camera'],
  renderer: {} as RuntimeContext['renderer'],
  quality: { level: 'high', auto: true, setLevel() {} },
  audio: { enabled: false, volume: config.layout.audio.volume, setEnabled() {}, setVolume() {} },
  state: createKoiState() as unknown as RuntimeContext['state'], analytics, store: {},
};
app.init(config, ctx);
app.mount(document.body);
app.start();
window.addEventListener('pagehide', () => app.dispose(), { once: true });
