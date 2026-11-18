// 零件声明（L3 · 契约 v1）：crimson-loong —— 观感参考（D1）。
// 站点 /license 只用「三阶段时间轴 + 朱砂配色」的观感，原件四层骨骼链算法未进入产物。
// 依据：PRD-REUSE §1.4 实测 D1（站点 createTimelinePart 仅 3 个圆点按 stage 着色）。
import type { PartManifest } from '../../contract/parts-registry';

const manifest = {
  id: 'crimson-loong',
  layer: 'artifact',
  origin: 'equivalent',
  entry: 'shared/parts-library/crimson-loong/index.ts',
  source: 'crimson-loong/60_dragon.js',
  contract: 'v1',
  requires: 'none',
  note: '观感参考：站点取 verifying→stamping→approved 时间轴顺序与朱砂配色；原件仅入库对照，算法未进产物（D1）。',
  provenance: {
    depth: 'D1',
    upstream: {
      repo: 'https://github.com/ChetasLua/crimson-loong',
      accessed: '2026-11-18',
    },
    files: [
      { path: 'crimson-loong/00_util.js', bytes: 8235, completeness: 'complete' },
      { path: 'crimson-loong/15_tex.js', bytes: 16299, completeness: 'complete' },
      { path: 'crimson-loong/60_dragon.js', bytes: 86897, completeness: 'complete' },
    ],
    ported: [],
    paramSurface: {
      total: 1,
      enumerated: ['MAXROLL'],
      evidence: '60_dragon.js:41 `const MAXROLL = rad(5)`，原件唯一顶层可调常量（TAU 等为数学常量，不计）',
    },
    license: {
      spdx: 'NOASSERTION',
      evidence: '仅 vendor/LICENSE（three.js MIT），不覆盖仓库代码；README 只提 three.js（F-R4）',
      grade: 'L3',
    },
  },
} satisfies PartManifest;

export default manifest;
