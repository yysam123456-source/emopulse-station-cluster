#!/usr/bin/env node
// 结构事实表生成器 —— 只读代码里的四张登记表，写出 `docs/STATUS.md`。
//
// 为什么要有这个脚本：零件数、预设数、谁用了谁这类数字散落在文档里就会过期。
// 以后结构性的数字只在本脚本的产物 `docs/STATUS.md` 里维护，其它文档链接过去，不重抄。
//
// 口径（每条都能用一条命令复算）：
//   · 零件：`shared/stage/preview/build.mjs` 导出的 PART_ENTRY（id → 入口文件）；
//           层 / 通道 / costMs / kb 取自 `loadPartDefs()` 真实 import 到的零件声明（缺省参数，不走工厂 opts）。
//   · 预设：同文件的 PRESETS；站：`shared/sites/build.mjs` 导出的 STATIONS；模板：`shared/product/templates.mjs` 导出的 TEMPLATES。
//   · 源码行：零件入口所在目录下全部 .ts / .js（不含 .mjs，即不计 bench 与生成脚本）的换行符个数，等于 `wc -l`。
//   · 孤儿：不出现在任何 STATIONS / PRESETS / TEMPLATES 的 parts 里。
//   · README / bench：目录下是否存在 README.md / bench.mjs。
//
// 只放结构事实。健康度（帧率、加载时间、阻断数）不在这里，见 `docs/review-2026-11-24/REVIEW-2026-11-24.md`。
//
// 用法：node tools/docs/status.mjs   （或 npm run docs:status）
// 零依赖：只 import 仓库自己的构建脚本（它们已依赖 devDependencies 里的 esbuild）。不写 dist/。
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { PART_ENTRY, PRESETS, loadPartDefs } = await import('../../shared/stage/preview/build.mjs');
const { STATIONS } = await import('../../shared/sites/build.mjs');
const { TEMPLATES } = await import('../../shared/product/templates.mjs');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const OUT = path.join(REPO_ROOT, 'docs', 'STATUS.md');
const PKG = JSON.parse(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));

const partId = (entry) => (typeof entry === 'string' ? entry : entry.id);
const toPosix = (p) => p.split(path.sep).join('/');
const esc = (v) => String(v).replace(/\|/g, '\\|');
const sorted = (obj) => Object.keys(obj).sort();

/** 目录下全部 .ts / .js（不含 .mjs）的换行符个数之和。 */
function sourceLines(dir) {
  let total = 0;
  const walk = (d) => {
    for (const ent of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) { walk(p); continue; }
      if (!/\.(ts|js)$/.test(ent.name)) continue;
      const text = readFileSync(p, 'utf8');
      total += text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
    }
  };
  if (existsSync(dir)) walk(dir);
  return total;
}

// ── 真实 import 全部零件，拿声明 ──
const { defs } = await loadPartDefs(Object.keys(PART_ENTRY));
const defById = new Map(defs.map((d) => [d.id, d]));

// ── 使用方反查 ──
const users = { station: new Map(), preset: new Map(), template: new Map() };
const add = (map, id, name) => map.set(id, [...(map.get(id) ?? []), name]);
for (const slug of sorted(STATIONS)) for (const p of STATIONS[slug].parts) add(users.station, partId(p), `/${slug}`);
for (const name of sorted(PRESETS)) for (const p of PRESETS[name].parts) add(users.preset, partId(p), name);
for (const t of TEMPLATES) for (const p of t.parts) add(users.template, partId(p), t.id);

