// INV-1 / GM-2：构建过程不得向 shared/core/ 写入任何字节。
// 手法：构建前后各算一次 core 目录全文件哈希清单，逐项比对（比 mtime 更严格）。
// 用法：node tests/verify-no-core-write.mjs
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CORE_DIR = path.join(ROOT, 'shared', 'core');

/** 递归收集 core 下全部文件（相对路径升序）。 */
function collect(dir, base = '') {
  const out = [];
  for (const name of readdirSync(dir).slice().sort()) {
    const rel = base ? `${base}/${name}` : name;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...collect(full, rel));
    else out.push(rel);
  }
  return out;
}

/** 生成「相对路径 → sha256」的不可变快照。 */
function snapshot() {
  const map = new Map();
  for (const rel of collect(CORE_DIR)) {
    const hash = createHash('sha256').update(readFileSync(path.join(CORE_DIR, rel))).digest('hex');
    map.set(rel, hash);
  }
  return map;
}

/** 比对两个快照，返回差异描述数组。 */
function diff(before, after) {
  const problems = [];
  for (const [rel, hash] of before) {
    if (!after.has(rel)) problems.push(`构建后文件消失：${rel}`);
    else if (after.get(rel) !== hash) problems.push(`构建过程写入：${rel}（${hash.slice(0, 12)}… → ${after.get(rel).slice(0, 12)}…）`);
  }
  for (const rel of after.keys()) if (!before.has(rel)) problems.push(`构建过程新增：${rel}`);
  return problems;
}

const before = snapshot();
console.log(`[verify-no-core-write] 构建前 core 快照：${before.size} 个文件`);

const build = spawnSync(process.execPath, [path.join(ROOT, 'shared', 'build', 'build.mjs'), 'still'], {
  cwd: ROOT,
  encoding: 'utf8',
});
if (build.status !== 0) {
  console.error('[verify-no-core-write] ❌ 构建失败，无法完成写入检查');
  console.error(build.stdout ?? '');
  console.error(build.stderr ?? '');
  process.exit(1);
}

const after = snapshot();
const problems = diff(before, after);

// 附加断言：Frozen Core 校验本身必须 11/11 OK。
const verify = spawnSync(process.execPath, [path.join(ROOT, 'shared', 'build', 'verify-core.mjs')], {
  cwd: ROOT,
  encoding: 'utf8',
});
if (verify.status !== 0) problems.push(`Frozen Core 校验失败：${(verify.stdout ?? '') + (verify.stderr ?? '')}`);

if (problems.length > 0) {
  console.error(`[verify-no-core-write] ❌ ${problems.length} 项失败：`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(`[verify-no-core-write] ✅ PASS：构建前后 shared/core 逐字节一致（${after.size} 个文件，零写入），Frozen Core 11/11 OK`);
