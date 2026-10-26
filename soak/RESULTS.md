# Soak execution record

Engine: app-sync 1.3.10. One worker, demo-sandbox-app emulators only. No application or engine changes.
Raw logs, traces, screenshots, JSON reports and downloaded tools stay outside git, under ../runtime/.

## Completed results

| Suite | Browser/seeds | Runs | Pass | Fail | Observed flaky cases |
| --- | --- | ---: | ---: | ---: | ---: |
| Chaos plus representative reruns | Chromium 1–10, plus four reruns | 14 | 3 | 11 | 1 (seed 4) |
| Sync/offline regressions | Chromium, 25 repeats each | 125 | 125 | 0 | 0 |
| Acknowledged CRUD reload | Chromium, repeats 0–2 | 3 | 3 | 0 | 0 |
| Two quick adds | Chromium, repeats 0–2 | 3 | 2 | 1 | 1 |
| Requested WebKit cases | WebKit | 0/135 | — | — | — |

Flaky means an observed pass/fail reversal across repetitions, not Playwright's automatic-retry statistic (retries are disabled).
The quick-add case failed at repeat index 2; indices 0 and 1 passed. All acknowledged offline adds, edits and deletes
survived reload, reached the backend exactly once/in the expected state, and ended synced on both phones.
The initial ten-seed run had two passes (3 and 9) and eight failures. Seed 4 then passed repeat index 0 and failed indices 1 and 2 at step 16 (missing edited row), confirming an observed flake. Seed 2 failed its additional rerun earlier, at its extra offline add, so the original retained-delete outcome was observed once and was not independently reproduced.

Consolidation: seeds 1–4 are from chromium-chaos-final.json; seeds 5–6 from chromium-chaos-tail.json;
seeds 7–10 from resume-chaos-rest.json. Additional reruns are in repro-missing-row.json and repro-delete.json. Earlier server-loss attempts, including pending-status
timeouts associated with unavailable local services, are superseded and excluded from this table. They are not confirmed engine failures.
The regression source is resume-regression.json; focused cases are in resume-focused.json. Raw artifacts stay outside git.

## Distinct failure patterns

1. **Missing row after immediate add/edit and reload.** Chaos seeds 1, 4, 6, 7, 8 and 10 fail the row-presence/selection
   check at steps 13, 1, 13, 3, 22 and 14 respectively. The expected button is absent for 10 seconds.
   Hypothesis: reload can beat durable enqueue while the app is already showing an optimistic row.
   The acknowledged CRUD probe passes, so these results alone do not establish loss of an acknowledged engine save.
   Reproduce: `bash soak/run.sh chaos 1,4,6,7,8,10`.
2. **Delete not reflected in backend.** Chaos seed 2 completes its operations and reports synced, but exact-set equality
   finds one extra item (phone 0, item 7) which the oracle recorded as deleted.
   Hypothesis: reload immediately after confirmation interrupts the asynchronous delete before durable acceptance.
   Restart may then restore the older server item; the focused acknowledged-delete check passes. The retained-delete outcome remains a single observation because its rerun stopped on a different earlier assertion.
   Reproduce: `bash soak/run.sh chaos 2`.
3. **Second quick add absent.** Chaos seed 5 step 17 cannot find its extra pending item before closing the phone.
   The focused test “two quick adds retain the second input while the first save finishes” reproduces the absence
   at repeat index 2 (and seed 2 also stopped on a missing second add in its rerun): `#items` must contain the second text within 15 seconds, but contains only the first.
   Hypothesis: completion of the earlier async submit clears the input after the next text has been entered.
   The next click can then submit an empty field and enqueue nothing; this remains a UI-level attribution hypothesis.
   Reproduce: `bash soak/run.sh focused 3` or `bash soak/run.sh chaos 5`.

WebKit launch is blocked by missing host libraries; its ten chaos seeds and 125 regression cases remain unexecuted.
No system packages were installed. No engine or application code was changed; these findings are candidates at the UI/acceptance boundary.

Missing WebKit dependencies observed with ldd: libicudata.so.74, libicui18n.so.74, libicuuc.so.74, libxml2.so.2,
libwoff2dec.so.1.0.2, libvpx.so.9, libevent-2.1.so.7, libjxl.so.0.8, libavif.so.16, libmanette-0.2.so.0.

## Reproduction

From the checkout root, after the portable setup in README.md:

```sh
. soak/env.sh
SOAK_SEEDS=1,2,4,5,6 SOAK_OUTPUT=reproduce npx playwright test -c soak/playwright.config.mjs soak/chaos.spec.mjs --project=chromium
SOAK_OUTPUT=focused npx playwright test -c soak/playwright.config.mjs soak/reload.spec.mjs --project=chromium --repeat-each=3
```

An immediate submit click does not prove that an optimistic row has reached durable storage. The focused CRUD probe
waits for the app's post-save acknowledgement before reloading; report that result separately from raw-submit races.

## Final validation

All soak JavaScript files pass `node --check`; both shell scripts pass `bash -n`.
All 125 Chromium regression cases passed. Acknowledged CRUD passed 3/3. The rapid-add probe passed 2/3 and failed at index 2.
The eight initial chaos failures and three further chaos failures are reported without engine fixes or automatic retries.
WebKit's 135 requested cases remain blocked. No confirmed loss of an acknowledged save was observed in the focused probe;
that limited result does not establish that the engine is bug-free under all chaos conditions.


