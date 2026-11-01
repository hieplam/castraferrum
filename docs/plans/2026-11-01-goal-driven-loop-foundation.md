# Plan: foundation (baselines, spikes, design) of the goal-driven loop

Phase 0 of epic 217. Spec: [../specs/2026-11-01-goal-driven-loop.md](../specs/2026-11-01-goal-driven-loop.md). Plan index: [2026-11-01-goal-driven-loop.md](2026-11-01-goal-driven-loop.md). Evidence log: [2026-11-01-goal-driven-loop-evidence.md](2026-11-01-goal-driven-loop-evidence.md). Wave 1 covers F0, F1, F2, S1 to S6, D1 and D2 here. Z1 and Z2 get their sections in a later wave.

Rules for every section: `LOG` means `docs/plans/2026-11-01-goal-driven-loop-evidence.md`. A spike writes exact answer lines into the section `## <id>` of `LOG`. A real Claude session follows the lane rules (haiku, low effort, folder `lc-real-claude-<id>` in the machine temp folder, `GH_TOKEN=invalid`, no write tools, never a real repository). Each spike states its own spend limit and stops when the running total passes it.

## F0 - Each ratchet baseline, reads `runs` read-only (227 rows)

**Files:** create `scripts/metrics/baseline.mjs`, `scripts/metrics/baseline.json`, `tests/tools/metrics-baseline.test.ts`; append `## F0` to the evidence log `docs/plans/2026-11-01-goal-driven-loop-evidence.md`.

**Steps:**
1. `node scripts/metrics/baseline.mjs --metric <name>` prints `<name> <value> <unit> <source>`. `--all` first prints `window 227 rows until 2026-10-23T00:00:00Z`, then the 16 metrics in the order below. `--all --check` uses `--now 2026-11-01T15:15:00Z`, compares with `baseline.json`, prints `baseline: 16 metrics, 0 differences` (exit 0) or the differences (exit 1). Unknown name: exit 2. Flags `--now <ISO>`, `--projects-dir <dir>` (default `~/.claude/projects`).
2. Database: `LOOPS_BASELINE_DATABASE_URL`, else `postgres://loops:loops@127.0.0.1:55432/loops`. First `SET default_transaction_read_only = on`. Only `SELECT`, only `started_at < 2026-10-23T00:00:00Z`. Print no loop name, prompt or summary (decision 14).
3. Live (one exported pure function each). Expected = issue / my read-only check of 2026-11-01:
   - `idle-runs` (sessions): `~/.claude/projects/*/<session_id>.jsonl` with no `Edit`, `Write`, `NotebookEdit`, `MultiEdit` tool use and no Bash matching `git push|gh pr create`. 108 / 125.
   - `gap` (min, 1 decimal): median of `started_at` minus the previous `finished_at` of the same loop, skipped rows out. 14.5 / 14.4.
   - `limit-failures` (runs): failed rows with `error` matching `^You.ve hit your`. 12.
   - `idle-days`: `round((now - max(started_at)) / 1 day)`. 10.
   - `late-tasks` (percent, github): share of sub-issues of epic 63 created in the 10 hours before the latest creation (`gh api graphql`). 56 / 57.9.
4. Recorded (source `recorded`): owner-stops 6, dead-claims 253 (hours), merged-on-red 12, stub-share 0, poll-share 37, first-goal-day 3, status-questions 7, owner-messages `0.84,1.77`, causes-found 0, cause-repeats 11, blocked-runs 12. Export `ownerMessagesPerPr(typed, prs)`.
5. A live number that differs from the issue: the measured number wins. Table both in the log, write the measured one in `baseline.json`.

**Goal:** all goals. Each ratchet of spec section 1 has a committed tool that prints its baseline.

**Red:** write the test file first. `npx vitest run --project unit tests/tools/metrics-baseline.test.ts` prints `Failed to load url ../../scripts/metrics/baseline.mjs` and `Test Files  1 failed (1)`.

**Green:** `npx vitest run --project unit tests/tools/metrics-baseline.test.ts` prints `Tests  10 passed (10)`. Titles start with the metric name. Fixtures: gap 15.0 (waits 15, 29, 10); limit-failures 2 of 5; idle-days 10; idle-runs 1 (read-only, edit, `gh pr create`); `late-tasks is the share created in the last 10 hours` 40.0 (4 of 10); `owner-messages divides typed messages by merged PRs` 0.84 (21 typed, 9 tool results, 25 PRs). Also: unknown metric exits 2; no output holds a loop name; `baseline.json` holds the recorded values; its live values are limit-failures 12, idle-days 10, rows 227, gap 14.0 to 15.0, idle-runs 100 to 130. Then `node scripts/metrics/baseline.mjs --all --check` prints `baseline: 16 metrics, 0 differences`.

