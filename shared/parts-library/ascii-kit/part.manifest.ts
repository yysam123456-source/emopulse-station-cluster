// 零件声明（L3 · 契约 v1）：ascii-kit —— 真实复制原件（纯 ESM、无依赖、10,772 B）。
// 原件：lib/kit.js（导出 RAMPS / ramp / fbm / noise2 / palette / project / bigText 等 20+ 符号）。
// 这是 R3「可原件复用」通道 B2 的验证样本：站点 bridge 依赖树 import 后由
// compileBridge 的 buildSync({bundle:true, format:'iife'}) 直接解析并 IIFE 化，
// 产物无 import/export 残留、零外链（tests/verify-esm-parts.mjs 断言）。
import type { PartManifest } from '../../contract/parts-registry';

const manifest = {
  id: 'ascii-kit',
  layer: 'scene',
  origin: 'copy',
  entry: 'shared/parts-library/ascii-kit/index.ts',
  source: 'ascii-kit/lib/kit.js',
  contract: 'v1',
  requires: 'none',
  note: '真实复制原件（portal/public_ascii-magic_lib_kit.js，逐字节一致）；原件零改动，可直接 bundle。',
} satisfies PartManifest;

export default manifest;
