# Plan of issue 212: probe, claim, hold, resume

Phase: issue 212 of epic 217. Spec: [goal-driven loop](../specs/2026-11-01-goal-driven-loop.md). Plan index: [index](2026-11-01-goal-driven-loop.md). Later waves add the other tasks of this phase. Unit count below means `npx vitest list --project unit 2>/dev/null | wc -l`: 428 on 2026-11-01, measure yours at Red. In the `agent-plugins` tasks, `SK` is `plugins/epic-loop/skills/epic-loop`. Wave 2: each code task changes existing server code, so its Green ends with one full `npm run verify`, in a slot, about 20 minutes. A `verify` failure that your change cannot reach follows the lane rules (issues 265, 272, 274). Concurrency tests use `k.clock`, `flush()`, `until()` and deferred promises, as `scheduling-service.test.ts` does. They never sleep and never assert on elapsed real time.

## P1 - CommandRunner port, adapter

**Files:** `server/ports/command-runner.ts`; `server/adapters/process/node-command-runner.ts` and its `.test.ts`.

**Steps:**
1. Port: `run(req: CommandRequest): Promise<CommandResult>` never rejects. `CommandRequest = { argv: string[]; cwd: string; timeoutMs: number; env?: Record<string, string>; maxBytes?: number }`. `CommandResult = { exitCode: number | null; stdout: string; stderr: string; timedOut: boolean; error: string | null }`.
2. `NodeCommandRunner`: `spawn`, `shell: false`, `windowsHide: true`. Each stream keeps its last `maxBytes` (default 1 MiB).
3. At the time-out, kill the tree (win32 `taskkill /pid <p> /T /F`, else `SIGKILL`). Resolve at most 1 s later, also with no `close` event.
4. Test first, 9 cases: exit 0; non-zero exit and stderr; argument `a && echo hacked` arrives as one literal; missing binary gives null `exitCode` and `error`; empty `argv` too; time-out; time-out with a grandchild that holds stdout resolves in `timeoutMs` + 2 s; `cwd`, `env`; output over `maxBytes` keeps the last line.

**Goal:** G1. The console runs a probe argv with no shell and no model, and a hung probe cannot hang it.

**Red:** `npx vitest run --project unit server/adapters/process/node-command-runner.test.ts` prints `Error: Cannot find module './node-command-runner'`.

**Green:** the same command prints `Tests  9 passed (9)`. `npm run arch` exits 0.

**Stub check:** make `run` return `exitCode: 0` with empty text: at least 7 cases fail. Run it, restore.

**Ratchet:** unit count rises by 9.

## P2 - Probe and run-end parsers

**Files:** `shared/domain/run-end.ts`, `shared/domain/goal-loop.ts`, a `.test.ts` for each, `tests/fixtures/run-summaries.json`.

**Steps:**
1. Fixture: read each non-null `runs.summary` of the real database, read-only. Change each letter, digit, number sign and non-ASCII character to `x`. Keep other characters. Write the JSON array.
2. `parseRunEnd`, spec 2.3: read the last non-empty line, strip outer backticks. Return `null` unless it is a JSON object with a string `result`. A non-string `pr` or `resource` becomes `null`.
3. `goal-loop.ts`: the types of 2.1, and `parseProbeLine(stdout): { ok: true; line; raw } | { ok: false; reason; raw }`. `issues` is `string[]`. `raw` is cut at 2000 bytes on a character edge. No zod, because a service cannot import it (`.dependency-cruiser.cjs`).
4. Tests, run-end 13: the 167 rows; empty; text then the cut line `{"epic":63,`; prose after a JSON line; `{"a":1}`; `[1]`; `PR_OPEN`; `RESOURCE_DOWN`; no `resource`; CRLF and blanks; backticks; number in `pr`; `FOO` kept.
5. Tests, probe 21: 7 valid actions; log lines first; 5 missing required fields; not JSON; `v` 2; unknown action; key `a b`; 101-character key; empty; extra keys; 3000-byte multibyte line.

**Goal:** G1, G4. The console acts on a valid line only, and `null` for all 167 real summaries.

**Red:** `npx vitest run --project unit shared/domain/run-end.test.ts shared/domain/goal-loop.test.ts` prints `Error: Cannot find module './run-end'`.

**Green:** the same command prints `Tests  34 passed (34)`. Run `docker exec loop_console_pg psql -U loops -d loops -At -c "select count(*), count(*) filter (where summary like '%\"result\"%') from runs where summary is not null"`. It prints `167|0`.

**Stub check:** an always-`null` `parseRunEnd` fails `PR_OPEN`. An always-failing `parseProbeLine` fails the 7 actions. Run both, restore.

**Ratchet:** unit count rises by 34.

## P3 - Probe settings: table, routes

**Files:** `schema.ts`, migration, `db.ts`, `server/ports/loop-probe-repository.ts`, the 3 repositories files, both adapters, `memory-db.ts`; `server/services/probe-service.ts` and test, `contracts.ts`; `server/http/probe-routes.ts`, `app.ts`, `compose.ts`; `shared/contracts/goal-loop.ts`, `docs/API.md`; tests `tests/api/probe-settings-api.test.ts`, `api-surface.test.ts`, `repositories.contract.ts`.

