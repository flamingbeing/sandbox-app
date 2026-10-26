# Network chaos soak

Test-only harness for the pinned app-sync 1.3.10. No engine or application files are changed.
Uses only the demo-sandbox-app emulators. The test server maps emulator ports in its in-memory response;
all listeners use 8100-8104. One worker limits load. Each seed uses 2-3 isolated phone contexts,
25 random operations and real 1-60 second blips. Toggle means changing a textual done marker;
the sample application has no boolean done field. Phones own disjoint items to give an exact final-state oracle.
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

## Validation and blockers

Syntax checks and discovery passed: 20 chaos cases, plus five regression cases per browser.
The requested regression run would execute 125 WebKit cases. No browser tests executed:
all three execution commands stopped at emulator startup because Java was absent.
The separate Chromium and WebKit installation attempts were rejected by Playwright 1.56.1:
`Playwright does not support chromium on ubuntu26.04-x64` (and likewise `webkit`).
These are infrastructure blockers, not engine failures. There is no passing soak result or flake estimate.
The new harness still needs runtime validation on a compatible test host; all 145 requested cases remain unrun.
