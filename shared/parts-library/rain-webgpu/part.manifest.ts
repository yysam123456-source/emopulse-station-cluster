// 零件声明（L3 · 契约 v1）：rain-webgpu —— 真实复制原件（雨夜 WebGPU 引擎）。
// 原件：engine.ts / rain.ts / height-map.ts / post.ts（createHeightMap / createRain / createRipples / createPostPipeline）。
// 装站口径：① 气象静室的 Canvas 2D 等效件；postprocess 走 chain，与 ssf-fog 同资源串管线（§6.3）。
import type { PartManifest } from '../../contract/parts-registry';

const manifest = {
  id: 'rain-webgpu',
  layer: 'scene',
  origin: 'copy',
  entry: 'shared/parts-library/rain-webgpu/index.ts',
  source: 'rain-webgpu/post.ts',
  contract: 'v1',
  claims: [{ resource: 'postprocess', mode: 'chain' }],
  requires: 'webgpu',
  note: '真实复制原件（Jing0715-fer/rainy-night-webgpu-nextjs）；无 adapter 时由 CapabilityProbe 如实降级。',
} satisfies PartManifest;

export default manifest;
