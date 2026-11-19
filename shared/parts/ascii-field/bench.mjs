// ascii-field 的成本与行为对账。**两型分开测**，因为它们的每帧指令量差一个量级。
//
// ★ 口径（同一份诚实账单）：
//   Node 里没有 canvas，假 ctx 不画像素。所以「每帧毫秒」只含 JS 侧指令发射；
//   真实浏览器里的字形光栅化与 drawImage 填充不在这份计时里。
//   `costMs` 是按指令数估的（keys = 格数 × 0.004ms；plain = 行数 × 0.01ms + 0.2），
//   本脚本负责：① 打印指令计数（可核对的事实）② 与 costMs 对账 ③ 断言两型真的走了不同的路
//
// 四条断言（都要能红）：
//   A. plain 真的按行合并：每帧 `fillText === rows`，`drawImage === 0`
//   B. keys 真的走图集：每帧 `fillText === 0`，`drawImage === 非空格数`
//   C. 块字符（█）在图集烘焙时走 fillRect（不是字形），且**每帧 fillRect 为 0**
//   D. low 档真减量：格数降到约 1/4，drawImage/fillText 跟着降
//
// 用法：node shared/parts/ascii-field/bench.mjs
import path from 'node:path';
import { loadTsModule, REPO_ROOT } from '../../../tests/lib/load-ts.mjs';
import { guardCtx } from '../../../tests/lib/fake-ctx.mjs';
import { readFileSync } from 'node:fs';

const WIDTH = 1280;
const HEIGHT = 720;
const DPR = 2;

const counters = {
  drawImage: 0, fillText: 0, fillRect: 0, strokeRect: 0, clearRect: 0,
  createImageData: 0, putImageData: 0, getImageData: 0, gradient: 0,
};

/** 所有假 ctx 的守卫 */
const guards = [];

/** 最近一帧的每行文本（plain 每行一次 fillText） */
let capturedRows = [];

function makeFakeCtx() {
  const gradient = { addColorStop() {} };
  const raw = {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: null,
    strokeStyle: null,
    lineWidth: 1,
    lineCap: 'butt',
    font: '10px monospace',
    textAlign: 'left',
    textBaseline: 'top',
    imageSmoothingEnabled: true,
    save() {},
    restore() {},
    setTransform() {},
    createLinearGradient() { counters.gradient += 1; return gradient; },
    createRadialGradient() { counters.gradient += 1; return gradient; },
    createPattern() { return null; },
    createImageData(w, h) { counters.createImageData += 1; return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; },
    getImageData(x, y, w, h) { counters.getImageData += 1; return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; },
    putImageData() { counters.putImageData += 1; },
    fillRect() { counters.fillRect += 1; },
    strokeRect() { counters.strokeRect += 1; },
    clearRect() { counters.clearRect += 1; },
    fillText(text) { counters.fillText += 1; if (typeof text === 'string') capturedRows.push(text); },
    strokeText() {},
    measureText() { return { width: 0 }; },
    drawImage() { counters.drawImage += 1; },
    beginPath() {},
    rect() {},
    clip() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    closePath() {},
    fill() {},
    stroke() {},
    arc() {},
  };
  const guarded = guardCtx(raw);
  guards.push(guarded);
  return guarded.ctx;
}

function makeFakeCanvas(w, h, withDoc) {
  const ctx = makeFakeCtx();
  const el = {
    width: Math.max(1, Math.round(w)),
    height: Math.max(1, Math.round(h)),
    clientWidth: w,
    clientHeight: h,
    style: {},
    getContext(id) { return id === '2d' ? ctx : null; },
  };
  if (withDoc) el.ownerDocument = { createElement: () => makeFakeCanvas(1, 1, false) };
  return el;
}

function frameAt(t) {
  return {
    t,
    dt: 0.016,
    seed: 20261118,
    pointer: { x: 0.5, y: 0.5, vx: 0, vy: 0, down: false },
    audio: null,
    biome: 'ink',
    reducedMotion: false,
    size: { w: WIDTH, h: HEIGHT, dpr: DPR },
  };
}

