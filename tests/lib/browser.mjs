// 真实浏览器封装 —— 把「本机有没有浏览器」这个反复出错的问题一次性固化。
//
// 背景（2026-11-18，两次判断错误的记录）：
//   第一轮结论是「本机只有 Safari，无 Chrome/Edge」，第二轮才发现
//   `~/Library/Caches/ms-playwright/` 里躺着 chromium-1223/1228/1243，
//   而 `npx playwright` 是 1.65.1。唯一坑：那个 playwright 要的 chromium-1255 不存在，
//   所以**必须显式传 executablePath**，不能让它自己找。
//
// 因此本模块做三件事，任何一件失败都给出可执行的下一步，而不是抛一句 "browser not found"：
//   1. 找 playwright 包：先在常规 node_modules 里 require，找不到就去扫 `~/.npm/_npx/*/node_modules`
//      （`npx playwright` 装出来的包就在那里）。ESM import 不认 NODE_PATH，所以这里用 createRequire。
//   2. 找 chromium 可执行文件：扫 `~/Library/Caches/ms-playwright/chromium-*/`，取版本号最大的那个。
//      **不写死版本号** —— 写死就是下一次「路径不对」的来源。
//   3. 提供 `launch()` / `openFile()` / `screenshot()` / `waitForPreview()` 四个原语，
//      约定页面用 `globalThis.__preview.snapshot()` 暴露状态（preview/host.ts 已这么做）。
//
// 命令行用法（便于在 bash 里一句话取证）：
//   node tests/lib/browser.mjs --shot dist/preview/field.html --out /tmp/field.png
//   node tests/lib/browser.mjs --shot dist/preview/field.html --out /tmp/f.png --width 1280 --height 720 --dpr 2
//   node tests/lib/browser.mjs --shot dist/preview/hug.html --out /tmp/hug.png --webgpu
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

/** 仓库根绝对路径。 */
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** 默认视口（与各处 bench / 成本估算同源）。 */
export const DEFAULT_VIEWPORT = Object.freeze({ width: 1280, height: 720, dpr: 2 });

/**
 * 找 playwright 包（CommonJS require，认 NODE_PATH 与绝对路径）。
 *
 * @returns {object} playwright 模块
 */
export function resolvePlaywright() {
  const candidates = [];
  if (process.env.PLAYWRIGHT_MODULE) candidates.push(process.env.PLAYWRIGHT_MODULE);
  candidates.push('playwright');
  if (process.env.NODE_PATH) {
    for (const base of process.env.NODE_PATH.split(path.delimiter)) {
      if (base) candidates.push(path.join(base, 'playwright'));
    }
  }
  // `npx playwright` 的临时安装目录
  const npxRoot = path.join(os.homedir(), '.npm', '_npx');
  if (existsSync(npxRoot)) {
    for (const entry of readdirSync(npxRoot)) {
      candidates.push(path.join(npxRoot, entry, 'node_modules', 'playwright'));
    }
  }

  const failures = [];
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (error) {
      failures.push(`${candidate}: ${error.code ?? error.message}`);
    }
  }
  throw new Error(
    '找不到 playwright。可执行 `npx playwright --version` 安装一次，'
    + `或用 PLAYWRIGHT_MODULE=<绝对路径> 指定。\n尝试过：\n  ${failures.join('\n  ')}`,
  );
}

/**
 * 找 chromium 可执行文件。扫缓存目录，取版本号最大的 chromium（不写死版本）。
 *
 * @returns {string} 可执行文件绝对路径
 */
export function resolveChromium() {
  if (process.env.CHROMIUM_PATH && existsSync(process.env.CHROMIUM_PATH)) return process.env.CHROMIUM_PATH;

  const cacheRoot = path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
  const relativeCandidates = [
    // macOS arm64 / x64
    'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    'chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    'chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium',
    'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
    // linux
    'chrome-linux/chrome',
    // windows
    'chrome-win/chrome.exe',
  ];

  if (!existsSync(cacheRoot)) {
    throw new Error(`找不到 playwright 的浏览器缓存目录：${cacheRoot}（先跑 \`npx playwright install chromium\`）`);
  }

  const builds = readdirSync(cacheRoot)
    .filter((name) => /^chromium-\d+$/.test(name))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));

  for (const build of builds) {
    for (const relative of relativeCandidates) {
      const full = path.join(cacheRoot, build, relative);
      if (existsSync(full)) {
        statSync(full); // 存在性已确认，这里只是明确「我们用的是真实文件」
        return full;
      }
    }
  }
  throw new Error(
    `找到了 ${cacheRoot}，但里面没有可用的 chromium 可执行文件。`
    + `可用目录：${builds.join(', ') || '(无)'}。可跑 \`npx playwright install chromium\`。`,
  );
}

