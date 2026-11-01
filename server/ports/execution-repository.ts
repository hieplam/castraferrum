import type { ExecutionEndReason } from '../../shared/domain/run';
import type { Page, PageRequest } from './page';

/** One execution (Start → Stop). */
export type ExecutionRecord = {
  id: string;
  loopId: string;
  /** The loop's k-th execution (#k). */
  seq: number;
  startedAt: Date;
  endedAt: Date | null;
  endReason: ExecutionEndReason | null;
};

/** `nextRunAt` is `null` for a probe loop: `findDue` skips it, so only the probe starts its runs. */
export type OpenExecutionInput = { id: string; loopId: string; now: Date; nextRunAt: Date | null };

export type OpenResult = { kind: 'opened'; execution: ExecutionRecord } | { kind: 'already_active' };

export interface ExecutionRepository {
  /**
   * One transaction: allocate seq (execution_counter + 1) + open the execution + loop → active, next_run_at. If an
   * execution is already open → `already_active` and the counter does not advance (the DB enforces this with
   * `executions_one_open_per_loop`). Throws `LOOP_NOT_FOUND`, `LOOP_ARCHIVED`.
   */
  open(input: OpenExecutionInput): Promise<OpenResult>;
  /** One transaction: close the loop's open execution + loop → stopped, next_run_at = null. No open execution → null. */
  close(loopId: string, reason: ExecutionEndReason, endedAt: Date): Promise<ExecutionRecord | null>;
  findOpen(loopId: string): Promise<ExecutionRecord | null>;
  findById(id: string): Promise<ExecutionRecord | null>;
  /** Newest first (seq descending). */
  listByLoop(loopId: string, page: PageRequest): Promise<Page<ExecutionRecord>>;
  /** Recovery: close every open execution, except those of `keepLoopIds`. Does not change loops (recovery calls `LoopRepository.stopAll`). */
  closeAllOpen(reason: 'server_down', endedAt: Date, keepLoopIds?: string[]): Promise<number>;
}
