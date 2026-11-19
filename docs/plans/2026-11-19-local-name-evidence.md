# Evidence: a local name and HTTPS on the home network (phase 3)

## N2

Base: `main` 3ecf528. Commands and literal output only.

**Red** - `npx vitest run --project unit tests/tools/nginx-config.test.ts` before `deploy/local-name/nginx.conf` existed:

```text
 Test Files  1 failed (1)
      Tests  no tests
```
(the failure is the read of the missing `deploy/local-name/nginx.conf`)

**Green (1)** - same command with the file:

```text
 Test Files  1 passed (1)
      Tests  16 passed (16)
```

**Stub check** - empty `nginx.conf`: `Tests  14 failed | 2 passed (16)`. With `proxy_buffering on`:
`FAIL ... has the directive: proxy_buffering off` and `FAIL ... never switches buffering on`, `Tests  2 failed | 14 passed (16)`.

**Green (2)** - in `npm run verify`, the e2e run lists `- 44 [chromium] > tests\e2e\local-name-real.spec.ts:14:1 > the console opens at the local name ...` as skipped (`1 skipped`), 0 failed from this file.

**Green (3)** - `node scripts/lang-scan.mjs --check-baseline`: `vietnamese: 0`, `coupling: 0`, `baseline check: ok`, exit 0.

**Green (4)** - `npm run verify`, log ends `EXIT=1`. Coordinator decision: the only 2 failures are the visual tests below, which also fail on `main` 3ecf528 without any change (filed as an issue that a separate lane fixes; it blocks N4, not this task). Every step before `test:e2e` is green. `phone:check` and `uc-coverage` come after `test:e2e` in `npm run verify`, so they were run alone:

```text
  1) [visual] > tests\visual\ds\signin.visual.ts:106:3 > desktop sign-in against the preview > signed in: the user and Sign out in the top bar
  2) [visual] > tests\visual\ds\signin.visual.ts:128:3 > phone sign-in against the preview > signed in: the Account group of Settings
  1 skipped
  2 did not run
  195 passed (16.5m)
npm run phone:check -- --max 0   -> phone overflow: 0/12
npm run uc-coverage -- --min 39  -> UCs with a green e2e: 40/40
```

**Ratchet** - unit tests (`npm run test:unit`): before 1412 passed, after `Tests  1428 passed | 3 skipped (1431)`
(before = after minus the 16 cases of `tests/tools/nginx-config.test.ts`). Api: `467 passed | 2 skipped`. Contract: 276 passed.
