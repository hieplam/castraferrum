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
};

export type ExecutionEvent =
  /**
   * A Claude session was just created (Mock: `mock-<uuid>`). Exactly once, before every other event — except a run that fails before the agent
   * starts (Claude: repo does not exist): then there is only an error `log` + a failed `result`, no session.
   */
  | { type: 'session'; sessionId: string }
  | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string; data?: unknown }
  /** Exactly once, as the final event. `costUsd`: estimated cost reported by the SDK (Claude); Mock has none. `end`: the run-end signal of a success. */
  | { type: 'result'; outcome: 'succeeded' | 'failed'; summary?: string; error?: string; costUsd?: number; end?: RunEnd };

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
   * `session` → 0..n `log` → `result`, or throws while iterating (never synchronously). When `signal` aborts, the iterable ends
   * within `cancelWithinMs` and emits no `result` afterwards. Does not touch the DB and does not know the service.
   */
  execute(input: ExecutionInput, signal: AbortSignal): AsyncIterable<ExecutionEvent>;
}

export interface ExecutorRegistry {
  /** `null` = no executor of this kind. */
  find(kind: string): LoopExecutor | null;
  list(): ExecutorDescriptor[];
}
