// /license 的「停留/搬弄」门：**四个 flag 各自置 false 后画面必须有变化**（死 flag 会被这条抓出来）。
//
// 为什么不去比像素截图：四个 flag 的效果分布在 CSS 变量（光角 / 折角 / 章角）上，
// 直接读变量既确定又能指出"哪个 flag 没接上"。像素差留给 PM 的目视。
import { launch, openFile, waitForPreview, REPO_ROOT } from './lib/browser.mjs';
import { existsSync } from 'node:fs';
import path from 'node:path';

const failures = [];
let checks = 0;
const check = (ok, msg) => { checks += 1; if (!ok) failures.push(msg); };

const file = path.join(REPO_ROOT, 'dist', 'license', 'index.html');
if (!existsSync(file)) { console.error('[license-stay] 缺产物：先跑 npm run build:sites'); process.exit(1); }

const { browser, close } = await launch({ headless: true });
try {
  const session = await openFile(browser, file, { width: 1280, height: 720, dpr: 2 });
  const { page } = session;
  try {
    await waitForPreview(page, { frames: 6 });
    await page.waitForFunction(() => Boolean(globalThis.__stay), null, { timeout: 15000 });

    // 变量写在不同元素上（sun 在 body、fold 在 #sheet、tilt 在 #seal），必须各读各的：
    // 第一版全读 documentElement，四个数都是空串 —— **读错了地方，断言就永远失败**（好在它是红，不是假绿）。
    const read = () => page.evaluate(() => ({
      sun: document.body.style.getPropertyValue('--sun-angle').trim(),
      fold: (document.getElementById('sheet')?.style.getPropertyValue('--fold') ?? '').trim(),
      tilt: (document.getElementById('seal')?.style.getPropertyValue('--seal-tilt') ?? '').trim(),
      stay: { ...globalThis.__stay },
    }));

    const setFlag = (name, value) => page.evaluate(({ n, v }) => { globalThis.__stay[n] = v; }, { n: name, v: value });

    // ── drift：光角随时间长移 ──
    const a1 = await read();
    await page.waitForTimeout(1200);
    const a2 = await read();
    check(a1.sun !== a2.sun, `drift=true 时光角应随时间变（${a1.sun} → ${a2.sun}）`);
    await setFlag('drift', false);
    await page.waitForTimeout(400);
    const b1 = await read();
    await page.waitForTimeout(900);
    const b2 = await read();
    check(b1.sun === b2.sun, `drift=false 时光角仍变（${b1.sun} → ${b2.sun}）—— 这个 flag 是死的`);
    await setFlag('drift', true);

    // ── dragLight：在画布上拖 → 光角变；关掉后不变 ──
    const drag = async () => {
      await page.evaluate(() => {
        const c = document.getElementById('stage');
        c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 5, clientX: 400, clientY: 400 }));
        window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 5, clientX: 620, clientY: 400 }));
        window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 5 }));
      });
      await page.waitForTimeout(220);
    };
    const beforeDrag = (await read()).sun;
    await drag();
    const afterDrag = (await read()).sun;
    check(beforeDrag !== afterDrag, `dragLight=true 时拖动应改光角（${beforeDrag} → ${afterDrag}）`);
    await setFlag('dragLight', false);
    await page.reload();
    await waitForPreview(page, { frames: 6 });
    await page.waitForFunction(() => Boolean(globalThis.__stay), null, { timeout: 15000 });
    await setFlag('dragLight', false);
    // ★ 必须同时冻结 drift：否则"光角随时间漂"会把拖动的影响盖掉/混淆，
    //   实测这里差 0.01deg（就是 drift 的贡献），断言会误判成"flag 是死的"。
    await setFlag('drift', false);
    await page.waitForTimeout(120);
    const before2 = (await read()).sun;
    await drag();
    const after2 = (await read()).sun;
    check(before2 === after2, `dragLight=false 时拖动仍改光角（${before2} → ${after2}）—— 这个 flag 是死的`);

    await setFlag('drift', true);
    // ── fold：按 f 折角 ──
    await setFlag('fold', true);
    await page.keyboard.press('f');
    const folded = (await read()).fold;
    check(folded !== '' && folded !== '0deg', `fold=true 时按 f 应改折角，实得 ${JSON.stringify(folded)}`);
    await setFlag('fold', false);
    await page.keyboard.press('f');
    const folded2 = (await read()).fold;
    check(folded2 === folded, `fold=false 时按 f 仍改折角（${folded} → ${folded2}）—— 这个 flag 是死的`);

    // ── restamp：再盖一次 → 章角变 ──
    await setFlag('restamp', true);
    const start = () => page.evaluate(() => document.getElementById('cta').dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await start();
    const tilt1 = (await read()).tilt;
    await page.waitForFunction(() => document.getElementById('stage-word')?.dataset.stage === 'approved', null, { timeout: 20000 });
    await start();
    await page.waitForTimeout(80);
    const tilt2 = (await read()).tilt;
    check(tilt1 !== tilt2, `restamp=true 时再盖一次应改章角（${tilt1} → ${tilt2}）`);
    await setFlag('restamp', false);
    await page.waitForFunction(() => document.getElementById('stage-word')?.dataset.stage === 'approved', null, { timeout: 20000 });
    await start();
    await page.waitForTimeout(80);
    const tilt3 = (await read()).tilt;
    check(tilt3 === tilt2, `restamp=false 时再盖仍改章角（${tilt2} → ${tilt3}）—— 这个 flag 是死的`);

    // ── E. 三件摆弄**只守身份，不守像素**（PM 钉的范围）──
    // 能断言：编号/日期/宣言句不变 · 导出入口恰 1 个 · 存续文本里 0 个计数类词
    // 不能断言：画面像素/章的位置/纸的轮廓（那会逼出一个"自动校正的章"，把这一站唯一的手作感杀掉）
    await setFlag('restamp', true);
    const before = await page.evaluate(() => ({
      meta: globalThis.__site.meta(),
      seal: (() => { const r = document.getElementById('seal').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })(),
      exportEntries: document.querySelectorAll('#save, a[download]').length,
      text: document.body.textContent ?? '',
    }));
    await start();
    await page.waitForFunction(() => document.getElementById('stage-word')?.dataset.stage === 'stamping', null, { timeout: 20000 });
    await page.waitForTimeout(120);
    const after = await page.evaluate(() => ({
      meta: globalThis.__site.meta(),
      seal: (() => { const r = document.getElementById('seal').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })(),
      exportEntries: document.querySelectorAll('#save, a[download]').length,
      text: document.body.textContent ?? '',
    }));

    check(after.meta.serial === before.meta.serial, `重盖后编号变了（${before.meta.serial} → ${after.meta.serial}）—— 摆弄不许产生结果`);
    check(after.meta.date === before.meta.date, `重盖后日期变了（${before.meta.date} → ${after.meta.date}）`);
    check(after.exportEntries === 1, `导出入口应恰 1 个，实得 ${after.exportEntries}（不许出现第二个）`);
    const counting = /streak|\bcount\b|visited|daysSeen/i;
    check(!counting.test(after.text), '页面上出现了计数类词（streak/count/visited/daysSeen）—— 摆弄不许有账本');
    // ★ 反向断言：样子**必须变**（盖歪且不被纠正）。这条比"不变"更难写错。
    const sealMoved = Math.abs(after.seal.x - before.seal.x) > 0.05
      || Math.abs(after.seal.y - before.seal.y) > 0.05
      || Math.abs(after.seal.w - before.seal.w) > 0.05;
    check(sealMoved, '重盖后章的 bbox 完全没变 —— 说明它被"纠正"了；这一站的章允许歪且不许纠正');

    console.log('license 停留/搬弄门');
    console.log(`  drift      ${a1.sun} → ${a2.sun}（关掉后 ${b1.sun} = ${b2.sun}）`);
    console.log(`  dragLight  ${beforeDrag} → ${afterDrag}（关掉后 ${before2} = ${after2}）`);
    console.log(`  fold       ${folded}（关掉后保持 ${folded2}）`);
    console.log(`  restamp    ${tilt1} → ${tilt2}（关掉后保持 ${tilt3}）`);
    console.log(`  身份不变：编号 ${after.meta.serial} · 日期 ${after.meta.date} · 导出入口 ${after.exportEntries}`);
    console.log(`  样子必须变：章 bbox (${before.seal.x.toFixed(2)},${before.seal.y.toFixed(2)}) → (${after.seal.x.toFixed(2)},${after.seal.y.toFixed(2)})`);
  } finally {
    await session.close();
  }
} finally {
  await close();
}

if (failures.length === 0) {
  console.log(`\nlicense-stay: PASS ${checks}/${checks}`);
  process.exit(0);
}
console.error(`\nlicense-stay: FAIL ${failures.length}/${checks}`);
for (const f of failures) console.error(`  - ${f}`);
process.exit(1);
