import type pg from 'pg';
import { DomainError } from '../../../shared/domain/errors';
import type { LogLine, NewLogLine, RunLogRepository } from '../../ports/run-log-repository';
import { json, toLog, withTx } from './pg-util';

export class PgRunLogRepository implements RunLogRepository {
  readonly #pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }

  async append(runId: string, lines: NewLogLine[]): Promise<LogLine[]> {
    return withTx(this.#pool, async (c) => {
      // Lock the run's row: two simultaneous appends for one run must not hand out the same seq.
      const run = await c.query('SELECT 1 FROM runs WHERE id = $1 FOR UPDATE', [runId]);
      if (!run.rowCount) throw new DomainError('RUN_NOT_FOUND', `No run ${runId}`);
      if (lines.length === 0) return [];
      const max = await c.query<{ n: number }>('SELECT coalesce(max(seq), 0)::int AS n FROM run_logs WHERE run_id = $1', [
        runId,
      ]);
      const start = max.rows[0]?.n ?? 0;
      const params: unknown[] = [runId];
      const values = lines.map((line, i) => {
        params.push(start + i + 1, line.at, line.level, line.message, json(line.data));
        const p = params.length;
        return `($1, $${p - 4}, $${p - 3}, $${p - 2}, $${p - 1}, $${p})`;
      });
      const { rows } = await c.query(
        `INSERT INTO run_logs (run_id, seq, at, level, message, data) VALUES ${values.join(', ')} RETURNING *`,
        params,
      );
      return rows.map(toLog).sort((a, b) => a.seq - b.seq);
    });
  }

  async list(runId: string, afterSeq: number, limit: number): Promise<LogLine[]> {
    const { rows } = await this.#pool.query(
      'SELECT * FROM run_logs WHERE run_id = $1 AND seq > $2 ORDER BY seq LIMIT $3',
      [runId, afterSeq, limit],
    );
    return rows.map(toLog);
  }
}
