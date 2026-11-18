// 零件契约 v2（PartV2）—— 唯一真相源。
//
// 与 v1 的根本差异（为什么必须换契约，不是换名字）：
//   v1 的零件是 `update(seconds) + pipe(input)` 的**纯状态机**，不碰画布。
//   结果就是「10 个零件里只有 3 个能看」，剩下的是空壳与圆点（实测结论）。
//   v2 强制零件**自己会画**：`create(env) → { update, draw }`，
//   并且声明自己属于哪一层、用什么混合模式、花多少毫秒 —— 装配器才有东西可以编排。
//
// 三条硬约束（违反即装配失败，不静默降级）：
//   1. 零件之间**只读 WorldFrame，不许互相调用**。没有「零件 A 拿到零件 B 的实例」这条路。
//      复合效果靠「层叠加 + 混合模式」，不靠耦合。
//   2. 同一层可以有多个零件，靠 `z` 决定先后（升序，z 相同按 id 字典序）。
//   3. L4（后处理）整场唯一。后处理链不是栈，是一条链；两条链会互相抹掉对方的像素。

/** 六层。数字越大越靠上，L0 是底材，L5 是 UI。 */
export type PartLayer = 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5';

/** 层序（固定，不可由站点覆盖）。 */
export const LAYER_ORDER: readonly PartLayer[] = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5'] as const;

/** 层的语义名字，只用于报错与调试面板。 */
export const LAYER_LABEL: Readonly<Record<PartLayer, string>> = {
  L0: '底材（纸/水/雾/底噪）',
  L1: '世界（3D 场景 / 体素 raymarcher）',
  L2: '生态（草、鱼、鸟、气泡等自走实体）',
  L3: '交互（风、吹气、指针涟漪等输入）',
  L4: '后处理（像素化/扫描线/色差/光晕）',
  L5: 'UI（文字、指引、调试条）',
};

/** 渲染通道。GL 通道整场只有一个画布，用于 L1 的体素世界。 */
export type PartChannel = 'canvas2d' | 'gl';

/**
 * 允许的混合模式。
 *
 * 为什么是白名单而不是 `GlobalCompositeOperation`：
 *   部分取值（`copy` / `destination-in`）会**清空整个画布**，一旦某个零件写错，
 *   表现是「其他零件全没了」，排查成本极高。白名单把它们挡在类型层。
 */
export type BlendMode =
  | 'source-over'
  | 'lighter'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'soft-light'
  | 'hard-light'
  | 'color-dodge'
  | 'color-burn'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity';

/** 混合模式白名单（运行期校验用，与类型同源）。 */
export const BLEND_MODES: readonly BlendMode[] = [
  'source-over', 'lighter', 'multiply', 'screen', 'overlay', 'soft-light', 'hard-light',
  'color-dodge', 'color-burn', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity',
];

/** 画质档位。装配器在超预算时把零件降到 low，而不是不画。 */
export type Lod = 'low' | 'high';

/** biome —— 决定默认调色与后处理倾向，零件可读。 */
export type BiomeId = 'tide' | 'field' | 'room' | 'ink';

/** 指针状态（已归一化到 [0,1]，原点左上）。 */
export interface PointerState {
  /** 0..1 */
  readonly x: number;
  /** 0..1 */
  readonly y: number;
  /** 每秒归一化位移 */
  readonly vx: number;
  readonly vy: number;
  readonly down: boolean;
}

/** 音频状态。`null` = 麦克风未开启（零件必须能优雅退化）。 */
export interface AudioState {
  /** 0..1 总响度 */
  readonly level: number;
  /** 分频能量，长度由 provider 决定（典型 8 段），0..1 */
  readonly bands: Float32Array;
}

/** 画布尺寸。 */
export interface StageSize {
  readonly w: number;
  readonly h: number;
  readonly dpr: number;
}

/**
 * 世界帧 —— 零件每帧唯一能读到的东西。
 *
 * 不可变是刻意的：零件拿不到 stage，就拿不到别的零件，也就无法形成隐式耦合。
 */