**Stub check:** a tool that prints constants fails the six fixture tests. Remove the tool: all ten fail.

**Ratchet:** metrics with a committed baseline, 0 to 16 (`--check` line). It only rises.

## F1 - Goal manifest of this epic, red at 0 of n

**Files:** create `goals/2026-11-01-goal-driven-loop.json`, `tests/tools/goal-driven-manifest.test.ts`; append `## F1` to the evidence log `docs/plans/2026-11-01-goal-driven-loop-evidence.md`.

**Steps:**
1. Format of `scripts/goal-check.mjs` (`setup: []`, `goals[]`), plus `"opened":{"at":"2026-11-01T00:00:00Z","passed":0,"total":29}` (spec 2.10). Goals G1 to G29, `outcome` = the Outcome cell of the spec table, word for word.
2. Vitest check: `npx vitest run --project api tests/api/<f>`, `expect: ["<f>","passed"]`. E2e: `npx playwright test tests/e2e/<f> --project chromium --reporter list`, `expect: ["passed"]` (G2 adds `gap_ms`).
   - api: G3 usage-hold, G4 claims, G6 gate-red, G7 gate-stub, G8 gate-handover, G9 gate-scope, G13 standing-goals, G14 process-review, G15 scoreboard, G19 and G20 goal-cards, G23 holds, G24 lanes, G25 plan-action, G27 merge-guard (all `.test.ts`).
   - e2e: G1 probe-idle, G2 probe-gap, G11 goal-number, G18 goal-card, G28 probe-state (all `.spec.ts`).
   - G3 also: `npx vitest run --project contract tests/contract/executor-mock.test.ts --reporter verbose` expecting `usage_limit`. G5: `npm run api-smoke` expecting `restart: resume loop started a run with no http call`. G16: unit `tests/tools/rule-lint.test.ts`. G21: unit `server/services/rank.test.ts`.
   - G12, G22: `npx vitest run --project unit tests/tools/metrics-baseline.test.ts -t <metric> --reporter verbose`, expecting `late-tasks is the share` and `owner-messages divides`.
3. ap goals G10, G17, G26, G29: `node --test --test-reporter=spec --test-name-pattern="^G<k> " ../agent-plugins/<file>`, expecting `✔ G<k> ` and `ℹ fail 0`. File: `plugins/epic-loop/skills/epic-loop/scripts/tests/epic.test.mjs` (G10, G26, G29); `scripts/evals/eval-gate.test.mjs` (G17). A pattern with no match still prints `ℹ pass 1`, so `✔` is the proof.
4. Test titles: `ids are G1 to G29 once each`, `outcomes equal the spec table`, `every goal has a check that can fail`, `opened total is 29`.

**Goal:** all goals. `node scripts/goal-check.mjs goals/2026-11-01-goal-driven-loop.json` shows 29 rows, red.

**Red:** the same command exits 1 with `ENOENT: no such file or directory`. The test written first prints `Test Files  1 failed (1)`.

**Green:** `npx vitest run --project unit tests/tools/goal-driven-manifest.test.ts` prints `Tests  4 passed (4)`. The goal-check command exits 1 and ends with `goals passed: 0/29` (`2/29` if F0 is on `main`: G12 and G22 pass).

**Stub check:** an empty `checks` list fails test 3. Change G1 to `node -e 0` in a copy: it prints `G1 pass` and the line shows `1/29`.

**Ratchet:** goals passing, 0/29 (`goal-check`). It only rises.

## F2 - Fake GitHub, bare repository kit

**Files:** create `tests/support/fake-gh.mjs`, `fake-gh-kit.ts`, `bare-repo.ts` (all in `tests/support/`) and `tests/tools/fake-gh.test.ts`; append `## F2` to the evidence log `docs/plans/2026-11-01-goal-driven-loop-evidence.md`. Users: K3, K4, K9, K11, R3.

