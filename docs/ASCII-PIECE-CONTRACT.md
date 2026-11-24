# ASCII-PIECE-CONTRACT

> 目的：把 ASCII 两套 piece 的渲染契约钉到"可以照抄"。给 `shared/parts/ascii-field/` 用（零件已存在，本文用于改它之前的口径核对）。
>
>
> **引用口径**：WebFetch 不返回行号，所以下面一律用「文件 + 函数名/常量名 + 原文片段」定位，片段都是逐字复制，未经改写。**凡我没读到的，写「未核实」。**
>
> **本轮读完的样本**（全文，不是头几行）：
> `public/ascii-rest/pieces/pond-ripples.js` 6,021 B ／ `public/ascii-rest/pieces/jellyfish.js` 7,605 B ／ `public/ascii-magic/pieces/moonlit-sea.js` 3,000 B ／ `public/ascii-magic/lib/kit.js` 10,772 B ／ `public/ascii-magic/runtime/player.js` 7,618 B ／ `public/ascii-magic/runtime/canvas.js` 25,922 B ／ `public/ascii-rest/mount.js` 8,871 B。

---

## 0. 两分钟版本：可照抄的最小渲染器

```js
// 契约：piece = { meta, default(): (t:number) => string | {text,color} }
import { CELL_W, FONT } from "./contract";           // 0.602 / 字体串，见 §8

function makeRenderer(piece, ctx, { box, ink = "#e4e4e7", palette = null }) {
  const { cols, rows, cell } = piece.meta;            // cell: ascii-magic 是 "square"|undefined；ascii-rest 是数字 2
  const cw = box.w / cols;                            // ← 只从容器推，不从字号推
  const ch = cw * (cell === "square" ? 1 : 1 / CELL_W); // 文本件 1.6611×
  const draw = piece.default();                       // ← 返回的是闭包，不是帧

  return (t) => {                                     // t 单位：秒（§6）
    const f = draw(t);
    const T = (typeof f === "string" ? f : f.text).split("\n");
    const C = typeof f === "string" ? null : f.color.split("\n");
    ctx.font = `${cw / CELL_W}px ${FONT}`;            // 字号由格子宽反推
    ctx.textBaseline = "middle";
    for (let r = 0; r < rows; r++) {
      const tr = [...T[r]], cr = C ? [...C[r]] : null;
      for (let c = 0; c < cols; c++) {
        const g = tr[c]; if (!g || g === " ") continue;
        const k = cr && cr[c];
        ctx.fillStyle = (k && k !== " " && palette && palette[k]) || ink;
        if (g === "█") { ctx.fillRect(c * cw, r * ch, Math.ceil(cw), Math.ceil(ch)); continue; }
        ctx.fillText(g, c * cw, (r + 0.5) * ch);      // ← 基线 middle + 半行偏移，不要手动加 rowH
      }
    }
  };
}
```

这 20 行是 `canvas.js` 的 `paintText()`（无 atlas 分支）逐行等价改写；AS-IS 原文见 §7。**它跑得动，但每格一次 `fillText`，成本见 §9。**

---

## 1. `mod.default()` 到底返回什么

**两套都返回一个闭包 `(t) => frame`，不是帧、不是对象。** 区别在 `frame` 的类型。

**ascii-magic**（`public/ascii-magic/pieces/moonlit-sea.js`，`export default function create()`）：

```js
export default function create() {
  const { cols, rows } = meta;
  const g = new Grid(cols, rows);
  ...
  return (t) => {
    g.clear();
    ...
    return g.frame();
  };
}
```

→ `mod.default()` = factory 调用一次 → 返回 `(t) => frame`，`frame` 由 `Grid.frame()` 决定（见 §2）。

**ascii-rest**（`public/ascii-rest/pieces/pond-ripples.js`，`export default function pondRipples()`）：

```js
    return (time) => {
        const t = START + time;
        ...
        return lines.join("\n");
    };
```

（`jellyfish.js` 同构，结尾是 `return lines.join("\n");`。）

→ `mod.default()` = `(t) => string`，**永远是字符串，不会返回对象**（两件抽查一致）。

**⚠ 关键副作用**：闭包持有**同一个** `Grid` / `grid` 数组实例，每帧 `g.clear()` 后原地重写。所以：

