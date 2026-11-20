# LAN access: evidence log

Every task of the lan-access plan appends a section here.

## L0 - Baseline numbers

Attempt 1 measured on `e8d49d1` and failed because of issue 443 (a server start with a `running` run older than 24.86
days failed with `integer out of range`). Pull request 444 fixed it. This section holds the numbers of attempt 2.

- `main` SHA: `06318043f8f3de8ee3c9d15909ecf1b21d60d1e9` (0631804, the fix of issue 443)
- Date of the run: 2026-11-18. Test database of the lane: `loops_lanaccess_test`
  (`LOOPS_TEST_DATABASE_URL=postgres://loops:loops@127.0.0.1:55432/loops_lanaccess_test`).
- Worktree: branch `docs/lan-access-l0` rebased on `origin/main`; its code equals `main` (only docs and `.gitignore` differ).
  Commands: `npm ci`, `npm run build`, then `timeout 5400 npm run verify` (output in `reports/verify.log`).
- `npm run verify` exit code: `0`
- ratchets: `ratchets: ok`
- rule-lint: `rule-lint: ok (rule lines 18, without a check 7, new 0)`
- unit: `Tests  1348 passed | 3 skipped (1351)` (`Test Files  98 passed | 1 skipped (99)`)
- contract: `Tests  276 passed (276)` (`memory: 129 passed · postgres: 129 passed`,
  `executor contract — claude (fake query): 9 passed · mock: 9 passed`)
- api: `Tests  442 passed | 2 skipped (444)` (`Test Files  41 passed (41)`)
- e2e (Playwright): `190 passed (15.5m)`
- `npm run phone:check -- --max 0`, last line: `phone overflow: 0/12`
- `npm run uc-coverage -- --min 37`: `UCs with a green e2e: 38/38`
- Tools that scan the tree: none scans `.worktrees/` (vitest includes, tsc `include`, `FOLDERS` of test-addresses,
  `EXPECT_DIRS` of ratchets; lang-scan uses `git ls-files`). `.worktrees/` is in `.gitignore`.
- Baseline for later tasks (never decrease): unit 1348, contract 276, api 442, e2e 190, uc-coverage 38.

## L1 - Command-line flags `--host`, `--remote`, `--port`, `--help`

- Base: `origin/main` 919d9b6 plus the branch `feat/cli-flags`. Test database of the lane: `loops_lanl1_test`.
- **What npm 11.17.0 passes to the script** (measured 2026-11-18 with a scratch package whose `start` script prints
  `process.argv` and `npm_config_*`):
  - `npm start --remote`: argv `[]`, `npm_config_remote=true` (npm warns `Unknown cli config "--remote"`).
  - `npm start --remote=false` and `npm start --no-remote`: `npm_config_remote=` (empty string).
  - `npm start --remote --host=0.0.0.0 --port=7170`: `npm_config_remote=true`, `npm_config_host=0.0.0.0`, `npm_config_port=7170`.
  - `npm start --host 0.0.0.0`: `npm_config_host=true` and the argument `0.0.0.0`. The parser rejects it
    (`unexpected argument 0.0.0.0`; `npm_config_host=true` alone gives `--host needs a value`).
- Decisions: `--remote` beats `npm_config_host` and `LOOPS_HOST` (spec D9). An empty `npm_config_remote` means off.
  The README says `LOOPS_HOST` and `LOOPS_REMOTE` are not used by the server until L2.
- Red (before the parser): `npx vitest run --project unit server/config.test.ts` exit 1, 15 failed, for example
  `"(0 , __vite_ssr_import_1__.parseArgs) is not a function"` and `expected undefined to be '127.0.0.1'`.
- Green: the same command, `Tests  28 passed (28)`. `npx vitest run --project api tests/api/cli.test.ts`: `Tests  4 passed (4)`.
- `npm run verify` exit code: `0` (`reports/verify.log`). ratchets: `ratchets: ok`.
  rule-lint: `rule-lint: ok (rule lines 18, without a check 7, new 0)`.
- unit: `Tests  1363 passed | 3 skipped (1366)` (L0: 1348, up 15)
- contract: `Tests  276 passed (276)` (L0: 276)
- api: `Tests  446 passed | 2 skipped (448)` (L0: 442, up 4)
- e2e: `190 passed (20.2m)` (L0: 190)
- `phone overflow: 0/12`; `UCs with a green e2e: 38/38`.
- Ratchet before to after: unit 1348 to 1363, api 442 to 446, contract 276 to 276, e2e 190 to 190, uc-coverage 38 to 38.

## L2

- Decisions: the startup lines come from `networkUrls` and `isLoopbackHost` in `server/config.ts`. A host of `0.0.0.0` or `::` lists
  each non-internal IPv4 address, another non-loopback host lists itself, and a loopback host (`127.x.x.x`, `::1`, `localhost`) lists
  none and prints no warning. The e2e needs a non-internal IPv4 address and fails with a message when there is none. The CI workflow
  runs no e2e (typecheck, arch, ratchets, unit, build, contract), so the new e2e runs in `npm run verify` only.
- The README no longer says that `LOOPS_HOST` and `LOOPS_REMOTE` are unused. `tests/tools/uc-coverage.test.ts` counts 39 use cases now.
- Red (before the listen change): `npx vitest run --project unit server/config.test.ts` exit 1, `4 failed | 28 passed`,
  `TypeError: networkUrls is not a function`. `npx playwright test --project=chromium tests/e2e/network.spec.ts` exit 1, the `@UC-33`
  test: `page.goto: net::ERR_CONNECTION_REFUSED at http://<pc-ip>:61639/`; the second test passed.
- Green: unit `Tests  32 passed (32)`; e2e `2 passed (14.3s)`.
- Stub check: with the listen host hard-coded to `0.0.0.0`, the second e2e test failed: `Expected: "ECONNREFUSED"`, `Received: null`.
- Green (4), `LOOPS_TEST_MODE=1 LOOPS_PORT=7173 npm start --remote` on `loops_lanl2_test` (the listener was `0.0.0.0:7173`, health 200, stopped by PID):

```text
Castraferrum: http://127.0.0.1:7173  (DB postgres://loops:***@127.0.0.1:55432/loops_lanl2_test, test mode)
On your network: http://<pc-ip>:7173
On your network: http://172.20.80.1:7173
Warning: anyone on this network can open the console and run agents on this machine.
```

- `npm run verify` exit code: `0` (`reports/verify.log`). ratchets: `ratchets: ok`.
  rule-lint: `rule-lint: ok (rule lines 18, without a check 7, new 0)`.
- unit: `Tests  1367 passed | 3 skipped (1370)` (L1: 1363, up 4)
- contract: `Tests  276 passed (276)` (L1: 276)
- api: `Tests  446 passed | 2 skipped (448)` (L1: 446)
- e2e: `192 passed (16.6m)` (L1: 190, up 2)
- `phone overflow: 0/12`; `UCs with a green e2e: 39/39`.
- Ratchet before to after: unit 1363 to 1367, api 446 to 446, contract 276 to 276, e2e 190 to 192, uc-coverage 38 to 39 (`--min 37` to `--min 38`).
