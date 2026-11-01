# Spec: the console runs a goal to done with no owner stop

- Epic: [castraferrum#217](https://github.com/hieplam/castraferrum/issues/217). Plan: [index](../plans/2026-11-01-goal-driven-loop.md). Phases: issues 212 (probe), 213 (gate), 214 (goal check), 215 (process review), 216 (goal writer).
- **Run**: one Claude Code session. **Probe**: a loop's command, no model, prints one JSON line. **Claim**: label `loop:in-progress` plus a `loop-attempt:` comment. **Gate**: the console service, no model, that alone merges. **Hold**: a stop on a resource. **Lane**: one `max_concurrent` slot. **`E`**: `epic.mjs`. **cf**: castraferrum. **ap**: agent-plugins.

## 1. Goal table

An oracle is a behaviour run, or a measurement if it starts with `M:`. Rows G23 to G29 are added (decision 1). D7 is decision 7 of the epic: the tool measures only the baseline, and the done claim prints "not measured yet". A metric is `node scripts/metrics/baseline.mjs --metric <name>`. A `.test.ts` with no folder is in `tests/api/`, and a `.spec.ts` is in `tests/e2e/`. An agent can run each oracle here, with these limits: G3 proves resume only, because no agent can force a limit. G5 restarts a process, not the machine. G8, G14, G25, G27 use haiku. G11, G28 wait for D2. G12, G22: the tool only.

| Id | Outcome | Oracle | Stub check | Ratchet, metric |
|---|---|---|---|---|
| G1 | A loop with no ready task starts no model session | `probe-idle.spec.ts`: fake probe prints `wait`, `skip`, `done` on a wound clock: 0 runs, 3 probe calls. Control `take`: 1 run | Ignoring it starts runs. Never probing fails the count | 108 of 227 to 0, D7, read-only |
| G2 | The next task starts seconds after a run ends | M: `probe-gap.spec.ts`: two ready tasks, yearly cron, real clock, prints `gap_ms` | Cron only gives no second run | 14.5 min to under 15 s, gap |
| G3 | A usage limit pauses a run, and it continues with no person | `executor.contract.ts`, `usage-hold.test.ts`: a fake rejected event gives `held`, and after the wound reset the same session ends `succeeded`. One real resume | No handler ends `failed` | Failed 12 to 0, limit-failures. Stops 6 to 0, owner-stops. D7 |
| G4 | A claim never outlives its run | `claims.test.ts`: kill a run, read fake labels after one tick | The label stays | 253 h to under 1 min, dead-claims |
| G5 | After a reboot the loop runs with no person | `api-smoke.mjs` kills and restarts: a `resume` loop starts a run with no HTTP call, a default loop stays stopped | Recovery stops all | 10 days to 0, D7, idle-days |
| G6 | No PR merges with a failing check | `gate-red.test.ts`: red check stays open, control merges, on red `main` only its fix merges. The audit finds a planted merge | No gate merges it | 12 to 0, D7, merged-on-red |
| G7 | Empty work cannot merge | `gate-stub.test.ts`: no implementation fails `green`, an always-true test fails `stub`, control merges | A word search passes | 0 % to 100 %, D7, stub-share |
| G8 | A run does not wait for tests or CI | `gate-handover.test.ts`: the run ends before its job starts. ap eval: reply ends `PR_OPEN`, no `gh pr checks` | Polling fails the eval | 37 % to 0 %, D7, poll-share |
| G9 | A PR cannot lower its own bar | `gate-scope.test.ts`: one PR per guarded path, first a raised limit in `ratchets.json`, each stops at `scope`. Control merges | No guard merges them | Target 0, unratified |
| G10 | A new epic shows a failing goal check before any build task | ap `epic.test.mjs`: no manifest or an all-pass manifest gives no build task, a red one gives `take` | No refusal starts the task | Day 3 to day 0, D7, first-goal-day |
| G11 | The owner sees progress as a number | `goal-number.spec.ts`: a fake merge moves the loop page from `goals 2/8` to `goals 3/8` | No goal data, no number | 7 questions to 0, D7, status-questions |
| G12 | Defects appear early | M: `late-tasks`: 56 % on epic 63, an exact share on a fixture. G25 proves the behaviour | No tool fails the fixture | 56 % to under 20 %, D7 |
| G13 | A regression gives one issue, and a repeat gives no second issue | `standing-goals.test.ts`: two failing passes give 1 issue and a "Last failed" line, a pass closes it, 5 failures open 3 | A second issue opens | Duplicates target 0 |
| G14 | A repeated cause opens one issue with no owner message | `process-review.test.ts` replays the rows of 2026-10-19 to 10-22, recorded, plus one real haiku run: one issue for Smart App Control, one for usage limits | No review, 0 issues | 0 to at least 3 of 6, D7, causes-found |
| G15 | A cause stops after its check merges | `scoreboard.test.ts`: seeded events give exact counts around a check date | No split, one count | 11 to at most 1, D7, cause-repeats |
| G16 | A new rule has a check | `tests/tools/rule-lint.test.ts`: a line with no link is refused, a linked one passes | No lint passes it | R1 counts, target 0 new |
| G17 | A loop tool change cannot make the loop worse | ap eval-gate test: `tick.md` changed with no result is refused, equal or better passes | No gate passes it | Can only rise, eval-pass-rate |
| G18 | When a goal ends, the next goal card appears with no owner message | `goal-card.spec.ts`: close a fake goal, the next probe shows a card | No writer, no card | 10 days to 0, D7, idle-days |
| G19 | A refused goal does not start | `goal-cards.test.ts`: window on, refuse, wind past: no start. Control starts. Window off (default): no yes, no start | A plain timer starts it | Target 0, refused-started |
| G20 | A one-way goal never starts alone | same file: it waits past the window, and starts after one yes | It starts | Target 0, one-way-started |
| G21 | A lower rank cannot take the window from a higher rank | `server/services/rank.test.ts`: fake window, two goals, rule 2.14 | Older loop first | Not measured, rank-stops |
| G22 | Owner messages per merged PR fall | M: `owner-messages`: reproduces 0.84 and 1.77, exact on a fixture | No tool fails the fixture | 0.84, 1.77 to under 0.2, D7 |
| G23 | One root cause gives one hold and one push | `holds.test.ts`: two runs report one resource: 1 hold, 1 notice, its tasks wait, others run, a passing check clears it | Each task fails alone | 12 runs to 1 hold, D7, blocked-runs |
| G24 | Each lane has its own number, database and port | `lanes.test.ts`: 3 runs get 3 different env sets | Equal env fails | Not measured |
| G25 | Failing rows write the next tasks | `plan-action.test.ts`, ap eval: `plan` starts one run with the failure text, a repeat starts none | Loop stops at `blocked` | Not measured |
| G26 | An epic closes on the check, not on an empty list | ap `epic.test.mjs`: tasks closed and rows failing give `plan`, all passing gives `done` | It gives `done` | Not measured |
| G27 | A run cannot merge | `merge-guard.test.ts` per command form, one haiku run with a fake `gh` | The call reaches `gh` | Not measured |
| G28 | The screen answers "is it still working?" | `probe-state.spec.ts`: each action shows its word and the last probe line | Old word stays | Not measured |
| G29 | A task that ships a screen carries its own acceptance, not a last-day task | ap `epic.test.mjs`, manifest epic: a `web/` PR fails `E check` with no `Acceptance:` line in `## Verify`, and passes with a compare result. Control: a non-`web/` PR passes | `E check` passes it | Not measured |

## 2. Shared contracts

Schemas: `shared/contracts/goal-loop.ts`. Types: `shared/domain/goal-loop.ts`. A stored command is an argv array with no shell, with the placeholders `{key}` and `{reason}`.

### 2.1 Probe line

The console reads the last non-empty stdout line. It needs exit 0 in 30 s.

```json
{"v":1,"action":"take","tasks":[{"key":"141","attempt":1,"resources":["docker"]}],"reason":"","resource":null,"until":null,"plan":null,"issues":[],"goals":{"passed":3,"total":8}}
```

| `action` | Required | Console does | State |
|---|---|---|---|
| `take` | `tasks` | Claims, starts runs up to the free lanes | `active` |
| `plan` | `plan: {"key":"plan-217","failing":["G4"]}` | One run, no claim, none if this key is live | `active` |
| `skip` | none | Nothing | `active` |
| `wait` | `reason` | One notice per reason | `waiting` |
| `blocked` | `reason`, `issues` | Shows the blockers | `blocked` |
| `hold` | `resource`, `reason`, `until` optional | Opens a hold (2.5) | `held` |
| `done` | none | Closes the period with `goal_met` | `complete` |

`key` matches `^[\w.-]{1,100}$`, and the console reads no meaning from it. Other keys are ignored. The raw line is stored, cut at 2000 bytes. A bad line, a non-zero exit or a time-out gives `probe_failed`, one notice, no session. `E next <e> --probe` prints this line and implies `--parallel`.

### 2.2 States

`loops.status` stays `active` or `stopped`. `loop_probes.state` is `active` (today's words), `waiting` (Waiting for you), `blocked` (Blocked), `held` (Held), `budget_limited` (Budget used), `complete` (Goal met), or `probe_failed` (Probe failed). Run status `held`: Held. Period end `goal_met`: Goal met. D1 picks each pill class.

### 2.3 Run-end signal

The last non-empty line of the final result text is the JSON of `tick.md` step 7, with two new `result` words:

```json
{"epic":217,"issue":141,"result":"PR_OPEN","pr":"https://github.com/o/r/pull/7","resource":null,"progress":"3/40 done","note":"..."}
```

`parseRunEnd(text)` in `shared/domain/run-end.ts` returns `{result, pr, resource}` or `null`. The executor calls it before `cut()`. The `result` event gains `end?`. `runs` gains `end_result`, `end_pr`.

- `PR_OPEN` with the repository gate on: the claim owner becomes `gate`, and a job is queued.
- `RESOURCE_DOWN`: release as excused, and open a hold on `resource`.
- Any other value, or `null`: release if still claimed.

### 2.4 Claims

```ts
type TaskRef = { key: string; resources: string[] };
ClaimGateway.claim(cfg, task): { ok: true } | { ok: false; reason } // adapter runs the argv of loop_probes
ClaimGateway.release(cfg, task, why: { reason; excused: boolean }): void
ClaimRepository.open({ id, loopId, taskKey, runId, at }): 'opened' | 'taken'
ClaimRepository.listOpen(loopId), .handOver(id, gateJobId), .close(id, reason, at)
ClaimRepository.findOrphaned(limit) // owner is a run that is neither running nor held
```

Order: `open`, `claim`, run. A refused claim closes the row. The tick releases orphaned claims. A usage limit, a restart and `RESOURCE_DOWN` are excused: `E release <n> --if-claimed --excused` adds a `loop-excused:` line, and `attemptsOf` skips it. `--if-claimed` does nothing with no work label, because plain `release` reopens a closed issue.

### 2.5 Resource hold

`resource_holds`: `id`, `resource`, `reason`, `opened_at`, `until`, `checked_at`, `closed_at`, `opened_by_run_id`. An index allows one open hold per `resource`. `plan-window` is reserved and stops every probe loop. A loop setting `resources: [{ name, check: string[], everySec }]` names a check, and exit 0 means up. Other holds stop only the tasks that list the resource. `plan-window` closes at `until` plus 60 s. Then `held` runs resume, oldest first.

New final executor event: `{ type: 'usage_limit'; resetsAt: Date | null; limitType: string | null; message: string; costUsd?: number }`. Triggers: `rate_limit_event` with `rate_limit_info.status === 'rejected'`, assistant `error: 'rate_limit'`, or an error result with the text `You've hit your`. A no-probe loop writes `failed` with `message`, as today.

A `held` run has no process and keeps its session id. `cancel` and `finish` accept `held`. Resume sets `running` and a new `deadline_at`, then calls the executor with `resumeSessionId`. `ExecutionInput` gains optional `resumeSessionId`, `env`, `gateGuard`, `toolProfile` (`full`, `review`).

### 2.6 Notifier

`Notifier.send(n): void` never throws, and keeps one unread notice per `dedupeKey`. `Notice`: `dedupeKey`, `kind` (`wait`, `hold`, `blocked`, `gate`, `goal_card`, `probe_failed`), `loopId`, `messageKey`, `params`, `at`.

`StoreNotifier` writes `notices`. `WebhookNotifier` posts `{ kind, text, at }` to `LOOPS_NOTIFY_WEBHOOK` if set. Routes: `GET /api/notices`, `POST /api/notices/:id/read`.

### 2.7 Lanes

Slot `k` is the lowest free one, from 0. The env holds `CASTRAFERRUM_SLOT=k` plus `loop_probes.lane_env`, with `{slot}` and `{port}` (`lane_base_port + k`) filled in. It also holds `CASTRAFERRUM_GATE=1` when the repository gate is on, and K7 sets it. A run with this variable ends at `PR_OPEN` (`tick.md`, K10). With no variable it works as today. A unit test re-reads these two lines from `docs/ARCHITECTURE.md`:

- Prompt line: `[Castraferrum] The console claimed task <key> for this run (action <take or plan>). Do not run next or claim. Do this task only.`
- Resume message: `[Castraferrum] The usage limit has reset. Continue the same task from where you stopped.`

### 2.8 Gate

Steps in order: `scope`, `base`, `setup`, `green`, `stub`, `verify`, `ci`, `merge`.

`gate_jobs`: `id`, `repo_id`, `pr_number`, `head_sha`, `task_key`, `state` (`queued`, `running`, `merged`, `failed`, `needs_ratification`), `failed_step`, and the times `queued_at`, `started_at`, `finished_at`, `ratified_at`. `gate_steps`: `job_id`, `seq`, `step`, `status` (`pass`, `fail`, `skip`), `exit_code`, `ms`, `output_tail` (last 60 lines).

- One job runs at a time. `POST /api/gate/jobs` queues a PR by hand.
- Status: `castraferrum/gate` on the PR head, `success` or `failure`, description `<step>: <one line>`.
- A failure comments `output_tail` on the task and releases it, not excused.
- A guarded change gives `needs_ratification`. `POST /api/gate/jobs/:id/ratify` skips only `scope`.
- If the check run of `main` is red, the gate opens one issue, and only a PR that closes it merges.
- Merge: `gh pr merge --squash --match-head-commit <sha>`, then `check_command`. If `main` moved after `base`, the job reruns once.
- Audit: a merged PR with no `success` status is one incident.

### 2.9 Data files

These live under `goals/`, the scope guard protects them, and the gate reads them only from `origin/main`. `goals/gate.json`:

```json
{"v":1,"setup":["npm ci"],"verify":["npm run verify"],"env":{"LOOPS_TEST_DATABASE_URL":"<gate_test url>","LOOPS_E2E_PORT":"7171"},"guarded":["goals/**","scripts/ratchets.json","scripts/ratchets.mjs","scripts/*-check.mjs","scripts/phone-check.mts","scripts/install-webkit.mjs","vite.config.ts",".npmrc","tests/support/server-process.ts","tests/support/test-repo.ts","tests/support/tcp-proxy.ts","scripts/lang-scan.mjs","scripts/lang-baseline.json","scripts/lang-history-allowlist.json","scripts/uc-coverage.mjs","scripts/api-smoke.mjs","scripts/test-contract.mjs","scripts/design-lint.mjs","scripts/design-states.mjs","scripts/design-tokens.mjs","scripts/arch-lib.mjs","scripts/rule-lint.mjs","scripts/rule-lint-baseline.json","scripts/merge-audit.mjs","scripts/metrics/**","design/ds/required-tokens.json","design/ds/contrast-pairs.json",".dependency-cruiser.cjs","playwright.config.ts","vitest.config.ts","tsconfig.json","tsconfig.base.json","web/tsconfig.json",".github/**",".githooks/**"],"testGlobs":["**/*.test.ts","tests/**"]}
```

`goals/verify/<epic-slug>.json`, one entry per task key:

```json
{"v":1,"tasks":{"141":{"green":[{"run":"npx vitest run x.test.ts","expect":["7 passed"]}],"stub":{"run":"npx vitest run x.test.ts"}}}}
```

Stub run: restore each changed file outside `testGlobs` to the base commit, and `stub.run` must exit non-zero. `{"none":"<reason>"}` replaces `stub.run` for a task with nothing to stub. A task with no entry fails at `green`. A plan PR changes only `goals/verify/**` and `docs/plans/**` and only adds keys. It passes `scope` and skips `green` and `stub`.

`guarded` holds each script that `npm run verify` reaches, with its data files, and each file that `npm ci` reaches (the lifecycle scripts `postinstall` and `prepare`), the config of each tool of `verify` (`vite.config.ts`, `.npmrc`) and each `tests/support` file that these scripts import. `tests/tools/gate-data.test.ts` parses `scripts.verify` and the lifecycle scripts, follows imports into `tests/support`, and fails on a file that `guarded` does not match, and on a command that it does not know. It does not follow imports into `server/`, `shared/` or `web/`: `verify` runs that product code itself.

`package.json` is not in `guarded`, because a dependency bump or a raised `--min` must not stop for a person. `checkScope` takes an optional `packageChange: { base; head }`. A change to `package.json` passes `scope` if the `scripts` objects are deep-equal, or if the only difference is a higher number after `--min` in `scripts.verify`. Any other change to `scripts`, a lower `--min`, bad JSON, no `packageChange`, or a delete or rename of `package.json` gives the verdict `guarded`, so the job state is `needs_ratification`.

### 2.10 Goals

`goals/<date>-<slug>.json` keeps the `goal-check.mjs` format, plus `"opened":{"at":"<ISO>","passed":0,"total":n}`. A goal gains `"cadence":"merge"|"nightly"` and `"d7":true` (it passes when its tool test passes, and prints "not measured yet"). A check gains `"score":"<regex with two number groups>"`. The epic body holds `Goal manifest: goals/<file>.json`. With no such line an epic behaves as today.

`goal-check --json` prints `{"goals":[{"id":"G4","pass":false,"value":72,"of":240,"line":"G4 72/240 screens"}],"passed":3,"total":8,"sha":"abc1234"}`. The console comments on the epic `loop-goals: {"passed":3,"total":8,"failing":["G4"],"sha":"abc1234"}`. `E next` reads the last such comment.

`goals/health.json`: `{"v":1,"cron":"0 2 * * *","timezone":"...","epic":0,"maxNewIssuesPerPass":3,"rows":[{"id":"H1","outcome":"...","run":"npm run verify","timeoutSec":3600}]}`

### 2.11 Fingerprint

`fingerprint(repo, rowId, line)` in `shared/domain/fingerprint.ts`: the first 12 hex characters of the sha256 of `repo\nrowId\nnormalized`. `normalized` is the first failing line in lower case, with each path, timestamp, number and hex run of 7 or more replaced by `n`. The issue body holds `<!-- fingerprint:<hash> -->`, found with `"<hash>" in:body`.

### 2.12 Review

`reports/process-review/<date>.json`: `{"v":1,"from":"<date>","to":"<date>","clusters":[{"id":"usage-limit","cause":"...","events":12,"runIds":[],"firstAt":"<ISO>","lastAt":"<ISO>","repo":"o/r","fingerprint":"<hash>","check":{"kind":"hook|lint|test|eval|probe","name":"<file>","replay":"<command>"}}]}`

`scripts/process-file-issues.mjs <file>`, no model, opens one issue per cluster with 2 or more events, by 2.11. Inputs: `GET /api/process/events?from&to` (`runs`, `gate_steps`), `loop-release:` and `loop-found:` comments.

The review file is built in two steps (decision 21). `scripts/process-review.mjs first-pass` applies the rules of `scripts/process-review/rules.json` (`id`, `cause`, `pattern`, `flags`, `check`) to the event `text`, and the first rule that matches takes the event. The model groups only the rows that no rule took. `assemble` then sets `events`, `runIds`, `firstAt`, `lastAt` and `fingerprint` (2.11) of every cluster. The model writes none of them.

### 2.13 Charter, card

`goals/charter.json`: `{"v":1,"purpose":"...","mayStartAlone":["..."],"neverAlone":["..."],"refusalWindow":{"enabled":false,"hours":8},"acceptedWithNoChange":0}`. `neverAlone`: the list of issue 216, plus "deleting a feature".

A goal card is an issue labelled `goal-card` with one JSON block: `{"v":1,"title":"...","rows":[{"id":"G1","outcome":"...","oracle":"...","threshold":"..."}],"size":{"planWindows":0.5},"door":"two-way","next":["..."]}`

Table `goal_cards`: `state` is `proposed`, `accepted`, `refused` or `started`. `start_after` is set only with the window on and a `two-way` door. An index allows one `proposed` card per repository.

### 2.14 Rank and budget

`loop_probes` gains `rank` (integer, default 100, smaller is higher) and `token_budget`. `runs` gains `tokens`. `PlanWindow.read()` returns `{ utilization: number | null; resetsAt: Date | null }`.

Rule: a loop starts a run when no higher-rank loop last printed `take` or `plan`. Otherwise it starts one only when `resetsAt` is under 45 min away and `utilization` is under 90. With `null` it does not start. At `token_budget` the state is `budget_limited`, and no run starts.

### 2.15 Merge guard

`checkMergeCommand(toolName, command)` in `shared/domain/merge-guard.ts`. It refuses on the text and does not parse a shell. So a nested form (`bash -c`, `xargs`, `node -e`) gives the same result as the plain form. The cost is a false refusal when a command only names these words, for example in `git commit -m`. The reason text says: put the words in a file.

Normal form of a command: delete `"`, `'`, a backtick, `\` and `^`, change to lower case, and join runs of white space. A tool that is not `Bash`, `PowerShell` or `mcp__*` is allowed. A `Bash` or `PowerShell` command that is not a string gives the rule `bad-input`.

| Rule | Refuses when |
|---|---|
| `pr-merge` | the text has `pr merge` |
| `rest-merge` | the text has `pulls/<x>/merge` or `/merges` as a path end |
| `status` | the text has `/statuses/` |
| `check-run` | the text has `check-runs` and a write sign: `-x post`, `-x patch`, `--method post`, `--method patch`, ` -f `, `--field`, `--raw-field`, `--input` |
| `graphql` | the text has `mergepullrequest`, `enablepullrequestautomerge`, `mergebranch`, `enqueuepullrequest`, `createcheckrun` or `updatecheckrun` |
| `push-main` | the text has `git`, then `push`, then `main` or `master` as a whole ref after white space, `:` or `refs/heads/` |
| `gh-dynamic` | `gh` or `gh.exe` is followed by `$` |
| `mcp` | `toolName` is `mcp__*` and has `merge_pull`, `merge_branch`, `auto_merge` or `commit_status` |

Refused, 35 lines, each a test:

- `pr-merge`: `gh pr merge 1`; `gh pr merge 1 --squash --auto`; `gh -R o/r pr merge 1`; `gh --repo o/r pr merge 1`; `GH_TOKEN=x gh pr merge 1`; `/usr/bin/gh pr merge 1`; `"C:\Program Files\GitHub CLI\gh.exe" pr merge 1`; `cd x && gh pr merge 1`; `bash -c "gh pr merge 1"`; `powershell -c "gh pr merge 1"`; `gh pr "mer""ge" 1`; `gh pr mer\ge 1`; `gh alias set m "pr merge"`; `echo 1 | xargs gh pr merge`; `x=gh; $x pr merge 1`.
- `rest-merge`: `gh api -X PUT repos/o/r/pulls/1/merge`; `gh api --method PUT repos/o/r/pulls/1/merge`; `gh api repos/o/r/merges -f base=main -f head=x`; `curl -X PUT https://api.github.com/repos/o/r/pulls/1/merge`.
- `status`: `gh api repos/o/r/statuses/abc -f state=success -f context=castraferrum/gate`; `gh api -X POST repos/o/r/statuses/abc --input b.json`; `curl -d @s.json https://api.github.com/repos/o/r/statuses/abc`.
- `check-run`: `gh api -X POST repos/o/r/check-runs -f name=x`; `gh api repos/o/r/check-runs --input b.json`.
- `graphql`: `gh api graphql -f query='mutation { <name>(input: {}) { clientMutationId } }'`, with `<name>` each of `mergePullRequest`, `enablePullRequestAutoMerge`, `mergeBranch`, `enqueuePullRequest`.
- `push-main`: `git push origin main`; `git push origin HEAD:main`; `git push origin HEAD:refs/heads/master`; `git -C x push -f origin main`.
- `gh-dynamic`: `gh $(cat cmd.txt)`.
- `mcp`: tool `mcp__github__merge_pull_request`; tool `mcp__github__create_commit_status`.

Allowed, 16 lines, each a test: `gh pr create --title x --body-file b.md`; `gh pr view 1`; `gh pr checks 1`; `gh pr list`; `gh api repos/o/r/pulls/1`; `gh api repos/o/r/commits/abc/status`; `gh api repos/o/r/commits/abc/check-runs`; `gh api graphql -f query='query { viewer { login } }'`; `git merge origin/main`; `git push origin feat/main`; `git push origin main-fix`; `git push -u origin HEAD`; `git log --grep merge`; `grep -n merge server/x.ts`; `npm run verify`; tool `mcp__github__get_pull_request`.

**Limit.** The hook reads only the command text. A script file that holds the merge (`bash m.sh`) or an encoded command passes the hook. The audit of K9 finds that merge, and decision 1 of the epic accepts two layers.

## 3. Module map

Each repository port has a `postgres/` and a `memory/` adapter. Each service has its `http/<name>-routes.ts`. New services call `RunService` and `LoopService`, and neither calls back.

- **Issue 212.** `shared/domain/run-end.ts`. Ports: `command-runner`, `claims`, `loop-probe-repository`, `hold-repository`, `notifier`. Services: `probe-service`, `hold-service`, `notice-service`. Adapters: `process/`, `claims/`, `notify/`. `scheduler/background-ticker`: each second, one `tick()` per service, a busy service is skipped.
- **Issue 213.** `shared/domain/merge-guard.ts`, `scope-guard.ts`. Ports: `git-host`, `gate-workspace`, `gate-repository`. Service: `gate-service`. Adapters: `github/`, `git/`.
- **Issues 214, 215.** `shared/domain/fingerprint.ts`. Port: `goal-repository`. Services: `goal-service`, `standing-goal-service`, `process-service`.
- **Issue 216.** Ports: `goal-card-repository`, `plan-window`. Service: `goal-card-service`. Adapter: `executors/claude/claude-plan-window`.
- **`web/`.** `features/` and `pages/`: `goal-loop`, `gate`, `goals`, `scoreboard`, `goal-cards`.

Migrations by name: `loop_probes` (P3), `notices` (P9), `run_claims` with `runs.task_key`, `slot`, `end_*`, trigger word `probe` (P5), `holds` with status `held`, `runs.resume_count` (P8), `goal_met` (P10), `gate` with `repo_gate`, `run_claims.owner`, `gate_job_id` (K2), `goal_runs` (T2), `standing_goals` with `standing_issues`, `standing_schedule` (T4), `goal_cards` (W1), `rank` (W4).

Shared files take small edits, and a conflict takes the union. `compose.ts`: one service line, one entry in the array `background`. `contracts.ts`, both `repositories.ts`, `memory/index.ts`, `http/app.ts`, `shared/i18n/*.ts`, `docs/API.md`, `docs/USE-CASES.md`: append. `postgres/db.ts`: add each table to `truncateAll`. Only P5-P8, K7, K8, R4 edit `run-service.ts` and `claude-agent-executor.ts`.

**GitHub in tests.** F2 adds `tests/support/fake-gh.mjs` and `tests/support/bare-repo.ts`. `GitHost` runs the binary in `LOOPS_GH_BIN`, accepted only with a `*_test` database, like `LOOPS_MOCK_EXECUTOR`. The fake keeps its state in the file `FAKE_GH_WORLD`. `git` is real, on a local bare repository, and `pr merge` merges there. ap tests keep `EPIC_LOOP_GH_MODULE`.

## 4. Task graph

Each task is one PR. A star: it can start at once. Column ap: blank is cf. Needs: blank is none. Tier: `s` is sonnet, because the plan can spell it out exactly. `o` is opus, with its reason. An ap task keeps its issue in cf, and its PR says `Closes hieplam/castraferrum#<n>`.

| Id | Title | ap | Goals | Needs | Area | Tier |
|---|---|---|---|---|---|---|
| F0* | Each ratchet baseline, reads `runs` read-only (227 rows) | | all | | scripts/metrics | s |
| F1* | Goal manifest of this epic, red at 0 of n | | all | | goals | s |
| F2* | Fake GitHub, bare repository kit | | G4, G6-G9, G13 | | tests/support | s |
| S1* | limit order, resume, cost | | G3 | | log | s |
| S2* | hook under bypass | | G27 | | log | s |
| S3* | stub run time, CSS case | | G7 | | log | s |
| S4* | plan window with no model | | G21 | | log | s |
| S5* | grouping quality, fixture | | G14 | | tests/fixtures | o: model output |
| S6* | cost of an eval pass | ap | G17 | | log | s |
| D1* | Design gap issue, status rows, preview | | G11, G28 | | design | o: design |
| D2 | Owner approval, the only gate | | G11, G28 | D1 | design | owner |
| P1* | CommandRunner port, adapter | | G1 | | adapters | s |
| P2* | Probe and run-end parsers | | G1, G4 | | shared | s |
| P3 | Probe settings: table, routes | | G1 | P2 | http | s |
| P4 | ProbeService, background ticker, ADR 0004 | | G1, G2 | P1, P3 | services | o: processes |
| P5 | Claim, start, release on the tick | | G2, G4 | P4 | services | o: claims |
| P6 | Lanes: slot, env, lifecycle line | | G24 | P5 | run service | s |
| P7 | Executor: usage_limit, resume | | G3 | S1, P2, P6 | executor | o: input queue |
| P8 | Holds, held, resume, stop on held | | G3, G23 | P7, P9 | services | o: states |
| P9* | Notifier, notices, webhook | | G23 | | adapters | s |
| P10 | wait, blocked, plan, done, goal_met | | G1, G25, G28 | P5, P9 | services | s |
| P11 | Restart policy, smoke step | | G5, G4 | P8 | recovery | o: start-up |
| P12* | Log-on task script, no install | | G5 | | scripts | s |
| P13* | E next --probe, --if-claimed, --excused, needs: labels, tick mode | ap | G1, G4, G23 | | epic.mjs, tick.md | s |
| P14 | End-to-end: idle and gap | | G1, G2 | P6, P10 | tests/e2e | s |
| P15 | Loop state, editor fields, notices | | G28 | D2, P8, P10 | web | s |
| K1* | gate.json, verify data, scope guard | | G9 | | shared, goals | s |
| K2 | Gate tables, repo_gate | | G6 | P5 | repository | s |
| K3 | GitHost, gh adapter | | G6 | F2, P1 | adapters | s |
| K4 | GateWorkspace: worktree, stub restore | | G7 | F2, P1, S3 | adapters | o: git cases |
| K5 | GateService: queue, steps | | G6, G7, G9 | K1-K4 | services | o: the gate |
| K6 | Failure feed, red main, ratify | | G6 | K5 | services | o: the gate |
| K7 | Run-end handover to the gate | | G4, G8 | K5, P8 | services | o: claims |
| K8 | Merge guard hook | | G27 | S2, P7 | executor | s |
| K9 | merge-audit.mjs | | G6 | F2 | scripts | s |
| K10 | Tick ends at PR_OPEN, step 7, E check reads status | ap | G8 | P13 | tick.md, epic.mjs | s |
| K11 | Gate oracle tests, control PRs | | G6, G7, G9 | K6, K7 | tests/api | o: fake world |
| K12 | Gate pages, repository switch | | G6 | D2, K6 | web | s |
| T1* | goal-check --json, score, cadence | | G11 | | scripts | s |
| T2 | GoalService: rows after merge, loop-goals:, fall issue | | G11 | T1, K5 | services | o: gate order |
| T3 | E next: refusal, plan, close on check. E check, plan.md: Acceptance line | ap | G10, G25, G26, G29 | P13 | epic.mjs | o: loop decision |
| T4 | Standing goals, fingerprint | | G13 | K3 | services | o: dedupe rules |
| T5 | goals/health.json, audit row | | G13, G6 | T4, K9 | goals | s |
| T6 | Goal number, rows on the loop page | | G11 | D2, T2 | web | s |
| R1* | Count rule lines, rule-lint | | G16 | | scripts | s |
| R2 | /api/process/events, fixture | | G14 | S5 | http, tests | s |
| R3 | process-file-issues, review-due | | G14 | F2 | scripts | s |
| R4 | Tool profile review | | G14 | K8 | executor | s |
| R5 | Process review: first-pass rules, fingerprints, prompt | | G14 | S5, T4 | scripts | o: prompt |
| R6 | Replay oracle, real and recorded. It must prove the new-cause path (decision 21): on the real rows that no rule took, a real model run names at least one repeated cause that no rule holds | | G14 | R2-R5 | tests/api | o: model output |
| R7 | Eval gate for tick.md, drive.md | ap | G17 | S6 | scripts/evals | s |
| R8 | Gate refusals and the `loop-release:` and `loop-found:` comments as an input | | G14 | K5, R2 | http | s |
| R9 | Scoreboard API, page | | G15 | D2, R8 | http, web | s |
| W1 | Charter, card, GoalCardService | | G19, G20 | K11, T5 | services | o: door rules |
| W2 | goal-writer-probe.mjs | | G18 | W1 | scripts | s |
| W3 | Skill: goal writer, queue clean-up | ap | G18 | W1 | skill | o: prompt |
| W4 | PlanWindow, rank, budget | | G21 | S4, W1 | services | o: shared window |
| W5 | Card becomes manifest and loop | | G18 | W1, T3 | services | o: real work |
| W6 | End-to-end: next card appears | | G18 | W2, W3, W5 | tests/e2e | s |
| W7 | Goal cards page, rank fields | | G19, G20 | D2, W4 | web | s |
| Z1 | Verify: goal:check, E check --dry-run on each task | | all | all above | goals | s |
| Z2 | Agent acceptance, all new screens | | all | Z1 | tests/e2e | o: images |

Tasks: foundation 13, issue 212: 15, 213: 12, 214: 6, 215: 9, 216: 7. Total 62.

**Spikes.** Answers go to the evidence log. A changed design adds a decision.

| Id | Literal question | Way to answer | If no |
|---|---|---|---|
| S1 | What is the order of `rate_limit_event`, assistant `error`, `result`? Does `resume` with streaming input keep the session id? Does `total_cost_usd` restart at 0? | Read the 12 failed transcripts. Haiku script: stop, resume, log each message type | A limit restarts the task in a fresh run, excused |
| S2 | Does a `PreToolUse` hook of option `hooks` refuse Bash under `bypassPermissions`, in the main thread and a subagent? | Haiku, a logging fake `gh`: ask for `gh pr merge 1` in both | A refusing `gh` shim goes first on `PATH` |
| S3 | How long is a stub run on the largest of the last 100 PRs? Does a CSS-only change go red? | Restore non-test files to the base, time the tests. Repeat with one CSS PR | Plans name fewer tests. A CSS task uses `stub.none` |
| S4 | Can a `query()` with no user message call `usage_EXPERIMENTAL...` with `skipBehaviors: true` and no model turn? Does a normal run carry `utilization`? | One script, read `total_cost_usd` | Use the last `rate_limit_info.utilization` |
| S5 | Does a read-only haiku run on sanitized rows name both causes of G14 in 3 of 3 tries? | Build the fixture, run 3 times | Try sonnet, then give counts of normalized lines |
| S6 | What does one `run_evals.py` pass over 5 evals cost? | Run it once, read the cost | Over $2: the gate needs the tick cases only |

## 5. UI inventory

Pages open from a `.cell.is-link`. The tab bar stays.

- Loop state, run `held`: `.pill` (gap), `.now`, `.cmd`.
- Probe settings, rank, budget: `.field`, `.input`, `.switch`, `.hint`.
- Notices, holds: `.banner.is-warn`, `.group`, `.note`.
- Goals figure, goal rows, standing goals: `.stat`, `.group`, `.pill`.
- Gate queue, record, output: `.group`, `.pill` (gap), `.log`, `.btn.primary`, `.switch`.
- Scoreboard: `.stats`, `.group`, one number per week, no chart.
- Goal card: `.card`, `.pill` (gap), `.data`, `.btn.primary`, `.btn.danger`.

**One real gap.** The status table in `SYSTEM.md` (Content) has no rows for the states of 2.2, the gate job and card states, and the door words. No class, token or colour is new. D1 opens one `design-system` issue, adds the rows, and draws these preview states: loop waiting, held, blocked, complete; run held; gate queue, failed; goal rows; scoreboard; card two-way, one-way. Only P15, K12, T6, R9, W7 wait for D2.

## 6. Decisions

1. Rows G23 to G29: each stated behaviour gets a row. They add no outcome.
2. Issue 212: the console reads only `action`, but `take` claims tasks. So it reads the fields of 2.1 as opaque values.
3. Issue 212: one limit holds every loop. Epic decision 4 wins: a hold covers probe loops only.
4. A claim has one owner, a run or the gate, so G4 holds.
5. The run-end signal does not use `summary`: `cut()` keeps 500 characters, and 0 of 167 real summaries hold the JSON line. K10 corrects `tick.md`.
6. A status `held`, not a flag: old code skips it.
7. A table `loop_probes`, not columns on `loops`: `version` stays. A probe loop has `next_run_at` null, so `findDue` skips it, and Start skips `startFirst`.
8. Issue 214 writes tasks late, and issue 213 guards `goals/`. So a plan PR may add keys, never change one.
9. Ratify is a console route: owner and worker share one `gh` login. The hook also refuses `gh api` calls that merge or set the status.
10. Goal results live in `loop-goals:` comments: `epic.mjs` has no database.
11. The model groups, a script files, so G14 has a stable test.
12. The goal writer waits for K11 and T5, not pages.
13. `resetsAt` is in epoch seconds (checked on session `464e9f06`). It sits in `rate_limit_info` and is optional.
14. Real rows hold Vietnamese. S5 writes English lines, and F0 prints no loop name.
15. A 60 s probe fits: `E next` took 4.3 s.
16. F0 counts G1 from transcripts with no `Edit`, `Write`, `git push`, `gh pr create`. F0's number wins.
17. Task sections are written in waves: plans written far ahead go stale (issue 214), and spikes can change later designs.
18. `package.json` is outside `guarded`, with its own rule in 2.9. The gate runs `verify` from the PR, so `scripts` is part of the bar, but a dependency bump is not.
19. `CASTRAFERRUM_GATE=1` tells a run that the gate is on. The prompt line of 2.7 is fixed, and a file on `main` cannot say it, because `repo_gate` is a console setting.
20. Amendment of issue 251, under the standing rule "extend inside the rules and record it": the list of 2.9 missed files that `verify` and `npm ci` reach. `guarded` gains `scripts/install-webkit.mjs`, `vite.config.ts`, `.npmrc` and the three `tests/support` files that `phone:check` imports (`server-process.ts`, `test-repo.ts`, `tcp-proxy.ts`). The directory `tests/support/` stays unguarded, because task PRs add files there. `gate-data.test.ts` no longer exempts reached test files, and it checks `postinstall` and `prepare`. `server/config.ts`, which `server-process.ts` imports, stays unguarded: it is product code that `verify` exercises.
21. Issue 267: the first pass of the review is a program, not a model. S5 showed that no model meets the grade: each try split the 12 usage-limit rows into `weekly` (3) and `session` (9), and on the real rows the Smart App Control cluster held 8 of 14. The fallback of section 4 does not fix this, because `normalized` of 2.11 keeps both words. So a list of rules in the data file `scripts/process-review/rules.json` runs first. Rule `usage-limit` takes both limit forms into one cluster. Rule `smart-app-control` takes every row that names Smart App Control. The model groups the rest. A later review adds a rule in a normal pull request, because the folder is outside `guarded`. R5 builds this and closes issue 267. This replaces the fallback of section 4 for S5, and it extends decision 11. The rules were written after the answer was known, so they prove that known causes are filed, not that the review finds a new cause. So R6 must prove the new-cause path: on the real rows that no rule took, a real model run names at least one repeated cause that no rule holds.
22. A probe runs every 60 s, and on the first tick after a run of the loop ends: `latestFinishedAt` is later than `last_probe_at`. A tick awaits its due loops with `Promise.all`, so a hung probe delays other loops by at most 30 s. Each loop is caught alone. With no free lane the console does not call the probe. A call is `commands.run({ argv, cwd: repo.path, timeoutMs: 30000 })`, then `parseProbeLine`. A bad exit, a time-out or a bad line gives `probe_failed`, with `lastLine` set to `raw` or `error`. `record` uses the tick's `now`, so a run that ends during a call gives a new probe.
23. `run_claims.run_id` has no foreign key, because `open` comes before the run row, and a row with no run counts as orphaned. A partial unique index allows one open row per `loop_id` and `task_key`, and a second `open` gives `taken`. `release` throws on a failed command. The row stays open, and the tick tries it again 60 s later, so a `gh` failure cannot lose a release. `findOrphaned` rows add `runStatus` and `endResult`. The gateway has a 30 s time-out, fills `{key}` and `{reason}`, and does nothing for an empty argv. A tick first releases orphans: `release`, `close`, reason `run <status>[ <endResult>]`, excused for `interrupted` and `RESOURCE_DOWN`. Then for `take`, until the lanes end: `open`, `claim`, `startClaimed`. `taken` goes to the next task. A refused claim closes its row. A `skipped` run gives an excused release and a close.
24. `{port}` in `lane_env` with a null `lane_base_port` is refused at save. The env is not stored, and a resume computes it from `runs.slot`. P8 counts `held` runs as used slots.
25. S1: no stored run holds a `rate_limit_event` or a `result`, and all 12 failed runs hold only an assistant `error: rate_limit`. So each of the three triggers of 2.5 works alone, in any order. After the first trigger the executor reads on until a `result`, the end of the stream, or `limitSettleMs` (5 s). It merges the values that it saw, aborts the process, and emits `usage_limit`. A limit is applied last over the over-ceiling error and over a later `result`. A subagent message counts as a trigger.
26. S1: `rate_limit_event` can come before `system/init`, and it carries `session_id`. The executor emits `session` from the first message with an id, so the protocol holds. With no id at all, a resume cannot work: P8 writes `failed` and releases the claim as excused.
27. S1: `resetsAt` is proven in epoch seconds on an `allowed` event only, so decision 13 is not proven for a `rejected` event. A value that is missing, not a positive number, or 1e11 or more gives `resetsAt: null`. Then P8 opens the `plan-window` hold with `until` null, and the notice says that the end is not known. No timer closes this hold. Every 30 minutes P8 resumes the oldest `held` run as a trial and writes `checked_at`. A new `usage_limit` keeps the hold. Any other end closes the hold and resumes the other runs. So no person is needed, and a closed window costs one short turn in each 30 minutes.
28. S1: `resume` keeps the session id (4 of 4), and `total_cost_usd` does not restart at 0. So the cost of a resumed run replaces the stored cost and is never added to it. A `usage_limit` with no `costUsd` keeps the stored cost, which P8 proves with a test. With `resumeSessionId` the executor sets the option `resume`, sends `input.prompt` as the head message, and logs `Resume round #N · session <id>`.
29. S2: a `PreToolUse` hook refuses under `bypassPermissions`, in the main thread and in a subagent, but it refuses only what its pattern matches. So 2.15 lists each form and its test. `git push` to `main` and the MCP tools are added, because each one merges with no `gh pr merge`. K8 adds `gateGuard` and K7 sets it with `CASTRAFERRUM_GATE`, because `repo_gate` is a K2 table and K8 needs only P7.
30. `repo_gate` holds `repo_id` (primary key), `enabled` (default false), `github_repo` (`o/r`), `check_command` (jsonb argv, default `[]`, the command of 2.8) and `updated_at`. K2 adds no route, and K12 adds the switch.

**`docs/ARCHITECTURE.md`.** P4: services, ports, tables. P8: line 448 (no pause or resume) becomes "a hold pauses runs for a resource". P11: lines 447 and 231 (stop every loop on restart) become a per-loop `restartPolicy`, default `stop`.

**ADR 0004 (P4): the console owns the life cycle of a goal, not the work.** ADR 0001 holds: each task gets a fresh session, a resume continues the same run, and the console only reads words from a loop-owned command and sends lifecycle lines.

## 7. Outside this epic

- Cabal: `tools/preflight.js` as a probe, a `client-verify` gate step, sensors as standing goals, rule errors as review input, `docs/VISION.md` as writer input.
- A GitHub Pro ruleset.
- Issues 209, 211, the stale `uc-coverage` number, a real phone push after epic 46.