**Steps:**
1. Table `loop_probes`: `loop_id` primary key to `loops`; jsonb `command`, `claim`, `release`, `resources`, `lane_env`; `lane_base_port`; `restart_policy` (`stop`, `resume`, default `stop`); `state` (2.2, default `active`); `last_line`; `last_probe_at`. Add to `truncateAll`.
2. Port: `get`, `list`, `upsert`, `remove`, `record(loopId, { state, lastLine, at })`.
3. `DefaultProbeService`: `get`, `save`, `remove`; P4 adds the tick. An active loop gives `LOOP_IS_ACTIVE`, an archived one `LOOP_ARCHIVED`. Issues: `claim:missingKey`, `release:missingKey`, `release:missingReason`, `resources:reserved` (`plan-window`).
4. `GET`, `PUT`, `DELETE /api/loops/:id/probe`. No row gives `{ probe: null }`. Add 3 to the count in `api-surface.test.ts`.
5. Tests: contract 6 under `describe('loop_probes')`, service 8, API 7, with `testPool` reads.

**Goal:** G1. A loop can hold a probe, and a loop with none behaves as today.

**Red:** `npx vitest run --project api tests/api/probe-settings-api.test.ts` prints `Tests  7 failed (7)`.

**Green:** the same command prints `Tests  7 passed (7)`. `npx vitest run --project unit server/services/probe-service.test.ts` prints `Tests  8 passed (8)`. `npx vitest run --project contract -t loop_probes` prints `12 passed`. `npx vitest run --project api tests/api/api-surface.test.ts tests/api/db-migrate.test.ts` exits 0.

**Stub check:** remove the `upsert` call: the `testPool` reads fail. Run it, restore.

**Ratchet:** `npm run test:contract`: each side rises by 6.

## P9 - Notifier, notices, webhook

**Files:** `server/ports/notifier.ts`; `server/adapters/notify/` with `notifier.test.ts`; notice repository adapters; `schema.ts`, migration, `db.ts`, the 3 repositories files; `server/services/notice-service.ts`, `contracts.ts`; `server/http/notice-routes.ts`, `app.ts`, `errors.ts`, `compose.ts`, `main.ts`, `config.ts`; `shared/domain/notice.ts`, `errors.ts`; `shared/contracts/`; `shared/i18n/*.ts`; `docs/API.md`; `tests/api/notices-api.test.ts`, `api-surface.test.ts`, `repositories.contract.ts`.

**Steps:**
1. Table `notices`: 2.6 fields, `loop_id` nullable, `read_at`, a partial unique index on `dedupe_key` where `read_at` is null. Add to `truncateAll`.
2. `Notifier.send(n): Promise<void>` never rejects. `NoticeRepository`: `insertUnread`, a no-op on a second unread key; `listUnread(limit)`; `markRead(id, at)`.
3. `noticeText(key, params)` fills `en`. Add `notice.wait`, `.hold`, `.blocked`, `.gate`, `.goalCard`, `.probeFailed` with `{reason}` to both locales.
4. `WebhookNotifier`: 5 s time-out. `FanoutNotifier` calls each. Config `notifyWebhook`, `ComposeOptions.notifyWebhook`, `ComposedServer.notifier`.
5. Routes: unread, newest first, limit 100. New code `NOTICE_NOT_FOUND` (404). Add 2 to the `api-surface` count.
6. Tests: contract 5 under `describe('notices')`; notifier 6; API 5: send twice gives 1 row; read, then send gives a new row; unknown id; a local webhook gets the body; no webhook posts nothing.

**Goal:** G23. One cause gives one unread notice, and one push if a webhook is set.

**Red:** `npx vitest run --project api tests/api/notices-api.test.ts` prints `Tests  5 failed (5)`.

**Green:** the same command prints `Tests  5 passed (5)`. `npx vitest run --project unit server/adapters/notify/notifier.test.ts` prints `Tests  6 passed (6)`. `npx vitest run --project contract -t notices` prints `10 passed`. `npm run typecheck` exits 0.

**Stub check:** a `send` that does nothing fails the API cases. Run it.

**Ratchet:** `npm run test:contract`: each side rises by 5.

## P12 - Log-on task script, no install

**Files:** `scripts/logon-task.mjs`, `tests/tools/logon-task.test.ts`, `README.md`.

**Steps:**
1. `node scripts/logon-task.mjs [--console-dir <abs>] [--port 7070] [--task-name Castraferrum] [--out <file>]` prints Task Scheduler XML. With `--out` it writes UTF-16 LE with a BOM, then prints the `schtasks /Create /TN "<name>" /XML "<file>"` line for the owner.
2. The script imports no `node:child_process`, so it cannot install.
3. XML: `LogonTrigger` with `<Delay>PT1M</Delay>`, `InteractiveToken`, `LeastPrivilege`, `IgnoreNew`, `RestartOnFailure` `PT1M` count 10, `ExecutionTimeLimit` `PT0S`, no stop on battery. The action runs `powershell.exe` with `npm start` in the console folder and `LOOPS_PORT` set.
4. Tests, 8: trigger; folder and port; `&` and `'` escaped; relative `--console-dir` exits 2; bad port exits 2; restart settings; `--out` BOM and `schtasks` line; source has no `child_process`.
5. Add a row to the Scripts table of `README.md`.

**Goal:** G5. The owner gets one file and one command that start the console at log-on. No agent installs it (epic decision 6).

**Red:** `npx vitest run --project unit tests/tools/logon-task.test.ts` prints `Tests  8 failed (8)`.

**Green:** the same command prints `Tests  8 passed (8)`. `schtasks /Query /TN Castraferrum` exits 1 with `ERROR: The system cannot find the file specified.`

