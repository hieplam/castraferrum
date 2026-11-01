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

<!-- P11 -->

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

<!-- P14 -->

<!-- P15 -->

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

<!-- K7 -->

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

<!-- K11 -->

<!-- K12 -->

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

<!-- T3 -->

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

<!-- W1 -->

<!-- W2 -->

<!-- W3 -->

<!-- W4 -->

<!-- W5 -->

<!-- W6 -->

<!-- W7 -->

<!-- Z1 -->

<!-- Z2 -->


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
