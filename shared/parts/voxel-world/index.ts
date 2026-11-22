// voxel-world —— L1 世界零件（GL 通道，整场唯一那块画布）。
//
// 引擎本体不在这里：它由 build-engine.mjs 从共享基线 shared/core/src/{quality,math,shaders,world,main,audio}.js
// 抄写（19 条具名补丁）生成 engine.js。基线字节未动，溯源见 docs/VOXEL-AS-PART.md。
//
// 与契约的三处关键对账：
//   1. 时钟只用 frame.t（stage 的 rAF）；引擎内部 `requestAnimationFrame(frame)` 已摘掉（补丁 11）。
//   2. 指针只用 frame.pointer，折算成引擎认的像素位移喂给 look()；不抢指针锁定（补丁 12/13/14）。
//   3. setLod('low') 真的少画像素：内部渲染缩放 1 → 0.6，dpr 上限 2 → 1（见 LOD 表）。
import type {
  Lod,
  PartEnv,
  PartInstance,
  PartV2,
  StageSize,
  WorldFrame,
} from '../../stage/contract';
import { createVoxelEngine } from './engine.js';

/** 引擎交出的控制面（engine.js 无类型声明，这里显式收口，避免 any 漫进零件）。 */
interface VoxelEngine {
  /** 画一帧；`nowMs` 用 stage 的时钟（毫秒） */
  render(nowMs: number): void;
  /** 视角位移（引擎单位：像素，内部 ×0.0022 rad） */
  look(dxPx: number, dyPx: number): void;
  /** 平移：前/侧/升，-1..1 */
  move(forward: number, strafe: number, rise: number): void;
  boost(on: boolean): void;
  /** 跳到预设视角 */
  setView(x: number, y: number, z: number, tx: number, ty: number, tz: number): void;
  /** 布局：CSS 尺寸 + dpr（内部像素 = CSS × dpr） */
  layout(cssW: number, cssH: number, dpr: number): void;
  /** 内部渲染缩放（LOD） */
  setScale(scale: number): void;
  readbackSize(): { W: number; H: number; DW: number; DH: number; level: number; gpu: number };
  /** 释放 GL 设备与渲染目标；重复调用安全 */
  dispose(): void;
}

/** 画质档位对应的真实参数（不是形容词）。 */
const LOD: Readonly<Record<Lod, { dprCap: number; scale: number }>> = {
  // high：设备 dpr 夹到 2，内部缩放 1（引擎自己的动态分辨率仍在 PIXMAX 内浮动）
  high: { dprCap: 2, scale: 1 },
  // low：dpr 夹到 1，内部再乘 0.6 —— 1080p@dpr2 的像素量降到约 1/6.7
  low: { dprCap: 1, scale: 0.6 },
};

/** 指针位移增益：stage 给的是归一化位移，乘回 CSS 宽度后与引擎原本的鼠标输入同量纲。 */
const POINTER_GAIN = 1;

/** 静止时的缓慢自转（像素/帧@60fps，约 0.024 rad/s），reducedMotion 时关掉。 */
const IDLE_DRIFT_PX = 0.18;

/** 供 bench 读的实测口径（仅诊断用，装配器不依赖它）。 */
export interface VoxelTelemetry {
  readonly ready: boolean;
  readonly error: string | null;
  /** 平滑后的单帧 CPU 毫秒（只算 render 调用本身） */
  readonly drawMs: number;
  readonly draws: number;
  readonly scale: number;
  readonly lod: Lod;
  readonly render: { w: number; h: number; level: number } | null;
  /** 创建到首帧完成耗时（毫秒），启动成本的唯一可信来源 */
  readonly bootMs: number;
  /** 引擎当前的构建阶段（加载态文案；未就绪时驱动 bench 用来看进度） */
  readonly progress: string;
}

let telemetry: VoxelTelemetry = {
  ready: false,
  error: null,
  drawMs: 0,
  draws: 0,
  scale: 1,
  lod: 'high',
  render: null,
  bootMs: 0,
  progress: '',
};

/** 引擎最近一次上报的构建阶段（onProgress）。 */
let lastProgress = '';