**Stub check:** a script that prints `<Task/>` fails the trigger, folder and restart cases. Run it, restore.

**Ratchet:** unit count rises by 8. Metric `idle-days`: decision 7, "not measured yet".

## P13 - E next --probe, --if-claimed, --excused, needs: labels, tick mode

**Files, `hieplam/agent-plugins`, worktree `../agent-plugins-probe` from `origin/master`:** in `SK`: `scripts/epic.mjs`, `scripts/tests/epic.test.mjs`, new `scripts/tests/check-tick.test.mjs`, `references/tick.md`, `evals/evals.json`, `evals/check-tick.mjs`.

**Steps:**
1. `next --probe` implies `--parallel`, and prints the keys of 2.1. `tasks`: each ready task, `resources` from its `needs:<name>` labels. `issues`: strings. `goals`: `null`, T3 fills it.
2. `release --if-claimed`: no work label prints `{"released":false,"issue":<n>}`, exit 0, no write.
3. `release --excused`: the comment gains `loop-excused: <reason>`, and `attemptsOf` skips it, once per comment.
4. `tick.md`: a first line that starts `[Castraferrum] The console claimed task` skips steps 1 and 2.
5. `check-tick.mjs`: `--calls <log> --no-query <name>` fails on a logged `query <name>`.
6. Eval 6: the 2.7 line for task 49, `in-progress.json`, `EPIC_LOOP_FAKE_LOG` in scratch, told to stop with `BLOCKED`. Check: `--result BLOCKED --issue 49`, state unchanged, `--no-query EpicNode`.
7. PR body: `Closes hieplam/castraferrum#<n>`.

**Goal:** G1, G4, G23. A tool prints the probe line. A limit spends no attempt.

**Red:** in `SK/scripts`, `node --test tests/epic.test.mjs` prints `ℹ tests 40`. Run the eval command with `--eval-id 1,2,3` as baseline. Each new test prints `✖`.

**Green:** `node --test tests/epic.test.mjs tests/check-tick.test.mjs` prints `ℹ tests 49`, `ℹ fail 0`: take shape, `needs:`, other actions, 2 `--if-claimed`, `--excused`, attempt limit, 2 `check-tick`. From the root, `python3 scripts/evals/run_evals.py --evals SK/evals/evals.json --eval-id 1,2,3,6 --mode with_skill --exec-model haiku --grader-model haiku` prints `[with_skill] PASS` for 6, and for 1 to 3 no worse than the baseline.

**Stub check:** a `--probe` that is ignored fails the shape test. A log with `query EpicNode` fails `check-tick`.

**Ratchet:** `node --test` count 40 to 49.

## P4 - ProbeService, background ticker, ADR 0004

**Files:** `probe-service.ts`, `loop-service.ts`, `contracts.ts`, `compose.ts`, `goal-loop.ts`; `server/scheduler/background-ticker.ts`; run and execution ports, adapters; `tests/support/`: `fake-command-runner.ts`, `fake-probe.mjs` (prints its file argument), `service-kit.ts`; `docs/adr/0004-console-owns-the-goal-life-cycle.md`, `docs/ARCHITECTURE.md`; the tests of Green.

**Steps:**
1. `PROBE_ACTION_STATE: Record<ProbeAction, ProbeState>` (2.1). `RunRepository.latestFinishedAt(loopId): Promise<Date | null>`, no `skipped` rows. `OpenExecutionInput.nextRunAt: Date | null`.
2. `LoopService.start` with a probe row: `nextRunAt: null`, no `startFirst` (decision 7).
3. `ProbeService.tick()` gives `{ at, ran, probed, failed, errors }`: decision 22, busy guard as in `SchedulingService`. No run, no notice (P5, P10).
4. `startBackgroundTicker(services, opts)`: one in-flight promise per service. `compose.ts`: array `background`, stopped in `shutdown`, `reset`. `inspect.backgroundTick()` awaits one tick of each.
5. ADR 0004 (spec 6). `ARCHITECTURE.md`: services, ports, tables.
6. Tests. Tick 19: no probe keeps cron; Start gives 0 runs; argv, cwd, 30 s; +59 s none, +60 s one; stopped loop; state of 7 actions; exit 1; time-out; bad line; finished run probes at once; busy tick; one loop's error; two loops in one tick. Ticker 5. API 2. Contract 3.

**Goal:** G1, G2. A probe loop starts no session alone. A hung probe does not stop the console.

**Red:** `npx vitest run --project unit server/services/probe-tick.test.ts` prints `k.probeService.tick is not a function`.

**Green:** that command plus `server/scheduler/background-ticker.test.ts` prints `Tests  24 passed (24)`. `npx vitest run --project api tests/api/probe-tick-api.test.ts` prints `Tests  2 passed (2)`. `npm run verify` exits 0.

**Stub check:** an empty `tick` fails the argv case. Ignoring `latestFinishedAt` fails the finished-run case. Run both.

**Ratchet:** unit count +24. `npm run test:contract`: each side +3.

## P5 - Claim, start, release on the tick

**Files:** `schema.ts`, migration, `db.ts`; `server/ports/claims.ts`; `server/adapters/claims/command-claim-gateway.ts`; claim adapters, `memory-db.ts`, 3 repositories files; run port, adapters; `run-service.ts`, `probe-service.ts`, `contracts.ts`, `compose.ts`; executor port, adapter; `shared/domain/run.ts`, `shared/contracts/loops.ts`, `shared/i18n/*.ts`, `RunView.tsx` (existing `Cell`); `tests/support/fake-claim-gateway.ts`, `service-kit.ts`; the tests of Green.

