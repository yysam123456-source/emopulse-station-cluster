// 负向 fixture ①：与 dup-id-b 使用同一 id（应触发 E_DUP_ID）。
// 说明：负向 fixture 位于 tests/fixtures/manifests/invalid/，不参与真实构建。
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
