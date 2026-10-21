/** Runs executing in this process: holds the AbortController so Stop / a timeout can cancel the executor. */
export interface ActiveRunRegistry {
  register(runId: string, controller: AbortController): void;
  /** Aborts the run's signal (reason = why). `false` = the run is not executing in this process. */
  abort(runId: string, reason: 'cancelled' | 'timed_out'): boolean;
  release(runId: string): void;
  /** Number of runs currently held — for observation / tests. */
  size(): number;
}