**Steps:**
1. Migration of spec 3. `run_claims`: 2.4, decision 23. `Repositories.claims`. `RunRecord` gains `taskKey`, `slot`, `endResult`, `endPr`. Trigger `probe`, text `trigger.probe`, `run.byProbe`.
2. Ports of 2.4, decision 23.
3. Executor success: `end: parseRunEnd(m.result)` before `cut()`. `RunOutcome` gains `endResult`, `endPr`.
4. `RunService.startClaimed(loopId, executionId, { runId, taskKey })`.
5. Tick: order of decision 23.
6. Tests. Unit 18: order; lanes cap; `taken`; refused; next task after refused; lanes full; succeeded; failed; cancelled; interrupted; `RESOURCE_DOWN`; `PR_OPEN`; running stays; failed release retries at +60 s; `skipped`; no probe row; next task one tick after a run ends; busy tick. API 4 on `inspect.backgroundTick()`, fake labels: stop; succeeded; refused; two loops. Gateway 5. Contract 8. Executor 1: end line after 600 characters.

**Goal:** G2, G4. The next task starts one tick after a run ends. A claim ends with its run.

**Red:** `npx vitest run --project api tests/api/claims.test.ts` prints `Tests  4 failed (4)`.

**Green:** that command prints `Tests  4 passed (4)`. `npx vitest run --project unit server/services/probe-claims.test.ts` prints `Tests  18 passed (18)`. `npx vitest run --project contract -t run_claims` prints `16 passed`. `npm run verify` exits 0.

**Stub check:** no orphan step fails `stop`. `claim` after `startClaimed` fails `order`. Run both.

**Ratchet:** unit count +24. Metric `dead-claims`: decision 7.

## P6 - Lanes: slot, env, lifecycle line

**Files:** `goal-loop.ts`; `run-service.ts`, `probe-service.ts`, executor port, adapter, `test-mode-query.ts`; `docs/ARCHITECTURE.md`, `docs/API.md`; the tests of Green.

**Steps:**
1. `goal-loop.ts`: `lowestFreeSlot(used)`, `laneEnvOf(settings, slot)`, `claimedLine(key, action)`, `RESUME_LINE`. Text: 2.7. `laneEnvOf` fills each `{slot}`, `{port}`, adds `CASTRAFERRUM_SLOT`.
2. `ProbeService.save`: issue `laneEnv:missingBasePort` (decision 24).
3. `ExecutionInput.env?: Record<string, string>`. The executor spreads it over its base env, then drops `ANTHROPIC_API_KEY`.
4. `startClaimed` gains `{ slot, env, action }`: stores `runs.slot`. `promptSnapshot` is `claimedLine`, a blank line, the loop prompt. `env` is not stored.
5. The tick reads used slots from `listActive`.
6. `ARCHITECTURE.md`, One run: the two lines of 2.7, word for word.
7. `fakeSoak`: prompt `[echo-env]` appends the `CASTRAFERRUM_*` and `LANE_*` keys of `options.env`, one JSON line, to `<cwd>/lane-env.jsonl`.
8. Tests. Domain 8, `describe('lanes')`: slots 2; env 3; line; two re-reads of `ARCHITECTURE.md`. Service 5: slots 0, 1, 2; `input.env`; prompt first line; no-probe loop unchanged; slot 0 reused. Save 1. Executor 2: env merged; `ANTHROPIC_API_KEY` dropped. API 3: 3 env sets, ports 7100 to 7102; no-probe run; `prompt_snapshot`.

**Goal:** G24. Parallel runs never share a number, database or port.

**Red:** `npx vitest run --project api tests/api/lanes.test.ts` prints `Tests  3 failed (3)`.

**Green:** that command prints `Tests  3 passed (3)`. `npx vitest run --project unit server/services/probe-lanes.test.ts` prints `Tests  5 passed (5)`. `npx vitest run --project unit shared/domain/goal-loop.test.ts -t lanes` prints `8 passed`. `npm run verify` exits 0.

**Stub check:** a `lowestFreeSlot` that returns 0 fails the 3 env sets. Run it, restore.

**Ratchet:** unit count +16.

## P7 - Executor: usage_limit, resume

**Files:** executor port; `claude-agent-executor.ts`, `.real.test.ts`; `mock-executor.ts`, `test-mode-query.ts`; `run-service.ts`, new `run-usage-limit.test.ts`; `tests/contract/executor*`; `fake-claude-query.ts`, `service-kit.ts`; `ARCHITECTURE.md`; the test of Red.

**Steps:**
1. Event of 2.5. `ExecutionInput.resumeSessionId?: string`. Option `limitSettleMs`, default 5000.
2. Executor: decisions 25 to 28. Emit one `Error · <message>` log, then `usage_limit`.
3. `RunService.#drive`: `usage_limit` writes `failed`, `error: message`, `costUsd`, for every loop. P8 adds `held`.
4. Mock: prompt `[usage-limit]` emits it. Fake query, `fakeSoak`: prompt `[limit]` emits rejected, then assistant `error`. `options.resume` keeps the id.
5. Tests, 21: each trigger alone 4; 3 orders; `allowed`, `allowed_warning`; `resetsAt` seconds, missing, 13 digits; `rejected` before `init`; hung stream; cost from `result`; last cost; subagent `error`; cleanup turn; cancel in the wait; resume keeps the id; resume adds no cost (0.0065729 stays); no `resume` on a new run.
6. Contract 2, `usage_limit`: final event; same session. Not on real Claude. Service 2. Real 1 `resume`: haiku, same id, cost not lower.

