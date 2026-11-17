// 零件声明（L3 · 契约 v1）：koi —— 真实复制原件（整页三着色器）。
// 原件：13 文件（main/koi/pond/ink/paint/glsl/surface/smoke/audio/cdp + index.html + 文档）。
// 装站口径：koi-pond / koi-ink / koi-watercolor 三站产物为 Canvas 2D 三风格移植版（已验证）。
import type { PartManifest } from '../../contract/parts-registry';

const manifest = {
  id: 'koi',
  layer: 'scene',
  origin: 'copy',
  entry: 'shared/parts-library/koi/index.ts',
  source: 'koi/main.js',
  contract: 'v1',
  claims: [{ resource: 'canvas:stage', mode: 'exclusive' }],
  requires: 'none',
  note: '真实复制原件（zz85/random-sketches）；原件零改动，三风格差异由配置 options.style 表达。',
} satisfies PartManifest;

export default manifest;
