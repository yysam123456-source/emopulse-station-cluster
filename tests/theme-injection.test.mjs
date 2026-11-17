// QA 独立验证：
//  (A) inject-theme.mjs 纯函数负向测试（锚点唯一性 / 参数校验 / TANH-NEAR 邻居保护）
//  (B) 7 站产物配色注入正确性（config 五字段 vs 产物注入值逐一比对，含 minify 形态）
// 运行：node tests/theme-injection.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import { injectTheme } from '../shared/build/inject-theme.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

let pass = 0;
const failures = [];
function test(name, fn) {
  try { fn(); pass += 1; console.log(`  PASS  ${name}`); }
  catch (err) { const m = err.message ?? String(err); failures.push(`${name}: ${m}`); console.log(`  FAIL  ${name} -> ${m}`); }
}

// ---------------------------------------------------------------- (A) 纯函数负向/边界
console.log('\n[A] inject-theme 纯函数单元（含负向路径）');
const ANCHOR_SRC = [
  'const WCOL = vec3f(.16, .58, .90);',
  'const PCOL = vec3f(.58, .66, .98);',
  'const SUNC = vec3f(1.7, 1.6, 1.45);',
  'const TANH = 0.6, NEAR = 0.1, EXPO = 0.62, RAYS = 0.54;',
].join('\n');
const THEME = { WCOL: [0.36, 0.34, 0.31], PCOL: [0.82, 0.76, 0.66], SUNC: [1.35, 1.18, 0.98], EXPO: 0.58, RAYS: 0.42 };

test('正向：5 锚点精确注入且 TANH/NEAR 原值不动', () => {
  const out = injectTheme(ANCHOR_SRC, THEME);
  assert.match(out, /const WCOL = vec3f\(0\.36, 0\.34, 0\.31\)/);
  assert.match(out, /const PCOL = vec3f\(0\.82, 0\.76, 0\.66\)/);
  assert.match(out, /const SUNC = vec3f\(1\.35, 1\.18, 0\.98\)/);
  assert.match(out, /\bTANH = 0\.6\b/);
  assert.match(out, /\bNEAR = 0\.1\b/);
  assert.match(out, /\bEXPO = 0\.58\b/);
  assert.match(out, /\bRAYS = 0\.42\b/);
});

test('负向：WCOL 锚点重复（制造 2 次匹配）→ 构建失败', () => {
  const dup = ANCHOR_SRC.replace('const PCOL', 'const WCOL = vec3f(.1,.2,.3);\nconst PCOL');
  assert.throws(() => injectTheme(dup, THEME), /WCOL.*2 次|锚点 WCOL 匹配 2 次/);
});

test('负向：EXPO 锚点缺失 → 构建失败', () => {
  const missing = ANCHOR_SRC.replace('EXPO = 0.62, ', '');
  assert.throws(() => injectTheme(missing, THEME), /EXPO.*0 次|锚点 EXPO 匹配 0 次/);
});

test('负向：theme.vec3 字段长度非 3 → 抛错', () => {
  assert.throws(() => injectTheme(ANCHOR_SRC, { ...THEME, WCOL: [0.1, 0.2] }), /长度.*3/);
});

test('负向：theme 浮点非有限数（NaN/Infinity）→ 抛错', () => {
  assert.throws(() => injectTheme(ANCHOR_SRC, { ...THEME, EXPO: NaN }), /有限数字/);
  assert.throws(() => injectTheme(ANCHOR_SRC, { ...THEME, SUNC: [1, Infinity, 1] }), /有限数字/);
});

test('负向：js 空串 / 缺 theme → 抛错', () => {
  assert.throws(() => injectTheme('', THEME), /js 不能为空/);
  assert.throws(() => injectTheme(ANCHOR_SRC, null), /缺少 theme/);
});

test('负向：TANH 被外部改成非 0.6 → 注入后二次校验失败', () => {
  const bad = ANCHOR_SRC.replace('TANH = 0.6', 'TANH = 0.7');
  assert.throws(() => injectTheme(bad, THEME), /TANH\/NEAR 被意外改动/);
});

