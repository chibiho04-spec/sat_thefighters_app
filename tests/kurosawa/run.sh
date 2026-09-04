#!/bin/bash
# tests/kurosawa/run.sh — KUROSAWA mode のテストを順に実行
cd "$(dirname "$0")/../.."
fail=0
for t in tests/kurosawa/test-*.js; do
  [ -f "$t" ] || continue
  echo "=== $t ==="
  node "$t" || fail=1
  echo
done
[ $fail -eq 0 ] && echo "ALL PASS" || { echo "FAILED"; exit 1; }
