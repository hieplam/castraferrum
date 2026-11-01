# Plan index: the console runs a goal to done with no owner stop

Spec: [../specs/2026-11-01-goal-driven-loop.md](../specs/2026-11-01-goal-driven-loop.md).
Epic: [castraferrum#217](https://github.com/hieplam/castraferrum/issues/217).

## How to read this plan

- This file is an index. The spec holds the goal rows, the contracts, the module map and the task graph. Read the spec first.
- The work is in one plan file per phase, listed below. Each task is one section, headed `## <ID> - <title>`, with the IDs of
  the task graph in section 4 of the spec.
- Each section lists the files it touches, its steps, and a full Verify block: Goal, Red, Green, Stub check, Ratchet.
- **The plan file wins over a copy in an issue.** An issue holds a copy of its section. If they differ, follow the plan file on
  `main` and record the difference in the PR.
- The spec wins over a plan file on a contract. A change to a contract is a PR to the spec first.
- Each task records its evidence in the evidence log below, in one `## <task id>` section.
- The lane rules for parallel work apply to every task. The coordinator merges, and a task stops at an open PR with green CI.
- A task in `agent-plugins` has no CI. Its proof is `node --test` plus the eval that its section names.

## Evidence log

`docs/plans/2026-11-01-goal-driven-loop-evidence.md`

## Phase plans

The next stage writes these files. They do not exist yet.

| Phase | Tasks | Plan file |
|---|---|---|
| Foundation: baselines, spikes, design, verify, acceptance | F0-F2, S1-S6, D1, D2, Z1, Z2 | `docs/plans/2026-11-01-goal-driven-loop-foundation.md` |
| Issue 212: probe, claim, hold, resume | P1-P15 | `docs/plans/2026-11-01-goal-driven-loop-probe.md` |
| Issue 213: gate | K1-K12 | `docs/plans/2026-11-01-goal-driven-loop-gate.md` |
| Issue 214: goal check | T1-T6 | `docs/plans/2026-11-01-goal-driven-loop-goal-check.md` |
| Issue 215: process review | R1-R9 | `docs/plans/2026-11-01-goal-driven-loop-process-review.md` |
| Issue 216: goal writer | W1-W7 | `docs/plans/2026-11-01-goal-driven-loop-goal-writer.md` |