**Goal:** G3. Any trigger gives one event. A resume keeps the session and the true cost.

**Red:** `npx vitest run --project unit server/adapters/executors/claude/claude-agent-executor.limit.test.ts` prints `Tests  21 failed (21)`.

**Green:** that command prints `Tests  21 passed (21)`. `npx vitest run --project contract tests/contract/executor-mock.test.ts --reporter verbose` prints `usage_limit` twice. `LC_REAL_CLAUDE=1 npx vitest run --project unit server/adapters/executors/claude/claude-agent-executor.real.test.ts -t resume` prints `1 passed`. `npm run verify` exits 0.

**Stub check:** no handler fails each trigger. Only `rate_limit_event` fails `assistant`. Adding costs fails the resume cost. Run all.

**Ratchet:** unit count +24. Metric `limit-failures`: decision 7.

Wave 4 adds P8, P10, P11 and P14. The rules are decisions 43 to 46 of the spec. A test that needs time uses the wound clock and a condition poll, never a fixed real wait. Make the kit change first, so Red runs on the new kit with no service change. Each task keeps a test that a loop with no probe behaves as today.

## P8 - Holds, held, resume, stop on held

**Files:** schema, migration, `db.ts`; `hold-repository.ts`, run port, repositories, adapters; services `hold-open.ts`, `hold`, `run`, `probe`, `loop`, `recovery`, `contracts.ts`; `compose.ts`; `shared/domain/run.ts`, `shared/i18n/*.ts`, `RunCell.tsx`; `test-mode-query.ts`, `fake-labels.mjs`, `service-kit.ts`; `ARCHITECTURE.md`; tests of Green.

**Steps:**
1. Kit: `usageLimit(message, costUsd, resetsAt)`; a scripted session id is `input.resumeSessionId ?? scripted-<n>`; a `StoreNotifier`. `fakeSoak`: `[run-end:<word>:<value>]` ends the result with the line of 2.3. A `fake-labels.mjs` queue entry can be `{key, resources}`.
2. Migration of spec 3, `trial_run_id`, `truncateAll`.
3. `HoldRepository`: `open`, `raiseUntil`, `listOpen`, `markChecked(id, at, trialRunId)`, `close`. Runs: `hold(id, costUsd)`, `resume(id, deadlineAt)`, `listHeld(loopId)`, `listAllHeld()`, `markHeldInterrupted(now, aliveUntil, keepLoopIds)`. `finish` accepts `held`.
4. `openHold`, `#drive`, `cancel`: decision 43. `RunService.resumeHeld(runId, { env })`: 2.5, decision 28, `RESUME_LINE`, `laneEnvOf`. `LoopService.stop` also cancels `listHeld`.
5. `DefaultHoldService`, one `background` entry, probe tick, action `hold`: decision 44. Lanes and slots count held runs.
6. Recovery, every loop stops: decision 45.
7. `RUN_PILL.held` is `['int', 'status.held']`, the `SYSTEM.md` row. Add `status.held`, `notice.holdNoEnd`. PR body: `.pill`, and the `Acceptance:` line of G29 from `npm run design:compare`.
8. `ARCHITECTURE.md`: "no pause or resume" becomes "a hold pauses runs for a resource".
9. `hold-service.test.ts`, 24: held keeps session, claim open; two limits, 1 hold, 1 notice; no probe in a hold; other task runs; no-probe control; no session; +59 s, +60 s, oldest first; deadline, count, env; 2 cost; 5 trial (decision 44); `raiseUntil`; past `resetsAt`; Stop; held slot; check clears at `everySec`; `RESOURCE_DOWN`; `hold` line; failed resume; restart. API `usage-hold` 3, `holds` 3. Contract 12, `describe('resource_holds')`.

**Goal:** G3, G23. A limit waits, then the same session goes on with no person. One cause gives one hold and one notice.

**Red:** `npx vitest run --project unit server/services/hold-service.test.ts` prints `Tests  23 failed | 1 passed (24)`. `npx vitest run --project api tests/api/usage-hold.test.ts tests/api/holds.test.ts` prints `Tests  4 failed | 2 passed (6)`. The passes are no-probe controls.

**Green:** the same commands print `Tests  24 passed (24)`, `Tests  6 passed (6)`. `npx vitest run --project contract -t resource_holds` prints `24 passed`. `npx vitest run --project unit server/services/run-usage-limit.test.ts` prints `Tests  2 passed (2)`. `npm run verify` exits 0.

**Stub check:** a fresh session on resume, no resume on close, no hold test in the tick, `listActive` only in Stop, one row per limit: each fails its case. Run all.

**Ratchet:** unit +24, api +6, contract +12 per side. Metrics `limit-failures`, `blocked-runs`: decision 7.

## P10 - wait, blocked, plan, done, goal_met

**Files:** `schema.ts`, migration; `shared/domain/run.ts`, `shared/contracts/events.ts`, `loops.ts`; `probe-service.ts`, `run-service.ts`, `loop-service.ts`, `contracts.ts`, `compose.ts`; `server/ports/claims.ts`, `execution-repository.ts`, claim and execution adapters; `service-kit.ts`; `docs/API.md`; the tests of Green.

