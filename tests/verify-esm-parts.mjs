// R3：ESM 零件经通道 B2（buildSync bundle→IIFE）可解析，产物无 import/export 残留、零外链。
// 样本：shared/parts-library/ascii-kit/lib/kit.js（纯 ESM、无第三方依赖、10,772 B，原件逐字节复制）。
// 用法：node tests/verify-esm-parts.mjs
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { bundleIife, REPO_ROOT } from './lib/load-ts.mjs';

let checks = 0;
const failures = [];
function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

const KIT = path.join(REPO_ROOT, 'shared', 'parts-library', 'ascii-kit', 'lib', 'kit.js');
const REFERENCE = path.join(REPO_ROOT, '.reference', 'portal', 'public_ascii-magic_lib_kit.js');
const HARD_LIMIT = 163840;

// ─── 1. 原件必须已入库且（若参考副本存在）逐字节一致 ──────────────────────────
check(existsSync(KIT), `ESM 零件样本缺失：${KIT}`);
const kitBytes = statSync(KIT).size;
check(kitBytes > 0 && kitBytes < HARD_LIMIT, `kit.js 体积异常：${kitBytes} B`);
if (existsSync(REFERENCE)) {
  const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
  check(sha(KIT) === sha(REFERENCE), 'shared/parts-library/ascii-kit/lib/kit.js 必须与参考原件逐字节一致（原件零改动）');
  console.log('[verify-esm-parts] kit.js 与 .reference 原件逐字节一致');
} else {
  console.log('[verify-esm-parts] 提示：.reference/ 不在版本库（gitignore），跳过与参考原件的逐字节比对');
}

// ─── 2. 走通道 B2：ESM import → bundle → IIFE ────────────────────────────────
const bundle = bundleIife({
  globalName: 'AsciiKit',
  minify: true,
  contents: `
    import { fbm, noise2, ramp, palette, bigText } from '${KIT}';
    export const __KIT__ = { fbm, noise2, ramp, palette, bigText };
  `,
});

// ─── 3. 产物不得残留 import / export 语句，且零外链 ──────────────────────────
const RESIDUAL = [
  { name: 'import 声明', re: /(^|[;\n])\s*import\s+[\w*{]/ },
  { name: 'import 动态/副作用', re: /\bimport\s*\(/ },
  { name: 'export 声明', re: /(^|[;\n])\s*export\s+[\w*{]/ },
  { name: 'from "..." 语句', re: /(^|[;\n])\s*from\s*['"]/ },
];
for (const rule of RESIDUAL) {
  const hit = rule.re.exec(bundle);
  check(!hit, `IIFE 产物残留 ${rule.name}：…${hit ? bundle.slice(Math.max(0, hit.index - 40), hit.index + 60) : ''}…`);
}
const external = /https?:\/\//i.exec(bundle);
check(!external, `IIFE 产物含外部 URL：${external?.[0]}`);
check(bundle.length > 0 && bundle.length < HARD_LIMIT, `IIFE 产物体积异常：${bundle.length} B`);

// ─── 4. 运行时可用性：在沙箱里实际调用导出函数 ────────────────────────────────
const context = vm.createContext({ console: { log() {}, warn() {}, error() {} } });
vm.runInContext(bundle, context, { filename: 'ascii-kit-bundle.js' });
const kit = context.AsciiKit?.__KIT__;
check(Boolean(kit), 'IIFE 产物应暴露 AsciiKit.__KIT__');
for (const name of ['fbm', 'noise2', 'ramp', 'palette', 'bigText']) {
  check(typeof kit?.[name] === 'function', `导出 ${name} 应为函数，实际 ${typeof kit?.[name]}`);
}
const fbmValue = kit?.fbm?.(0.5, 0.5);
check(typeof fbmValue === 'number' && Number.isFinite(fbmValue), `fbm(0.5,0.5) 应返回有限数字，实际 ${fbmValue}`);
const rampValue = kit?.ramp?.(0.5);
check(typeof rampValue === 'string' && rampValue.length > 0, `ramp(0.5) 应返回非空字符串，实际 ${JSON.stringify(rampValue)}`);

// ─── 汇总 ────────────────────────────────────────────────────────────────────
if (failures.length > 0) {
  console.error(`[verify-esm-parts] ❌ ${failures.length}/${checks} 项断言失败：`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`[verify-esm-parts] ✅ PASS：${checks} 项断言（kit.js ${kitBytes} B 原件 → IIFE ${bundle.length} B，无 import/export 残留、零外链，fbm/ramp 实调用通过）`);
