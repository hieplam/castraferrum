import type pg from 'pg';
import type { HoldRecord, HoldRepository, OpenHoldInput } from '../../ports/hold-repository';

function toHold(r: Record<string, unknown>): HoldRecord {
  return {
    id: r.id as string,
    resource: r.resource as string,
    reason: r.reason as string,
    openedAt: r.opened_at as Date,
    until: (r.until as Date | null) ?? null,
    checkedAt: (r.checked_at as Date | null) ?? null,
    closedAt: (r.closed_at as Date | null) ?? null,
    openedByRunId: (r.opened_by_run_id as string | null) ?? null,
    trialRunId: (r.trial_run_id as string | null) ?? null,
  };
}

export class PgHoldRepository implements HoldRepository {
  readonly #pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }

  async open(input: OpenHoldInput): Promise<'opened' | 'kept'> {
    const res = await this.#pool.query(
      `INSERT INTO resource_holds (id, resource, reason, opened_at, "until", opened_by_run_id) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (resource) WHERE closed_at IS NULL DO NOTHING`,
      [input.id, input.resource, input.reason, input.openedAt, input.until, input.openedByRunId],
    );
    return res.rowCount === 1 ? 'opened' : 'kept';
  }

  async raiseUntil(resource: string, until: Date): Promise<void> {
    await this.#pool.query(`UPDATE resource_holds SET "until" = $2 WHERE resource = $1 AND closed_at IS NULL AND ("until" IS NULL OR "until" < $2)`, [resource, until]);
  }

  async listOpen(): Promise<HoldRecord[]> {
    const { rows } = await this.#pool.query('SELECT * FROM resource_holds WHERE closed_at IS NULL ORDER BY opened_at, id');
    return rows.map(toHold);
  }

  async markChecked(id: string, at: Date, trialRunId: string | null): Promise<void> {
    await this.#pool.query('UPDATE resource_holds SET checked_at = $2, trial_run_id = $3 WHERE id = $1', [id, at, trialRunId]);
  }

  async close(id: string, at: Date): Promise<void> {
    await this.#pool.query('UPDATE resource_holds SET closed_at = $2 WHERE id = $1 AND closed_at IS NULL', [id, at]);
  }
}
