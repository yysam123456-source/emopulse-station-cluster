// 零件声明（L3 · 契约 v1）：crimson-loong —— 真实复制原件。
// 原件：60_dragon.js（事件表/时间轴）+ 15_tex.js（纹理）+ 00_util.js（工具）。
// 装站口径：/license 取 verifying→stamping→approved 时间轴顺序，产物为 Canvas 印章凭证。
// entry 为「装站时创建的薄包装」，T01 仅登记声明骨架（见 registry/README.md 第五节）。
import type { PartManifest } from '../../contract/parts-registry';

const manifest = {
  id: 'crimson-loong',
  layer: 'artifact',
  origin: 'copy',
  entry: 'shared/parts-library/crimson-loong/index.ts',
  source: 'crimson-loong/60_dragon.js',
  contract: 'v1',
  requires: 'none',
  note: '真实复制原件（ChetasLua/crimson-loong）；原件零改动，站点侧仅薄包装。',
} satisfies PartManifest;

export default manifest;
