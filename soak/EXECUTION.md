# Soak execution blocked

No test results are available from this checkout. No engine code was changed.

Setup checks on Windows:
- `node -v`: v24.16.0.
- `npm ci`: EPERM writing the default npm cache.
- `npm ci --cache ../npm-cache`: child-process spawn EPERM.
- A direct Node child-process check also returns EPERM.
- Playwright Chromium launch returns `browserType.launch: spawn EPERM`.
- Downloading the earlier draft files fails in Windows TLS with SEC_E_NO_CREDENTIALS.

Reproduce the process restriction:

```powershell
node --input-type=module -e "import {spawnSync} from 'node:child_process'; const r=spawnSync(process.execPath,['-v']); console.log(r.error?.code || r.stdout?.toString());"
node --input-type=module -e "const p=await import(process.env.PLAYWRIGHT_PATH); const b=await p.chromium.launch({headless:true}); await b.close();"
```

Pending: retrieve and review the earlier soak drafts; finish npm ci; run sync,
offline and modules 25 times in each requested browser with three workers; run
five seeded ten-minute three-context convergence tests per browser; retain all
failure traces outside git. Use only local fake backends or emulators and ports
8100–8109. No application assertions ran; this is an environment blocker, not
an identified sync defect.
