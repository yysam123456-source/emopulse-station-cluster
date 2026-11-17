// 负向 fixture ③：非法 slug（大写 + 下划线，应触发 E_SLUG）。
import { defineSite } from '../../../../shared/contract/manifest';

export default defineSite({
  id: 'Bad_Slug',
  route: '/Bad_Slug',
  dir: 'tests/fixtures/sites/alpha',
  out: 'Bad_Slug.html',
  config: 'site.config.ts',
  bridge: 'bridge.ts',
  cohort: 'nexus',
  engine: 'canvas2d',
});
