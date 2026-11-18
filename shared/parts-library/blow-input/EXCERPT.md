# blow-input · 原文代码摘录（溯源对账用）

- 上游：公众号文章《Three.js 实战：把愿望交给风，做一个可以吹散的蒲公英网页》
- 文章地址：https://mp.weixin.qq.com/s/FwBWw2znYZFayBosZPCzLw
- 原件文件：`src/utils/BlowInput.ts`
- 访问日期：2026-11-18
- 归集情况：**无仓库、无归集文件**（`provenance.files: []`、`completeness: 'absent'`）。

> 原文：它只负责音频输入和强度读数，不碰相机，也不直接修改种子。
> 链路：**麦克风 → AudioContext → AnalyserNode → 强度值 → 放飞方法。** 音频节点只接到分析器，没有连到扬声器。

---

## 1. 建流与分析器

```ts
const stream = await navigator.mediaDevices.getUserMedia({
  audio: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  },
  video: false,
})

const context = new AudioContext()
await context.resume()

const source = context.createMediaStreamSource(stream)
const analyser = context.createAnalyser()
analyser.fftSize = 2048
analyser.smoothingTimeConstant = 0.65
source.connect(analyser)
```

> 原文：请求关闭降噪等处理，是为了尽量保留吹气的噪声特征；浏览器与设备是否采纳，要以实际行为为准。
> 原文：麦克风只在用户点击后申请。页面需要 HTTPS 或浏览器认可的本机安全环境，例如 localhost。
> 所以按钮始终保留。

## 2. 先安静 1.2 秒估底噪

```ts
analyser.getByteTimeDomainData(wave)

let energy = 0
for (const value of wave) {
  energy += ((value - 128) / 128) ** 2
}
const rms = Math.sqrt(energy / wave.length)

if (calibrating) {
  baseline = baseline * 0.94 + rms * 0.06
  return 0
}
```

> 原文：字节采样以 128 附近表示零点，先平移、缩放，再平方求平均。
> 估计底噪时让用户先安静一会儿，否则一开始的吹气也可能被当成环境声音。（校准 1.2 秒，期间不触发放飞。）

## 3. 门限与宽频权重

```ts
const hzPerBin = context.sampleRate / 2048
const hz = index * hzPerBin

const threshold = Math.max(0.025, baseline * 2.8)
const broadband = Math.min(1, high / Math.max(1, low * 2.5))
const strength = Math.max(0, Math.min(1,
  (rms - threshold) / 0.16,
)) * broadband
```

> 原文：将低于约 180 Hz 的频点值与约 180—4200 Hz 的频点值分开累计，构造一个经验权重。
> 原文：这里的 `high`、`low` 累计的是分析器给出的频谱字节值，**不能把这个比值当成严格的物理能量比**。
> 频带、门限、倍数都是为交互调的经验值。
> 原文：这个办法能减少部分低频碰撞声的影响，但不能可靠区分吹气、讲话和风扇声。
> 设备位置、麦克风处理和背景声音都会改变结果。页面直接提示这一点，并允许关闭麦克风改用按钮。

## 4. 防一帧杂音吹完

```ts
breath = level > 0.12
  ? breath + dt
  : Math.max(0, breath - dt * 2)

if (breath > 0.12 && phase === 'ready') {
  blow(Math.max(0.4, level))
}
```

> 原文：强度超过经验门限并持续一小段时间，才进入放飞。它能抑制部分瞬时尖峰，
> 也给输入留一点缓冲；仍然不是声音分类器。

## 5. 权限竞态

```ts
const token = ++requestToken
const stream = await navigator.mediaDevices.getUserMedia(options)

if (token !== requestToken) {
  stream.getTracks().forEach(track => track.stop())
  return false
}
```

> 原文：停止时递增序号，让尚未返回的请求过期；已有媒体流则逐条 `stop()`，音频节点断开，
> `AudioContext` 关闭。页面组件还会处理切到后台和卸载，避免看完动画却忘了释放输入设备。
> 原文：这些代码没有录制音频，没有创建音频文件，也没有发送音频请求到服务器。
> 这里需要的是当下的强度值，没必要把声音保存下来。

---

## 不在摘录内、由本站补充的部分（代码里已标注【本地补充】）

| 项 | 原文情况 | 本站做法 |
|---|---|---|
| 触发后如何重新武装 | 原文用组件 `phase === 'ready'` 门控 | `REARM_SECONDS = 0.6`：连续低于门限 0.6 s 后重新武装；站点侧另有 `#act` 的 ready 态守卫 |
| 放飞入口 | 原文调用组件传入的 `blow(level)` | 未传 `onBlow` 时点击站点模板的 `#act`（复用站点状态机，不复制逻辑） |
| 循环驱动 | 原文挂在渲染循环里 | 零件内自有 `requestAnimationFrame`（站点 glue 不调用 blow.update） |