- 同一个闭包**不能跨帧并发**（两次调用会互相踩）。
- **两个实例必须各自调 `mod.default()` 一次**，不能共享。
- 闭包是**有状态的**（尽管帧内清了），别再叠"每帧新建 Grid"的优化，会白花分配。

---

## 2. `frame` 的结构

### 2.1 内部存储：扁平一维，`i = x + y * cols`

`kit.js` 的 `class Grid`：

```js
export class Grid {
  constructor(cols, rows) {
    this.cols = cols; this.rows = rows;
    this.ch = new Array(cols * rows).fill(" ");
    this.co = new Array(cols * rows).fill(" ");
    this.z = new Float32Array(cols * rows);
  }
  set(x, y, ch, co) {
    x = Math.floor(x); y = Math.floor(y);
    if (!this.inside(x, y)) return;
    const i = x + y * this.cols;
    this.ch[i] = ch; if (co !== undefined) this.co[i] = co;
  }
```

→ **`ch` / `co` 是两个平行的扁平数组，索引 `[y * cols + x]`，不是 `[row][col]`。**

ascii-rest 的 `jellyfish.js` 用裸数组，但同构：

```js
    const grid = new Array(cols * rows);
    const put = (x, y, ch) => {
        x = Math.round(x);
        y = Math.round(y);
        if (x >= 0 && x < cols && y >= 0 && y < rows)
            grid[y * cols + x] = ch;
    };
```

### 2.2 对外输出：行字符串数组 → `join("\n")`

`kit.js` 的 `Grid.frame()`：

```js
  frame() {
    const lines = [], cl = [];
    let colored = false;
    for (let y = 0; y < this.rows; y++) {
      lines.push(this.ch.slice(y * this.cols, (y + 1) * this.cols).join(""));
      const c = this.co.slice(y * this.cols, (y + 1) * this.cols).join("");
      if (!colored && c.trim()) colored = true;
      cl.push(c);
    }
    return colored ? { text: lines.join("\n"), color: cl.join("\n") } : lines.join("\n");
  }
```

`jellyfish.js` 的收尾：

```js
        const lines = [];
        for (let r = 0; r < rows; r++)
            lines.push(grid.slice(r * cols, (r + 1) * cols).join(""));
        return lines.join("\n");
```

**结论：对外永远是"按 `\n` 切开的等宽行字符串"。** `color` 与 `text` **几何完全一致**（同 `cols`、同 `rows`、同换行位置），这是能逐格配色的前提。

**⚠ 必须用码点迭代，不能用下标。** 库自己就是这么做的（`canvas.js` 的 `paintText`：`const row = [...T[r]]`、`for (const g of row)`）。用 `T[r][c]` 的话，一旦某个 piece 输出了 BMP 外字符（emoji、部分符号），`text` 与 `color` 的下标会错位。**全部按 `[...line]` 处理。**

---

## 3. 每个格子里存的是什么

| | 存的东西 | 取值域 |
|---|---|---|
| 字符 | **一个字符**（UTF-16 码点，通常是半角/框线/块元素） | `" "` = 空；`"█"` = 全填（特殊处理，见 §7） |
| 颜色 | **单字符"调色键"** | `KEYS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"` 中的**一个字符**；`" "` = 无颜色，用默认 ink |

`kit.js` 头注释把这条写死了：

```
 * A piece draws into a Grid and returns grid.frame(). A Grid holds one
 * character and one colour key per cell. Colour keys are single characters
 * that index the piece's meta.palette; a space means "default ink".
```

**⚠ 不是 `0..n-1` 的数字索引，也不是 `{ch, key}` 对象。** 两样东西分别在两个平行数组里，用同一个扁平下标对齐。

**而 ascii-rest 的调色键是数字。** `mount.js`：

```js
    const color = palette && canvas ? new Uint8Array(cols * rows) : undefined;
    ...
        const glyph = (code, i) => {
            ...
            actx.fillStyle = palette ? palette[i] || palette[0] : ink;
```

→ ascii-rest 里 `env.color[i] = n`，`n` 是 **0..255 的字节**，`palette[n]` 直接数字下标；`palette[0]` 兜底。

**这是两套协议最根本的差异：一个用字符键，一个用数字键。** 做通用零件时它决定了 §10 的第 1 个问题。

---

## 4. 调色板：`palette` / `KEYS` / `gradient()`

`kit.js` 原文：

