// L1 结构级覆盖：按 FILES 顺序读文件，站点 override/ 同名文件优先，否则取 core 原文件。
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * @param {{ coreDir: string, overrideDir: string, files: readonly string[] }} options
 * @returns {Array<{ name: string, source: string, from: 'core' | 'override' }>}
 */
export function resolveOverlay(options) {
  const { coreDir, overrideDir, files } = options;
  if (!Array.isArray(files) || files.length === 0) throw new Error('[resolve-overlay] FILES 为空');
  return files.map((name) => {
    const overridePath = path.join(overrideDir, name);
    const corePath = path.join(coreDir, name);
    if (existsSync(overridePath)) {
      return { name, source: readFileSync(overridePath, 'utf8'), from: 'override' };
    }
    if (!existsSync(corePath)) throw new Error(`[resolve-overlay] core 文件缺失：${corePath}`);
    return { name, source: readFileSync(corePath, 'utf8'), from: 'core' };
  });
}

/** 检查 override/ 中是否存在不在 FILES 内的文件（会被构建忽略，提前提示避免误以为是有效覆盖）。 */
export function warnUnknownOverrides(overrideDir, files, logger = console.warn) {
  if (!existsSync(overrideDir)) return [];
  const allowed = new Set(files);
  const unknown = [];
  for (const name of readdirSync(overrideDir)) {
    if (statSync(path.join(overrideDir, name)).isFile() && !allowed.has(name)) unknown.push(name);
  }
  if (unknown.length) logger(`[resolve-overlay] 注意：override/ 中文件不在 FILES 内（将被忽略）：${unknown.join(', ')}`);
  return unknown;
}
