// 站内「三段仪式」：verifying → stamping → approved。**产出带走物，不是停留**（不计入 60 行闸门）。
//
// ★ 三段必须出字：架构师定的因果法则里，唯一不可绕的就是"用户在界面上看得见自己在第几步"。
//   这也是 T12 撤掉的直接原因 —— 零件拿不到"按钮被按了"的因果，只能由站点持有。
//
// ★ `done` 是**站点局部 boolean**，不暴露成零件接口：没有任何零件需要知道"盖章完了"。
//   保存按钮（`#save`）在 approved 之后才出现。
import { COPY } from '../../shared/sites/copy.mjs';
import { restamp } from './fold';

export type RitualStage = 'idle' | 'verifying' | 'stamping' | 'approved';

/** 每段时长（秒）。两段共 6.4s，落在规格 8–10s 的下沿；reducedMotion 压到 1/3。 */
const DURATION = Object.freeze({ verifying: 2.8, stamping: 3.6 });

/** 每段对用户可见的那一个词（必须真的出现在 DOM 里）。 */
const WORD: Readonly<Record<Exclude<RitualStage, 'idle'>, string>> = {
  verifying: 'verifying',
  stamping: 'stamping',
  approved: 'approved',
};

export interface RitualHandle {
  /** 开始一次仪式（可被重盖再次触发） */
  start(): void;
  /** 每帧推进；返回当前阶段 */
  tick(dt: number): RitualStage;
  /** 是否已完成（保存按钮的显示条件） */
  done(): boolean;
  stage(): RitualStage;
}

/**
 * 建仪式状态机（纯状态 + DOM 写入，不碰世界）。
 *
 * @param word 显示阶段词的节点
 * @param seal 章节点（重盖时会被写 `--seal-tilt`）
 * @param save 保存按钮（approved 之后才出现）
 * @param reducedMotion 是否压缩时长
 * @param hint 纸角二级提示（approved 之后才出现；重盖时收起，和章一起重新走一遍）
 * @param onApproved 进入/离开 approved 时的回调（编号、日期等由站点填入，仪式本身不持有它们）
 * @param cta 首屏按钮（approved 后退场，把唯一按钮位置让给 Save；重盖开始时回来）
 */
export function createRitual(
  word: HTMLElement | null,
  seal: HTMLElement | null,
  save: HTMLElement | null,
  reducedMotion: boolean,
  hint?: HTMLElement | null,
  onApproved?: (approved: boolean) => void,
  cta?: HTMLElement | null,
): RitualHandle {
  let stage: RitualStage = 'idle';
  let elapsed = 0;
  let round = 0;
  const scale = reducedMotion ? 1 / 3 : 1;

  function paint(next: RitualStage): void {
    stage = next;
    if (word) {
      word.hidden = next === 'idle';
      word.textContent = next === 'idle' ? '' : WORD[next];
      word.dataset.stage = next;
    }
    if (save) save.hidden = next !== 'approved';
    // 首屏按钮盖章后退场：终态只留 Save 一个按钮（COPY-SITES §3）；
    // 重盖时它回来，因为纸角的 Stamp again 在 verifying 期间是收起的。
    if (cta) cta.hidden = next === 'approved';
    // 二级提示与保存按钮同步：只有 approved 之后才露出，重盖时立刻收起。
    // 它属于仪式状态而非独立状态机 —— 不为它增加第五个阶段。
    if (hint) hint.hidden = next !== 'approved';
    onApproved?.(next === 'approved');
    if (next === 'stamping') {
      round += 1;
      restamp(seal, round);
    }
    if (next === 'approved' && seal) seal.classList.add('is-set');
  }

  return {
    start(): void {
      elapsed = 0;
      if (seal) seal.classList.remove('is-set');
      paint('verifying');
    },
    tick(dt: number): RitualStage {
      if (stage === 'idle' || stage === 'approved') return stage;
      elapsed += dt;
      const verifying = DURATION.verifying * scale;
      const stamping = verifying + DURATION.stamping * scale;
      // 三个词按时间窗依次出现，`approved` 出现后不再变化（它是终态，不是第四段）
      if (elapsed >= stamping) paint('approved');
      else if (elapsed >= verifying) paint('stamping');
      return stage;
    },
    done(): boolean {
      return stage === 'approved';
    },
    stage(): RitualStage {
      return stage;
    },
  };
}

/** 站内"章"上的一句定稿文字（与导出卡共用同一常量，避免两处各写一份）。 */
export const SEAL_TEXT = COPY.license.ctaCopy ?? 'Stamp it';
