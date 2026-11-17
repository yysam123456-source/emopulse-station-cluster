import { registerApp, registerConfig } from '../../../shared/contract/index';
import { createKoiApp } from '../shared/glue';
import config from './site.config';
registerConfig(config);
registerApp('koi-watercolor', () => createKoiApp('koi-watercolor'));
export default () => createKoiApp('koi-watercolor');
