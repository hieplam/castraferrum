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

## N5

Base: `main` 8a9b123. Commands and literal output only. `openssl` 3.5.9 (`/ucrt64/bin/openssl`, Git for Windows).

**Decision on `$ENV::`** - `$ENV::LOCAL_NAME_LIMIT` in `nameConstraints` and `$ENV::LOCAL_NAME` in `subjectAltName` both expand
on this platform. The test reads the made certificates with `openssl x509 -noout -text` and asserts
`X509v3 Name Constraints: critical`, `Permitted:` with `DNS:castra.home.arpa`, `CA:TRUE, pathlen:0`, and the SAN
`DNS:castra.home.arpa`. No `-addext` is needed, so the README commands and `ca.cnf` stay as the plan writes them.

**Red (1)** - `npx vitest run --project unit tests/tools/ca-name-limit.test.ts` before `ca.cnf` existed:

```text
 ❯ |unit| tests/tools/ca-name-limit.test.ts (4 tests | 4 failed)
Can't open ".../deploy/local-name/ca.cnf" for reading, No such file or directory
```

**Red (2)** - `npx vitest run --project unit tests/tools/nginx-config.test.ts` after the test change (`LOCAL_NAME`), before the change of `nginx.conf`:
`Tests  3 failed | 13 passed (16)`. And `tests/tools/local-name-check.test.ts` after its change, before the tool change:
`Tests  27 failed | 5 passed (32)`.

**Green (1)** - `npx vitest run --project unit tests/tools/ca-name-limit.test.ts`: `Tests  4 passed (4)`. Literal result of the case
outside the limit (the client trusts only the issuer, server certificate for `bank.example`):

```text
ca-name-limit: bank.example gave err.code=UNSPECIFIED message=permitted subtree violation
```

The case for `castra.home.arpa` connects. The control case (an issuer made from `ca.cnf` without the `nameConstraints` line) connects for `bank.example`.

**Green (2)** - `npx vitest run --project unit tests/tools/local-name-check.test.ts tests/tools/nginx-config.test.ts tests/tools/ca-name-limit.test.ts`:
`Test Files  3 passed (3)`, `Tests  52 passed (52)`. The cases: all good fakes give `local name: 10/10 checks pass`; no name limit in the
issuer gives `FAIL ca-name-limit: ... has no name limit: an issuer without it can sign any name`; `local-ca-key.pem` in the folder gives
`FAIL ca-key-absent: local-ca-key.pem is in ...`; no `LOOPS_PUBLIC_URL` gives `FAIL dns-direct: no name: set LOOPS_PUBLIC_URL (https://<name>) in .env, or pass --name=<name>` (and the other name checks).
Run on a real issuer made with `ca.cnf` (not a fake): `PASS ca-name-limit` and, with `local-ca-key.pem` beside it, `FAIL ca-key-absent`; after removing the key file, `PASS ca-key-absent`.

**Stub check** - `ca.cnf` without the `nameConstraints` line: `Tests  2 failed | 2 passed (4)` (the certificate-text case and the `bank.example` rejection case).
A check tool that only counts to 10 fails the new cases of `local-name-check.test.ts` (27 fail before the change).

**Green (3)** - `node scripts/lang-scan.mjs --check-baseline`: `baseline check: ok`.

**Green (4)** - `npm run verify`, log ends `EXIT=1`. The only failures are the 2 sign-in visual tests that `main` also has (issue 475):

```text
  1) [visual] › tests\visual\ds\signin.visual.ts:106:3 › desktop sign-in against the preview › signed in: the user and Sign out in the top bar
  2) [visual] › tests\visual\ds\signin.visual.ts:128:3 › phone sign-in against the preview › signed in: the Account group of Settings
  2 failed
  1 skipped
  2 did not run
  196 passed (16.0m)
```

Run alone, because they come after `test:e2e` in `npm run verify`: `phone overflow: 0/12`, `UCs with a green e2e: 41/41`.
Unit step: `Tests  1468 passed | 3 skipped (1471)`. Contract: 276 passed. Api: `472 passed | 2 skipped`.

**Ratchet** - unit tests: before 1451 passed, after 1468 passed (+13 cases in `local-name-check.test.ts`, 19 to 32; +4 in the new `ca-name-limit.test.ts`).
Checks of the tool: 8 to 10.

## N6

Base: `main` 1dcd581. Commands and literal output only. The real name of the console and the home addresses are replaced by `<name>`, `<pc-ip>`, `<router-ip>` and `<router-ipv6>`. Run from the main checkout, which holds the real `.env`.

### Red (0): `npm run local-name:check` on the owner PC, before the change (old tool)

```text
FAIL dns-direct: queryA ECONNREFUSED <name>
FAIL dns-system: 20 of 20 answers were not <pc-ip> (first: error getaddrinfo ENOTFOUND <name>)
FAIL dns-only-pc: DNS servers are [<pc-ip>, <router-ipv6>, <router-ipv6>], expected only <pc-ip>
PASS nginx-test
FAIL tls: certificate not trusted: getaddrinfo ENOTFOUND <name>
PASS ca-name-limit
PASS ca-key-absent
FAIL redirect: getaddrinfo ENOTFOUND <name>
FAIL sse: getaddrinfo ENOTFOUND <name>
FAIL port-closed: <pc-ip>:7070 refuses connections, expected open
local name: 3/10 checks pass
```

