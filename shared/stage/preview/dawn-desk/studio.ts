// dawn-desk / studio —— 预览专用“清晨签发台”场景。
//
// 这里不是上游 room-at-dawn 的拼装，而是为 license-desk 重新做的一间小书房：
// 胡桃木写字台、深绿皮革桌垫、黄铜台灯、陶盆绿植、亚麻窗帘、低窗与晨雾远山。
//
// 拆件来源与边界：
// - summer-cycle（MIT）：叶簇图集的画法与“色相分层 + 叶脉 + 暗边”的植物语法；
// - tidewater（MIT）：窗光/局部灯的亮度关系与“近处暖、远处冷”的室内空气感；
// - qingming-riverside（未授权复用）：只参考“雾、岸线、纸感”的空间层次，不复制代码/素材；
// - gpt6-Astra_3.js / Claude-Fable（未授权复用）：只参考低多边形器物的比例与暖木配色。
// 代码本身是按本仓库的 three 栈重写的，不直接把第三方模块塞进 shared/parts。
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { WINDOW_PHOTO_DATA_URL } from './window-photo';
import { LEAF_ATLAS_DATA_URL } from './leaf-atlas';

/** 桌面高度：纸、印章、文件盘都落在这一层。 */
export const DESK_Y = 0.742;

/** 纸下的皮革桌垫比桌面高 3.5mm；纸再高 0.5mm。 */
export const BLOTTER_Y = DESK_Y + 0.0035;
export const PAPER_Y = BLOTTER_Y + 0.0005;

interface StudioStats {
  readonly meshes: number;
  readonly tris: number;
}

export interface Studio {
  readonly scene: THREE.Scene;
  readonly animated: Array<(time: number) => void>;
  readonly breakdown: Record<string, StudioStats>;
  readonly glass: THREE.Material;
  readonly lampBulb: THREE.Mesh;
}

type Ctx2D = CanvasRenderingContext2D;

const TAU = Math.PI * 2;

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function canvas(w: number, h: number, paint: (g: Ctx2D, w: number, h: number) => void): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (g) paint(g, w, h);
  return c;
}

export function texture(
  source: HTMLCanvasElement,
  repeatX = 1,
  repeatY = 1,
  anisotropy = 4,
): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(source);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = anisotropy;
  t.needsUpdate = true;
  return t;
}

/** 粗糙度/凹凸/法线这类数据贴图不能按 sRGB 解码，否则金属和皮革会发灰。 */
export function dataTexture(
  source: HTMLCanvasElement,
  repeatX = 1,
  repeatY = 1,
  anisotropy = 4,
): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(source);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = anisotropy;
  t.needsUpdate = true;
  return t;
}

function paintDot(size: number): HTMLCanvasElement {
  return canvas(size, size, (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grad.addColorStop(0, 'rgba(255,255,255,.95)');
    grad.addColorStop(0.18, 'rgba(255,255,255,.72)');
    grad.addColorStop(0.52, 'rgba(255,255,255,.18)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

function paintContactShadow(size = 256, soft = 0.72): HTMLCanvasElement {
  return canvas(size, size, (g, w, h) => {
    const rnd = mulberry(5101);
    g.clearRect(0, 0, w, h);
    const grad = g.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, w * 0.5);
    grad.addColorStop(0, `rgba(10,8,6,${soft})`);
    grad.addColorStop(0.32, `rgba(12,9,7,${soft * 0.72})`);
    grad.addColorStop(0.68, `rgba(14,10,8,${soft * 0.24})`);
    grad.addColorStop(1, 'rgba(14,10,8,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 500; i += 1) {
      const a = rnd() * 0.035;
      g.fillStyle = `rgba(255,244,224,${a})`;
      g.fillRect(rnd() * w, rnd() * h, 1, 1);
    }
  });
}

function paintPlantWallShadow(w: number, h: number): HTMLCanvasElement {
  return canvas(w, h, (g) => {
    const rnd = mulberry(7013);
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 40; i += 1) {
      const x = w * (0.28 + rnd() * 0.44);
      const y = h * (0.18 + rnd() * 0.66);
      const r = 6 + rnd() * 34;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(28,22,16,${0.07 + rnd() * 0.12})`);
      grad.addColorStop(0.62, 'rgba(28,22,16,.035)');
      grad.addColorStop(1, 'rgba(28,22,16,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
    }
  });
}

function paintShaft(w: number, h: number): HTMLCanvasElement {
  return canvas(w, h, (g) => {
    g.clearRect(0, 0, w, h);
    const across = g.createLinearGradient(0, 0, w, 0);
    across.addColorStop(0, 'rgba(255,228,183,0)');
    across.addColorStop(0.16, 'rgba(255,230,189,.26)');
    across.addColorStop(0.5, 'rgba(255,236,201,.46)');
    across.addColorStop(0.84, 'rgba(255,230,189,.22)');
    across.addColorStop(1, 'rgba(255,228,183,0)');
    g.fillStyle = across;
    g.fillRect(0, 0, w, h);
    const down = g.createLinearGradient(0, 0, 0, h);
    down.addColorStop(0, 'rgba(255,255,255,.92)');
    down.addColorStop(0.28, 'rgba(255,255,255,.52)');
    down.addColorStop(0.66, 'rgba(255,255,255,.14)');
    down.addColorStop(1, 'rgba(255,255,255,0)');
    g.globalCompositeOperation = 'destination-in';
    g.fillStyle = down;
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
  });
}

function paintFrost(w: number, h: number): HTMLCanvasElement {
  return canvas(w, h, (g) => {
    const rnd = mulberry(9901);
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 1600; i += 1) {
      const x = rnd() * w;
      const y = rnd() * h;
      const edge = Math.min(x, w - x, y, h - y) / Math.min(w, h);
      if (edge > 0.18 && rnd() > 0.22) continue;
      const r = 0.4 + rnd() * 2.4;
      g.fillStyle = `rgba(239,245,239,${0.03 + rnd() * 0.12})`;
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
    }
    // 两条很淡的擦痕，像有人从这里向外看过。
    for (const [x0, y0, x1, y1] of [[w * 0.28, h * 0.2, w * 0.42, h * 0.58], [w * 0.58, h * 0.16, w * 0.48, h * 0.5]] as const) {
      const grad = g.createLinearGradient(x0, y0, x1, y1);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.5, 'rgba(255,255,255,.035)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.strokeStyle = grad;
      g.lineWidth = 8;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
    }
  });
}

function paintEnvironment(w: number, h: number): HTMLCanvasElement {
  return canvas(w, h, (g) => {
    const rnd = mulberry(1211);
    const sky = g.createLinearGradient(0, 0, 0, h * 0.56);
    sky.addColorStop(0, '#8fa9b2');
    sky.addColorStop(0.5, '#b6c2be');
    sky.addColorStop(0.78, '#dfc5a1');
    sky.addColorStop(1, '#d8bfa0');
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h * 0.56);
    // 房间下半球：墙、木地板和一块窗光。只用来给金属/玻璃提供反射方向。
    const room = g.createLinearGradient(0, h * 0.54, 0, h);
    room.addColorStop(0, '#b9aa92');
    room.addColorStop(0.45, '#8f765d');
    room.addColorStop(0.62, '#6d513a');
    room.addColorStop(1, '#30241b');
    g.fillStyle = room;
    g.fillRect(0, h * 0.54, w, h * 0.46);
    const pane = g.createLinearGradient(w * 0.38, h * 0.22, w * 0.55, h * 0.58);
    pane.addColorStop(0, 'rgba(255,247,219,.92)');
    pane.addColorStop(0.55, 'rgba(255,224,171,.42)');
    pane.addColorStop(1, 'rgba(255,214,155,0)');
    g.fillStyle = pane;
    g.fillRect(w * 0.34, h * 0.2, w * 0.2, h * 0.42);
    for (let i = 0; i < 4; i += 1) {
      const x = w * (0.36 + i * 0.04);
      g.fillStyle = 'rgba(66,70,59,.35)';
      g.fillRect(x, h * 0.2, 2, h * 0.3);
    }
    // 暖色分布，反射到黄铜上不会是一块死灰。
    for (let i = 0; i < 18; i += 1) {
      const x = rnd() * w;
      const y = h * (0.12 + rnd() * 0.38);
      const r = 12 + rnd() * 80;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(255,236,198,${0.08 + rnd() * 0.14})`);
      grad.addColorStop(1, 'rgba(255,236,198,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
    }
  });
}

export function paintLinen(w: number, h: number): HTMLCanvasElement {
  return canvas(w, h, (g) => {
    const rnd = mulberry(818);
    g.fillStyle = '#cbbda7';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 14000; i += 1) {
      g.fillStyle = rnd() > 0.5 ? `rgba(249,241,223,${0.01 + rnd() * 0.03})` : `rgba(73,61,45,${0.008 + rnd() * 0.024})`;
      g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 3, 0.6 + rnd() * 1.2);
    }
    for (let x = 0; x < w; x += 5) {
      g.fillStyle = 'rgba(60,50,37,.045)';
      g.fillRect(x, 0, 1, h);
    }
    for (let y = 0; y < h; y += 4) {
      g.fillStyle = 'rgba(250,242,224,.055)';
      g.fillRect(0, y, w, 1);
    }
  });
}

