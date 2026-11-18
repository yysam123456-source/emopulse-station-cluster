// 零件声明（L3 · 契约 v1）：koi —— 观感参考（D1）。
// 三站产物是自写 Canvas 2D（9 条椭圆鱼 + 3 组自选色 + 同心椭圆涟漪），
// 原件 bodyGeometry/frame/koiColour/VARIETIES 等算法均未进入产物（PRD-REUSE §1.4 / F-R6）。
import type { PartManifest } from '../../contract/parts-registry';

const manifest = {
  id: 'koi',
  layer: 'scene',
  origin: 'equivalent',
  entry: 'shared/parts-library/koi/index.ts',
  source: 'koi/main.js',
  contract: 'v1',
  claims: [{ resource: 'canvas:stage', mode: 'exclusive' }],
  requires: 'none',
  note: '观感参考：鱼群与涟漪观感参考 zz85/random-sketches（gh-pages vibes/koi）；三站为自写 Canvas 2D（D1）。',
  provenance: {
    depth: 'D1',
    upstream: {
      repo: 'https://github.com/zz85/random-sketches',
      ref: 'gh-pages（vibes/koi）',
      accessed: '2026-11-18',
    },
    files: [
      { path: 'koi/main.js', bytes: 30364, completeness: 'complete' },
      { path: 'koi/koi.js', bytes: 29545, completeness: 'complete' },
      { path: 'koi/pond.js', bytes: 12903, completeness: 'complete' },
      { path: 'koi/ink.js', bytes: 10762, completeness: 'complete' },
      { path: 'koi/paint.js', bytes: 6508, completeness: 'complete' },
      { path: 'koi/glsl.js', bytes: 7911, completeness: 'complete' },
      { path: 'koi/surface.js', bytes: 18566, completeness: 'complete' },
      { path: 'koi/smoke.js', bytes: 8617, completeness: 'complete' },
      { path: 'koi/audio.js', bytes: 15975, completeness: 'complete' },
      { path: 'koi/cdp.js', bytes: 3288, completeness: 'complete' },
      { path: 'koi/index.html', bytes: 4371, completeness: 'complete' },
      { path: 'koi/README.md', bytes: 8639, completeness: 'complete' },
      { path: 'koi/BLOG.md', bytes: 9273, completeness: 'complete' },
    ],
    ported: [],
    paramSurface: {
      // 移植面预登记为 koi.js：PRD-REUSE 把本件钉死为 D3，T-R03 的九项鱼体算法全部落在该文件
      // （VARIETIES 花色表、bodyGeometry / finGeometry 体形几何、脊线采样）。
      // 现况是 D1 + ported:[]（算法尚未进产物），故 enumerated 必须为空——
      // 把 MAXR/NF/NSP 这类「原件符号」当成「已接线参数」正是 v1.0 的量纲错误。
      scope: [
        {
          path: 'koi/koi.js',
          reason: '鱼体几何 / 花色表 / 脊线采样三项 2D 算法的唯一载体，2D 移植面全部落在此文件',
        },
      ],
      enumerated: [],
      evidence: '当前 D1 + ported:[]，未接线任何原件参数（T-R03 升 D3 后逐条填入并过死参数探针）；'
        + '分母 P_scope 由 param-pool 从 koi/koi.js 机械抽取，不由本文件声明',
    },
    license: {
      spdx: 'NOASSERTION',
      evidence: '仓库无 LICENSE 文件（F-R4），无任何再分发声明。无许可证声明，已签字豁免，仅用于个人展示站，不得再分发。',
      grade: 'L3',
    },
  },
} satisfies PartManifest;

export default manifest;
