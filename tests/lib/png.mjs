// 最小 PNG 编码器（零依赖，只用 node:zlib）。
//
// 为什么需要它：
//   本机没有 Edge/Chrome（只有 Safari，且 GUI 截图拿到的是全黑屏），所以「浏览器截图」这条路
//   在当前机器上不可用。但「零件的输出长什么样」是必须能看的东西 ——
//   否则就只能说「测试绿」，说不出「画面对不对」，那正是交接书 §8 第 3 条警告的坑。
//   本模块把零件自己产出的 RGBA 缓冲落成 PNG，于是**至少纸纹、像素化、扫描线这些
//   「像素事实」是可看的**。它证明的是「零件算出的像素」，**不是**浏览器里的观感
//   （浏览器还会做抗锯齿、颜色管理、CSS 混合）—— 两者不能混为一谈，报告里也没混。
import { deflateSync, inflateSync } from 'node:zlib';

/** CRC32 查表（PNG 规范要求）。 */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/**
 * 算一段数据的 CRC32。
 *
 * @param {Buffer} buffer 数据
 * @returns {number} CRC32
 */
function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * 组一个 PNG chunk（长度 + 类型 + 数据 + CRC）。
 *
 * @param {string} type 四字符类型
 * @param {Buffer} data 数据
 * @returns {Buffer} chunk
 */
function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuffer, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

/**
 * 把 RGBA（8 bit/通道、非预乘）编码成 PNG。
 *
 * @param {number} width 宽（像素）
 * @param {number} height 高（像素）
 * @param {Uint8ClampedArray|Uint8Array} rgba 长度必须是 width*height*4
 * @returns {Buffer} PNG 字节
 */
export function encodePng(width, height, rgba) {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  const expected = w * h * 4;
  if (!rgba || rgba.length !== expected) {
    throw new Error(`[png] 像素长度应为 ${expected}，实得 ${rgba ? rgba.length : 'null'}`);
  }

  const stride = w * 4;
  // 每行前面加一个 filter 字节（0 = None）。不做行过滤：对截图/纹理这类图压缩率足够。
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y += 1) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0;
    const src = y * stride;
    for (let i = 0; i < stride; i += 1) raw[rowStart + 1 + i] = rgba[src + i];
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type: RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// 以下为解码侧：只服务「浏览器整屏截图」的像素采样。
// ---------------------------------------------------------------------------

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/**
 * 解码 Playwright 产出的 8-bit、非隔行 PNG（RGB / RGBA / 灰度）。
 *
 * @param {Buffer} buffer PNG 字节
 * @returns {{ width:number, height:number, channels:number, data:Buffer }}
 */
export function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('不是 PNG');
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      bitDepth = body[8];
      colorType = body[9];
      interlace = body[12];
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }

  if (bitDepth !== 8) throw new Error(`只支持 8-bit PNG，实际 ${bitDepth}`);
  if (interlace !== 0) throw new Error('不支持隔行 PNG');
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 0;
  if (!channels) throw new Error(`不支持的 PNG colorType=${colorType}`);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(stride * height);
  let src = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[src++];
    const rowStart = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const value = raw[src++];
      const left = x >= channels ? out[rowStart + x - channels] : 0;
      const up = y > 0 ? out[rowStart + x - stride] : 0;
      const upLeft = y > 0 && x >= channels ? out[rowStart + x - stride - channels] : 0;
      let result = value;
      if (filter === 1) result = value + left;
      else if (filter === 2) result = value + up;
      else if (filter === 3) result = value + Math.floor((left + up) / 2);
      else if (filter === 4) result = value + paeth(left, up, upLeft);
      else if (filter !== 0) throw new Error(`未知 PNG filter=${filter}`);
      out[rowStart + x] = result & 0xff;
    }
  }

  return { width, height, channels, data: out };
}

/**
 * 对整屏截图做固定 96×96 的亮度统计，口径与 canvasStats 一致。
 *
 * @param {Buffer} buffer PNG 字节
 * @returns {{ mean:number, std:number, min:number, max:number, dark:number, grid:number[] }}
 */
export function statsFromPng(buffer) {
  const { width, height, channels, data } = decodePng(buffer);
  const GX = 96; const GY = 96;
  let sum = 0;
  let sum2 = 0;
  let min = 255;
  let max = 0;
  let dark = 0;
  const grid = [];
  for (let gy = 0; gy < GY; gy += 1) {
    const y = Math.min(height - 1, Math.floor(gy * (height - 1) / (GY - 1)));
    for (let gx = 0; gx < GX; gx += 1) {
      const x = Math.min(width - 1, Math.floor(gx * (width - 1) / (GX - 1)));
      const i = (y * width + x) * channels;
      const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      sum += lum;
      sum2 += lum * lum;
      if (lum < min) min = lum;
      if (lum > max) max = lum;
      if (lum < 60) dark += 1;
      grid.push(Math.round(lum));
    }
  }
  const n = GX * GY;
  const mean = sum / n;
  const variance = Math.max(0, sum2 / n - mean * mean);
  return {
    mean: +mean.toFixed(1),
    std: +Math.sqrt(variance).toFixed(1),
    min: +min.toFixed(1),
    max: +max.toFixed(1),
    dark,
    grid,
  };
}
