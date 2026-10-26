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

## Acceptance-boundary triage (1.3.11)

Use the installed package as the browser's app-sync source, rather than relying on a remote deployment:

```sh
. soak/env.sh
export SOAK_TRACE=1 SOAK_GUARD_QUICK_ADD=1 SOAK_STATUS=observe SOAK_CLEANUP=1 SYNC_DIR="$PWD/node_modules/app-sync"
SOAK_OUTPUT=triage-chaos SOAK_SEEDS=1,2,4,6,7,8,10 npx playwright test -c soak/playwright.config.mjs soak/chaos.spec.mjs --project=chromium --repeat-each=10 --workers=4
# Minimal intentionally failing regression for the next-draft clearing bug:
bash soak/run.sh minimal 1
```

`SOAK_TRACE=1` instruments only the served response for `cloud.js`: it observes the public `app.sync.save`
call and original promise settlement. It does not patch engine code, delay promises, or change storage.
The test server also matches the response CSP hash to the locally bumped import map; Worker source is unchanged.
`observe.mjs` records submits and input assignments, and reads item/outbox IndexedDB stores immediately before
reload/close. Firebase Auth databases are excluded. The JSONL evidence, browser traces and reports stay in TEMP.
Snapshots are asynchronous observations and can affect a race; a snapshot showing an optimistic row alone does
not prove acceptance. Check the save resolution and queue entry as well. Backend reads paginate all results.

`quick-input.spec.mjs` pins the order “submit first draft, enter next draft, finish first save, submit next draft”.
It uses the real engine and IndexedDB, with no mocked save or artificial delay. Its failure is intentional until
the application submit handler preserves a newer draft. Keep this result separate from the natural quick-add rerun.

`SOAK_REUSE_SERVER=1` reuses only a server this job already started. For a parallel probe against that server,
`PW_NO_EMULATOR=1` also prevents global setup from clearing the running suite's demo data. Use distinct SOAK_OUTPUT
names. Do not enable reuse against a live service.

For independent A/B triage, `SOAK_GUARD_QUICK_ADD=1` waits for earlier submit promises before filling any new draft. It prevents the confirmed C race from blocking these cases; it does not wait before the normal
immediate reload. Natural quick-add and minimal C probes run without that guard.
`SOAK_SNAPSHOT=0` disables pre-reload/close reads for a paired timing control while retaining call/input traces
and failure-time snapshots. `SOAK_SEEDS=4 SOAK_STEPS=2` targets seed 4's originally reported step-1 failure;
it is prefix coverage, not a complete 25-step soak.
`delete-boundary.spec.mjs` has offline and slow-online variants. The slow variant reloads while the save promise
is unresolved; the pre-reload snapshot distinguishes durable pending tombstones from unqueued delete intentions.

`SOAK_STATUS=observe` narrows the result to the three loss classes: backend exact-set equality, every phone's exact
list and duplicate/deletion checks still assert; chip states are captured in `data-equality-result` rather than
blocking those assertions. It is not a full synced-status pass. The default still asserts the synced chip.
`SOAK_CLEANUP=1` captures evidence, checks CSP, closes the scenario's clients, then removes only item/bin records
whose IDs its own save calls created. This bounds shared-list snapshots during a long repeat run.

If a job-owned Firestore emulator becomes unhealthy, an isolated instance can use 8104 (WebSocket 8108) with the
existing demo Auth emulator on 8102. Start the portable JAR in a separate terminal with its working directory/logs
under TEMP, using `--host 127.0.0.1 --port 8104 --websocket_port 8108 --project_id demo-sandbox-app --rules <absolute-path-to-app/firestore.rules> --single_project_mode true`.
Set `SOAK_PORT=8103 SOAK_FIRESTORE_HOST=127.0.0.1:8104` for Playwright. No other ports or live projects are allowed.

A split batch may use test-server port 8109 with `SOAK_PORT=8109`, the same `SOAK_FIRESTORE_HOST=127.0.0.1:8104`,
and `PW_NO_EMULATOR=1` to preserve another batch's data. `SOAK_REPEAT_OFFSET=4` labels local repeats 0–5 as logical
repetitions 4–9. Use distinct output names and define the primary selection before aggregating overlapping runs.
The Node regression `node --test soak/tombstone-full.node.spec.mjs` independently proves that a delayed first full
snapshot can resurrect a version already covered by a tombstone; its ten cases intentionally fail on 1.3.11.
