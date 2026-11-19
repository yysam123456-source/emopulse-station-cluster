# ascii-field

**L2 生态**：把「ASCII 字符帧」做成一个可装配的零件。一个零件 + `variant`，不是两个零件。

## 为什么不是两个零件

两型的差别是**渲染策略**（逐格盖印 vs 按行合并），不是两件事。契约零改动就能表达；拆成两件会把"同页混排"变成装配器的问题（其实它是参数问题）。与 `pixel-post` 同一判断。

| | `keys`（ascii-magic 734 件） | `plain`（ascii-rest 250 件） |
|---|---|---|
| 源 | `default() → (t) => {text, color}` | `default() → (t) => string` |
| 颜色 | 字符键 → hex（`palette` 对象） | 无（单色，由我们注入） |
| 行高 | `1/CELL_W ≈ 1.6611 ×` 单元格宽 | `2.0 ×` 单元格宽 |
| 渲染 | GlyphAtlas 预烘 + 逐格 `drawImage` | 按行合并（每行 1 次 `fillText`） |
| 实测每帧 | **2423 次 drawImage**，`costMs 12.51` | **36 次 fillText**，`costMs 0.56` |

**两型的 `costMs` 与 `setLod` 分开算**：差一个量级，共用一个常数就是在预算账上撒谎，而 `planBudget` 的降档决策全靠它。

## 三个参数

| 参数 | 缺省 | 说明 |
|---|---|---|
| `variant` | `'plain'` | `'keys'` 走图集；`'plain'` 按行合并。**缺省是便宜那档** |
| `ink` | 冷白 | `plain` 的单色墨 |
| `blend` | `'lighter'` | **必须由站点决定**：暗场景上的"光"用 `lighter`；亮纸上的"墨"用 `multiply` |

`blend` 为什么不能写死：同一件 ASCII 在两种语境里是相反的。`/koi-pond` 第一次用 `lighter` 画墨，结果在浅纸上把字**提亮**、几乎不可见 —— 这是真浏览器截图里发现的，所有指令计数断言当时全绿。

## 三条来自 `docs/ASCII-PIECE-CONTRACT.md` 的硬约束

1. **`meta.ground` 必须删掉**：它会 `fillRect` 一块不透明底，并翻转 `env().paper` 让 piece 按浅色纸重画 —— 直接毁掉 L0 的纸。本件不读 `ground`，也不提供。
2. **`█` 等块元素走 `fillRect`**：字形有行盒内边距，会出缝。本件在**图集烘焙时**对块字符 `fillRect` 一次，之后逐帧盖印 —— 既不出缝，也不值得每帧 `fillRect`（bench 断言每帧 `fillRect === 0`）。
3. **`meta.cell` 同名不同义**（keys 是 `"square"` 字符串、plain 是 `2` 数字）：本件用 `variant` 显式区分，**绝不去猜 `cell` 的类型**。

行高差 20%（1.6611 vs 2.0）是这两型最容易静默出错的地方。**只有零件知道该缩哪边**，所以 `lineFactor` 由 `variant` 决定，站点不要补这个 20%。

## 内置样例 piece 与真实 piece 的边界

本件目前带一个**内置的水波纹样例**（同心波 + 斜向慢波 + 指针扰动），形态与上游两型一致：`plain` 只产字符、`keys` 另产一列颜色键。
上游 `ascii-magic` / `ascii-rest` 的 734 + 250 件到位后，**只换内容生成那一段**（`fillContent`），渲染层不用动 —— 这正是"渲染策略 vs 内容"该有的切分，也是本件能同时承载两型的原因。

## 已知问题 / 待产品判

- 当前样例的波纹读起来更像**横向条带**而不是同心涟漪（降频后好了些，但仍需一次设计 pass）。
- `/koi-pond` 的纸按产品口径应"铺到画布外、无边界"，而 `paper-ink` 现在给 `ink` biome 仍画了内缩的纸 + 台面。这一条属于纸那条线，未解。
- `keys` 型在这台机器上单件就 12.5ms（超 8ms 预算），会被 `planBudget` 降档；它是 `expendable`，超预算时整件不画。

## 帧预算纪律

`draw` 里零 new、零闭包、零数组字面量、零 `Math.random`、零自持时钟（时间只从 `frame.t`）。
**例外并如实标注**：ASCII 内容每帧必然构造字符串（文本帧的载体），这笔分配在内容生成里，避免不了；图集与缓冲全部预分配。`tests/part-clock.mjs` 会盯着时钟那条。
