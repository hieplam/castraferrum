# Extraction evidence log

Numbers and commands only. Every task of docs/plans/2026-10-20-extraction.md appends a section here.

## T0 baseline (2026-10-20)

- Freeze commit (source repo main): `aaebf296f69f00a80f86e02ec490f91ac537426b`
- Freeze rule PR in the source repo: hieplam/Cabal#287 (merged as `a9fec17`)
- `npm run verify` at the freeze commit: exit code 0 (`npm ci` first, run from a detached clean worktree)
- Test counts:
  - unit (vitest project unit): 382 passed, 2 skipped, 0 failed (33 files passed, 1 skipped)
  - contract (`npm run test:contract`): 114 passed, 0 failed
  - api (vitest project api): 115 passed, 0 skipped, 0 failed
  - e2e (`npm run test:e2e`, playwright, includes the visual project): 58 passed, 0 skipped, 0 failed
- `uc-coverage`: 32/32
- Frozen issues (label `frozen`, all still open): #273 #274 #275 #276 #277 #145 #279
  (`gh issue list --label frozen --state all --limit 50` lists all seven)
- Evidence folder (outside both repos): `C:\Users\lamhi\Downloads\repo\castraferrum-evidence`
  - `before-app/shots`: 178 files
  - `before-preview`: 184 files
  - note: `design:compare` forces its own output folder (`design/compare`), so `LOOPS_COMPARE_OUT` could not be used; it was run normally and `design/compare/shots` was copied
- No console loop was running (nothing listening on 127.0.0.1:7070).

### T0a (reliability fix needed to get verify green)

- First `npm run verify` at `a9fec17` failed 3 times in the api step; `npm run test:contract` then `npm run test:api` failed 2 of 2 runs (one standalone run of `test:api` passed).
- Failing test: `tests/api/transcript-api.test.ts` "shutdown() done within 2 s" (expected 4021 <= 2000).
- Measured shutdown breakdown (ms): ticker.stop 1, app.close 4007, drainRuns 0, lock.release 3, db.close 0.
- Root cause: `app.close()` waited about 4 s for a non-idle keep-alive socket left by earlier suites.
- Fix: Fastify option `forceCloseConnections: true` in `server/http/app.ts`. PR: hieplam/Cabal#288.
- Red: `npm run test:contract && npm run test:api` failed 2 of 2 runs. Green: same command passed 3 of 3 runs, then full `npm run verify` exit 0.
- The freeze commit above is main after this fix.

### Notes

- On 2026-10-20 the container `loop_console_pg` was recreated once by a `docker compose up -d` run from a scratch worktree. The volume `loop_console_pg` was intact. It was recreated again from the main checkout, so the compose `working_dir` label is `C:\Users\lamhi\Downloads\repo\Cabal\loop-console` again. Its `Created` time changed.

## T1 - Language and coupling scanner

Source repo PR: https://github.com/hieplam/Cabal/pull/289 (squash-merged as `d4fa724`).

- Red: `npx vitest run --project unit tests/tools/lang-scan.test.ts` -> `Error: Cannot find module '../../scripts/lang-scan.mjs' imported from .../tests/tools/lang-scan.test.ts`.
- Green: same command, 35 passed. `node scripts/lang-scan.mjs --tree --coupling` -> `vietnamese: 7799` (B), `coupling: 737` (C), `comment-lines: 2478`.
- Per folder (vietnamese / coupling / comment-lines): `.` 269/47/29, design 3017/270/182, pg-init 2/0/0, scripts 196/11/145, server 1587/161/746, shared 406/29/183, tests 1733/127/713, web 589/92/480.
- Coupling by kind: ticket ids 390, issue refs 181, home paths 135, docs refs 27, local patterns 4.
- Word-list sanity: 281 hashed tokens; 7462 diacritic lines, 369 unaccented-word lines, 30 path names; about 5 in 30 sampled word hits were false positives before tuning (`Minh` in `Asia/Ho_Chi_Minh`, `Thu` as weekday); both tokens were removed. Excluded as English or code words: `than`, `that`, `nut`, `len`, `con`, `can`, `ten`, `the`, `thi`, `lan`, `lang`, `long`, `man`, `mat`, `ban`, `bang`, `tin`, `tim`, `tat`, `tai` and similar short tokens.
- Scanner source and tests: 0 hits (`--path scripts --list` and `--path tests/tools --list` show no lang-scan file).
- `npm run verify` exit 0 (rerun after midnight; the first run at 23:52 failed 3 e2e time-label tests, `23:52 -> 00:00` vs `21/10 00:00`, unrelated): unit 417 passed / 2 skipped (T0 382), contract 114, api 115, e2e 58, `uc-coverage` 32/32.
- Stub check: appended one Vietnamese comment to `server/adapters/active-runs/in-memory-active-runs.ts` -> `ABOVE BASELINE: server vietnamese 1588 > 1587`, `--check-baseline` exit 1; reverted.
- Baseline file: `scripts/lang-baseline.json` holds the per-folder numbers above. B = 7799, C = 737.
- Local file `.lang-scan.local.json` (gitignored) created in the main checkout's `loop-console/`.

