// L2 参数级覆盖：对拼接后的 js 字符串做 5 个常量的精确锚点注入。
// 纪律：core 落盘文件一行不改；每个锚点必须且仅匹配 1 次，否则构建失败。
import { CORE_ANCHORS } from './sites.config.mjs';

/** WGSL 浮点格式化：保证形如 0.42 / 1.2，避免整数被 WGSL 当作 i32。 */
function wgslFloat(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`[inject-theme] ${name} 必须是有限数字`);
  }
  const text = String(value);
  return text.includes('.') ? text : `${text}.0`;
}

/** JS 浮点格式化：保留足够精度，整数补 .0 以维持浮点语义。 */
function jsFloat(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`[inject-theme] ${name} 必须是有限数字`);
  }
  const text = String(value);
  return text.includes('.') ? text : `${text}.0`;
}

/** 统计正则在字符串中的匹配次数（不做替换）。 */
function countMatches(source, regex) {
  let count = 0;
  const re = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`);
  while (re.exec(source) !== null) count += 1;
  return count;
}

/** 唯一性校验：匹配数必须为 1。 */
function requireUnique(source, regex, name) {
  const count = countMatches(source, regex);
  if (count !== 1) {
    throw new Error(
      `[inject-theme] 锚点 ${name} 匹配 ${count} 次（要求恰好 1 次），疑似 core 升级后锚点漂移。\n` +
      `  参考原文：${CORE_ANCHORS[name]}`,
    );
  }
}

/**
 * 注入站点主题到拼接后的 js 字符串。
 * @param {string} js 拼接后的完整 js（未压缩）
 * @param {{WCOL:number[],PCOL:number[],SUNC:number[],EXPO:number,RAYS:number}} theme
 * @returns {string} 注入后的 js 字符串（不写回任何 core 文件）
 */
export function injectTheme(js, theme) {
  if (typeof js !== 'string' || js.length === 0) throw new Error('[inject-theme] js 不能为空');
  if (!theme || typeof theme !== 'object') throw new Error('[inject-theme] 缺少 theme 配置');
  for (const key of ['WCOL', 'PCOL', 'SUNC']) {
    if (!Array.isArray(theme[key]) || theme[key].length !== 3) {
      throw new Error(`[inject-theme] theme.${key} 必须是长度为 3 的数组`);
    }
  }

  let result = js;

  // vec3f 三条：整行锚点替换，保留 `const NAME = vec3f(...)` 的声明形态与 WGSL 语法。
  for (const name of ['WCOL', 'PCOL', 'SUNC']) {
    const regex = new RegExp(`const\\s+${name}\\s*=\\s*vec3f\\([^)]*\\)`);
    requireUnique(result, regex, name);
    const values = theme[name].map((v, i) => wgslFloat(v, `theme.${name}[${i}]`)).join(', ');
    result = result.replace(regex, `const ${name} = vec3f(${values})`);
  }

  // 两个浮点常量：只替换数字 token，绝不动同一行的 TANH=0.6 / NEAR=0.1。
  for (const name of ['EXPO', 'RAYS']) {
    const regex = new RegExp(`\\b${name}\\s*=\\s*(\\d+(?:\\.\\d+)?)`);
    requireUnique(result, regex, name);
    const value = jsFloat(theme[name], `theme.${name}`);
    result = result.replace(regex, (_match, _old) => `${name} = ${value}`);
  }

  // 注入后二次确认：TANH/NEAR 仍是原值（防止正则误伤同行邻居）。
  if (!/\bTANH\s*=\s*0\.6\b/.test(result) || !/\bNEAR\s*=\s*0\.1\b/.test(result)) {
    throw new Error('[inject-theme] TANH/NEAR 被意外改动，构建终止');
  }
  return result;
}
