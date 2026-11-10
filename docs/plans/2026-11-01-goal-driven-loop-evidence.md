# Evidence log: goal-driven loop (epic 217)

Plan index: [2026-11-01-goal-driven-loop.md](2026-11-01-goal-driven-loop.md). Spec: [../specs/2026-11-01-goal-driven-loop.md](../specs/2026-11-01-goal-driven-loop.md).

Each task adds one section headed `## <task id>` with commands and literal output only: Red, each Green, the ratchet before and after, the test counts. A spike adds the exact answer lines that its plan section names, for example `S1 resume-keeps-session-id: yes`. A spike Green fails when these lines are missing.

A task adds its section directly under its own anchor line, so that parallel lanes do not conflict. Do not move or remove an anchor.

<!-- F0 -->

## F0

Red (test file only, tool absent):

    $ npx vitest run --project unit tests/tools/metrics-baseline.test.ts
    Error: Cannot find module '../../scripts/metrics/baseline.mjs' imported from tests/tools/metrics-baseline.test.ts
     Test Files  1 failed (1)
          Tests  no tests

Green:

    $ npx vitest run --project unit tests/tools/metrics-baseline.test.ts
     Test Files  1 passed (1)
          Tests  10 passed (10)
    $ node scripts/metrics/baseline.mjs --all --check
    baseline: 16 metrics, 0 differences

The 16 lines (`node scripts/metrics/baseline.mjs --all --now 2026-11-01T15:15:00Z`):

    window 227 rows until 2026-10-23T00:00:00Z
    idle-runs 125 sessions transcripts
    gap 14.4 min runs
    limit-failures 12 runs runs
    idle-days 10 days runs
    late-tasks 57.9 percent github
    owner-stops 6 stops recorded
    dead-claims 253 hours recorded
    merged-on-red 12 PRs recorded
    stub-share 0 percent recorded
    poll-share 37 percent recorded
    first-goal-day 3 day recorded
    status-questions 7 questions recorded
    owner-messages 0.84,1.77 messages per PR recorded
    causes-found 0 causes recorded
    cause-repeats 11 repeats recorded
    blocked-runs 12 runs recorded

Live numbers, issue against measured (the measured number is in `baseline.json`):

| Metric | Issue | Measured | In `baseline.json` |
|---|---|---|---|
| idle-runs | 108 | 125 | 125 |
| gap | 14.5 | 14.4 | 14.4 |
| limit-failures | 12 | 12 | 12 |
| idle-days | 10 | 10 | 10 |
| late-tasks | 56 | 57.9 | 57.9 |

Stub check:

- Six functions replaced by constants (gap, limit-failures, idle-days, idle-runs, late-tasks, owner-messages): `Tests  5 failed | 5 passed (10)`, then with idle-days alone as the constant 10: `Tests  1 failed | 9 passed (10)`. The idle-days test uses a second clock, so that the constant 10 fails.
- Tool file removed: `Test Files  1 failed (1)`, `Tests  no tests`, cause `Cannot find module '../../scripts/metrics/baseline.mjs'`.

Ratchet, metrics with a committed baseline: 0 before, 16 after (`baseline: 16 metrics, 0 differences`).

<!-- F1 -->

## F1

Red (before the manifest and the test existed):

- `node scripts/goal-check.mjs goals/2026-11-01-goal-driven-loop.json` exit 1, `Error: ENOENT: no such file or directory, open '...goals\2026-11-01-goal-driven-loop.json'`.
- `npx vitest run --project unit tests/tools/goal-driven-manifest.test.ts`: `Test Files  1 failed (1)`, `Tests  no tests`.

Green:

- `npx vitest run --project unit tests/tools/goal-driven-manifest.test.ts`: `Tests  4 passed (4)`.
- `node scripts/goal-check.mjs goals/2026-11-01-goal-driven-loop.json`: exit 1, 29 rows, last line `goals passed: 2/29`. Only G12 and G22 pass (the F0 metric tool). The 6 ap goals (G10, G11, G17, G25, G26, G29) are red here because the local `agent-plugins` clone is on an old commit on purpose.
- The ap test-name patterns were run on `origin/master` of `agent-plugins` in a temporary worktree: `✔ G10: ...`, `✔ G11: ...`, `✔ G25: ...`, `✔ G26: ...`, `✔ G29: ...` all print. G17 has no file there yet, so it stays red.

Stub check:

- G1 set to `node -e 0` in a copy: `G1 pass`, `goals passed: 1/1` (1/29 on the full copy). The test `every goal has a check that can fail` is the guard: a check with no expected text fails it.
- G1 with an empty `checks` list: `Tests  1 failed | 3 passed (4)`, the failing test is `every goal has a check that can fail`.

Ratchet, goals passing: 0 before (no manifest), 2 of 29 after.

<!-- F2 -->

## F2

Red: `npx vitest run --project unit tests/tools/fake-gh.test.ts`
```
 Test Files  1 failed (1)
      Tests  no tests
```
Green: same command
```
 Test Files  1 passed (1)
      Tests  10 passed (10)
```
Stub check: empty `fake-gh.mjs` gives `Tests  10 failed (10)`; deleted `fake-gh.mjs` gives `Tests  10 failed (10)`.
Ratchet (`npm run test:unit`, Tests passed): 532 before, 542 after (one run showed 541 plus a load timeout of `arch-fixtures`, filed as issue 254).

<!-- S1 -->

## S1

Commands: read-only SQL (`set default_transaction_read_only=on`) listed the 12 failed runs. A Node script scanned each `~/.claude/projects/*/<id>.jsonl` and printed only event types and line numbers, never message text. The SDK is 0.3.303, model `haiku`, effort `low`, `tools: []`, `GH_TOKEN=invalid`, folder `lc-real-claude-s1`.

Answer lines:

S1 order: rate_limit_event > assistant_error > result
S1 resume-keeps-session-id: yes
S1 cost-restarts-at-zero: no
S1 spend-usd: 0.04
S1 rate-limit-info-keys: status, resetsAt, rateLimitType, overageStatus, overageDisabledReason, isUsingOverage, unifiedWindows
S1 resets-at-unit: seconds

Raw order in the 12 failed transcripts (line number of the event):

S1 raw 1a55bc9b: assistant_error (line 24) > rate_limit_event not stored > result not stored
S1 raw 0fd59ce7: assistant_error (line 24) > rate_limit_event not stored > result not stored
S1 raw da58c9d4: assistant_error (line 431) > rate_limit_event not stored > result not stored
S1 raw 79163beb: assistant_error (line 24) > rate_limit_event not stored > result not stored
S1 raw 849bb9cb: assistant_error (line 24) > rate_limit_event not stored > result not stored
S1 raw 72133511: assistant_error (line 24) > rate_limit_event not stored > result not stored
S1 raw 52c2e40d: assistant_error (line 24) > rate_limit_event not stored > result not stored
S1 raw bd29533e: assistant_error (line 91) > rate_limit_event not stored > result not stored
S1 raw dd3169d6: assistant_error (line 24) > rate_limit_event not stored > result not stored
S1 raw a7a5e655: assistant_error (line 1451) > rate_limit_event not stored > result not stored
S1 raw 8a2b6c0c: assistant_error (line 819) > rate_limit_event not stored > result not stored
S1 raw 464e9f06: assistant_error (line 24) > rate_limit_event not stored > result not stored

Evidence and limits:

- Every one of the 12 transcripts stores one event of this kind: an `assistant` line with `error: rate_limit` (and `isApiErrorMessage`), the last line or the last model line. None stores a `rate_limit_event` or a `result`. The same holds for `run_logs` of the 12 runs: one `error` row each, no `rate_limit_event`.
- So the line `S1 order` is NOT observed in a limit event. It is inferred from live haiku runs: the stream was `rate_limit_event > system:init > assistant > rate_limit_event > result:success` (and once without the first `rate_limit_event`), so `rate_limit_event` comes before the `assistant` message and `result` is last. It is not verified that a rejected limit puts the assistant `error` between them. P7 must not depend on the order of the first two kinds, and must accept any of the three alone.
- Resume with streaming input kept `session_id` in 4 of 4 resumed passes (each run printed `same session id: true`). The resumed stream was `system:init > assistant > rate_limit_event > result:success`.
- `total_cost_usd` does not restart at 0. In the last pass the resumed `modelUsage` held `inputTokens 1191, outputTokens 908, cacheReadInputTokens 7376`, which is the sum of both turns (first pass: 1189, 905, 4599). The resumed `total_cost_usd` equals the `costUSD` of that `modelUsage`. Comparing the cost of the two passes alone were not decisive (the resumed turn re-creates the cache), so the claim rests on the token sums. P8 must treat the cost of a resumed run as cumulative for the session, as the executor already does for turns inside one process.
- A limit can only be seen as `assistant_error` in the transcript store. The `usage_limit` trigger on `rate_limit_info.status === 'rejected'` has no stored sample. Not verified: `resetsAt` (the spec records it checked on session 464e9f06; that transcript has no `rate_limit_event`).
- `resetsAt` unit: one more live haiku stream (script `rl.mjs`, same options, `maxBudgetUsd 0.05`) printed this `rate_limit_info`: `status` "allowed", `resetsAt` 1793527200, `rateLimitType` "five_hour", `isUsingOverage` false, `unifiedWindows.five_hour` `{utilization 0.25, resetsAt 1793527200}`, `unifiedWindows.seven_day` `{utilization 0.46, resetsAt 1793923200}`. The number has 10 digits and reads as 2026-11-01 as seconds since 1970 (as milliseconds it would be January 1970). So the unit is seconds, and the spec line is proven for an `allowed` event. Not verified: `resetsAt` of a `rejected` event. `utilization` is not at top level here, only in `unifiedWindows`. Cost of this run 0.0005 USD.
- Spend: 5 script runs, summed `total_cost_usd` 0.0323, rounded up to 0.04 USD (limit 0.50).

Script (`run.mjs`, 24 lines):

```js
import { query } from 'file:///<main-checkout>/node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs';
const base = { cwd: process.cwd(), model: 'haiku', effort: 'low', tools: [], settingSources: [],
  env: { ...process.env, GH_TOKEN: 'invalid' }, maxBudgetUsd: 0.2 };
async function* oneUser(text) {
  yield { type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: null };
}
async function pass(label, options, prompt) {
  const q = query({ prompt, options: { ...base, ...options } });
  const seen = [];
  let res = null;
  for await (const m of q) {
    seen.push(m.type + (m.subtype ? ':' + m.subtype : ''));
    if (m.type === 'result') { res = m; break; } // stop after the first result
  }
  q.close();
  console.log(label, 'types:', seen.join(' > '));
  console.log(label, 'num_turns', res?.num_turns, 'usage', JSON.stringify(res?.usage && {i:res.usage.input_tokens,o:res.usage.output_tokens,cr:res.usage.cache_read_input_tokens,cc:res.usage.cache_creation_input_tokens}), 'modelUsageCost', JSON.stringify(Object.values(res?.modelUsage??{}).map(u=>[u.costUSD,u.inputTokens,u.outputTokens,u.cacheReadInputTokens,u.cacheCreationInputTokens])));
  console.log(label, 'session_id:', res?.session_id, 'total_cost_usd:', res?.total_cost_usd, 'subtype:', res?.subtype);
  return res;
}
const r1 = await pass('first ', {}, 'Write the integers 1 to 400 separated by spaces, nothing else');
const r2 = await pass('resume', { resume: r1.session_id }, oneUser('Reply with the single word: two'));
console.log('same session id:', r1.session_id === r2.session_id);
console.log('cost restarts at zero:', r2.total_cost_usd < r1.total_cost_usd, 'sum', (r1.total_cost_usd + r2.total_cost_usd).toFixed(5));
```

Output of the last run:

```
first  types: rate_limit_event > system:init > assistant > result:success
first  num_turns 1 usage {"i":2,"o":887,"cr":4599,"cc":0} modelUsageCost [[0.00061739,1189,905,4599,0]]
first  session_id: 578c5e61-5f0d-4c0d-aa7c-5ef8a41d0f75 total_cost_usd: 0.00061739 subtype: success
resume types: system:init > assistant > rate_limit_event > result:success
resume num_turns 1 usage {"i":2,"o":3,"cr":2777,"cc":29630} modelUsageCost [[0.006572860000000001,1191,908,7376,29630]]
resume session_id: 578c5e61-5f0d-4c0d-aa7c-5ef8a41d0f75 total_cost_usd: 0.006572860000000001 subtype: success
same session id: true
cost restarts at zero: false sum 0.00719
```

Green:

```
$ grep -cP <answer-line pattern> docs/plans/2026-11-01-goal-driven-loop-evidence.md
4
$ grep -c '^S1 raw [0-9a-f]{8}: ' docs/plans/2026-11-01-goal-driven-loop-evidence.md
12
```

<!-- S2 -->

## S2

Question: does a `PreToolUse` hook (option `hooks`, matcher `Bash`) refuse Bash under `bypassPermissions`, in the main thread and in a subagent?

S2 hook-called-main: yes
S2 hook-called-subagent: yes
S2 fake-gh-reached-main: no
S2 fake-gh-reached-subagent: no
S2 spend-usd: 0.02

Setup: SDK 0.3.303, haiku at low effort, `permissionMode: 'bypassPermissions'`, tools Bash and Agent, folder `lc-real-claude-s2`, `GH_TOKEN=invalid`, a fake `gh` first on `PATH` that appends its arguments to `gh.log`. The hook appends to `hook.log` and denies a command that matches `gh\s+pr\s+merge`. The subagent `runner` is defined in `agents` with tools `['Bash']`.

Counts after the runs:

| Run | Lines in `hook.log` | Lines in `gh.log` |
|---|---|---|
| 1, main thread asks for `gh pr merge 1` | 1 (`agent_id` null) | 0 |
| 2, subagent `runner` asked for `gh pr merge 1` | 1 (`agent_id` set, `agent_type` `runner`) | 0 |
| Control, main thread asks for `gh pr view 1` (hook allows it) | 1 | 1 (`pr view 1`) |

Findings:

- The hook ran in both runs, so the refusals are hook refusals and not model refusals. Each run called the hook one time, and the model reported the reason `merge refused by hook`.
- Bypass mode did not skip the hook. The hook denial held under `bypassPermissions` in the main thread and in a subagent.
- The hook also fires in a subagent. Its input carries `agent_id` and `agent_type`, so a hook can tell the two apart.
- The control run shows that the fake `gh` is reachable, so `gh.log` stayed empty in runs 1 and 2 because the hook denied the command.
- The model did not refuse before the hook in any run, so no prompt change and no second run was needed.
- Spend: about 0.0136 USD in total for three sessions, written as `0.02` (rounded up). The limit was 0.30 USD.

Consequence for the design of K8: a `PreToolUse` hook is a working block for `gh pr merge` under `bypassPermissions`, also inside a subagent. Limit not tested: a command that the hook pattern does not match (for example `gh api` or a shell wrapper) is not refused.

<!-- S3 -->

## S3

Question: how long is a stub run on the largest of the last 100 merged PRs, and does a CSS-only change go red?

Answer lines (the Green command counts these five):

S3 largest-pr: 173
S3 stub-seconds: 5
S3 stub-red: yes
S3 css-pr: none
S3 css-stub-red: n/a

Method, step 1 (largest PR). `gh pr list --state merged --limit 300` returned 106 merged PRs (numbers 1 to 293), so the look-back of 300 covers every PR. `gh` caps the file list at 100 per PR, so the file counts come from `git diff --name-only <merge>~1 <merge>` instead. Test files = `*.test.ts` and `tests/**`. Top of the last 100 by non-test files changed:

    PR  non-test  test  note
    39       410   133  the import of the whole project (540 added files, 3 modified)
    173      267    39  cut-over to the new UI only (241 deleted, 59 modified non-test files)
    137      244     1  freeze of the reference shots
    99        96     0
    200       70     1

Decision: PR 39 is the first import. All its files are new, so there is no base to restore, and a stub of it would be the empty project. The standing rule "use the equivalent that proves the same goal" picks PR 173, the largest PR that has a base. Its merge commit is `63cf76c`, its base is `63cf76c~1`.

Method, step 2 (stub run). A detached worktree at `63cf76c`, `npm ci` done. Each non-test file of the PR went back to the base (`git checkout <base> -- <file>`, 300 files, deleted files restored). Test files stayed at the PR version. The PR changed four unit test files (`tests/tools/design-lint`, `e2e-selectors`, `pixel-diff`, `pwa`). Run:

    $ npx vitest run --project unit tests/tools/design-lint.test.ts tests/tools/e2e-selectors.test.ts tests/tools/pixel-diff.test.ts tests/tools/pwa.test.ts
     FAIL  |unit| tests/tools/e2e-selectors.test.ts > e2e selectors > no e2e test or support file selects by class or XPath
     FAIL  |unit| tests/tools/pwa.test.ts > web/index.html head (spec 4.9) > asks for the whole screen with viewport-fit=cover (the bars pad themselves with the safe-area insets)
     Test Files  2 failed | 2 passed (4)
          Tests  2 failed | 20 passed (22)
       Duration  1.31s
    exit code 1, wall clock 5167 ms (`stub-seconds: 5`)

Limits of this number: the wall clock includes the start of `npx` and vitest. It does not include `npm ci` (47 s, once per worktree). The PR also changed 11 e2e specs and 8 visual files. I did not time them in a stub run. A real e2e run of the whole suite takes about 19 minutes on this machine, so K4 must not run e2e specs in the gate. Only the vitest files fit in a gate budget.

Method, step 3 (CSS). No merged PR out of the 106 has only `*.css` files, and none has only CSS plus test files. So `css-pr: none` and `css-stub-red: n/a`. The question is answered by a local mutation instead, in a detached worktree at `f5df61c` (the main of that time), never committed. The mutation adds 4 px to the height of `.topbar`:

    $ git diff --stat
     design/ds/components.css | 2 +-
     1 file changed, 1 insertion(+), 1 deletion(-)

Steps: `npm ci`, `npm run build`, then `npx playwright test --project visual --workers 1` with the lane database and port, inside one heavy-command slot.

    baseline (no mutation): 61 passed (8.1m), exit code 0, wall clock 490 s
    mutated (+4 px topbar): 8 failed, 21 did not run, 32 passed (5.8m), exit code 1, wall clock 351 s
    failed: form, frame, loop, loops, repos, run, system-page (light and dark)

Answer: a CSS change goes red against the visual tests, because the pixel comparison against the approved preview sees a 4 px change of one bar on 8 of the desktop screens. The run stops after 8 failures, so a red stub run still takes about 6 minutes. The full visual project takes about 8 minutes.

Consequences for K4:

- A stub run of vitest files is fast (5 s for the largest real PR). It fits in a gate.
- A CSS-only task can go red, but only through `--project visual`. That run needs `npm run build` first and a database, and costs 6 to 8 minutes. K4 should run it only for a task that names a visual test in its Verify block.
- The fallback of spec section 4 (`stub.none`) is not needed for the CSS case. It stays needed for a task with no test at all.

<!-- S4 -->

## S4

Commands: a Node script in the temporary folder `lc-real-claude-s4` imported the SDK 0.3.303 from `<main checkout>/node_modules` (read-only, through the environment variable `SDK`). Model `haiku`, effort `low`, `tools: []`, `GH_TOKEN=invalid`, `maxBudgetUsd` 0.05. The script ran two times (two runs of the same script, so two samples).

Part 1: `query()` with an input stream that never sends a message. The script calls `usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true })` and counts `assistant` messages in the output stream.

Part 2: `query()` with the prompt `Say ok.`. The script walks every message and records each path that ends in `utilization`.

Literal output, run 1:

```
usage-call ok model-turns 0 total_cost_usd 0 rate_limits_available true rate_limits keys [ ... 'limits', 'spend', ... ] util paths [ 'five_hour.utilization', 'seven_day.utilization', 'iguana_necktie.utilization', 'extra_usage.utilization', 'model_scoped.0.utilization' ]
run cost 0.00194532 utilization at [ 'rate_limit_event:rate_limit_info.unifiedWindows.five_hour.utilization,rate_limit_info.unifiedWindows.seven_day.utilization' ]
```

Literal output, run 2 (only the two lines that matter):

```
usage-call ok model-turns 0 total_cost_usd 0 rate_limits_available true rate_limits keys [
run cost 0.00039216 utilization at []
```

Reading: the usage call works with no user message and costs nothing (0 model turns, session cost 0). The plan window is in `rate_limits.five_hour.utilization` and `rate_limits.seven_day.utilization` (percent, 0 to 100). A normal run carries `utilization` only in the `rate_limit_event` message, at `rate_limit_info.unifiedWindows.<window>.utilization`, never at the top level of `rate_limit_info`. This matches the S1 finding. In run 2 the normal run carried no `utilization` at all, so a normal run does not always carry it. The rank rule must not depend on it; it can use the usage call instead.

Answer lines:

S4 usage-call-works: yes
S4 model-turns: 0
S4 rate-limits-available: yes
S4 run-carries-utilization: yes
S4 spend-usd: 0.01

Where the utilization was found: inside `rate_limit_info.unifiedWindows` of a `rate_limit_event` (run 1 only), not at the top level.

Ratchet, answer lines for S4: 0 before, 5 after. Stub check: with the section removed the Green count is 0 (the count printed 0 before this section). `model-turns` is 0, so the fallback of spec section 4 is not needed.

<!-- S5 -->

## S5

Question: does a read-only haiku run on sanitized rows name both causes of G14 in 3 of 3 tries? Answer: no. Each model names each cause on the fixture, but no try meets the grade, and on the real rows the grade is `none`.

Answer lines:

S5 try-1-haiku: one
S5 try-2-haiku: one
S5 try-3-haiku: one
S5 tries-naming-both: 0
S5 sonnet-tries-naming-both: 0
S5 real-rows: none
S5 fixture-events: 40
S5 spend-usd: 0.18

Setup: a Node script in the temporary folder `lc-real-claude-s5` imported the SDK 0.3.303 from `<main checkout>/node_modules` (read-only). Options: effort `low`, `tools: []`, `settingSources: []`, `persistSession: false`, `maxTurns: 1`, `GH_TOKEN=invalid`. The prompt asks for the repeated causes as a JSON list of `{cause, ids}` and names no cause. The script printed counts and the short cause names, and it wrote no file. The real rows stayed in memory and went only to the model session: 227 rows, ids replaced by `r001` and on, loops replaced by `loop-a` and on, `text` from the columns `error`, `summary`, `skip_reason`.

The labels of the real rows come from a plain text match in memory: 12 failed rows whose error starts with the limit text, and 14 rows that contain `smart app control`, all with status `succeeded`, in the column `summary`. The two sets do not overlap.

Fixture: `tests/fixtures/process-review/events.json` has 12 usage-limit rows (the real English error text and start times), 14 Smart App Control rows, 14 neutral rows. The builder wrote the 14 Smart App Control lines and the 14 neutral lines new, and did not read the real rows.

Grade rule, unchanged from the plan: one cluster holds at least 10 usage-limit ids, and a different cluster holds at least 10 Smart App Control ids.

Fixture results (a cell gives usage-limit ids, Smart App Control ids and the size of the cluster):

| Try | Grade | Cost USD | Cluster "weekly limit" | Cluster "session limit" | Cluster "Smart App Control" |
|---|---|---|---|---|---|
| haiku 1 | one | 0.0020 | 3, 0, 3 | 9, 0, 9 | 0, 14, 14 |
| haiku 2 | one | 0.0022 | 3, 0, 3 | 9, 0, 9 | 0, 14, 14 |
| haiku 3 | one | 0.0014 | 3, 0, 3 | 9, 0, 9 | 0, 14, 14 |
| sonnet 1 | one | 0.1333 | 3, 0, 3 | 9, 0, 9 | 0, 14, 14 |
| sonnet 2 | one | 0.0057 | 3, 0, 3 | 9, 0, 9 | 0, 14, 14 |
| sonnet 3 | one | 0.0167 | 3, 0, 3 | 9, 0, 9 | 0, 14, 14 |

