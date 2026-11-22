// 世界帧工厂 —— 把「浏览器事件」收敛成「零件唯一能读到的只读快照」。
//
// 为什么单独一层：零件不许互相调用（契约硬约束 1），所以它们之间的**唯一共享状态**
// 就是 WorldFrame。这一层是那个共享状态的全部实现，任何新增的共享量都必须加在这里，
// 而不是让两个零件私下拉手。
import type { AudioState, BiomeId, Lod, PointerState, Rect, StageSize, WorldFrame } from './contract';

/** 一秒内允许的最大帧时长，防止切后台回来时整个世界瞬移。 */
export const MAX_DT_SECONDS = 0.1;

/**
 * mulberry32 —— 32 位确定性伪随机。
 *
 * 为什么不用 Math.random：确定性是验收项。同一 seed 必须逐帧一致，
 * 否则「看上去一样」无法被测试证明。mulberry32 状态小、可序列化、跨平台一致。
 *
 * @param seed 任意 32 位整数种子
 * @returns 返回 [0,1) 的生成器
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 把若干整数/字符串混成一个 32 位种子（FNV-1a）。
 *
 * 用途：站点 seed 相同、零件不同 → 各零件种子不同，但组合稳定。
 * 这样「换零件不改别的零件的形态」，同 seed 复现时又能逐位对齐。
 *
 * @param parts 种子片段（数字或字符串）
 * @returns 32 位无符号整数
 */
