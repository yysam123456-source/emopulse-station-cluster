import { registerApp, registerConfig } from '../../../shared/contract/index';
import { createKoiApp } from '../shared/glue';
import config from './site.config';
registerConfig(config);
registerApp('koi-pond', () => createKoiApp('koi-pond'));
export default () => createKoiApp('koi-pond');
