import type { ExecutionStats, FinishStatus, RunStatus, RunTrigger } from '../../shared/domain/run';
import type { Page, PageRequest } from './page';

export type RunRecord = {
  id: string;
  loopId: string;
  executionId: string;
  /** Iteration #N; null for a skipped run. */
  iteration: number | null;
  trigger: RunTrigger;
  status: RunStatus;
  skipReason: string | null;
  scheduledFor: Date | null;
  startedAt: Date;
  deadlineAt: Date | null;
  finishedAt: Date | null;
  durationMs: number | null;
  promptSnapshot: string;
  executorKind: string;
  executorConfig: unknown;
  summary: string | null;
  error: string | null;
  costUsd: number | null;
  sessionId: string | null;
};

/** Snapshot of the prompt + executor at run time: editing the loop later does not change history. `id` is issued by the service. */
export type StartRunInput = {
  id: string;
  loopId: string;
  executionId: string;
  trigger: RunTrigger;
  scheduledFor: Date | null;
  startedAt: Date;
  /** `null` = the loop has no time limit — the run never becomes `timed_out` (UC-24). */
  deadlineAt: Date | null;
  promptSnapshot: string;
  executorKind: string;
  executorConfig: unknown;
};

export type SkippedRunInput = {
  id: string;
  loopId: string;
  executionId: string;
  scheduledFor: Date | null;
  at: Date;
  skipReason: string;
  promptSnapshot: string;
  executorKind: string;
  executorConfig: unknown;
};

export type RunOutcome = {
  status: FinishStatus;
  finishedAt: Date;
  summary?: string | null;
  error?: string | null;
  costUsd?: number | null;
};

export type RunOverviewCounts = { running: number; startedSince: number; failedSince: number };

/** `busy`: the loop already has `limit` (= `loops.max_concurrent` at that moment) `running` runs — `active` is those runs, oldest first. */
export type StartResult = { kind: 'started'; run: RunRecord } | { kind: 'busy'; active: RunRecord[]; limit: number };

export interface RunRepository {
  /**
   * One transaction: loops.run_counter + 1 → insert a `running` run with the iteration just issued. If the loop already has `max_concurrent` `running`
   * runs (trigger `runs_max_concurrent_per_loop`) → rollback, the counter does not advance, returns `busy` with the running runs.
   */
  start(input: StartRunInput): Promise<StartResult>;
  /** A `skipped` run: no iteration number, no counter increment, finishes immediately. */
  recordSkipped(input: SkippedRunInput): Promise<RunRecord>;
  setSession(id: string, sessionId: string): Promise<void>;
  /** Only a `running` run changes; a finished run keeps its first outcome (first to arrive wins). Throws `RUN_NOT_FOUND`. */
  finish(id: string, outcome: RunOutcome): Promise<RunRecord>;
  /** Oldest first (started_at ascending). */
  listByExecution(executionId: string): Promise<RunRecord[]>;
  findById(id: string): Promise<RunRecord | null>;
  /** Every `running` run of the loop, oldest first (started_at ascending) — at most `max_concurrent`, or more right after N is lowered. */
  listActive(loopId: string): Promise<RunRecord[]>;
  /** Running and deadline_at <= now; earliest deadline first. */
  findOverdue(now: Date): Promise<RunRecord[]>;
  /** Newest first (started_at descending). */
  listByLoop(loopId: string, page: PageRequest): Promise<Page<RunRecord>>;
  /** Per-execution figures; an id that does not exist is absent from the Map. */
  statsByExecution(executionIds: string[], now: Date): Promise<Map<string, ExecutionStats>>;
  /**
   * Overview bar (UC-03), counted over ALL loops: runs currently running; runs that started (excluding `skipped`) since `startedFrom`
   * ("today"); failed runs (failed + timed_out + interrupted) that finished since `failedFrom` ("24 hours").
   */
  countOverview(startedFrom: Date, failedFrom: Date): Promise<RunOverviewCounts>;
  /**
   * Recovery: every `running` run → `interrupted`, finished_at = now (the restart time). Duration is computed up to `aliveUntil`
   * (the last heartbeat — when the run actually stopped), never negative, never beyond `now`. Returns the number of runs changed.
   */
  markAllRunningInterrupted(now: Date, aliveUntil?: Date): Promise<number>;
}
