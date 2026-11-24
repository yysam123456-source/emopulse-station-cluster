// 零件图谱：把 Portal 的 6,675 条 preview-manifest 变成可筛选的 CSV + 摘要。
//
// 它不是“逐条移植清单”，而是“哪些能进 Stage 零件、哪些只能做参考”的判定表：
//   · uiverse 3,802 条是 UI/CSS，进 L5 参考，不进画布零件；
//   · pixelfx 244 / shaders 209 / threeui 120 / ascii 974 才是与 L0–L4 合成相关的族；
//   · 612 条 react-generated 有 registry 入口，单独标出来供后续按需移植。
//
// 用法：
//   node tools/parts/atlas.mjs
//   node tools/parts/atlas.mjs --portal-root <portal-root>
//
// 输出：
//   docs/PART-ATLAS.csv   6,675 行，一行一条 manifest 记录
//   docs/PART-ATLAS.md    统计、优先级与边界说明
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const DEFAULT_PORTAL = path.join(
  REPO_ROOT,
  '..',
  '..',
  '..',
  'DoubaoWork',
  'chats',
  '2026-11-23',
  'new-chat',
  '_source',
  'portal-full',
  'frontend-design-portal-3d7c139899417dbceb07be0578ec76b306ee98dc',
);

const argv = process.argv.slice(2);
const portalRoot = (() => {
  const i = argv.indexOf('--portal-root');
  if (i >= 0 && argv[i + 1]) return path.resolve(argv[i + 1]);
  const eq = argv.find((a) => a.startsWith('--portal-root='));
  if (eq) return path.resolve(eq.slice('--portal-root='.length));
  return DEFAULT_PORTAL;
})();

const MANIFEST = path.join(portalRoot, 'src/generated/preview-manifest.ts');
const REGISTRY = path.join(portalRoot, 'src/generated/preview-registry.ts');
const OUT_CSV = path.join(REPO_ROOT, 'docs/PART-ATLAS.csv');
const OUT_MD = path.join(REPO_ROOT, 'docs/PART-ATLAS.md');

function extractObject(text, declMarker) {
  const decl = text.indexOf(declMarker);
  if (decl < 0) throw new Error(`找不到 ${declMarker}`);
  const start = text.indexOf('{', text.indexOf('=', decl));
  let depth = 0;
  let inStr = false;
  let quote = '';
  let escape = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inStr) {
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === quote) inStr = false;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inStr = true;
      quote = ch;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  throw new Error(`对象没有闭合：${declMarker}`);
}

function readManifest() {
  if (!existsSync(MANIFEST)) throw new Error(`找不到 manifest：${MANIFEST}`);
  const text = readFileSync(MANIFEST, 'utf8');
  return JSON.parse(extractObject(text, 'export const previewManifest'));
}

function readRegistry() {
  if (!existsSync(REGISTRY)) return new Map();
  const text = readFileSync(REGISTRY, 'utf8');
  const map = new Map();
  const re = /^\s*"([^"]+)"\s*:\s*\(\)\s*=>\s*import\('([^']+)'\)/gm;
  let m;
  while ((m = re.exec(text)) !== null) map.set(m[1], m[2]);
  return map;
}

const PROJECT_FAMILY = {
  'ascii-magic': 'ascii',
  'ascii-rest': 'ascii',
  'ascii-sharks': 'ascii',
  pixelfx: 'pixelfx',
  shaders: 'shader',
  threeui: 'three',
  animejs: 'motion',
  'react-bits': 'react-bits',
  animata: 'ui',
  eldoraui: 'ui',
  looseleaf: 'paper',
  uiverse: 'ui',
  'zelda-hyrule-ui': 'ui',
  pinui: 'ui',
  pixel2motion: 'effect',
};

const POST_RE = /(post|grain|vignette|blur|glitch|vhs|halftone|dither|scanline|bloom|chromatic|noise|film)/i;
const BG_RE = /(background|bg|sky|fog|cloud|aurora|water|ocean|sea|nebula|star|galaxy)/i;

