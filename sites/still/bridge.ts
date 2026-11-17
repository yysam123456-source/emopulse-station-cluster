// /still 浏览器侧 glue：把 SiteApp 七方法、FSM、埋点接进构建产物。
// 由 shared/build/inline.mjs 编译内联到站点模板的 /*RUNTIME*/；不参与 core 的 6 文件拼接。
import { createAnalytics } from '../../shared/contract/analytics';
import { decode } from '../../shared/contract/short-url';
import type { RuntimeContext } from '../../shared/contract/types';
import { createStillApp } from './glue';
import config from './site.config';
import { createStillState } from './state';

const analytics = createAnalytics({
  enabled: config.analytics.enabled,
  endpoint: config.analytics.endpoint,
});

// ?from=<base64url(JSON)>：只记录来源站点标识，无 PII、无后端。
const from = decode(window.location.search);
const source = typeof from.site === 'string' ? from.site.slice(0, 40) : 'direct';
analytics.track('APP_INIT', { site: config.id, from: source });

const app = createStillApp();

// core/main.js 自建 scene/camera/renderer 且不导出；/still 的 glue 只使用计时与 DOM，
// 这里提供类型完整的空实现，避免让站点持有引擎的构造权（符合 IoC 纪律）。
const noopQuality: RuntimeContext['quality'] = {
  level: 'high',
  auto: true,
  setLevel() { /* 画质由 core/quality.js 自适应，站点不改写 */ },
};
const noopAudio: RuntimeContext['audio'] = {
  enabled: false,
  volume: config.layout.audio.volume,
  setEnabled() { /* 音频由 core/audio.js 与 KeyM 控制 */ },
  setVolume() { /* 音量由 core/audio.js 管理 */ },
};
const ctx: RuntimeContext = {
  scene: {} as RuntimeContext['scene'],
  camera: {} as RuntimeContext['camera'],
  renderer: {} as RuntimeContext['renderer'],
  quality: noopQuality,
  audio: noopAudio,
  state: createStillState() as unknown as RuntimeContext['state'],
  analytics,
  store: {},
};

app.init(config, ctx);
app.mount(document.body);
app.start();

// 静坐分桶心跳：30 秒一次，离开后 onEvent 不改变状态（状态机自行忽略）。
window.setInterval(() => app.onEvent('ANALYTICS_TICK'), 30_000);

// 离开页面时释放零件、监听与埋点缓冲；不弹确认框（无打扰）。
window.addEventListener('pagehide', () => app.dispose(), { once: true });
