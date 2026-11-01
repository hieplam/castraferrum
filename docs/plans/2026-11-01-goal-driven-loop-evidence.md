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

<!-- S2 -->

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

