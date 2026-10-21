import { RUN_STATUSES } from '../../../shared/domain/run';
import type { ExecutionRecord } from '../../ports/execution-repository';
import type { LoopRecord } from '../../ports/loop-repository';
import type { RepoRecord } from '../../ports/repo-repository';
import type { LogLine } from '../../ports/run-log-repository';
import type { RunRecord } from '../../ports/run-repository';

// In-RAM "tables" for the fake repositories (test service). Each table enforces the same constraints Postgres does
// (PRIMARY KEY, FK, UNIQUE, CHECK, partial unique index, trigger — ARCHITECTURE.md § Data) so the memory/ repositories can rely on
// them just as the postgres/ repositories rely on the DB. The tests/contract/ suite runs on both to prove this.
//
// The memory/ repositories have no `await` between read and write, so each operation is atomic (single-threaded JS) — equivalent
// to a transaction. Reads / writes both copy the records so callers cannot mutate the "DB" through a reference.

/** Constraint violation — the same constraint name as Postgres. */
export class ConstraintViolation extends Error {
  readonly constraint: string;
  readonly kind: 'unique' | 'check' | 'foreign_key';

  constructor(kind: 'unique' | 'check' | 'foreign_key', constraint: string) {
    super(`constraint violated: ${constraint}`);
    this.name = 'ConstraintViolation';
    this.kind = kind;
    this.constraint = constraint;
  }
}

export const clone = <T>(v: T): T => structuredClone(v);

/** Byte-wise string comparison — same as Postgres's uuid order for lowercase uuids. */
export const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function restore<K, V>(target: Map<K, V>, from: Map<K, V>): void {
  target.clear();
  for (const [k, v] of from) target.set(k, v);
}

const RUN_STATUS_SET: ReadonlySet<string> = new Set(RUN_STATUSES);

export class MemoryDb {
  readonly repos = new Map<string, RepoRecord>();
  readonly loops = new Map<string, LoopRecord>();
  readonly executions = new Map<string, ExecutionRecord>();
  readonly runs = new Map<string, RunRecord>();
  readonly logs = new Map<string, LogLine[]>();
  heartbeat: Date | null = null;

  /** Wipe everything (like TRUNCATE in tests). */
  reset(): void {
    this.repos.clear();
    this.loops.clear();
    this.executions.clear();
    this.runs.clear();
    this.logs.clear();
    this.heartbeat = null;
  }

  /** Run `fn` atomically: an error midway → every table returns to its previous state (ROLLBACK). `fn` must be synchronous. */
  transaction<T>(fn: () => T): T {
    const before = {
      repos: clone(this.repos),
      loops: clone(this.loops),
      executions: clone(this.executions),
      runs: clone(this.runs),
      logs: clone(this.logs),
      heartbeat: this.heartbeat,
    };
    try {
      return fn();
    } catch (err) {
      restore(this.repos, before.repos);
      restore(this.loops, before.loops);
      restore(this.executions, before.executions);
      restore(this.runs, before.runs);
      restore(this.logs, before.logs);
      this.heartbeat = before.heartbeat;
      throw err;
    }
  }

  // ------------------------------------------------------------------ repos

  insertRepo(row: RepoRecord): void {
    if (this.repos.has(row.id)) throw new ConstraintViolation('unique', 'repos_pkey');
    if ([...row.name].length < 1 || [...row.name].length > 80) throw new ConstraintViolation('check', 'repos_name_length');
    for (const other of this.repos.values()) {
      if (other.name.toLowerCase() === row.name.toLowerCase()) throw new ConstraintViolation('unique', 'repos_name_unique');
      if (other.path === row.path) throw new ConstraintViolation('unique', 'repos_path_unique');
    }
    this.repos.set(row.id, clone(row));
  }

  /** DELETE: a loop (even an archived one) still points at it → foreign-key violation, like Postgres. */
  deleteRepo(id: string): void {
    for (const l of this.loops.values()) {
      if (l.repoId === id) throw new ConstraintViolation('foreign_key', 'loops_repo_id_repos_id_fk');
    }
    this.repos.delete(id);
  }

