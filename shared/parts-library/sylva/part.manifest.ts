// 零件声明（L3 · 契约 v1）：sylva —— D0（原件在库，一字未用）。
// 原件是整页 WebGL 液态金属（内联脚本）；/praise 的「指针拨开纸层」为站点自写，未引用其算法。
// PRD-REUSE §1.4 实测 D0；许可为 L4（文章明示不授予再分发），T-R06 进隔离区。
import type { PartManifest } from '../../contract/parts-registry';

const manifest = {
  id: 'sylva',
  layer: 'interaction',
  origin: 'equivalent',
  entry: 'shared/parts-library/sylva/index.ts',
  source: 'sylva/index.html',
  contract: 'v1',
  requires: 'none',
  note: '原件（MengTo/sylva，2 个 HTML）仅入库对照；/praise 拨纸层为站点自写，一字未用（D0）。',
  provenance: {
    depth: 'D0',
    upstream: {
      repo: 'https://github.com/MengTo/sylva',
      accessed: '2026-11-18',
    },
    files: [
      { path: 'sylva/index.html', bytes: 161425, completeness: 'complete' },
      { path: 'sylva/liquid-metal-explore.html', bytes: 94692, completeness: 'complete' },
    ],
    ported: [],
    paramSurface: {
      total: 0,
      enumerated: [],
      evidence: '两个 HTML 均为内联脚本，无模块导出，无可枚举的顶层参数（分母记 0）',
    },
    license: {
      spdx: 'NOASSERTION',
      evidence: '仅 licenses/THREE-LICENSE.txt（three.js）；文章明示不授予再分发 → L4 硬阻断',
      grade: 'L4',
      blocked: true,
    },
  },
} satisfies PartManifest;

export default manifest;
