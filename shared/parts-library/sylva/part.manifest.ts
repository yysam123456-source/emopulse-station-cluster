// 零件声明（L3 · 契约 v1）：sylva —— 真实复制原件（指针 NDC + 平面射线）。
// 原件：index.html + sylva-assets/liquid-metal-explore.html。
// 装站口径：/praise 移植为「指针拨开纸层」，原件一行不改。
import type { PartManifest } from '../../contract/parts-registry';

const manifest = {
  id: 'sylva',
  layer: 'interaction',
  origin: 'copy',
  entry: 'shared/parts-library/sylva/index.ts',
  source: 'sylva/index.html',
  contract: 'v1',
  requires: 'none',
  note: '真实复制原件（MengTo/sylva）；指针交互经 LayerBus.on 登记，dispose 自动注销。',
} satisfies PartManifest;

export default manifest;
