import type pg from 'pg';
import type { RunStatus } from '../../../shared/domain/run';
import type { ClaimKind, ClaimOwner, ClaimRecord, ClaimRepository, OpenClaimInput, OrphanedClaim } from '../../ports/claims';

type Row = Record<string, unknown>;

function toClaim(r: Row): ClaimRecord {
  return {
    id: r.id as string,
    loopId: r.loop_id as string,
    taskKey: r.task_key as string,
    runId: r.run_id as string,
    openedAt: r.opened_at as Date,
    closedAt: (r.closed_at as Date | null) ?? null,
    closeReason: (r.close_reason as string | null) ?? null,
    owner: r.owner as ClaimOwner,
    gateJobId: (r.gate_job_id as string | null) ?? null,
    kind: r.kind as ClaimKind,
  };
}

export class PgClaimRepository implements ClaimRepository {
  readonly #pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }

  async open(input: OpenClaimInput): Promise<'opened' | 'taken'> {
    const res = await this.#pool.query(
      `INSERT INTO run_claims (id, loop_id, task_key, run_id, opened_at, kind) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (loop_id, task_key) WHERE closed_at IS NULL DO NOTHING`,
      [input.id, input.loopId, input.taskKey, input.runId, input.at, input.kind ?? 'task'],
    );
    return res.rowCount === 1 ? 'opened' : 'taken';
  }

  async listOpen(loopId: string): Promise<ClaimRecord[]> {
    const { rows } = await this.#pool.query('SELECT * FROM run_claims WHERE loop_id = $1 AND closed_at IS NULL ORDER BY opened_at, id', [loopId]);
    return rows.map(toClaim);
  }

  async close(id: string, reason: string, at: Date): Promise<void> {
    await this.#pool.query('UPDATE run_claims SET closed_at = $3, close_reason = $2 WHERE id = $1 AND closed_at IS NULL', [id, reason, at]);
  }

  async handOver(id: string, gateJobId: string): Promise<boolean> {
    const res = await this.#pool.query(`UPDATE run_claims SET owner = 'gate', gate_job_id = $2 WHERE id = $1 AND closed_at IS NULL`, [id, gateJobId]);
    return res.rowCount === 1;
  }

  async listGateOwned(): Promise<ClaimRecord[]> {
    const { rows } = await this.#pool.query('SELECT * FROM run_claims WHERE closed_at IS NULL AND gate_job_id IS NOT NULL ORDER BY opened_at, id');
    return rows.map(toClaim);
  }

  async findOrphaned(limit: number): Promise<OrphanedClaim[]> {
    const { rows } = await this.#pool.query(
      `SELECT c.*, r.status AS run_status, r.end_result, r.end_pr
         FROM run_claims c LEFT JOIN runs r ON r.id = c.run_id
        WHERE c.closed_at IS NULL AND c.owner = 'run' AND (r.id IS NULL OR r.status NOT IN ('running', 'held'))
        ORDER BY c.opened_at, c.id
        LIMIT $1`,
      [limit],
    );
    return rows.map((r: Row) => ({
      ...toClaim(r),
      runStatus: (r.run_status as RunStatus | null) ?? null,
      endResult: (r.end_result as string | null) ?? null,
      endPr: (r.end_pr as string | null) ?? null,
    }));
  }
}