function paintBookCloth(w: number, h: number, base: string): HTMLCanvasElement {
  return canvas(w, h, (g) => {
    const rnd = mulberry(base.length + 55);
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    // 先压大块的旧色差，再画织线；不然布面是一块平色。
    for (let i = 0; i < 16; i += 1) {
      const x = rnd() * w;
      const y = rnd() * h;
      const r = w * (0.08 + rnd() * 0.25);
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, rnd() > 0.5 ? `rgba(255,238,204,${0.035 + rnd() * 0.06})` : `rgba(12,12,9,${0.035 + rnd() * 0.08})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
    }
    // 经纬织纹：一条亮、一条暗，间距 3px；再叠一点不规则的纱线。
    for (let x = 0; x < w; x += 3) {
      g.fillStyle = `rgba(245,233,210,${0.02 + rnd() * 0.035})`;
      g.fillRect(x, 0, 0.7, h);
      g.fillStyle = `rgba(8,10,8,${0.02 + rnd() * 0.03})`;
      g.fillRect(x + 1.4, 0, 0.55, h);
    }
    for (let y = 0; y < h; y += 3) {
      g.fillStyle = `rgba(245,233,210,${0.018 + rnd() * 0.03})`;
      g.fillRect(0, y, w, 0.7);
      g.fillStyle = `rgba(8,10,8,${0.018 + rnd() * 0.032})`;
      g.fillRect(0, y + 1.4, w, 0.5);
    }
    for (let i = 0; i < 4200; i += 1) {
      g.fillStyle = rnd() > 0.5 ? `rgba(255,246,224,${0.008 + rnd() * 0.025})` : `rgba(10,10,8,${0.008 + rnd() * 0.03})`;
      g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 3.5, 0.4 + rnd() * 1.1);
    }
    // 四角磨白/磨旧，布面书角不会像塑料。
    for (const [cx, cy] of [[0, 0], [w, 0], [0, h], [w, h]] as const) {
      const grad = g.createRadialGradient(cx, cy, 0, cx, cy, w * 0.16);
      grad.addColorStop(0, `rgba(232,216,187,${0.10 + rnd() * 0.10})`);
      grad.addColorStop(1, 'rgba(232,216,187,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(cx, cy, w * 0.16, 0, TAU);
      g.fill();
    }
  });
}

function paintBookClothHeight(w: number, h: number): HTMLCanvasElement {
  return canvas(w, h, (g) => {
    const rnd = mulberry(6144);
    g.fillStyle = '#808080';
    g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 3) {
      g.fillStyle = `rgba(255,255,255,${0.14 + rnd() * 0.12})`;
      g.fillRect(x, 0, 1, h);
    }
    for (let y = 0; y < h; y += 3) {
      g.fillStyle = `rgba(0,0,0,${0.12 + rnd() * 0.12})`;
      g.fillRect(0, y, w, 1);
    }
    for (let i = 0; i < 900; i += 1) {
      g.fillStyle = `rgba(${rnd() > 0.5 ? 255 : 0},${rnd() > 0.5 ? 255 : 0},${rnd() > 0.5 ? 255 : 0},${0.04 + rnd() * 0.06})`;
      g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 3, 1 + rnd() * 2);
    }
  });
}

function paintBookPlate(w: number, h: number, title: string): HTMLCanvasElement {
  return canvas(w, h, (g) => {
    g.clearRect(0, 0, w, h);
    const gold = g.createLinearGradient(0, 0, w, h);
    gold.addColorStop(0, '#8e672f');
    gold.addColorStop(0.35, '#e6c486');
    gold.addColorStop(0.62, '#b88a45');
    gold.addColorStop(1, '#f1d59a');
    g.strokeStyle = gold;
    g.lineWidth = Math.max(2, w * 0.012);
    g.strokeRect(w * 0.075, h * 0.09, w * 0.85, h * 0.82);
    g.lineWidth = Math.max(1, w * 0.004);
    g.strokeRect(w * 0.095, h * 0.115, w * 0.81, h * 0.77);
    // 四角小钉/角花。
    for (const [x, y] of [[0.095, 0.115], [0.905, 0.115], [0.095, 0.885], [0.905, 0.885]] as const) {
      g.save();
      g.translate(w * x, h * y);
      g.rotate(Math.PI / 4);
      g.fillStyle = gold;
      g.fillRect(-w * 0.012, -w * 0.012, w * 0.024, w * 0.024);
      g.restore();
    }
    g.fillStyle = gold;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `700 ${Math.round(w * 0.112)}px Georgia, "Times New Roman", serif`;
    g.save();
    g.shadowColor = 'rgba(49,31,17,.45)';
    g.shadowBlur = w * 0.008;
    g.shadowOffsetY = w * 0.006;
    g.fillText(title, w / 2, h * 0.44, w * 0.76);
    g.restore();
    g.font = `italic ${Math.round(w * 0.050)}px Georgia, "Times New Roman", serif`;
    g.fillStyle = 'rgba(241,213,154,.92)';
    g.fillText('PERMIT OFFICE · FIRST LIGHT', w / 2, h * 0.60);
    // 压金磨损：少量细横线。
    const rnd = mulberry(title.length * 19 + 3);
    for (let i = 0; i < 120; i += 1) {
      g.fillStyle = `rgba(255,236,187,${0.02 + rnd() * 0.05})`;
      g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 8, 0.6);
    }
  });
}


/** 行李牌：磨旧的奶油卡纸 + 钢印编号，远看只有一厘米宽，近看要有字。 */
function paintKeyTag(w: number, h: number): HTMLCanvasElement {
  return canvas(w, h, (g) => {
    const rnd = mulberry(8123);
    g.fillStyle = '#d8c7a9';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 600; i += 1) {
      g.fillStyle = rnd() > 0.5 ? 'rgba(255,246,226,.04)' : 'rgba(87,66,46,.04)';
      g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 3, 1);
    }
    g.strokeStyle = 'rgba(63,45,30,.55)';
    g.lineWidth = Math.max(1, w * 0.012);
    g.strokeRect(w * 0.06, h * 0.05, w * 0.88, h * 0.90);
    g.fillStyle = '#4b3626';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `600 ${Math.round(w * 0.14)}px Georgia, serif`;
    g.fillText('FIRST LIGHT', w / 2, h * 0.28, w * 0.80);
    g.font = `500 ${Math.round(w * 0.10)}px Georgia, serif`;
    g.fillText('PERMIT OFFICE', w / 2, h * 0.40, w * 0.80);
    g.strokeStyle = 'rgba(66,48,32,.55)';
    g.lineWidth = Math.max(1, w * 0.006);
    g.beginPath();
    g.moveTo(w * 0.14, h * 0.50);
    g.lineTo(w * 0.86, h * 0.50);
    g.stroke();
    g.font = `700 ${Math.round(w * 0.18)}px Georgia, serif`;
    g.fillText('NO. 0881', w / 2, h * 0.66);
    g.font = `italic ${Math.round(w * 0.075)}px Georgia, serif`;
    g.fillStyle = 'rgba(63,45,30,.72)';
    g.fillText('issued at first light', w / 2, h * 0.82);
    // 边角磨脏，卡片不是刚打印出来的。
    g.fillStyle = 'rgba(77,55,36,.12)';
    g.beginPath();
    g.arc(0, h, w * 0.22, 0, TAU);
    g.fill();
    g.beginPath();
    g.arc(w, 0, w * 0.18, 0, TAU);
    g.fill();
  });
}
function paintEndband(w: number, h: number): HTMLCanvasElement {
  return canvas(w, h, (g) => {
    g.fillStyle = '#d9c59c';
    g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 8) {
      g.fillStyle = x % 16 === 0 ? 'rgba(102,45,34,.9)' : 'rgba(236,219,185,.9)';
      g.fillRect(x, 0, 4, h);
    }
  });
}

export function paintPageEdges(w: number, h: number): HTMLCanvasElement {
  return canvas(w, h, (g) => {
    const rnd = mulberry(778);
    g.fillStyle = '#d5c4a6';
    g.fillRect(0, 0, w, h);
    // 纸张边缘有厚薄：一条条细页，不是均匀的横纹布。
    for (let y = 0; y < h; y += 1.6) {
      const a = 0.035 + rnd() * 0.13;
      g.fillStyle = `rgba(82,62,42,${a})`;
      g.fillRect(0, y + (rnd() - 0.5) * 0.6, w, 0.35 + rnd() * 0.65);
    }
    for (let i = 0; i < 500; i += 1) {
      g.fillStyle = `rgba(255,247,226,${0.02 + rnd() * 0.07})`;
      g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 5, 0.7);
    }
    // 靠近封面的一端更暗，像被压住；中段留一点纸的暖白。
    const top = g.createLinearGradient(0, 0, 0, h);
    top.addColorStop(0, 'rgba(70,49,32,.22)');
    top.addColorStop(0.12, 'rgba(70,49,32,0)');
    top.addColorStop(0.88, 'rgba(70,49,32,0)');
    top.addColorStop(1, 'rgba(70,49,32,.18)');
    g.fillStyle = top;
    g.fillRect(0, 0, w, h);
    // 少量霉点/指纹，近看不是一张干净打印纸。
    for (let i = 0; i < 50; i += 1) {
      g.fillStyle = `rgba(104,72,42,${0.01 + rnd() * 0.035})`;
      g.beginPath();
      g.arc(rnd() * w, rnd() * h, 0.5 + rnd() * 1.8, 0, TAU);
      g.fill();
    }
  });
}

export function paintInkFelt(w: number, h: number): HTMLCanvasElement {
  return canvas(w, h, (g) => {
    const rnd = mulberry(3311);
    // 中心吸饱印泥、边缘发干；不是一块均匀红塑料。
    const grad = g.createRadialGradient(w * 0.52, h * 0.48, 0, w * 0.52, h * 0.48, w * 0.68);
    grad.addColorStop(0, '#a33428');
    grad.addColorStop(0.45, '#8c2a22');
    grad.addColorStop(0.78, '#68201b');
    grad.addColorStop(1, '#421512');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    // 绒布纤维/压实痕。
    for (let i = 0; i < 14000; i += 1) {
      g.fillStyle = rnd() > 0.55 ? `rgba(240,136,111,${0.008 + rnd() * 0.025})` : `rgba(42,7,5,${0.01 + rnd() * 0.03})`;
      g.fillRect(rnd() * w, rnd() * h, 0.5 + rnd() * 1.6, 0.4 + rnd() * 1.2);
    }
    for (let i = 0; i < 8; i += 1) {
      const x = rnd() * w;
      const y = rnd() * h;
      const r = 8 + rnd() * 42;
      const blot = g.createRadialGradient(x, y, 0, x, y, r);
      blot.addColorStop(0, `rgba(49,8,6,${0.10 + rnd() * 0.16})`);
      blot.addColorStop(0.7, 'rgba(49,8,6,.05)');
      blot.addColorStop(1, 'rgba(49,8,6,0)');
      g.fillStyle = blot;
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
    }
    // 压印留下的圆形淡痕。
    g.strokeStyle = 'rgba(55,10,8,.18)';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(w * 0.52, h * 0.49, w * 0.37, 0, TAU);
    g.stroke();
  });
}

export function paintStampDie(w: number, h: number): HTMLCanvasElement {
  return canvas(w, h, (g) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#3b0e0b';
    g.beginPath();
    g.arc(w / 2, h / 2, w * 0.47, 0, TAU);
    g.fill();
    g.strokeStyle = '#6d1912';
    g.lineWidth = Math.max(2, w * 0.024);
    g.beginPath();
    g.arc(w / 2, h / 2, w * 0.40, 0, TAU);
    g.stroke();
    g.save();
    g.translate(w / 2, h / 2);
    g.scale(-1, 1); // 橡皮章的字是反的。
    g.fillStyle = '#b24a38';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `700 ${Math.round(w * 0.13)}px Georgia, serif`;
    g.fillText('APPROVED', 0, 0, w * 0.66);
    g.font = `600 ${Math.round(w * 0.075)}px Georgia, serif`;
    g.fillText('NO COPY KEPT', 0, h * 0.19, w * 0.60);
    g.restore();
  });
}

export function paintEnvelope(w: number, h: number): HTMLCanvasElement {
  return canvas(w, h, (g) => {
    const rnd = mulberry(4812);
    g.fillStyle = '#d7c5a7';
    g.fillRect(0, 0, w, h);
    // 纸张的纤维和旧痕。
    for (let i = 0; i < 1300; i += 1) {
      g.fillStyle = rnd() > 0.5 ? `rgba(255,247,226,${0.012 + rnd() * 0.05})` : `rgba(87,64,42,${0.008 + rnd() * 0.035})`;
      g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 5, 0.5 + rnd() * 1.4);
    }
    // 信封折线：中间横折、两侧斜折。
    g.strokeStyle = 'rgba(88,64,41,.26)';
    g.lineWidth = Math.max(1, w * 0.003);
    g.beginPath();
    g.moveTo(0, h * 0.47);
    g.lineTo(w, h * 0.47);
    g.stroke();
    g.beginPath();
    g.moveTo(0, h * 0.47);
    g.lineTo(w * 0.44, h * 0.72);
    g.lineTo(w, h * 0.47);
    g.stroke();
    // 地址线与邮戳。
    g.strokeStyle = 'rgba(72,51,34,.35)';
    g.lineWidth = Math.max(1, w * 0.004);
    for (let i = 0; i < 4; i += 1) {
      const y = h * (0.56 + i * 0.07);
      g.beginPath();
      g.moveTo(w * 0.12, y);
      g.lineTo(w * (0.52 + (i === 3 ? 0.12 : 0)), y);
      g.stroke();
    }
    g.save();
    g.translate(w * 0.78, h * 0.25);
    g.rotate(-0.12);
    g.strokeStyle = 'rgba(105,64,49,.30)';
    g.lineWidth = Math.max(1, w * 0.005);
    g.beginPath();
    g.arc(0, 0, w * 0.09, 0, TAU);
    g.stroke();
    g.beginPath();
    g.arc(0, 0, w * 0.055, 0, TAU);
    g.stroke();
    g.font = `italic ${Math.round(w * 0.028)}px Georgia, serif`;
    g.fillStyle = 'rgba(85,53,38,.42)';
    g.fillText('FIRST LIGHT', -w * 0.06, h * 0.03);
    g.restore();
    // 邮票：一小块暗红，带齿孔边。
    const sx = w * 0.76;
    const sy = h * 0.10;
    const sw = w * 0.14;
    const sh = h * 0.14;
    g.fillStyle = '#8e3b2e';
    g.fillRect(sx, sy, sw, sh);
    g.fillStyle = '#d1b38a';
    g.fillRect(sx + sw * 0.10, sy + sh * 0.12, sw * 0.80, sh * 0.76);
    g.fillStyle = '#8e3b2e';
    g.font = `600 ${Math.round(w * 0.035)}px Georgia, serif`;
    g.textAlign = 'center';
    g.fillText('6:51', sx + sw / 2, sy + sh * 0.58);
    for (let i = 0; i < 7; i += 1) {
      g.clearRect(sx + i * sw / 6, sy - 1, sw / 12, 2);
      g.clearRect(sx + i * sw / 6, sy + sh - 1, sw / 12, 2);
    }
    // 右下角的折角压痕。
    g.fillStyle = 'rgba(95,67,42,.08)';
    g.fillRect(w * 0.78, h * 0.78, w * 0.16, h * 0.12);
  });
}

export function paintTrayLabel(w: number, h: number): HTMLCanvasElement {
  return canvas(w, h, (g) => {
    g.fillStyle = '#b08a54';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#6b4a25';
    g.lineWidth = Math.max(2, h * 0.12);
    g.strokeRect(w * 0.08, h * 0.12, w * 0.84, h * 0.76);
    g.fillStyle = '#f0dcae';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `600 ${Math.round(h * 0.44)}px Georgia, serif`;
    g.fillText('IN', w / 2, h * 0.53);
  });
}

function paintMirrorAged(w: number, h: number): HTMLCanvasElement {
  return canvas(w, h, (g) => {
    const rnd = mulberry(6061);
    g.clearRect(0, 0, w, h);
    const edge = g.createRadialGradient(w / 2, h / 2, w * 0.26, w / 2, h / 2, w * 0.55);
    edge.addColorStop(0, 'rgba(235,226,205,0)');
    edge.addColorStop(0.7, 'rgba(219,208,184,.045)');
    edge.addColorStop(1, 'rgba(191,181,158,.2)');
    g.fillStyle = edge;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 650; i += 1) {
      g.fillStyle = `rgba(244,237,221,${0.015 + rnd() * 0.06})`;
      g.fillRect(rnd() * w, rnd() * h, 0.6 + rnd() * 2.2, 0.6 + rnd() * 1.4);
    }
    // 镜子里不是空的：旧银镜把窗、天光和桌沿压成一层低对比反射。
    // 真实 Reflector 负责视差，这层负责把反射从黑洞拉回可读的室内。
    g.save();
    g.translate(w * 0.08, h * 0.07);
    g.rotate(-0.12);
    const pane = g.createLinearGradient(0, 0, w * 0.72, h * 0.70);
    pane.addColorStop(0, 'rgba(95,121,127,.58)');
    pane.addColorStop(0.30, 'rgba(163,178,170,.48)');
    pane.addColorStop(0.66, 'rgba(213,192,160,.38)');
    pane.addColorStop(1, 'rgba(151,129,100,.26)');
    g.fillStyle = pane;
    g.beginPath();
    g.moveTo(0, h * 0.06);
    g.lineTo(w * 0.68, h * 0.03);
    g.lineTo(w * 0.70, h * 0.64);
    g.lineTo(w * 0.02, h * 0.68);
    g.closePath();
    g.fill();
    // 窗棂倒影：深色细线，让“镜中窗”不是一块白。
    g.strokeStyle = 'rgba(60,51,40,.42)';
    g.lineWidth = w * 0.012;
    for (let i = 1; i < 3; i += 1) {
      const x = w * 0.68 * (i / 3);
      g.beginPath();
      g.moveTo(x, h * 0.04);
      g.lineTo(x, h * 0.66);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(w * 0.01, h * 0.34);
    g.lineTo(w * 0.69, h * 0.32);
    g.stroke();
    // 窗外的树影倒映在镜子里：几团暗绿，不是装饰花纹。
    g.fillStyle = 'rgba(38,54,38,.38)';
    for (let i = 0; i < 6; i += 1) {
      g.beginPath();
      g.ellipse(w * (0.52 + i * 0.035), h * (0.19 + i * 0.045), w * 0.055, h * 0.035, -0.45, 0, TAU);
      g.fill();
    }
    const low = g.createLinearGradient(0, h * 0.60, 0, h);
    low.addColorStop(0, 'rgba(67,52,38,.16)');
    low.addColorStop(1, 'rgba(26,19,13,.55)');
    g.fillStyle = low;
    g.fillRect(0, h * 0.60, w, h * 0.4);
    // 斜向的一条窗光高光。
    g.save();
    g.rotate(0.42);
    const sheen = g.createLinearGradient(-w * 0.2, 0, w * 0.3, 0);
    sheen.addColorStop(0, 'rgba(255,248,228,0)');
    sheen.addColorStop(0.5, 'rgba(255,248,228,.14)');
    sheen.addColorStop(1, 'rgba(255,248,228,0)');
    g.fillStyle = sheen;
    g.fillRect(-w, -h * 0.1, w * 2, h * 1.2);
    g.restore();
    g.restore();
    for (let i = 0; i < 9; i += 1) {
      g.strokeStyle = `rgba(238,231,214,${0.03 + rnd() * 0.05})`;
      g.lineWidth = 0.6 + rnd() * 1.2;
      g.beginPath();
      g.moveTo(rnd() * w * 0.7, rnd() * h);
      g.lineTo(rnd() * w, rnd() * h);
      g.stroke();
    }
  });
}

function paintSunPatch(w: number, h: number): HTMLCanvasElement {
  return canvas(w, h, (g) => {
    g.clearRect(0, 0, w, h);
    const rnd = mulberry(9331);
    // 一片被窗框切开的晨光，只落在桌沿和木面上；被桌垫/纸压住的地方自然看不见。
    const warm = g.createLinearGradient(0, 0, w, h);
    warm.addColorStop(0, 'rgba(255,209,146,.0)');
    warm.addColorStop(0.18, 'rgba(255,214,158,.38)');
    warm.addColorStop(0.55, 'rgba(255,198,126,.28)');
    warm.addColorStop(0.88, 'rgba(255,184,105,.10)');
    warm.addColorStop(1, 'rgba(255,184,105,0)');
    g.fillStyle = warm;
    g.beginPath();
    g.moveTo(w * 0.08, h * 0.02);
    g.lineTo(w * 0.94, h * 0.14);
    g.lineTo(w * 0.84, h * 0.92);
    g.lineTo(w * 0.02, h * 0.78);
    g.closePath();
    g.fill();
    // 窗棂的暗带：有方向、有透视，但保持很轻，不能变成画在桌上的黑条。
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.strokeStyle = 'rgba(0,0,0,.62)';
    for (let i = 0; i < 3; i += 1) {
      const x = w * (0.22 + i * 0.19);
      g.lineWidth = w * (0.018 + i * 0.002);
      g.beginPath();
      g.moveTo(x + w * 0.01, h * 0.03);
      g.lineTo(x - w * 0.02, h * 0.92);
      g.stroke();
    }
    g.lineWidth = w * 0.012;
    g.beginPath();
    g.moveTo(w * 0.03, h * 0.30);
    g.lineTo(w * 0.91, h * 0.22);
    g.stroke();
    g.restore();
    for (let i = 0; i < 420; i += 1) {
      g.fillStyle = `rgba(255,243,205,${0.01 + rnd() * 0.02})`;
      g.fillRect(rnd() * w, rnd() * h, 1, 1);
    }
  });
}

function paintBird(w: number, h: number): HTMLCanvasElement {
  return canvas(w, h, (g) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(45,48,38,.88)';
    // 远处一只小鸟：两段翅膀 + 很短的躯干，不做成“V 字贴纸”。
    g.beginPath();
    g.moveTo(w * 0.08, h * 0.44);
    g.quadraticCurveTo(w * 0.30, h * 0.12, w * 0.48, h * 0.48);
    g.quadraticCurveTo(w * 0.38, h * 0.38, w * 0.30, h * 0.50);
    g.quadraticCurveTo(w * 0.18, h * 0.58, w * 0.08, h * 0.44);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(w * 0.52, h * 0.47);
    g.quadraticCurveTo(w * 0.70, h * 0.14, w * 0.92, h * 0.42);
    g.quadraticCurveTo(w * 0.72, h * 0.34, w * 0.60, h * 0.53);
    g.quadraticCurveTo(w * 0.54, h * 0.58, w * 0.52, h * 0.47);
    g.closePath();
    g.fill();
    g.beginPath();
    g.ellipse(w * 0.50, h * 0.52, w * 0.055, h * 0.028, 0, 0, TAU);
    g.fill();
  });
}

function addBirds(parent: THREE.Group): THREE.Sprite[] {
  const tex = texture(paintBird(128, 128), 1, 1, 2);
  const birds: THREE.Sprite[] = [];
  for (let i = 0; i < 3; i += 1) {
    const bird = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      color: '#4a4f40',
      opacity: 0.38,
      toneMapped: false,
    }));
    bird.name = `window-bird-${i}`;
    bird.scale.set(0.020 + i * 0.002, 0.014 + i * 0.0015, 1);
    bird.position.set(2.35 + i * 0.14, 1.24 + i * 0.015, -0.099);
    bird.userData.baseScale = bird.scale.clone();
    bird.userData.phase = i * 1.9;
    parent.add(bird);
    birds.push(bird);
  }
  return birds;
}

function paintCertificate(w: number, h: number): HTMLCanvasElement {
  return canvas(w, h, (g) => {
    const rnd = mulberry(7117);
    const base = g.createLinearGradient(0, 0, w, h);
    base.addColorStop(0, '#e4d6bf');
    base.addColorStop(0.55, '#d8c7ac');
    base.addColorStop(1, '#c9b596');
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2200; i += 1) {
      g.fillStyle = `rgba(83,64,43,${0.006 + rnd() * 0.014})`;
      g.fillRect(rnd() * w, rnd() * h, 1, 1);
    }
    g.strokeStyle = 'rgba(87,68,46,.38)';
    g.lineWidth = 2;
    g.strokeRect(w * 0.11, h * 0.10, w * 0.78, h * 0.80);
    g.lineWidth = 1;
    g.strokeRect(w * 0.13, h * 0.12, w * 0.74, h * 0.76);
    g.textAlign = 'center';
    g.fillStyle = 'rgba(58,45,31,.64)';
    g.font = '600 18px Georgia, "Times New Roman", serif';
    g.fillText('PERMIT OFFICE', w / 2, h * 0.24);
    g.font = 'italic 600 58px Georgia, "Times New Roman", serif';
    g.fillText('License', w / 2, h * 0.41);
    g.font = '12px Georgia, "Times New Roman", serif';
    g.fillStyle = 'rgba(71,56,39,.46)';
    g.fillText('TO OCCUPY A SMALL, QUIET PLACE', w / 2, h * 0.50);
    g.strokeStyle = 'rgba(77,59,41,.24)';
    g.lineWidth = 1;
    for (let i = 0; i < 4; i += 1) {
      g.beginPath();
      g.moveTo(w * 0.20, h * (0.56 + i * 0.055));
      g.lineTo(w * (0.66 - i * 0.03), h * (0.56 + i * 0.055));
      g.stroke();
    }
    g.font = 'italic 13px Georgia, "Times New Roman", serif';
    g.fillStyle = 'rgba(61,47,32,.52)';
    g.textAlign = 'left';
    g.fillText('First Light, Clerk', w * 0.18, h * 0.82);
    // 右下角的火漆印：小，但一眼能看出不是印刷图案。
    const wx = w * 0.77;
    const wy = h * 0.80;
    const wax = g.createRadialGradient(wx - 8, wy - 8, 2, wx, wy, 38);
    wax.addColorStop(0, 'rgba(166,62,42,.92)');
    wax.addColorStop(0.55, 'rgba(115,35,24,.94)');
    wax.addColorStop(1, 'rgba(68,20,14,.96)');
    g.fillStyle = wax;
    g.beginPath();
    g.arc(wx, wy, 36, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(50,15,11,.6)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(wx, wy, 24, 0, TAU);
    g.stroke();
    g.fillStyle = 'rgba(215,185,130,.55)';
    g.font = '700 16px Georgia, serif';
    g.textAlign = 'center';
    g.fillText('P', wx, wy + 6);
  });
}

function paintBrass(w: number, h: number): HTMLCanvasElement {
  return canvas(w, h, (g) => {
    const rnd = mulberry(2241);
    g.fillStyle = '#b58b57';
    g.fillRect(0, 0, w, h);
    // 大面积轻微氧化：不是纯金色，而是被手摸旧了的黄铜。
    for (let i = 0; i < 18; i += 1) {
      const x = rnd() * w;
      const y = rnd() * h;
      const r = 40 + rnd() * 180;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(${74 + rnd() * 30},${52 + rnd() * 22},${28 + rnd() * 18},${0.04 + rnd() * 0.09})`);
      grad.addColorStop(1, 'rgba(80,55,30,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
    }
    // 极细的拉丝/磨痕，沿长边方向。
    for (let y = 0; y < h; y += 2) {
      g.strokeStyle = `rgba(${245 + rnd() * 10},${224 + rnd() * 16},${180 + rnd() * 24},${0.012 + rnd() * 0.035})`;
      g.lineWidth = 0.55 + rnd() * 0.7;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y + (rnd() - 0.5) * 1.4);
      g.stroke();
    }
    for (let i = 0; i < 500; i += 1) {
      g.fillStyle = `rgba(61,42,24,${0.01 + rnd() * 0.035})`;
      g.fillRect(rnd() * w, rnd() * h, 0.6 + rnd() * 2.4, 0.5 + rnd() * 1.2);
    }
  });
}

