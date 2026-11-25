// 模板构建/体积/导出（产品化第二层）。
//
// 输入：`templates.mjs` 的 ready 模板 + `build.mjs` 的 preset。
// 输出：`dist/templates/<id>/index.html` + 一份 `manifest.json`（原始字节、gzip、GL、
// 装配顺序、是否零外部请求）。
//
// 这层是“产品门”，不是预览器的重复：预览器只回答“能不能打开”，这里回答
// “出厂有多大、有没有外链、GL 是否真的装进去、模板与注册表是否对得上”。
//
// 用法：
//   node shared/product/build-templates.mjs --list
//   node shared/product/build-templates.mjs
//   node shared/product/build-templates.mjs --only nebula
//   node shared/product/build-templates.mjs --out dist/templates
import { mkdirSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { buildPreview, REPO_ROOT, resolvePreset } from '../stage/preview/build.mjs';
import { TEMPLATES } from './templates.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = path.join(REPO_ROOT, 'dist', 'templates');

function parseArgs(argv) {
  const args = { list: false, only: null, out: DEFAULT_OUT };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--list') args.list = true;
    else if (arg === '--only') args.only = argv[++i] ?? null;
    else if (arg.startsWith('--only=')) args.only = arg.slice('--only='.length);
    else if (arg === '--out') args.out = argv[++i] ?? DEFAULT_OUT;
    else if (arg.startsWith('--out=')) args.out = arg.slice('--out='.length);
    else if (!arg.startsWith('-')) args.only = arg;
  }
  return args;
}

/** 外部请求门：单文件模板不允许任何 http(s)、protocol-relative、@import。 */
function hasExternalRequest(html) {
  return /(?:src|href)\s*=\s*["'](?:https?:)?\/\//i.test(html)
    || /@import\s+url\s*\(/i.test(html)
    || /url\s*\(\s*["']?https?:/i.test(html);
}

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const selected = args.only ? TEMPLATES.filter((t) => t.id === args.only) : TEMPLATES;

  if (args.list) {
    for (const t of selected) {
      let presetOk = true;
      try { resolvePreset(t.preset); } catch { presetOk = false; }
      console.log(`${t.id.padEnd(9)} ${t.status.padEnd(10)} preset=${t.preset}${presetOk ? '' : ' (MISSING)'}  parts=${t.parts.join(',')}`);
    }
    if (selected.length === 0) {
      console.error(`没有匹配的模板：${args.only ?? '(all)'}`);
      process.exitCode = 1;
    }
    return;
  }

  if (selected.length === 0) {
    console.error(`没有匹配的模板：${args.only ?? '(all)'}`);
    process.exitCode = 1;
    return;
  }

  mkdirSync(args.out, { recursive: true });
  const manifest = {
    generatedAt: new Date().toISOString(),
    source: 'shared/product/templates.mjs',
    templates: [],
  };

  for (const t of selected) {
    if (t.status !== 'ready') {
      manifest.templates.push({ id: t.id, name: t.name, status: t.status, skipped: true });
      console.log(`[templates] skip ${t.id} (${t.status})`);
      continue;
    }

    const outPath = path.join(args.out, t.id, 'index.html');
    mkdirSync(path.dirname(outPath), { recursive: true });
    const started = Date.now();
    try {
      const result = await buildPreview({ preset: t.preset, out: outPath, minify: true });
      const html = readFileSync(outPath, 'utf8');
      const bytes = statSync(outPath).size;
      const gzipBytes = gzipSync(Buffer.from(html), { level: 9 }).length;
      const budgetLimit = 1048576;
      const external = hasExternalRequest(html);
      const placeholder = html.includes('__PREVIEW_');
      const entry = {
        id: t.id,
        name: t.name,
        summary: t.summary,
        status: 'ready',
        preset: t.preset,
        biome: t.biome,
        parts: t.parts,
        params: t.params,
        out: path.relative(REPO_ROOT, outPath).replaceAll('\\', '/'),
        url: `../templates/${t.id}/index.html`,
        bytes,
        gzipBytes,
        // 1 MiB 是 Toy 渠道的传输上限；temple/gate 现在远超，仍要红着报警而不是假装没超。
        budgetLimit,
        // 门槛按 gzip 字节算（产品传输口径），不是磁盘原始字节。
        overBudget: gzipBytes > budgetLimit,
        hasGl: result.hasGl,
        order: result.order,
        external,
        placeholder,
        buildMs: Date.now() - started,
      };
      manifest.templates.push(entry);
      console.log(`[templates] ${t.id}  ${formatKb(bytes)}  gzip ${formatKb(gzipBytes)}  gl=${result.hasGl}  order=${result.order.join(' -> ')}`);
      if (external) {
        console.error(`[templates] FAIL ${t.id}: 发现外部请求`);
        process.exitCode = 1;
      }
      if (placeholder) {
        console.error(`[templates] FAIL ${t.id}: 残留 __PREVIEW_ 占位符`);
        process.exitCode = 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      manifest.templates.push({ id: t.id, name: t.name, status: 'failed', error: message });
      console.error(`[templates] FAIL ${t.id}: ${message}`);
      process.exitCode = 1;
    }
  }

  const manifestPath = path.join(args.out, 'manifest.json');
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`[templates] manifest ${path.relative(REPO_ROOT, manifestPath)}`);
  console.log(`[templates] done ${manifest.templates.length} template(s)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
