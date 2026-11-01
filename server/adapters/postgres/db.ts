import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import * as schema from './schema';

export const MIGRATIONS_DIR = fileURLToPath(new URL('./migrations', import.meta.url));

export type Db = {
  pool: pg.Pool;
  orm: NodePgDatabase<typeof schema>;
  close(): Promise<void>;
};

export function createPool(url: string): pg.Pool {
  const pool = new pg.Pool({ connectionString: url, connectionTimeoutMillis: 2000, max: 10 });
  // Postgres stops / restarts → an idle client in the pool emits 'error'; if not caught the whole process dies.
  // The next query opens a new connection by itself, and health reports db down until Postgres is back.
  pool.on('error', () => {});
  return pool;
}

/** Open the pool, wait for Postgres to be ready (right after `docker compose up` it needs a few seconds), then apply every pending migration. */
export async function openDb(url: string, opts: { waitMs?: number; log?: (msg: string) => void } = {}): Promise<Db> {
  const pool = createPool(url);
  try {
    await waitUntilReachable(pool, opts.waitMs ?? 30_000, opts.log);
    const orm = drizzle({ client: pool, schema });
    await migrate(orm, { migrationsFolder: MIGRATIONS_DIR });
    return { pool, orm, close: () => pool.end() };
  } catch (err) {
    await pool.end().catch(() => {});
    throw err;
  }
}

/** Test mode (`POST /api/__test/reset`): wipe all data, keep the schema. */
export async function truncateAll(pool: pg.Pool): Promise<void> {
  await pool.query('TRUNCATE run_logs, runs, run_claims, loop_executions, loop_probes, loops, repos, server_heartbeat, notices, standing_goals, standing_issues, standing_schedule');
}

async function waitUntilReachable(pool: pg.Pool, waitMs: number, log?: (msg: string) => void): Promise<void> {
  const deadline = Date.now() + waitMs;
  for (let attempt = 1; ; attempt++) {
    try {
      await pool.query('select 1');
      return;
    } catch (err) {
      if (Date.now() >= deadline) throw err;
      if (attempt === 1) log?.(`Waiting for Postgres… (${(err as Error).message})`);
      await sleep(1000);
    }
  }
}
