// 零件声明（L3 · 契约 v1）：rain-webgpu —— D0（原件在库，一字未用）。
// 原件是 WebGPU 雨夜引擎（createHeightMap/createRain/createRipples/createPostPipeline），
// 本批次未装站（PRD-REUSE §1.4 实测 D0）。装配壳恒抛 E_PART_NOT_MOUNTED。
import type { PartManifest } from '../../contract/parts-registry';

const manifest = {
  id: 'rain-webgpu',
  layer: 'scene',
  origin: 'equivalent',
  entry: 'shared/parts-library/rain-webgpu/index.ts',
  source: 'rain-webgpu/post.ts',
  contract: 'v1',
  claims: [{ resource: 'postprocess', mode: 'chain' }],
  requires: 'webgpu',
  note: '原件（Jing0715-fer/rainy-night-webgpu-nextjs，4 文件）仅入库对照；本批次未装站，一字未用（D0）。',
  provenance: {
    depth: 'D0',
    upstream: {
      repo: 'https://github.com/Jing0715-fer/rainy-night-webgpu-nextjs',
      accessed: '2026-11-18',
    },
    files: [
      { path: 'rain-webgpu/engine.ts', bytes: 26211, completeness: 'complete' },
      { path: 'rain-webgpu/rain.ts', bytes: 14127, completeness: 'complete' },
      { path: 'rain-webgpu/height-map.ts', bytes: 4941, completeness: 'complete' },
      { path: 'rain-webgpu/post.ts', bytes: 8588, completeness: 'complete' },
    ],
    ported: [],
    paramSurface: {
      total: 4,
      enumerated: ['RAIN_LAYER', 'RAINY_BLOOM_STRENGTH', 'resolution', 'frameSkip'],
      evidence: 'rain.ts:53 RAIN_LAYER / post.ts:74 RAINY_BLOOM_STRENGTH / height-map.ts:31,34 resolution、frameSkip',
    },
    license: {
      spdx: 'NOASSERTION',
      evidence: '仓库无 LICENSE 文件，无任何再分发声明（F-R4）',
      grade: 'L3',
    },
  },
} satisfies PartManifest;

export default manifest;
