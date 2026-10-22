/// <reference lib="dom" />
// E2E system: UC-12 skip on overlap, UC-13 timeout, UC-14 failed run, UC-15 server restart (REAL PROCESS: killed / shut
// down gracefully then started again), UC-16 10 loops running at once. All real: browser -> build -> Fastify -> Postgres;
// the Mock executor runs in real seconds, the server clock is advanced with `/api/__test/clock` so schedule ticks / deadlines arrive at once
// (the `deadline_at` deadline is checked on the tick by the server clock - ARCHITECTURE § Schedule tick). Every assertion is checked with a `SELECT` on the DB.
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import pg from 'pg';
import { databaseUrl, loadDotEnv } from '../../server/config';
import { liveDbUrl, ServerProcess } from '../support/server-process';
import { MOCK_DONE_LOG, MOCK_FAIL_ERROR, skipSingle, timeoutError } from '../support/server-text';
import { ensureTestRepo } from '../support/test-repo';
import { t } from '../support/ui-text';
import { executionRows, lampState, runHistory, statValue } from '../support/ui';

loadDotEnv();
const TZ = 'Asia/Ho_Chi_Minh';
test.use({ timezoneId: TZ });

let db: pg.Pool;
test.beforeAll(() => {
  db = new pg.Pool({ connectionString: databaseUrl(process.env, 'test'), max: 3 });
});
test.afterAll(async () => {
  await db?.end();
});

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Api = (method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown) => Promise<{ status: number; body: Json }>;

/** API through Playwright's `request` (the shared e2e server, test mode). */
const viaRequest =
  (request: APIRequestContext): Api =>
  async (method, path, body) => {
    const res = await request.fetch(path, { method, ...(body === undefined ? {} : { data: body }) });
    const text = await res.text();
    return { status: res.status(), body: (text ? JSON.parse(text) : null) as Json };
  };