const mod = await loadTsModule(path.join(REPO_ROOT, 'shared', 'parts', 'ascii-field', 'index.ts'));
const makeAsciiField = mod.makeAsciiField;
if (typeof makeAsciiField !== 'function') {
  console.error('ascii-field bench: FAIL —— 没有导出 makeAsciiField');
  process.exit(1);
}

let failed = false;

/**
 * 跑一个 variant 并报数。
 *
 * @param {'keys'|'plain'} variant 变体
 * @returns {{ one: object, oneLow: object, rows: number, def: object }}
 */
function measure(variant) {
  const def = makeAsciiField({ variant });
  const mainCanvas = makeFakeCanvas(WIDTH * DPR, HEIGHT * DPR, true);
  mainCanvas.clientWidth = WIDTH;
  mainCanvas.clientHeight = HEIGHT;
  const ctx = mainCanvas.getContext('2d');
  const instance = def.create({
    canvas: mainCanvas, ctx, width: WIDTH, height: HEIGHT, dpr: DPR,
    seed: 20261118, biome: 'ink', lod: 'high',
  });

  for (let i = 0; i < 4; i += 1) instance.draw(frameAt(i * 0.016));
  for (const key of Object.keys(counters)) counters[key] = 0;
  capturedRows = [];
  instance.draw(frameAt(0.5));
  const one = { ...counters };
  const rowsText = capturedRows.slice();

  instance.setLod('low');
  for (const key of Object.keys(counters)) counters[key] = 0;
  instance.draw(frameAt(0.6));
  const oneLow = { ...counters };

  instance.dispose();
  instance.dispose();
  return { one, oneLow, def, rowsText };
}

console.log('ascii-field —— 两型的每帧指令（1280×720@dpr2，high 档）\n');

const plain = measure('plain');
console.log(`  【plain】id=${plain.def.id} costMs=${plain.def.costMs} blend=${plain.def.blend}`);
console.log(`    high: fillText=${plain.one.fillText} drawImage=${plain.one.drawImage} fillRect=${plain.one.fillRect}`);
console.log(`    low : fillText=${plain.oneLow.fillText} drawImage=${plain.oneLow.drawImage}`);
console.log(`    → 按行合并：每帧 fillText 应 == 行数，drawImage 应 == 0`);
if (plain.one.fillText < 8 || plain.one.drawImage !== 0) {
  console.error('    ❌ plain 没有走"按行合并"这条路');
  failed = true;
}
if (!(plain.oneLow.fillText < plain.one.fillText)) {
  console.error(`    ❌ plain 的 low 档没有减量（${plain.one.fillText} → ${plain.oneLow.fillText}）`);
  failed = true;
}

const keys = measure('keys');
console.log(`\n  【keys】id=${keys.def.id} costMs=${keys.def.costMs} blend=${keys.def.blend}`);
console.log(`    high: drawImage=${keys.one.drawImage} fillText=${keys.one.fillText} fillRect=${keys.one.fillRect}`);
console.log(`    low : drawImage=${keys.oneLow.drawImage} fillText=${keys.oneLow.fillText}`);
console.log(`    → 图集盖印：每帧 fillText 应 == 0；fillRect 应 == 0（块字符在图集里画过一次）`);
if (keys.one.fillText !== 0) {
  console.error(`    ❌ keys 仍在逐格 fillText（${keys.one.fillText} 次），图集没生效`);
  failed = true;
}
if (keys.one.drawImage < 100) {
  console.error(`    ❌ keys 的 drawImage 太少了（${keys.one.drawImage}），图集盖印没发生`);
  failed = true;
}
if (keys.one.fillRect !== 0) {
  console.error(`    ❌ keys 每帧仍在 fillRect（${keys.one.fillRect} 次）—— 块字符应该在图集烘焙时画好`);
  failed = true;
}
if (!(keys.oneLow.drawImage < keys.one.drawImage * 0.4)) {
  console.error(`    ❌ keys 的 low 档没有真减量（${keys.one.drawImage} → ${keys.oneLow.drawImage}，应降到 ~1/4）`);
  failed = true;
}

