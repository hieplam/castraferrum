// The REAL console (not test mode) no longer has the Mock executor: the project owner decided to drop Mock entirely.
// Builds the exact wiring of main.ts with testMode = false, mockExecutor = false (like `npm start`): the executor list
// has only Claude, a Mock loop is rejected at the field, the /api/__test/* routes do not exist. Mock is left for tests only.
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { composeServer, type ComposedServer } from '../../server/compose';
import { TEST_DB_URL, TEST_REPO_DIR } from '../support/api-kit';

let server: ComposedServer;
let pool: pg.Pool;
beforeAll(async () => {
  server = await composeServer({ databaseUrl: TEST_DB_URL, testMode: false, mockExecutor: false, dbWaitMs: 5000 });
  pool = new pg.Pool({ connectionString: TEST_DB_URL, max: 1 });
  await pool.query('TRUNCATE run_logs, runs, loop_executions, loops, repos');
});
afterAll(async () => {
  await server?.shutdown();
  await pool?.end();
});

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
async function call(method: 'GET' | 'POST', url: string, payload?: unknown) {
  const res = await server.app.inject({ method, url, ...(payload === undefined ? {} : { payload: payload as Json }) });
  return { status: res.statusCode, body: (res.body ? res.json() : null) as Json };
}

describe('real console: only the Claude executor', () => {
  it('GET /api/executors has only claude; a loop without an executor -> claude opus / medium; a Mock loop -> 400 unknownExecutor, nothing written to the DB', async () => {
    expect((await call('GET', '/api/executors')).body.items.map((e: Json) => e.kind)).toEqual(['claude']);
    const repo = (await call('POST', '/api/repos', { path: TEST_REPO_DIR, name: 'repo' })).body;
    const base = { name: 'real', prompt: 'p', repoId: repo.id, cron: '0 0 1 1 *' };
    const ok = await call('POST', '/api/loops', base);
    expect([ok.status, ok.body.executor]).toEqual([201, { kind: 'claude', config: { model: 'opus', effort: 'medium' } }]);
    const mock = await call('POST', '/api/loops', { ...base, name: 'mock', executor: { kind: 'mock' } });
    expect([mock.status, mock.body.error.code, mock.body.error.details.issues.map((i: Json) => `${i.field}:${i.code}`)]).toEqual([
      400, 'VALIDATION_FAILED', ['executor.kind:unknownExecutor'],
    ]);
    expect((await pool.query('SELECT executor_kind FROM loops ORDER BY name')).rows).toEqual([{ executor_kind: 'claude' }]);
  });

  it('no test-mode routes', async () => {
    expect((await call('POST', '/api/__test/reset')).status).toBe(404);
    expect((await call('POST', '/api/__test/dirs', { paths: {} })).status).toBe(404);
  });
});
