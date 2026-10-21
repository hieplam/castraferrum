# ADR 0001: a fresh Claude Code session for every tick

- Status: accepted

## Context

A loop fires many times, possibly for days. Two designs are possible: keep one long agent conversation and send
it a message on every tick, or start a new session on every tick. A long session grows its context until it is
slow, expensive and eventually lossy; a loop has no human around to compact it. It is also hard to tell where
one firing ends and the next begins.

## Decision

Every tick starts one new Claude Code session through the Agent SDK `query()`, in the loop's repository, with
the loop's prompt. The session is a run: it has its own session id, cost, summary and transcript. Anything the
next run needs must live in the repository or in the agent's own notes, not in a remembered conversation.

Consequences that shape the rest of the design:

- Every run stores its `session_id`, so `claude --resume <id>` in the repo reopens exactly that run.
- A run ends when Claude Code itself exits, not at the first `result` message, because a turn that only starts a
  background command is not the end of the work.
- The console tells the agent only about lifecycle (a stopped background task, "this is your last turn"). It
  never interprets or steers the agent's work.
- The transcript is Claude Code's own file, read on demand. The console keeps no copy and no path in its
  database.

## Alternatives considered

- One persistent session per loop: rejected for context growth and unclear run boundaries.
- A queue of prompts into a worker pool: rejected as unnecessary for one process (see the architecture decisions).
