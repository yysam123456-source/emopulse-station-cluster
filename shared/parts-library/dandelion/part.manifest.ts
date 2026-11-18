// 零件声明（L3 · 契约 v1）：dandelion —— 算法移植（D3）。
//
// 原件：公众号文章《Three.js 实战：把愿望交给风，做一个可以吹散的蒲公英网页》配套代码
//       src/three/DandelionMeadow.ts（Vue 3 + Three.js + Web Audio，InstancedBufferGeometry + LineSegments）。
// 现状：Fibonacci 球面 1335 颗、44 段/颗种子几何、DETACH_SECONDS=1.8 错峰释放、三轴异速飘散、
//       fade/attachedAlpha 透明度，全部按原文常量与公式进入产物；渲染换成 Canvas 2D。
// 说明：上游只有文章、没有仓库；原文代码块已逐段抄进本目录 EXCERPT.md，供 QA 对账。
//
// ⚠ portedTo 的写法（踩过的坑，写在这里省下一个人的时间）：
//   必须是「仓库相对路径:标识符」，**冒号后不要留空格**。机械门用 splitPortedTo() 按第一个 `:` 切，
//   切出的 marker 再拿去做 includes() 逐字比对；写成 `'xxx.ts: foo'` 会带出前导空格，
//   于是 includes(' foo') 在目标文件里永远找不到（真实代码里前面是 `.` 或换行），表现为假红。
import type { PartManifest } from '../../contract/parts-registry';

