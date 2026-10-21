import type pg from 'pg';
import type { HeartbeatRepository } from '../../ports/heartbeat-repository';

export class PgHeartbeatRepository implements HeartbeatRepository {
  readonly #pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }

  async beat(now: Date): Promise<void> {
    await this.#pool.query(
      'INSERT INTO server_heartbeat (id, beat_at) VALUES (true, $1) ON CONFLICT (id) DO UPDATE SET beat_at = EXCLUDED.beat_at',
      [now],
    );
  }

  async last(): Promise<Date | null> {
    const { rows } = await this.#pool.query<{ beat_at: Date }>('SELECT beat_at FROM server_heartbeat');
    return rows[0]?.beat_at ?? null;
  }
}