```js
/** Build a palette object from a list of hex colours: keys "0".."9","a".."z". */
export const KEYS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
export function palette(hexes) {
  const p = {};
  hexes.forEach((h, i) => (p[KEYS[i]] = h));
  return p;
}
/** A gradient palette of n steps between colour stops, for shading by value. */
export function gradient(stops, n = 10) {
  const toRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const rgb = stops.map(toRgb);
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * (rgb.length - 1);
    const j = Math.min(rgb.length - 2, Math.floor(t)), f = t - j;
    const c = rgb[j].map((v, k) => Math.round(lerp(v, rgb[j + 1][k], f)));
    out.push("#" + c.map((v) => v.toString(16).padStart(2, "0")).join(""));
  }
  return out;
}
```

三个要点：

1. **`palette()` 返回的是普通对象** `{ "0": "#…", "1": "#…", … }`，最多 62 个槽（`KEYS.length`）。
2. **`gradient()` 返回的是 hex 字符串数组，不是 palette**。它只是 `palette()` 的输入。`moonlit-sea.js` 的用法就是拼装：
   ```js
   const SKY  = gradient(["#0e1838", "#24396e", "#4a6aa8", "#8aa6d6"], 10);   // 0-9
   const SEA  = gradient(["#071226", "#123063", "#2c5a9a", "#6b93cc"], 10);   // a-j
   const MOON = gradient(["#f7e7a8", "#fff8e0"], 4);                          // k-n
   const pal  = palette([...SKY, ...SEA, ...MOON, "#dfe8ff"]);                // o = star
   ```
   **槽位顺序 = `[...SKY, ...SEA, ...MOON, star]` 的拼装顺序。** 想换色而不改 piece，必须**按同样的顺序**给出新的 hex 列表。
3. **`meta.palette` 是模块级常量，在 import 时求值。** 直接改 `mod.meta.palette = myPal` 会污染同模块的所有消费者（SPA 里就是全站）。

### 想换色，唯一干净的注入点

`canvas.js` 的 `paint()` 第一行：

```js
export function paint(ctx, frame, palette, opts) {
  ...
  if (frame.palette) palette = frame.palette;
```

**`frame.palette` 优先级最高。** 所以最干净的写法是包一层：

```js
const draw = piece.default();
const withPalette = (t) => {
  const f = draw(t);
  return typeof f === "string" ? f : { ...f, palette: myPal };  // 追加字段，不动 piece
};
```

- 对 ascii-magic（返回对象）→ 上面这行就够，零侵入。
- 对 ascii-rest（返回字符串）→ **这条路走不通**，它压根没有 `frame.palette`；只能靠 `mount.js` 的 `palette` 数字协议，或干脆由我们渲染时决定颜色。

### KEYS 的槽位上限

`palette()` 最多 62 色（`KEYS.length = 62`）。超过 62 的 `hexes` 会被静默丢弃（`p[KEYS[i]]` 在 `i >= 62` 时是 `undefined` 作 key）。

---

## 5. `meta` 的完整字段表

### ascii-magic（来自 `moonlit-sea.js` 的 `meta` + `player.js` 读取的字段）

| 字段 | 类型 | 默认 | 语义 / 出处 |
|---|---|---|---|
| `slug` | string | — | 即文件名；`ascii.js` 用 `piece` 属性按 slug `import()` |
| `name` | string | — | `aria-label` 用 |
| `category` | string | — | 对齐 `categories.json` 的 25 个 id |
| `note` | string | — | 一句话描述 |
| `tags` | string[] | — | 检索用 |
| `cols` | number | — | 栅格列数（piece 内部坐标系的宽） |
| `rows` | number | — | 栅格行数 |
| `fps` | number | — | 播放帧率，**≤24 居多**；`player.js` 用 `Math.min(meta.fps, opts.maxFps \|\| 60)` 做节流 |
| `palette` | object | — | 字符键 → hex，见 §4 |
| `cell` | `"square"` \| 缺省 | 缺省=文本细胞 | **字符串枚举**；`"square"` 时 `cellAspect` 返回 1（照片类 piece） |
| `dots` | object | — | 半调（halftone）参数；`play()`：`if (meta.dots) for (const k in meta.dots) if (look[k] === undefined) look[k] = meta.dots[k];` |
| `look` | string | — | 默认笔触；`renderMode` 读 `meta.look` |
| `still` | number | — | 减动效时定格的时间点（秒） |
| `params` | object | — | 外部可传参数（如 `repo`、`stars`），`withParams()` 读 |

