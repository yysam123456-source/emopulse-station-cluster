// 负向 fixture ②：与 dup-id-a 使用同一 id（按文件名排序后作为第二条，应触发 E_DUP_ID）。
import { defineSite } from '../../../../shared/contract/manifest';

export default defineSite({
  id: 'fixture-alpha',
  route: '/fixture-alpha',
  dir: 'tests/fixtures/sites/alpha',
  out: 'fixture-alpha.html',
  config: 'site.config.ts',
  bridge: 'bridge.ts',
  cohort: 'nexus',
  engine: 'canvas2d',
});
