import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR, openDb } from '../../server/adapters/postgres/db';
import { databaseUrl } from '../../server/config';

const testUrl = databaseUrl(process.env, 'test');
const journal = JSON.parse(readFileSync(join(MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf8')) as {
  entries: { tag: string }[];
};

/** Migration folder holding only the first `n` migrations (an "old generation" DB, e.g. phase 1 before the repo migration). */
function firstMigrations(n: number): string {
  const dir = mkdtempSync(join(tmpdir(), 'lc-migr-'));
  mkdirSync(join(dir, 'meta'));
  const entries = journal.entries.slice(0, n);
  writeFileSync(join(dir, 'meta', '_journal.json'), JSON.stringify({ ...journal, entries }));
  for (const e of entries) copyFileSync(join(MIGRATIONS_DIR, `${e.tag}.sql`), join(dir, `${e.tag}.sql`));
  return dir;
}

async function query<T extends pg.QueryResultRow>(sql: string): Promise<T[]> {
  const client = new pg.Client({ connectionString: testUrl });
  await client.connect();
  try {
    return (await client.query<T>(sql)).rows;
  } finally {
    await client.end();
  }
}

describe('migrations apply themselves when the DB opens (openDb - server/main.ts calls it at startup)', () => {
  it('empty DB -> every migration applied; reopen -> nothing applied twice', async () => {
    await query('DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    expect(await query(`SELECT to_regclass('public.server_heartbeat') AS t`)).toEqual([{ t: null }]);

    await (await openDb(testUrl)).close();
    await (await openDb(testUrl)).close();

    expect(await query(`SELECT to_regclass('public.server_heartbeat')::text AS t`)).toEqual([{ t: 'server_heartbeat' }]);
    const applied = await query<{ n: number }>('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations');
    expect(applied[0]?.n).toBe(journal.entries.length);
  });
});

describe('migration 0002_repo: a phase 1 DB with Mock loops -> wiped, repo added', () => {
  it('old Mock loop + execution / run / log -> after migration: SELECT count(*) FROM loops = 0, every child table = 0', async () => {
    await query('DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    const idx = journal.entries.findIndex((e) => e.tag === '0002_repo');
    expect(idx).toBe(2);
    const pool = new pg.Pool({ connectionString: testUrl });
    try {
      await migrate(drizzle({ client: pool }), { migrationsFolder: firstMigrations(idx) }); // phase 1 DB
      await pool.query(`
        INSERT INTO loops (id, name, prompt, cron, timezone, timeout_sec, executor_kind, status, created_at, updated_at)
        VALUES ('00000000-0000-4000-8000-000000000001', 'Old Mock', 'p', '*/5 * * * *', 'Asia/Ho_Chi_Minh', 1800, 'mock',
                'stopped', now(), now());
        INSERT INTO loop_executions (id, loop_id, seq, started_at, ended_at, end_reason)
        VALUES ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 1, now(), now(), 'stopped');
        INSERT INTO runs (id, loop_id, execution_id, iteration, trigger, status, started_at, prompt_snapshot, executor_kind,
                          executor_config)
        VALUES ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001',
                '00000000-0000-4000-8000-000000000002', 1, 'start', 'succeeded', now(), 'p', 'mock', '{}');
        INSERT INTO run_logs (run_id, seq, at, level, message) VALUES ('00000000-0000-4000-8000-000000000003', 1, now(), 'info', 'working...');`);
      expect((await pool.query('SELECT count(*)::int AS n FROM loops')).rows).toEqual([{ n: 1 }]);
    } finally {
      await pool.end();
    }

    await (await openDb(testUrl)).close(); // server starts -> applies the rest (0002_repo...)

    for (const table of ['loops', 'loop_executions', 'runs', 'run_logs', 'repos']) {
      expect(await query(`SELECT count(*)::int AS n FROM ${table}`), table).toEqual([{ n: 0 }]);
    }
    const cols = await query<{ column_name: string; is_nullable: string }>(
      `SELECT column_name, is_nullable FROM information_schema.columns
        WHERE table_name = 'loops' AND column_name IN ('repo_id', 'timeout_sec') ORDER BY column_name`,
    );
    expect(cols).toEqual([
      { column_name: 'repo_id', is_nullable: 'NO' },
      { column_name: 'timeout_sec', is_nullable: 'YES' },
    ]);
  });
});
