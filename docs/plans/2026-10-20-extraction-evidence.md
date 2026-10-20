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
