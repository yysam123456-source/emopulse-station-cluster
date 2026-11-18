// 零件声明（L3 · 契约 v1）：ascii-kit —— 唯一 D4 零件：原件 lib/kit.js 纯 ESM、无依赖，
// 装配壳直接 import 并执行原件函数（零改写）。
// 依据：PRD-REUSE §1.4 实测 D4；ARCHITECTURE-REUSE §3.2 规定 origin='copy' 只配 D4。
import type { PartManifest } from '../../contract/parts-registry';

const manifest = {
  id: 'ascii-kit',
  layer: 'scene',
  origin: 'copy',
  entry: 'shared/parts-library/ascii-kit/index.ts',
  source: 'ascii-kit/lib/kit.js',
  contract: 'v1',
  requires: 'none',
  note: '真实复制原件（portal/public_ascii-magic_lib_kit.js，逐字节一致）；原件零改动，可直接 bundle（D4）。',
  provenance: {
    depth: 'D4',
    upstream: {
      repo: 'unknown（原件来自 portal/public_ascii-magic_lib_kit.js，未记录上游仓库 URL）',
      accessed: '2026-11-18',
    },
    files: [
      { path: 'ascii-kit/lib/kit.js', bytes: 10992, completeness: 'complete' },
    ],
    ported: [
      { symbol: 'RAMPS', kind: 'constant', portedTo: 'shared/parts-library/ascii-kit/index.ts:RAMP_TABLE' },
      { symbol: 'ramp', kind: 'function', portedTo: 'shared/parts-library/ascii-kit/index.ts:pipe' },
      { symbol: 'fbm', kind: 'function', portedTo: 'shared/parts-library/ascii-kit/index.ts:pipe' },
    ],
    paramSurface: {
      total: 23,
      enumerated: [
        'RAMPS', 'ramp', 'clamp', 'lerp', 'smooth', 'fract', 'TAU', 'rng', 'noise2', 'fbm',
        'hsl', 'KEYS', 'palette', 'gradient', 'Grid', 'rotX', 'rotY', 'rotZ', 'dot', 'norm',
        'project', 'wire', 'bigText',
      ],
      evidence: 'grep "^export" ascii-kit/lib/kit.js → 23 个顶层导出（常量/函数/类），逐条列出',
    },
    license: {
      spdx: 'NOASSERTION',
      evidence: '仓库副本无 LICENSE 文件；portal 原件亦未附任何许可声明（F-R4）',
      grade: 'L3',
    },
  },
} satisfies PartManifest;

export default manifest;
