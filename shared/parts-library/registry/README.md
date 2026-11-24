# L3 零件注册中心（v1）

> **v1 构建元信息**：与 `shared/parts/` 的 PartV2 契约无关，不参与新产物字节，也不被新体系 import。
> 目录内 3 个文件：`README.md`、`index.ts`（汇总各目录 `part.manifest.ts`）、`install.ts`。
> 纪律：本目录只增；`verify:reuse` 按 manifest 声明的字节数比对磁盘，原件一行不改。

## 契约 v1（写死）

```ts
createPart(opts: PartOptions) => PartInstance   // { update?(t), dispose(), pipe?(input) }
```

- `dispose()` 必现，由 `Composer` 按 `artifact → audio → interaction → scene → narrative` 逆序调用；
- 全局副作用（事件监听 / 定时器 / 音频节点）必须经 `opts.bus`（`LayerBus`）登记；
- `entry` 是装站时才创建的薄包装；`source` 只供原件对照，永不参与构建。

## 已登记零件（10 个）

| id | layer | origin | 库内文件 |
|---|---|---|---|
| `ascii-kit` | scene | `copy` | `lib/kit.js`（10,772 B）+ 2 |
| `blow-input` | interaction | `port` | 4（`core/detector.ts`） |
| `crimson-loong` | artifact | `equivalent` | 3 个上游 JS + 2 |
| `dandelion` | scene | `port` | 4（`core/meadow.ts`） |
| `grand-atelier` | interaction | `equivalent` | 3 个原件 TS + 2 |
| `koi` | scene | `equivalent` | 28（上游 26 项 + `index.ts` + manifest） |
| `micro-scenes` | scene | `equivalent` | 6 个 HTML + 2 |
| `rain-webgpu` | scene | `equivalent` | 4 个 TS + 2 |
| `room-at-dawn` | scene | `equivalent` | 29（`upstream/` 24 + `features.ts` 等） |
| `sylva` | interaction | `equivalent` | 2 个 HTML + 2 |

- **origin 以各自 `part.manifest.ts` 为准**：只有 `ascii-kit` 是 `copy`；`dandelion` / `blow-input` 是 `port`；其余 7 个是 `equivalent`。
- 旧文档写「11 类零件」「koi 共 13 文件」均已过期：磁盘是 10 个零件目录、`koi/` 28 个文件。

> 评审建议：本库随 v1 归档（P2，见 `docs/review-2026-11-24/REVIEW-2026-11-24.md` §5.3）；归档前先处理 `verify:reuse` 对 manifest 的运行时解析。
