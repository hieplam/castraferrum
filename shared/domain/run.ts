// Types + pure rules of a loop / run / turn (SPEC, model).

export type LoopStatus = 'active' | 'stopped';
export type ExecutionEndReason = 'stopped' | 'server_down';

export const RUN_STATUSES = ['running', 'succeeded', 'failed', 'cancelled', 'timed_out', 'interrupted', 'skipped'] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];
export type RunTrigger = 'start' | 'schedule' | 'probe';
/** Final status that `RunRepository.finish` can write (interrupted comes only from recovery, skipped only from recordSkipped). */
export type FinishStatus = 'succeeded' | 'failed' | 'cancelled' | 'timed_out';
export type LogLevel = 'info' | 'warn' | 'error';

/** The "error" group of the overview figures (errors in 24 h): failed + timed_out + interrupted (SPEC, figures). The counts
 * of an active period (`ExecutionStats`) keep interrupted apart, as the run list does (castraferrum#190). */
export const FAILURE_STATUSES: readonly RunStatus[] = ['failed', 'timed_out', 'interrupted'];

/** Figures of one run (Start to Stop). `runs` = number of turns that really ran (every status except skipped). */
export type ExecutionStats = {
  runs: number;
  running: number;
  succeeded: number;
  /** Failed and timed out runs. */
  failed: number;
  /** Runs a server shutdown interrupted: not a failure of the run, so not counted in `failed` (castraferrum#190). */
  interrupted: number;
  cancelled: number;
  skipped: number;
  /** Number of turns with a session id: a turn that fails before opening a session - e.g. "Repo does not exist" - has none. */
  sessions: number;
  /** How long it has run: `(endedAt ?? now) - startedAt`. */
  elapsedMs: number;
  /** Average duration of the finished turns (skipped excluded); no finished turn yet gives null. */
  avgDurationMs: number | null;
};

/** One log line of a turn; `seq` grows within the turn (1, 2, ...). The `run.log` event carries it, so it sits in the domain. */
export type LogLine = { runId: string; seq: number; at: Date; level: LogLevel; message: string; data: unknown };
