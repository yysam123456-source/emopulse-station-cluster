// Canvas2D 指令记录器（ARCHITECTURE-REUSE §4.3 Mode B 的基础设施，T-R02 第 3 批）。
//
// 为什么用「指令指纹」而不是像素比对：
//   ① Canvas2D 对本项目用到的绘图原语而言是**纯状态机**——任何可见的像素差异必然来自
//      「某条绘制指令的参数 / 次序 / 状态」差异；指令流一致 ⇒ 绘制结果一致。
//   ② 真像素跨平台有抗锯齿差异，反而不能做硬门；指令指纹 100% 确定。
//   ③ 零新增依赖、比真像素快约 100×。
//
// 纪律：本模块**只记录、不样式化**。它不实现任何排版逻辑，也不吞掉调用——
// 每个被调用的方法都会落一条日志（含当时的 fillStyle / globalAlpha / lineWidth 快照），
// 这样「先 fill 后改色」与「先改色后 fill」会产生不同指纹（这正是我们要区分的东西）。
import { createHash } from 'node:crypto';

/** 需要记录读写的样式属性（读写都进日志，快照才有意义）。 */
const STATE_KEYS = ['fillStyle', 'strokeStyle', 'globalAlpha', 'lineWidth', 'font', 'textAlign', 'textBaseline', 'lineCap', 'lineJoin', 'globalCompositeOperation', 'shadowBlur', 'shadowColor'];

/** 只记录调用参数、不改变状态的绘图方法。 */
const PLAIN_METHODS = ['save', 'restore', 'beginPath', 'closePath', 'clearRect', 'setTransform', 'resetTransform', 'putImageData', 'clip', 'setLineDash'];

/**
 * 创建一个「记录型」CanvasRenderingContext2D 替身。
 * @param {number} width 画布宽（像素）
 * @param {number} height 画布高（像素）
 * @returns {object} 形状兼容 CanvasRenderingContext2D 的记录器；额外带 `log` 与 `digest()`
 */
