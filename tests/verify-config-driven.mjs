// NX-A-03 / INV-8 / E3：配置驱动 —— 只改 site.config.ts 重建，产物必须随之变化，且没有任何 glue 源码可改。
// 手法：临时探针站点（nexus 形态：只有 site.manifest.ts / site.config.ts / bridge.ts / override/template.html）
//   ① 用主题 A 构建 → 记录产物哈希；
//   ② 断言站点目录内**不存在 glue.ts**（新站不写 glue，靠 GenericApp）；
//   ③ 只改 site.config.ts 的 theme 五值 → 重建 → 产物哈希必须变化；
//   ④ 除 site.config.ts 外，站点目录内其他文件哈希逐一不变（证明差异纯粹来自配置）；
//   ⑤ 清理。
// 用法：node tests/verify-config-driven.mjs
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProbeSite, removeProbeSite } from './lib/probe-site.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROBE_ID = 'zzz-config-probe';
const PROBE_DIR_NAME = PROBE_ID;
const PROBE_DIR = path.join(ROOT, 'sites', PROBE_DIR_NAME);
const PROBE_OUT = path.join(ROOT, 'dist', `${PROBE_ID}.html`);

let checks = 0;
const failures = [];
function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

const THEME_A = { WCOL: [0.13, 0.21, 0.34], PCOL: [0.41, 0.5, 0.62], SUNC: [1.02, 0.97, 0.91], EXPO: 0.51, RAYS: 0.37 };
const THEME_B = { WCOL: [0.62, 0.31, 0.18], PCOL: [0.83, 0.72, 0.58], SUNC: [1.44, 1.29, 1.06], EXPO: 0.68, RAYS: 0.59 };

/** 递归列出目录内文件（相对路径 → sha256），用于证明「只有 site.config.ts 变了」。 */
function snapshotDir(dir, base = '') {
  const map = new Map();
  for (const name of readdirSync(dir).slice().sort()) {
    const rel = base ? `${base}/${name}` : name;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      for (const [key, value] of snapshotDir(full, rel)) map.set(key, value);
      continue;
    }
    map.set(rel, createHash('sha256').update(readFileSync(full)).digest('hex'));
  }
  return map;
}

/** 用当前 site.config.ts 构建探针站，返回产物 sha256。 */
function buildOnce(label) {
  const result = spawnSync(process.execPath, [path.join(ROOT, 'shared', 'build', 'build.mjs'), PROBE_ID], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  check(result.status === 0, `${label} 构建应成功，实际 exit=${result.status}\n${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  if (!existsSync(PROBE_OUT)) {
    failures.push(`${label} 未产出 dist/${PROBE_ID}.html`);
    return null;
  }
  return {
    hash: createHash('sha256').update(readFileSync(PROBE_OUT)).digest('hex'),
    bytes: statSync(PROBE_OUT).size,
  };
}

let created = false;
try {
  createProbeSite({ dirName: PROBE_DIR_NAME, id: PROBE_ID, theme: THEME_A });
  created = true;

  // ① 新站形态断言：不存在 glue.ts（INV-8 / E3）
  check(!existsSync(path.join(PROBE_DIR, 'glue.ts')), 'nexus 新站目录不得存在 glue.ts（统一走 GenericApp）');
  check(existsSync(path.join(PROBE_DIR, 'site.manifest.ts')), '新站应有 site.manifest.ts');
  check(existsSync(path.join(PROBE_DIR, 'site.config.ts')), '新站应有 site.config.ts');
  check(existsSync(path.join(PROBE_DIR, 'bridge.ts')), '新站应有 bridge.ts');

  const before = snapshotDir(PROBE_DIR);
  const first = buildOnce('主题 A');
  const afterFirstBuild = snapshotDir(PROBE_DIR);
  check(JSON.stringify([...before]) === JSON.stringify([...afterFirstBuild]), '构建过程不得改写站点目录内任何文件');

  // ③ 只改配置（theme）→ 产物必须变化
  const configPath = path.join(PROBE_DIR, 'site.config.ts');
  const original = readFileSync(configPath, 'utf8');
  const patched = original
    .replace(`WCOL: [${THEME_A.WCOL.join(', ')}]`, `WCOL: [${THEME_B.WCOL.join(', ')}]`)
    .replace(`PCOL: [${THEME_A.PCOL.join(', ')}]`, `PCOL: [${THEME_B.PCOL.join(', ')}]`)
    .replace(`SUNC: [${THEME_A.SUNC.join(', ')}]`, `SUNC: [${THEME_B.SUNC.join(', ')}]`)
    .replace(`EXPO: ${THEME_A.EXPO}`, `EXPO: ${THEME_B.EXPO}`)
    .replace(`RAYS: ${THEME_A.RAYS}`, `RAYS: ${THEME_B.RAYS}`);
  check(patched !== original, '配置补丁应至少改写一个 theme 字段（若未改写则测试无效）');
  writeFileSync(configPath, patched, 'utf8');

  const second = buildOnce('主题 B');

  if (first && second) {
    check(first.hash !== second.hash,
      `只改配置重建后产物哈希必须变化（A=${first.hash.slice(0, 12)}…，B=${second.hash.slice(0, 12)}…）`);
    check(first.bytes !== second.bytes,
      `只改配置重建后体积应变化（A=${first.bytes} B，B=${second.bytes} B）`);
    console.log(`[verify-config-driven] 主题 A → ${first.bytes} B / ${first.hash.slice(0, 12)}…；主题 B → ${second.bytes} B / ${second.hash.slice(0, 12)}…`);
  }

  // ④ 除 site.config.ts 外，其他文件哈希逐一不变
  const afterSecondBuild = snapshotDir(PROBE_DIR);
  const changedFiles = [...afterSecondBuild.entries()]
    .filter(([rel, hash]) => before.get(rel) !== hash)
    .map(([rel]) => rel)
    .concat([...before.keys()].filter((rel) => !afterSecondBuild.has(rel)));
  check(JSON.stringify(changedFiles) === JSON.stringify(['site.config.ts']),
    `构建差异应只来自 site.config.ts，实际变化文件：${JSON.stringify(changedFiles)}`);

  // 产物内确实含新主题值（L2 注入口径）；只断一个足够区分的高精度值
  const html = readFileSync(PROBE_OUT, 'utf8');
  check(html.includes(String(THEME_B.EXPO)) || html.includes(String(THEME_B.EXPO).replace(/^0/, '')),
    `产物应包含新主题 EXPO=${THEME_B.EXPO} 的注入值`);
} finally {
  if (created) removeProbeSite({ dirName: PROBE_DIR_NAME, out: `${PROBE_ID}.html` });
}

check(!existsSync(PROBE_DIR), '临时探针目录必须已被清理');
check(!existsSync(PROBE_OUT), '临时探针产物必须已被清理');

if (failures.length > 0) {
  console.error(`[verify-config-driven] ❌ ${failures.length}/${checks} 项断言失败：`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`[verify-config-driven] ✅ PASS：${checks} 项断言（无 glue.ts / 只改配置产物即变化 / 其余文件零改动 / 已清理）`);