export interface WorldFrame {
  /** 世界时钟（秒），从 0 起，暂停时不走 */
  readonly t: number;
  /** 本帧时长（秒），已 clamp 到 [0, 0.1] */
  readonly dt: number;
  /** 站点种子，同一 seed 必须得到同一画面 */
  readonly seed: number;
  readonly pointer: PointerState;
  readonly audio: AudioState | null;
  readonly biome: BiomeId;
  /** 无障碍降级：为 true 时零件必须关掉大幅位移/闪烁 */
  readonly reducedMotion: boolean;
  readonly size: StageSize;
}

/** 零件构造环境。 */
export interface PartEnv {
  /** canvas2d 通道 = 主 2D 画布；gl 通道 = 唯一的 GL 画布 */
  readonly canvas: HTMLCanvasElement;
  /** 仅 canvas2d 通道非空；gl 通道为 null */
  readonly ctx: CanvasRenderingContext2D | null;
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
  /** 该零件专属种子 = hash(stageSeed, partId, index)，同一 seed 稳定 */
  readonly seed: number;
  readonly biome: BiomeId;
  /** 初始画质档位 */
  readonly lod: Lod;
}

/** 零件实例。`draw` 必填 —— 不会画的不是零件。 */
export interface PartInstance {
  update?(frame: WorldFrame): void;
  draw(frame: WorldFrame): void;
  /** 尺寸变化。不实现则装配器不通知，零件需自行读 frame.size */
  resize?(size: StageSize): void;
  /** 降档/升档。不实现 = 该零件无 LOD 能力，超预算时只能被挂起 */
  setLod?(lod: Lod): void;
  dispose?(): void;
}

/** 零件定义（静态，构造前即可读）。 */
export interface PartV2 {
  /** 全局唯一 id，建议 kebab-case */
  readonly id: string;
  readonly layer: PartLayer;
  /** 缺省 'source-over' */
  readonly blend?: BlendMode;
  /**
   * 实测单帧开销（毫秒）。**必须实测**，不接受估计值 —— 装配器的降档决策全靠它。
   */
  readonly costMs: number;
  /** gzip 后体积（KB），用于站点体积门。 */
  readonly kb: number;
  /** 同层排序，升序；缺省 0 */
  readonly z?: number;
  /** 缺省 'canvas2d' */
  readonly channel?: PartChannel;
  /**
   * 超预算且降档后仍超时，是否可以直接不画。
   * 后处理（L4）与装饰性生态可设 true；L1 世界与 L5 UI 一律 false。
   */
  readonly expendable?: boolean;
  /** 该零件依赖的浏览器能力，装配器据此跳过不支持的零件并记入 degraded */
  readonly requires?: readonly ('webgl2' | 'webgpu' | 'mic' | 'pointer')[];
  readonly create: (env: PartEnv) => PartInstance;
}

/** 降档/挂起记录，对外可见（调试条与验收测试都读它）。 */
export interface DegradedEntry {
  readonly id: string;
  readonly layer: PartLayer;
  /** budget = 超预算已降到 low；suspended = 降档后仍超预算被挂起；unsupported = 缺能力 */
  readonly reason: 'budget' | 'suspended' | 'unsupported';
  readonly detail: string;
}

/** 装配期错误码。 */
export type StageErrorCode =
  | 'E_DUP_PART_ID'
  | 'E_BAD_LAYER'
  | 'E_MULTI_POST'
  | 'E_MULTI_GL'
  | 'E_BAD_BLEND'
  | 'E_BAD_COST'
  | 'E_PART_THROW';

/** 装配期错误。message 里必须带零件 id —— 没有 id 的报错等于没报。 */
export class StageError extends Error {
  readonly code: StageErrorCode;
  readonly partId: string;

  constructor(code: StageErrorCode, partId: string, message: string) {
    super(`[${code}] ${partId}: ${message}`);
    this.name = 'StageError';
    this.code = code;
    this.partId = partId;
  }
}
