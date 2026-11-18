// 零件声明（L3 · 契约 v1）：blow-input —— 吹气输入（D3 算法移植）。
//
// 原件：公众号文章配套代码 src/utils/BlowInput.ts。
// 现状：getUserMedia 约束、fftSize 2048 / smoothingTimeConstant 0.65、1.2 s 底噪校准、
//       threshold = max(0.025, baseline×2.8)、broadband 宽频权重、breath 积分门控、
//       requestToken 权限竞态，全部按原文进入产物；浏览器侧资源生命周期在站点零件里。
import type { PartManifest } from '../../contract/parts-registry';

const manifest = {
  id: 'blow-input',
  layer: 'interaction',
  origin: 'port',
  entry: 'shared/parts-library/blow-input/index.ts',
  // 不声明 source：source 的语义是「已归集进本库的原件路径」，而本件只有文章里的代码块
  // （files: [] / completeness: 'absent'），库里没有任何可指向的原件。
  // 上游路径写在 provenance.upstream.article 与 note 里，代码块见本目录 EXCERPT.md。
  contract: 'v1',
  claims: [{ resource: 'input:mic', mode: 'exclusive' }],
  requires: 'none',
  note: '算法移植（D3）：麦克风 → AnalyserNode → RMS / 宽频权重 / breath 积分 → 放飞；'
    + '只在用户点击后申请，按钮始终保留，不录音不上传。'
    + '上游为公众号文章（src/utils/BlowInput.ts），无仓库、无归集原件，故不声明 source。',
  provenance: {
    depth: 'D3',
    upstream: {
      article: 'https://mp.weixin.qq.com/s/FwBWw2znYZFayBosZPCzLw',
      accessed: '2026-11-18',
    },
    files: [],
    completeness: 'absent',
    ported: [
      {
        symbol: 'echoCancellation',
        kind: 'constant',
        portedTo: 'sites/hug/parts/blow-input.ts:echoCancellation',
        downgrade: '原件用了什么技术：getUserMedia 的 audio 约束里把 echoCancellation 设为 false，'
          + '尽量保留吹气的噪声特征。'
          + '我们用什么替代：同一个约束对象 AUDIO_CONSTRAINTS，三个开关全部关掉。'
          + '差异导致的可见后果：浏览器与设备是否采纳这些约束要以实际行为为准，'
          + '部分设备仍会做回声消除，导致吹气的高频成分被削、触发变迟钝。',
      },
      {
        symbol: 'noiseSuppression',
        kind: 'constant',
        portedTo: 'sites/hug/parts/blow-input.ts:noiseSuppression',
        downgrade: '原件用了什么技术：把 noiseSuppression 设为 false，避免降噪把吹气当成噪声过滤掉。'
          + '我们用什么替代：同一约束值原样请求。'
          + '差异导致的可见后果：同样取决于设备实现；若系统强行降噪，'
          + '用户可能要把麦克风凑得更近才够阈值。',
      },
      {
        symbol: 'autoGainControl',
        kind: 'constant',
        portedTo: 'sites/hug/parts/blow-input.ts:autoGainControl',
        downgrade: '原件用了什么技术：关闭 autoGainControl，避免自动增益把强弱吹气拉平成同一读数。'
          + '我们用什么替代：同一约束值原样请求。'
          + '差异导致的可见后果：若设备仍自动增益，强弱吹气在强度读数上的区分会变弱，'
          + '但只要超过门限仍能触发放飞。',
      },
      {
        symbol: 'fftSize',
        kind: 'constant',
        portedTo: 'shared/parts-library/blow-input/core/detector.ts:FFT_SIZE',
        downgrade: '原件用了什么技术：analyser.fftSize = 2048，频点宽 = sampleRate / 2048，'
          + '频带边界与数组长度都由它推导。'
          + '我们用什么替代：常数 FFT_SIZE = 2048 同时用于建分析器与算带宽。'
          + '差异导致的可见后果：频率分辨率与原件一致；'
          + '在 44.1 kHz 下每根频点约 21.5 Hz，180 Hz 以下只剩 8 根频点，低频判断天然粗糙。',
      },
      {
        symbol: 'smoothingTimeConstant',
        kind: 'constant',
        portedTo: 'shared/parts-library/blow-input/core/detector.ts:SMOOTHING_TIME_CONSTANT',
        downgrade: '原件用了什么技术：analyser.smoothingTimeConstant = 0.65，让频谱在时间上平滑，'
          + '避免单帧抖动直接触发。'
          + '我们用什么替代：同一常数直接赋给分析器。'
          + '差异导致的可见后果：起音比原始波形略慢半拍（这正是原件想要的稳定效果）；'
          + '极短促的一声吹气可能因为平滑而读不到峰值。',
      },
      {
        symbol: 'getByteTimeDomainData',
        kind: 'function',
        portedTo: 'sites/hug/parts/blow-input.ts:getByteTimeDomainData',
        downgrade: '原件用了什么技术：每帧 getByteTimeDomainData(wave) 取时域字节，'
          + '按 (value−128)/128 平移缩放后平方求均值再开方得到 RMS。'
          + '我们用什么替代：同一个 API、同一段 RMS 计算（detector.rmsOfWave）。'
          + '差异导致的可见后果：读数与原件同一量纲；但字节采样只有 8 位，'
          + '安静环境下的底噪量化台阶会让门限附近的读数有约 1/128 的抖动。',
      },
      {
        symbol: 'baseline',
        kind: 'algorithm',
        portedTo: 'shared/parts-library/blow-input/core/detector.ts:baseline',
        downgrade: '原件用了什么技术：校准期用 baseline = baseline×0.94 + rms×0.06 估计环境底噪，'
          + '校准结束后的门限以它为基准。'
          + '我们用什么替代：同一条指数滑动平均，校准期内只更新底噪并返回 0。'
          + '差异导致的可见后果：安静房间与开着风扇的房间都能自适应；'
          + '但底噪只在开头 1.2 秒估计一次，中途环境变吵（有人说话、开窗）不会自动重估，'
          + '需要手动关掉麦克风再开。',
      },
      {
        symbol: 'calibrating',
        kind: 'algorithm',
        portedTo: 'shared/parts-library/blow-input/core/detector.ts:calibrating',
        downgrade: '原件用了什么技术：校准期间（先安静 1.2 秒）分支直接 return 0，任何强度都不触发放飞。'
          + '我们用什么替代：BlowDetector 内置同一个校准窗口与同名的 calibrating 判定。'
          + '差异导致的可见后果：刚开麦的 1.2 秒内吹气不会有反应；'
          + '如果用户开麦后立刻猛吹，那口气会被当成环境声吸收进底噪，需要再吹一次。',
      },
      {
        symbol: 'hzPerBin',
        kind: 'algorithm',
        portedTo: 'shared/parts-library/blow-input/core/detector.ts:hzPerBin',
        downgrade: '原件用了什么技术：hzPerBin = sampleRate / 2048、hz = index × hzPerBin，'
          + '把低于约 180 Hz 的频点记 low、180—4200 Hz 记 high。'
          + '我们用什么替代：同一组边界与同一套累计方式（bandEnergy）。'
          + '差异导致的可见后果：频带划分与原件一致；但累计的是频谱字节值而不是物理能量，'
          + '比值只能当经验权重（原文对此有明确声明）。',
      },
      {
        symbol: 'threshold',
        kind: 'algorithm',
        portedTo: 'shared/parts-library/blow-input/core/detector.ts:thresholdOf',
        downgrade: '原件用了什么技术：threshold = max(0.025, baseline × 2.8)，'
          + '以底噪的 2.8 倍作为经验门限，并设 0.025 的下限。'
          + '我们用什么替代：同一个表达式（thresholdOf）。'
          + '差异导致的可见后果：门限行为与原件一致；但它仍是经验值，'
          + '大声说话、关门、风扇都可能越过门限——真正拦住误触的是后面的宽频权重与持续时间。',
      },
      {
        symbol: 'broadband',
        kind: 'algorithm',
        portedTo: 'shared/parts-library/blow-input/core/detector.ts:broadbandOf',
        downgrade: '原件用了什么技术：broadband = min(1, high / max(1, low × 2.5))，'
          + '用中高频相对低频的占比压低低频碰撞声的影响。'
          + '我们用什么替代：同一个公式，边界与倍数都没改。'
          + '差异导致的可见后果：能减少部分低频撞击误触发；'
          + '但不能可靠区分吹气、讲话和风扇声——原文已明说这不是声音分类器，我们保持同一局限。',
      },
      {
        symbol: 'strength',
        kind: 'algorithm',
        portedTo: 'shared/parts-library/blow-input/core/detector.ts:strengthOf',
        downgrade: '原件用了什么技术：strength = max(0, min(1, (rms − threshold)/0.16)) × broadband，'
          + '把超阈值的幅度归一化后再乘宽频权重。'
          + '我们用什么替代：同一个表达式，0.16 的跨度与夹取顺序都没改。'
          + '差异导致的可见后果：强度曲线与原件一致；'
          + '由于 0.16 的跨度相对麦克风灵敏度很窄，轻吹就会顶到 1，强弱区分主要靠后续门控。',
      },
      {
        symbol: 'breath',
        kind: 'algorithm',
        portedTo: 'shared/parts-library/blow-input/core/detector.ts:breath',
        downgrade: '原件用了什么技术：breath 在 level > 0.12 时按 dt 累加、否则按 2×dt 衰减，'
          + '超过 0.12 且处于 ready 相位才调用放飞，强度取 max(0.4, level)。'
          + '我们用什么替代：同一个积分式与同一个经验门限；'
          + '站点侧没有相位回调，改用「连续 0.6 秒低于门限后重新武装」来模拟一次吹气一次放飞。'
          + '差异导致的可见后果：能抑制单帧尖峰误触；但重新武装的判定是本地补充，'
          + '在极短间隔的连续两次吹气里，第二次可能被吞掉。',
      },
      {
        symbol: 'requestToken',
        kind: 'algorithm',
        portedTo: 'sites/hug/parts/blow-input.ts:requestToken',
        downgrade: '原件用了什么技术：const token = ++requestToken，getUserMedia 返回后若 token 不等，'
          + '就逐条 stop() 丢掉这条流；停止时同样递增序号让在途请求过期。'
          + '我们用什么替代：同一个序号机制，覆盖「授权框未处理完就取消/离开页面」与 pagehide 两种情形，'
          + '并在 teardown 里断开节点、关闭 AudioContext。'
          + '差异导致的可见后果：不会出现「页面已经不要了、麦克风还亮着」的泄漏；'
          + '但真实权限框上的竞态时序无法在无设备环境复现，这一条只做了代码级与失败路径验证。',
      },
      {
        symbol: 'rms',
        kind: 'algorithm',
        portedTo: 'shared/parts-library/blow-input/core/detector.ts:rmsOfWave',
        downgrade: '原件用了什么技术：把 getByteTimeDomainData 拿到的波形逐点换算成 (v − 128)/128，'
          + '平方求和取均值再开方，得到当前帧的 RMS 幅度。'
          + '我们用什么替代：同一条换算与同一个开方（rmsOfWave），逐字搬入；'
          + '波形数组长度与 FFT 无关，直接取 analyser.fftSize 个采样点。'
          + '差异导致的可见后果：幅度刻度与原件一致（安静时接近 0，满幅时接近 1）；'
          + '但由于关掉了 autoGainControl，不同麦克风的绝对灵敏度差异会直接体现在 RMS 上，'
          + '所以后面必须再用底噪校准把它归一化。',
      },
    ],
    paramSurface: {
      // 无归集文件（只有文章代码块），param-pool 的 AST 分母恒为 0，scope / enumerated 必须为空。
      scope: [],
      enumerated: [],
      evidence: '上游无仓库、无归集文件（files: []），无法机械抽取参数面；'
        + '15 个 ported 符号的常量与公式已在 EXCERPT.md 逐段抄录'
        + '（含原文「不能当成严格物理能量比」的声明），未接线任何参数名映射。',
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
