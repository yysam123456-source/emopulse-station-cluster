// /license 的站内接线（T13 的最后一层）：把用户的三件事接到零件与导出上。
//   · 盖章：三段仪式（`ritual.ts`）→ approved 之后才出现保存
//   · 停留：光角慢变量 + 拖光（`stay.ts`），**不产生结果**
//   · 搬弄：重盖 / 折角（`fold.ts`），**不产生结果**
// ★ 编号/日期/宣言句在**整个停留期间完全不变** —— 只有画面局部动。
import { createRitual } from './ritual';
import { STAY, createStay, sunAngleAt } from './stay';
import { toggleFold } from './fold';
import { renderLicense } from './export';
import { LICENSE_COPY, formatDate, makeSerial } from '../../content/license';

/** 最小可用句柄形状（避免 import 整个 shell 的类型环）。 */
interface Handle {
  onFrame(fn: (t: number, dt: number) => void): void;
  tap(nx?: number, ny?: number): void;
  setModal(open: boolean): void;
}

/**
 * 接线。
 *
 * @param handle 壳句柄
 */
export function attach(handle: Handle): void {
  const word = document.getElementById('stage-word');
  const seal = document.getElementById('seal');
  const save = document.getElementById('save');
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
  /** 按下那一刻的光角 —— 导出卡必须用它，而不是"导出时的光角" */
  let pressAngle = sunAngleAt(0);

  // 盖章与重盖是同一个动作（同一段仪式走第二遍），共用一处逻辑，避免两处各自记光角而漂移。
  const stamp = (): void => {
    pressAngle = sunAngleAt(lastT);
    ritual.start();
  };
  document.getElementById('cta')?.addEventListener('click', stamp);
  document.getElementById('again')?.addEventListener('click', stamp);

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
    if (key === 'f') { foldOn = !foldOn; toggleFold(document.body, foldOn); }
    if (key === 's' && ritual.done()) stamp();
  });

  handle.onFrame((t, dt) => {
    lastT = t;
    stay.tick(t, dragDx);
    ritual.tick(dt);
  });

  // 导出：**不重渲染场景**，只把主画布按比例缩到卡片上（同一任务里，stage.frame 之后）
  const exportCard = (): string => renderLicense({ serial, date, sunAngle: pressAngle });
  save?.addEventListener('click', () => {
    const url = exportCard();
    const a = document.createElement('a');
    a.href = url;
    a.download = `emopulse-license-${serial}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  });

  // 测试用：把导出函数挂到站点句柄上（不是产品接口，只用于门）
  (handle as unknown as { exportCard: () => string }).exportCard = exportCard;
  (handle as unknown as { meta: () => { serial: string; date: string } }).meta = () => ({ serial, date });
  // 测试用：暴露 STAY 开关（门要逐项置 false，验「画面确实变了」）
  (globalThis as unknown as { __stay?: unknown }).__stay = STAY;
  void LICENSE_COPY;
}
