import { DomainError } from '../../../shared/domain/errors';
import { FAILURE_STATUSES, type ExecutionStats } from '../../../shared/domain/run';
import type { Page, PageRequest } from '../../ports/page';
import type {
  RunOutcome,
  RunOverviewCounts,
  RunRecord,
  RunRepository,
  SkippedRunInput,
  StartResult,
  StartRunInput,
} from '../../ports/run-repository';
import { checkLimit, decodeRunCursor, encodeRunCursor } from '../cursor';
import { clone, cmp, ConstraintViolation, type MemoryDb } from './memory-db';

export class MemoryRunRepository implements RunRepository {
  readonly #db: MemoryDb;

  constructor(db: MemoryDb) {
    this.#db = db;
  }

  async start(input: StartRunInput): Promise<StartResult> {
    const db = this.#db;
    const loop = db.loops.get(input.loopId);
    if (!loop) throw new DomainError('LOOP_NOT_FOUND', `No loop ${input.loopId}`);
    try {
      return db.transaction(() => {
        const iteration = loop.runCounter + 1;
        db.writeLoop({ ...loop, runCounter: iteration });
        const run: RunRecord = {
          ...blankRun(input),
          iteration,
          trigger: input.trigger,
          status: 'running',
          scheduledFor: input.scheduledFor,
          startedAt: input.startedAt,
          deadlineAt: input.deadlineAt,
        };
        db.writeRun(run, true); // the loop already has enough running runs → runs_max_concurrent_per_loop → rollback the counter
        return { kind: 'started', run: clone(run) } as const;
      });
    } catch (err) {
      if (!(err instanceof ConstraintViolation && err.constraint === 'runs_max_concurrent_per_loop')) throw err;
      return { kind: 'busy', active: listActive(db, input.loopId).map(clone), limit: loop.maxConcurrent };
    }
  }

  async recordSkipped(input: SkippedRunInput): Promise<RunRecord> {
    const run: RunRecord = {
      ...blankRun(input),
      iteration: null,
      trigger: 'schedule',
      status: 'skipped',
      skipReason: input.skipReason,
      scheduledFor: input.scheduledFor,
      startedAt: input.at,
      finishedAt: input.at,
      durationMs: 0,
    };
    this.#db.writeRun(run, true);
    return clone(run);
  }

  async setSession(id: string, sessionId: string): Promise<void> {
    const run = this.#db.runs.get(id);
    if (!run) throw new DomainError('RUN_NOT_FOUND', `No run ${id}`);
    this.#db.writeRun({ ...run, sessionId }, false);
  }

  async finish(id: string, outcome: RunOutcome): Promise<RunRecord> {
    const run = this.#db.runs.get(id);
    if (!run) throw new DomainError('RUN_NOT_FOUND', `No run ${id}`);
    if (run.status !== 'running') return clone(run);
    const done: RunRecord = {
      ...run,
      status: outcome.status,
      finishedAt: outcome.finishedAt,
      durationMs: outcome.finishedAt.getTime() - run.startedAt.getTime(),
      summary: outcome.summary ?? null,
      error: outcome.error ?? null,
      costUsd: outcome.costUsd ?? null,
    };
    this.#db.writeRun(done, false);
    return clone(done);
  }

  async listByExecution(executionId: string): Promise<RunRecord[]> {
    return [...this.#db.runs.values()]
      .filter((r) => r.executionId === executionId)
      .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime() || cmp(a.id, b.id))
      .map(clone);
  }

  async findById(id: string): Promise<RunRecord | null> {
    const run = this.#db.runs.get(id);
    return run ? clone(run) : null;
  }

