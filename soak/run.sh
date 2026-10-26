#!/usr/bin/env bash
# Run from any directory after the portable prerequisites in soak/README.md.
set -euo pipefail
cd "$(dirname "$0")/.."
. soak/env.sh
soak_mode="${1:-chaos}"
export SOAK_OUTPUT="${SOAK_OUTPUT:-soak-${soak_mode}-$(date +%s)}"
case "$soak_mode" in
  chaos)
    export SOAK_SEEDS="${2:-1,2,3,4,5,6,7,8,9,10}"
    soak_targets=(soak/chaos.spec.mjs)
    soak_repeats="${3:-1}"
    ;;
  focused)
    soak_targets=(soak/reload.spec.mjs)
    soak_repeats="${2:-3}"
    ;;
  regression)
    soak_targets=(e2e/sync.spec.mjs e2e/offline.spec.mjs)
    soak_repeats="${2:-25}"
    ;;
  *) echo 'Usage: bash soak/run.sh {chaos [seeds] [repeats]|focused [repeats]|regression [repeats]}' >&2; exit 2 ;;
esac
exec npx playwright test -c soak/playwright.config.mjs "${soak_targets[@]}" \
  --project="${SOAK_BROWSER:-chromium}" --repeat-each="$soak_repeats"
