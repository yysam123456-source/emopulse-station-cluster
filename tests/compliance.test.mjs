// QA 反向设计与合规扫描：7 站产物零外链、零注册/消费/导流引导词、零占位符。
// 运行：node tests/compliance.test.mjs
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '..', 'dist');
const ids = readdirSync(dist).filter((f) => f.endsWith('.html')).map((f) => f.slice(0, -5)).sort();

let pass = 0;
const failures = [];
function check(cond, msg) {
  if (cond) pass += 1;
  else { failures.push(msg); console.log(`  FAIL  ${msg}`); }
}

// 明确禁止的导流/注册/消费关键词（purchase 需结合上下文白名单，单独处理）
const BANNED = [
  ['github', /\bgithub\b/i], ['ko-fi', /\bko-?fi\b/i], ['kofi', /\bkofi\b/i],
  ['patreon', /\bpatreon\b/i], ['buy me a coffee', /buy\s+me\s+a\s+coffee/i],
  ['donate', /\bdonat(e|ion)\b/i], ['sponsor CTA', /\bsponsor\s+(us|me)\b/i],
  ['subscribe', /\bsubscrib(e|ing|tion)\b/i], ['signup', /\bsign[\s_-]?up\b/i],
  ['register CTA', /\bregister\s+now\b/i], ['赞助', /赞助/], ['打赏', /打赏/],
  ['购买', /购买/], ['订阅', /订阅/], ['立即注册', /立即注册/],
];

for (const id of ids) {
  const html = readFileSync(path.join(dist, `${id}.html`), 'utf8');
  console.log(`\n[${id}] ${html.length} chars`);

  // 1) 占位符清零
  check(!html.includes('/*SCRIPT*/') && !html.includes('/*RUNTIME*/'), `${id}: 残留占位符`);

  // 2) 零 http(s) 字面量（外链）
  const httpMatch = html.match(/https?:\/\/[^\s"'<>()]*/gi);
  check(!httpMatch, `${id}: 含 http(s) 外链 ${httpMatch ? httpMatch.join(', ') : ''}`);

  // 3) 零外部资源标签引用（含协议相对 //）
  const extRes = html.match(/<(?:script|link|img|iframe|source|video|audio)[^>]+(?:src|href)\s*=\s*["']?(?:https?:)?\/\//gi);
  check(!extRes, `${id}: 含外部资源标签 ${extRes ? extRes.join(', ') : ''}`);

  // 4) 禁止的导流/注册/消费关键词
  for (const [label, re] of BANNED) {
    const m = html.match(re);
    check(!m, `${id}: 命中禁止词 ${label}${m ? ` (${m[0]})` : ''}`);
  }

  // 5) purchase 白名单：仅允许出现在 "NO PURCHASE"/"No purchase" 否定式免责声明中
  const purchases = [...html.matchAll(/\bpurchase\b/gi)];
  const badPurchase = purchases.filter((mm) => {
    const ctx = html.slice(Math.max(0, mm.index - 12), mm.index + mm[0].length + 4);
    return !/\bno\s+purchase\b/i.test(ctx); // 上下文无 "no purchase" 即视为可疑
  });
  check(badPurchase.length === 0, `${id}: purchase 未处于否定免责声明上下文 ${badPurchase.map((m) => m[0]).join(',')}`);

  // 6) 表单/输入控件（注册引导载体）
  check(!/<form\b|<input\b/i.test(html), `${id}: 含 form/input 元素`);

  // 7) target=_blank 外跳
  check(!/target\s*=\s*_blank/i.test(html), `${id}: 含 target=_blank 外跳`);

  if (purchases.length) console.log(`  INFO  ${id}: purchase 出现 ${purchases.length} 次，均为否定式免责声明`);
}

console.log(`\n站点数=${ids.length}  合规检查 PASS=${pass} FAIL=${failures.length}`);
if (failures.length) { console.log('失败明细：'); failures.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