Each of the six tries splits the 12 usage-limit rows into two clusters, because the error text has two forms: `weekly limit` (3 rows) and `session limit` (9 rows). The largest usage-limit cluster holds 9 ids, so the Smart App Control cluster alone reaches the grade of `one`. The split has no wrong member: 12 of 12 usage-limit rows are in the two clusters, and no other row is.

Real-rows result: one haiku try, cost 0.0166 USD, 8 clusters, grade `none`.

| Cluster, in the words of this log | Size | Usage-limit ids | Smart App Control ids |
|---|---|---|---|
| Weekly usage limit | 3 | 3 | 0 |
| Session usage limit | 9 | 9 | 0 |
| Smart App Control | 12 | 0 | 8 |
| Runs cancelled before the end | 3 | 0 | 0 |
| Previous run still active, run skipped | 45 | 0 | 0 |
| Task already claimed by another run | 21 | 0 | 0 |
| Task label left in progress | 44 | 0 | 0 |
| Waiting for a human decision | 44 | 0 | 1 |

What the model found in place of the two causes:

- Usage limits: the same split as on the fixture, with all 12 rows found and no wrong member.
- Smart App Control: a cluster of 12 rows that holds 8 of the 14 matched rows, so it is under the grade of 10. One matched row is in the cluster "Waiting for a human decision", and the model left out the other 5. The other 4 rows of the cluster do not contain the words `smart app control`. Nobody read them, so this log does not say if they are correct.
- Most rows that the model reported are not these two causes: 157 of 181 rows in clusters are about cancelled runs, skipped runs, claimed tasks, in-progress labels and waiting for a person.

Limit of the honest check: one real try is one sample. The fixture is easier than the real rows, because each of its Smart App Control lines names the cause in English and in a short text.

Consequence for the design: the fallback of spec section 4 for S5 applies (try sonnet, then give counts of normalized lines). The sonnet tries did not meet the grade. The fallback alone does not fix the split: `normalized` of spec section 2.11 keeps the words `weekly` and `session`, so the two error forms stay two lines. A review that takes the clusters as they are opens two usage-limit issues, not the one that G14 asks for.

Red (before the fixture and this section):

    $ grep -cP '^S5 (try-...)\r?$' $LOG
    0
    $ node -e "console.log(JSON.parse(require('fs').readFileSync('tests/fixtures/process-review/events.json','utf8')).length)"
    Error: ENOENT: no such file or directory, open '<worktree>/tests/fixtures/process-review/events.json'

Green (after the rebase):

    $ grep -cP '^S5 (try-...)\r?$' $LOG
    8
    $ test "$(grep -c '^S5 try-.-haiku: both' $LOG)" = "$(sed -n 's/^S5 tries-naming-both: //p' $LOG | tr -d '\r')" && echo consistent
    consistent
    $ node scripts/lang-scan.mjs --check-baseline
    baseline check: ok
    $ node -e "console.log(JSON.parse(require('fs').readFileSync('tests/fixtures/process-review/events.json','utf8')).length)"
    40

Stub check, all run:

- Fixture moved away: the last Green line prints `Error: ENOENT`.
- A copy of this log with `S5 tries-naming-both: 2`: the second Green line fails (no `consistent`).
- A copy of this log with no `S5 ` line: the first Green line prints `0`.

Ratchet, answer lines for S5: 0 before, 8 after. Spend: 0.0056 (haiku) + 0.1557 (sonnet) + 0.0166 (real rows) = 0.1779 USD, written as `0.18` (rounded up). The limit was 3.00 USD.

<!-- S6 -->

## S6

Question: what does one `run_evals.py` pass over the evals of `epic-loop` cost?

Setup: a detached worktree of `origin/master` of agent-plugins (commit 821821e), `GH_TOKEN=invalid`, `TEMP`, `TMP` and `TMPDIR` set to a scratch folder, `--mode with_skill --exec-model haiku --grader-model haiku --runs 1 --jobs 1`. The suite now has 7 evals, not the 5 of the plan, because two evals were added after the plan was written.

Result of the pass, from `benchmark.json` (`cost_usd` of each run, in USD):

| Eval | Cost | Tokens | Result |
|---|---|---|---|
| 1 tick-dry-run-names-the-first-ready-task | 0.0073 | 150149 | pass |
| 2 tick-stops-at-an-owner-gate | 0.0073 | 151129 | pass |
| 3 tick-skips-while-a-task-is-in-progress | 0.0078 | 193062 | fail |
| 4 plan-triggers-on-a-multi-pr-feature | 0.0058 | 130989 | fail |
| 5 no-trigger-on-a-one-line-fix | 0.0039 | 92687 | pass |
| 6 console-claimed-task-skips-next-and-claim | 0.0056 | 104146 | pass |
| 7 gate-mode-ends-at-pr-open-with-no-wait | 0.0057 | 104087 | pass |

Sum: 0.0434 USD, 926260 tokens, 5 of 7 pass, 132 s of executor time. The script writes the cost of the executor call only. It does not record the cost of the grader call (one haiku call for each eval, not measured). The grader reads a short transcript, so it is not expected to cost more than the executor. Even at twice the executor cost, the pass is below 0.10 USD.

Decision for the gate: a full pass is well below 2 USD, so the eval gate is cheap in money. Its price is time, about 2 minutes serial.

S6 cost-usd: 0.04
S6 evals-run: 7
S6 over-2-usd: no

The plan Green greps for `evals-run: 5`. The suite has 7 evals now, so the grep accepts `evals-run: [5-9]`. The count it prints is the same, 3.

Ratchet, answer lines for S6: 0 before, 3 after. Spend 0.04 USD of the 4.00 USD limit (executor cost only). Stub check: with the section removed the count is 0 (printed before this section). A line `evals-run: 4` or lower fails the pattern.


<!-- D1 -->

## D1

Design gap: issue 263. Goal rows: G11, G28. The owner has not approved these states. Task D2 is the only gate.

Ratchet (`design:states`): states with shots 120/120 -> 142/142.

Red, after the 22 rows and the test were added:

```
states with shots: 120/142
exit 1
Tests  3 failed (3)
```

Green, after the rebase:

```
states with shots: 142/142
drawn 142 states x 2 themes, 0 problems
Tests  3 passed (3)
ratchets: ok
```

Stub checks, each run for real and restored:

```
draw function removed: no draw function for state: probe-waiting / drawn 1 states x 2 themes, 26 problems / exit 1
state removed from states.js: the preview cannot draw it (not in states.js) / states with shots: 140/142 / exit 1
goal rows removed from the Statuses table: Tests  2 failed | 1 passed (3)
```

Every shot below was opened and judged. Three rounds of defects were fixed and re-shot: a cut title on the phone, a
doubled gap in a meta line, sample numbers that did not add up, and a sample week after the date of the sample world.

D1 shot probe-waiting-light: pill Waiting for you; .s-warn yellow, reason and last probe line
D1 shot probe-waiting-dark: pill Waiting for you; .s-warn yellow, reason and last probe line
D1 shot probe-held-light: pill Held; .s-int purple, warning banner, open hold, run 28 Held
D1 shot probe-held-dark: pill Held; .s-int purple, warning banner, open hold, run 28 Held
D1 shot probe-blocked-light: pill Blocked; .s-fail red, two blocking issues
D1 shot probe-blocked-dark: pill Blocked; .s-fail red, two blocking issues
D1 shot probe-complete-light: pill Goal met; .s-ok green, period pill Goal met, Start
D1 shot probe-complete-dark: pill Goal met; .s-ok green, period pill Goal met, Start
D1 shot run-held-light: pill Held; .s-int purple, warning banner, no resume command
D1 shot run-held-dark: pill Held; .s-int purple, warning banner, no resume command
D1 shot gate-queue-light: pills Running, Queued, Needs ratification, Merged, Failed; Ratify, switch on
D1 shot gate-queue-dark: pills Running, Queued, Needs ratification, Merged, Failed; Ratify, switch on
D1 shot gate-failed-light: pill Failed; .s-fail red, failed step, steps, log, Queue again
D1 shot gate-failed-dark: pill Failed; .s-fail red, failed step, steps, log, Queue again
D1 shot goal-rows-light: pills Goal met, Failed, Budget used, Probe failed; figure 3/8
D1 shot goal-rows-dark: pills Goal met, Failed, Budget used, Probe failed; figure 3/8
D1 shot scoreboard-light: main element four figures; one number per week, three causes, no chart
D1 shot scoreboard-dark: main element four figures; one number per week, three causes, no chart
D1 shot card-two-way-light: pills Proposed, Two-way; Accept, Refuse, pills Started, Accepted, Refused
D1 shot card-two-way-dark: pills Proposed, Two-way; Accept, Refuse, pills Started, Accepted, Refused
D1 shot card-one-way-light: pills Proposed, One-way; Accept, Refuse, pills Started, Accepted, Refused
D1 shot card-one-way-dark: pills Proposed, One-way; Accept, Refuse, pills Started, Accepted, Refused
D1 shot phone-probe-waiting-light: pill Waiting for you; .s-warn yellow, reason and last probe line
D1 shot phone-probe-waiting-dark: pill Waiting for you; .s-warn yellow, reason and last probe line
D1 shot phone-probe-held-light: pill Held; .s-int purple, warning banner, open hold, run 28 Held
D1 shot phone-probe-held-dark: pill Held; .s-int purple, warning banner, open hold, run 28 Held
D1 shot phone-probe-blocked-light: pill Blocked; .s-fail red, two blocking issues
D1 shot phone-probe-blocked-dark: pill Blocked; .s-fail red, two blocking issues
D1 shot phone-probe-complete-light: pill Goal met; .s-ok green, period pill Goal met, Start
D1 shot phone-probe-complete-dark: pill Goal met; .s-ok green, period pill Goal met, Start
D1 shot phone-run-held-light: pill Held; .s-int purple, warning banner, no resume command
D1 shot phone-run-held-dark: pill Held; .s-int purple, warning banner, no resume command
D1 shot phone-gate-queue-light: pills Running, Queued, Needs ratification, Merged, Failed; Ratify, switch on
D1 shot phone-gate-queue-dark: pills Running, Queued, Needs ratification, Merged, Failed; Ratify, switch on
D1 shot phone-gate-failed-light: pill Failed; .s-fail red, failed step, steps, log, Queue again
D1 shot phone-gate-failed-dark: pill Failed; .s-fail red, failed step, steps, log, Queue again
D1 shot phone-goal-rows-light: pills Goal met, Failed, Budget used, Probe failed; figure 3/8
D1 shot phone-goal-rows-dark: pills Goal met, Failed, Budget used, Probe failed; figure 3/8
D1 shot phone-scoreboard-light: main element four figures; one number per week, three causes, no chart
D1 shot phone-scoreboard-dark: main element four figures; one number per week, three causes, no chart
D1 shot phone-card-two-way-light: pills Proposed, Two-way; Accept, Refuse, pills Started, Accepted, Refused
D1 shot phone-card-two-way-dark: pills Proposed, Two-way; Accept, Refuse, pills Started, Accepted, Refused
D1 shot phone-card-one-way-light: pills Proposed, One-way; Accept, Refuse, pills Started, Accepted, Refused
D1 shot phone-card-one-way-dark: pills Proposed, One-way; Accept, Refuse, pills Started, Accepted, Refused

<!-- D2 -->

## D2

Red: not applicable, because approval is a human decision.

Green (after the owner said "I approve the design" in the session chat on 2026-11-01):

```
$ grep -c '^## the goal-loop screens' design/APPROVED.md
1
```

Stub check: with no owner action the count is 0, and issue 235 stays open.

<!-- P1 -->

## P1

Red, before building (`npx vitest run --project unit server/adapters/process/node-command-runner.test.ts`):

    Error: Cannot find module './node-command-runner' imported from .../node-command-runner.test.ts
     Test Files  1 failed (1)
          Tests  no tests

Green, after the rebase (same command):

    Tests  9 passed (9)

`npm run arch`: `dependency-cruiser: 0 violations`, `arch-fixtures: 25/25 violations caught`, exit 0.

Stub check, run for real and restored:

    run returns exitCode 0 with empty text:      Tests  9 failed (9)
    taskkill without /T (child only, no tree):   Tests  1 failed | 8 passed (9)   (the tree-kill case)

Ratchet, unit count (`npx vitest list --project unit | wc -l`): 428 before, 437 after on the P1 base (+9). After the rebase on a newer main: 447, of which 9 are mine.

<!-- P2 -->

## P2

Task: probe line parser and run-end parser (issue 237, PR 250).

- Red: `npx vitest run --project unit shared/domain/run-end.test.ts shared/domain/goal-loop.test.ts` printed `Error: Cannot find module './run-end'` and `Error: Cannot find module './goal-loop'`, then `Tests  no tests`. After the code-fence change, the new fence test failed on the old parser: `Tests  1 failed | 14 passed (15)`.
- Green: the same command prints `Tests  36 passed (36)` (run-end 15, probe 21). `select count(*), count(*) filter (where summary like '%"result"%') from runs where summary is not null` prints `167|0`.
- Stub check: an always-null `parseRunEnd` fails `reads PR_OPEN with its pull request` and 6 more. An always-failing `parseProbeLine` fails the 7 action tests and 5 more. Both restored.
- Ratchet: unit tests 532 passed before, 568 after (+36). `node scripts/lang-scan.mjs --check-baseline` prints `baseline check: ok`.
- Verify: `npm run verify` exit 0, 115 e2e passed, `UCs with a green e2e: 33/33`.
- Coordinator change: `parseRunEnd` reads the line before a last line that is only a code fence (haiku replies in the P13 evals ended with a fence).

<!-- P3 -->

## P3

Red (implementation stashed, test file only):

    $ npx vitest run --project api tests/api/probe-settings-api.test.ts
     Test Files  1 failed (1)
          Tests  7 failed (7)

Green (after the rebase on origin/main):

    $ npx vitest run --project api tests/api/probe-settings-api.test.ts
          Tests  7 passed (7)
    $ npx vitest run --project unit server/services/probe-service.test.ts
          Tests  8 passed (8)
    $ npx vitest run --project contract -t loop_probes
          Tests  12 passed | 114 skipped (126)
    $ npx vitest run --project api tests/api/api-surface.test.ts tests/api/db-migrate.test.ts
          Tests  35 passed (35)

Stub check: the `upsert` call in `DefaultProbeService.save` replaced by a fake record.

    api:  Tests  3 failed | 4 passed (7)
    unit: Tests  3 failed | 5 passed (8)

Ratchet (`npm run test:contract`):

    before: memory: 50 passed · postgres: 50 passed
    after:  memory: 56 passed · postgres: 56 passed

Verify: `npm run verify` exit 0 (unit 595 passed, contract 126, 115 e2e passed, `phone overflow: 0/12`, `UCs with a green e2e: 33/33`).

<!-- P4 -->

## P4

Red (`tests/support/service-kit.ts` has `probeService`, no `tick` yet):

    $ npx vitest run --project unit server/services/probe-tick.test.ts
    TypeError: k.probeService.tick is not a function
          Tests  19 failed (19)

Green, after the rebase on main, head e6e5366:

    $ npx vitest run --project unit server/services/probe-tick.test.ts server/scheduler/background-ticker.test.ts
          Tests  24 passed (24)
    $ npx vitest run --project api tests/api/probe-tick-api.test.ts
          Tests  2 passed (2)
    $ npm run verify
    ratchets: ok
          Tests  871 passed | 2 skipped (873)
          Tests  146 passed (146)
          Tests  144 passed (144)
      115 passed (13.8m)
    phone overflow: 0/12
    UCs with a green e2e: 33/33
    verify exit 0

Stub check, each run, each restored from git:

    empty tick (no probe call):
          Tests  16 failed | 3 passed (19)
     FAIL  calls the stored argv in the repo folder with a limit of 30 s, and stores the line
    latestFinishedAt ignored:
          Tests  2 failed | 17 passed (19)
     FAIL  a finished run probes at once, and with no free lane the console does not call the probe

Ratchet: unit run count 847 -> 871 (+24). `vitest list` is static and shows the 7 action cases as one line, so the list count is 656 -> 674 (+18). Contract 140 -> 146, each side +3.

<!-- P5 -->

## P5

**Red**, before the build:

    $ npx vitest run --project api tests/api/claims.test.ts
    error: column "task_key" does not exist
          Tests  4 failed (4)

**Green**, after the rebase on main:

    $ npx vitest run --project api tests/api/claims.test.ts
          Tests  4 passed (4)
    $ npx vitest run --project unit server/services/probe-claims.test.ts
          Tests  18 passed (18)
    $ npx vitest run --project contract -t run_claims
          Tests  16 passed | 146 skipped (162)
    $ npm run verify
    ratchets: ok
          Tests  919 passed | 2 skipped (921)
          Tests  162 passed (162)
          Tests  148 passed (148)
      115 passed (15.7m)
    phone overflow: 0/12
    UCs with a green e2e: 33/33
    verify exit 0

**Full verify on the final tree**, base c2652bd, machine kept quiet, migration 0007:

    $ npm run verify
    ratchets: ok
          Tests  940 passed | 2 skipped (942)
          Tests  170 passed (170)
          Tests  158 passed (158)
      115 passed (12.7m)
    phone overflow: 0/12
    UCs with a green e2e: 33/33
    verify exit 0

An earlier run after the T4 rebase ended with exit 1, from a stale lane database and a low-memory stop of the machine. Neither came from this code.

**Stub check**, both run for real, then restored:

- No orphan step: `Tests  2 failed | 2 passed (4)` in the API file, and `stop` is one of the two. `Tests  8 failed | 10 passed (18)` in the unit file.
- `claim` after `startClaimed`: `Tests  4 failed | 14 passed (18)`, and `order` is one of the four.

**Ratchet:** unit count 889 -> 919 (+30, plan +24, plus 1 gateway case and 5 fault cases). Contract 146 -> 162 (each side +8). API 144 -> 148. Metric `dead-claims`: 253 hours recorded before and after, because decision 7 of the epic has the tool measure only the baseline, so the after value is "not measured yet".

<!-- P6 -->

## P6

**Red**, before the build:

    $ npx vitest run --project api tests/api/lanes.test.ts
          Tests  3 failed (3)

**Green**, after the rebase on main (main was 044ea54, no rebase needed):

    $ npx vitest run --project api tests/api/lanes.test.ts
          Tests  3 passed (3)
    $ npx vitest run --project unit server/services/probe-lanes.test.ts
          Tests  5 passed (5)
    $ npx vitest run --project unit shared/domain/goal-loop.test.ts -t lanes
          Tests  8 passed | 21 skipped (29)
    $ npm run verify   (steps before test:e2e)
    ratchets: ok
          Tests  959 passed | 2 skipped (961)
          Tests  170 passed (170)
          Tests  162 passed (162)

Full `npm run verify` after the rebase on 83ff7ea, in slot-1, one run:

    ratchets: ok
          Tests  989 passed | 2 skipped (991)
          Tests  170 passed (170)
          Tests  162 passed (162)
      1 failed
        [webkit-phone] tests/e2e/phone.spec.ts:89 UC-34 (live-log line not visible within 1000 ms after Start)
      114 passed (13.7m)

The one failure is a 1 s timeout on a loaded machine, in a non-probe run that P6 does not change (issues 265 and 272 track this kind). One run of that spec alone passed, then `phone:check` and `uc-coverage` ran apart:

    $ npx playwright test tests/e2e/phone.spec.ts --project webkit-phone --workers 1
      4 passed (16.1s)
    $ npm run phone:check -- --max 0
    phone overflow: 0/12

The verify log did not reach `UCs with a green e2e`, because `test:e2e` failed before it. The coordinator re-runs it.

**Stub check:** `lowestFreeSlot` changed to return 0: the API test of three env sets failed (1 failed, 2 passed), and `probe-lanes.test.ts` failed 3 of 5. Restored.

**Ratchet:** unit count 989 passed after the change. The ratchets tool printed `base main: every limit held`.

<!-- P7 -->

## P7

**Red**, before the build, with the test file and the fake helpers only:

    $ npx vitest run --project unit server/adapters/executors/claude/claude-agent-executor.limit.test.ts
          Tests  21 failed (21)

**Green**, on main 076c6a3 (main did not move, so the rebase changed nothing):

    $ npx vitest run --project unit server/adapters/executors/claude/claude-agent-executor.limit.test.ts
          Tests  21 passed (21)
    $ npx vitest run --project contract tests/contract/executor-mock.test.ts --reporter verbose
     tests/contract/executor-mock.test.ts > executor contract > mock > usage_limit: the final event of the run, with session first, no result, and a message
     tests/contract/executor-mock.test.ts > executor contract > mock > usage_limit: a resume of that session keeps the same session id
    $ LC_REAL_CLAUDE=1 npx vitest run --project unit server/adapters/executors/claude/claude-agent-executor.real.test.ts -t resume
    [R-c] session 7b2995f8-e0ab-4893-9af7-987be1bddd4d · 7b2995f8-e0ab-4893-9af7-987be1bddd4d · cost 0.00401361 then 0.00615892 USD
          Tests  1 passed | 2 skipped (3)

Full `npm run verify`, in slot-1, one run that ended by itself with exit 0:

    base main: every limit held
    ratchets: ok
          Tests  1015 passed | 3 skipped (1018)
          Tests  204 passed (204)
          Tests  162 passed (162)
      115 passed (13.8m)
    phone overflow: 0/12
    UCs with a green e2e: 33/33

**Stub check**, each one run on the executor, then restored:

    no handler (no message is a trigger)     Tests  19 failed | 2 passed (21)
    only rate_limit_event (no assistant)     Tests  7 failed | 14 passed (21)
    adding costs                             Tests  1 failed | 20 passed (21)
    allowed stops a run                      Tests  2 failed | 19 passed (21)
    no settle timer (hung stream)            Tests  2 failed | 19 passed (21)

With no handler the 2 resume tests pass, because they do not need one. The Red run shows that they fail with no resume code.

**Ratchet:** `npx vitest list --project unit` printed 797 lines on 076c6a3 and 822 on the branch, so unit count +25 (plan +24, plus one `[limit]` test of `test-mode-query`). `limit-failures` printed 12 runs before the change: decision 7, not measured yet after it.

<!-- P8 -->

## P8

**Red**, before the services were built. The test files, the kit, the fake helpers and a no-op `DefaultHoldService` were in place. The API run also had the migration, because its two controls read `resume_count`:

    $ npx vitest run --project unit server/services/hold-service.test.ts
          Tests  23 failed | 1 passed (24)
    $ npx vitest run --project api tests/api/usage-hold.test.ts tests/api/holds.test.ts
          Tests  4 failed | 2 passed (6)

The passes are the no-probe controls.

**Green**, full `npm run verify` in slot-1 on e45f9ce, one run that ended by itself:

    base main: every limit held
    ratchets: ok
          Tests  1114 passed | 3 skipped (1117)
          Tests  238 passed (238)
          Tests  266 passed | 1 skipped (267)
      123 passed (13.7m)
    phone overflow: 0/12
    UCs with a green e2e: 35/35
    VERIFY EXIT 0

