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
