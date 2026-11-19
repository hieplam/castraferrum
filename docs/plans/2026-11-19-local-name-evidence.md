# Evidence: a local name and HTTPS on the home network (phase 3)

## N0

Base: `main` 3ecf528. Commands and literal output only. The real PC address and router addresses are replaced by
`<pc-ip>`, `<router-ip>` and `<router-ipv6>`, because the repository never holds them. The Playwright output has two
non-ASCII separator characters. They are written here as `>` and `-`.

### Baseline: `npm run verify` on `main` 3ecf528, without the change

Exit 1. Counts: unit 1412 passed, 3 skipped (102 files); contract 276 passed; api 467 passed, 2 skipped (44 files);
e2e `195 passed`. Every step that ran, except the e2e step, is green. The failure list (the literal lines):

```
  2 failed
    [visual] > tests\visual\ds\signin.visual.ts:106:3 > desktop sign-in against the preview > signed in: the user and Sign out in the top bar
    [visual] > tests\visual\ds\signin.visual.ts:128:3 > phone sign-in against the preview > signed in: the Account group of Settings
  2 did not run
  195 passed (16.4m)
EXIT=1
```

The two failures are 0.7 to 0.96 % of pixels off (for example `signin-topbar-light - top bar: 0.96 % off (775/80640 px)`).
They fail on `main` without any change, and again when run alone
(`npx playwright test --project=visual tests/visual/ds/signin.visual.ts`: `2 failed`, `2 did not run`). Issue 475 tracks them
and blocks task N4, not this task. Because `verify` joins its steps with `&&`, `phone:check` and `uc-coverage` do not run
after the e2e failure.

### After: `npm run verify` with this change

Exit 1, with the same two failures and nothing else. Unit 1431 passed, 3 skipped (103 files; baseline 1412, 102 files).
Contract 276 passed; api 467 passed, 2 skipped.

```
  2 failed
    [visual] > tests\visual\ds\signin.visual.ts:106:3 > desktop sign-in against the preview > signed in: the user and Sign out in the top bar
    [visual] > tests\visual\ds\signin.visual.ts:128:3 > phone sign-in against the preview > signed in: the Account group of Settings
  2 did not run
  195 passed (18.0m)
EXIT=1
```

### Red

`npx vitest run --project unit tests/tools/local-name-check.test.ts` with no `scripts/local-name-check.mjs`:

```
 Test Files  1 failed (1)
      Tests  no tests
```

### Green

`npx vitest run --project unit tests/tools/local-name-check.test.ts`:

```
 Test Files  1 passed (1)
      Tests  19 passed (19)
```

### Stub check

A module that always returns `8/8` (`runChecks` gives 8 `PASS` lines and exit 0):

```
      Tests  18 failed | 1 passed (19)
```

### Ratchet: `npm run local-name:check` on the owner's PC (nothing of the setup is installed, the console is stopped)

```
FAIL dns-direct: queryA ECONNREFUSED castra.home.arpa
FAIL dns-system: 20 of 20 answers were not <pc-ip> (first: error getaddrinfo ENOTFOUND castra.home.arpa)
FAIL dns-only-pc: DNS servers are [<router-ip>, <router-ipv6>, <router-ipv6>], expected only <pc-ip>
FAIL nginx-test: nginx not found
FAIL tls: mkcert not found
FAIL redirect: getaddrinfo ENOTFOUND castra.home.arpa
FAIL sse: LOOPS_USERNAME or LOOPS_PASSWORD missing in .env
FAIL port-closed: 127.0.0.1:7070 refuses connections, expected open
local name: 0/8 checks pass
EXIT=1
```

Baseline: `local name: 0/8`. Unit tests: 1412 before, 1431 after.

## N1

Task N1: Castraferrum behind a reverse proxy, UC-42, goals G5 and G6.

**Red (before the change)**
- `npx vitest run --project unit server/services/auth-service.test.ts server/config.test.ts`: `Tests 4 failed | 60 passed (64)`.
  `clientKey({ socket: '127.0.0.1', realIp: '192.0.2.10' })` returned `127.0.0.1`; `--public-url` was `unknown flag --public-url`.
- `npx vitest run --project api tests/api/auth-api.test.ts tests/api/cli.test.ts`: `Tests 3 failed | 20 passed (23)`.
- `npx playwright test tests/e2e/reverse-proxy.spec.ts` with the `clientKey` change removed: `Expected: 204 / Received: 429`, `1 failed`
  (device B shares the count of device A).

**Green (after the change)**
- unit: `Test Files 2 passed (2)`, `Tests 64 passed (64)`.
- api (`auth-api`, `cli`, `sign-in-startup`, `api-surface`): `Test Files 4 passed (4)`, `Tests 78 passed (78)`.
- e2e `tests/e2e/reverse-proxy.spec.ts`: `1 passed (8.2s)`.
- `npm run verify` (second run, after the uc-coverage tool test counted UC-42): unit `Tests 1432 passed | 3 skipped (1435)`, contract
  `Tests 276 passed (276)`, api `Tests 472 passed | 2 skipped (474)`, then the e2e and visual step `3 failed`, `2 did not run`,
  `195 passed (16.8m)`. The 3 failures:
  - `tests/visual/ds/signin.visual.ts:106` (desktop sign-in, signed in: the user and Sign out in the top bar) and
    `tests/visual/ds/signin.visual.ts:128` (phone sign-in, signed in: the Account group of Settings). Both also fail on
    main 3ecf528 without any change. Coordinator decision: they are filed (tracked in https://github.com/hieplam/castraferrum/issues/475) and fixed by another lane. The shots and
    the test are not changed here.
  - `tests/e2e/probe-idle.spec.ts:84`: `Expected: "waiting"`, `Received: "active"`. The change does not touch the probe code.
    `npx playwright test tests/e2e/probe-idle.spec.ts --repeat-each=3` gave `6 passed (24.5s)`. Filed as a flaky test:
    https://github.com/hieplam/castraferrum/issues/481 . Not fixed here.
  So `verify` is met like for like: the 2 known visual failures, plus the one filed flaky test, and every other step green.

**Ratchet:** `uc-coverage --min` 39 to 40 in the `verify` script. UC ids in `docs/USE-CASES.md`: 40 to 41 (UC-42 added; UC-41 belongs to task N0). Unit tests: 1428 to 1432 passed in the verify run.

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
