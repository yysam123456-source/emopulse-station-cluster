// ascii-field —— L2 生态：把「ASCII 字符帧」当成一个可装配的零件。
//
// 为什么是**一个零件 + variant**，不是两个零件（与 `pixel-post` 同源的判断）：
//   两型的差别是**渲染策略**（逐格盖印 vs 按行合并），不是两件事。契约零改动就能表达，
//   而拆成两个零件会让"同页混排"变成装配器的问题（其实它是参数问题）。
//
// ★ 两型的差异必须在**零件内部**吸收，别丢给站点（这是本件存在的意义）：
//   | | keys（ascii-magic 734 件） | plain（ascii-rest 250 件） |
//   |---|---|---|
//   | 源 | `default() → (t) => {text, color}` | `default() → (t) => string` |
//   | 颜色 | 字符键 → hex（`palette` 对象） | 无（单色，由我们注入） |
//   | 行高 | `1/CELL_W ≈ 1.6611 × 单元格宽` | `2.0 × 单元格宽` |
//   | 渲染 | GlyphAtlas 预烘 + 逐格 drawImage | 按行合并（每行/每色段 1 次 fillText） |
//   **行高差 20%**（1.6611 vs 2.0）是这两型最容易静默出错的地方 —— 同页混排若要一致，
//   必须缩一边，而只有零件知道该缩哪边。所以 `lineFactor` 由 `variant` 决定，站点不要碰。
//
// ★ 三条来自 `docs/ASCII-PIECE-CONTRACT.md` 的硬约束（违反即静默出错）：
//   1. **`meta.ground` 必须删掉**：它会 `fillRect` 一块不透明底，并翻转 `env().paper`
//      让 piece 按浅色纸重画 —— 直接毁掉 L0 的纸。本件不读 ground，也不提供。
//   2. **`█` 等块元素走 `fillRect`**：用字形画会出缝（字形的行盒有内边距）。
//   3. **`meta.cell` 同名不同义**：keys 是 `"square"`（字符串枚举），plain 是 `2`（行高倍数）。
//      `cell === 'square'` 对 plain 恒 false，行高会错一倍 —— 本件用 `variant` 显式区分，
//      绝不去猜 `cell` 的类型。
//
// ★ 帧预算纪律：`draw` 里零 new、零闭包、零数组字面量、零 Math.random、零自持时钟。
//   例外并如实标注：ASCII 内容**每帧必然构造字符串**（文本帧的载体），这笔分配在源里，避免不了；
//   渲染侧的图集/缓冲全部预分配。
import type { BlendMode, PartEnv, PartInstance, PartV2, StageSize, WorldFrame } from '../../stage/contract';
import { mulberry32 } from '../../stage/world';

/** 文本件的单元格宽高比基准（`docs/ASCII-PIECE-CONTRACT.md` §8）。 */
const CELL_W = 0.602;

/** ascii-rest 的行高倍数（与 `CELL_W` 差 20%，见文件头）。 */
const PLAIN_LINE_FACTOR = 2.0;

/** 两型的默认栅格（high 档）。 */
const GRID_KEYS = { cols: 92, rows: 34 } as const;
// ★ 格子数从 96×36 降到 76×28：**字符必须能被认出来**。
//   PM 在 1:1 下判过："字符太小、墨太淡（0.62），抗锯齿占主导，整片读成灰蒙蒙的碎屑，
//   既读不出是字符，也读不出是水。" 判据：1:1 下任取 20 格，≥8 格能辨认字形。
const GRID_PLAIN = { cols: 76, rows: 28 } as const;

/** low 档缩放系数（真减量：格数降到约 1/4）。 */
const LOD_SCALE = 0.5;

/**
 * 字符斜坡（由暗到亮）。末尾是 `█` —— **块元素必须走 fillRect**，用字形画会出缝。
 * 本件在**图集烘焙时**对它 fillRect 一次，之后逐帧盖印：既不出缝，也不值得每帧 fillRect。
 */
/**
 * 相邻行的**固定**横向偏移（格）。产品判据 K1 要求 2–4，取 3。
 *
 * 为什么必须"固定"而不是"每行随机"：随机相位让每行独立 → 读成"一行行字"（K1 众数 0、占 55%）；
 * 固定偏移才能让同相位的字符沿斜线连成带。**但也不能让段相位接管** —— 那会退化成横向条带。
 * 三次都栽在"相位主导权放错地方"，这条常量就是那个主导权的落点。
 */
const ROW_SHIFT = 3;

