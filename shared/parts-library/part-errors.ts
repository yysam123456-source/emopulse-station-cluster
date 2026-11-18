// 零件装配层的具名错误：把「未装站」从 `undefined` 崩溃变成可断言事实（T-R01）。
//
// 为什么单独一个文件而不是塞进 registry/index.ts：
//   registry/index.ts 只聚合声明，被各零件入口间接依赖；把错误类型放这里可保证
//   `part/index.ts -> part-errors.ts` 是叶子依赖，永不形成 entry ↔ registry 循环。
//
// 错误码口径（tests/verify-parts-assembly.mjs 按 `error.code` 精确断言，不看文案）：
//   E_PART_NOT_MOUNTED —— 零件无运行时装配形态（depth=D0 / 声明存在但缺装配模块）；
//   E_PART_ID_MISMATCH —— 装配模块声明的 id 与目录/注册表声明不一致；
//   E_PART_ENTRY_MISMATCH —— 装配模块的 entry 与注册表声明不一致；
//   E_PART_UNDECLARED —— 装配模块存在但注册表没有对应声明；
//   E_PART_PROVENANCE_MISSING —— 装配模块缺 provenance（REUSE-1 强制）。

/** 零件未装配错误码。 */
export const E_PART_NOT_MOUNTED = 'E_PART_NOT_MOUNTED' as const;

/** 零件 id 与目录/声明不一致。 */
export const E_PART_ID_MISMATCH = 'E_PART_ID_MISMATCH' as const;

/** 零件 entry 与注册表声明不一致。 */
export const E_PART_ENTRY_MISMATCH = 'E_PART_ENTRY_MISMATCH' as const;

/** 零件装配模块未在注册表中声明。 */
export const E_PART_UNDECLARED = 'E_PART_UNDECLARED' as const;

/** 零件缺 provenance。 */
export const E_PART_PROVENANCE_MISSING = 'E_PART_PROVENANCE_MISSING' as const;

/**
 * 零件未装配错误（可断言：`error.code === 'E_PART_NOT_MOUNTED'`）。
 *
 * 为什么不是静默返回 null：调用方若拿到 null 会继续走到 `update()` 才崩，
 * 堆栈指向无关代码；构造期具名失败把问题钉在装配点，且测试可直接断言错误码。
 */
export class PartNotMountedError extends Error {
  /** 稳定错误码，供测试与诊断按码断言。 */
  public readonly code: string;

  /** 出错零件 id（可能是逗号分隔的多个 id，用于聚合报错）。 */
  public readonly partId: string;

  /**
   * @param partId 出错零件 id（多个时用逗号连接）
   * @param reason 可读原因（必须说明「为什么没有装配形态」）
   */
  constructor(partId: string, reason: string) {
    super(`[parts-assembly] ${E_PART_NOT_MOUNTED}: 零件 ${partId} 未装配 —— ${reason}`);
    this.name = 'PartNotMountedError';
    this.code = E_PART_NOT_MOUNTED;
    this.partId = partId;
  }
}

/**
 * 装配层契约错误（id / entry / 声明 / provenance 不一致）。
 * 与「未装站」区分：这属于装配件写错了，不是零件本身缺形态。
 */
export class PartAssemblyError extends Error {
  /** 稳定错误码。 */
  public readonly code: string;

  /**
   * @param code 四个装配契约错误码之一
   * @param message 可读信息
   */
  constructor(code: string, message: string) {
    super(`[parts-assembly] ${code}: ${message}`);
    this.name = 'PartAssemblyError';
    this.code = code;
  }
}
