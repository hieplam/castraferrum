// Loop API (SPEC section API contract): every route + every error code, on the real server (composeServer) + test Postgres.
// Results are cross-checked with a SELECT straight on the DB - a route returning hard-coded JSON is caught at once.
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loopBody, resetApi, startApi, testPool, type ApiServer } from '../support/api-kit';

let server: ApiServer;
let pool: pg.Pool;
beforeAll(async () => {
  server = await startApi();
  pool = testPool();
});
afterAll(async () => {
  await server?.shutdown();
  await pool?.end();
});
let repoId: string;
beforeEach(async () => {
  repoId = await resetApi(server);
});

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
async function call(method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) {
  const res = await server.app.inject({ method, url, ...(payload === undefined ? {} : { payload: payload as Json }) });
  return { status: res.statusCode, body: (res.body ? res.json() : null) as Json };
}
async function create(over: Record<string, unknown> = {}): Promise<Json> {
  const res = await call('POST', '/api/loops', loopBody(over));
  expect(res.status).toBe(201);
  return res.body;
}
const count = async (sql: string, params: unknown[] = []) => Number((await pool.query(sql, params)).rows[0].n);
const MISSING = '00000000-0000-4000-8000-000000000000';

describe('POST /api/loops (UC-01)', () => {
  it('201 -> loop Stopped, version 1, every field exactly as in the DB', async () => {
    const loop = await create({ name: 'Morning report', cron: '30 8 * * 1,3,5', executor: { kind: 'mock', config: { durationSec: 5 } } });
    expect(loop).toMatchObject({
      name: 'Morning report',
      cron: '30 8 * * 1,3,5',
      timezone: 'Asia/Ho_Chi_Minh',
      timeoutSec: 600,
      status: 'stopped',
      nextRunAt: null,
      version: 1,
      iterations: 0,
      executionCount: 0,
      currentExecution: null,
      activeRun: null,
      lastRun: null,
      archivedAt: null,
      executor: { kind: 'mock', config: { durationSec: 5, failRate: 0 } }, // config missing a field -> the schema default
    });
    expect(loop.createdAt).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    const row = (await pool.query('SELECT * FROM loops WHERE id = $1', [loop.id])).rows[0];
    expect(row).toMatchObject({ name: 'Morning report', cron: '30 8 * * 1,3,5', status: 'stopped', version: 1, executor_kind: 'mock' });
    expect(row.executor_config).toEqual({ durationSec: 5, failRate: 0 });
  });

  it('optional fields left empty -> the spec defaults (timezone, unlimited timeout, executor claude opus / medium)', async () => {
    const res = await call('POST', '/api/loops', { name: 'Minimal', prompt: 'p', repoId: repoId, cron: '*/15 * * * *' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      description: '',
      timezone: 'Asia/Ho_Chi_Minh',
      timeoutSec: null,
      executor: { kind: 'claude', config: { model: 'opus', effort: 'medium' } },
    });
    expect((await pool.query('SELECT timeout_sec FROM loops WHERE id = $1', [res.body.id])).rows[0].timeout_sec).toBeNull();
  });

  it('bad data -> 400 VALIDATION_FAILED, issues per field, nothing created in the DB', async () => {
    const res = await call('POST', '/api/loops', {
      name: '  ',
      prompt: 'x'.repeat(20_001),
      cron: '61 * * * *',
      timezone: 'Mars/Olympus',
      timeoutSec: 30,
      executor: { kind: 'mock', config: { durationSec: 0 } },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    const issues = res.body.error.details.issues as { field: string; code: string }[];
    expect(issues.map((i) => [i.field, i.code])).toEqual([
      ['name', 'required'],
      ['prompt', 'tooLong'],
      ['repoId', 'required'],
      ['cron', 'invalid'],
      ['timezone', 'invalid'],
      ['timeoutSec', 'outOfRange'],
      ['executor.config.durationSec', 'invalid'],
    ]);
    expect(await count('SELECT count(*) AS n FROM loops')).toBe(0);
  });

  it('nonexistent executor -> issue executor.kind unknownExecutor', async () => {
    const res = await call('POST', '/api/loops', loopBody({ executor: { kind: 'claude-agent-sdk' } }));
    expect(res.status).toBe(400);
    expect(res.body.error.details.issues).toEqual([expect.objectContaining({ field: 'executor.kind', code: 'unknownExecutor' })]);
  });

  it('wrong type / missing required field -> 400 VALIDATION_FAILED, issues per field (required / invalid)', async () => {
    const res = await call('POST', '/api/loops', { name: 123, cron: '* * * * *', timeoutSec: '60' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    const byField = Object.fromEntries((res.body.error.details.issues as { field: string; code: string }[]).map((i) => [i.field, i.code]));
    expect(byField).toEqual({ name: 'invalid', prompt: 'required', timeoutSec: 'invalid' });
    expect(await count('SELECT count(*) AS n FROM loops')).toBe(0);
  });

  it('broken JSON -> 400 VALIDATION_FAILED (not 500)', async () => {
    const res = await server.app.inject({
      method: 'POST',
      url: '/api/loops',
      headers: { 'content-type': 'application/json' },
      payload: '{"name":',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'VALIDATION_FAILED', details: { issues: [{ field: 'body' }] } } });
  });

  it('duplicate name (case-insensitive) -> 409 LOOP_NAME_TAKEN', async () => {
    await create({ name: 'Clean logs' });
    const res = await call('POST', '/api/loops', loopBody({ name: 'CLEAN LOGS' }));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LOOP_NAME_TAKEN');
    expect(await count('SELECT count(*) AS n FROM loops')).toBe(1);
  });
});

describe('GET /api/loops (UC-03)', () => {
  it('list newest first + status / q / archived filters', async () => {
    const a = await create({ name: 'Alpha build' });
    const b = await create({ name: 'Beta test' });
    const c = await create({ name: 'Gamma build' });
    await call('POST', `/api/loops/${b.id}/start`);
    await call('POST', `/api/loops/${c.id}/archive`);

    const all = await call('GET', '/api/loops');
    expect(all.status).toBe(200);
    expect(all.body.items.map((l: Json) => l.name)).toEqual(['Beta test', 'Alpha build']); // archived hidden by default
    expect((await call('GET', '/api/loops?status=active')).body.items.map((l: Json) => l.id)).toEqual([b.id]);
    expect((await call('GET', '/api/loops?status=stopped')).body.items.map((l: Json) => l.id)).toEqual([a.id]);
    expect((await call('GET', '/api/loops?q=BUILD')).body.items.map((l: Json) => l.id)).toEqual([a.id]);
    expect((await call('GET', '/api/loops?archived=true')).body.items.map((l: Json) => l.id)).toEqual([c.id]);
    expect((await call('GET', '/api/loops?archived=false')).body.items).toHaveLength(2);
  });

  it('current execution stats + active run match the DB', async () => {
    const loop = await create();
    await call('POST', `/api/loops/${loop.id}/start`);
    const [row] = (await call('GET', '/api/loops')).body.items;
    expect(row.status).toBe('active');
    expect(row.currentExecution).toMatchObject({ seq: 1, endedAt: null, stats: { runs: 1, running: 1 } });
    const db = (await pool.query("SELECT id, iteration FROM runs WHERE loop_id = $1 AND status = 'running'", [loop.id])).rows;
    expect(row.activeRun).toMatchObject({ id: db[0].id, iteration: 1, trigger: 'start', status: 'running' });
    expect(row.nextRunAt).not.toBeNull();
  });

  it('bad query -> 400 VALIDATION_FAILED at the status field', async () => {
    const res = await call('GET', '/api/loops?status=paused');
    expect(res.status).toBe(400);
    expect(res.body.error.details.issues).toEqual([expect.objectContaining({ field: 'status', code: 'invalid' })]);
  });
});

describe('GET /api/loops/:id (UC-06)', () => {
  it('200 detail + longest execution', async () => {
    const loop = await create();
    await call('POST', `/api/loops/${loop.id}/start`);
    await call('POST', `/api/loops/${loop.id}/stop`);
    const res = await call('GET', `/api/loops/${loop.id}`);
    expect(res.status).toBe(200);
    const exec = (await pool.query('SELECT id FROM loop_executions WHERE loop_id = $1', [loop.id])).rows[0];
    expect(res.body).toMatchObject({ id: loop.id, executionCount: 1, longestExecution: { executionId: exec.id, seq: 1 }, runCount: 1 });
  });

  it('nonexistent -> 404 LOOP_NOT_FOUND (also an id that is not a uuid)', async () => {
    for (const id of [MISSING, 'not-a-uuid']) {
      const res = await call('GET', `/api/loops/${id}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('LOOP_NOT_FOUND');
    }
  });
});

describe('PUT /api/loops/:id (UC-09)', () => {
  it('200 -> version + 1, the DB changes the right fields', async () => {
    const loop = await create({ name: 'Old' });
    const res = await call('PUT', `/api/loops/${loop.id}`, { ...loopBody({ name: 'New', cron: '0 9 * * *' }), version: 1 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'New', cron: '0 9 * * *', version: 2 });
    expect((await pool.query('SELECT name, cron, version FROM loops WHERE id = $1', [loop.id])).rows[0]).toEqual({
      name: 'New',
      cron: '0 9 * * *',
      version: 2,
    });
  });

  it('stale version (edited from a second tab) -> 409 VERSION_CONFLICT, no overwrite', async () => {
    const loop = await create({ name: 'Tab' });
    expect((await call('PUT', `/api/loops/${loop.id}`, { ...loopBody({ name: 'Tab A' }), version: 1 })).status).toBe(200);
    const res = await call('PUT', `/api/loops/${loop.id}`, { ...loopBody({ name: 'Tab B' }), version: 1 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('VERSION_CONFLICT');
    expect((await pool.query('SELECT name FROM loops WHERE id = $1', [loop.id])).rows[0].name).toBe('Tab A');
  });

  it('missing version -> 400 VALIDATION_FAILED at the version field; bad data -> 400 at its field', async () => {
    const loop = await create();
    const noVersion = await call('PUT', `/api/loops/${loop.id}`, loopBody());
    expect(noVersion.status).toBe(400);
    expect(noVersion.body.error.details.issues).toEqual([expect.objectContaining({ field: 'version', code: 'required' })]);
    const bad = await call('PUT', `/api/loops/${loop.id}`, { ...loopBody({ cron: 'every morning' }), version: 1 });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.issues).toEqual([expect.objectContaining({ field: 'cron', code: 'invalid' })]);
  });

  it('nonexistent -> 404 LOOP_NOT_FOUND', async () => {
    const res = await call('PUT', `/api/loops/${MISSING}`, { ...loopBody(), version: 1 });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('LOOP_NOT_FOUND');
  });
});

describe('POST /api/loops/:id/start | /stop (UC-04, UC-05)', () => {
  it('Start -> execution #1 opens + round #1 runs at once (trigger start); second Start -> 409 LOOP_ALREADY_ACTIVE', async () => {
    const loop = await create();
    const res = await call('POST', `/api/loops/${loop.id}/start`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'active', executionCount: 1, currentExecution: { seq: 1, endedAt: null } });
    expect(res.body.activeRun).toMatchObject({ iteration: 1, trigger: 'start', status: 'running' });
    expect(await count("SELECT count(*) AS n FROM loop_executions WHERE loop_id = $1 AND ended_at IS NULL", [loop.id])).toBe(1);
    expect(await count("SELECT count(*) AS n FROM runs WHERE loop_id = $1 AND status = 'running'", [loop.id])).toBe(1);

    const again = await call('POST', `/api/loops/${loop.id}/start`);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('LOOP_ALREADY_ACTIVE');
    expect(await count('SELECT count(*) AS n FROM loop_executions WHERE loop_id = $1', [loop.id])).toBe(1);
  });

  it('Stop -> the running run is cancelled (has a session id), the execution closes as stopped; second Stop -> 409 LOOP_NOT_ACTIVE', async () => {
    const loop = await create();
    const started = (await call('POST', `/api/loops/${loop.id}/start`)).body;
    const runId = started.activeRun.id as string;
    await vi.waitFor(async () => expect((await call('GET', `/api/runs/${runId}`)).body.sessionId).toMatch(/^mock-/));

    const res = await call('POST', `/api/loops/${loop.id}/stop`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'stopped', nextRunAt: null, activeRun: null, currentExecution: { seq: 1, endReason: 'stopped' } });
    const run = (await pool.query('SELECT status, session_id FROM runs WHERE id = $1', [runId])).rows[0];
    expect(run.status).toBe('cancelled');
    expect(run.session_id).toMatch(/^mock-/);
    expect((await pool.query('SELECT end_reason FROM loop_executions WHERE loop_id = $1', [loop.id])).rows[0].end_reason).toBe('stopped');

    const again = await call('POST', `/api/loops/${loop.id}/stop`);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('LOOP_NOT_ACTIVE');
  });

  it('nonexistent -> 404 LOOP_NOT_FOUND for start / stop / duplicate / archive / restore', async () => {
    for (const action of ['start', 'stop', 'duplicate', 'archive', 'restore']) {
      const res = await call('POST', `/api/loops/${MISSING}/${action}`);
      expect([action, res.status, res.body.error.code]).toEqual([action, 404, 'LOOP_NOT_FOUND']);
    }
  });
});

describe('POST /api/loops/:id/duplicate | /archive | /restore (UC-10, UC-11)', () => {
  it('duplicate -> 201 "... (copy)" Stopped, carrying no executions; second time -> "(copy 2)"', async () => {
    const loop = await create({ name: 'Original' });
    await call('POST', `/api/loops/${loop.id}/start`);
    const copy = await call('POST', `/api/loops/${loop.id}/duplicate`);
    expect(copy.status).toBe(201);
    expect(copy.body).toMatchObject({ name: 'Original (copy)', status: 'stopped', executionCount: 0, iterations: 0, currentExecution: null });
    expect(await count('SELECT count(*) AS n FROM loop_executions WHERE loop_id = $1', [copy.body.id])).toBe(0);
    expect((await call('POST', `/api/loops/${loop.id}/duplicate`)).body.name).toBe('Original (copy 2)');
  });

  it('archive a running loop -> 409 LOOP_IS_ACTIVE; stopped -> 204; Start an archived loop -> 409 LOOP_ARCHIVED; restore -> 200', async () => {
    const loop = await create();
    await call('POST', `/api/loops/${loop.id}/start`);
    const busy = await call('POST', `/api/loops/${loop.id}/archive`);
    expect(busy.status).toBe(409);
    expect(busy.body.error.code).toBe('LOOP_IS_ACTIVE');

    await call('POST', `/api/loops/${loop.id}/stop`);
    const archived = await server.app.inject({ method: 'POST', url: `/api/loops/${loop.id}/archive` });
    expect(archived.statusCode).toBe(204);
    expect(archived.body).toBe('');
    expect((await pool.query('SELECT archived_at FROM loops WHERE id = $1', [loop.id])).rows[0].archived_at).not.toBeNull();

    const start = await call('POST', `/api/loops/${loop.id}/start`);
    expect(start.status).toBe(409);
    expect(start.body.error.code).toBe('LOOP_ARCHIVED');

    const restored = await call('POST', `/api/loops/${loop.id}/restore`);
    expect(restored.status).toBe(200);
    expect(restored.body).toMatchObject({ archivedAt: null, status: 'stopped' });
  });

  it('restore while a live loop of the same name exists -> 409 LOOP_NAME_TAKEN', async () => {
    const old = await create({ name: 'Dup' });
    await call('POST', `/api/loops/${old.id}/archive`);
    await create({ name: 'dup' });
    const res = await call('POST', `/api/loops/${old.id}/restore`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LOOP_NAME_TAKEN');
  });
});

describe('unknown path', () => {
  it('-> 404 NOT_FOUND in the standard error shape', async () => {
    const res = await call('DELETE' as 'GET', '/api/loops');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('maxConcurrent - run at most N runs in parallel', () => {
  it('create with 3 -> 201 + GET returns 3 + DB max_concurrent = 3; PUT changes to 2; left empty -> 1; the loop returns activeRuns', async () => {
    const loop = await create({ maxConcurrent: 3 });
    expect(loop).toMatchObject({ maxConcurrent: 3, activeRuns: [], activeRun: null });
    expect((await call('GET', `/api/loops/${loop.id}`)).body.maxConcurrent).toBe(3);
    expect((await pool.query('SELECT max_concurrent FROM loops WHERE id = $1', [loop.id])).rows[0].max_concurrent).toBe(3);
    const put = await call('PUT', `/api/loops/${loop.id}`, { ...loopBody({ name: loop.name, maxConcurrent: 2 }), version: loop.version });
    expect(put.status).toBe(200);
    expect(put.body.maxConcurrent).toBe(2);
    expect((await pool.query('SELECT max_concurrent FROM loops WHERE id = $1', [loop.id])).rows[0].max_concurrent).toBe(2);
    expect((await create({ name: 'default N' })).maxConcurrent).toBe(1);
  });

  it('0 / 11 / 2.5 -> 400 VALIDATION_FAILED at the maxConcurrent field (outOfRange), nothing written to the DB; text -> 400', async () => {
    for (const bad of [0, 11, 2.5]) {
      const res = await call('POST', '/api/loops', loopBody({ name: `bad ${bad}`, maxConcurrent: bad }));
      expect(res.status).toBe(400);
      expect(res.body.error.details.issues).toEqual([expect.objectContaining({ field: 'maxConcurrent', code: 'outOfRange' })]);
    }
    expect((await call('POST', '/api/loops', loopBody({ name: 'text', maxConcurrent: 'three' }))).status).toBe(400);
    expect(await count('SELECT count(*) n FROM loops')).toBe(0);
  });

  it('Start a loop with N = 2 -> activeRuns has the first run; Stop cancels every running run', async () => {
    const loop = await create({ maxConcurrent: 2, executor: { kind: 'mock', config: { durationSec: 600 } } });
    const started = await call('POST', `/api/loops/${loop.id}/start`);
    expect(started.body.activeRuns.map((r: Json) => r.iteration)).toEqual([1]);
    expect(started.body.activeRun.iteration).toBe(1);
    const stopped = await call('POST', `/api/loops/${loop.id}/stop`);
    expect(stopped.body.activeRuns).toEqual([]);
    expect(await count(`SELECT count(*) n FROM runs WHERE loop_id = $1 AND status = 'running'`, [loop.id])).toBe(0);
  });
});