### ascii-rest（`mount.js` 的解构即默认值）

```js
    const { cols = 80, rows = 24, palette, ground, cell = 2 } = meta;
    ...
    const { fps = meta.fps ?? 30, motion = false, ...rest } = { ...meta.options, ...options };
```

| 字段 | 类型 | 默认 | 语义 |
|---|---|---|---|
| `name` / `category` / `note` | string | — | 同 |
| `cols` | number | **80** | 列数 |
| `rows` | number | **24** | 行数 |
| `fps` | number | **30** | 刷新率（`meta.fps ?? 30`，可被 `options.fps` 覆盖） |
| `palette` | array | — | **数字下标**（0..255），不是字符键 |
| `ground` | string（CSS 色） | 无 | **不透明底色**，见下 |
| `cell` | number | **2** | **高度倍数**（不是 `"square"`！同名字段、完全不同语义） |
| `options` | object | — | 传给 piece 工厂的参数默认值 |
| `still` | number | — | 减动效定格时间 |

### ⚠ `cell` 在两家是**同名字段、不同语义**

- ascii-magic：`meta.cell === "square"` → 字符串枚举，表示"方格"，`cellAspect = 1`。
- ascii-rest：`meta.cell = 2` → 数字，表示 `ch = cw * 2`，`canvas.style.aspectRatio = cols / (rows * cell)`。

**做通用零件时第一件事就是把它拆成两个字段**，否则 `"square" === 2` 这种判断会静默失效。

### `ground` 的确切语义（你问的"整块不透明"）

`mount.js` 里三处，全部原文：

```js
    const env = () => ({ paper: canvas && ground ? !dark(ground) : dark(getComputedStyle(el).color), color });
```

```js
            if (ground)
                ctx.fillStyle = ground;
            if (full) {
                if (ground)
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                else
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
```

```js
                    if (!full) {
                        if (ground)
                            ctx.fillRect(x0, y0, cw, ch);
                        else
                            ctx.clearRect(x0, y0, cw, ch);
                    }
```

两个后果，第二个更隐蔽：

1. **`ground` 存在 = 每帧整块 `fillRect(canvas.width, canvas.height)` 铺满**，首帧铺、后续按变化的格子重铺。**它会彻底遮住下层**，不能当"半透明底"用。
2. **`ground` 还会改变 piece 自己的明暗方向。** `env().paper` 变 `!dark(ground)`——原本按"深色纸"画的 piece，铺了浅色 `ground` 后会按"浅色纸"重画（ramp 反向）。所以**不能用 `ground` 只为了"想要个底"**，它会改画面内容。

**我们的处理：拷 piece 时删掉 `ground`，底色由装配层负责。** 想保留"纸/墨反差"就自己算 `paper` 传进 `env`（ascii-rest 的 piece 签名支持）。

---

## 6. `t` 的单位与语义

**单位：秒。语义：从开始播放起单调累加的浮点，无上限、无总时长、无 loop 字段。**

ascii-magic（`player.js` 的 `loop()`）：

```js
    if (prev) elapsed += ((now - prev) / 1000) * speed;
    prev = now;
    if (now - last < step) return;
    last = now - ((now - last) % step);
    render(elapsed);
```

起始 `let elapsed = opts.t0 ?? 0;`，`speed` 是倍速。

ascii-rest（`mount.js` 的 `tick()`）：

```js
        t += Math.min(dt, 100) / 1000;
        draw();
```

`dt` 被**硬夹到 100 ms**，即单帧最多推进 0.1 秒。起始 `let t = reduced ? (meta.still ?? 0) : 0;`。

**循环是 piece 自己的事**，不是 runtime 的：

- `jellyfish.js`：`const phase = (t) => (((t % P) + P) % P) / P;`（`P = 2.2` 秒一个搏动周期）
- `aquarium.js`：`const u = ((t % LOOP) + LOOP) % LOOP;`（`LOOP = 48` 秒总循环）
- `moonlit-sea.js`：**没有任何取模**，直接吃 `t`（渐变+噪声本来就连续，不需要循环点）

### 能不能直接传 `WorldFrame.t`？

**能，前提是它是"秒"且单调不往回跳。** 三条必须注意：