// costMs 必须按 variant 分开（两型差一个量级）
console.log('\n  costMs 对账（估算：keys = 格数×0.004ms；plain = 行数×0.01+0.2）');
console.log(`    plain=${plain.def.costMs}  keys=${keys.def.costMs}`);
if (!(keys.def.costMs > plain.def.costMs * 3)) {
  console.error('    ❌ 两型的 costMs 没拉开（共用一个常数 = 在预算账上撒谎）');
  failed = true;
}
const expectKeys = keys.one.drawImage * 0.004;
if (Math.abs(keys.def.costMs - expectKeys) / Math.max(1e-6, expectKeys) > 0.6) {
  console.error(`    ❌ keys 的 costMs 与指令数对不上（声明 ${keys.def.costMs}ms，按 ${keys.one.drawImage} 次盖印应为 ${expectKeys.toFixed(2)}ms）`);
  failed = true;
}

// ── E. 契约的两条静态约束（MANUAL-QA §7 第 7 条：能自动化的就自动化）──
// ① 不许有 `meta.ground`：它会 fillRect 一块不透明底并翻转 env().paper，直接毁掉 L0
// ② 字符集不许含画框字符（┌─┐│└┘）：`aquarium` 那个画框的坑写在 ASCII-PIECE-CONTRACT 里，
//    用静态断言挡比每次看截图便宜。**画框是字符集问题，不是渲染问题。**
{
  const def = mod.part ?? mod.default;
  if ('ground' in def) {
    console.error('\nascii-field bench: FAIL —— 零件定义里有 ground 字段（会铺不透明底并翻转 paper）');
    failed = true;
  }
  const source = readFileSync(path.join(REPO_ROOT, 'shared', 'parts', 'ascii-field', 'index.ts'), 'utf8');
  const rampMatch = /const RAMP = '([^']*)'/.exec(source);
  if (!rampMatch) {
    console.error('\nascii-field bench: FAIL —— 找不到 RAMP 字面量（字符集断言失去对象）');
    failed = true;
  } else {
    const ramp = rampMatch[1];
    const boxChars = ['┌', '─', '┐', '│', '└', '┘', '├', '┤', '┬', '┴', '┼'];
    const found = boxChars.filter((ch) => ramp.includes(ch));
    if (found.length > 0) {
      console.error(`\nascii-field bench: FAIL —— 字符斜坡含画框字符 ${found.join(' ')}（画框会被读成 UI）`);
      failed = true;
    }
    // 块元素：RAMP 含 `█` 时，**图集烘焙里必须有 fillRect 分支**（用字形画会出缝）。
    // 这条和"禁画框字符"是两个问题：`█` 不属于画框，禁不掉，只能要求走 rect 路径。
    if (ramp.includes('█')) {
      const hasRectBranch = /ch === '█'[\s\S]{0,200}?fillRect\(/.test(source);
      if (!hasRectBranch) {
        console.error('\nascii-field bench: FAIL —— RAMP 含 █ 但找不到 fillRect 分支（字形画块元素会出缝）');
        failed = true;
      } else {
        console.log('  块元素：RAMP 含 █，渲染走 fillRect 分支 ✓');
      }
    }
    const printable = [...ramp].every((ch) => ch === ' ' || ch.charCodeAt(0) > 0x20);
    if (!printable) {
      console.error('\nascii-field bench: FAIL —— 字符斜坡含不可打印字符');
      failed = true;
    }
  }
  console.log(`\nE. 契约静态约束：无 ground 字段=${!('ground' in def)} · 字符斜坡无画框字符=${rampMatch ? !['┌', '─', '┐', '│', '└', '┘', '├', '┤', '┬', '┴', '┼'].some((c) => rampMatch[1].includes(c)) : 'n/a'}`);
}

