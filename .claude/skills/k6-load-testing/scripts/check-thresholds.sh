#!/usr/bin/env bash
# Parse a k6 --summary-export JSON file and exit nonzero if any threshold failed.
# Usage: scripts/check-thresholds.sh <summary.json>

set -euo pipefail

SUMMARY="${1:?usage: check-thresholds.sh <summary.json>}"

if [[ ! -f "$SUMMARY" ]]; then
  echo "summary file not found: $SUMMARY" >&2
  exit 2
fi

# Requires jq. k6 summary schema: metrics[].thresholds{} with { ok: bool, ... }.
FAILED=$(jq -r '
  [ .metrics
    | to_entries[]
    | select(.value.thresholds != null)
    | .key as $metric
    | .value.thresholds
    | to_entries[]
    | select(.value.ok == false)
    | "\($metric): \(.key)"
  ] | .[]
' "$SUMMARY")

if [[ -n "$FAILED" ]]; then
  echo "FAILED THRESHOLDS:" >&2
  echo "$FAILED" >&2
  exit 1
fi

echo "all thresholds passed"
