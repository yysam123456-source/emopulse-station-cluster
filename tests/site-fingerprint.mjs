// 站点色指纹门 —— 每个站一条**色相**断言。
//
// ★ 为什么需要：`/hug` 的规格是"黄昏暖金"（35–55°），而实测是 **224° 冷蓝** ——
//   一个"黄昏草甸"渲染成了冷蓝，**而所有结构断言都是绿的**，因为没有一条门看色相。
//   色相不影响任何计数、不影响任何布局断言，所以它是最容易"全绿但错"的量。
//
// 口径（与 `paper-visual` 一致）：全帧采样 → sRGB → L* / HSL，
//   L* P50、色相中位、饱和中位 三个数构成"画幅色指纹"。
//
// ⚠️ 判据是**宽**的（±25° 量级）：它只负责抓"方向反了"（暖↔冷），不负责抓细微偏色。
//   窄阈值需要样本，而样本只有 `docs/MANUAL-QA.md §11` 那四组 —— 那四组是**目标**，不是地板。
//
// 用法：node tests/site-fingerprint.mjs
import { launch, openFile, waitForPreview, REPO_ROOT } from './lib/browser.mjs';
import { existsSync } from 'node:fs';
import path from 'node:path';

/** 每站的色相带（摄氏式区间，单位度）。来源：`docs/MANUAL-QA.md §11` + 产品规格。 */
const BANDS = {
  license: { min: 20, max: 70, why: '暖纸（规格：暖中亮，偏黄）' },
  hug: { min: 28, max: 65, why: '黄昏暖金（规格 35–55°，门放宽到 28–65）' },
  still: { min: 190, max: 230, why: '深水冷蓝（tide A：208°）' },
  // ⚠️ `koi` 的纸**接近无彩**（宣纸 240/242/238，饱和 ~0.01）—— 色相在中位像素上没有意义
  //   （PM 的指纹表里它的色相就标的是"—"）。所以这里断言的是**近无彩**，不是色相。
  //   第一版给它写了 20–80° 的带，改完 dither 采样后中位落到纯纸灰 → 读到 0° 假红。
  koi: { min: 0, max: 360, why: '宣纸近无彩（不断言色相，断言饱和 ≤0.06）', neutral: true, satMax: 0.06 },
};

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

