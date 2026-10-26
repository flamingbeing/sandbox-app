# Network chaos soak

Test-only harness for the pinned app-sync 1.3.11. No engine or application source fixes are made.
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
npx playwright install chromium
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
npx playwright install chromium
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

## Acceptance-boundary triage (1.3.11)

After portable setup, run isolated focused seeds without relying on a deployed engine:

```sh
. soak/env.sh
SOAK_WORKERS=2 node soak/focused-run.mjs
# Resume only unfinished seeds, preserving earlier report names:
SOAK_SEEDS=6,7,8,10,2 SOAK_WORKERS=2 SOAK_BATCH_TAG=continued node soak/focused-run.mjs
# Intentionally failing minimal regressions:
bash soak/run.sh minimal 1
node --test soak/tombstone-full.node.spec.mjs
```

The supervisor starts a fresh demo emulator and local server for each seed, captures bounded logs in TEMP, and
stops its process groups before the next seed. Ten repetitions per seed, no retries. SOAK_REPEATS, SOAK_WORKERS,
SOAK_SEEDS, SOAK_BATCH_TAG and SOAK_LIMIT_MINUTES support explicit resumptions. Default cap: 35 minutes.
A TEMP file named `round3-pause` requests a graceful checkpoint: later cases skip, then the supervisor stops.
Remove that control file before resuming. Skipped cases are not completed repetitions.

A prefixes stop after the originally failing operation: seed 1 step 13, 4 step 1, 6 step 13, 7 step 3, 8 step 22,
10 step 14. Seed 2 exercises all 25 operations. Subsequent chaos after the last prefix operation is omitted.
Offline dwell is shortened to 10–600 ms (SOAK_TIME_SCALE=0.01); latency remains 300–3000 ms and throughput
50–500 kbps. This is focused boundary coverage, not a full-duration soak. Original full chaos remains available
through `run.sh chaos`; SCALE=1 is the default outside the supervised focused runner.

SOAK_TRACE instruments only served cloud.js, observing the public app.sync.save call and its original promise.
The response CSP hash matches the bumped import map; Worker source is unchanged. SYNC_DIR routes browser engine
modules from the installed package. No engine implementation files or application behavior are patched.
observe.mjs records input assignments/submits and reads item, outbox and tombstone IndexedDB stores before
reload/close. Firebase Auth databases are excluded. Evidence and traces stay outside git, under TEMP.
A read transaction can let an unacknowledged enqueue finish, so record save resolution and queue presence separately.

SOAK_GUARD_QUICK_ADD waits for previous promises before filling a new draft, isolating A/B from C; it adds no wait
before the current operation's immediate reload. SOAK_STATUS=observe retains exact backend/UI, duplicate and deletion
assertions, while recording chip status separately. A data pass is not a full synced-chip pass. SOAK_CLEANUP closes
each scenario's clients after evidence capture, checks CSP, then deletes only the item/bin IDs that scenario saved.
The oracle paginates all backend documents instead of silently stopping at 300.

quick-input.spec.mjs pins “submit first draft → enter next draft → finish first save → attempt next add”.
The earlier completion clears the newer required field; native validation then blocks a second submission.
Its normal assertion intentionally fails until the UI source bug is fixed. No save or storage is mocked.
tombstone-full.node.spec.mjs imports the installed engine and supplies an in-memory store plus ordered listener
callbacks. It proves that a delayed first full snapshot restores a version already covered by a tombstone.
Its ten assertions intentionally fail on 1.3.11. This is an engine model, not a browser replay.

For separate manual probes, SOAK_REUSE_SERVER=1 may reuse this job's local server. PW_NO_EMULATOR=1 prevents
parallel global setup from clearing another batch's data. Use different output names. Alternate reserved ports
SOAK_PORT=8103 or 8109 and SOAK_FIRESTORE_HOST=127.0.0.1:8104 are accepted; a direct Firestore on 8104 uses
WebSocket 8108 and the demo Auth emulator remains 8102. Never reuse a live service or bind outside 8100–8109.
See RESULTS.md for verified totals, excluded saturated attempts and exact limitations.