async function createLoop(api: Api, name: string, over: Json = {}): Promise<Json> {
  const res = await api('POST', '/api/loops', {
    repoId: await ensureTestRepo((m, u, b) => api(m, u, b)),
    timeoutSec: 1800,
    name,
    prompt: `Job of ${name}`,
    cron: '* * * * *',
    executor: { kind: 'mock', config: { durationSec: 600, failRate: 0 } },
    ...over,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body;
}
const rowsOf = async <T = Json>(pool: pg.Pool, sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows as T[];
const rows = <T = Json>(sql: string, params: unknown[] = []) => rowsOf<T>(db, sql, params);
/** Wait until `read()` satisfies `ok` (<= `ms`). */
async function until<T>(read: () => Promise<T>, ok: (v: T) => boolean, ms = 15_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await read();
    if (ok(v)) return v;
    if (Date.now() > end) throw new Error(`timed out after ${ms} ms waiting: ${JSON.stringify(v)}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}
const runsOf = (loopId: string, pool = db) =>
  rowsOf<{ id: string; iteration: number | null; status: string; trigger: string; error: string | null; skip_reason: string | null; execution_id: string }>(
    pool,
    `SELECT id, iteration, status, trigger, error, skip_reason, execution_id FROM runs WHERE loop_id = $1 ORDER BY started_at, id`,
    [loopId],
  );
/** Set the server clock to a fixed moment (second :05 - far from the minute edge so advancing a few tens of seconds does not cross a cron boundary). */
async function setClock(api: Api, at: string) {
  expect((await api('POST', '/api/__test/clock', { at })).status).toBe(200);
}
async function open(page: Page, url: string) {
  await page.goto(url);
  await expect(lampState(page, 'server')).toHaveAttribute('data-state', 'ok');
}
const loopRow = (page: Page, name: string) =>
  page.getByTestId('loop-row').filter({ has: page.getByTestId('loop-name').filter({ hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }) });
/** The ✓ ✗ ⊘ ↷ counts of the open / latest execution = SELECT. */
async function execCounts(executionId: string, pool = db): Promise<string> {
  const [c] = await rowsOf<Record<string, number>>(
    pool,
    `SELECT count(*) FILTER (WHERE status = 'succeeded')::int ok,
            count(*) FILTER (WHERE status IN ('failed','timed_out','interrupted'))::int err,
            count(*) FILTER (WHERE status = 'cancelled')::int cancel,
            count(*) FILTER (WHERE status = 'skipped')::int skip
       FROM runs WHERE execution_id = $1`,
    [executionId],
  );
  return `✓${c!.ok} ✗${c!.err} ⊘${c!.cancel} ↷${c!.skip}`;
}

test.describe('system - the shared e2e server', () => {
  test.beforeEach(async ({ request }) => {
    expect((await request.post('/api/__test/reset')).status()).toBe(204);
  });

  test('UC-12: a tick arrives while the previous run is going -> a skipped run "run #1 still in progress"; never two running runs (the DB blocks it, not just code)', { tag: '@UC-12' }, async ({ page, request }) => {
    test.setTimeout(60_000);
    const api = viaRequest(request);
    await setClock(api, '2026-11-02T03:00:05Z');
    const loop = await createLoop(api, 'UC-12 skip on overlap');
    await open(page, `/loops/${loop.id}`);
    await page.getByTestId('loop-start').click();
    await expect(page.locator('[data-testid="loop-status"][data-status="running"]')).toContainText('Run #1 in progress');
    const [first] = await until(() => runsOf(loop.id), (r) => r.length === 1 && r[0]!.status === 'running');

    // Two cron ticks (03:01, 03:02) arrive while run #1 (600 seconds) is going -> two skipped runs.
    for (const at of ['2026-11-02T03:01:05Z', '2026-11-02T03:02:05Z']) {
      const before = (await runsOf(loop.id)).length;
      await setClock(api, at);
      await until(() => runsOf(loop.id), (r) => r.length === before + 1);
    }
    const all = await runsOf(loop.id);
    expect(all.map((r) => [r.iteration, r.status, r.skip_reason])).toEqual([
      [1, 'running', null],
      [null, 'skipped', skipSingle('#1')],
      [null, 'skipped', skipSingle('#1')],
    ]);
    const running = (await rows<{ n: number }>(`SELECT count(*)::int n FROM runs WHERE loop_id = $1 AND status = 'running'`, [loop.id]))[0]!.n;
    expect(running).toBe(1);

    // The DB blocks it itself: insert a second running run straight for a loop with N = 1 -> trigger runs_max_concurrent_per_loop (23514), no code needed.
    const dup = await db
      .query(
        `INSERT INTO runs (id, loop_id, execution_id, iteration, trigger, status, started_at, prompt_snapshot, executor_kind, executor_config)
         VALUES (gen_random_uuid(), $1, $2, 99, 'schedule', 'running', now(), 'p', 'mock', '{}')`,
        [loop.id, first!.execution_id],
      )
      .then(
        () => null,
        (e: { code?: string; constraint?: string }) => `${e.code} ${e.constraint}`,
      );
    expect(dup).toBe('23514 runs_max_concurrent_per_loop');

    // Detail screen: the run table has two skipped rows with the reason from the DB, no F5; the list row counts ↷2.
    const table = runHistory(page);
    await expect(table.locator('[data-status="skipped"]')).toHaveCount(2, { timeout: 2_000 });
    await expect(table.locator('[data-status="skipped"]').first()).toContainText(skipSingle('#1'));
    await expect(table.locator('[data-status="running"]')).toHaveCount(1);
    await expect(loopRow(page, 'UC-12 skip on overlap').getByTestId('row-counts')).toHaveText(await execCounts(first!.execution_id), { timeout: 2_000 });
    await expect(loopRow(page, 'UC-12 skip on overlap').getByTestId('row-counts')).toHaveText('✓0 ✗0 ⊘0 ↷2');
    expect((await api('POST', `/api/loops/${loop.id}/stop`)).status).toBe(200);
  });

  test('UC-13: a run past timeoutSec -> timed_out, the executor stops printing logs; the loop keeps running, the next tick runs normally', { tag: '@UC-13' }, async ({ page, request }) => {
    test.setTimeout(60_000);
    const api = viaRequest(request);
    await setClock(api, '2026-11-02T03:00:05Z');
    // Mock 8 real seconds, timeout 60 seconds by the server clock: advance the clock +65 seconds while the run is going -> past the deadline.
    const loop = await createLoop(api, 'UC-13 timeout', { cron: '*/5 * * * *', timeoutSec: 60, executor: { kind: 'mock', config: { durationSec: 8, failRate: 0 } } });
    await open(page, `/loops/${loop.id}`);
    await page.getByTestId('loop-start').click();
    const [r1] = await until(() => runsOf(loop.id), (r) => r[0]?.status === 'running');
    await until(
      () => rows(`SELECT 1 FROM run_logs WHERE run_id = $1 AND message LIKE 'working…%'`, [r1!.id]),
      (r) => r.length >= 1,
    );
    await setClock(api, '2026-11-02T03:01:10Z');
    await until(() => runsOf(loop.id), (r) => r[0]?.status === 'timed_out', 5_000);
    const [timed] = await runsOf(loop.id);
    expect(timed!.error).toBe(timeoutError(60));
    // The executor receives the stop signal: after the "cancelled" line there is no working… line (Mock would have ~6 seconds left if it did not stop).
    const logs = () => rows<{ seq: number; message: string }>('SELECT seq, message FROM run_logs WHERE run_id = $1 ORDER BY seq', [r1!.id]);
    await new Promise((r) => setTimeout(r, 3_000));
    const after = await logs();
    expect(after.at(-1)!.message).toBe(timeoutError(60));
    expect(after.filter((l) => l.message === timeoutError(60))).toHaveLength(1);
    expect(after.some((l) => l.message === MOCK_DONE_LOG)).toBe(false);
    // The loop keeps running, the execution stays open.
    const [state] = await rows<{ status: string; ended_at: Date | null }>(
      `SELECT l.status, e.ended_at FROM loops l JOIN loop_executions e ON e.loop_id = l.id WHERE l.id = $1`,
      [loop.id],
    );
    expect(state).toEqual({ status: 'active', ended_at: null });
    await expect(page.getByTestId('loop-header')).toHaveAttribute('data-status', 'active');
    await expect(runHistory(page).locator('[data-status="timed_out"]')).toHaveCount(1, { timeout: 2_000 });

    // The next tick (03:05) runs normally: run #2 on schedule, runs the full 8 seconds -> succeeded, same execution.
    await setClock(api, '2026-11-02T03:05:01Z');
    const done = await until(() => runsOf(loop.id), (r) => r[1]?.status === 'succeeded', 20_000);
    expect(done.map((r) => [r.iteration, r.trigger, r.status])).toEqual([
      [1, 'start', 'timed_out'],
      [2, 'schedule', 'succeeded'],
    ]);
    expect(done[1]!.execution_id).toBe(done[0]!.execution_id);
    await expect(runHistory(page).locator('[data-status="succeeded"]')).toHaveCount(1, { timeout: 2_000 });
    await expect(loopRow(page, 'UC-13 timeout').getByTestId('row-counts')).toHaveText(await execCounts(done[0]!.execution_id), { timeout: 2_000 });
    await expect(loopRow(page, 'UC-13 timeout').getByTestId('row-counts')).toHaveText('✓1 ✗1 ⊘0 ↷0');
    // Timed-out run screen: the error = the error column.
    await open(page, `/runs/${r1!.id}`);
    await expect(page.getByTestId('run-header')).toHaveAttribute('data-status', 'timed_out');
    await expect(page.getByTestId('run-log')).toContainText(timeoutError(60));
    expect((await api('POST', `/api/loops/${loop.id}/stop`)).status).toBe(200);
  });

  test('UC-14: executor error -> failed + error message; the loop keeps running, the execution stays open, the next tick runs normally', { tag: '@UC-14' }, async ({ page, request }) => {
    test.setTimeout(60_000);
    const api = viaRequest(request);
    await setClock(api, '2026-11-02T03:00:05Z');
    const loop = await createLoop(api, 'UC-14 failed run', { cron: '*/5 * * * *', executor: { kind: 'mock', config: { durationSec: 3, failRate: 100 } } });
    await open(page, `/loops/${loop.id}`);
    await page.getByTestId('loop-start').click();
    const [r1] = await until(() => runsOf(loop.id), (r) => r[0]?.status === 'failed');
    expect(r1!.error).toBe(MOCK_FAIL_ERROR);
    await expect(page.getByTestId('last-run-failed')).toBeVisible({ timeout: 2_000 });
    await expect(page.getByTestId('loop-header')).toHaveAttribute('data-status', 'active');
    const [ex] = await rows<{ id: string; ended_at: Date | null; end_reason: string | null }>('SELECT id, ended_at, end_reason FROM loop_executions WHERE loop_id = $1', [loop.id]);
    expect(ex).toMatchObject({ ended_at: null, end_reason: null });
    const loopStatus = (await rows<{ status: string }>('SELECT status FROM loops WHERE id = $1', [loop.id]))[0]!.status;
    expect(loopStatus).toBe('active');

    // Change the executor so it stops failing (applies from the next run - UC-09), then the 03:05 tick -> run #2 succeeds in the SAME execution.
    const cur = (await api('GET', `/api/loops/${loop.id}`)).body;
    const put = await api('PUT', `/api/loops/${loop.id}`, {
      repoId: cur.repo.id, name: cur.name, prompt: cur.prompt, cron: cur.cron, timezone: cur.timezone, timeoutSec: cur.timeoutSec,
      executor: { kind: 'mock', config: { durationSec: 3, failRate: 0 } }, version: cur.version,
    });
    expect(put.status, JSON.stringify(put.body)).toBe(200);
    await setClock(api, '2026-11-02T03:05:01Z');
    const done = await until(() => runsOf(loop.id), (r) => r[1]?.status === 'succeeded');
    expect(done.map((r) => [r.iteration, r.status, r.execution_id])).toEqual([
      [1, 'failed', ex!.id],
      [2, 'succeeded', ex!.id],
    ]);
    const [still] = await rows<{ ended_at: Date | null }>('SELECT ended_at FROM loop_executions WHERE id = $1', [ex!.id]);
    expect(still!.ended_at).toBeNull();
    await expect(loopRow(page, 'UC-14 failed run').getByTestId('row-counts')).toHaveText(await execCounts(ex!.id), { timeout: 2_000 });
    await expect(loopRow(page, 'UC-14 failed run').getByTestId('row-counts')).toHaveText('✓1 ✗1 ⊘0 ↷0');
    await expect(runHistory(page).locator('[data-status="failed"]')).toHaveCount(1);
    await expect(runHistory(page).locator('[data-status="succeeded"]')).toHaveCount(1);
    // Failed run screen: the error message = the error column.
    await open(page, `/runs/${r1!.id}`);
    await expect(page.getByTestId('run-header')).toHaveAttribute('data-status', 'failed');
    await expect(page.getByTestId('run-banner')).toHaveText(`✗ ${t('run.err.failed', { msg: r1!.error ?? '' })}`);
    expect((await api('POST', `/api/loops/${loop.id}/stop`)).status).toBe(200);
  });

  test('UC-16: 10 loops each with one run at the same time; the figures of every loop match the DB; the UI stays smooth', { tag: '@UC-16' }, async ({ page, request }) => {
    test.setTimeout(90_000);
    const api = viaRequest(request);
    const names = Array.from({ length: 10 }, (_, i) => `UC-16 loop ${String(i + 1).padStart(2, '0')}`);
    const loops: Json[] = [];
    // Schedule once a year (1 Jan 00:00): the real time never reaches a cron boundary mid-test -> no unplanned skipped runs.
    for (const name of names) loops.push(await createLoop(api, name, { cron: '0 0 1 1 *', executor: { kind: 'mock', config: { durationSec: 12, failRate: 0 } } }));

    // Measure smoothness from when the page opens: long tasks (>= 50 ms blocking the main thread) + the largest gap between two frames.
    await page.addInitScript(() => {
      const w = window as unknown as { __long: number[]; __gap: number; __watch: boolean };
      w.__long = [];
      w.__gap = 0;
      w.__watch = false;
      new PerformanceObserver((l) => {
        if (w.__watch) for (const e of l.getEntries()) w.__long.push(e.duration);
      }).observe({ type: 'longtask', buffered: false });
      let last = performance.now();
      const frame = (t: number) => {
        if (w.__watch) w.__gap = Math.max(w.__gap, t - last);
        last = t;
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    await open(page, '/');
    await expect(page.getByTestId('loop-row')).toHaveCount(10);
    await page.evaluate(() => ((window as unknown as { __noReload: boolean; __watch: boolean }).__noReload = true));
    await page.evaluate(() => ((window as unknown as { __watch: boolean }).__watch = true));

    // Start all 10 at once (like 10 tabs pressing at the same moment).
    const starts = await Promise.all(loops.map((l) => api('POST', `/api/loops/${l.id}/start`)));
    expect(starts.map((s) => s.status)).toEqual(Array(10).fill(200));
    const running = await until(
      () => rows<{ n: number }>(`SELECT count(*)::int n FROM runs WHERE status = 'running'`),
      (r) => r[0]!.n === 10,
      5_000,
    );
    expect(running[0]!.n).toBe(10);
    // UI: the overview bar + every row update themselves within 2 seconds, no F5.
    await expect(statValue(page, 'active-loops')).toHaveText(t('top.stats.activeLoops', { n: 10 }), { timeout: 2_000 });
    await expect(statValue(page, 'running-runs')).toHaveText(t('top.stats.runningRuns', { n: 10 }), { timeout: 2_000 });
    for (const name of names) await expect(loopRow(page, name).locator('[data-testid="row-status"][data-status="running"]')).toHaveText(/^#1 00:\d\d$/, { timeout: 2_000 });

    // The runs really overlap: the latest-starting run still starts before the earliest-ending run.
    await until(() => rows<{ n: number }>(`SELECT count(*)::int n FROM runs WHERE status = 'succeeded'`), (r) => r[0]!.n === 10, 30_000);
    const [span] = await rows<{ last_start: Date; first_end: Date; sessions: number; execs: number }>(
      `SELECT max(started_at) last_start, min(finished_at) first_end, count(DISTINCT session_id)::int sessions,
              count(DISTINCT execution_id)::int execs FROM runs`,
    );
    expect(span!.last_start.getTime()).toBeLessThan(span!.first_end.getTime());
    expect(span!.sessions).toBe(10);
    expect(span!.execs).toBe(10);

    // Every loop's figures = SELECT (each loop has exactly one succeeded run in its own execution #1, none mixed with another loop's).
    await expect(statValue(page, 'running-runs')).toHaveText(t('top.stats.runningRuns', { n: 0 }), { timeout: 2_000 });
    for (const l of loops) {
      const [ex] = await rows<{ id: string; seq: number }>('SELECT id, seq FROM loop_executions WHERE loop_id = $1 AND ended_at IS NULL', [l.id]);
      expect(ex!.seq).toBe(1);
      const r = loopRow(page, l.name as string);
      await expect(r.getByTestId('row-counts')).toHaveText(await execCounts(ex!.id), { timeout: 2_000 });
      await expect(r.getByTestId('row-counts')).toHaveText('✓1 ✗0 ⊘0 ↷0');
      await expect(r.getByTestId('row-exec')).toHaveText(/^exec #1 /);
    }
    const today = (await rows<{ n: number }>(`SELECT count(*)::int n FROM runs WHERE status <> 'skipped'`))[0]!.n;
    await expect(statValue(page, 'runs-today')).toHaveText(t('top.stats.runsToday', { n: today }));

    // Smooth: for ~15 seconds 10 runs print logs together, the main thread is never blocked over 200 ms, no frame gap over 250 ms.
    const smooth = await page.evaluate(() => {
      const w = window as unknown as { __long: number[]; __gap: number; __noReload?: boolean };
      return { longest: Math.max(0, ...w.__long), longTasks: w.__long.length, gap: w.__gap, noReload: w.__noReload };
    });
    test.info().annotations.push({ type: 'smoothness', description: JSON.stringify(smooth) });
    expect(smooth.noReload).toBe(true);
    expect(smooth.longest, JSON.stringify(smooth)).toBeLessThan(200);
    expect(smooth.gap, JSON.stringify(smooth)).toBeLessThan(250);
    for (const l of loops) expect((await api('POST', `/api/loops/${l.id}/stop`)).status).toBe(200);
  });
});

test.describe('system - a dedicated server process', () => {
  /** Loops, configuration, history of the DB before / after a restart - every column except what recovery may change. */
  const snapshot = async (pool: pg.Pool) => ({
    loops: await rowsOf(pool, `SELECT id, name, description, prompt, cron, timezone, timeout_sec, executor_kind, executor_config, version,
                                      run_counter, execution_counter, created_at, archived_at FROM loops ORDER BY id`),
    finished: await rowsOf(pool, `SELECT id, status, finished_at, duration_ms, session_id FROM runs WHERE status <> 'running' ORDER BY id`),
    logs: await rowsOf(pool, `SELECT count(*)::int n FROM run_logs`),
    closed: await rowsOf(pool, `SELECT id, ended_at, end_reason FROM loop_executions WHERE ended_at IS NOT NULL ORDER BY id`),
  });

  async function restartCase(page: Page, how: 'kill' | 'shutdown') {
    const sp = await ServerProcess.launch();
    const live = new pg.Pool({ connectionString: liveDbUrl(), max: 2 });
    try {
      const api: Api = (m, p, b) => sp.api(m, p, b);
      // A: running a long run; B: finished one execution (has history); C: never started.
      // A runs on a yearly schedule (1 Jan 00:00): the server clock must be the real time before the shutdown (endedAt is measured against the shutdown), and the real
      // time does not reach A's cron boundary mid-test -> no unplanned skipped runs.
      const a = await createLoop(api, `UC-15 ${how} - running`, { cron: '0 0 1 1 *' });
      const b = await createLoop(api, `UC-15 ${how} - has history`, { cron: '0 9 * * *', executor: { kind: 'mock', config: { durationSec: 1, failRate: 0 } } });
      const c = await createLoop(api, `UC-15 ${how} - never started`, { cron: '30 8 * * 1,3,5', timeoutSec: 900, description: 'description stays the same' });
      expect((await api('POST', `/api/loops/${b.id}/start`)).status).toBe(200);
      await until(() => runsOf(b.id, live), (r) => r[0]?.status === 'succeeded');
      expect((await api('POST', `/api/loops/${b.id}/stop`)).status).toBe(200);
      expect((await api('POST', `/api/loops/${a.id}/start`)).status).toBe(200);
      const [runA] = await until(() => runsOf(a.id, live), (r) => r[0]?.status === 'running');
      await until(() => rowsOf(live, `SELECT 1 FROM run_logs WHERE run_id = $1 AND message LIKE 'working…%'`, [runA!.id]), (r) => r.length >= 2);

      await open(page, `${sp.baseUrl}/loops/${a.id}`);
      await expect(page.getByTestId('loop-header')).toHaveAttribute('data-status', 'active');
      await expect(page.locator('[data-testid="loop-status"][data-status="running"]')).toContainText('Run #1 in progress');
      await page.evaluate(() => ((window as unknown as { __noReload: boolean }).__noReload = true));

      const before = await snapshot(live);
      const oldPid = sp.pid!;
      expect(oldPid).toBeGreaterThan(0);
      const downAt = Date.now();
      if (how === 'kill') await sp.kill();
      else await sp.shutdown();
      // The old process really died (not just stopped listening on the port).
      expect(() => process.kill(oldPid, 0)).toThrow();
      if (how === 'shutdown') expect(sp.exitCode).toBe(0); // graceful shutdown exits with code 0; kill -> null
      // The half-done run is still `running` in the DB when the server is off (a graceful shutdown does NOT write a result - D18): only the next start marks it.
      expect((await runsOf(a.id, live))[0]!.status).toBe('running');
      await expect(page.getByTestId('banner-disconnected')).toBeVisible({ timeout: 5_000 });
      await new Promise((r) => setTimeout(r, 1_500)); // the server stays off for a while before it comes back

      await sp.start();
      const newPid = sp.pid!;
      expect(newPid).toBeGreaterThan(0);
      expect(newPid).not.toBe(oldPid);

      // The run going at shutdown -> interrupted; the open execution -> server_down, endedAt within 10 seconds of the shutdown; every loop stopped.
      const [r] = await runsOf(a.id, live);
      expect(r).toMatchObject({ id: runA!.id, status: 'interrupted' });
      const [exA] = await rowsOf<{ ended_at: Date; end_reason: string }>(live, 'SELECT ended_at, end_reason FROM loop_executions WHERE loop_id = $1', [a.id]);
      expect(exA!.end_reason).toBe('server_down');
      expect(Math.abs(exA!.ended_at.getTime() - downAt), `endedAt ${exA!.ended_at.toISOString()} · shutdown at ${new Date(downAt).toISOString()}`).toBeLessThanOrEqual(10_000);
      // A graceful shutdown writes the last heartbeat at shutdown time (D18) -> exactly the shutdown time, not back to the nearest 10-second heartbeat as when killed.
      if (how === 'shutdown') expect(Math.abs(exA!.ended_at.getTime() - downAt)).toBeLessThanOrEqual(2_000);
      const statuses = await rowsOf<{ id: string; status: string }>(live, `SELECT id, status FROM loops`);
      expect(Object.fromEntries(statuses.map((l) => [l.id, l.status]))).toEqual({ [a.id]: 'stopped', [b.id]: 'stopped', [c.id]: 'stopped' });
      // Loops, configuration, history intact: everything finished before the shutdown has not changed a single column.
      const after = await snapshot(live);
      expect(after.loops).toEqual(before.loops);
      expect(after.logs).toEqual(before.logs);
      expect(after.closed).toEqual(expect.arrayContaining(before.closed));
      expect(after.finished).toEqual(expect.arrayContaining(before.finished));
      expect(after.finished).toHaveLength(before.finished.length + 1); // + A's interrupted run

      // No new run until Start is pressed - even when the server clock is advanced past A's cron boundary (1 Jan 2027 00:00 Vietnam time)
      // and over 70 of B's 09:00 boundaries.
      const count = async () => (await rowsOf<{ n: number }>(live, 'SELECT count(*)::int n FROM runs'))[0]!.n;
      const n0 = await count();
      expect((await api('POST', '/api/__test/clock', { at: '2026-12-31T17:00:03Z' })).status).toBe(200);
      await new Promise((res) => setTimeout(res, 2_500));
      expect(await count()).toBe(n0);

      // The UI reconnects by itself (UC-17), sees the right state after the restart, no F5.
      await expect(page.getByTestId('banner-reconnected')).toBeVisible({ timeout: 12_000 });
      await expect(page.getByTestId('loop-header')).toHaveAttribute('data-status', 'stopped', { timeout: 2_000 });
      await expect(page.getByTestId('server-down-banner')).toBeVisible();
      await expect(runHistory(page).locator(`[data-testid=run-row][data-run-id="${runA!.id}"]`)).toHaveAttribute('data-status', 'interrupted');
      await expect(executionRows(page)).toHaveCount(1);
      expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);

      // Press Start -> a new execution (#2), the first `start` run runs at once.
      await page.getByTestId('loop-start').click();
      await expect(page.locator('[data-testid="loop-status"][data-status="running"]')).toContainText('Run #2 in progress');
      const execs = await rowsOf<{ seq: number; end_reason: string | null }>(live, 'SELECT seq, end_reason FROM loop_executions WHERE loop_id = $1 ORDER BY seq', [a.id]);
      expect(execs).toEqual([
        { seq: 1, end_reason: 'server_down' },
        { seq: 2, end_reason: null },
      ]);
      const runs = await runsOf(a.id, live);
      expect(runs.map((x) => [x.iteration, x.trigger, x.status])).toEqual([
        [1, 'start', 'interrupted'],
        [2, 'start', 'running'],
      ]);
      expect((await api('POST', `/api/loops/${a.id}/stop`)).status).toBe(200);
    } finally {
      await live.end();
      await sp.stop();
    }
  }

  test('UC-15: the server is killed (real process) then started again - new PID; the half-done run interrupted, the execution closed server_down within 10 seconds; the loop stopped, never restarts by itself', { tag: '@UC-15' }, async ({ page }) => {
    test.setTimeout(120_000);
    await restartCase(page, 'kill');
  });

  test('UC-15: the server shuts down gracefully (IPC shutdown, like Ctrl+C) then starts again - same result as being killed', { tag: '@UC-15' }, async ({ page }) => {
    test.setTimeout(120_000);
    await restartCase(page, 'shutdown');
  });
});