const { browser, close } = await launch({ headless: true });
const rows = [];
try {
  for (const slug of Object.keys(BANDS)) {
    const file = path.join(REPO_ROOT, 'dist', slug, 'index.html');
    if (!existsSync(file)) {
      check(false, `${slug}: 缺产物（先跑 npm run build:sites）`);
      continue;
    }
    const session = await openFile(browser, file, { width: 1280, height: 720, dpr: 2 });
    try {
      // 取样条件 = **「非黑画布」且「frames ≥ 60」两条同时满足**（主理人裁定）。
      //
      // 为什么两条都要：
      //   · 只看 frames：体素世界要几十秒才出画面 → 量到一片黑（L*0/0°/0），**"还没画"被记成"色相不合格"**。
      //   · 只看非黑：波光/气泡在动，取早了与取晚了差 7%（实测 /still 0.617 vs 0.580）——
      //     **色指纹是回归护栏，护栏自己漂就等于没有**。
      // 任一条不满足 → 报「未就绪」，**不报色相不合格**（两者是不同的失败）。
      const READY_FRAMES = 60;
      await waitForPreview(session.page, { frames: READY_FRAMES, timeoutMs: 240000 });
      let ready = true;
      try {
        await session.page.waitForFunction(() => {
          const canvas = document.getElementById('stage');
          const ctx = canvas.getContext('2d');
          const d = ctx.getImageData(0, 0, 1, 1).data;
          return d[0] + d[1] + d[2] > 12;
        }, null, { timeout: 240000 });
      } catch {
        ready = false;
      }
      const snapshot = await session.page.evaluate(() => (globalThis.__preview ?? globalThis.__site).snapshot());
      if (!ready || snapshot.frames < READY_FRAMES) {
        failures.push(`${slug}: 未就绪（非黑=${ready} frames=${snapshot.frames}/${READY_FRAMES}）—— 这不是色相问题`);
        checks += 1;
        continue;
      }
      const fp = await session.page.evaluate(() => {
        const canvas = document.getElementById('stage');
        const ctx = canvas.getContext('2d');
        const { width, height } = canvas;
        const data = ctx.getImageData(0, 0, width, height).data;
        const srgb = (c) => {
          const v = c / 255;
          return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        };
        const lstar = (r, g, b) => {
          const Y = 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
          return Y > 216 / 24389 ? 116 * Math.cbrt(Y) - 16 : (24389 / 27) * Y;
        };
        const hsl = (r, g, b) => {
          const rn = r / 255; const gn = g / 255; const bn = b / 255;
          const max = Math.max(rn, gn, bn); const min = Math.min(rn, gn, bn);
          const l = (max + min) / 2;
          const d = max - min;
          let h = 0;
          if (d > 1e-6) {
            if (max === rn) h = ((gn - bn) / d) % 6;
            else if (max === gn) h = (bn - rn) / d + 2;
            else h = (rn - gn) / d + 4;
            h *= 60;
            if (h < 0) h += 360;
          }
          // 饱和度**固定用 HSV S = (max-min)/max**（MANUAL-QA §8 附录钉死）。
          // 用 HSL 的 S 会与 PM 差 0.157（/hug 0.315 vs 0.472）—— 口径不统一，数字就不是证据。
          const s = max <= 1e-6 ? 0 : d / max;
          void l;
          return { h, s };
        };
        const ls = [];
        const hs = [];
        const ss = [];
        for (let y = 0; y < height; y += 6) {
          for (let x = 0; x < width; x += 6) {
            const i = (y * width + x) * 4;
            ls.push(lstar(data[i], data[i + 1], data[i + 2]));
            const { h, s } = hsl(data[i], data[i + 1], data[i + 2]);
            hs.push(h);
            ss.push(s);
          }
        }
        const median = (arr) => {
          arr.sort((a, b) => a - b);
          return arr[Math.floor(arr.length * 0.5)];
        };
        return {
          lstarP50: median(ls),
          hue: median(hs),
          saturation: median(ss),
          state: 'n/a',
        };
      });
      let grass = null;

      // ── /koi 专有：网点结构性诊断（**记录项**，不作判定）──
      // 这条判据已撤销为记录项：它的「中间带」是相对 (min,max) 定义的，随字号/字重自我漂移
      // （墨更深反而读数更差 15.6%→18.0%），测的是排版参数。替代物是 bench 的开/关变异测试。
      // 保留它是因为它顺带暴露一个结构事实：**画布若全不透明，Bayer 一次都不会运行**。
      let dots = null;
      if (slug === 'koi') {
        dots = await session.page.evaluate(() => {
          const c = document.getElementById('stage');
          const ctx = c.getContext('2d');
          const { width, height } = c;
          const d = ctx.getImageData(0, 0, width, height).data;
          const srgb = (v) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
          const L = (r2, g2, b2) => { const Y = 0.2126 * srgb(r2) + 0.7152 * srgb(g2) + 0.0722 * srgb(b2); return Y > 216 / 24389 ? 116 * Math.cbrt(Y) - 16 : (24389 / 27) * Y; };
          const lums = [];
          for (let i = 0; i < d.length; i += 4) lums.push(L(d[i], d[i + 1], d[i + 2]));
          lums.sort((a, b) => a - b);
          const paper = lums[Math.floor(lums.length * 0.9)];
          const ink = lums[Math.floor(lums.length * 0.1)];
          const lo = ink + 0.25 * (paper - ink);
          const hi = ink + 0.75 * (paper - ink);
          let mid = 0;
          let translucent = 0;
          for (let i = 0; i < d.length; i += 4) if (d[i + 3] !== 255) translucent += 1;
          for (const v of lums) if (v > lo && v < hi) mid += 1;
          return { paper, ink, midRatio: mid / lums.length, translucent, total: d.length / 4 };
        });
      }

      const band = BANDS[slug];
      rows.push({ slug, ...fp, state: snapshot.state, band, frames: snapshot.frames });
      if (band.neutral) {
        check(
          fp.saturation <= band.satMax,
          `${slug}: 饱和 ${fp.saturation.toFixed(3)} > ${band.satMax}（${band.why}）`,
        );
      } else {
        check(
          fp.hue >= band.min && fp.hue <= band.max,
          `${slug}: 色相 ${fp.hue.toFixed(0)}° 不在 ${band.min}–${band.max}°（${band.why}）`,
        );
      }
      if (dots) {
        // ⚠️ 这条判据**已撤销为记录项**（主理人 + PM 双裁）。
        //   理由不是"字号变了"，是**这个量随字号/字重自我漂移**：
        //   「中间带」是相对 (min,max) 定义的 —— 墨一深，区间被拉宽、带子整体下移，
        //   抗锯齿像素从"暗"变成"中"，于是**墨更深反而读数更差**（0.62→0.95 时 15.6%→18.0%）。
        //   它测的是排版参数，不是渲染质量。用它当门 = "改字体就能改判"。
        //   替代：`pixel-post/bench.mjs` 里的**变异测试**（dither 开 vs 关，输出字节必须不同）。
        //   最终判据是 1:1 目视（PM）。
        console.log(`  （记录项，不作判定）koi 中间灰阶 ${(dots.midRatio * 100).toFixed(1)}% · 半透明像素 ${dots.translucent}/${dots.total}`);
        rows.push({ slug: 'koi/网点', lstarP50: dots.paper, hue: 0, saturation: dots.midRatio, band: { min: 0, max: 15, why: '中间灰阶%' }, state: 'ready', frames: snapshot.frames, note: `墨 L* ${dots.ink.toFixed(1)}` });
      }
      if (grass) {
        const hueDiff = grass.gh - grass.dh;
        const lightDiff = grass.gl - grass.dl;
        check(grass.n > 500, `hug: 草像素太少（${grass.n}），运动分割失效 —— 这条断言没有辨别力`);
        check(hueDiff >= 10, `hug: 草/地色相差 ${hueDiff.toFixed(1)}°（需 ≥10°）—— 同色相时草只靠明度撑形`);
        check(Math.abs(lightDiff - 20.4) <= 2.5, `hug: 草/地明度差 ${lightDiff.toFixed(1)}（基线 20.4±2.5）—— 产品要求"加色相分离、不加明度对比"`);
        rows.push({ slug: 'hug/草', lstarP50: grass.gl, hue: grass.gh, saturation: 0, band: { min: 40, max: 48, why: '草体' }, state: 'ready', frames: snapshot.frames, note: `地 ${grass.dh.toFixed(1)}°/L${grass.dl.toFixed(1)} · 差 ${hueDiff.toFixed(1)}°` });
      }
    } finally {
      await session.close();
    }
  }
} finally {
  await close();
}

