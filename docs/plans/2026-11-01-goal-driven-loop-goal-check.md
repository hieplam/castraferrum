# Plan, issue 214: the goal check opens the epic and writes its next tasks (wave 1)

Spec: [../specs/2026-11-01-goal-driven-loop.md](../specs/2026-11-01-goal-driven-loop.md). Plan index: [2026-11-01-goal-driven-loop.md](2026-11-01-goal-driven-loop.md).
Epic: [castraferrum#217](https://github.com/hieplam/castraferrum/issues/217). Evidence log: `2026-11-01-goal-driven-loop-evidence.md`.
Wave 1 holds T1 and T3. T2, T4, T5 and T6 come in later waves.

## T1 - goal-check --json, score, cadence

**Files:** `scripts/goal-check.mjs`, `tests/tools/goal-check.test.ts`, fixtures `tests/tools/fixtures/goal-check/{score,score-nomatch,cadence,d7,no-goals}.json`, `golden/<name>.out`.

**Steps** (spec 2.10):
1. First, save the stdout of `node scripts/goal-check.mjs <fixture>` for the 10 old fixtures as `golden/<name>.out`.
2. `--json`: stdout is one line `{"goals":[{"id","pass","value","of","line"}],"passed","total","sha"}`. `sha` is `git rev-parse --short=7 HEAD` or `"unknown"`. The exit code stays.
3. Check key `"score":"<regex>"`: first match on that check's output. Groups 1 and 2 are `value` and `of`. `line` is `<id> <match[0]>`. No score: `null`, `null`, `<id> pass` or `<id> FAIL`. No match fails the goal (`score: no match`). A failing check keeps its score. Human: `G4 pass (72/240 screens)`; after `FAIL`, a line `    score 72/240 screens`.
4. Goal key `"cadence":"merge"|"nightly"`, default `merge`. `--cadence <name>` runs only those goals. An unknown name, or no goal: exit 2.
5. Goal key `"d7":true`: checks must pass. Human `G7 pass (not measured yet)`. JSON adds `"d7":true`, and `line` ends ` (not measured yet)`.
6. Keep: no manifest gives usage on stderr, empty stdout, exit 2, also with `--json`. No goal: exit 2.

**Goal:** G11. `--json` prints each row's number (`G4 72/240 screens`) and the totals for `goals 3/8`. Old manifests print as before.

**Red:** write 14 tests: 3 exit-2 (no manifest, `--json` no manifest, empty manifest); 2 `--json` (shape, exit 1); 3 score (value, failing, no match); 4 cadence (nightly, merge, unknown, empty); d7; golden of the 10 fixtures. `npx vitest run --project unit tests/tools/goal-check.test.ts` shows `Tests  10 failed | 15 passed (25)`. The 4 passes are the guards.

**Green:** same command: `Tests  25 passed (25)`. Then `node scripts/goal-check.mjs; echo $?` prints `usage: ...` and `2`.

**Stub check:** usage branch `return 0`: 2 tests fail. `--json` prints `{}`: its tests fail. Ignore `--cadence`: 4 fail.

**Ratchet:** tests in `goal-check.test.ts`, 11 to 25, up only. F0 `status-questions`: unchanged (D7).

## T3 - E next: refusal, plan, close on check. E check, plan.md: Acceptance line

**Repo:** agent-plugins (opus); the issue stays in cf. Needs P13 merged. Worktree `../agent-plugins-goal-next` from the clone, base `origin/master`. PR to `hieplam/agent-plugins`, body `Closes hieplam/castraferrum#<n>`. Paths are under `plugins/epic-loop/skills/epic-loop/`.

**Files:** `scripts/epic.mjs`, `scripts/tests/{epic.test.mjs,fake-gh.mjs,golden/no-manifest.json}` (fake: query `IssueBody` gives `{body}`), `references/{tick,plan}.md`, `SKILL.md`.

**Steps** (spec 2.1, 2.10; tests use `EPIC_LOOP_GH_MODULE`):
1. First save `golden/no-manifest.json`: stdout and exit code of `next`, `next --dry-run`, `check` on 3 worlds.
2. `next` reads the epic body. No line `Goal manifest: goals/<f>.json`: change nothing. Else read the file on the default branch. `last` is the last epic comment `loop-goals: {json}` that parses.
3. G10: file missing, or no `opened`, or `opened.passed >= total`: take only a ready task with the body line `Goal task: yes`. None: `blocked`.
4. G25, G26: else decide as today. On `done`: no `last` gives `blocked`; all pass gives `done`; else `{action:'plan',plan:{key:'plan-<epic>',failing,sha}}`, or `blocked` if a comment `loop-plan: <sha>` exists. Without `--dry-run`, `plan` first comments `loop-plan: <sha> <ids>`. Sweep closes the epic only on `done`.
5. P13's `--probe` gets a `plan` case.
6. G29: epic has the line and the PR has a `web/` path (`files(first:100){totalCount nodes{path}}`; over 100 counts): `check` needs, in `## Verify`, a line `Acceptance: ...` with the printed form of the compare result. `scripts/design-compare.mjs` prints only a path. The numbers are in `report.json` (`tests/visual/ds/kit.ts`): `"pairs": 164`, `"worstRatio": 0.00024`. The line must match both `/"?pairs"?[: ]+[1-9]\d*/` and `/"?worstRatio"?[: ]+\d+(\.\d+)?/`, else FAIL naming `Acceptance`. The word "compared" alone fails.
7. Document it in `tick.md` (row `plan`: run `npm run goal:check`, write 1 to 3 tasks with `E create`), `plan.md`, `SKILL.md`.

**Goal:** G10, G25, G26, G29. A new epic shows a red check before any build task. Failing rows give `plan`, not `done`. A `web/` task shows its compare result.

**Red:** 20 tests. `G10:` x4 (no file; green at opening; red takes; goal task takes). `G25:` x6 (plan; same sha blocks; new sha plans; dry run; `--probe`; ready wins). `G26:` x3 (done; red keeps epic open; no result blocks). `G29:` x6 (no line; no compare; "compared" with no number; both numbers; non-`web/`; no-manifest epic). `no Goal manifest line: behaves as before`. N is `# tests` before editing. `node --test scripts/tests/epic.test.mjs`: `# tests N+20`, `# pass N+7`, `# fail 13`.

**Green:** `# tests N+20`, `# pass N+20`, `# fail 0`.

**Stub check:** old `epic.mjs` (`git show HEAD:<path>`): `# fail 13`. A stub that blocks every manifest epic fails the take, done and control tests.

**Ratchet:** tests in `epic.test.mjs`, N to N+20, up only. F0 `first-goal-day`: D7.

Wave 2 adds T4. Spec: [../specs/2026-11-01-goal-driven-loop.md](../specs/2026-11-01-goal-driven-loop.md). Plan index: [2026-11-01-goal-driven-loop.md](2026-11-01-goal-driven-loop.md).

## T4 - Standing goals, fingerprint

**Needs** K3 merged (issue 243). Read `server/ports/git-host.ts` on `main` first: it has `openIssue` (gives `{number,url}`), `searchIssues` (gives hits with `number`, `state`), `comment`.

**Files:** `shared/domain/{fingerprint.ts,fingerprint.test.ts,standing-goal.ts}`; `server/ports/{goal-repository.ts,git-host.ts}`; `server/adapters/{memory/memory-goal-repository.ts,postgres/pg-goal-repository.ts,github/gh-git-host.ts}` (+ its test); `postgres/schema.ts`, one migration, `truncateAll`, both `repositories.ts`, `memory/index.ts`; `server/services/standing-goal-service.ts`; `tests/support/fake-gh.mjs`; `tests/contract/repositories.contract.ts`; `tests/api/standing-goals.test.ts`.

**Steps** (spec 2.10, 2.11):
1. `fingerprint.ts` exports `firstFailingLine(text)`: the first line that matches `/\b(fail(ed|ure|s)?|error|not ok)\b|^\s*[✗×]/i`; else the last non-empty line; else `''`. `normalize(line)`: lower case, then replace each match by `n`, in this order: timestamp `/\d{4}-\d{2}-\d{2}[t ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?z?/g`, path `/(?:[a-z]:)?[\w.@~-]*(?:[\\/][\w.@~-]+)+/g`, hex `/\b[0-9a-f]{7,}\b/g`, number `/\d+(\.\d+)?/g`; then collapse white space and trim. `fingerprint(repo,rowId,line)`: the first 12 hex of sha256 of `${repo}\n${rowId}\n${normalize(firstFailingLine(line))}`.
2. Migration `standing_goals`: `standing_goals(repo,row_id,state,last_line,last_run_at; pk repo,row_id)`, `standing_issues(id uuid pk,repo,row_id,fingerprint,issue_number,opened_at,last_failed_at,fail_count,closed_at null; unique (repo,fingerprint) where closed_at is null)`, `standing_schedule(repo pk,last_at,next_at)`.
3. `GoalRepository`: `getGoal`, `saveGoal`, `findOpen(repo,fp)`, `listOpen(repo,rowId)`, `open`, `touch(id,at)` (count + 1), `close(id,at)`, `getSchedule`, `saveSchedule`. Memory and Postgres pass the same 4 contract cases.
4. `GitHost` gains `closeIssue(repo,n)` and `editIssueBody(repo,n,body)`; the fake gets `issue edit <n> --body`.
5. `StandingGoalService.runPass({repo,cwd,rows:{id,outcome,run:string[],timeoutSec}[],maxNewIssues:3,now})` gives `{opened,updated,closed,deferred}`. It runs each `run` with `CommandRunner`. Exit 0: save `passing`, comment `Passed at <ISO>`, `closeIssue`, `close` for each open issue of the row. Any other end: `fp` from stdout + stderr. An open issue with `fp`: `touch` and `editIssueBody` (body: `<!-- fingerprint:<fp> -->`, outcome, `Last failed: <ISO>`, `Failed passes: <n>`, last 40 lines of output). None: `searchIssues('"<fp>" in:body')` adopts an OPEN hit; else with `opened < maxNewIssues`, `openIssue` (title `standing goal <id>: <outcome>`, label `standing-goal`); else the row is `deferred` and nothing is stored.
6. `isDue(repo,now)`: true with no schedule or `next_at <= now`. `markRan(repo,cron,tz,now)`: `next_at` from `new Cron(cron,{timezone:tz}).nextRun(now)`. T5 and the ticker of P4 call them.

**Goal:** G13. A regression gives one issue, a repeat updates its "Last failed" line, a pass closes it, one pass opens at most 3.

**Red:** write 7 unit tests in `fingerprint.test.ts` with the fixture `a` = `ok 1\nFAIL tests/api/x.test.ts > loads 12 rows at 2026-11-01T10:00:00Z (abcdef1234)\nmore`, `b` = `FAIL tests/api/y.test.ts > loads 99 rows at 2026-11-02 23:59:01 (0123456789ab)`, `c` = `FAIL tests/api/x.test.ts > saves rows`: hash of `a` and of `b` for `('o/r','H1')` are both `cf30542f175d`; `c` gives `cb1d48109252`; `a` with `H2` gives `d3b1c1fec1fa`; `a` with `p/r` gives `2a32e90e9b35`; a line `ok 1` before `b` keeps its hash; no failing word uses the last line; 12 lower-case hex. Write 10 api tests: two failing passes open one issue; the second updates `Last failed`; a pass closes it; a failure after a close opens a new issue; 5 new failures open 3 and defer 2; the deferred ones open next pass; same line with other numbers is the same issue; a different line opens a second issue; an open hit of the search is adopted; `isDue` and `markRan`. The api test uses Postgres, `GhGitHost` on the F2 fake and a scripted runner. `npx vitest run --project unit shared/domain/fingerprint.test.ts` and `npx vitest run --project api tests/api/standing-goals.test.ts` each print `Test Files  1 failed (1)`.

**Green:** the same commands print `Tests  7 passed (7)` and `Tests  10 passed (10)`. `npx vitest run --project unit server/adapters/github` shows 2 more tests than before and 0 failed. `npm run test:contract` shows 0 failed and 8 more tests. `npm run arch` exits 0.

**Stub check:** a constant hash fails the golden tests. A `normalize` that only lower-cases fails `b`. A service that always opens fails tests 1, 2 and 7. One that never closes fails test 3. No `maxNewIssues` fails test 5. Run each, restore.

**Ratchet:** tests of the unit and api projects, B to B + 17, and of the contract project, C to C + 8. Up only. The api test asserts 1 issue in the fake world after 2 failing passes (duplicates target 0).

Wave 3 adds T2. The contract is decision 42 of the spec. Its tests use small fake rows, the fake `gh` and a local bare repository, never the real manifest.

## T2 - GoalService: rows after merge, loop-goals:, fall issue

**Needs** K5 and T4 merged (T4 owns `GoalRepository` and `fingerprint`). Read `gate-service.ts` and `tests/support/gate-world.ts` first.

**Files:** `server/services/goal-service.ts` and test, `contracts.ts`, `gate-service.ts`, `compose.ts`; `server/ports/goal-repository.ts`, `server/ports/git-host.ts`; memory and Postgres goal adapters, `postgres/schema.ts`, one migration, `truncateAll`; `server/adapters/github/gh-git-host.ts` and test; `tests/support/fake-gh.mjs`; `tests/contract/repositories.contract.ts`; `goals/2026-11-01-goal-driven-loop.json`.

**Steps:**
1. Add `"epic":217` to the manifest of this epic.
2. Migration `goal_runs`: `repo`, `manifest`, `row_id` (primary key), `pass`, `value`, `of`, `line`, `cadence`, `sha`, `at`. `GoalRepository`: `saveRows(rows)`, `listRows(repo, manifest)`.
3. `GitHost.issueState(repo, n)`: `gh issue view <n> -R <repo> --json state`. `addSubIssue(repo, parent, child)`: `gh api repos/<repo>/issues/<child>` for `id`, then `-X POST repos/<repo>/issues/<parent>/sub_issues -F sub_issue_id=<id>`. The fake keeps `subIssues[parent]`.
4. `DefaultGoalService({ goals, host, workspace, clock, ids })`. `afterMerge({ repo, repoPath, jobId })`: `fetch`, `listAt(mainSha, 'goals')`, keep files with `goals` and `epic`, skip `CLOSED`. One worktree per pass, `jobId` plus `-goals`, removed in `finally`. Run `gate.setup`, then the command of decision 42, 30 min. Parse the last stdout line. Exit 2 or a bad line: `errors`, no comment.
5. Compare each row with its stored row, save, then comment on the epic: `loop-goals: {"passed":p,"total":n,"failing":[...],"sha":"..."}`, in this key order, from the stored rows of all manifest ids.
6. Fall: decision 42. Issue title `goal <id> fell: <outcome>`, body `<!-- fingerprint:<fp> -->`, `Epic: <n>`, `line`. `goals.open`, `addSubIssue`. A fall with `findOpen` adds no issue.
7. `nightly(now)`: decision 42. `GateService`: after `merged`, `await goals.afterMerge`, caught into `errors`. When `takeNext` gives `null`, one `nightly`.
8. Tests, `describe('goal_service')`, 14, on `createGateWorld`, seeded with the real text of `scripts/goal-check.mjs`, rows `node tests/row.mjs <id>`: a merge adding `impl.mjs` moves the comment `2/3` to `3/3`, exact text; the comment comes before the first command of the next job; a nightly row that never ran is in `failing`, `total` 3; a stored nightly pass counts; closed epic, 0 commands; manifest with no `epic`, none; bad line, no comment, job stays `merged`; row falls: 1 issue, 1 sub-issue; next merge, still 1 issue; red from the start, 0 issues; `value` falls 5 to 4; nightly due; not due; worktree removed after a failure. Contract 2 per side, `describe('goal_runs')`. Adapter 2.

**Goal:** G11. The owner sees a number that moves at each merge, and a row that falls opens one issue.

**Red:** `npx vitest run --project unit server/services/goal-service.test.ts` prints `Cannot find module` and `Test Files  1 failed (1)`.

**Green:** the same command prints `Tests  14 passed (14)`. `npx vitest run --project contract -t goal_runs` prints `4 passed`. `npx vitest run --project unit server/adapters/github` shows 2 more tests and 0 failed. `npm run verify` exits 0.

**Stub check:** comment only the merge rows: the `total` test fails. No `findOpen`: the second-merge test fails. Run goals after the next job: the order test fails. Let a failure throw: the job test fails. Run all four.

**Ratchet:** unit count rises by 16, contract by 2 per side. Metric `status-questions`: decision 7.

Wave 4 adds T5. The contract is decision 51 of the spec. Its tests use the fake `gh`, never a real repository.

## T5 - goals/health.json, audit row

**Needs** T4 (issue 282) and K9 (issue 244), both merged. Read `server/services/standing-goal-service.ts` and `tests/api/standing-goals.test.ts` first. `scripts/merge-audit.mjs` already has `--since`, `-R` and exit 2 for a failed `gh` call. T5 does not change it.

**Files:** `goals/health.json`; `shared/domain/{health-goals.ts,health-goals.test.ts}`; `server/services/{standing-goal-service.ts,contracts.ts}`; `tests/api/health-goals.test.ts`.

**Steps** (spec 2.10, decision 51):
1. `goals/health.json`: `{"v":1,"cron":"0 2 * * *","timezone":"Asia/Ho_Chi_Minh","epic":0,"maxNewIssuesPerPass":3,"rows":[H1,H2]}`. H1: outcome `The full verify passes on main.`, `run` `npm run verify`, `timeoutSec` 3600. H2: outcome `Every merged pull request has a passing gate status.`, `run` `node scripts/merge-audit.mjs -R {repo} --since 2026-11-01T00:00:00Z`, `timeoutSec` 600.
2. `health-goals.ts` exports `parseHealthFile(text: string, repo: string, platform: string): HealthFile` with `rows: { id; outcome; run: string[]; timeoutSec; verbatim: boolean }[]`. It replaces `{repo}` in each `run`, then `shellArgv(run, platform)` (decision 31). `verbatim` is true on `win32`. It throws `DomainError VALIDATION_FAILED` for: bad JSON, `v` not 1, a cron or timezone that `nextRuns` refuses, no rows, a repeated row id, a row without `id`, `outcome` or `run`, `timeoutSec` outside 1 to 86400, `maxNewIssuesPerPass` outside 1 to 10, and a row that names `merge-audit.mjs` with no `--since <ISO date>`.
3. `StandingRow` gains `verbatim?: boolean`; `runPass` passes it as `windowsVerbatimArguments`. `StandingGoalService.runHealth({ repo, cwd, text, now, platform? }): Promise<StandingPassResult | null>`: parse, return `null` if `!isDue`, else `runPass` with the file's `maxNewIssuesPerPass`, then `markRan`. A throw from `runPass` skips `markRan`, so the next call tries again.
4. Nothing calls `runHealth` in `compose.ts`, `main.ts` or `server/scheduler/`. Do not add a ticker. The file is inert until a later task wires it.
5. The PR changes `goals/**`, a guarded path. With the gate on, it ends at `needs_ratification`. Say so in the PR body.

**Goal:** G13, G6. A failing health row gives one issue and a repeat gives no second one. The audit row finds a merge that has no gate status, and a broken `gh` call never reads as a pass.

**Red:** write 10 unit tests in `health-goals.test.ts`: the real file parses (rows `H1`, `H2`, `epic` 0, cron `0 2 * * *`); `{repo}` filled and argv `['sh','-c','node scripts/merge-audit.mjs -R o/r --since 2026-11-01T00:00:00Z']` on linux with `verbatim` false; the same on `win32` as `['cmd.exe','/d','/s','/c','"node ..."']` with `verbatim` true; bad JSON; `v` 2; cron `61 * * * *`; a repeated row id; `timeoutSec` 0; `maxNewIssuesPerPass` 11; an audit row with no `--since`. Write 8 api tests on Postgres, the fake `gh` (env `LOOPS_GH_BIN`, `FAKE_GH_WORLD`) and the real `NodeCommandRunner`, with the H2 row of the real file: a planted merge with no status gives 1 issue titled `standing goal H2: ...` with a fingerprint and `PR 2`; a repeat on the next day gives still 1 issue and `Failed passes: 2`; a broken `LOOPS_GH_BIN` gives 1 issue and `closed` 0; the same with an open incident issue keeps it open; all merges with a status give a pass that closes the open issue; a merge before `--since` gives no issue; a second call on the same day returns `null` and runs 0 commands; the sources `compose.ts`, `main.ts` and `server/scheduler/` hold neither `health.json` nor `runHealth`. `npx vitest run --project unit shared/domain/health-goals.test.ts` and `npx vitest run --project api tests/api/health-goals.test.ts` each print `Test Files  1 failed (1)`.

**Green:** the same commands print `Tests  10 passed (10)` and `Tests  8 passed (8)`. `npx vitest run --project api tests/api/standing-goals.test.ts` still prints `Tests  11 passed (11)`. `node scripts/merge-audit.mjs` prints `merge-audit: -R <owner/name> is required` and exits 2. `npm run verify` exits 0.

**Stub check:** a `runHealth` that returns `null` fails 7 api tests. A `parseHealthFile` that skips the `--since` rule fails the last unit test. A `merge-audit.mjs` copy that prints `0 incidents` and exits 0 on a failed `gh` call fails the broken-`gh` test. Run all, restore.

**Ratchet:** unit tests, B to B + 10. Api tests, C to C + 8. Up only. Duplicate issues in the api test: 0 (G13). Merged PRs with no gate status found by H2 in the planted test: 1 of 1 (G6).

Wave 6 adds T6. It needs D2 (done on 2026-11-01) and T2 (`GoalService`, the table `goal_runs`; local branch `feat/gdl-t2-goal-service`, not merged). It also needs W4 (`loop_probes.token_budget`, `runs.tokens`), because the approved page has a "budget used" row: this is an extra need that the task graph does not list. It relies on names that can change: `GoalRepository.listRows(repo, manifest)`, `GoalRunRecord` (`rowId`, `pass`, `value`, `of`, `line`, `sha`, `at`), `GoalService`, and `repo_gate.githubRepo` as the key `repo` of `goal_runs`. Read the merged code before you build.

## T6 - Goal number, rows on the loop page

**Files:** server: `server/ports/goal-repository.ts` (`listManifests(repo)`, `listGoals(repo)`), both adapters, `goal-service.ts` (`view`), `contracts.ts`, `shared/contracts/goals.ts`, `server/http/goal-routes.ts`, `app.ts`, `compose.ts`, `docs/API.md`, `tests/api/goal-view-api.test.ts`, `tests/contract/repositories.contract.ts`. Web: `web/api/{loops-api,http-loops-api,fake-loops-api}.ts`, `web/data/goals.ts`, `web/features/goals/GoalsView.tsx`, `web/pages/GoalsRoute.tsx`, `web/app/AppRoutes.tsx`, `web/features/loop-detail/Figures.tsx`, `shared/i18n/{en,vi}.ts`. Tests: `tests/visual/ds/goals.visual.ts`, `tests/support/goal-loop-goals-world.ts`, `tests/e2e/goal-number.spec.ts`. Design: `design/ds/preview/data.js`, 4 shots of `goal-rows`, `design/APPROVED.md`. Also the evidence log `## T6`.

**Steps:**
1. Read `design/ds/SYSTEM.md`, `tokens.css`, `components.css`, `STATES.md`, and the functions of `preview/preview.js` and the data of `preview/data.js` named here. Use existing classes only: `.stats`, `.stat`, `.group`, `.cell`, `.run-top`, `.pill`, `.cell-sum`, `.page-desc`. No new class, token, colour or native `title`. If more is needed, stop and open a `design-system` issue.
2. `GET /api/loops/:id/goals?manifest=<path>` answers `{ manifest, checkedAt, sha, passed, total, opened, rows, standing, loops }`. The loop gives its repo, and `repo_gate.githubRepo` gives the key `repo`. No gate row or no stored row gives `manifest: null` and empty lists. The default manifest is the one with the newest `at` (`listManifests`).
   - `rows`: read `<manifest>` with `workspace.readAt(repoPath, 'origin/main', path)`. Do not fetch inside a GET. Each manifest goal gives `{ id, outcome, pass, line }`, in file order. `pass` and `line` come from `goal_runs`, and `line` loses its leading `<id> `. A goal with no stored row has `pass: false` and `line: ''`. `total` is the number of goals, `passed` the number with `pass`. `opened` is the `opened` object of the file, or `null`.
   - `checkedAt` is the newest `at`. `sha` is its `sha` cut to 7 characters.
   - `standing`: from `listGoals(repo)` and the raw JSON of `goals/health.json` (`rows[].id`, `rows[].run`): `{ id, command, pass, openSince, lastFailedAt, issue }`. `openSince` is `openedAt` of the open issue, `lastFailedAt` the newest `lastFailedAt`, `issue` the open issue number. All three are `null` when there is none.
   - `loops`: the loops of this repo whose probe state is `budget_limited` or `probe_failed`: `{ id, name, state, used, budget, text }`. `used` is the sum of `runs.tokens` of the loop. `text` is `lastLine` for `probe_failed`.
3. Page `/loops/:id/goals` (tab Loops, narrow, back to the loop, page description = the manifest path). The loop page `Figures.tsx` gains the link: `fig-goals` becomes `<a class="stat" href="/loops/:id/goals">`. The figure reads `passed/total` of this API when `manifest` is not null, else the `goals` of the probe line (P15). A loop with no repo gate does not change. The existing `loop.visual.ts` pairs must keep their ratios: if a link changes one pixel, stop and open a `design-system` issue.
4. Words: new keys `goalLoop.goals.lastFailed` (`Last failed {t}`), `goalLoop.goals.failingSince` (`Failing since {t}`), `goalLoop.goals.budget` (`{used} of {budget} tokens`), `goalLoop.goals.probeStopped` (`The probe stopped: {text}`). The numbers use the language's number format.
5. Sample text that the data model cannot give: the preview writes `1 200 000 of 1 200 000 tokens` and `The probe ended with exit code 1 at 13:30`. Change them in `data.js` to what the app prints (`1,200,000 of 1,200,000 tokens`, `The probe stopped: exit 1`). Re-shoot `goal-rows` and `phone-goal-rows` (4 PNG): `npm run design:shots -- --design design/ds --only goal-rows,phone-goal-rows`. Record the correction in `design/APPROVED.md`.
6. Seed `seedGoalRows(sp, db)` in `tests/support/goal-loop-goals-world.ts` (Z2 imports it; it returns `{ path }`). It resets, sets the clock to `PREVIEW_NOW`, runs `seedPreviewWorld`, creates a git repo in the folder of repo `api` with `goals/2026-10-16-billing.json` (8 goals and `opened` of `goalLoop.goals`) and `goals/health.json` (rows H1, H2), commits it, and makes `origin/main` point to it. It sets `repo_gate` (`github_repo` `acme/api`), inserts 8 `goal_runs` (3 pass, `sha` 4be21c7, newest `at` 13:59), the `standing_goals` and `standing_issues` of `goalLoop.goals.standing`, and two `loop_probes` rows (`budget_limited` with `token_budget` and `runs.tokens` 1200000, and `probe_failed` with `last_line` `exit 1`).
7. `goals.visual.ts`: 2 tests (`goal-rows`, `phone-goal-rows`), 4 pairs. Regions: desktop `[regions.page()]`, phone `[regions.navbar(), regions.page()]`. `test.afterAll(() => writeReport('goals'))`.
8. `goal-number.spec.ts` (G11), 2 tests, on a server launched with `createFakeGh(bare).env`, `bare` from `createBareRepo()` with `goals/gate.json`, a manifest of 8 goals (`epic` 7, each `run` is `node tests/row.mjs <id>`; the script passes for the ids in `tests/pass.txt`) and 2 ids in `pass.txt`. The test sets `repo_gate` with SQL, inserts 2 passing `goal_runs`, and opens the loop page: `fig-goals` shows `2/8`. A pull request that adds a third id and queues through `POST /api/gate/jobs` merges in the fake world, then `expect.poll` (limit 120 s) shows `3/8`. The control merges a pull request that fixes no goal: `fig-goals` stays `2/8`.
9. Run `npm run design:compare` once. The PR body has `Acceptance: "pairs": <n>, "worstRatio": <r>`.

**Goal:** G11. The owner sees progress as a number that moves at each merge, and the goals page matches `goal-rows` (desktop, phone, light, dark).

**Red:** after the tests exist, `npm run build`, then `npx playwright test --project visual tests/visual/ds/goals.visual.ts --reporter list` prints `2 failed`. `npx playwright test tests/e2e/goal-number.spec.ts --project chromium --reporter list` prints `2 failed`. `npx vitest run --project api tests/api/goal-view-api.test.ts` prints `Tests  7 failed (7)`: no gate row; rows join the file and `goal_runs` (outcome text, `line` without id); a goal with no row fails; `opened` from the file; standing rows with the issue; only `budget_limited` and `probe_failed` loops; `manifest` query and the newest default.

**Green:** the visual command prints `2 passed`. `node -e "const r=require('./reports/compare/ds/results/goals.json');console.log(r.length,Math.max(...r.flatMap(s=>s.regions.map(x=>x.ratio)))<=0.001)"` prints `4 true`. `goal-number.spec.ts` prints `2 passed`. goal-view-api prints `Tests  7 passed (7)`. `npx vitest run --project contract -t goal_runs` and `-t "standing goals"` exit 0 with 1 more test each per side (`listManifests`, `listGoals`). `npx playwright test --project visual tests/visual/ds/loop.visual.ts` exits 0. `npm run ratchets` prints `ratchets: ok`. `npm run design:states -- --design design/ds` prints `states with shots: 142/142`. `npm run verify` exits 0.

**Stub check:** make `GoalsView` return `null`: `2 failed` in the visual command. Make the view answer `manifest: null`: 6 of 7 api tests fail and `fig-goals` stays on the probe line, so the first e2e test fails at `2/8` after the merge. Read the rows after the next job instead of the stored rows: the move from `2/8` to `3/8` fails. Run each, restore.

**Ratchet:** pairs in `results/goals.json`, 0 to 4. Api tests +7. Contract +2 per side. `e2e expects:` line of `npm run ratchets` rises. Metric `status-questions`: decision 7, "not measured yet". All only rise.
