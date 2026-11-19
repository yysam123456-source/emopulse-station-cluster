// /license 的仪式门：三段必须**出字**、终态才有保存、导出比例与不变量。
//
// 四条（对应主理人给的门）：
//   1. 三段能被驱动到终态，且每个阶段 DOM 里真的有那个词
//   2. `#save` 只在 approved 之后出现
//   3. 导出图 1410×1000、比例 = 屏上纸的 1.4142
//   4. 导出不改变编号/日期/宣言句（同输入两次导出字节一致）
import { launch, openFile, waitForPreview, REPO_ROOT } from './lib/browser.mjs';
import { existsSync } from 'node:fs';
import path from 'node:path';

const failures = [];
let checks = 0;
const check = (ok, msg) => { checks += 1; if (!ok) failures.push(msg); };

const file = path.join(REPO_ROOT, 'dist', 'license', 'index.html');
if (!existsSync(file)) {
  console.error('[license-ritual] 缺产物：先跑 npm run build:sites');
  process.exit(1);
}

const { browser, close } = await launch({ headless: true });
try {
  const session = await openFile(browser, file, { width: 1280, height: 720, dpr: 2 });
  const { page } = session;
  try {
    await waitForPreview(page, { frames: 6 });
    await page.waitForFunction(() => typeof globalThis.__site?.exportCard === 'function', null, { timeout: 15000 });

    // ── 1. 三段：点 #cta 开始，逐段收集 DOM 里的词 ──
    const seen = [];
    await page.evaluate(() => {
      const el = document.getElementById('stage-word');
      globalThis.__words = [];
      const obs = new MutationObserver(() => {
        if (!el.hidden && el.textContent) globalThis.__words.push(el.textContent.trim());
      });
      obs.observe(el, { attributes: true, childList: true, characterData: true, subtree: true });
      document.getElementById('cta').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    // 等它走完全程（三段共 ~6.4s）
    await page.waitForFunction(
      () => globalThis.__site && document.getElementById('stage-word')?.dataset.stage === 'approved',
      null,
      { timeout: 20000 },
    );
    const words = await page.evaluate(() => {
      const el = document.getElementById('stage-word');
      return { seen: globalThis.__words, stage: el.dataset.stage, text: el.textContent.trim(), visible: !el.hidden };
    });
    for (const expected of ['verifying', 'stamping', 'approved']) {
      check(words.seen.includes(expected), `没有显示 "${expected}"（实际序列：${JSON.stringify(words.seen)}）`);
    }
    check(words.stage === 'approved', `终态 stage=${words.stage}，应 approved`);
    check(words.visible === true, '阶段词在终态应可见');

    // ── 2. 保存按钮只在 approved 后出现 ──
    const saveState = await page.evaluate(() => {
      const el = document.getElementById('save');
      return { hidden: el.hidden, rect: el.getBoundingClientRect().width > 0 };
    });
    check(saveState.hidden === false, '#save 在 approved 之后仍隐藏');
    check(saveState.rect === true, '#save 存在但没有可见尺寸');

    // ── 3/4. 导出：尺寸 + 比例 + 不变量 ──
    const exp = await page.evaluate(() => {
      const url1 = globalThis.__site.exportCard();
      const url2 = globalThis.__site.exportCard();
      const meta = globalThis.__site.meta();
      const bin = atob(url1.split(',')[1]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      const view = new DataView(bytes.buffer);
      // PNG: 宽高在第 16..24 字节（IHDR）
      return {
        w: view.getUint32(16), h: view.getUint32(20),
        same: url1 === url2,
        meta,
        bytes: bytes.length,
      };
    });
    check(exp.w === 1410, `导出宽 ${exp.w}，应为 1410`);
    check(exp.h === 1000, `导出高 ${exp.h}，应为 1000`);
    const aspect = exp.w / exp.h;
    check(Math.abs(aspect - 1.4142) < 0.01, `导出比例 ${aspect.toFixed(4)}，应与屏上纸 1.4142 一致`);
    check(exp.same === true, '同输入两次导出字节不一致（导出里混进了时钟/随机）');
    check(/^EMP-/.test(exp.meta.serial), `编号格式异常：${exp.meta.serial}`);
    check(typeof exp.meta.date === 'string' && exp.meta.date.length > 0, '日期为空');

    console.log('license 仪式门');
    console.log(`  阶段词序列：${JSON.stringify(words.seen)}`);
    console.log(`  终态：${words.stage} · 可见=${words.visible} · #save 隐藏=${saveState.hidden}`);
    console.log(`  导出：${exp.w}×${exp.h}（比例 ${aspect.toFixed(4)}）· ${exp.bytes} B · 同输入一致=${exp.same}`);
    console.log(`  不变量：编号 ${exp.meta.serial} · 日期 ${exp.meta.date}`);
  } finally {
    await session.close();
  }
} finally {
  await close();
}

if (failures.length === 0) {
  console.log(`\nlicense-ritual: PASS ${checks}/${checks}`);
  process.exit(0);
}
console.error(`\nlicense-ritual: FAIL ${failures.length}/${checks}`);
for (const f of failures) console.error(`  - ${f}`);
process.exit(1);
