# dandelion · 原文代码摘录（溯源对账用）

- 上游：公众号文章《Three.js 实战：把愿望交给风，做一个可以吹散的蒲公英网页》
- 文章地址：https://mp.weixin.qq.com/s/FwBWw2znYZFayBosZPCzLw
- 原件文件：`src/three/DandelionMeadow.ts`（整套 Vue 3 + Three.js + Web Audio 应用里的一个文件）
- 访问日期：2026-11-18
- 归集情况：**无仓库、无归集文件**（`provenance.files: []`、`completeness: 'absent'`）。
  下面是从文章正文复制的代码块，用于 `ported[].symbol` 的 `\b` 命中核对；空白与缩进按原文排版做了统一，
  标识符、常量、运算符一字未改。

---

## 1. 单颗种子的线段几何（44 段 / 88 端点）

> 原文：一颗种子由三部分组成：底部短小的棕色瘦果、中间的细柄、顶部伞状冠毛。
> 局部坐标约定 **Y 向上**：瘦果在 `y < 0`，细柄从原点向上延伸，伞冠在 `y ≈ 0.16—0.19` 的位置。
> `line(a, b, shade)` 会把两个端点加入线段几何，同时写入颜色；`shade` 是当前效果使用的明暗系数。

```ts
line([0, -0.055, 0], [0, 0, 0], 0.38)
line([0, 0, 0], [0, 0.16, 0], 0.7)

for (let j = 0; j < 14; j++) {
  const angle = j / 14 * Math.PI * 2
  const c = Math.cos(angle), s = Math.sin(angle)

  line([0, 0.16, 0], [c * 0.07, 0.19, s * 0.07], 0.92)
  line(
    [c * 0.07, 0.19, s * 0.07],
    [c * 0.125, 0.18, s * 0.125], 1,
  )
  line(
    [c * 0.10, 0.184, s * 0.10],
    [c * 0.13 - s * 0.014, 0.19, s * 0.13 + c * 0.014],
    0.9,
  )
}
```

> 原文：每个方向不是一根直直伸出去的线，而是略微抬起再向外展开，末端补一小段分叉。

## 2. Fibonacci 球面采样

> 原文：如果用固定经纬度生成球面，靠近两极的点会堆得很密，中间又能看出一条条整齐的环。
> 这里使用 Fibonacci 球面采样。高度逐步下降，方位角每次增加约 2.39996323 弧度。

```ts
const ny = 1 - (i + 0.5) / count * 2
const r = Math.sqrt(1 - ny * ny)
const angle = i * 2.39996323

const nx = Math.cos(angle) * r
const nz = Math.sin(angle) * r

const direction = new Vector3(nx, ny, nz)
```

> 原文：实际代码还对角度、高度和半径加入小幅抖动，再让每颗种子的尺寸略有不同，打散过于规整的格子感。
> `aHome`：种子在世界空间中的固定起点。`aAxis`：花球中心指向这颗种子的径向方向。
> `aSize`：尺寸变化。`aRandom`：保留下来的随机值，后面用于旋转与飘动。
> 原文：起点半径还要减去一段细柄长度，不能直接把所有种子的根部放到球壳上，否则花球会比预期大一圈。

## 3. 局部小伞怎么转到球面上（含退化分支）

```glsl
vec3 helper = abs(axis.y) > 0.96
  ? vec3(1.0, 0.0, 0.0)
  : vec3(0.0, 1.0, 0.0);

vec3 right = normalize(cross(helper, axis));
vec3 forward = cross(axis, right);

vec3 local = (
  right * radial.x
  + axis * position.y
  + forward * radial.y
) * aSize;
```

> 原文：`radial` 是种子局部 XZ 坐标绕自身 Y 轴旋转后的结果，每颗种子的旋转角不同。
> 原文：当 `axis` 接近竖直方向时，要把辅助轴换成 X 轴。否则两个近乎平行的向量做叉积，
> 长度接近零，归一化后方向就不稳定。（花球顶端几颗突然歪掉的种子）

## 4. 实例属性（一份几何 + 每实例属性）

