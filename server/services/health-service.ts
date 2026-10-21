import type { DbProbe } from '../ports/db-probe';
import type { HealthReport, HealthService } from './contracts';

export class DefaultHealthService implements HealthService {
  readonly #db: DbProbe;

  constructor(deps: { db: DbProbe }) {
    this.#db = deps.db;
  }

  async check(): Promise<HealthReport> {
    const up = await this.#db.ping().catch(() => false);
    return { ok: up, db: up ? 'up' : 'down' };
  }
}
