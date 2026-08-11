#!/usr/bin/env bash
# Bundle a TypeScript k6 entrypoint into a single ES2015 JS file via esbuild.
# Usage: scripts/bundle.sh <entry.ts> <out.js>

set -euo pipefail

ENTRY="${1:?usage: bundle.sh <entry.ts> <out.js>}"
OUT="${2:?usage: bundle.sh <entry.ts> <out.js>}"

if [[ ! -f "$ENTRY" ]]; then
  echo "entry not found: $ENTRY" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUT")"

npx --yes esbuild "$ENTRY" \
  --bundle \
  --format=esm \
  --platform=neutral \
  --target=es2015 \
  --external:k6 \
  --external:k6/* \
  --external:https://* \
  --sourcemap=inline \
  --outfile="$OUT"

echo "bundled: $OUT"
