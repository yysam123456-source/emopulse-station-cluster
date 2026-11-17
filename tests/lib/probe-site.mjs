// 测试辅助：临时「探针站点」的创建 / 清理（verify-append-only / verify-config-driven 共用）。
// 纪律：探针目录只在测试运行期间存在，finally 必须清理；不写入任何既有站点或底座文件。
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './load-ts.mjs';

/**
 * 探针站点模板（最小、无外链、含 /*SCRIPT*\/ 与 /*RUNTIME*\/ 双占位符、含 canvas）。
 * 为什么不直接复用 shared/core/template.html：core 模板是 L0 独立构建用的，
 * 内含 GitHub / Ko-fi 两处 `https://` 外链（每站点覆写模板时都会去掉），
 * 直接拿来建站会被 assertArtifact 的零外链断言拦下（这本身是 INV-2 的护栏，不是缺陷）。
 */
export function probeTemplate() {
  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Probe</title>
<style>html,body{margin:0;height:100%;background:#0f1012;color:#ddd}canvas{display:block;width:100%;height:100%}#s{margin:0}</style>
</head>
<body>
<canvas id="c"></canvas>
<p id="s"></p>
<script>/*SCRIPT*/</script>
<script>/*RUNTIME*/</script>
</body>
</html>
`;
}

/** 默认主题五值（与既有 7 站都不同，避免与 L2 注入口径混淆）。 */
export const PROBE_THEME = {
  WCOL: [0.31, 0.29, 0.27],
  PCOL: [0.71, 0.66, 0.6],
  SUNC: [1.21, 1.1, 0.99],
  EXPO: 0.59,
  RAYS: 0.45,
};

/**
 * 创建探针站点：manifest + config + bridge + override/template.html。
 * @param {{ dirName: string, id: string, theme?: object }} options
 * @returns {string} 站点目录绝对路径
 */
export function createProbeSite(options) {
  const { dirName, id, theme = PROBE_THEME } = options;
  const dir = path.join(REPO_ROOT, 'sites', dirName);
  mkdirSync(path.join(dir, 'override'), { recursive: true });

  writeFileSync(path.join(dir, 'site.manifest.ts'), `// 临时探针 manifest：由测试创建并在 finally 删除。
import { defineSite } from '../../shared/contract/manifest';

export default defineSite({
  id: '${id}',
  route: '/${id}',
  dir: 'sites/${dirName}',
  out: '${id}.html',
  config: 'site.config.ts',
  bridge: 'bridge.ts',
  cohort: 'nexus',
  engine: 'canvas2d',
  requires: 'none',
});
`, 'utf8');

  writeFileSync(path.join(dir, 'site.config.ts'), `// 临时探针配置：由测试创建并在 finally 删除。
import type { SiteConfig } from '../../shared/contract/types';

const config: SiteConfig = {
  id: '${id}',
  route: '/${id}',
  theme: {
    WCOL: [${theme.WCOL.join(', ')}],
    PCOL: [${theme.PCOL.join(', ')}],
    SUNC: [${theme.SUNC.join(', ')}],
    EXPO: ${theme.EXPO},
    RAYS: ${theme.RAYS},
  },
  copy: { title: 'Probe ${id}', subtitle: 'temporary probe site', controls: ['Start'], locale: 'zh-en' },
  layout: {
    seed: 20261117,
    viewpoints: [{ position: [0, 1.6, 4], target: [0, 1.4, 0], label: 'main' }],
    quality: 'auto',
    audio: { enabled: false, volume: 0.3 },
  },
  parts: [],
  analytics: { enabled: false },
  composition: { narrative: [], scene: [], interaction: [], audio: [], artifact: [] },
};

export default config;
`, 'utf8');

  writeFileSync(path.join(dir, 'bridge.ts'), `// 临时探针桥接：由测试创建并在 finally 删除。
// 真实 nexus 站的 bridge 只有一行 mountSite(config)；探针不需要运行时，故留空导出。
export const PROBE_BRIDGE = '${id}';
`, 'utf8');

  writeFileSync(path.join(dir, 'override', 'template.html'), probeTemplate(), 'utf8');
  return dir;
}

/**
 * 清理探针站点与产物。
 * @param {{ dirName: string, out: string }} options out 为产物文件名（如 'zzz-probe.html'）
 */
export function removeProbeSite(options) {
  const dir = path.join(REPO_ROOT, 'sites', options.dirName);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  const dist = path.join(REPO_ROOT, 'dist', options.out);
  if (existsSync(dist)) rmSync(dist, { force: true });
}