/**
 * K1b：**每行的横向推进量要在 {2,3,4} 之间变**（产品判据）。
 *
 * 恒等于 3 的结果是"等距人字纹"——斜向极强、强到像织物，整片规整，PM 在 1:1 下判为"编织感"。
 * 真实的水是**方向一致、间距变化**。所以方向必须全同号（`+δ`），但 δ 按 3 行一段在 {2,3,4} 之间取。
 * 判据：隔 1 行的最佳偏移里，{2,3,4} **至少 3 个取值、各占 ≥15%**，且全同号。
 */
const SHIFT_CHOICES: readonly number[] = [2, 3, 4];

/** δ 的分段长度（行）：每 3 行换一个 δ，短到能看出变化、长到不破坏斜向连贯。 */
const SHIFT_BAND = 3;

const RAMP = ' .:-=+*#%█';

/** keys 型的调色键（最多 62 个，这里只要 4 个水色）。 */
const KEYS_PALETTE: Readonly<Record<string, string>> = {
  '0': 'rgba(180,206,222,0.55)',
  '1': 'rgba(206,228,240,0.75)',
  '2': 'rgba(232,244,250,0.92)',
  '3': 'rgba(255,255,255,1)',
};

/** keys 型的颜色键序列（与 RAMP 的亮度档对应）。 */
const KEY_OF_LEVEL = ['0', '0', '1', '1', '2', '2', '3', '3', '3'];

/**
 * 二维确定性哈希（0..1）。ASCII 内容每帧重算，所以必须**便宜且无分配** ——
 * 这是内联整数运算而不是建表/建对象的原因。
 *
 * @param a 维度 1
 * @param b 维度 2
 * @param seed 种子
 */
function hash2(a: number, b: number, seed: number): number {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(seed | 0, 2246822519)) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** 站点可配参数。 */
export interface AsciiFieldOptions {
  /** 'keys' = GlyphAtlas 逐格盖印；'plain' = 按行合并单色。缺省 'plain'（更便宜、更安静）。 */
  readonly variant?: 'keys' | 'plain';
  /** 单色墨（plain 用）。 */
  readonly ink?: string;
  /**
   * 混合模式。**必须由站点决定**，因为同一件 ASCII 在两种语境里是相反的：
   *   · 暗场景上的"光"（/hug 的水面字）→ `lighter`
   *   · 亮纸上的"墨"（/koi-pond）→ `multiply`
   * 用 `lighter` 画墨会在浅纸上把字**提亮**，结果是接近不可见（截图里发现过一次）。
   */
  readonly blend?: BlendMode;
}

/** 默认参数：plain 最便宜，不该让"忘记配参"变成"每帧 3000 次 drawImage"。 */
const DEFAULTS: Required<AsciiFieldOptions> = {
  variant: 'plain',
  ink: 'rgba(226,238,244,0.82)',
  blend: 'lighter',
};

/** 可挂 2D 上下文的最小平面的结构类型。 */
interface Canvas2DLike {
  width: number;
  height: number;
  getContext(id: '2d'): CanvasRenderingContext2D | null;
}

/**
 * 取离屏 canvas 工厂。
 *
 * @param canvas 主画布
 * @returns 工厂或 null
 */
function offscreenFactory(canvas: Canvas2DLike): (() => Canvas2DLike | null) | null {
  const doc = (canvas as unknown as {
    ownerDocument?: { createElement(tag: string): Canvas2DLike };
  }).ownerDocument ?? (globalThis as unknown as {
    document?: { createElement(tag: string): Canvas2DLike };
  }).document;
  if (!doc || typeof doc.createElement !== 'function') return null;
  return () => {
    try {
      const el = doc.createElement('canvas');
      return typeof el.getContext === 'function' ? el : null;
    } catch {
      return null;
    }
  };
}

/**
 * 按参数构造一个 ascii-field 零件。
 *
 * `costMs` 按 `variant` 分别算：两型的每帧指令量差一个量级（3128 次 drawImage vs 36 次 fillText），
 * 共用一个常数就是在预算账上撒谎，而 `planBudget` 的降档决策全靠它。
 *
 * @param options 站点参数
 * @returns 零件定义（id 恒为 'ascii-field'）
 */
