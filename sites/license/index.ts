// /license 插件入口：Runtime 按 SiteApp 契约装载。
import { registerApp, registerConfig } from '../../shared/contract/index';
import { createLicenseApp } from './glue';
import config from './site.config';

registerConfig(config);
registerApp('license', createLicenseApp);
export default createLicenseApp;
