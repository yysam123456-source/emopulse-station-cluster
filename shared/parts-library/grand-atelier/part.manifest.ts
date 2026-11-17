// 零件声明（L3 · 契约 v1）：grand-atelier —— 真实复制原件（击弦机 key→hammer→damper 联动）。
// 原件：piano-action.ts / piano-model.ts / piano-materials.ts（依赖 three r169，属 L3 参考原件，
// 本批次不直接 bundle 进产物，站点侧沿用已完成的可验证移植）。
import type { PartManifest } from '../../contract/parts-registry';

const manifest = {
  id: 'grand-atelier',
  layer: 'interaction',
  origin: 'copy',
  entry: 'shared/parts-library/grand-atelier/index.ts',
  source: 'grand-atelier/piano-action.ts',
  contract: 'v1',
  requires: 'none',
  note: '真实复制原件（Anionex/grand-atelier）；/license 口径为 按钮→印章→出证，不改原件。',
} satisfies PartManifest;

export default manifest;
