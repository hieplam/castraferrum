# Plan of issue 212: probe, claim, hold, resume

Phase: issue 212 of epic 217. Spec: [goal-driven loop](../specs/2026-11-01-goal-driven-loop.md). Plan index: [index](2026-11-01-goal-driven-loop.md). Later waves add the other tasks of this phase. Unit count below means `npx vitest list --project unit 2>/dev/null | wc -l`: 428 on 2026-11-01, measure yours at Red. In the `agent-plugins` tasks, `SK` is `plugins/epic-loop/skills/epic-loop`.

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
