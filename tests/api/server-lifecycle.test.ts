// Server lifecycle through the exact wiring of main.ts (composeServer): test-mode routes exist only with LOOPS_TEST_MODE, the
// real ticker + a fast-forward clock, graceful shutdown then restart (UC-15), the one-DB-one-server lock. Each test starts / stops its own server.
import type pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { InstanceLockTakenError } from '../../server/adapters/postgres/instance-lock';
import { loopBody, openSse, resetApi, startApi, testPool, type ApiServer } from '../support/api-kit';

let pool: pg.Pool;
const live: ApiServer[] = [];
beforeAll(() => {
  pool = testPool();
});
afterEach(async () => {
  for (const s of live.splice(0).reverse()) await s.shutdown();
});
afterAll(async () => {
  await pool?.end();
});

async function boot(testMode = true): Promise<ApiServer> {
  const s = await startApi({ testMode });
  live.push(s);
  return s;
}
async function stop(s: ApiServer): Promise<void> {
  await s.shutdown();
  live.splice(live.indexOf(s), 1);
}
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
async function call(s: ApiServer, method: 'GET' | 'POST', url: string, payload?: unknown) {
  const res = await s.app.inject({ method, url, ...(payload === undefined ? {} : { payload: payload as Json }) });
  return { status: res.statusCode, body: (res.body ? res.json() : null) as Json };
}
const rows = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows;
/** Wait for the ticker to run `n` more ticks - by the tick counter, no hard sleep. */
const ticksPass = (s: ApiServer, n: number) => {
  const from = s.inspect.ticks();
  return vi.waitFor(() => expect(s.inspect.ticks()).toBeGreaterThanOrEqual(from + n), { timeout: 5000 });
};

describe('test-mode routes', () => {
  it('normal run (no LOOPS_TEST_MODE) → /api/__test/reset, /api/__test/clock are 404 NOT_FOUND', async () => {
    const s = await boot(false);
    for (const url of ['/api/__test/reset', '/api/__test/clock']) {
      const res = await call(s, 'POST', url, {});
      expect([url, res.status, res.body.error.code]).toEqual([url, 404, 'NOT_FOUND']);
    }
  });

  it('reset → stops the running run + empties every table + clock back to real time', async () => {
    const s = await boot();
    await resetApi(s);
    const loop = (await call(s, 'POST', '/api/loops', loopBody())).body;
    await call(s, 'POST', `/api/loops/${loop.id}/start`);
    await call(s, 'POST', '/api/__test/clock', { advanceMs: 3_600_000 });
    expect(s.inspect.activeRuns()).toBe(1);

    expect((await call(s, 'POST', '/api/__test/reset')).status).toBe(204);
    expect(s.inspect.activeRuns()).toBe(0);
    for (const table of ['repos', 'loops', 'loop_executions', 'runs', 'run_logs']) {
      expect([table, Number((await rows(`SELECT count(*) AS n FROM ${table}`))[0].n)]).toEqual([table, 0]);
    }
    const preview = await call(s, 'GET', '/api/schedule/preview?cron=*%20*%20*%20*%20*');
    expect(Math.abs(new Date(preview.body.nextRuns[0]).getTime() - Date.now())).toBeLessThan(61_000);
  });

  it('clock: advance / set a point in time → server time follows; bad body → 400 VALIDATION_FAILED', async () => {
    const s = await boot();
    const at = '2030-01-01T00:00:00.000Z';
    const set = await call(s, 'POST', '/api/__test/clock', { at });
    expect(set.status).toBe(200);
    expect(new Date(set.body.now).getTime() - Date.parse(at)).toBeLessThan(1000);
    const adv = await call(s, 'POST', '/api/__test/clock', { advanceMs: 86_400_000 });
    expect(new Date(adv.body.now).getTime() - Date.parse(at)).toBeGreaterThanOrEqual(86_400_000);
    const preview = await call(s, 'GET', '/api/schedule/preview?cron=0%200%201%201%20*&tz=UTC');
    expect(preview.body.nextRuns[0]).toBe('2031-01-01T00:00:00.000Z');
    const bad = await call(s, 'POST', '/api/__test/clock', { advanceMs: 'tomorrow' });
    expect([bad.status, bad.body.error.code]).toEqual([400, 'VALIDATION_FAILED']);
    await resetApi(s);
  });
});