Then main moved (R4 changed `run-service.ts`). After that rebase, on the tree of this pull request:

    $ npm run typecheck                                                      exit 0
    $ npx vitest run --project unit                                          Tests  1117 passed | 3 skipped (1120)
    $ npx vitest run --project contract -t resource_holds                    Tests  24 passed | 214 skipped (238)
    $ npx vitest run --project api tests/api/usage-hold.test.ts tests/api/holds.test.ts tests/api/review-profile.test.ts
          Tests  42 passed | 1 skipped (43)

The Green commands of the plan, each one alone, on e45f9ce:

    $ npx vitest run --project unit server/services/hold-service.test.ts     Tests  24 passed (24)
    $ npx vitest run --project unit server/services/run-usage-limit.test.ts  Tests  2 passed (2)
    $ npx vitest run --project contract -t resource_holds                    Tests  24 passed | 214 skipped (238)
    $ npx vitest run --project api tests/api/usage-hold.test.ts tests/api/holds.test.ts   Tests  6 passed (6)

An earlier full run, before issue 362 was fixed, exited 1 on one test: `acceptance.iphone.spec.ts:42`, the link to the loops list did not change the URL in 5 s. All other 115 e2e tests passed. The same project then gave `2 passed (47.8s)` on the same code, and issue 362 fixed the cause in the test helper.

**Stub check**, each one run on `hold-service.test.ts`, then restored:

    fresh session on resume                  Tests  6 failed | 18 passed (24)
    resume line missing                      Tests  2 failed | 22 passed (24)
    no resume on close                       Tests  6 failed | 18 passed (24)
    no hold test in the tick                 Tests  1 failed | 23 passed (24)
    named hold stops nothing                 Tests  1 failed | 23 passed (24)
    listActive only in Stop                  Tests  1 failed | 23 passed (24)
    one row per limit                        Tests  8 failed | 16 passed (24)
    each limit fails alone (no handler)      Tests  18 failed | 6 passed (24)
    no trial                                 Tests  4 failed | 20 passed (24)
    held runs hold no lane                   Tests  1 failed | 23 passed (24)
    recovery leaves held runs                Tests  1 failed | 23 passed (24)
    adding costs on a limit                  Tests  1 failed | 23 passed (24)
    adding costs on a result                 Tests  1 failed | 23 passed (24)

A first stub that added costs passed 24 of 24, so the cost test gained a second limit with a cost. The two lines above are from after that change.

**Ratchet:** `hold-service.test.ts` +24 unit tests, `usage-hold.test.ts` and `holds.test.ts` +6 API tests, `resource_holds` +12 contract tests per side (24). `limit-failures` printed 12 runs and `blocked-runs` printed 12 runs before and after the change: decision 7, not measured yet after it.

<!-- P9 -->

## P9

Red, before building (`npx vitest run --project api tests/api/notices-api.test.ts`):

     FAIL  |api| tests/api/notices-api.test.ts > notices (G23) > send twice with the same key gives 1 unread row ...
     (4 more FAIL lines, one for each case)
     Test Files  1 failed (1)
          Tests  5 failed (5)

Green, after the rebase on origin/main (P3 took migration 0004, mine is 0005_notices):

    npx vitest run --project api tests/api/notices-api.test.ts          Tests  5 passed (5)
    npx vitest run --project unit server/adapters/notify/notifier.test.ts   Tests  6 passed (6)
    npx vitest run --project contract -t notices                        Tests  10 passed | 126 skipped (136)
    npm run typecheck                                                   exit 0
    npx vitest run --project api tests/api/notices-api.test.ts tests/api/api-surface.test.ts   Tests  35 passed (35)

Stub check, run for real and restored: `StoreNotifier.send` with an empty body.

    notices-api.test.ts:   Tests  4 failed | 1 passed (5)   (the unknown-id case never calls send)
    notifier.test.ts:      Tests  2 failed | 4 passed (6)

Ratchet:

    npm run test:contract:  memory 56 -> 61, postgres 56 -> 61 (each side +5, on the base after P3)
    unit tests passed:      783 -> 791 (+8: 6 notifier, 2 config)
    api-surface routes:     30 -> 32

Webhook safety: the only post in any test goes to a server that the test starts on 127.0.0.1. `LOOPS_NOTIFY_WEBHOOK` is unset by default. The case "gives up on a webhook that never answers" proves that `send` resolves when the server hangs.


<!-- P10 -->

## P10

**Red**, before the services were built (tests, kit and fake helpers in place):

    $ npx vitest run --project unit server/services/probe-actions.test.ts
          Tests  15 failed | 3 passed (18)
    $ npx vitest run --project api tests/api/plan-action.test.ts
          Tests  3 failed (3)

The 3 passes are full lanes, `skip` and the no-probe loop.

**Green**, after the build and the last rebase (origin/main had not moved):

    $ npx vitest run --project unit server/services/probe-actions.test.ts
          Tests  18 passed (18)
    $ npx vitest run --project api tests/api/plan-action.test.ts
          Tests  3 passed (3)
    $ npx vitest run --project contract -t goal_met
          Tests  6 passed | 238 skipped (244)

Full `npm run verify` in slot-1 on 10c6970, one run that ended by itself (an earlier run failed at one old test that said a plan line starts no run; the test now says it starts one):

    base main: every limit held
    ratchets: ok
          Tests  1135 passed | 3 skipped (1138)
          Tests  244 passed (244)
          Tests  305 passed | 2 skipped (307)
    UCs with a green e2e: 35/35

**Stub check**, each break made the named tests fail, then was restored:

- send on each tick (no check of the stored line): `a notice that the owner read does not come back for the same reason` fails.
- call the gateway for `plan`: `starts one run with both prompt lines...` and `a new run starts after the run ends...` fail.
- no plan row (a fresh key per claim): the three plan repeat and held cases fail.
- `done` closes as `stopped`: both `done` cases that check `goal_met` fail.

**Ratchet**, same tool (`npx vitest list --project <name> | wc -l`), main before, branch after: unit 926 to 944, api 184 to 187. Contract: 3 tests under `goal_met`, 3 on each side.

<!-- P11 -->

## P11

**Red** (tests and smoke step written, nothing built):

    $ npx vitest run --project unit server/services/recovery-policy.test.ts
    x resume loop: the running run is interrupted, the execution stays open and the loop stays active
    x first tick: an excused release of the old claim, then a new run on the same execution, with no call from a person
    x held run: stays held with its hold row, and the same session goes on after the reset
    x mixed loops: only the resume loop stays, and the report counts the others
    x the first tick of a process probes a resume loop that was probed seconds ago, and the second tick does not
    x an open plan-window: the first tick makes no probe call, and the loop waits in state held
          Tests  6 failed | 4 passed (10)
    $ npm run api-smoke
    FAIL: gave up after 30000 ms waiting for one running run of loop B

**Green** (after the last rebase):

    $ npx vitest run --project unit server/services/recovery-policy.test.ts server/services/recovery-service.test.ts
     Test Files  2 passed (2)
          Tests  14 passed (14)

`server/services/recovery-service.test.ts` has no change in this PR.

    $ npm run api-smoke
    repo ->created -> ... -> start: execution #2 -> loop B: probe waiting, 0 runs -> restart -> interrupted, execution #2 server_down, loop stopped -> restart: resume loop started a run with no http call -> sessionIds of execution #1 = 1, #2 = 1 ok
    $ npm run verify
    verify exit 0, commit 2dc5905, slot-1
    ratchets: ok
          Tests  1179 passed | 3 skipped (1182)
    memory: 117 passed · postgres: 117 passed
          Tests  309 passed | 2 skipped (311)
      123 passed (13.0m)
    phone overflow: 0/12
    UCs with a green e2e: 35/35

The run before it, on the same commit, ended with 2 failed and 121 passed: UC-11 with `net::ERR_NO_BUFFER_SPACE`, and UC-23 with `Expected: 2 Received: 3`. Both loops have no probe, so this change does not reach them. Epic rule "another process skews a run": one re-run, both recorded. Filed as issue 377.

**Stub check** (both run for real, then restored):

    Ignore keep (`const keep: string[] = []`):
          Tests  6 failed | 4 passed (10)
    Remove the first-tick rule:
          Tests  1 failed | 9 passed (10)
    $ npm run api-smoke
    FAIL: gave up after 30000 ms waiting for one running run of loop B
    smoke exit 1

**Ratchet:** unit test count 926 -> 936 (`npx vitest list --project unit | wc -l`), contract cases per adapter 110 -> 112. Metric `idle-days`: decision 7, baseline 10 days, not measured yet.


<!-- P12 -->

## P12

Red (test file only, script absent):

    $ npx vitest run --project unit tests/tools/logon-task.test.ts
     Test Files  1 failed (1)
          Tests  8 failed (8)

Green (after the rebase on origin/main):

    $ npx vitest run --project unit tests/tools/logon-task.test.ts
     Test Files  1 passed (1)
          Tests  8 passed (8)
    > schtasks /Query /TN Castraferrum
    ERROR: The system cannot find the file specified.
    (exit code 1)

Stub check (script replaced by one line that prints <Task/>):

    Tests  7 failed | 1 passed (8)

The one test that still passes is the one that checks that the source has no child_process import. The script was restored and 8 of 8 pass again.

Light verify (nothing under server/ or web/ changed or imports the script):

    $ grep -rn "logon-task" server web
    (no output, exit 1)
    test:unit      Tests  836 passed | 2 skipped (838)
    test:contract  Tests  126 passed (126)
    test:api       Tests  125 passed (125)
    api-smoke, build, typecheck, arch, ratchets, rule-lint, lang-scan --check-baseline: ok

Ratchet: unit tests 828 passed before, 836 passed after (plus 8). Metric idle-days: not measured yet (decision 7).

<!-- P13 -->

## P13

Source: these tasks shipped in hieplam/agent-plugins, so the literal results below are copied from the Verify section of the merged PR https://github.com/hieplam/agent-plugins/pull/17 (written into this log for issue 432). Nothing here was measured again.

Red (`node --test tests/epic.test.mjs` in `scripts`, before building):

    ℹ tests 40
    ℹ fail 0
    (with the 9 new tests added and no implementation)
    ℹ tests 49
    ℹ pass 41
    ℹ fail 8

The PR notes that the 9th new test ("passes when the log has only other queries") passes on a stub by nature, so the failing one guards it.

Green (`node --test tests/epic.test.mjs tests/check-tick.test.mjs`, after rebase on `origin/master`):

    ℹ tests 49
    ℹ pass 49
    ℹ fail 0

Evals (haiku, scratch folder, fake GitHub module, spend about 0.06 USD): ids 1,2,3 before the change 0 of 3 PASS; after the change 0 of 3 PASS (same cause, a closing code fence; no worse than baseline). Eval 6 after a prompt fix: `[with_skill] PASS`.

Stub check: with `epic.mjs` and `check-tick.mjs` restored to `origin/master`, the same tests print `ℹ pass 41` and `ℹ fail 8`. A `--probe` that is ignored fails the shape test. A log with `query EpicNode` fails `check-tick` (exit 1, "the run logged query EpicNode").

Ratchet: `node --test` count 40 to 49.

Acceptance: not recorded in https://github.com/hieplam/agent-plugins/pull/17 (the PR is in agent-plugins, and `E check` reads castraferrum).

<!-- P14 -->

## P14

**Red**, before the specs existed (the test server started, the file list was empty):

    $ npx playwright test tests/e2e/probe-idle.spec.ts --project chromium --reporter list
    Error: No tests found.

**Green**, after the last rebase (origin/main at 23709cd):

    $ npx playwright test tests/e2e/probe-idle.spec.ts --project chromium --reporter list --workers 1
      2 passed (12.4s)
    $ npx playwright test tests/e2e/probe-gap.spec.ts --project chromium --reporter list --workers 1
    gap_ms=1169
      1 passed (10.8s)

**Stub check**, each stub applied to the probe service alone and restored with `git checkout`:

    isDue without the latestFinishedAt test   -> probe-gap: 1 failed (1.0m, the second run did not start)
    return before the probe command call      -> probe-idle: 2 failed (timed out after 20000 ms waiting: 0)
    done handled as skip                      -> probe-idle: 1 failed (the end reason stayed null), control passed

**Ratchet**: `npx playwright test --list --project chromium | wc -l` 55 -> 58 (+3). Metric gap: 14.4 min before, 1169 ms after (1091 ms in the first run). idle-runs: 0 runs for the idle loop and for the witness loop.

Light verify (no existing server or web file changes; `grep -rn "fake-probe-seq\|probe-idle\|probe-gap" server web` printed nothing): design:states, typecheck, lang-scan baseline, arch, ratchets (base main: every limit held), rule-lint, unit (1169 passed), contract (248 passed), api (309 passed), api-smoke and build all passed in slot-1.

<!-- P15 -->

## P15

**Red**, with the tests in place and the code of `origin/main` put back for `web/`, `shared/` and `server/`, after `npm run build`:

    $ npx playwright test --project=visual tests/visual/ds/probe.visual.ts
      10 failed
    $ npx playwright test tests/e2e/probe-state.spec.ts --project chromium
      7 failed
    $ npx playwright test tests/e2e/probe-editor.spec.ts --project chromium
      3 failed
    $ npx vitest run --project api tests/api/holds-api.test.ts
          Tests  3 failed (3)
    $ npx vitest run --project unit web/features/loop-form/probe-form.test.ts
     Test Files  1 failed (1)
    $ npx vitest run --project unit shared/domain/goal-loop.test.ts
          Tests  5 failed | 29 passed (34)

**Green**, on the real build, each command alone:

    $ npx playwright test --project=visual tests/visual/ds/probe.visual.ts       10 passed
    $ node -e "const r=require('./reports/compare/ds/results/probe.json');console.log(r.length,Math.max(...r.flatMap(s=>s.regions.map(x=>x.ratio)))<=0.001)"
    20 true                                      (worst ratio 0.000024)
    $ npx playwright test tests/e2e/probe-state.spec.ts --project chromium       7 passed
    $ npx playwright test tests/e2e/probe-editor.spec.ts --project chromium      3 passed
    $ npx vitest run --project unit shared/domain/goal-loop.test.ts              Tests  34 passed (34)
    $ npx vitest run --project unit web/features/loop-form/probe-form.test.ts    Tests  6 passed (6)
    $ npx vitest run --project api tests/api/holds-api.test.ts                   Tests  3 passed (3)
    $ npm run test:contract                                                      Tests  254 passed (254), exit 0
    $ npm run ratchets                                                           ratchets: ok
    $ npm run design:states -- --design design/ds                                states with shots: 142/142

`npm run design:compare` on the whole suite: `pairs 272`, `worstRatio 0.0002`. Its one failure was `layout.visual.ts`, which lists the captions of the editor and now also expects "Probe"; that file then gave `9 passed`.

**Stub check**, each one run for real and restored:

    ProbeNow and its list off (the page ignores the probe):  probe.visual 8 failed | 2 passed; probe-state 5 failed | 2 passed
    GET /api/holds answers {holds:[]}:                       holds-api Tests  1 failed | 2 passed; the 4 held pairs fail (probe-held, run-held, and their phone twins)
    the read call of the notices skipped:                    probe-state test 7 fails
    blockers ignored:                                        goal-loop.test.ts Tests  1 failed | 47 passed; probe-blocked pairs 2 failed; probe-state test 2 fails
    the fallback draws a link:                               probe-state test 3 fails

The two `run-held` pairs do not use the probe card, so a stub of `ProbeNow` leaves them green; the `holds` stub fails them.

**Ratchet**, same tools before and after: pairs in `results/probe.json` 0 to 20; `e2e expects` 885 to 987; api tests +3 (`holds-api`); contract +1 per side (`statsByExecution` with a held run); `uc-coverage --min` 35 to 36 (UC-38).

**Decisions**:
- The editor sends back the `resources` that the probe already has, because it has no field for them (the setting stays API only).
- `probe_failed` and `budget_limited` have no approved shot, so their now card uses the existing card with new words (`goalLoop.now.probeFailed*`, `goalLoop.now.budgetLimited*`).
- The held count is a new field `held` in the statistics of a period, and the average run time leaves held runs out; the approved figures "6 runs" and "average of 5" need both.
- Run 23 of the seed lasts 4518 s so that the five finished runs average 40:18; 16 skipped turns fill period 3 so that the page says "All 27 runs".
- The Probe group of the editor is new on the screen of an existing loop, so the preview and the 8 edit shots were re-shot (see `design/APPROVED.md`).

**Full verify**: not yet complete on this tree. The run before the last rebase stopped at `test:api` in `gate-scope.test.ts` (a temp folder removed by Windows, then `cannot lock ref`; issues 387 and 391, not this change). `test:unit` `Tests 1271 passed | 3 skipped (1274)` and `test:contract` `Tests 260 passed (260)` passed in that run. One full verify is queued after issue 391 merges.

<!-- P16 -->

## P16

Pull request: https://github.com/hieplam/agent-plugins/pull/22 (repository `hieplam/agent-plugins`, branch `epic-loop/probe-blockers`). Command, in the skill folder: `node --test scripts/tests/epic.test.mjs`.

Red (6 new tests and `PROBE_KEYS` changed, before the build):

```
ℹ tests 79
ℹ pass 71
ℹ fail 8
```

Green (after the build):

```
ℹ tests 79
ℹ pass 79
ℹ fail 0
```

Stub check (each stub in `blockersOf`, then restored; Green rerun after the last restore gave `ℹ pass 79`, `ℹ fail 0`):

- `blockers` always `[]`: `ℹ pass 74`, `ℹ fail 5`.
- `blocks` fixed at 1: `ℹ pass 74`, `ℹ fail 5`.
- sort by number only: `ℹ pass 75`, `ℹ fail 4`.
- url built from the title: `ℹ pass 77`, `ℹ fail 2`.

Ratchet: `# tests` 73 to 79, up only.

<!-- K1 -->

## K1

Goal: G9, a PR cannot lower its bar, and a plan PR only adds keys. Issue 242, PR 252.

- Red (before building): `npx vitest run --project unit shared/domain/scope-guard.test.ts` printed `Error: Cannot find module './scope-guard' imported from .../shared/domain/scope-guard.test.ts`, `Test Files  1 failed (1)`, `Tests  no tests`.
- Green: `npx vitest run --project unit shared/domain/scope-guard.test.ts` printed `Tests  78 passed (78)`. `npx vitest run --project unit tests/tools/gate-data.test.ts` printed `Tests  6 passed (6)`. Extra attack file `shared/domain/scope-guard-attacks.test.ts`: `Tests  90 passed (90)`.
- Stub check, always `pass`: `Tests  58 failed | 26 passed (84)`. Always `guarded`: `Tests  14 failed | 70 passed (84)` (the pass and plan cases fail). `verifyEntryFiles` returning `[]`: `Tests  3 failed | 81 passed (84)`, and the fixture line fails. The code was restored after each run.
- Ratchet: `npx vitest list --project unit | wc -l` went 438 -> 532 (rebased base). The list counts an `it.each` once, so +94 here is not the plan's +84 (which counts each case).
- Decisions: the plan said 33 entries, spec 2.9 holds 29, so 4 near-miss tests fill the 33. The import check in `gate-data.test.ts` stops at test files (issue 251 covers `tests/support`, `postinstall`, `vite.config.ts`, `.npmrc`).

<!-- 251 -->

## 251

Goal: G9, a PR cannot lower its bar. Issue 251, amends spec 2.9 (Decisions, item 20).

- Red (before building): `npx vitest run --project unit tests/tools/gate-data.test.ts` printed `Tests  2 failed | 9 passed (11)`. The closure test showed the unguarded files `vite.config.ts`, `scripts/install-webkit.mjs`, `tests/support/test-repo.ts`, `tests/support/server-process.ts`, `tests/support/tcp-proxy.ts`. The scope test showed `Expected: "guarded"  Received: "pass"` for `tests/support/server-process.ts`.
- Green: the same command printed `Tests  11 passed (11)`. `npx vitest run --project unit tests/tools/gate-data.test.ts shared/domain` printed `Test Files  6 passed (6)`, `Tests  347 passed (347)`.
- Stub check: `goals/gate.json` restored to the base commit (entries removed) printed `Tests  3 failed | 8 passed (11)`: the closure test, the verdict test and the spec equality test.
- Fixtures that must fail: a fixture tree with a script that imports a new `tests/support` file, and a `postinstall` that runs a new script, both give an unguarded file. A `prepare` with a changed text throws.
- Ratchet: `npx vitest list --project unit | wc -l` went 587 -> 592.
- Decisions: `tests/support/` stays unguarded as a directory, because task PRs add files there; only the 3 reached files are listed. `server/config.ts` (imported by `server-process.ts`) is product code that `verify` exercises, so the closure stops at `server/`, `shared/` and `web/`. `.npmrc` does not exist in the tree: it is listed so that a PR that adds it is stopped.

<!-- K2 -->

## K2

Goal G6: the gate keeps one job at a time, a record of each step, and each claim that it owns.

Red (before building):

    $ npx vitest run --project contract -t gate_tables
     Test Files  2 failed | 2 skipped (4)
          Tests  30 failed | 170 skipped (200)

Green (after the rebase on main):

    $ npx vitest run --project contract -t gate_tables
          Tests  30 passed | 170 skipped (200)
    $ npx vitest run --project api tests/api/db-migrate.test.ts
          Tests  2 passed (2)
    $ npm run verify
          Tests  973 passed | 2 skipped (975)
          Tests  200 passed (200)
    memory: 93 passed · postgres: 93 passed
          Tests  159 passed (159)
      115 passed (12.8m)
    phone overflow: 0/12
    UCs with a green e2e: 33/33
    verify exit 0

Stub check:

- `takeNext` with no running guard and no catch of the index error: `takeNext gives null while a job runs, and the index refuses a second running row` failed on memory and postgres (`Tests  2 failed | 28 passed`).
- `handOver` that changes nothing: `handOver gives a claim to the gate, and the claim is then not an orphan` failed on memory and postgres (`Tests  2 failed | 28 passed`).
- Both restored; Green printed `30 passed` again.

Ratchet: `npm run test:contract`, each side 78 -> 93 (+15).

Decisions:

- Full verify, not light: `claims.ts` and `repositories.ts` are reached from `server/compose.ts`.
- `ClaimRecord` gains `owner` and `gateJobId`; the existing `listOpen` expectations list them.
- The migration is named `gate` (`drizzle-kit generate --name gate`). `real-console.test.ts` has its own `TRUNCATE` list and now names the three gate tables.
- Gap: `ratify` can meet the live-row index when a duplicate was queued while the job waited for ratification. It throws on both sides. Recorded on K6.

<!-- K3 -->

## K3

Goal G6: the console reads a PR, marks it, and merges only the commit that it checked.

Red (before building): `npx vitest run --project unit server/adapters/github/gh-git-host.test.ts`

    Error: Cannot find module '../../ports/git-host' imported from <worktree>/server/adapters/github/gh-git-host.test.ts

(The test file imports the port before the adapter, so the port is the first missing module. Same failure class as the plan.)

Green:

    $ npx vitest run --project unit server/adapters/github/gh-git-host.test.ts
          Tests  9 passed (9)
    $ npx vitest run --project unit server/config.test.ts -t LOOPS_GH_BIN
          Tests  2 passed | 8 skipped (10)
    $ npm run arch
    dependency-cruiser: 0 violations
    arch-fixtures: 25/25 violations caught

Stub check: `--match-head-commit` removed from the `pr merge` call in `GhGitHost.merge`.

    Tests  2 failed | 7 passed (9)
    x merge squashes the pull request into main when the sha is the head that was checked
    x merge with a sha that is not the head throws and merges nothing   (promise resolved instead of rejecting)

Restored, 9 passed again.

Ratchet (unit test count, `npx vitest list --project unit | wc -l`): before 595 (origin/main at the rebase point), after 606. Rise of 11.

