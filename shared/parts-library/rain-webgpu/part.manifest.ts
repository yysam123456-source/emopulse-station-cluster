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
      {
        // T-R02 门 1（import 反查）实测：engine.ts 有 18 个相对 import 未随库归集，
        // 故该文件的模块集不是 complete —— 不许假装完整（REUSE-3）。
        path: 'rain-webgpu/engine.ts',
        bytes: 26211,
        completeness: 'partial',
        missing: [
          './atmosphere/ambient（未归集）',
          './atmosphere/post（未归集）',
          './atmosphere/sky（未归集）',
          './atmosphere/horizon（未归集）',
          './ground/road-wet（未归集）',
          './ground/planar-reflect（未归集）',
          './water/canal（未归集）',
          './rain/height-map（原路径未按原目录归集，仅根层 height-map.ts 入库）',
          './rain/rain（原路径未按原目录归集，仅根层 rain.ts 入库）',
          './audio/rain-audio（未归集）',
          './lightning/lightning（未归集）',
          './city/lantern-flicker（未归集）',
          './city/lantern-emissive（未归集）',
          './city/lantern-lights（未归集）',
          './city/load（未归集）',
          './city/texture-emissive（未归集）',
          './city/window-emissive（未归集）',
          './tour/tour（未归集）',
        ],
      },
      { path: 'rain-webgpu/rain.ts', bytes: 14127, completeness: 'complete' },
      { path: 'rain-webgpu/height-map.ts', bytes: 4941, completeness: 'complete' },
      {
        // 同上：post.ts 依赖 bloom/dither/ssf 与 lighting、rain，均未归集 → partial
        path: 'rain-webgpu/post.ts',
        bytes: 8588,
        completeness: 'partial',
        missing: [
          './bloom（未归集）',
          './dither（未归集）',
          './ssf（未归集）',
          '../lightning/lightning（未归集）',
          '../rain/rain（未归集）',
        ],
      },
    ],
    ported: [],
    paramSurface: {
      // D0：本批次未装站 → 移植面为空。将来若移植 rain.ts（2D 雨幕/涟漪），
      // 在此登记 'rain-webgpu/rain.ts' 并给出理由；post.ts（WebGPU 后处理）无 2D 对应物，永不纳入。
      scope: [],
      enumerated: [],
      evidence: 'D0 未装站：scope 与 enumerated 均为空（不得凭空声明移植面），走 E_PART_NOT_MOUNTED 门',
    },
    license: {
      spdx: 'NOASSERTION',
      evidence: '仓库无 LICENSE 文件，无任何再分发声明（F-R4）。无许可证声明，已签字豁免，仅用于个人展示站，不得再分发。',
      grade: 'L3',
    },
  },
} satisfies PartManifest;

export default manifest;
