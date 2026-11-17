# L3 零件总库（Parts Library）

> 本库只增不改。原件按仓库原样复制，站点侧 `sites/<id>/parts/` 只写薄包装
> `createPart(opts) => { update(t), dispose() }`，不改原件、不改 `shared/core/`。
> 因单 HTML + 零外部资源约束，站点产物使用按原件视觉/联动参数移植的 Canvas 2D 实现；
> 原件保留在本库供后续换零件、调参数、回归对照，绝不谎称已直接内联。

## 索引表（11 类零件）

| 目录 | 来源 URL | 源文件 | 装到哪站 | 处置说明 |
| --- | --- | --- | --- | --- |
| `grand-atelier/` | https://github.com/Anionex/grand-atelier | `lib/piano-action.ts`、`piano-model.ts`、`piano-materials.ts` | /license | **真实复制原件**（击弦机 key→hammer→damper 联动）；站点 glue 改为 按钮→印章→出证 |
| `crimson-loong/` | https://github.com/ChetasLua/crimson-loong | `src/60_dragon.js`、`15_tex.js`、`00_util.js` | /license | **真实复制原件**（事件表/纹理）；站点取 verifying→stamping→approved 时间轴顺序 |
| `room-at-dawn/` | https://github.com/Leonxlnx/room-at-dawn | `src/main.js` | /license、/praise | **真实复制原件**（程序化噪声+烘焙）；站点移植为 Canvas 纸纹（公文/热敏） |
| `sylva/` | https://github.com/MengTo/sylva | `index.html`、`sylva-assets/liquid-metal-explore.html` | /praise | **真实复制原件**（指针 NDC + 平面射线）；站点移植为指针拨开纸层 |
| `koi/` | https://github.com/zz85/random-sketches @ gh-pages | `vibes/koi/{main,koi,pond,ink,paint,glsl,surface,smoke,audio,cdp}.js` + `index.html` + 文档，共 13 文件 | koi-pond / koi-ink / koi-watercolor | **真实复制原件**（整页三着色器）；站点产物为单 HTML 零外链 Canvas 2D 三风格移植版 |
| `micro-scenes/` | https://github.com/XinyuWang250428/gpt6-Astra_3.js | 六个 HTML（雨夜便利店/木漏时光/海风之屿/晨雾稻田/雨后紫藤温室/故宫雪晶球） | /still P2 | **真实复制原件**（6 变体），本批次未装站 |
| `rain-webgpu/` | https://github.com/Jing0715-fer/rainy-night-webgpu-nextjs | `engine.ts`、`rain/rain.ts`、`rain/height-map.ts`、`atmosphere/post.ts` | /still P2 | **真实复制原件**（createHeightMap / createRain / createRipples / createPostPipeline），本批次未装站 |
| `dandelion/` | 未定位到公开原件（GitHub 检索 DandelionMeadow / BlowInput 无结果） | 无 | /hug | **因无法获取原件，按文档 §1 描述实现等效代码**：三状态 ready→drifting→away、错峰释放 aRelease / DETACH_SECONDS=1.6，见 `sites/hug/parts/index.ts` |
| `paper-plane/` | 未定位到文档所指"照片折纸飞机"原件 | 无 | /license、/hug | **因无法获取原件，按文档 §1 描述实现等效代码**：fold() 双材质 + flightPosition(t) 弧线与切线转向，见两站 `parts/index.ts` |
| `blow-input/` | 未定位到公开原件 | 无 | /hug | **按描述实现**：默认不主动授权、按钮兜底、用户显式点击后才 getUserMedia + AnalyserNode 检测音量阈值 |
| `verdant-forest/` | 未定位到公开原件 | 无 | /still P2（预留） | 本批次未实现站点，扩展位已留 |

## 接入约定（写死，避免各站发明新机制）

1. 零件原件放入对应目录，保持来源内容不变；来源 URL 记录于本表；
2. 站点 `parts/` 写薄包装 `createPart(opts) => { update(t), dispose() }`，通过
   `registerPartFactory(id, factory)` 挂到 `ctx.store.partFactories`；
3. `site.config.ts.parts` 中 `enabled: true` 才装载，零件内部状态机不改动，由 glue 对齐外层 FSM；
4. 自研仅限：情绪文案、Canvas 凭证导出、短 URL+埋点、零件粘合 glue；其余全部复制或按描述等效实现。
