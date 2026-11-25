// P0-2 门：启动阶段必须有可读状态，且超时后不能永远停在 booting。
//
// 这里用真实站点而不是假零件：`/still` 的 voxel-world 声明
// `defer:'after-first-frame'`，它的 readiness 在首屏后仍可能为 0 —— 这正是
// “非 blocking 的慢件不能把站点挡住”的真实验证。`/koi` 则验证纸面先出。
//
// 用法：node tests/readiness-protocol.mjs
import path from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { launch, openFile, screenshot, REPO_ROOT } from './lib/browser.mjs';

const failures = [];
let checks = 0;
const check = (ok, msg) => { checks += 1; if (!ok) failures.push(msg); };
const evidence = path.join(REPO_ROOT, 'docs', 'evidence', 'plan-2026-11-25');
mkdirSync(evidence, { recursive: true });

/** 读启动相关 DOM 与快照；boot note 是 role=status，必须真的可见。 */
const readBoot = (page) => page.evaluate(() => {
  const note = document.getElementById('boot-note');
  const h1 = document.getElementById('h1');
  const lead = document.getElementById('lead');
  const snap = globalThis.__site.snapshot();
  return {
    state: document.body.dataset.state,
    boot: document.body.dataset.boot ?? '',
    note: {
      hidden: note ? note.hidden : null,
      text: note ? note.textContent : '',
      visible: Boolean(note && !note.hidden && note.textContent.trim()),
    },
    h1: h1 ? h1.textContent.trim() : '',
    lead: lead ? lead.textContent.trim() : '',
    snap,
  };
});

const { browser, close } = await launch({ headless: true });
try {
  const stillFile = path.join(REPO_ROOT, 'dist', 'still', 'index.html');
  if (!existsSync(stillFile)) {
    failures.push('缺 dist/still/index.html');
    checks += 1;
  } else {
    const { page } = await openFile(browser, stillFile, { width: 390, height: 844, dpr: 1 });
    await page.waitForTimeout(1000);
    const early = await readBoot(page);
    check(
      early.note.visible || early.h1 || early.lead,
      `/still: 1s 内没有可读文字（bootNote=${JSON.stringify(early.note)} h1=${early.h1} lead=${early.lead}）`,
    );
    check(early.state !== 'failed', `/still: 1s 内 state=failed`);
    await screenshot(page, path.join(evidence, 'still-mobile-1s.png'));

    await page.waitForTimeout(8200);
    const late = await readBoot(page);
    check(late.state !== 'booting', `/still: 9s 后仍是 booting（state=${late.state} readiness=${late.snap.readiness}）`);
    check(late.snap.state === late.state, `/still: 9s 后 snapshot=${late.snap.state} / body=${late.state} 不一致`);
    // 非 blocking 的体素没就绪时，遮罩应已退场；boot note 若仍在，必须是 slow/unsupported 原因。
    check(
      !late.note.visible || /preparing|slow|unavailable|WebGPU/i.test(late.note.text),
      `/still: 遮罩仍在但没有原因：${JSON.stringify(late.note)}`,
    );
    await screenshot(page, path.join(evidence, 'still-mobile-9s.png'));
    console.log(`  still 1s state=${early.state} note=${JSON.stringify(early.note)}`);
    console.log(`  still 9s state=${late.state} readiness=${late.snap.readiness} note=${JSON.stringify(late.note)}`);
  }

  const koiFile = path.join(REPO_ROOT, 'dist', 'koi', 'index.html');
  if (!existsSync(koiFile)) {
    failures.push('缺 dist/koi/index.html');
    checks += 1;
  } else {
    const { page } = await openFile(browser, koiFile, { width: 390, height: 844, dpr: 1 });
    await page.waitForTimeout(1000);
    const early = await readBoot(page);
    check(early.note.visible || early.h1 || early.lead, `/koi: 1s 内没有可读文字`);
    check(early.state !== 'failed', `/koi: 1s 内 state=failed`);
    // 纸面先出：主画布不能是纯黑。
    const paper = await page.evaluate(() => {
      const canvas = document.getElementById('stage');
      const ctx = canvas.getContext('2d');
      const { data } = ctx.getImageData(0, 0, Math.min(canvas.width, 64), Math.min(canvas.height, 64));
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
      return { mean: sum / Math.max(1, data.length / 4), w: canvas.width, h: canvas.height };
    });
    check(paper.mean > 40, `/koi: 1s 主画布 mean=${paper.mean.toFixed(1)}（纸面没出）`);
    await screenshot(page, path.join(evidence, 'koi-mobile-1s.png'));
    await page.waitForTimeout(3000);
    const late = await readBoot(page);
    check(late.state === 'ready' || late.state === 'degraded', `/koi: 4s 后 state=${late.state}`);
    console.log(`  koi   1s state=${early.state} paperMean=${paper.mean.toFixed(1)} note=${JSON.stringify(early.note)}`);
    console.log(`  koi   4s state=${late.state} readiness=${late.snap.readiness}`);
  }
} finally {
  await close();
}

if (failures.length === 0) {
  console.log(`readiness-protocol: PASS ${checks}/${checks}`);
  process.exit(0);
}
console.error(`readiness-protocol: FAIL ${failures.length}/${checks}`);
for (const failure of failures) console.error(`  - ${failure}`);
process.exit(1);
