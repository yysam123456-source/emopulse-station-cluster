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

    // ── 1. 盖章**之前**的纸：必须已经是一张填好的许可证 ──
    //    真实缺口：编号/日期曾被押到 approved 之后（"盖章才落上去"），
    //    于是用户第一眼看到的是一张空纸 + 一个悬浮按钮 —— 也就是"啥都没有"。
    //    语义上也不对：编号是开票时印上去的，盖章只授予红章。
    const idle = await page.evaluate(() => {
      const read = (id) => {
        const el = document.getElementById(id);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return {
          text: el.textContent.trim(), hidden: el.hidden === true || cs.display === 'none',
          box: { x: r.x, y: r.y, w: r.width, h: r.height },
        };
      };
      return {
        serial: read('cert-serial'), date: read('cert-date'), rule: read('cert-rule'),
        sealSub: read('cert-seal-sub'), seal: read('seal'),
        stage: document.getElementById('stage-word')?.dataset.stage,
      };
    });
    check(idle.stage === 'idle', `盖章前 stage=${idle.stage}，应 idle`);
    check(idle.serial?.hidden === false, '盖章前编号就应在纸上（编号是开票即印，不是盖章才给）');
    check(/^No\.\s*EMP-\d{8}-\d{3}$/.test(idle.serial?.text ?? ''), `盖章前编号格式异常：${JSON.stringify(idle.serial?.text)}`);
    check(idle.serial?.box.w > 0 && idle.serial?.box.h > 0, '盖章前编号存在但没有可见尺寸');
    check(idle.date?.hidden === false, '盖章前日期就应在纸上');
    check(/^\d{4}\.\d{2}\.\d{2}$/.test(idle.date?.text ?? ''), `盖章前日期格式异常：${JSON.stringify(idle.date?.text)}`);
    check(idle.rule?.hidden === false && idle.rule?.box.w > 100, '页眉印刷线不在（纸缺少版式，读作"一段悬着的文字"）');
    check(idle.sealSub?.hidden === true, '章下副行"NO COPY KEPT."盖章前就露出来了（它属于红章）');

    // ── 1b. 三段：点 #cta 开始，逐段收集 DOM 里的词 ──
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

    // ── 2a. 许可证正文：纸必须真的是一张许可证，不是空白纸 ──
    //    真实缺口：页眉/宣言/编号/日期全画在导出 PNG 上，屏幕上一个都没有。
    const cert = await page.evaluate(() => {
      const read = (id) => {
        const el = document.getElementById(id);
        return el ? { text: el.textContent.trim(), hidden: el.hidden } : null;
      };
      return {
        title: read('cert-title'), decl: read('cert-declaration'),
        serial: read('cert-serial'), date: read('cert-date'), sealSub: read('cert-seal-sub'),
      };
    });
    check(cert.title?.text === 'PERMIT TO REST', `卡标题应为定稿 "PERMIT TO REST"，实际 ${JSON.stringify(cert.title?.text)}`);
    check(
      cert.decl?.text === 'This permit entitles the holder to rest, to stop explaining, and to take up space.',
      `宣言句不是定稿终稿（COPY-SITES §5 第23条），实际 ${JSON.stringify(cert.decl?.text)}`,
    );
    check(/^No\.\s*EMP-\d{8}-\d{3}$/.test(cert.serial?.text ?? ''), `编号格式异常：${JSON.stringify(cert.serial?.text)}`);
    check(cert.serial?.hidden === false, 'approved 后编号应可见');
    check(/^\d{4}\.\d{2}\.\d{2}$/.test(cert.date?.text ?? ''), `日期格式异常：${JSON.stringify(cert.date?.text)}`);
    check(cert.date?.hidden === false, 'approved 后日期应可见');
    check(cert.sealSub?.text === 'NO COPY KEPT.', `章下副行应为定稿 "NO COPY KEPT."，实际 ${JSON.stringify(cert.sealSub?.text)}`);

    // ── 2b. 纸角二级提示：approved 后才露出、真的在纸上、可点重盖 ──
    //    真实缺口：三件摆弄（挪光/折角/重盖）代码里都接好了，但页面无提示，
    //    用户肉眼只看到一张纸 —— "有交互却不可发现"等于没有交互。
    const hint = await page.evaluate(() => {
      const el = document.getElementById('play-hint');
      const again = document.getElementById('again');
      const r = el.getBoundingClientRect();
      const root = getComputedStyle(document.documentElement);
      return {
        hidden: el.hidden,
        rect: { x: r.x, y: r.y, w: r.width, h: r.height },
        text: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
        sheet: {
          x: parseFloat(root.getPropertyValue('--sheet-x')) || 0,
          y: parseFloat(root.getPropertyValue('--sheet-y')) || 0,
          w: parseFloat(root.getPropertyValue('--sheet-w')) || 0,
          h: parseFloat(root.getPropertyValue('--sheet-h')) || 0,
        },
        againHit: (() => {
          if (!again) return false;
          const b = again.getBoundingClientRect();
          const top = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
          return top === again || again.contains(top);
        })(),
      };
    });
    check(hint.hidden === false, '#play-hint 在 approved 之后仍隐藏（三件摆弄对用户不可发现）');
    check(hint.againHit === true, '#again（Stamp again）被别的元素盖住，用户点不到');
    check(
      hint.rect.x >= hint.sheet.x - 1 && hint.rect.y >= hint.sheet.y - 1
        && hint.rect.x + hint.rect.w <= hint.sheet.x + hint.sheet.w + 1
        && hint.rect.y + hint.rect.h <= hint.sheet.y + hint.sheet.h + 1,
      `#play-hint 落在纸外（${JSON.stringify(hint.rect)} vs 纸 ${JSON.stringify(hint.sheet)}）`,
    );
    check(hint.text.includes('Stamp again'), `#play-hint 少了定稿词 "Stamp again"（实际：${hint.text}）`);
    // 点一次重盖：提示立刻收起、状态回到 verifying（证明它是一个真的可触发的入口，不是死提示）
    await page.evaluate(() => document.getElementById('again').dispatchEvent(new MouseEvent('click', { bubbles: true })));
    const restamp = await page.evaluate(() => ({
      stage: document.getElementById('stage-word')?.dataset.stage,
      hintHidden: document.getElementById('play-hint')?.hidden,
    }));
    check(restamp.stage === 'verifying', `点 Stamp again 后 stage=${restamp.stage}，应重新从 verifying 开始`);
    check(restamp.hintHidden === true, '重盖开始后 #play-hint 应收起');

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