## T2 - English docs set

Source repo PR: https://github.com/hieplam/Cabal/pull/290 (squash-merged as `54ad5b9`).

- Red: `git grep -nE "'\.\.', *'docs'|\.\./docs|docs/loop-console" -- scripts server tests web` listed 3 readers (`scripts/uc-coverage.mjs:13`, `server/adapters/executors/claude/claude-agent-executor.test.ts:714`, `tests/api/api-surface.test.ts:14`). `npm run uc-coverage -- --spec docs/USE-CASES.md` -> `Error: ENOENT ... loop-console\docs\USE-CASES.md`.
- Green:
  - same `git grep` -> prints nothing (exit 1). The executor test now builds the path from `join(root, 'docs', 'ARCHITECTURE.md')`.
  - `uc-coverage` -> `UC has e2e green: 32/32` (the script's own wording is still Vietnamese until T8), `--min 32` exit 0.
  - API surface test (`npx vitest run --project api tests/api/api-surface.test.ts`) -> 30 passed (27 routes read from `docs/API.md`). Executor test file + uc-coverage unit test -> 54 passed, 2 skipped (real-Claude cases).
  - `node scripts/lang-scan.mjs --path docs` -> `vietnamese: 0`; same for `README.md` and `CONTRIBUTING.md`. All new files are ASCII (`file` says ASCII text).
  - Quickstart: `npm ci` (done in the worktree), `npm run build`, `LOOPS_PORT=7170 npm start`; `curl -s http://127.0.0.1:7170/ | grep -c "<title>"` -> `1`, `/api/health` -> `{"ok":true,"db":"up"}`. `docker compose up -d` was NOT run from the worktree (it would recreate `loop_console_pg`); Postgres was already up (`loop_console_pg` healthy).
  - `npm run verify` exit 0: unit 417 passed / 2 skipped (T1: 417 / 2), contract 114, api 115, e2e 58, `uc-coverage` 32/32, `dependency-cruiser: 0`, `arch-fixtures: 25/25`.
- Stub check (throwaway, reverted): `USE-CASES.md` without UC-30..32 -> `expected ... length 32 but got 29` (2 unit tests fail); `API.md` without the `/health` row -> `expected length 27 but got 26`; `LOOPS_PORT=7171 npm start` with `dist/` moved away -> `grep -c "<title>"` prints `0`.
- Code change forced by the docs: the Claude executor cleanup message, the over-ceiling error and `formatWait` are English now (`30 minutes`, `1 second`, joined with `, `), because `docs/ARCHITECTURE.md` quotes the message verbatim and the unit test compares it with the code. Tests updated; `executor contract` and unit cases pass.
- Scanner before -> after (`node scripts/lang-scan.mjs --tree --coupling`):
  - vietnamese (B): 7799 -> 7580 (`.` 269 -> 73, server 1587 -> 1565, tests 1733 -> 1732)
  - coupling (C): 737 -> 688 (`.` 47 -> 4, scripts 11 -> 9, server 161 -> 160, tests 127 -> 124)
  - `scripts/lang-baseline.json` lowered to these numbers.
- Test counts, T1 -> T2: unit 417/2 -> 417/2, contract 114 -> 114, api 115 -> 115, e2e 58 -> 58, uc-coverage 32/32 -> 32/32.
- Worktree `Cabal-T2` and branch `feat/castraferrum-T2` removed (local and remote).

## T15 - Tool fix: scanner false positive, loop gate runs --check-baseline

Source repo PR: https://github.com/hieplam/Cabal/pull/291 (squash-merged as `c3b7760`). This repo: the PR that adds this section.

- Red (before building, source main `54ad5b9`):
  - `node scripts/lang-scan.mjs --path docs --list` -> 7 hits, all `[text/word] them` (`docs/ARCHITECTURE.md` x6, `docs/adr/0002-ports-and-adapters.md` x1).
  - `node scripts/lang-scan.mjs --check-baseline; echo $?` -> `ABOVE BASELINE: . vietnamese 76 > 73`, `ABOVE BASELINE: docs vietnamese 7 > 0`, `baseline check: FAILED`, exit `1` (the gate itself exits non-zero, so no second bug).
  - `CF_SOURCE_REPO=<source> node tools/extraction-loop/loop.mjs check 7 --dry-run` -> `PASS #7 (T2) ... vietnamese 7799 -> 7590` although the baseline check failed.
- Green:
  - `--path docs` -> `vietnamese: 0`.
  - `--check-baseline; echo $?` -> `baseline check: ok`, exit `0` (also on merged main).
  - Corpus test passes (`tests/tools/lang-scan.test.ts`, 36 tests).
  - `npm run verify` exit 0 on the branch (same tree as merged main): unit 418 passed / 2 skipped, contract 114, api 115, e2e 58, `uc-coverage` 32/32, `dependency-cruiser: 0`, `arch-fixtures: 25/25`.
  - `loop.mjs check 7 --dry-run` on the fixed scanner -> `PASS #7 (T2) via PR #23; vietnamese 7799 -> 7576, coupling 737 -> 688`, exit 0.
  - Same command with two Vietnamese lines temporarily added to `vite.config.ts` in the scratch worktree -> exit 1: `FAIL #7 (T2)`, `- scanner --check-baseline failed: ABOVE BASELINE: . vietnamese 75 > 73; baseline check: FAILED`. Reverted (`git checkout`).
- Stub check: the new corpus test run against the old word list failed with `them` found in `CONTRIBUTING.md`, `shared/i18n/en.ts`, `docs/ARCHITECTURE.md` and `docs/adr/0002-ports-and-adapters.md` (first draft of the test also hit `pham`, `khi`, `theo` in a code span and in comments, so the corpus is English prose only: markdown without code spans, string literals of `en.ts`). After removing `them` only, the test passes.
- Word-list change: one hash removed (`them`). No other token was found to be a word of the English corpus.
- Extra fix: `CONTRIBUTING.md` quoted the rule marker `vi-pham` literally, which counted as a Vietnamese hit in `.` (74 > 73). The sentence now points to `scripts/arch-lib.mjs` instead, so `.` is 73 again.
- Scanner before -> after (`node scripts/lang-scan.mjs --tree --coupling`):
  - vietnamese (B): 7590 -> 7576 (`.` 76 -> 73, design 3017 -> 3016, scripts 196 -> 195, shared 406 -> 405, tests 1732 -> 1731, docs 7 -> 0)
  - coupling (C): 688 -> 688
  - `scripts/lang-baseline.json`: design, scripts, shared and tests lowered by 1 each (the false positive had inflated them); `.` stays 73; no folder went up.
- Test counts, T2 -> T15: unit 417/2 -> 418/2 (one new test), contract 114, api 115, e2e 58, uc-coverage 32/32.
- This repo: `tools/extraction-loop/loop.mjs check` now also runs `node scripts/lang-scan.mjs --check-baseline` in the scanner folder and fails with the scanner's `ABOVE BASELINE` lines when it exits non-zero.
