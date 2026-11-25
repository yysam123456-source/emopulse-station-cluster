// 变异探针：证明 stage-smoke 的断言真能抓住这些回归。
// 每条变异只改一处，跑一次测试，然后还原源码（从内存回写，不依赖备份文件）。
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = path.join(ROOT, 'shared', 'stage');
// 变异只改**副本**：真实源码在施工/CI 并行时不能被这个探针原地改 6 次。
const TEMP_DIR = mkdtempSync(path.join(os.tmpdir(), 'emopulse-stage-mutation-'));
const STAGE_DIR = path.join(TEMP_DIR, 'stage');
cpSync(SOURCE_DIR, STAGE_DIR, { recursive: true });
const TARGET = path.join(STAGE_DIR, 'stage.ts');
const INDEX = path.join(STAGE_DIR, 'index.ts');
const TEST = path.join(ROOT, 'tests', 'stage-smoke.mjs');
const original = readFileSync(TARGET, 'utf8');

const mutations = [
  {
    name: 'M1 层内不按 z 排序',
    from: '    const zDiff = (a.z ?? 0) - (b.z ?? 0);\n    if (zDiff !== 0) return zDiff;\n',
    to: '    const zDiff = 0;\n',
    expect: '层序错误',
  },
  {
    // T18 之后 renderFrame 改成单循环，原来那句 `if (m.channel !== 'canvas2d') continue;` 不存在了。
    // 新锚点选 canvas2d 分支里**独有**的两行（GL 分支缩进更深，不会撞）：
    name: 'M2 超预算时跳过 draw',
    from: '        instance.draw(f);\n        ctx.restore();',
    to: "        if (m.lod !== 'low') instance.draw(f);\n        ctx.restore();",
    expect: '缺块',
  },
  {
    name: 'M3 dispose 改正序',
    from: 'for (let i = mounted.length - 1; i >= 0; i -= 1)',
    to: 'for (let i = 0; i < mounted.length; i += 1)',
    expect: '逆序',
  },
  {
    name: 'M4 不设 globalCompositeOperation',
    from: '        ctx.globalCompositeOperation = m.blend as GlobalCompositeOperation;',
    to: "        ctx.globalCompositeOperation = 'source-over';",
    expect: 'blend',
  },
  {
    name: 'M5 构造期缺能力也照样 create',
    from: '    const missing = requires ? requires.filter((cap) => !caps.has(cap)) : [];',
    to: '    const missing: string[] = [];',
    expect: '不该被 create',
  },
  {
    name: 'M6 抛错的零件不隔离（下一帧继续调）',
    from: '        m.broken = true;\n        degraded.push({\n          id: m.def.id,\n          layer: m.def.layer,\n          reason: \'suspended\',\n          detail: `运行期抛错已隔离',
    to: '        m.broken = false;\n        degraded.push({\n          id: m.def.id,\n          layer: m.def.layer,\n          reason: \'suspended\',\n          detail: `运行期抛错已隔离',
    expect: '只该被尝试 1 次',
  },
];

const results = [];
for (const mutation of mutations) {
  if (!original.includes(mutation.from)) {
    results.push({ name: mutation.name, ok: false, note: '变异锚点未命中（源码已变，探针失效）', snippet: '' });
    continue;
  }
  writeFileSync(TARGET, original.replace(mutation.from, mutation.to));
  let output = '';
  let failed = false;
  try {
    output = execFileSync(process.execPath, [TEST], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, STAGE_INDEX: INDEX },
    });
  } catch (error) {
    failed = true;
    output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
  } finally {
    writeFileSync(TARGET, original);
  }
  const caught = failed && output.includes(mutation.expect);
  results.push({
    name: mutation.name,
    ok: caught,
    note: failed ? (caught ? '被抓住' : '测试红了但不是这条断言抓的') : '没被抓住（断言漏了）',
    snippet: caught ? '' : output.slice(0, 400),
  });
}

rmSync(TEMP_DIR, { recursive: true, force: true });
let allCaught = true;
for (const r of results) {
  if (!r.ok) allCaught = false;
  console.log(`${r.ok ? 'CAUGHT' : 'MISSED'}  ${r.name} — ${r.note}`);
  if (!r.ok && r.snippet) console.log(`    ${r.snippet.split('\n').join('\n    ')}`);
}
console.log(allCaught ? 'mutation-probe: PASS' : 'mutation-probe: FAIL');
process.exit(allCaught ? 0 : 1);