// ── npm script 反查 ──
const SCRIPTS = PKG.scripts ?? {};
const scriptNames = (pred) => Object.keys(SCRIPTS).filter((k) => pred(SCRIPTS[k])).sort();
const presetScripts = (name) => scriptNames((v) => new RegExp(`--preset(?:=|\\s+)${name}(\\s|$)`).test(v));
const V1_BUILDER = 'shared/build/build.mjs';
/** 只认 import 语句：脚本正文里提到 browser.mjs 不算依赖。 */
const IMPORTS_BROWSER = /^\s*(?:import\b|await import\s*\()[^\n]*lib\/browser\.mjs/m;
const v1Scripts = scriptNames((v) => v.includes(V1_BUILDER));
const browserScripts = scriptNames((v) => {
  if (/tests[\\/]lib[\\/]browser\.mjs/.test(v)) return true;
  return v.split('&&').some((cmd) => {
    const m = cmd.trim().match(/^node\s+(\S+)/);
    if (!m) return false;
    const file = path.join(REPO_ROOT, m[1]);
    return existsSync(file) && IMPORTS_BROWSER.test(readFileSync(file, 'utf8'));
  });
});

const lines = [];
const out = (s = '') => lines.push(s);

out('# 结构事实表（脚本生成）');
out();
out('> **脚本生成，勿手改**；`npm run docs:status` 重新生成（脚本是 `tools/docs/status.mjs`）。');
out('> 只放结构事实，健康度见评审报告 [`review-2026-11-24/REVIEW-2026-11-24.md`](./review-2026-11-24/REVIEW-2026-11-24.md)。');
out();
out('口径：');
out();
out('- 零件取 `shared/stage/preview/build.mjs` 的 `PART_ENTRY`，层 / 通道 / costMs / kb 是 `loadPartDefs()` 真实 import 到的**申报值**（缺省参数，不走工厂 `opts`；带工厂的零件换参数后 costMs 会变）。');
out('- 预设取同文件的 `PRESETS`；站取 `shared/sites/build.mjs` 的 `STATIONS`；模板取 `shared/product/templates.mjs` 的 `TEMPLATES`。');
out('- 源码行 = 零件入口所在目录下全部 `.ts` / `.js`（不含 `.mjs`）的换行符个数，等于 `wc -l`。');
out('- 孤儿 = 不出现在任何站、预设、模板的 `parts` 里。');
out();
out(`合计：登记零件 ${Object.keys(PART_ENTRY).length} 件（其中 ${Object.keys(PART_ENTRY).filter((id) => PART_ENTRY[id].startsWith('shared/parts/')).length} 件在 \`shared/parts/\`）· 预设 ${Object.keys(PRESETS).length} 个 · 站 ${Object.keys(STATIONS).length} 个 · 模板 ${TEMPLATES.length} 套。`);
out();

// ── 1. 零件表 ──
const formal = Object.keys(PART_ENTRY).filter((id) => PART_ENTRY[id].startsWith('shared/parts/')).sort();
const extra = Object.keys(PART_ENTRY).filter((id) => !PART_ENTRY[id].startsWith('shared/parts/')).sort();

function partTable(ids, title) {
  out(`## ${title}`);
  out();
  out('| 零件 | 层 | 通道 | costMs（申报） | kb（申报） | 源码行 | README.md | bench.mjs | 使用方 | 孤儿 |');
  out('|---|---|---|---|---|---|---|---|---|---|');
  for (const id of ids) {
    const dir = path.dirname(path.join(REPO_ROOT, PART_ENTRY[id]));
    const d = defById.get(id) ?? {};
    const used = [
      ...['station', 'preset', 'template'].flatMap((k) => (users[k].get(id) ?? []).map((n) => ({ k, n }))),
    ];
    const by = { station: [], preset: [], template: [] };
    for (const u of used) by[u.k].push(u.n);
    const usage = [
      by.station.length ? `站 ${by.station.join(' ')}` : '',
      by.preset.length ? `预设 ${by.preset.join(' ')}` : '',
      by.template.length ? `模板 ${by.template.join(' ')}` : '',
    ].filter(Boolean).join(' · ');
    out([
      `\`${id}\``,
      d.layer ? `\`${d.layer}\`` : '（未取到）',
      `\`${d.channel ?? 'canvas2d'}\``,
      String(d.costMs ?? '—'),
      String(d.kb ?? '—'),
      String(sourceLines(dir)),
      existsSync(path.join(dir, 'README.md')) ? '有' : '无',
      existsSync(path.join(dir, 'bench.mjs')) ? '有' : '无',
      usage || '无',
      used.length ? '' : '**是**',
    ].map((c) => esc(c)).join('|').replace(/^/, '|').replace(/$/, '|'));
  }
  out();
}
partTable(formal, `1. Stage 零件（\`shared/parts/\`，${formal.length} 件）`);
const orphans = formal.filter((id) => !['station', 'preset', 'template'].some((k) => users[k].has(id)));
out(`孤儿 ${orphans.length} 件：${orphans.map((id) => `\`${id}\``).join(' ')}。有 README.md 的 ${formal.filter((id) => existsSync(path.join(path.dirname(path.join(REPO_ROOT, PART_ENTRY[id])), 'README.md'))).length} / ${formal.length}，有 bench.mjs 的 ${formal.filter((id) => existsSync(path.join(path.dirname(path.join(REPO_ROOT, PART_ENTRY[id])), 'bench.mjs'))).length} / ${formal.length}。`);
out();
if (extra.length) {
  partTable(extra, `2. 只登记在 \`PART_ENTRY\`、不在 \`shared/parts/\` 的条目（${extra.length} 件）`);
  out(`入口：${extra.map((id) => `\`${PART_ENTRY[id]}\``).join('，')}。`);
  out();
}

// ── 3. 预设表 ──
out(`## 3. 预设（\`PRESETS\`，${Object.keys(PRESETS).length} 个）`);
out();
out('| 预设 | 标题 | 零件 | 含 GL / world 零件 | budgetMs | npm script |');
out('|---|---|---|---|---|---|');
const noScript = [];
for (const name of sorted(PRESETS)) {
  const pr = PRESETS[name];
  const ids = pr.parts.map(partId);
  const gl = ids.some((id) => ['gl', 'world'].includes(defById.get(id)?.channel));
  const detail = pr.parts.map((p) => (typeof p === 'string' ? `\`${p}\`` : `\`${p.id}\`（带 opts）`)).join(' ');
  const scripts = presetScripts(name);
  if (scripts.length === 0) noScript.push(name);
  out(`| \`${name}\` | ${esc(pr.title)} | ${detail} | ${gl ? '是' : '否'} | ${pr.budgetMs} | ${scripts.map((s) => `\`${s}\``).join(' ') || '无'} |`);
}
out();
out(`有对应 npm script 的预设 ${Object.keys(PRESETS).length - noScript.length} 个，没有的 ${noScript.length} 个：${noScript.map((n) => `\`${n}\``).join(' ')}（没有专用 script，直接跑 \`node shared/stage/preview/build.mjs --preset <名字>\`；\`npm run preview\` 固定是 field，追加 \`--preset\` 不生效）。`);
out();

