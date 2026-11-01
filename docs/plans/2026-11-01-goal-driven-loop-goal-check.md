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
