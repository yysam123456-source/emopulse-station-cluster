// Frozen Core 哈希基线：校验 shared/core/ 落盘文件是否与 abyssal-garden @ a596354 逐字节一致。
// 用法：node shared/build/verify-core.mjs            校验（构建自动调用）
//      node shared/build/verify-core.mjs --generate 仅初始化基线（架构评审通过后方可执行）
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const coreDir = path.resolve(here, '..', 'core');
const baselineFile = path.join(coreDir, 'BASELINE.sha256');
const BASELINE_NAME = 'BASELINE.sha256';

/** 递归收集 core 下全部文件，返回相对 coreDir 的 POSIX 风格路径（排除基线自身）。 */
function collectFiles(dir, base = '') {
  const found = [];
  for (const name of readdirSync(dir).sort()) {
    const rel = base ? `${base}/${name}` : name;
    if (rel === BASELINE_NAME) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) found.push(...collectFiles(full, rel));
    else found.push(rel);
  }
  return found;
}

/** 计算单个文件的 SHA-256（十六进制）。 */
function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

/** 生成基线：按路径排序写入 `hash␠␠相对路径`。 */
function generate() {
  const lines = collectFiles(coreDir).map((rel) => `${sha256(path.join(coreDir, rel))}  ${rel}`);
  writeFileSync(baselineFile, `${lines.join('\n')}\n`, 'utf8');
  console.log(`[verify-core] 基线已生成：${baselineFile}（${lines.length} 个文件）`);
}

/** 校验基线：文件缺失、哈希不符、新增文件均视为失败。 */
function verify() {
  if (!existsSync(baselineFile)) {
    console.error(`[verify-core] 缺少基线文件：${baselineFile}`);
    process.exit(1);
  }
  const expected = new Map();
  for (const line of readFileSync(baselineFile, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const match = /^([0-9a-f]{64})  (.+)$/.exec(line);
    if (!match) {
      console.error(`[verify-core] 基线格式错误：${line}`);
      process.exit(1);
    }
    expected.set(match[2], match[1]);
  }

  const actualFiles = collectFiles(coreDir);
  const problems = [];
  for (const [rel, hash] of expected) {
    const full = path.join(coreDir, rel);
    if (!existsSync(full)) {
      problems.push(`缺失：${rel}`);
      continue;
    }
    const current = sha256(full);
    if (current !== hash) problems.push(`已改动：${rel}（期望 ${hash}，实际 ${current}）`);
  }
  const expectedNames = new Set(expected.keys());
  for (const rel of actualFiles) if (!expectedNames.has(rel)) problems.push(`新增未登记：${rel}`);

  if (problems.length) {
    console.error(`[verify-core] ❌ Frozen Core 校验失败（${problems.length} 项）：`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`[verify-core] ✅ Frozen Core 校验通过：${expected.size} 个文件逐字节一致`);
}

if (process.argv.includes('--generate')) generate();
else verify();
