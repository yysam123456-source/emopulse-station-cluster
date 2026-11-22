// shared/stage 的公开入口。
//
// 站点与零件只从这里 import —— 内部实现（world.ts / stage.ts）随时可改，
// 对外只承诺本文件导出的名字。
export {
  LAYER_ORDER,
  LAYER_LABEL,
  BLEND_MODES,
  StageError,
} from './contract';

export type {
  AudioState,
  BiomeId,
  BlendMode,
  CueVerb,
  DegradedEntry,
  Lod,
  PartChannel,
  PartEnv,
  PartGeometry,
  PartInstance,
  PartLayer,
  PartV2,
  PointerState,
  Rect,
  StageErrorCode,
  StageSize,
  WorldFrame,
} from './contract';

export { CUE_VERBS } from './contract';

export {
  DEFAULT_BUDGET_MS,
  DEFAULT_MAX_DPR,
  createStage,
  sortParts,
  validateParts,
} from './stage';

export type { Stage, StageGeometry, StageOptions, StageStats } from './stage';

export {
  MAX_DT_SECONDS,
  createPointerTracker,
  createWorld,
  hashSeed,
  mulberry32,
  planBudget,
} from './world';

export type { BudgetPlan, PointerTracker, World, WorldOptions } from './world';