```ts
const geometry = new InstancedBufferGeometry()

geometry.setAttribute(
  'position',
  new BufferAttribute(new Float32Array(positions), 3),
)
geometry.setAttribute(
  'aHome',
  new InstancedBufferAttribute(new Float32Array(home), 3),
)
geometry.setAttribute(
  'aAxis',
  new InstancedBufferAttribute(new Float32Array(axes), 3),
)
geometry.setAttribute(
  'aRelease',
  new InstancedBufferAttribute(releases, 1),
)
geometry.instanceCount = seedCount

const seeds = new LineSegments(geometry, material)
```

> 原文：一片草甸有 10 株蒲公英，共 **1335 颗种子**。近处主花球安排得多一些，远处的花球更小，
> 种子也相应减少。（逐株坐标与半径不在文章正文内。）

## 5. 错峰释放

```ts
const DETACH_SECONDS = 1.8

for (let i = 0; i < releases.length; i++) {
  releases[i] = time + random() * DETACH_SECONDS
}

releaseAttribute.needsUpdate = true
```

```glsl
float age    = max(0.0, uTime - aRelease);
float flying = aRelease >= 0.0 && uTime >= aRelease ? 1.0 : 0.0;
float travel = age * flying;
```

> 原文：`travel` 是**秒数**，不是距离，也不是 0—1 的进度。它为零时，种子留在原来的花球上；
> 开始增加后，再计算飘动。

## 6. 飘散轨迹

> 原文：世界坐标约定是 **Y 向上，镜头大致从正 Z 方向看向负 Z**。
> 主飘动方向为正 X、正 Y、负 Z，也就是向右、向上、离镜头更远。

```glsl
vec3 drift = vec3(
  travel * (0.35 + aRandom * 1.6),
  travel * (0.08 + fract(aRandom * 17.0) * 0.7),
  -travel * (0.5 + fract(aRandom * 31.0) * 2.5)
);

drift.x += sin(travel * 1.1 + aRandom * 31.0) * 0.24 * min(travel, 1.0);
drift.y += sin(travel * 0.9 + aRandom * 23.0) * 0.22 * min(travel, 1.0);

drift *= 0.85 + uWind * 0.25;
```

> 原文：`fract()` 把同一个随机值重新映射到不同变化中，减少所有方向都一起快、一起慢的情况。
> 它不是在生成彼此严格独立的随机变量，只是足够当前画面的分散需求。
> 原文：风力 `uWind` 也是视觉参数，不对应风速计上的米每秒。

## 7. 朝向过渡

> 原文：种子在花球上时，朝向是球面径向。如果脱落后始终保持这个方向，就会出现一群横着、倒着飞的小伞。
> 项目会在约 **1.3 秒**内，将径向朝向过渡到略微倾斜的向上方向。每颗种子的倾斜和摇动仍然有差别，
> 所以整体有共同趋势，局部又不会整齐划一。（过渡曲线与倾斜公式未在文章正文给出。）

## 8. 三轴合成的世界坐标

```glsl
vec3 world = home + local + drift * flying;
gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
```

## 9. 透明度

```glsl
float fade = 1.0 - smoothstep(7.0, 10.0, travel);

float attachedAlpha = 0.19 + max(0.0, aAxis.z) * 0.26;
vAlpha = fade * mix(attachedAlpha, 0.62, flying);
```

> 原文：这里把冠毛做成半透明细丝，附着时再根据径向的 Z 分量，近似调整前后两侧的明暗。
> 这个判断适合当前固定镜头，并不是真正的透射光照。
> 原文：透视相机会让远去的种子自然变小，透明度再负责最后的消失。
> 原文：材质开启透明并关闭 `depthWrite`。

## 10. 重置（不销毁场景）

```ts
releases.fill(-1)
releaseAttribute.needsUpdate = true
phase = 'ready'
breath = 0
```

> 原文：花球起点、方向与几何继续复用，背景与相机也不变。
> 原文：动画时间来自帧间隔，切到后台时跳过绘制和更新，并对异常大的时间步长设上限。
> 系统设置为减少动态效果时，会关闭附着种子的待机摇动。放飞仍由用户主动触发，持续时间保持原来的节奏。
> 原文：`dispose()` 可重复调用；构造失败时也走清理路径。

---

## 不在摘录内、由本站补充的部分（已在代码里标注【本地补充】）

