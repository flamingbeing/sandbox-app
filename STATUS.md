# Status

## Now

- 2026-10-27 SGT: app-sync 1.3.11 test-only triage: confirmed next-draft clearing in the list submit handler (minimal regression fails 10/10); natural quick adds, acknowledged CRUD and isolated immediate-delete probes each pass 10/10. Full chaos reruns in progress; see [soak/RESULTS.md](soak/RESULTS.md).

- 2026-10-27 SGT: app-sync 1.3.10 test-only soak completed: Chromium chaos plus reruns 3 pass/11 fail, regressions 125/125, acknowledged CRUD 3/3, quick adds 2/3 (flaky).
  Findings and commands: [soak/RESULTS.md](soak/RESULTS.md). WebKit 135 cases remain blocked by host libraries; no engine fixes.

- Made from app-starter; not filled yet.

## Waiting on the owner

- <nothing>

## Next

- Fill (README, "Fill"), then replace the sample screens (`app/src/screens/`) with the app.

## Decisions (dated)

- <date>: <decision>
