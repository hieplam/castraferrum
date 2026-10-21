import type { LoopStatus } from '../../shared/domain/run';

export type LoopRecord = {
  id: string;
  name: string;
  description: string;
  prompt: string;
  /** The loop's repo — the `cwd` of every run. */
  repoId: string;
  cron: string;
  timezone: string;
  /** `null` = unlimited (SPEC-phase-2); otherwise 60–86 400. */
  timeoutSec: number | null;
  overlapPolicy: 'skip';
  /** Maximum number of `running` runs at once, 1–10. The DB itself blocks run N + 1 (trigger runs_max_concurrent_per_loop). */
  maxConcurrent: number;
  executorKind: string;
  executorConfig: unknown;
  status: LoopStatus;
  nextRunAt: Date | null;
  /** Issues iteration numbers #N — for the loop's whole life, only `RunRepository.start` increments it. */
  runCounter: number;
  /** Issues execution numbers #k — only `ExecutionRepository.open` increments it. */
  executionCounter: number;
  /** Optimistic lock (UC-09): only `update` increments it; Start / Stop / schedule ticks do not change the version. */
  version: number;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
};

/** A new loop is always `stopped`, version 1, counters 0. `id` is issued by the service (IdGenerator). */
export type NewLoopRecord = {
  id: string;
  name: string;
  description: string;
  prompt: string;
  repoId: string;
  cron: string;
  timezone: string;
  timeoutSec: number | null;
  /** Omitted = 1 (the column's DEFAULT). */
  maxConcurrent?: number;
  executorKind: string;
  executorConfig: unknown;
  createdAt: Date;
};

/** Edit config / archive / restore. Run state changes go through ExecutionRepository.open/close and stopAll. */
export type LoopPatch = Partial<
  Pick<LoopRecord, 'name' | 'description' | 'prompt' | 'repoId' | 'cron' | 'timezone' | 'timeoutSec' | 'maxConcurrent' | 'executorKind' | 'executorConfig' | 'archivedAt'>
> & { updatedAt: Date };

export type LoopFilter = {
  status?: LoopStatus;
  /** Search by name, case-insensitive, substring match. */
  q?: string;
  /** `true` = only archived loops; by default only non-archived loops. */
  archived?: boolean;
  /** Only this repo's loops (UC-25). */
  repoId?: string;
};

export type LoopCounts = { active: number; stopped: number; archived: number };

/** A due loop, together with its open execution (a loop is `active` ⇔ it has an open execution). */
export type DueLoop = LoopRecord & { nextRunAt: Date; openExecutionId: string };

export interface LoopRepository {
  /** Throws `LOOP_NAME_TAKEN` when the name duplicates (case-insensitive) a non-archived loop. */
  insert(loop: NewLoopRecord): Promise<LoopRecord>;
  findById(id: string): Promise<LoopRecord | null>;
  /** Newest created first (created_at descending). */
  list(filter: LoopFilter): Promise<LoopRecord[]>;
  /**
   * Version matches → write + version + 1. Throws `LOOP_NOT_FOUND`, `VERSION_CONFLICT`, `LOOP_NAME_TAKEN` (rename / restore
   * with a duplicate name), `LOOP_IS_ACTIVE` (archiving a running loop).
   */
  update(id: string, patch: LoopPatch, expectedVersion: number): Promise<LoopRecord>;
  /** Loop counts per list tab (UC-03): `active` / `stopped` only count non-archived loops. `repoId` → only that repo's loops (UC-25). */
  counts(repoId?: string): Promise<LoopCounts>;
  /** Active, non-archived, next_run_at <= now; earliest first. */
  findDue(now: Date, limit: number): Promise<DueLoop[]>;
  /** Compare-and-set: only changes when the loop is still active and next_run_at equals `expected` exactly. */
  advanceNextRun(id: string, expected: Date, next: Date | null): Promise<boolean>;
  /** Recovery: every active loop → stopped, next_run_at = null. Returns the number of loops changed. */
  stopAll(now: Date): Promise<number>;
}