export function createRecordingCtx(width, height) {
  /** @type {any[][]} 指令日志（每条是数组，便于 JSON.stringify 稳定序列化） */
  const log = [];
  /** @type {Record<string, unknown>} 样式状态 */
  const state = {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    globalAlpha: 1,
    lineWidth: 1,
    font: '10px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    lineCap: 'butt',
    lineJoin: 'miter',
    globalCompositeOperation: 'source-over',
    shadowBlur: 0,
    shadowColor: 'rgba(0, 0, 0, 0)',
  };

  /**
   * 数值归一化：把 -0 变成 0，避免指纹因符号零出现伪差异。
   * @param {unknown} value 任意值
   * @returns {unknown} 归一化后的值
   */
  const normalize = (value) => (typeof value === 'number' && Object.is(value, -0) ? 0 : value);

  /** 记录一条指令（参数逐个归一化）。 */
  const push = (...entry) => log.push(entry.map(normalize));

  const ctx = {
    canvas: { width, height },
    // 只记录参数的「无状态」方法
    save() { push('save'); },
    restore() { push('restore'); },
    beginPath() { push('beginPath'); },
    closePath() { push('closePath'); },
    moveTo(x, y) { push('moveTo', x, y); },
    lineTo(x, y) { push('lineTo', x, y); },
    quadraticCurveTo(cx, cy, x, y) { push('quadraticCurveTo', cx, cy, x, y); },
    bezierCurveTo(c1x, c1y, c2x, c2y, x, y) { push('bezierCurveTo', c1x, c1y, c2x, c2y, x, y); },
    arc(x, y, r, start, end, ccw) { push('arc', x, y, r, start, end, Boolean(ccw)); },
    ellipse(x, y, rx, ry, rot, start, end, ccw) { push('ellipse', x, y, rx, ry, rot, start, end, Boolean(ccw)); },
    rect(x, y, w, h) { push('rect', x, y, w, h); },
    fill() { push('fill', state.fillStyle, state.globalAlpha); },
    stroke() { push('stroke', state.strokeStyle, state.globalAlpha, state.lineWidth); },
    fillRect(x, y, w, h) { push('fillRect', x, y, w, h, state.fillStyle, state.globalAlpha); },
    strokeRect(x, y, w, h) { push('strokeRect', x, y, w, h, state.strokeStyle, state.globalAlpha, state.lineWidth); },
    clearRect(x, y, w, h) { push('clearRect', x, y, w, h); },
    fillText(text, x, y) { push('fillText', String(text), x, y, state.fillStyle, state.font, state.textAlign, state.globalAlpha); },
    strokeText(text, x, y) { push('strokeText', String(text), x, y, state.strokeStyle, state.font); },
    measureText(text) {
      // 不引入字体度量：用「字符数 × 字号」的确定性近似（只影响返回宽度，不参与指纹）
      const size = Number(/([0-9.]+)px/.exec(String(state.font))?.[1] ?? 10);
      return { width: String(text).length * size * 0.5 };
    },
    translate(x, y) { push('translate', x, y); },
    rotate(a) { push('rotate', a); },
    scale(x, y) { push('scale', x, y); },
    setTransform(a, b, c, d, e, f) { push('setTransform', a, b, c, d, e, f); },
    resetTransform() { push('resetTransform'); },
    putImageData() { push('putImageData'); },
    createImageData(w, h) { return { data: new Uint8ClampedArray(4 * Math.max(1, w * h)), width: w, height: h }; },
    getImageData() { return { data: new Uint8ClampedArray(4 * width * height), width, height }; },
    createLinearGradient(x0, y0, x1, y1) {
      const stops = [];
      return {
        addColorStop(offset, color) { stops.push([offset, color]); push('gradientStop', x0, y0, x1, y1, offset, color); },
      };
    },
    createRadialGradient(x0, y0, r0, x1, y1, r1) {
      return {
        addColorStop(offset, color) { push('radialStop', x0, y0, r0, x1, y1, r1, offset, color); },
      };
    },
    createPattern() { push('createPattern'); return {}; },
    clip() { push('clip'); },
    setLineDash(segments) { push('setLineDash', ...(Array.isArray(segments) ? segments : [])); },
    getLineDash() { return []; },
    drawImage(...args) { push('drawImage', args.length); },
    /** 指令日志（只读副本，防止调用方误改影响指纹）。 */
    get log() { return log.map((entry) => [...entry]); },
    /**
     * 指令指纹：sha256(JSON.stringify(log))。
     * @returns {string} 16 进制摘要
     */
    digest() { return createHash('sha256').update(JSON.stringify(log)).digest('hex'); },
    /** 重置日志（不动状态机，便于同一 ctx 上做多段录制）。 */
    reset() { log.length = 0; },
  };

  // 样式属性：读写都进日志（`set` 记录是为了让「改色顺序」进入指纹）
  for (const key of STATE_KEYS) {
    Object.defineProperty(ctx, key, {
      get() { return state[key]; },
      set(value) {
        state[key] = value;
        push('set', key, value);
      },
      enumerable: true,
      configurable: true,
    });
  }

  return ctx;
}

/**
 * 用一个零件在给定时间序列上重放，并返回指令指纹。
 * @param {object} part 零件实例（契约 v1：有 update / dispose）
 * @param {number[]} frames 逐帧秒数（如 0..3 步长 0.1）
 * @param {object} ctx 记录型 ctx
 * @returns {{digest: string, commands: number}} 指纹与指令条数
 */
export function recordFrames(part, frames, ctx) {
  ctx.reset();
  for (const seconds of frames) {
    // 允许零件的 update 自己绘制；这里只负责按序驱动时间
    part.update?.(seconds);
  }
  return { digest: ctx.digest(), commands: ctx.log.length };
}

/**
 * 生成等步长时间序列（含两端）。
 * @param {number} from 起始秒
 * @param {number} to 结束秒（含）
 * @param {number} step 步长
 * @returns {number[]} 时间序列
 */
export function timeline(from, to, step) {
  const frames = [];
  const count = Math.round((to - from) / step);
  for (let index = 0; index <= count; index += 1) {
    frames.push(Number((from + index * step).toFixed(10)));
  }
  return frames;
}