export function makeAsciiField(options: AsciiFieldOptions = {}): PartV2 {
  const variant = options.variant === 'keys' ? 'keys' : DEFAULTS.variant;
  const ink = typeof options.ink === 'string' && options.ink.length > 0 ? options.ink : DEFAULTS.ink;
  const blend = options.blend ?? DEFAULTS.blend;
  const base = variant === 'keys' ? GRID_KEYS : GRID_PLAIN;

  // costMs 估算（**估算，不是实测**；常数与 field-ground 同源）：
  //   keys  = cols×rows 次 drawImage（每格一次）+ 一次图集烘焙（仅 resize）
  //          92×34 = 3128 次 × ~0.004 ms/次 ≈ 12.5 ms
  //   plain = rows 次 fillText（按行合并，96 字符一行画一次）
  //          36 次 × ~0.01 ms + 光栅化 ≈ 0.5 ms
  const cells = base.cols * base.rows;
  const costMs = variant === 'keys'
    ? Math.round(cells * 0.004 * 100) / 100
    : Math.round((base.rows * 0.01 + 0.2) * 100) / 100;

  function create(env: PartEnv): PartInstance {
    const maybeCtx = env.ctx;
    if (!maybeCtx) throw new Error('ascii-field 需要 canvas2d 上下文（channel 必须为 canvas2d）');
    const ctx: CanvasRenderingContext2D = maybeCtx;
    const mainCanvas = env.canvas as unknown as Canvas2DLike;
    const makeCanvas = offscreenFactory(mainCanvas);

    let w = env.width > 0 ? env.width : 1;
    let h = env.height > 0 ? env.height : 1;
    let dpr = env.dpr > 0 ? env.dpr : 1;
    let lod: 'low' | 'high' = env.lod;
    let disposed = false;

    /** 当前栅格 */
    let cols: number = base.cols;
    let rows: number = base.rows;
    /** 单元格尺寸（CSS px） */
    let cellW = 1;
    let cellH = 1;
    /** 内容缓冲（预分配，帧内复用） */
    let textRows: string[] = [];
    let colorKeys: string[] = [];
    /** keys 型的图集：每个字符 × 每个调色键一张小图 */
    let atlas: Canvas2DLike | null = null;
    let atlasScale = 0;

    // 行高倍数：**唯一知道该用哪个的地方**（两型差 20%，别让站点补）
    const lineFactor = variant === 'plain' ? PLAIN_LINE_FACTOR : 1 / CELL_W;

    /** 每行的累计横向偏移（δ 在 {2,3,4} 之间按段变化，方向恒为正） */
    let rowOffsets: number[] = [];

    /** 栅格与字号：保持整幅铺满、且单元格不变形。 */
    function layout(): void {
      const scale = lod === 'low' ? LOD_SCALE : 1;
      cols = Math.max(8, Math.round(base.cols * scale));
      rows = Math.max(4, Math.round(base.rows * scale));
      // 先按宽度定 cellW，再检查高度是否放得下；放不下就按高度反推
      cellW = w / cols;
      cellH = cellW * lineFactor;
      if (cellH * rows > h) {
        cellH = h / rows;
        cellW = cellH / lineFactor;
      }
      atlasScale = 0; // 尺寸变了，图集要重烘
      textRows = new Array<string>(rows).fill('');
      colorKeys = new Array<string>(rows).fill('');
      // K1b：累计偏移，δ 按 SHIFT_BAND 行一段在 {2,3,4} 之间取（方向恒为正）
      rowOffsets = new Array<number>(rows).fill(0);
      for (let y = 1; y < rows; y += 1) {
        const band = Math.floor(y / SHIFT_BAND);
        // 用**轮转**而不是哈希：28 行只有 ~9 段，哈希抽样会让 {2,3,4} 的占比随机偏斜
        // （实测 −4 只占 14.9%，恰好卡在判据 15% 的线下）。轮转保证三段各占 1/3，可复现。
        const pick = SHIFT_CHOICES[(band + (env.seed % SHIFT_CHOICES.length)) % SHIFT_CHOICES.length];
        rowOffsets[y] = rowOffsets[y - 1] + pick;
      }
    }

    /**
     * 把 ASCII 内容算进 `textRows` / `colorKeys`（预分配，不建新数组）。
     *
     * 这是一个**内置的样例 piece**（水波纹），形态与上游两型一致：
     * plain 只产生字符；keys 另产生一列颜色键。上游 piece 到位后，替换这一段即可，
     * 渲染层不用动（这正是"渲染策略 vs 内容"该有的切分）。
     *
     * @param frame 世界帧
     */
    function fillContent(frame: WorldFrame): void {
      const t = frame.t;
      const motion = frame.reducedMotion ? 0.35 : 1;
      const px = frame.pointer.x - 0.5;
      const py = frame.pointer.y - 0.5;
      const audio = frame.audio ? frame.audio.level : 0;
      const rampLen = RAMP.length;
      // 顶端两个字符留给"最亮的点"，**样例不产生实心块**：`█` 读起来像 UI 色块，不像墨点。
      // 图集仍支持块字符（fillRect 那一格），供将来的 piece 用。
      const top = rampLen - 2;

      // 斜向短波纹段（产品口径 K1：**相邻行固定横向偏移 2–4 格**）。
      //
      // ★ 三次都栽在"相位的主导权放错地方"，记下来免得第四次：
      //   ① 段相位**完全接管** → 段内几乎同一字符 → 退化成横向条带
      //   ② 主相位连续但**段相位带 y** → 行间关系被打散 → 读成"一行行字"（K1 众数 0、占 55%）
      //   ③ 现在：主相位沿**对角线固定推进** `x + y*SHIFT`（行间稳定偏移 3 格），
      //      段相位**只与段号有关**（沿对角线一致），再乘 0.35 做局部扰动，不接管主体。
      for (let y = 0; y < rows; y += 1) {
        let row = '';
        let keys = '';
        let runChar = '';
        let runLen = 0;
        for (let x = 0; x < cols; x += 1) {
          // 对角线坐标：行 y+1 等于行 y 左移 SHIFT 格 —— 这一步就是"斜向"的定义
          // K1b：行偏移取自**累计表**（δ 在 {2,3,4} 之间变），而不是恒定的 y*3
          const diag = x + (rowOffsets[y] ?? y * ROW_SHIFT);
          // 段沿对角线切；段相位只与段号有关（**不含 y**，否则行间关系被打散）
          const segLen = 6 + Math.floor(hash2(Math.floor(diag / 8), 0, env.seed) * 9); // 6..14
          const seg = Math.floor(diag / segLen);
          const segPhase = hash2(seg, 0, env.seed ^ 0x9e37) * Math.PI * 2;
          const segBias = (hash2(seg, 3, env.seed) - 0.5) * 0.7;
          const wave = Math.sin(diag * 0.90 - t * 1.05 * motion + segPhase * 0.35)
            + Math.sin(diag * 0.33 + t * 0.31 * motion + segPhase * 0.15) * 0.55
            + segBias
            + Math.sin(t * 1.1 * motion + segPhase) * (audio * 0.5);
          let level = Math.round(((wave + 1.5) / 3.0) * top);
          if (level < 0) level = 0;
          if (level > top) level = top;
          // ★ 留白：低位直接落成空格。两个作用：
          //   ① 观感上"墨在纸上要透气"，否则整幅是一张排满字的稿纸；
          //   ② **中间灰阶**主要来自字形抗锯齿边缘 —— 字越稀，纯纸面积越大，灰阶占比越低
          //      （实测排满时 16.3%，留白后见 bench/门输出）。
          if (level <= 1) level = 0;
          let ch = RAMP[level];
          // 行内同字符连续 ≤14（K3 之外的另一条形态判据）：生成时就地保证
          if (ch === runChar && runLen >= 14) {
            level = (level + 1) % (top + 1);
            ch = RAMP[level];
            runLen = 1;
            runChar = ch;
          } else if (ch === runChar) {
            runLen += 1;
          } else {
            runChar = ch;
            runLen = 1;
          }
          row += ch;
          if (variant === 'keys') keys += KEY_OF_LEVEL[level] ?? '0';
        }
        textRows[y] = row;
        if (variant === 'keys') colorKeys[y] = keys;
      }
      void px; void py;
    }

    /** 烘图集：每个字符 × 每个调色键一张 `cellW×cellH` 的小图。 */
    function bakeAtlas(): void {
      if (!makeCanvas) return;
      const width = Math.max(1, Math.round(cellW * dpr));
      const height = Math.max(1, Math.round(cellH * dpr));
      const keys = Object.keys(KEYS_PALETTE);
      const total = RAMP.length * keys.length;
      if (!atlas) atlas = makeCanvas();
      if (!atlas) return;
      atlas.width = width * total;
      atlas.height = height;
      const g = atlas.getContext('2d');
      if (!g) return;
      g.clearRect(0, 0, atlas.width, atlas.height);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `${Math.round(width / CELL_W)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      for (let k = 0; k < keys.length; k += 1) {
        g.fillStyle = KEYS_PALETTE[keys[k]];
        for (let r = 0; r < RAMP.length; r += 1) {
          const ch = RAMP[r];
          if (ch === ' ') continue;
          const slot = k * RAMP.length + r;
          if (ch === '█') {
            // 块元素必须 fillRect：用字形画会出缝（行盒内边距）
            g.fillRect(slot * width, 0, width, height);
          } else {
            g.fillText(ch, slot * width + width * 0.5, height * 0.5);
          }
        }
      }
      atlasScale = cellW;
    }

    /** 重排并重烘。 */
    function relayout(nextW: number, nextH: number, nextDpr: number): void {
      w = nextW;
      h = nextH;
      dpr = nextDpr;
      layout();
      if (variant === 'keys') bakeAtlas();
    }

    relayout(w, h, dpr);

    return {
      update(): void {
        // 内容在 draw 里算（需要 frame 且必须与绘制同帧）
      },

      draw(frame: WorldFrame): void {
        if (disposed) return;
        fillContent(frame);

        if (variant === 'keys') {
          if (!atlas || atlasScale !== cellW) bakeAtlas();
          if (!atlas) return;
          const keys = Object.keys(KEYS_PALETTE);
          const width = Math.max(1, Math.round(cellW * dpr));
          const height = Math.max(1, Math.round(cellH * dpr));
          const total = RAMP.length * keys.length;
          // 逐格盖印：每格一次 drawImage（图集里已按 字符×色 预烘）
          for (let y = 0; y < rows; y += 1) {
            const rowText = textRows[y];
            const rowKeys = colorKeys[y];
            if (rowText.length === 0) continue;
            const originY = y * cellH;
            for (let x = 0; x < rowText.length; x += 1) {
              const ch = rowText[x];
              if (ch === ' ') continue;
              const r = RAMP.indexOf(ch);
              const k = keys.indexOf(rowKeys[x]);
              if (r < 0 || k < 0) continue;
              const slot = k * RAMP.length + r;
              ctx.drawImage(
                atlas as unknown as CanvasImageSource,
                slot * width, 0, width, height,
                x * cellW, originY, cellW, cellH,
              );
            }
            void total;
          }
          return;
        }

        // plain：**按行合并**（96 字符一行 → 1 次 fillText，降 96 倍调用）
        ctx.fillStyle = ink;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        // ★ 字号按**实测步进宽度**反推，不按名义 `CELL_W`：
        //   名义 0.602 只是契约里的假设，浏览器等宽字体的实际步进常不同（实测差 15%），
        //   直接按名义值算会让整行只铺到画幅宽度的 ~85%，右边留一条白边。
        //   （这条只有截图能发现 —— 所有指令计数断言全绿。）
        const nominalPx = Math.max(6, Math.round(cellW / CELL_W));
        ctx.font = `${nominalPx}px ui-monospace, SFMono-Regular, Menlo, monospace`;
        const advance = ctx.measureText('M').width;
        if (advance > 0.1 && cols > 0) {
          const fitPx = (w / cols) / (advance / nominalPx);
          ctx.font = `${Math.max(6, Math.round(fitPx))}px ui-monospace, SFMono-Regular, Menlo, monospace`;
        }
        for (let y = 0; y < rows; y += 1) {
          const rowText = textRows[y];
          if (rowText.length === 0) continue;
          // 整行一起画：等宽字体下逐字符 x 位置正确，且只 1 次调用
          // ★ 整数对齐：`y * cellH` 通常是小数，亚像素落点会让每个字形外面糊一层抗锯齿灰 ——
          //   那正是"中间灰阶"的主要来源（比 dither 的影响还大）。取整后字形变实。
          ctx.fillText(rowText, 0, Math.round(y * cellH));
        }
      },

      resize(size: StageSize): void {
        const nextW = size.w > 0 ? size.w : 1;
        const nextH = size.h > 0 ? size.h : 1;
        const nextDpr = size.dpr > 0 ? size.dpr : 1;
        if (nextW === w && nextH === h && nextDpr === dpr) return;
        relayout(nextW, nextH, nextDpr);
      },

      setLod(next: 'low' | 'high'): void {
        if (next === lod) return;
        lod = next;
        relayout(w, h, dpr);
      },

      dispose(): void {
        if (disposed) return;
        disposed = true;
        if (atlas) {
          atlas.width = 0;
          atlas.height = 0;
        }
        atlas = null;
        textRows = [];
        colorKeys = [];
      },
    };
  }

  return {
    id: 'ascii-field',
    layer: 'L2',
    // 缺省 lighter（暗场景上的"光"）；亮纸上的"墨"由站点传 multiply
    blend,
    costMs,
    kb: 3,
    z: 0,
    channel: 'canvas2d',
    // 装饰性生态：预算超了可以整件不画（画面仍然成立）
    expendable: true,
    create,
  };
}

/**
 * 工厂的**统一名字**（`makePart`）：装配器与 preview 都按这个约定找工厂，
 * 免得每加一个可配参的零件就要改一遍加载器。`makeAsciiField` 保留为具名别名。
 */
export const makePart = makeAsciiField;

/** 缺省实例：plain（便宜、安静）。装配器与 preview 都靠这个导出。 */
export const part: PartV2 = makeAsciiField();

export default part;
