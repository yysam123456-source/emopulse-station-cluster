// L1 能力探测：无 WebGPU adapter 时如实降级（R4 / NX-Q-02 / Q-N7）。
// 纪律：探测过程绝不抛错、绝不 rethrow；探测结果只描述「能力」，不声称「渲染通过」。

/** 能力快照：mountSite / Composer / 零件三方共用的唯一能力真相源。 */
export interface Capability {
  /** 是否成功拿到 WebGPU adapter（本环境实测通常为 false，见架构 L1 已知限制） */
  adapterAvailable: boolean;
  /** 实际可用的渲染通道；'static' 表示连 Canvas2D 也不可用 */
  renderer: 'webgpu' | 'canvas2d' | 'static';
  /** 是否处于降级态（降级即如实标注，不假装成功） */
  degraded: boolean;
  /** 降级原因码：'no-webgpu-adapter' | 'no-canvas2d'，无降级时缺省 */
  reason?: string;
}

/** 站点声明的能力需求。 */
export type CapabilityRequirement = 'webgpu' | 'none';

/** navigator.gpu 的最小形状（避免依赖具体渲染器实现）。 */
interface GpuLike {
  requestAdapter?: (options?: Record<string, unknown>) => Promise<unknown>;
}

/** 探测过程中可能出现的全局对象（全部按可选处理，缺一个不许抛错）。 */
interface ProbeScope {
  navigator?: { gpu?: GpuLike };
  document?: {
    createElement?: (tag: string) => CanvasLike | null;
  };
}

interface CanvasLike {
  getContext?: (contextId: string) => unknown;
}

/** 读取全局探测作用域。 */
function probeScope(): ProbeScope {
  return globalThis as unknown as ProbeScope;
}

/** 检测 Canvas2D 是否可用（无 document 时视为不可用，不抛错）。 */
export function hasCanvas2D(): boolean {
  try {
    const scope = probeScope();
    const create = scope.document?.createElement;
    if (typeof create !== 'function') return false;
    const canvas = create.call(scope.document, 'canvas');
    if (!canvas || typeof canvas.getContext !== 'function') return false;
    return Boolean(canvas.getContext('2d'));
  } catch {
    return false;
  }
}

/** 请求 WebGPU adapter（任何异常都归一为「无 adapter」，绝不向上抛）。 */
async function requestAdapter(): Promise<unknown | null> {
  try {
    const gpu = probeScope().navigator?.gpu;
    if (!gpu || typeof gpu.requestAdapter !== 'function') return null;
    const adapter = await gpu.requestAdapter();
    return adapter ?? null;
  } catch {
    return null;
  }
}

/**
 * 能力探测。
 * - requires === 'none'：新站主视觉本就是 Canvas 2D 等效实现，只要有 2D 上下文即非降级；
 * - requires === 'webgpu'：尽力请求 adapter，失败则退到 Canvas2D 并标 degraded + reason。
 */
export async function probeCapability(requires: CapabilityRequirement = 'none'): Promise<Capability> {
  const canvas2d = hasCanvas2D();

  if (requires !== 'webgpu') {
    if (canvas2d) return { adapterAvailable: false, renderer: 'canvas2d', degraded: false };
    return { adapterAvailable: false, renderer: 'static', degraded: true, reason: 'no-canvas2d' };
  }

  const adapter = await requestAdapter();
  if (adapter) return { adapterAvailable: true, renderer: 'webgpu', degraded: false };
  if (canvas2d) return { adapterAvailable: false, renderer: 'canvas2d', degraded: true, reason: 'no-webgpu-adapter' };
  return { adapterAvailable: false, renderer: 'static', degraded: true, reason: 'no-webgpu-adapter' };
}

/** 缺省能力快照（未知环境下的保守值：静态 + 降级，不谎称可用）。 */
export function staticCapability(reason = 'no-canvas2d'): Capability {
  return { adapterAvailable: false, renderer: 'static', degraded: true, reason };
}
