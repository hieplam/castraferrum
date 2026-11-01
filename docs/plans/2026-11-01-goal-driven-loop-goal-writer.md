# Plan, issue 216: a goal-writing loop writes the next goal card, and a rank shares the plan window

Spec: [../specs/2026-11-01-goal-driven-loop.md](../specs/2026-11-01-goal-driven-loop.md). Plan index: [2026-11-01-goal-driven-loop.md](2026-11-01-goal-driven-loop.md).
Epic: [castraferrum#217](https://github.com/hieplam/castraferrum/issues/217). Evidence log: `2026-11-01-goal-driven-loop-evidence.md`.
This file holds W1 to W6. W7 is a UI task. It waits for D2, and it comes in a later wave.

**Rules of this phase.** The spec holds the contracts (2.13, 2.14). These rules fill in what the contracts leave open. A section names a rule by its number. Read the rules that your section names in this file, not in the issue copy.

1. **Off by default.** The goal card service reads a repository only when both conditions are true: `repo_gate` has a row for it (the value of `enabled` does not matter, the row gives `github_repo`), and `origin/main` holds `goals/charter.json`. Otherwise the service makes no `gh` call and writes no row. The gate stays off. A loop with no probe does not change.
2. **Card life.** `GoalCardService.tick` serves each repository at most once in 60 s, on the clock of the console.
   - It calls `GateWorkspace.fetchMain(repoPath)`, then `readAt` for `goals/charter.json`, so a charter change on `main` applies at the next tick.
   - It reads the open issues with the label `goal-card` (`GitHost.issuesWithLabel`).
   - An issue with no row and a valid card gets a row in state `proposed`, and one notice: kind `goal_card`, `dedupeKey` `goal-card:<repo id>:<issue>`, `messageKey` `notice.goalCard`, `reason` the card title.
   - An issue with a bad card, or a second card while one is `proposed`, gets a comment `Goal card refused: <reason>` and is closed. So a bad card cannot stop the writer.
   - `accept` is the one-word yes, and `refuse` is the no. `refuse` closes the issue. Both work only in state `proposed`.
   - A tick moves each `accepted` row to `started` through `GoalCardStarter.start(card)`. A throw keeps the row `accepted`, and the next tick tries again. After `started` the service comments `Started.` and closes the issue.
3. **Door rule.** `effectiveDoor(card, charter)` returns `one-way` when the card says `one-way`, or when a `neverAlone` entry occurs in the title or a row outcome, compared in lower case. The row stores this value, so a model cannot lower a door. A `one-way` card has `start_after` null, and only `accept` moves it.
4. **Window rule.** `windowOn(charter)` is true only when `refusalWindow.enabled` is true and `acceptedWithNoChange` is 3 or more (the decision of issue 216). `start_after` is `now + hours`, set at the row insert. The tick moves a row from `proposed` to `accepted` only when `start_after` has passed, `windowOn` is true for the charter of this tick, and the stored door is `two-way`. At `accept` the service reads the issue body again. If the card differs from the stored card, it stores the new card and sets `changed` to true. `GET /api/goal-cards` gives `acceptedWithNoChange`: the count of accepted or started rows with `changed` false. A person copies this number to the charter in a ratified PR. No code writes the charter.
5. **The writer wakes.** `scripts/goal-writer-probe.mjs -R <o/r>` runs with the repository as `cwd` and uses no model. It prints one line of spec 2.1. Checks, first match wins:
   - `git show origin/main:goals/charter.json` fails: `blocked`, `reason` `no goals/charter.json on origin/main`, `issues` `["goals/charter.json"]`.
   - An open issue has a body line that matches `^Goal manifest: goals/[\w.-]+\.json\s*$`: `skip`, because a goal runs. The script reads bodies with `gh issue list -R <o/r> --state open --limit 200 --json number,body`, and it tests the line itself, so a body that only quotes the text in backticks does not count.
   - An open issue has the label `goal-card`: `skip`, because a card waits.
   - The stamp file is younger than `--gap-hours` (default 6): `skip`. The stamp is `castraferrum-goal-writer.json` at the path that `git rev-parse --git-path` gives. It holds `{"at":"<ISO>"}`. It stops a run that writes no card, or a refused card, from starting a new run each 60 s.
   - Else: write the stamp, and print `{"v":1,"action":"plan","tasks":[],"reason":"","resource":null,"until":null,"plan":{"key":"goal-writer","failing":[]},"issues":[],"goals":null}`.

   `plan` is correct here: it takes no label, and "none if this key is live" gives one writing run per loop. `LOOPS_GH_BIN` replaces `gh`, and a path that ends in `.mjs` runs with Node, as in `GhGitHost`. `GOAL_WRITER_NOW` replaces the clock in tests. A failed `gh` call prints `goal-writer-probe: gh failed: <text>` to stderr, prints no line, and exits 1. So the console records `probe_failed`, never a false `plan`. The issue text says that the probe also reads the window. The spec wins: 2.14 keeps the window rule in the console, so the script does not read it. The owner gives the writer loop a large rank number.
6. **Rank and window.** The rank check runs in `ProbeService` before the probe call. So a refused loop spends no process and does not use up the stamp of rule 5. A higher-rank loop is an active, not archived loop with a smaller `rank` whose `last_line` parses to `take` or `plan`, in any repository, because a rank is per account. `PlanWindow.read()` is called only when such a loop exists, so with every rank at 100 the console never reads the window. `ClaudePlanWindow` uses the call of S4: `query()` with an input stream that sends no message, then `usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true })`. Options: `tools: []`, `persistSession: false`, `cwd` a temporary folder. It then aborts through `abortController`. Value: `utilization` is the larger of `five_hour.utilization` and `seven_day.utilization`, so a full week also refuses. `resetsAt` is `five_hour.resets_at`, an ISO string. `rate_limits` null, a missing `five_hour`, a bad date or a throw gives `{ utilization: null, resetsAt: null }`. The adapter keeps a value for 60 s. It never reads `rate_limit_event`, because S4 run 2 carried no `utilization` there.
7. **Card becomes goal.** `DefaultGoalCardStarter.start` runs three steps. Each step stores its result on the row, and a step with a stored result is skipped, so a retry never makes a second epic.
   - Epic: `openIssue` with title `Epic: <card title>`, no labels. The body starts with `Goal manifest: goals/<date>-card-<issue>.json`, then one line for each row, then the loop prompt of `plan.md` section 6. `<date>` is the UTC date of the clock. Store `epic_number`.
   - Manifest PR: `workspace.publishFile` commits the manifest on branch `goal/card-<issue>`, from `origin/main`, and pushes it. `host.createPullRequest` opens the PR to `main`. Store `pr_number`. If `repo_gate.enabled` is true, call `GateService.queue` with `taskKey` the card issue. `goals/**` is guarded, so that job ends at `needs_ratification`. With the gate off the PR waits for a person. In both cases the T3 rule makes the epic `blocked` until the file is on `main`, so no build task starts.
   - Loop: `LoopService.create` with name `Goal <issue>: <title>` cut at 80 characters, `prompt` the loop prompt, `cron` `0 0 1 1 *`, `timeoutSec` 14400, `executor` `{ kind: 'claude' }`. `ProbeService.save` with `command` `[node, <epic script>, next, <epic>, --probe, -R, <o/r>]`, `claim` `[node, <epic script>, claim, {key}, --epic, <epic>, --parallel, -R, <o/r>]`, `release` `[node, <epic script>, release, {key}, --reason, {reason}, --if-claimed, -R, <o/r>]`. `LoopService.start`. Store `loop_id`.

   `<epic script>` is the new config value `LOOPS_EPIC_SCRIPT`, default `<home>/.claude/skills/epic-loop/scripts/epic.mjs`.
8. **Card to manifest.** `{"setup":[],"opened":{"at":"<ISO>","passed":0,"total":n},"epic":<epic>,"goals":[...]}`. Each row becomes `{"id","outcome","checks":[{"run":<oracle>,"expect":[<threshold>]}]}`. So in a card, `oracle` is a command, and `threshold` is a literal text of its output. W3 tells the writer this.
9. **W1 data.** `goals/charter.json`: `refusalWindow` `{"enabled":false,"hours":8}`, `acceptedWithNoChange` 0, `neverAlone`: `history rewrite`, `force push`, `deleting user data`, `branch deletion`, `creating tokens`, `spending money`, `a public release`, `deleting a feature`. Table `goal_cards`: `id`, `repo_id`, `github_repo`, `issue_number`, `title`, `door`, `card`, `state`, `start_after`, `changed`, `epic_number`, `pr_number`, `loop_id`, `created_at`, `decided_at`, with a partial unique index on `repo_id` for `proposed`. W5 fills the last three result columns.
10. **W1 tests.** Each list item is one test.
    - Unit, 12: the real charter parses; window off at count 2; on at count 3; card parses; 0 blocks; 2 blocks; bad JSON; no rows; a title forces `one-way`; an outcome forces `one-way`; a clean `two-way` stays; `one-way` stays.
    - Api, 17, `describe('goal_cards')`: ingest gives 1 row and 1 notice, and a second tick gives no more; window on, refused stays `refused` past the window and the issue is closed; control, not refused, `started`; one second before stays `proposed`; window off on `main` after insert stays `proposed`; window off by default, 30 days, stays `proposed`; `accept` starts it; one-way, window on, stays `proposed`; one `accept` starts it; two-way with `force push` is stored `one-way`; count 2 keeps the window off; bad card closed, 0 rows; second card closed, 1 row; no `repo_gate` row, 0 `gh` calls; no charter, 0 rows; edited card sets `changed`; 404 and 409.
11. **W3 commands.** `E card <file>` validates spec 2.13. It refuses (exit 1, no write) on a bad field or an open `goal-card` issue. Else it makes the label and opens the issue `Goal card: <title>` with one fenced `json` block, and prints `{"card":<n>}`. `E tidy <n> --command "<cmd>"` runs the command, and closes `<n>` with a `loop-tidy:` comment only if it exits 0. `E tidy <n> --rewrite <file> --reason "<why>"` edits the body, removes `loop:needs-human`, and comments. The ap `fake-gh.mjs` gains `issue list`. `references/goal-writer.md` says: read open epics, ideas, `docs/VISION.md` and failing standing goals; write one card, then end; give each `neverAlone` entry the door `one-way`; use rule 8 for `oracle` and `threshold`; clean the queue with `tidy`; never remove a gate that needs credentials, hardware or money. `SKILL.md` gains one row in the job table, for the prompt `Run the goal writer on <o/r>, using the epic-loop skill. If that skill is not available, change nothing and reply SKILL MISSING.` Tests, 20: `card:` x8, `tidy:` x6, `check-card` x6. The last asserts that evals 8 to 10 exist and that their prompts match no `/\b(app|docker|server|localhost)\b/i`. Evals: 8 expects `two-way`; 9 has one idea that deletes a feature, and expects `one-way`; 10 expects that `tidy` closes one proven issue.
12. **W4 tests.** `rank.test.ts`, 15, `describe('rank')`. Pure: no higher loop live, no window read; higher `take` with a null window refuses; higher `plan` refuses; 44 min and 89 starts; exactly 45 min refuses; 90 refuses; `resetsAt` null refuses; higher `skip` starts; equal rank starts. Service: the older low-rank loop waits and the high rank starts; the refused loop gets 0 probe calls; a stopped higher loop does not count; a reached budget gives `budget_limited`, 0 calls, 0 runs; a null budget never limits; all at rank 100 gives 0 window reads and the same runs. `claude-plan-window.test.ts`, 7: the larger window; `resets_at` parsed; `rate_limits` null; a throw; 0 user messages sent; a second read in 60 s calls nothing; the stream is aborted. Also executor +2, api +2, contract +2 per side.
13. **W5 tests.** `tests/api/goal-card-start.test.ts`, 10, on `composeServer` with the fake `gh`, a bare repository whose `main` holds `goals/gate.json`, and `epicScript` set to `tests/support/fake-probe.mjs`: an accepted card gives 1 epic with the line, 1 branch with the manifest, 1 PR, 1 active loop with the 3 argv, card `started`, issue closed; the body matches the T3 pattern `^Goal manifest: (goals\/[\w.-]+\.json)\s*$`; `opened.passed` is 0 and `total` is n; real `node scripts/goal-check.mjs <file> --json` on a failing row prints `"passed":0`; a failed PR call, then a retry, gives 1 epic; a failed loop save, then a retry, gives 1 PR; gate off gives 0 jobs and an open PR; gate on gives a job at `needs_ratification`, not merged; a refused card gives 0 `issue create` calls after the card; two cards with one title get different branches.
14. **W6 flow.** No real model, no real GitHub, no real wait.
    - The spec starts its own server, `ServerProcess.launch({ env: createFakeGh(bare).env })`, because the shared e2e server has no fake `gh`. `ServerProcess` uses its own `_live_test` database.
    - The repository is a clone of `createBareRepo` in a folder named `lc-fake-claude-card-*`, so `testModeQuery` runs the fake session: no process, no cost. `origin/main` holds `goals/charter.json`. `POST /api/__test/repo-gate` writes the `repo_gate` row.
    - In `test-mode-query.ts`, a prompt with `[goal-card]` reads `card.md` in `cwd` and runs the `LOOPS_GH_BIN` script: `issue create --title <title> --label goal-card --body-file card.md`. Test mode only, 2 tests.
    - The loop prompt is `[goal-card] Run the goal writer on fake/repo, using the epic-loop skill.` Its probe `command` is the real `scripts/goal-writer-probe.mjs`, so W2 is under test. `POST /api/__test/clock` with `advanceMs` 61000 makes a probe due. Each wait is `expect.poll` with a 15 s limit.
    - Tests, 3, through the API because W7 has no page yet. `UC-NN: when a goal ends, the next goal card appears with no owner message`: seed an open epic with the manifest line, start, wind: 0 runs. Close it in the fake world, wind: 1 run, `GET /api/goal-cards` shows 1 `proposed` card, `GET /api/notices` holds kind `goal_card`. Control `a goal that stays open gives no card`: wind two times, 0 runs, 0 cards. Control `no charter gives no card`: state `blocked`, 0 runs, 0 cards.

## W1 - Charter, card, GoalCardService

**Needs** K11, T5 merged.

**Files:** `goals/charter.json`; `shared/domain/{goal-card.ts,goal-card.test.ts,errors.ts}`; `shared/contracts/{goal-cards,common}.ts`; `server/ports/{goal-card-repository,repositories,git-host,gate-workspace}.ts`; `gh-git-host.ts`, `git-gate-workspace.ts`, tests; `schema.ts`, `db.ts`, migration, pg and memory adapters; `server/services/{goal-card-service,contracts}.ts`; `server/http/{goal-card-routes,app,errors,test-routes}.ts`; `compose.ts`; `tests/contract/repositories.contract.ts`; `tests/api/goal-cards.test.ts`; `docs/API.md`.

**Steps** (spec 2.13, rules 1 to 4, 9, 10):
1. Add the charter and the table of rule 9. Run `npm run db:generate`. The PR names the guarded path.
2. `goal-card.ts`: `parseCharter`, `parseGoalCard(body)` (exactly one fenced `json` block), `effectiveDoor`, `windowOn`.
3. `GET /api/goal-cards?repoId=`, `POST /api/goal-cards/:id/accept`, `.../refuse`. Errors `GOAL_CARD_NOT_FOUND` (404), `GOAL_CARD_NOT_OPEN` (409).
4. `compose.ts`: one service line, one `background` entry, a starter that does nothing (W5 replaces it). Test route `POST /api/__test/repo-gate`.
5. Write the tests of rule 10. Contract 3 per side, `describe('goal_cards')`.

**Goal:** G19, G20. A refused goal never starts, a one-way goal needs one yes, and by default every goal needs one yes.

**Red:** both test files import `shared/domain/goal-card`. `npx vitest run --project unit shared/domain/goal-card.test.ts` and `npx vitest run --project api tests/api/goal-cards.test.ts` each print `Test Files  1 failed (1)`.

**Green:** the same commands print `Tests  12 passed (12)` and `Tests  17 passed (17)`. `npx vitest run --project contract -t goal_cards` prints `6 passed`. `npm run verify` exits 0.

**Stub check:** a plain timer with no refusal check fails the refused test. No door check fails the one-way tests. `start_after` with the window off fails the default test.

**Ratchet:** unit at least +12, api +17, contract +3 per side. `refused-started`, `one-way-started`: 0.

## W2 - goal-writer-probe.mjs

**Files:** `scripts/goal-writer-probe.mjs`; `tests/tools/goal-writer-probe.test.ts`.

**Steps** (rule 5):
1. Write the script with no imports from `server/` or `shared/`, because it also runs in other repositories.
2. With no `-R` it prints `goal-writer-probe: -R <owner/name> is required` and exits 2.
3. Tests, 11, spawn the real script with `spawnSync`, `cwd` a clone of `createBareRepo`, and the `createFakeGh` env: no charter gives `blocked` with `issues`; an open issue with the line gives `skip`; a body that quotes the line in backticks gives `plan`; an open `goal-card` gives `skip`; nothing open gives the exact line of rule 5; a closed epic gives `plan`; a second call in the gap gives `skip`; a call after 7 h (`GOAL_WRITER_NOW`) gives `plan`; a broken `LOOPS_GH_BIN` exits 1, stdout empty, stderr holds `goal-writer-probe: gh failed`; no `-R` exits 2; each printed line passes the real `parseProbeLine`.
4. Light verify applies: nothing in `server/` or `web/` imports the script. Paste the `grep`.

**Goal:** G18. When a goal ends, the probe asks for one writing run, with no model and no owner message.

**Red:** `npx vitest run --project unit tests/tools/goal-writer-probe.test.ts` prints `Tests  11 failed (11)`, because the script does not exist.

**Green:** the same command prints `Tests  11 passed (11)`. `node scripts/goal-writer-probe.mjs` prints the line of step 2 and exits 2.

**Stub check:** a script that always prints `plan` fails each `skip` test. One that always prints `skip` fails the exact-line test. No stamp fails the gap test. A failed `gh` call read as "nothing open" fails the exit 1 test. Run all.

**Ratchet:** unit tests, B to B + 11, up only. `idle-days`: decision 7.

## W3 - Skill: goal writer, queue clean-up

**Repo:** agent-plugins (opus), issue in cf. Never pull or move the clone `../agent-plugins`: the coordinator runs a script through a junction to it. Use your own worktree: `git -C ../agent-plugins fetch origin`, then `git -C ../agent-plugins worktree add ../agent-plugins-goal-writer -b epic-loop/goal-writer origin/master`. PR to `hieplam/agent-plugins`, body `Closes hieplam/castraferrum#<n>`. `SK` is `plugins/epic-loop/skills/epic-loop`.

**Files:** under `SK`: new `references/goal-writer.md`, `evals/check-card.mjs`, `evals/fixtures/goal-writer.json`, `scripts/tests/check-card.test.mjs`; `SKILL.md`, `scripts/epic.mjs`, `scripts/tests/{epic.test.mjs,fake-gh.mjs}`, `evals/evals.json`. Do not touch `tick.md` or `drive.md`.

**Steps:** build rule 11. **Issue 311:** eval sessions have no sandbox, and a prompt that named an app made models run `find /` and start Docker. So an eval prompt names no app and never sends a model to look for one. Each prompt ends: `Use only the files in the current folder. Do not search the disk. Do not start a service or a container.`

**Goal:** G18. A writing run writes one valid card and cleans the queue only on proof.

**Red:** N is `# tests` before. In `SK`, `node --test scripts/tests/epic.test.mjs scripts/tests/check-card.test.mjs` prints `# tests N+20`, `# pass N`, `# fail 20`.

**Green:** the same command prints `# pass N+20`, `# fail 0`. Eval, in slot-1, from the worktree root: `python3 scripts/evals/run_evals.py --evals SK/evals/evals.json --eval-id 8,9,10 --mode with_skill --exec-model haiku --grader-model haiku --runs 5 --jobs 1 --out-dir <dir>`. Then `eval_gate.py check --baseline <dir>/benchmark.json --candidate <dir>/benchmark.json` prints `eval 8 X/5`, `eval 9 X/5`, `eval 10 X/5`, each X at least 4. `eval_gate.py verify-result --skill-dir SK` prints `verify-result: ok`.

**Stub check:** `goal-writer.md` emptied: eval 8 gives X under 4. A `tidy` that ignores the exit code fails a `tidy:` test.

**Ratchet:** tests N to N+20, evals 7 to 10, up only.

## W4 - PlanWindow, rank, budget

**Needs** W1 merged. Use the usage call of S4, not `rate_limit_event`.

**Files:** `server/ports/{plan-window,run-repository,loop-probe-repository,executor}.ts`; `claude-plan-window.ts`, `claude-agent-executor.ts`, tests; `server/services/{rank.ts,rank.test.ts,probe-service.ts,run-service.ts}`; adapters, `schema.ts`, migration; `shared/domain/goal-loop.ts`, `shared/contracts/goal-loop.ts`; `compose.ts`; `tests/support/service-kit.ts`; `tests/api/probe-settings-api.test.ts`; `repositories.contract.ts`; `docs/API.md`.

**Steps** (spec 2.14, rules 6, 12):
1. Migration `rank`: `loop_probes.rank` (integer, default 100), `loop_probes.token_budget` (bigint, null), `runs.tokens` (bigint, null). `probeInputBody`, `probeDto` gain `rank`, `tokenBudget`.
2. `rank.ts`: `mayStart({ higherLive, window, now }): boolean`, `higherRankLive(self, probes, loops): boolean`. Exactly 45 min and exactly 90 refuse.
3. The `result` event gains `tokens?`: `input_tokens + output_tokens` of the SDK `usage`. A resume replaces the stored value, as decision 28 does for cost.
4. `#probeLoop`, before the probe call: budget, then rank. `sumTokens(loopId)` at or over `token_budget` records `budget_limited` and keeps `lastLine`. A refused rank records nothing.

**Goal:** G21. A lower rank cannot take the window from a higher rank. With default ranks nothing changes.

**Red:** `npx vitest run --project unit server/services/rank.test.ts` prints `Test Files  1 failed (1)`, because `./rank` does not exist.

**Green:** `npx vitest run --project unit server/services/rank.test.ts --reporter verbose` prints `Tests  15 passed (15)`. `npx vitest run --project unit server/adapters/executors/claude/claude-plan-window.test.ts` prints `Tests  7 passed (7)`. `npm run verify` exits 0.

**Stub check:** `mayStart` that returns true fails each refusal test. `<= 45` in place of `< 45` fails the exactly 45 min test. Rank after the probe call fails the 0-calls test. A window read with no higher loop fails the rank 100 test.

**Ratchet:** unit +24, api +2, contract +2 per side. `rank-stops`: not measured.

## W5 - Card becomes manifest and loop

**Needs** W1 and T3 merged. T3 is in agent-plugins, so a test keeps a copy of its pattern.

**Files:** `server/services/{goal-card-starter,contracts}.ts`; `server/ports/{git-host,gate-workspace}.ts`; `gh-git-host.ts`, `git-gate-workspace.ts`, tests; `shared/domain/goal-card.ts`, test; `server/config.ts`, test; `server/main.ts`, `compose.ts`; `tests/api/goal-card-start.test.ts`; `docs/ARCHITECTURE.md`.

**Steps** (rules 7, 8, 13):
1. `goal-card.ts`: `manifestOfCard(card, { epic, at }): string`, `epicBodyOfCard`.
2. `GitHost.createPullRequest(repo, { head, base, title, body }): Promise<{ number; url }>`. `GateWorkspace.publishFile(repoPath, { branch, path, text, message }): Promise<void>`, in a temporary worktree of `origin/main`, with `core.hooksPath` as in decision 32.
3. Config `epicScript` from `LOOPS_EPIC_SCRIPT`, and `ComposeOptions.epicScript`.
4. `DefaultGoalCardStarter`: rule 7. Compose replaces the starter of W1.

**Goal:** G18. An accepted card becomes one epic, one manifest PR and one loop. Nothing merges by itself, and a retry never doubles them.

**Red:** the test imports `server/services/goal-card-starter`. `npx vitest run --project api tests/api/goal-card-start.test.ts` prints `Test Files  1 failed (1)`.

**Green:** the same command prints `Tests  10 passed (10)`. `npx vitest run --project api tests/api/goal-cards.test.ts` prints `Tests  17 passed (17)`. `npm run verify` exits 0.

**Stub check:** a starter that does nothing fails the first test. No stored results fail both retry tests. A direct push to `main` fails the gate tests. `opened.passed` set to `total` fails its test.

**Ratchet:** api +10, unit at least +3. `idle-days`: decision 7.

## W6 - End-to-end: next card appears

**Needs** W2, W3 and W5 merged.

**Files:** `tests/e2e/goal-card.spec.ts`; `server/adapters/executors/claude/test-mode-query.ts`, test; `docs/USE-CASES.md`; `package.json` (`uc-coverage --min` + 1).

**Steps:** build rule 14. It stays deterministic with no real model: the fake session of `testModeQuery`, the fake `gh`, a bare repository and the wound clock. `UC-NN` is the next free number after your rebase. Add its row.

**Goal:** G18. When a goal ends, the next goal card appears with no owner message.

**Red:** `npx playwright test tests/e2e/goal-card.spec.ts --project chromium --reporter list` prints `1 failed`, because the fake session has no `[goal-card]` path, so no card appears. The 2 controls pass.

**Green:** the same command prints `3 passed`. `npx vitest run --project unit server/adapters/executors/claude/test-mode-query.test.ts` exits 0. `npm run verify` exits 0, and `uc-coverage` shows one more UC.

**Stub check:** a probe that always prints `skip`: the first test fails at 1 run. No ingest: it fails at 1 card. A probe that always prints `plan`: the first control fails.

**Ratchet:** UC count +1, `e2eExpectsMin` up only. `idle-days`: decision 7, "not measured yet".

Wave 6 adds W7. It needs D2 (done on 2026-11-01) and W4 (`rank`, `token_budget`; plan only). It also needs W1 (the goal card routes; merged as a plan only) and P15 (the group "Probe" of the loop editor, where the rank fields go). Those two are extra needs that the task graph does not list. W7 relies on names that can change: from W1 the routes `GET /api/goal-cards?repoId=`, `POST /api/goal-cards/:id/accept` and `/refuse`, the field `acceptedWithNoChange` and the row fields of rule 9 (`state`, `door`, `card`, `startAfter`, `decidedAt`); from W4 the fields `rank` and `tokenBudget` of `probeInputBody` and `probeDto`; from P15 the files `ProbeFields.tsx` and `probe-form.ts`. Read the merged code before you build. If a name differs, follow the merged code and say so in the PR.

## W7 - Goal cards page, rank fields

**Files:** web: `web/api/{loops-api,http-loops-api,fake-loops-api}.ts`, `web/data/goal-cards.ts`, `web/features/goal-cards/{GoalCardView,CardHistory}.tsx`, `web/pages/GoalCardsRoute.tsx`, `web/app/AppRoutes.tsx`, `web/features/repos/RepoMenu.tsx`, `web/features/loop-form/{ProbeFields.tsx,probe-form.ts,probe-form.test.ts}`, `shared/i18n/{en,vi}.ts`. Tests: `tests/visual/ds/goal-cards.visual.ts`, `tests/support/goal-loop-cards-world.ts`, `tests/e2e/goal-cards-page.spec.ts`. No server change. Also the evidence log `## W7`.

**Steps:**
1. Read `design/ds/SYSTEM.md`, `tokens.css`, `components.css`, `STATES.md`, and the functions of `preview/preview.js` and the data of `preview/data.js` named here. Use existing classes only: `.card`, `.now`, `.pill`, `.data`, `.btn.primary`, `.btn.danger`, `.group`, `.cell`, `.run-top`, `.note`, `.page-meta`, `.field`, `.input`, `.hint`. No new class, token, colour or native `title`. If more is needed, stop and open a `design-system` issue.
2. Page `/repos/:id/goal-cards` (tab Repos, narrow). The back link leads to Repos and shows the repo name, as the preview draws it. Entry: an item "Goal cards" (`repo-goal-cards`) in `RepoMenu`; the closed menu and the repo cell do not change, so `repos.visual.ts` stays as it is.
3. The page shows the row in state `proposed` of the repo: the title; the pill `card-status`; the door pill `card-door` (the stored door); the size `goalLoop.cards.size` with `card.size.planWindows`; the sentence (two-way with `startAfter`: `goalLoop.cards.twoWayText` with the time `H:mm`; two-way with `startAfter` null: the new key `goalLoop.cards.twoWayOff`, "This goal can be undone. It waits for your Accept."; one-way: `goalLoop.cards.oneWayText`); Accept (`card-accept`) and Refuse (`card-refuse`); the rows of `card.rows` (`id`, `oracle` as the meta, `outcome`, `threshold`); the line `goalLoop.cards.next` (new key, `Then: {text}`) with `card.next[0]`; the history. The history lists the other rows (`started`, `accepted`, `refused`), newest `decidedAt` first, at most 5, each with its pill and the date `dd/mm`. With no proposed row the page shows only the history and the note `goalLoop.cards.none` (new key, "No goal card is waiting.").
4. Accept and Refuse call the W1 routes, then refresh the page. A 409 shows a toast with the text of its code.
5. Rank fields in the group "Probe" of P15: input `probe-rank` (integer from 0, empty = omit, the server default is 100, hint `goalLoop.editor.rankHint`: "A smaller number runs first.") and input `probe-token-budget` (integer from 1, empty = `null` = no limit). `probe-form.ts` maps them in `toProbeBody`. A text that is not a number gives an error key under the field.
6. Seed `seedCard(sp, db, door)` in `tests/support/goal-loop-cards-world.ts` (Z2 imports it; it returns `{ path }`). It resets, sets the clock to `PREVIEW_NOW`, runs `seedPreviewWorld`, and inserts in `goal_cards` for repo `api`: the `proposed` row (`card` JSON of `goalLoop.cards.twoWay` or `oneWay`: `{"v":1,"title","rows","size":{"planWindows":0.5},"door","next":["the same report for each customer"]}`; for `two-way`, `start_after` 2026-10-18 22:14 +07; for `one-way`, `start_after` null; the one-way card has `planWindows` 1.5) and the 3 rows of `goalLoop.cards.history` (`started` 16/10, `accepted` 15/10, `refused` 12/10 as `decided_at`).
7. `goal-cards.visual.ts`: 4 tests (`card-two-way`, `card-one-way`, `phone-card-two-way`, `phone-card-one-way`), 8 pairs. Regions: desktop `[regions.page()]`, phone `[regions.navbar(), regions.page()]`. `test.afterAll(() => writeReport('goal-cards'))`.
8. `goal-cards-page.spec.ts`, 5 tests: Accept leaves no `card-status` and the history shows a row `accepted` or `started`; Refuse shows a row `refused`; the one-way card shows the one-way sentence and no time; the two-way card with a null `start_after` shows `twoWayOff`; the rank 5 and the budget 1000 save in the editor of a stopped probe loop and survive a reload.
9. Unit `probe-form.test.ts` gains 4 tests: rank text to number; empty rank omitted; empty budget gives `null`; a non-number gives an error key.
10. Run `npm run design:compare` once. The PR body has `Acceptance: "pairs": <n>, "worstRatio": <r>`.

**Goal:** G19 and G20. The owner sees the waiting goal card with its door, can Accept or Refuse it, and can set the rank and token budget of a loop. The page matches `card-two-way` and `card-one-way` (desktop, phone, light, dark).

**Red:** after the tests exist, `npm run build`, then `npx playwright test --project visual tests/visual/ds/goal-cards.visual.ts --reporter list` prints `4 failed`. `npx playwright test tests/e2e/goal-cards-page.spec.ts --project chromium --reporter list` prints `5 failed`. `npx vitest run --project unit web/features/loop-form/probe-form.test.ts` prints `Tests  4 failed | 6 passed (10)`: the 4 new tests fail, the 6 tests of P15 pass.

**Green:** the visual command prints `4 passed`. `node -e "const r=require('./reports/compare/ds/results/goal-cards.json');console.log(r.length,Math.max(...r.flatMap(s=>s.regions.map(x=>x.ratio)))<=0.001)"` prints `8 true`. goal-cards-page prints `5 passed`. probe-form prints `Tests  10 passed (10)`. `npx vitest run --project api tests/api/goal-cards.test.ts` still prints `Tests  17 passed (17)`. `npx playwright test --project visual tests/visual/ds/repos.visual.ts` exits 0. `npm run ratchets` prints `ratchets: ok`. `npm run verify` exits 0.

**Stub check:** make `GoalCardView` return `null`: `4 failed` in the visual command. Make Accept send no request: the first e2e test fails. Show the one-way card with a start time: the third e2e test and the `card-one-way` pairs fail. Drop `rank` from `toProbeBody`: the fifth e2e test and the rank unit test fail. Run each, restore.

**Ratchet:** pairs in `results/goal-cards.json`, 0 to 8. Unit +4. `e2e expects:` line of `npm run ratchets` rises. Targets `refused-started` and `one-way-started` stay 0 (G19, G20). All only rise or stay.
