// History API (executions, runs, logs - UC-06, 07, 08) + schedule preview + executor. Cross-checked with SELECT.
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loopBody, resetApi, MOCK_TICK_MS, startApi, testPool, type ApiServer } from '../support/api-kit';
import { viScheduleGolden } from '../../shared/i18n/vi';

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
beforeEach(async () => {
  await resetApi(server);
});

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
async function call(method: 'GET' | 'POST', url: string, payload?: unknown) {
  const res = await server.app.inject({ method, url, ...(payload === undefined ? {} : { payload: payload as Json }) });
  return { status: res.statusCode, body: (res.body ? res.json() : null) as Json };
}
const MISSING = '00000000-0000-4000-8000-000000000000';

/** A loop with `n` executions, each with one run stopped once it has a session id. Returns the loop + run ids in order. */
async function loopWithExecutions(n: number) {
  const loop = (await call('POST', '/api/loops', loopBody())).body;
  const runIds: string[] = [];
  for (let i = 0; i < n; i++) {
    const runId = (await call('POST', `/api/loops/${loop.id}/start`)).body.activeRun.id as string;
    await vi.waitFor(async () => expect((await call('GET', `/api/runs/${runId}`)).body.sessionId).toMatch(/^mock-/));
    await call('POST', `/api/loops/${loop.id}/stop`);
    runIds.push(runId);
  }
  return { loop, runIds };
}

describe('GET /api/loops/:id/executions', () => {
  it('newest first, cursor pagination, per-execution stats', async () => {
    const { loop } = await loopWithExecutions(3);
    const p1 = await call('GET', `/api/loops/${loop.id}/executions?limit=2`);
    expect(p1.status).toBe(200);
    expect(p1.body.items.map((e: Json) => e.seq)).toEqual([3, 2]);
    expect(p1.body.items[0]).toMatchObject({ endReason: 'stopped', stats: { runs: 1, cancelled: 1, running: 0 } });
    expect(p1.body.nextCursor).toEqual(expect.any(String));
    const p2 = await call('GET', `/api/loops/${loop.id}/executions?limit=2&cursor=${p1.body.nextCursor}`);
    expect(p2.body.items.map((e: Json) => e.seq)).toEqual([1]);
    expect(p2.body.nextCursor).toBeNull();
  });

  it('bad cursor → 400 VALIDATION_FAILED at the cursor field; limit outside 1-100 → 400 at the limit field; unknown loop → 404', async () => {
    const { loop } = await loopWithExecutions(1);
    const bad = await call('GET', `/api/loops/${loop.id}/executions?cursor=garbage`);
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatchObject({ code: 'VALIDATION_FAILED', details: { issues: [{ field: 'cursor', code: 'invalid' }] } });
    const limit = await call('GET', `/api/loops/${loop.id}/executions?limit=0`);
    expect(limit.status).toBe(400);
    expect(limit.body.error.details.issues).toEqual([expect.objectContaining({ field: 'limit' })]);
    const missing = await call('GET', `/api/loops/${MISSING}/executions`);
    expect([missing.status, missing.body.error.code]).toEqual([404, 'LOOP_NOT_FOUND']);
  });
});

describe('GET /api/executions/:id (UC-08)', () => {
  it('runs + sessionIds = SELECT session_id FROM runs WHERE execution_id = … (a cancelled run still has a session id)', async () => {
    const { loop } = await loopWithExecutions(2);
    const execs = (await pool.query('SELECT id, seq FROM loop_executions WHERE loop_id = $1 ORDER BY seq', [loop.id])).rows;
    for (const e of execs) {
      const res = await call('GET', `/api/executions/${e.id}`);
      expect(res.status).toBe(200);
      const db = (await pool.query('SELECT id, session_id FROM runs WHERE execution_id = $1 ORDER BY started_at', [e.id])).rows;
      expect(res.body.sessionIds).toEqual(db.map((r) => r.session_id));
      expect(res.body.sessionIds).toHaveLength(1);
      expect(res.body.runs.map((r: Json) => r.id)).toEqual(db.map((r) => r.id));
      expect(res.body).toMatchObject({ seq: e.seq, endReason: 'stopped', runs: [{ status: 'cancelled' }] });
    }
  });

  it('unknown → 404 EXECUTION_NOT_FOUND (also for an id that is not a uuid)', async () => {
    for (const id of [MISSING, 'abc']) {
      const res = await call('GET', `/api/executions/${id}`);
      expect([res.status, res.body.error.code]).toEqual([404, 'EXECUTION_NOT_FOUND']);
    }
  });
});

