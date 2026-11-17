// 照抄原版 build.mjs 的压缩与内联逻辑：WGSL 收缩 → esbuild transformSync(minify) → CSS 压缩 → 模板内联。
// 注意 esbuild 在此只做 transform，不做 bundle：6 文件已在共享作用域中拼接。
import { transformSync } from 'esbuild';

/** 单个 async IIFE 包装；启动错误显示在首屏（与 core/build.mjs 逐字一致）。 */
export const wrap = (body) => `(async()=>{${body}\n})().catch(e=>{console.error(e);document.body.className='l e';document.getElementById('s').textContent=(e.cause?'':'Failed to start: ')+e.message});`;

/** 收缩 /*wgsl*\/ 模板字符串：去注释、压空白、符号两侧不留空格。 */
const minWgsl = (s) => s.replace(/\/\/[^\n]*/g, '').replace(/\s+/g, ' ').replace(/ ?([{}()\[\];,:=+\-*\/<>&|!%@]) ?/g, '$1').trim();

/**
 * 把拼接并注入后的 js 内联进模板的 /*SCRIPT*\/ 占位符。
 * @param {string} js 拼接后的完整 js（已注入主题）
 * @param {string} template 模板 html
 * @param {{ readable?: boolean }} options
 */
export function inlineHtml(js, template, options = {}) {
  if (!template.includes('/*SCRIPT*/')) throw new Error('[inline] 模板缺少 /*SCRIPT*/ 占位符');
  if (options.readable) return template.replace('/*SCRIPT*/', () => wrap(js));

  let source = js.replace(/\/\*wgsl\*\/`([^`]*)`/g, (_, w) => '`' + minWgsl(w) + '`');
  const code = transformSync(wrap(source), { minify: true, target: 'es2022', legalComments: 'none' }).code.trim();
  const css = (_, s) => '<style>' + transformSync(s, { loader: 'css', minify: true }).code.trim();
  return template
    .replace(/<style>([^]*?)(?=<\/style>)/, css)
    .replace(/>\s+</g, '><')
    .replace('/*SCRIPT*/', () => code)
    .replace(/<script>\s+/, '<script>')
    .replace(/\s+<\/script>/, '</script>');
}

/** 把站点桥接脚本（已编译为 IIFE 字符串）内联进 /*RUNTIME*\/ 占位符。 */
export function inlineRuntime(html, bridgeCode) {
  if (!bridgeCode) return html;
  if (!html.includes('/*RUNTIME*/')) throw new Error('[inline] 站点模板缺少 /*RUNTIME*/ 占位符（桥接脚本无法注入）');
  return html.replace('/*RUNTIME*/', () => bridgeCode);
}