**Steps:**
1. `fake-gh.mjs` keeps all state in the JSON file `FAKE_GH_WORLD`: `issues`, `prs`, `statuses`, `checkRuns`, `calls`. Each call, also a failed one, is appended to `calls`.
2. It supports exactly: `issue create --title --body [--label]...` (prints `https://github.com/fake/repo/issues/<n>`); `issue list [--state] [--search] [--label] --json <f>` (search = substring of title or body, `in:body` and quotes stripped); `issue view <n> --json`; `issue comment <n> --body`; `issue edit <n> --add-label --remove-label`; `issue close <n>`; `pr create --head --base --title --body`; `pr list --json`; `pr view <n> --json`; `pr merge <n> --squash [--match-head-commit <sha>]`; `api [-X POST] repos/fake/repo/statuses/<sha> -f state= -f context= -f description=`; `api repos/fake/repo/commits/<sha>/status`; `api repos/fake/repo/commits/<sha>/check-runs`. `--json` uses GitHub field names.
3. `pr merge` runs real git in the bare repository `world.bare`, then marks the PR merged. A wrong sha prints `fake-gh: head commit does not match` and exits 1. Any other command prints `fake-gh: unsupported: <args>` and exits 64.
4. `bare-repo.ts`: `createBareRepo(): BareRepo` with `bare`, `clone()`, `commit(dir, files, message): sha`, `branch(dir, name)`, `push(dir, branch)`, `sha(branch)`, `show(branch, path)`, `dispose()`. Real `git`; `main` has one first commit.
5. `fake-gh-kit.ts`: `createFakeGh(bare?): { bin, world, env, read() }`. `bin` is a `gh.cmd` (win32) or `gh` shell wrapper that runs the fake. `env` holds `LOOPS_GH_BIN` and `FAKE_GH_WORLD`.

**Goal:** G4, G6 to G9, G13. Oracles can run against a fake GitHub and a real local repository.

**Red:** test first. `npx vitest run --project unit tests/tools/fake-gh.test.ts` prints `Test Files  1 failed (1)` (no `fake-gh-kit`).

**Green:** the same command prints `Tests  10 passed (10)`. Titles: issue create then list; search by body hash finds one issue; comment and label edits kept; unsupported exits 64; pr create then list; merge squashes into bare `main` (new sha, file present); wrong head commit exits 1, `main` stays; posted status read back; call log keeps a failed call; wrapper runs from a child process, and the same call with no wrapper fails `ENOENT`.

**Stub check:** a fake that prints nothing fails tests 1, 2, 5, 6. Delete `fake-gh.mjs`: 10 fail.

**Ratchet:** `npm run test:unit` `Tests` count, B to B+10 (record B first). It only rises.

## S1 - limit order, resume, cost

**Files:** append `## S1` to the evidence log `docs/plans/2026-11-01-goal-driven-loop-evidence.md`. No other file.

**Steps:** question (spec 4): the order of `rate_limit_event`, assistant `error`, `result`; does `resume` with streaming input keep the session id; does `total_cost_usd` restart at 0.
1. Read-only SQL: `docker exec loop_console_pg psql -U loops -d loops -At -c "set default_transaction_read_only=on; select session_id from runs where status='failed'"` (12 rows). In each transcript `~/.claude/projects/*/<id>.jsonl` list the order of the three kinds by line. Write `S1 raw <first 8 id chars>: a > b > c` (`not stored` for a missing kind).
2. Haiku script (paste it in the evidence log, at most 40 lines): start a session, stop it after the first message, `resume` it with streaming input, print each message type, `session_id` and `total_cost_usd` of both results.
3. Sandbox: folder `lc-real-claude-s1`, haiku, low effort, `GH_TOKEN=invalid`, no write tools.
4. Spend limit: 0.50 USD.

**Goal:** G3. The design of the hold knows the facts of the SDK.

**Red:** not applicable, because there is no code. The Green command prints `0` now.

**Green:** with `LOG=docs/plans/2026-11-01-goal-driven-loop-evidence.md`:
`grep -cP '^S1 (order: (?<a>rate_limit_event|assistant_error|result) > (?!\k<a>)(?<b>rate_limit_event|assistant_error|result) > (?!\k<a>|\k<b>)(?<c>rate_limit_event|assistant_error|result)|resume-keeps-session-id: (yes|no)|cost-restarts-at-zero: (yes|no)|spend-usd: (0\.[0-4][0-9]|0\.50))\r?$' $LOG` prints `4`, and `grep -c '^S1 raw [0-9a-f]\{8\}: ' $LOG` prints `12`.

**Stub check:** a log with no answer, `TODO`, a repeated word in `order`, or a spend above 0.50 gives a smaller count.

**Ratchet:** answer lines for S1 in the evidence log, 0 to 4 (and 0 to 12 raw lines). Spend at most 0.50 USD.

## S2 - hook under bypass

