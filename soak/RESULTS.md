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

Pinned source: `github:flamingbeing/app-sync#v1.3.11`, commit `a3d25edbc37a7921d847d251704ead9aa6d6233d`.
The import map and generated service-worker shell match. Browser modules are routed from the installed package.
Chromium only, demo-sandbox-app emulators only. No engine/app source fixes or live services; Life is unchanged.
The test server observes the original save promise and matches the bumped import-map CSP hash in its response.

### Primary narrowed reruns

The resumed run uses `soak/focused-run.mjs`: ten repetitions per requested seed, fresh emulator/server per seed,
one or two workers, bounded logs, explicit process-group shutdown. A uses the prefix through its original failing
operation: seed 1 → steps 0–13; 4 → 0–1; 6 → 0–13; 7 → 0–3; 8 → 0–22; 10 → 0–14. B seed 2 uses steps 0–24.
The final prefix operation is checked before unrelated subsequent chaos. Offline dwell is shortened to 10–600 ms
(scale 0.01); latency remains 300–3000 ms and bandwidth 50–500 kbps. These are narrowed boundary reruns, not a
completed full-duration soak. New-draft guards isolate A/B from the confirmed C bug. No wait is added between a
normal operation and its immediate-reload probe; the IndexedDB snapshot itself can nevertheless alter that race.

Every pre-reload/close probe records save calls/settlement, item/outbox IndexedDB contents, input assignments and
UI state. Firebase Auth databases are excluded. Final exact backend and per-phone lists, duplicates and deletions
still assert. Chip status is recorded separately (`SOAK_STATUS=observe`); passes do not certify synced-status behavior.
Scenario cleanup closes clients, then deletes only its own made-up item/bin records. Logs, traces and JSON reports
remain in TEMP, with emulator/server logs capped at 1 MiB and continuously drained.

Primary A/B totals: pending completion of the isolated reruns. Authoritative reports are `round3-boundary-<seed>.json`.
Previously completed controls are retained, not rerun: natural quick adds 10/10 pass; acknowledged offline CRUD
10/10 pass; immediate offline delete/reload 10/10 pass; slow unresolved delete/reload 10/10 pass.
The UI minimal regression failed 10/10; the independent real-engine tombstone model failed 10/10.

### Confirmed bug C: an earlier add clears a newer draft

Source: `app/src/screens/list.js`, `listScreen`'s async submit handler, lines 55–61, specifically line 60.
Completion of an earlier `app.add` unconditionally clears the current input. A newer draft is erased. Because the
field is required, native validation blocks the next click: no second submit/save reaches app-sync.

Minimal replay: `bash soak/run.sh minimal 1` (`soak/quick-input.spec.mjs`). It pins “submit first draft → enter next
draft → finish first save → attempt next add” without mocked storage, engine patches or artificial promise delays.
All ten completed runs show first save called/resolved and first pending change accepted in IndexedDB, a clear of
the newer draft, exactly one save call overall, and no second outbox entry. This is UI draft loss, not engine loss.
The original natural quick-add scenario passed 10/10 and therefore did not independently reproduce in that batch.

### Confirmed independent engine bug: a delayed full snapshot ignores a known tombstone

Source: `app-sync/src/sync.js`, `createCollectionSync.onSnap`, full-snapshot branch (1.3.11 lines 383–395).
`replaceAll` admits the full list without applying `meta.gone`. The delta path's `applyChanges` rejects versions
at or below that tombstone. Independent items/bin listeners can deliver a newer bin tombstone before an older
first server snapshot. The deleted version is then restored to the UI and device store despite the tombstone.

Minimal replay: `node --test soak/tombstone-full.node.spec.mjs`, 10/10 fail on installed 1.3.11 source.
Evidence: cached row stamp 100 → tombstone 100 removes it → delayed first full snapshot with stamp 100 restores it.
The model supplies ordered listener callbacks and an in-memory store; it is not a browser/emulator replay.
No engine files are changed. This independently proves the engine bug; it does not establish the cause of an old
chaos failure without that callback-order evidence.

### Excluded attempts and limits

Earlier long concurrent batches saturated two Firestore emulator instances. They logged 10,001 pending back-channel
messages and NETWORK_ERROR, then HTTP 409 transaction-lock timeouts on reset. The first fresh-instance overflow
was **01:35:32 SGT**. Its later seed-2 UI-only retained item occurred after that cutoff and is infrastructure-confounded;
it must not be presented as a clean browser reproduction of the model bug. Backend equality had passed and the
originating delete job was synced/accepted, but the receiving phone still held the row while saying synced.

Full-duration/split batches, startup failures, emulator-saturated runs and interrupted/provider-restart runs are
excluded from the primary narrowed totals. The earlier unprobed seed-4 step-1 control had 9 passes and 1 stale-chip
timeout, with no original missing-row failure. Initial quick-add attempts with an outdated CSP hash are excluded.
Read IndexedDB as requested, but remember that its read transaction can let a pending enqueue finish before reload.
An optimistic row or click is not proof of a resolved/durable save. No loss of an acknowledged engine save has been
established by the completed durability controls. Original A and backend-retained-delete B remain unconfirmed until
the narrowed reruns finish; model and UI regressions above are independently reproducible.

### Replays and validation

After the portable setup and `. soak/env.sh`:

```sh
node soak/focused-run.mjs
# One requested seed only; fresh isolated emulator, ten repetitions:
SOAK_SEEDS=4 SOAK_WORKERS=2 node soak/focused-run.mjs
bash soak/run.sh minimal 1
node --test soak/tombstone-full.node.spec.mjs
```

The supervisor defaults to a 35-minute cap; SOAK_SEEDS, SOAK_REPEATS, SOAK_WORKERS and SOAK_LIMIT_MINUTES allow
resuming only unfinished batches. Assertions have no retries. Source syntax, shell syntax, typecheck and generated
service-worker consistency checks are recorded with final totals.
