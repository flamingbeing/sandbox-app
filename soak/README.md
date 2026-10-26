# Network chaos soak

Test-only harness for the pinned app-sync 1.3.10. No engine or application files are changed.
Uses only the demo-sandbox-app emulators. The test server maps emulator ports in its in-memory response;
all listeners use 8100-8107. One worker limits load. Each seed uses 2-3 isolated phone contexts,
25 random operations and real 1-60 second blips. Toggle means changing a textual done marker;
the sample application has no boolean done field. Phones own disjoint items to give an exact final-state oracle.
Each seed warms the existing service-worker shell before throttling. Chromium conditions are restored after each offline blip.
Every seed forces a reload, a close/reopen with a confirmed queued save, and an offline blip;
additional disruptions are seeded. It checks final backend content, duplicate text, every phone's list and synced chip.
This is interleaved multi-phone coverage; simultaneous same-field conflict coverage comes from sync.spec.mjs.

## Commands (repository root)

Prerequisites: Java compatible with firebase-tools 15.33.0, the project's pinned Playwright browsers and their OS dependencies,
and app-devkit v1.9.2's playwright helpers in .devkit/ (as used by the existing project config).
Use a writable npm cache and TEMP outside git, and keep PLAYWRIGHT_BROWSERS_PATH consistent between install and run.
No system packages are installed by these scripts. Set TEMP to a writable private directory before running.

```sh
npm ci
npx playwright install chromium webkit
npx playwright test -c soak/playwright.config.mjs soak/chaos.spec.mjs --project=chromium
npx playwright test -c soak/playwright.config.mjs soak/chaos.spec.mjs --project=webkit
npx playwright test -c soak/playwright.config.mjs e2e/sync.spec.mjs e2e/offline.spec.mjs --project=webkit --repeat-each=25
# Narrow reproduction:
SOAK_SEEDS=1 npx playwright test -c soak/playwright.config.mjs soak/chaos.spec.mjs --project=chromium
```

No retries; a failed assertion is not silently retried. Screenshots/traces and generated emulator configuration
are written to TEMP, not committed. The existing regression cases remain unchanged.

## Portable Linux setup

All downloads and caches below stay beside the checkout. No system packages or credentials are needed.

```sh
mkdir -p ../runtime/tmp
curl -fL 'https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jdk/hotspot/normal/eclipse' -o ../runtime/jdk.tar.gz
tar -xzf ../runtime/jdk.tar.gz -C ../runtime
. soak/env.sh
npm ci
npx playwright install chromium webkit
mkdir -p .devkit/playwright
curl -fsSL https://raw.githubusercontent.com/flamingbeing/app-devkit/v1.9.2/playwright/helpers.mjs -o .devkit/playwright/helpers.mjs
SOAK_OUTPUT=chromium-round1 npx playwright test -c soak/playwright.config.mjs soak/chaos.spec.mjs --project=chromium
SOAK_OUTPUT=accepted-reload npx playwright test -c soak/playwright.config.mjs soak/reload.spec.mjs --project=chromium --repeat-each=3
SOAK_OUTPUT=chromium-regression npx playwright test -c soak/playwright.config.mjs e2e/sync.spec.mjs e2e/offline.spec.mjs --project=chromium --repeat-each=25
```

`env.sh` selects the portable JDK, Ubuntu 24.04 browser builds, and private writable tool caches.
`SOAK_OUTPUT` gives each execution a separate TEMP trace folder and JSON report; do not share it between simultaneous runs.
Use one execution and one worker at a time. The optional `SOAK_REUSE_AUTH=1` starts only Firestore when this job's own
Auth emulator is already running on 8102. The default starts both emulators.

## Interpretation

The random chaos case deliberately permits a reload immediately after a submit click. An optimistic row is not proof
that the save has reached durable storage. The separate `reload.spec.mjs` case waits until the input clears (the app's
save promise has resolved), then reloads before the slow upload. Report the two cases separately: an immediate-submit
race alone does not establish loss of an accepted outbox save.

See [RESULTS.md](RESULTS.md) for execution results and failure interpretation. Raw logs, screenshots, traces, downloaded tools and JSON reports stay outside git.

Short commands after portable setup: `bash soak/run.sh chaos 1`, `bash soak/run.sh regression 25`, and `bash soak/run.sh focused 3`.