// ---------------------------------------------------------------- (B) 7 站产物注入正确性
console.log('\n[B] 7 站产物配色注入逐一比对');
const SITE_DIRS = {
  still: 'sites/still', license: 'sites/license', praise: 'sites/praise', hug: 'sites/hug',
  'koi-pond': 'sites/koi/pond', 'koi-ink': 'sites/koi/ink', 'koi-watercolor': 'sites/koi/watercolor',
};

/** 用 esbuild 把站点 TS 配置转成 ESM data URL 导入（与 build.mjs 同法，避免 tsx 依赖）。 */
async function loadConfig(dir) {
  const built = buildSync({
    entryPoints: [path.join(root, dir, 'site.config.ts')],
    bundle: true, platform: 'node', format: 'esm', target: 'node18', write: false, logLevel: 'silent',
  });
  const mod = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
  return mod.default;
}
/** 生成数字的两种形态：0.58 → ['0.58','.58']；1.35 → ['1.35']。 */
const variants = (v) => { const s = String(v); return s.startsWith('0.') ? [s, s.slice(1)] : [s]; };
const someIn = (html, vals) => vals.some((v) => html.includes(v));

const capturedWCOL = {};

// 采用顶层 await 顺序执行（配置导入是异步）
for (const [id, dir] of Object.entries(SITE_DIRS)) {
  try {
    const cfg = await loadConfig(dir);
    const html = readFileSync(path.join(root, 'dist', `${id}.html`), 'utf8');
    const t = cfg.theme;
    const problems = [];
    // vec3f 注入常量（注入保留 0. 前缀形态）
    for (const key of ['WCOL', 'PCOL', 'SUNC']) {
      const full = `vec3f(${t[key].join(',')})`;
      if (!html.includes(full)) problems.push(`缺注入常量 ${key}=${full}`);
    }
    // 内嵌 config theme 对象（minify 后 0.x → .x）
    const compact = (arr) => arr.map((v) => String(v).replace(/^0\./, '.')).join(',');
    const cfgExpect = `WCOL:[${compact(t.WCOL)}],PCOL:[${compact(t.PCOL)}],SUNC:[${compact(t.SUNC)}],EXPO:${String(t.EXPO).replace(/^0\./, '.')},RAYS:${String(t.RAYS).replace(/^0\./, '.')}`;
    if (!html.includes(cfgExpect)) problems.push(`内嵌 theme 对象不符：期望片段 ${cfgExpect}`);
    // EXPO/RAYS 数值存在（两种形态之一）
    if (!someIn(html, variants(t.EXPO))) problems.push(`缺 EXPO=${t.EXPO}`);
    if (!someIn(html, variants(t.RAYS))) problems.push(`缺 RAYS=${t.RAYS}`);
    // TANH/NEAR 未被注入误伤：minify 后为 .6 / .1
    if (!/\.6,/.test(html) || !/=\.1\b/.test(html)) problems.push('TANH(.6)/NEAR(.1) 原值痕迹缺失');
    if (problems.length) { failures.push(`${id} 注入: ${problems.join('; ')}`); console.log(`  FAIL  ${id} 注入 -> ${problems.join('; ')}`); }
    else { pass += 1; console.log(`  PASS  ${id}: WCOL=[${t.WCOL}] PCOL=[${t.PCOL}] SUNC=[${t.SUNC}] EXPO=${t.EXPO} RAYS=${t.RAYS}`); }
    capturedWCOL[id] = compact(t.WCOL);
  } catch (err) {
    failures.push(`${id} 注入异常: ${err.message}`);
    console.log(`  FAIL  ${id} 注入异常 -> ${err.message}`);
  }
}

test('站点差异化：still / praise / hug 的 WCOL 注入值互不相同', () => {
  assert.notEqual(capturedWCOL.still, capturedWCOL.praise);
  assert.notEqual(capturedWCOL.praise, capturedWCOL.hug);
  assert.notEqual(capturedWCOL.still, capturedWCOL.hug);
});

console.log(`\n[结果] PASS=${pass} FAIL=${failures.length}`);
if (failures.length) { console.log('失败明细：'); for (const f of failures) console.log(`  - ${f}`); process.exit(1); }
