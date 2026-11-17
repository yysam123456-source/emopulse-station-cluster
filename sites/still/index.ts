// /still 插件入口：Runtime 按此契约装载站点。
import { registerApp, registerConfig } from '../../shared/contract/index';
import { createStillApp } from './glue';
import config from './site.config';

registerConfig(config);
registerApp('still', createStillApp);

export default createStillApp;
