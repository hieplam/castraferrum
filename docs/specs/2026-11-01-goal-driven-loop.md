# Spec: the console runs a goal to done with no owner stop

- Date: 2026-11-01. The epic ratified the goal rows and decisions. The owner reviews this file after merge.
- Epic: [castraferrum#217](https://github.com/hieplam/castraferrum/issues/217). Phases: issues 212 (probe), 213 (gate), 214 (goal check), 215 (process review), 216 (goal writer). Index: [plan](../plans/2026-11-01-goal-driven-loop.md).
- **Run**: one Claude Code session of the console. **Probe**: a loop's command, no model, prints one JSON line. **Claim**: label `loop:in-progress` plus a `loop-attempt:` comment. **Gate**: the console service, no model, that alone merges. **Hold**: a stop on a resource. **Lane**: one `max_concurrent` slot. **`E`**: `epic.mjs` of the epic-loop skill. **cf**: castraferrum. **ap**: agent-plugins.

## 1. Goal table

D7 means decision 7 of the epic: the tool measures only the baseline, and the done claim prints "not measured yet". Oracles use a fake GitHub (section 3). Each metric is `node scripts/metrics/baseline.mjs --metric <name>`. "Added" marks a behaviour of the issue text that had no row (decision 1). A test name with no folder is in `tests/api/`. A control case is part of the oracle, so that a gate or a probe that refuses everything fails too.

| Id | Outcome | Oracle (kind) | Stub check | Ratchet, metric | Agent runs it |
|---|---|---|---|---|---|
| G1 | A loop with no ready task starts no model session | Behaviour, `tests/e2e/probe-idle.spec.ts`: fake probe prints `wait`, `skip`, `done` on a wound clock: 0 runs, 3 probe calls. Control prints `take`: 1 run | Ignoring the probe starts sessions. Never probing fails the count | 108 of 227 to 0, D7, `read-only-sessions` | Yes |
| G2 | The next task starts seconds after a run ends | Measurement, `tests/e2e/probe-gap.spec.ts`: two ready tasks, yearly cron, real clock, prints `gap_ms` | Cron only gives no second run | 14.5 min to under 15 s, `gap` | Yes |
| G3 | A usage limit pauses a run, and it continues with no person | Behaviour, `executor.contract.ts`, `usage-hold.test.ts`: fake rejected event gives `held`; after the wound reset the same session ends `succeeded`. One real resume on `LC_REAL_CLAUDE=1` | No handler ends `failed` | Failed 12 to 0, person-ended stops 6 to 0, D7, `limit-failures`, `owner-stops` | Yes. No agent can force a real limit, so the real run proves resume only |
| G4 | A claim never outlives its run | Behaviour, `claims.test.ts`: kill a run, read fake labels after one tick | No release: the label stays | 253 h to under 1 min, `dead-claims` | Yes |
| G5 | After a reboot the loop runs with no person | Behaviour, `scripts/api-smoke.mjs` kills and restarts: a `resume` loop starts a run with no HTTP call, a default loop stays stopped | Today's recovery stops all | 10 days to 0, D7, `idle-days` | Yes, process restart only |
| G6 | No PR merges with a failing check | Behaviour, `gate-red.test.ts`: red check stays open, control merges, with red `main` only its fix merges. `merge-audit.mjs` finds a planted merge | No gate merges it | 12 to 0, D7, `merged-on-red` | Yes |
| G7 | Empty work cannot merge | Behaviour, `gate-stub.test.ts`: no implementation fails `green`, an always-true test fails `stub`, control merges | A word search passes both | 0 % to 100 %, D7, `stub-share` | Yes |
| G8 | A run does not wait for tests or CI | Behaviour, `gate-handover.test.ts`: the run ends before its job starts. ap eval: reply ends `PR_OPEN`, no `gh pr checks` in the transcript | A polling run fails the eval | 37 % to 0 %, D7, `poll-share` | Yes, haiku |
| G9 | A PR cannot lower its own bar | Behaviour, `gate-scope.test.ts`: one PR per guarded path, first a raised limit in `scripts/ratchets.json`, each stops at `scope`. Control merges | No guard merges them | Not measured, target 0, `unratified-check-changes` | Yes |
| G10 | A new epic shows a failing goal check before any build task | Behaviour, ap `epic.test.mjs`: no manifest or an all-pass manifest gives no build task, a red one gives `take` | No refusal starts the task | Day 3 to day 0, D7, `first-goal-day` | Yes |
| G11 | The owner sees progress as a number | Behaviour, `tests/e2e/goal-number.spec.ts`: a fake merge moves the loop page from `goals 2/8` to `goals 3/8` | No goal data, no number | 7 questions to 0, D7, `status-questions` | Yes, after D2 |
| G12 | Defects appear early | Measurement, `late-tasks`: 56 % on epic 63 and an exact share on a fixture. G25 proves the behaviour | No tool fails the fixture | 56 % to under 20 %, D7, `late-tasks` | Tool yes |
| G13 | A regression gives one issue, and a repeat gives no second issue | Behaviour, `standing-goals.test.ts`: break a row, two passes give 1 issue and a new "Last failed" line, a pass closes it, 5 failures open 3 | No fingerprint opens a second | Duplicates target 0, days to issue not measured | Yes |
| G14 | A repeated cause opens one issue with no owner message | Behaviour, `process-review.test.ts` on the fixture rows of 2026-10-19 to 10-22, recorded output, plus one real haiku run: one issue for Smart App Control, one for usage limits | No review, 0 issues | 0 to at least 3 of 6, D7, `causes-found` | Yes, haiku |
| G15 | A cause stops after its check merges | Behaviour, `scoreboard.test.ts`: seeded events give exact counts before and after a check date | No split, one count | 11 to at most 1, D7, `cause-repeats` | Yes |
| G16 | A new rule has a check | Behaviour, `tests/tools/rule-lint.test.ts`: a line with no link is refused, a linked line passes | No lint passes it | R1 counts, target 0 new | Yes |
| G17 | A loop tool change cannot make the loop worse | Behaviour, ap eval-gate test: `tick.md` changed with no result is refused, equal or better passes | No gate passes it | Not measured, can only rise, `eval-pass-rate` | Yes |
| G18 | When a goal ends, the next goal card appears with no owner message | Behaviour, `tests/e2e/goal-card.spec.ts`: close a fake goal, a card appears on the next probe | No writer, no card | 10 days to 0, D7, `idle-days` | Yes |
| G19 | A refused goal does not start | Behaviour, `goal-cards.test.ts`: window on, refuse, wind past: no start. Control with no refusal starts. Window off (default): nothing starts with no yes | A timer with no check starts it | Target 0, `goals-against-refusal` | Yes |
| G20 | A one-way goal never starts alone | Behaviour, same file: it waits past the window, and starts after one yes | Ignoring the door starts it | Target 0, `one-way-alone` | Yes |
| G21 | A lower rank cannot take the window from a higher rank | Behaviour, `server/services/rank.test.ts`: fake window, two goals, rule 2.14 | No rank: older loop first | Not measured, `rank-stops` | Yes |
| G22 | Owner messages per merged PR fall | Measurement, `owner-messages`: reproduces 0.84 and 1.77, exact on a fixture | No tool fails the fixture | 0.84, 1.77 to under 0.2, D7 | Tool yes |
| G23 | One root cause gives one hold and one push (added) | Behaviour, `holds.test.ts`: two runs report one resource: 1 hold, 1 notice, tasks that need it wait, others run, a passing check clears it | No hold fails each task alone | 12 blocked runs to 1 hold, D7, `blocked-runs` | Yes |
| G24 | Each lane has its own number, database and port (added) | Behaviour, `lanes.test.ts`: 3 runs get 3 different env sets | Equal env fails | Not measured | Yes |
| G25 | Failing rows write the next tasks (added) | Behaviour, `plan-action.test.ts`, ap eval: `plan` starts one run with the literal failure, a repeat starts none | Loop stops at `blocked` | Not measured | Yes, haiku |
| G26 | An epic closes on the check, not on an empty list (added) | Behaviour, ap `epic.test.mjs`: tasks closed and rows failing give `plan`, all passing gives `done` | Today's `next` gives `done` | Not measured | Yes |
| G27 | A run cannot merge (added) | Behaviour, `merge-guard.test.ts` per command form, one haiku run with a fake `gh` | The call reaches `gh` | Not measured | Yes, S2 |
| G28 | The screen answers "is it still working?" (added) | Behaviour, `tests/e2e/probe-state.spec.ts`: each action shows its word and the last probe line | Old word stays | Not measured | Yes, after D2 |

## 2. Shared contracts

Schemas: `shared/contracts/goal-loop.ts`. Types: `shared/domain/goal-loop.ts`. A command stored in the database is an argv array with no shell. Its placeholders are `{key}` and `{reason}`.

### 2.1 Probe line

The console reads the last non-empty stdout line. It needs exit 0, and the time limit is 30 s.

```json
{"v":1,"action":"take","tasks":[{"key":"141","attempt":1,"resources":["docker"]}],"reason":"","resource":null,"until":null,"plan":null,"issues":[],"goals":{"passed":3,"total":8}}
```

| `action` | Required | Console does | State |
|---|---|---|---|
| `take` | `tasks` | Claims and starts runs, up to the free lanes | `active` |
| `plan` | `plan: {"key":"plan-217","failing":["G4"]}` | One run, no claim. A live run with this key starts nothing | `active` |
| `skip` | none | Nothing | `active` |
| `wait` | `reason` | One notice per reason | `waiting` |
| `blocked` | `reason`, `issues` | Shows what blocks what | `blocked` |
| `hold` | `resource`, `reason`, `until` optional | Opens a hold (2.5) | `held` |
| `done` | none | Closes the period with `goal_met` | `complete` |

`key` matches `^[\w.-]{1,100}$`, and the console reads no meaning from it. Other JSON keys are ignored. The raw line is stored, cut at 2000 bytes. A bad line, a non-zero exit or a time-out gives `probe_failed`, one notice, no session. `E next <e> --probe` prints this line, implies `--parallel`, and keeps the old keys.

### 2.2 States that a person sees

`loops.status` stays `active` or `stopped`. A loop with a probe also has `loop_probes.state`: `active` (today's words), `waiting` (`.s-warn`, Waiting for you), `blocked` (`.s-int`, Blocked), `held` (`.s-warn`, Held), `budget_limited` (`.s-warn`, Budget used), `complete` (`.s-ok`, Goal met), `probe_failed` (`.s-fail`, Probe failed). Run status `held` is `.s-warn`, Held. Period end reason `goal_met` is `.s-ok`, Goal met.

### 2.3 Run-end signal

The last non-empty line of the final result text is the JSON of `tick.md` step 7, with the new `result` words `PR_OPEN` and `RESOURCE_DOWN`:

```json
{"epic":217,"issue":141,"result":"PR_OPEN","pr":"https://github.com/o/r/pull/7","resource":null,"progress":"3/40 done","note":"one sentence"}
```

`parseRunEnd(text)` in `shared/domain/run-end.ts` returns `{result, pr, resource}` or `null`. The executor calls it on the full text, before `cut()`. The `result` event gains `end?: RunEnd`. `runs` gains `end_result`, `end_pr`.

- `PR_OPEN` with the repository gate on: the claim owner becomes `gate`, and a job is queued.
- `RESOURCE_DOWN`: release as excused, and open a hold on `resource`.
- Any other value, or `null`: release if still claimed.

### 2.4 Claims

```ts
type TaskRef = { key: string; resources: string[] };
interface ClaimGateway { // adapter runs the argv commands of loop_probes
  claim(cfg: ProbeSettings, task: TaskRef): Promise<{ ok: true } | { ok: false; reason: string }>;
  release(cfg: ProbeSettings, task: TaskRef, why: { reason: string; excused: boolean }): Promise<void>;
}
interface ClaimRepository {
  open(c: { id: string; loopId: string; taskKey: string; runId: string; at: Date }): Promise<'opened' | 'taken'>;
  listOpen(loopId: string): Promise<ClaimRecord[]>;
  findOrphaned(limit: number): Promise<ClaimRecord[]>; // owner is a run that is neither running nor held
  handOver(id: string, gateJobId: string): Promise<void>;
  close(id: string, reason: string, at: Date): Promise<void>;
}
```

Order: `open`, `claim`, run. A refused claim closes the row. The tick releases orphaned claims. A usage limit, a restart and `RESOURCE_DOWN` are excused. `E release <n> --if-claimed --excused` adds a `loop-excused:` line, and `attemptsOf` skips it. `--if-claimed` does nothing with no work label, because plain `release` reopens a closed issue.

### 2.5 Resource hold

```ts
type ResourceHold = { id: string; resource: string; reason: string; openedAt: Date; until: Date | null;
  checkedAt: Date | null; closedAt: Date | null; openedByRunId: string | null };
```

An index allows one open hold per `resource`. `plan-window` is reserved, and it stops every probe loop. A loop setting `resources: [{ name, check: string[], everySec }]` names a check, and exit 0 means up. Other holds stop only tasks that list the resource. `plan-window` closes at `until` plus 60 s. Then `held` runs resume, oldest first.

New final executor event, in place of `result`: `{ type: 'usage_limit'; resetsAt: Date | null; limitType: string | null; message: string; costUsd?: number }`. Triggers: `rate_limit_event` with `rate_limit_info.status === 'rejected'`, an assistant `error: 'rate_limit'`, or an error result with the text `You've hit your`. For a loop with no probe, `RunService` writes `failed` with `message`, as today.

A `held` run has no process and keeps its row and session id. `cancel` and `finish` accept `held`. Resume sets `running` and a new `deadline_at`, then calls the executor with `resumeSessionId`. `ExecutionInput` gains `resumeSessionId?`, `env?: Record<string, string>`, `gateGuard?: boolean`, `toolProfile?: 'full' | 'review'`.

### 2.6 Notifier

```ts
type Notice = { dedupeKey: string; kind: 'wait' | 'hold' | 'blocked' | 'gate' | 'goal_card' | 'probe_failed';
  loopId: string | null; messageKey: string; params: Record<string, string | number>; at: Date };
interface Notifier { send(n: Notice): Promise<void> } // one unread notice per dedupeKey; never throws
```

`StoreNotifier` writes `notices`. `WebhookNotifier` posts `{ kind, text, at }` only when `LOOPS_NOTIFY_WEBHOOK` is set. Routes: `GET /api/notices`, `POST /api/notices/:id/read`.

### 2.7 Lanes and lifecycle text

Slot `k` is the lowest free one, from 0. The env holds `CASTRAFERRUM_SLOT=k` plus `loop_probes.lane_env`, with `{slot}` and `{port}` (`lane_base_port + k`) filled in. The prompt snapshot of a probe run gains one line, and a unit test re-reads both lines from `docs/ARCHITECTURE.md`:

- `[Castraferrum] The console claimed task <key> for this run (action <take or plan>). Do not run next or claim. Do this task only.`
- Resume message: `[Castraferrum] The usage limit has reset. Continue the same task from where you stopped.`

### 2.8 Gate record and commit status

Steps in order: `scope`, `base`, `setup`, `green`, `stub`, `verify`, `ci`, `merge`.

```ts
type GateJob = { id: string; repoId: string; prNumber: number; headSha: string; taskKey: string | null;
  state: 'queued' | 'running' | 'merged' | 'failed' | 'needs_ratification'; failedStep: string | null;
  queuedAt: Date; startedAt: Date | null; finishedAt: Date | null; ratifiedAt: Date | null };
type GateStep = { jobId: string; seq: number; step: string; status: 'pass' | 'fail' | 'skip';
  exitCode: number | null; ms: number; outputTail: string }; // last 60 lines
```

- One job runs at a time. `POST /api/gate/jobs` queues a PR by hand.
- Status: context `castraferrum/gate` on the PR head, state `success` or `failure`, description `<step>: <one line>`.
- A failure comments `outputTail` on the task issue and releases the task, not excused.
- A guarded change gives `needs_ratification`. `POST /api/gate/jobs/:id/ratify` skips only `scope`.
- If the check run of `main` is red, the gate opens one issue, and only a PR that closes it merges.
- Merge: `gh pr merge --squash --match-head-commit <sha>`, then `check_command`. If `main` moved after `base`, the job runs again one time.
- Audit: a merged PR with no `success` status is one incident.

### 2.9 Data files on `main`

These live under `goals/`, the scope guard protects them, and the gate reads them only from `origin/main`.

```json
{"v":1,"setup":["npm ci"],"verify":["npm run verify"],"env":{"LOOPS_TEST_DATABASE_URL":"postgres://loops:loops@127.0.0.1:55432/gate_test","LOOPS_E2E_PORT":"7171"},"guarded":["goals/**","scripts/ratchets.json","scripts/ratchets.mjs","scripts/*-check.mjs",".github/**",".githooks/**"],"testGlobs":["**/*.test.ts","tests/**"]}
```

That is `goals/gate.json`. `goals/verify/<epic-slug>.json` has one entry per task key:

```json
{"v":1,"tasks":{"141":{"green":[{"run":"npx vitest run tests/api/claims.test.ts","expect":["7 passed"]}],"stub":{"run":"npx vitest run tests/api/claims.test.ts"}},"142":{"green":[],"stub":{"none":"docs only"}}}}
```

Stub run: restore each changed file outside `testGlobs` to the base commit. `stub.run` must then exit non-zero. A task with no entry fails at `green`. A plan PR changes only `goals/verify/**` and `docs/plans/**` and only adds keys. It passes `scope` and skips `green` and `stub`.

### 2.10 Goal manifest and standing goals

`goals/<date>-<slug>.json` keeps the `goal-check.mjs` format, plus `"opened":{"at":"<ISO>","passed":0,"total":n}`. A goal gains `"cadence":"merge"|"nightly"` and `"d7":true`. A check gains `"score":"<regex with two number groups>"`. The epic body holds `Goal manifest: goals/<file>.json`. With no such line an epic behaves as today. A `d7` row passes when its tool test passes, and prints "not measured yet".

`goal-check --json` prints `{"goals":[{"id":"G4","pass":false,"value":72,"of":240,"line":"G4 72/240 screens"}],"passed":3,"total":8,"sha":"abc1234"}`. The console then comments on the epic `loop-goals: {"passed":3,"total":8,"failing":["G4"],"sha":"abc1234"}`, and `E next` reads the last such comment.

`goals/health.json`:

```json
{"v":1,"cron":"0 2 * * *","timezone":"Asia/Ho_Chi_Minh","epic":0,"maxNewIssuesPerPass":3,"rows":[{"id":"H1","outcome":"The nightly verify passes","run":"npm run verify","timeoutSec":3600}]}
```

### 2.11 Fingerprint

`fingerprint(repo, rowId, line)` in `shared/domain/fingerprint.ts`: the first 12 hex characters of the sha256 of `repo\nrowId\nnormalized`. `normalized` is the first failing line in lower case, with each path, timestamp, number and hex run of 7 or more replaced by `n`. The issue body holds `<!-- fingerprint:<hash> -->`, found with `"<hash>" in:body`. A match gets a new "Last failed" line.

### 2.12 Process review output

`reports/process-review/<date>.json`, ignored by git:

```json
{"v":1,"from":"2026-10-19","to":"2026-10-22","clusters":[{"id":"usage-limit","cause":"one sentence","events":12,"runIds":["<uuid>"],"firstAt":"<ISO>","lastAt":"<ISO>","repo":"hieplam/castraferrum","fingerprint":"<hash>","check":{"kind":"hook|lint|test|eval|probe","name":"<file>","replay":"<command>"}}]}
```

`scripts/process-file-issues.mjs <file>` has no model. It opens one issue per cluster with 2 or more events and applies 2.11. Inputs: `GET /api/process/events?from&to` (`runs`, `gate_steps`) and `loop-release:`, `loop-found:` comments.

### 2.13 Charter and goal card

`goals/charter.json`:

```json
{"v":1,"purpose":"one paragraph","mayStartAlone":["..."],"neverAlone":["history rewrite","force push","deleting user data","branch deletion","creating tokens","spending money","a public release","deleting a feature"],"refusalWindow":{"enabled":false,"hours":8},"acceptedWithNoChange":0}
```

A goal card is an issue with the label `goal-card` and one JSON block:

```json
{"v":1,"title":"short","rows":[{"id":"G1","outcome":"...","oracle":"...","threshold":"..."}],"size":{"planWindows":0.5},"door":"two-way","next":["..."]}
```

Table `goal_cards`: `state` is `proposed`, `accepted`, `refused` or `started`. `start_after` is set only with the window on and a `two-way` door. An index allows one `proposed` card per repository.

### 2.14 Rank and budget

`loop_probes` gains `rank integer not null default 100` (a smaller number is a higher rank) and `token_budget bigint`. `runs` gains `tokens bigint`. `PlanWindow.read()` returns `{ utilization: number | null; resetsAt: Date | null }`.

Rule: a loop starts a run when no higher-rank loop last printed `take` or `plan`. Otherwise it starts one only when `resetsAt` is under 45 min away and `utilization` is under 90. With `null` it does not start. At `token_budget` the state is `budget_limited`, and no run starts.

## 3. Module map

Each repository port has a `postgres/` and a `memory/` adapter.

- **Issue 212.** `shared/`: `contracts/goal-loop.ts`, `domain/goal-loop.ts`, `domain/run-end.ts`. Ports: `command-runner`, `claims`, `loop-probe-repository`, `hold-repository`, `notifier`. Services: `probe-service`, `hold-service`, `notice-service`. Adapters: `process/node-command-runner`, `claims/command-claim-gateway`, `notify/store-notifier`, `notify/webhook-notifier`. Entry: `http/probe-routes`, `http/notice-routes`, `scheduler/background-ticker` (each second, one `tick()` per service, a busy service is skipped). Script: `install-logon-task.ps1`.
- **Issue 213.** `shared/domain/merge-guard.ts`, `scope-guard.ts`. Ports: `git-host`, `gate-workspace`, `gate-repository`. Service: `gate-service`. Adapters: `github/gh-cli-host`, `git/git-worktree-workspace`. Entry: `http/gate-routes`. Script: `merge-audit.mjs`.
- **Issue 214.** `shared/domain/fingerprint.ts`. Port: `goal-repository`. Services: `goal-service`, `standing-goal-service`. Entry: `http/goal-routes`.
- **Issue 215.** Service: `process-service`. Entry: `http/process-routes`. Scripts: `rule-lint.mjs`, `process-file-issues.mjs`, `review-due.mjs`.
- **Issue 216.** Ports: `goal-card-repository`, `plan-window`. Service: `goal-card-service`. Adapter: `executors/claude/claude-plan-window` (only that folder imports the SDK). Entry: `http/goal-card-routes`. Script: `goal-writer-probe.mjs`.
- **`web/`.** One `features/` folder and one `pages/` route each: `goal-loop`, `gate`, `goals`, `scoreboard`, `goal-cards`. New services call `RunService` and `LoopService`, and neither calls back.

Migrations, by name, generated by `npm run db:generate` (a lane regenerates after a rebase): `loop_probes` (P3), `notices` (P9), `run_claims` with `runs.task_key`, `runs.slot`, trigger word `probe` (P5), `run_end` (P5), `holds` with status `held`, `runs.resume_count` (P8), `goal_met` (P10), `gate` with `gate_jobs`, `gate_steps`, `repo_gate`, `run_claims.owner`, `run_claims.gate_job_id` (K2), `goals` with `goal_runs` (T2), `standing_goals` with `standing_issues`, `standing_schedule` (T5), `goal_cards` (W2), `rank` with `loop_probes.rank`, `loop_probes.token_budget`, `runs.tokens` (W5).

Shared files, with small edits. A conflict takes the union.

- `server/compose.ts`: one service line, one entry in the array `background`. Move no code.
- `server/services/contracts.ts`, `server/ports/repositories.ts`, `postgres/repositories.ts`, `memory/index.ts`, `server/http/app.ts`: append one block.
- `postgres/db.ts`: `truncateAll` is a fixed list, so add each new table.
- `shared/i18n/en.ts`, `vi.ts`, `docs/API.md`, `docs/USE-CASES.md`: append.
- `run-service.ts` and `claude-agent-executor.ts`: only P5, P6, P7, P8, K7, K8, R4 edit them, and the graph chains these tasks.

**GitHub in tests.** F2 adds `tests/support/fake-gh.mjs` and `tests/support/bare-repo.ts`. `GitHost` runs the binary in `LOOPS_GH_BIN`, which the config accepts only with a `*_test` database, like `LOOPS_MOCK_EXECUTOR`. The fake keeps PRs, checks, statuses, issues, labels and comments in the JSON file `FAKE_GH_WORLD`. `git` runs for real on a local bare repository, and `pr merge` merges there. ap tests keep `EPIC_LOOP_GH_MODULE`.

## 4. Task graph

Each task is one PR. "Now" means that it can start at once. An ap task keeps its issue in cf, and its PR says `Closes hieplam/castraferrum#<n>`. ap has no CI, so its proof is `node --test` plus the eval.

| Id | Title | Repo | Goals | Needs | Area | Tier: reason | Now |
|---|---|---|---|---|---|---|---|
| F0 | Measure every ratchet baseline, read `runs` of `loops` read-only (227 rows) | cf | all | none | `scripts/metrics` | sonnet: rules given | Now |
| F1 | Goal manifest of this epic, red at 0 of n | cf | all | none | `goals/` | sonnet: rows given | Now |
| F2 | Fake GitHub, bare repository kit | cf | G4, G6-G9, G13 | none | `tests/support` | sonnet: spelled out | Now |
| S1 | Spike: limit order, resume, cost | cf | G3 | none | evidence | sonnet: one script | Now |
| S2 | Spike: hook under bypass | cf | G27 | none | evidence | sonnet: one script | Now |
| S3 | Spike: stub run time, CSS case | cf | G7 | none | evidence | sonnet: replay | Now |
| S4 | Spike: plan window with no model | cf | G21 | none | evidence | sonnet: one script | Now |
| S5 | Spike: grouping quality, fixture | cf | G14 | none | `tests/fixtures` | opus: judges model output | Now |
| S6 | Spike: cost of an eval pass | ap | G17 | none | evidence | sonnet: one run | Now |
| D1 | Design gap issue, status rows, preview | cf | G11, G28 | none | `design/` | opus: design | Now |
| D2 | Owner approval of the preview, the only gate | cf | G11, G28 | D1 | `design/APPROVED.md` | owner | |
| P1 | `CommandRunner` port, adapter | cf | G1 | none | ports, adapters | sonnet: small | Now |
| P2 | Probe and run-end parsers | cf | G1, G4 | none | `shared/` | sonnet: pure | Now |
| P3 | Probe settings: table, routes | cf | G1 | P2 | repository, http | sonnet: known pattern | |
| P4 | `ProbeService`, background ticker, ADR 0004 | cf | G1, G2 | P1, P3 | services | opus: process control | |
| P5 | Claim, start, release on the tick | cf | G2, G4 | P4 | services | opus: claim ownership | |
| P6 | Lanes: slot, env, lifecycle line | cf | G24 | P5 | run service | sonnet: spelled out | |
| P7 | Executor: `usage_limit`, resume | cf | G3 | S1, P2, P6 | Claude executor | opus: input queue | |
| P8 | Holds, `held`, resume, stop on held | cf | G3, G23 | P5, P7, P9 | services | opus: state machine | |
| P9 | Notifier, `notices`, webhook | cf | G23 | none | ports, adapters | sonnet: spelled out | Now |
| P10 | `wait`, `blocked`, `done`, `goal_met` | cf | G1, G28 | P4, P9 | services | sonnet: table 2.1 | |
| P11 | Restart policy, smoke step | cf | G5, G4 | P8 | recovery | opus: start-up order | |
| P12 | Log-on task script, not installed | cf | G5 | none | `scripts/` | sonnet: dry-run test | Now |
| P13 | `E next --probe`, `--if-claimed`, `--excused`, `needs:` labels, tick console mode | ap | G1, G4, G23 | none | `epic.mjs`, `tick.md` | sonnet: contract given | Now |
| P14 | End-to-end: idle and gap | cf | G1, G2 | P6, P10 | `tests/e2e` | sonnet: fake probe | |
| P15 | Loop state, editor fields, notices | cf | G28 | D2, P8, P10 | `web/` | sonnet: preview given | |
| K1 | `gate.json`, verify data, scope guard | cf | G9 | none | `shared/`, `goals/` | sonnet: pure | Now |
| K2 | Gate tables, `repo_gate` | cf | G6 | P5 | repository | sonnet: known pattern | |
| K3 | `GitHost`, `gh` adapter | cf | G6 | F2, P1 | adapters | sonnet: thin | |
| K4 | `GateWorkspace`: worktree, stub restore | cf | G7 | F2, P1, S3 | adapters | opus: git edge cases | |
| K5 | `GateService`: queue, steps | cf | G6, G7, G9 | K1-K4 | services | opus: the gate | |
| K6 | Failure feed, red `main`, ratify | cf | G6 | K5 | services | opus: the gate | |
| K7 | Run-end handover to the gate | cf | G4, G8 | K5, P8 | services | opus: claim ownership | |
| K8 | Merge guard hook | cf | G27 | S2, P7 | Claude executor | sonnet: regex list | |
| K9 | `merge-audit.mjs` | cf | G6 | F2 | `scripts/` | sonnet: one query | |
| K10 | Tick ends at `PR_OPEN`, step 7 fix, `E check` reads the status, eval | ap | G8 | P13 | `tick.md`, `epic.mjs` | sonnet: spelled out | |
| K11 | Gate oracle tests, control PRs | cf | G6, G7, G9 | K6, K7 | `tests/api` | opus: fake world | |
| K12 | Gate pages, repository switch | cf | G6 | D2, K6 | `web/` | sonnet: preview given | |
| T1 | `goal-check --json`, score, cadence | cf | G11 | none | `scripts/` | sonnet: spelled out | Now |
| T2 | `GoalService`: rows after merge, `loop-goals:`, a fall opens an issue | cf | G11 | T1, K5 | services | opus: gate order | |
| T3 | `E next`: refusal, `plan`, close on check, `plan` reference | ap | G10, G25, G26 | P13 | `epic.mjs` | opus: loop decision | |
| T4 | Console handles `plan` | cf | G25 | P5 | probe service | sonnet: table 2.1 | |
| T5 | Standing goals, fingerprint | cf | G13 | K3 | services | opus: dedupe rules | |
| T6 | `goals/health.json`, audit row | cf | G13, G6 | T5, K9 | `goals/` | sonnet: data file | |
| T7 | Goal number and rows on the loop page | cf | G11 | D2, T2 | `web/` | sonnet: preview given | |
| R1 | Count rule lines, `rule-lint` | cf | G16 | none | `scripts/` | sonnet: one lint | Now |
| R2 | `/api/process/events`, fixture | cf | G14 | S5 | http, tests | sonnet: spelled out | |
| R3 | `process-file-issues`, `review-due` | cf | G14 | F2 | `scripts/` | sonnet: rule 2.11 | |
| R4 | Tool profile `review` | cf | G14 | K8 | Claude executor | sonnet: small | |
| R5 | Skill: process review | ap | G14 | S5 | skill | opus: prompt | |
| R6 | Replay oracle, real and recorded | cf | G14 | R2-R5 | `tests/api` | opus: judges model output | |
| R7 | Eval gate for `tick.md`, `drive.md` | ap | G17 | S6 | `scripts/evals` | sonnet: one check | |
| R8 | Gate refusals as an input | cf | G14 | K5, R2 | http | sonnet: one query | |
| R9 | Scoreboard API, page | cf | G15 | D2, R8 | http, `web/` | sonnet: preview given | |
| W1 | `PlanWindow` port, adapter | cf | G21 | S4, K11, T6 | Claude adapter | opus: experimental API | |
| W2 | Charter, card, `GoalCardService` | cf | G19, G20 | K11, T6 | services | opus: door rules | |
| W3 | Writer probe | cf | G18 | W2 | `scripts/` | sonnet: spelled out | |
| W4 | Skill: goal writer, queue clean-up | ap | G18 | W2 | skill | opus: prompt | |
| W5 | Rank and budget | cf | G21 | W1 | probe service | opus: shared window | |
| W6 | Accepted card becomes manifest and loop | cf | G18 | W2, T3 | services | opus: starts real work | |
| W7 | End-to-end: next card appears | cf | G18 | W3, W4, W6 | `tests/e2e` | sonnet: fake world | |
| W8 | Goal cards page, rank fields | cf | G19, G20 | D2, W2, W5 | `web/` | sonnet: preview given | |
| Z1 | Verify: every row with `goal:check`, `E check --dry-run` on each task | cf | all | all above | `goals/` | sonnet: run and file | |
| Z2 | Agent acceptance: each new screen, both widths and themes | cf | all | Z1 | `tests/e2e` | opus: judges images | |

Tasks: foundation 13 (with Z1, Z2), issue 212: 15, 213: 12, 214: 7, 215: 9, 216: 8. Total 64.

**Spikes.** Each spike writes its answer to the evidence log. A changed design adds one line to section 6.

| Id | Literal question | Way to answer | If no |
|---|---|---|---|
| S1 | In which order do `rate_limit_event`, assistant `error` and `result` arrive? Does `query()` with `resume` and streaming input keep the session id? Does `total_cost_usd` restart at 0? | Read the 12 failed transcripts. `scripts/spikes/resume.mts` (haiku): stop after one turn, resume, log each message type | A limit restarts the task in a fresh run, excused |
| S2 | Does a `PreToolUse` hook of SDK option `hooks` refuse Bash under `bypassPermissions`, in the main thread and in a subagent? | Haiku, `GH_TOKEN=invalid`, a logging fake `gh`: ask for `gh pr merge 1` in both | A refusing `gh` shim goes first on `PATH` |
| S3 | How long does a stub run take on the largest of the last 100 merged PRs? Does a CSS-only change go red? | In a worktree, restore non-test files to the base, run its tests, time them. Repeat with one CSS PR and its visual test | Plans name fewer tests. A CSS task uses `stub.none` with its reason |
| S4 | Can a `query()` with no user message call `usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true })` with no model turn? Does a normal run carry `utilization`? | `scripts/spikes/window.mts`, read `total_cost_usd` | Use the last `rate_limit_info.utilization` |
| S5 | Does one read-only haiku run on sanitized rows name Smart App Control and usage limits in 3 of 3 tries? | Build `tests/fixtures/process-review/runs.json`, run 3 times | Try sonnet, then give counts of normalized lines |
| S6 | What does one `run_evals.py` pass over 5 evals cost? | Run it once, read the cost | Over $2: the gate needs the tick cases only |

## 5. UI inventory

Each page opens from a `.cell.is-link` under Settings or the loop page, so the tab bar keeps three tabs.

| New thing | Component |
|---|---|
| Loop state, run `held` | `.pill` (gap), `.now`, `.cmd` for the last probe line |
| Probe settings, rank, budget | `.field`, `.input`, `.switch`, `.hint` |
| Notices, holds | `.banner.is-warn`, `.group`, `.cell`, `.note` |
| Goals figure, goal rows, standing goals | `.stat`, `.group`, `.cell`, `.pill` |
| Gate queue, record, output | `.group`, `.cell`, `.pill` (gap), `.log`, `.btn.primary`. Repository switch: `.switch` |
| Scoreboard | `.stats`, `.group`, `.cell-value.is-data`: one number per week, no chart |
| Goal card | `.card`, `.group`, `.pill` (gap), `.data`, `.btn.primary`, `.btn.danger` |

**One real gap.** The status table in `SYSTEM.md` (Content) has no rows for the states of 2.2, the gate job states, the goal card states and the door words. The pill classes exist, so no class, token or colour is new. D1 opens one `design-system` issue, adds the rows, and draws these preview states: `loop-waiting`, `loop-held`, `loop-blocked`, `loop-complete`, `run-held`, `gate-queue`, `gate-failed`, `goal-rows`, `scoreboard`, `goal-card-two-way`, `goal-card-one-way`. D2 is the only owner gate. Only tasks P15, K12, T7, R9, W8 wait for it.

## 6. Decisions

1. Rows G23 to G28 follow the global rule that a stated behaviour has a row. They add no outcome.
2. Issue 212 says that the console reads only `action`, but `take` claims tasks. The console also reads the fields of 2.1, as opaque values.
3. Issue 212 says that one limit holds every loop. Decision 4 of the epic keeps a no-probe loop as it is, and decision 4 wins: a hold covers probe loops only.
4. A claim has one owner, a run or the gate. So G4 and "the gate releases a failed PR" do not conflict.
5. The run-end signal does not come from `summary`. `cut()` keeps 500 characters, and 0 of 167 real summaries hold the JSON line. K10 corrects `tick.md` step 7.
6. `epic.mjs next` prints five words today. `hold` and `plan` are new.
7. `usage_limit` is a final event, so "exactly one final event" holds.
8. A run status `held`, not a flag on `running`: `expireOverdue`, recovery and the insert-only trigger then leave it alone.
9. A table `loop_probes`, not columns on `loops`: `version` stays unchanged. A probe loop has `next_run_at` null, so `findDue` needs no change, and Start skips `startFirst`.
10. Probe, claim and release are argv commands that the loop owns, so the console knows no issues.
11. The tick releases orphaned claims, so a missed event leaves no claim. Recovery only marks runs.
12. Issue 214 writes tasks late, and issue 213 guards `goals/`. So a plan PR may add new keys, and no PR may change an old key. A plan run and a worker are different runs.
13. Ratify is a console route, because the owner and the worker share one `gh` login. The hook also refuses `gh api` calls that merge or set `castraferrum/gate`.
14. Goal results live in `loop-goals:` comments, because `epic.mjs` has no database.
15. The model groups, and a script files. So G14 has a stable recorded test, and only one test needs a model.
16. The review loop is a normal probe loop. The console adds only `/api/process/events` and the profile `review`.
17. The goal writer waits for K11 and T6, not for pages. Its safety needs the gate and the check.
18. `resetsAt` is in epoch seconds. Evidence: session `464e9f06`: 1792677600 is 14:00 UTC, equal to its text "resets 9pm". The field sits in `rate_limit_info`, only `rejected` stops a run, and both fields are optional.
19. The rows of issue 215 hold Vietnamese text and loop names. S5 writes English fixture lines, and F0 prints no loop name.
20. A 60 s probe fits: `E next` took 4.3 s on 67 tasks and 1.9 s on 10.
21. `summary` cannot prove the 108 of G1. F0 counts sessions whose transcript has no `Edit`, `Write`, `git push` or `gh pr create`. F0's number replaces 108 if they differ.

**`docs/ARCHITECTURE.md`.** P4: services, ports, tables. P8: line 448 becomes "Start, Stop and hold; a hold pauses runs for a resource". P11: line 447 and line 231 become a per-loop `restartPolicy`, default `stop`, and the header of `scripts/restart-console.ps1` follows.

**ADR 0004 (P4): the console owns the life cycle of a goal, not the work.** ADR 0001 holds: each task gets a fresh session, and a resume after a limit continues the same run. The console reads words from a command that the loop owns and sends only lifecycle lines. A loop with a free-text condition has no probe and stays on cron.

## 7. Outside this epic

- Cabal: `tools/preflight.js` as a probe, a `client-verify` gate step, its sensors as standing goals.
- Cabal: its rule errors as review input, `docs/VISION.md` as writer input, its frozen issues.
- A GitHub Pro ruleset on `castraferrum/gate`, if the owner buys the plan.
- Issues 209 and 211, and the stale `uc-coverage` number (32 in docs, 33 in `package.json`).
- Old owner-approval tasks of epics 46 and 138, after W4.
- Real phone push, after epic 46.
- The missing `~/.copilot/ste/ste_dict.py`, as input for the first real review.
