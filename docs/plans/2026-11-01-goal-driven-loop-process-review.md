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
