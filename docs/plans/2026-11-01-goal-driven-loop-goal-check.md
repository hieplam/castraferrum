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
