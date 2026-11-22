// /license 的「停留/搬弄」门，两把尺分管：
//
//   ① 变量尺（A–E）：四个 flag 各自置 false 后**变量**必须不再变 —— 抓"死 flag / 没接上"。
//   ② 像素尺（F）  ：拖光 / 折角各自**改变了多少像素**，必须显著高于世界自身的噪声底。
//
// ★ 为什么必须有第二把尺（2026-11-19，用户实测打脸）：
//   本文件第一版只读 CSS 变量（光角 / 折角 / 章角），并在注释里写「像素差留给 PM 的目视」。
//   结果：`--fold` 确实从 '' 变成 6deg（门全绿），可它的消费方是 `#sheet{transform:rotate()}`
//   —— `#sheet` 只是个空 div + 1px 边框，所以"折角"的真实效果是**一条 1px 斜线划过整张纸**；
//   "拖光"满量程的像素差（mean 3.85）几乎等于世界自身的噪声（mean 3.24），肉眼分不出。
//   变量绿 ≠ 看得见。凡是"用户能看见"的承诺，尺子必须落在像素上。
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

    // 变量写在不同元素上（sun 在 body、fold 也在 body、tilt 在 #seal），必须各读各的：
    // 第一版全读 documentElement，四个数都是空串 —— **读错了地方，断言就永远失败**（好在它是红，不是假绿）。
    // fold 从 `#sheet` 挪到 `body`：`#fold-flap` 是 `#sheet` 的**兄弟**，变量写在 `#sheet` 上继承不过去。
    const read = () => page.evaluate(() => ({
      sun: document.body.style.getPropertyValue('--sun-angle').trim(),
      fold: document.body.style.getPropertyValue('--fold').trim(),
      foldAttr: document.body.dataset.fold ?? '',
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
    check(folded === 'on', `fold=true 时按 f 应折角，实得 ${JSON.stringify(folded)}`);
    const foldedAttr = (await read()).foldAttr;
    check(foldedAttr === 'on', `折角没写到 body[data-fold]（实得 ${JSON.stringify(foldedAttr)}）—— CSS 读不到它，纸角就不会翻起来`);
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

    // ══ F. 像素尺：拖光 / 折角必须**看得见** ══
    //
    // 世界自身每帧都在动（纸纹 grain），所以"变了"毫无意义 —— 必须和**噪声底**比。
    // 拖光是全局扫光 → 看整张纸的 mean/pctOver8；
    // 折角是局部翻角 → 看纸角一小块的 mean，同时要求"纸的其他地方基本不动"
    // （上一版那条划过正文的 1px 斜线，正是被"其他地方也不许动"这条抓出来的）。
    await page.reload();
    await waitForPreview(page, { frames: 6 });
    await page.waitForFunction(() => Boolean(globalThis.__stay), null, { timeout: 15000 });
    await setFlag('drift', false);   // 冻结慢漂：否则"光自己在动"会被当成"拖光有效"
    // ★ 基线必须等 `#veil` 的 1.4s 启动遮罩淡出**结束**。
    //   之前只等 900ms：n1 还在遮罩半透明里，n2 已接近透明，整页 mean 7.6 的"噪声"
    //   其实是遮罩在退场，把拖光/折角的真实差异淹掉了。
    await page.waitForTimeout(1800);

    const px = await page.evaluate(() => {
      const r = document.getElementById('sheet').getBoundingClientRect();
      const pad = 6;
      return {
        x: Math.round(r.x) + pad, y: Math.round(r.y) + pad,
        w: Math.round(r.width) - pad * 2, h: Math.round(r.height) - pad * 2,
      };
    });
    const CORNER = 170;
    const cornerRect = { x: px.x + px.w - CORNER, y: px.y + px.h - CORNER, w: CORNER, h: CORNER };

    // ★ scale:'css' 不能省：页面是 dpr=2，截图默认 2560×1440（设备像素），
    //   而 getBoundingClientRect 给的是 CSS 像素 —— 不统一就一直在量**错误的那块区域**。
    //   （第一版就踩了：折角量到的"纸角"其实落在画布外的暗背景上，于是永远读成噪声。）
    const shot = async () => (await page.screenshot({ scale: 'css' })).toString('base64');
    /** 两帧在 rect 内的像素差；exclude 内的像素不计入。 */
    const diff = (a, b, rect, exclude = null) => page.evaluate(async ({ a, b, rect, exclude }) => {
      const load = (b64) => new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = rej;
        img.src = 'data:image/png;base64,' + b64;
      });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      const w = ia.width; const h = ia.height;
      const ca = new OffscreenCanvas(w, h).getContext('2d'); ca.drawImage(ia, 0, 0);
      const cb = new OffscreenCanvas(w, h).getContext('2d'); cb.drawImage(ib, 0, 0);
      const da = ca.getImageData(rect.x, rect.y, rect.w, rect.h).data;
      const db = cb.getImageData(rect.x, rect.y, rect.w, rect.h).data;
      let sum = 0; let max = 0; let over8 = 0; let n = 0;
      for (let i = 0; i < da.length; i += 4) {
        const gx = rect.x + ((i / 4) % rect.w);
        const gy = rect.y + Math.floor((i / 4) / rect.w);
        if (exclude && gx >= exclude.x && gx < exclude.x + exclude.w && gy >= exclude.y && gy < exclude.y + exclude.h) continue;
        const d = (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2])) / 3;
        sum += d; n += 1;
        if (d > max) max = d;
        if (d > 8) over8 += 1;
      }
      return {
        mean: +(sum / Math.max(n, 1)).toFixed(2), max: +max.toFixed(1),
        pctOver8: +(over8 / Math.max(n, 1) * 100).toFixed(2), px: n,
      };
    }, { a, b, rect, exclude });

    // 噪声底（什么都不做，连拍两帧）
    const n1 = await shot();
    await page.waitForTimeout(900);
    const n2 = await shot();
    const baseAll = await diff(n1, n2, px);
    const baseCorner = await diff(n1, n2, cornerRect);

    // 拖光：真鼠标在纸中央横拖（满量程 ≈ 224px）
    const dx0 = px.x + px.w * 0.38;
    const dy0 = px.y + px.h * 0.5;
    await page.mouse.move(dx0, dy0);
    await page.mouse.down();
    for (let i = 1; i <= 12; i += 1) await page.mouse.move(dx0 + i * 20, dy0, { steps: 1 });
    await page.mouse.up();
    await page.waitForTimeout(500);
    const dragSun = (await read()).sun;
    const n3 = await shot();
    const dragAll = await diff(n2, n3, px);

    // 折角：按 f
    await page.keyboard.press('f');
    await page.waitForTimeout(600);
    const n4 = await shot();
    const foldCorner = await diff(n3, n4, cornerRect);
    const foldRest = await diff(n3, n4, px, cornerRect);

    check(
      dragAll.mean > Math.max(baseAll.mean * 1.6, 6) && dragAll.pctOver8 > Math.max(baseAll.pctOver8 * 2, 8),
      `拖光在画面上**看不出**：整纸差异 mean ${dragAll.mean} / >8 的像素 ${dragAll.pctOver8}%，`
        + `噪声底 ${baseAll.mean} / ${baseAll.pctOver8}% —— 拖了，但几乎等于没拖`,
    );
    check(
      foldCorner.mean > Math.max(baseCorner.mean * 2.5, 6),
      `折角在纸角**看不出**：角落差异 mean ${foldCorner.mean}，噪声底 ${baseCorner.mean}`,
    );
    check(
      foldRest.max < 26,
      `折角把纸的**其他地方**也改了（最大差 ${foldRest.max}）—— 折角只该动那只角；`
        + '上一版就是这样：一条 1px 斜线划过整张纸、穿过正文',
    );

    console.log('license 停留/搬弄门（变量尺）');
    console.log(`  drift      ${a1.sun} → ${a2.sun}（关掉后 ${b1.sun} = ${b2.sun}）`);
    console.log(`  dragLight  ${beforeDrag} → ${afterDrag}（关掉后 ${before2} = ${after2}）`);
    console.log(`  fold       ${folded}（关掉后保持 ${folded2}）`);
    console.log(`  restamp    ${tilt1} → ${tilt2}（关掉后保持 ${tilt3}）`);
    console.log(`  身份不变：编号 ${after.meta.serial} · 日期 ${after.meta.date} · 导出入口 ${after.exportEntries}`);
    console.log(`  样子必须变：章 bbox (${before.seal.x.toFixed(2)},${before.seal.y.toFixed(2)}) → (${after.seal.x.toFixed(2)},${after.seal.y.toFixed(2)})`);
    console.log('license 停留/搬弄门（像素尺）');
    console.log(`  噪声底     整纸 mean ${baseAll.mean} / >8 ${baseAll.pctOver8}% · 纸角 mean ${baseCorner.mean}`);
    const ratio = (v, b) => `${(v / Math.max(b, 0.05)).toFixed(1)}× 噪声`;
    console.log(`  拖光       ${dragSun} · 整纸 mean ${dragAll.mean} / >8 ${dragAll.pctOver8}%（${ratio(dragAll.mean, baseAll.mean)}）`);
    console.log(`  折角       纸角 mean ${foldCorner.mean}（${ratio(foldCorner.mean, baseCorner.mean)}）· 其他地方 max ${foldRest.max}`);
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
