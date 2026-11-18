// 零件声明（L3 · 契约 v1）：micro-scenes —— D0（原件在库，一字未用）。
// 原件是 6 个独立 HTML 文档（内联 canvas 场景），本批次未装站（PRD-REUSE §1.4 实测 D0）。
// 装配壳按约定恒抛 E_PART_NOT_MOUNTED。
import type { PartManifest } from '../../contract/parts-registry';

const manifest = {
  id: 'micro-scenes',
  layer: 'scene',
  origin: 'equivalent',
  entry: 'shared/parts-library/micro-scenes/index.ts',
  source: 'micro-scenes/雨夜便利店.html',
  contract: 'v1',
  claims: [{ resource: 'canvas:stage', mode: 'exclusive' }],
  requires: 'none',
  note: '原件（XinyuWang250428/gpt6-Astra_3.js，6 个 HTML）仅入库对照；本批次未装站，一字未用（D0）。',
  provenance: {
    depth: 'D0',
    upstream: {
      repo: 'https://github.com/XinyuWang250428/gpt6-Astra_3.js',
      accessed: '2026-11-18',
    },
    files: [
      { path: 'micro-scenes/雨夜便利店.html', bytes: 1377925, completeness: 'complete' },
      { path: 'micro-scenes/木漏时光.html', bytes: 1431645, completeness: 'complete' },
      { path: 'micro-scenes/海风之屿.html', bytes: 1372235, completeness: 'complete' },
      { path: 'micro-scenes/晨雾稻田水车村.html', bytes: 1414877, completeness: 'complete' },
      { path: 'micro-scenes/雨后紫藤溪谷温室.html', bytes: 1414202, completeness: 'complete' },
      { path: 'micro-scenes/北京故宫雪景水晶球.html', bytes: 1495936, completeness: 'complete' },
    ],
    ported: [],
    paramSurface: {
      total: 0,
      enumerated: [],
      evidence: '6 个 HTML 文档均为内联脚本，无模块导出，无可枚举的顶层参数（分母记 0）',
    },
    license: {
      spdx: 'NOASSERTION',
      evidence: '仓库无 LICENSE 文件，无任何再分发声明（F-R4）',
      grade: 'L3',
    },
  },
} satisfies PartManifest;

export default manifest;
