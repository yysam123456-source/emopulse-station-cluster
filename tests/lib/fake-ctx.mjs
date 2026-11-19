// 假 ctx 的兜底守卫 —— 手写假 ctx 漏方法的**结构性**解药。
//
// 为什么需要它（第三次了，每次都是同一个病）：
//   1. `parts-composition` 的假 ctx 缺 `clip` → 零件每帧抛 TypeError → 装配器隔离 → **画到一半就停**
//      → 「3 次 fill / 3 次 stroke」的计数断言反而"恰好"成立 → 15/15 绿而零件坏了两轮。
//   2. `paper-ink/bench.mjs` 缺 `strokeRect` → 构造期直接崩（运气好，崩得响）。
//   3. `preview-build` 缺 `rect` → 同上。
//   假 ctx 是**手写**的：真 ctx 多一个方法就可能漏，而漏的后果是「零件在测试环境里行为与真机不同」。
//
// ★ 为什么不是"缺了就返回 undefined"（那更糟）：
//   吞成 undefined 会让零件继续跑，只是少画了几笔 —— 画面错但测试全绿，正是这个仓库最贵的失败模式。
//   所以这里**记录 + 抛错**：错误信息直接说出方法名，调用点立刻停下来。
//
// ★ 为什么不是"只抛错"（那就是原生 TypeError）：
//   原生 TypeError 只说 `ctx.clip is not a function`，读者不知道"是我漏了还是零件写错了"，
//   而且同一个方法可能被调用几百次、刷满日志。这里去重记录，并在测试收尾断言清单为空。
//
// 用法：
//   const { ctx, missing, report } = guardCtx(makeFakeCtx(...));
//   ...用 ctx 当普通假 ctx...
//   report('field-ground');   // 清单非空 → 抛错并列出方法名
//
// @param {object} base 手写的假 ctx
// @returns {{ ctx: object, missing: Set<string>, report: (label: string) => void }}
export function guardCtx(base) {
  if (!base || typeof base !== 'object') throw new TypeError('[fake-ctx] guardCtx 需要一个假 ctx 对象');

  /** 被访问过但没实现的方法名（去重） */
  const missing = new Set();

  const proxy = new Proxy(base, {
    get(target, prop, receiver) {
      if (prop in target) return Reflect.get(target, prop, receiver);
      if (typeof prop !== 'string') return undefined;
      // 未知成员：记下来，并让调用点拿到一个"会喊出名字"的函数
      return function missingContextMethod() {
        missing.add(prop);
        throw new Error(
          `[fake-ctx] 假 ctx 未实现 ${prop}() —— 请补进假 ctx。`
          + '零件不得在假环境里静默降级（静默降级 = 测试绿而画面错）。',
        );
      };
    },
    // 写入直接落到目标对象：`ctx.imageSmoothingEnabled = false` 这类赋值必须正常生效
    set(target, prop, value, receiver) {
      return Reflect.set(target, prop, value, receiver);
    },
  });

  return {
    ctx: proxy,
    missing,
    report(label) {
      if (missing.size === 0) return;
      throw new Error(
        `[fake-ctx] ${label}: 假 ctx 缺少 ${missing.size} 个方法 —— ${[...missing].join(', ')}`
        + '（这些方法被零件调用过；真 ctx 有、假 ctx 没有，等于测试跑在了不同的环境里）',
      );
    },
  };
}