1. **如果是毫秒 → 必须 `/1000`。** 没有单位声明，两套都默认秒。
2. **如果 `WorldFrame.t` 会在切路由/重新挂载时归零** → piece 会跳回第 0 秒。对 `aquarium`（48 秒循环）不明显，对 `jellyfish`（2.2 秒）也不明显，但对**依赖"越走越远"的件**（如 `travel()` 里 `0.9 * t`）会看到跳变。
3. **不允许负值。** `phase()` 有 `+P)%P` 兜底，但 `fbm(x*0.035 + t*0.04, …)` 之类的直接乘法没有；给了负 `t` 行为未定义（我没测）。

**建议**：零件拿到的 `t` 由装配层统一提供，且**每个 biome 用一个站点级基准时刻**（`pageStart`），而不是每个零件各自 `performance.now()`——否则同一画面两次进入的相位不同，问题无法归因。

---

## 7. 最小渲染步骤（可运行）

取自 `canvas.js` 的 `paintText()` 无 atlas 分支，原文：

```js
  ctx.font = `${cw / CELL_W}px ${FONT}`; ctx.textBaseline = "middle";
  for (let r = 0; r < T.length; r++) {
    const row = [...T[r]], col = C ? [...C[r]] : null;
    for (let c = 0; c < row.length; c++) {
      const g = row[c];
      if (g === " ") continue;
      const k = col && col[c];
      ctx.fillStyle = (k && k !== " " && palette && palette[k]) || ink;
      // Block elements look gapped as glyphs at large sizes: paint them as rects.
      if (g === "█") { ctx.fillRect(x + c * cw, y + r * ch, Math.ceil(cw), Math.ceil(ch)); continue; }
      ctx.fillText(g, x + c * cw, y + (r + 0.5) * ch);
    }
  }
```

六条硬规则：

1. **字号由格子宽反推**：`font = (cw / CELL_W)px`，不是"先定字号再算格子"。`CELL_W = 0.602`。
2. **行高由 `cellAspect` 定**：`ch = cw * cellAspect(meta)`，文本件 `= cw / 0.602 ≈ 1.6611 cw`；`meta.cell === "square"` 时 `ch = cw`。
3. **基线用 `textBaseline = "middle"`**，y 传 `(r + 0.5) * ch`。**不要**用 `alphabetic` + 手动加 `rowH`，会差半个字高。
4. **`fillStyle` 的取法固定**：`(k && k !== " " && palette && palette[k]) || ink`——**空格键要落到 ink**，否则 `palette[" "]` 是 `undefined`，`fillStyle` 被设成非法值后浏览器保留上一个颜色（隐蔽的串色 bug）。
5. **`"█"` 必须走 `fillRect`，且尺寸 `Math.ceil(cw) × Math.ceil(ch)`**。原文注释说得很直接："Block elements look gapped as glyphs at large sizes"。`ceil` 是为了相邻格重叠半像素、避免缝。
6. **空格整格跳过**，不要 `fillText(" ")`。

**可选但值得抄的两条（来自 atlas 分支）**：

- `█` 的矩形用 `cw + 0.5` 宽（`p.rect(x + c*cw, y + r*ch, cw + 0.5, ch + 0.5)`）——比 `Math.ceil` 更稳。
- 颜色是每格都变的，所以**按颜色分组、每组建一个 `Path2D`，最后 `ctx.fill(p)`**，比逐格 `fillStyle` 赋值+`fill` 快得多。`paintTone` 就是这么干的。

---

## 8. `CELL_W` / 行高系数 / "分辨率锁死"的准确含义

### 常量在哪、值多少

`public/ascii-magic/runtime/canvas.js` 顶部：

```js
export const FONT = 'Menlo, Consolas, "DejaVu Sans Mono", "Liberation Mono", monospace';
/** Width of one monospace cell as a fraction of the font size. */
export const CELL_W = 0.602;

/** Cell height / width: 1 for square-cell pieces, about 1.66 for text pieces. */
export const cellAspect = (meta) => (meta && meta.cell === "square" ? 1 : 1 / CELL_W);
```

→ **`CELL_W = 0.602`**（等宽字符宽 ≈ 0.602 em），**文本件行高 = 1/0.602 ≈ 1.6611 倍格宽**。