describe('real ticker (UC-12 via API)', () => {
  it('advance to the cron tick while round #1 is still running → ticker records a skipped run "round #1 still running"', async () => {
    const s = await boot();
    await resetApi(s);
    const loop = (await call(s, 'POST', '/api/loops', loopBody({ cron: '* * * * *' }))).body;
    const started = (await call(s, 'POST', `/api/loops/${loop.id}/start`)).body;
    await call(s, 'POST', '/api/__test/clock', { advanceMs: 61_000 });
    await vi.waitFor(async () => {
      const runs = (await call(s, 'GET', `/api/loops/${loop.id}/runs`)).body.items as Json[];
      expect(runs.map((r) => [r.status, r.trigger])).toEqual([
        ['skipped', 'schedule'],
        ['running', 'start'],
      ]);
      expect(runs[0]).toMatchObject({ skipReason: 'round #1 still running', iteration: null, sessionId: null });
    });
    const db = await rows('SELECT status FROM runs WHERE execution_id = $1 ORDER BY started_at', [started.currentExecution.id]);
    expect(db.map((r) => r.status)).toEqual(['running', 'skipped']);
    await resetApi(s);
  });
});

describe('restart (UC-15)', () => {
  it('graceful shutdown while running → restart: loop stopped, run interrupted, execution server_down at the shutdown heartbeat, no new run', async () => {
    const a = await boot();
    await resetApi(a);
    const loop = (await call(a, 'POST', '/api/loops', loopBody({ cron: '* * * * *' }))).body;
    const started = (await call(a, 'POST', `/api/loops/${loop.id}/start`)).body;
    const runId = started.activeRun.id as string;
    await vi.waitFor(async () => expect((await call(a, 'GET', `/api/runs/${runId}`)).body.sessionId).toMatch(/^mock-/));
    const beforeStop = Date.now();
    await stop(a);
    const afterStop = Date.now();
    // Graceful shutdown does not record a run result: the DB is left as if the server died, the next start handles it.
    expect((await rows('SELECT status FROM runs WHERE id = $1', [runId]))[0].status).toBe('running');
    const beats = await rows('SELECT beat_at FROM server_heartbeat');
    expect(beats, 'graceful shutdown must write the last heartbeat').toHaveLength(1);
    const beat = beats[0].beat_at as Date;
    expect(beat.getTime()).toBeGreaterThanOrEqual(beforeStop);
    expect(beat.getTime()).toBeLessThanOrEqual(afterStop);

    const b = await boot();
    expect(b.recovery).toMatchObject({ interruptedRuns: 1, closedExecutions: 1, stoppedLoops: 1 });
    expect(b.recovery.lastHeartbeatAt?.getTime()).toBe(beat.getTime());
    const view = (await call(b, 'GET', `/api/loops/${loop.id}`)).body;
    expect(view).toMatchObject({ status: 'stopped', nextRunAt: null, activeRun: null });
    expect(view.currentExecution).toMatchObject({ seq: 1, endReason: 'server_down', endedAt: beat.toISOString() });
    const run = (await call(b, 'GET', `/api/runs/${runId}`)).body;
    expect(run.status).toBe('interrupted');
    const exec = (await call(b, 'GET', `/api/executions/${started.currentExecution.id}`)).body;
    expect(exec.sessionIds).toEqual([run.sessionId]);

    // Nothing runs to catch up, no loop restarts on its own - even when the cron tick has passed.
    await call(b, 'POST', '/api/__test/clock', { advanceMs: 120_000 });
    await ticksPass(b, 3);
    expect(Number((await rows('SELECT count(*) AS n FROM runs WHERE loop_id = $1', [loop.id]))[0].n)).toBe(1);
    expect(b.inspect.activeRuns()).toBe(0);
    await resetApi(b);
  });

  it('shut down the server while SSE streams are open → streams close (no end), shutdown does not hang', async () => {
    const s = await boot();
    const url = await s.listen();
    await resetApi(s);
    const loop = (await call(s, 'POST', '/api/loops', loopBody())).body;
    const runId = (await call(s, 'POST', `/api/loops/${loop.id}/start`)).body.activeRun.id;
    const events = await openSse(`${url}/api/events`);
    const logs = await openSse(`${url}/api/runs/${runId}/logs/stream`);
    await logs.waitFor((e) => e.event === 'log');
    await stop(s);
    await events.waitEnd();
    await logs.waitEnd();
    expect(logs.data().some((e) => e.event === 'end')).toBe(false); // server shutdown ≠ run finished
  });
});

describe('one DB - one server', () => {
  it("a second server on the same DB is refused BEFORE recovery (the first server's run is not marked interrupted)", async () => {
    const a = await boot();
    await resetApi(a);
    const loop = (await call(a, 'POST', '/api/loops', loopBody())).body;
    const runId = (await call(a, 'POST', `/api/loops/${loop.id}/start`)).body.activeRun.id;
    await expect(startApi()).rejects.toBeInstanceOf(InstanceLockTakenError);
    expect((await rows('SELECT status FROM runs WHERE id = $1', [runId]))[0].status).toBe('running');
    await resetApi(a);
    await stop(a);
    const b = await boot(); // lock released
    expect(b.recovery.interruptedRuns).toBe(0);
  });
});
