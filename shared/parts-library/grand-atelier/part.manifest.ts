// 零件声明（L3 · 契约 v1）：grand-atelier —— 观感/参数参考（D1）。
// 站点 /license 的 createStampPart 只做「两条横线 + 一个矩形按 drop 上下移」，
// 原件 key→capstan→wippen→jack→repetition→hammer 链未进入产物（PRD-REUSE §1.4）。
import type { PartManifest } from '../../contract/parts-registry';

const manifest = {
  id: 'grand-atelier',
  layer: 'interaction',
  origin: 'equivalent',
  entry: 'shared/parts-library/grand-atelier/index.ts',
  source: 'grand-atelier/piano-action.ts',
  contract: 'v1',
  requires: 'none',
  note: '观感/参数参考：出证节奏参考 Anionex/grand-atelier 的击弦时序；击弦机算法未进产物（D1）。',
  provenance: {
    depth: 'D1',
    upstream: {
      repo: 'https://github.com/Anionex/grand-atelier',
      accessed: '2026-11-18',
    },
    files: [
      { path: 'grand-atelier/piano-action.ts', bytes: 15360, completeness: 'complete' },
      {
        path: 'grand-atelier/piano-model.ts',
        bytes: 42331,
        completeness: 'partial',
        missing: [
          './music.ts（未归集）',
          './piano-keyboard.ts（未归集）',
          './piano-acoustics.ts（未归集）',
          './piano-pedals.ts（未归集）',
          'three/addons（RoundedBoxGeometry / BufferGeometryUtils，未随库归集）',
        ],
      },
      { path: 'grand-atelier/piano-materials.ts', bytes: 2237, completeness: 'complete' },
    ],
    ported: [],
    paramSurface: {
      // 移植面预登记为 piano-action.ts：击弦机几何（key→capstan→wippen→jack→repetition→hammer）
      // 与全部时序常量都在该文件内，是 T-R05 升 D3 的唯一目标面。
      // piano-model.ts（3D 建模，且 6 模块未归集）与 piano-materials.ts（材质）无 2D 对应物，不纳入。
      scope: [
        {
          path: 'grand-atelier/piano-action.ts',
          reason: '击弦机几何比例与时序常量的唯一载体，2D 出证节奏移植面全部在此文件',
        },
      ],
      enumerated: [],
      evidence: '当前 D1 + ported:[]，未接线任何原件参数（HAMMER_* 为原件符号，未被使用）；'
        + 'T-R05 升 D3 后逐条填入并过死参数探针；分母由 param-pool 从 scope 机械抽取',
    },
    license: {
      spdx: 'MIT',
      evidence: '_source_probe/Anionex_grand-atelier/LICENSE（Copyright (c) 2026 anionex）',
      grade: 'L1',
    },
  },
} satisfies PartManifest;

export default manifest;
