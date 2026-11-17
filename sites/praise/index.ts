// /praise 插件入口。
import { registerApp, registerConfig } from '../../shared/contract/index';
import { createPraiseApp } from './glue';
import config from './site.config';

registerConfig(config);
registerApp('praise', createPraiseApp);
export default createPraiseApp;
