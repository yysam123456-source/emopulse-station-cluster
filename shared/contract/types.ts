// L1 协议层：站点配置、运行时上下文、插件接口的唯一真相源。
import type { AppEvent, StateMachine } from './state-machine';
import type { AnalyticsApi } from './analytics';
import type { CompositionConfig } from './composition';

import type * as THREE from 'three';

/**
 * 站点 ID——**开放字符串**（ADR-6 / E1 / INV-6）。
 * 一次性从 7 项联合枚举放宽：此后新增站点只需追加 site.manifest.ts，不再改本文件。
 * 明确**不使用**品牌类型 `string & { brand }`：品牌类型不接受裸字面量赋值，
 * 会让既有 7 站 site.config.ts 的 `id: 'still'` 全部 tsc 报错 → 破坏 INV-3。
 * 类型安全由三层保留：编译期 `satisfies SiteConfig` + 构建期 validate-manifest.mjs
 * + 测试期 verify-registry.mjs / verify-append-only.mjs。
 */
export type SiteId = string;

/**
 * 配色常量——五字段保持不变，落点跨两个文件（v1.1 据真实源码校准）：
 *   WCOL/PCOL/SUNC → shaders.js 的 WGSL 字符串内 vec3f(r,g,b)，注入时保留 vec3f(...) 包裹；
 *   EXPO/RAYS      → main.js 的 JS 浮点字面量（与 TANH=0.6/NEAR=0.1 同行），只替换数字 token。
 * core 落盘文件恒不变，由 shared/build/inject-theme.mjs 对拼接后的 js 字符串注入。
 */
export interface ThemeConfig {
  WCOL: [number, number, number];
  PCOL: [number, number, number];
  SUNC: [number, number, number];
  EXPO: number;
  RAYS: number;
}

/** 首屏文案——对应 template.html（站点 override 或 core 模板）。 */
export interface CopyConfig {
  title: string;
  subtitle: string;
  controls: string[];
  locale: 'zh' | 'en' | 'zh-en';
}

/** 视点骨架参数——对应 core/main.js 的 POSES。 */
export interface Viewpoint {
  position: [number, number, number];
  target: [number, number, number];
  label?: string;
}

/** 画质 API——对应 core/quality.js 的三档 + 自适应。 */
export interface QualityApi {
  readonly level: 'low' | 'medium' | 'high';
  readonly auto: boolean;
  setLevel(level: 'low' | 'medium' | 'high'): void;
}

/** 音频 API——对应 core/audio.js，默认静音待用户开启。 */
export interface AudioApi {
  readonly enabled: boolean;
  volume: number;
  setEnabled(enabled: boolean): void;
  setVolume(volume: number): void;
}

/** 布局参数——对接 core 的 world.js / math.js / quality.js / audio.js。 */
export interface LayoutConfig {
  seed: number;
  viewpoints: Viewpoint[];
  quality: 'low' | 'medium' | 'high' | 'auto';
  audio: { enabled: boolean; volume: number };
}

/** 零件引用——glue 据此从 parts-library 装载零件。 */
export interface PartRef {
  id: string;
  source: string;
  enabled: boolean;
  options?: Record<string, unknown>;
}

/** 埋点开关配置。 */
export interface AnalyticsConfig {
  enabled: boolean;
  sitTiming?: boolean;
  endpoint?: string;
}

/** 站点完整配置 schema。 */
export interface SiteConfig {
  id: SiteId;
  route: string;
  theme: ThemeConfig;
  copy: CopyConfig;
  layout: LayoutConfig;
  parts: PartRef[];
  analytics: AnalyticsConfig;
  /**
   * ★ 新增可选字段（ADR-8）：nexus 8 站提供 → 走 Composer + GenericApp；
   * legacy 7 站不提供 → 走原 glue，零回归。字段可选是双轨并存的唯一解。
   */
  composition?: CompositionConfig;
}

/** 运行时上下文——Runtime 注入给站点，站点不自行 new 引擎。 */
export interface RuntimeContext {
  scene: THREE.Scene;
  camera: THREE.Camera;
  renderer: THREE.WebGLRenderer;
  quality: QualityApi;
  audio: AudioApi;
  state: StateMachine;
  analytics: AnalyticsApi;
  store: Record<string, unknown>;
}

/** ★ 站点插件接口——所有站点必须实现，Runtime 按此契约驱动生命周期。 */
export interface SiteApp {
  readonly id: SiteId;
  init(config: SiteConfig, ctx: RuntimeContext): void;
  mount(container: HTMLElement): void;
  start(): void;
  pause(): void;
  getScene(): THREE.Scene;
  onEvent(event: AppEvent, payload?: unknown): void;
  dispose(): void;
}

/** 站点工厂——注册到 Runtime，避免底座反向依赖站点模块。 */
export type SiteAppFactory = () => SiteApp;
