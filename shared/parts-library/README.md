# L3 零件库（v1）

> **这是 v1 契约（`createPart(opts)`）的零件库**，不是 `shared/parts/` 的 PartV2 体系。
> 新体系只用到两处：`koi/`（`koi-pond` 导入 7 个上游 JS）与 `dandelion/`（`shared/parts/dandelion` 导入 `core/meadow.ts`）；其余目录只做「原件整件入库对照」，没有新体系装配入口。
> 评审建议：本库随 v1 归档（P2，见 `docs/review-2026-11-24/REVIEW-2026-11-24.md` §5.3）。
> 纪律：原件目录只增不改；`verify:reuse` 按各目录 `part.manifest.ts` 声明的字节数比对磁盘，`EXCERPT.md` / `BLOG.md` / `part.manifest.ts` 与上游源码一个字节都不许动。

## 目录（10 个零件）

| 目录 | 是什么 | 新体系使用 |
|---|---|---|
| `ascii-kit/` | Portal ascii-magic 的 `lib/kit.js`（220 行，D4 逐字节复制） | 否（`ascii-field` 自建，不 import） |
| `blow-input/` | 公众号文章吹气检测算法 `core/detector.ts`（276 行，D3 移植） | 否（只有 v1 `sites/hug/parts/blow-input.ts` import） |
| `crimson-loong/` | 上游 18 个脚本中的 3 个对照文件（D1） | 否 |
| `dandelion/` | 公众号文章蒲公英算法 `core/meadow.ts`（551 行，D3 移植） | **是**：`shared/parts/dandelion` |
| `grand-atelier/` | 击弦机 3 个原件 TS（D1） | 否 |
| `koi/` | zz85/random-sketches 上游 26 项 + `index.ts` + manifest（共 28 文件） | **是**：`shared/parts/koi-pond` import 7 个 JS |
| `micro-scenes/` | gpt6-Astra_3.js 的 6 个自包含 HTML（D0） | 否 |
| `rain-webgpu/` | rainy-night-webgpu 25 个模块中的 4 个（D0） | 否 |
| `room-at-dawn/` | 上游 `upstream/` 24 文件 + 9 个 WorldFeature 适配（共 29 文件） | 否（唯一装配入口在 gitignore 的 `_scratch/`） |
| `sylva/` | 2 个整页 HTML（D0；许可 L4 阻断） | 否（v1 `/praise` 冻结） |

另：`part-errors.ts`、`legacy-provenance.ts` 是 v1 共用代码，`registry/` 是其注册中心（见 `registry/README.md`）。