**Files:** append `## S2` to the evidence log `docs/plans/2026-11-01-goal-driven-loop-evidence.md`.

**Steps:** question: does a `PreToolUse` hook of option `hooks` refuse Bash under `bypassPermissions`, in the main thread and in a subagent?
1. In `lc-real-claude-s2` write a fake `gh` that appends its arguments to `gh.log` and exits 0. Put it first on `PATH`.
2. Haiku `query()` with `permissionMode: 'bypassPermissions'`, tool Bash, and a `PreToolUse` hook (matcher `Bash`) that appends to `hook.log` and denies a command that matches `gh\s+pr\s+merge`. Run 1: ask the main thread for `gh pr merge 1`. Run 2: ask it to give the same command to a subagent defined in `agents`.
3. Count the lines of `hook.log` and `gh.log` after each run. A refusal by the model with no hook line does not count.
4. Sandbox as in the lane rules (haiku, low effort, `GH_TOKEN=invalid`). Spend limit: 0.30 USD.

**Goal:** G27. A run cannot merge.

**Red:** not applicable, because there is no code. The Green command prints `0` now.

**Green:** with `LOG=docs/plans/2026-11-01-goal-driven-loop-evidence.md`: `grep -cP '^S2 (hook-called-main|hook-called-subagent|fake-gh-reached-main|fake-gh-reached-subagent): (yes|no)\r?$|^S2 spend-usd: (0\.[0-2][0-9]|0\.30)\r?$' $LOG` prints `5`.

**Stub check:** with no run, the count is 0. A log that says the hook refused while `hook-called-*` is `no` shows a model refusal, and the section must say so.

**Ratchet:** answer lines for S2, 0 to 5. Spend at most 0.30 USD.

## S3 - stub run time, CSS case

**Files:** append `## S3` to the evidence log `docs/plans/2026-11-01-goal-driven-loop-evidence.md`.

**Steps:** question: how long is a stub run on the largest of the last 100 merged PRs, and does a CSS-only change go red?
1. `gh pr list --state merged --limit 100 --json number,files`. Largest = most changed files outside `**/*.test.ts` and `tests/**`.
2. In a worktree at its merge commit, restore each non-test file to the base commit (`git checkout <base> -- <file>`), run the test files that the PR changed, and time it in seconds. The run must exit non-zero.
3. Take the newest merged PR whose changed files are all `*.css` (look back 300 PRs). Do the same with its visual tests (`--project visual`).
4. Use a heavy-command slot. Spend limit: 0 USD (no model).

**Goal:** G7. The stub run is fast enough, and CSS work can go red.

**Red:** not applicable, because there is no code. The Green command prints `0` now.

**Green:** with `LOG=docs/plans/2026-11-01-goal-driven-loop-evidence.md`: `grep -cP '^S3 (largest-pr: [0-9]+|stub-seconds: [0-9]+|stub-red: (yes|no)|css-pr: ([0-9]+|none)|css-stub-red: (yes|no|n/a))\r?$' $LOG` prints `5`.

**Stub check:** an unanswered log prints 0. `stub-red: no` makes the section write the `stub.none` fallback of spec section 4.

**Ratchet:** answer lines for S3, 0 to 5. Spend 0 USD.

## S4 - plan window with no model

**Files:** append `## S4` to the evidence log `docs/plans/2026-11-01-goal-driven-loop-evidence.md`.

**Steps:** question: can a `query()` with no user message call `usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true })` and cause no model turn; does a normal run carry `utilization`?
1. Script in `lc-real-claude-s4` (paste, at most 40 lines): open `query()` with an input stream that sends no message, call the method, count `assistant` messages, print `total_cost_usd` and `rate_limits_available`.
2. One haiku run of one short prompt: print whether any message holds `utilization`.
3. Sandbox as in the lane rules (haiku, low effort, `GH_TOKEN=invalid`, no write tools). Spend limit: 0.10 USD.

**Goal:** G21. The rank rule can read the plan window.

**Red:** not applicable, because there is no code. The Green command prints `0` now.

**Green:** with `LOG=docs/plans/2026-11-01-goal-driven-loop-evidence.md`: `grep -cP '^S4 (usage-call-works: (yes|no)|model-turns: [0-9]+|rate-limits-available: (yes|no)|run-carries-utilization: (yes|no)|spend-usd: 0\.(0[0-9]|10))\r?$' $LOG` prints `5`.

**Stub check:** without a run the count is 0. `model-turns` above 0 makes the section write the fallback of spec section 4.

