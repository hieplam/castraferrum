import type pg from 'pg';
import { DomainError } from '../../../shared/domain/errors';
import type { ExecutionEndReason } from '../../../shared/domain/run';
import type {
  ExecutionRecord,
  ExecutionRepository,
  OpenExecutionInput,
  OpenResult,
} from '../../ports/execution-repository';
import type { Page, PageRequest } from '../../ports/page';
import { checkLimit, decodeExecutionCursor, encodeExecutionCursor } from '../cursor';
import { toExecution, violated, withTx } from './pg-util';

class AlreadyActive extends Error {}

export class PgExecutionRepository implements ExecutionRepository {
  readonly #pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }

  async open(input: OpenExecutionInput): Promise<OpenResult> {
    try {
      return await withTx(this.#pool, async (c) => {
        const loop = await c.query<{ archived_at: Date | null; seq: number }>(
          `UPDATE loops SET execution_counter = execution_counter + 1, status = 'active', next_run_at = $2
            WHERE id = $1 AND archived_at IS NULL
        RETURNING archived_at, execution_counter AS seq`,
          [input.loopId, input.nextRunAt],
        );
        const row = loop.rows[0];
        if (!row) {
          const exists = await c.query('SELECT 1 FROM loops WHERE id = $1', [input.loopId]);
          throw exists.rowCount
            ? new DomainError('LOOP_ARCHIVED', `Loop ${input.loopId} is archived — restore it before Start`)
            : new DomainError('LOOP_NOT_FOUND', `No loop ${input.loopId}`);
        }
        try {
          const { rows } = await c.query(
            `INSERT INTO loop_executions (id, loop_id, seq, started_at) VALUES ($1, $2, $3, $4) RETURNING *`,
            [input.id, input.loopId, row.seq, input.now],
          );
          return { kind: 'opened', execution: toExecution(rows[0]) } as const;
        } catch (err) {
          // An open execution already exists: roll back the counter increment too (the DB holds "one open execution / loop").
          if (violated(err, '23505') === 'executions_one_open_per_loop') throw new AlreadyActive();
          throw err;
        }
      });
    } catch (err) {
      if (err instanceof AlreadyActive) return { kind: 'already_active' };
      throw err;
    }
  }

  async close(loopId: string, reason: ExecutionEndReason, endedAt: Date): Promise<ExecutionRecord | null> {
    return withTx(this.#pool, async (c) => {
      const { rows } = await c.query(
        `UPDATE loop_executions SET ended_at = $2, end_reason = $3 WHERE loop_id = $1 AND ended_at IS NULL RETURNING *`,
        [loopId, endedAt, reason],
      );
      if (!rows[0]) return null;
      await c.query(`UPDATE loops SET status = 'stopped', next_run_at = NULL, updated_at = $2 WHERE id = $1`, [
        loopId,
        endedAt,
      ]);
      return toExecution(rows[0]);
    });
  }

  async findOpen(loopId: string): Promise<ExecutionRecord | null> {
    const { rows } = await this.#pool.query('SELECT * FROM loop_executions WHERE loop_id = $1 AND ended_at IS NULL', [
      loopId,
    ]);
    return rows[0] ? toExecution(rows[0]) : null;
  }

  async findById(id: string): Promise<ExecutionRecord | null> {
    const { rows } = await this.#pool.query('SELECT * FROM loop_executions WHERE id = $1', [id]);
    return rows[0] ? toExecution(rows[0]) : null;
  }

  async listByLoop(loopId: string, page: PageRequest): Promise<Page<ExecutionRecord>> {
    const limit = checkLimit(page.limit);
    const before = page.cursor ? decodeExecutionCursor(page.cursor) : null;
    const { rows } = await this.#pool.query(
      `SELECT * FROM loop_executions WHERE loop_id = $1 AND ($2::int IS NULL OR seq < $2)
        ORDER BY seq DESC LIMIT $3`,
      [loopId, before, limit + 1],
    );
    const items = rows.slice(0, limit).map(toExecution);
    const last = items.at(-1);
    return { items, nextCursor: rows.length > limit && last ? encodeExecutionCursor(last.seq) : null };
  }

  async closeAllOpen(reason: 'server_down', endedAt: Date): Promise<number> {
    const res = await this.#pool.query(
      'UPDATE loop_executions SET ended_at = $1, end_reason = $2 WHERE ended_at IS NULL',
      [endedAt, reason],
    );
    return res.rowCount ?? 0;
  }
}
