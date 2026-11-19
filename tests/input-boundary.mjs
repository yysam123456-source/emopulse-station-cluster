// 输入边界的门 —— 一条防「误吃」，一条防「该吃没吃到」。**两条必须成对。**
//
// 为什么成对：只测「点菜单不能让世界收到按下」的话，把转发整个关掉也能全绿；
// 那只证明"不会误吃"，证明不了"按钮还能用"。而 `/hug` 的主按钮（`Let it go`）恰恰依赖
// 「点在 DOM 按钮上 → 世界收到一次按下」—— 它不是一个世界内的按钮，它是 UI。
//
// ★ 本门跑**两个宿主**，因为它们是两个独立实现：
//   · `shared/stage/preview/host.ts`  —— 预览用（`__preview`）
//   · `shared/sites/shell.ts`         —— **真正上线的那个**（`__site`）
//   同一个 bug 在壳里复发就等于没修（T20 的原话）。壳上还多一条：真主按钮 `#cta` 必须能注入。
//
// 规则（架构师 + 主理人裁定）：
//   ① 世界只接收**画布上**的指针：`event.target !== canvas` 一律不转发
//   ② UI 若要引起世界变化，由宿主**显式**调用 `stage.setPointer`（`tap()`）
//   ③ `pointerup` 不过滤且总是释放（否则 down 卡死，比不响应更糟）
//   ④ 模态 UI 打开期间，画布上的指针也不转发
//
// 用法：node tests/input-boundary.mjs
import { launch, openFile, REPO_ROOT } from './lib/browser.mjs';
import { existsSync } from 'node:fs';
import path from 'node:path';

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

/** 两个宿主都要过同一组断言。 */
const TARGETS = [
  {
    label: '预览宿主（preview/host.ts）',
    path: path.join(REPO_ROOT, 'dist', 'preview', 'empty.html'),
    handle: '__preview',
    hint: 'npm run preview:empty',
    hasCta: false,
  },
  {
    label: '上线壳（sites/shell.ts，/hug）',
    path: path.join(REPO_ROOT, 'dist', 'hug', 'index.html'),
    handle: '__site',
    hint: 'npm run build:sites',
    hasCta: true,
  },
];

for (const target of TARGETS) {
  if (!existsSync(target.path)) {
    console.error(`[input-boundary] 缺产物：${target.path}\n先跑 \`${target.hint}\``);
    process.exit(1);
  }
}

/**
 * 装逐帧采样器。
 *
 * ★ 必须包 `stage.frame`，不能另起 rAF：宿主的一帧是「置 down=true → stage.frame() → 立刻置 false」，
 *   另一个 rAF 回调跑在同一帧的任何位置都可能看不到那个 true（实测过：包 rAF 时 B3/B5 恒为 0 次上升沿）。
 *   包住 frame 并在调用前读一次，读到的正是**零件这一帧看到的值**。
 *
 * @param {object} page playwright 页
 * @param {string} handle 全局句柄名
 * @returns {Promise<void>}
 */
async function installSampler(page, handle) {
  await page.evaluate((handleName) => {
    globalThis.__downLog = [];
    const stage = globalThis[handleName].stage;
    if (!stage.__sampled) {
      const original = stage.frame.bind(stage);
      stage.frame = (ts) => {
        if (globalThis.__downLog.length < 4000) {
          globalThis.__downLog.push(stage.world.frame.pointer.down ? 1 : 0);
        }
        original(ts);
      };
      stage.__sampled = true;
    }
  }, handle);
}

/**
 * 读回上升沿次数与当前值。
 *
 * @param {object} page playwright 页
 * @returns {Promise<{ edges: number, current: boolean, frames: number }>}
 */
async function readEdges(page) {
  return page.evaluate(() => {
    const log = globalThis.__downLog;
    let edges = 0;
    for (let i = 1; i < log.length; i += 1) if (log[i] === 1 && log[i - 1] === 0) edges += 1;
    return { edges, current: log[log.length - 1] === 1, frames: log.length };
  });
}