/**
 * 启动浏览器。
 *
 * @param {object} [options]
 * @param {boolean} [options.headless] 是否无头（默认 true）
 * @param {boolean} [options.webgpu] 是否尝试开启 WebGPU（Chromium 需显式 flag，且不保证能拿到 adapter）
 * @param {string[]} [options.args] 追加参数
 * @returns {Promise<{ browser: object, executablePath: string, close: () => Promise<void> }>}
 */
export async function launch(options = {}) {
  const playwright = resolvePlaywright();
  const executablePath = resolveChromium();

  const args = [
    // 免掉 file:// 下的一些默认限制；预览页是零外部请求的单文件，用不到网络
    '--allow-file-access-from-files',
    '--disable-lcd-text',
    ...(options.args ?? []),
  ];
  if (options.webgpu) {
    args.push('--enable-unsafe-webgpu', '--enable-features=Vulkan,WebGPU', '--use-angle=metal', '--ignore-gpu-blocklist');
  }

  const browser = await playwright.chromium.launch({
    executablePath,
    headless: options.headless !== false,
    args,
  });
  return { browser, executablePath, close: () => browser.close() };
}

/**
 * 打开一个本地 HTML 文件，并开始收集控制台消息与页面错误。
 *
 * @param {object} browser launch() 返回的 browser
 * @param {string} filePath 本地 HTML 路径（repo 相对或绝对）
 * @param {{ width?: number, height?: number, dpr?: number }} [viewport]
 * @returns {Promise<{ page: object, close: () => Promise<void>, console: Array<object>, errors: Array<string> }>}
 */