describe('GET /api/loops/:id/runs · /api/runs/:id (UC-06, UC-07)', () => {
  it('newest run first, pagination, total = SELECT count(*)', async () => {
    const { loop, runIds } = await loopWithExecutions(3);
    const p1 = await call('GET', `/api/loops/${loop.id}/runs?limit=2`);
    expect(p1.body.items.map((r: Json) => r.id)).toEqual([runIds[2], runIds[1]]);
    const p2 = await call('GET', `/api/loops/${loop.id}/runs?limit=2&cursor=${p1.body.nextCursor}`);
    expect(p2.body.items.map((r: Json) => r.id)).toEqual([runIds[0]]);
    expect(p2.body.nextCursor).toBeNull();
    const n = Number((await pool.query('SELECT count(*) AS n FROM runs WHERE loop_id = $1', [loop.id])).rows[0].n);
    expect(p1.body.items.length + p2.body.items.length).toBe(n);
    expect((await call('GET', `/api/loops/${MISSING}/runs`)).status).toBe(404);
  });

  it('run detail: status, timestamps, session id, prompt used - matches the DB', async () => {
    const { runIds } = await loopWithExecutions(1);
    const res = await call('GET', `/api/runs/${runIds[0]}`);
    expect(res.status).toBe(200);
    const row = (await pool.query('SELECT * FROM runs WHERE id = $1', [runIds[0]])).rows[0];
    expect(res.body).toMatchObject({
      status: 'cancelled',
      iteration: 1,
      trigger: 'start',
      sessionId: row.session_id,
      promptSnapshot: 'Do task A then B',
      startedAt: row.started_at.toISOString(),
      finishedAt: row.finished_at.toISOString(),
    });
    const missing = await call('GET', `/api/runs/${MISSING}`);
    expect([missing.status, missing.body.error.code]).toEqual([404, 'RUN_NOT_FOUND']);
  });
});

describe('GET /api/runs/:id/logs (UC-07)', () => {
  it('all logs in the same order as the DB, even after the run finishes; ?after= skips old lines', async () => {
    const loop = (await call('POST', '/api/loops', loopBody({ executor: { kind: 'mock', config: { durationSec: 3 } } }))).body;
    const runId = (await call('POST', `/api/loops/${loop.id}/start`)).body.activeRun.id as string;
    await vi.waitFor(async () => expect((await call('GET', `/api/runs/${runId}`)).body.status).toBe('succeeded'), {
      timeout: 40 * MOCK_TICK_MS + 3000,
    });
    const res = await call('GET', `/api/runs/${runId}/logs`);
    expect(res.status).toBe(200);
    expect(res.body.items.map((l: Json) => l.message)).toEqual([
      'Start round #1 — prompt: «Do task A then B»',
      'working… (1/3)',
      'working… (2/3)',
      'working… (3/3)',
      'Done (simulated)',
    ]);
    const db = (await pool.query('SELECT seq, message FROM run_logs WHERE run_id = $1 ORDER BY seq', [runId])).rows;
    expect(res.body.items.map((l: Json) => [l.seq, l.message])).toEqual(db.map((r) => [r.seq, r.message]));
    const after = await call('GET', `/api/runs/${runId}/logs?after=3`);
    expect(after.body.items.map((l: Json) => l.seq)).toEqual([4, 5]);
    expect((await call('GET', `/api/runs/${runId}/logs?after=-1`)).status).toBe(400);
    expect((await call('GET', `/api/runs/${MISSING}/logs`)).body.error.code).toBe('RUN_NOT_FOUND');
  });
});