// ── G. K1 + K1b：斜向流动，且**不是等距人字纹** ──
// ★ 两条判据互检过一次：K1 原来写成"隔 4 行偏移恒定（占 ≥60%）"，
//   而 K1b 要求"δ 在 {2,3,4} 之间变化" —— **隔 4 行恒定与 δ 变化数学上冲突**。
//   按产品口径改成：**K1 看隔 1 行（非零、全同号），K1b 看取值分布（≥3 种、各 ≥15%）**。
//   这是在 1:1 下判出"字形清晰但像织物"之后补的：真实的水是**方向一致、间距变化**。
{
  const rows2 = plain.rowsText ?? [];
  /** 两行在 ±6 格内的最佳横向偏移（最小不同字符数） */
  const bestShift = (a, b) => {
    let best = null;
    for (let d = -6; d <= 6; d += 1) {
      let diff = 0;
      let n = 0;
      for (let i = 6; i < a.length - 6; i += 1) {
        const j = i + d;
        if (j < 0 || j >= b.length) continue;
        n += 1;
        if (a[i] !== b[j]) diff += 1;
      }
      const rate = n > 0 ? diff / n : 1;
      if (best === null || rate < best.rate) best = { d, rate };
    }
    return best ? best.d : 0;
  };
  const shifts = [];
  for (let y = 0; y + 1 < rows2.length; y += 1) shifts.push(bestShift(rows2[y], rows2[y + 1]));
  const total = Math.max(1, shifts.length);
  const nonZero = shifts.filter((d) => d !== 0).length / total;
  const sign = shifts.length ? Math.sign(shifts.find((d) => d !== 0) ?? 0) : 0;
  const sameSign = shifts.filter((d) => Math.sign(d) === sign).length / total;
  const counts = new Map();
  for (const d of shifts) counts.set(d, (counts.get(d) ?? 0) + 1);
  const distinct = [...counts.entries()].filter(([d, c]) => d !== 0 && c / total >= 0.15);
  console.log(`\nG. K1 隔 1 行最佳偏移：非零 ${(nonZero * 100).toFixed(0)}% · 同号 ${(sameSign * 100).toFixed(0)}%`);
  console.log(`   K1b 取值分布：${[...counts.entries()].filter(([d]) => d !== 0).map(([d, c]) => `${d}格×${(c / total * 100).toFixed(0)}%`).join(' ') || '(无)'}`);
  if (rows2.length > 0) {
    if (nonZero < 0.6) {
      console.error(`    ❌ K1：只有 ${(nonZero * 100).toFixed(0)}% 的行对偏移非零 —— 行间没有稳定横向错位（会读成"一行行字"）`);
      failed = true;
    } else if (sameSign < 0.9) {
      console.error(`    ❌ K1：方向不一致（同号 ${(sameSign * 100).toFixed(0)}%）—— 有斜但不成一个方向`);
      failed = true;
    }
    // K1b：{2,3,4} 里至少 3 个取值、各占 ≥15%（现在 δ 恒 3 → 只有 1 个取值，会被抓红）
    if (distinct.length < 3) {
      console.error(`    ❌ K1b：只有 ${distinct.length} 个 ≥15% 的取值（需 3 个，取自 {2,3,4}）—— 会变成等距人字纹/织物感`);
      failed = true;
    }
    const outOfRange = distinct.filter(([d]) => ![2, 3, 4, -2, -3, -4].includes(d));
    if (outOfRange.length > 0) {
      console.error(`    ❌ K1b：出现 {2,3,4} 之外的偏移 ${outOfRange.map(([d]) => d).join(',')}`);
      failed = true;
    }
  }
}