const manifest = {
  id: 'dandelion',
  layer: 'scene',
  origin: 'port',
  entry: 'shared/parts-library/dandelion/index.ts',
  // 不声明 source：source 的语义是「已归集进本库的原件路径」，而本件只有文章里的代码块
  // （files: [] / completeness: 'absent'），库里没有任何可指向的原件。
  // 上游路径写在 provenance.upstream.article 与 note 里，代码块见本目录 EXCERPT.md。
  contract: 'v1',
  claims: [{ resource: 'canvas:stage', mode: 'exclusive' }],
  requires: 'none',
  note: '算法移植（D3）：Fibonacci 球面 1335 颗 / 44 段种子 / 1.8 s 错峰 / 三轴异速飘散，'
    + '由 Canvas 2D 重绘；上游为公众号文章（src/three/DandelionMeadow.ts），'
    + '无仓库、无归集原件，故不声明 source。',
  provenance: {
    depth: 'D3',
    upstream: {
      article: 'https://mp.weixin.qq.com/s/FwBWw2znYZFayBosZPCzLw',
      accessed: '2026-11-18',
    },
    // 无仓库、无归集文件：原文只有文章内的代码块。符号对账见 EXCERPT.md。
    files: [],
    completeness: 'absent',
    ported: [
      {
        symbol: 'line',
        kind: 'function',
        portedTo: 'shared/parts-library/dandelion/core/meadow.ts:createSeedGeometry',
        downgrade: '原件用了什么技术：line(a, b, shade) 把两个端点写进 BufferAttribute，'
          + '由 InstancedBufferGeometry 一次实例化绘制 1335 份。'
          + '我们用什么替代：同一个函数往 Float32Array 里写 88 个端点与 44 个明暗系数，'
          + '再由 Canvas 2D 逐段拼路径。'
          + '差异导致的可见后果：线段数与坐标不变，但 GPU 单批次绘制变成 CPU 逐段合成，'
          + '必须靠 LOD 与预渲染才能守住帧率。',
      },
      {
        symbol: 'direction',
        kind: 'algorithm',
        portedTo: 'shared/parts-library/dandelion/core/meadow.ts:buildSeedField',
        downgrade: '原件用了什么技术：Fibonacci 球面采样（ny = 1 − (i+0.5)/count×2、r = √(1−ny²)、'
          + 'angle = i×2.39996323），并对角度、高度、半径加小幅抖动。'
          + '我们用什么替代：同一组公式逐行搬进 buildSeedField，抖动幅度原文未给，'
          + '本地取 ±0.09 rad / ±0.015 / ±3.5%（见 EXCERPT.md 的本地补充表）。'
          + '差异导致的可见后果：球面分布的均匀度与原件一致，但每株花球的细部疏密、'
          + '每颗种子的落点与原件不会逐颗相同。',
      },
      {
        symbol: 'aHome',
        kind: 'algorithm',
        portedTo: 'shared/parts-library/dandelion/core/meadow.ts:aHome',
        downgrade: '原件用了什么技术：实例属性 aHome 存世界空间起点，起点半径 = 花球半径 − 一段细柄长度，'
          + '避免种子根部贴在球壳上把花球胀大一圈。'
          + '我们用什么替代：同名字段 aHome 存同样的起点，公式照搬；'
          + '10 株的坐标与半径原文未给，由本地 PLANT_LAYOUT 复现「10 株 / 近大远小 / 合计 1335 颗」。'
          + '差异导致的可见后果：单株花球的尺度关系正确，不会胀出球壳；'
          + '但草甸的株距、远近排布是本地构图，不是原件的那一组坐标。',
      },
      {
        symbol: 'aAxis',
        kind: 'algorithm',
        portedTo: 'shared/parts-library/dandelion/core/meadow.ts:aAxis',
        downgrade: '原件用了什么技术：实例属性 aAxis 存球心指向该种子的径向单位向量，'
          + '在着色器里充当局部小伞的新 Y 轴。'
          + '我们用什么替代：同名字段 aAxis，归一化后交给 seedBasisInto 构造 right / forward 两条正交基。'
          + '差异导致的可见后果：小伞贴球面的朝向与原件同一套数学；'
          + '但我们是固定透视投影，画面左右两侧的伞面倾斜与原件相机之间存在轻微差异。',
      },
      {
        symbol: 'aSize',
        kind: 'algorithm',
        portedTo: 'shared/parts-library/dandelion/core/meadow.ts:aSize',
        downgrade: '原件用了什么技术：每颗种子的尺寸略有不同（实例属性 aSize），用来打散规整的格子感。'
          + '我们用什么替代：同名字段 aSize，本地取值 0.82—1.18，并参与起点半径与局部坐标的缩放。'
          + '差异导致的可见后果：尺寸变化的视觉作用一致；具体分布区间是本地选择，'
          + '原件没有给出数值范围。',
      },
      {
        symbol: 'aRandom',
        kind: 'algorithm',
        portedTo: 'shared/parts-library/dandelion/core/meadow.ts:aRandom',
        downgrade: '原件用了什么技术：aRandom 保留一个随机值，后续用 fract(aRandom×17)、fract(aRandom×31) '
          + '重映射到不同方向的变化，减小所有种子一起快、一起慢的相关性。'
          + '我们用什么替代：同名字段 + 同样的 fract 重映射，另加一项决定朝向过渡的倾斜与摇动。'
          + '差异导致的可见后果：速度与方向的相关性结构与原件一致；'
          + '每颗种子的具体数值因随机序列不同而不同，所以两次放飞的花样都不重样（原件亦然）。',
      },
      {
        symbol: 'aRelease',
        kind: 'algorithm',
        portedTo: 'shared/parts-library/dandelion/core/meadow.ts:aRelease',
        downgrade: '原件用了什么技术：出发时刻写进 InstancedBufferAttribute 并置 needsUpdate，'
          + '着色器用 uTime ≥ aRelease 判断是否放飞；重置只做 releases.fill(-1)。'
          + '我们用什么替代：同名字段 + releaseField() / resetField()，'
          + '出发时刻仍为 time + random()×1.8，重置同样只把出发时刻恢复为 −1。'
          + '差异导致的可见后果：错峰脱落节奏一致；但时间轴由帧间隔累计（单帧上限 0.1 s），'
          + '页面切到后台再回来时整体会顺延，而不是按墙钟补齐。',
      },
      {
        symbol: 'DETACH_SECONDS',
        kind: 'constant',
        portedTo: 'shared/parts-library/dandelion/core/meadow.ts:DETACH_SECONDS',
        downgrade: '原件用了什么技术：常数 DETACH_SECONDS = 1.8，作为错峰释放的时间窗口。'
          + '我们用什么替代：同名常数 1.8，逐颗出发时刻仍为 time + random()×DETACH_SECONDS。'
          + '差异导致的可见后果：整批种子在 1.8 秒内陆续松开（旧版写的是 1.6 秒，'
          + '比原文快 0.2 秒，已按原文修正）；观感上散开更从容一点。',
      },
      {
        symbol: 'travel',
        kind: 'shader',
        portedTo: 'shared/parts-library/dandelion/core/meadow.ts:readFrame',
        downgrade: '原件用了什么技术：着色器算 age = max(0, uTime − aRelease)、'
          + 'flying = aRelease ≥ 0 且 uTime ≥ aRelease、travel = age × flying，'
          + 'travel 是秒数而不是 0—1 进度。'
          + '我们用什么替代：同一组表达式在 readFrame 里逐颗求值，语义保持「秒数」。'
          + '差异导致的可见后果：飘散节奏与原件一致；如果按归一化进度写会得到完全不同的速度曲线，'
          + '这里刻意没有那样做。',
      },
      {
        symbol: 'drift',
        kind: 'shader',
        portedTo: 'shared/parts-library/dandelion/core/meadow.ts:driftInto',
        downgrade: '原件用了什么技术：三轴异速位移（0.35+1.6r / 0.08+0.7·fract(17r) / 0.5+2.5·fract(31r)）'
          + '乘以 travel，叠加幅度 0.24 与 0.22 的两组正弦（乘 min(travel,1)），'
          + '整体再乘 0.85 + uWind×0.25。'
          + '我们用什么替代：全部系数与结构逐条搬进 driftInto，一个都没有改；'
          + '只在最后一步额外乘一个画布高度归一系数（DRIFT_REFERENCE_HEIGHT=192、'
          + 'DRIFT_SCALE_GAIN=0.32、夹取区间 0.18—0.6，公式为 (192/CSS高)×0.32 再 clamp），'
          + '因为原件的漂移是按整屏 3D 场景（可视世界高约 3.5—4 单位）调的，'
          + '而本站卡片可视世界高只有 1/2.1≈0.48 单位，直接搬过去种子会在 7—10 秒的'
          + '淡出窗口结束之前就撞出画框上沿。'
          + '差异导致的可见后果：飘散方向、三轴速度比、正弦摆动与风力缩放全部与原件同源；'
          + '但原件是满屏 3D 透视，位移由相机投影自然缩放，本站 512×192 卡片必须按 driftHeightScale 归一，'
          + '参考高 192px 时系数只有 0.32（DRIFT_SCALE_GAIN），'
          + '**总位移被压缩到约三分之一**，2 秒内种子位移不显著（约 0.28 世界单位），'
          + '飘散感主要靠「脱离姿态过渡 + 后续 5—10 秒的累积位移」建立，而不是像原件那样 1—2 秒就明显拉开。'
          + '这是 1/20 面积的必然代价，不是参数错：若不压缩，7 秒时种子会在 fade（7→10 s）完成前'
          + '撞出画框上沿，观感从「淡出」变成「被切断」。'
          + '0.32 已是不裁切前提下能取到的上限（实测可见种子最后一次触碰上沿在 travel≈9.0 s、alpha≈0.16）。'
          + '7.0 / 10.0 的淡出窗口与全部原始系数均未改动。',
      },
      {
        symbol: 'fade',
        kind: 'shader',
        portedTo: 'shared/parts-library/dandelion/core/meadow.ts:alphaOf',
        downgrade: '原件用了什么技术：fade = 1 − smoothstep(7.0, 10.0, travel)，'
          + '让飞远的种子在 7—10 秒之间渐隐。'
          + '我们用什么替代：同一表达式；Canvas 2D 里把透明度按 8 档分桶，每桶一次批量 stroke。'
          + '差异导致的可见后果：淡出曲线一致；但相邻档位之间存在最多 0.0625 的量化误差，'
          + '在极慢的渐隐上可能看到轻微跳档。',
      },
      {
        symbol: 'attachedAlpha',
        kind: 'shader',
        portedTo: 'shared/parts-library/dandelion/core/meadow.ts:alphaOf',
        downgrade: '原件用了什么技术：attachedAlpha = 0.19 + max(0, aAxis.z) × 0.26，'
          + '用径向 Z 分量近似附着态的前后明暗，再与飞行值 0.62 混合。'
          + '我们用什么替代：同一表达式，并把它当作预渲染时的分桶依据。'
          + '差异导致的可见后果：静止花球的前后明暗层次与原件同源；'
          + '这套近似只对固定镜头成立，相机若可绕行就会失效（原件自己也有这个限制）。',
      },
      {
        symbol: 'smoothstep',
        kind: 'function',
        portedTo: 'shared/parts-library/dandelion/core/meadow.ts:smoothstep',
        downgrade: '原件用了什么技术：GLSL 内置 smoothstep(edge0, edge1, x) 做两端平滑的插值。'
          + '我们用什么替代：JS 里按 t²(3−2t) 实现同名函数，边界处额外处理 edge0 === edge1。'
          + '差异导致的可见后果：数学结果一致；数值以 float64 计算后再落回 float32 存储，'
          + '不存在可见差异。',
      },
      {
        symbol: 'fract',
        kind: 'function',
        portedTo: 'shared/parts-library/dandelion/core/meadow.ts:fract',
        downgrade: '原件用了什么技术：GLSL 内置 fract(x) = x − floor(x)，把同一个随机值重映射到不同变化。'
          + '我们用什么替代：JS 同名实现，对负数同样返回非负小数部分。'
          + '差异导致的可见后果：与原件逐位一致的映射关系；差异仅在 float32/float64 的末位精度上。',
      },
      {
        symbol: 'uWind',
        kind: 'shader',
        portedTo: 'shared/parts-library/dandelion/core/meadow.ts:DEFAULT_WIND',
        downgrade: '原件用了什么技术：uWind 是着色器 uniform，视觉风力，参与 drift 的整体缩放 0.85 + uWind×0.25。'
          + '我们用什么替代：DEFAULT_WIND 常数（默认 0.55），可由零件 options.wind 覆盖。'
          + '差异导致的可见后果：风感强弱可调；它仍只是画面参数，不对应风速计上的米每秒'
          + '（原文明确声明过这一点）。',
      },
      {
        symbol: 'world',
        kind: 'shader',
        portedTo: 'sites/hug/parts/dandelion.ts:plotSeed',
        downgrade: '原件用了什么技术：顶点着色器算 world = home + local + drift×flying，'
          + '再乘 viewMatrix / projectionMatrix 投到屏幕，1335 份实例由 GPU 一次画完（1335×44=58,740 段一条 draw call）。'
          + '我们用什么替代：在 CPU 里逐端点合成同一个和式，再用固定透视（camZ=6.4、'
          + 'focal=2.1×画布高）落到 2D 画布。'
          + '为了不让 58,740 段线在 Canvas 2D 上逐帧重绘，做了 LOD 抽稀（不改变几何本身，只挑线段子集）：'
          + 'ready 态 23 段/颗 = 2 根基础段（瘦果 0.38 + 细柄 0.7）+ 7 个伞冠方向×3 段（跨 14 个方向均匀取 0/2/4/6/8/10/12），'
          + '并把整幅预渲染进离屏位图，之后每帧只 blit 一次；'
          + '释放期的附着态 14 段/颗 = 2 + 4 个方向×3 段（取 0/3/6/9）；'
          + '飞行种子按屏幕尺寸分四档：44 段/颗（全量，screenSize>22 且 travel>1）、'
          + '14 段/颗（screenSize>9）、5 段/颗（2 根基础段 + 3 根伞骨）、2 段/颗（细柄 + 1 根伞骨）；'
          + '透明度按 8 个桶批量 stroke，单帧 stroke 次数 ≤16；另做画面外剔除与帧耗时自适应降档。'
          + '种子总数 1335 与单颗 44 段几何都没有为了性能而削减。'
          + '差异导致的可见后果：ready 态花球少画 21 段/颗（44→23），伞冠的毛状边缘比原件稀，'
          + '在 512×192 卡片上只有近距离主花球能看出差别；飞行中远端种子退化成 2 段时'
          + '只剩一根细柄加一根伞骨，缩到几像素时与原件的差别不可辨；'
          + '近处大颗种子仍是 44 段全量；原件的逐颗待机摇动被整幅位图的轻摆替代。',
      },
      {
        symbol: 'SEGMENTS_PER_SEED',
        kind: 'constant',
        portedTo: 'shared/parts-library/dandelion/core/meadow.ts:SEGMENTS_PER_SEED',
        downgrade: '原件用了什么技术：单颗种子由 `line()` 拼出 2 段基础（瘦果 + 细柄）加 14 个伞冠方向的 3 段，'
          + '合计 2 + 14×3 = 44 段，作为固定几何一次性上传。'
          + '我们用什么替代：把这个数量提升为命名常量 44，既是 createSeedGeometry() 的段数，'
          + '也是 LOD 全量档的线段索引表长度。'
          + '差异导致的可见后果：段数完全一致；但只要有人把伞冠方向数或每方向段数改掉，'
          + '黄金值 tests/golden/dandelion.json 的 geometrySegments / geometryEndpoints 两条会立刻失败。',
      },
      {
        symbol: 'PAPPUS_DIRECTIONS',
        kind: 'constant',
        portedTo: 'shared/parts-library/dandelion/core/meadow.ts:PAPPUS_DIRECTIONS',
        downgrade: '原件用了什么技术：伞冠按 `for (let j = 0; j < 14; j++)` 在圆周上均匀撒 14 根伞骨。'
          + '我们用什么替代：同名常量 14，几何构造与 LOD 抽稀（rich 取 7 个方向、mid 取 4 个）共用它。'
          + '差异导致的可见后果：单颗种子的伞面密度与原件一致；抽稀后的方向间隔也按 14 等分推出，'
          + '不会出现偏向一侧的稀疏。',
      },
      {
        symbol: 'GOLDEN_STEP',
        kind: 'constant',
        portedTo: 'shared/parts-library/dandelion/core/meadow.ts:GOLDEN_STEP',
        downgrade: '原件用了什么技术：Fibonacci 球面采样的方位角步长 `i * 2.39996323`（黄金角），'
          + '保证任意 count 下点都近似均匀。'
          + '我们用什么替代：同名常量 2.39996323，按原文精度逐字搬入。'
          + '差异导致的可见后果：球面分布的均匀度与原件一致；双精度算完落进 Float32Array 后末位约有 1e-7 偏差，'
          + '对像素级落点没有可见影响。',
      },
      {
        symbol: 'TURN_SECONDS',
        kind: 'constant',
        portedTo: 'shared/parts-library/dandelion/core/meadow.ts:TURN_SECONDS',
        downgrade: '原件用了什么技术：放飞的种子里，朝向会在「约 1.3 秒」内从球面径向过渡到略微倾斜的向上方向。'
          + '我们用什么替代：命名常量 1.3 秒，配合缓动做插值 t = clamp01(travel / 1.3)。'
          + '差异导致的可见后果：过渡时长与原件一致；缓动曲线原文没给，本地取 t²(3−2t)，'
          + '前 0.3 秒的姿态变化比线性略慢，肉眼不可辨。',
      },
      {
        symbol: 'FADE_START',
        kind: 'constant',
        portedTo: 'shared/parts-library/dandelion/core/meadow.ts:FADE_START',
        downgrade: '原件用了什么技术：透明度按 `smoothstep(7.0, 10.0, travel)` 从第 7 秒才开始衰减。'
          + '我们用什么替代：命名常量 FADE_START = 7.0，语义仍是「travel 秒数」而不是 0—1 进度。'
          + '差异导致的可见后果：淡出起点与原件完全一致；这条常量是硬红线——'
          + '调小它能掩盖任何「种子提前飘出画框」的问题，但那属于篡改原文常量，'
          + '我们改用画布高度归一化解决位移量纲，始终没有动它。',
      },
      {
        symbol: 'FADE_END',
        kind: 'constant',
        portedTo: 'shared/parts-library/dandelion/core/meadow.ts:FADE_END',
        downgrade: '原件用了什么技术：`smoothstep(7.0, 10.0, travel)` 的第二参数 10.0 秒，此后完全透明。'
          + '我们用什么替代：命名常量 FADE_END = 10.0；三状态机里 away 的判据（time > 最晚出发时刻 + 10）也用它。'
          + '差异导致的可见后果：渐隐窗口长度 3 秒与原件一致；away 切换发生在最后一颗淡完之后，'
          + '不会出现「还有半透明种子挂在画面上」就停止绘制的情况。',
      },
      {
        symbol: 'FLYING_ALPHA',
        kind: 'constant',
        portedTo: 'shared/parts-library/dandelion/core/meadow.ts:FLYING_ALPHA',
        downgrade: '原件用了什么技术：放飞后的目标透明度 0.62，由 `mix(attachedAlpha, 0.62, flying)` 取出。'
          + '我们用什么替代：命名常量 0.62，参与 alphaOf 的 mix；Canvas 2D 侧再按 8 档分桶量化。'
          + '差异导致的可见后果：飞行态基准亮度与原件一致；分桶带来最多 0.0625 的量化误差，'
          + '在极慢的渐隐上可能出现轻微跳档。',
      },
      {
        symbol: 'ATTACHED_ALPHA_BASE',
        kind: 'constant',
        portedTo: 'shared/parts-library/dandelion/core/meadow.ts:ATTACHED_ALPHA_BASE',
        downgrade: '原件用了什么技术：附着态透明度 `0.19 + max(0, aAxis.z) * 0.26`，'
          + '用径向 Z 分量近似「朝向镜头 vs 背向镜头」的明暗。'
          + '我们用什么替代：命名常量 0.19 作为基准，并把它当作 ready 态预渲染的分桶依据。'
          + '差异导致的可见后果：静止花球的前后层次与原件同源；这套近似只对固定镜头成立，'
          + '相机若绕行就会失效（原件自身也有这个限制）。',
      },
      {
        symbol: 'ATTACHED_ALPHA_Z',
        kind: 'constant',
        portedTo: 'shared/parts-library/dandelion/core/meadow.ts:ATTACHED_ALPHA_Z',
        downgrade: '原件用了什么技术：同式的 Z 系数 0.26，使朝向镜头的种子比背向的最亮多 0.26。'
          + '我们用什么替代：命名常量 0.26；`max(0, z)` 的保护一并保留，背面种子不会被算暗。'
          + '差异导致的可见后果：前后明暗差与原件一致；若删掉 max(0,·)，背面种子会算出 0.19 − 0.26 < 0，'
          + '黄金值 alphaOf(-1,0,0) 会立刻失败。',
      },
      {
        symbol: 'PLANT_LAYOUT',
        kind: 'constant',
        portedTo: 'shared/parts-library/dandelion/core/meadow.ts:PLANT_LAYOUT',
        downgrade: '原件用了什么技术：场景里摆了 10 株花球，近处大、远处小，种子总数 1335。'
          + '我们用什么替代：一张本地常量表（10 行：x/y/z、半径、本株种子数、花茎倾斜），'
          + '逐株 seeds 求和严格等于 1335；坐标与半径是本地构图，原文未给（见 EXCERPT.md 补充表）。'
          + '差异导致的可见后果：株数与总量与原件一致，但株距、前后排布、每株的大小比例是本地的，'
          + '不是原件那一组数字；若把某株种子数改掉，SEED_COUNT 与 plantLayoutSeedSum 两条黄金值同时失败。',
      },
      {
        symbol: 'SEED_COUNT',
        kind: 'constant',
        portedTo: 'shared/parts-library/dandelion/core/meadow.ts:SEED_COUNT',
        downgrade: '原件用了什么技术：实例属性数组长度 = 1335，对应原文「共 1335 颗种子」。'
          + '我们用什么替代：派生量（PLANT_LAYOUT 逐株 seeds 求和），不再手写常数 1335，'
          + '避免「表里加了 3 颗但总数忘了改」这类两处真值不一致。'
          + '差异导致的可见后果：种子总数恒等于常量表的和；'
          + '黄金值里 SEED_COUNT = 1335 与 plantLayoutSeedSum = 1335 两条互为见证。',
      },
    ],
    paramSurface: {
      // 无归集文件（只有文章代码块），param-pool 的 AST 分母恒为 0，
      // 因此 scope 必须为空、enumerated 必须为空 —— 否则就是分子造假。
      scope: [],
      enumerated: [],
      evidence: '上游无仓库、无归集文件（files: []），无法从原件机械抽取参数面；'
        + '27 个 ported 符号的常量与公式已在 EXCERPT.md 里逐段抄录并对账（§11 是常量命名对照），'
        + '未接线任何「原文参数名 → 我方参数名」的映射，故 enumerated 为空。',
    },
    license: {
      spdx: 'NOASSERTION',
      evidence: '上游只有公众号文章内的代码片段：无仓库、无 LICENSE 文件，属无许可声明；'
        + '已签字豁免（L3 分级经主理人裁决）；仅用于个人展示，不得再分发。',
      grade: 'L3',
    },
  },
} satisfies PartManifest;

export default manifest;
