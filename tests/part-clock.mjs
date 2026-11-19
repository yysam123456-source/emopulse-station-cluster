// 时钟门 —— 零件**不得持有自己的时钟**（静态扫描，不需要浏览器）。
//
// 规则（2026-11-18 定）：`shared/parts/**` 与 `shared/parts-library/*/core/**` 里
// 不许出现 `performance.now()` / `Date.now()` / `requestAnimationFrame` / `setTimeout(`。
// 时间只能从 `frame.t` / `frame.dt` 取。
//
// 理由是两条**可测**的，不是洁癖：
//   1. **同 seed 同画面**（`contract.ts` 的 WorldFrame.t + `stage-smoke §6`）。`/koi-pond` 的
//      `?s=<seed>` 重现同一片水面全押在这条上。零件持有自己的时钟，同 seed 就得不出一帧。
//   2. **暂停即静止**（`WorldFrame.t` 注释：暂停时不走）。零件自己读 `performance.now()`
//      的话，`stage.stop()` 之后它还在动。
//
// ★ 本文件自带**变异自检**：拿一段故意违规的示例代码喂给同一个扫描器，必须被抓到。
//   没有这一步，这条门有可能扫了个空目录、或者正则写错，然后永远绿。
//
// 用法：node tests/part-clock.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 禁用的时钟 API（正则 + 人话说明）。 */
const BANNED = [
  { pattern: /performance\.now\s*\(/, why: 'performance.now()' },
  { pattern: /Date\.now\s*\(/, why: 'Date.now()' },
  { pattern: /\brequestAnimationFrame\s*\(/, why: 'requestAnimationFrame' },
  { pattern: /\bsetTimeout\s*\(/, why: 'setTimeout(' },
];

/**
 * 豁免清单。
 *
 * 只允许「**与画面无关的遥测**」——即：即使它不准，也不会改变任何一帧的像素。
 * 每条必须写 why；**如果某条豁免一次都没命中，门会报"豁免已失效"**（防止清单腐烂成后门）。
 */
const ALLOW = [
  {
    file: 'shared/parts/voxel-world/index.ts',
    why: ['performance.now()', 'Date.now()'],
    note: 'boot 遥测：记录「创建到首帧完成」的耗时给 bench 用。它不参与任何绘制决策（不驱动动画、不影响 seed 复现），'
      + '而引擎的构造是异步的、拿不到 stage 注入的 now()。**除此外没有第二处豁免。**',
  },
];

const failures = [];
let checks = 0;

/**
 * 记一次断言。
 *
 * @param {boolean} ok 条件
 * @param {string} msg 失败描述
 */
function check(ok, msg) {
  checks += 1;
  if (!ok) failures.push(msg);
}

/**
 * 递归收集 .ts 文件。
 *
 * @param {string} dir 目录
 * @returns {string[]} 文件绝对路径
 */
function collectTs(dir) {
  const out = [];
  if (!statSync(dir, { throwIfNoEntry: false })) return out;
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const info = statSync(full);
    if (info.isDirectory()) out.push(...collectTs(full));
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

/**
 * 扫一段源码里的违规行。
 *
 * 注释行整行跳过 —— 我们在注释里**讨论**这些 API（比如「禁 performance.now()」），
 * 那不是违规。宁可放过行尾注释，也不要让门变成"不能提这个词"。
 *
 * @param {string} source 源码
 * @returns {{ line: number, text: string, why: string }[]} 违规列表
 */
function scan(source) {
  const hits = [];
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
    for (const banned of BANNED) {
      if (banned.pattern.test(raw)) hits.push({ line: i + 1, text: trimmed, why: banned.why });
    }
  }
  return hits;
}

// ── 变异自检：扫描器必须能抓到一段故意违规的代码 ──
const probe = [
  'const t = performance.now();',
  'if (Date.now() > 0) {}',
  'requestAnimationFrame(() => {});',
  'setTimeout(() => {}, 16);',
  '// 注释里提到 performance.now() 不算违规',
].join('\n');
const probeHits = scan(probe);
check(probeHits.length === 4, `扫描器自检失败：故意违规的示例应命中 4 处，实得 ${probeHits.length}（正则或跳过逻辑写错了）`);

// ── 真实扫描 ──
const targets = [
  ...collectTs(path.join(ROOT, 'shared', 'parts')),
];

const libraryRoot = path.join(ROOT, 'shared', 'parts-library');
if (statSync(libraryRoot, { throwIfNoEntry: false })) {
  for (const entry of readdirSync(libraryRoot)) {
    const core = path.join(libraryRoot, entry, 'core');
    if (statSync(core, { throwIfNoEntry: false })) targets.push(...collectTs(core));
  }
}

check(targets.length >= 4, `扫描目标过少（${targets.length} 个 .ts），目录结构可能变了 —— 这条门会变成扫空`);

let totalHits = 0;
/** 每条豁免实际命中的次数（用于检测清单腐烂） */
const allowUsed = new Map();
for (const file of targets) {
  const relative = path.relative(ROOT, file).split(path.sep).join('/');
  const hits = scan(readFileSync(file, 'utf8'));
  const allowance = ALLOW.find((entry) => entry.file === relative);
  for (const hit of hits) {
    if (allowance && allowance.why.includes(hit.why)) {
      const key = `${relative}::${hit.why}`;
      allowUsed.set(key, (allowUsed.get(key) ?? 0) + 1);
      continue;
    }
    totalHits += 1;
    failures.push(`${relative}:${hit.line} 使用了 ${hit.why} —— 零件不许持有自己的时钟（时间只从 frame.t / frame.dt 取）`);
  }
}
checks += 1;

// 豁免必须真的还在用：一条都没命中的豁免 = 清单腐烂（代码改了/删了但豁免留着，等于开了个洞）
for (const entry of ALLOW) {
  for (const why of entry.why) {
    const used = allowUsed.get(`${entry.file}::${why}`) ?? 0;
    check(used > 0, `豁免已失效：${entry.file} 不再使用 ${why}（清单该删了，别留着当后门）`);
  }
}

console.log(`零件时钟门：扫了 ${targets.length} 个 .ts（shared/parts + parts-library/*/core）`);
console.log(`  禁用 API：${BANNED.map((b) => b.why).join(' · ')}`);
console.log(`  扫描器自检：命中 ${probeHits.length}/4（须 4）· 真实违规 ${totalHits} 处`);
for (const [key, count] of allowUsed) {
  const [file, why] = key.split('::');
  console.log(`  豁免（不参与画面）：${file} × ${why} × ${count}`);
}

if (failures.length === 0) {
  console.log(`\npart-clock: PASS ${checks}/${checks}`);
  process.exit(0);
}
console.error(`\npart-clock: FAIL ${failures.length}/${checks}`);
for (const failure of failures) console.error(`  - ${failure}`);
process.exit(1);