export function hashSeed(...parts: readonly (string | number)[]): number {
  let h = 0x811c9dc5;
  for (const part of parts) {
    const text = typeof part === 'string' ? part : String(part);
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    // 分隔符：避免 ('ab','c') 与 ('a','bc') 撞成同一个种子
    h ^= 0x1f;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 指针事件累积器：把高频事件压成「本帧的指针状态」。 */
export interface PointerTracker {
  readonly state: PointerState;
  /** 归一化坐标写入（0..1） */
  move(x: number, y: number): void;
  setDown(down: boolean): void;
  /** 每帧末调用：算速度积分并重置增量 */
  commit(dtSeconds: number): void;
}

/**
 * 建一个指针跟踪器。
 *
 * @param width 画布 CSS 宽（>0）
 * @param height 画布 CSS 高（>0）
 * @returns 跟踪器
 */
export function createPointerTracker(width: number, height: number): PointerTracker {
  let w = width > 0 ? width : 1;
  let h = height > 0 ? height : 1;
  let nx = 0.5;
  let ny = 0.5;
  let px = 0.5;
  let py = 0.5;
  let down = false;
  let vx = 0;
  let vy = 0;

  const state: PointerState = {
    get x() { return nx; },
    get y() { return ny; },
    get vx() { return vx; },
    get vy() { return vy; },
    get down() { return down; },
  };

  return {
    state,
    move(x: number, y: number): void {
      w = w > 0 ? w : 1;
      h = h > 0 ? h : 1;
      nx = Math.min(1, Math.max(0, x / w));
      ny = Math.min(1, Math.max(0, y / h));
    },
    setDown(next: boolean): void {
      down = next;
    },
    commit(dtSeconds: number): void {
      const dt = dtSeconds > 0 ? dtSeconds : 1 / 60;
      vx = (nx - px) / dt;
      vy = (ny - py) / dt;
      px = nx;
      py = ny;
    },
  };
}

/** 世界时钟选项。 */
export interface WorldOptions {
  readonly seed: number;
  readonly biome: BiomeId;
  readonly width: number;
  readonly height: number;
  readonly dpr?: number;
  readonly reducedMotion?: boolean;
  readonly audio?: AudioState | null;
}

/** 世界时钟。 */
export interface World {
  /** 只读快照，每帧 patch 出来（同一对象引用，字段值随帧变化） */
  readonly frame: WorldFrame;
  /** 推进一帧；返回推进后的 frame */
  tick(dtSeconds: number): WorldFrame;
  /** 直接改尺寸（不经 tick 也能读） */
  resize(width: number, height: number, dpr?: number): void;
  /** 指针事件入口 */
  readonly pointer: PointerTracker;
  setAudio(audio: AudioState | null): void;
  setReducedMotion(value: boolean): void;
  /** 纸矩形（CSS px）；world 零件每帧从这里读 */
  setSheet(sheet: Rect | null): void;
  /** 复位时钟（测试用，保证可重放） */
  reset(): void;
}

/**
 * 建世界时钟。
 *
 * @param options 种子 / biome / 尺寸
 * @returns 世界时钟
 */
export function createWorld(options: WorldOptions): World {
  let t = 0;
  let w = options.width > 0 ? options.width : 1;
  let h = options.height > 0 ? options.height : 1;
  let dpr = options.dpr && options.dpr > 0 ? options.dpr : 1;
  let audio: AudioState | null = options.audio ?? null;
  let reducedMotion = options.reducedMotion === true;
  let sheet: Rect | null = null;

  let lastDt = 0;

  const pointer = createPointerTracker(w, h);
  const size: StageSize = {
    get w() { return w; },
    get h() { return h; },
    get dpr() { return dpr; },
  };

  const frame: WorldFrame = {
    get t() { return t; },
    get dt() { return lastDt; },
    get seed() { return options.seed; },
    get pointer() { return pointer.state; },
    get audio() { return audio; },
    get biome() { return options.biome; },
    get reducedMotion() { return reducedMotion; },
    get size() { return size; },
    get sheet() { return sheet; },
  };

  return {
    frame,
    pointer,
    tick(dtSeconds: number): WorldFrame {
      lastDt = Number.isFinite(dtSeconds)
        ? Math.min(Math.max(dtSeconds, 0), MAX_DT_SECONDS)
        : 0;
      t += lastDt;
      pointer.commit(lastDt);
      return frame;
    },
    resize(width: number, height: number, nextDpr?: number): void {
      w = width > 0 ? width : 1;
      h = height > 0 ? height : 1;
      if (nextDpr && nextDpr > 0) dpr = nextDpr;
    },
    setAudio(next: AudioState | null): void {
      audio = next;
    },
    setReducedMotion(value: boolean): void {
      reducedMotion = value === true;
    },
    setSheet(next: Rect | null): void {
      sheet = next
        ? { x: next.x, y: next.y, w: next.w, h: next.h }
        : null;
    },
    reset(): void {
      t = 0;
      lastDt = 0;
    },
  };
}

/** 降档判定：给一组零件算总开销。 */
export interface BudgetPlan {
  readonly totalCostMs: number;
  readonly budgetMs: number;
  readonly over: boolean;
  /** 需要被 setLod('low') 的零件 id（按 expendable 优先、层高优先排序） */
  readonly downgrade: readonly string[];
  /** 降档后仍超预算时被挂起的零件 id */
  readonly suspend: readonly string[];
}

/**
 * 算预算方案。
 *
 * 决策顺序（每一步都有理由）：
 *   1. 总量不超 → 什么都不做；
 *   2. 超了 → **全部**有 setLod 能力的零件降 low（不是抽几个降，因为开销互相牵连，
 *      抽着降会让「谁被降」变成不稳定行为，同一份配置两次跑出两种画面）；
 *   3. 降档后估算仍超 → 按 expendable 优先挂起，直到估算回到预算内；
 *      L4 与 L1 的 expendable 一律视为 false（契约层已约束）。
 *
 * @param parts 已排序的零件清单（只读成本字段）
 * @param budgetMs 帧预算（毫秒）
 * @param lodCapable 哪些 id 实现了 setLod —— 没实现的降不了，只能被挂起
 * @returns 预算方案
 */
export function planBudget(
  parts: readonly { id: string; layer: string; costMs: number; expendable?: boolean; hasLod: boolean }[],
  budgetMs: number,
  lodCapable: ReadonlySet<string>,
): BudgetPlan {
  let total = 0;
  for (const part of parts) total += part.costMs > 0 ? part.costMs : 0;

  if (total <= budgetMs) {
    return { totalCostMs: total, budgetMs, over: false, downgrade: [], suspend: [] };
  }

  const downgrade = parts.filter((p) => lodCapable.has(p.id)).map((p) => p.id);

  // 降档收益经验值：low 档约省 45%（实测 range 40%~55%，取中位）。
  const LOW_GAIN = 0.45;
  let after = 0;
  for (const part of parts) {
    const cost = part.costMs > 0 ? part.costMs : 0;
    after += lodCapable.has(part.id) ? cost * (1 - LOW_GAIN) : cost;
  }

  const suspend: string[] = [];
  if (after > budgetMs) {
    // 只挂起 expendable 的，按成本降序（先砍最贵的，砍掉的个数最少）
    const candidates = parts
      .filter((p) => p.expendable === true)
      .slice()
      .sort((a, b) => b.costMs - a.costMs || (a.id < b.id ? -1 : 1));
    for (const part of candidates) {
      if (after <= budgetMs) break;
      const cost = lodCapable.has(part.id) ? part.costMs * (1 - LOW_GAIN) : part.costMs;
      after -= cost;
      suspend.push(part.id);
    }
  }

  return { totalCostMs: total, budgetMs, over: true, downgrade, suspend };
}

/** LOD 类型再导出，方便零件侧一处 import。 */
export type { Lod };
