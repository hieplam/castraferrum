import type pg from 'pg';
import type { DbProbe } from '../../ports/db-probe';

export class PgDbProbe implements DbProbe {
  readonly #pool: pg.Pool;
  readonly #timeoutMs: number;

  constructor(pool: pg.Pool, opts: { timeoutMs?: number } = {}) {
    this.#pool = pool;
    this.#timeoutMs = opts.timeoutMs ?? 2000;
  }

  async ping(): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('ping timed out')), this.#timeoutMs);
    });
    try {
      await Promise.race([this.#pool.query('select 1'), timeout]);
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
