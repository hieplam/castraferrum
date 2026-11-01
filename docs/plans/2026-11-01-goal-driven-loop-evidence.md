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

<!-- F2 -->

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

<!-- S5 -->

<!-- S6 -->

<!-- D1 -->

<!-- D2 -->

<!-- P1 -->

<!-- P2 -->

<!-- P3 -->

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

<!-- T2 -->

<!-- T3 -->

<!-- T4 -->

<!-- T5 -->

<!-- T6 -->

<!-- R1 -->

<!-- R2 -->

<!-- R3 -->

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