  async listActive(loopId: string): Promise<RunRecord[]> {
    return listActive(this.#db, loopId).map(clone);
  }

  async findOverdue(now: Date): Promise<RunRecord[]> {
    return [...this.#db.runs.values()]
      .filter((r) => r.status === 'running' && r.deadlineAt !== null && r.deadlineAt.getTime() <= now.getTime())
      .sort((a, b) => (a.deadlineAt?.getTime() ?? 0) - (b.deadlineAt?.getTime() ?? 0) || cmp(a.id, b.id))
      .map(clone);
  }

  async listByLoop(loopId: string, page: PageRequest): Promise<Page<RunRecord>> {
    const limit = checkLimit(page.limit);
    const before = page.cursor ? decodeRunCursor(page.cursor) : null;
    const rows = [...this.#db.runs.values()]
      .filter((r) => r.loopId === loopId && (before === null || isBefore(r, before)))
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime() || cmp(b.id, a.id));
    const items = rows.slice(0, limit).map(clone);
    const last = items.at(-1);
    return { items, nextCursor: rows.length > limit && last ? encodeRunCursor(last) : null };
  }

  async statsByExecution(executionIds: string[], now: Date): Promise<Map<string, ExecutionStats>> {
    const out = new Map<string, ExecutionStats>();
    for (const id of executionIds) {
      const e = this.#db.executions.get(id);
      if (!e || out.has(id)) continue;
      const runs = [...this.#db.runs.values()].filter((r) => r.executionId === id);
      const count = (pred: (r: RunRecord) => boolean) => runs.filter(pred).length;
      const finished = runs.filter((r) => r.status !== 'skipped' && r.status !== 'running' && r.durationMs !== null);
      out.set(id, {
        runs: count((r) => r.status !== 'skipped'),
        running: count((r) => r.status === 'running'),
        succeeded: count((r) => r.status === 'succeeded'),
        failed: count((r) => FAILURE_STATUSES.includes(r.status)),
        cancelled: count((r) => r.status === 'cancelled'),
        skipped: count((r) => r.status === 'skipped'),
        sessions: count((r) => r.sessionId !== null),
        elapsedMs: (e.endedAt ?? now).getTime() - e.startedAt.getTime(),
        avgDurationMs: finished.length
          ? Math.round(finished.reduce((s, r) => s + (r.durationMs ?? 0), 0) / finished.length)
          : null,
      });
    }
    return out;
  }

  async countOverview(startedFrom: Date, failedFrom: Date): Promise<RunOverviewCounts> {
    const out: RunOverviewCounts = { running: 0, startedSince: 0, failedSince: 0 };
    for (const r of this.#db.runs.values()) {
      if (r.status === 'running') out.running += 1;
      if (r.status !== 'skipped' && r.startedAt >= startedFrom) out.startedSince += 1;
      if (FAILURE_STATUSES.includes(r.status) && r.finishedAt && r.finishedAt >= failedFrom) out.failedSince += 1;
    }
    return out;
  }

  async markAllRunningInterrupted(now: Date, aliveUntil: Date = now): Promise<number> {
    const db = this.#db;
    const until = Math.min(aliveUntil.getTime(), now.getTime());
    return db.transaction(() => {
      let n = 0;
      for (const r of db.runs.values()) {
        if (r.status !== 'running') continue;
        db.writeRun(
          { ...r, status: 'interrupted', finishedAt: now, durationMs: Math.max(0, until - r.startedAt.getTime()) },
          false,
        );
        n++;
      }
      return n;
    });
  }
}

function blankRun(input: StartRunInput | SkippedRunInput): RunRecord {
  return {
    id: input.id,
    loopId: input.loopId,
    executionId: input.executionId,
    iteration: null,
    trigger: 'schedule',
    status: 'running',
    skipReason: null,
    scheduledFor: null,
    startedAt: new Date(0),
    deadlineAt: null,
    finishedAt: null,
    durationMs: null,
    promptSnapshot: input.promptSnapshot,
    executorKind: input.executorKind,
    executorConfig: clone(input.executorConfig),
    summary: null,
    error: null,
    costUsd: null,
    sessionId: null,
  };
}

/** The loop's running runs, oldest first (started_at, id) — like Postgres's ORDER BY. */
function listActive(db: MemoryDb, loopId: string): RunRecord[] {
  return [...db.runs.values()]
    .filter((r) => r.loopId === loopId && r.status === 'running')
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime() || cmp(a.id, b.id));
}

/** (started_at, id) < cursor — the same tuple comparison as Postgres. */
function isBefore(r: RunRecord, c: { startedAt: Date; id: string }): boolean {
  const d = r.startedAt.getTime() - c.startedAt.getTime();
  return d < 0 || (d === 0 && r.id < c.id);
}