Fake gh change (`tests/support/fake-gh.mjs`): reads `-R <repo>`, `pr create` fills `closingIssuesReferences` from "Closes #n", `api -X GET` is accepted. The `pullRequest` test builds its PR through the fake `pr create`, so these are covered.

Verify: full `npm run verify` on the lane database, two runs on a saturated machine. Run 1 stopped at `test:api` (db-migrate 5 s time-out, sse-api); both pass when re-run alone (9 passed). Run 2 passed unit 794, contract 126, api 125, build, and 113 e2e; two e2e tests failed (form UC-09, system UC-15) and both pass when re-run alone (2 passed). `phone:check` gave `phone overflow: 0/12`. No file that these tests cover is reached by this change (the new code is not imported by any server file yet).

<!-- K4 -->

## K4

Red (before building):

    $ npx vitest run --project unit server/adapters/git/git-gate-workspace.test.ts
    Error: Cannot find module '../../../shared/domain/gate-commands' imported from .../git-gate-workspace.test.ts
     Test Files  1 failed (1)

Green (after the rebase on `f851d05`):

    $ npx vitest run --project unit server/adapters/git/git-gate-workspace.test.ts
     Test Files  1 passed (1)
          Tests  20 passed (20)
       Duration  149.98s (tests 100%)
    $ npx vitest run --project unit shared/domain/gate-commands.test.ts
          Tests  10 passed (10)
    $ npm run arch
    dependency-cruiser: 0 violations

The time of the first file is the time of a loaded machine: every test makes real git calls.

