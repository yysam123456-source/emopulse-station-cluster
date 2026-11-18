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
      total: 3,
      enumerated: ['MAXR', 'NF', 'NSP'],
      evidence: 'glsl.js:6 MAXR / ink.js:11 NF / koi.js:7 NSP，三个顶层导出常量；其余调参在对象字面量内',
    },
    license: {
      spdx: 'NOASSERTION',
      evidence: '仓库无 LICENSE 文件（F-R4），无任何再分发声明',
      grade: 'L3',
    },
  },
} satisfies PartManifest;

export default manifest;