function paintBrassRough(w: number, h: number): HTMLCanvasElement {
  return canvas(w, h, (g) => {
    const rnd = mulberry(7342);
    g.fillStyle = '#5f5f5f';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 28; i += 1) {
      const x = rnd() * w;
      const y = rnd() * h;
      const r = 20 + rnd() * 100;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(${96 + rnd() * 40},${96 + rnd() * 40},${96 + rnd() * 40},${0.12 + rnd() * 0.28})`);
      grad.addColorStop(1, 'rgba(95,95,95,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
    }
    for (let y = 0; y < h; y += 3) {
      g.fillStyle = `rgba(255,255,255,${0.01 + rnd() * 0.025})`;
      g.fillRect(0, y, w, 0.6);
    }
  });
}

function paintClockFace(w: number, h: number): HTMLCanvasElement {
  return canvas(w, h, (g) => {
    g.fillStyle = '#e9dec9';
    g.fillRect(0, 0, w, h);
    const rnd = mulberry(4409);
    for (let i = 0; i < 1400; i += 1) {
      g.fillStyle = `rgba(86,69,48,${0.008 + rnd() * 0.02})`;
      g.fillRect(rnd() * w, rnd() * h, 1, 1);
    }
    g.strokeStyle = 'rgba(65,55,42,.55)';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(w / 2, h / 2, w * 0.44, 0, TAU);
    g.stroke();
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * TAU - Math.PI / 2;
      const x1 = w / 2 + Math.cos(a) * w * 0.38;
      const y1 = h / 2 + Math.sin(a) * h * 0.38;
      const x2 = w / 2 + Math.cos(a) * w * 0.44;
      const y2 = h / 2 + Math.sin(a) * h * 0.44;
      g.strokeStyle = i % 3 === 0 ? 'rgba(56,47,36,.8)' : 'rgba(56,47,36,.45)';
      g.lineWidth = i % 3 === 0 ? 2 : 1;
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke();
    }
    g.fillStyle = 'rgba(61,51,38,.72)';
    g.font = 'italic 13px Georgia, "Times New Roman", serif';
    g.textAlign = 'center';
    g.fillText('PERMIT OFFICE', w / 2, h * 0.38);
    g.font = '9px ui-monospace, Menlo, monospace';
    g.fillStyle = 'rgba(61,51,38,.42)';
    g.fillText('6:51', w / 2, h * 0.45);
  });
}

export function paintWood(w: number, h: number, base: string, dark: string, light: string, seed: number): HTMLCanvasElement {
  return canvas(w, h, (g) => {
    const rnd = mulberry(seed);
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);

    // 大尺度色差：云状漂移，控制整块木头从深到浅的走向。
    for (let i = 0; i < 24; i += 1) {
      const x = rnd() * w;
      const y = rnd() * h;
      const rx = w * (0.08 + rnd() * 0.42);
      const ry = h * (0.05 + rnd() * 0.26);
      const grad = g.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
      grad.addColorStop(0, rnd() > 0.48 ? `rgba(238,201,154,${0.022 + rnd() * 0.032})` : `rgba(35,20,12,${0.028 + rnd() * 0.038})`);
      grad.addColorStop(0.55, 'rgba(0,0,0,0.008)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.save();
      g.translate(x, y);
      g.scale(1, ry / rx);
      g.fillStyle = grad;
      g.beginPath();
      g.arc(0, 0, rx, 0, TAU);
      g.fill();
      g.restore();
    }

    // 山形纹：围绕几个“树心”展开的宽拱，不是满屏横向条纹。
    for (let c = 0; c < 3; c += 1) {
      const cx = w * (0.18 + rnd() * 0.62);
      const cy = h * (0.16 + rnd() * 0.68);
      const spread = h * (0.08 + rnd() * 0.10);
      for (let ring = 0; ring < 8; ring += 1) {
        const arch = spread * (0.45 + ring * 0.28);
        const alpha = 0.026 + rnd() * 0.022;
        g.strokeStyle = `rgba(38,21,12,${alpha})`;
        g.lineWidth = 1.0 + rnd() * 2.6;
        g.beginPath();
        for (let x = 0; x <= w; x += 16) {
          const u = x / w;
          const shape = Math.sin(Math.PI * Math.min(1, Math.abs(u - cx / w) * 2.6)) * arch;
          const yy = cy + shape + Math.sin(u * TAU * 2.2 + c) * spread * 0.10;
          if (x === 0) g.moveTo(x, yy);
          else g.lineTo(x, yy);
        }
        g.stroke();
        // 拱线旁边一条很淡的亮边，模拟年轮受光。
        if (ring % 2 === 0) {
          g.strokeStyle = `rgba(246,211,163,${alpha * 0.9})`;
          g.lineWidth = 0.7;
          g.beginPath();
          for (let x = 0; x <= w; x += 16) {
            const u = x / w;
            const shape = Math.sin(Math.PI * Math.min(1, Math.abs(u - cx / w) * 2.6)) * (arch + 1.6);
            const yy = cy + shape + Math.sin(u * TAU * 2.2 + c) * spread * 0.10;
            if (x === 0) g.moveTo(x, yy);
            else g.lineTo(x, yy);
          }
          g.stroke();
        }
      }
    }

    // 长纹：分段而不是条条贯通，避免木纹变成规整的横条码。
    const lines = 320;
    for (let i = 0; i < lines; i += 1) {
      const startX = rnd() * w * 0.78;
      const len = w * (0.14 + rnd() * 0.72);
      const y0 = rnd() * h;
      const lightStroke = rnd() > 0.52;
      const alpha = 0.018 + rnd() * 0.068;
      g.strokeStyle = lightStroke ? `rgba(246,213,169,${alpha * 0.7})` : `rgba(31,16,9,${alpha})`;
      g.lineWidth = 0.35 + rnd() * 1.05;
      g.beginPath();
      const amp = 0.7 + rnd() * 3.6;
      const freq = (0.8 + rnd() * 2.2) / w;
      const slope = (rnd() - 0.5) * 0.035;
      const phase = rnd() * TAU;
      for (let x = startX; x <= startX + len; x += 9) {
        const yy = y0 + slope * (x - startX) + Math.sin(x * freq + phase) * amp +
          Math.sin(x * freq * 3.3 + phase * 1.5) * amp * 0.2;
        if (x === startX) g.moveTo(x, yy);
        else g.lineTo(x, yy);
      }
      g.stroke();
    }

    // 棕眼与散孔：近看才有的细碎孔隙，集中在几条纹理带上。
    for (let i = 0; i < Math.round(w * 0.55); i += 1) {
      const x = rnd() * w;
      const y = h * (0.06 + rnd() * 0.88);
      const len = 1.4 + rnd() * 6.5;
      g.strokeStyle = `rgba(24,12,7,${0.05 + rnd() * 0.13})`;
      g.lineWidth = 0.35 + rnd() * 0.65;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + len, y + (rnd() - 0.5) * 1.2);
      g.stroke();
    }

    // 结疤：少量，带偏心的年轮，不能做成两只眼睛。
    for (let k = 0; k < 3; k += 1) {
      const x = w * (0.12 + rnd() * 0.74);
      const y = h * (0.13 + rnd() * 0.72);
      const squash = 0.55 + rnd() * 0.4;
      const spin = (rnd() - 0.5) * 0.6;
      for (let ring = 5; ring >= 1; ring -= 1) {
        g.strokeStyle = ring === 1 ? light : dark;
        g.globalAlpha = 0.07 + ring * 0.028;
        g.lineWidth = 0.8 + ring * 0.7;
        g.beginPath();
        g.ellipse(x + ring * 1.2, y, ring * 5.2, ring * 2.8 * squash, spin, 0, TAU);
        g.stroke();
      }
      g.globalAlpha = 1;
    }

    // 使用痕迹：桌面上不可能完全无伤；几道短刮痕、压痕，方向不统一。
    for (let k = 0; k < 18; k += 1) {
      const x = rnd() * w;
      const y = rnd() * h;
      const len = w * (0.008 + rnd() * 0.028);
      const a = -0.4 + rnd() * 0.8;
      g.strokeStyle = rnd() > 0.5 ? `rgba(247,226,190,${0.06 + rnd() * 0.07})` : `rgba(28,15,9,${0.05 + rnd() * 0.08})`;
      g.lineWidth = 0.4 + rnd() * 0.9;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + len * 0.5, y + Math.sin(a) * 2, x + Math.cos(a) * len, y + Math.sin(a) * len);
      g.stroke();
    }

    // 极淡的顶光/边缘色温。
    const wash = g.createLinearGradient(0, 0, w, h);
    wash.addColorStop(0, 'rgba(255,210,155,.032)');
    wash.addColorStop(0.5, 'rgba(255,246,226,.004)');
    wash.addColorStop(1, 'rgba(22,13,8,.045)');
    g.fillStyle = wash;
    g.fillRect(0, 0, w, h);
  });
}

/** 灰度高度图：给木头做 bump，孔隙和年轮会轻微起伏。 */
function paintWoodHeight(w: number, h: number, seed: number): HTMLCanvasElement {
  return canvas(w, h, (g) => {
    const rnd = mulberry(seed + 7);
    g.fillStyle = '#858585';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < Math.round(w * 0.55); i += 1) {
      const y = rnd() * h;
      g.strokeStyle = rnd() > 0.52 ? 'rgba(210,210,210,.16)' : 'rgba(55,55,55,.18)';
      g.lineWidth = 0.4 + rnd() * 1.1;
      g.beginPath();
      const amp = 0.7 + rnd() * 2.8;
      const freq = (0.9 + rnd() * 2.2) / w;
      for (let x = -8; x <= w + 8; x += 8) {
        const yy = y + Math.sin(x * freq + rnd()) * amp;
        if (x === -8) g.moveTo(x, yy);
        else g.lineTo(x, yy);
      }
      g.stroke();
    }
    for (let i = 0; i < Math.round(w * 0.55); i += 1) {
      g.fillStyle = `rgba(40,40,40,${0.04 + rnd() * 0.09})`;
      g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 4, 0.5 + rnd() * 1.2);
    }
  });
}

/** 灰度粗糙度：顺纹更滑、棕眼更干，桌面会有很细的反射变化。 */
function paintWoodRough(w: number, h: number, seed: number): HTMLCanvasElement {
  return canvas(w, h, (g) => {
    const rnd = mulberry(seed + 19);
    g.fillStyle = '#a2a2a2';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < Math.round(w * 0.4); i += 1) {
      const y = rnd() * h;
      g.strokeStyle = rnd() > 0.48 ? 'rgba(78,78,78,.16)' : 'rgba(214,214,214,.12)';
      g.lineWidth = 0.5 + rnd() * 2.2;
      g.beginPath();
      const amp = 0.5 + rnd() * 2.4;
      const freq = (0.7 + rnd() * 2.2) / w;
      for (let x = -8; x <= w + 8; x += 8) {
        const yy = y + Math.sin(x * freq + rnd()) * amp;
        if (x === -8) g.moveTo(x, yy);
        else g.lineTo(x, yy);
      }
      g.stroke();
    }
    for (let i = 0; i < Math.round(w * 0.4); i += 1) {
      g.fillStyle = `rgba(40,40,40,${0.025 + rnd() * 0.06})`;
      g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 5, 1 + rnd() * 2);
    }
  });
}

function paintPlaster(w: number, h: number): HTMLCanvasElement {
  return canvas(w, h, (g) => {
    const rnd = mulberry(31415);
    g.fillStyle = '#c9bca7';
    g.fillRect(0, 0, w, h);
    // 石灰墙的低频色差：不是均匀噪点，而是薄厚不一的抹灰。
    for (let i = 0; i < 28; i += 1) {
      const x = rnd() * w;
      const y = rnd() * h;
      const rx = 30 + rnd() * 140;
      const ry = 8 + rnd() * 55;
      const grad = g.createRadialGradient(x, y, 0, x, y, rx);
      grad.addColorStop(0, rnd() > 0.5 ? 'rgba(239,231,214,.035)' : 'rgba(92,78,58,.025)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.save();
      g.translate(x, y);
      g.scale(1, ry / rx);
      g.fillStyle = grad;
      g.beginPath();
      g.arc(0, 0, rx, 0, TAU);
      g.fill();
      g.restore();
    }
    for (let i = 0; i < 26000; i += 1) {
      const x = rnd() * w;
      const y = rnd() * h;
      const a = 0.012 + rnd() * 0.045;
      g.fillStyle = rnd() > 0.55 ? `rgba(255,250,237,${a})` : `rgba(83,68,50,${a})`;
      const r = 0.25 + rnd() * 1.25;
      g.fillRect(x, y, r, r);
    }
    // 抹刀留下的短弧痕，方向略微一致。
    for (let i = 0; i < 42; i += 1) {
      const x = rnd() * w;
      const y = rnd() * h;
      g.globalAlpha = 0.022 + rnd() * 0.035;
      g.fillStyle = rnd() > 0.5 ? '#ece4d4' : '#a99d88';
      g.beginPath();
      g.ellipse(x, y, 18 + rnd() * 90, 3 + rnd() * 13, -0.2 + rnd() * 0.14, 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;
    // 细砂粒。
    for (let i = 0; i < 1600; i += 1) {
      g.fillStyle = `rgba(70,58,44,${0.012 + rnd() * 0.02})`;
      g.fillRect(rnd() * w, rnd() * h, 0.5, 0.5);
    }
  });
}

function paintPlasterHeight(w: number, h: number): HTMLCanvasElement {
  return canvas(w, h, (g) => {
    const rnd = mulberry(2718);
    g.fillStyle = '#858585';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 50; i += 1) {
      const x = rnd() * w;
      const y = rnd() * h;
      g.fillStyle = rnd() > 0.5 ? 'rgba(190,190,190,.045)' : 'rgba(55,55,55,.035)';
      g.beginPath();
      g.ellipse(x, y, 20 + rnd() * 110, 4 + rnd() * 18, rnd() * 0.3, 0, TAU);
      g.fill();
    }
    for (let i = 0; i < 26000; i += 1) {
      g.fillStyle = rnd() > 0.5 ? `rgba(30,30,30,${0.02 + rnd() * 0.06})` : `rgba(225,225,225,${0.02 + rnd() * 0.05})`;
      g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
    }
  });
}


/** 釉面陶盆：奶白釉、铁点、细开片、口沿积釉。近看不是一只白塑料杯。 */
function paintCeramic(w: number, h: number): HTMLCanvasElement {
  return canvas(w, h, (g) => {
    const rnd = mulberry(60607);
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#c18465');
    grad.addColorStop(0.35, '#b57454');
    grad.addColorStop(0.72, '#a56548');
    grad.addColorStop(1, '#895137');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    // 釉层薄厚不匀的暖冷斑。
    for (let i = 0; i < 34; i += 1) {
      const x = rnd() * w;
      const y = rnd() * h;
      const rx = 30 + rnd() * 160;
      const ry = 10 + rnd() * 80;
      const rad = g.createRadialGradient(x, y, 0, x, y, rx);
      rad.addColorStop(0, rnd() > 0.5 ? 'rgba(255,226,198,.07)' : 'rgba(74,45,32,.075)');
      rad.addColorStop(1, 'rgba(0,0,0,0)');
      g.save();
      g.translate(x, y);
      g.scale(1, ry / rx);
      g.fillStyle = rad;
      g.beginPath();
      g.arc(0, 0, rx, 0, TAU);
      g.fill();
      g.restore();
    }
    // 铁质斑点：不是均匀噪点，大小和疏密都不一样。
    for (let i = 0; i < 420; i += 1) {
      const x = rnd() * w;
      const y = rnd() * h;
      const r = 0.4 + rnd() * 2.2;
      g.fillStyle = `rgba(${52 + rnd() * 30},${31 + rnd() * 22},${22 + rnd() * 16},${0.08 + rnd() * 0.16})`;
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
    }
    // 细开片：只在釉面里走，不能画成裂纹蜘蛛网。
    for (let i = 0; i < 38; i += 1) {
      let x = rnd() * w;
      let y = rnd() * h;
      g.strokeStyle = `rgba(80,50,36,${0.045 + rnd() * 0.055})`;
      g.lineWidth = 0.6 + rnd() * 0.7;
      g.beginPath();
      g.moveTo(x, y);
      const steps = 3 + Math.floor(rnd() * 5);
      for (let k = 0; k < steps; k += 1) {
        x += (rnd() - 0.5) * 26;
        y += (rnd() - 0.5) * 12;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    // 口沿积釉更深，底部有一圈座痕。
    const rim = g.createLinearGradient(0, 0, 0, h);
    rim.addColorStop(0, 'rgba(70,54,38,0)');
    rim.addColorStop(0.88, 'rgba(70,54,38,0)');
    rim.addColorStop(0.965, 'rgba(54,29,18,.34)');
    rim.addColorStop(1, 'rgba(54,29,18,.12)');
    g.fillStyle = rim;
    g.fillRect(0, 0, w, h);
  });
}

function paintCeramicHeight(w: number, h: number): HTMLCanvasElement {
  return canvas(w, h, (g) => {
    const rnd = mulberry(60608);
    g.fillStyle = '#858585';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1200; i += 1) {
      const x = rnd() * w;
      const y = rnd() * h;
      g.fillStyle = rnd() > 0.5 ? 'rgba(225,225,225,.035)' : 'rgba(55,55,55,.025)';
      g.fillRect(x, y, 1 + rnd() * 2.2, 1 + rnd() * 1.4);
    }
    for (let i = 0; i < 38; i += 1) {
      let x = rnd() * w;
      let y = rnd() * h;
      g.strokeStyle = `rgba(35,35,35,${0.16 + rnd() * 0.16})`;
      g.lineWidth = 1 + rnd() * 0.8;
      g.beginPath();
      g.moveTo(x, y);
      const steps = 3 + Math.floor(rnd() * 5);
      for (let k = 0; k < steps; k += 1) {
        x += (rnd() - 0.5) * 26;
        y += (rnd() - 0.5) * 12;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  });
}

/** 灯罩亚麻：斜纹、粗细纱、洗旧的暖白和靠近灯泡的一点茶色。 */
function paintShadeFabric(w: number, h: number): HTMLCanvasElement {
  return canvas(w, h, (g) => {
    const rnd = mulberry(74021);
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#d8c7aa');
    grad.addColorStop(0.55, '#d2c0a2');
    grad.addColorStop(1, '#c8b493');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    // 斜向织纹：灯罩是一圈布，纹路要跟着圆走，不能是横平竖直的格子。
    g.save();
    g.translate(w / 2, h / 2);
    g.rotate(-0.22);
    for (let i = -w; i < w * 2; i += 3) {
      g.fillStyle = `rgba(255,248,232,${0.025 + rnd() * 0.035})`;
      g.fillRect(i, -h, 1.2 + rnd() * 1.2, h * 2);
      g.fillStyle = `rgba(104,84,60,${0.018 + rnd() * 0.03})`;
      g.fillRect(i + 1.5, -h, 0.8, h * 2);
    }
    g.restore();
    // 粗纱节与洗出的浅斑。
    for (let i = 0; i < 180; i += 1) {
      const x = rnd() * w;
      const y = rnd() * h;
      g.fillStyle = rnd() > 0.5 ? `rgba(255,249,234,${0.04 + rnd() * 0.07})` : `rgba(91,68,48,${0.018 + rnd() * 0.04})`;
      g.fillRect(x, y, 1 + rnd() * 8, 0.8 + rnd() * 1.2);
    }
    for (let i = 0; i < 18; i += 1) {
      const x = rnd() * w;
      const y = rnd() * h;
      const rad = g.createRadialGradient(x, y, 0, x, y, 30 + rnd() * 90);
      rad.addColorStop(0, `rgba(255,245,225,${0.03 + rnd() * 0.045})`);
      rad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rad;
      g.beginPath();
      g.arc(x, y, 120, 0, TAU);
      g.fill();
    }
    // 靠近灯口的一圈茶色，像长期被灯泡烤过。
    const scorch = g.createLinearGradient(0, 0, 0, h);
    scorch.addColorStop(0, 'rgba(88,54,28,.16)');
    scorch.addColorStop(0.18, 'rgba(88,54,28,.04)');
    scorch.addColorStop(0.5, 'rgba(88,54,28,0)');
    g.fillStyle = scorch;
    g.fillRect(0, 0, w, h);
  });
}

function paintShadeHeight(w: number, h: number): HTMLCanvasElement {
  return canvas(w, h, (g) => {
    const rnd = mulberry(74022);
    g.fillStyle = '#8a8a8a';
    g.fillRect(0, 0, w, h);
    g.save();
    g.translate(w / 2, h / 2);
    g.rotate(-0.22);
    for (let i = -w; i < w * 2; i += 3) {
      g.fillStyle = `rgba(225,225,225,${0.03 + rnd() * 0.04})`;
      g.fillRect(i, -h, 1 + rnd() * 1.2, h * 2);
      g.fillStyle = `rgba(35,35,35,${0.02 + rnd() * 0.03})`;
      g.fillRect(i + 1.5, -h, 0.6, h * 2);
    }
    g.restore();
    for (let i = 0; i < 150; i += 1) {
      g.fillStyle = `rgba(30,30,30,${0.03 + rnd() * 0.05})`;
      g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 7, 1);
    }
  });
}
function paintLeather(w: number, h: number, base = '#2b3d33', withBorder = true): HTMLCanvasElement {
  return canvas(w, h, (g) => {
    const rnd = mulberry(991);
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 28000; i += 1) {
      const x = rnd() * w;
      const y = rnd() * h;
      g.fillStyle = rnd() > 0.56 ? `rgba(198,213,183,${0.008 + rnd() * 0.026})` : `rgba(5,14,11,${0.02 + rnd() * 0.05})`;
      g.fillRect(x, y, 0.35 + rnd() * 0.9, 0.35 + rnd() * 0.65);
    }
    // 皮革的细褶：只在几个方向出现，不要画成均匀噪点。
    for (let i = 0; i < 16; i += 1) {
      const x = rnd() * w;
      const y = rnd() * h;
      g.strokeStyle = `rgba(7,16,12,${0.035 + rnd() * 0.05})`;
      g.lineWidth = 0.8 + rnd() * 1.6;
      g.beginPath();
      g.moveTo(x, y);
      g.bezierCurveTo(x + 20, y - 8 + rnd() * 16, x + 55, y + 8 + rnd() * 20, x + 90 + rnd() * 60, y - 4 + rnd() * 18);
      g.stroke();
    }
    if (withBorder) {
      // 极细的金线；不是大金框，只做桌垫边的压印。
      g.strokeStyle = 'rgba(176,139,80,.46)';
      g.lineWidth = 1.4;
      g.strokeRect(w * 0.055, h * 0.055, w * 0.89, h * 0.89);
      g.strokeStyle = 'rgba(7,18,14,.42)';
      g.lineWidth = 1;
      g.strokeRect(w * 0.067, h * 0.067, w * 0.866, h * 0.866);
      g.strokeStyle = 'rgba(176,139,80,.24)';
      for (const [x, y] of [
        [w * 0.09, h * 0.09],
        [w * 0.91, h * 0.09],
        [w * 0.09, h * 0.91],
        [w * 0.91, h * 0.91],
      ] as const) {
        g.beginPath();
        g.arc(x, y, 13, 0, TAU);
        g.stroke();
        g.beginPath();
        g.arc(x, y, 5, 0, TAU);
        g.stroke();
      }
    }
  });
}

function paintLeatherHeight(w: number, h: number): HTMLCanvasElement {
  return canvas(w, h, (g) => {
    const rnd = mulberry(1193);
    g.fillStyle = '#858585';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 24000; i += 1) {
      g.fillStyle = rnd() > 0.5 ? `rgba(30,30,30,${0.02 + rnd() * 0.08})` : `rgba(220,220,220,${0.015 + rnd() * 0.04})`;
      g.fillRect(rnd() * w, rnd() * h, 0.6 + rnd() * 1.2, 0.6 + rnd() * 1.2);
    }
    for (let i = 0; i < 18; i += 1) {
      const x = rnd() * w;
      const y = rnd() * h;
      g.strokeStyle = `rgba(45,45,45,${0.04 + rnd() * 0.06})`;
      g.lineWidth = 0.7 + rnd() * 1.2;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + 35, y + 15, x + 100, y - 6);
      g.stroke();
    }
  });
}

function paintRug(w: number, h: number): HTMLCanvasElement {
  return canvas(w, h, (g) => {
    const rnd = mulberry(20261121);
    g.fillStyle = '#86584a';
    g.fillRect(0, 0, w, h);
    // 羊毛的底绒：横向短纤维，而不是纯色块。
    for (let i = 0; i < 12000; i += 1) {
      const x = rnd() * w;
      const y = rnd() * h;
      g.fillStyle = rnd() > 0.52 ? `rgba(238,211,178,${0.015 + rnd() * 0.04})` : `rgba(50,28,20,${0.02 + rnd() * 0.05})`;
      g.fillRect(x, y, 1 + rnd() * 6, 0.4 + rnd() * 1.1);
    }
    // 外框：褪色的奶油、橄榄、深蓝。
    const bands = [
      [0.028, '#6d4438', 0.052],
      [0.085, '#d3c09e', 0.018],
      [0.108, '#405044', 0.012],
      [0.124, '#b28d5e', 0.007],
    ] as const;
    for (const [inset, color, thick] of bands) {
      g.strokeStyle = color;
      g.lineWidth = Math.max(2, h * thick);
      g.strokeRect(w * inset, h * inset, w * (1 - inset * 2), h * (1 - inset * 2));
    }
    // 一块褪色的 Oushak：中央团花、四角棕叶、散落蔷薇；
    // 不画整齐菱格，那种图案在近景里一眼就是程序生成的。
    const field = { x0: w * 0.16, x1: w * 0.84, y0: h * 0.17, y1: h * 0.83 };
    const lobed = (
      cx: number,
      cy: number,
      rx: number,
      ry: number,
      fill: string,
      stroke: string,
      lobes: number,
      wobble: number,
    ): void => {
      g.beginPath();
      for (let i = 0; i <= 80; i += 1) {
        const a = (i / 80) * TAU;
        const rr = 1 + Math.sin(a * lobes) * wobble + Math.sin(a * (lobes * 2) + 0.7) * wobble * 0.35;
        const px = cx + Math.cos(a) * rx * rr;
        const py = cy + Math.sin(a) * ry * rr;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath();
      g.fillStyle = fill;
      g.fill();
      g.strokeStyle = stroke;
      g.lineWidth = Math.max(0.8, w * 0.0011);
      g.stroke();
    };
    const cx = (field.x0 + field.x1) / 2;
    const cy = (field.y0 + field.y1) / 2;
    lobed(cx, cy, w * 0.205, h * 0.29, 'rgba(211,186,145,.105)', 'rgba(232,210,171,.10)', 10, 0.055);
    lobed(cx, cy, w * 0.155, h * 0.225, 'rgba(52,71,61,.11)', 'rgba(213,188,148,.08)', 8, 0.06);
    lobed(cx, cy, w * 0.100, h * 0.147, 'rgba(211,176,126,.10)', 'rgba(244,220,180,.07)', 12, 0.05);
    // 团花心：八瓣花，不是一颗圆点。
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * TAU + 0.2;
      g.save();
      g.translate(cx + Math.cos(a) * w * 0.040, cy + Math.sin(a) * h * 0.060);
      g.rotate(a);
      g.fillStyle = 'rgba(228,204,164,.11)';
      g.beginPath();
      g.ellipse(0, 0, w * 0.012, h * 0.021, 0, 0, TAU);
      g.fill();
      g.restore();
    }
    // 四角的棕叶/藤蔓，把中央团花压回画面里。
    for (const [sx, sy, dir] of [[field.x0, field.y0, 1], [field.x1, field.y0, -1], [field.x0, field.y1, 1], [field.x1, field.y1, -1]] as const) {
      for (let k = 0; k < 7; k += 1) {
        const t = k / 6;
        const bx = sx + dir * (w * 0.026 + t * w * 0.095);
        const by = sy + (1 - dir) * 0 + (k < 3 ? -1 : 1) * h * (0.012 + t * 0.10) * 0.5;
        g.save();
        g.translate(bx, by);
        g.rotate((dir > 0 ? 0.35 : Math.PI - 0.35) + (k - 3) * 0.36);
        g.fillStyle = 'rgba(50,68,56,.075)';
        g.beginPath();
        g.ellipse(0, 0, w * 0.026, h * 0.012, 0, 0, TAU);
        g.fill();
        g.strokeStyle = 'rgba(228,206,170,.055)';
        g.lineWidth = 0.8;
        g.stroke();
        g.restore();
      }
    }
    // 散落的蔷薇和叶：不按网格，随机偏一点，像手绘的。
    for (let i = 0; i < 26; i += 1) {
      const px = field.x0 + rnd() * (field.x1 - field.x0);
      const py = field.y0 + rnd() * (field.y1 - field.y0);
      if (Math.abs(px - cx) < w * 0.17 && Math.abs(py - cy) < h * 0.24) continue;
      const r = Math.min(w, h) * (0.008 + rnd() * 0.012);
      for (let k = 0; k < 5; k += 1) {
        const a = (k / 5) * TAU + rnd() * 0.3;
        g.fillStyle = k % 2 === 0 ? 'rgba(218,194,155,.085)' : 'rgba(53,73,61,.075)';
        g.beginPath();
        g.ellipse(px + Math.cos(a) * r * 0.7, py + Math.sin(a) * r * 0.7, r * 1.1, r * 0.7, a, 0, TAU);
        g.fill();
      }
      g.fillStyle = 'rgba(72,51,40,.10)';
      g.beginPath();
      g.arc(px, py, r * 0.35, 0, TAU);
      g.fill();
      // 一根弯茎和两片叶。
      g.strokeStyle = 'rgba(48,67,54,.055)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(px, py + r * 0.3);
      g.quadraticCurveTo(px + (rnd() - 0.5) * r * 3, py + r * 1.8, px + (rnd() - 0.5) * r * 2, py + r * 3.2);
      g.stroke();
    }
    // 经线纬线：非常淡，但能读出手织的经纬。
    for (let x = 0; x < w; x += 3) {
      g.fillStyle = `rgba(239,219,183,${0.012 + (x % 9 === 0 ? 0.015 : 0)})`;
      g.fillRect(x, 0, 0.6, h);
    }
    for (let y = 0; y < h; y += 3) {
      g.fillStyle = 'rgba(50,31,22,.018)';
      g.fillRect(0, y, w, 0.6);
    }
    const vignette = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.62);
    vignette.addColorStop(0, 'rgba(255,218,176,.045)');
    vignette.addColorStop(0.52, 'rgba(255,200,150,.008)');
    vignette.addColorStop(1, 'rgba(28,16,12,.16)');
    g.fillStyle = vignette;
    g.fillRect(0, 0, w, h);
  });
}

function paintRugHeight(w: number, h: number): HTMLCanvasElement {
  return canvas(w, h, (g) => {
    const rnd = mulberry(7331);
    g.fillStyle = '#808080';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 12000; i += 1) {
      g.fillStyle = rnd() > 0.5 ? `rgba(230,230,230,${0.035 + rnd() * 0.05})` : `rgba(45,45,45,${0.035 + rnd() * 0.06})`;
      g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 5, 0.6 + rnd() * 1.4);
    }
    for (let x = 0; x < w; x += 3) {
      g.fillStyle = 'rgba(20,20,20,.04)';
      g.fillRect(x, 0, 0.5, h);
    }
    for (let y = 0; y < h; y += 3) {
      g.fillStyle = 'rgba(235,235,235,.035)';
      g.fillRect(0, y, w, 0.5);
    }
  });
}


/** 地毯前缘的流苏：一根根羊毛线，透明底；没有流苏的机织地毯像贴纸。 */
function paintRugFringe(w: number, h: number): HTMLCanvasElement {
  return canvas(w, h, (g) => {
    const rnd = mulberry(51821);
    g.clearRect(0, 0, w, h);
    const step = 7;
    for (let x = 0; x < w; x += step) {
      const base = h * 0.92;
      const len = h * (0.38 + rnd() * 0.54);
      const sway = (rnd() - 0.5) * 5;
      g.strokeStyle = rnd() > 0.45 ? `rgba(226,210,181,${0.38 + rnd() * 0.34})` : `rgba(157,128,93,${0.30 + rnd() * 0.30})`;
      g.lineWidth = 1 + rnd() * 1.6;
      g.beginPath();
      g.moveTo(x + rnd() * 2, 0);
      g.quadraticCurveTo(x + sway, h * 0.55, x + sway * 0.6, len);
      g.stroke();
    }
  });
}
function paintSky(w: number, h: number): HTMLCanvasElement {
  return canvas(w, h, (g) => {
    const rnd = mulberry(651);
    const horizon = h * 0.64;
    const sky = g.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#7e9aa4');
    sky.addColorStop(0.22, '#94adb4');
    sky.addColorStop(0.48, '#c7c5ad');
    sky.addColorStop(0.72, '#e2c49f');
    sky.addColorStop(0.9, '#e8cba8');
    sky.addColorStop(1, '#d8c39e');
    g.fillStyle = sky;
    g.fillRect(0, 0, w, horizon + 2);

    // 低太阳：柔和的多层光晕，不画白圆片。
    const sx = w * 0.61;
    const sy = h * 0.55;
    for (const [r, a] of [[w * 0.19, 0.10], [w * 0.09, 0.12], [w * 0.036, 0.16], [w * 0.013, 0.22]] as const) {
      const glow = g.createRadialGradient(sx, sy, 0, sx, sy, r);
      glow.addColorStop(0, `rgba(255,240,203,${a})`);
      glow.addColorStop(0.32, `rgba(255,214,154,${a * 0.55})`);
      glow.addColorStop(1, 'rgba(255,196,128,0)');
      g.fillStyle = glow;
      g.fillRect(sx - r, sy - r, r * 2, r * 2);
    }
    g.fillStyle = 'rgba(255,247,218,.72)';
    g.beginPath();
    g.arc(sx, sy, Math.max(5, w * 0.008), 0, TAU);
    g.fill();

    // 薄云：低对比、横向拉长，像清晨还没散尽的水汽。
    for (let i = 0; i < 18; i += 1) {
      const x = rnd() * w;
      const y = h * (0.08 + rnd() * 0.38);
      const rw = w * (0.06 + rnd() * 0.18);
      const rh = h * (0.004 + rnd() * 0.018);
      const a = 0.035 + rnd() * 0.07;
      const grad = g.createLinearGradient(0, -rh, 0, rh);
      grad.addColorStop(0, 'rgba(255,244,226,0)');
      grad.addColorStop(0.5, `rgba(255,241,220,${a})`);
      grad.addColorStop(1, 'rgba(255,241,220,0)');
      g.save();
      g.translate(x, y);
      g.scale(1, rh / rw);
      g.fillStyle = grad;
      g.beginPath();
      g.arc(0, 0, rw, 0, TAU);
      g.fill();
      g.restore();
    }

    // 远山：模糊边缘 + 多层空气透视，不是硬边矢量山。
    const layers = [
      { y: h * 0.60, color: '#9caca4', amp: h * 0.028, freq: 0.005, alpha: 0.30, blur: 6 },
      { y: h * 0.645, color: '#81968a', amp: h * 0.02, freq: 0.009, alpha: 0.42, blur: 3 },
      { y: h * 0.685, color: '#63796a', amp: h * 0.012, freq: 0.016, alpha: 0.56, blur: 1.4 },
    ];
    for (const L of layers) {
      g.save();
      g.filter = `blur(${L.blur}px)`;
      g.fillStyle = L.color;
      g.globalAlpha = L.alpha;
      g.beginPath();
      g.moveTo(-20, horizon + 4);
      for (let x = -20; x <= w + 20; x += 6) {
        const ridge =
          L.y +
          Math.sin(x * L.freq + 0.8) * L.amp +
          Math.sin(x * L.freq * 2.7 + 2.1) * L.amp * 0.3 +
          Math.sin(x * L.freq * 7.1) * L.amp * 0.1;
        g.lineTo(x, ridge);
      }
      g.lineTo(w + 20, horizon + 6);
      g.closePath();
      g.fill();
      g.restore();
    }
    g.globalAlpha = 1;

    // 山脚薄雾。
    const mist = g.createLinearGradient(0, h * 0.56, 0, h * 0.74);
    mist.addColorStop(0, 'rgba(247,235,215,0)');
    mist.addColorStop(0.52, 'rgba(244,232,211,.34)');
    mist.addColorStop(1, 'rgba(244,232,211,0)');
    g.fillStyle = mist;
    g.fillRect(0, h * 0.55, w, h * 0.2);

    // 近景田块：先铺一层带透视的田垄，再压几块不规则田埂和树篱。
    const fieldBase = g.createLinearGradient(0, h * 0.73, 0, h);
    fieldBase.addColorStop(0, '#9a986c');
    fieldBase.addColorStop(0.32, '#7f8b5d');
    fieldBase.addColorStop(0.68, '#536f4b');
    fieldBase.addColorStop(1, '#314b39');
    g.fillStyle = fieldBase;
    g.beginPath();
    g.moveTo(0, h * 0.735);
    for (let x = 0; x <= w; x += 12) {
      g.lineTo(x, h * (0.735 + Math.sin(x / w * 7.3 + 1.1) * 0.007));
    }
    g.lineTo(w, h);
    g.lineTo(0, h);
    g.closePath();
    g.fill();

    // 不规则田块，被晨雾压低对比。远小近大，顺着透视走。
    const patchColors = ['#6d7d52', '#87906a', '#5e714b', '#9b9264', '#4d6748', '#78875b'];
    for (let i = 0; i < 15; i += 1) {
      const x = rnd() * w;
      const y = h * (0.74 + rnd() * 0.22);
      const rw = w * (0.05 + rnd() * 0.16);
      const rh = h * (0.014 + rnd() * 0.055);
      g.fillStyle = patchColors[Math.floor(rnd() * patchColors.length)]!;
      g.globalAlpha = 0.10 + rnd() * 0.20;
      g.beginPath();
      g.moveTo(x - rw, y + rh * 0.3);
      g.quadraticCurveTo(x - rw * 0.4, y - rh, x + rw * 0.2, y - rh * 0.7);
      g.quadraticCurveTo(x + rw * 0.9, y - rh * 0.3, x + rw, y + rh * 0.6);
      g.lineTo(x + rw * 0.3, y + rh * 0.9);
      g.closePath();
      g.fill();
    }
    g.globalAlpha = 1;

    // 田垄：近处宽、远处窄，弧线带一点手绘抖动。
    for (let i = 0; i < 26; i += 1) {
      const t = i / 25;
      const y = h * (0.744 + t * 0.235);
      g.strokeStyle = `rgba(204,191,132,${0.06 + t * 0.09})`;
      g.lineWidth = 0.6 + t * 2.4;
      g.beginPath();
      g.moveTo(-10, y + Math.sin(i * 2.1) * h * 0.006);
      g.bezierCurveTo(w * 0.25, y - h * 0.009, w * 0.7, y + h * 0.006, w + 10, y + Math.sin(i * 1.4) * h * 0.007);
      g.stroke();
    }

    // 树篱：压在田块之间的深色细带，给地平线以下加层次。
    for (let i = 0; i < 9; i += 1) {
      const y = h * (0.735 + rnd() * 0.12);
      const x0 = rnd() * w * 0.7;
      const len = w * (0.05 + rnd() * 0.24);
      g.strokeStyle = `rgba(42,62,45,${0.14 + rnd() * 0.12})`;
      g.lineWidth = 1 + rnd() * 1.5;
      g.beginPath();
      g.moveTo(x0, y);
      for (let x = 0; x <= len; x += 10) {
        g.lineTo(x0 + x, y - Math.sin(x * 0.12 + i) * h * 0.003);
      }
      g.stroke();
    }

    // 中景树线：树冠是团块，不是等距小锥体。
    for (let i = 0; i < 150; i += 1) {
      const x = rnd() * w;
      const base = h * (0.716 + rnd() * 0.045);
      const tall = h * (0.012 + rnd() * 0.045);
      const wide = 2.5 + rnd() * 8;
      g.fillStyle = `rgba(47,68,48,${0.08 + rnd() * 0.20})`;
      g.beginPath();
      g.ellipse(x, base - tall * 0.55, wide, tall * 0.55, (rnd() - 0.5) * 0.08, 0, TAU);
      g.fill();
      if (rnd() > 0.75) {
        g.fillStyle = `rgba(38,55,42,${0.10 + rnd() * 0.12})`;
        g.beginPath();
        g.ellipse(x + (rnd() - 0.5) * wide, base - tall * 0.85, wide * 0.55, tall * 0.28, 0, 0, TAU);
        g.fill();
      }
    }

    // 远处柏树：用一条有宽窄变化的暗色剪影，不用“竖线 + 圆点”。
    for (const [x, top, tall] of [
      [w * 0.17, h * 0.33, h * 0.21],
      [w * 0.205, h * 0.39, h * 0.16],
      [w * 0.835, h * 0.35, h * 0.19],
    ] as const) {
      g.strokeStyle = 'rgba(44,67,51,.42)';
      g.fillStyle = 'rgba(44,67,51,.26)';
      g.beginPath();
      g.moveTo(x - 3, h * 0.73);
      g.quadraticCurveTo(x - 10, top + tall * 0.3, x - 2, top);
      g.quadraticCurveTo(x + 3, top + tall * 0.25, x + 3, h * 0.73);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(37,58,45,.32)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, h * 0.73);
      g.lineTo(x, top + tall * 0.3);
      g.stroke();
    }

    // 地平线上一间小农舍：只给几笔，但能让“窗外”变成有人的生活。
    const hx = w * 0.43;
    const hy = h * 0.729;
    g.fillStyle = 'rgba(112,97,76,.30)';
    g.fillRect(hx, hy - h * 0.018, w * 0.028, h * 0.018);
    g.fillStyle = 'rgba(93,55,44,.38)';
    g.beginPath();
    g.moveTo(hx - 2, hy - h * 0.018);
    g.lineTo(hx + w * 0.014, hy - h * 0.033);
    g.lineTo(hx + w * 0.030, hy - h * 0.018);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(60,45,36,.36)';
    g.fillRect(hx + w * 0.011, hy - h * 0.030, 3, h * 0.012);

    // 很细的雾噪点。
    for (let i = 0; i < 2400; i += 1) {
      g.fillStyle = `rgba(255,244,220,${0.008 + rnd() * 0.024})`;
      g.fillRect(rnd() * w, h * (0.4 + rnd() * 0.55), 0.6 + rnd() * 1.8, 0.4 + rnd() * 1.2);
    }
  });
}

function paintMist(w: number, h: number): HTMLCanvasElement {
  return canvas(w, h, (g) => {
    const rnd = mulberry(3301);
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 34; i += 1) {
      const x = rnd() * w;
      const y = h * (0.58 + rnd() * 0.3);
      const rx = w * (0.04 + rnd() * 0.16);
      const ry = h * (0.008 + rnd() * 0.045);
      const grad = g.createRadialGradient(x, y, 0, x, y, rx);
      grad.addColorStop(0, `rgba(247,239,221,${0.08 + rnd() * 0.16})`);
      grad.addColorStop(0.6, 'rgba(247,239,221,.045)');
      grad.addColorStop(1, 'rgba(247,239,221,0)');
      g.save();
      g.translate(x, y);
      g.scale(1, ry / rx);
      g.fillStyle = grad;
      g.beginPath();
      g.arc(0, 0, rx, 0, TAU);
      g.fill();
      g.restore();
    }
  });
}

function paintBotanical(w: number, h: number): HTMLCanvasElement {
  return canvas(w, h, (g) => {
    g.fillStyle = '#e9dfca';
    g.fillRect(0, 0, w, h);
    const rnd = mulberry(77);
    for (let i = 0; i < 2600; i += 1) {
      g.fillStyle = `rgba(95,78,55,${0.006 + rnd() * 0.018})`;
      g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 1.5, 1);
    }
    // 版面：细双线 + 极轻的版画压痕。
    g.strokeStyle = 'rgba(83,95,68,.40)';
    g.lineWidth = 2;
    g.strokeRect(w * 0.075, h * 0.06, w * 0.85, h * 0.87);
    g.strokeStyle = 'rgba(83,95,68,.22)';
    g.lineWidth = 1;
    g.strokeRect(w * 0.092, h * 0.074, w * 0.816, h * 0.842);

    // 主枝：不是一根细线，而是有粗细变化的墨线。
    g.strokeStyle = 'rgba(47,63,45,.84)';
    g.lineWidth = 4.4;
    g.beginPath();
    g.moveTo(w * 0.50, h * 0.83);
    g.bezierCurveTo(w * 0.44, h * 0.64, w * 0.56, h * 0.36, w * 0.47, h * 0.15);
    g.stroke();
    g.strokeStyle = 'rgba(47,63,45,.42)';
    g.lineWidth = 1.6;
    for (let i = 0; i < 7; i += 1) {
      const t = 0.12 + i * 0.11;
      g.beginPath();
      g.moveTo(w * (0.50 + Math.sin(t * 8) * 0.018), h * (0.82 - t * 0.67));
      g.lineTo(w * (0.535 + Math.sin(t * 6) * 0.03), h * (0.81 - t * 0.67));
      g.stroke();
    }

    const leaves: Array<[number, number, number, number, number]> = [
      [0.46, 0.70, -0.78, 118, 40],
      [0.53, 0.61, 0.72, 126, 42],
      [0.43, 0.51, -0.94, 108, 34],
      [0.55, 0.43, 0.82, 116, 37],
      [0.45, 0.34, -0.80, 98, 32],
      [0.54, 0.27, 0.68, 104, 34],
      [0.48, 0.19, -0.52, 84, 27],
      [0.42, 0.58, -1.22, 84, 28],
    ];
    for (const [x, y, a, len, wid] of leaves) {
      g.save();
      g.translate(w * x, h * y);
      g.rotate(a);
      const grad = g.createLinearGradient(0, 0, -len, 0);
      grad.addColorStop(0, 'rgba(61,82,52,.38)');
      grad.addColorStop(0.5, 'rgba(88,112,70,.56)');
      grad.addColorStop(1, 'rgba(50,70,44,.38)');
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(-len / 2, 0, len / 2, wid / 2, 0, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(40,57,38,.84)';
      g.lineWidth = 2;
      g.stroke();
      // 叶脉和叶柄：远看是墨线，近看有结构。
      g.strokeStyle = 'rgba(40,57,38,.62)';
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(-len, 0);
      g.stroke();
      for (let i = 1; i < 6; i += 1) {
        const t = i / 6;
        const vx = -len * t;
        const vy = Math.sin(t * Math.PI) * wid * 0.33;
        g.beginPath();
        g.moveTo(vx, 0);
        g.lineTo(vx - len * 0.10, -vy);
        g.moveTo(vx, 0);
        g.lineTo(vx - len * 0.10, vy);
        g.stroke();
      }
      g.restore();
    }
    // 右下角一小枝干果，补一点灰绿层次。
    g.strokeStyle = 'rgba(86,73,53,.40)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(w * 0.76, h * 0.68);
    g.bezierCurveTo(w * 0.70, h * 0.58, w * 0.78, h * 0.48, w * 0.75, h * 0.40);
    g.stroke();
    for (let i = 0; i < 5; i += 1) {
      g.fillStyle = `rgba(111,102,72,${0.20 + rnd() * 0.12})`;
      g.beginPath();
      g.ellipse(w * (0.73 + rnd() * 0.06), h * (0.42 + i * 0.055), 7, 4, -0.4, 0, TAU);
      g.fill();
    }
    g.fillStyle = 'rgba(52,62,45,.82)';
    g.font = 'italic 26px Georgia, "Times New Roman", serif';
    g.fillText('Ficus / first light', w * 0.12, h * 0.92);
    g.font = '12px ui-monospace, Menlo, monospace';
    g.fillStyle = 'rgba(52,62,45,.56)';
    g.fillText('PLATE VII · 6:51', w * 0.12, h * 0.955);
  });
}
const LEAF_CELL = { ovate: 0, broad: 1, lance: 2, fern: 3 } as const;
const ATLAS_SIZE = 2048;
const ATLAS_CELL = ATLAS_SIZE / 2;

function drawLeafShape(g: Ctx2D, baseX: number, baseY: number, tipX: number, tipY: number, width: number): void {
  const dx = tipX - baseX;
  const dy = tipY - baseY;
  const nx = -dy;
  const ny = dx;
  const len = Math.hypot(dx, dy) || 1;
  const ux = nx / len;
  const uy = ny / len;
  g.beginPath();
  g.moveTo(baseX, baseY);
  g.bezierCurveTo(
    baseX + ux * width * 0.52 + dx * 0.12,
    baseY + uy * width * 0.52 + dy * 0.12,
    tipX + ux * width * 0.26 - dx * 0.16,
    tipY + uy * width * 0.26 - dy * 0.16,
    tipX,
    tipY,
  );
  g.bezierCurveTo(
    tipX - ux * width * 0.26 - dx * 0.16,
    tipY - uy * width * 0.26 - dy * 0.16,
    baseX - ux * width * 0.52 + dx * 0.12,
    baseY - uy * width * 0.52 + dy * 0.12,
    baseX,
    baseY,
  );
  g.closePath();
}

function paintOneLeaf(
  g: Ctx2D,
  cx: number,
  cy: number,
  cell: number,
  type: 'ovate' | 'broad' | 'lance' | 'fern',
  seed: number,
): void {
  const rnd = mulberry(seed);
  const baseX = cx + cell * 0.5 + (rnd() - 0.5) * cell * 0.035;
  const baseY = cy + cell * 0.865;
  const tipX = cx + cell * 0.5 + (rnd() - 0.5) * cell * 0.09;
  const tipY = cy + cell * (type === 'lance' ? 0.075 : 0.11);
  const width = cell * (
    type === 'ovate' ? 0.27 : type === 'broad' ? 0.39 : type === 'lance' ? 0.14 : 0.22
  );
  const grad = g.createLinearGradient(baseX - width, baseY, tipX + width, tipY);
  const hue = 92 + rnd() * 18;
  grad.addColorStop(0, `hsl(${hue - 6} 24% 21%)`);
  grad.addColorStop(0.34, `hsl(${hue} 25% 28%)`);
  grad.addColorStop(0.72, `hsl(${hue + 4} 27% 34%)`);
  grad.addColorStop(1, `hsl(${hue + 8} 26% 40%)`);
  if (type === 'fern') {
    // 羽状复叶：一条主脉 + 9 对小叶，别用一整片椭圆装成蕨。
    g.strokeStyle = 'rgba(45,64,35,.72)';
    g.lineWidth = Math.max(2, cell * 0.008);
    g.beginPath();
    g.moveTo(baseX, baseY);
    g.quadraticCurveTo(baseX + cell * 0.025, cy + cell * 0.5, tipX, tipY);
    g.stroke();
    for (let i = 0; i < 10; i += 1) {
      const t = 0.08 + i * 0.09;
      const px = baseX + (tipX - baseX) * t;
      const py = baseY + (tipY - baseY) * t;
      const side = i % 2 === 0 ? -1 : 1;
      const lw = width * (0.16 + 0.38 * Math.sin(Math.PI * t));
      const tx = px + side * cell * (0.055 + 0.03 * Math.sin(t * Math.PI));
      const ty = py - cell * 0.03;
      g.fillStyle = `hsl(${hue + 4} 30% ${34 + (i % 3) * 3}%)`;
      g.beginPath();
      g.ellipse((px + tx) / 2, (py + ty) / 2, cell * 0.024, lw * 0.63, side * 0.5, 0, TAU);
      g.fill();
      g.strokeStyle = `rgba(49,70,37,.35)`;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(tx, ty);
      g.stroke();
    }
    return;
  }

  // 主脉 + 侧脉先在叶面上画，填充后再压一层，避免“贴纸”。
  drawLeafShape(g, baseX, baseY, tipX, tipY, width);
  g.fillStyle = grad;
  g.fill();
  g.lineJoin = 'round';
  g.strokeStyle = `hsla(${hue - 8} 34% 20% / .62)`;
  g.lineWidth = Math.max(1.2, cell * 0.0032);
  g.stroke();

  // 侧脉：从主脉分向叶缘，越靠近叶尖越短。
  const dx = tipX - baseX;
  const dy = tipY - baseY;
  const nx = -dy;
  const ny = dx;
  const nlen = Math.hypot(nx, ny) || 1;
  const ux = nx / nlen;
  const uy = ny / nlen;
  g.lineWidth = Math.max(1, cell * 0.0022);
  g.strokeStyle = `hsla(${hue - 3} 30% 22% / .38)`;
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 7; i += 1) {
      const t = 0.12 + i * 0.105;
      const px = baseX + dx * t + ux * width * (0.045 * side);
      const py = baseY + dy * t + uy * width * (0.045 * side);
      const reach = width * (0.36 - t * 0.17);
      const ex = px + ux * reach * side + dx * 0.07;
      const ey = py + uy * reach * side + dy * 0.07;
      g.beginPath();
      g.moveTo(px, py);
      g.quadraticCurveTo(px + (ex - px) * 0.58, py + (ey - py) * 0.72, ex, ey);
      g.stroke();
    }
  }
  g.strokeStyle = `hsla(${hue - 7} 30% 20% / .55)`;
  g.lineWidth = Math.max(1.6, cell * 0.004);
  g.beginPath();
  g.moveTo(baseX, baseY);
  g.quadraticCurveTo(baseX + dx * 0.5 + width * 0.03, baseY + dy * 0.5, tipX, tipY);
  g.stroke();

  // 叶缘的高光/暗边：让叶片有一点厚度。
  g.save();
  drawLeafShape(g, baseX, baseY, tipX, tipY, width);
  g.clip();
  const edgeGlow = g.createLinearGradient(baseX, baseY, tipX, tipY);
  edgeGlow.addColorStop(0, 'rgba(255,240,199,0)');
  edgeGlow.addColorStop(0.55, 'rgba(255,240,199,.07)');
  edgeGlow.addColorStop(1, 'rgba(255,240,199,.16)');
  g.fillStyle = edgeGlow;
  g.fillRect(cx, cy, cell, cell);
  g.restore();

  // 细小的虫眼/磨损，不要太多。
  for (let i = 0; i < 3; i += 1) {
    const t = 0.25 + rnd() * 0.55;
    const px = baseX + dx * t + ux * width * (rnd() - 0.5) * 0.4;
    const py = baseY + dy * t + uy * width * (rnd() - 0.5) * 0.4;
    g.fillStyle = `rgba(25,38,22,${0.1 + rnd() * 0.16})`;
    g.beginPath();
    g.arc(px, py, cell * (0.002 + rnd() * 0.005), 0, TAU);
    g.fill();
  }
}

function paintLeafAtlas(): HTMLCanvasElement {
  return canvas(ATLAS_SIZE, ATLAS_SIZE, (g) => {
    g.clearRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);
    const cells = [
      [0, 0],
      [ATLAS_CELL, 0],
      [0, ATLAS_CELL],
      [ATLAS_CELL, ATLAS_CELL],
    ] as const;
    paintOneLeaf(g, cells[0][0], cells[0][1], ATLAS_CELL, 'ovate', 8811);
    paintOneLeaf(g, cells[1][0], cells[1][1], ATLAS_CELL, 'broad', 9902);
    paintOneLeaf(g, cells[2][0], cells[2][1], ATLAS_CELL, 'lance', 4421);
    paintOneLeaf(g, cells[3][0], cells[3][1], ATLAS_CELL, 'fern', 3307);
  });
}

function cellUv(cell: number, u: number, v: number): [number, number] {
  const col = cell % 2;
  const row = Math.floor(cell / 2);
  // 摄影图集每格都有留白：把 UV 收进叶身，叶卡上就不会出现一圈透明边框。
  const x0 = 0.20;
  const x1 = 0.74;
  const y0 = 0.05;
  const y1 = 0.95;
  const lu = x0 + u * (x1 - x0);
  const lv = y0 + v * (y1 - y0);
  return [(lu + col) / 2, (lv + (1 - row)) / 2];
}

function leafCardGeometry(cell: number): THREE.PlaneGeometry {
  const geo = new THREE.PlaneGeometry(1, 1, 3, 4);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    // 叶面沿长度轻微起伏，侧向再加一点弧度；近看不是一张发票纸。
    pos.setZ(i, Math.cos(y * Math.PI * 0.92) * 0.045 + x * x * 0.035);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i += 1) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    const [nu, nv] = cellUv(cell, u, v);
    uv.setXY(i, nu, nv);
  }
  uv.needsUpdate = true;
  return geo;
}

function leafMaterial(atlas: THREE.Texture): THREE.MeshPhysicalMaterial {
  const mat = new THREE.MeshPhysicalMaterial({
    map: atlas,
    transparent: true,
    alphaTest: 0.24,
    side: THREE.DoubleSide,
    color: new THREE.Color('#ffffff'),
    roughness: 0.82,
    metalness: 0,
    clearcoat: 0.035,
    clearcoatRoughness: 0.70,
    emissive: new THREE.Color('#4f5c36'),
    emissiveMap: atlas,
    emissiveIntensity: 0.06,
    envMapIntensity: 0.18,
    depthWrite: true,
  });
  mat.userData.leafAtlas = true;
  return mat;
}
/** 首帧用程序化叶图集兜底；照片解码后整棵树的叶材质换成摄影图集。 */
function installLeafPhotoAtlas(root: THREE.Object3D): void {
  if (typeof Image === 'undefined' || typeof document === 'undefined') return;
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => {
    const tex = new THREE.Texture(img);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        const mat = m as THREE.MeshPhysicalMaterial;
        if (!mat || !mat.userData?.leafAtlas) continue;
        mat.map = tex;
        mat.emissiveMap = tex;
        mat.needsUpdate = true;
      }
      const depth = mesh.customDepthMaterial as THREE.MeshDepthMaterial | undefined;
      if (depth && depth.map) {
        depth.map = tex;
        depth.needsUpdate = true;
      }
    });
  };
  img.setAttribute('src', LEAF_ATLAS_DATA_URL);
}

function addLeafInstances(
  parent: THREE.Group,
  material: THREE.Material,
  cell: number,
  items: Array<{ x: number; y: number; z: number; sx: number; sy: number; yaw: number; pitch: number; roll: number; tint?: number }>,
  name: string,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(leafCardGeometry(cell), material, items.length);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const color = new THREE.Color();
  items.forEach((it, i) => {
    p.set(it.x, it.y, it.z);
    e.set(it.pitch, it.yaw, it.roll);
    q.setFromEuler(e);
    s.set(it.sx, it.sy, it.sx);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    if (it.tint !== undefined) {
      if (it.tint > 0.86) color.setRGB(0.72, 0.63, 0.40);
      else color.setRGB(0.52 + it.tint * 0.12, 0.58 + it.tint * 0.10, 0.45 + it.tint * 0.06);
      mesh.setColorAt(i, color);
    }
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  // 叶卡是 alphaTest 材质；阴影必须带同一张 alpha 图，否则会投出一片方块。
  mesh.customDepthMaterial = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    map: (material as THREE.MeshPhysicalMaterial).map,
    alphaTest: 0.42,
  });
  mesh.frustumCulled = false;
  parent.add(mesh);
  return mesh;
}

function addStem(
  parent: THREE.Group,
  from: THREE.Vector3,
  to: THREE.Vector3,
  radius: number,
  material: THREE.Material,
  curve = 0.08,
): void {
  const mid = from.clone().lerp(to, 0.56);
  mid.x += curve;
  mid.z -= curve * 0.45;
  const path = new THREE.CatmullRomCurve3([from, mid, to]);
  const geo = new THREE.TubeGeometry(path, 10, radius, 6, false);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
}

let contactShadowTexture: THREE.Texture | null = null;
let plantShadowTexture: THREE.Texture | null = null;

function ensureContactShadowTexture(): THREE.Texture {
  if (!contactShadowTexture) contactShadowTexture = texture(paintContactShadow(256), 1, 1, 4);
  return contactShadowTexture;
}

function ensurePlantShadowTexture(): THREE.Texture {
  if (!plantShadowTexture) plantShadowTexture = texture(paintPlantWallShadow(512, 512), 1, 1, 4);
  return plantShadowTexture;
}

/** 桌面接触阴影：在实时阴影之外补一层很近的暗，物件才不会“浮在桌面上”。 */
function addContactShadow(
  parent: THREE.Group,
  x: number,
  z: number,
  w: number,
  d: number,
  y: number,
  opacity = 0.5,
  rotation = 0,
  tex?: THREE.Texture,
): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({
    map: tex ?? ensureContactShadowTexture(),
    transparent: true,
    opacity,
    depthWrite: false,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  mesh.name = 'contact-shadow';
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = rotation;
  mesh.position.set(x, y, z);
  mesh.renderOrder = 2;
  parent.add(mesh);
  return mesh;
}

/** 墙上的软影：镜子、植物、桌沿和墙之间需要一层遮挡，不然墙是剪纸。 */
function addWallShadow(
  parent: THREE.Group,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  opacity = 0.32,
  tex?: THREE.Texture,
): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({
    map: tex ?? ensureContactShadowTexture(),
    transparent: true,
    opacity,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.name = 'wall-shadow';
  mesh.position.set(x, y, z);
  mesh.renderOrder = 1;
  parent.add(mesh);
  return mesh;
}

function addLightShaft(
  parent: THREE.Group,
  wx: number,
  wy: number,
  zf: number,
  ww: number,
  wh: number,
  dx: number,
  opacity: number,
): THREE.Mesh {
  const geo = new THREE.BufferGeometry();
  const topL = [wx - ww * 0.44 + dx, wy + wh * 0.47, zf + 0.032];
  const topR = [wx + ww * 0.44 + dx, wy + wh * 0.47, zf + 0.032];
  const botL = [wx - ww * 0.5 + 0.29 + dx * 1.7, DESK_Y + 0.018, 0.58];
  const botR = [wx + ww * 0.5 + 0.17 + dx * 1.7, DESK_Y + 0.018, 0.58];
  geo.setAttribute('position', new THREE.Float32BufferAttribute([
    ...topL, ...topR, ...botL, ...botR,
  ], 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([
    0, 1, 1, 1, 0, 0, 1, 0,
  ], 2));
  geo.setIndex([0, 2, 1, 2, 3, 1]);
  geo.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({
    map: texture(paintShaft(256, 512), 1, 1, 4),
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'window-shaft';
  mesh.renderOrder = 3;
  parent.add(mesh);
  return mesh;
}

function addWallClock(parent: THREE.Group, brass: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  group.name = 'wall-clock';
  const x = 3.40;
  const y = 1.17;
  const z = -0.078;
  const r = 0.095;
  const faceMat = new THREE.MeshBasicMaterial({
    map: texture(paintClockFace(256, 256), 1, 1, 8),
    toneMapped: false,
  });
  const face = new THREE.Mesh(new THREE.CircleGeometry(r, 48), faceMat);
  face.position.set(x, y, z);
  group.add(face);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r + 0.006, 0.006, 8, 40), brass);
  ring.position.set(x, y, z + 0.001);
  group.add(ring);
  // 把指针拨到 6:51，和左上角的 HUD 对得上；一根竖线一根斜线会读成假表。
  const hand = (len: number, width: number, deg: number, material: THREE.Material, dz: number): void => {
    const theta = (deg * Math.PI) / 180;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, len, 0.0015), material);
    mesh.position.set(x + Math.cos(theta) * len * 0.5, y + Math.sin(theta) * len * 0.5, z + dz);
    mesh.rotation.z = theta - Math.PI / 2;
    group.add(mesh);
  };
  const ink = new THREE.MeshBasicMaterial({ color: '#3e3327' });
  hand(0.066, 0.0024, 144, ink, 0.0045);
  hand(0.042, 0.0040, -115.5, ink, 0.0050);
  const secondMat = new THREE.MeshBasicMaterial({ color: '#8d3b2e' });
  hand(0.074, 0.0012, 90, secondMat, 0.0055);
  const counter = new THREE.Mesh(new THREE.BoxGeometry(0.0018, 0.009, 0.0012), secondMat);
  counter.position.set(x, y - 0.013, z + 0.0055);
  group.add(counter);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 12, 8), brass);
  cap.position.set(x, y, z + 0.0068);
  group.add(cap);
  parent.add(group);
  return group;
}

function makePot(
  parent: THREE.Group,
  x: number,
  z: number,
  rTop: number,
  rBot: number,
  h: number,
  glaze: THREE.Material,
  baseY = DESK_Y,
): THREE.Group {
  const pot = new THREE.Group();
  pot.name = 'ceramic-pot';
  pot.position.set(x, baseY, z);
  const saucer = new THREE.Mesh(new THREE.CylinderGeometry(rTop * 1.2, rTop * 1.12, 0.012, 30), glaze);
  saucer.position.y = 0.006;
  saucer.castShadow = true;
  saucer.receiveShadow = true;
  pot.add(saucer);
  // 陶盆不是直筒：下腹略鼓，口沿收一点，再用 LatheGeometry 才像拉坯。
  const profile = [
    new THREE.Vector2(rBot, 0.012),
    new THREE.Vector2(rBot * 1.04, h * 0.14),
    new THREE.Vector2(rBot * 1.1, h * 0.45),
    new THREE.Vector2(rTop * 0.98, h * 0.82),
    new THREE.Vector2(rTop, h),
  ];
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 30), glaze);
  body.castShadow = true;
  body.receiveShadow = true;
  pot.add(body);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(rTop * 0.96, rTop * 0.075, 8, 30), glaze);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = h;
  rim.castShadow = true;
  pot.add(rim);
  const innerLip = new THREE.Mesh(
    new THREE.CircleGeometry(rTop * 0.91, 30),
    new THREE.MeshStandardMaterial({ color: '#241b14', roughness: 0.96, metalness: 0 }),
  );
  innerLip.rotation.x = -Math.PI / 2;
  innerLip.position.y = h - 0.008;
  innerLip.receiveShadow = true;
  pot.add(innerLip);
  const soil = new THREE.Mesh(
    new THREE.CircleGeometry(rTop * 0.86, 30),
    new THREE.MeshStandardMaterial({ color: '#312116', roughness: 1, metalness: 0 }),
  );
  soil.rotation.x = -Math.PI / 2;
  soil.position.y = h - 0.004;
  soil.receiveShadow = true;
  pot.add(soil);
  // 几粒赤陶/火山石，近看盆土不是一块圆盘。
  const pebbleMat = new THREE.MeshStandardMaterial({ color: '#6e5a43', roughness: 0.95, metalness: 0.01 });
  const pebbles = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.006, 0), pebbleMat, 11);
  pebbles.castShadow = true;
  pebbles.receiveShadow = true;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const rnd = mulberry(998);
  for (let i = 0; i < 11; i += 1) {
    const a = rnd() * TAU;
    const rr = rTop * (0.1 + rnd() * 0.72);
    p.set(Math.cos(a) * rr, h + 0.002 + rnd() * 0.004, Math.sin(a) * rr);
    e.set(rnd() * 0.4, rnd() * TAU, rnd() * 0.4);
    q.setFromEuler(e);
    sc.set(0.7 + rnd() * 0.7, 0.5 + rnd() * 0.6, 0.7 + rnd() * 0.7);
    m.compose(p, q, sc);
    pebbles.setMatrixAt(i, m);
  }
  pebbles.instanceMatrix.needsUpdate = true;
  pot.add(pebbles);
  parent.add(pot);
  return pot;
}

function addFicus(parent: THREE.Group, atlas: THREE.Texture, x: number, z: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'plant-ficus';
  parent.add(group);
  const sway = new THREE.Group();
  sway.name = 'ficus-sway';
  group.add(sway);
  const glaze = new THREE.MeshPhysicalMaterial({
    map: texture(paintCeramic(1024, 512), 2.1, 1.1, 8),
    bumpMap: dataTexture(paintCeramicHeight(512, 256), 2.1, 1.1, 4),
    bumpScale: 0.0017,
    color: '#f5e8d8',
    roughness: 0.38,
    metalness: 0.02,
    clearcoat: 0.55,
    clearcoatRoughness: 0.42,
    envMapIntensity: 0.38,
  });
  makePot(group, x, z, 0.068, 0.05, 0.132, glaze);
  const bark = new THREE.MeshStandardMaterial({ color: '#4b3827', roughness: 0.92, metalness: 0.01 });
  const rnd = mulberry(881);
  const base = new THREE.Vector3(x, DESK_Y + 0.135, z);
  const trunkTop = new THREE.Vector3(x + 0.012, DESK_Y + 0.355, z + 0.006);
  addStem(sway, base, trunkTop, 0.011, bark, 0.008);
  const tips: THREE.Vector3[] = [trunkTop];
  const anchors: THREE.Vector3[] = [];
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * TAU + 0.35 + rnd() * 0.30;
    const spread = 0.125 + rnd() * 0.065;
    const tip = new THREE.Vector3(
      x + Math.cos(a) * spread,
      DESK_Y + 0.44 + rnd() * 0.08,
      z + Math.sin(a) * spread * 0.62,
    );
    addStem(sway, trunkTop, tip, 0.0055 + rnd() * 0.002, bark, 0.022);
    tips.push(tip);
    for (const t of [0.42, 0.64, 0.80]) anchors.push(trunkTop.clone().lerp(tip, t));
    // 每条主枝再分两条小枝，树冠不再是从一个点炸开的六根筷子。
    for (let k = 0; k < 2; k += 1) {
      const t = 0.54 + k * 0.2;
      const from = trunkTop.clone().lerp(tip, t);
      const a2 = a + (k === 0 ? -0.46 : 0.46) + (rnd() - 0.5) * 0.25;
      const subTip = new THREE.Vector3(
        from.x + Math.cos(a2) * (0.07 + rnd() * 0.05),
        DESK_Y + 0.40 + rnd() * 0.06,
        from.z + Math.sin(a2) * (0.07 + rnd() * 0.05),
      );
      addStem(sway, from, subTip, 0.0032 + rnd() * 0.0015, bark, 0.016);
      tips.push(subTip);
      anchors.push(from.clone().lerp(subTip, 0.62));
    }
  }

  const itemsByCell: Record<number, Array<{ x: number; y: number; z: number; sx: number; sy: number; yaw: number; pitch: number; roll: number; tint?: number }>> = {
    [LEAF_CELL.ovate]: [],
    [LEAF_CELL.broad]: [],
    [LEAF_CELL.lance]: [],
  };
  const addLeafItem = (cell: number, pos: THREE.Vector3, scale: number, outward: number): void => {
    itemsByCell[cell]!.push({
      x: pos.x,
      y: pos.y,
      z: pos.z,
      sx: scale,
      sy: scale * (0.9 + rnd() * 0.22),
      yaw: outward + (rnd() - 0.5) * 1.5,
      // 叶面朝上/朝镜头，而不是像刀片一样侧着。相机在桌面上方，
      // 大部分叶子应该能看见叶面，只有少数翻过去露出背面。
      pitch: -1.02 + (rnd() - 0.5) * 0.72,
      roll: (rnd() - 0.5) * 0.9,
      tint: rnd(),
    });
  };
  // 枝端：每根枝头一簇单叶，不再用一张“整簇”贴纸。
  for (const tip of tips) {
    for (let k = 0; k < 12; k += 1) {
      const a = rnd() * TAU;
      const rr = 0.012 + rnd() * 0.065;
      const pos = new THREE.Vector3(
        tip.x + Math.cos(a) * rr,
        tip.y + (rnd() - 0.5) * 0.075,
        tip.z + Math.sin(a) * rr * 0.62,
      );
      const cell = k < 6 ? LEAF_CELL.ovate : k < 10 ? LEAF_CELL.broad : LEAF_CELL.lance;
      addLeafItem(cell, pos, 0.068 + rnd() * 0.052, a + Math.PI * 0.5);
    }
  }
  // 沿枝的叶片：真榕树的叶子长在枝上，不只是枝头像插花。
  for (const anchor of anchors) {
    for (let k = 0; k < 3; k += 1) {
      const a = rnd() * TAU;
      const rr = 0.008 + rnd() * 0.032;
      const pos = new THREE.Vector3(
        anchor.x + Math.cos(a) * rr,
        anchor.y + (rnd() - 0.5) * 0.035,
        anchor.z + Math.sin(a) * rr * 0.7,
      );
      addLeafItem(k === 0 ? LEAF_CELL.broad : LEAF_CELL.ovate, pos, 0.058 + rnd() * 0.036, a + Math.PI * 0.5);
    }
  }
  // 冠内的叶片：让树冠有体积，不是只有轮廓。
  for (let i = 0; i < 44; i += 1) {
    const a = rnd() * TAU;
    const rr = 0.04 + rnd() * 0.19;
    const pos = new THREE.Vector3(
      x + Math.cos(a) * rr,
      DESK_Y + 0.28 + rnd() * 0.23,
      z + Math.sin(a) * rr * 0.58,
    );
    addLeafItem(rnd() > 0.55 ? LEAF_CELL.broad : LEAF_CELL.ovate, pos, 0.060 + rnd() * 0.048, a + Math.PI * 0.5);
  }
  // 外轮廓的一圈叶：让树冠边缘不是几根枝头插着叶。
  for (let i = 0; i < 34; i += 1) {
    const a = (i / 34) * TAU + rnd() * 0.22;
    const rr = 0.15 + rnd() * 0.10;
    const pos = new THREE.Vector3(
      x + Math.cos(a) * rr,
      DESK_Y + 0.36 + rnd() * 0.17,
      z + Math.sin(a) * rr * 0.62,
    );
    addLeafItem(i % 3 === 0 ? LEAF_CELL.lance : (i % 2 === 0 ? LEAF_CELL.broad : LEAF_CELL.ovate), pos, 0.055 + rnd() * 0.040, a + Math.PI * 0.5);
  }
  const mat = leafMaterial(atlas);
  addLeafInstances(sway, mat, LEAF_CELL.ovate, itemsByCell[LEAF_CELL.ovate]!, 'ficus-ovate');
  addLeafInstances(sway, mat, LEAF_CELL.broad, itemsByCell[LEAF_CELL.broad]!, 'ficus-broad');
  addLeafInstances(sway, mat, LEAF_CELL.lance, itemsByCell[LEAF_CELL.lance]!, 'ficus-lance');
  return group;
}

function addFern(parent: THREE.Group, atlas: THREE.Texture, x: number, z: number, baseY = DESK_Y, scale = 1): THREE.Group {
  const group = new THREE.Group();
  group.name = 'plant-fern';
  parent.add(group);
  const glaze = new THREE.MeshPhysicalMaterial({
    color: '#9b5f46',
    roughness: 0.52,
    metalness: 0.01,
    clearcoat: 0.22,
    clearcoatRoughness: 0.7,
    envMapIntensity: 0.35,
  });
  makePot(group, x, z, 0.044 * scale, 0.034 * scale, 0.082 * scale, glaze, baseY);
  const rnd = mulberry(313);
  const items: Array<{ x: number; y: number; z: number; sx: number; sy: number; yaw: number; pitch: number; roll: number; tint?: number }> = [];
  for (let i = 0; i < 9; i += 1) {
    const a = (i / 9) * TAU + rnd() * 0.4;
    const rr = 0.02 + rnd() * 0.05;
    const leafScale = (0.075 + rnd() * 0.045) * scale;
    items.push({
      x: x + Math.cos(a) * rr,
      y: baseY + 0.08 * scale + rnd() * 0.05,
      z: z + Math.sin(a) * rr * 0.8,
      sx: leafScale * 0.7,
      sy: leafScale,
      yaw: a + Math.PI * 0.5,
      pitch: -0.1 + rnd() * 0.7,
      roll: (rnd() - 0.5) * 0.7,
      tint: rnd(),
    });
  }
  addLeafInstances(group, leafMaterial(atlas), LEAF_CELL.fern, items, 'fern-leaves');
  return group;
}

function buildDesk(wood: THREE.Material, woodSmall: THREE.Material, leather: THREE.Material, brass: THREE.Material, darkWood: THREE.Material): THREE.Group {
  const desk = new THREE.Group();
  desk.name = 'desk';
  const top = new THREE.Mesh(new RoundedBoxGeometry(1.5, 0.044, 0.78, 4, 0.014), wood);
  top.name = 'deskTop';
  top.position.set(3.17, DESK_Y - 0.022, 0.355);
  top.castShadow = false;
  top.receiveShadow = true;
  desk.add(top);

  // 桌沿下的一道薄木裙，正面看不会是一块悬空的板。
  const apron = new THREE.Mesh(new RoundedBoxGeometry(1.4, 0.082, 0.7, 3, 0.008), darkWood);
  apron.position.set(3.17, DESK_Y - 0.068, 0.36);
  apron.castShadow = true;
  apron.receiveShadow = true;
  desk.add(apron);

  // 右侧抽屉柜：两格抽屉，黄铜拉手与薄薄一道压边。
  const pedestal = new THREE.Mesh(new RoundedBoxGeometry(0.4, 0.3, 0.65, 3, 0.01), darkWood);
  pedestal.position.set(3.71, DESK_Y - 0.175, 0.36);
  pedestal.castShadow = true;
  pedestal.receiveShadow = true;
  desk.add(pedestal);
  for (const y of [DESK_Y - 0.105, DESK_Y - 0.242]) {
    const front = new THREE.Mesh(new RoundedBoxGeometry(0.35, 0.105, 0.022, 3, 0.006), woodSmall);
    front.position.set(3.71, y, 0.69);
    front.castShadow = true;
    front.receiveShadow = true;
    desk.add(front);
    const pull = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.055, 12), brass);
    pull.rotation.z = Math.PI / 2;
    pull.position.set(3.71, y, 0.703);
    pull.castShadow = true;
    desk.add(pull);
    for (const x of [3.66, 3.76]) {
      const mount = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 8), brass);
      mount.position.set(x, y, 0.700);
      desk.add(mount);
    }
  }
  const keyhole = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.004, 12), brass);
  keyhole.rotation.x = Math.PI / 2;
  keyhole.position.set(3.71, DESK_Y - 0.31, 0.703);
  desk.add(keyhole);

  // 四条轻微外撇的锥形腿 + 黄铜脚箍；桌脚落地要有接触阴影。
  const legTops: Array<[number, number]> = [
    [2.51, 0.03],
    [3.83, 0.03],
    [2.51, 0.685],
    [3.83, 0.685],
  ];
  for (const [x, z] of legTops) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.017, 0.705, 12, 1), darkWood);
    leg.position.set(x, 0.3525, z);
    leg.castShadow = true;
    leg.receiveShadow = true;
    desk.add(leg);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.021, 0.032, 12), brass);
    foot.position.set(x, 0.018, z);
    foot.castShadow = true;
    desk.add(foot);
    addContactShadow(desk, x, z, 0.12, 0.12, 0.003, 0.34);
  }

  // 深绿皮革桌垫。纸只比它高 0.5mm；这块垫子负责把纸从木色里托出来。
  const blotter = new THREE.Mesh(new RoundedBoxGeometry(0.96, 0.004, 0.67, 3, 0.012), leather);
  blotter.name = 'blotter';
  blotter.position.set(3.15, DESK_Y + 0.002, 0.38);
  blotter.receiveShadow = true;
  desk.add(blotter);

  // 桌垫四角的黄铜小钉。
  for (const [dx, dz] of [
    [-0.39, -0.26],
    [0.39, -0.26],
    [-0.39, 0.26],
    [0.39, 0.26],
  ] as const) {
    const stud = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0085, 0.003, 10), brass);
    stud.position.set(3.15 + dx, DESK_Y + 0.0055, 0.38 + dz);
    desk.add(stud);
  }
  // 桌垫内圈的压金线：让这块深绿不是一块色块，而是一张有做工的皮垫。
  for (const [dx, dz, sx, sz] of [
    [0, -0.315, 0.90, 0.0028],
    [0, 0.315, 0.90, 0.0028],
    [-0.46, 0, 0.0028, 0.63],
    [0.46, 0, 0.0028, 0.63],
  ] as const) {
    const rule = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.0012, sz), brass);
    rule.position.set(3.15 + dx, DESK_Y + 0.0046, 0.38 + dz);
    desk.add(rule);
  }
  // 落在桌沿的晨光。它被桌垫和纸压住，只在木面边缘露出来；
  // 这点不完整的窗棂光，比在纸面上叠一层假光更像真实房间。
  const sunPatch = new THREE.Mesh(
    new THREE.PlaneGeometry(1.48, 0.78),
    new THREE.MeshBasicMaterial({
      map: texture(paintSunPatch(1024, 512), 1, 1, 4),
      transparent: true,
      opacity: 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  sunPatch.name = 'sun-patch';
  sunPatch.rotation.x = -Math.PI / 2;
  sunPatch.rotation.z = -0.12;
  sunPatch.position.set(3.18, DESK_Y + 0.0002, 0.365);
  sunPatch.renderOrder = -1;
  desk.add(sunPatch);
  return desk;
}

function buildRoom(
  plaster: THREE.Material,
  wood: THREE.Material,
  floorMat: THREE.Material,
  frame: THREE.Material,
  brass: THREE.Material,
  rug: THREE.Material,
  sky: THREE.Material,
  art: THREE.Material,
  curtain: THREE.Material,
  glass: THREE.Material,
): { room: THREE.Group; curtainMesh: THREE.Mesh } {
  const room = new THREE.Group();
  room.name = 'room';

  const wall = new THREE.Mesh(new THREE.PlaneGeometry(8.0, 2.7), plaster);
  wall.name = 'back-wall';
  wall.position.set(3.0, 1.35, -0.12);
  wall.receiveShadow = true;
  wall.castShadow = false;
  room.add(wall);

  const side = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 2.7), plaster);
  side.name = 'side-wall';
  side.rotation.y = Math.PI / 2;
  side.position.set(1.77, 1.35, 0.95);
  side.receiveShadow = true;
  room.add(side);

  // 地板必须铺满画面右侧，否则相机一偏就露出背景色，像房间缺一角。
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8.0, 3.4), floorMat);
  floor.name = 'floor';
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(3.0, 0, 1.38);
  floor.receiveShadow = true;
  room.add(floor);

  const rugMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.38), rug);
  rugMesh.name = 'rug';
  rugMesh.rotation.x = -Math.PI / 2;
  rugMesh.position.set(3.0, 0.006, 0.58);
  rugMesh.receiveShadow = true;
  room.add(rugMesh);
  // 地毯边缘的一道暗缝，避免变成贴在地板上的贴纸。
  const rugEdge = new THREE.Mesh(
    new THREE.PlaneGeometry(2.34, 1.42),
    new THREE.MeshBasicMaterial({ color: '#2a1d16', transparent: true, opacity: 0.23, depthWrite: false }),
  );
  rugEdge.rotation.x = -Math.PI / 2;
  rugEdge.position.set(3.0, 0.0052, 0.58);
  room.add(rugEdge);
  const fringe = new THREE.Mesh(
    new THREE.PlaneGeometry(2.32, 0.085),
    new THREE.MeshBasicMaterial({
      map: texture(paintRugFringe(1024, 128), 1, 1, 8),
      transparent: true,
      alphaTest: 0.18,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    }),
  );
  fringe.name = 'rug-fringe';
  fringe.rotation.x = -Math.PI / 2;
  fringe.position.set(3.0, 0.0048, 1.294);
  room.add(fringe);

  const baseboard = new THREE.Mesh(new RoundedBoxGeometry(8.0, 0.105, 0.035, 2, 0.004), wood);
  baseboard.position.set(3.0, 0.052, -0.088);
  baseboard.receiveShadow = true;
  room.add(baseboard);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(8.0, 0.018, 0.022), brass);
  rail.position.set(3.0, 0.11, -0.083);
  room.add(rail);

  // 低窗：窗台在桌面之上 8cm，窗顶 1.47m；写字时抬眼就能看到晨雾。
  const wx = 2.68;
  const wy = 1.12;
  const ww = 1.02;
  const wh = 0.63;
  const zf = -0.064;
  const view = new THREE.Mesh(new THREE.PlaneGeometry(ww + 0.04, wh + 0.04), sky);
  view.name = 'window-view';
  view.position.set(wx, wy, -0.107);
  view.receiveShadow = false;
  room.add(view);

  // 窗外雾层：两层半透明，缓慢横移；窗景有空气，不是一张渐变纸。
  for (const [dy, dz, op, sc] of [[0.00, -0.098, 0.10, 1.0], [-0.055, -0.095, 0.06, 1.28]] as const) {
    const mist = new THREE.Mesh(new THREE.PlaneGeometry(ww + 0.14, wh + 0.1), new THREE.MeshBasicMaterial({
      map: texture(paintMist(512, 320), 1, 1, 4),
      transparent: true,
      opacity: op,
      depthWrite: false,
      toneMapped: false,
    }));
    mist.name = 'window-mist';
    mist.position.set(wx + 0.08 * sc, wy + dy, dz);
    mist.renderOrder = 1;
    room.add(mist);
  }

  const frameParts: Array<[number, number, number, number, number, number, boolean]> = [
    [ww + 0.13, 0.064, 0.062, wx, wy + wh / 2 + 0.032, zf, false],
    [ww + 0.13, 0.064, 0.062, wx, wy - wh / 2 - 0.032, zf, false],
    [0.064, wh + 0.128, 0.062, wx - ww / 2 - 0.032, wy, zf, false],
    [0.064, wh + 0.128, 0.062, wx + ww / 2 + 0.032, wy, zf, false],
    [0.026, wh, 0.042, wx - 0.004, wy, zf + 0.012, false],
    [ww, 0.026, 0.042, wx, wy + 0.002, zf + 0.012, false],
    [ww, 0.010, 0.012, wx, wy + wh / 2 - 0.007, zf + 0.034, true],
  ];
  for (const [bw, bh, bd, x, y, z, inner] of frameParts) {
    const bar = new THREE.Mesh(new RoundedBoxGeometry(bw, bh, bd, 2, 0.0035), inner ? brass : frame);
    bar.position.set(x, y, z);
    bar.castShadow = true;
    bar.receiveShadow = true;
    room.add(bar);
  }
  // 窗洞内侧的暗缝，让窗框有厚度，不是贴墙的白条。
  const reveal = new THREE.Mesh(
    new THREE.PlaneGeometry(ww + 0.012, wh + 0.012),
    new THREE.MeshBasicMaterial({ color: '#4b4032', transparent: true, opacity: 0.08, depthWrite: false }),
  );
  reveal.position.set(wx, wy, zf + 0.002);
  room.add(reveal);

  // 玻璃：真实反射来自环境贴图；再加一层很淡的冷色反光，不要把窗外压黑。
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(ww - 0.008, wh - 0.008), glass);
  pane.name = 'window-glass';
  pane.position.set(wx, wy, zf + 0.024);
  pane.renderOrder = 4;
  room.add(pane);
  // 边缘的潮气/手印，只在四角和局部；透明度很低。
  const frost = new THREE.Mesh(new THREE.PlaneGeometry(ww - 0.01, wh - 0.01), new THREE.MeshBasicMaterial({
    map: texture(paintFrost(512, 320), 1, 1, 4),
    transparent: true,
    opacity: 0.09,
    depthWrite: false,
    toneMapped: false,
  }));
  frost.name = 'window-frost';
  frost.position.set(wx, wy, zf + 0.026);
  frost.renderOrder = 5;
  room.add(frost);

  const sill = new THREE.Mesh(new RoundedBoxGeometry(ww + 0.19, 0.052, 0.18, 3, 0.005), plaster);
  sill.position.set(wx, wy - wh / 2 - 0.070, -0.003);
  sill.castShadow = false;
  sill.receiveShadow = true;
  room.add(sill);
  const sillShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(ww + 0.02, 0.028),
    new THREE.MeshBasicMaterial({ color: '#3b3024', transparent: true, opacity: 0.24, depthWrite: false }),
  );
  sillShadow.position.set(wx, wy - wh / 2 - 0.098, -0.002);
  room.add(sillShadow);
  // 黄铜窗把手：一个很小的横向把手，给窗一个“能开”的细节。
  const latch = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.052, 10), brass);
  latch.rotation.z = Math.PI / 2;
  latch.position.set(wx + 0.07, wy - 0.018, zf + 0.047);
  room.add(latch);

  // 亚麻窗帘，挂在窗两侧；褶皱是几何起伏，不是一张透明贴图。
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.30, 12), brass);
  rod.rotation.z = Math.PI / 2;
  rod.position.set(wx, wy + wh / 2 + 0.070, zf + 0.067);
  room.add(rod);
  for (const side of [-1, 1]) {
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), brass);
    finial.position.set(wx + side * 0.65, wy + wh / 2 + 0.070, zf + 0.067);
    room.add(finial);
  }
  const curtainGeo = new THREE.PlaneGeometry(0.42, 1.03, 30, 2);
  const cpos = curtainGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < cpos.count; i += 1) {
    const x = cpos.getX(i);
    const y = cpos.getY(i);
    cpos.setZ(i, Math.sin(x * 25 + 1.4) * 0.022 + Math.sin(x * 11 - 0.6) * 0.009 + y * 0.003);
  }
  curtainGeo.computeVertexNormals();
  const curtainMesh = new THREE.Mesh(curtainGeo, curtain);
  curtainMesh.name = 'curtain';
  curtainMesh.position.set(wx - ww / 2 - 0.12, wy + 0.040, zf + 0.075);
  curtainMesh.castShadow = false;
  curtainMesh.receiveShadow = true;
  room.add(curtainMesh);
  const curtainRight = new THREE.Mesh(curtainGeo.clone(), curtain);
  curtainRight.name = 'curtain-right';
  curtainRight.position.set(wx + ww / 2 + 0.12, wy + 0.040, zf + 0.075);
  curtainRight.rotation.y = Math.PI;
  curtainRight.castShadow = false;
  curtainRight.receiveShadow = true;
  room.add(curtainRight);

  // 墙上的一张植物学版画：细黄铜框、暖纸、低饱和的绿。
  const fx = 3.62;
  const fy = 1.02;
  const fw = 0.32;
  const fh = 0.42;
  const matBoard = new THREE.Mesh(
    new THREE.PlaneGeometry(fw + 0.018, fh + 0.018),
    new THREE.MeshStandardMaterial({ color: '#c9b99b', roughness: 1, metalness: 0 }),
  );
  matBoard.position.set(fx, fy, -0.083);
  matBoard.receiveShadow = true;
  room.add(matBoard);
  const print = new THREE.Mesh(new THREE.PlaneGeometry(fw - 0.034, fh - 0.034), art);
  print.position.set(fx, fy, -0.079);
  room.add(print);
  for (const [bw, bh, x, y] of [
    [fw, 0.014, fx, fy + fh / 2],
    [fw, 0.014, fx, fy - fh / 2],
    [0.014, fh, fx - fw / 2, fy],
    [0.014, fh, fx + fw / 2, fy],
  ] as const) {
    const bar = new THREE.Mesh(new RoundedBoxGeometry(bw, bh, 0.022, 2, 0.003), brass);
    bar.position.set(x, y, -0.070);
    bar.castShadow = true;
    room.add(bar);
  }
  // 玻璃反光只压在画面上方，不遮住版画本身。
  const printGlass = new THREE.Mesh(
    new THREE.PlaneGeometry(fw - 0.03, fh - 0.03),
    new THREE.MeshPhysicalMaterial({
      color: '#d8e2da',
      roughness: 0.08,
      metalness: 0,
      transparent: true,
      opacity: 0.035,
      depthWrite: false,
      envMapIntensity: 1.2,
    }),
  );
  printGlass.position.set(fx, fy, -0.073);
  printGlass.renderOrder = 3;
  room.add(printGlass);

  addWallClock(room, brass);
  addWallShadow(room, 3.04, DESK_Y + 0.012, -0.084, 1.9, 0.18, 0.24);
  addWallShadow(room, 3.03, 0.060, -0.084, 2.2, 0.10, 0.18);

  return { room, curtainMesh };
}

function addWallKeys(parent: THREE.Group, brass: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  group.name = 'wall-keys';
  const x = 4.86;
  const y = 0.872;
  const z = -0.072;
  const hook = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.005, 0.014, 10), brass);
  hook.rotation.x = Math.PI / 2;
  hook.position.set(x, y, z);
  group.add(hook);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0032, 8, 18), brass);
  ring.position.set(x, y - 0.017, z + 0.002);
  group.add(ring);
  const keyMat = new THREE.MeshStandardMaterial({ color: '#e2c07b', roughness: 0.34, metalness: 0.9, envMapIntensity: 1.0 });
  const keySteel = new THREE.MeshStandardMaterial({ color: '#77715f', roughness: 0.36, metalness: 0.85, envMapIntensity: 0.9 });
  const addKey = (ox: number, oy: number, yaw: number, mat: THREE.Material, scale: number): void => {
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.0024, 7, 16), mat);
    bow.position.set(x + ox, y + oy, z + 0.003);
    bow.rotation.z = yaw;
    bow.scale.setScalar(scale);
    group.add(bow);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0024, 0.0024, 0.052 * scale, 8), mat);
    shaft.position.set(x + ox + Math.sin(yaw) * 0.004, y + oy - 0.034 * scale, z + 0.003);
    shaft.rotation.z = yaw * 0.55 - 0.08;
    group.add(shaft);
    const bit = new THREE.Mesh(new THREE.BoxGeometry(0.012 * scale, 0.004 * scale, 0.005), mat);
    bit.position.set(x + ox + 0.007 * scale, y + oy - 0.058 * scale, z + 0.003);
    bit.rotation.z = yaw * 0.55 - 0.08;
    group.add(bit);
  };
  addKey(0.002, -0.034, -0.10, keyMat, 1.0);
  addKey(0.024, -0.045, 0.18, keySteel, 0.92);
  // 一枚旧行李牌，给“签发台”一个可读的身份线索。
  const tag = new THREE.Mesh(
    new THREE.BoxGeometry(0.030, 0.040, 0.0015),
    new THREE.MeshStandardMaterial({ color: '#d6c3a2', roughness: 0.94, metalness: 0 }),
  );
  tag.position.set(x + 0.002, y - 0.108, z + 0.002);
  tag.rotation.z = 0.10;
  group.add(tag);
  const tagFace = new THREE.Mesh(new THREE.PlaneGeometry(0.027, 0.037), new THREE.MeshBasicMaterial({
    map: texture(paintKeyTag(256, 384), 1, 1, 4),
    transparent: true,
    toneMapped: false,
  }));
  tagFace.position.set(x + 0.002, y - 0.108, z + 0.0028);
  tagFace.rotation.z = 0.10;
  group.add(tagFace);
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.045, 6), new THREE.MeshStandardMaterial({ color: '#5b4b37', roughness: 0.9 }));
  cord.position.set(x + 0.001, y - 0.088, z + 0.002);
  group.add(cord);
  addWallShadow(group, x, y - 0.06, z - 0.002, 0.07, 0.22, 0.16);
  group.position.set(0, 0, 0);
  parent.add(group);
  return group;
}

function addWallCertificate(
  parent: THREE.Group,
  frameMat: THREE.Material,
  brass: THREE.Material,
  paperMat: THREE.Material,
  glassMat: THREE.Material,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'wall-certificate';
  const x = 4.86;
  const y = 0.995;
  const z = -0.078;
  const w = 0.19;
  const h = 0.25;
  const border = new RoundedBoxGeometry(w + 0.027, h + 0.027, 0.020, 3, 0.0026);
  const outer = new THREE.Mesh(border, frameMat);
  outer.position.set(x, y, z - 0.006);
  outer.castShadow = true;
  outer.receiveShadow = true;
  group.add(outer);
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(w, h), paperMat);
  sheet.position.set(x, y, z + 0.005);
  group.add(sheet);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glassMat);
  glass.name = 'certificate-glass';
  glass.position.set(x, y, z + 0.010);
  glass.renderOrder = 3;
  group.add(glass);
  // 右下角一粒实体火漆，给这张远景证书一个可触摸的焦点。
  const seal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0135, 0.0155, 0.0032, 18),
    new THREE.MeshStandardMaterial({ color: '#7d2a1e', roughness: 0.42, metalness: 0.05 }),
  );
  seal.rotation.x = Math.PI / 2;
  seal.position.set(x + w * 0.34, y - h * 0.31, z + 0.013);
  group.add(seal);
  const hook = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0045, 0.024, 8), brass);
  hook.rotation.x = Math.PI / 2;
  hook.position.set(x, y + h / 2 + 0.020, z - 0.002);
  group.add(hook);
  addWallShadow(group, x, y, z - 0.008, w + 0.05, h + 0.06, 0.12);
  parent.add(group);
  return group;
}

function addMirror(parent: THREE.Group, brass: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  group.name = 'wall-mirror';
  const x = 4.34;
  const y = 1.018;
  const z = -0.074;
  // 真实平面反射，尺寸小、采样 256，避免整镜变成一块灰色渐变。
  const disc = new Reflector(new THREE.CircleGeometry(0.139, 56), {
    clipBias: 0.003,
    textureWidth: 256,
    textureHeight: 256,
    color: 0x716c60,
    multisample: 2,
  });
  disc.name = 'mirror-reflection';
  disc.position.set(x, y, z);
  group.add(disc);
  const aged = new THREE.Mesh(
    new THREE.CircleGeometry(0.138, 56),
    new THREE.MeshBasicMaterial({
      map: texture(paintMirrorAged(256, 256), 1, 1, 8),
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  aged.position.set(x, y, z + 0.001);
  aged.renderOrder = 2;
  group.add(aged);
  const frame = new THREE.Mesh(new THREE.TorusGeometry(0.149, 0.011, 10, 56), brass);
  frame.position.set(x, y, z + 0.002);
  frame.castShadow = false;
  group.add(frame);
  const inner = new THREE.Mesh(new THREE.TorusGeometry(0.139, 0.0035, 8, 56), new THREE.MeshStandardMaterial({
    color: '#3f3124', roughness: 0.35, metalness: 0.7,
  }));
  inner.position.set(x, y, z + 0.003);
  group.add(inner);
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.014, 10), brass);
  pin.rotation.x = Math.PI / 2;
  pin.position.set(x, y + 0.176, z + 0.004);
  group.add(pin);
  addWallShadow(group, x + 0.06, y - 0.03, z - 0.010, 0.38, 0.38, 0.16);
  parent.add(group);
  return group;
}

/** 翻开的纸页：有横线、纸纤维、装订侧的暗边，不是一张纯白 Plane。 */
function paintNotebookPage(w: number, h: number): HTMLCanvasElement {
  return canvas(w, h, (g) => {
    const rnd = mulberry(60613);
    const bg = g.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#f3e9d6');
    bg.addColorStop(0.52, '#eee1cb');
    bg.addColorStop(1, '#dfcfb4');
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    // 装订侧与页角的暗边：纸叠被翻过，不是刚裁出来的白纸。
    const left = g.createLinearGradient(0, 0, w * 0.16, 0);
    left.addColorStop(0, 'rgba(76,54,36,.30)');
    left.addColorStop(1, 'rgba(76,54,36,0)');
    g.fillStyle = left;
    g.fillRect(0, 0, w, h);
    const right = g.createLinearGradient(w, 0, w * 0.86, 0);
    right.addColorStop(0, 'rgba(76,54,36,.20)');
    right.addColorStop(1, 'rgba(76,54,36,0)');
    g.fillStyle = right;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2200; i += 1) {
      const x = rnd() * w;
      const y = rnd() * h;
      g.fillStyle = rnd() > 0.52 ? `rgba(255,249,235,${0.02 + rnd() * 0.06})` : `rgba(88,66,46,${0.012 + rnd() * 0.045})`;
      g.fillRect(x, y, 0.6 + rnd() * 4.2, 0.6 + rnd() * 0.9);
    }
    // 横线：手账的 ruling，浅到不抢正文，但近看确实有格子。
    g.strokeStyle = 'rgba(83,70,53,.16)';
    g.lineWidth = 1.1;
    for (let y = 78; y < h - 42; y += 38) {
      g.beginPath();
      g.moveTo(38, y + (rnd() - 0.5) * 0.6);
      g.lineTo(w - 38, y + (rnd() - 0.5) * 0.6);
      g.stroke();
    }
    g.strokeStyle = 'rgba(118,48,42,.22)';
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(58, 42);
    g.lineTo(58, h - 40);
    g.stroke();
    for (let i = 0; i < 40; i += 1) {
      g.fillStyle = `rgba(108,78,46,${0.008 + rnd() * 0.025})`;
      g.beginPath();
      g.arc(rnd() * w, rnd() * h, 0.6 + rnd() * 2.4, 0, TAU);
      g.fill();
    }
  });
}
function addNotebook(parent: THREE.Group, brass: THREE.Material, leatherMat: THREE.Material): THREE.Group {
  const book = new THREE.Group();
  book.name = 'notebook';
  book.position.set(2.51, DESK_Y, 0.36);
  book.rotation.y = 0.18;
  parent.add(book);

  // 摊开的手账：两块页芯 + 两片封面，中间真的留出装订沟。
  const pageMat = new THREE.MeshStandardMaterial({
    map: texture(paintPageEdges(512, 128), 1, 1, 8),
    bumpMap: dataTexture(paintPageEdges(512, 128), 1, 1, 4),
    bumpScale: 0.00035,
    color: '#ffffff',
    roughness: 0.92,
    metalness: 0,
  });
  const pageTopMat = new THREE.MeshPhysicalMaterial({
    map: texture(paintNotebookPage(512, 512), 1, 1, 8),
    bumpMap: dataTexture(paintNotebookPage(512, 512), 1, 1, 4),
    bumpScale: 0.00022,
    color: '#ffffff',
    roughness: 0.88,
    metalness: 0,
    sheen: 0.12,
    sheenColor: new THREE.Color('#f3dfc0'),
    sheenRoughness: 0.8,
  });
  const pageW = 0.128;
  const pageD = 0.168;
  for (const side of [-1, 1] as const) {
    const block = new THREE.Mesh(new RoundedBoxGeometry(pageW, 0.014, pageD, 2, 0.0012), pageMat);
    block.position.set(side * 0.068, 0.0112, 0);
    block.castShadow = true;
    block.receiveShadow = true;
    book.add(block);
    const top = new THREE.Mesh(new RoundedBoxGeometry(pageW - 0.003, 0.0022, pageD - 0.003, 2, 0.001), pageTopMat);
    top.position.set(side * 0.068, 0.0192, 0);
    top.castShadow = true;
    top.receiveShadow = true;
    book.add(top);
    // 翻页的层次：两片薄纸从页芯边缘探出，侧面不是一整块。
    for (const dy of [0.0200, 0.0205]) {
      const leaf = new THREE.Mesh(new RoundedBoxGeometry(pageW - 0.006, 0.001, pageD - 0.006, 2, 0.0008), pageTopMat);
      leaf.position.set(side * 0.069, dy, 0.0015);
      leaf.rotation.y = side * 0.012;
      book.add(leaf);
    }
  }
  // 封面：左右两片薄皮板，边缘比页芯多出 5mm。
  for (const side of [-1, 1] as const) {
    const cover = new THREE.Mesh(new RoundedBoxGeometry(0.138, 0.0036, 0.178, 3, 0.0035), leatherMat);
    cover.position.set(side * 0.069, 0.0038, 0);
    cover.castShadow = true;
    cover.receiveShadow = true;
    book.add(cover);
  }
  // 皮面边框：页芯外露 5mm 皮边，翻开也读得出这是一本皮手账。
  for (const sx of [-1, 1] as const) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.0012, 0.178), leatherMat);
    rail.position.set(sx * 0.135, 0.0195, 0);
    rail.castShadow = true;
    book.add(rail);
  }
  for (const sz of [-1, 1] as const) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.138, 0.0012, 0.006), leatherMat);
    rail.position.set(0, 0.0195, sz * 0.089);
    rail.castShadow = true;
    book.add(rail);
  }
  // 书脊：中央隆起的皮脊 + 三道凸筋。
  const spine = new THREE.Mesh(new RoundedBoxGeometry(0.016, 0.011, 0.176, 3, 0.006), leatherMat);
  spine.position.set(0, 0.0055, 0);
  spine.castShadow = true;
  book.add(spine);
  for (const z of [-0.045, 0, 0.045]) {
    const hub = new THREE.Mesh(new RoundedBoxGeometry(0.019, 0.003, 0.005, 2, 0.0015), leatherMat);
    hub.position.set(0, 0.0112, z);
    hub.castShadow = true;
    book.add(hub);
  }
  // 中央装订沟：不是把两页贴在一起，沟里要有暗影。
  const gutter = new THREE.Mesh(new THREE.PlaneGeometry(0.009, 0.164), new THREE.MeshStandardMaterial({
    color: '#2c1a13',
    roughness: 1,
    metalness: 0,
    transparent: true,
    opacity: 0.46,
    depthWrite: false,
  }));
  gutter.rotation.x = -Math.PI / 2;
  gutter.position.y = 0.0201;
  gutter.renderOrder = 1;
  book.add(gutter);
  // 压在右页上的暗红书签带。
  const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.0015, 0.084), new THREE.MeshStandardMaterial({
    color: '#6b2a26',
    roughness: 0.9,
    metalness: 0,
  }));
  ribbon.position.set(0.055, 0.0208, 0.045);
  ribbon.rotation.y = 0.08;
  ribbon.castShadow = true;
  book.add(ribbon);
  // 四角黄铜包角：旧手账被翻旧了，角上先磨亮。
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      const cornerA = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.0012, 0.0026), brass);
      cornerA.position.set(sx * 0.132, 0.0057, sz * 0.085);
      book.add(cornerA);
      const cornerB = new THREE.Mesh(new THREE.BoxGeometry(0.0026, 0.0012, 0.014), brass);
      cornerB.position.set(sx * 0.138, 0.0057, sz * 0.083);
      book.add(cornerB);
    }
  }
  addContactShadow(book, 0, 0, 0.32, 0.22, 0.001, 0.40);
  return book;
}

function buildPen(parent: THREE.Group, gold: THREE.Material): THREE.Group {
  const pen = new THREE.Group();
  pen.name = 'fountain-pen';
  pen.position.set(2.575, DESK_Y + 0.022, 0.335);
  pen.rotation.y = 0.64;
  parent.add(pen);
  const resin = new THREE.MeshPhysicalMaterial({
    color: '#241816',
    roughness: 0.34,
    metalness: 0.02,
    clearcoat: 0.55,
    clearcoatRoughness: 0.38,
    envMapIntensity: 0.55,
  });
  // 笔杆用 Lathe：尾部收、握位略鼓，避免一根均匀圆柱。
  const bodyProfile = [
    new THREE.Vector2(0.0024, -0.055),
    new THREE.Vector2(0.0056, -0.049),
    new THREE.Vector2(0.0064, -0.020),
    new THREE.Vector2(0.0060, 0.012),
    new THREE.Vector2(0.0047, 0.032),
    new THREE.Vector2(0.0034, 0.044),
  ];
  const body = new THREE.Mesh(new THREE.LatheGeometry(bodyProfile, 18), resin);
  body.rotation.z = Math.PI / 2;
  body.position.y = 0.0072;
  body.castShadow = true;
  body.receiveShadow = true;
  pen.add(body);
  // 笔帽：深树脂帽筒 + 两道金箍 + 笔夹。
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0076, 0.0072, 0.045, 18), resin);
  cap.rotation.z = Math.PI / 2;
  cap.position.set(-0.060, 0.0072, 0);
  cap.castShadow = true;
  pen.add(cap);
  const capEnd = new THREE.Mesh(new THREE.SphereGeometry(0.0072, 14, 10), resin);
  capEnd.scale.x = 0.55;
  capEnd.position.set(-0.082, 0.0072, 0);
  pen.add(capEnd);
  for (const x of [-0.038, -0.079]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.0076, 0.0012, 6, 20), gold);
    band.rotation.y = Math.PI / 2;
    band.position.set(x, 0.0072, 0);
    pen.add(band);
  }
  const clip = new THREE.Mesh(new THREE.BoxGeometry(0.0022, 0.0012, 0.022), gold);
  clip.position.set(-0.055, 0.0148, 0.0035);
  clip.rotation.set(0.10, 0, -0.04);
  pen.add(clip);
  // 笔尖：金色尖头 + 黑色 slit + 呼吸孔，不是一根锥子。
  const nib = new THREE.Mesh(new THREE.ConeGeometry(0.0038, 0.019, 16), gold);
  nib.rotation.z = -Math.PI / 2;
  nib.position.set(0.052, 0.0072, 0);
  nib.castShadow = true;
  pen.add(nib);
  const slit = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.0007, 0.0011), new THREE.MeshBasicMaterial({ color: '#241813' }));
  slit.position.set(0.056, 0.0105, 0.0011);
  pen.add(slit);
  const breather = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.0008, 8), new THREE.MeshBasicMaterial({ color: '#1c1310' }));
  breather.rotation.x = Math.PI / 2;
  breather.position.set(0.049, 0.0105, 0.0011);
  pen.add(breather);
  // 笔项金环，给笔杆与笔尖之间一个真实接缝。
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.0052, 0.0011, 6, 18), gold);
  collar.rotation.y = Math.PI / 2;
  collar.position.set(0.040, 0.0072, 0);
  pen.add(collar);
  addContactShadow(pen, 0.002, 0, 0.15, 0.045, 0.001, 0.30, 0.35);
  return pen;
}

function buildLamp(brass: THREE.Material, shade: THREE.Material, warm: THREE.Material): { group: THREE.Group; bulb: THREE.Mesh } {
  const group = new THREE.Group();
  group.name = 'desk-lamp';
  const x = 2.71;
  const z = 0.00;
  // 灯座用 LatheGeometry 收边，正面看不是一块圆饼。
  const baseProfile = [
    new THREE.Vector2(0.092, 0.002),
    new THREE.Vector2(0.088, 0.008),
    new THREE.Vector2(0.070, 0.017),
    new THREE.Vector2(0.024, 0.020),
  ];
  const base = new THREE.Mesh(new THREE.LatheGeometry(baseProfile, 32), brass);
  base.position.set(x, DESK_Y, z);
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.027, 0.035, 20), brass);
  foot.position.set(x, DESK_Y + 0.034, z);
  foot.castShadow = true;
  group.add(foot);
  const collar = new THREE.Mesh(new RoundedBoxGeometry(0.032, 0.018, 0.032, 2, 0.004), brass);
  collar.position.set(x, DESK_Y + 0.056, z);
  group.add(collar);
  // 底座上的小旋钮开关：旧台灯会在灯座上留一颗胶木旋钮。
  const switchBase = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.012, 0.005, 14), brass);
  switchBase.position.set(x + 0.046, DESK_Y + 0.0225, z + 0.020);
  group.add(switchBase);
  const switchKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0075, 0.009, 12), new THREE.MeshPhysicalMaterial({
    color: '#2c1a12',
    roughness: 0.34,
    metalness: 0.02,
    clearcoat: 0.35,
    clearcoatRoughness: 0.4,
  }));
  switchKnob.position.set(x + 0.046, DESK_Y + 0.029, z + 0.020);
  group.add(switchKnob);
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(x, DESK_Y + 0.058, z),
    new THREE.Vector3(x + 0.025, DESK_Y + 0.31, z + 0.020),
    new THREE.Vector3(x + 0.105, DESK_Y + 0.43, z + 0.098),
    new THREE.Vector3(x + 0.235, DESK_Y + 0.382, z + 0.122),
  ]);
  const arm = new THREE.Mesh(new THREE.TubeGeometry(path, 28, 0.0085, 7, false), brass);
  arm.castShadow = true;
  group.add(arm);
  // 灯罩不是标准圆锥：拉坯式弧线 + 下沿微外翻，剪影才像旧台灯。
  const shadeProfile = [
    new THREE.Vector2(0.016, 0.098),
    new THREE.Vector2(0.028, 0.086),
    new THREE.Vector2(0.043, 0.068),
    new THREE.Vector2(0.058, 0.050),
    new THREE.Vector2(0.074, 0.028),
    new THREE.Vector2(0.086, 0.006),
    new THREE.Vector2(0.088, 0.000),
  ];
  const shadeGeo = new THREE.LatheGeometry(shadeProfile, 128);
  // 布罩不是完美圆锥：底口有一点点起伏，近看才不是塑料灯罩。
  const shadePos = shadeGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < shadePos.count; i += 1) {
    const px = shadePos.getX(i);
    const py = shadePos.getY(i);
    const pz = shadePos.getZ(i);
    const ang = Math.atan2(pz, px);
    // 20 道纵向褶裥：布罩的骨架，不是一圈平滑的奶油塑料。
    const pleatT = Math.max(0, Math.min(1, (0.10 - py) / 0.10));
    const pleat = (Math.sin(ang * 20 + 0.6) + Math.sin(ang * 20 * 2 + 1.1) * 0.16) * 0.046 * Math.pow(pleatT, 0.78);
    // 两段低频凹痕 + 细布纹：灯罩像被手反复挪过，不是车床车出来的。
    const dent = Math.sin(ang * 2.0 + 1.2) * 0.0028 + Math.sin(ang * 5.0 - 0.4) * 0.0015;
    const ripple = Math.sin(ang * 11 + py * 29) * 0.0012;
    const radial = 1 + dent * (0.35 + (1 - py / 0.1) * 0.65) + ripple + pleat;
    shadePos.setX(i, px * radial);
    shadePos.setZ(i, pz * radial);
    if (py < 0.014) shadePos.setY(i, py + Math.sin(ang * 9 + 0.8) * 0.0032);
  }
  shadePos.needsUpdate = true;
  shadeGeo.computeVertexNormals();
  const shadeMesh = new THREE.Mesh(shadeGeo, shade);
  shadeMesh.rotation.z = 0.10;
  shadeMesh.position.set(x + 0.24, DESK_Y + 0.316, z + 0.12);
  shadeMesh.castShadow = true;
  shadeMesh.receiveShadow = true;
  group.add(shadeMesh);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.071, 0.0032, 8, 32), brass);
  rim.rotation.x = Math.PI / 2;
  rim.position.set(x + 0.24, DESK_Y + 0.315, z + 0.12);
  group.add(rim);
  const topCap = new THREE.Mesh(new THREE.TorusGeometry(0.009, 0.004, 8, 14), brass);
  topCap.rotation.x = Math.PI / 2;
  topCap.position.set(x + 0.24, DESK_Y + 0.415, z + 0.12);
  group.add(topCap);
  // 灯罩内壁的暖光：开口处最亮，往上是渐深的奶油色。
  const inner = new THREE.Mesh(new THREE.ConeGeometry(0.080, 0.090, 32, 1, true), new THREE.MeshStandardMaterial({
    color: '#f6d4a0',
    emissive: new THREE.Color('#ffbd76'),
    emissiveIntensity: 0.28,
    roughness: 0.65,
    metalness: 0,
    side: THREE.BackSide,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  }));
  inner.rotation.z = 0.10;
  inner.position.set(x + 0.24, DESK_Y + 0.361, z + 0.12);
  group.add(inner);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.017, 20, 14), warm);
  bulb.name = 'lamp-bulb';
  bulb.position.set(x + 0.24, DESK_Y + 0.318, z + 0.12);
  group.add(bulb);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture(paintDot(128), 1, 1, 2),
    color: '#ffd29a',
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }));
  halo.name = 'lamp-halo';
  halo.position.set(x + 0.24, DESK_Y + 0.310, z + 0.12);
  halo.scale.set(0.27, 0.27, 1);
  group.add(halo);
  addContactShadow(group, x, z, 0.24, 0.20, DESK_Y + 0.0015, 0.42);
  return { group, bulb };
}

function buildBooks(parent: THREE.Group, materials: THREE.Material[]): THREE.Group {
  const group = new THREE.Group();
  group.name = 'books';
  const cloth = materials.slice(0, 3) as THREE.Material[];
  const pageMat = materials[3]!;
  const gold = materials[4]!;
  const endbandMat = new THREE.MeshStandardMaterial({
    map: texture(paintEndband(128, 16), 1, 1, 4),
    color: '#ffffff',
    roughness: 0.92,
    metalness: 0,
  });
  const specs = [
    { w: 0.235, h: 0.033, d: 0.165, x: 3.79, y: DESK_Y + 0.018, z: 0.605, yaw: 0.10, title: 'FIELD NOTES' },
    { w: 0.205, h: 0.029, d: 0.145, x: 3.81, y: DESK_Y + 0.047, z: 0.59, yaw: -0.06, title: 'THE LONG WAY' },
    { w: 0.17, h: 0.022, d: 0.12, x: 3.78, y: DESK_Y + 0.072, z: 0.56, yaw: 0.16, title: 'FIRST LIGHT' },
  ];
  specs.forEach((sp, i) => {
    const book = new THREE.Group();
    book.position.set(sp.x, sp.y, sp.z);
    book.rotation.y = sp.yaw;
    book.name = `book-${i + 1}`;
    group.add(book);
    const w = sp.w;
    const h = sp.h;
    const d = sp.d;
    const pageW = w - 0.014;
    const pageD = d - 0.014;
    // 页块：六面都能读成纸页，而不是一块彩色砖。
    const pages = new THREE.Mesh(
      new RoundedBoxGeometry(pageW, h - 0.006, pageD, 2, 0.0015),
      pageMat,
    );
    pages.castShadow = true;
    pages.receiveShadow = true;
    book.add(pages);
    // 前后两片薄封板，边缘比页块多出 7mm，侧光能看见封面厚度。
    for (const side of [-1, 1]) {
      const board = new THREE.Mesh(
        new RoundedBoxGeometry(w, 0.0032, d, 3, 0.0024),
        cloth[i % 3]!,
      );
      board.position.y = side * (h * 0.5 - 0.0016);
      board.castShadow = true;
      board.receiveShadow = true;
      book.add(board);
    }
    // 书脊：圆弧收边，替代一块直板。
    const spine = new THREE.Mesh(
      new RoundedBoxGeometry(0.012, h - 0.003, d - 0.009, 4, 0.005),
      cloth[i % 3]!,
    );
    spine.position.set(-w * 0.5 + 0.004, 0, 0);
    spine.castShadow = true;
    spine.receiveShadow = true;
    book.add(spine);
    // 书脊上的凸起筋与两道压金线：旧精装书的手工痕迹。
    for (const dy of [-h * 0.28, h * 0.28]) {
      const hub = new THREE.Mesh(
        new RoundedBoxGeometry(0.005, 0.0042, d - 0.022, 3, 0.0018),
        cloth[i % 3]!,
      );
      hub.position.set(-w * 0.5 + 0.001, dy, 0);
      hub.castShadow = true;
      book.add(hub);
      const rule = new THREE.Mesh(new THREE.BoxGeometry(0.0026, 0.0017, d - 0.018), gold);
      rule.position.set(-w * 0.5 + 0.0015, dy + (dy > 0 ? 0.005 : -0.005), 0);
      book.add(rule);
    }
    // 堵头布：书脊两端的细织带。
    for (const dy of [-h * 0.5 + 0.0022, h * 0.5 - 0.0022]) {
      const endband = new THREE.Mesh(new THREE.CylinderGeometry(0.0032, 0.0032, 0.0055, 10), endbandMat);
      endband.rotation.x = Math.PI / 2;
      endband.position.set(-w * 0.5 + 0.009, dy, 0);
      book.add(endband);
    }
    // 封面压金：用一张透明贴片画双线框和书名，近看有真正的字，不是一条金条。
    const plateMat = new THREE.MeshStandardMaterial({
      map: texture(paintBookPlate(512, 384, sp.title), 1, 1, 8),
      transparent: true,
      alphaTest: 0.02,
      depthWrite: false,
      color: '#fff1cc',
      roughness: 0.40,
      metalness: 0.60,
      envMapIntensity: 1.05,
      side: THREE.DoubleSide,
    });
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.022, d - 0.022), plateMat);
    plate.rotation.x = -Math.PI / 2;
    plate.position.y = h * 0.5 + 0.0022;
    plate.renderOrder = 1;
    book.add(plate);
    // 书页里露出的红丝带：两段，带一点折角。
    if (i === 2) {
      const ribbonMat = new THREE.MeshStandardMaterial({ color: '#6f2928', roughness: 0.85, metalness: 0 });
      const ribbon1 = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.0016, 0.060), ribbonMat);
      ribbon1.position.set(0.024, h * 0.5 + 0.003, -d * 0.30);
      ribbon1.rotation.z = -0.10;
      book.add(ribbon1);
      const ribbon2 = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.0016, 0.035), ribbonMat);
      ribbon2.position.set(0.034, h * 0.5 + 0.0022, d * 0.10);
      ribbon2.rotation.z = 0.38;
      book.add(ribbon2);
    }
  });
  addContactShadow(group, 3.795, 0.585, 0.29, 0.23, DESK_Y + 0.001, 0.32);
  parent.add(group);
  return group;
}

function buildCup(brass: THREE.Material, porcelain: THREE.Material): { group: THREE.Group; steam: THREE.Points } {
  const group = new THREE.Group();
  group.name = 'cup';
  const x = 2.48;
  const z = 0.635;
  const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.074, 0.064, 0.008, 24), porcelain);
  saucer.position.set(x, DESK_Y + 0.004, z);
  saucer.castShadow = true;
  saucer.receiveShadow = true;
  group.add(saucer);
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.034, 0.068, 20, 1, true), porcelain);
  cup.position.set(x, DESK_Y + 0.042, z);
  cup.castShadow = true;
  cup.receiveShadow = true;
  group.add(cup);
  const inside = new THREE.Mesh(new THREE.CircleGeometry(0.04, 20), new THREE.MeshStandardMaterial({ color: '#6c3a25', roughness: 0.35 }));
  inside.rotation.x = -Math.PI / 2;
  inside.position.set(x, DESK_Y + 0.073, z);
  group.add(inside);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.0055, 8, 18, Math.PI * 1.25), porcelain);
  handle.rotation.y = Math.PI / 2;
  handle.rotation.z = 0.2;
  handle.position.set(x + 0.047, DESK_Y + 0.046, z);
  group.add(handle);
  const spoon = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.004, 0.012), brass);
  spoon.position.set(x + 0.062, DESK_Y + 0.012, z + 0.018);
  spoon.rotation.y = 0.35;
  group.add(spoon);

  // 很淡的热气：16 个 sprite 循环上升；不用流体，只用可读的一条细线。
  const geo = new THREE.BufferGeometry();
  const count = 18;
  const arr = new Float32Array(count * 3);
  const seed: number[] = [];
  for (let i = 0; i < count; i += 1) {
    arr[i * 3] = x + (Math.random() - 0.5) * 0.02;
    arr[i * 3 + 1] = DESK_Y + 0.078 + Math.random() * 0.15;
    arr[i * 3 + 2] = z + (Math.random() - 0.5) * 0.01;
    seed.push(Math.random() * TAU);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const mat = new THREE.PointsMaterial({
    color: '#f7ead6',
    map: texture(paintDot(64), 1, 1, 2),
    size: 0.018,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  const steam = new THREE.Points(geo, mat);
  steam.frustumCulled = false;
  (steam as unknown as { __seed: number[] }).__seed = seed;
  group.add(steam);
  return { group, steam };
}

function buildMotes(): THREE.Points {
  const count = 46;
  const geo = new THREE.BufferGeometry();
  const arr = new Float32Array(count * 3);
  const seed: number[] = [];
  const rnd = mulberry(612);
  for (let i = 0; i < count; i += 1) {
    arr[i * 3] = 2.2 + rnd() * 1.2;
    arr[i * 3 + 1] = 0.82 + rnd() * 0.8;
    arr[i * 3 + 2] = -0.02 + rnd() * 0.62;
    seed.push(rnd() * TAU);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const mat = new THREE.PointsMaterial({
    color: '#ffe6bd',
    map: texture(paintDot(64), 1, 1, 2),
    size: 0.0075,
    transparent: true,
    opacity: 0.30,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  // 把 seed 挂在对象上，动画里用，不额外建数组。
  (points as unknown as { __seed: number[] }).__seed = seed;
  return points;
}

/** 建一整套书房。所有对象按“房间 / 桌 / 植物 / 装饰”分组，便于真实统计 draw call 与面数。 */
export function buildStudio(): Studio {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#b7a58f');

  // 胡桃木：颜色贴图 + 粗糙度 + 高度三张，木纹密度按桌面真实尺寸做，不再是大条纹。
  const woodCanvas = paintWood(2048, 1024, '#674733', '#382216', '#a87b52', 20261121);
  const woodMap = texture(woodCanvas, 1.06, 1.0, 8);
  const woodHeight = dataTexture(paintWoodHeight(1024, 512, 20261121), 1.06, 1.0, 4);
  const woodRough = dataTexture(paintWoodRough(1024, 512, 20261121), 1.06, 1.0, 4);
  const wood = new THREE.MeshPhysicalMaterial({
    map: woodMap,
    roughnessMap: woodRough,
    bumpMap: woodHeight,
    bumpScale: 0.0016,
    color: '#ffffff',
    roughness: 1,
    metalness: 0,
    clearcoat: 0.24,
    clearcoatRoughness: 0.36,
    envMapIntensity: 0.8,
  });
  const woodSmallMap = woodMap.clone();
  woodSmallMap.repeat.set(0.34, 0.26);
  woodSmallMap.needsUpdate = true;
  const woodSmall = wood.clone();
  woodSmall.map = woodSmallMap;
  woodSmall.bumpScale = 0.0011;
  const darkWood = wood.clone();
  darkWood.color = new THREE.Color('#b39a84');
  darkWood.roughness = 1;
  darkWood.clearcoat = 0.16;
  const floorCanvas = paintWood(2048, 1024, '#886244', '#533522', '#bd9269', 998877);
  const floor = new THREE.MeshPhysicalMaterial({
    map: texture(floorCanvas, 4.0, 3.2, 8),
    roughnessMap: dataTexture(paintWoodRough(1024, 512, 998877), 4.0, 3.2, 4),
    bumpMap: dataTexture(paintWoodHeight(1024, 512, 998877), 4.0, 3.2, 4),
    bumpScale: 0.0012,
    color: '#ffffff',
    roughness: 1,
    metalness: 0,
    clearcoat: 0.10,
    clearcoatRoughness: 0.46,
    envMapIntensity: 0.45,
  });
  const frame = new THREE.MeshPhysicalMaterial({
    map: texture(paintWood(1024, 512, '#cbbda8', '#a49580', '#e0d2bc', 771), 0.8, 0.8, 8),
    bumpMap: dataTexture(paintWoodHeight(512, 256, 771), 0.8, 0.8, 4),
    bumpScale: 0.0008,
    color: '#ffffff',
    roughness: 0.54,
    metalness: 0,
    clearcoat: 0.18,
    clearcoatRoughness: 0.45,
    envMapIntensity: 0.45,
  });
  const certPaper = new THREE.MeshStandardMaterial({
    map: texture(paintCertificate(512, 640), 1, 1, 4),
    color: '#ffffff',
    roughness: 0.92,
    metalness: 0,
    envMapIntensity: 0.18,
  });
  const leather = new THREE.MeshPhysicalMaterial({
    map: texture(paintLeather(1024, 768), 1, 1, 8),
    roughnessMap: dataTexture(paintLeatherHeight(768, 512), 1, 1, 4),
    bumpMap: dataTexture(paintLeatherHeight(768, 512), 1, 1, 4),
    bumpScale: 0.0012,
    color: '#ffffff',
    roughness: 1,
    metalness: 0.01,
    clearcoat: 0.16,
    clearcoatRoughness: 0.55,
    envMapIntensity: 0.45,
  });
  const notebookLeather = new THREE.MeshPhysicalMaterial({
    map: texture(paintLeather(512, 512, '#4a211b', false), 1, 1, 8),
    roughnessMap: dataTexture(paintLeatherHeight(512, 512), 1, 1, 4),
    bumpMap: dataTexture(paintLeatherHeight(512, 512), 1, 1, 4),
    bumpScale: 0.0009,
    color: '#ffffff',
    roughness: 0.64,
    metalness: 0.01,
    clearcoat: 0.2,
    clearcoatRoughness: 0.5,
    envMapIntensity: 0.38,
  });
  const plaster = new THREE.MeshStandardMaterial({
    map: texture(paintPlaster(1024, 1024), 5.2, 2.2, 8),
    bumpMap: dataTexture(paintPlasterHeight(512, 512), 5.2, 2.2, 4),
    bumpScale: 0.0025,
    color: '#f0e8da',
    roughness: 0.94,
    metalness: 0,
    envMapIntensity: 0.18,
  });
  const brass = new THREE.MeshStandardMaterial({
    map: texture(paintBrass(1024, 512), 1, 1, 8),
    roughnessMap: dataTexture(paintBrassRough(512, 256), 1, 1, 4),
    bumpMap: dataTexture(paintBrassRough(512, 256), 1, 1, 4),
    bumpScale: 0.00045,
    color: '#ffffff',
    roughness: 1,
    metalness: 1,
    envMapIntensity: 1.18,
  });
  const rug = new THREE.MeshStandardMaterial({
    map: texture(paintRug(1536, 1024), 1, 1, 8),
    bumpMap: dataTexture(paintRugHeight(1024, 512), 1, 1, 4),
    bumpScale: 0.0015,
    color: '#efe6d8',
    roughness: 0.98,
    metalness: 0,
    envMapIntensity: 0.12,
  });
  const sky = new THREE.MeshBasicMaterial({
    map: texture(paintSky(1536, 960), 1, 1, 8),
    toneMapped: false,
  });
  const art = new THREE.MeshBasicMaterial({
    map: texture(paintBotanical(768, 960), 1, 1, 8),
    color: '#c8b8a1',
    toneMapped: false,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: '#dfe9e5',
    roughness: 0.055,
    metalness: 0,
    transparent: true,
    opacity: 0.025,
    depthWrite: false,
    side: THREE.DoubleSide,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    envMapIntensity: 1.4,
  });
  const curtain = new THREE.MeshPhysicalMaterial({
    map: texture(paintLinen(1024, 768), 1, 1, 8),
    bumpMap: dataTexture(paintLinen(512, 512), 1, 1, 4),
    bumpScale: 0.0018,
    color: '#c8b79e',
    roughness: 0.94,
    metalness: 0,
    transparent: true,
    opacity: 0.66,
    side: THREE.DoubleSide,
    envMapIntensity: 0.25,
    sheen: 0.18,
    sheenColor: new THREE.Color('#e8d9bf'),
  });
  const shadeMat = new THREE.MeshPhysicalMaterial({
    map: texture(paintShadeFabric(1024, 512), 2.2, 1.2, 8),
    bumpMap: dataTexture(paintShadeHeight(512, 256), 2.2, 1.2, 4),
    bumpScale: 0.0052,
    color: '#d9c3a2',
    roughness: 0.95,
    metalness: 0.01,
    emissive: new THREE.Color('#5a3a1c'),
    emissiveMap: texture(paintShadeFabric(512, 256), 2.2, 1.2, 4),
    emissiveIntensity: 0.08,
    side: THREE.DoubleSide,
    envMapIntensity: 0.22,
    sheen: 0.20,
    sheenColor: new THREE.Color('#e8d8be'),
    sheenRoughness: 0.72,
  });
  const warm = new THREE.MeshBasicMaterial({
    color: '#ffe0b2',
    toneMapped: false,
  });
  const bookMats = [
    new THREE.MeshPhysicalMaterial({
      map: texture(paintBookCloth(512, 512, '#6c4434'), 1, 1, 8),
      bumpMap: dataTexture(paintBookCloth(512, 512, '#6c4434'), 1, 1, 4),
      bumpScale: 0.0014,
      color: '#ffffff',
      roughness: 0.78,
      metalness: 0.01,
      clearcoat: 0.08,
      envMapIntensity: 0.28,
    }),
    new THREE.MeshPhysicalMaterial({
      map: texture(paintBookCloth(512, 512, '#3e5260'), 1, 1, 8),
      color: '#ffffff',
      roughness: 0.74,
      metalness: 0.01,
      clearcoat: 0.08,
      envMapIntensity: 0.3,
    }),
    new THREE.MeshPhysicalMaterial({
      map: texture(paintBookCloth(512, 512, '#696c47'), 1, 1, 8),
      color: '#ffffff',
      roughness: 0.8,
      metalness: 0.01,
      clearcoat: 0.06,
      envMapIntensity: 0.25,
    }),
    new THREE.MeshStandardMaterial({
      map: texture(paintPageEdges(512, 128), 1, 1, 8),
      color: '#d7c7ab',
      roughness: 0.93,
      metalness: 0,
    }),
    new THREE.MeshStandardMaterial({
      color: '#b58d55',
      roughness: 0.3,
      metalness: 0.72,
      envMapIntensity: 0.9,
    }),
  ];  const clothBump = dataTexture(paintBookClothHeight(512, 512), 1, 1, 4);
  for (let i = 0; i < 3; i += 1) {
    const mat = bookMats[i] as THREE.MeshPhysicalMaterial;
    mat.bumpMap = clothBump;
    mat.bumpScale = 0.001;
    mat.needsUpdate = true;
  }
  const pageBump = dataTexture(paintPageEdges(512, 128), 1, 1, 4);
  const pageMat = bookMats[3] as THREE.MeshStandardMaterial;
  pageMat.bumpMap = pageBump;
  pageMat.bumpScale = 0.00035;
  pageMat.needsUpdate = true;


  // 程序化环境贴图：只给金属、玻璃和皮革提供反射方向，不替代主光。
  const envTex = new THREE.CanvasTexture(paintEnvironment(1024, 512));
  envTex.colorSpace = THREE.SRGBColorSpace;
  envTex.mapping = THREE.EquirectangularReflectionMapping;
  envTex.needsUpdate = true;
  scene.environment = envTex;
  (scene as THREE.Scene & { environmentIntensity: number }).environmentIntensity = 0.42;

  const { room, curtainMesh } = buildRoom(plaster, darkWood, floor, frame, brass, rug, sky, art, curtain, glass);
  // 窗外改成摄影底图：先保留程序化天空作兜底，照片解码后再替换，避免首帧白屏。
  if (typeof Image !== 'undefined' && typeof document !== 'undefined') {
    const photo = new Image();
    photo.decoding = 'async';
    photo.onload = () => {
      const view = room.getObjectByName('window-view') as THREE.Mesh | undefined;
      if (!view) return;
      const photoTex = new THREE.Texture(photo);
      photoTex.colorSpace = THREE.SRGBColorSpace;
      photoTex.anisotropy = 8;
      photoTex.minFilter = THREE.LinearMipmapLinearFilter;
      photoTex.magFilter = THREE.LinearFilter;
      photoTex.needsUpdate = true;
      const photoMat = view.material as THREE.MeshBasicMaterial;
      photoMat.map = photoTex;
      photoMat.needsUpdate = true;
    };
    photo.setAttribute('src', WINDOW_PHOTO_DATA_URL);
  }
  const birds = addBirds(room);
  const desk = buildDesk(wood, woodSmall, leather, brass, darkWood);
  scene.add(room, desk);

  const plants = new THREE.Group();
  plants.name = 'plants';
  const atlasCanvas = paintLeafAtlas();
  const atlas = texture(atlasCanvas, 1, 1, 8);
  atlas.wrapS = atlas.wrapT = THREE.ClampToEdgeWrapping;
  atlas.repeat.set(1, 1);
  const ficus = addFicus(plants, atlas, 3.87, 0.045);
  // 树高按窗台/相机视锥压到 0.62m 左右，避免树冠被画面上缘切掉。
  ficus.scale.setScalar(0.74);
  // 缩放是绕原点做的；把整组抬回桌面并挪到纸右侧，否则盆会陷进桌板。
  ficus.position.set(3.58 - 3.87 * 0.74, DESK_Y * (1 - 0.74), 0.035 - 0.045 * 0.74);
  addFern(plants, atlas, 3.02, -0.015, 0.759, 0.66);
  addWallShadow(plants, 3.68, 1.00, -0.086, 0.52, 0.74, 0.18, ensurePlantShadowTexture());
  addContactShadow(plants, 3.58, 0.035, 0.20, 0.18, DESK_Y + 0.0015, 0.38);
  addContactShadow(plants, 3.02, -0.015, 0.12, 0.11, 0.760, 0.28);
  scene.add(plants);

  const decor = new THREE.Group();
  decor.name = 'decor';
  const lamp = buildLamp(brass, shadeMat, warm);
  decor.add(lamp.group);
  buildBooks(decor, bookMats);
  addNotebook(decor, brass, notebookLeather);
  buildPen(decor, brass);
  addWallKeys(decor, brass);
  addWallCertificate(decor, frame, brass, certPaper, glass);
  addMirror(decor, brass);
  // 一把黄铜拆信刀：收尖的刀身、深色木柄和铜箍，不是一枚回形针。
  const opener = new THREE.Group();
  opener.name = 'letter-opener';
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(0, -0.0072);
  bladeShape.lineTo(0.095, -0.0060);
  bladeShape.lineTo(0.128, 0.0000);
  bladeShape.lineTo(0.095, 0.0060);
  bladeShape.lineTo(0, 0.0072);
  bladeShape.closePath();
  const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, {
    depth: 0.0026,
    bevelEnabled: true,
    bevelThickness: 0.0007,
    bevelSize: 0.0008,
    bevelSegments: 2,
    curveSegments: 8,
  });
  const blade = new THREE.Mesh(bladeGeo, brass);
  blade.rotation.x = -Math.PI / 2;
  blade.position.set(0.0, DESK_Y + 0.0042, 0);
  blade.castShadow = true;
  blade.receiveShadow = true;
  opener.add(blade);
  // 刀脊：一条压暗的细线，近看能读出金属厚度。
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.092, 0.0014, 0.0016), new THREE.MeshStandardMaterial({
    color: '#8f743d',
    roughness: 0.42,
    metalness: 0.8,
    envMapIntensity: 0.9,
  }));
  ridge.position.set(0.044, DESK_Y + 0.0058, 0);
  opener.add(ridge);
  const handleMat = new THREE.MeshPhysicalMaterial({
    color: '#3b2418',
    roughness: 0.52,
    metalness: 0.02,
    clearcoat: 0.28,
    clearcoatRoughness: 0.42,
    envMapIntensity: 0.35,
  });
  const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.0085, 0.012, 12), brass);
  ferrule.rotation.z = Math.PI / 2;
  ferrule.position.set(-0.009, DESK_Y + 0.0056, 0);
  opener.add(ferrule);
  const handleProfile = [
    new THREE.Vector2(0.0075, -0.020),
    new THREE.Vector2(0.0130, -0.014),
    new THREE.Vector2(0.0140, -0.003),
    new THREE.Vector2(0.0120, 0.009),
    new THREE.Vector2(0.0090, 0.020),
  ];
  const handleBody = new THREE.Mesh(new THREE.LatheGeometry(handleProfile, 18), handleMat);
  handleBody.rotation.z = Math.PI / 2;
  handleBody.position.set(-0.040, DESK_Y + 0.0054, 0);
  handleBody.castShadow = true;
  opener.add(handleBody);
  for (const dx of [-0.046, -0.030]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.0021, 6, 16), brass);
    ring.rotation.y = Math.PI / 2;
    ring.position.set(dx, DESK_Y + 0.0054, 0);
    opener.add(ring);
  }
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.012, 14, 10), brass);
  pommel.scale.set(0.55, 0.9, 0.9);
  pommel.position.set(-0.055, DESK_Y + 0.0054, 0);
  opener.add(pommel);
  opener.position.set(2.52, 0, 0.295);
  opener.rotation.y = -0.24;
  addContactShadow(opener, 0.045, 0, 0.22, 0.075, DESK_Y + 0.001, 0.30, -0.24);
  decor.add(opener);
  scene.add(decor);

  const motes = buildMotes();
  scene.add(motes);

  const ficusSway = ficus.getObjectByName('ficus-sway') as THREE.Group | undefined;
  const mistPlanes: THREE.Mesh[] = [];
  room.traverse((o) => {
    if (o.name === 'window-mist') {
      const mesh = o as THREE.Mesh;
      mesh.userData.baseX = mesh.position.x;
      mesh.userData.baseOpacity = (mesh.material as THREE.MeshBasicMaterial).opacity;
      mistPlanes.push(mesh);
    }
  });
  const halo = lamp.group.getObjectByName('lamp-halo') as THREE.Sprite | undefined;

  const animated: Array<(time: number) => void> = [];
  animated.push((time: number) => {
    // 叶片只做毫米级摆动。幅度大了会像水草，反而不安静。
    if (ficusSway) {
      ficusSway.rotation.z = Math.sin(time * 0.23) * 0.0055 + Math.sin(time * 0.61 + 1.3) * 0.0018;
      ficusSway.rotation.x = Math.cos(time * 0.18) * 0.0032;
    }
    curtainMesh.rotation.z = Math.sin(time * 0.16) * 0.0035;
    const right = room.getObjectByName('curtain-right');
    if (right) right.rotation.z = -Math.sin(time * 0.16 + 0.7) * 0.003;
    for (const [i, mist] of mistPlanes.entries()) {
      mist.position.x = mist.userData.baseX + Math.sin(time * 0.045 + i * 1.7) * 0.009;
      (mist.material as THREE.MeshBasicMaterial).opacity = mist.userData.baseOpacity * (0.9 + Math.sin(time * 0.08 + i) * 0.08);
    }
    if (halo) (halo.material as THREE.SpriteMaterial).opacity = 0.22 + Math.sin(time * 0.7) * 0.012;
    // 窗外三只小鸟：只在窗洞里飞，靠近边缘淡出；翅膀用轻微纵向缩放表现。
    for (const [i, bird] of birds.entries()) {
      const phase = bird.userData.phase as number;
      const t = ((time * 0.011 + i * 0.31) % 1);
      const span = 1.00;
      bird.position.x = 2.19 + t * span;
      bird.position.y = 1.245 + Math.sin(time * 0.11 + phase) * 0.012 - i * 0.008;
      const edge = Math.min(t, 1 - t);
      (bird.material as THREE.SpriteMaterial).opacity = 0.36 * Math.min(1, edge * 14);
      const base = bird.userData.baseScale as THREE.Vector3;
      const flap = 0.72 + Math.abs(Math.sin(time * 5.2 + phase)) * 0.28;
      bird.scale.set(base.x, base.y * flap, 1);
    }
    const pos = motes.geometry.attributes.position as THREE.BufferAttribute;
    const seeds = (motes as unknown as { __seed: number[] }).__seed;
    for (let i = 0; i < pos.count; i += 1) {
      const s = seeds[i]!;
      pos.setX(i, 2.2 + ((i * 0.137 + time * 0.012 + s * 0.02) % 1.2));
      pos.setY(i, 0.82 + ((Math.sin(time * 0.14 + s) + 1) * 0.4 + 0.08));
      pos.setZ(i, -0.02 + ((i * 0.071 + time * 0.008) % 0.62));
    }
    pos.needsUpdate = true;
  });

  function measure(root: THREE.Object3D): StudioStats {
    let meshes = 0;
    let tris = 0;
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      let p: THREE.Object3D | null = o;
      while (p) {
        if (!p.visible) return;
        p = p.parent;
      }
      meshes += 1;
      const g = mesh.geometry;
      const n = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
      tris += n * ((mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh).count : 1);
    });
    return { meshes, tris: Math.round(tris) };
  }

  const breakdown: Record<string, StudioStats> = {
    room: measure(room),
    desk: measure(desk),
    plants: measure(plants),
    decor: measure(decor),
    motes: measure(motes),
  };
  if (typeof globalThis !== 'undefined') {
    (globalThis as unknown as { __dawnDeskChildren?: unknown }).__dawnDeskChildren = {
      desk: desk.children.map((child) => ({ name: child.name || '(unnamed)', ...measure(child) })),
      plants: plants.children.map((child) => ({ name: child.name || '(unnamed)', ...measure(child) })),
      decor: decor.children.map((child) => ({ name: child.name || '(unnamed)', ...measure(child) })),
    };
  }
  installLeafPhotoAtlas(scene);
  return { scene, animated, breakdown, glass, lampBulb: lamp.bulb };
}