ascii-rest 那一侧不用 `CELL_W`，用 `cell` 倍数：`h = w * cell`（默认 `cell = 2`），即行高 = 2 倍格宽。`pond-ripples.js` 自己也声明了同比例：`const CW = 0.6, CH = 1.2;`。

**⚠ 两套行高不一致（1.66 vs 2.0）。** 同一页里混排 ascii-magic 和 ascii-rest 的件，字高会差 20%，必须由装配层统一缩放其中一边。

### 把 `cols=96, rows=36` 改成 `48×18`，够不够？（源 piece 尺寸；实现栅格见 §9 开头）

**不够。不是"重算"，是"重新调参"。** 三条证据：

1. **构图常量写死在小栅格尺度上。** `jellyfish.js` 的 `rimAt()`：
   ```js
   return { c, x, y: 11 - 0.8 * c - 1.4 * lift(t), half: (13 - 2.6 * c) * (1 - 0.3 * c) };
   ```
   `11` 是伞沿的初始行、`13` 是半宽——都是 **26 行栅格下的绝对值**。改成 18 行，伞会顶出画面。同文件还有 `strand(len, 0.06, …)` 的 `len = 8.5 + 3.2 * …`（也是行数）。
2. **`moonlit-sea.js`** 的 `mx = cols * 0.66, my = rows * 0.25, mr = 6.5` —— 月亮**半径 6.5 格**是常数，栅格减半后月亮占画面的比例翻倍，构图塌。
3. **"能用 cols 推导"的件也受 cell 级阈值限制。** `pond-ripples.js` 的 `CX = (cols * CW) / 2, AX = CX - 1.2` 是等比推的，但它 `ellipse()` 里有 `const [flat, steep] = small ? [1.05, 1.25] : [0.9, 1.1];` 和 `EVERY`/`SPEED`/`WAVE`（em 单位）—— 密度一变，环会断成虚线。

**所以"分辨率锁死"的准确含义是**：

| 维度 | 能不能改 | 说明 |
|---|---|---|
| 字符栅格 `cols×rows` | **不能**（改了要重调 piece 的构图常量） | 这是 piece 的**坐标系**，不是分辨率 |
| 单格像素宽 `cw` | **能，任意** | 字号 = `cw / 0.602`，放大只是让字形变大，**不增加细节** |
| 行高比 `ch/cw` | 能改，但会改变观感（字被拉长/压扁） | 文本件 1.66、ascii-rest 2.0 是作者的排版选择 |
| 帧率 `fps` | 能改 | 见 §9 |

**一句话：`cols×rows` 是"有多少个字符"，不是"多少个像素"。想更细，只能换一件本来就更细的 piece。**

---

## 9. 成本

> **口径说明（2026-11-19）**：本节的 `96×36` 是**源 piece 的栅格**，用于说明原作者的成本结构与折中方案；
> **当前实现 `shared/parts/ascii-field/index.ts` 用的是 `GRID_KEYS = 92×34` / `GRID_PLAIN = 76×28`**
> （见 `index.ts:38,42` 与 `shared/parts/ascii-field/README.md`）—— `GRID_PLAIN` 从 96×36 降下来是为了
> "1:1 下能认出字形"（墨太淡时抗锯齿占主导）。因此下列逐格次数是**量级示意，不是本零件的实测计数**；
> 零件自己的实测口径见 `shared/parts/ascii-field/bench.mjs`。

### 数字对不对？

`96 × 36 = 3,456` 格（**源 piece 尺寸**；实现栅格见本节开头）。**但实际 `fillText` 次数 ≤ 3,456，因为空格被跳过**（`if (g === " ") continue;`）。

`moonlit-sea.js` 里**几乎没有空格**：`const SHADE = " ░▒▓█";` 然后用 `SHADE[1 + Math.min(3, …)]` —— 下标从 1 起，永远不会取到 `" "`。所以天空和海面每格都有字符 → **≈3,456 次 `fillText` / 帧**。你的估算是对的。

- piece 自己的 `fps: 20` → **69,120 次/秒**
- 若强推 60fps → **207,360 次/秒**

**注意：库本身并不以 60fps 跑。** `player.js`：

```js
  const step = 1000 / Math.min(meta.fps, opts.maxFps || 60);
```

→ 渲染频率被 `meta.fps` 卡住（这批件大多 15–24）。**"20 万次/秒"只有在把一件 20fps 的件硬拉到 60fps 时才成立。**

