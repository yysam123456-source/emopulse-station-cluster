// Playwright 兼容层：把 `tests/lib/browser.mjs` 的公开 API 映射到零依赖 CDP。
// 目的只有一个：`npm run verify:dom` 不再要求本机安装 playwright。
// 不支持 Playwright 的全部能力；只实现 site-dom 用到的 evaluate / keyboard.press / waitForPreview。
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { launch as cdpLaunch } from './cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..', '..');

const KEY_CODES = {
  Escape: ['Escape', 27],
  Enter: ['Enter', 13],
  Tab: ['Tab', 9],
  ' ': ['Space', 32],
};

function makePage(session) {
  return {
    evaluate: (fn) => session.evaluate(`(${fn.toString()})()`),
    keyboard: {
      press: async (key) => {
        const [code, keyCode] = KEY_CODES[key] ?? [key, 0];
        await session.send('Input.dispatchKeyEvent', {
          type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode,
        });
        await session.send('Input.dispatchKeyEvent', {
          type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode,
        });
        await sleep(80);
      },
    },
  };
}

/**
 * 启动一个无头浏览器；返回与 browser.mjs 相同的 `{ browser, close }` 形状。
 * browser.session 是唯一页面；站点门逐站 navigate，不反复新开进程。
 */
export async function launch(options = {}) {
  const session = await cdpLaunch({
    width: options.width ?? 1280,
    height: options.height ?? 720,
    dpr: options.dpr ?? 1,
    mobile: options.mobile ?? false,
  });
  return {
    browser: { session },
    close: async () => { await session.close(); },
  };
}

/**
 * 打开本地 HTML 产物。`session.close` 是 no-op：多个站点共用同一浏览器，
 * 真正关闭由 launch() 返回的 close() 负责。
 */
export async function openFile(browser, file, options = {}) {
  const session = browser.session;
  if (!session) throw new Error('openFile 需要 launch() 返回的 browser.session');
  await session.send('Emulation.setDeviceMetricsOverride', {
    width: options.width ?? 1280,
    height: options.height ?? 720,
    deviceScaleFactor: options.dpr ?? 1,
    mobile: false,
  });
  await session.goto(pathToFileURL(path.resolve(file)).href, {
    frames: 4,
    timeoutMs: options.timeoutMs ?? 240000,
    handleGraceMs: 8000,
  });
  return { page: makePage(session), close: async () => {} };
}

/** 等 `__site` / `__preview` 的帧数到达门槛。 */
export async function waitForPreview(page, { frames = 8, timeoutMs = 240000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const seen = await page.evaluate(() => {
      const handle = globalThis.__site ?? globalThis.__preview;
      if (!handle || typeof handle.snapshot !== 'function') return -1;
      const snapshot = handle.snapshot();
      return snapshot && typeof snapshot.frames === 'number' ? snapshot.frames : -1;
    });
    if (seen >= frames) return seen;
    await sleep(250);
  }
  throw new Error(`waitForPreview: ${frames} 帧内没有就绪`);
}