**Ratchet:** answer lines for S4, 0 to 5. Spend at most 0.10 USD.

## S5 - grouping quality, fixture

**Files:** create `tests/fixtures/process-review/events.json`; append `## S5` to the evidence log `docs/plans/2026-11-01-goal-driven-loop-evidence.md`.

**Steps:** question: does a read-only haiku run on sanitized rows name both causes of G14 in 3 of 3 tries?
1. Fixture: 40 events `{id:"e01".., at, loop:"loop-a", status, text}`. All 12 usage-limit failures (keep the English error text), 14 rows that name Smart App Control (write one English line for each), 14 neutral rows. No loop name, no Vietnamese, no real id.
2. Three haiku runs, read-only: ask for a JSON list of `{cause, ids}`. A try is `both` when one cluster holds at least 10 usage-limit ids and one holds at least 10 Smart App Control ids; `one` or `none` otherwise.
3. If the tries are not 3 of 3, run three sonnet tries the same way.
4. Sandbox: folder `lc-real-claude-s5`, no write tools, `GH_TOKEN=invalid`. Spend limit: 3.00 USD in total.

**Goal:** G14. The review can group causes.

**Red:** not applicable, because there is no code. The Green command prints `0` now.

**Green:** with `LOG=docs/plans/2026-11-01-goal-driven-loop-evidence.md`:
- `grep -cP '^S5 (try-[123]-haiku: (both|one|none)|tries-naming-both: [0-3]|sonnet-tries-naming-both: ([0-3]|not-run)|fixture-events: 40|spend-usd: ([0-2]\.[0-9]{2}|3\.00))\r?$' $LOG` prints `7`.
- `test "$(grep -c '^S5 try-.-haiku: both' $LOG)" = "$(sed -n 's/^S5 tries-naming-both: //p' $LOG | tr -d '\r')" && echo consistent` prints `consistent`.
- `node scripts/lang-scan.mjs --check-baseline` exits 0.
- `node -e "console.log(JSON.parse(require('fs').readFileSync('tests/fixtures/process-review/events.json','utf8')).length)"` prints `40`.

**Stub check:** no fixture fails the last line. A log with an answer that disagrees with its tries fails the second line.

**Ratchet:** answer lines for S5, 0 to 7. Spend at most 3.00 USD.

## S6 - cost of an eval pass

**Files:** append `## S6` to the evidence log `docs/plans/2026-11-01-goal-driven-loop-evidence.md`. The pull request is in castraferrum. It only reads agent-plugins.

**Steps:** question: what does one `run_evals.py` pass over the 5 evals of `epic-loop` cost?
1. Worktree: `git -C ../agent-plugins worktree add --detach ../agent-plugins-s6 origin/main`.
2. Make `C:\...\Temp\lc-real-claude-s6`. Run with `TEMP`, `TMP`, `TMPDIR` set to it and `GH_TOKEN=invalid`: `python scripts/evals/run_evals.py --evals plugins/epic-loop/skills/epic-loop/evals/evals.json --mode with_skill --exec-model haiku --grader-model haiku --runs 1 --jobs 1 --out-dir <that folder>/out`. Read `total_cost_usd` of all cases.
3. Spend limit: 4.00 USD. Kill the process that you started if the total passes it, and write `S6 evals-run` with the cases that ended.
4. Remove the worktree after.

**Goal:** G17. The eval gate has a known price.

**Red:** not applicable, because there is no code. The Green command prints `0` now.

**Green:** with `LOG=docs/plans/2026-11-01-goal-driven-loop-evidence.md`: `grep -cP '^S6 (cost-usd: ([0-3]\.[0-9]{2}|4\.00)|evals-run: 5|over-2-usd: (yes|no))\r?$' $LOG` prints `3`, and `awk '/^S6 cost-usd:/{c=$3} /^S6 over-2-usd:/{o=$3} END{exit !((c>2.00)==(o=="yes"))}' $LOG && echo consistent` prints `consistent`.

**Stub check:** with no pass the count is 0. `evals-run` below 5 fails the count.

**Ratchet:** answer lines for S6, 0 to 3. Spend at most 4.00 USD.

## D1 - Design gap issue, status rows, preview

**Files:** `design/ds/SYSTEM.md` (Content, Statuses table), `shared/i18n/en.ts`, `vi.ts`, `design/ds/STATES.md`, `design/ds/preview/states.js`, `preview.js`, `data.js`, 44 new PNGs in `design/ds/preview/shots/`, `docs/plans/2026-10-21-ui-uplift-goals.json` (`120` to `142`), `tests/tools/goal-loop-status-rows.test.ts`; append `## D1` to the evidence log `docs/plans/2026-11-01-goal-driven-loop-evidence.md`.

