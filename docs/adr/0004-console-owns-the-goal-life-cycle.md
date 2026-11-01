# ADR 0004: the console owns the life cycle of a goal, not the work

- Status: accepted

## Context

A loop on a cron schedule starts a session at each mark, also when nothing is ready to do. The goal-driven loop
([spec](../specs/2026-11-01-goal-driven-loop.md)) needs a run only when a task is ready, and it needs to know
when a goal is met or waits for something. A loop's own tools know these facts. The question is where this
knowledge goes without turning the console into a planner.

## Decision

The console owns the life cycle of a goal. The work stays with the loop.

- A loop can have a probe: a command that the loop owns, stored as an argv array in `loop_probes`, with no shell.
  The console calls it every 60 seconds, and on the first tick after a run of the loop ends.
- The console reads one word, `action`, from the last line of the probe. It treats the other fields of that line
  as opaque values, and it reads no meaning from a task key.
- Start of a probe loop gives `next_run_at` null and no first run. So only the probe can lead to a session, and
  `findDue` skips the loop without new code. A loop with no probe behaves exactly as before.
- A probe has a limit of 30 seconds, and the command runner kills a hung probe with its whole process tree. The
  tick calls the due probes at the same time and catches each loop alone. Each background service has its own
  in-flight promise. So a hung probe cannot stop the console, the schedule tick or another loop.
- A bad exit, a time-out or a bad line gives the state `probe_failed` and no session.

ADR 0001 holds. Each task gets a fresh session, and a resume continues the same run. The console only reads words
from a loop-owned command and sends lifecycle lines. It never interprets or steers the agent's work.

## Alternatives considered

- Columns on `loops`: rejected. `version` must change only on a configuration edit, and a probe writes every 60
  seconds. So a separate table holds the probe.
- A session that decides what to do next: rejected. Each decision costs a session, and a console that has a model
  in its own loop steers the work, against ADR 0001.
- A probe that the console runs through a shell: rejected. A stored argv array has no quoting rules that differ
  between machines.
