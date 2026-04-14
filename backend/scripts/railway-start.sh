#!/usr/bin/env bash
# Railway: DB was often created with `db push`, so `_prisma_migrations` is empty while tables
# exist — Prisma then returns P3005. Baselining the first historical migration once fixes it.
set -euo pipefail

cd "$(dirname "$0")/.."

set +e
OUT="$(npx prisma migrate deploy 2>&1)"
CODE=$?
set -e

echo "$OUT"

if [ "$CODE" -ne 0 ]; then
  if echo "$OUT" | grep -q 'P3005'; then
    echo "[railway-start] P3005: marking 20260410000001_agent_powered_hunting as already applied, then retrying deploy."
    npx prisma migrate resolve --applied "20260410000001_agent_powered_hunting"
    npx prisma migrate deploy
  else
    exit "$CODE"
  fi
fi

exec node dist/index.js