| 项 | 原文情况 | 本站取值 / 做法 |
|---|---|---|
| 10 株的坐标与半径 | 只有「10 株 / 1335 颗 / 近大远小」 | `meadow.ts: PLANT_LAYOUT`（播种数严格求和 = 1335） |
| 角度/高度/半径抖动幅度 | 只说「小幅抖动」 | ±0.09 rad / ±0.015 / ±3.5% |
| 待机摇动的公式 | 只说「会关闭附着种子的待机摇动」 | 预渲染位图整体轻摆 + 附着态实时绘制的 ±0.05 微摆 |
| 朝向过渡曲线与倾斜量 | 只说「约 1.3 秒」「略微倾斜的向上方向」 | smoothstep 缓动 + aRandom 决定倾斜/摇动 |
| 相机参数 | 用 Three.js PerspectiveCamera | `createView()` 固定透视（camZ=6.4，focal=2.1×height，地平线 0.72×height） |
| 渲染 LOD | 顶点着色器一次画满 44 段 | ready 态预渲染 23 段/颗、释放期附着态 14 段/颗、飞行态按屏幕尺寸 44/14/5/2 段（详见 part.manifest.ts 的 downgrade） |
| 花茎/叶片/背景 | CatmullRomCurve3 + TubeGeometry、分段平面叶片、渐变背景 | 二次曲线画茎；叶片与背景由站点模板承担 |

---

## 11. 常量命名对照（原文数字 → 本库符号名）

**重要前提：原文没有给这些数字起名字**，绝大多数是直接写在公式里的字面量（`14`、`2.39996323`、
`smoothstep(7.0, 10.0, …)`、`0.62`、`0.19`/`0.26`、`1.3`）。本库为了「可测、可追溯、改一处就报错」，
把它们提升成了命名常量（`meadow.ts` 顶部），并逐条登记进 `tag: ported[]`。
下表是「符号名 ↔ 原文出处」的对照，**不是**声称原文里存在这些标识符。

| 本库符号名 | 值 | 原文出处（本文档章节 / 原文字面量） |
|---|---|---|
| `DETACH_SECONDS` | 1.8 | §5 `const DETACH_SECONDS = 1.8`（原文唯一的命名字面量） |
| `SEGMENTS_PER_SEED` | 44 | §1：2 段基础 + `for (j < 14)` × 3 段 = 2 + 42 = 44 |
| `PAPPUS_DIRECTIONS` | 14 | §1 循环上界 `j < 14` |
| `GOLDEN_STEP` | 2.39996323 | §2 `angle = i * 2.39996323` |
| `STEM_TOP_Y` | 0.16 | §1 `line([0, 0, 0], [0, 0.16, 0], 0.7)` 的终点高度 |
| `TURN_SECONDS` | 1.3 | §7「会在约 1.3 秒内，将径向朝向过渡到略微倾斜的向上方向」 |
| `FADE_START` | 7.0 | §9 `smoothstep(7.0, 10.0, travel)` 的第一参数 |
| `FADE_END` | 10.0 | §9 `smoothstep(7.0, 10.0, travel)` 的第二参数 |
| `FLYING_ALPHA` | 0.62 | §9 `mix(attachedAlpha, 0.62, flying)` |
| `ATTACHED_ALPHA_BASE` | 0.19 | §9 `attachedAlpha = 0.19 + max(0.0, aAxis.z) * 0.26` 的常数项 |
| `ATTACHED_ALPHA_Z` | 0.26 | §9 同式的 Z 系数 |
| `PLANT_LAYOUT` | 10 行表 | 不在原文内（原文只说「10 株 / 近大远小」）→ 本地补充的构图常量表，见下方补充表 |
| `SEED_COUNT` | 1335 | 原文「共 1335 颗」；本库取 `PLANT_LAYOUT` 逐株 seeds 之和，两者严格相等 |

> 为什么值得单列：这些数字原先散落在公式里，改一位（例如把 1.8 改成 1.5）不会有任何机械门变红——
> 门 9 只验「符号在不在 `ported[]`」，验不出数值被改动。提升为命名常量 + `tests/golden/dandelion.json`
> 的逐条黄金值，才能让「改一位」在 CI 上直接失败。
