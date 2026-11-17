// 根目录构建入口：转发到 shared/build/build.mjs，支持 `node build.mjs <site> | all`。
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(here, 'shared', 'build', 'build.mjs');
const result = spawnSync(process.execPath, [target, ...process.argv.slice(2)], {
  cwd: here,
  stdio: 'inherit',
});
if (result.error) {
  console.error(`构建入口启动失败：${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