**Steps:**
1. Migration of spec 3: `goal_met` in `executions_end_reason`, `run_claims.kind`.
2. Deps gain `notifier`, `loopService: Pick<LoopService, 'finishGoal'>`.
3. `wait`, `blocked`, `probe_failed`: decision 46. Read `probe.lastLine` before `record`.
4. `plan`: decision 46, with the lanes and slot of `#take`, `action: 'plan'`.
5. `done`: decision 46. `finishGoal` publishes `execution.ended` and `loop.updated`.
6. No `web/` change: P15 shows the word.
7. `server/services/probe-actions.test.ts`, 18. Wait: state and 1 notice; 3 ticks, 1 notice; read, same reason, no notice; new reason. Blocked: `issues` in `last_line`; 3 ticks, 1 notice. Failed: 3 ticks, 1 notice; again after a pass. Plan: 1 run with both prompt lines, 0 gateway calls; repeat none; new run after the end; live held run; full lanes none. Done: `goal_met`, loop stopped; live run waits, closes on next probe; no probe after. `skip`, no notice. No-probe loop on cron.
8. `tests/api/plan-action.test.ts`, 3: failure text in `prompt_snapshot`; repeat none; `done` gives `end_reason` `goal_met`. Contract 3, `describe('goal_met')`.

**Goal:** G1, G25, G28. Each action does what spec 2.1 says, a reason gives one notice, and `done` ends the period as Goal met.

**Red:** `npx vitest run --project unit server/services/probe-actions.test.ts` prints `Tests  15 failed | 3 passed (18)`. The passes: full lanes, `skip`, no-probe loop. `npx vitest run --project api tests/api/plan-action.test.ts` prints `Tests  3 failed (3)`.

**Green:** the same commands print `Tests  18 passed (18)`, `Tests  3 passed (3)`. `npx vitest run --project contract -t goal_met` prints `6 passed`. `npm run verify` exits 0.

**Stub check:** send on each tick: read-then-silent fails. Call the gateway for `plan`: 0 calls fails. No `plan` row: repeat fails. `done` by `stop`: the end reason fails. Run all.

**Ratchet:** unit +18, api +3, contract +3 per side.

## P11 - Restart policy, smoke step

**Files:** `recovery-service.ts`, new `recovery-policy.test.ts`; `probe-service.ts`; `execution-repository.ts`, `loop-repository.ts`, their adapters; `scripts/api-smoke.mjs`; `docs/ARCHITECTURE.md`.

**Steps:**
1. Recovery: decision 45. `keep`: active loops with an open execution and a probe with `restartPolicy` `resume`. `closeAllOpen(reason, at, keep)`, `stopAll(now, keep)`, `markHeldInterrupted(now, aliveUntil, keep)`.
2. `ProbeService`: first-tick rule of decision 45.
3. `ARCHITECTURE.md`: "No loop restarts by itself" and the row "Restart closes executions" become a per-loop `restartPolicy`, default `stop`.
4. Smoke, before step 6: loop B, Mock 120 s, no `claim`, `command` `[node, tests/support/fake-probe.mjs, <file>]`, `restartPolicy` `resume`. `<file>` holds a `wait` line. Start B, poll `loop_probes.state` for `waiting`, check 0 runs. Write a `take` line, key `smoke-1`. Kill. After the restart make no call for B. Poll `SELECT` at most 30 s for one `running` run, trigger `probe`, task key `smoke-1`. Print `restart: resume loop started a run with no http call`. Stop B before step 8. The checks of the first loop stay.
5. Tests, 10, `describe('restart_policy')`, a second kit on one `db`: resume loop: run `interrupted`, execution open, loop active; first tick: excused release, new run, no HTTP; default loop as today; no-probe loop as today; stopped resume loop stays; held stays, same session after the reset; mixed loops; active with no execution stops; second tick no probe; open `plan-window`, no probe.

**Goal:** G5, G4. After a restart a `resume` loop works with no person. A default loop stays stopped.

**Red:** `npx vitest run --project unit server/services/recovery-policy.test.ts` prints `Tests  6 failed | 4 passed (10)`. The passes: default, no-probe, stopped, no execution. `npm run api-smoke` with step 4 alone prints `FAIL:`.

**Green:** the same command prints `Tests  10 passed (10)`. `npx vitest run --project unit server/services/recovery-service.test.ts` passes with that file unchanged. `npm run api-smoke` prints `restart: resume loop started a run with no http call`, exit 0. `npm run verify` exits 0.

**Stub check:** ignore `keep`: the first case fails. Remove the first-tick rule: the smoke fails, because 30 s is under the 60 s probe period. Run both.

**Ratchet:** unit +10. Metric `idle-days`: decision 7.

## P14 - End-to-end: idle and gap

**Files:** new `tests/e2e/probe-idle.spec.ts`, `tests/e2e/probe-gap.spec.ts`, `tests/support/fake-probe-seq.mjs`.