/**
 * 读最近一个实例的实测数据（bench.mjs / 证明页用）。
 *
 * 只保留「最近一个」是刻意的：一个舞台只有一个 GL 通道零件，
 * 多实例同时存在只可能是测试，这时读到的值本来就该是最后一次。
 *
 * @returns 当前遥测快照
 */
export function voxelTelemetry(): Readonly<VoxelTelemetry> {
  return { ...telemetry, progress: lastProgress };
}

/** 单调时钟（Node 里也有 performance，兜底 Date.now）。 */
function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

/**
 * 世界零件。
 *
 * 构造是**异步**的（WebGPU adapter/device + 20M 体素的世界生成），但契约要求同步返回实例，
 * 所以这里立刻返回一个「未就绪则不画」的实例：draw() 在就绪前是空操作，绝不画半张。
 */
export const part: PartV2 = {
  id: 'voxel-world',
  layer: 'L1',
  channel: 'gl',
  blend: 'source-over',
  // 世界是画面的地基，超预算也只能降档，不能挂起。
  expendable: false,
  // 引擎走 WebGPU（navigator.gpu + adapter + device），不是 WebGL2：
  // 见 shared/core/src/main.js:19 `if (!navigator.gpu) fail(...)`，全篇 getContext('webgpu')。
  requires: ['webgpu'],
  // ★ 旧值 0.05ms 是**假数**：它只计了 JS 调用，没计 GPU。实测 1280×800@dpr2
  //   在 M2 上 22.7fps（≈44ms/帧），是四站里唯一真正的瓶颈。现在按实测填 9ms，
  //   /still 的 12ms 预算会让它和 post 一起降到 low（dpr 1 + 内部 0.6）。
  costMs: 9,
  kb: 0,
  create(env: PartEnv): PartInstance {
    let engine: VoxelEngine | null = null;
    let disposed = false;
    let error: string | null = null;
    let lod: Lod = env.lod;
    let size: StageSize = { w: env.width, h: env.height, dpr: env.dpr };
    let lastX = 0.5;
    let lastY = 0.5;
    let sawPointer = false;
    let smoothMs = 0;
    let draws = 0;
    const bootStart = nowMs();
    /** 默认视角（引擎 POSES[0]）与「坐下」近景（POSES[9]）。 */
    const BASE_POSE = [-16, -37, -84, 0, -22, -108] as const;
    const SIT_POSE = [-6, -39.2, 44.5, 4, -37, 70] as const;
    let currentPose: number[] = BASE_POSE.slice();
    let glide: { from: number[]; to: number[]; t: number; dur: number } | null = null;

    telemetry = {
      ready: false,
      error: null,
      drawMs: 0,
      draws: 0,
      scale: LOD[lod].scale,
      lod,
      render: null,
      bootMs: 0,
      progress: '',
    };
    lastProgress = '';

    /** 把当前 size + LOD 落到引擎上；引擎未就绪时是空调用。 */
    const applyLayout = (): void => {
      if (!engine) return;
      const cfg = LOD[lod];
      const dpr = Math.min(size.dpr > 0 ? size.dpr : 1, cfg.dprCap);
      engine.setScale(cfg.scale);
      engine.layout(size.w, size.h, dpr);
    };

    void (async () => {
      try {
        const api = (await createVoxelEngine({
          canvas: env.canvas,
          width: size.w,
          height: size.h,
          dpr: Math.min(size.dpr > 0 ? size.dpr : 1, LOD[lod].dprCap),
          // 站群形态：不接管键盘/指针锁定/音频，首屏 UI 不存在（$ 会拿到惰性桩）。
          input: false,
          pointerLock: false,
          audio: false,
          // lod=low 直接从低档起步：LV=2 关掉 4x MSAA、阴影 2048、光柱 12 步
          level: env.lod === 'low' ? 2 : undefined,
          onProgress: (_to: number, message: string) => {
            lastProgress = message;
          },
          onLost: (reason: string) => {
            error = `device lost: ${reason}`;
            // 异步设备丢失：装配器要能从 degraded 里看到，而不是只看到「还剩一层水」。
            env.onError?.(error);
          },
        })) as VoxelEngine;

        if (disposed) {
          // 构造还没完就 dispose 了：把刚建起来的 GL 设备立刻拆掉，别漏。
          api.dispose();
          return;
        }
        engine = api;
        applyLayout();
        telemetry = {
          ...telemetry,
          ready: true,
          scale: LOD[lod].scale,
          render: readRender(),
          bootMs: nowMs() - bootStart,
        };
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        telemetry = { ...telemetry, error };
        env.onError?.(error);
      }
    })();

    /** 引擎内部真实渲染尺寸（证明 LOD 真的生效）。 */
    function readRender(): { w: number; h: number; level: number } | null {
      if (!engine) return null;
      const r = engine.readbackSize();
      return { w: r.W, h: r.H, level: r.level };
    }

    return {
      draw(frame: WorldFrame): void {
        if (disposed || !engine) return;
        const started = nowMs();
        const p = frame.pointer;
        if (glide) {
          glide.t += frame.dt;
          const k = Math.min(1, glide.t / glide.dur);
          // easeInOutCubic：起步和落座都慢，中间快 —— 像人坐下，不像镜头瞬移
          const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
          for (let i = 0; i < 6; i += 1) {
            currentPose[i] = glide.from[i]! + (glide.to[i]! - glide.from[i]!) * e;
          }
          engine.setView(currentPose[0]!, currentPose[1]!, currentPose[2]!, currentPose[3]!, currentPose[4]!, currentPose[5]!);
          if (k >= 1) glide = null;
          lastX = p.x;
          lastY = p.y;
          sawPointer = true;
          engine.render(frame.t * 1000);
          const ms = nowMs() - started;
          smoothMs = draws === 0 ? ms : smoothMs * 0.9 + ms * 0.1;
          draws += 1;
          telemetry = { ...telemetry, drawMs: smoothMs, draws, error };
          return;
        }
        if (sawPointer) {
          const dx = (p.x - lastX) * frame.size.w * POINTER_GAIN;
          const dy = (p.y - lastY) * frame.size.h * POINTER_GAIN;
          if (dx !== 0 || dy !== 0) engine.look(dx, dy);
        }
        lastX = p.x;
        lastY = p.y;
        sawPointer = true;
        if (!frame.reducedMotion && !p.down) engine.look(IDLE_DRIFT_PX * frame.dt * 60, 0);
        engine.render(frame.t * 1000);
        const ms = nowMs() - started;
        smoothMs = draws === 0 ? ms : smoothMs * 0.9 + ms * 0.1;
        draws += 1;
        telemetry = {
          ...telemetry,
          drawMs: smoothMs,
          draws,
          render: draws % 30 === 0 ? readRender() : telemetry.render,
          error,
        };
      },

      update(): void {
        // 引擎的世界时钟跟着 frame.t 走，见 draw()；这里没有独立状态要推进。
      },

      resize(next: StageSize): void {
        size = next;
        applyLayout();
      },

      setLod(next: Lod): void {
        if (lod === next) return;
        lod = next;
        telemetry = { ...telemetry, lod, scale: LOD[lod].scale };
        applyLayout();
      },

      cue(verb: string): void {
        if (disposed) return;
        if (verb === 'sit') {
          glide = { from: currentPose.slice(), to: SIT_POSE.slice(), t: 0, dur: 2.4 };
        } else if (verb === 'stand' || verb === 'reset') {
          glide = { from: currentPose.slice(), to: BASE_POSE.slice(), t: 0, dur: 2.4 };
        }
      },

      readiness(): number {
        // 未就绪=0（壳保持 boot 遮罩）；失败=1（让 tide 底材露出来，不能让用户看黑屏）
        return engine ? 1 : (error ? 1 : 0);
      },

      dispose(): void {
        if (disposed) return;
        disposed = true;
        const api = engine;
        engine = null;
        telemetry = { ...telemetry, ready: false };
        try {
          api?.dispose();
        } catch {
          // 重复 dispose / 设备已丢：不许阻断装配器的逆序释放
        }
      },
    };
  },
};

export default part;
