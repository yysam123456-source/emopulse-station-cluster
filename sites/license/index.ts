// /license 的站内接线（T13 的最后一层）：把用户的三件事接到零件与导出上。
//   · 盖章：三段仪式（`ritual.ts`）→ approved 之后才出现保存
//   · 停留：光角慢变量 + 拖光（`stay.ts`），**不产生结果**
//   · 搬弄：重盖 / 折角（`fold.ts`），**不产生结果**
// ★ 编号/日期/宣言句在**整个停留期间完全不变** —— 只有画面局部动。
import { createRitual } from './ritual';
import { STAY, createStay } from './stay';
import { toggleFold } from './fold';
import { renderLicense } from './export';
import { LICENSE_COPY, formatDate, makeSerial } from '../../content/license';
import { COPY } from '../../shared/sites/copy.mjs';

/** 最小可用句柄形状（避免 import 整个 shell 的类型环）。 */
interface Handle {
  onFrame(fn: (t: number, dt: number) => void): void;
  tap(nx?: number, ny?: number): void;
  setModal(open: boolean): void;
  readonly stage: {
    readonly geometry: {
      readonly sheet: { x: number; y: number; w: number; h: number } | null;
    };
  };
}

/**
 * 接线。
 *
 * @param handle 壳句柄
 */
export function attach(handle: Handle): void {
  const word = document.getElementById('stage-word');
  const seal = document.getElementById('seal');
  const save = document.getElementById('save') as HTMLButtonElement | null;
  const playHint = document.getElementById('play-hint');
  const reduced = typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 编号与日期**只在这里生成一次**：整个停留期间不变（导出复用的就是这两个值）
  const serial = makeSerial();
  const date = formatDate();

  // 编号/日期**开票即印**（这张纸一出生就有编号），盖章只授予红章与章下那句。
  // 值由站点持有并写入 DOM；仪式只回调"现在是不是 approved"，不持有证书数据。
  const certSerialValue = document.getElementById('cert-serial-value');
  const certDate = document.getElementById('cert-date');
  const certSealSub = document.getElementById('cert-seal-sub');
  if (certSerialValue) certSerialValue.textContent = serial;
  if (certDate) certDate.textContent = date;
  const showCert = (approved: boolean): void => {
    // 只有章下副行跟着章走；编号/日期常驻（盖章前后都在纸上）。
    if (certSealSub) certSealSub.hidden = !approved;
  };

  const ritual = createRitual(word, seal, save, reduced, playHint, showCert, document.getElementById('cta'));
  const stay = createStay(document.body);
  let dragDx = 0;
  let foldOn = false;
  /** 最近一帧的世界时间（不自己记时钟：值来自 frame） */
  let lastT = 0;

  // 盖章与重盖是同一个动作（同一段仪式走第二遍），共用一处逻辑。
  const stamp = (): void => {
    ritual.start();
  };
  document.getElementById('cta')?.addEventListener('click', stamp);
  document.getElementById('again')?.addEventListener('click', stamp);

  const foldButton = document.getElementById('fold');
  const setFold = (on: boolean): void => {
    foldOn = on;
    toggleFold(document.body, foldOn);
    if (foldButton) foldButton.textContent = foldOn ? 'Unfold the corner' : 'Fold the corner';
  };
  foldButton?.addEventListener('click', () => setFold(!foldOn));

  // 拖光：只在画布上拖（UI 上的拖动不挪光，这是输入边界的一部分）
  const canvas = document.getElementById('stage');
  canvas?.addEventListener('pointerdown', (e) => {
    const target = e.currentTarget as HTMLElement;
    const startX = e.clientX;
    const move = (ev: PointerEvent): void => { dragDx = ev.clientX - startX; void target; };
    const up = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });

  // 两件搬弄：键盘可达（不靠鼠标）
  window.addEventListener('keydown', (ev) => {
    // 带修饰键的组合键不是我们的事（⌘F / Ctrl+F 是浏览器查找，不许被折角抢走）
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const key = ev.key.toLowerCase();
    if (key === 'f') setFold(!foldOn);
    if (key === 's' && ritual.done()) stamp();
  });

  handle.onFrame((t, dt) => {
    lastT = t;
    stay.tick(t, dragDx);
    ritual.tick(dt);
  });

  // 导出：**裁切主画布的纸矩形**，不是重画一张纸。
  // 屏幕上的纸纹、光、纸边因此逐像素进入卡片；文字/章按与 CSS 同一组百分比重排。
  const exportCard = (): string => {
    const canvas = document.getElementById('stage') as HTMLCanvasElement | null;
    const rect = handle.stage.geometry.sheet;
    return renderLicense({
      serial,
      date,
      // 导出必须是「保存那一刻屏幕上的光」，含拖光偏移；业务口径见 docs/PRODUCT-FORM.md §带走物。
      sunAngle: stay.angle(),
      paper: canvas && rect ? { canvas, rect } : null,
    });
  };
  let saveTimer = 0;
  save?.addEventListener('click', () => {
    const url = exportCard();
    const a = document.createElement('a');
    a.href = url;
    a.download = `emopulse-license-${serial}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // 按钮原位反馈：下载触发是同步的，但用户看不到文件去哪了，必须给一句「已保存」。
    const original = COPY.license.saveLabel;
    save.textContent = COPY.license.saved;
    save.disabled = true;
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      save.textContent = original;
      save.disabled = false;
    }, 2000);
  });

  // 测试用：把导出函数挂到站点句柄上（不是产品接口，只用于门）
  (handle as unknown as { exportCard: () => string }).exportCard = exportCard;
  (handle as unknown as { meta: () => { serial: string; date: string } }).meta = () => ({ serial, date });
  // 测试用：暴露 STAY 开关（门要逐项置 false，验「画面确实变了」）
  (globalThis as unknown as { __stay?: unknown }).__stay = STAY;
  void LICENSE_COPY;
}