  // ------------------------------------------------------------------ loops

  /** INSERT or UPDATE one loops row, checking every table constraint before writing. */
  writeLoop(row: LoopRecord): void {
    if (row.name.length < 1 || row.name.length > 80) throw new ConstraintViolation('check', 'loops_name_length');
    if (!this.repos.has(row.repoId)) throw new ConstraintViolation('foreign_key', 'loops_repo_id_repos_id_fk');
    if (row.timeoutSec !== null && (row.timeoutSec < 60 || row.timeoutSec > 86400)) throw new ConstraintViolation('check', 'loops_timeout_range');
    if (!(row.maxConcurrent >= 1 && row.maxConcurrent <= 10)) throw new ConstraintViolation('check', 'loops_max_concurrent_range');
    if (row.archivedAt !== null && row.status !== 'stopped') {
      throw new ConstraintViolation('check', 'loops_archived_is_stopped');
    }
    if (row.status !== 'active' && row.nextRunAt !== null) {
      throw new ConstraintViolation('check', 'loops_next_run_only_active');
    }
    if (row.archivedAt === null) {
      const key = row.name.toLowerCase();
      for (const other of this.loops.values()) {
        if (other.id !== row.id && other.archivedAt === null && other.name.toLowerCase() === key) {
          throw new ConstraintViolation('unique', 'loops_name_live');
        }
      }
    }
    this.loops.set(row.id, clone(row));
  }

  insertLoop(row: LoopRecord): void {
    if (this.loops.has(row.id)) throw new ConstraintViolation('unique', 'loops_pkey');
    this.writeLoop(row);
  }

  // ------------------------------------------------------------------ loop_executions

  writeExecution(row: ExecutionRecord, isInsert: boolean): void {
    if (isInsert && this.executions.has(row.id)) throw new ConstraintViolation('unique', 'loop_executions_pkey');
    if (!this.loops.has(row.loopId)) throw new ConstraintViolation('foreign_key', 'loop_executions_loop_id_loops_id_fk');
    if ((row.endedAt === null) !== (row.endReason === null)) {
      throw new ConstraintViolation('check', 'executions_ended_has_reason');
    }
    for (const other of this.executions.values()) {
      if (other.id === row.id || other.loopId !== row.loopId) continue;
      if (other.seq === row.seq) throw new ConstraintViolation('unique', 'executions_loop_seq');
      if (other.endedAt === null && row.endedAt === null) {
        throw new ConstraintViolation('unique', 'executions_one_open_per_loop');
      }
    }
    this.executions.set(row.id, clone(row));
  }

  // ------------------------------------------------------------------ runs

  writeRun(row: RunRecord, isInsert: boolean): void {
    if (isInsert && this.runs.has(row.id)) throw new ConstraintViolation('unique', 'runs_pkey');
    if (!this.loops.has(row.loopId)) throw new ConstraintViolation('foreign_key', 'runs_loop_id_loops_id_fk');
    if (!this.executions.has(row.executionId)) {
      throw new ConstraintViolation('foreign_key', 'runs_execution_id_loop_executions_id_fk');
    }
    if (!RUN_STATUS_SET.has(row.status)) throw new ConstraintViolation('check', 'runs_status');
    let running = 0;
    for (const other of this.runs.values()) {
      if (other.id === row.id || other.loopId !== row.loopId) continue;
      if (row.iteration !== null && other.iteration === row.iteration) {
        throw new ConstraintViolation('unique', 'runs_loop_iteration');
      }
      if (other.status === 'running') running++;
    }
    // Trigger runs_max_concurrent_per_loop: INSERTing a running run when the loop already has max_concurrent running runs → reject.
    // Only on insert, like BEFORE INSERT: lowering max_concurrent does not touch runs already running.
    if (isInsert && row.status === 'running' && running >= (this.loops.get(row.loopId)?.maxConcurrent ?? 1)) {
      throw new ConstraintViolation('check', 'runs_max_concurrent_per_loop');
    }
    this.runs.set(row.id, clone(row));
  }
}
