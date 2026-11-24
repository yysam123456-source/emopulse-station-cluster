// 零件声明（L3 · 契约 v1）：crimson-loong —— 观感参考（D1）。
// 站点 /license 只用「三阶段时间轴 + 朱砂配色」的观感，原件四层骨骼链算法未进入产物。
// 2026-11-24：完整 18 个 src 脚本已归档 _third_party；库内仍只保留 3 个对照文件。
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
  note: '观感参考：站点取 verifying→stamping→approved 时间轴顺序与朱砂配色；原件算法未进产物（D1）。2026-11-24 完整 18 个 src 脚本已归档 _third_party，库内仍只保留 3 个对照文件。',
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
      // D1：三阶段时间轴是站点自写，原件四层骨骼链算法一字未移植 → 移植面为空（不是「缩水」，
      // 是确实没有可搬的参数面）；MAXROLL 是原件符号，未被接线，不得算进分子。
      scope: [],
      enumerated: [],
      evidence: 'D1 低复用件：ported 为空 → 无可搬运参数面；走 ARCHITECTURE-REUSE §3.3.5 的 D1 登记门，'
        + '不用参数搬运率衡量（量纲错误）',
    },
    license: {
      spdx: 'NOASSERTION',
      evidence: '仅 vendor/LICENSE（three.js MIT），不覆盖仓库代码；README 只提 three.js（F-R4）。无许可证声明，已签字豁免，仅用于个人展示站，不得再分发。',
      grade: 'L3',
    },
  },
} satisfies PartManifest;

export default manifest;