**Steps:**
1. `fake-probe-seq.mjs <dir>`: appends a line to `<dir>/calls.log`, prints entry `n` of `<dir>/lines.json`, the last entry after the end.
2. Idle: Mock loop, lines `wait`, `skip`, `done`. Poll for 1 call, `POST /api/__test/clock` `advanceMs` 60000, poll for 2, the same for 3. `SELECT`: 0 runs, `end_reason` `goal_met`. A witness loop prints only `skip`. Advance 120 s twice, poll for 2 more witness calls. The first loop stays at 3, so real ticks prove the count, not a wait.
3. Control `take`, no `claim`: poll for 1 run.
4. Gap: repository `lc-fake-claude-*`, prompt `[soak:2]`, yearly cron, `maxConcurrent` 1, real clock, `tests/support/fake-labels.mjs` queue `a`, `b`. Poll at most 60 s for 2 runs, trigger `probe`. `gap_ms` is the second `started_at` less the first `finished_at`. Print `gap_ms=<n>`. Assert under 15000.
5. `POST /api/__test/reset` before each test. Read rows as `concurrency.spec.ts` does.
6. No existing `server/` or `web/` file changes, so the light verify applies.

**Goal:** G1, G2. An idle loop starts no session. The next task starts seconds after a run ends.

**Red:** `npx playwright test tests/e2e/probe-idle.spec.ts --project chromium --reporter list` prints `Error: No tests found`.

**Green:** after `npm run build`, that command with `--workers 1` prints `2 passed`. `npx playwright test tests/e2e/probe-gap.spec.ts --project chromium --reporter list --workers 1` prints `gap_ms=` and `1 passed`.

**Stub check:** remove the `latestFinishedAt` test of `#isDue`: gap fails. Return from `#probeLoop` before the call: idle fails on 3 calls. Treat `done` as `skip`: `goal_met` fails. Run all, restore.

**Ratchet:** `npx playwright test --list --project chromium | wc -l` +3. Metric `gap`: 14.4 min before, the printed `gap_ms` after. `idle-runs`: decision 7.

Wave 6 adds the five screen tasks P15, K12, T6, R9 and W7. The owner approved their design on 2026-11-01 (`design/APPROVED.md`, entry `## the goal-loop screens`), so D2 is done. P15 needs P8 (the `held` run, the holds) and P10 (the states `waiting`, `blocked`, `complete`). It relies on names that can change: `HoldRepository.listOpen`, `resource_holds` and the run word `held` (P8, branch not merged), and the `result` of `ProbeService` (P10). Read the merged code before you build. **Rule for the five screen tasks:** the reference is `design/ds/preview/shots/<id>-<theme>.png`, and a task compares the real build with it by pixels. Where the data model cannot give a sample text of the preview, the task changes that text in `design/ds/preview/data.js` or `preview.js`, re-shoots only the states that change, and adds an "Agent correction" entry to `design/APPROVED.md` (the standing rule, as epic 63 did). Layout, classes and tokens never change.

## P15 - Loop state, editor fields, notices

**Files:** server: `shared/contracts/holds.ts`, `server/http/hold-routes.ts`, `app.ts`, `compose.ts`, `server/services/contracts.ts` (a `listOpen` that adds the iteration of the opening run, if P8 gave none), `docs/API.md`, `tests/api/holds-api.test.ts`, `tests/api/api-surface.test.ts`. Web: `web/api/{loops-api,http-loops-api,fake-loops-api}.ts` (calls `getProbe`, `saveProbe`, `deleteProbe`, `listHolds`, `listNotices`, `markNoticeRead`), `web/data/probe.ts`, `query-keys.ts`, `web/features/loop-detail/{ProbeNow.tsx,NowCard.tsx,Figures.tsx,LoopView.tsx,RunView.tsx,transcript/}`, `web/features/loop-form/{ProbeFields.tsx,probe-form.ts,probe-form.test.ts,EditorView.tsx}`, `shared/i18n/{en,vi}.ts`. Tests: `tests/visual/ds/probe.visual.ts`, `tests/support/goal-loop-probe-world.ts`, `tests/e2e/{probe-state,probe-editor}.spec.ts`. Design: `design/ds/preview/{preview.js,data.js}`, 4 shots of `probe-blocked`, `design/APPROVED.md`. Also `docs/USE-CASES.md`, `package.json` (`uc-coverage --min` + 1), the evidence log `## P15`.