describe('GET /api/schedule/preview', () => {
  it('sentence + 5 next runs in the time zone + warnings; English by default, lang=vi switches', async () => {
    const def = await call('GET', '/api/schedule/preview?cron=30%208%20*%20*%201,3,5&tz=Asia/Ho_Chi_Minh');
    expect(def.status).toBe(200);
    expect(def.body.cron).toBe('30 8 * * 1,3,5');
    expect(def.body.description).toBe('At 08:30 on Monday, Wednesday, Friday');
    const vn = await call('GET', '/api/schedule/preview?cron=30%208%20*%20*%201,3,5&tz=Asia/Ho_Chi_Minh&lang=vi');
    expect(vn.body.description).toBe(viScheduleGolden['30 8 * * 1,3,5']);
    expect(def.body.nextRuns).toHaveLength(5);
    for (const at of def.body.nextRuns as string[]) {
      const d = new Date(at);
      expect([d.getUTCHours(), d.getUTCMinutes()]).toEqual([1, 30]); // 08:30 Vietnam time = 01:30 UTC
      expect(d.getTime()).toBeGreaterThan(Date.now());
    }
    const en = await call('GET', '/api/schedule/preview?cron=*/7%20*%20*%20*%20*&lang=en');
    expect(en.body.description).toMatch(/7 minutes/i);
    expect(en.body.warnings.map((w: Json) => w.code)).toContain('unevenMinuteStep');
  });

  it('bad cron → 400 INVALID_CRON; bad time zone → 400 VALIDATION_FAILED at the tz field; missing cron → 400 required', async () => {
    const bad = await call('GET', '/api/schedule/preview?cron=61%20*%20*%20*%20*');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('INVALID_CRON');
    expect(bad.body.error.details).toMatchObject({ field: 'minute' });
    const tz = await call('GET', '/api/schedule/preview?cron=*%20*%20*%20*%20*&tz=Mars/Olympus');
    expect(tz.status).toBe(400);
    expect(tz.body.error).toMatchObject({ code: 'VALIDATION_FAILED', details: { issues: [{ field: 'tz', code: 'invalid' }] } });
    const none = await call('GET', '/api/schedule/preview');
    expect(none.body.error).toMatchObject({ code: 'VALIDATION_FAILED', details: { issues: [{ field: 'cron', code: 'required' }] } });
  });
});

describe('GET /api/executors', () => {
  it("test mode: Claude first (the form's picker) then Mock (test only), each executor with its config JSON Schema (Mock: durationSec 1-600 default 10, failRate 0-100; Claude: model / effort default opus / medium)", async () => {
    const res = await call('GET', '/api/executors');
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([
      expect.objectContaining({
        kind: 'claude',
        cancelWithinMs: 3000,
        configSchema: expect.objectContaining({
          type: 'object',
          properties: {
            model: expect.objectContaining({ enum: ['opus', 'sonnet', 'haiku'], default: 'opus' }),
            effort: expect.objectContaining({ enum: ['low', 'medium', 'high', 'xhigh', 'max'], default: 'medium' }),
          },
        }),
      }),
      expect.objectContaining({
        kind: 'mock',
        cancelWithinMs: 1000,
        configSchema: expect.objectContaining({
          type: 'object',
          properties: {
            durationSec: expect.objectContaining({ type: 'integer', minimum: 1, maximum: 600, default: 10 }),
            failRate: expect.objectContaining({ minimum: 0, maximum: 100, default: 0 }),
          },
        }),
      }),
    ]);
  });
});
