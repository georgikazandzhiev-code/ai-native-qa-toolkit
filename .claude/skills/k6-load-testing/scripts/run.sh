#!/usr/bin/env bash
# Bundle + run a k6 TypeScript test. Uses local k6 binary if available,
# otherwise falls back to the grafana/k6 Docker image.
# Usage: scripts/run.sh <entry.ts> [extra k6 args...]

set -euo pipefail

ENTRY="${1:?usage: run.sh <entry.ts> [k6-args...]}"
shift || true

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${K6_OUT_DIR:-dist/perf}"
BASENAME="$(basename "${ENTRY%.ts}").js"
OUT="${OUT_DIR}/${BASENAME}"
SUMMARY="${OUT_DIR}/$(basename "${ENTRY%.ts}").summary.json"

mkdir -p "$OUT_DIR"

# shellcheck disable=SC1091
"$SKILL_DIR/scripts/bundle.sh" "$ENTRY" "$OUT"

K6_ARGS=(run --summary-export "$SUMMARY" "$OUT" "$@")

if command -v k6 >/dev/null 2>&1; then
  echo "running with local k6 ($(k6 version | head -1))"
  k6 "${K6_ARGS[@]}"
else
  echo "k6 binary not found; using docker grafana/k6:latest"
  docker run --rm -i \
    -v "$PWD:/work" -w /work \
    -e BASE_URL -e TOKEN -e TENANT \
    -e AUTH_URL -e CLIENT_ID -e CLIENT_SECRET \
    -e K6_PROMETHEUS_RW_SERVER_URL \
    grafana/k6:latest "${K6_ARGS[@]}"
fi

echo "summary: $SUMMARY"
