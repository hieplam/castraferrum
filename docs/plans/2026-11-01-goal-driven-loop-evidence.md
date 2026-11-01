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

<!-- D2 -->

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

    before: memory: 50 passed � postgres: 50 passed
    after:  memory: 56 passed � postgres: 56 passed

Verify: `npm run verify` exit 0 (unit 595 passed, contract 126, 115 e2e passed, `phone overflow: 0/12`, `UCs with a green e2e: 33/33`).

<!-- P4 -->

<!-- P5 -->

<!-- P6 -->

<!-- P7 -->

<!-- P8 -->

<!-- P9 -->

<!-- P10 -->

<!-- P11 -->

<!-- P12 -->

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

<!-- K3 -->

<!-- K4 -->

<!-- K5 -->

<!-- K6 -->

<!-- K7 -->

<!-- K8 -->

<!-- K9 -->

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

<!-- T5 -->

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

<!-- R1 verify -->

<!-- R2 -->

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

<!-- R6 -->

<!-- R7 -->

<!-- R8 -->

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
