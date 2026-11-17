#!/usr/bin/env bash
# QA 站点隔离负向测试：只改 praise 配色并只重建 praise，断言其余 6 站哈希逐一未变；恢复后 praise 回到原值。
# 运行：bash tests/site-isolation.sh   （须在项目根目录执行）
set -u
cd "$(dirname "$0")/.." || exit 1

CFG=sites/praise/site.config.ts
BAK=/tmp/praise-site.config.ts.qabak
BASE=tests/baseline-dist.sha256
FAIL=0

echo "=== [0] 记录基线 7 站哈希 ==="
cp "$BASE" /tmp/qa-base.sha256
cp "$CFG" "$BAK"
sha256sum dist/*.html > /tmp/qa-before.sha256
cat /tmp/qa-before.sha256

echo "=== [1] 篡改 praise WCOL[0]：0.74 -> 0.11（仅此一站一个色值）==="
sed -i 's/WCOL: \[0.74, 0.78, 0.80\]/WCOL: [0.11, 0.78, 0.80]/' "$CFG"
grep 'WCOL:' "$CFG"

echo "=== [2] 仅重建 praise ==="
node build.mjs praise || echo "构建 praise 返回非0"
sha256sum dist/*.html > /tmp/qa-after.sha256

echo "=== [3] 逐站断言 ==="
for id in still license praise hug koi-pond koi-ink koi-watercolor; do
  before=$(grep "dist/$id.html" /tmp/qa-before.sha256 | awk '{print $1}')
  after=$(grep "dist/$id.html" /tmp/qa-after.sha256 | awk '{print $1}')
  if [ "$id" = "praise" ]; then
    if [ "$before" != "$after" ]; then echo "  PASS  praise 产物随配置改变（$before -> $after）"; else echo "  FAIL  praise 改配置后产物未变"; FAIL=1; fi
  else
    if [ "$before" = "$after" ]; then echo "  PASS  $id 哈希未变（$after）"; else echo "  FAIL  $id 被意外重建/污染（$before -> $after）"; FAIL=1; fi
  fi
done

echo "=== [4] 恢复配置并重建 praise ==="
cp "$BAK" "$CFG"
rm -f "$BAK"
grep 'WCOL:' "$CFG"
node build.mjs praise || echo "恢复构建返回非0"

echo "=== [5] 全量对基线校验 ==="
sha256sum -c "$BASE" || FAIL=1

echo "=== 结论 ==="
[ "$FAIL" -eq 0 ] && echo "站点隔离 PASS" || echo "站点隔离 FAIL"
exit "$FAIL"