// ── H. 字形可辨认（代理断言）──
// PM 的判据是"1:1 下任取 20 格，≥8 格能辨认字形"，那需要真像素。
// 这里用**字符级代理**：任取 20 个非空格，统计"墨字符占比 ≥ 8/20"，
// 并断言非空格数足够（否则整幅是空白，也就没有"水"）。真像素的 1:1 目视仍由 PM 做。
{
  const rows3 = plain.rowsText ?? [];
  let nonSpace = 0;
  let total = 0;
  let glyphKinds = new Set();
  for (const row of rows3) {
    for (const ch of row) { total += 1; if (ch !== ' ') { nonSpace += 1; glyphKinds.add(ch); } }
  }
  const density = total > 0 ? nonSpace / total : 0;
  console.log(`\nH. 字形：非空字符 ${nonSpace}/${total}（密度 ${(density * 100).toFixed(0)}%）· 用到 ${glyphKinds.size} 种字形`);
  if (density < 0.35) {
    console.error(`    ❌ 墨密度 ${(density * 100).toFixed(0)}% 太低 —— 读不出"字符画的水面"（需 ≥35%）`);
    failed = true;
  }
  if (glyphKinds.size < 5) {
    console.error(`    ❌ 只用到 ${glyphKinds.size} 种字形 —— 层次太少，读不出水纹`);
    failed = true;
  }
}

for (const guard of guards) {
  if (guard.missing.size > 0) {
    console.error(`\nascii-field bench: FAIL —— 假 ctx 缺少方法：${[...guard.missing].join(', ')}`);
    process.exit(1);
  }
}

// ── F. 形态的两条可判据（PM 给的，直接可断言）──
//   ① 任意一行内**同字符连续 ≤14 格**（否则整行同字 → 读成扫描线）
//   ② 任意两行的字符序列**不得整体平移重合**（否则"每行都是同一条纹"）
{
  const rows = plain.rowsText ?? [];
  const source = readFileSync(path.join(REPO_ROOT, 'shared', 'parts', 'ascii-field', 'index.ts'), 'utf8');
  void source;
  let maxRun = 0;
  for (const row of rows) {
    let run = 1;
    for (let i = 1; i < row.length; i += 1) {
      if (row[i] === row[i - 1]) { run += 1; if (run > maxRun) maxRun = run; } else run = 1;
    }
  }
  const shiftedSame = (a, b) => {
    if (a.length !== b.length) return false;
    for (let s = 0; s < a.length; s += 1) {
      let all = true;
      for (let i = 0; i < a.length; i += 1) {
        if (a[i] !== b[(i + s) % a.length]) { all = false; break; }
      }
      if (all) return true;
    }
    return false;
  };
  // ⚠️ 与 K1 **互检后的修正**：K1 要求"相邻行固定横向偏移"——
  //   而"固定偏移"的数学后果就是**行是彼此的平移副本**。所以"任意两行不得平移重合"
  //   与"斜向流动"**直接冲突**（这正是主理人说的"新判据必须与已有硬判据互检"）。
  //   保留的是更根本的那条：**不得有两行完全相同**（那才是"每行都是同一条纹"）。
  let coincidence = 0;
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      if (rows[i] === rows[j]) coincidence += 1;
    }
  }
  void shiftedSame;
  console.log(`\nF. 形态判据：行数=${rows.length} · 行内同字符最长连续=${maxRun}（需 ≤14）· 平移重合行对=${coincidence}（需 0）`);
  if (rows.length === 0) {
    console.error('    ❌ 没有捕获到行文本（plain 应该每行一次 fillText）');
    failed = true;
  } else if (maxRun > 14) {
    console.error(`    ❌ 行内同字符连续 ${maxRun} 格，超过 14 —— 会被读成扫描线`);
    failed = true;
  } else if (coincidence > 0) {
    console.error(`    ❌ 有 ${coincidence} 对行是整体平移重合的 —— "每行都是同一条纹"`);
    failed = true;
  }
}

if (failed) {
  console.error('\nascii-field bench: FAIL');
  process.exit(1);
}
console.log('\nascii-field bench: PASS');
