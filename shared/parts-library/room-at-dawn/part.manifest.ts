// 零件声明（L3 · 契约 v1）：room-at-dawn —— 真实复制原件（程序化噪声 + 烘焙光照）。
// 原件：src/main.js。装站口径：/license 公文纸纹、/praise 热敏纸纹，均移植为 Canvas 2D。
import type { PartManifest } from '../../contract/parts-registry';

const manifest = {
  id: 'room-at-dawn',
  layer: 'scene',
  origin: 'copy',
  entry: 'shared/parts-library/room-at-dawn/index.ts',
  source: 'room-at-dawn/main.js',
  contract: 'v1',
  claims: [{ resource: 'paper:texture', mode: 'shared' }],
  requires: 'none',
  note: '真实复制原件（Leonxlnx/room-at-dawn）；站点侧只做薄包装与纸纹等效移植。',
} satisfies PartManifest;

export default manifest;
