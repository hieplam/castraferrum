import type pg from 'pg';
import { DomainError } from '../../../shared/domain/errors';
import type { ExecutionStats } from '../../../shared/domain/run';
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
import { json, toRun, violated, withTx } from './pg-util';

class Busy extends Error {}

export class PgRunRepository implements RunRepository {
  readonly #pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }

  async start(input: StartRunInput): Promise<StartResult> {
    // A running run may have just finished between the rollback and the re-read → retry a few times.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const run = await withTx(this.#pool, async (c) => {
          const counter = await c.query<{ n: number }>(
            'UPDATE loops SET run_counter = run_counter + 1 WHERE id = $1 RETURNING run_counter AS n',
            [input.loopId],
          );
          const n = counter.rows[0]?.n;
          if (n === undefined) throw new DomainError('LOOP_NOT_FOUND', `No loop ${input.loopId}`);
          try {
            const { rows } = await c.query(
              `INSERT INTO runs (id, loop_id, execution_id, iteration, trigger, status, scheduled_for, started_at,
                                 deadline_at, prompt_snapshot, executor_kind, executor_config, task_key, slot)
               VALUES ($1, $2, $3, $4, $5, 'running', $6, $7, $8, $9, $10, $11, $12, $13)
               RETURNING *`,
              [
                input.id,
                input.loopId,
                input.executionId,
                n,
                input.trigger,
                input.scheduledFor,
                input.startedAt,
                input.deadlineAt,
                input.promptSnapshot,
                input.executorKind,
                json(input.executorConfig),
                input.taskKey ?? null,
                input.slot ?? null,
              ],
            );
            return toRun(rows[0]);
          } catch (err) {
            // The loop already has max_concurrent running runs: rollback → run_counter does not increment (UC-12).
            if (violated(err, '23514') === 'runs_max_concurrent_per_loop') throw new Busy();
            throw err;
          }
        });
        return { kind: 'started', run };
      } catch (err) {
        if (!(err instanceof Busy)) throw err;
      }
      const [active, limit] = await Promise.all([this.listActive(input.loopId), this.#limitOf(input.loopId)]);
      if (active.length > 0 && active.length >= limit) return { kind: 'busy', active, limit };
    }
    throw new Error(`RunRepository.start: loop ${input.loopId} kept flipping between busy and free, could not settle`);
  }

  async recordSkipped(input: SkippedRunInput): Promise<RunRecord> {
    const { rows } = await this.#pool.query(
      `INSERT INTO runs (id, loop_id, execution_id, iteration, trigger, status, skip_reason, scheduled_for, started_at,
                         finished_at, duration_ms, prompt_snapshot, executor_kind, executor_config, task_key)
       VALUES ($1, $2, $3, NULL, $10, 'skipped', $4, $5, $6, $6, 0, $7, $8, $9, $11)
       RETURNING *`,
      [
        input.id,
        input.loopId,
        input.executionId,
        input.skipReason,
        input.scheduledFor,
        input.at,
        input.promptSnapshot,
        input.executorKind,
        json(input.executorConfig),
        input.trigger ?? 'schedule',
        input.taskKey ?? null,
      ],
    );
    return toRun(rows[0]);
  }

  async setSession(id: string, sessionId: string): Promise<void> {
    const res = await this.#pool.query('UPDATE runs SET session_id = $2 WHERE id = $1', [id, sessionId]);
    if (res.rowCount !== 1) throw new DomainError('RUN_NOT_FOUND', `No run ${id}`);
  }

  async finish(id: string, outcome: RunOutcome): Promise<RunRecord> {
    const { rows } = await this.#pool.query(
      `UPDATE runs SET status = $2, finished_at = $3,
                       duration_ms = round(extract(epoch FROM ($3::timestamptz - started_at)) * 1000)::int,
                       summary = $4, error = $5, cost_usd = $6, end_result = $7, end_pr = $8
        WHERE id = $1 AND status = 'running'
    RETURNING *`,
      [
        id,
        outcome.status,
        outcome.finishedAt,
        outcome.summary ?? null,
        outcome.error ?? null,
        outcome.costUsd ?? null,
        outcome.endResult ?? null,
        outcome.endPr ?? null,
      ],
    );
    if (rows[0]) return toRun(rows[0]);
    const current = await this.findById(id);
    if (!current) throw new DomainError('RUN_NOT_FOUND', `No run ${id}`);
    return current;
  }

  async listByExecution(executionId: string): Promise<RunRecord[]> {
    const { rows } = await this.#pool.query(
      'SELECT * FROM runs WHERE execution_id = $1 ORDER BY started_at, id',
      [executionId],
    );
    return rows.map(toRun);
  }

  async listBetween(from: Date, to: Date): Promise<RunRecord[]> {
    const { rows } = await this.#pool.query('SELECT * FROM runs WHERE started_at >= $1 AND started_at < $2 ORDER BY started_at, id', [from, to]);
    return rows.map(toRun);
  }

  async findById(id: string): Promise<RunRecord | null> {
    const { rows } = await this.#pool.query('SELECT * FROM runs WHERE id = $1', [id]);
    return rows[0] ? toRun(rows[0]) : null;
  }

  async latestFinishedAt(loopId: string): Promise<Date | null> {
    const { rows } = await this.#pool.query<{ latest: Date | null }>(
      `SELECT max(finished_at) AS latest FROM runs WHERE loop_id = $1 AND status <> 'skipped'`,
      [loopId],
    );
    return rows[0]?.latest ?? null;
  }

  async listActive(loopId: string): Promise<RunRecord[]> {
    const { rows } = await this.#pool.query(
      `SELECT * FROM runs WHERE loop_id = $1 AND status = 'running' ORDER BY started_at, id`,
      [loopId],
    );
    return rows.map(toRun);
  }

  async #limitOf(loopId: string): Promise<number> {
    const { rows } = await this.#pool.query<{ n: number }>('SELECT max_concurrent AS n FROM loops WHERE id = $1', [loopId]);
    return rows[0]?.n ?? 1;
  }

  async findOverdue(now: Date): Promise<RunRecord[]> {
    const { rows } = await this.#pool.query(
      `SELECT * FROM runs WHERE status = 'running' AND deadline_at <= $1 ORDER BY deadline_at, id`,
      [now],
    );
    return rows.map(toRun);
  }

  async listByLoop(loopId: string, page: PageRequest): Promise<Page<RunRecord>> {
    const limit = checkLimit(page.limit);
    const before = page.cursor ? decodeRunCursor(page.cursor) : null;
    const { rows } = await this.#pool.query(
      `SELECT * FROM runs
        WHERE loop_id = $1 AND ($2::timestamptz IS NULL OR (started_at, id) < ($2, $3::uuid))
        ORDER BY started_at DESC, id DESC
        LIMIT $4`,
      [loopId, before?.startedAt ?? null, before?.id ?? null, limit + 1],
    );
    const items = rows.slice(0, limit).map(toRun);
    const last = items.at(-1);
    return { items, nextCursor: rows.length > limit && last ? encodeRunCursor(last) : null };
  }

  async statsByExecution(executionIds: string[], now: Date): Promise<Map<string, ExecutionStats>> {
    const out = new Map<string, ExecutionStats>();
    if (executionIds.length === 0) return out;
    const { rows } = await this.#pool.query<Record<string, number | null> & { id: string }>(
      `SELECT e.id,
              count(r.id) FILTER (WHERE r.status <> 'skipped')::int                               AS runs,
              count(r.id) FILTER (WHERE r.status = 'running')::int                                AS running,
              count(r.id) FILTER (WHERE r.status = 'succeeded')::int                              AS succeeded,
              count(r.id) FILTER (WHERE r.status IN ('failed','timed_out'))::int                  AS failed,
              count(r.id) FILTER (WHERE r.status = 'interrupted')::int                            AS interrupted,
              count(r.id) FILTER (WHERE r.status = 'cancelled')::int                              AS cancelled,
              count(r.id) FILTER (WHERE r.status = 'skipped')::int                                AS skipped,
              count(r.session_id)::int                                                            AS sessions,
              round(extract(epoch FROM (coalesce(e.ended_at, $2::timestamptz) - e.started_at)) * 1000)::bigint::float8 AS elapsed_ms,
              round(avg(r.duration_ms) FILTER (WHERE r.status NOT IN ('skipped','running')))::float8 AS avg_duration_ms
         FROM loop_executions e LEFT JOIN runs r ON r.execution_id = e.id
        WHERE e.id = ANY($1::uuid[])
        GROUP BY e.id`,
      [executionIds, now],
    );
    for (const r of rows) {
      out.set(r.id, {
        runs: r.runs ?? 0,
        running: r.running ?? 0,
        succeeded: r.succeeded ?? 0,
        failed: r.failed ?? 0,
        interrupted: r.interrupted ?? 0,
        cancelled: r.cancelled ?? 0,
        skipped: r.skipped ?? 0,
        sessions: r.sessions ?? 0,
        elapsedMs: r.elapsed_ms ?? 0,
        avgDurationMs: r.avg_duration_ms ?? null,
      });
    }
    return out;
  }

  async countOverview(startedFrom: Date, failedFrom: Date): Promise<RunOverviewCounts> {
    const { rows } = await this.#pool.query<RunOverviewCounts>(
      `SELECT count(*) FILTER (WHERE status = 'running')::int                                       AS running,
              count(*) FILTER (WHERE status <> 'skipped' AND started_at >= $1)::int                 AS "startedSince",
              count(*) FILTER (WHERE status IN ('failed','timed_out','interrupted') AND finished_at >= $2)::int AS "failedSince"
         FROM runs`,
      [startedFrom, failedFrom],
    );
    return rows[0]!;
  }

  async markAllRunningInterrupted(now: Date, aliveUntil: Date = now): Promise<number> {
    const res = await this.#pool.query(
      `UPDATE runs SET status = 'interrupted', finished_at = $1,
                       duration_ms = greatest(0, round(extract(epoch FROM (least($2::timestamptz, $1::timestamptz) - started_at)) * 1000))::int
        WHERE status = 'running'`,
      [now, aliveUntil],
    );
    return res.rowCount ?? 0;
  }
}
