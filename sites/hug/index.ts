// /hug 插件入口。
import { registerApp, registerConfig } from '../../shared/contract/index';
import { createHugApp } from './glue';
import config from './site.config';

registerConfig(config);
registerApp('hug', createHugApp);
export default createHugApp;
