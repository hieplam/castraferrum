import type { ZodType } from 'zod';
import type { RunEnd } from '../../shared/domain/run-end';

// Executor contract (ARCHITECTURE.md § Interface): phase 1 = Mock, phase 2 = Claude Agent SDK, same interface.
// Every implementation must pass tests/contract/executor.contract.ts.

export type ExecutionInput = {
  runId: string;
  loopId: string;
  executionId: string;
  /** Iteration #N. */
  iteration: number;
  /** Snapshot of the prompt when the run started. */
  prompt: string;
  /** Snapshot of the executor config (already through `configSchema`). */
  config: unknown;
  /**
   * Working directory of the run = the loop's repo path, captured when the run starts (SPEC-phase-2 § Architecture). Mock ignores it;
   * Claude runs its session in exactly this folder. Required since phase 2: RunService always passes the repo's `path`. If the folder
   * was deleted / renamed after registration → an executor that needs the folder returns `failed` "Repo does not exist: <path>".
   */
  cwd: string;
  /**
   * Extra env of the run (the lane env of a claimed run, spec 2.7). The executor spreads it over its base env, then drops
   * `ANTHROPIC_API_KEY`, so an env here cannot put the key back. Absent for a run with no probe.
   */
  env?: Record<string, string>;
  /** Continue this session instead of opening a new one (spec 2.5). `prompt` is the head message. The session id stays the same. */
  resumeSessionId?: string;
  /**
   * Refuse a merge command in this run (spec 2.15, decision 29). The Claude executor then adds a `PreToolUse` hook that calls `checkMergeCommand`, and with
   * `false` or absent it adds no hook, so a run works as before. Mock ignores it. The run service sets it for a gated repository (K7).
   */
  gateGuard?: boolean;
  /**
   * The tool profile (decision 49). With `review` the Claude executor lets the run use only `REVIEW_TOOLS`, and adds a `PreToolUse` hook that refuses every call
   * outside `reports/process-review/` and every command that is not one of the three review scripts. With `full` or absent it adds no `tools` key and no
   * review hook, so a run works as before. Mock ignores it. The run service sets it from `CASTRAFERRUM_TOOL_PROFILE` in the lane env.
   */
  toolProfile?: 'full' | 'review';
};

export type ExecutionEvent =
  /**
   * A Claude session was just created (Mock: `mock-<uuid>`). Exactly once, before every other event — except a run that fails before the agent
   * starts (Claude: repo does not exist): then there is only an error `log` + a failed `result`, no session.
   */
  | { type: 'session'; sessionId: string }
  | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string; data?: unknown }
  /** Exactly once, as the final event, unless the run ends at a usage limit. `costUsd`: estimated cost reported by the SDK (Claude); Mock has none. `end`: the run-end signal of a success. */
  | { type: 'result'; outcome: 'succeeded' | 'failed'; summary?: string; error?: string; costUsd?: number; end?: RunEnd }
  /**
   * The final event in place of `result` when the account hit a usage limit (spec 2.5). `resetsAt` and `limitType` are `null` when not known. `costUsd` is
   * the cumulative cost of the session, so it replaces a stored cost and is never added. A limit before any message with an id has no `session` event.
   */
  | { type: 'usage_limit'; resetsAt: Date | null; limitType: string | null; message: string; costUsd?: number };

export type ExecutorDescriptor = {
  kind: string;
  /** Display label (the UI translates by `kind`; the label is only a fallback). */
  label: string;
  /** Config schema: the service validates + fills defaults; the UI builds its form from this. */
  configSchema: ZodType;
  /** After the signal aborts, the iterable must end within this time (Mock: 1 000 ms). */
  cancelWithinMs: number;
};

export interface LoopExecutor {
  readonly kind: string;
  describe(): ExecutorDescriptor;
  /**
   * `session` → 0..n `log` → `result` or `usage_limit`, or throws while iterating (never synchronously). When `signal` aborts, the iterable ends
   * within `cancelWithinMs` and emits no final event afterwards. Does not touch the DB and does not know the service.
   */
  execute(input: ExecutionInput, signal: AbortSignal): AsyncIterable<ExecutionEvent>;
}

export interface ExecutorRegistry {
  /** `null` = no executor of this kind. */
  find(kind: string): LoopExecutor | null;
  list(): ExecutorDescriptor[];
}
