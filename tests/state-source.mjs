// P0-3 门：`snapshot().state` 与 `body[data-state]` 必须来自同一个 deriveState()。
//
// 同时钉住两条容易回退的语义：
//   ① 首帧后 readiness<1 但不是 blocking（/still 的体素、/koi 的鱼池）不该被标 degraded；
//   ② 卡死（frames=0 且超时）不能继续报 booting。
//
// 用法：node tests/state-source.mjs
import path from 'node:path';
import { existsSync } from 'node:fs';
import { launch, openFile, REPO_ROOT } from './lib/browser.mjs';

const failures = [];
let checks = 0;
const check = (ok, msg) => { checks += 1; if (!ok) failures.push(msg); };
const SITES = ['license', 'hug', 'still', 'koi'];

const { browser, close } = await launch({ headless: true });
try {
  for (const slug of SITES) {
    const file = path.join(REPO_ROOT, 'dist', slug, 'index.html');
    if (!existsSync(file)) {
      failures.push(`${slug}: 缺产物 ${file}`);
      checks += 1;
      continue;
    }
    const { page } = await openFile(browser, file, { width: 1280, height: 720, dpr: 1 });
    await page.waitForTimeout(2200);
    const read = await page.evaluate(() => {
      const snap = globalThis.__site.snapshot();
      return {
        snap,
        body: document.body.dataset.state,
      };
    });
    check(read.snap.state === read.body, `${slug}: snapshot.state=${read.snap.state} 与 body[data-state]=${read.body} 不一致`);
    check(
      read.snap.resolutionStarved === (read.snap.renderScale < 0.75),
      `${slug}: resolutionStarved=${read.snap.resolutionStarved} 与 renderScale=${read.snap.renderScale} 不一致`,
    );
    // 首帧已经出了：ready 时不允许再把非 blocking 的慢件算成 degraded。
    if (read.snap.state === 'ready') {
      check(read.snap.readiness >= 1 || ['still', 'koi'].includes(slug),
        `${slug}: state=ready 但 readiness=${read.snap.readiness}（非 defer 站不该这样）`);
    }
    console.log(`  ${slug.padEnd(7)} state=${read.snap.state} body=${read.body} readiness=${read.snap.readiness} scale=${read.snap.renderScale} starved=${read.snap.resolutionStarved}`);
  }

  // 卡死分支：/still 的体素世界在无 GPU 的最坏情况下 readiness 可能长期为 0，
  // 但它不 blocking，9 秒后仍必须是 ready/degraded，不能停在 booting。
  const stillFile = path.join(REPO_ROOT, 'dist', 'still', 'index.html');
  if (existsSync(stillFile)) {
    const { page } = await openFile(browser, stillFile, { width: 390, height: 844, dpr: 1 });
    await page.waitForTimeout(9000);
    const late = await page.evaluate(() => ({
      state: document.body.dataset.state,
      snap: globalThis.__site.snapshot(),
      note: { hidden: document.getElementById('boot-note')?.hidden, text: document.getElementById('boot-note')?.textContent ?? '' },
    }));
    check(late.state !== 'booting', `/still: 9s 后仍是 booting（bootTimeout 没生效）`);
    check(late.snap.state === late.state, `/still: 9s 后 snapshot=${late.snap.state} / body=${late.state} 不一致`);
    console.log(`  still   9s state=${late.state} readiness=${late.snap.readiness} bootNote=${JSON.stringify(late.note)}`);
  }
} finally {
  await close();
}

if (failures.length === 0) {
  console.log(`state-source: PASS ${checks}/${checks}`);
  process.exit(0);
}
console.error(`state-source: FAIL ${failures.length}/${checks}`);
for (const failure of failures) console.error(`  - ${failure}`);
process.exit(1);
