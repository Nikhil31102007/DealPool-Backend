#!/usr/bin/env bash
set -uo pipefail

TESTS=(
  "tests/auth.test.ts"
  "tests/admin.test.ts"
  "tests/deals.test.ts"
  "tests/offers.test.ts"
  "tests/resources.test.ts"
  "tests/skills.test.ts"
  "tests/transactions.test.ts"
  "tests/payments.test.ts"
  "tests/e2e_full_suite.test.ts"
)

PASSED=()
FAILED=()

echo "=============================================="
echo " DealPool Backend — Full Test Suite"
echo "=============================================="

for t in "${TESTS[@]}"; do
  echo ""
  echo "---- Running $t ----"
  npx tsx "$t"
  if [ $? -eq 0 ]; then
    PASSED+=("$t")
  else
    FAILED+=("$t")
  fi
done

echo ""
echo "=============================================="
echo " Summary"
echo "=============================================="
echo "Passed: ${#PASSED[@]}"
for p in "${PASSED[@]:-}"; do
  [ -n "$p" ] && echo "  ✓ $p"
done

echo "Failed: ${#FAILED[@]}"
for f in "${FAILED[@]:-}"; do
  [ -n "$f" ] && echo "  ✗ $f"
done

echo "=============================================="

if [ ${#FAILED[@]} -ne 0 ]; then
  exit 1
fi

exit 0