Stub checks, each run for real and restored:

    stubRestore returns []:
      FAIL real stub run ... AssertionError: expected [] to deeply equal [ 'impl.mjs' ]
    stubRestore returns the paths and restores nothing (a stronger form of the plan's stub):
      FAIL real stub run ... AssertionError: expected +0 to be 1
    readAt reads the worktree folder:
      FAIL readAt gives the text of main ... expected 'the exam of the pull request' to be 'the exam of main'
    no core.hooksPath:
      FAIL runs no hook of core.hooksPath ... AssertionError: expected true to be false

Ratchet (unit test count, `npx vitest list --project unit | wc -l`): before 704 (same tree without the two new test files), after 734. Rise of 30. Spike number S3: 5 s.

Light verify: `design:states`, `typecheck`, `lang-scan --check-baseline`, `arch`, `ratchets -- --base main`, `rule-lint -- --base main`, `test:unit` (928 passed, 2 skipped), `test:contract` (154 passed), `test:api` (154 passed), `api-smoke`, `build`: exit 0. e2e and `phone:check` skipped, because `grep -rlE "gate-workspace|gate-commands" server web`, with the new files excluded, prints nothing and exits 1.

Decisions:

- `cmd.exe /c` exits 1 for a command that it cannot find, not 9009 of decision 34. So `isRealRed` also refuses the English text "is not recognized as an internal or external command". Limit: a Windows with another display language is not covered. The real stub run test proves this with a missing program.
- A gate line with double quotes changes meaning on Windows, because the runner has no verbatim arguments. This needs an existing server file, so issue 310 holds it and blocks K5.
- `readAt` uses `ls-tree` and then `cat-file blob`. So a git failure throws `GateWorkspaceError` and is not read as a missing file.
- `stubRestore` deletes before it restores, so a PR that replaces a file with a folder of the same name works.

<!-- K5 -->

## K5

Goal: G6, G7, G9. A PR merges only if a gate with no model passed every step, on an exam from `main`.

- Red: `npx vitest run --project unit server/services/gate-service.test.ts` printed the failed import of `./gate-service`, `Test Files  1 failed (1)`, `Tests  no tests`.
- Green, after the last rebase: the same command printed `Tests  31 passed (31)`, `Duration  125.71s`. The plan names 29 tests. The two more are the quoted `green` line and the job whose gate was turned off. `npx vitest run --project api tests/api/gate-api.test.ts` printed `Tests  4 passed (4)`.
- First runs of Green: 382.18 s, then 269.21 s, against the limit of 180 s. The tests then ran at the same time (187.99 s), each on a copy of one seeded bare repository (110.63 s).
- `npm run verify` on the commit before the last rebase: `VERIFY_EXIT=0`, `Tests  1023 passed | 2 skipped (1025)`, `Tests  202 passed (202)`, `Tests  167 passed (167)`, `116 passed (17.0m)`, `UCs with a green e2e: 34/34`. The last rebase brought only P7 and two plan documents.
- Stub checks, all five on the final tests:
- Verify entry read from the rebased tree: the exam test printed `expected [ 'merged', null ] to deeply equal [ 'failed', 'green' ]`, `Tests  1 failed | 30 skipped (31)`.
- No `stubRestore`: the always-true test printed `expected 'e passed with the implementation' to contain 'with no implementation'`, `Tests  1 failed | 30 skipped (31)`. The control test fails as well.
- Exit `null` treated as red: the time-out test printed `expected [ 'merged', null ] to deeply equal [ 'failed', 'stub' ]`, `Tests  1 failed | 30 skipped (31)`.
- No second fetch: both moved tests failed, `expected [ 'scope' ] to have a length of 2 but got 1` and `expected [ 'merged', null ] to deeply equal [ 'failed', 'merge' ]`, `Tests  2 failed | 29 skipped (31)`.
- Merge `pr.headSha`: the head test printed `expected [ 'merged', null ] to deeply equal [ 'failed', 'merge' ]`, `Tests  1 failed | 30 skipped (31)`.
- Plan correction: the first run of stub check 2 passed, because an always-true test exits 0 with or without the restore. The test now asserts that the stub run saw no `impl.mjs`.
- Ratchet: unit tests in this change +32 (31 gate, 1 abort), api +4, contract +1 per side, e2e +1, `uc-coverage` 33 to 34. Metrics `merged-on-red`, `stub-share`: decision 7, nothing changes until a repository turns the gate on.

<!-- 320 -->

## 320

Goal: G6. A restart between the merge and `finish` does not mark a merged PR as failed.

- Red: `npx vitest run server/services/gate-service.test.ts -t "restart after"` printed `expected [ 'failed', 'scope' ] to deeply equal [ 'merged', null ]`, `Tests  1 failed | 2 passed | 31 skipped (34)`. The two guard tests (no `success` status, another head) pass before and after.
- Green, after the last rebase: the same file and `gh-git-host.test.ts` printed `Test Files  2 passed (2)`, `Tests  48 passed (48)`. The new test asserts state `merged`, no `base` step row, and 1 merge call.
- Stub check: with the new branch in `attempts` switched off, the same command printed `Tests  1 failed | 2 passed | 31 skipped (34)`. The branch was restored.
- `npm run verify` in `slot-1`: exit 0, `Tests  1051 passed | 3 skipped (1054)`, `phone overflow: 0/12`, `UCs with a green e2e: 34/34`.
- Ratchet: unit tests 1047 to 1051 (3 gate, 1 `gateStatus` adapter). `GitHost` gains `gateStatus`.

<!-- K6 -->
## K6

Red, before the build, `npx vitest run --project unit server/services/gate-feed.test.ts`: `Tests  16 failed | 3 passed (19)`. The 3 passes: key `plan-217`, pending is not red, green control.

Green, after the rebase:

```
gate-feed.test.ts: Tests  19 passed (19)
gate-api.test.ts: Tests  7 passed (7)
npx vitest run --project contract -t gate_feed: Tests  4 passed | 206 skipped (210)
merge-guard.test.ts: Tests  62 passed | 1 skipped (63)
npm run verify (one run, slot-1), last lines: UCs with a green e2e: 35/35, exit 0
  unit Tests  1087 passed | 3 skipped (1090); contract memory: 98 passed, postgres: 98 passed
  api Tests  251 passed | 1 skipped (252); e2e 117 passed (13.1m)
```

Stub results, each run for real, then restored: no comment, 1 failed. No 18000 cut, 1 failed. Release in the job, 1 failed. Search with no OPEN filter, 1 failed. No title test, 1 failed. Merge on red, 1 failed. Pending counts as red, 1 failed. Ratify that skips `green`, 1 failed. No excuse, 1 failed. Memory `ratify` with no catch, 1 failed. Postgres `ratify` with no catch, 1 failed. No guard rule, 4 failed.

Ratchet: unit run count +19. Api +3 in `gate-api.test.ts`, +6 lines in `merge-guard.test.ts`. Contract +2 per side. `uc-coverage --min` 34 to 35.

CI found one thing that Windows did not show: on Linux, `process.exit` lost the end of a 100 KB fixture output. The fixture now sets `exitCode`. The gate code did not change.

<!-- K7 -->

## K7

Baseline: `npx vitest list --project unit 2>/dev/null | wc -l` printed 949, and the same command for `api` printed 187, both on the base of this task.

Red, before the build:

```
npx vitest run --project unit server/services/gate-handover.test.ts
      Tests  8 failed | 7 passed (15)
npx vitest run --project api tests/api/gate-handover.test.ts
      Tests  2 failed | 1 passed (3)
```

The 7 passes are the 7 that the plan names: gate off, off env, no-probe, null `end_pr`, other repository, `DONE`, `failed`.

Green, after the last rebase:

```
npx vitest run --project unit server/services/gate-handover.test.ts
      Tests  15 passed (15)
npx vitest run --project api tests/api/gate-handover.test.ts
      Tests  3 passed (3)
npx vitest run --project unit server/services/gate-handover.test.ts server/services/gate-handover-orders.test.ts server/services/probe-claims.test.ts server/services/gate-service.test.ts
      Tests  83 passed (83)
```

`server/services/probe-claims.test.ts` exits 0 with 18 tests, and its case `PR_OPEN with no gate` did not change.

Full `npm run verify`, on the final code at the base with issue 336: exit 0. Unit 1212 passed, contract 248 passed, api 312 passed, e2e and visual 123 passed, `UCs with a green e2e: 35/35`.

Stub results over the 29 tests of the two unit files, each run for real, then restored:

| Stub | Result |
|---|---|
| Never read `repo_gate` | 15 failed |
| Env only in `#take`, the resume loses the variable | 1 failed |
| Guard only in `#take`, the resume loses the guard | 2 failed |
| No repository test | 2 failed |
| Release before `queue` | 19 failed |
| A `plan` row releases in the settle step | 1 failed |
| A null job id counts as done | 1 failed |
| A failed hand-over counts as no hand-over | 3 failed |

Ratchet: unit list 949 to 994, api list 187 to 194, on the same command. These numbers hold other tasks that merged in the same period. This task adds 15 plus 14 unit tests in the two hand-over files, 14 unit tests in `goal-loop.test.ts`, and 3 api tests. Metric `poll-share`: decision 7, not measured yet.

Decisions:

- The set-up of the api test is in `tests/support/gate-handover-world.ts`, not in the test file, because a test that imports a `.test.ts` file runs its tests again. K11 imports `startHandOverLoop` from there.
- The 15 tests of the plan stay exactly 15, so that its Green holds. The orders of events and the restarts are in `server/services/gate-handover-orders.test.ts`.
- `prNumberOf` also refuses a number that `gate_jobs.pr_number` cannot hold. Such a number gives a release, because a throw from Postgres gives a retry that never ends.
- `laneEnvOf` removes `CASTRAFERRUM_GATE` that a lane env sets, so only the console sets it.

Limit: the retry of decision 47 has no end. A `PR_OPEN` link to a pull request that does not exist keeps the claim open. Issue 373 tracks this.

<!-- K8 -->

## K8

Goal: G27. A run asked to merge, in any form of spec 2.15, does not reach `gh`.

Red: `npx vitest run --project api tests/api/merge-guard.test.ts` printed `Error: Cannot find module '../../shared/domain/merge-guard'`, `Test Files  1 failed (1)`, `Tests  no tests`.

Green: the same command prints `Test Files  1 passed (1)` and `Tests  56 passed | 1 skipped (57)`. With `LC_REAL_CLAUDE=1` and `-t real` it prints `Tests  1 passed | 56 skipped (57)`. `npm run verify` exits 0 (`UCs with a green e2e: 33/33`, unit 1015 passed, contract 204 passed, api 218 passed | 1 skipped).

Stub check, all three run for real on `checkMergeCommand`:

- Always `{ deny: false }`: `Tests  38 failed | 18 passed | 1 skipped (57)`. All 35 Refused lines fail, and so do 3 wiring tests.
- Always `deny`: `Tests  52 failed | 4 passed | 1 skipped (57)`. All 16 Allowed lines fail.
- Only `gh pr merge` refused: `Tests  28 failed | 28 passed | 1 skipped (57)`. The REST, GraphQL, status, check-run, `git push` and MCP lines fail.

Real run: haiku at low effort, folder `lc-real-claude-k8-*` in the temporary folder, `GH_TOKEN=invalid`, a fake `gh` first on `PATH`. The test wraps the hook so that it appends each call to `hook.log`. It asserts at least one hook call with `deny` for `gh pr merge`, and 0 lines in `gh.log`. A refusal by the model alone calls no hook and fails the test.

Ratchet: `npx vitest list --project api 2>/dev/null | wc -l` went 131 to 138. The plan expected +57, but `vitest list` prints one row for a whole `it.each`, so it counts 7 rows for 57 tests. The executed count is 57 (56 passed, 1 skipped).

Limit: the hook reads only the text of the command. A script file that holds the merge (`bash m.sh`) passes the hook, and K9 finds it. This is stated in `docs/ARCHITECTURE.md`.

<!-- K9 -->

## K9

Red: `npx vitest run --project unit tests/tools/merge-audit.test.ts`
```
 Test Files  1 failed (1)
      Tests  7 failed (7)
```
Green: same command, after the rebase
```
 Test Files  1 passed (1)
      Tests  7 passed (7)
```
Stub check: a script that prints `merge-audit: 0 incidents in 0 merged PRs` and exits 0 gives `Tests  7 failed (7)`. The real script was restored and gives `Tests  7 passed (7)`.
Ratchet (`npm run test:unit`, Tests passed): 828 before, 835 after.
Light verify: `grep -rn "merge-audit" server web` prints nothing.

<!-- K10 -->

## K10

Source: this task shipped in hieplam/agent-plugins, so the literal results below are copied from the Verify section of the merged PR https://github.com/hieplam/agent-plugins/pull/18 (written into this log for issue 432). Nothing here was measured again.

Red (tests added first; `node --test tests/epic.test.mjs tests/check-tick.test.mjs` in `plugins/epic-loop/skills/epic-loop/scripts`):

    ℹ tests 54
    ℹ pass 50
    ℹ fail 4

The 4 failures are 3 `check` tests and the `--pr` test.

Green (same command after the change and after rebase on `origin/master` a253c57; T3 had not merged, so the count is 49 + 5 = 54):

    ℹ tests 54
    ℹ pass 54
    ℹ fail 0

Evals (`run_evals.py --eval-id 1,2,3,6,7 --mode with_skill --exec-model haiku --grader-model haiku`, `GH_TOKEN=invalid`; cost not measured): first run 1 PASS, 2 FAIL, 3 PASS, 6 PASS, 7 FAIL (eval 7 failed only on its `expected_output`, which was reworded). Second run: 2 PASS, 7 PASS.

Stub check (run for real in the PR):
- `check` ignores the status (`const gate = null`): 2 tests fail, `ℹ pass 52`, `ℹ fail 2`.
- `check-tick.mjs` ignores `--pr`: the `--pr` test fails.
- A polling tick (`tick.md` from `origin/master`, no gate mode): eval 7 `[with_skill] FAIL`.

Ratchet: `node --test` count 49 to 54.

Acceptance: not recorded in https://github.com/hieplam/agent-plugins/pull/18 (the PR is in agent-plugins, and `E check` reads castraferrum).

<!-- K11 -->

## K11

Limit (issue 339): `gate-scope` proves what the gate does after a ratification, not who may call the route. G9 is not closed on that point. A run can post to the route from a script file, and the merge guard reads only the command text. The second layer for that point is the `ratified` list of `scripts/merge-audit.mjs`, and the ratify control of `gate-scope` proves that this list holds the merge.

Red, before the build:

```
node scripts/goal-check.mjs goals/2026-11-01-goal-driven-loop.json --only G6
G6 FAIL: run `npx vitest run --project api tests/api/gate-red.test.ts --reporter verbose`: exit 1, expected 0; missing "passed"
goals passed: 0/1
node scripts/goal-check.mjs goals/2026-11-01-goal-driven-loop.json --only G7
G7 FAIL: run `npx vitest run --project api tests/api/gate-stub.test.ts --reporter verbose`: exit 1, expected 0; missing "passed"
goals passed: 0/1
node scripts/goal-check.mjs goals/2026-11-01-goal-driven-loop.json --only G9
G9 FAIL: run `npx vitest run --project api tests/api/gate-scope.test.ts --reporter verbose`: exit 1, expected 0; missing "passed"
goals passed: 0/1
```

Green, after the last rebase on f160856:

```
npx vitest run --project api tests/api/gate-red.test.ts
      Tests  18 passed (18)
npx vitest run --project api tests/api/gate-stub.test.ts
      Tests  7 passed (7)
npx vitest run --project api tests/api/gate-scope.test.ts
      Tests  43 passed (43)
node scripts/goal-check.mjs goals/2026-11-01-goal-driven-loop.json --only G6
G6 pass
goals passed: 1/1
node scripts/goal-check.mjs goals/2026-11-01-goal-driven-loop.json --only G7
G7 pass
goals passed: 1/1
node scripts/goal-check.mjs goals/2026-11-01-goal-driven-loop.json --only G9
G9 pass
goals passed: 1/1
```

Light verify, because the task changes only tests. Each step exited 0:

```
npm run design:states; npm run typecheck; node scripts/lang-scan.mjs --check-baseline; npm run arch
npm run ratchets -- --base main; npm run rule-lint -- --base main
npm run test:unit
      Tests  1225 passed | 3 skipped (1228)
npm run test:contract
      Tests  252 passed (252)
npm run test:api
      Tests  380 passed | 2 skipped (382)
npm run api-smoke; npm run build
git diff --stat origin/main -- server shared web
(empty)
grep -rn gate-api-world server web shared
(empty, exit 1)
```

Stub check. Each mutant was one edit of `server/services/gate-service.ts`, then the three files, then `git checkout` of that file. The mutants ran before the last rebase, on the same gate service. Each run has 68 tests:

```
if (false) { for the guarded verdict                 planned 39: Tests  39 failed | 29 passed (68)
const bad = undefined; in ci                         planned  6: Tests  6 failed | 62 passed (68)
const bad: never[] = []; in redMain                  planned  3: Tests  3 failed | 65 passed (68)
if (true) return for isRealRed in stub               planned  2: Tests  2 failed | 66 passed (68)
const exam: VerifyTask = { green: [], stub: ... }    planned  6: Tests  8 failed | 60 passed (68)
host.merge with 'f'.repeat(40)                       planned 16: Tests  16 failed | 52 passed (68)
```

The exam mutant fails 8, not the planned 6. The 6 planned tests fail, and the 2 controls of `gate-stub` also fail. These controls assert more than the plan asks: the `stub` row of `GOOD_FILES` is `pass`, and the output of the `stub` row of the `stub.none` entry is `nothing to stub`. The mutant replaces the exam, so both assertions see the exam of the mutant. The tests stay as written.

Ratchet: `npx vitest list --project api 2>/dev/null | wc -l` printed 194 at Red and 223 after the build, a rise of 29, not the planned 68. The reason: `vitest list` prints one line for an `it.each`, with the `%s` not filled in, so the 35 guarded paths of `gate-scope` are 1 line, and the 7 tests of the two `it.each` of `gate-red` are 2 lines. That is 39 lines less than 68. A run counts every test: 18 + 7 + 43 = 68 new tests pass, and `npm run test:api` reports 382 tests. Files changed under `server/ shared/ web/`: 0. Metrics `merged-on-red`, `stub-share`: decision 7, not measured yet.

Decisions:

- The two red-main controls that close the issue use an issue that `gh issue create` made, with the exact title of the gate, not an issue from a first refused PR. So a control depends on no refusal, and mutant `redMain` fails only the 3 refusals. The refused tests prove that the gate opens that issue and finds it again.
- The second PR of a red-main control has its own task and files. Main already holds the files of task 141 after the first merge, so the same files have nothing to stub.
- `expectMerged` reads the rows of the last attempt, because a ratified job keeps the rows of its first stop.
- The ratify control also runs the audit: 0 incidents, and the PR is in `ratified`.


<!-- K12 -->

## K12

Goal G6: the owner sees the gate queue, a failed job with the step that failed and its output, and can turn the gate on, ratify and queue again. The pages match the approved `gate-queue` and `gate-failed` shots (desktop, phone, light, dark).

Ratchet before: no `results/gate.json` (0 pairs); `e2e expects: 885`; api tests of the gate pages 0; `states with shots: 142/142`; `UCs with a green e2e: 35/35`.

Red, before the build (the visual and e2e Red ran in a frozen copy of the tree that had the tests and no feature, on the same lane database):

```
npx vitest run --project api tests/api/gate-pages-api.test.ts:      Tests  9 failed (9)
npx playwright test tests/visual/ds/gate.visual.ts --project=visual: 4 failed
npx playwright test tests/e2e/gate-pages.spec.ts --project chromium: 4 failed
```

Green:

```
npx vitest run --project api tests/api/gate-pages-api.test.ts:      Tests  9 passed (9)
npx playwright test tests/visual/ds/gate.visual.ts --project=visual: 4 passed
node -e "<r.length, worst ratio <= 0.001>" results/gate.json:          8 true  (worst ratio 0.00034549, the phone queue page)
npx playwright test tests/e2e/gate-pages.spec.ts --project chromium: 4 passed
npx vitest run --project contract -t gate_tables:                       exit 0, 2 more tests per side (title, listByRepo)
npm run ratchets:                                                      ratchets: ok, e2e expects: 929
npm run design:states -- --design design/ds:                           states with shots: 142/142
tests/visual/ds/repos.visual.ts:                                       4 passed
npm run design:compare:                                                67 passed, "pairs": 8, "worstRatio": 0.0003454933441723402
npm run verify (one run, slot-1, lane database loops_k12_test):         exit 0, UCs with a green e2e: 36/36 (run before the last two rebases, which only renumbered the migration and merged the docs)
  unit Tests  1225 passed | 3 skipped; contract memory: 119 passed, postgres: 119 passed
  api Tests  324 passed | 2 skipped; e2e and visual 134 passed (16.3m); phone overflow: 0/12
```

I opened three pairs with Read, side by side: `phone-gate-queue-light`, `phone-gate-failed-dark` and `gate-failed-light`, each app shot next to its approved shot, and the diff of the first. The pages are the same. The only pixels that differ are anti-aliasing at the edges of a few letters of the PR title (the title is a text and a span in the app, one text in the preview): at most 0.035 percent of the page. The other pairs differ by at most 0.011 percent.

Stub results, each run for real, then restored: `GET /api/repos/:id/gate` answering empty lists: 6 of 9 api tests failed (the plan said 6 of 9). `queue` without the title: the title api test failed, and the contract test of the title failed on the Postgres side. `JobCell` returning `null`: 2 of 4 visual tests failed, the two queue pairs (the plan said 4: the failed page does not use `JobCell`, so its tests cannot fail). The failed page with no output block: 2 of 4 failed, `gate-failed` and `phone-gate-failed` (12.45 and 5.06 percent off on the phone page).

Ratchet after: pairs in `results/gate.json` 0 to 8 (worst ratio 0.00035); api tests +9; contract +2 per side; unit +0 (the uc-coverage test changed its numbers); `e2e expects` 885 to 929 (18 of them are K12, the rest came with other merged tasks); `UCs with a green e2e` 35 to 36 (new UC-37, `--min` 35 to 36); API routes 3 more in `docs/API.md`.

No network (after the owner's rules): the seeded origin is a local bare repository, the row says `hieplam/tribe`, and every seeded run (visual and e2e) starts its console on the fake `gh`. A seeded gate never changes while a page is read: `takeNext` takes a job only when no job is `running`, the seeded job is `running`, and `requeueRunning` runs only at start-up, before the seed. The final run (gate and repos visual `8 passed`, `8 true`, worst ratio 0.00034549; `gate-pages.spec.ts` `4 passed`) ended with `Get-Process git-credential-manager` giving `count: 0`. Earlier hangs came from old seeds with a real github origin that stayed in the lane database; the lane databases were recreated. `grep -rnE "https://github.com/[A-Za-z0-9_-]+/[A-Za-z0-9_.-]+\.git" tests`:

```
tests/api/gate-pages-api.test.ts:160:    const https = await repoWithOrigin('https://github.com/hieplam/tribe.git');
tests/api/gate-pages-api.test.ts:180:    const id = await repoWithOrigin('https://github.com/hieplam/tribe.git');
```

(Both lines are strings that the api test parses; its console has no ticker and runs no `git`.)

Decisions (standing rules of the epic, no question to the owner):
- `gate_jobs.title` (text, null) and `GateRepository.enqueue` takes `title`. A job with no title shows `PR #n` alone.
- A new port method `listByRepo(repoId, states, limit)` reads the jobs of one repo, so the page of a repo does not depend on how many newer jobs other repos have.
- The preview of `gate-failed` was re-shot without the time column and the tones of the output (recorded in `design/APPROVED.md`). Every other element is as approved.
- A new use case UC-37 with the 4 tests of `gate-pages.spec.ts` tagged `@UC-37`, and `uc-coverage --min` 36.
- The plan's Red command `npx playwright test --project visual <file>` takes the file as a second project name in this Playwright version, so the runs use `<file> --project=visual`.
- The migration is renumbered on each rebase that brought a lane migration: 0009, then 0011, then 0012, now 0013.
- Two empty states have a text (`goalLoop.gate.queueEmpty`, `goalLoop.gate.recordEmpty`), built from the existing `.empty`.


<!-- T1 -->

## T1

Golden output of the 10 old fixtures, saved from the old script before any change (`golden/<name>.out`, exits 0,1,1,1,1,1,1,1,1,1).

Red (tests written, old script):

    $ npx vitest run --project unit tests/tools/goal-check.test.ts
     Test Files  1 failed (1)
          Tests  10 failed | 15 passed (25)

Green (after the rebase):

    $ npx vitest run --project unit tests/tools/goal-check.test.ts
     Test Files  1 passed (1)
          Tests  25 passed (25)
    $ node scripts/goal-check.mjs; echo $?
    usage: node scripts/goal-check.mjs <manifest> [--only G<k>] [--cadence merge|nightly] [--json]
    2

Stub check (each change restored after the run):

    usage branch returns 0:      Tests  2 failed | 23 passed (25)
    --json prints {}:            Tests  6 failed | 19 passed (25)
    --cadence ignored:           Tests  3 failed | 22 passed (25)   (the unknown-cadence test still passes: the name is checked apart from the filter)

Ratchet, tests in `goal-check.test.ts`: 11 before, 25 after.

<!-- T2 -->

## T2

Issue 308. `GoalService` after a merge, `loop-goals:`, fall issue.

Red, before any code, `npx vitest run --project unit server/services/goal-service.test.ts`:

    Error: Cannot find module './goal-service' imported from <worktree>/server/services/goal-service.test.ts
    Test Files  1 failed (1)
    Tests  no tests

Green, the same command after the rebase:

    Test Files  1 passed (1)
    Tests  14 passed (14)

`npx vitest run --project contract -t goal_runs`: `Tests  4 passed | 244 skipped (248)`. `npx vitest run --project unit server/adapters/github`: `Tests  18 passed (18)`, 16 before. `npm run verify`: exit 0, last line `UCs with a green e2e: 35/35`, e2e `123 passed`.

Nightly rows after a merge: the test `a nightly row does not run after a merge` records each row that ran. The log is `['A', 'B']`, not `N`, and the command is `node scripts/goal-check.mjs goals/g.json --json --cadence merge`.

Stub checks, each run and restored:

- Comment only the merge rows: `Tests  1 failed | 13 skipped (14)`, the `total stays 3` test.
- No `findOpen`: `Tests  1 failed | 13 skipped (14)`, `expected [ 2, 3 ] to have a length of 1 but got 2`.
- Goals after the next job: `Tests  1 failed | 13 skipped (14)`, the order test, `expected +0 to be 1`.
- Let a failure throw: the first run passed, because `finish` keeps the first state. The mutant wrote a `failure` status on the merged commit. The test now reads that status: `Tests  1 failed | 13 skipped (14)`, `expected 'failure' to be 'success'`.

Ratchet: unit tests + 16 (goal service 0 to 14, adapter 16 to 18). Contract 113 to 115 per side. Duplicate fall issues in the test: 0.

<!-- T3 -->

## T3

Source: this task shipped in hieplam/agent-plugins, so the literal results below are copied from the Verify section of the merged PR https://github.com/hieplam/agent-plugins/pull/19 (written into this log for issue 432). Nothing here was measured again.

Red (before the rebase, N = 47; `node --test scripts/tests/epic.test.mjs`):

    tests 67
    pass 54
    fail 13

Green, after the rebase (`node --test scripts/tests/epic.test.mjs`):

    tests 71
    pass 71
    fail 0

With `check-tick.test.mjs`: `tests 74`, `pass 74`, `fail 0`. After the two `G11:` tests of the gate review: `tests 73`, `pass 73`, `fail 0`; with `check-tick.test.mjs`: `tests 76`, `pass 76`, `fail 0`. The golden test `no Goal manifest line: behaves as before` passes.

Stub check (run for real after the rebase):
- `epic.mjs` of `origin/master`: `tests 71`, `pass 58`, `fail 13`.
- A stub that blocks every manifest epic: `tests 71`, `pass 59`, `fail 12`. The failures include the take, done and control tests.

Real GitHub, read-only: `E next 217 --dry-run -R hieplam/castraferrum` ran with the `IssueBody` query, and the `ClosingFiles` query returned data for a real issue.

Ratchet: tests in `epic.test.mjs`, 47 to 73 (51 to 73 from K10's base, +22). F0 `first-goal-day`: decision 7, not measured yet.

Acceptance: not recorded in https://github.com/hieplam/agent-plugins/pull/19 (the PR is in agent-plugins, and `E check` reads castraferrum).

<!-- T4 -->

## T4

Red, before the build:

    $ npx vitest run --project unit shared/domain/fingerprint.test.ts
     Test Files  1 failed (1)
          Tests  no tests
    $ npx vitest run --project api tests/api/standing-goals.test.ts
     Test Files  1 failed (1)
          Tests  no tests

Green, after the last rebase:

    $ npx vitest run --project unit shared/domain/fingerprint.test.ts
     Test Files  1 passed (1)
          Tests  7 passed (7)
    $ npx vitest run --project api tests/api/standing-goals.test.ts
     Test Files  1 passed (1)
          Tests  10 passed (10)
    $ npx vitest run --project unit server/adapters/github
          Tests  11 passed (11)
    $ npm run test:contract
    memory: 70 passed · postgres: 70 passed
    executor contract — claude (fake query): 7 passed · mock: 7 passed
    $ npm run arch
    arch exit 0

The golden hashes of the plan passed on the first run, and no golden changed.

Full `npm run verify` exited 0 on the commit before the last rebase. That rebase brought only a plan document. Log tail: `Tests  898 passed | 2 skipped (900)` for unit, `115 passed (13.8m)` for visual, `phone overflow: 0/12`, `UCs with a green e2e: 33/33`, `ratchets: ok`.

Stub check, each run for real and then restored:

    constant hash:               Tests  3 failed | 4 passed (7)
    normalize only lower-cases:  Tests  5 failed | 2 passed (7)
    always opens:                Tests  5 failed | 5 passed (10)   (includes tests 1, 2 and 7)
    adoption removed:            Tests  1 failed | 9 passed (10)   (the adoption test)
    never closes:                Tests  3 failed | 7 passed (10)   (includes test 3)
    no maxNewIssues limit:       Tests  2 failed | 8 passed (10)   (includes test 5)

Ratchet, on the same base commit: contract tests 140 to 148 (`memory` and `postgres` 63 to 67 each). New tests of the unit and api projects: 7 + 2 + 10 = 19, because the plan's 17 does not count the 2 adapter tests. The tool counted 781 before, and 827 after the rebases that also brought other lanes' tests. The duplicates target is 0: the api test finds 1 issue in the fake world after 2 failing passes.

Decisions and limits are in the PR body.

<!-- T5 -->

## T5

Red, before building: `npx vitest run --project unit shared/domain/health-goals.test.ts` and `npx vitest run --project api tests/api/health-goals.test.ts` each printed `Test Files  1 failed (1)` (the modules did not exist).

Green, after the rebase on `origin/main`: unit `Tests  10 passed (10)`; api `Tests  8 passed (8)`; `tests/api/standing-goals.test.ts` `Tests  11 passed (11)`; `node scripts/merge-audit.mjs` printed `merge-audit: -R <owner/name> is required`, exit 2.

Stub check, run for real and restored:
- `runHealth` returns `null`: `Tests  7 failed | 1 passed (8)`.
- `parseHealthFile` skips the `--since` rule: the unit test `refuses an audit row with no --since` fails (`1 failed | 9 passed`).
- `merge-audit.mjs` exits 0 with `0 incidents` on a failed `gh` call: the two broken-`gh` tests fail (`2 failed | 6 passed`).

Ratchet: unit tests 1015 to 1025 (+10), api tests 162 to 170 (+8). Duplicate issues in the api test: 0 (one issue after two failing passes, `Failed passes: 2`). Merged PRs with no gate status that H2 finds in the planted test: 1 of 1.

<!-- T6 -->

## T6

Task T6, goal G11: the owner sees progress as a number that moves at each merge, and the goals page matches `goal-rows` (desktop, phone, light, dark). Branch `feat/gdl-t6-goal-rows`, rebased on main 558c130 (W4 token budget, W6, W7 merged).

Names that changed after the plan: the view is a new class `DefaultGoalViewService` in `server/services/goal-view-service.ts` with its own interface `GoalViewService` (the plan put `view` in `goal-service.ts`; a separate class keeps the fakes of `GoalService` unchanged). The seed uses `hieplam/tribe` for `github_repo` (the plan said `acme/api`: a name that only shows on a page is `hieplam/tribe`), and its gate row is off, so no goal pass runs on the fake world. The tests reach no network: the e2e console runs on the fake `gh` and a local bare origin. The `spawn git ENOENT` lines of an early e2e run came from a stale repository row of my own probe script in the live database, not from the product.

### Red

- Contract, adapters removed: `npx vitest run --project contract -t "listGoals|listManifests"` printed `Tests  4 failed | 266 skipped (270)` (`r.goals.listManifests is not a function`, two sides).
- Api, server code removed: `npx vitest run --project api tests/api/goal-view-api.test.ts` printed `Tests  7 failed (7)`.
- Visual and e2e: the Red of these two was not run before the web code existed. The empty implementation gives the same result: with `GoalsView` returning `null`, the visual command prints `2 failed`, and with the view answering `manifest: null` the e2e tests fail (see the stub check).

### Green (after the last rebase)

- `npx playwright test --project=visual tests/visual/ds/goals.visual.ts`: `2 passed`.
- `design/compare/ds/results/goals.json` after `npm run design:compare`: `4 true` (4 pairs, worst ratio at most 0.001).
- `npx playwright test --project=chromium tests/e2e/goal-number.spec.ts`: `3 passed`.
- `npx vitest run --project api tests/api/goal-view-api.test.ts`: `Tests  7 passed (7)`.
- `npx vitest run --project contract -t "goal_runs|standing goals"`: `Tests  16 passed | 258 skipped (274)`.
- `npx playwright test --project=visual tests/visual/ds/loop.visual.ts`: `8 passed`.
- `npx vitest run --project unit tests/tools/test-addresses.test.ts`: `Tests  5 passed (5)`.

### Stub check (each run, then restored)

- `GoalsView` returns `null`: goals visual `2 failed`.
- The view answers `manifest: null`: api `Tests  6 failed | 1 passed (7)`; the e2e test of the number `1 failed` (no `fig-goals`); the e2e test of the link `1 failed` (no `goals-link`).
- The link for every loop: `loop.visual.ts` `2 failed` (`loop-last-failed-light · page: 7.61 % off`) and the probe pairs fail.
- The rows read from stale stored rows (only G1 and G2): the e2e test of the move from 2/8 to 3/8 `1 failed`.

### Ratchet

- Pairs in `results/goals.json`: 0 before, 4 after.
- Api tests: +7 (the file `goal-view-api.test.ts`). Contract tests: +2 per side (`listGoals`, `listManifests`; 16 pass in the two groups).
- `e2e expects` of `npm run ratchets`: 1054 before, 1068 after (14 expects in `goal-number.spec.ts` and the seed). `e2eExpectsMin` stays 745.
- Metric `status-questions`: decision 7, not measured yet.

### Full verify

`npm run verify` after the last rebase, in slot 1: exit 0. Last lines: `phone overflow: 0/12` and `UCs with a green e2e: 38/38`. The visual project ran 174 passed. `design:compare` report: 292 pairs, worst ratio 0.00035 (`goals.json`: 4 pairs, worst ratio 0). The first verify run stopped at `api-surface.test.ts`, which counted 44 routes against 45 (the goals route); the count was raised and the run repeated from the start. One run of `probe.visual.ts` showed `probe-waiting` on the state `probe_failed`; it did not repeat in the full verify.

<!-- R1 -->

## R1

Red (test file only, tool and baseline moved away):

    $ npx vitest run --project unit tests/tools/rule-lint.test.ts
     Test Files  1 failed (1)
          Tests  10 failed (10)

Green:

    $ npx vitest run --project unit tests/tools/rule-lint.test.ts
     Test Files  1 passed (1)
          Tests  10 passed (10)
    $ npm run rule-lint -- --base main
    rule-lint: ok (rule lines 13, without a check 7, new 0)

Stub check (run for real):

    scripts/rule-lint.mjs = "process.exit(0);"  ->  Tests  10 failed (10)
    every rule line counted as unchecked        ->  Tests  6 failed (10): count, ok, new-linked, growth, write-baseline, repository

Ratchet (`node scripts/rule-lint.mjs --count`, same tool before and after; the tool did not exist before this task):

    before: no tool
    after (commit 32252ca, the commit the plan measured): rule lines: 13, without a check: 7
    after (main at this task): rule lines: 13, without a check: 7

The plan expected `without a check 8`. CLAUDE.md and CONTRIBUTING.md are byte-identical between 32252ca and main, and the tool measured 7 on both trees. The measured number wins: the first measure of G16 is 7. The ratchet only falls.

Full `npm run verify` after the last rebase (lane database `loops_r1_test`, port 7210, heavy-command slot):

    ratchets: ok
    rule-lint: ok (rule lines 13, without a check 7, new 0)
    Tests  607 passed | 2 skipped (609)      (unit)
    Tests  114 passed (114)                 (contract)
    Tests  115 passed (115)                 (api)
    run 1, test:e2e: 1 failed, 114 passed   UC-15 killed server: Expected <= 10000, Received 11762
    run 2, test:e2e re-run once: 5 failed, 109 passed, 1 did not run (32.1 min on a loaded machine)
      G9 light and dark, UC-15 graceful, UC-34 phone, loop.visual active periods (180 s timeout)

The e2e failures are timing failures of tests that this task does not touch (it changes no server or web code). Issue 272 already tracks the same tests (UC-15, G9) on a tests-only branch; a comment with this evidence was added there. Pull request CI (typecheck, arch, ratchets, rule-lint, unit, build, contract, lang-scan) is green.

<!-- R2 -->

## R2

Red (before building): `npx vitest run --project api tests/api/process-events-api.test.ts`
```
 Test Files  1 failed (1)
      Tests  9 failed (9)
```
Green (after the rebase on main): same command plus `tests/api/api-surface.test.ts`
```
 Test Files  2 passed (2)
      Tests  45 passed (45)
```
`npm run test:contract`: 140 passed (memory 63, postgres 63; 2 new `listBetween` cases on each side).
Full `npm run verify` after the rebase: exit 0. Unit 844 passed, 2 skipped. Contract 140 passed. Api 142 passed. e2e and visual 115 passed. phone overflow 0/12. UC coverage 33/33.

Stub check: a route that answers `{events:[]}` fails 8 of 9 tests. Removing the range check fails the two range tests (from after to, 32 days).

Ratchet: api tests 132 to 142 (up 10: 9 new, 1 route row in api-surface). Routes in `docs/API.md` 32 to 33.

<!-- R3 -->

## R3

Red (before building): `npx vitest run --project unit tests/tools/process-file-issues.test.ts`
```
 Test Files  1 failed (1)
      Tests  15 failed (15)
```
Green (after the rebase): same command, plus `tests/tools/fake-gh.test.ts` (the fake gained `issue reopen`, `-R`, `--body-file`)
```
 Test Files  2 passed (2)
      Tests  26 passed (26)
```
Stub check: scripts with only `process.exit(0)` give `Tests  15 failed (15)`. A script that always creates (lookup removed) gives `Tests  2 failed | 13 passed (15)`: both repeat tests fail.
Ratchet: tests in `process-file-issues.test.ts`, 0 before, 15 after (the plan said 14; one more test proves that a bad cluster at the end of the file writes nothing). `causes-found` (G14): not measured yet (D7).

<!-- R4 -->

## R4

Red (before building): `npx vitest run --project api tests/api/review-profile.test.ts`
```
Error: Cannot find module '../../shared/domain/review-guard' imported from tests/api/review-profile.test.ts
 Test Files  1 failed (1)
      Tests  no tests
```
Green (after the rebase): same command
```
 Test Files  1 passed (1)
      Tests  36 passed | 1 skipped (37)
```
`npx vitest run --project unit server/services/run-service.test.ts`: 16 passed (13 before, 3 new), 0 failed.
Real (`LC_REAL_CLAUDE=1`, haiku, low effort, folder `lc-real-claude-r4-*`, `GH_TOKEN=invalid`), 3 runs, all `1 passed`. The last run printed:
```
onGuard 3 call(s): [{"tool":"Bash","deny":true,"rule":"bash-not-listed"},{"tool":"Write","deny":true,"rule":"write-path"},{"tool":"Write","deny":false}] · marker false · bash.txt false · ok.txt true
```
Stub check, all run and restored:
- `checkReviewTool` always allows: `Tests  23 failed | 13 passed | 1 skipped (37)`.
- `checkReviewTool` always denies: `Tests  33 failed | 3 passed | 1 skipped (37)`.
- Wiring without `tools`: wiring case 1 fails (`1 failed | 35 passed`). The plan says the real run then writes the marker. It does not: the hook still denies, so the real run printed the same 3 calls and no marker. The real run writes the marker only when the hook entry is removed: `onGuard 0 call(s) · marker true · bash.txt true · ok.txt true`, and the real test fails on `marker.txt outside the folder`.

Ratchet: `npx vitest list --project api | wc -l` 142 to 150 (each `it.each` is one line, so it counts +8; `vitest run` counts 37 tests in the file). Unit tests 855 to 858 (up 3). Up only.

Full verify (after the last rebase, on the code of this PR, `slot-1`, own mkdir): `npm run verify` exits 0. Unit `1074 passed | 3 skipped`, contract `210 passed`, api `286 passed | 2 skipped`, Playwright `120 passed`, `UCs with a green e2e: 34/34`. An earlier run, before the rebase on the iPhone fix, failed one iPhone journey step (URL stayed on `/settings`); that run is not counted.

<!-- R5 -->

## R5

Red, before the script existed:
```
$ npx vitest run --project unit tests/tools/process-review.test.ts
 Test Files  1 failed (1)
      Tests  12 failed (12)
$ node --import tsx scripts/process-review.mjs first-pass --real
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '<worktree>/scripts/process-review.mjs'
```
Green, after the rebase on f851d05:
```
$ npx vitest run --project unit tests/tools/process-review.test.ts
 Test Files  1 passed (1)
      Tests  12 passed (12)
$ node --import tsx scripts/process-review.mjs first-pass --real
real usage-limit 12
real smart-app-control 14
real rest 201
exit 0
```
The real command ran one time, read-only, with the default window (rows before 2026-10-23T00:00:00Z). The three counts add up to the 227 rows of that window. No row text left memory.

Stub check, on the fixture, each one restored after the run:
- An empty `rules.json` gives `Tests  7 failed | 5 passed (12)`. Tests 1 and 2 are in the 7.
- A rule for `weekly` only fails test 1: `expected [ 'e08', 'e09', 'e10' ] to have a length of 12 but got 3`.
- A script that puts every event in `rest` gives `Tests  8 failed | 4 passed (12)`. Test 3 is in the 8.

The plan's "the real command prints `0`" was run on synthetic rows in the lane database, because the real database gets one run: a rule that matches nothing prints `real usage-limit 0`, `real rest 4`. An empty rules list prints only `real rest 4`.

Limits: the rules were written after the answer was known, so they prove that known causes are filed, not that the review finds a new cause. R6 must prove the new-cause path (decision 21). The 14 Smart App Control rows are the rows that the same text match finds (S5). The 4 other rows of the S5 cluster are not judged.

Ratchet: the largest usage-limit cluster on the real rows, 9 (S5, model) to 12. The largest Smart App Control cluster, 8 to 14. Tests in `process-review.test.ts`, 0 to 12. S5 grade on the real rows, `none` to `both` (issue 267).

<!-- R6 -->

## R6

Red, before the code existed:
```
$ npx vitest run --project unit tests/tools/process-review-model-run.test.ts
 Test Files  1 failed (1)
      Tests  no tests
$ npx vitest run --project api tests/api/process-review-replay.test.ts
 Test Files  1 failed (1)
      Tests  4 failed (4)
$ node --import tsx scripts/process-review.mjs model-run --real
usage: process-review.mjs first-pass --events <f> [--signals <f>] [--rules <f>] --repo <o/r> --from <ISO> --to <ISO> --out <f>
       process-review.mjs first-pass --real [--rules <f>] [--until <ISO>]
       process-review.mjs assemble --first-pass <f> --groups <f> --out <f>
exit 2
```
Green:
```
$ npx vitest run --project unit tests/tools/process-review-model-run.test.ts tests/tools/process-review.test.ts
 Test Files  2 passed (2)
      Tests  28 passed (28)
$ npx vitest run --project api tests/api/process-review-replay.test.ts
 Test Files  1 passed (1)
      Tests  4 passed (4)
$ node --import tsx scripts/process-review.mjs model-run --real --model haiku --max-usd 1.00
real rest 201
real-model cause 1 63
real-model cause 2 43
real-model cause 3 44
real-model cause 4 2
real-model cause 5 7
real-model cause 6 5
real-model cause 7 3
real-model new causes 7
real-model spend-usd 0.0128
real-model verdict: pass
exit 0
```
After the last rebase and the last code change, one more real run printed `real rest 201`, 8 clusters with sizes 63, 43, 11, 33, 3, 2, 5 and 6, `real-model new causes 8`, `real-model spend-usd 0.0182`, `real-model verdict: pass`, exit 0. The number of clusters changes from run to run, so `new causes` has no target. The unit and replay commands printed the same totals.

Light verify after the rebase, in `slot-1`: every step exits 0. Unit `1135 passed | 3 skipped`, contract `238 passed`, api `306 passed | 2 skipped`, `ratchets: ok`. `git diff --name-only origin/main` holds no file under `server/` or `web/`, and `grep -rn "model-run\|process-review/groups" server web` prints nothing, so e2e did not run.

The 28 tests are 13 in `process-review-model-run.test.ts` and 15 in `process-review.test.ts`, so the R5 file keeps its count.

Real spend, all four sessions on haiku: 0.0072 USD to record `groups-haiku.json`, 0.0128 and 0.0182 USD for the two real runs, 0.0032 USD for the budget stub. The total is 0.0414 USD, under the limit of 1.00 USD. No sonnet run was needed. Each session used a fresh `lc-real-claude-r6-*` folder, and none of these folders is left. `docker ps -a` shows the same 23 container names before and after.

Stub check, each one run and restored:
- `modelRun` returns `pass` with no clusters: `Tests  10 failed | 3 passed (13)`. The empty-clusters test is in the 10.
- The report always prints the cause: the test of the report with the flag off fails, `Tests  1 failed | 12 passed (13)`.
- The run writes the clusters to a file in the temp folder: the `--show-causes` test fails, `Tests  1 failed | 12 passed (13)`.
- An empty `groups-haiku.json`: replay tests 1 and 3 fail, `Tests  2 failed | 2 passed (4)`.
- `model-run --real --max-usd 0.001`: the budget stops the call.
```
real rest 201
real-model new causes 0
real-model spend-usd 0.0032
real-model verdict: FAIL, the model call did not end with a reply
exit 1
```

Limit: `pass` proves that the model grouped valid rows under a valid check, not that a cause is real. On the fixture, haiku also grouped 6 successful runs as one cause, and the recorded file keeps that cluster. So a pass on the real rows can count groups of successful runs. R6 is accepted only after the coordinator runs `model-run --real --model haiku --show-causes` at the gate and judges each cause. The `--show-causes` flag was not run in this task, and no cause text is in this log.

Ratchet: tests 0 to 17 (13 unit, 4 replay), up only. Real `new causes`: 7 and 8, no target. F0 `causes-found`: D7.

<!-- R7 -->

## R7

Task: eval gate for `references/tick.md` and `references/drive.md` of the epic-loop skill. The change is in hieplam/agent-plugins, pull request 20 (branch `epic-loop/eval-gate`). Goal G17.

Red (tests first, `eval_gate.py` absent):

```
$ python3 -m unittest discover -s scripts/evals/tests -t . -p test_eval_gate.py
FileNotFoundError: [Errno 2] No such file or directory: '<worktree>/scripts/evals/eval_gate.py'
Ran 1 test in 0.004s
FAILED (errors=1)
```

Green, after the rebase on `origin/master`:

```
$ python3 -m unittest discover -s scripts/evals/tests -t . -p test_eval_gate.py
Ran 13 tests in 0.149s
OK
$ python3 scripts/evals/eval_gate.py verify-result --skill-dir plugins/epic-loop/skills/epic-loop
verify-result: ok
$ python3 scripts/evals/eval_gate.py check --baseline baseline/benchmark.json --candidate candidate-merged.json
eval 1 3/5 -> 2/5 ok
eval 2 4/5 -> 3/5 ok
eval 3 2/5 -> 3/5 ok
eval 4 0/5 -> 0/5 ok
eval 5 5/5 -> 5/5 ok
eval 6 5/5 -> 5/5 ok
eval 7 5/5 -> 4/5 ok
verdict: pass
```

Executor cost (haiku, executor calls only, `--jobs 2`, `GH_TOKEN=invalid`): baseline 0.229 USD, candidate 0.229 USD. One extra pass of eval 4 cost 0.043 USD, because one candidate run of eval 4 hit the 420 s timeout and the gate said `verdict: error`. Eval 4 ran again with `--eval-id 4 --runs 5` and was merged with `merge_benchmarks.py`. Each side took about 20 minutes. One orphan `find.exe` (from eval 4, `-path *notes*`) was stopped.

Stub check, each stub applied for real and then restored:

- `decide` always passes: 7 tests fail.
- `decide` always refuses: 7 tests fail.
- `verify-result` ignores the hashes: 1 test fails (the changed-copy test).
- A line added to the real `tick.md`: 1 test fails (the committed-tree test). After the restore: `OK`.

Ratchet: tests in `test_eval_gate.py`, 0 before, 13 after. `gate-result.json` pooled passes over 7 evals x 5 runs: baseline 24 of 35, candidate 22 of 35. It records `origin/master` against itself, with no target, because eval 3 varies from run to run.


<!-- R8 -->

## R8

Red (before building): `npx vitest run --project api tests/api/process-signals-api.test.ts`
```
 Test Files  1 failed (1)
      Tests  9 failed (9)
```
Also red before building: `npm run test:contract` printed `memory: 94 passed, 2 failed · postgres: 94 passed, 2 failed`, and the unit run of `server/adapters/github`, `tests/tools/fake-gh.test.ts` and `tests/tools/process-review.test.ts` printed `Tests  6 failed | 38 passed (44)` (2 of the 3 `--signals` cases were red; the third, the empty-list case, passed with no implementation, so it was strengthened at once with a missing-file and a missing-list check: `Tests  3 failed | 12 passed (15)` for `process-review.test.ts`).

Green (after the last rebase onto `origin/main`):
```
npx vitest run --project api tests/api/process-signals-api.test.ts          Tests  9 passed (9)
npx vitest run --project api tests/api/api-surface.test.ts                  Tests  38 passed (38)   (includes: GET /api/process/signals has a registered route)
npm run test:contract                                                       memory: 96 passed · postgres: 96 passed
npx vitest run --project unit server/adapters/github tests/tools/fake-gh.test.ts tests/tools/process-review.test.ts    Tests  44 passed (44)   (process-review.test.ts: 15 passed)
```

Stub check (each implementation was changed, the test was run, the code was restored):
```
a route that answers empty lists               Tests  6 failed | 3 passed (9)
a swallowed GitHostError (found = [])          Tests  1 failed | 8 passed (9)   answers 502 GIT_HOST_FAILED ... never empty lists
the PR number in the gate text                 Tests  3 failed | 6 passed (9)
```
A stray `prNumber` key on an item does not reach the body: the response schema drops it. So the keys test guards the text, and the PR number test guards the key.

Ratchet (up only), same tool each time:

| What | Before | After |
|---|---|---|
| api tests (`vitest --project api`, without and with the new file) | 232 passed | 241 passed |
| contract tests (`npm run test:contract`, per side) | 94 | 96 |
| routes in the table of `docs/API.md` (`api-surface.test.ts`) | 34 | 35 |
| unit tests (`npm run test:unit`) | 1057 | 1064 |

Full `npm run verify` after the last rebase (lane database `loops_r8_test`, port 7238, slot-1):

    ratchets: ok
    rule-lint: ok (rule lines 13, without a check 7, new 0)
    Tests  1064 passed | 3 skipped (1067)      (unit)
    Tests  210 passed (210)                    (contract)
    Tests  241 passed | 1 skipped (242)        (api)
    116 passed (16.3m)                         (test:e2e)
    phone overflow: 0/12
    UCs with a green e2e: 34/34
    exit code 0

`origin/main` moved by 5 commits (a gate restart fix, a release, three docs) after that run. After the final rebase these steps ran again, and they passed: `typecheck`, `arch`, `ratchets -- --base main`, `rule-lint -- --base main`, `test:unit` (`Tests  1068 passed | 3 skipped (1071)`), `test:contract` (`memory: 96 passed · postgres: 96 passed`), `test:api` (`Tests  241 passed | 1 skipped (242)`) and `api-smoke`. The e2e, `phone:check` and `uc-coverage` steps were not run again: the rebase brought no web change.

<!-- R9 -->

## R9

Red (before building the page; the API test ran with the route not registered, the web files were taken from `origin/main`):
```
npx vitest run --project api tests/api/scoreboard.test.ts                                  Tests  8 failed (8)
npx vitest run --project unit server/adapters/fs/fs-review-reports.test.ts                 Tests  2 failed | 1 passed (3)   (the no-folder case passes with a stub, by design)
npx playwright test --project=visual tests/visual/ds/scoreboard.visual.ts                  2 failed
npx playwright test tests/e2e/scoreboard-page.spec.ts --project=chromium                   2 failed   (the no-report test first proves the entry shows, then deletes the report, so a stub cannot pass it)
```

Green (after the rebase onto `origin/main`):
```
scoreboard.test.ts                      Tests  8 passed (8)
fs-review-reports.test.ts               Tests  3 passed (3)
scoreboard.visual.ts                    2 passed
results/scoreboard.json                 node -e ... prints  4 true   (worst ratio 0, pairs 4)
scoreboard-page.spec.ts                 2 passed
frame.visual.ts                         7 passed, exit 0
npm run ratchets                        ratchets: ok
npm run design:compare                  63 passed (7.1m)
```

Stub check (each implementation changed, run, restored):
```
zero figures, no weeks, no causes       Tests  8 failed (8)
split at `before` only (no `after`)     Tests  4 failed | 4 passed (8)
a cause with no check in the sums       Tests  3 failed | 5 passed (8)
ScoreboardView returns null             visual 2 failed, e2e 1 failed (the link test)
```

Ratchet (up only): pairs in `results/scoreboard.json` 0 to 4 (worst ratio 0). Api tests 241 to 250 (this file +8, the surface test +1 route). Unit tests +3. `e2e expects:` 869 to 878. Routes in the table of `docs/API.md` 35 to 36. Metric `cause-repeats`: not measured yet (decision 7).

Decision: the approved scoreboard shots were stale against the preview that draws them (the last cause row was 1 px taller in the stored image). The app matched the preview exactly, so the 4 shots were re-shot and the change is recorded in `design/APPROVED.md`.

Full `npm run verify` after the last rebase (lane database `loops_r9_test`, port 7241, slot-1): `ratchets: ok`, `rule-lint: ok`, unit `1071 passed | 3 skipped`, contract `210 passed`, api `250 passed | 1 skipped`, `120 passed (13.3m)` (test:e2e), `phone overflow: 0/12`, `UCs with a green e2e: 34/34`, exit code 0.


<!-- W1 -->

## W1

Red, before building: `npx vitest run --project unit shared/domain/goal-card.test.ts` and `npx vitest run --project api tests/api/goal-cards.test.ts` each printed `Test Files  1 failed (1)`, `Tests  no tests`.

Green, on 89ac229 after the rebase on `origin/main`: unit `Tests  12 passed (12)`; api `Tests  17 passed (17)`; `npx vitest run --project contract -t goal_cards` `Tests  6 passed | 252 skipped (258)`; `npm run goal:check` `--only G19` `G19 pass`, `goals passed: 1/1`; `--only G20` `G20 pass`, `goals passed: 1/1`.

`npm run verify` on 89ac229: exit 0. Literal lines: `ratchets: ok`; unit `Tests  1256 passed | 3 skipped (1259)`; `memory: 120 passed · postgres: 120 passed`; api `Tests  400 passed | 2 skipped (402)`; e2e `126 passed (15.6m)`; `UCs with a green e2e: 35/35`.

Two earlier verifies, both recorded:
- b941f56: 1 failed in `server/http/errors.test.ts`, which pins each status. W1 added the two codes in 5000b08.
- 5000b08: api `Tests  1 failed | 399 passed | 2 skipped (402)`, `gate-scope: refused: a PR that changes scripts/design-lint.mjs`, `expected 'failed' to be 'needs_ratification'`. W1 cannot reach it. It passed alone (`Tests  1 passed | 42 skipped (43)`) and in the third verify. Filed as issue 387.

Stub check, run for real and restored:
- A plain timer: no refusal check, no door check, `start_after` with the window off: `Tests  7 failed | 10 passed (17)`. The failures hold the refused test and the default test `window off by default: with no yes, a card stays proposed after 30 days`.
- No door check in the insert: with `-t 'one-way|neverAlone'`, `Tests  2 failed | 1 passed | 14 skipped (17)`. The 2 are the stored-door test and `a one-way card has no start time and stays proposed past the window`.

Ratchet: unit tests +20 (12 card, 6 service, 1 host, 1 workspace; `vitest list` 1024 to 1044 before the rebase). Api tests +20 (17 cards, 3 surface rows), 402 after. Contract 117 to 120 per side, +3. `refused-started`: 0. `one-way-started`: 0.

<!-- W2 -->

## W2

Goal G18 (task W2): when a goal ends, the probe asks for one writing run, with no model and no owner message. Files: `scripts/goal-writer-probe.mjs`, `tests/tools/goal-writer-probe.test.ts`.

**Red** (script moved away, before building): `npx vitest run --project unit tests/tools/goal-writer-probe.test.ts` printed `Tests  11 failed (11)`.

**Green** (after the last rebase onto `origin/main` 46d36e9): the same command printed `Tests  11 passed (11)`. `node scripts/goal-writer-probe.mjs` prints `goal-writer-probe: -R <owner/name> is required` and exits 2 (test `exits 2 and names the missing -R`).

**Stub check** (each variant run for real, then the script was restored):
- always prints `plan`: `Tests  7 failed | 4 passed (11)`
- always prints `skip`: `Tests  8 failed | 3 passed (11)`
- no stamp written: `Tests  2 failed | 9 passed (11)`
- a failed `gh` call read as "nothing open": `Tests  1 failed | 10 passed (11)`

**Ratchet** (unit tests, up only): before `Tests  1225 passed | 3 skipped (1228)`, after `Tests  1236 passed | 3 skipped (1239)`.

**Light verify** (slot-1, lane database `loops_w2_test`, 10 steps, all exit 0): `design:states`, `typecheck`, `lang-scan --check-baseline` (`baseline check: ok`, `coupling: 0`), `arch`, `ratchets -- --base main` (`ratchets: ok`), `test:unit` (`1236 passed | 3 skipped (1239)`), `test:contract` (`252 passed (252)`), `test:api` (`380 passed | 2 skipped (382)`), `api-smoke` (ok), `build`. `test:e2e` and `phone:check` were skipped by the light-verify rule: no existing file under `server/` or `web/` changed, and `grep -rn "goal-writer-probe" server web` prints nothing.

<!-- W3 -->

## W3

Pull request: https://github.com/hieplam/agent-plugins/pull/23 (repository `hieplam/agent-plugins`, branch `epic-loop/goal-writer`). It also closes issue 397. Goal G18. Commands run in the skill folder `SK`, `plugins/epic-loop/skills/epic-loop`.

Red, before the build, `node --test --test-reporter=tap scripts/tests/epic.test.mjs scripts/tests/check-card.test.mjs`:

```
# tests 99
# pass 79
# fail 20
```

Green, final code, same command:

```
# tests 100
# pass 100
# fail 0
```

**Changed Green command.** The plan says `--grader-model haiku`. The command that ran is `python3 scripts/evals/run_evals.py --evals SK/evals/evals.json --eval-id 8,9,10 --mode with_skill --exec-model haiku --grader-model sonnet --runs 5 --jobs 1 --out-dir <dir>`, in slot-1, with `PYTHONUTF8=1`. Reason, decided by the coordinator in issue 397: the haiku grader refused runs for reasons that the rubric excludes, a stronger grader is not a weaker exam, and the rubric did not change. The machine check and the rubric must both still pass.

Green, evals, final text:

```
eval 8 4/5 -> 4/5 ok
eval 9 5/5 -> 5/5 ok
eval 10 5/5 -> 5/5 ok
verdict: pass
verify-result: ok
```

| Run | Machine check, evals 8, 9, 10 | Gate count, evals 8, 9, 10 |
|---|---|---|
| haiku grader, before the fixes | 5/5, 5/5, 3/5 | 0/5, 1/5, 2/5 |
| sonnet grader, first try | 4/5, 5/5, 4/5 | 2/5, 5/5, 4/5 |
| sonnet grader, second try, final text | 5/5, 5/5, 5/5 | 4/5, 5/5, 5/5 |

Stub check:

- `goal-writer.md` emptied, same command, eval 8: `eval 8 0/5 -> 0/5 ok`. Each run fails the machine check with `0 new goal cards, expected 1`.
- A `tidy` that ignores the exit code: `not ok - tidy: a command that exits 3 refuses and leaves the issue open, with no write`, 1 failure.
- `tidy` with no owner check: `not ok - tidy: an issue by another author refuses, the command does not run, and --rewrite writes nothing`, 1 failure.

Ratchet: tests 79 to 100, which is N+21 and not N+20, because the owner rule of 2026-11-02 added one `tidy:` test. Evals 7 to 10.

`docker ps -a` showed no change after each eval run. The grader cost is not recorded, so the total model cost is not verified.

<!-- W4 -->

## W4 (token budget)

Scope: token budget only, by the order of the owner on 2026-11-09 (spec decision 55). No rank, no plan window.

Red (stub check, the budget check never stops: `false &&` in front of the condition in `#probeLoop`), `npx vitest run --project unit server/services/probe-tick.test.ts`:

    × at or over the budget: no probe call, no run, state budget_limited, and the last line stays
    Test Files  1 failed (1)
    Tests  1 failed | 20 passed (21)

Green after the restore:

    npx vitest run --project unit server/services server/adapters/executors web/features/loop-form
    Test Files  30 passed | 1 skipped (31)
    Tests  421 passed | 3 skipped (424)
    npm run test:contract
    memory: 126 passed · postgres: 126 passed
    npx vitest run --project api tests/api/probe-settings-api.test.ts
    Tests  9 passed (9)
    npm run typecheck exits 0

Migration `0014_motionless_the_hand.sql`: `ALTER TABLE "loop_probes" ADD COLUMN "token_budget" bigint;` and `ALTER TABLE "runs" ADD COLUMN "tokens" bigint;`. No `rank` column.

Ratchet: new unit tests in the focused set, 414 to 421 (N+7), api +2, contract +2 per side. Up only.

Full `npm run verify` on the final rebased code (slot 1, lane database `loops_w4b_test`, port 7270): `states with shots: 142/142`, `ratchets: ok`, unit `Tests  1336 passed | 3 skipped (1339)`, contract `Tests  270 passed (270)`, api `Tests  431 passed | 2 skipped (433)`, e2e `153 passed`, `1 failed`. The one failure is the known flaky test of issue 405, `tests/e2e/acceptance.iphone.spec.ts:43` (light first): `Error: expect(locator).toContainText(expected) failed`, `Expected substring: "Review open pull requests daily"`, `Error: element(s) not found`. The dark-first twin passed. Not retried.


<!-- W5 -->

## W5

Goal G18 (task W5): an accepted card becomes one epic, one manifest PR and one loop. Nothing merges by itself, and a retry never doubles them.

**Red** (before building): `npx vitest run --project api tests/api/goal-card-start.test.ts` printed `Test Files  1 failed (1)`.

**Green** (after the rebase on `origin/main` d7cfd66): the same command printed `Tests  10 passed (10)`. `tests/api/goal-cards.test.ts` printed `Tests  17 passed (17)` on 5c2fdf2 plus this change. Its run after the last rebase was stopped by the order of the owner, so it has no result there.

**Stub check** (each run for real, then restored):
- a starter that does nothing: `Tests  9 failed | 1 passed (10)`
- no stored results: `Tests  4 failed | 6 passed (10)`, with both retry tests in the failures
- a direct push to `main`: `Tests  3 failed | 7 passed (10)`, with both gate tests in the failures
- `opened.passed` set to `total`: `Tests  2 failed | 8 passed (10)`

**Ratchet:** api 401 to 411. Unit 1270 to 1289. Contract 120 to 121 per side. `idle-days`: `idle-days 10 days runs` before, decision 7, not measured yet after.

**Verify** (slot-1, on 2ab7fbe): `test:unit` `Tests  1289 passed | 3 skipped (1292)`, `test:api` `Tests  411 passed | 2 skipped (413)`, `test:e2e` `3 failed`, `123 passed (12.0m)`. The 3 failures are the known issue 401: `phone.spec.ts:189` in `chromium` and `webkit-phone` with `folder-show-hidden: not rendered`, and `acceptance.iphone.spec.ts:43`. After the rebase on d7cfd66, in slot-1: the folder picker test exit 0, the acceptance spec `2 passed (47.2s)`, `phone overflow: 0/12`, `UCs with a green e2e: 35/35`.

An earlier verify failed `goal-service.test.ts > the comment comes before the first command of the next job` with `Test timed out in 240000ms`. That test does not reach this change. The file printed `Tests  14 passed (14)` alone.

<!-- W6 -->

## W6

Goal G18 (task W6): when a goal ends, the next goal card appears with no owner message. The oracle is `tests/e2e/goal-card.spec.ts` (3 tests, tag `UC-39`). It uses a second server with the fake `gh`, a local bare repository, the real `scripts/goal-writer-probe.mjs`, and the fake session of test mode. The prompt `[goal-card]` makes that session open the card of `card.md` as an issue.

**Red** (before the `[goal-card]` path existed in `test-mode-query.ts`): `npx playwright test tests/e2e/goal-card.spec.ts --project chromium --reporter list --workers 1` printed `1 failed`, `2 passed`. The failure was `Expected [1, 1]`, `Received [1, 0]` (1 run, 0 cards). The two controls passed.

**Green** (after the change): the same command printed `3 passed (31.9s)`. After the rebase on `origin/main` the full verify ran the 3 tests inside `test:e2e` (`156 passed`). `npx vitest run --project unit server/adapters/executors/claude/test-mode-query.test.ts` printed `Tests  9 passed (9)` (2 new).

**Stub check** (each run for real, then restored):
- a probe that always prints `skip`: `2 failed`, `1 passed`. The first test failed with `Expected [1, 1]`, `Received [0, 0]`. The no-charter control failed too, because it expects `blocked`.
- a probe that always prints `plan`: `3 failed` (the first control fails, as the plan says, and so does the no-charter control).
- no ingest in `GoalCardService` (the `#ingest` call removed): `1 failed`, `2 passed`. The first test failed with `Expected [1, 1]`, `Received [1, 0]`.

**Ratchet:** `uc-coverage` floor 36 to 37 (new row UC-39, 38 rows). `e2e expects:` 1006 to 1029 (`e2eExpectsMin` stays 745, a floor that only rises). Unit +2. `idle-days`: decision 7, not measured yet.

**Decisions:** (1) The server of the spec gets `LOOPS_GH_BIN` set to `tests/support/fake-gh.mjs`, not to the `.cmd` wrapper, because `GhGitHost` spawns with no shell and Node cannot spawn a `.cmd` that way on Windows (`spawn EINVAL`). (2) The no-charter control uses a clone of a second bare repository with no charter, because the charter is read from the `origin/main` of the clone. (3) `e2eExpectsMin` is not raised, to avoid a conflict with the lanes that run at the same time.

**Verify:** the full verify ran in slot-1. Unit (after a fix of the counts in `tests/tools/uc-coverage.test.ts`): `Tests  1331 passed | 3 skipped (1334)`. Contract `memory: 124 passed · postgres: 124 passed`. Api `Tests  429 passed | 2 skipped (431)`. The e2e step printed `1 failed`, `156 passed (17.9m)`. The one failure is `tests/visual/ds/layout.visual.ts:94` (the dot of the Now card, phone). This change reaches no web code, so it cannot affect that test. After the rebase on `origin/main`, that test alone in slot-1 (`npx playwright test tests/visual/ds/layout.visual.ts --project visual -g "dot is centred" --workers 1`) printed `2 passed (17.3s)`, desktop and phone.


<!-- W7 -->

## W7

Red (tests exist, page and field absent, old build):

    $ npx playwright test --project=visual tests/visual/ds/goal-cards.visual.ts --reporter list --workers 1
      4 failed
    $ npx playwright test tests/e2e/goal-cards-page.spec.ts --project chromium --reporter list --workers 1
      5 failed
    $ npx vitest run --project unit web/features/loop-form/probe-form.test.ts
          Tests  6 failed | 4 passed (10)

Green (after the last rebase and a rebuild):

    $ npx playwright test --project=visual tests/visual/ds/goal-cards.visual.ts --reporter list --workers 1
      4 passed (34.3s)
    $ node -e "const r=require('./reports/compare/ds/results/goal-cards.json');console.log(r.length,Math.max(...r.flatMap(s=>s.regions.map(x=>x.ratio)))<=0.001)"
    8 true
    $ npx playwright test tests/e2e/goal-cards-page.spec.ts --project=chromium --reporter list --workers 1   (inside npm run test:e2e: 164 passed (14.6m))
    $ npx vitest run --project unit web/features/loop-form/
          Tests  30 passed (30)
    $ npx playwright test --project=visual tests/visual/ds/repos.visual.ts --reporter list --workers 1
      4 passed (45.5s)
    $ npm run test:api        Tests  431 passed | 2 skipped (433)
    $ npm run uc-coverage -- --min 36        UCs with a green e2e: 37/37

Stub check (each patch applied, built, run, restored):

    GoalCardView returns null                -> visual: 4 failed
    Accept sends no request                  -> e2e: 1 failed (the first test)
    one-way card shows a start time          -> e2e and visual: 3 failed (the third e2e test and the two card-one-way pairs)
    toProbeBody drops tokenBudget            -> e2e: 1 failed; unit: Tests  2 failed | 8 passed (10)

Ratchet (`e2e expects` of `npm run ratchets`, files of tests/e2e and tests/support), before and after:

    origin/main: 1006
    this branch: 1027 (min 745), ratchets: ok
    pairs in results/goal-cards.json: 0 -> 8, worst ratio 0

Tests outside the task that failed in the first full run on a saturated machine, and passed alone:

    gh-git-host.test.ts (Hook timed out in 10000ms)      alone: Tests  34 passed (34)
    probe.visual.ts probe-blocked (probe_failed)         alone: 10 passed (27.6s)
    loops.visual.ts Vietnamese (ERR_NO_BUFFER_SPACE)     alone: 12 passed (46.5s)

<!-- Z1 -->

## Z1

Verify of epic 217: the goal-check tool on all 28 goals, and `E check --dry-run` on each of the 61 closed tasks.

Decisions (recorded in the PR):
- Step 3 (pull the skill clone) was replaced by a detached worktree of agent-plugins at origin/master 7de81f3, because the clone is on another branch with untracked work that is not ours. `E` ran from that worktree. The clone was not touched; its branch and status are the same before and after.
- The goal-check run below ran on main e085c45. Main moved by one docs-only commit, f5541b2 (the evidence sections of P13, K10 and T3, issue 432). The output is reused, not run again. The coordinator re-runs the tool on the final main.
- W4 was reopened as "W4 - Token budget", so its evidence heading is `## W4 (token budget)`.
- First run of step 7 found 9 failing lines (3 missing evidence sections, 6 PRs without an Acceptance line). Issue 432 fixed them. The second run below prints PASS on all 61.
- Ratchet: goals passing at the first run of step 5: 28/28. After: 28/28. Open fix issues under epic 217: only Z2.

Z1 sha: e085c45

    goal-check: running npm run build
    goal-check: exit 0 after 2s
    goal-check: running git clone --depth 1 https://github.com/hieplam/agent-plugins.git agent-plugins-checkout || git -C agent-plugins-checkout pull --ff-only
    goal-check: exit 0 after 2s
    goal-check: running npx playwright test tests/e2e/probe-idle.spec.ts --project chromium --reporter list
    goal-check: exit 0 after 14s
    G1 pass
    goal-check: running npx playwright test tests/e2e/probe-gap.spec.ts --project chromium --reporter list
    goal-check: exit 0 after 11s
    G2 pass
    goal-check: running npx vitest run --project api tests/api/usage-hold.test.ts --reporter verbose
    goal-check: exit 0 after 7s
    goal-check: running npx vitest run --project contract tests/contract/executor-mock.test.ts --reporter verbose
    goal-check: exit 0 after 3s
    G3 pass
    goal-check: running npx vitest run --project api tests/api/claims.test.ts --reporter verbose
    goal-check: exit 0 after 7s
    G4 pass
    goal-check: running npm run api-smoke
    goal-check: exit 0 after 19s
    G5 pass
    goal-check: running npx vitest run --project api tests/api/gate-red.test.ts --reporter verbose
    goal-check: exit 0 after 103s
    G6 pass
    goal-check: running npx vitest run --project api tests/api/gate-stub.test.ts --reporter verbose
    goal-check: exit 0 after 36s
    G7 pass
    goal-check: running npx vitest run --project api tests/api/gate-handover.test.ts --reporter verbose
    goal-check: exit 0 after 7s
    G8 pass
    goal-check: running npx vitest run --project api tests/api/gate-scope.test.ts --reporter verbose
    goal-check: exit 0 after 202s
    G9 pass
    goal-check: running node --test --test-reporter=spec --test-name-pattern="^G10: " agent-plugins-checkout/plugins/epic-loop/skills/epic-loop/scripts/tests/epic.test.mjs
    goal-check: exit 0 after 3s
    G10 pass
    goal-check: running npx playwright test tests/e2e/goal-number.spec.ts --project chromium --reporter list
    goal-check: exit 0 after 44s
    goal-check: running node --test --test-reporter=spec --test-name-pattern="^G11: " agent-plugins-checkout/plugins/epic-loop/skills/epic-loop/scripts/tests/epic.test.mjs
    goal-check: exit 0 after 0s
    G11 pass
    goal-check: running npx vitest run --project unit tests/tools/metrics-baseline.test.ts -t late-tasks --reporter verbose
    goal-check: exit 0 after 2s
    G12 pass
    goal-check: running npx vitest run --project api tests/api/standing-goals.test.ts --reporter verbose
    goal-check: exit 0 after 11s
    G13 pass
    goal-check: running npx vitest run --project api tests/api/process-review-replay.test.ts --reporter verbose
    goal-check: exit 0 after 11s
    G14 pass
    goal-check: running npx vitest run --project api tests/api/scoreboard.test.ts --reporter verbose
    goal-check: exit 0 after 9s
    G15 pass
    goal-check: running npx vitest run --project unit tests/tools/rule-lint.test.ts --reporter verbose
    goal-check: exit 0 after 3s
    G16 pass
    goal-check: running python3 -m unittest discover -v -s agent-plugins-checkout/scripts/evals/tests -p test_eval_gate.py
    goal-check: exit 0 after 1s
    G17 pass
    goal-check: running npx playwright test tests/e2e/goal-card.spec.ts --project chromium --reporter list
    goal-check: exit 0 after 24s
    G18 pass
    goal-check: running npx vitest run --project api tests/api/goal-cards.test.ts --reporter verbose
    goal-check: exit 0 after 45s
    G19 pass
    goal-check: running npx vitest run --project api tests/api/goal-cards.test.ts --reporter verbose
    goal-check: exit 0 after 47s
    G20 pass
    goal-check: running npx vitest run --project unit tests/tools/metrics-baseline.test.ts -t owner-messages --reporter verbose
    goal-check: exit 0 after 2s
    G22 pass
    goal-check: running npx vitest run --project api tests/api/holds.test.ts --reporter verbose
    goal-check: exit 0 after 9s
    G23 pass
    goal-check: running npx vitest run --project api tests/api/lanes.test.ts --reporter verbose
    goal-check: exit 0 after 7s
    G24 pass
    goal-check: running npx vitest run --project api tests/api/plan-action.test.ts --reporter verbose
    goal-check: exit 0 after 6s
    goal-check: running node --test --test-reporter=spec --test-name-pattern="^G25: " agent-plugins-checkout/plugins/epic-loop/skills/epic-loop/scripts/tests/epic.test.mjs
    goal-check: exit 0 after 1s
    G25 pass
    goal-check: running node --test --test-reporter=spec --test-name-pattern="^G26: " agent-plugins-checkout/plugins/epic-loop/skills/epic-loop/scripts/tests/epic.test.mjs
    goal-check: exit 0 after 1s
    G26 pass
    goal-check: running npx vitest run --project api tests/api/merge-guard.test.ts --reporter verbose
    goal-check: exit 0 after 3s
    G27 pass
    goal-check: running npx playwright test tests/e2e/probe-state.spec.ts --project chromium --reporter list
    goal-check: exit 0 after 27s
    G28 pass
    goal-check: running node --test --test-reporter=spec --test-name-pattern="^G29: " agent-plugins-checkout/plugins/epic-loop/skills/epic-loop/scripts/tests/epic.test.mjs
    goal-check: exit 0 after 1s
    G29 pass
    goals passed: 28/28

Z1 check P1 issue 236: PASS 236
Z1 check P2 issue 237: PASS 237
Z1 check P3 issue 238: PASS 238
Z1 check P9 issue 239: PASS 239
Z1 check P12 issue 240: PASS 240
Z1 check P13 issue 241: PASS 241
Z1 check P4 issue 287: PASS 287
Z1 check P5 issue 288: PASS 288
Z1 check P6 issue 289: PASS 289
Z1 check P7 issue 290: PASS 290
Z1 check P8 issue 325: PASS 325
Z1 check P10 issue 326: PASS 326
Z1 check P11 issue 327: PASS 327
Z1 check P14 issue 328: PASS 328
Z1 check P16 issue 354: PASS 354
Z1 check P15 issue 355: PASS 355
Z1 check K1 issue 242: PASS 242
Z1 check K3 issue 243: PASS 243
Z1 check K9 issue 244: PASS 244
Z1 check K10 issue 245: PASS 245
Z1 check K2 issue 291: PASS 291
Z1 check K8 issue 292: PASS 292
Z1 check K4 issue 305: PASS 305
Z1 check K5 issue 306: PASS 306
Z1 check K6 issue 307: PASS 307
Z1 check K7 issue 329: PASS 329
Z1 check K11 issue 350: PASS 350
Z1 check K12 issue 356: PASS 356
Z1 check T1 issue 246: PASS 246
Z1 check T3 issue 247: PASS 247
Z1 check T4 issue 282: PASS 282
Z1 check T2 issue 308: PASS 308
Z1 check T5 issue 333: PASS 333
Z1 check T6 issue 357: PASS 357
Z1 check R1 issue 248: PASS 248
Z1 check R3 issue 249: PASS 249
Z1 check R2 issue 283: PASS 283
Z1 check R5 issue 284: PASS 284
Z1 check R7 issue 285: PASS 285
Z1 check R4 issue 330: PASS 330
Z1 check R6 issue 331: PASS 331
Z1 check R8 issue 332: PASS 332
Z1 check R9 issue 358: PASS 358
Z1 check W1 issue 344: PASS 344
Z1 check W2 issue 345: PASS 345
Z1 check W3 issue 346: PASS 346
Z1 check W4 issue 347: PASS 347
Z1 check W5 issue 348: PASS 348
Z1 check W6 issue 349: PASS 349
Z1 check W7 issue 359: PASS 359
Z1 check F0 issue 225: PASS 225
Z1 check F1 issue 226: PASS 226
Z1 check F2 issue 227: PASS 227
Z1 check S1 issue 228: PASS 228
Z1 check S2 issue 229: PASS 229
Z1 check S3 issue 230: PASS 230
Z1 check S4 issue 231: PASS 231
Z1 check S5 issue 232: PASS 232
Z1 check S6 issue 233: PASS 233
Z1 check D1 issue 234: PASS 234
Z1 check D2 issue 235: PASS 235

Z1 known, outside the goals: 12 failures, 21 errors, eval 4 fails

<!-- Z2 -->

## Z2

Attempt 1, lane z2, 2026-11-09, on origin/main e085c45. Result: BLOCKED by 3 defects (issues 433, 434, 435), each linked under epic 217 to block issue 352. The judgement lines of this attempt are indented below, so the counts of the Green (`^Z2 pair `, `^Z2 shot `) start at 0. The attempt that merges appends the final 44 + 52 lines, unindented, after the defects close.

**Red** (before the journey existed): `npx playwright test tests/e2e/acceptance.goal-loop.spec.ts --project chromium --reporter list`

    Error: No tests found.
    Make sure that arguments are regular expressions matching test files.
    You may need to escape symbols like "$" or "*" and quote the arguments.

**Green** (after the rebase, the same command):

    [acceptance] goal loop 1440 light: acceptance steps: 13
    [acceptance] goal loop 1440 dark: acceptance steps: 13
    [acceptance] goal loop 390 light: acceptance steps: 13
    [acceptance] goal loop 390 dark: acceptance steps: 13
      4 passed (1.1m)

`npm run design:compare`: `84 passed (7.5m)`, `design:compare exit 0`. `design/compare/ds/report.json`: `"pairs": 292`, `"worstRatio": 0.00035`, `"maxRatio": 0.001`. The 44 goal-loop pairs (11 ids and 11 phone ids, 2 themes) are all in it, worst 0.00035, 0 over `maxRatio`.

**Stub check:** the URL of the `scoreboard` step changed to `/scoreboard-x`, one run at 1440 px light: the test fails at step 11, `1440 light: scoreboard`, on the state word: `Error: the word of a cause with no check` ... `getByTestId('score-causes').getByText('No check yet', { exact: true })` `Expected: 1` `Received: 0`. Restored with `git checkout`.

**Ratchet:** journey steps 0 -> 13 (`GOAL_LOOP_STEPS`). Pairs looked at 0 -> 44 (88 images opened with Read). Journey shots looked at 0 -> 52. Open defects: 3 (issues 433, 434, 435), so Z2 does not merge in this attempt.

**Decisions** (standing rules of epic 217):

- The notices banner of spec section 5 ("Notices, holds: `.banner.is-warn`") is the hold banner `banner-hold`: notices have no other view in the app (`web/data/probe.ts` only marks them read). Step 5 `hold-banner` reaches it by the back link from the held run.
- The probe settings item is the editor of the stopped loop of `probe-complete`, opened by its Edit button (step 7). The fields judged: command, claim, release, restart, base port, token budget, lane environment (the rank was dropped, spec decision 54).
- A seed resets the database, so each world opens its first page by URL; every other state of the same world is reached by a click or a tap (run-held, hold-banner, probe-settings, gate-failed).
- The journey runs its own console (`ServerProcess`, the fake `gh`, a temp `CLAUDE_CONFIG_DIR`), as the visual tests of P15, K12, T6, R9 and W7 do; the seeds keep the 24 h server clock move of the probe world.
- Sample data only: on the desktop, the top bar of `probe-*`, `run-held` and `goal-rows` said "Loops 7" in the preview and "Loops 8" or "Loops 10" in the app. The app wins: the preview counts these loops, 12 shots re-shot, recorded in `design/APPROVED.md`. `probe.visual.ts` and `goals.visual.ts` pass on the new shots: `12 passed (47.6s)`.

Judgement of the 44 pairs (preview shot next to `design/compare/ds/shots/`):

    Z2 pair probe-waiting-light: matches (the page); the top bar said Loops 7, the app 8: sample data, preview corrected and re-shot
    Z2 pair probe-waiting-dark: matches (the page); the top bar said Loops 7, the app 8: sample data, preview corrected and re-shot
    Z2 pair probe-held-light: matches (the page); the top bar said Loops 7, the app 8: sample data, preview corrected and re-shot
    Z2 pair probe-held-dark: matches (the page); the top bar said Loops 7, the app 8: sample data, preview corrected and re-shot
    Z2 pair probe-blocked-light: matches (the page); the top bar said Loops 7, the app 8: sample data, preview corrected and re-shot
    Z2 pair probe-blocked-dark: matches (the page); the top bar said Loops 7, the app 8: sample data, preview corrected and re-shot
    Z2 pair probe-complete-light: matches (the page); the top bar said Loops 7, the app 8: sample data, preview corrected and re-shot
    Z2 pair probe-complete-dark: matches (the page); the top bar said Loops 7, the app 8: sample data, preview corrected and re-shot
    Z2 pair run-held-light: matches (the page); the top bar said Loops 7, the app 8: sample data, preview corrected and re-shot
    Z2 pair run-held-dark: matches (the page); the top bar said Loops 7, the app 8: sample data, preview corrected and re-shot
    Z2 pair gate-queue-light: matches
    Z2 pair gate-queue-dark: matches
    Z2 pair gate-failed-light: matches
    Z2 pair gate-failed-dark: matches
    Z2 pair goal-rows-light: matches (the page); the top bar said Loops 7, the app 10: sample data, preview corrected and re-shot
    Z2 pair goal-rows-dark: matches (the page); the top bar said Loops 7, the app 10: sample data, preview corrected and re-shot
    Z2 pair scoreboard-light: matches
    Z2 pair scoreboard-dark: matches
    Z2 pair card-two-way-light: matches
    Z2 pair card-two-way-dark: matches
    Z2 pair card-one-way-light: matches
    Z2 pair card-one-way-dark: matches
    Z2 pair phone-probe-waiting-light: matches
    Z2 pair phone-probe-waiting-dark: matches
    Z2 pair phone-probe-held-light: matches
    Z2 pair phone-probe-held-dark: matches
    Z2 pair phone-probe-blocked-light: matches
    Z2 pair phone-probe-blocked-dark: matches
    Z2 pair phone-probe-complete-light: matches
    Z2 pair phone-probe-complete-dark: matches
    Z2 pair phone-run-held-light: matches
    Z2 pair phone-run-held-dark: matches
    Z2 pair phone-gate-queue-light: matches
    Z2 pair phone-gate-queue-dark: matches
    Z2 pair phone-gate-failed-light: matches
    Z2 pair phone-gate-failed-dark: matches
    Z2 pair phone-goal-rows-light: matches
    Z2 pair phone-goal-rows-dark: matches
    Z2 pair phone-scoreboard-light: matches
    Z2 pair phone-scoreboard-dark: matches
    Z2 pair phone-card-two-way-light: matches
    Z2 pair phone-card-two-way-dark: matches
    Z2 pair phone-card-one-way-light: matches
    Z2 pair phone-card-one-way-dark: matches

Judgement of the 52 journey shots (`reports/acceptance/goal-loop-<width>-<theme>-<nn>-<step>.png`):

    Z2 shot 1440-light-01: matches
    Z2 shot 1440-light-02: matches
    Z2 shot 1440-light-03: matches
    Z2 shot 1440-light-04: matches
    Z2 shot 1440-light-05: matches
    Z2 shot 1440-light-06: matches
    Z2 shot 1440-light-07: the empty Base port and Token budget rows show only a label and a chevron, no "None" (issue 433)
    Z2 shot 1440-light-08: matches
    Z2 shot 1440-light-09: matches
    Z2 shot 1440-light-10: matches
    Z2 shot 1440-light-11: matches
    Z2 shot 1440-light-12: the three earlier cards show a chevron but are not links (issue 435)
    Z2 shot 1440-light-13: the three earlier cards show a chevron but are not links (issue 435)
    Z2 shot 1440-dark-01: matches
    Z2 shot 1440-dark-02: matches
    Z2 shot 1440-dark-03: matches
    Z2 shot 1440-dark-04: matches
    Z2 shot 1440-dark-05: matches
    Z2 shot 1440-dark-06: matches
    Z2 shot 1440-dark-07: the empty Base port and Token budget rows show only a label and a chevron, no "None" (issue 433)
    Z2 shot 1440-dark-08: matches
    Z2 shot 1440-dark-09: matches
    Z2 shot 1440-dark-10: matches
    Z2 shot 1440-dark-11: matches
    Z2 shot 1440-dark-12: the three earlier cards show a chevron but are not links (issue 435)
    Z2 shot 1440-dark-13: the three earlier cards show a chevron but are not links (issue 435)
    Z2 shot 390-light-01: matches
    Z2 shot 390-light-02: matches
    Z2 shot 390-light-03: matches
    Z2 shot 390-light-04: matches
    Z2 shot 390-light-05: matches
    Z2 shot 390-light-06: matches
    Z2 shot 390-light-07: the empty Base port and Token budget rows show only a label and a chevron, no "None" (issue 433); the switch label runs 11 px past the cell padding to the card edge (issue 434)
    Z2 shot 390-light-08: matches
    Z2 shot 390-light-09: matches
    Z2 shot 390-light-10: matches
    Z2 shot 390-light-11: matches
    Z2 shot 390-light-12: the three earlier cards show a chevron but are not links (issue 435)
    Z2 shot 390-light-13: the three earlier cards show a chevron but are not links (issue 435)
    Z2 shot 390-dark-01: matches
    Z2 shot 390-dark-02: matches
    Z2 shot 390-dark-03: matches
    Z2 shot 390-dark-04: matches
    Z2 shot 390-dark-05: matches
    Z2 shot 390-dark-06: matches
    Z2 shot 390-dark-07: the empty Base port and Token budget rows show only a label and a chevron, no "None" (issue 433); the switch label runs 11 px past the cell padding to the card edge (issue 434)
    Z2 shot 390-dark-08: matches
    Z2 shot 390-dark-09: matches
    Z2 shot 390-dark-10: matches
    Z2 shot 390-dark-11: matches
    Z2 shot 390-dark-12: the three earlier cards show a chevron but are not links (issue 435)
    Z2 shot 390-dark-13: the three earlier cards show a chevron but are not links (issue 435)



**Green after the rebase on origin/main f5541b2** (it brought only this log): typecheck exit 0, then the same command:

    [acceptance] goal loop 1440 light: acceptance steps: 13
    [acceptance] goal loop 1440 dark: acceptance steps: 13
    [acceptance] goal loop 390 light: acceptance steps: 13
    [acceptance] goal loop 390 dark: acceptance steps: 13
      4 passed (1.2m)

**Light verify** (no file under `server/` or `web/` changed): design:states, typecheck, arch, ratchets -- --base main, test:unit, test:contract, test:api, api-smoke and build each exit 0.

**Final attempt**, lane z2, 2026-11-10, on origin/main d8a44aa (the fixes of issues 433, 434 and 435 merged as PR 441 and PR 442). The rebase had one conflict, in `design/APPROVED.md` (text, both sections kept). The journey now also asserts the two fixes: the empty Base port and Token budget rows carry the placeholder `editor.noLimit`, and each earlier goal card is a link to `https://github.com/hieplam/<repo>/issues/<n>` with `target="_blank"`.

**Green** (`npm run build`, then the command of Red on the lane database, after Docker Desktop was restarted):

    [acceptance] goal loop 1440 light: acceptance steps: 13
    [acceptance] goal loop 1440 dark: acceptance steps: 13
    [acceptance] goal loop 390 light: acceptance steps: 13
    [acceptance] goal loop 390 dark: acceptance steps: 13
      4 passed (57.3s)

`npm run design:compare`: `84 passed (5.9m)`, exit 0. `design/compare/ds/report.json`: `"pairs": 292`, `"worstRatio": 0.00035`, `"maxRatio": 0.001`. The 44 goal-loop pairs are all in the report, 0 over `maxRatio`, the worst 0.00035. The 8 pairs of the editor states that PR 441 re-shot (`form-edit-running`, `form-conflict`, `form-edit-claude`, `form-duplicate`, light and dark) are at 0.00001 to 0.00002.

**Stub check:** the URL of the `scoreboard` step changed to `/scoreboard-x`, one run at 1440 px light: `1 failed`, at step `1440 light: scoreboard`, `Error: the word of a cause with no check`, `expect(locator).toHaveCount(expected) failed`. Restored with `git checkout`, `git status` clean.

**Judged again** (opened with Read): the probe settings shots 1440-light-07, 1440-dark-07, 390-light-07 and 390-dark-07 (the switch label "Pick the next task with a probe" sits inside its cell; Base port and Token budget show "None" and a chevron, as Time limit does); the same editor in Vietnamese at 390 px light and dark and 1440 px light and dark, from a scratch test that was not committed (the switch label fits; both rows show the Vietnamese placeholder); the goal-card shots 1440-light-12, 1440-dark-13, 390-light-12 and 390-dark-13; the pairs `card-two-way-light` and `phone-card-one-way-dark` (preview and app the same, the earlier cards keep their chevron and draw no other style). The other images did not change since attempt 1: the fixes touched only the editor and the earlier cards, and the compare shows no pair over `maxRatio`.

**Ratchet:** journey steps 0 -> 13. Pairs looked at 0 -> 44. Open defects 3 -> 0 (issues 433, 434 and 435 closed).

**Light verify, not complete** (no file under `server/` or `web/` changed; `grep -rn "acceptance-goal-loop\|acceptance.goal-loop" server web` prints nothing): design:states, typecheck, lang-scan --check-baseline, arch, ratchets -- --base main and rule-lint -- --base main exit 0; test:unit `1348 passed | 3 skipped`; test:contract `274 passed`. test:api ended `44 failed | 302 passed`, all 44 in `tests/api/gate-scope.test.ts` at `git clone` of a local bare repository, with 15 `Worker exited unexpectedly with exit code 3221225794`; then Claude Code stopped the shell because the machine was low on memory. That run is not a result, and api-smoke and build after it did not run.

Final judgement of the 44 pairs:

Z2 pair probe-waiting-light: matches
Z2 pair probe-waiting-dark: matches
Z2 pair probe-held-light: matches
Z2 pair probe-held-dark: matches
Z2 pair probe-blocked-light: matches
Z2 pair probe-blocked-dark: matches
Z2 pair probe-complete-light: matches
Z2 pair probe-complete-dark: matches
Z2 pair run-held-light: matches
Z2 pair run-held-dark: matches
Z2 pair gate-queue-light: matches
Z2 pair gate-queue-dark: matches
Z2 pair gate-failed-light: matches
Z2 pair gate-failed-dark: matches
Z2 pair goal-rows-light: matches
Z2 pair goal-rows-dark: matches
Z2 pair scoreboard-light: matches
Z2 pair scoreboard-dark: matches
Z2 pair card-two-way-light: matches
Z2 pair card-two-way-dark: matches
Z2 pair card-one-way-light: matches
Z2 pair card-one-way-dark: matches
Z2 pair phone-probe-waiting-light: matches
Z2 pair phone-probe-waiting-dark: matches
Z2 pair phone-probe-held-light: matches
Z2 pair phone-probe-held-dark: matches
Z2 pair phone-probe-blocked-light: matches
Z2 pair phone-probe-blocked-dark: matches
Z2 pair phone-probe-complete-light: matches
Z2 pair phone-probe-complete-dark: matches
Z2 pair phone-run-held-light: matches
Z2 pair phone-run-held-dark: matches
Z2 pair phone-gate-queue-light: matches
Z2 pair phone-gate-queue-dark: matches
Z2 pair phone-gate-failed-light: matches
Z2 pair phone-gate-failed-dark: matches
Z2 pair phone-goal-rows-light: matches
Z2 pair phone-goal-rows-dark: matches
Z2 pair phone-scoreboard-light: matches
Z2 pair phone-scoreboard-dark: matches
Z2 pair phone-card-two-way-light: matches
Z2 pair phone-card-two-way-dark: matches
Z2 pair phone-card-one-way-light: matches
Z2 pair phone-card-one-way-dark: matches

Final judgement of the 52 journey shots:

Z2 shot 1440-light-01: matches
Z2 shot 1440-light-02: matches
Z2 shot 1440-light-03: matches
Z2 shot 1440-light-04: matches
Z2 shot 1440-light-05: matches
Z2 shot 1440-light-06: matches
Z2 shot 1440-light-07: matches
Z2 shot 1440-light-08: matches
Z2 shot 1440-light-09: matches
Z2 shot 1440-light-10: matches
Z2 shot 1440-light-11: matches
Z2 shot 1440-light-12: matches
Z2 shot 1440-light-13: matches
Z2 shot 1440-dark-01: matches
Z2 shot 1440-dark-02: matches
Z2 shot 1440-dark-03: matches
Z2 shot 1440-dark-04: matches
Z2 shot 1440-dark-05: matches
Z2 shot 1440-dark-06: matches
Z2 shot 1440-dark-07: matches
Z2 shot 1440-dark-08: matches
Z2 shot 1440-dark-09: matches
Z2 shot 1440-dark-10: matches
Z2 shot 1440-dark-11: matches
Z2 shot 1440-dark-12: matches
Z2 shot 1440-dark-13: matches
Z2 shot 390-light-01: matches
Z2 shot 390-light-02: matches
Z2 shot 390-light-03: matches
Z2 shot 390-light-04: matches
Z2 shot 390-light-05: matches
Z2 shot 390-light-06: matches
Z2 shot 390-light-07: matches
Z2 shot 390-light-08: matches
Z2 shot 390-light-09: matches
Z2 shot 390-light-10: matches
Z2 shot 390-light-11: matches
Z2 shot 390-light-12: matches
Z2 shot 390-light-13: matches
Z2 shot 390-dark-01: matches
Z2 shot 390-dark-02: matches
Z2 shot 390-dark-03: matches
Z2 shot 390-dark-04: matches
Z2 shot 390-dark-05: matches
Z2 shot 390-dark-06: matches
Z2 shot 390-dark-07: matches
Z2 shot 390-dark-08: matches
Z2 shot 390-dark-09: matches
Z2 shot 390-dark-10: matches
Z2 shot 390-dark-11: matches
Z2 shot 390-dark-12: matches
Z2 shot 390-dark-13: matches

<!-- 373 -->

## 373

Goal: G4. A run that ends with `PR_OPEN` and a pull request that does not exist releases its claim, not excused. A `gh` failure keeps the retry of 60 s.

- Real text, from `gh pr view 999999` on the real repository: `GraphQL: Could not resolve to a PullRequest with the number of 999999. (repository.pullRequest)`, exit 1. `tests/support/fake-gh.mjs` prints the same text.
- Red: the new test `queue says the pull request does not exist` fails with `report.errors` holding `Pull request 9 does not exist`, and the row open after three ticks. `pullRequest tells a pull request that does not exist from a gh failure` fails with `expected GitHostError ... to be an instance of PullRequestNotFoundError`.
- Green: `npx vitest run server/services/gate-handover.test.ts server/adapters/github/gh-git-host.test.ts` prints `Tests  36 passed (36)`. The test `queue throws` is in that run.
- Stub check: every throw of `queue` treated as "not found" fails `queue throws: the row stays open ...` and `queue fails with a gh failure ...` (`Tests  2 failed | 15 passed (17)`). Restored, all pass.
- Full `npm run verify` after the last rebase, in slot-1: exit 0 (`VERIFY EXIT 0`).
- Ratchet, `e2e expects` of `npm run ratchets`: 885 before, 885 after. This change adds no e2e expect.

<!-- 362 -->

## 362

Goal: a tap on a tab opens that tab on the iPhone stand-in, every time, also when a modifier key is held on the test machine.

- Cause, from the trace of lane P8: the tap hit the link, then `BrowserContext.page` opened a second page at `/`, and the first page kept its URL. The click was not handled by react-router: `shouldProcessLinkClick` refuses a click with Shift or Control, so WebKit opened the link itself. The failure was in step `loops-list`, on the back link, with `lang="en"`, so a language change is not the cause.
- Not verified: the source of the modifier. `WebCore.dll` imports `GetKeyState` and `GetAsyncKeyState`, and a game ran on the machine during the failures. No real key was injected, because it would reach that game. The trace of lane R4 no longer exists, so its failure is matched by symptom only.
- Red, natural: not reproduced. 400 tab taps with the resize of a journey step: `RATE rounds=400 failures=0`. The unchanged spec: `20 passed (7.2m)`.
- Red, forced: a real Shift click and a real Control click on `tab-repos` left the URL and gave `pages 2`, with `"prevented":false`. With the fix removed the spec prints `Expected pattern: /\/repos$/`, `Received string:  "http://192.168.100.25:56962/"`, `1 failed`.
- Green (after the rebase): `npx playwright test --project=iphone-lan tests/e2e/acceptance.iphone.spec.ts --repeat-each 10` prints `20 passed (7.2m)`.
- Stub check: `ignoreHostKeys` removed is the forced Red above. Restored, `1 passed (27.0s)`.
- Ratchet, `e2e expects` of `npm run ratchets`: 878 before, 881 after. `e2eExpectsMin` stays 745.

<!-- 271 -->

## 271

Goal: a test that starts a real process does not fail on the 5 s limit under load.

- Red (setting absent, machine at about 99 % CPU, no extra load needed): `npx vitest run --project unit tests/tools/lang-scan.test.ts` printed `Test timed out in 5000ms.` twice and `Tests  2 failed | 44 passed (46)`.
- Green (`testTimeout: 30_000` on the unit project, same command, same load): `Test Files  1 passed (1)`, `Tests  46 passed (46)`.
- Stub check: the setting removed is the Red run above; the time-out returns.
- Ratchet, false time-out failures in the file under load: 2 before, 0 after.  `npm run test:unit`: `Test Files  53 passed | 1 skipped (54)`, `Tests  587 passed | 2 skipped (589)`. No assertion changed, no retry added.

## 303

Goal: G13, a failing pass opens an issue on a repository that has no `standing-goal` label.

- Red (the fake `gh` refuses an unknown label on `issue create`, as the real one does; no fix yet): `npx vitest run --project api tests/api/standing-goals.test.ts` printed `Tests  9 failed | 1 passed (10)`, each failure a `GitHostError: gh issue create failed: exit 1` from `GhGitHost.openIssue`.
- Green (new `GitHost.ensureLabel`, `gh label create --force`, called before `openIssue`; same command): `Tests  11 passed (11)`.
- Stub check: the service change stashed, the same command printed `Tests  10 failed | 1 passed (11)`. Restored, 11 passed again.
- Ratchet, tests of the standing-goal file that refuse on a missing label: 9 failed before the fix, 0 after. Other suites that used labels (`tests/tools/fake-gh.test.ts`, `server/adapters/github/gh-git-host.test.ts`) now seed their labels; `npx vitest run --project unit server/adapters/github tests/tools` printed `Tests  249 passed (249)`.

## 310

Goal: G7, a gate line with double quotes runs exactly as written, on Windows and on Linux.

- Red (two new tests, no fix yet): `npx vitest run --project unit server/adapters/git/git-gate-workspace.test.ts` printed `Tests  2 failed | 20 passed (22)`. The quoted line gave empty stdout, not `2`, and `node -e "process.exit(3)"` gave `expected +0 to be 3`. So a failing line exited 0.
- Green (`windowsVerbatimArguments` on `CommandRequest`, set by `GitGateWorkspace.run`; `shellArgv` puts the line in one outer pair of quotes on `win32`): the same file with `shared/domain/gate-commands.test.ts` and `server/adapters/process/node-command-runner.test.ts` printed `Test Files  3 passed (3)`, `Tests  41 passed (41)`.
- Stub check: the option removed from `GitGateWorkspace.run`, the two tests printed `expected 1 to be +0`, `expected 1 to be 3`, and `Tests  2 failed | 20 skipped (22)`. Restored.
- Ratchet, passing unit tests: 973 before, 975 after (2 skipped in both). The expected value of the `shellArgv` win32 test changed with the contract in decision 31.
- Light verify, in order, exit 0: `arch` printed `dependency-cruiser: 0 violations`; `test:unit` printed `Test Files  75 passed | 1 skipped (76)`, `Tests  975 passed | 2 skipped (977)`; `test:contract` printed `Tests  200 passed (200)`; `test:api` printed `Tests  159 passed (159)`.

<!-- 339 -->

## 339

Goal: G9, a ratification that a run makes through a script file cannot stay unseen.

- Red: with the gate change stashed, the new gate test printed `"description": "gate: every step passed"` where `gate: ratified <time>` was expected. With the audit unchanged, `npx vitest run --project unit tests/tools/merge-audit.test.ts` printed `Tests  4 failed | 6 passed (10)`.
- Green (after the rebase): the same command with `server/services/gate-service.test.ts` prints `Test Files  2 passed (2)`, `Tests  46 passed (46)`. A world with a ratified merge prints one `ratified` entry with the PR number and the time, a world with none prints `[]`, exit code 0 in both.
- Stub check: the gate change stashed fails the ratified-status test (Red above). An audit that always gives `[]` fails the test that expects `{ pr: 2, at }`.
- Ratchet, tests in `tests/tools/merge-audit.test.ts`: 7 before, 10 after.
- Full `npm run verify` in slot-1: exit 0, `UCs with a green e2e: 35/35`.

<!-- 377 -->
## 377

- Goal: the UC-23 test gives the same result for each timing of the minute mark.
- Red: the clock pinned to the 56th second of a minute, a 4.5 s read delay before the poll, the test otherwise unchanged. Output: `Expected: 2` and `Received: 3`, `1 failed`.
- Green: `npx playwright test tests/e2e/repo.spec.ts -g "UC-23" --workers 1 --repeat-each 5` passed twice in a row, `5 passed` each time.
- Stub check: the fix pinned to the 56th second, with the same read delay, fails again with `Expected: 2` and `Received: 3`.
- Ratchet: UC-23 failures under the late-read condition, 1 before, 0 after. UC-11 is not changed: a measurement of 386 TCP connections showed no leak.

## 387

Issue 387, the gate-scope failure in a full verify.

Cause of the mass failure (measured): Storage Sense removes an empty folder in the user temp folder at any age when free disk space is low. `StoragePoliciesLastTrigger` read 2026-11-02 08:54:20 local time. Run 2 of the repeat loop started at 08:52:59 and lost `TEST_REPO_DIR` (`lc-api-repo-*`, an empty folder) in that minute.

Cause of the first failure (one case, state `failed` at `scope`): not verified. Removal of each empty folder of a fresh bare repository and clone did not break `git fetch` (exit 0). After `pack-refs --all` it did: `does not appear to be a git repository`, exit 128. A world in a test does not pack its refs. The text of that failure was not kept. `expectRefused` now prints the last step, so a next failure names it.

- Goal: the 37 guarded-path cases give the same result on a loaded machine, also when the temp cleaner runs.
- Red (old code, a lane folder as `TEMP`, a script that removes each empty folder in it from second 45 on): `injected: removed lc-api-repo-*`, `injected: removed lc-gate-root-*`, `Error: POST /api/repos -> 400 ... No such folder`, `Tests  38 failed | 5 passed (43)`, exit 1.
- Green (same injection and same `TEMP`, new code): `Tests  43 passed (43)`, exit 0, 0 lines from the injection, because `os.tmpdir()` is not in that folder. Two more runs after `goals/gate.json` gained one guarded path: `Tests  44 passed (44)`, exit 0, 278 s and 285 s. Load in all three: both heavy slots held by other lanes.
- Stub check: `useTestTemp()` removed from `vitest.config.ts`, `TEMP` on the lane folder: `Tests  1 failed | 3 passed (4)` in `tests/tools/test-temp.test.ts`, with `Received` the lane folder. Restored: `Tests  4 passed (4)`.
- Ratchet: failures of this file caused by the temp cleaner under the injection, 38 before, 0 after. The issue's number, flaky failures of the file in a full verify, was 1 before, and the coordinator reads the after value from its next verifies.

## 385
- Goal: a proposed goal card whose issue a person closed, or took the label from, becomes `refused` in the same tick, and the next open card gets a row in that tick. A row that moved this way never starts.
- Red: `npx vitest run --project unit server/services/goal-card-service.test.ts` with the old service: `Tests  3 failed | 8 passed (11)`. The failures were the closed-card test, the second-row test, and the never-starts test.
- Green: the same command after the change: `Tests  11 passed (11)`. Both files together: `Tests  32 passed (32)`. `npx vitest run --project api tests/api/goal-cards.test.ts`: `Tests  17 passed (17)`.
- Stub check: the service file restored from `origin/main` (rows stay `proposed`): `Tests  5 failed | 6 passed (11)`. The five are the changed closed-card test and four new tests. Restored: 11 passed.
- Decisions: the service does not comment on or close the issue (a person already closed it, and an open issue that only lost its label stays as it is). `issuesWithLabel` now throws a `GitHostError` when it gives 200 issues (the `--limit`), so a cut-off list never frees a row. A failed `gh` call already throws, so no row changes (test `a read that fails changes no row`).
- Ratchet: unit tests in the two files, 26 before, 32 after (goal-card-service 6 to 11, gh-git-host 20 to 21).

## 391

Goal row: G6 and G9. Two services that fetch one repository at the same time both succeed.

- Cause (proved in the issue): `GateService` and `GoalCardService` share one `GitGateWorkspace` (one instance in `server/compose.ts`). The ticker runs both at once, and `fetch` and `fetchMain` write the same ref `refs/remotes/origin/main`.
- Fix: a private serial queue for each repository folder (`#serial` in `server/adapters/git/git-gate-workspace.ts`). `fetch` and `fetchMain` run their whole body, `rev-parse` calls included, in it. A failed call does not stop the next call. The map entry goes away when the queue is empty. No retry, no catch of `cannot lock ref`, no sleep.
- Red (old code, `npx vitest run server/adapters/git/git-gate-workspace.test.ts`): 2 failed, 25 passed.
  - `GateWorkspaceError: git fetch failed: error: cannot lock ref 'refs/remotes/origin/main': is at 49e50ed... but expected a4df4c9...` (real git, 12 rounds with `main` moved before each round).
  - `AssertionError: expected 3 to be 1` (fake runner: three fetches of one folder overlapped).
- Green (with the fix): same file, `Tests  27 passed (27)`. `npx vitest run --project api tests/api/gate-scope.test.ts`: `Tests  44 passed (44)`.
- Stub check: `#serial` made to call `fn()` directly: the same 2 tests fail (`2 failed | 25 passed`). Restored afterwards.
- Ratchet: failures of `gate-scope` in full verify runs, 3 of the last 4 before, 0 after in the focused run (the full-verify count is for the coordinator to confirm).

## 401

The folder picker test drew its `show hidden` switch only when the opened folder held a hidden entry. The picker opens at the parent of the test repository, and since PR 388 that parent (`castraferrum-test-temp`) holds none. The test now makes one entry `.lc-picker-hidden` there before the page opens (the server counts a name that starts with a dot as hidden on every system, `node-folder-browser.ts`) and removes it in `finally`. No picker, server or `test-temp.ts` change.

**Red**, on main (from the evidence of the issue, and the focused run on the branch of P15): `folder-show-hidden: not rendered`, on `chromium` and `webkit-phone`.

**Green**:

    $ npx playwright test tests/e2e/phone.spec.ts -g "folder picker" --reporter list
      2 passed (8.7s)                 (chromium and webkit-phone)

The test also asserts that the switch is visible, so it states its own precondition.

**Stub check**: the line that makes the entry removed, then restored:

    expect(locator).toBeVisible() failed ... getByTestId('folder-show-hidden') ... Timeout: 5000ms
      2 failed (chromium and webkit-phone)

**Light verify** (a change in one test file): `npm run typecheck` clean, `node scripts/lang-scan.mjs --check-baseline` `baseline check: ok`.

## 398

- Goal: G6, G9, G18. A pull request from a fork never runs a step of its code and never merges. A stranger's text steers nothing.
- Red (before the code, `npx vitest run server/adapters/github/gh-git-host.test.ts tests/tools/goal-writer-probe.test.ts`): `Tests  12 failed | 35 passed (47)`. The failures: `pullRequest` gave no `fromFork`; seven `loopComments drops a loop-release comment of a stranger (association NONE ... undefined)` tests received the comment; the stranger probe tests gave `skip`.
- Green: `npx vitest run tests/tools/test-addresses.test.ts tests/api/gate-fork.test.ts tests/api/process-signals-api.test.ts --project api --project unit`: `Tests  13 passed (13)`. The fork PR ends `failed` at `scope` with the reason `a pull request from a fork needs a person`, the step rows hold only `scope`, 0 merge calls, `main` unchanged, and `POST /api/gate/jobs/:id/ratify` answers 409 `GATE_JOB_NOT_RATIFIABLE`. The control (`isCrossRepository` false) merges.
- Stub check: the fork refusal, the association filter and the author filter were each removed in one run: `Tests  11 failed | 38 passed (49)`. After the restore: `Tests  49 passed (49)`.
- Ratchet: tests of outside input, 0 before, 19 after (2 fork API, 1 host fork, 10 loopComments cases, 4 probe, 2 addresses).
- Decisions: `GOAL_CARD` and `issuesWithLabel` need no change, because `goal-card` is a label and setting a label needs triage rights. `GateService.queue` still keeps the job, so the refusal has a record. The fake `gh` gives `OWNER` to a comment made with `issue comment` and the owner of `-R` to an issue made with `issue create`; a seeded comment or issue with none is read as a stranger's.

## 395

Goal row: G6. A background git call that needs a login fails at once and opens no window.

- Fix: `GitGateWorkspace.git()` (the one private method that builds each git call) passes `NO_LOGIN_PROMPT_ENV` from `server/adapters/process/no-login-prompt.ts`: `GIT_TERMINAL_PROMPT=0`, `GCM_INTERACTIVE=never`, `GH_PROMPT_DISABLED=1`. No `credential.helper` is unset, so a stored login still works. `GhGitHost.gh()` passes the same env. `windowsHide` and the retry rules are unchanged.
- Other `git` or `gh` runs found in `server/`: `scoreboard-service` runs `git log` (local only, no network, no login). `command-claim-gateway`, `hold-service`, `probe-service`, `standing-goal-service` and the gate `checkCommand` run commands that the repository owner configured, not git or gh calls of the console. They are left unchanged.
- Red (old `git-gate-workspace.ts`, new tests): `2 failed | 27 passed`. The env test fails because the git call has no `GIT_TERMINAL_PROMPT`. The real-git test (a local HTTP server that answers 401) hangs until the 60 s test limit, and a `git-credential-manager get` process stays alive.
- Green: `git-gate-workspace.test.ts` and `server/adapters/github`: `Tests  61 passed (61)`. `tests/api/gate-scope.test.ts` and `gate-fork.test.ts`: `Tests  46 passed (46)`. `tests/tools`: `Tests  290 passed (290)`. `rule-lint: ok`. After the runs, `Get-Process git-credential-manager` shows 0 processes.
- Stub check: the Red run is the stub check. It used the file with no env, and both new tests failed.
- Ratchet: `git-credential-manager` windows during test runs: 1 left running after the Red run, 0 after Green. The count of 9 for `gate.visual.ts` and `gate-pages.spec.ts` is not measured here (CI stands in for the e2e run).
- Follow-up (gaps found by the coordinator): the env test now uses `toEqual` with all three values for every git call (it also checks that `fetch`, `ls-tree`, `merge-base` and `worktree` calls were seen), and `gh-git-host.test.ts` has a test for the env of a `gh` call. Mutation run with the `GCM_INTERACTIVE` line removed from `no-login-prompt.ts`: `Tests  3 failed | 59 passed (62)`. The run started Git Credential Manager, so the owner stopped any further mutation. The mutation that removes the env from `gh-git-host.ts` was started and stopped before it ended: it has no result. Green before the mutations: `Tests  62 passed (62)`. `npm run test:api` did not run.