/** 等若干帧。 */
const settle = (page, frames = 6) => page.evaluate((n) => new Promise((resolve) => {
  let left = n;
  const tick = () => { left -= 1; if (left <= 0) resolve(); else requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}), frames);

/**
 * 对一个宿主跑完整一组断言。
 *
 * @param {object} browser playwright browser
 * @param {object} target TARGETS 的一项
 * @returns {Promise<void>}
 */
async function runTarget(browser, target) {
  const session = await openFile(browser, target.path, { width: 1280, height: 720, dpr: 2 });
  const { page } = session;
  const tag = target.label;
  try {
    // 等宿主把句柄挂上来
    await page.evaluate((handleName) => new Promise((resolve) => {
      const tick = () => (globalThis[handleName] ? resolve(true) : setTimeout(tick, 16));
      tick();
    }), target.handle);

    // 页面里造一个「Esc 菜单项」：它不是 canvas，落在 canvas 之外的 DOM 上
    await page.evaluate(() => {
      const button = document.createElement('button');
      button.id = 'fake-menu-item';
      button.textContent = 'Leave';
      button.style.cssText = 'position:fixed;left:8px;top:8px;z-index:9;width:80px;height:28px';
      document.body.appendChild(button);
    });

    // ── B1 防误吃：按住 DOM 按钮不得出现上升沿 ──
    await installSampler(page, target.handle);
    await settle(page, 3);
    // ★ 必须「按住不放」，不能用 page.click()：click = down + up 落在同一帧内互相抵消，
    //   采样器两帧都是 false —— 那样把 target 过滤删掉也照样绿（第一版就是这么假绿的）。
    await page.evaluate(() => {
      document.getElementById('fake-menu-item')
        .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 2, button: 0 }));
    });
    await settle(page, 6);
    const afterButton = await readEdges(page);
    check(afterButton.edges === 0, `${tag}: 按住 DOM 按钮产生了 ${afterButton.edges} 次按下上升沿（世界被 UI 指针触发了）`);
    check(afterButton.current === false, `${tag}: 按住 DOM 按钮时 pointer.down 变成了 true`);
    await page.evaluate(() => {
      document.getElementById('fake-menu-item')
        .dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 2 }));
    });
    await settle(page, 3);

    // ── B2 防误吃（模态）：菜单打开时画布上的按下也不转发 ──
    await page.evaluate((handleName) => globalThis[handleName].setModal(true), target.handle);
    await settle(page, 3);
    await page.evaluate(() => {
      const canvas = document.getElementById('stage');
      const rect = canvas.getBoundingClientRect();
      canvas.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, pointerId: 1, clientX: rect.width / 2, clientY: rect.height / 2,
      }));
    });
    await settle(page, 6);
    const afterModal = await readEdges(page);
    check(afterModal.edges === 0, `${tag}: 模态打开时画布按下产生了 ${afterModal.edges} 次上升沿（第 ④ 条失效）`);
    await page.evaluate((handleName) => globalThis[handleName].setModal(false), target.handle);
    await settle(page, 4);

    // ── B2b 模态打开时，**菜单项上的 pointermove 也不得进入世界** ──
    // 这条防的是 `host.ts:219` 那个 `&& !uiModalOpen` 写反：它让"只在模态关闭时过滤"，
    // 于是菜单上移动会带动世界视差 —— 看起来在守、实际没守。
    {
      await page.evaluate((handleName) => globalThis[handleName].setModal(true), target.handle);
      await settle(page, 2);
      const before = await page.evaluate((handleName) => {
        const p = globalThis[handleName].stage.world.frame.pointer;
        return { x: p.x, y: p.y };
      }, target.handle);
      await page.evaluate(() => {
        document.getElementById('fake-menu-item')
          .dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 3, clientX: 900, clientY: 600 }));
      });
      await settle(page, 4);
      const after = await page.evaluate((handleName) => {
        const p = globalThis[handleName].stage.world.frame.pointer;
        return { x: p.x, y: p.y };
      }, target.handle);
      check(
        Math.abs(after.x - before.x) < 1e-6 && Math.abs(after.y - before.y) < 1e-6,
        `${tag}: 模态打开时菜单项上的 pointermove 改变了世界指针（${before.x.toFixed(3)},${before.y.toFixed(3)} → ${after.x.toFixed(3)},${after.y.toFixed(3)}）`,
      );
      await page.evaluate((handleName) => globalThis[handleName].setModal(false), target.handle);
      await settle(page, 2);
    }

    // ── B3 该吃必须吃到：画布上的真实按下必须产生上升沿 ──
    await installSampler(page, target.handle);
    await settle(page, 3);
    await page.evaluate(() => {
      const canvas = document.getElementById('stage');
      const rect = canvas.getBoundingClientRect();
      canvas.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, pointerId: 1, clientX: rect.width * 0.4, clientY: rect.height * 0.6,
      }));
    });
    await settle(page, 6);
    const afterCanvasDown = await readEdges(page);
    check(afterCanvasDown.edges === 1, `${tag}: 画布按下应产生恰好 1 次上升沿，实得 ${afterCanvasDown.edges}`);

    // ── B4 松手必须释放（即使松在别处）──
    await page.evaluate(() => {
      window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
    });
    await settle(page, 6);
    const afterUp = await readEdges(page);
    check(afterUp.current === false, `${tag}: pointerup 之后 pointer.down 仍为 true（世界永远按着）`);

    // ── B5 UI 意图注入：tap() 必须产生**恰好 1 次**上升沿并回到 false ──
    await installSampler(page, target.handle);
    await settle(page, 3);
    await page.evaluate((handleName) => globalThis[handleName].tap(0.42, 0.58), target.handle);
    await settle(page, 8);
    const afterTap = await readEdges(page);
    check(afterTap.edges === 1, `${tag}: tap() 应产生恰好 1 次上升沿，实得 ${afterTap.edges}`);
    check(afterTap.current === false, `${tag}: tap() 之后 pointer.down 应回到 false（注入必须只持续一帧）`);

    const tapPos = await page.evaluate((handleName) => {
      const pointer = globalThis[handleName].stage.world.frame.pointer;
      return { x: pointer.x, y: pointer.y };
    }, target.handle);
    check(
      Math.abs(tapPos.x - 0.42) < 0.06 && Math.abs(tapPos.y - 0.58) < 0.06,
      `${tag}: tap(0.42,0.58) 后 pointer=(${tapPos.x.toFixed(2)},${tapPos.y.toFixed(2)})，位置没被传进去`,
    );

    // ── B6 壳专有：真主按钮点一次 = 恰好 1 次上升沿（产品路径，不是 API 路径）──
    let afterCta = null;
    if (target.hasCta) {
      await installSampler(page, target.handle);
      await settle(page, 3);
      const hasCta = await page.evaluate(() => document.getElementById('cta') !== null);
      check(hasCta, `${tag}: 该站应有主按钮 #cta`);
      if (hasCta) {
        await page.evaluate(() => document.getElementById('cta')
          .dispatchEvent(new MouseEvent('click', { bubbles: true })));
        await settle(page, 8);
        afterCta = await readEdges(page);
        check(afterCta.edges === 1, `${tag}: 点主按钮应产生恰好 1 次上升沿，实得 ${afterCta.edges}`);
        check(afterCta.current === false, `${tag}: 点主按钮后 pointer.down 未释放`);
      }
    }

    check(session.errors.length === 0, `${tag}: 控制台有错误：${session.errors.join(' | ')}`);

    console.log(`  ${tag}`);
    console.log(`    B1 按住 DOM 按钮：上升沿 ${afterButton.edges}（需 0）· down=${afterButton.current}`);
    console.log(`    B2 模态时画布按下：上升沿 ${afterModal.edges}（需 0）`);
    console.log(`    B3 画布按下：上升沿 ${afterCanvasDown.edges}（需 1）`);
    console.log(`    B4 pointerup 后 down=${afterUp.current}（需 false）`);
    console.log(`    B5 tap()：上升沿 ${afterTap.edges}（需 1）· 位置 (${tapPos.x.toFixed(2)},${tapPos.y.toFixed(2)})`);
    if (afterCta) console.log(`    B6 点 #cta：上升沿 ${afterCta.edges}（需 1）· down=${afterCta.current}`);
  } finally {
    await session.close();
  }
}

const { browser, close } = await launch({ headless: true });
try {
  console.log('输入边界门（真实 Chromium，两个宿主各跑一遍）');
  for (const target of TARGETS) {
    await runTarget(browser, target);
  }
} finally {
  await close();
}

if (failures.length === 0) {
  console.log(`\ninput-boundary: PASS ${checks}/${checks}`);
  process.exit(0);
}
console.error(`\ninput-boundary: FAIL ${failures.length}/${checks}`);
for (const failure of failures) console.error(`  - ${failure}`);
process.exit(1);