function classify(record, registryPath) {
  const project = record.project ?? 'unknown';
  const kind = record.kind ?? 'unknown';
  const id = record.id ?? '';
  const family = PROJECT_FAMILY[project] ?? 'other';

  if (kind === 'media-video' || kind === 'media-image') {
    return { family: 'media', layer: '-', role: 'asset', action: 'archive', note: '视频/图片素材；不进入画布合成' };
  }
  if (kind === 'embed') {
    return { family: 'embed', layer: 'L5', role: 'reference', action: 'archive', note: '外链嵌入；只作参考' };
  }
  if (kind === 'unsupported') {
    return { family: 'unsupported', layer: '-', role: 'unmounted', action: 'skip', note: '当前 manifest 标 unsupported' };
  }

  if (family === 'ui') {
    return { family, layer: 'L5', role: 'ui', action: 'ui-reference', note: 'UI/CSS 组件；可作为站点壳，不是 Stage 画布零件' };
  }
  if (family === 'ascii') {
    return { family, layer: 'L2', role: 'scene', action: 'port', note: 'ASCII 渲染族；优先抽象字符场/像素化后处理' };
  }
  if (family === 'pixelfx') {
    const post = POST_RE.test(id);
    return {
      family,
      layer: post ? 'L4' : 'L2',
      role: post ? 'post' : 'effect',
      action: 'port',
      note: post ? '像素后处理候选；需 320×180 内部尺寸适配' : 'Canvas 帧缓冲特效；可包成 L2 效果零件',
    };
  }
  if (family === 'shader') {
    const post = POST_RE.test(id);
    return {
      family,
      layer: post ? 'L4' : 'L1',
      role: post ? 'post' : 'scene',
      action: 'port',
      note: post ? '后处理候选；注意 2.59 MB 单 bundle 不可按组件 tree-shake' : 'WebGPU/GLSL 场景候选；单 GL 约束下只能选一个',
    };
  }
  if (family === 'three') {
    return { family, layer: 'L1', role: 'scene', action: 'port', note: 'Three.js 场景；可移植为单 GL 零件' };
  }
  if (family === 'paper') {
    return { family, layer: 'L0', role: 'scene', action: 'port', note: '纸/墨底材候选；优先并入 paper-ink' };
  }
  if (family === 'motion' || family === 'effect') {
    return { family, layer: 'L2', role: 'effect', action: 'reference', note: '动画/运动参考；只保留可复用运动逻辑，不整体移植 DOM 时间线' };
  }
  if (family === 'react-bits') {
    if (kind === 'react-generated') {
      return { family, layer: 'L2', role: 'effect', action: 'review', note: 'React 生成预览；有 registry 入口，按需评估运动/粒子逻辑' };
    }
    return { family, layer: 'L2', role: 'effect', action: 'reference', note: 'React Bits 条目；优先看 registry 入口而不是媒体' };
  }
  return { family, layer: '-', role: 'reference', action: 'review', note: '未归族；人工复核' };
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function main() {
  const manifest = readManifest();
  const registry = readRegistry();
  const rows = [];
  const counts = { action: {}, family: {}, project: {}, layer: {} };

  for (const [key, record] of Object.entries(manifest)) {
    const id = record.id ?? key;
    const classified = classify(record, registry.get(id));
    const media = record.media ?? {};
    const mediaLabel = media.label ?? media.mp4 ?? media.webm ?? media.image ?? '';
    const row = {
      id,
      project: record.project ?? '',
      kind: record.kind ?? '',
      status: record.status ?? '',
      family: classified.family,
      role: classified.role,
      suggested_layer: classified.layer,
      action: classified.action,
      registry_entry: registry.get(id) ?? '',
      media_label: mediaLabel,
      note: classified.note,
    };
    rows.push(row);
    counts.action[row.action] = (counts.action[row.action] ?? 0) + 1;
    counts.family[row.family] = (counts.family[row.family] ?? 0) + 1;
    counts.project[row.project] = (counts.project[row.project] ?? 0) + 1;
    counts.layer[row.suggested_layer] = (counts.layer[row.suggested_layer] ?? 0) + 1;
  }

  mkdirSync(path.dirname(OUT_CSV), { recursive: true });
  const header = ['id', 'project', 'kind', 'status', 'family', 'role', 'suggested_layer', 'action', 'registry_entry', 'media_label', 'note'];
  const lines = [header.join(',')];
  for (const row of rows) lines.push(header.map((key) => csvCell(row[key])).join(','));
  writeFileSync(OUT_CSV, `${lines.join('\n')}\n`);

  const sortCounts = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]);
  const table = (obj) => sortCounts(obj).map(([k, v]) => `| ${k} | ${v} |`).join('\n');
  const portRows = rows
    .filter((r) => r.action === 'port')
    .sort((a, b) => a.project.localeCompare(b.project) || a.id.localeCompare(b.id));
  const portByProject = {};
  for (const row of portRows) portByProject[row.project] = (portByProject[row.project] ?? 0) + 1;
  const looseleafArchived = rows.filter((r) => r.project === 'looseleaf' && r.action === 'archive').length;
  const looseleafPort = portByProject.looseleaf ?? 0;
  const threeUiPort = portByProject.threeui ?? 0;
  const asciiPort = ['ascii-magic', 'ascii-rest', 'ascii-sharks']
    .reduce((sum, project) => sum + (portByProject[project] ?? 0), 0);

  const md = `# PART-ATLAS · Portal 组件零件图谱

> 生成脚本：\`tools/parts/atlas.mjs\`；输入：\`${path.relative(REPO_ROOT, MANIFEST).replaceAll('\\', '/')}\`。
> 全量 CSV：\`docs/PART-ATLAS.csv\`（${rows.length} 行，一行一条 manifest 记录）。

## 1. 这份图谱回答什么

Portal 的 \`preview-manifest.ts\` 有 **${rows.length} 条**组件记录，但“记录数”不等于“零件数”。
真正要进 Stage 的，不是 6,675 个页面，而是能落在 L0–L4 的**效果族**：
底材、世界、粒子/字符场、叠加层、后处理。UI/CSS、视频、图片、embed 只能做站点壳或参考。

这份表给每条记录一个 \`family / role / suggested_layer / action\`，用来筛选“先做哪些零件”，
而不是假装 6,675 条都能一比一移植。

## 2. 总数与动作分布

| action | 数量 |
|---|---:|
${table(counts.action)}

解释：

- \`port\`：可以抽象成 Stage 零件的候选；做不做取决于有没有站或模板需要它；
- \`ui-reference\`：UI/CSS 组件，只做站点壳参考；
- \`reference\`：运动/动画参考，保留逻辑，不整体移植；
- \`archive\`：视频/图片/embed，留来源路径；
- \`review\`：React 生成或未归族，按需评估；
- \`skip\`：manifest 已标 unsupported。

## 3. 项目分布

| project | 数量 |
|---|---:|
${table(counts.project)}

## 4. 族分布

| family | 数量 |
|---|---:|
${table(counts.family)}

## 5. 建议层分布

| suggested_layer | 数量 |
|---|---:|
${table(counts.layer)}

## 6. port 候选（按来源项目）

| project | port 候选数 |
|---|---:|
${sortCounts(portByProject).map(([k, v]) => `| ${k} | ${v} |`).join('\n')}

这张表是候选存量，不是施工顺序。截至 2026-11-24，从这 ${portRows.length.toLocaleString('en-US')} 条里落地的是 \`abyss\` / \`nebula\` / \`temple\`（另加 \`bubbles\`、\`pixel-post\`，后者只借了概念）；
评审（\`docs/review-2026-11-24/REVIEW-2026-11-24.md\` §5.5）建议停止继续扩充 Portal 候选，
因为现有零件里还有 4 个没有任何使用方。有站或模板需要时，再按族回来查：

| 族 | port 候选 | 现状 |
|---|---:|---|
| pixelfx | ${portByProject.pixelfx ?? 0} | 未逐条拆；\`pixel-post\` 只借了 \`core/fx.js\` 的概念 |
| shaders | ${portByProject.shaders ?? 0} | 未拆；2.59 MB 单 bundle |
| threeui | ${threeUiPort} | 未拆 |
| ascii | ${asciiPort} | 未拆；\`ascii-field\` 是按 ascii-magic 的 piece 契约自建，且没有使用方 |
| looseleaf | ${looseleafPort} | 不是候选：${looseleafArchived} 条全是 embed，已归 \`archive\` |

## 7. 与现有零件的对照

16 个 Stage 零件（\`shared/parts/\`）按层列出；「孤儿」= 不在任何站、预设、模板里（\`docs/review-2026-11-24/inventory/INVENTORY.md\` §3、§5）。

| 层 | 现有零件（使用方） | 图谱里的对应 |
|---|---|---|
| L0 | \`abyss\`（模板 deepsea / nebula）· \`paper-ink\`（/license /koi，模板 koi）· \`field-ground\`（仅预设 field / field-l0）· \`tide-medium\`（/still，仅预设） | 无强候选；looseleaf ${looseleafArchived} 条是 embed，已归档 |
| L1 | \`voxel-world\`（/still）· \`koi-pond\`（/koi，模板 koi）· \`hug-meadow\`（/hug）· \`nebula\`（模板 nebula）· \`temple\`（模板 temple / gate） | threeui ${threeUiPort} 条未拆；NebulaGalaxy / AbyssalDescent / kage 参考已落成 \`nebula\` / \`abyss\` / \`temple\` |
| L2 | \`bubbles\`（/still，模板 deepsea）· 孤儿：\`ascii-field\` \`boids\` \`dandelion\` | pixelfx ${portByProject.pixelfx ?? 0} 条、ascii ${asciiPort} 条未拆 |
| L3 | \`still-sink\`（/still，模板 deepsea）· 孤儿：\`sun\` | 暂无强候选 |
| L4 | \`pixel-post\`（/license /still，模板 deepsea / nebula） | shaders / pixelfx 后处理类 |
| L5 | 无正式零件 | uiverse / animata / eldoraui / zelda 做站点壳 |

## 8. 关键边界

- **单 GL**：Stage 一份 composition 只能有一个 \`gl\`/\`world\` 零件；threeui 与 shader 不能同场叠加，必须按模板选一个。
- **单 L4**：\`pixel-post\` 已占 L4；shaders 后处理如果要进模板，必须先做“替换 pixel-post”的决策，不能并联。
- **2.59 MB shader bundle**：\`public/shaders/runtime/shaders.js\` 是 200 个组件的单 bundle，不能按组件 tree-shake；先选 1–2 个后处理重写成独立零件。
- **pixelfx 尺寸锁 320×180**：进 Stage 前要加内部 RT 适配，否则大屏会糊。
- **视频/图片不占层**：268 条 media-video、148 条 media-image 只做来源归档，不包成画布零件。
- **UI 不进画布**：uiverse 3,802 条是 UI/CSS，L5 站点壳参考；不要为了“做全”把它们塞进 L2。

## 9. 和 A2 的关系

A2 的模板层与 Studio 已经有了，不再缺「模板注册、参数 schema、新场景」：
\`shared/product/templates.mjs\` 是模板注册表，\`shared/product/studio.mjs\` 生成 Studio，
深海 / 星系 / 寺庙三个场景分别落在 \`abyss\` / \`nebula\` / \`temple\`（现状见 \`docs/A2-PARTS-AND-TEMPLATES.md\`）。

缺口在产品层，不在这张图谱里（评审 \`docs/review-2026-11-24/REVIEW-2026-11-24.md\` §3.3 与 §5.2）：

- **导出**：Studio 没有导出控件，「另存为」存下的是原模板，调好的参数全部丢失；
- **体积预算**：构建只把 gzip 写进 manifest，没有阈值；超 1 MB 的模板照样标 \`READY\`；
- **实时调参**：改一次参数就把 iframe 整个重载；
- **画质档位**：运行时只有 \`low | high\` 两档，没有给用户的档位选择。

所以 port 候选目前不是 A2 的待办：评审 §5.5 建议在导出 / 体积预警 / 实时调参补齐之前不给 A2 加新模板，也不扩充 Portal 候选。
有站或模板需要某一条时，再回到 §6 按族查。

## 10. 复现

\`\`\`powershell
node tools/parts/atlas.mjs
node tools/parts/atlas.mjs --portal-root <path-to-frontend-design-portal>
\`\`\`
`;

  writeFileSync(OUT_MD, md);
  console.log(`[atlas] ${rows.length} rows -> ${path.relative(REPO_ROOT, OUT_CSV)}`);
  console.log(`[atlas] summary -> ${path.relative(REPO_ROOT, OUT_MD)}`);
  console.log(`[atlas] action=${JSON.stringify(counts.action)}`);
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
