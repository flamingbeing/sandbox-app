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
