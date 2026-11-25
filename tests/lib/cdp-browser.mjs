// Playwright 兼容层：把旧 `tests/lib/browser.mjs` 的公开 API 映射到零依赖 CDP。
//
// 目标：Windows / macOS / Linux 都不再依赖 playwright；旧门只改 import 的实现，
// 不改断言。已覆盖旧门实际用到的 evaluate(arg) / keyboard / mouse / screenshot /
// waitForFunction / waitForTimeout / click / reload / download。
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch as cdpLaunch } from './cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..', '..');

const KEY_CODES = {
  Escape: ['Escape', 27],
  Enter: ['Enter', 13],
  Tab: ['Tab', 9],
  ' ': ['Space', 32],
  Backspace: ['Backspace', 8],
};

function keyFor(key) {
  if (KEY_CODES[key]) return KEY_CODES[key];
  if (key.length === 1) {
    const upper = key.toUpperCase();
    return [`Key${upper}`, upper.charCodeAt(0)];
  }
  return [key, 0];
}

function makePage(session, downloadDir) {
  let lastX = 0;
  let lastY = 0;
  return {
    /** 与 playwright 的 page.evaluate(fn, arg) 同形；arg 必须可 JSON 序列化。 */
    evaluate: (fn, arg) => {
      if (typeof fn === 'function') {
        if (arg === undefined) return session.evaluate(`(${fn.toString()})()`);
        return session.evaluate(`(${fn.toString()})(${JSON.stringify(arg)})`);
      }
      return session.evaluate(String(fn));
    },
    keyboard: {
      press: async (key) => {
        const [code, keyCode] = keyFor(key);
        await session.send('Input.dispatchKeyEvent', {
          type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode,
        });
        await session.send('Input.dispatchKeyEvent', {
          type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode,
        });
        await sleep(80);
      },
    },
    mouse: {
      move: async (x, y, { steps = 1 } = {}) => {
        const fromX = lastX;
        const fromY = lastY;
        const n = Math.max(1, Number(steps) || 1);
        for (let i = 1; i <= n; i += 1) {
          const t = i / n;
          const px = fromX + (x - fromX) * t;
          const py = fromY + (y - fromY) * t;
          await session.move(px, py, false);
        }
        lastX = x;
        lastY = y;
      },
      down: async () => { await session.down(lastX, lastY); },
      up: async () => { await session.up(lastX, lastY); },
    },
    /** 返回 PNG/JPEG Buffer，和 playwright 一样；不落盘。scale:'css' 时按 CSS 像素截图。 */
    screenshot: async ({ type = 'png', fullPage = false, scale = 'device' } = {}) => {
      const format = type === 'jpeg' ? 'jpeg' : 'png';
      const params = { format };
      if (format === 'jpeg') params.quality = 80;
      const restoreDpr = session.options.dpr;
      if (scale === 'css' && restoreDpr !== 1) {
        await session.setViewport(session.options.width, session.options.height, 1, session.options.mobile);
      }
      try {
        if (fullPage) {
          const metrics = await session.send('Page.getLayoutMetrics');
          const size = metrics.cssContentSize ?? metrics.contentSize;
          params.clip = { x: 0, y: 0, width: Math.ceil(size.width), height: Math.min(Math.ceil(size.height), 12000), scale: 1 };
          params.captureBeyondViewport = true;
        }
        const { data } = await session.send('Page.captureScreenshot', params);
        return Buffer.from(data, 'base64');
      } finally {
        if (scale === 'css' && restoreDpr !== 1) {
          await session.setViewport(session.options.width, session.options.height, restoreDpr, session.options.mobile);
        }
      }
    },
    /** 轮询一个返回 truthy 的函数；timeout 单位毫秒。 */
    waitForFunction: async (fn, arg = null, { timeout = 15000, polling = 100 } = {}) => {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        const value = await (typeof fn === 'function'
          ? (arg === null ? session.evaluate(`(${fn.toString()})()`) : session.evaluate(`(${fn.toString()})(${JSON.stringify(arg)})`))
          : session.evaluate(String(fn)));
        if (value) return value;
        await sleep(polling);
      }
      throw new Error(`waitForFunction timeout after ${timeout}ms`);
    },
    waitForTimeout: (ms) => sleep(ms),
    /** 点一个选择器中心（用真实鼠标/触摸；不是 DOM click）。 */
    click: async (selector) => {
      const rect = await session.evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const st = getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden' || r.width <= 0 || r.height <= 0) return null;
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      })()`);
      if (!rect) throw new Error(`click: 找不到可见元素 ${selector}`);
      lastX = rect.x;
      lastY = rect.y;
      await session.tap(rect.x, rect.y);
    },
    reload: async () => {
      await session.send('Page.reload', { ignoreCache: true });
      await sleep(1800);
    },
    /** 旧门只用到 download；返回 saveAs，而不是把 CDP 的下载事件全暴露。 */
    waitForEvent: async (name, { timeout = 15000 } = {}) => {
      if (name !== 'download') throw new Error(`waitForEvent: 不支持 ${name}`);
      if (!downloadDir) throw new Error('waitForEvent(download): 没有配置下载目录');
      const deadline = Date.now() + timeout;
      let file = null;
      while (Date.now() < deadline) {
        const files = existsSync(downloadDir)
          ? readdirSync(downloadDir).filter((name) => !name.endsWith('.crdownload') && !name.endsWith('.tmp'))
          : [];
        if (files.length) { file = path.join(downloadDir, files[files.length - 1]); break; }
        await sleep(120);
      }
      if (!file) throw new Error(`waitForEvent(download): ${timeout}ms 内没有文件`);
      return {
        suggestedFilename: path.basename(file),
        saveAs: async (out) => {
          mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
          copyFileSync(file, path.resolve(out));
        },
      };
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
    gpu: options.gpu,
    args: options.args,
  });
  const downloadDir = path.join(os.tmpdir(), `qa-download-${process.pid}-${Date.now()}`);
  mkdirSync(downloadDir, { recursive: true });
  try {
    await session.send('Browser.setDownloadBehavior', {
      behavior: 'allow', downloadPath: downloadDir, eventsEnabled: true,
    });
  } catch { /* 某些构建只支持 Page.setDownloadBehavior；导出分支会明确报错 */ }
  const page = makePage(session, downloadDir);
  return {
    browser: { session, page, downloadDir },
    close: async () => {
      await session.close();
      try { rmSync(downloadDir, { recursive: true, force: true }); } catch { /* Edge 可能还占着 */ }
    },
  };
}

/**
 * 打开本地 HTML 产物。`page.close` 是 no-op：多个站点共用同一浏览器，
 * 真正关闭由 launch() 返回的 close() 负责。
 */
export async function openFile(browser, file, options = {}) {
  const session = browser.session;
  if (!session) throw new Error('openFile 需要 launch() 返回的 browser.session');
  const width = options.width ?? 1280;
  const height = options.height ?? 720;
  const dpr = options.dpr ?? 1;
  const mobile = Boolean(options.mobile);
  await session.setViewport(width, height, dpr, mobile);
  const url = pathToFileURL(path.resolve(file));
  if (options.query) url.search = new URLSearchParams(options.query).toString();
  await session.goto(url.href, {
    frames: options.frames ?? 4,
    timeoutMs: options.timeoutMs ?? 240000,
    handleGraceMs: options.handleGraceMs ?? 8000,
  });
  return {
    page: makePage(session, browser.downloadDir),
    errors: session.errors,
    console: session.console,
    close: async () => {},
  };
}

/** 等 `__site` / `__preview` 的帧数到达门槛；返回最后一张快照（兼容旧 API）。 */
export async function waitForPreview(page, { frames = 8, timeoutMs = 240000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await page.evaluate(() => {
      const handle = globalThis.__site ?? globalThis.__preview;
      if (!handle || typeof handle.snapshot !== 'function') return null;
      const snapshot = handle.snapshot();
      return snapshot && typeof snapshot.frames === 'number' ? snapshot : null;
    });
    if (last && last.frames >= frames) return last;
    await sleep(250);
  }
  throw new Error(`waitForPreview: ${frames} 帧内没有就绪（最后 frames=${last?.frames ?? 'n/a'}）`);
}

/** 截图并落盘；保留旧 browser.mjs 的签名。 */
export async function screenshot(page, outPath) {
  const buffer = await page.screenshot({ type: 'png' });
  mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  writeFileSync(path.resolve(outPath), buffer);
  return path.resolve(outPath);
}

/** 一条命令出一张图；CLI 入口仍由 browser.mjs 提供。 */
export async function capture(filePath, options = {}) {
  const { browser, close } = await launch(options);
  try {
    const session = await openFile(browser, filePath, options);
    await waitForPreview(session.page, { frames: options.frames ?? 4 });
    return await screenshot(session.page, options.out ?? path.join(REPO_ROOT, 'dist', 'preview', 'shot.png'));
  } finally {
    await close();
  }
}
