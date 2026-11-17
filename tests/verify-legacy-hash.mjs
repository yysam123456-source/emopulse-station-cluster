// GM-1 / INV-3 / NX-A-04：既有 7 站产物必须与 tests/baseline-dist.sha256 逐字节一致。
// 用法：node tests/verify-legacy-hash.mjs
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = path.join(ROOT, 'tests', 'baseline-dist.sha256');

/** 解析 `shasum -a 256` 基线格式：`<hash> *dist/x.html` 或 `<hash>  dist/x.html`。 */
function parseBaseline(text) {
  const entries = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const match = /^([0-9a-f]{64})\s+\*?(.+)$/.exec(line);
    if (!match) throw new Error(`[verify-legacy-hash] 基线格式错误：${line}`);
    entries.push({ hash: match[1], file: match[2] });
  }
  return entries;
}

/** 计算文件 SHA-256。 */
function sha256File(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

const entries = parseBaseline(readFileSync(BASELINE, 'utf8'));
const failures = [];

if (entries.length !== 7) {
  failures.push(`基线条目数应为 7，实际 ${entries.length}`);
}

for (const entry of entries) {
  const target = path.join(ROOT, entry.file);
  if (!existsSync(target)) {
    failures.push(`产物缺失：${entry.file}`);
    continue;
  }
  const actual = sha256File(target);
  const ok = actual === entry.hash;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${entry.file}  ${actual.slice(0, 12)}…`);
  if (!ok) failures.push(`${entry.file} 哈希不符（期望 ${entry.hash.slice(0, 12)}…，实际 ${actual.slice(0, 12)}…）`);
}

if (failures.length > 0) {
  console.error(`[verify-legacy-hash] ❌ ${failures.length} 项失败：`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`[verify-legacy-hash] ✅ PASS：${entries.length}/7 站产物与 tests/baseline-dist.sha256 逐字节一致`);
