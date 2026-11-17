// fixture 站点声明（正向）：第二条合法声明，用于验证「多条 manifest 聚合 + id 唯一」。
import { defineSite } from '../../../../shared/contract/manifest';

export default defineSite({
  id: 'fixture-beta',
  route: '/fixture-beta',
  dir: 'tests/fixtures/sites/beta',
  out: 'fixture-beta.html',
  config: 'site.config.ts',
  bridge: 'bridge.ts',
  cohort: 'nexus',
  engine: 'canvas2d',
});
