# Plan, issue 215: the process review finds repeated causes and files one issue each (wave 1)

Spec: [../specs/2026-11-01-goal-driven-loop.md](../specs/2026-11-01-goal-driven-loop.md). Plan index: [2026-11-01-goal-driven-loop.md](2026-11-01-goal-driven-loop.md).
Epic: [castraferrum#217](https://github.com/hieplam/castraferrum/issues/217). Evidence log: `2026-11-01-goal-driven-loop-evidence.md`.
Wave 1 holds R1 and R3. R2 and R4 to R9 come in later waves.

## R1 - Count rule lines, rule-lint

**Files:** `scripts/rule-lint.mjs`, `scripts/rule-lint-baseline.json`, `tests/tools/rule-lint.test.ts`, fixture roots `tests/tools/fixtures/rule-lint/{ok,new-unlinked,new-linked,bad-link,stale}/` (each: `CLAUDE.md`, `package.json`, `scripts/{check.mjs,rule-lint-baseline.json}`), `package.json` (script `rule-lint`; `verify` runs it with `--base main`), `.github/workflows/ci.yml` (a step like Ratchets, `--base origin/main`).

**Definition.** Rule files: `CLAUDE.md`, `CONTRIBUTING.md` (the baseline `files`). A block is a list item or a paragraph, its lines joined by a space. Headings, table rows and fenced code are no block. A rule line is a block that matches `/\b(must|never|always|do not|don't|non-negotiable|may only|may not|is forbidden)\b/i`. It has a check if it holds an existing path `(scripts|tests|.githooks|.github)/...`, or `npm run <x>` with `<x>` in `package.json`, or `No machine check:` and 4 or more words. Id: 12 hex of sha256 of `<file>\n<block>`.

**Steps** (G16): `node scripts/rule-lint.mjs [--root d] [--base ref|--base-file f] [--count] [--write-baseline]`. Baseline: `{"v":1,"files":[],"unchecked":[{"file","id","preview"}]}` under `<root>/scripts/`; `--write-baseline` only if absent. Exit 1 on `NEW <file>: <preview>` (unchecked, not in baseline), `STALE <id>` (entry matches no unchecked line), `GROWN <id>` (with `--base`: entry not in the base; no base file: skip). A missing rule file: exit 2. Success: `rule-lint: ok (rule lines N, without a check U, new 0)`. `--count`: `rule lines: N`, `without a check: U`.

**Goal:** G16. A new rule line in a rule file with no link to a check is refused, and the number of rule lines with no check is printed.

**Red:** write 10 tests: count of `ok`; `ok` passes; `new-unlinked` refused; `new-linked` passes; `bad-link` refused (missing path, missing npm script, short `No machine check:`); `stale`; `--base-file` growth; `--write-baseline` will not overwrite; missing rule file exits 2; the repository passes. `npx vitest run --project unit tests/tools/rule-lint.test.ts` shows `Tests  10 failed (10)`.

**Green:** same command: `Tests  10 passed (10)`. `npm run rule-lint -- --base main` ends with `rule-lint: ok (rule lines 13, without a check 8, new 0)` (counts at commit 32252ca; the baseline file holds the true ones).

**Stub check:** a script with only `process.exit(0)` fails `new-unlinked`, `bad-link`, `stale` and growth. One that counts every rule as unchecked fails `new-linked`.

**Ratchet:** `rule-lint --count`, `without a check`: no tool before, 8 after (the G16 first measure). It only falls.

## R3 - process-file-issues, review-due

**Files:** `scripts/process-file-issues.mjs`, `scripts/process-review-due.mjs`, `tests/tools/process-file-issues.test.ts`, `tests/tools/fixtures/process-review/*.json`. Needs F2 (`tests/support/fake-gh.mjs`; read its header to seed and read the world).

**Decision, fingerprint.** T4 owns `shared/domain/fingerprint.ts` (spec 2.11). R3 does not copy it. It reads `cluster.fingerprint` (12 hex, spec 2.12) as the key. R5 (the task that writes the review file) fills the field with T4's function, so R5 needs T4. A model must not compute the hash itself. A cluster with no valid fingerprint: exit 2, no write.

**Steps** (spec 2.12, G14):
1. `process-file-issues.mjs <file> [--dry-run]`. No file: usage, exit 2. gh is `LOOPS_GH_BIN` or `gh`; a `.mjs` runs with `node`. Check every cluster (`v`, `id`, `cause`, `events`, `repo`, fingerprint) before any write.
2. Per cluster with `events >= 2`: `gh issue list -R <repo> --state all --search '"<fp>" in:body' --json number,state`. None: `gh issue create -R <repo> --title "process-review: <cause>" --body-file <f>`, body `<!-- fingerprint:<fp> -->`, cause, events, `firstAt` to `lastAt`, check kind, name, replay. Open: `gh issue comment` (events, `lastAt`). Closed: `gh issue reopen`, then comment.
3. Print `{"created":[],"updated":[],"skipped":[]}` (fingerprints), exit 0.
4. `process-review-due.mjs [--now ISO] [--dir reports/process-review] [--event period_ended|epic_closed]` prints `{"due","reason","last"}`. Due: no `<date>.json`, or the newest is 7 or more days old, or `--event`. Unknown event: exit 2.

**Goal:** G14. A cluster of 2 or more events opens one issue with no owner message. A repeat opens no second issue.

**Red:** write 14 tests: usage; no fingerprint (no write); 3 events create one issue; 1 event none; 2 events one; two clusters two; repeat on open issue comments, no second; repeat on closed reopens; `--dry-run`; due with no report; 6 days; 7 days; `--event`; unknown event. `npx vitest run --project unit tests/tools/process-file-issues.test.ts` shows `Tests  14 failed (14)`.

**Green:** `Tests  14 passed (14)`.

**Stub check:** a script with only `process.exit(0)` fails the create, comment and reopen tests. One that always creates fails both repeat tests.

**Ratchet:** tests in the file, 0 to 14, up only. F0 `causes-found` (G14): D7, baseline only.

Wave 2 adds R2, R5 and R7. Spec: [../specs/2026-11-01-goal-driven-loop.md](../specs/2026-11-01-goal-driven-loop.md) (decision 21 is new). Plan index: [2026-11-01-goal-driven-loop.md](2026-11-01-goal-driven-loop.md).

## R2 - /api/process/events, fixture

**Files:** `shared/contracts/process.ts`; `server/ports/run-repository.ts` and both run repositories (`listBetween`); `server/services/{process-service.ts,contracts.ts}`; `server/http/{process-routes.ts,app.ts}`; `server/compose.ts`; `docs/API.md`; `tests/api/api-surface.test.ts`; `tests/contract/repositories.contract.ts`; `tests/api/process-events-api.test.ts`.

**Steps** (spec 2.12, decision 14):
1. `RunRepository.listBetween(from: Date, to: Date): Promise<RunRecord[]>`: `started_at >= from` and `< to`, every status, ordered by `started_at`, then `id`. Memory and Postgres.
2. `GET /api/process/events?from=<ISO>&to=<ISO>` answers `{events:[{id,at,loop,status,text}]}`. `id` is the run id, `at` the start time in ISO, `loop` the loop id, `status` the run status. `text` joins the non-empty values of `error`, `summary`, `skip_reason` with `\n`, each cut at 2000 characters, or `''`. The body holds no loop name, prompt or path.
3. `from` or `to` missing or not ISO, `from >= to`, or a range over 31 days: 400 `VALIDATION_FAILED`.
4. The 5 keys equal the keys of `tests/fixtures/process-review/events.json`. Gate steps come in R8. R8 adds the `loop-release:` and `loop-found:` comments (issue 215 names them as inputs); R2 reads `runs` only.
5. Add the row to `docs/API.md`, and raise the route count in `api-surface.test.ts` by 1 (read it after the rebase).

**Goal:** G14. The review reads the run events of a period from the console, without names.

**Red:** write 9 api tests: runs of the range, oldest first; `from` in, `to` out; `text` joins the three columns; no text gives `''`; keys equal the fixture keys; the body holds no loop name and no prompt; `from` after `to`; range of 32 days; `from` missing. `npx vitest run --project api tests/api/process-events-api.test.ts` prints `Tests  9 failed (9)`. Add 2 contract cases of `listBetween` (range and order; empty range).

**Green:** the same command prints `Tests  9 passed (9)`. `npx vitest run --project api tests/api/api-surface.test.ts` prints 0 failed, with the line `GET /api/process/events has a registered route`. `npm run test:contract` prints 0 failed and 4 more tests.

**Stub check:** a route that answers `{events:[]}` fails tests 1, 2, 3 and 5. No range check fails tests 7 and 8. A body with the loop name fails test 6.

**Ratchet:** api tests, B to B + 9. Routes in `docs/API.md`, N to N + 1. Up only.

## R5 - Process review: first-pass rules, fingerprints, prompt

**Spec change:** the task graph row of R5 loses `ap`, gains need T4. R5 closes issue 267 (decision 21). Its PR body closes the R5 issue and issue 267 (a GitHub keyword with each number). Needs T4 merged.

**Files:** `scripts/process-review.mjs`, `scripts/process-review/{rules.json,prompt.md}`, `tests/tools/process-review.test.ts`, `tests/tools/fixtures/process-first-pass/{groups.json,groups-bad-id.json,groups-ruled-id.json}`.

**Steps** (spec 2.12, decision 21). Run with `node --import tsx` to import T4's `shared/domain/fingerprint.ts`:
1. `rules.json` is `{"v":1,"rules":[{id,cause,pattern,flags,check}]}`. The first rule that matches the event `text` takes the event. Rule 1: `usage-limit`, pattern `^you['’]ve hit your\b`, flags `im`, cause `The Claude usage limit stopped the run.`, check `{kind:"test",name:"usage-hold.test.ts",replay:"npx vitest run usage-hold.test.ts"}`. Rule 2: `smart-app-control`, pattern `smart\s+app\s+control`, flags `i`, cause `Windows Smart App Control blocked an unsigned binary.`, check `{kind:"test",name:"holds.test.ts",replay:"npx vitest run holds.test.ts"}`. A bad regex, a repeated id or a missing key: exit 2.
2. `first-pass --events <f> [--rules <f>] --repo <o/r> --from <ISO> --to <ISO> --out <f>` writes `{v,from,to,repo,clusters:[{id,cause,ids,check}],rest:[event]}`. Events are rows of the R2 shape. Clusters follow the rule order, `ids` the event order. A rule with no match gives no cluster.
3. `first-pass --real [--until <ISO>]` reads the real database read-only, as `scripts/metrics/baseline.mjs` does (SELECT of `id, started_at, status, error, summary, skip_reason`). It builds `text` as R2 does, keeps the rows in memory, and prints only `real <rule-id> <n>` and `real rest <n>`. It writes no file and prints no text.
4. `assemble --first-pass <f> --groups <f> --out <f>`. `groups` is `{clusters:[{id,cause,ids,check}]}` from the model, over ids of `rest` only. Exit 2 and write nothing for an unknown id, an id of a rule cluster, an id in two groups, or an `id` that fails `^[a-z0-9-]{1,40}$`. The script sets `events`, `runIds`, `firstAt`, `lastAt` (min and max `at`), `repo` and `fingerprint` of each cluster. Rule cluster: `fingerprint(repo,'rule:'+id,cause)`. Model cluster: `fingerprint(repo,'model',text of its earliest event)`. The output is spec 2.12.
5. `prompt.md` tells the review run: read `rest` only, write `groups.json`, never write a count, date, hash or id that is not in `rest`, then run `assemble` and `process-file-issues.mjs`.

**Goal:** G14. One issue for usage limits and one for Smart App Control, from the fixture and from the real rows, with no model needed for these two causes.

**Red:** write 12 tests on `tests/fixtures/process-review/events.json`, repo `o/r`: `usage-limit` has 12 ids (both forms); `smart-app-control` has 14; `rest` has the 14 other rows; 3 runs give identical output; order and a rule with no match; a bad regex exits 2; a typographic apostrophe is taken; rule fingerprints are `58237cb2147d` and `0f274a882e6b`; with `groups.json` (`skipped-runs`: e06, e18, e23; `cancelled-from-console`: e14, e27) the model fingerprints are `99bba937603b` and `8fad049b186e`, events 3 and 2; unknown id exits 2; rule-cluster id exits 2; keys equal spec 2.12. `npx vitest run --project unit tests/tools/process-review.test.ts` prints `Tests  12 failed (12)`. Also `node --import tsx scripts/process-review.mjs first-pass --real` prints `Cannot find module`.

**Green:** the same test command prints `Tests  12 passed (12)`. The real command prints `real usage-limit 12` and `real smart-app-control 14`, exit 0 (the bar of issue 267 is at least 10). Paste the real output in the PR, with no row text.

**Stub check:** an empty `rules.json` fails tests 1 and 2, and the real command prints `0`. A rule for `weekly` only gives 3, not 12. A script that puts every event in `rest` fails test 3.

**Limit:** the rules were written after the answer was known. They prove that known causes are filed, not that the review finds a new cause. R6 must prove the new-cause path (decision 21).

**Limit:** the 14 Smart App Control rows are the rows that the same text match finds (S5). The 4 other rows of the S5 cluster are not judged.

**Ratchet:** the largest usage-limit cluster on the real rows, 9 (S5, model) to 12, and the largest Smart App Control cluster, 8 to 14. Tests, 0 to 12. Up only.

## R7 - Eval gate for tick.md, drive.md

**Repo:** agent-plugins (sonnet); the issue stays in castraferrum. Worktree `../agent-plugins-eval-gate` from the clone, base `origin/master`. PR body `Closes hieplam/castraferrum#<n>`. `SK` is `plugins/epic-loop/skills/epic-loop`. A later PR that changes `tick.md` or `drive.md` (K10, W3) must run this gate and commit a new `SK/evals/gate-result.json`.

**Files:** `scripts/evals/eval_gate.py`, `scripts/evals/tests/test_eval_gate.py`, `SK/evals/gate-result.json`, `scripts/evals/README.md` (section "Eval gate").

**Steps** (spec 4, S6):
1. `decide(base, cand, min_runs=5)` is pure. It reads two `benchmark.json` dicts with `compare.index_runs` (`with_skill`, arm `clean`, `ungraded` skipped). For each eval id: baseline `bp/bt`, candidate `cp/ct`. Verdict `error` if a case has under `min_runs` graded runs on a side, or is on one side only. A case is `worse` when `cp/ct < bp/bt` and the hypergeometric chance `P(X <= cp)` is under 0.10 (`N = bt+ct`, `K = bp+cp`, `ct` drawn, `math.comb`). Any `worse` gives `refuse`, else `pass`. A baseline failure is no reason: 0/5 to 0/5 passes. Table at 5 runs: 5/5 to 2/5 and 3/5 to 0/5 refuse; 3/5 to 1/5 passes.
2. `check --baseline B --candidate C` prints `eval <id> <bp>/<bt> -> <cp>/<ct> ok|WORSE`, then `verdict: pass|refuse|error`. Exit 0, 1, 2.
3. `write-result ... --out SK/evals/gate-result.json` writes `{v,files:{references/tick.md:<sha256>,references/drive.md:<sha256>},runs,cases:{<id>:{baseline,candidate}},pooled:{baseline,candidate},verdict:"pass"}`, only on `pass`.
4. `verify-result [--skill-dir SK]`: exit 1 with `refuse: references/tick.md changed since the gate ran` if a hash differs, the file is missing, or the verdict is not `pass`; else `verify-result: ok`.
5. README: run `run_evals.py --evals SK/evals/evals.json --mode with_skill --exec-model haiku --grader-model haiku --runs 5 --jobs 4 --label baseline` in a worktree of the base, again with `--label candidate` in the PR worktree. Cost (S6): about 0.04 USD of executor calls for one pass, so about 0.22 USD for a side, and about 3 minutes. The grader cost is not recorded; stop if the executor cost of one side passes 0.50 USD. A known baseline: eval 3 passes 3 of 5, eval 4 passes 0 of 5, on both sides of the skill changes, because the agent does not load the skill. A refusal on two identical sides: run again once.
6. This PR does not change `tick.md` or `drive.md`. It commits the first result, from `origin/master` against itself.

**Goal:** G17. A change of `tick.md` or `drive.md` with no gate result is refused, and a change that is equal or better passes.

**Red:** write 13 tests: equal; better; 5/5 to 2/5; 3/5 to 0/5; 3/5 to 1/5 passes; 0/5 to 0/5 passes; one worse case among 7; under 5 runs is `error`; `ungraded` is skipped; a case on one side; `verify-result` refuses after one character is added to a copy of `tick.md`; `verify-result` passes on the committed tree; `write-result` writes no file on `refuse`. `python3 -m unittest discover -s scripts/evals/tests -t . -p test_eval_gate.py` prints `FAILED (errors=1)`.

**Green:** the same command prints `Ran 13 tests` and `OK`. `python3 scripts/evals/eval_gate.py verify-result --skill-dir SK` prints `verify-result: ok`. The real `check` prints 7 case lines and `verdict: pass`; paste it with the executor cost sum.

**Stub check:** a `decide` that always passes fails the two refuse tests and the one-worse-of-7 test. One that always refuses fails the equal, better and noise tests. A `verify-result` that ignores hashes fails the changed-copy test. Adding a line to the real `tick.md` makes the committed-tree test fail.

**Ratchet:** tests in `test_eval_gate.py`, 0 to 13, up only. `gate-result.json` records the pooled passes of the 7 evals x 5 runs on both sides: baseline only, no target, because eval 3 varies from run to run. The PR adds a `## R7` section to the evidence log in a docs-only castraferrum PR.

Wave 4 adds R4, R6 and R8. R9 waits for the owner's preview approval. Spec: [../specs/2026-11-01-goal-driven-loop.md](../specs/2026-11-01-goal-driven-loop.md) (decisions 48 to 50 are new). Plan index: [2026-11-01-goal-driven-loop.md](2026-11-01-goal-driven-loop.md).

## R4 - Tool profile review

**Needs** K8 (issue 292) merged. Read how K8 builds `hooks` in `claude-agent-executor.ts` first, and keep its entry as it is.

**Files:** `shared/domain/review-guard.ts`; `server/ports/executor.ts`; `server/adapters/executors/claude/claude-agent-executor.ts`; `server/services/run-service.ts` and its test; `scripts/process-review/prompt.md`; `docs/ARCHITECTURE.md`; `tests/api/review-profile.test.ts`.

**Steps** (decision 49; issue 311: a scratch folder holds no session, only a hook does):
1. `review-guard.ts` exports `REVIEW_TOOLS = ['Read','Grep','Glob','Bash','Write']`; `parseToolProfile(v: string | undefined): 'full' | 'review' | null` (`undefined` gives `full`, an unknown word gives `null`); `checkReviewTool(toolName, toolInput, reviewDir): { deny: false } | { deny: true; rule; reason }`.
2. Rules. `Read`, `Grep`, `Glob`: allow. `Write`: allow only an absolute `file_path` that starts with `reviewDir/` after `\` becomes `/` and case is ignored, with no `.` or `..` segment; else `write-path`. `Bash` or `PowerShell`: a non-string `command` is `bad-input`; the command must match `^node( --import tsx)? scripts/(process-review|process-file-issues|process-review-due)\.mjs( [\w./:@=+-]+)*$` with no `..`, else `bash-not-listed`; the word after `--out` must start with `reports/process-review/`, else `bash-out`. Any other tool, `mcp__*` too: `tool-not-listed`.
3. `ExecutionInput.toolProfile?: 'full' | 'review'`. For `review` the executor sets `tools: REVIEW_TOOLS` and adds one `PreToolUse` entry, matcher `.*`. Its callback calls `checkReviewTool(tool_name, tool_input, join(input.cwd, 'reports', 'process-review'))`, returns the deny shape of K8, and calls the constructor option `onGuard?.({ tool, deny, rule })`. With `full` or no profile there is no `tools` key and no review entry.
4. RunService reads `parseToolProfile(env?.CASTRAFERRUM_TOOL_PROFILE)`. `null` ends the run `failed` before the executor, error `Unknown tool profile "<v>"` (the path of "No such executor"). `review` sets `input.toolProfile`.
5. `prompt.md`: each `groups.json` becomes `reports/process-review/groups.json`. `ARCHITECTURE.md`, The Claude executor: the profile, the variable, and the limit that a script on the allowed list is trusted.

**Goal:** G14. A review run changes no file outside `reports/process-review/` and runs only the three review scripts, in the main thread or in a subagent.

**Red:** write 37 tests in `describe('review-profile')`. `it.each` over 21 refused lines: `Write` outside the folder, with a relative path, with `..`, in `process-review-evil/`, with no `file_path`; `Edit`, `MultiEdit`, `NotebookEdit`; Bash `echo x > a.txt`, `git commit -am x`, `gh issue create --title x`, `<allowed script> && rm -rf x`, `--out src/x.json`, `--out reports/process-review/../x.json`, `node scripts/other.mjs`; PowerShell `Set-Content a.txt x`; a number as `command`; `mcp__github__create_issue`, `Agent`, `WebFetch`, `Foo`. `it.each` over 9 allowed lines: `Read`, `Grep`, `Glob`; `Write` inside, also `C:\repo\reports\process-review\g.json`; Bash `assemble` with every path in the folder, `first-pass --real`, `process-file-issues.mjs <file> --dry-run`, `process-review-due.mjs --now 2026-11-01T00:00:00Z`. Wiring on the fake query, 6 cases: review options; `full` has none; the hook denies `Write` outside and calls `onGuard`; it allows inside; with `gateGuard` there are 2 entries and `gh pr merge 1` is still denied; a call with `agent_id` is denied the same. Real, 1 case (`LC_REAL_CLAUDE=1`): haiku, low effort, folder `lc-real-claude-r4`, `GH_TOKEN=invalid`; asked to write a marker outside `reports/process-review/`, to run `echo x > bash.txt`, and to write `ok.txt` inside. Add 3 cases to `run-service.test.ts` (review passes; no variable gives no key; unknown fails). `npx vitest run --project api tests/api/review-profile.test.ts` prints `Cannot find module` and `Test Files  1 failed (1)`.

**Green:** the same command prints `Tests  36 passed | 1 skipped (37)`. With `LC_REAL_CLAUDE=1` and `-t real` it prints `1 passed`: the marker and `bash.txt` do not exist, `ok.txt` exists, and `onGuard` ran at least 3 times with 2 or more `deny: true`. A model that chose not to write would leave no call. `npx vitest run --project unit server/services/run-service.test.ts` shows 3 more tests and 0 failed. `npm run verify` exits 0.

**Stub check:** a `checkReviewTool` that always allows fails 21 lines. One that always denies fails 9. A wiring that omits `tools` fails wiring case 1, and the real run then writes the marker. Run all three, restore.

**Ratchet:** `npx vitest list --project api 2>/dev/null | wc -l` rises by 37. Unit tests rise by 3. Up only.

## R6 - Replay oracle, real and recorded

**Needs** R2, R3 and R5 merged, and R4 (graph order). Decision 50. Accepted only after the coordinator check in the Limit paragraph.

**Files:** `scripts/process-review/{groups.mjs,model-run.mjs}`; `scripts/process-review.mjs`; `tests/tools/process-review-model-run.test.ts`; `tests/api/process-review-replay.test.ts`; `tests/tools/fixtures/process-first-pass/groups-haiku.json`.

**Steps** (spec 2.12, decisions 21 and 50):
1. `groups.mjs` exports `groupProblems(pass, groups): string[]`: the checks of `assemble`, moved out as they are. `assemble` calls it. The R5 tests keep their count.
2. `model-run.mjs` exports `modelRun({ rest, ruleIds, query, model, maxUsd, cwd })` and `formatReport(result)`. The prompt is `prompt.md`, then `Do not run a command. Reply with the content of groups.json only, as JSON.`, then `{"rest":[{"id":"r001","text":"..."}]}` (text cut at 1000 characters). Options of `query`: `model`, `effort: 'low'`, `tools: []`, `settingSources: []`, `persistSession: false`, `maxTurns: 1`, `maxBudgetUsd: maxUsd`, `cwd`, `env` with `GH_TOKEN: 'invalid'`. It reads the `result` message (`result`, `total_cost_usd`) and parses the first JSON object, also inside a json fence.
3. Verdict `pass` only if all hold: cost at most `maxUsd`; `groupProblems` is empty; at least one cluster has 2 or more ids and an `id` that is no rule id. Else `FAIL, <reason>`.
4. `model-run --real [--rules f] [--until ISO] [--model haiku|sonnet] [--max-usd 1.00]` reads the real rows as `first-pass --real` does, keeps `rest` in memory, uses a fresh `lc-real-claude-r6-*` folder as `cwd`, removes it, and writes no file. It prints only `real rest <n>`, one `real-model cause <k> <size>` per cluster (k counts from 1; no id, no cause, no text), `real-model new causes <n>`, `real-model spend-usd <x>`, and `real-model verdict: pass` or `real-model verdict: FAIL, <reason>`. Exit 0 on pass, 1 on FAIL. `--real` with `--record` exits 2. With `--show-causes` it also prints one line `real-model cause <k> <size>: <cause>` per cluster, to stdout only, and still writes no file. Without the flag no cause text is printed. The builder never runs the flag and never pastes a cause.
5. `model-run --first-pass <f> --record <out> [--model] [--max-usd]` does the same on a first-pass file and writes the groups to `<out>` only on pass. Record haiku on the first-pass file of `tests/fixtures/process-review/events.json`. Commit the output as `groups-haiku.json`.
6. Replay test (api project, `startApi`): insert the 40 fixture rows as `runs` (a random uuid each; the text goes to `error` for `failed`, `skip_reason` for `skipped`, else `summary`). Read `GET /api/process/events` for 2026-10-19 to 2026-10-23. Run `first-pass`, `assemble` with `groups-haiku.json` (ids mapped to the uuids in a temp copy) and `process-file-issues` on the fake `gh`.
7. Real run: `model-run --real --model haiku`. On FAIL, one try with `--model sonnet`. All spend together, with step 5, is at most 1.00 USD. If both FAIL, R6 fails: comment the issue with the literal output, change no rule, prompt or threshold, and report BLOCKED. Only counts go in the evidence log.

**Goal:** G14. On the 201 real rows that no rule took, a real model run names a repeated cause that no rule holds. The recorded replay files one issue per cluster, and a repeat files none.

**Red:** write 13 unit tests: the R5 `groups.json` as the reply gives pass with sizes 3 and 2; empty clusters fail; a cluster of 1 id fails; an id of a rule cluster fails; a reply that is not JSON fails; a json fence parses; the `query` options above; with the flag off, the report lines match `^real-model (cause \d+ \d+|new causes \d+|spend-usd [\d.]+|verdict: .+)$` and hold no row text or cause (the rows and the reply carry a marker word); with `--show-causes` the cause text is in stdout and in no file; spend over the limit fails; `--record` writes groups that `assemble` accepts; `--real` with `--record` exits 2; a cluster id equal to a rule id fails. Write 4 replay tests: issues equal the clusters with 2 or more events, with the fingerprints `58237cb2147d` and `0f274a882e6b`; a second replay adds 0 issues and 1 comment per issue; `{"clusters":[]}` gives 2 issues and the recorded file more; `rest` from the API equals `rest` from the file. `npx vitest run --project unit tests/tools/process-review-model-run.test.ts` prints `Test Files  1 failed (1)`. `npx vitest run --project api tests/api/process-review-replay.test.ts` prints `Tests  4 failed (4)`. `node --import tsx scripts/process-review.mjs model-run --real` exits 2 with the usage.

**Green:** unit `Tests  13 passed (13)`; replay `Tests  4 passed (4)`; `tests/tools/process-review.test.ts` keeps its count. Real: `real rest 201`, at least one `real-model cause <k> <size>` with size 2 or more, `real-model verdict: pass`, exit 0.

**Stub check:** a `modelRun` that returns no clusters fails the empty-clusters test. `model-run --real --max-usd 0.001` ends `real-model verdict: FAIL` with exit 1, because the budget stops the call. An empty `groups-haiku.json` fails replay tests 1 and 3.

**Limit:** pass means the model grouped valid rows under a valid check. The task does not judge whether a cause is real, as in S5. So R6 is accepted only after the coordinator runs `model-run --real --model haiku --show-causes` one time at the gate and judges that each new cause is real. The two rules still prove only known causes.

**Ratchet:** tests 0 to 17, up only. Real `new causes`: no target, record the number. F0 `causes-found`: D7.

## R8 - Gate refusals and the `loop-release:` and `loop-found:` comments as an input

**Needs** K5 (issue 306) merged, and R2 merged. Read `gate-repository.ts`, `gate-service.ts` and `compose.ts` after K5. Decision 48.

**Files:** `shared/contracts/process.ts`; `shared/domain/errors.ts`, `shared/contracts/common.ts`, `server/http/errors.ts`, `shared/i18n/{en,vi}.ts` (code `GIT_HOST_FAILED`; grep `GATE_OFF` for each place); `server/ports/{gate-repository,git-host}.ts` and the memory and Postgres gate adapters; `server/adapters/github/gh-git-host.ts` and its test; `server/services/{process-service,contracts}.ts`; `server/http/{process-routes,app}.ts`; `server/compose.ts`; `tests/support/{fake-gh.mjs,fake-gh-kit.ts}` and `tests/tools/fake-gh.test.ts`; `scripts/process-review.mjs`; `tests/fixtures/process-review/signals.json`; `docs/API.md`; `tests/api/{api-surface,process-signals-api}.test.ts`; `tests/contract/repositories.contract.ts`; `tests/tools/process-review.test.ts`.

**Steps** (spec 2.12, decision 48):
1. `GateRepository.listRefusedBetween(from, to): Promise<GateJob[]>`: state `failed` or `needs_ratification`, `finished_at >= from` and `< to`, ordered by `finished_at`, then `id`.
2. `GitHost.loopComments(repo, since): Promise<{ issue: number; id: string; at: Date; body: string }[]>` runs `gh issue list -R <repo> --state all --search "updated:>=<date>" --limit 1000 --json number,comments` and keeps the comments whose body starts with `loop-release:`. A list of 1000 issues throws `GitHostError` (cut off). The fake `gh` gains the `updated:>=` search, `--limit`, and `id` and `createdAt` on each comment.
3. `GET /api/process/signals?from&to&repo` answers `{ gate: Item[], comments: Item[] }`, `Item = { id, at, kind, text }`. Gate: `id` `gate:<job id>`, `text` `<failed step>: <firstFailingLine of the output tail of that step>`. Comment: `id` `comment:<issue>:<comment id>`, `text` the lines before the first blank line, plus the `loop-found:` line if there is one. Each text is cut at 2000. The range rules of R2 apply. A `GitHostError` gives 502 `GIT_HOST_FAILED`, never empty lists.
4. `first-pass --signals <file>` appends the `gate` and `comments` items to the events. An item with a wrong key set, or an id that repeats, exits 2 and writes nothing. `signals.json` holds 2 gate and 2 comment items.
5. `docs/API.md` row. Raise the route count in `api-surface.test.ts` by 1.

**Goal:** G14. A refused gate job and a `loop-release:` or `loop-found:` comment reach the review as events, with no loop name, prompt, PR number or commit.

**Red:** write 9 api tests: a failed job gives `green: ...`; `needs_ratification` gives `scope: ...`; merged and queued jobs give none; the range edges; a `loop-release:` comment gives its reason and found line with no boilerplate; `loop-attempt:` and out-of-range comments give none; each item has exactly `id, at, kind, text`, and the body holds no head sha, repo id or PR number; a broken `gh` gives 502 `GIT_HOST_FAILED`; a bad `repo` or range gives 400. Add 2 contract cases per side, 2 `loopComments` tests, 2 fake-gh tests and 3 `first-pass --signals` tests. `npx vitest run --project api tests/api/process-signals-api.test.ts` prints `Tests  9 failed (9)`.

**Green:** the same command prints `Tests  9 passed (9)`. `npx vitest run --project api tests/api/api-surface.test.ts` prints 0 failed and `GET /api/process/signals has a registered route`. `npm run test:contract` shows 0 failed and 4 more tests. `tests/tools/process-review.test.ts` prints `Tests  15 passed (15)`. `npx vitest run --project unit server/adapters/github tests/tools/fake-gh.test.ts` shows 4 more tests. `npm run verify` exits 0.

**Stub check:** a route that answers empty lists fails 6 of 9 tests. A swallowed `GitHostError` fails the 502 test. An item that holds the job id or PR number fails the keys test. Run all, restore.

**Ratchet:** api tests, B to B + 9. Contract tests, C to C + 4. Routes in `docs/API.md`, N to N + 1. Up only. F0 `causes-found`: D7.

Wave 6 adds R9. It needs D2 (done on 2026-11-01) and R8 (`GateRepository.listRefusedBetween`, branch `feat/gdl-r8-signals`, pull request 338, not merged). It relies on names that can change: `listRefusedBetween`, `RunRepository.listBetween` (R2, merged), `CommandRunner` (P1, merged), and the review file of spec 2.12 as R5 writes it (`clusters[].runIds` hold the event ids, run ids and `gate:<job id>`). Read the merged code before you build.

## R9 - Scoreboard API, page

**Files:** server: `shared/contracts/scoreboard.ts`, `server/ports/review-reports.ts`, `server/adapters/fs/fs-review-reports.ts` and test, a memory adapter, `server/services/scoreboard-service.ts`, `contracts.ts`, `server/http/scoreboard-routes.ts`, `app.ts`, `compose.ts`, `docs/API.md`, `tests/api/scoreboard.test.ts`, `tests/api/api-surface.test.ts`. Web: `web/api/{loops-api,http-loops-api,fake-loops-api}.ts`, `web/data/scoreboard.ts`, `web/features/scoreboard/ScoreboardView.tsx`, `web/pages/ScoreboardRoute.tsx`, `web/app/AppRoutes.tsx`, `web/features/settings/SettingsView.tsx`, `shared/i18n/{en,vi}.ts`. Tests: `tests/visual/ds/scoreboard.visual.ts`, `tests/support/goal-loop-score-world.ts`, `tests/e2e/scoreboard-page.spec.ts`. Also the evidence log `## R9`.

**Steps:**
1. Read `design/ds/SYSTEM.md`, `tokens.css`, `components.css`, `STATES.md`, and the functions of `preview/preview.js` and the data of `preview/data.js` named here. Use existing classes only: `.stats`, `.stat`, `.group`, `.cell`, `.cell-value`, `.page-desc`, `.cell.is-link`; no chart. No new class, token, colour or native `title`. If more is needed, stop and open a `design-system` issue.
2. Port `ReviewReports.read(repoPaths: string[]): Promise<ReviewCluster[]>`. The fs adapter reads each `<repoPath>/reports/process-review/*.json`. It ignores a file that is not JSON or not spec 2.12. A cluster with no `check`, or an empty `check.name`, has no check.
3. `GET /api/process/scoreboard?tz=` (default `Asia/Ho_Chi_Minh`) answers `{ figures:{causes,checks,before,after}, weeks:[{from,repeats}], causes:[{fingerprint,cause,checkName,checkMergedAt,before,after,repeats}] }`. The rules, in order:
   - Group the clusters of all files by `fingerprint`. A cause has the union of the ids of its `runIds`.
   - Date of an id: a run id gives `runs.startedAt` (`listBetween`); `gate:<id>` gives `finishedAt` of the job (`listRefusedBetween`); a `comment:` id has no date and is skipped. `repeats` is the number of dated ids.
   - `checkMergedAt` is the oldest line of `git log --diff-filter=A --format=%cI -- <check.name>`, run with `CommandRunner` in the repo folder. A name that starts with `-` or holds `..` gives no check, and no git call. No line gives `null`.
   - With a date: `before` counts dated ids before it, `after` the ids at or after it (an id at the same instant counts as after). Without: both are 0.
   - `figures.causes` is the number of causes with a dated id in the 30 days before now. `checks` is the number of causes with a date. `before` and `after` are the sums over causes with a date.
   - `weeks` are the 5 weeks that end with the week of now. A week starts on Monday 00:00 in `tz`. `repeats` counts the dated ids of all causes in it. Oldest first.
   - `causes` are sorted by `repeats`, largest first, then by `cause`.
4. Page `/scoreboard` (tab Settings, narrow, back to Settings). A new key `goalLoop.score.link` names the entry: a `.cell.is-link` group at the end of the Settings page, shown only when `figures.causes` is above 0. A failed request, or no cause, hides it, so the approved Settings shots do not change (`frame.visual.ts` stays as it is).
5. Seed `seedScoreboard(sp, db)` in `tests/support/goal-loop-score-world.ts` (Z2 imports it; it returns `{ path }`). It resets, sets the clock to `PREVIEW_NOW`, runs `seedPreviewWorld`, makes the folder of repo `api` a git repo with two commits dated 2026-10-02 09:00 (`scripts/preflight.mjs`) and 2026-10-08 09:00 (`tests/api/usage-hold.test.ts`) in `Asia/Ho_Chi_Minh`, writes `reports/process-review/2026-10-18.json` with 3 clusters, and inserts 16 `runs` of loop `pilot` (status `failed`, 10:00 local). The events:
   - Usage limit ends a run (check `tests/api/usage-hold.test.ts`): 3 on 15/09, 2 on 22/09, 2 on 29/09.
   - Smart App Control blocks tests (check `scripts/preflight.mjs`): 2 on 15/09, 1 on 22/09, 1 on 29/09, 1 on 06/10.
   - A test port is already taken (no check): 1 on 16/09, 2 on 23/09, 1 on 07/10.
   The result must equal `goalLoop.score` of `data.js`: figures 3, 2, 11, 1; weeks 6, 5, 3, 2, 0; causes 7 and 0, 4 and 1, 4 repeats.
6. `scoreboard.visual.ts`: 2 tests (`scoreboard`, `phone-scoreboard`), 4 pairs. Regions: desktop `[regions.page()]`, phone `[regions.navbar(), regions.page()]`. `test.afterAll(() => writeReport('scoreboard'))`.
7. `scoreboard-page.spec.ts`, 2 tests: with the seed, Settings shows the link and it opens `/scoreboard` with `score-cause` three times; with no report file the link is not in the page.
8. Run `npm run design:compare` once. The PR body has `Acceptance: "pairs": <n>, "worstRatio": <r>`.

**Goal:** G15. The owner sees, for each cause, its repeats before and after the date its check merged, and the page matches `scoreboard` (desktop, phone, light, dark).

**Red:** after the tests exist, `npm run build`, then `npx playwright test --project visual tests/visual/ds/scoreboard.visual.ts --reporter list` prints `2 failed`. `npx playwright test tests/e2e/scoreboard-page.spec.ts --project chromium --reporter list` prints `2 failed`. `npx vitest run --project api tests/api/scoreboard.test.ts` prints `Tests  8 failed (8)`: the seeded world gives figures 3, 2, 11, 1; weeks 6, 5, 3, 2, 0; the split at the check date (an id at the instant counts as after); a cause with no check has repeats only and is out of the sums; the same fingerprint in two files merges and counts an id once; a `comment:` id is skipped; a bad file is ignored and no file gives zeros; a name with `..` or a leading `-` makes no git call.

**Green:** the visual command prints `2 passed`. `node -e "const r=require('./reports/compare/ds/results/scoreboard.json');console.log(r.length,Math.max(...r.flatMap(s=>s.regions.map(x=>x.ratio)))<=0.001)"` prints `4 true`. scoreboard-page prints `2 passed`. scoreboard.test.ts prints `Tests  8 passed (8)`. `npx vitest run --project unit server/adapters/fs/fs-review-reports.test.ts` prints `Tests  3 passed (3)` (two files; a bad file; no folder). `npx playwright test --project visual tests/visual/ds/frame.visual.ts` exits 0. `npm run ratchets` prints `ratchets: ok`. `npm run verify` exits 0.

**Stub check:** make the service answer zero figures: the first api test and the pixel pairs fail. Split at `before` only (drop `after`): the split test fails. Count a cause with no check in the sums: the no-check test fails. Make `ScoreboardView` return `null`: `2 failed`. Run each, restore.

**Ratchet:** pairs in `results/scoreboard.json`, 0 to 4. Api tests +8, unit +3. `e2e expects:` line of `npm run ratchets` rises. Metric `cause-repeats`: decision 7, "not measured yet". All only rise.
