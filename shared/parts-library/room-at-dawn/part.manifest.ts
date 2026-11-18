// 零件声明（L3 · 契约 v1）：room-at-dawn —— D0（原件在库，一字未用）。
// 原件是 3D GI 烘焙房间（runBake spp=64 / halton / applyBake），只剩 main.js 且 6 个模块未归集；
// /license 公文纸纹、/praise 热敏纸纹均为站点自写 Canvas 2D（PRD-REUSE §1.4 / F-R5 实测 D0）。
import type { PartManifest } from '../../contract/parts-registry';

const manifest = {
  id: 'room-at-dawn',
  layer: 'scene',
  origin: 'equivalent',
  entry: 'shared/parts-library/room-at-dawn/index.ts',
  source: 'room-at-dawn/main.js',
  contract: 'v1',
  claims: [{ resource: 'paper:texture', mode: 'shared' }],
  requires: 'none',
  note: '原件（Leonxlnx/room-at-dawn，1/7 文件）仅入库对照；两站纸纹为自写 Canvas 2D，一字未用（D0）。',
  provenance: {
    depth: 'D0',
    upstream: {
      repo: 'https://github.com/Leonxlnx/room-at-dawn',
      accessed: '2026-11-18',
    },
    files: [
      {
        path: 'room-at-dawn/main.js',
        bytes: 7460,
        completeness: 'partial',
        missing: [
          './core/gi.js（未归集）',
          './core/tex.js（未归集）',
          './render/cams.js（未归集）',
          './render/look.js（未归集）',
          './render/pipeline.js（未归集）',
          './scene/index.js（未归集）',
        ],
      },
    ],
    ported: [],
    paramSurface: {
      total: 3,
      enumerated: ['quality', 'aperture', 'focus'],
      evidence: 'main.js:27 `state = { quality: Q.get(q)||"high", lens: { aperture: 0, focus: 3 } }`',
    },
    license: {
      spdx: 'MIT',
      evidence: '_source_probe/Leonxlnx_room-at-dawn/LICENSE',
      grade: 'L1',
    },
  },
} satisfies PartManifest;

export default manifest;
