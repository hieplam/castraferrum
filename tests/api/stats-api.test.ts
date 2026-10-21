// `GET /api/stats` (UC-03): the overview bar + the loop count of each tab, on the real server (composeServer) + test Postgres.
// Every number is cross-checked with an independent SELECT on the DB - a route returning hard-coded numbers or miscounting the "today" / "24 hours" boundary -> red.
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
beforeEach(async () => {
  await resetApi(server);
});

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
async function call(method: 'GET' | 'POST', url: string, payload?: unknown) {
  const res = await server.app.inject({ method, url, ...(payload === undefined ? {} : { payload: payload as Json }) });
  return { status: res.statusCode, body: (res.body ? res.json() : null) as Json };
}
const vn = (s: string) => new Date(`${s}+07:00`);
const NOW = vn('2026-10-18T14:00:42');

/** Insert a finished (or skipped) run straight into execution `executionId` - builds history straddling the boundaries. */
async function rawRun(loopId: string, executionId: string, iteration: number | null, status: string, startedAt: Date, finishedAt: Date | null) {
  await pool.query(
    `INSERT INTO runs (id, loop_id, execution_id, iteration, trigger, status, skip_reason, started_at, finished_at, duration_ms,
                       prompt_snapshot, executor_kind, executor_config)
     VALUES ($1, $2, $3, $4, 'schedule', $5, $6, $7, $8, $9, 'p', 'mock', '{}')`,
    [
      randomUUID(),
      loopId,
      executionId,
      iteration,
      status,
      status === 'skipped' ? 'round #1 still running' : null,
      startedAt,
      finishedAt,
      finishedAt ? finishedAt.getTime() - startedAt.getTime() : null,
    ],
  );
}

describe('GET /api/stats (UC-03 overview bar)', () => {
  it('UC-03 counts active loops, running runs, runs today (by tz), errors in 24 hours, loops per tab - matches SELECT', async () => {
    expect((await call('POST', '/api/__test/clock', { at: NOW.toISOString() })).status).toBe(200);
    const a = (await call('POST', '/api/loops', loopBody({ name: 'A running' }))).body;
    const b = (await call('POST', '/api/loops', loopBody({ name: 'B stopped' }))).body;
    const c = (await call('POST', '/api/loops', loopBody({ name: 'C archived' }))).body;
    expect((await call('POST', `/api/loops/${a.id}/start`)).status).toBe(200); // first run is running, started "now"
    const bStarted = (await call('POST', `/api/loops/${b.id}/start`)).body;
    expect((await call('POST', `/api/loops/${b.id}/stop`)).status).toBe(200); // first run -> cancelled
    expect((await call('POST', `/api/loops/${c.id}/archive`)).status).toBe(204);
    const ex = bStarted.currentExecution.id as string;

    await rawRun(b.id, ex, 100, 'succeeded', vn('2026-10-18T00:05:00'), vn('2026-10-18T00:09:00')); // today (VN), not today (UTC)
    await rawRun(b.id, ex, 101, 'succeeded', vn('2026-10-17T23:59:00'), vn('2026-10-18T00:03:00')); // yesterday
    await rawRun(b.id, ex, null, 'skipped', vn('2026-10-18T10:00:00'), vn('2026-10-18T10:00:00')); // skipped: not counted
    await rawRun(b.id, ex, 102, 'failed', vn('2026-10-17T14:20:00'), vn('2026-10-17T14:30:00')); // error within 24 hours
    await rawRun(b.id, ex, 103, 'interrupted', vn('2026-10-17T13:50:00'), vn('2026-10-17T13:59:00')); // error older than 24 hours
    await rawRun(b.id, ex, 104, 'timed_out', vn('2026-10-18T10:00:00'), vn('2026-10-18T10:01:00')); // today + error
    await rawRun(b.id, ex, 105, 'cancelled', vn('2026-10-18T11:00:00'), vn('2026-10-18T11:00:05')); // cancelled is not an error

    const res = await call('GET', '/api/stats?tz=Asia/Ho_Chi_Minh');
    expect(res.status).toBe(200);
    const now = new Date(res.body.now);
    expect(now.getTime() - NOW.getTime()).toBeLessThan(10_000);
    expect(res.body.todayFrom).toBe(vn('2026-10-18T00:00:00').toISOString());
    expect(res.body.timezone).toBe('Asia/Ho_Chi_Minh');

    // SELECTs independent of the repository code.
    const n = async (sql: string, params: unknown[] = []) => Number((await pool.query(sql, params)).rows[0].n);
    const expected = {
      activeLoops: await n(`SELECT count(*) n FROM loops WHERE status = 'active' AND archived_at IS NULL`),
      runningRuns: await n(`SELECT count(*) n FROM runs WHERE status = 'running'`),
      runsToday: await n(`SELECT count(*) n FROM runs WHERE status <> 'skipped' AND started_at >= $1`, [vn('2026-10-18T00:00:00')]),
      errors24h: await n(`SELECT count(*) n FROM runs WHERE status IN ('failed','timed_out','interrupted') AND finished_at >= $1`, [
        new Date(now.getTime() - 86_400_000),
      ]),
      loops: {
        all: await n(`SELECT count(*) n FROM loops WHERE archived_at IS NULL`),
        active: await n(`SELECT count(*) n FROM loops WHERE archived_at IS NULL AND status = 'active'`),
        stopped: await n(`SELECT count(*) n FROM loops WHERE archived_at IS NULL AND status = 'stopped'`),
        archived: await n(`SELECT count(*) n FROM loops WHERE archived_at IS NOT NULL`),
      },
    };
    expect(res.body).toMatchObject(expected);
    // And the hand-computed numbers: today = A's run + B's cancelled run + 00:05 + timed_out + cancelled 11:00.
    expect(res.body).toMatchObject({ activeLoops: 1, runningRuns: 1, runsToday: 5, errors24h: 2, loops: { all: 2, active: 1, stopped: 1, archived: 1 } });

    // Another timezone -> another "today" boundary: 0:00 UTC = 07:00 VN time, the 00:05 (VN) run is no longer today.
    const utc = await call('GET', '/api/stats?tz=UTC');
    expect(utc.body.todayFrom).toBe('2026-10-18T00:00:00.000Z');
    expect(utc.body.runsToday).toBe(4);
    expect(utc.body.errors24h).toBe(2);
  });

  it('no tz passed -> Asia/Ho_Chi_Minh; empty DB -> every number 0', async () => {
    const res = await call('GET', '/api/stats');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ activeLoops: 0, runningRuns: 0, runsToday: 0, errors24h: 0, loops: { all: 0, active: 0, stopped: 0, archived: 0 }, timezone: 'Asia/Ho_Chi_Minh' });
  });

  it('wrong timezone -> 400 VALIDATION_FAILED at the tz field', async () => {
    const res = await call('GET', '/api/stats?tz=Mars/Olympus');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details.issues).toEqual([{ field: 'tz', code: 'invalid', message: expect.any(String) }]);
  });
});
