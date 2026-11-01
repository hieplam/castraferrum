// Repository contract suite on real Postgres (server/adapters/postgres/), test DB (LOOPS_TEST_DATABASE_URL, default
// loops_test). Migrations are applied when the DB is opened, exactly as at server startup.
import { afterAll, beforeAll, describe } from 'vitest';
import { openDb, type Db } from '../../server/adapters/postgres/db';
import { createPgRepositories } from '../../server/adapters/postgres/repositories';
import { databaseUrl } from '../../server/config';
import { repositoryContract, type ContractEnv } from './repositories.contract';

describe('postgres', () => {
  let db: Db;
  let env: ContractEnv;
  beforeAll(async () => {
    db = await openDb(databaseUrl(process.env, 'test'));
    env = {
      ...createPgRepositories(db.pool),
      reset: async () => {
        await db.pool.query('TRUNCATE run_logs, runs, loop_executions, loop_probes, loops, repos, server_heartbeat');
      },
      // Raw SQL, bypassing PgRunRepository: only the runs_max_concurrent_per_loop trigger can block it.
      rawInsertRunning: async (row) => {
        await db.pool.query(
          `INSERT INTO runs (id, loop_id, execution_id, iteration, trigger, status, started_at, prompt_snapshot,
                             executor_kind, executor_config)
           VALUES ($1, $2, $3, $4, 'schedule', 'running', '2026-10-18T01:00:00Z', 'raw', 'mock', '{}')`,
          [row.id, row.loopId, row.executionId, row.iteration],
        );
      },
    };
  });
  afterAll(async () => {
    await db?.close();
  });
  repositoryContract(() => env);
});
