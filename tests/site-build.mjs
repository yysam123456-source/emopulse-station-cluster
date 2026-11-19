// 站点产物的门 —— 「站」和「预览页」是两种东西，不能只靠 preview 那套断言覆盖。
//
// 四条断言（每条都对应一个真实会出事的点）：
//   A. **零外部请求**：单文件离线可开。任何时候漏一条就是"离线打不开"，而离线打不开的页面
//      在开发机上永远看不出来（因为你有网）。
//   B. **恰好一个内联 script**，且 `</script` 只出现一次（否则脚本被截断）
//   C. **零件真的在产物里**（按 id 字面命中）+ **底件存在**（帧循环无 clearRect，缺底件会残影）
//   D. **壳的输入边界必须存在**：产物里必须有 `#stage`、指针过滤分支、以及 CTA（有 CTA 的站）
//
// 用法：node tests/site-build.mjs
import { existsSync } from 'node:fs';
import path from 'node:path';
import { buildSite, STATIONS } from '../shared/sites/build.mjs';
import { REPO_ROOT } from '../shared/stage/preview/build.mjs';
import { loadPartDefs } from '../shared/stage/preview/build.mjs';
import { loadTsModule } from './lib/load-ts.mjs';

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

const summary = [];
for (const slug of Object.keys(STATIONS)) {
  const station = STATIONS[slug];
  // 不写盘（产物已由 npm run build:sites 生成；这里只验证构建结果）
  const built = await buildSite({ slug, write: false });
  const html = built.html;
  const { defs } = await loadPartDefs(station.parts);

  // A. 零外部请求 —— **只查 HTML 标记，不查内联脚本**。
  //    第一版把整份 HTML 都扫了，于是 JS 里的 `a.href = url` 被当成外部链接（假红）。
  //    正确的做法是先剥掉 <script> 再扫属性。
  const markup = html.replace(/<script\b[\s\S]*?<\/script>/gi, '');
  const externalPatterns = [
    [/https?:\/\//i, 'http(s)://'],
    [/\bsrc\s*=/i, 'src='],
    [/\bhref\s*=/i, 'href='],
    [/<link\b/i, '<link>'],
    [/<img\b/i, '<img>'],
    [/@import/i, '@import'],
    [/\burl\s*\(/i, 'url('],
  ];
  for (const [pattern, label] of externalPatterns) {
    check(!pattern.test(markup), `${slug}: 产物里出现 ${label}（零外部请求被破坏）`);
  }

  // B. 单脚本 + 不截断
  const scriptTags = (html.match(/<script\b/gi) ?? []).length;
  check(scriptTags === 1, `${slug}: 应恰好 1 个 <script>，实得 ${scriptTags}`);
  check(!/<script\s+[^>]/i.test(html), `${slug}: <script> 带属性（外部脚本入口）`);
  const closeTags = (html.match(/<\/script/gi) ?? []).length;
  check(closeTags === 1, `${slug}: </script 出现 ${closeTags} 次（应恰好 1 次；多余即脚本被截断）`);

  // C. 零件在产物里 + 底件存在
  for (const def of defs) {
    check(html.includes(def.id), `${slug}: 零件 id "${def.id}" 未出现在产物里（很可能被 tree-shake）`);
  }
  if (defs.length > 0) {
    check(
      defs.some((def) => def.layer === 'L0' || def.layer === 'L1'),
      `${slug}: 没有任何 L0/L1 底件（帧循环无 clearRect，会残影）`,
    );
  }

  // D. 壳的骨架与输入边界
  check(html.includes('id="stage"'), `${slug}: 缺 #stage`);
  check(html.includes('id="gl"') === built.hasGl, `${slug}: #gl 存在性与 hasGl 不一致`);
  check(html.includes('id="dbg"'), `${slug}: 缺调试条 #dbg`);
  // lead 必须真的渲染成节点（防"配置里有、模板没有"的死字段）
  check(html.includes('id="lead"'), `${slug}: 缺 #lead（站点一句话没有对应节点 = 死字段）`);
  check(html.includes(station.lead.replace(/&/g, '&amp;')), `${slug}: #lead 里没有站点文案`);
  check(html.includes('id="boot-error"'), `${slug}: 缺错误面 #boot-error（启动失败要能截图取证）`);
  // 指针过滤必须真的在产物里（否则 UI 点击会漏进世界）
  check(/event\.target!==\w+|event\.target !== \w+/.test(html) || html.includes('target!=='), `${slug}: 产物里找不到指针 target 过滤（T20 的 ① 条）`);
  check(html.includes('setPointer'), `${slug}: 产物里找不到 setPointer（UI 注入路径 ② 条）`);
  if (station.cta) {
    check(html.includes('id="cta"'), `${slug}: 配了 CTA 但产物里没有 #cta`);
  } else {
    check(!html.includes('id="cta"'), `${slug}: 没配 CTA 但产物里有 #cta`);
  }

  summary.push({ slug, bytes: built.bytes, parts: built.order.join(',') || '(none)', gl: built.hasGl });
}

// ── 代码里的文案必须能在 COPY-SITES.md 里逐字找到 ──
// 事故：`STATIONS.license.lead` 曾是我**手写编的**（`A permit for a small, unreasonable thing.`），
// 而定稿是 `A permit to simply be.` —— 两份文案，且代码那份是编的。
// 这条断言把"文档是唯一来源"变成可执行的：改文案必须先改文档。
{
  const { readFileSync } = await import('node:fs');
  const docPath = path.join(REPO_ROOT, 'docs', 'COPY-SITES.md');
  const doc = readFileSync(docPath, 'utf8');
  const { COPY } = await import('../shared/sites/copy.mjs');
  for (const [key, entry] of Object.entries(COPY)) {
    for (const field of ['h1', 'hook']) {
      const value = entry[field];
      if (typeof value !== 'string' || value.length === 0) continue;
      check(
        doc.includes(value),
        `copy.mjs ${key}.${field} = ${JSON.stringify(value)} 在 COPY-SITES.md 里找不到 —— 代码里的文案不能自己编，必须先改文档`,
      );
    }
    // cta 只在真的挂上节点时要求（未实现交互的站故意留 null）
    if (typeof entry.cta === 'string' && entry.cta.length > 0) {
      check(doc.includes(entry.cta), `copy.mjs ${key}.cta = ${JSON.stringify(entry.cta)} 在 COPY-SITES.md 里找不到`);
    }
  }
}

// ── 带走物比例必须与屏上纸同比例 ──
// cover 裁切横帧到竖版时，比例不一致会把纸左右各切掉一截，**章可能落出画外**，而且不报错。
{
  // 用 loadTsModule 读零件常量（.mjs 不能直接 import .ts）。
  // ★ 读不到就**红**，不许静默跳过 —— 第一版用了 `.catch(() => null)` + `if (SHEET_ASPECT)`，
  //   结果那条断言根本没跑，而门照样 82/82 绿。那正是 §2.5 里"测量点选在观察不到现象的地方"。
  let sheetAspect = null;
  let readError = null;
  try {
    const mod = await loadTsModule(path.join(REPO_ROOT, 'shared', 'parts', 'paper-ink', 'index.ts'));
    sheetAspect = typeof mod.SHEET_ASPECT === 'number' ? mod.SHEET_ASPECT : null;
  } catch (error) {
    readError = error instanceof Error ? error.message : String(error);
  }
  check(sheetAspect !== null, `读不到 paper-ink 的 SHEET_ASPECT（${readError ?? '未导出'}）—— 这条断言不能跳过`);
  const license = STATIONS.license;
  check(Boolean(license?.exportSize), 'license 站没有声明 exportSize —— 带走物尺寸必须显式写在站点配置里');
  if (sheetAspect !== null && license?.exportSize) {
    const exportAspect = license.exportSize.w / license.exportSize.h;
    check(
      Math.abs(exportAspect - sheetAspect) < 0.01,
      `license: 带走物 ${license.exportSize.w}×${license.exportSize.h}（${exportAspect.toFixed(3)}）与屏上纸 ${sheetAspect.toFixed(3)} 不同比例 —— cover 裁切会剪掉纸`,
    );
  }
}

// 索引页必须存在（serve 的根路径要能开）
check(existsSync(path.join(REPO_ROOT, 'dist', 'index.html')), 'dist/index.html 不存在（先跑 npm run build:sites）');

console.log('站点产物：\n');
console.log('  slug      字节      零件                        GL');
for (const row of summary) {
  console.log(`  ${row.slug.padEnd(8)} ${String(row.bytes).padStart(7)}   ${row.parts.padEnd(26)} ${row.gl ? 'yes' : 'no'}`);
}

if (failures.length === 0) {
  console.log(`\nsite-build: PASS ${checks}/${checks}`);
  process.exit(0);
}
console.error(`\nsite-build: FAIL ${failures.length}/${checks}`);
for (const failure of failures) console.error(`  - ${failure}`);
process.exit(1);