## Round 3: app-sync 1.3.11 (27 Oct 2026 SGT)

Local package: `github:flamingbeing/app-sync#v1.3.11`, commit `a3d25edbc37a7921d847d251704ead9aa6d6233d`.
Import map and generated service-worker shell use 1.3.11. Chromium only, demo emulators only; logs remain in TEMP.
No engine, application behavior, Worker source, or live service changes. The test server adjusts the inline-map CSP hash.

Completed so far: natural quick adds 10/10 pass; acknowledged offline CRUD 10/10 pass;
offline immediate-delete/reload 10/10 pass; slow immediate-delete/reload 10/10 pass; minimal next-draft regression 0/10 pass.
The full 70-case chaos batch (ten repeats of seeds 1, 2, 4, 6, 7, 8, 10) is running with four workers and full-length blips. It guards new drafts against C and observes chip status separately from exact backend/UI data assertions. Each scenario cleans its own demo records after capturing evidence.
The original one-worker seed-4 prefix is also being checked without a pre-reload read to test for observer effects.

Confirmed bug: `app/src/screens/list.js`, `listScreen`, async `submit` listener (lines 55–61).
The first save resolves, then line 60 unconditionally clears a newer draft. The next click finds an empty required field, so native validation blocks submission and no second app-sync call occurs. Minimal regression: `soak/quick-input.spec.mjs`; replay `bash soak/run.sh minimal 1`.
In all ten minimal runs, IndexedDB holds the first accepted pending change; no second save call or second queue entry exists.
The instrumentation schedules no artificial promise delays and changes no engine code.

Interpretation: IndexedDB reads are asynchronous and can let an unacknowledged write finish before reload.
These probes cannot alone establish that an original reload race has vanished. Seed-2 failures at the extra pending
add are class C, not retained-delete reproductions. Final chaos totals and any blocked cases will be recorded here.

Excluded setup attempts: the first ten quick-add attempts had the outdated import-map CSP hash; interrupted early
chaos/minimal batches (including the unguarded A/B attempt blocked by C) and the startup attempt encountering an occupied test-server port are not final result counts.

The slow delete probe had a delete save call, no resolved delete promise, and a durable tombstone in IndexedDB
in all ten pre-reload snapshots. Every deletion then reached the backend and stayed absent in the UI.
The earlier unguarded seed-4 observation also exposed the same UI bug during ordinary adds: completion of an
older add cleared the later draft, which had zero save calls and zero queue entries. This is not engine loss.

The first shared-emulator long runs became unhealthy: Firestore logged 10,001 pending back-channel messages,
aborted channels, and returned HTTP 409 “Transaction lock timeout” on reset. Their stale-status/setup failures are
harness infrastructure observations, not proven record loss. Final A/B reruns use a fresh job-local Firestore on
8104/8108 and server on 8103, retain full-length blips, and bound scenario data. Chip status is recorded, not asserted;
therefore a loss-probe pass must not be described as a full synced-status soak pass.
The unprobed seed-4 step-1 prefix completed 10 attempts: 9 passed, 1 stale-status timeout; no step-1 missing-row failure.


### Confirmed engine regression: delayed full snapshot resurrects a tombstoned version

`app-sync/src/sync.js`, `createCollectionSync`'s `onSnap`, full-snapshot branch (1.3.11 lines 383–395):
`replaceAll` admits the full list without applying `meta.gone`. The delta path uses `applyChanges`, which rejects
versions at or below the known tombstone. Independent items/bin listeners can deliver the bin tombstone first,
then the items listener's earlier first server snapshot. The known deleted version returns to UI and device storage.

Minimal real-engine model: `soak/tombstone-full.node.spec.mjs`, 10/10 fail on the installed 1.3.11 source.
Replay: `node --test soak/tombstone-full.node.spec.mjs`. No engine files are changed; the model explicitly supplies ordered listener callbacks.
The model uses an in-memory store and explicitly ordered listener callbacks; it is not an emulator replay.
Evidence: cached row stamp 100 → tombstone 100 removes it → first server full snapshot with stamp 100 restores it.

The fresh Chromium seed-2 repeat 2 also failed with a UI-only retained deleted item: backend equality had passed,
but phone 2 still held/showed the deleted record and reported synced. Its originating phone's delete call resolved;
its IndexedDB delete job was synced/accepted, while the receiving phone had the record and no local job for it.
This differs from the earlier job's backend-retained-delete observation. The full-snapshot model proves an engine
bug with the same UI phenotype; exact callback ordering in this browser occurrence was not traced.


### Primary run selection (fixed before the tail finishes)

The final requested 70 chaos cases are repetitions 0–3 of every requested seed from `round3-ab-fresh` (server 8103,
four workers), plus repetitions 4–9 from `round3-ab-tail` (server 8109, six workers, local repeat 0–5 with offset 4).
Both use the fresh Firestore on 8104/8108, the same pinned engine, full 25 steps and unscaled 1–60 second blips,
new-draft guards, exact backend/UI assertions, observed chip status and scenario cleanup. Tail global setup does not
clear the concurrently running primary data. Any first-batch repetitions beyond 3 are diagnostic extras and are
excluded from primary totals. Repetition identity is recorded by the tail fixture annotation.
The split keeps all requested repetitions within the job deadline; peak concurrency is ten scenarios, with bounded
made-up data. Earlier emulator-saturated, interrupted or setup-only attempts remain excluded.
