// fixture 站点声明（正向）：仅用于 tests/verify-registry.mjs / verify-append-only.mjs 的 schema 通过路径。
// 纪律：fixture 目录**不得**放在 sites/ 下，避免被真实构建当成站点（团队主理人范围调整）。
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
  requires: 'none',
});