### 可行性

**逐格 `fillText` 在 3,456 格 × 60fps 下不建议。** 作者自己的结论就写在他的代码里——`GlyphAtlas` 的类注释：

```
 * Glyph atlas: each glyph in each colour is drawn once into an offscreen tile
 * and then stamped with drawImage, which is many times cheaper than fillText.
 * One atlas per player; it resets itself when the cell size changes.
```

以及 `stampDots` 的注释："Far faster than tens of thousands of arcs for gallery cards and normal stage sizes."

**这是实测结论，不是我猜的**：作者先把 fillText 写到能跑，然后因为"大页面卡"改成 atlas + drawImage（`player.js` 里那句注释："getComputedStyle forces a style pass, which is what made big pages stutter" 也印证了他在做性能）。

### "整帧拼成一个字符串一次 fillText" 可行吗？

**不可行。** Canvas2D 的 `fillText` 不处理 `\n`（换行会被当作无字形或吞掉），没有多行能力。这条路直接排除。

### 四个折中方案，按性价比排

| # | 方案 | 每帧调用数 | 适用 | 代价 |
|---|---|---|---|---|
| 1 | **按行合并**：一行内颜色相同就整行一次 `fillText` | 源 piece 96×36 单色件 → **36 次**（降 96×）；实现为 76×28 → 28 次 | **ascii-rest 全部**（返回值是纯字符串 = 全帧单色） | 需要逐行判断"是否整行同色"；有渐变就退化 |
| 2 | **按色段合并**：连续同色格拼成一段，一段一次 `fillText` | 渐变件 → 接近 3,456（无效）；块状色件 → 几次 | 色块明显的件（`moonlit-sea` 的月亮、`█` 区） | 合并逻辑 + 每段一次 `fillStyle` |
| 3 | **字形图集 + `drawImage`**（库自己的做法） | 3,456 次 `drawImage` | 彩色件通用 | 每个 (字形, 颜色) 组合缓存一张小图；颜色多时图集膨胀（库用 2048 宽、8 行高的画布，满了翻倍） |
| 4 | **低分辨率离屏 + 放大** | 与 3 同，但 `cw` 砍半/四分之一 | 所有件（字符本来就是块状） | 渲染到 `cols*8 × rows*13` 的离屏 canvas，再 `drawImage` 放大；`imageSmoothingEnabled = true` 后观感几乎无差 |

**推荐组合**：ASCII 文本件走 **1 + 4**（ascii-rest 单色，整行合并 → 36 次 `fillText`，再靠离屏放大吃掉 DPR 成本）；彩色件（ascii-magic）走 **3**（atlas），并把 `fps` 压到 piece 自报的值。

**别忘了 `█` 单独走 `fillRect`**——`moonlit-sea` 的月亮和月影大量用 `█`，这部分本来就该是矩形，用 `fillText` 画块元素会出缝。

---

## 10. 如果要把这套做成通用零件，你必须先解决的 3 个问题

### 问题 1：两套的"颜色协议"根本不兼容，一个接口装不下

- ascii-magic：`frame = {text, color}`，`color` 是**与 text 同几何的字符键字符串**，`palette` 是**字符键 → hex 的对象**。
- ascii-rest：`frame = string`，颜色靠**每帧传进去的 `env.color`（Uint8Array，数字下标）**，`palette` 是**数组（0..255 数字键）**。

差别不是"要不要适配"，而是**写颜色的时机不同**：一个是"piece 返回后我们查表"，另一个是"piece 画的过程中往我们给的数组里写"。硬统一成 `{text, color}` 会丢信息（ascii-rest 的 piece 是在绘制时按 `paper` 明暗分支的，事后无法还原）。

**必须先定**：通用零件的输出是"帧 + 键表"（那就只支持 ascii-magic 的 734 件），还是"帧 + 一个我们提供的写入缓冲区"（那就只支持 ascii-rest 的 240 件），还是两套各一个零件类型。**我倾向后者**——它们的成本结构与用法本来就不同（一个要 kit.js，一个零依赖）。

### 问题 2：`t` 的所有权没人定义，跨路由一定会跳

两套都把 `t` 当"从播放开始累加的秒"，且**没有总时长、没有 loop**（循环全在 piece 内部 `t % P`）。这意味着：

