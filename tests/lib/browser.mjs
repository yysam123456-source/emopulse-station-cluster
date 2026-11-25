// 浏览器封装：现在全部走零依赖 CDP（tests/lib/cdp.mjs）。
//
// 历史原因：本文件原来只认 macOS 的 playwright 缓存，Windows 上 11 条门全部
// “playwright not found”。2026-11-25 起公开 API 不变，内部换成 cdp-browser；
// `launch` / `openFile` / `waitForPreview` / `screenshot` 的签名保持兼容。
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  REPO_ROOT as CDP_REPO_ROOT,
  capture as cdpCapture,
  launch as cdpLaunch,
  openFile as cdpOpenFile,
  screenshot as cdpScreenshot,
  waitForPreview as cdpWaitForPreview,
} from './cdp-browser.mjs';

/** 仓库根绝对路径。 */
export const REPO_ROOT = CDP_REPO_ROOT;

/** 默认视口（与各处 bench / 成本估算同源）。 */
export const DEFAULT_VIEWPORT = Object.freeze({ width: 1280, height: 720, dpr: 2 });

export const launch = cdpLaunch;
export const openFile = cdpOpenFile;
export const waitForPreview = cdpWaitForPreview;
export const screenshot = cdpScreenshot;

/** 兼容旧 API：打开、等帧、截图，返回快照/错误/产物路径。 */
export async function capture(filePath, options = {}) {
  const { browser, close } = await launch(options);
  try {
    const session = await openFile(browser, filePath, options);
    const snapshot = await waitForPreview(session.page, { frames: options.frames ?? 8 });
    await sleep(400);
    const out = options.out ? await screenshot(session.page, options.out) : null;
    return { snapshot, errors: browser.session.errors, out };
  } finally {
    await close();
  }
}

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
    console.log('browser: 零依赖 CDP（tests/lib/cdp.mjs）；Edge/Chrome/Chromium 自动探测');
    return;
  }

  const shot = flag('shot', null);
  if (!shot) {
    console.error('用法：node tests/lib/browser.mjs --shot <file.html> [--out <png>] [--width 1280] [--height 720] [--dpr 2] [--webgpu]');
    process.exit(2);
  }

  // ★ 证据资格前置检查：frames < 60 / 宽度 < 1280 的图不得作为判定依据。
  const wantFrames = numberFlag('frames', 60);
  const wantWidth = numberFlag('width', DEFAULT_VIEWPORT.width);
  if (wantFrames < 60 || wantWidth < 1280) {
    console.error(
      `这张图不能用于判定（frames=${wantFrames} / 宽度=${wantWidth}），`
      + '请用 --frames 60 --width 2560 重截。',
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
    console.error('⚠️ 这张图是在降档状态下截的，不能作为判定依据（只能当探针分离原因）。');
    console.error(`  degraded: ${JSON.stringify(result.snapshot.degraded)}`);
    process.exit(4);
  }

  console.log(`[browser] snapshot: ${JSON.stringify(result.snapshot, null, 0)}`);
  console.log(`[browser] console errors: ${result.errors.length === 0 ? '（无）' : result.errors.join(' | ')}`);
  if (result.out) console.log(`[browser] 截图：${result.out}`);
  // WebSocket 的底层 socket 在部分 Edge 构建上即使 close() 后仍会吊住事件循环，
  // 截图已经落盘、浏览器也已关闭；这里显式收尾，避免 CLI 看起来“卡住”。
  process.exit(result.errors.length > 0 ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[browser] 失败：${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
