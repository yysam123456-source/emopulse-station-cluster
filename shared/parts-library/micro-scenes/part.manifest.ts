// 零件声明（L3 · 契约 v1）：micro-scenes —— 真实复制原件（6 个中文名 HTML 微缩场景）。
// 原件：雨夜便利店 / 木漏时光 / 海风之屿 / 晨雾稻田水车村 / 雨后紫藤溪谷温室 / 北京故宫雪景水晶球。
// 装站口径：⑧ 微缩雪晶球图鉴（T04）以薄包装逐一装入，原件一行不改。
import type { PartManifest } from '../../contract/parts-registry';

const manifest = {
  id: 'micro-scenes',
  layer: 'scene',
  origin: 'copy',
  entry: 'shared/parts-library/micro-scenes/index.ts',
  source: 'micro-scenes/雨夜便利店.html',
  contract: 'v1',
  claims: [{ resource: 'canvas:stage', mode: 'exclusive' }],
  requires: 'none',
  note: '真实复制原件（XinyuWang250428/gpt6-Astra_3.js，6 变体）；仅配置 + 薄包装接入。',
} satisfies PartManifest;

export default manifest;