// ── 4. 站点表 ──
out(`## 4. 站点（\`STATIONS\`，${Object.keys(STATIONS).length} 个）`);
out();
out('| 站 | 名称 | biome | budgetMs | 零件 | 站内模块 | 状态 |');
out('|---|---|---|---|---|---|---|');
const stackKey = (parts) => parts.map(partId).join(',');
for (const slug of sorted(STATIONS)) {
  const st = STATIONS[slug];
  const sameStack = sorted(PRESETS).filter((n) => stackKey(PRESETS[n].parts) === stackKey(st.parts));
  out([
    `\`/${slug}\``,
    esc(st.title),
    `\`${st.biome}\``,
    String(st.budgetMs),
    st.parts.map((p) => (typeof p === 'string' ? `\`${p}\`` : `\`${p.id}\`（带 opts）`)).join(' '),
    `\`${st.attach}\``,
    `已登记；产物 \`dist/${slug}/index.html\`；零件 id 序列相同的预设：${sameStack.map((n) => `\`${n}\``).join(' ') || '无'}`,
  ].join('|').replace(/^/, '|').replace(/$/, '|'));
}
out();

// ── 5. 模板表 ──
out(`## 5. 模板（\`TEMPLATES\`，${TEMPLATES.length} 套）`);
out();
out('| 模板 | 名称 | preset | 零件（取自 preset） | 状态 |');
out('|---|---|---|---|---|');
for (const t of TEMPLATES) {
  const pr = PRESETS[t.preset];
  const ids = pr ? pr.parts.map(partId) : [];
  const mismatch = !pr || ids.join(',') !== t.parts.join(',');
  out([
    `\`${t.id}\``,
    esc(t.name),
    pr ? `\`${t.preset}\`` : `**\`${t.preset}\` 不存在**`,
    ids.map((id) => `\`${id}\``).join(' ') + (mismatch ? ` ⚠ 与 \`TEMPLATES[].parts\` 不一致` : ''),
    `\`${t.status}\`（注册表声明值，产物 \`dist/templates/${t.id}/index.html\`）`,
  ].map((c) => esc(c)).join('|').replace(/^/, '|').replace(/$/, '|'));
}
out();
out('Studio（`npm run build:studio` → `dist/studio/index.html`）读的是 `dist/templates/manifest.json`，自身不登记零件。');
out();

// ── 6. npm script 事实 ──
out('## 6. npm script 事实（读 `package.json`）');
out();
out(`- 仍指向 v1 构建器 \`${V1_BUILDER}\` 的 script（${v1Scripts.length} 个）：${v1Scripts.map((s) => `\`${s}\``).join(' ')}。产物写 \`dist/<id>.html\`，与新体系不兼容。`);
out(`- 依赖 \`tests/lib/browser.mjs\` 的 script（${browserScripts.length} 个）：${browserScripts.map((s) => `\`${s}\``).join(' ')}。\`browser.mjs\` 只认 macOS 的 playwright 缓存路径，其它机器上跑不了；\`verify:field\` 拿不到浏览器时打印 SKIP 并以 0 退出。`);
out(`- \`verify:stage\` 会由 \`tests/stage-mutation.mjs\` 原地改写 \`shared/stage/stage.ts\` 后还原；有人并发施工时不要跑。`);
out();

out('---');
out();
out(`健康度与路线依据：[\`review-2026-11-24/REVIEW-2026-11-24.md\`](./review-2026-11-24/REVIEW-2026-11-24.md) · 权威链：[\`README.md\`](./README.md)`);
out();

writeFileSync(OUT, `${lines.join('\n')}\n`, 'utf8');
console.log(`[docs:status] 已写出 ${toPosix(path.relative(REPO_ROOT, OUT))}：零件 ${Object.keys(PART_ENTRY).length} · 预设 ${Object.keys(PRESETS).length} · 站 ${Object.keys(STATIONS).length} · 模板 ${TEMPLATES.length}`);
