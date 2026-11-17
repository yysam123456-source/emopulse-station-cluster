// 负向 fixture ④：声明的 config 文件不存在（应触发 E_FILE）。
import { defineSite } from '../../../../shared/contract/manifest';

export default defineSite({
  id: 'fixture-missing',
  route: '/fixture-missing',
  dir: 'tests/fixtures/sites/alpha',
  out: 'fixture-missing.html',
  config: 'nope.config.ts',
  bridge: 'bridge.ts',
  cohort: 'nexus',
  engine: 'canvas2d',
});