- 如果 `t` 由零件自己从 0 开始 → 每次挂载相位都从 0，**同一画面两次进入不一样**，且无法复现。
- 如果 `t` 由站点级时钟给 → 切走再回来会跳一大段，`aquarium`（48 秒循环）会跳帧，`jellyfish`（2.2 秒）看不出来但相位错。
- 如果 `WorldFrame.t` 是毫秒 → 必须 `/1000`；如果是"帧序号" → 必须 `/fps`，而且会随 fps 变化而变速。

**必须先定**：`t` 的单位、起点、是否跨路由连续、是否允许负值。**建议**：`t = (now - stationStart) / 1000`，站点级共享，进站归零，`t >= 0`，并在零件边界 clamp。

### 问题 3：尺寸推导方向两套相反，同一个 piece 在两个 biome 会不一样大

- `player.js`：**从字号推尺寸**——`px` 来自 CSS `font-size`，`cw = px * CELL_W`，`W = cols * cw`。→ 容器跟着字走。
- `mount.js`：**从容器推尺寸**——`width = canvas.clientWidth`，`w = (width * dpr) / cols`，`h = w * cell`。→ 字跟着容器走（还有 `ResizeObserver` 重算）。

通用零件如果两个方向都支持，就会出现"同样是 `moonlit-sea`，在 room 里是 960px 宽、在 tide 里是 320px 宽、字号还不一样"。而且 `fps` 是 piece 自报的第三个独立旋钮（15/20/24 三种），和尺寸无关。

**必须先定**：通用零件接受的是 **`box`（宽高）+ 我们的 `fps`**，由它反解 `cw/px`；`meta.fps` 只作为"上限"参考，不作准。否则一个站点四个 biome 会出现四种字号，视觉上就不是一套设计语言了。

**另外提醒（这不是问题，是坑）**：`meta.cell` 在两家语义不同（`"square"` 字符串 vs `2` 数字）。通用零件读它之前必须先归一化，否则 `cell === "square"` 对 ascii-rest 恒为 false，行高会错一倍。

---

## 11. 没核实的地方

1. **没有行号。** 所有定位靠"文件 + 函数/常量名 + 原文片段"；WebFetch 不返回行号，我没有编造。
2. **只读了 4 个 piece**（moonlit-sea / pond-ripples / jellyfish / aquarium）。**734 + 240 件里其余 970 件没有逐件核对契约**——我只能说"抽查 4 件全部符合上述结构"，不能说"全部"。
3. **`aquarium.js` 只读过一遍（上一轮），本轮没重读**。它同样是 `(t) => string` 且零 import，但 `meta` 里有没有 `options` 我没再确认。
4. **`public/ascii-rest/library.js`（14,830 B）没读**，所以不确定 `mount()` 之外还有没有别的渲染路径（比如直接把 piece 包成 web component）。
5. **`public/ascii-magic/lib/scene.js`（26,024 B）与 `lib/image.js`（7,499 B）没读**——如果 `scene.js` 提供了"多件合绘到同一 Grid"的能力，§10 的结论可能要改。
6. **`glyphs.js`（10,242 B）没读。** `withLook()` / `restyle()` / `cover()` / `shadeTester()` 的实现我没看到，所以**"10 种笔触"只确认了名字与调用点，没确认每种的具体变换**（比如 `restyle` 会不会改 `cols/rows`）。
7. **性能数字是推算，不是实测。** 3,456 格 / 69k / 207k 次每秒是算术推导；"fillText 太慢"这个结论来自作者自己的代码注释（`GlyphAtlas` / `stampDots`），**不是我在 4 个 biome 的真机上测的**。
8. **"ascii-rest 全是单色"只是 2/2 抽样**。`mount.js` 明确有 `env.color` 通道，说明至少有些件是彩色的——**具体多少件带 palette，我没统计**（要逐个 import 读 `meta`，成本不划算）。
9. **`speed` 对 `t` 的缩放**只确认了 ascii-magic 有（`elapsed += dt * speed`）；ascii-rest 的 `mount()` 里我没看到 `speed` 参数，**因此两套的"倍速"能力不一致**（这条是推断，依据是 `mount.js` 的解构里没有 `speed`）。

---

`ascii-field` 目前不在任何站、模板、预设里（孤儿，评审 §2.2）；只在 `PART_ENTRY` 登记（`shared/stage/preview/build.mjs:51`）。
