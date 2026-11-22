// /still 的站内接线：Sit → 体素世界沉到近景。
//
// 第一次按是「坐下」，再按一次是「站起来」——同一个按钮，两个方向。
// 不新增文案：按钮上始终是定稿的 'Sit'，状态由世界自己表达（视角下去/回来）。
import type { SiteHandle } from '../../shared/sites/shell';

export function attach(handle: SiteHandle): void {
  let seated = false;
  const toggle = (): void => {
    seated = !seated;
    handle.stage.cue(seated ? 'sit' : 'stand');
  };
  window.addEventListener('site:cta', toggle);
}

export default attach;