**Steps:**
1. Read `design/ds/SYSTEM.md`, `tokens.css`, `components.css`, `STATES.md`, and the functions of `preview/preview.js` and the data of `preview/data.js` named here. Use existing classes only: `.pill` (`Pill`; tone per state in `PILL` of `preview.js`), `.now`, `.cmd`, `.banner.is-warn`, `.group`, `.cell`, `.stat`, `.field`, `.input`, `.switch`, `.hint`. No new class, token, colour or native `title`. If more is needed, stop and open a `design-system` issue.
2. `GET /api/holds` answers `{holds:[{id,resource,reason,openedAt,until,openedByRun:{id,iteration}|null}]}`: the open holds, oldest first.
3. Loop page of a loop that has a probe row (`GET /api/loops/:id/probe`): `ProbeNow` replaces the text of the now card. Its input is `parseProbeLine(lastLine)` from `shared/domain/goal-loop.ts`. Test ids: those of the `PROBE` list in `states.js`, plus `banner-hold`, `hold-list`, `blocker-list`, `blocker-row`, `period-status`. `fig-goals` reads the `goals` of the line and is hidden when it is `null`. `banner-hold` shows only on the loop page, while an open hold `plan-window` exists. A loop with no probe row keeps today's page.
4. Blockers: the probe line holds issue numbers only (`probeLine` in `epic.mjs`), no title and no count. So a `blocker-row` is a plain `.cell` with the text `Issue {n}`, no chevron. Change the preview the same way: `blockers` in `data.js` become `['31','33']`, key `goalLoop.blocked.issue` becomes `Issue {n}`, `goalLoop.blocked.tasks.*` go. Re-shoot `probe-blocked` and `phone-probe-blocked` (4 PNG): `npm run design:shots -- --design design/ds --only probe-blocked,phone-probe-blocked`.
5. Run page, status `held`: the pill word, the banner `run-banner` (text `goalLoop.run.banner`, `at` = `openedAt` and `until` of the hold), transcript mode held (keys `goalLoop.tx.held`, `goalLoop.tx.heldEnd`), no resume command.
6. Notices: the hold banner comes from the hold, not from a notice. When a loop page has rendered, the web calls `POST /api/notices/:id/read` for each unread notice of that loop. No other notice has a screen: the state word and the last probe line already show the reason.
7. Editor: group "Probe" in `EditorView`, for a loop that exists. Fields: switch `probe-enabled`; textareas `probe-command`, `probe-claim`, `probe-release` (one argument per line); segmented `probe-restart` (stop, resume); input `probe-base-port`; textarea `probe-lane-env` (`KEY=value` per line). Pure helpers in `probe-form.ts`: `argvToText`, `textToArgv`, `envToText`, `textToEnv`, `toProbeBody`. Save: the loop `PUT`, then the probe `PUT`, or `DELETE` when the switch is off. An active loop gives a disabled group and the hint `goalLoop.editor.stopFirst`. The server issues `command:required`, `claim:missingKey`, `release:missingKey`, `release:missingReason`, `laneEnv:missingBasePort`, `laneBasePort:outOfRange` show under their field. The `resources` setting stays API only (record this in the PR).
8. Seed `seedProbeState(sp, db, state)` in `tests/support/goal-loop-probe-world.ts` (Z2 imports it). It resets, sets the clock to `PREVIEW_NOW`, runs `seedPreviewWorld`, then inserts the loop, runs, executions of `previewData().goalLoop` and a `loop_probes` row with `state`, `last_line` and `last_probe_at` of `goalLoop.states[state]`. State `held` also inserts the hold `plan-window` (until 19:00, opened 13:58 by run 28), run 28 with status `held` and a session id, and the transcript `goalLoop.transcript`. State `complete` stops the loop and ends execution 4 with `goal_met`. It returns `{ path, runPath }`.
9. `probe.visual.ts`: 10 tests, one per id (`probe-waiting`, `probe-held`, `probe-blocked`, `probe-complete`, `run-held`, and each `phone-` twin), 20 pairs. Regions: desktop `[regions.page()]`, phone `[regions.navbar(), regions.page()]`. `test.afterAll(() => writeReport('probe'))`.
10. `probe-state.spec.ts` (G28), 6 tests, a fake probe `tests/support/fake-probe.mjs <file>` and `POST /api/__test/clock` with `advanceMs` 61000: `wait` shows Waiting for you and the line; `blocked` shows Blocked and the issue numbers; `hold` shows Held and `banner-hold`; `done` shows Goal met; a bad command shows Probe failed; opening the page marks the loop's notice read (`GET /api/notices` is empty). `probe-editor.spec.ts`, 3 tests: fields save and survive a reload; an active loop disables the group; a command with no `{key}` in the claim shows the server message under the field. Add `UC-NN` (next free number) for the first spec.
11. Run `npm run design:compare` once. The PR body has `Acceptance: "pairs": <n>, "worstRatio": <r>` from `design/compare/ds/report.json`.

**Goal:** G28. The loop page and the run page match the approved shots of `probe-waiting`, `probe-held`, `probe-blocked`, `probe-complete` and `run-held` (desktop, phone, light, dark). Each action shows its own word and the last probe line.

**Red:** after the tests exist, `npm run build`, then `npx playwright test --project visual tests/visual/ds/probe.visual.ts --reporter list` prints `10 failed`. `npx playwright test tests/e2e/probe-state.spec.ts --project chromium --reporter list` prints `6 failed`. `npx vitest run --project api tests/api/holds-api.test.ts` prints `Tests  3 failed (3)` (holds-api: none open; one open with the iteration; a closed hold is not listed). `npx vitest run --project unit web/features/loop-form/probe-form.test.ts` prints `Test Files  1 failed (1)` (6 tests).

**Green:** the visual command prints `10 passed`. `node -e "const r=require('./reports/compare/ds/results/probe.json');console.log(r.length,Math.max(...r.flatMap(s=>s.regions.map(x=>x.ratio)))<=0.001)"` prints `20 true` (the threshold is `MAX_RATIO` 0.001 of each region). `probe-state.spec.ts` prints `6 passed`, `probe-editor.spec.ts` prints `3 passed`, holds-api `Tests  3 passed (3)`, probe-form `Tests  6 passed (6)`. `npx playwright test --project visual tests/visual/ds/loop.visual.ts tests/visual/ds/run.visual.ts` exits 0. `npm run ratchets` prints `ratchets: ok`. `npm run design:states -- --design design/ds` prints `states with shots: 142/142`. `npm run verify` exits 0.

**Stub check:** make `ProbeNow` return `null`: the visual command prints `10 failed` and `probe-state.spec.ts` fails 4 or more. Make `GET /api/holds` answer `{holds:[]}`: 2 of 3 holds-api tests and the `probe-held` pairs fail. Skip the read call: the sixth e2e test fails. An empty page cannot pass a pixel pair. Run each, restore.

**Ratchet:** pairs in `results/probe.json`, 0 to 20 (tool: `writeReport`). `e2e expects:` line of `npm run ratchets`, B to more than B. Api tests +3. Both only rise.