### Red (1) and (2): the new tests against the old tool

`npx vitest run --project unit tests/tools/local-name-check.test.ts tests/tools/nginx-config.test.ts` with the old `scripts/local-name-check.mjs`:

```text
 Test Files  2 failed (2)
      Tests  31 failed | 23 passed (54)
EXIT=1
```

The failing cases include every case of `dns-public`, `dns-pc-servers`, `cert-issuer` and `own-issuer-absent`, and `has the two certificate placeholders that the machine setup fills in` of `nginx-config.test.ts`.

### Green (1)

```text
 Test Files  4 passed (4)
      Tests  108 passed (108)
EXIT=0
```

(4 files: the check tool test, `nginx-config.test.ts`, `test-addresses.test.ts`, `server/config.test.ts`.) The real TLS function against a local TLS server with a self-signed certificate gives `FAIL tls: certificate not trusted: DEPTH_ZERO_SELF_SIGNED_CERT`.

### Green (2) and (3) and (4)

```text
$ git ls-files deploy/local-name/ca.cnf tests/tools/ca-name-limit.test.ts
$ git grep -n -e "home.arpa" -e "Technitium" -e "mkcert" -e "LOCAL_NAME_LIMIT" -- . ":!docs"
README.md:231:An earlier design of this section used Technitium DNS Server and an own issu
README.md:240:Uninstall Technitium DNS Server in Windows Settings, Apps. Then set the DNS 
README.md:241:Technitium installer set them to `127.0.0.1` and `::1`. Also remove the DNS 
$ node scripts/lang-scan.mjs --check-baseline
baseline check: ok
```

The three `git grep` lines are in the README part "If you set up the first design".

### Green (5): `npm run verify`

First run, log ends `EXIT=1`. The unit, contract and api steps are green:

```text
      Tests  1470 passed | 3 skipped (1473)
      Tests  276 passed (276)
      Tests  472 passed | 2 skipped (474)
  3 failed
    [chromium] > tests/e2e/claude.spec.ts:35:1 > UC-22 ...
    [chromium] > tests/e2e/claude.spec.ts:98:1 > UC-30 ...
    [chromium] > tests/e2e/transcript.spec.ts:30:3 > ... UC-26 ...
  1 skipped
  1 did not run
  196 passed (23.6m)
EXIT=1
```

The cause of the 3 failures is the usage limit of the Claude account, which the real-Claude tests use. The run error in the log:

```text
    +   "error": "You've hit your session limit · resets 7:30am (Asia/Ho_Chi_Minh)",
```

Second run, once, after the limit reset, only the two real-Claude files (the test that did not run also ran):

```text
  ok 1 claude.spec.ts UC-22
  ok 2 claude.spec.ts UC-30
  ok 3 transcript.spec.ts UC-26
  ok 4 transcript.spec.ts UC-27
  ok 5 transcript.spec.ts UC-28
  5 passed (1.1m)
EXIT=0
```

### Green (6): `npm run local-name:check` on the owner PC, after the change (baseline of task N3)

```text
FAIL dns-public: 1.1.1.1 answered an empty answer, expected <pc-ip>
FAIL dns-pc-servers: expected <pc-ip> from each DNS server of the PC, but <pc-ip> gave an empty answer; <router-ipv6> gave an empty answer
FAIL dns-system: 20 of 20 answers were not <pc-ip> (first: error getaddrinfo ENOTFOUND <name>)
PASS nginx-test
FAIL tls: certificate not trusted: getaddrinfo ENOTFOUND <name>
FAIL cert-issuer: cannot read the certificate of <name>:443: getaddrinfo ENOTFOUND <name>
FAIL own-issuer-absent: CN=local home issuer is trusted (CurrentUser\Root A77F15F7AA29742E9D4BA58EB1E2BBEA12D8BC6B): run certutil -user -delstore Root "local home issuer"; %LOCALAPPDATA%\castraferrum\tls holds local-ca.pem, <name>-key.pem, <name>.pem: delete the folder
FAIL redirect: getaddrinfo ENOTFOUND <name>
FAIL sse: getaddrinfo ENOTFOUND <name>
FAIL port-closed: 127.0.0.1:7070 refuses connections, expected open
local name: 1/10 checks pass
```

### Stub check

A `cert-issuer` without the age rule:

```text
     × fails at 80 % of the lifetime and passes at 50 %, with the serial number in both lines 6ms
     × fails a certificate that is expired or not valid yet 1ms
      Tests  2 failed | 36 passed (38)
```

A `tls` check that gives a `ca` option:

```text
     × gives no ca option to any TLS or HTTPS connection 6ms
      Tests  1 failed | 37 passed (38)
```

The old tool against the new tests: see Red (1).

### Ratchet

Unit tests (`npx vitest run --project unit`): before 1469 passed, 3 skipped (main 1dcd581); after 1470 passed, 3 skipped. The 4 cases of the deleted `ca-name-limit.test.ts` are gone. Checks of the tool: 10 to 10, with new ids. `local name: 1/10 checks pass` on the owner PC is the baseline of task N3.
