# Plan of issue 213: gate

Phase: issue 213 of epic 217. Spec: [goal-driven loop](../specs/2026-11-01-goal-driven-loop.md). Plan index: [index](2026-11-01-goal-driven-loop.md). Later waves add the other tasks of this phase. Unit count below means `npx vitest list --project unit 2>/dev/null | wc -l`: 428 on 2026-11-01, measure yours at Red. In the `agent-plugins` task, `SK` is `plugins/epic-loop/skills/epic-loop`. Wave 2: each code task changes existing server code, so its Green ends with one full `npm run verify`, in a slot, about 20 minutes. A `verify` failure that your change cannot reach follows the lane rules (issues 265, 272, 274). Concurrency tests use `k.clock`, `flush()`, `until()` and deferred promises, as `scheduling-service.test.ts` does. They never sleep and never assert on elapsed real time.

## K1 - gate.json, verify data, scope guard

**Files:** `goals/gate.json`, `goals/verify/goal-driven-loop.json`, `shared/domain/scope-guard.ts`, its test, `tests/tools/gate-data.test.ts`.

**Steps:**
1. `gate.json`: spec 2.9, database `gate_test`. Verify file: `{"v":1,"tasks":{}}`.
2. `checkScope({ changed: { status; path; oldPath? }[], guarded, verifyChanges: { path; base; head }[] })` plus `packageChange?`, gives `verdict`: `pass`, `plan` with `addedKeys`, or `guarded` with `paths`, `reason`.
3. Test `path`, `oldPath`. `\` becomes `/`, drop `./`, ignore case. `..` is guarded. `*` stops at `/`, `**` crosses it.
4. Plan PR: only `goals/verify/<slug>.json` (A or M) and `docs/plans/**`. Each verify path has a `verifyChanges` row. Base keys stay deep-equal, `v` stays, added keys have `green`. Else guarded.
5. `parseGateConfig`, `parseVerifyFile` throw on a bad shape, with no zod.
6. `package.json`: optional `packageChange: { base; head }`, rule of 2.9, also for `./Package.json`.
7. `verifyEntryFiles(scripts)` splits `scripts.verify` on `&&`, and follows `npm run <x>`. `node [--import tsx] <file>` gives the file. `tsc`, `vitest`, `playwright`, `vite` give none. Any other command throws.
8. Tests, 78. Per entry of 2.9, a matching path, 33 (`scripts/metrics/baseline.mjs` for the glob; the list is literal in the test). Forms 6: rename out, delete, `Goals/x`, backslashes, `./goals/x`, `a/../goals/x`. Pass 4: `server/x.ts`, `scripts/a.mjs`, `scripts/sub/a-check.mjs`, `goalsx/a.json`. Plan 5: added key, new file, with docs, docs only, key order. Guarded 10: changed key, removed key, `v`, bad JSON, delete, rename, plus server file, plus `gate.json`, no row, empty `green`. Package pass 3: dependency bump, `scripts` key order, higher `--min`. Package guarded 9: lower `--min`, higher `--min` plus a new step, other script changed, script added, bad JSON, delete, rename, no `packageChange`, `./Package.json` with a changed script. Globs 3, parsers 5.
9. `gate-data.test.ts`, 6: `guarded`, `testGlobs` equal the 2.9 block; both files parse; the real `verify` and each file's `from './x'` imports are all guarded; a fixture line with `node scripts/evil.mjs` fails; a fixture line with `npx evil` throws.

**Goal:** G9. A PR cannot lower its bar, and a plan PR only adds keys.

**Red:** `npx vitest run --project unit shared/domain/scope-guard.test.ts` prints `Cannot find module './scope-guard'`.

**Green:** the same command prints `Tests  78 passed (78)`. `npx vitest run --project unit tests/tools/gate-data.test.ts` prints `Tests  6 passed (6)`.

**Stub check:** always `pass`: 50 or more fail. A `verifyEntryFiles` that returns `[]` fails the fixture line. Always `guarded`: pass and plan cases fail. Run both.

**Ratchet:** unit count rises by 84.

## K3 - GitHost, gh adapter

**Files:** `server/ports/git-host.ts`; `server/adapters/github/gh-git-host.ts` and test; `server/config.ts`, `server/config.test.ts`; `tests/support/fake-gh.mjs` for calls that it lacks (`-R`, `closingIssuesReferences`).

**Steps:**
1. Port, `repo` first: `pullRequest(repo, n)` gives `{ number, headSha, headRef, baseRef, state, title, body, url, mergedAt, closingIssues }`; `setStatus(repo, sha, { state, description })`; `checks(repo, sha)`; `merge(repo, n, headSha)`; `comment(repo, issue, body)`; `openIssue(repo, { title, body, labels })`; `searchIssues(repo, query)`. `GitHostError` has `exitCode`, `stderr`.
2. `GhGitHost` uses `CommandRunner`, 60 s. Merge: `gh pr merge <n> -R <repo> --squash --match-head-commit <sha>`. Status: `gh api repos/<repo>/statuses/<sha> -f state=... -f context=castraferrum/gate -f description=...`, cut at 140 characters. Checks: `gh api repos/<repo>/commits/<sha>/check-runs`. Comment: `--body`, cut at 20000 characters.
3. A `ghBin` that ends in `.mjs` runs as `[process.execPath, ghBin, ...args]`. Tests set it to `tests/support/fake-gh.mjs`, not to the `gh.cmd` of the F2 kit: Node cannot spawn a `.cmd` with no shell.
4. `loadConfig`: `LOOPS_GH_BIN` as `ghBin`, default `gh`. With no `*_test` database it throws `LOOPS_GH_BIN may only run against a DB named *_test`.
5. Tests, adapter 9, on the F2 fake and a bare repository: each method (7, `merge` merges there); a wrong sha throws and merges nothing; exit 1 throws `GitHostError`. Config 2.

**Goal:** G6. The console reads a PR, marks it, and merges only the commit that it checked.

**Red:** `npx vitest run --project unit server/adapters/github/gh-git-host.test.ts` prints `Error: Cannot find module './gh-git-host'`.

**Green:** the same command prints `Tests  9 passed (9)`. `npx vitest run --project unit server/config.test.ts -t LOOPS_GH_BIN` prints `2 passed`. `npm run arch` exits 0.

**Stub check:** remove `--match-head-commit`: the wrong-sha case fails. Run it, restore.

**Ratchet:** unit count rises by 11.

## K9 - merge-audit.mjs

**Files:** `scripts/merge-audit.mjs`, `tests/tools/merge-audit.test.ts`, `README.md`, `tests/support/fake-gh.mjs` for calls that it lacks.

**Steps:**
1. `node scripts/merge-audit.mjs -R <o/r> --since <ISO> [--json]`. `--since` is required, because older PRs have no gate status.
2. Read `gh pr list -R <r> --state merged --limit 1000 --json number,headRefOid,mergedAt`, and drop older PRs. For each, read `gh api repos/<r>/commits/<sha>/status`. An incident: no `castraferrum/gate` status with state `success` (2.8).
3. `LOOPS_GH_BIN` if set, with the `.mjs` rule of K3, else `gh`. The script writes nothing. T5 opens issues.
4. Output: `incident: PR <n> <sha7> <why>` per incident (`no status`, `status failure`), then `merge-audit: <i> incidents in <m> merged PRs`. `--json`: `{"incidents":[{"pr":n,"sha":"...","why":"..."}],"merged":m}`.
5. Exit 0 no incident, 1 incidents, 2 bad argument or `gh` error.
6. Tests, 7, on the F2 fake: all `success`; a planted merge with no status gives one incident and exit 1; a `failure` status; older than `--since`; `--json`; no `--since` exits 2; a `gh` error exits 2 and prints no `0 incidents`.
7. Add a row to the Scripts table of `README.md`.

**Goal:** G6. A merge that went around the gate is found.

**Red:** `npx vitest run --project unit tests/tools/merge-audit.test.ts` prints `Tests  7 failed (7)`.

**Green:** the same command prints `Tests  7 passed (7)`.

**Stub check:** a script that prints `merge-audit: 0 incidents in 0 merged PRs` and exits 0 fails the planted merge. Run it, restore.

**Ratchet:** unit count rises by 7. Metric `merged-on-red`: decision 7, 12, "not measured yet".

## K10 - Tick ends at PR_OPEN, step 7, E check reads status

**Files, `hieplam/agent-plugins`, worktree `../agent-plugins-gate` from `origin/master` with P13:** in `SK`: `references/tick.md`, `scripts/epic.mjs`, `scripts/tests/*`, `evals/evals.json`, `evals/check-tick.mjs`. Not `drive.md`.

**Steps:**
1. `tick.md` step 7: add `PR_OPEN`, `RESOURCE_DOWN`, field `resource` (2.3). The console reads the line from the result text, not the summary.
2. Step 5: with `CASTRAFERRUM_GATE=1`, reply `PR_OPEN` once the PR is open: no `gh pr checks`, wait, merge, `E check` or release. With no variable, step 5 stays.
3. Step 6: console-claimed, a down resource gives `RESOURCE_DOWN`.
4. `E check`: `Q_CLOSING` gains `headRefOid`. Read `gh api repos/<r>/commits/<sha>/status`, `castraferrum/gate`. `failure` always fails. `--gate` fails on anything but `success`. No flag, no status: as today. The Verify words stay.
5. `fake-gh.mjs`: `statuses[sha]`, `headRefOid`. `check-tick.mjs`: `--pr <url>`.
6. Eval 7: env `CASTRAFERRUM_GATE=1`, the 2.7 line for task 49, and text: `https://github.com/o/r/pull/7` is open, nothing is left to build. Check: `--result PR_OPEN --issue 49 --pr <url>`, state unchanged. `expected_output`: no `gh pr checks`, no `gh pr merge`.
7. PR body: `Closes hieplam/castraferrum#<n>`.

**Goal:** G8. A run ends at an open PR, with no wait.

**Red:** with the new tests, in `SK/scripts`, `node --test tests/epic.test.mjs tests/check-tick.test.mjs` prints `ℹ tests 54`, 3 or more fail.

**Green:** the same command prints `ℹ tests 54`, `ℹ fail 0`. New: 4 `check` (`--gate` `success`; `failure`; `--gate` no status; no flag, no status), 1 `--pr`. From the root, `python3 scripts/evals/run_evals.py --evals SK/evals/evals.json --eval-id 1,2,3,6,7 --mode with_skill --exec-model haiku --grader-model haiku` prints `[with_skill] PASS` for 6, 7, and no worse than the P13 baseline for 1 to 3.

**Stub check:** ignoring status fails the `failure` test. A polling tick fails the grader of eval 7.

**Ratchet:** `node --test` count 49 to 54.

## K2 - Gate tables, repo_gate

**Files:** `schema.ts`, migration, `db.ts`; `server/ports/gate-repository.ts`, `server/ports/claims.ts`; `shared/domain/gate.ts`; gate and claim adapters, `memory-db.ts`, 3 repositories files; `tests/contract/repositories.contract.ts`.

**Steps:**
1. Migration `gate` (spec 3, decision 30). `gate_jobs`, `gate_steps`: 2.8. Add to `truncateAll`.
2. Partial unique indexes: one `running` job; one row per `repo_id`, `pr_number`, `head_sha` in `queued` or `running`.
3. `gate.ts`: `GATE_STEPS`, `GATE_JOB_STATES`, types `GateJob`, `GateStep`, `RepoGate`. `Repositories.gate`.
4. `GateRepository`: `getRepoGate(repoId)`; `setRepoGate(repoId, { enabled, githubRepo, checkCommand }, at)`, `REPO_NOT_FOUND`; `enqueue({ id, repoId, prNumber, headSha, taskKey, at }): 'queued' | 'duplicate'`; `takeNext(at): GateJob | null`, oldest `queued` to `running`, `null` while one runs; `finish(id, { state, failedStep, at })`, from `running` only; `ratify(id, at)`, `needs_ratification` to `queued`; `appendStep(step)`; `listSteps(jobId)`, by `seq`; `get(id)`; `list(limit)`, newest first.
5. `ClaimRepository.handOver(id, gateJobId): boolean`, `false` on a closed row. `findOrphaned` reads `owner = 'run'` only (decision 4).
6. Tests, 15, `describe('gate_tables')`: repo gate none, set, replace, unknown; enqueue, duplicate, again after finish; `takeNext` order, `null` while running, empty; `finish` first wins; `ratify`, wrong state; steps by `seq`; `handOver` then no orphan.

**Goal:** G6. The gate keeps one job at a time, a record of each step, and each claim that it owns.

**Red:** `npx vitest run --project contract -t gate_tables` prints `30 failed`.

**Green:** the same command prints `30 passed`. `npx vitest run --project api tests/api/db-migrate.test.ts` exits 0. `npm run verify` exits 0.

**Stub check:** a `takeNext` that ignores a running job fails `null while running`. A `handOver` that does nothing fails the orphan case. Run both.

**Ratchet:** `npm run test:contract`: each side rises by 15.

## K8 - Merge guard hook

**Files:** `shared/domain/merge-guard.ts`; `server/ports/executor.ts`; `claude-agent-executor.ts`; `tests/api/merge-guard.test.ts`; `docs/ARCHITECTURE.md`.

**Steps:**
1. `checkMergeCommand(toolName: string, command: unknown): { deny: false } | { deny: true; rule: string; reason: string }`, by spec 2.15. A pure function with no shell parse.
2. `ExecutionInput.gateGuard?: boolean`. On: option `hooks: { PreToolUse: [{ matcher: 'Bash|PowerShell|mcp__.*', hooks: [guard] }] }`. `guard` reads `tool_name`, `tool_input.command`. A refusal returns `{ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }`, else `{}`.
3. Off: no `hooks` key, so a run works as today. K7 sets it (decision 29).
4. `ARCHITECTURE.md`, The Claude executor: the guard and its limit.
5. Tests, `describe('merge-guard')`. `it.each` over each line of Refused (35, with `rule`) and Allowed (16) of 2.15. Wiring 5 on the fake query: on, `gh pr merge 1` gives `deny`; the same with `agent_id`, `agent_type`; `gh pr view 1` gives `{}`; a non-string `command` gives `deny`; off gives no `hooks`. Real 1, `LC_REAL_CLAUDE=1` only: the setup of S2 in the evidence log, a haiku run asks for `gh pr merge 1`, `gh.log` has 0 lines.

**Goal:** G27. A run asked to merge, in any form of 2.15, does not reach `gh`.

**Red:** `npx vitest run --project api tests/api/merge-guard.test.ts` prints `Cannot find module`.

**Green:** the same command prints `merge-guard`, `Tests  56 passed | 1 skipped (57)`. With `LC_REAL_CLAUDE=1` and `-t real` it prints `1 passed`. `npm run verify` exits 0.

**Stub check:** always `{ deny: false }` fails each Refused line. Always `deny` fails each Allowed line. Only `gh pr merge` fails the REST, GraphQL and `git push` lines. Run all three.

**Ratchet:** `npx vitest list --project api 2>/dev/null | wc -l` rises by 57.

Wave 3 adds K4, K5 and K6. The contracts are decisions 31 to 41 of the spec. **All tests of the gate use small fake commands (`node tests/check.mjs`), the fake `gh` and a local bare repository. They never run the real `npm run verify`, `npm ci` or an e2e spec, and they open no real PR.**

## K4 - GateWorkspace: worktree, stub restore

**Files:** `server/ports/gate-workspace.ts`; `server/adapters/git/git-gate-workspace.ts` and test; `shared/domain/gate-commands.ts` and test.

**Steps:**
1. Port: `fetch(repoPath, { headRef, headSha })` gives `{ mainSha, headMatches }`; `readAt(repoPath, sha, path)` gives text or `null`; `listAt(repoPath, sha, dir)` gives `.json` names; `changed(repoPath, mainSha, headSha)` gives `{ mergeBase, files: ChangedFile[] }`; `prepare(repoPath, jobId, mainSha, headSha)` gives `{ ok: true, tree }` or `{ ok: false, output }`; `stubRestore(tree, files, testGlobs)` gives restored paths; `stubUndo(tree)`; `run(tree, { line, env, timeoutMs })` gives `CommandResult`; `remove(repoPath, jobId)`. `GateTree`: `{ dir, baseSha, rebasedSha }`.
2. `GitGateWorkspace({ runner, root })`, `dir` is `<root>/<jobId>`. Each call: `git --literal-pathspecs -c core.hooksPath=<null device> -c user.name=castraferrum-gate -c user.email=gate@castraferrum.invalid -c commit.gpgsign=false -C <dir>`.
3. `fetch`: `+refs/heads/main:refs/remotes/origin/main`, `+refs/heads/<headRef>:refs/gate/head`, `--no-tags`. `changed`: decision 32.
4. `prepare`: `remove` first (a crash leaves a folder), `worktree add --detach`, `rebase <mainSha>`. Failure: `rebase --abort`, `remove`, `{ ok: false, output }`.
5. `stubRestore`: skip `matchesGlob(path, testGlobs)`. For the rest: on the `ls-tree -r -z` list of `baseSha`, `checkout <baseSha> -- <paths>`, 50 per call; else delete the file.
6. `stubUndo`: `reset -q --hard <rebasedSha>`, `clean -fdq`, so ignored `node_modules` stays. `remove`: `worktree remove --force`, then `rmSync` with `maxRetries: 3`, then `worktree prune`.
7. `gate-commands.ts`: `shellArgv`, `stubCommandProblem(line)`, `isRealRed(result)`: decisions 31, 34.
8. Tests, `describe('gate_workspace')`, 20, real git on `createBareRepo`: `readAt` gives main's text while the PR changes the file; missing path `null`; `listAt` omits a file that only the PR has; `headMatches` false; A, M, D; rename is D plus A; name with a space; a later main commit is not in `changed`; dirty checkout untouched; `prepare` holds main's commit and the PR file; conflict gives `output` with the file name, no folder; leftover folder; hook of `core.hooksPath` not run; restore M, A, D; test files stay; real stub run (below); `stubUndo` exact tree, `status --porcelain` empty; `stubUndo` removes a new file, keeps ignored; `run` passes `env`; `remove` twice.
9. Real stub run: `tests/check.mjs` imports `../impl.mjs`, exits 0 at head, exits 1 after `stubRestore`, exits 0 after `stubUndo`.
10. Tests, `describe('gate_commands')`, 10: `shellArgv` 2; `stubCommandProblem` 5 (`test:e2e`; `npm run verify`; `playwright` bare; visual with no build; `npm run build && npx playwright test --project visual` passes); `isRealRed` 3 (exit 1; time-out; 127).

**Goal:** G7. The gate tests a clean copy of the PR, and a task with no implementation really runs with no implementation.

**Red:** `npx vitest run --project unit server/adapters/git/git-gate-workspace.test.ts` prints `Cannot find module` and `Test Files  1 failed (1)`.

**Green:** the same command prints `Tests  20 passed (20)`. `npx vitest run --project unit shared/domain/gate-commands.test.ts` prints `Tests  10 passed (10)`. `npm run arch` prints `dependency-cruiser: 0 violations`. Light verify: nothing imports these files.

**Stub check:** `stubRestore` that returns `[]`: the real stub run fails. `readAt` from the worktree: the first test fails. No `core.hooksPath`: the hook test fails. Run all three.

**Ratchet:** unit count rises by 30. Spike number: S3, 5 s.

## K5 - GateService: queue, steps

**Files:** `server/services/gate-service.ts` and test, `contracts.ts`; `server/http/gate-routes.ts`, `app.ts`, `errors.ts`; `shared/domain/errors.ts`, `shared/contracts/common.ts`; `server/compose.ts`, `server/main.ts`; `server/ports/command-runner.ts`, `node-command-runner.ts` and test, `gate-workspace.ts`, `git-gate-workspace.ts`; `server/ports/gate-repository.ts`, its 2 adapters, contract; `tests/support/gate-world.ts`; `tests/api/gate-api.test.ts`; `docs/API.md`, `docs/USE-CASES.md`.

**Steps:**
1. Decision 37: `signal`, `requeueRunning`, `stop()`. `ComposeOptions.ghBin`, `main.ts` passes `cfg.ghBin`. Compose: `GhGitHost`, `GitGateWorkspace` with root `<tmpdir>/castraferrum-gate`, one line in `background`, `stop()` first in `shutdown` and `reset`.
2. `DefaultGateService({ gate, repos, host, workspace, commands, clock, ids, sleep })`. `tick()`: `takeNext`, run the job, return `{ jobId, errors }`.
3. Job, steps of 2.8, one `appendStep` per step, `output_tail` by a pure `outputTail(text)`, 60 lines. First the status `pending`.
4. `scope`: PR `OPEN`, `baseRef` `main`, `headSha` equal to `job.headSha`. `fetch`. Parse `gate.json` with `readAt(mainSha)`. `changed`, `verifyChanges`, `packageChange`, `checkScope`. `guarded` gives `needs_ratification` unless `job.ratifiedAt`.
5. `base`, `setup`, `green`, `stub`, `verify`, `ci`, `merge`: decisions 32 to 38. `green` and `stub` read only `readAt(mainSha)`. Env: `gate.env`. Verdict `plan`, or `stub.none`: step `skip` with the reason in `output_tail`. `stubUndo` runs in `finally`. `remove` runs in `finally`. A failure: `finish`, status `failure`, `<step>: <one line>`.
6. `queue({ repoId, prNumber, taskKey? })`; `POST /api/gate/jobs` gives 201, 200 on `duplicate`; `GATE_OFF` (409) when `repo_gate.enabled` is false. Add the API row and the next free UC.
7. `gate-world.ts`, `createGateWorld()`: bare repository, fake `gh`, clone as `repoPath`, main seeded with `goals/gate.json` (fake `setup`, `verify`), `goals/verify/e.json`, `tests/verify.mjs`; `openPr({ key, files, body })`, with a passing check run; `onCommand(match, fn)`, a runner wrapper that acts before a matching line.
8. Tests, `describe('gate_service')`, 29, memory repositories, real workspace, `GhGitHost` on the fake. `sleep` is injected and never waits. Control: 8 steps pass in order, `success` before the merge call, `verify` sees `impl.mjs`, no folder left. Exam from `main`: a ratified PR rewrites its verify entry and `gate.json` to pass; main's entry fails it, it fails `green`, and no line of the PR ran. Same PR unratified: `needs_ratification`, 0 commands. `package.json` script change: `needs_ratification`. No entry; key in two files; empty `green`; exit 1; missing `expect`; no implementation fails `green`; always-true test fails `stub`; `stub.none`; stub time-out; `test:e2e` stub, not run; plan PR; `verify` fails; `ci` failure; `ci` pending then pass; no check run; `main` moved once: 2 `scope` rows, merged; moved twice: 0 merge calls; head moved in `verify`: merge carries `job.headSha`, the commit is not on main; base `dev`; conflict; `requeueRunning`; `stop` aborts; 100 lines keep the last 60; two jobs in order; `check_command` gets `{key}`.
9. Node runner 1 (abort). Contract 1 per side. API 4: 201, duplicate, `GATE_OFF`, `REPO_NOT_FOUND`.

**Goal:** G6, G7, G9. A PR merges only if a gate with no model passed every step, on an exam from `main`.

**Red:** `npx vitest run --project unit server/services/gate-service.test.ts` prints `Cannot find module` and `Test Files  1 failed (1)`.

**Green:** the same command prints `Tests  29 passed (29)`, `Duration` under 180 s. `npx vitest run --project api tests/api/gate-api.test.ts` prints `Tests  4 passed (4)`. `npm run verify` exits 0.

**Stub check:** read the verify entry from the worktree: the exam test fails. No `stubRestore`: the always-true test fails. Treat exit `null` as red: the time-out test fails. No second fetch: both moved tests fail. Merge `pr.headSha`: the head test fails. Run all five.

**Ratchet:** unit count rises by 30, api by 4, contract by 1 per side. Metrics `merged-on-red`, `stub-share`: decision 7.

## K6 - Failure feed, red main, ratify

**Files:** `gate-service.ts`, `contracts.ts`, new test `server/services/gate-feed.test.ts`; `gate-routes.ts`, `errors.ts`, `shared/domain/errors.ts`, `shared/contracts/common.ts`; `server/ports/claims.ts`, 2 claim adapters, contract; `compose.ts`; `tests/api/gate-api.test.ts`; `docs/API.md`, `docs/USE-CASES.md`.

**Steps:**
1. Deps gain `claims`, `probes`, `gateway` (`ClaimGateway`).
2. Failure: `host.comment(repo, Number(taskKey), ...)`, the text `Gate failed at <step>.`, then the tail of decision 40 in a code block. A key that is not a number: no comment. A comment that throws goes to `errors` and stops nothing.
3. `ClaimRepository.listGateOwned()`, decision 40. Tick order: settle, then `takeNext`. Release reason `gate: <step>`, `excused: false`; decision 39 gives `excused: true`. A row's `task.resources` is `[]`.
4. `needs_ratification`: decision 41, the comment names `paths`.
5. `ratify(id)`: `gate.ratify`, wrong state throws `GATE_JOB_NOT_RATIFIABLE` (409), unknown `GATE_JOB_NOT_FOUND` (404). `POST /api/gate/jobs/:id/ratify`. The job takes the queue again and skips only `checkScope`.
6. Red `main`: decision 39, at the start of `base`, read with `host.checks(repo, mainSha)`.
7. Tests, `describe('gate_feed')`, 19, on `createGateWorld` and `fake-claim-gateway.ts`: comment holds the literal last output line; 60 lines of 1000 characters keep the last line, under 20000; release once, not excused, row closed; failed release retried on the next tick, 1 comment; merged closes with no release; `needs_ratification` keeps the row and names the path; hand job with no claim; key `plan-217`, no comment; a comment that throws still releases. Ratify: control merges with `scope` `skip`; failing `green` stays failed; moved head fails `scope`; wrong state. Red main: first PR fails `base`, 1 issue, excused, main unchanged; second PR, still 1 issue; an old CLOSED issue does not stop a new one; PR with `Closes` of that issue merges; pending is not red; green control. Contract 2 per side, `describe('gate_feed')`. API 3: ratify 200, 404, 409.

**Goal:** G6. A failure reaches the next run as literal output. A red `main` stops every PR except its fix. A guarded change waits for one ratification.

**Red:** `npx vitest run --project unit server/services/gate-feed.test.ts` prints `Tests  16 failed | 3 passed (19)`. The 3 passes are guards: key `plan-217`, pending is not red, green control.

**Green:** the same command prints `Tests  19 passed (19)`. `npx vitest run --project api tests/api/gate-api.test.ts` prints `Tests  7 passed (7)`. `npx vitest run --project contract -t gate_feed` prints `4 passed`. `npm run verify` exits 0.

**Stub check:** no comment: the literal test fails. Release in the job: the retry test fails. Search with no OPEN filter: the closed-issue test fails. Merge on red: the first red test fails. Ratify that skips `green`: the failing-green test fails. Run them.

**Ratchet:** unit count rises by 19, api by 3, contract by 2 per side. Metric `merged-on-red`: decision 7.
