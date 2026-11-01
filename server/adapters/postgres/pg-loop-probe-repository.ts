import type pg from 'pg';
import { DomainError } from '../../../shared/domain/errors';
import type { ProbeRecord, ProbeSettings, ProbeState } from '../../../shared/domain/goal-loop';
import type { LoopProbeRepository } from '../../ports/loop-probe-repository';
import { json, violated } from './pg-util';

type Row = Record<string, unknown>;

function toProbe(r: Row): ProbeRecord {
  return {
    loopId: r.loop_id as string,
    command: r.command as string[],
    claim: r.claim as string[],
    release: r.release as string[],
    resources: r.resources as ProbeRecord['resources'],
    laneEnv: r.lane_env as Record<string, string>,
    laneBasePort: (r.lane_base_port as number | null) ?? null,
    restartPolicy: r.restart_policy as ProbeRecord['restartPolicy'],
    state: r.state as ProbeState,
    lastLine: (r.last_line as string | null) ?? null,
    lastProbeAt: (r.last_probe_at as Date | null) ?? null,
  };
}

export class PgLoopProbeRepository implements LoopProbeRepository {
  readonly #pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }

  async get(loopId: string): Promise<ProbeRecord | null> {
    const { rows } = await this.#pool.query('SELECT * FROM loop_probes WHERE loop_id = $1', [loopId]);
    return rows[0] ? toProbe(rows[0]) : null;
  }

  async list(): Promise<ProbeRecord[]> {
    const { rows } = await this.#pool.query('SELECT * FROM loop_probes ORDER BY loop_id');
    return rows.map(toProbe);
  }

  async upsert(loopId: string, s: ProbeSettings): Promise<ProbeRecord> {
    try {
      const { rows } = await this.#pool.query(
        `INSERT INTO loop_probes (loop_id, command, claim, release, resources, lane_env, lane_base_port, restart_policy)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (loop_id) DO UPDATE SET command = EXCLUDED.command, claim = EXCLUDED.claim, release = EXCLUDED.release,
           resources = EXCLUDED.resources, lane_env = EXCLUDED.lane_env, lane_base_port = EXCLUDED.lane_base_port,
           restart_policy = EXCLUDED.restart_policy
         RETURNING *`,
        [loopId, json(s.command), json(s.claim), json(s.release), json(s.resources), json(s.laneEnv), s.laneBasePort, s.restartPolicy],
      );
      return toProbe(rows[0]);
    } catch (err) {
      if (violated(err, '23503') === 'loop_probes_loop_id_loops_id_fk') throw new DomainError('LOOP_NOT_FOUND', `No loop ${loopId}`);
      throw err;
    }
  }

  async remove(loopId: string): Promise<void> {
    await this.#pool.query('DELETE FROM loop_probes WHERE loop_id = $1', [loopId]);
  }

  async record(loopId: string, r: { state: ProbeState; lastLine: string | null; at: Date }): Promise<void> {
    await this.#pool.query('UPDATE loop_probes SET state = $2, last_line = $3, last_probe_at = $4 WHERE loop_id = $1', [
      loopId,
      r.state,
      r.lastLine,
      r.at,
    ]);
  }
}