export async function openFile(browser, filePath, viewport = {}) {
  const absolute = path.isAbsolute(filePath) ? filePath : path.join(REPO_ROOT, filePath);
  if (!existsSync(absolute)) throw new Error(`文件不存在：${absolute}`);

  const width = viewport.width ?? DEFAULT_VIEWPORT.width;
  const height = viewport.height ?? DEFAULT_VIEWPORT.height;
  const dpr = viewport.dpr ?? DEFAULT_VIEWPORT.dpr;

  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr });
  const page = await context.newPage();

  /** 控制台与错误（验收时要断言「没有 error」） */
  const messages = [];
  const errors = [];
  page.on('console', (message) => {
    const entry = { type: message.type(), text: message.text() };
    messages.push(entry);
    if (entry.type === 'error') errors.push(entry.text);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

  await page.goto(pathToFileURL(absolute).href, { waitUntil: 'load' });
  return {
    page,
    console: messages,
    errors,
    close: async () => { await context.close(); },
  };
}

/**
 * 等页面就绪（预览宿主挂 `__preview`，上线壳挂 `__site`；两者都认）。
 *
 * @param {object} page playwright 页面
 * @param {{ frames?: number, timeoutMs?: number }} [options] 需要推进多少帧才算就绪
 * @returns {Promise<object>} `__preview.snapshot()` 的结果
 */
export async function waitForPreview(page, options = {}) {
  const frames = options.frames ?? 4;
  const timeoutMs = options.timeoutMs ?? 15000;
  // 两种宿主都认：预览页挂 `__preview`，上线壳挂 `__site`（`shared/sites/shell.ts`）。
  // 它们的 `snapshot()` 形状一致（壳多 `slug`/`ctaEnabled`/`tapped` 三个字段），所以调用方不用分支。
  await page.waitForFunction(
    (wanted) => {
      const handle = globalThis.__preview ?? globalThis.__site;
      return Boolean(handle) && handle.snapshot().frames >= wanted;
    },
    frames,
    { timeout: timeoutMs },
  );
  return page.evaluate(() => (globalThis.__preview ?? globalThis.__site).snapshot());
}

/**
 * 截图。
 *
 * @param {object} page playwright 页面
 * @param {string} outPath 输出路径（repo 相对或绝对）
 * @returns {Promise<string>} 实际写入的绝对路径
 */
export async function screenshot(page, outPath) {
  const absolute = path.isAbsolute(outPath) ? outPath : path.join(REPO_ROOT, outPath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  await page.screenshot({ path: absolute });
  return absolute;
}

/**
 * 一句话取证：打开一个预览页 → 等就绪 → 打印快照 → 截图。
 *
 * @param {string} filePath HTML 路径
 * @param {object} [options]
 * @param {string} [options.out] 截图输出路径
 * @param {number} [options.width]
 * @param {number} [options.height]
 * @param {number} [options.dpr]
 * @param {boolean} [options.webgpu]
 * @param {number} [options.frames] 截图前推进多少帧（默认 8，避开首帧空画面）
 * @returns {Promise<{ snapshot: object, errors: string[], out: string|null }>}
 */
export async function capture(filePath, options = {}) {
  const { browser, close } = await launch({ headless: options.headless, webgpu: options.webgpu });
  try {
    const session = await openFile(browser, filePath, options);
    try {
      const snapshot = await waitForPreview(session.page, { frames: options.frames ?? 8 });
      const out = options.out ? await screenshot(session.page, options.out) : null;
      return { snapshot, errors: session.errors, out };
    } finally {
      await session.close();
    }
  } finally {
    await close();
  }
}

/**
 * 命令行入口。
 *
 * @returns {Promise<void>}
 */
async function main() {
  const argv = process.argv.slice(2);
  const flag = (name, fallback) => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 && argv[index + 1] !== undefined ? argv[index + 1] : fallback;
  };
  const numberFlag = (name, fallback) => {
    const raw = flag(name, null);
    const value = raw === null ? NaN : Number(raw);
    return Number.isFinite(value) ? value : fallback;
  };

  if (argv.includes('--where')) {
    // 注意：不能用裸 `require.resolve('playwright')` —— 包在 npx 缓存里时裸名解析必失败，
    // 而 resolvePlaywright() 已经会扫缓存，这里只是把「用到了哪一份」打印出来。
    const playwright = resolvePlaywright();
    console.log(`chromium: ${resolveChromium()}`);
    console.log(`playwright: ${typeof playwright.chromium?.launch === 'function' ? '已加载（可 launch）' : '加载了但形状不对'}`);
    return;
  }

  const shot = flag('shot', null);
  if (!shot) {
    console.error('用法：node tests/lib/browser.mjs --shot <file.html> [--out <png>] [--width 1280] [--height 720] [--dpr 2] [--webgpu]');
    process.exit(2);
  }

  // ★ **证据资格**前置检查（不是方便，是资格）：
  //   `frames < 60` / 宽度 < 1280 / 处于降档 的图**不得作为判定依据**，只能当探针分离原因。
  //   协议原话：「一张不能用来判的图，比没有图更危险 —— 它会被当成证据。」
  //   （出处：`kr3.png`，`frames 1` + 760px，PM 用它判形态被判无效。）
  const wantFrames = numberFlag('frames', 60);
  const wantWidth = numberFlag('width', DEFAULT_VIEWPORT.width);
  if (wantFrames < 60 || wantWidth < 1280) {
    console.error(
      `这张图不能用于判定（frames=${wantFrames} / 宽度=${wantWidth}），`
      + `请用 --frames 60 --width 2560 重截。`,
    );
    console.error('  依据：MANUAL-QA 截图协议 —— frames<60 / 宽<1280 / 降档 的图一律不作判定依据。');
    process.exit(3);
  }

  const result = await capture(shot, {
    out: flag('out', null),
    width: wantWidth,
    height: numberFlag('height', DEFAULT_VIEWPORT.height),
    dpr: numberFlag('dpr', DEFAULT_VIEWPORT.dpr),
    webgpu: argv.includes('--webgpu'),
    frames: wantFrames,
  });

  if (result.snapshot && result.snapshot.state === 'degraded') {
    console.error('⚠️ 这张图是在**降档**状态下截的，不能作为判定依据（只能当探针分离原因）。');
    console.error(`  degraded: ${JSON.stringify(result.snapshot.degraded)}`);
    process.exit(4);
  }

  console.log(`[browser] snapshot: ${JSON.stringify(result.snapshot, null, 0)}`);
  console.log(`[browser] console errors: ${result.errors.length === 0 ? '（无）' : result.errors.join(' | ')}`);
  if (result.out) console.log(`[browser] 截图：${result.out}`);
  if (result.errors.length > 0) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[browser] 失败：${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
