import { registerApp, registerConfig } from '../../../shared/contract/index';
import { createKoiApp } from '../shared/glue';
import config from './site.config';
registerConfig(config);
registerApp('koi-ink', () => createKoiApp('koi-ink'));
export default () => createKoiApp('koi-ink');