console.log('站点色指纹（全帧 L* P50 / 色相中位 / 饱和中位）\n');
console.log('  slug     L* P50   色相     饱和    区间        状态   frames');
for (const row of rows) {
  console.log(
    `  ${row.slug.padEnd(8)} ${row.lstarP50.toFixed(1).padStart(6)}   ${`${row.hue.toFixed(0)}°`.padStart(5)}  ${row.saturation.toFixed(3).padStart(5)}   ${`${row.band.min}–${row.band.max}°`.padEnd(10)} ${row.state.padEnd(8)} ${row.frames}`,
  );
}
console.log('\n  取样约定（MANUAL-QA §8）：frames ≥ 60 之后取，**报告写明帧号**；持续运动的站写死 frames = 60，允许 ±0.05 漂移。');
console.log('  为什么不写"画面稳定后"：/still 与 /koi 永远不会稳定 —— 写"稳定"等于没约定，下一个人还会取到另一帧。');

// ── /hug 的草/地色相分离：**在只装 L0 的页面上量**（`field-l0`）──
// 为什么不在站点页量：站点叠了 `pixel-post`，而它的**颗粒是动能颗粒**（24Hz 换相）——
// 帧差法会把整屏颗粒都算成"草"，草类退化成全帧（实测色相差从 17° 掉到 2.7°）。
// 这条判据测的是**地形调色板**，不是最终观感，所以样本该是纯 L0。
const grassPage = path.join(REPO_ROOT, 'dist', 'preview', 'field-l0.html');
if (existsSync(grassPage)) {
  const { browser: browser2, close: close2 } = await launch({ headless: true });
  try {
    const session = await openFile(browser2, grassPage, { width: 1280, height: 720, dpr: 2 });
    try {
      await waitForPreview(session.page, { frames: 60, timeoutMs: 60000 });
      const g = await session.page.evaluate(async () => {
        const canvas = document.getElementById('stage');
        const ctx = canvas.getContext('2d');
        const { width, height } = canvas;
        const y0 = Math.floor(height * 0.45);
        const hh = height - y0;
        const grab = () => ctx.getImageData(0, y0, width, hh).data;
        const a = grab();
        await new Promise((res) => setTimeout(res, 450));
        const b = grab();
        const srgb = (v) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
        const L = (r2, g2, b2) => { const Y = 0.2126 * srgb(r2) + 0.7152 * srgb(g2) + 0.0722 * srgb(b2); return Y > 216 / 24389 ? 116 * Math.cbrt(Y) - 16 : (24389 / 27) * Y; };
        const H = (r2, g2, b2) => {
          const rn = r2 / 255; const gn = g2 / 255; const bn = b2 / 255;
          const mx = Math.max(rn, gn, bn); const mn = Math.min(rn, gn, bn); const dd = mx - mn;
          if (dd < 1e-6) return 0;
          let h;
          if (mx === rn) h = ((gn - bn) / dd) % 6;
          else if (mx === gn) h = (bn - rn) / dd + 2;
          else h = (rn - gn) / dd + 4;
          h *= 60;
          return h < 0 ? h + 360 : h;
        };
        const gr = []; const gd = [];
        for (let i = 0; i < a.length; i += 8) {
          const moved = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
          const lu = L(b[i], b[i + 1], b[i + 2]);
          if (lu < 4) continue;
          const hue = H(b[i], b[i + 1], b[i + 2]);
          if (moved > 18) gr.push({ h: hue, l: lu });
          else if (moved === 0) gd.push({ h: hue, l: lu });
        }
        const med = (arr, k) => { const v = arr.map((o) => o[k]).sort((p, q) => p - q); return v.length ? v[Math.floor(v.length / 2)] : 0; };
        return { n: gr.length, gh: med(gr, 'h'), gl: med(gr, 'l'), dh: med(gd, 'h'), dl: med(gd, 'l') };
      });
      const hueDiff = g.gh - g.dh;
      const lightDiff = g.gl - g.dl;
      checks += 3;
      if (g.n <= 500) failures.push(`hug: 草像素太少（${g.n}），运动分割失效 —— 这条断言没有辨别力`);
      if (hueDiff < 10) failures.push(`hug: 草/地色相差 ${hueDiff.toFixed(1)}°（需 ≥10°）`);
      // ★ 基线从 20.4 改为 **29.6**：样本换了（从"站点页"换成"只装 L0 的 field-l0 页"）——
      //   因为站点页叠了动能颗粒，帧差法会把颗粒算成草。基线必须与样本同源，否则比的是两件事。
      //   这条测的是**地形调色板**的相对关系（"加色相分离、不加明度对比"），样本就该是纯 L0。
      if (Math.abs(lightDiff - 29.6) > 2.5) failures.push(`hug: 草/地明度差 ${lightDiff.toFixed(1)}（基线 29.6±2.5，field-l0 样本）`);
      console.log(`  hug/草（field-l0 样本）：草 ${g.gh.toFixed(1)}° L${g.gl.toFixed(1)} · 地 ${g.dh.toFixed(1)}° L${g.dl.toFixed(1)} → 色相差 ${hueDiff.toFixed(1)}° / 明度差 ${lightDiff.toFixed(1)}`);
    } finally {
      await session.close();
    }
  } finally {
    await close2();
  }
}

if (failures.length === 0) {
  console.log(`\nsite-fingerprint: PASS ${checks}/${checks}`);
  process.exit(0);
}
console.error(`\nsite-fingerprint: FAIL ${failures.length}/${checks}`);
for (const failure of failures) console.error(`  - ${failure}`);
process.exit(1);
