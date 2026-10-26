# Soak execution record

Engine: app-sync 1.3.10. One worker, demo-sandbox-app emulators only. No application or engine changes.
Raw logs, traces, screenshots, JSON reports and downloaded tools stay outside git, under ../runtime/.

## Completed and pending

- Valid chaos results: seeds 1–4 from chromium-chaos-final.json; seeds 5–6 from chromium-chaos-tail.json.
  Seed 3 passed. Seeds 1, 4 and 6 lost an add across immediate submit/reload; seed 2 retained a deleted item;
  seed 5 failed to show its second quick offline add. These are candidates requiring acceptance-boundary triage.
- Repeat seeds 7–10: previous attempts were affected by an unavailable HTTP server. Do not count connection-refused
  errors or the associated pending-status timeouts as confirmed engine failures.
- Chromium fallback: sync.spec.mjs and offline.spec.mjs, repeat-each=25 (125 cases), running in resume-regression.
- Focused accepted CRUD reload and overlapping-add probes remain to run, repeat-each=3.
- WebKit launch is blocked by missing host libraries. No system packages were installed.

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
