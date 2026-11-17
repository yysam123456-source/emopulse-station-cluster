// 零件登记规范（L3 · 只增不改）
// 对应架构 §4.3 / §5.3：每个零件目录一份 part.manifest.ts，汇总到本目录的 index.ts。
// 纪律：本目录**只增**；既有 11 类零件的原件一行不改（SOP §7「零件先入库」）。

# L3 零件注册中心

> 地位：**构建元信息**。本目录与各 `part.manifest.ts` 都不参与产物字节函数 `f()`，
> 新增 / 修改它们不得改变任何既有产物哈希（K3 / INV-3）。

## 一、六字段说明（`PartManifest`）

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | `string` | ✅ | 全库唯一，小写连字符正则 `^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`；站点 `composition[layer][].ref` 即指向它 |
| `layer` | `PartLayer` | ✅ | 五层之一：`narrative` / `scene` / `interaction` / `audio` / `artifact` |
| `origin` | `PartOrigin` | ✅ | `copy`（真实复制原件）/ `equivalent`（等效实现）/ `port`（移植） |
| `entry` | `string` | ✅ | 工厂模块路径（相对仓库根）。**装站时创建薄包装**，被站点 `bridge.ts` 依赖树 import 后经通道 B2 bundle |
| `source` | `string` | ➖ | 原件路径（相对 `shared/parts-library/`），**仅供对照，永不参与构建**；`equivalent` 件可省略 |
| `claims` | `PartClaim[]` | ➖ | 默认资源声明，可被 `PartBinding.claims` 覆盖 |

另有 `contract: 'v1'`（契约版本，写死）、`requires`（`'webgpu' | 'none'`）、`note`（来源与处置说明）。

## 二、零件契约 v1（写死）

```ts
createPart(opts: PartOptions) => PartInstance   // PartInstance = { update?(t), dispose(), pipe?(input) }
```

- `dispose()` **必须实现**，由 `Composer` 按 `artifact → audio → interaction → scene → narrative` **严格逆序**调用；
- `update(t)` 可选（纯数据零件不需要）；
- `pipe(input)` 仅 `chain` 模式需要，用于同资源管线串联；
- `opts.store` 是该零件的**私有命名空间**，禁止写入其他零件的槽位；
- 一切全局副作用（事件监听 / 定时器 / 音频节点）必须经 `opts.bus`（`LayerBus`）登记，由 `Composer` 统一清理。

## 三、冲突仲裁（与 `shared/contract/composition.ts` 的 `PartClaim.mode` 对应）

| mode | 语义 | 违反后果 |
| --- | --- | --- |
| `exclusive` | 同层同 resource 只能 1 个零件声明 | 装配直接失败（`duplicate-exclusive`），进入降级态，**禁止静默覆盖** |
| `chain` | 允许多个，按 `priority` 升序串成管线，经 `LayerBus.exchange` 传递上游输出 | 仲裁为确定性顺序 |
| `shared` | 只读共享，可多零件并存，禁止写入 | 写入即抛错并记入诊断 |

## 四、已登记零件

| id | layer | origin | entry | source（原件对照） | 装到哪站 |
| --- | --- | --- | --- | --- | --- |
| `crimson-loong` | artifact | copy | `shared/parts-library/crimson-loong/index.ts` | `crimson-loong/60_dragon.js` 等 3 文件 | `/license` |
| `grand-atelier` | interaction | copy | `shared/parts-library/grand-atelier/index.ts` | `grand-atelier/piano-*.ts` 3 文件 | `/license` |
| `koi` | scene | copy | `shared/parts-library/koi/index.ts` | `koi/*.js` + `index.html` 共 13 文件 | `koi-pond` / `koi-ink` / `koi-watercolor`（legacy） |
| `micro-scenes` | scene | copy | `shared/parts-library/micro-scenes/index.ts` | 6 个中文名 HTML | `snow-globe-atlas`（⑧，T04） |
| `rain-webgpu` | scene | copy | `shared/parts-library/rain-webgpu/index.ts` | `rain-webgpu/*.ts` 4 文件 | `weather-room`（①，T02） |
| `room-at-dawn` | scene | copy | `shared/parts-library/room-at-dawn/index.ts` | `room-at-dawn/main.js` | `/license`、`/praise` |
| `sylva` | interaction | copy | `shared/parts-library/sylva/index.ts` | `sylva/index.html` 等 2 文件 | `/praise` |
| `ascii-kit` | scene | copy | `shared/parts-library/ascii-kit/index.ts` | `ascii-kit/lib/kit.js`（10,772 B 纯 ESM 无依赖） | `ascii-radio`（⑤，T04） |

## 五、两条硬纪律

1. **只增不改**：零件原件（`.js` / `.ts` / `.html`）一律保持来源内容不变；需要适配时**新增薄包装**，不改原件。
2. **`entry` 是装站时才创建的文件**：T01 只登记声明骨架，薄包装（`<part>/index.ts` 里 `createPart(opts)`）随对应站点在 T02~T05 创建；
   在此之前 `entry` 指向的路径**尚不存在**，`tests/verify-registry.mjs` 会把它们列为 `pending-entry`（信息项，不判失败）。
   `source` 指向的原件**必须存在**，否则判定失败——这是「零件先入库」的硬断言。
