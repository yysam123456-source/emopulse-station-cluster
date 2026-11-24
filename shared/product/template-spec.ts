// 模板类型契约（产品化第一层的 TS 面）。
//
// 真源是 `templates.mjs`：构建脚本、Studio 生成器都读它；这里只给仓库里的 TS
// 消费方一个稳定类型，不复制参数值。这样加模板只改一处，不会出现“TS 表已更新、
// 构建脚本还是旧 preset”的漂移。
import { TEMPLATES as TEMPLATE_DATA } from './templates.mjs';

export type TemplateStatus = 'ready' | 'needs-parts' | 'blocked';
export type TemplateParamType = 'enum' | 'number' | 'boolean';

export interface TemplateParam {
  readonly key: string;
  readonly label: string;
  readonly type: TemplateParamType;
  readonly default: string | number | boolean;
  readonly values?: readonly string[];
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
}

export interface TemplateSpec {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  /** 对应 `shared/stage/preview/build.mjs` 的 PRESETS key。 */
  readonly preset: string;
  readonly biome: 'field' | 'tide' | 'ink' | 'room';
  readonly status: TemplateStatus;
  readonly parts: readonly string[];
  readonly params: readonly TemplateParam[];
}

/** 已注册模板。 */
export const TEMPLATES: readonly TemplateSpec[] = TEMPLATE_DATA as readonly TemplateSpec[];

/** 按 id 取模板。 */
export function getTemplate(id: string): TemplateSpec | undefined {
  return TEMPLATES.find((template) => template.id === id);
}

/** 只取可构建的模板。 */
export function readyTemplates(): readonly TemplateSpec[] {
  return TEMPLATES.filter((template) => template.status === 'ready');
}
