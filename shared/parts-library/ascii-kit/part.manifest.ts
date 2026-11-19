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
      { path: 'ascii-kit/lib/kit.js', bytes: 10772, completeness: 'complete' },
    ],
    ported: [
      { symbol: 'RAMPS', kind: 'constant', portedTo: 'shared/parts-library/ascii-kit/index.ts:RAMP_TABLE' },
      { symbol: 'ramp', kind: 'function', portedTo: 'shared/parts-library/ascii-kit/index.ts:pipe' },
      { symbol: 'fbm', kind: 'function', portedTo: 'shared/parts-library/ascii-kit/index.ts:pipe' },
    ],
    paramSurface: {
      // D4：整文件逐字节复制进产物，参数原样在场，无需「接线」——
      // 分母由 tests/lib/param-pool.mjs 从本路径机械抽取（v1.0 报的 23 是导出符号数，量纲错误）。
      scope: [
        {
          path: 'ascii-kit/lib/kit.js',
          reason: 'D4 逐字节复制的全部原件内容，其顶层可调参数原样进入产物，属完整复制面',
        },
      ],
      // 空 = 一个参数都没有「我方接线」这个动作（原件函数以默认参数直接执行）
      enumerated: [],
      evidence: 'D4 走 sha256 + B2 可 bundle 门（ARCHITECTURE-REUSE §3.3.5），不做参数搬运率；'
        + 'enumerated 为空表示没有任何参数被改写，ported 的 3 个符号均无 params',
    },
    license: {
      spdx: 'NOASSERTION',
      evidence: '仓库副本无 LICENSE 文件；portal 原件亦未附任何许可声明（F-R4）。无许可证声明，已签字豁免，仅用于个人展示站，不得再分发。',
      grade: 'L3',
    },
  },
} satisfies PartManifest;

export default manifest;
