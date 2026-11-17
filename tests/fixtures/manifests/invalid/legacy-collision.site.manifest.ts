// 负向 fixture ⑤：id 落入 LEGACY_IDS（应触发 E_LEGACY_ID，堵住「绕过冻结快照重建存量站」）。
import { defineSite } from '../../../../shared/contract/manifest';

export default defineSite({
  id: 'still',
  route: '/still',
  dir: 'tests/fixtures/sites/alpha',
  out: 'still.html',
  config: 'site.config.ts',
  bridge: 'bridge.ts',
  cohort: 'nexus',
  engine: 'canvas2d',
});