**Steps:** `CLAUDE.md` "Design system first" applies. No class, token or colour is new (spec 5).
1. Read `SYSTEM.md`, `tokens.css`, `components.css`. Open one issue: `gh issue create --label design-system`, template "Design system gap". The gap is spec section 5 "One real gap". The features are P15, K12, T6, R9, W7. Write it "issue <n>" in files.
2. One row per word in the Statuses table (pill class). Loop: Waiting for you `.s-warn`, Blocked `.s-fail`, Held `.s-int`, Budget used `.s-warn`, Goal met `.s-ok`, Probe failed `.s-fail`. Run: Held `.s-int`. Period end: Goal met `.s-ok`. Gate job: Queued `.s-wait`, Running `.s-run`, Merged `.s-ok`, Failed `.s-fail`, Needs ratification `.s-warn`. Card: Proposed `.s-wait`, Accepted `.s-ok`, Refused `.s-stop`, Started `.s-run`. Door: Two-way `.s-skip`, One-way `.s-warn`.
3. Keys `goalLoop.<group>.<state>` in `en.ts` and `vi.ts`. Vietnamese only in `vi.ts`.
4. Preview ids, each with `phone-<id>`: `probe-waiting`, `probe-held`, `probe-blocked`, `probe-complete` (screen `loop`), `run-held` (`run`), `gate-queue`, `gate-failed` (new screen `gate`), `goal-rows` (`goals`), `scoreboard`, `card-two-way`, `card-one-way` (`goal-cards`). Use the classes of spec section 5 only.
5. Shoot with `-- --only <22 ids>` in a heavy-command slot. Open all 44 shots. Write `D1 shot <id>-<theme>: <pill word or main element>` for each.

**Goal:** G11, G28. The preview shows each state of spec section 5, desktop and phone, light and dark.

**Red:** add the 22 rows to `STATES.md` and the test first. `npm run design:states -- --design design/ds` prints `states with shots: 120/142`, exit 1. The test prints `Tests  3 failed (3)`.

**Green:** `npm run design:states -- --design design/ds` prints `states with shots: 142/142`. `npm run design:shots -- --design design/ds --dry` prints `drawn 142 states x 2 themes, 0 problems`. `npx vitest run --project unit tests/tools/goal-loop-status-rows.test.ts` prints `Tests  3 passed (3)` (each word has a row, a key in `en.ts`, a pill class in `components.css`). `npm run ratchets` prints `ratchets: ok`. With `LOG=docs/plans/2026-11-01-goal-driven-loop-evidence.md`, `grep -c '^D1 shot ' $LOG` prints `44`.

**Stub check:** no draw function gives `cannot draw` and exit 1 under `--dry`. A table with no rows fails the test.

**Ratchet:** states with shots, 120/120 to 142/142 (`design:states`). It only rises.

## D2 - Owner approval, the only gate

**Who:** the owner. The issue has `loop:needs-human`, and a loop never works on it. It needs D1.

**Steps:** the owner pulls `main`, runs `npm ci` and `npm run design:shots -- --design design/ds --dry`, and opens `design/ds/preview/index.html`. The owner looks at the 11 states and their phone twins, light and dark: `probe-waiting`, `probe-held`, `probe-blocked`, `probe-complete`, `run-held`, `gate-queue`, `gate-failed`, `goal-rows`, `scoreboard`, `card-two-way`, `card-one-way`. The owner also reads the new rows of the Statuses table in `design/ds/SYSTEM.md` and the Vietnamese words in `shared/i18n/vi.ts`. The owner answers on this issue. On approval, the owner or a session that the owner names adds the entry `## the goal-loop screens - <date>` to `design/APPROVED.md`, quotes the owner in English, and the owner closes this issue. A change request is a comment, and D1 is reopened.

**Goal:** G11, G28. The owner accepts the preview that P15, K12, T6, R9 and W7 build against.

**Red:** not applicable, because approval is a human decision.

**Green:** `grep -c '^## the goal-loop screens' design/APPROVED.md` prints `1`, and `gh issue view <this issue> --json state -q .state` prints `CLOSED`.

**Stub check:** with no owner action the count is 0 and the state is `OPEN`. A session cannot approve unless the owner delegates it in writing on this issue.

**Ratchet:** not applicable (human gate). The epic has one owner gate: this one.
