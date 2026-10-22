/// <reference lib="dom" />
// E2E list screen: UC-03 list + overview bar + search / filter, live updates; UC-04 Start; UC-05 Stop.
// All real: browser -> build -> Fastify -> Postgres (test DB). Every number on screen is checked against a SELECT straight
// on the DB - if the UI computed the figures itself or ignored live events, it would be off / late -> red.
import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { databaseUrl, loadDotEnv } from '../../server/config';
import { nextRuns } from '../../shared/domain/schedule';
import { ensureTestRepo } from '../support/test-repo';
import { t } from '../support/ui-text';
import { gotoApp, revealRowActions, statValue } from '../support/ui';

loadDotEnv();
const TZ = 'Asia/Ho_Chi_Minh';
test.use({ timezoneId: TZ });

let db: pg.Pool;
test.beforeAll(() => {
  db = new pg.Pool({ connectionString: databaseUrl(process.env, 'test'), max: 2 });
});
test.afterAll(async () => {
  await db?.end();
});
test.beforeEach(async ({ request }) => {
  expect((await request.post('/api/__test/reset')).status()).toBe(204);
});

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
async function createLoop(request: APIRequestContext, name: string, over: Json = {}): Promise<string> {
  const repoId = await ensureTestRepo(async (method, url, body) => {
    const r = await request.fetch(url, { method, ...(body === undefined ? {} : { data: body }) });
    return { status: r.status(), body: await r.json() };
  });
  const res = await request.post('/api/loops', {
    data: { repoId, timeoutSec: 1800, name, prompt: `Job of ${name}`, cron: '*/30 * * * *', executor: { kind: 'mock', config: { durationSec: 600, failRate: 0 } }, ...over },
  });
  expect(res.status()).toBe(201);
  return ((await res.json()) as Json).id as string;
}
const post = async (request: APIRequestContext, path: string) => (await request.post(path)).status();
const one = async <T = Json>(sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0] as T;
const n = async (sql: string, params: unknown[] = []) => Number((await one<{ n: string }>(sql, params)).n);
const row = (page: Page, name: string): Locator => page.getByTestId('loop-row').filter({ has: page.getByTestId('loop-name').filter({ hasText: new RegExp(`^${name}$`) }) });
const hm = (d: Date) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: TZ }).format(d);
/** Midnight today in Vietnam time (computed independently of the server). */
const midnightVn = () => new Date(`${new Date().toLocaleDateString('en-CA', { timeZone: TZ })}T00:00:00+07:00`);
async function markNoReload(page: Page) {
  await page.evaluate(() => ((window as unknown as { __noReload: boolean }).__noReload = true));
}
async function stillNoReload(page: Page) {
  expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);
}

/** Insert a finished run straight into the open execution - builds different ✓ ✗ ⊘ ↷ counts without waiting for the schedule. */
async function rawRun(loopId: string, executionId: string, iteration: number | null, status: string, secAgo: number) {
  const started = new Date(Date.now() - secAgo * 1000);
  const finished = new Date(started.getTime() + 500);
  await db.query(
    `INSERT INTO runs (id, loop_id, execution_id, iteration, trigger, status, skip_reason, started_at, finished_at, duration_ms,
                       prompt_snapshot, executor_kind, executor_config, session_id)
     VALUES ($1, $2, $3, $4, 'schedule', $5, $6, $7, $8, $9, 'p', 'mock', '{}', $10)`,
    [randomUUID(), loopId, executionId, iteration, status, status === 'skipped' ? 'run #1 still in progress' : null, started, finished,
      status === 'skipped' ? null : 500, status === 'skipped' ? null : `mock-${randomUUID()}`],
  );
}

test.describe('list screen', () => {
  test('UC-03: every row + overview bar + count on each tab match the DB; live update within 2 seconds without F5; search + filter', { tag: '@UC-03' }, async ({ page, request }) => {
    test.setTimeout(60_000);
    const a = await createLoop(request, 'Alpha running');
    const b = await createLoop(request, 'Beta stopped', { cron: '0 9 * * *' });
    const c = await createLoop(request, 'Gamma new');
    const d = await createLoop(request, 'Delta archived');
    expect(await post(request, `/api/loops/${a}/start`)).toBe(200);
    expect(await post(request, `/api/loops/${b}/start`)).toBe(200);
    expect(await post(request, `/api/loops/${b}/stop`)).toBe(200);
    expect(await post(request, `/api/loops/${d}/archive`)).toBe(204);
    const exA = await one<{ id: string }>(`SELECT id FROM loop_executions WHERE loop_id = $1 AND ended_at IS NULL`, [a]);
    await rawRun(a, exA.id, 100, 'succeeded', 9);
    await rawRun(a, exA.id, 101, 'succeeded', 8);
    await rawRun(a, exA.id, 102, 'failed', 7);
    await rawRun(a, exA.id, 103, 'cancelled', 6);
    await rawRun(a, exA.id, null, 'skipped', 5);
    await rawRun(a, exA.id, 104, 'timed_out', 4);
    // A failed run from the day before yesterday in B's execution: not "today", not "24 hours" - if the UI adds up the
    // executions' numbers instead of asking the server, it is off.
    const exB = await one<{ id: string }>(`SELECT id FROM loop_executions WHERE loop_id = $1`, [b]);
    await rawRun(b, exB.id, 50, 'failed', 50 * 3600);

    await gotoApp(page, '/');
    await expect(page.getByTestId('loop-row')).toHaveCount(3);
    await markNoReload(page);

    // -- row of the running loop: counts, execution #k, the running run, latest / next run = SELECT
    const st = await one<Record<string, string>>(
      `SELECT e.seq,
              count(*) FILTER (WHERE r.status = 'succeeded') ok,
              count(*) FILTER (WHERE r.status IN ('failed','timed_out','interrupted')) err,
              count(*) FILTER (WHERE r.status = 'cancelled') cancel,
              count(*) FILTER (WHERE r.status = 'skipped') skip
         FROM loop_executions e JOIN runs r ON r.execution_id = e.id WHERE e.id = $1 GROUP BY e.seq`,
      [exA.id],
    );
    const rowA = row(page, 'Alpha running');
    await expect(rowA.getByTestId('row-counts')).toHaveText(`✓${st.ok} ✗${st.err} ⊘${st.cancel} ↷${st.skip}`);
    expect(`✓${st.ok} ✗${st.err} ⊘${st.cancel} ↷${st.skip}`).toBe('✓2 ✗2 ⊘1 ↷1');
    await expect(rowA.getByTestId('row-exec')).toHaveText(new RegExp(`^exec #${st.seq} \\d+\\ss$`)); // \s: the duration uses a non-breaking space
    const running = await one<{ iteration: number }>(`SELECT iteration FROM runs WHERE loop_id = $1 AND status = 'running'`, [a]);
    await expect(rowA.locator('[data-testid="row-status"][data-status="running"]')).toHaveText(new RegExp(`^#${running.iteration} 00:\\d\\d$`));
    const last = await one<{ status: string; started_at: Date }>(
      `SELECT status, started_at FROM runs WHERE loop_id = $1 AND status NOT IN ('running','skipped') ORDER BY started_at DESC LIMIT 1`,
      [a],
    );
    const loopA = await one<{ next_run_at: Date }>(`SELECT next_run_at FROM loops WHERE id = $1`, [a]);
    await expect(rowA.getByTestId('row-right')).toHaveText(`${hm(last.started_at)} → ${hm(loopA.next_run_at)}`);
    await expect(rowA.locator(`[data-testid="row-right"][data-status="${last.status}"]`)).toHaveCount(1);
    await expect(rowA.getByTestId('row-meta')).toContainText('Every 30 minutes · exec #1');

    // -- stopped loop / loop never started
    const rowB = row(page, 'Beta stopped');
    await expect(rowB.locator('[data-testid="row-status"][data-status="stopped"]')).toHaveText(t('list.row.stopped'));
    await expect(rowB.getByTestId('row-exec')).toHaveText(/^exec #1 \d+\ss$/);
    await expect(rowB.getByTestId('row-counts')).toHaveCount(0);
    await expect(rowB.locator('[data-testid="row-right"][data-status="cancelled"]')).toHaveCount(1); // the first run was cancelled by Stop
    await expect(row(page, 'Gamma new').getByTestId('row-exec')).toHaveText(t('list.row.never'));

    // -- overview bar + count on each tab = SELECT
    const today = midnightVn();
    const expectStats = async () => {
      const s = {
        active: await n(`SELECT count(*) n FROM loops WHERE status = 'active' AND archived_at IS NULL`),
        running: await n(`SELECT count(*) n FROM runs WHERE status = 'running'`),
        today: await n(`SELECT count(*) n FROM runs WHERE status <> 'skipped' AND started_at >= $1`, [today]),
        errors: await n(`SELECT count(*) n FROM runs WHERE status IN ('failed','timed_out','interrupted') AND finished_at >= now() - interval '24 hours'`),
        all: await n(`SELECT count(*) n FROM loops WHERE archived_at IS NULL`),
        stopped: await n(`SELECT count(*) n FROM loops WHERE archived_at IS NULL AND status = 'stopped'`),
        archived: await n(`SELECT count(*) n FROM loops WHERE archived_at IS NOT NULL`),
      };
      await expect(statValue(page, 'active-loops')).toHaveText(t('top.stats.activeLoops', { n: s.active }), { timeout: 2_000 });
      await expect(statValue(page, 'running-runs')).toHaveText(t('top.stats.runningRuns', { n: s.running }), { timeout: 2_000 });
      await expect(statValue(page, 'runs-today')).toHaveText(t('top.stats.runsToday', { n: s.today }), { timeout: 2_000 });
      await expect(statValue(page, 'errors-24h')).toHaveText(t('top.stats.errors24h', { n: s.errors }), { timeout: 2_000 });
      await expect(page.getByTestId('tab-all')).toHaveText(`${t('list.filter.all')}${s.all}`, { timeout: 2_000 });
      await expect(page.getByTestId('tab-active')).toHaveText(`${t('list.filter.active')}${s.active}`, { timeout: 2_000 });
      await expect(page.getByTestId('tab-stopped')).toHaveText(`${t('list.filter.stopped')}${s.stopped}`, { timeout: 2_000 });
      await expect(page.getByTestId('tab-archived')).toHaveText(`${t('list.filter.archived')}${s.archived}`, { timeout: 2_000 });
      return s;
    };
    expect(await expectStats()).toEqual({ active: 1, running: 1, today: 7, errors: 2, all: 3, stopped: 2, archived: 1 });
    await expect(statValue(page, 'errors-24h')).toHaveAttribute('data-alert', 'true');

    // -- live update: the "running for" clock keeps ticking
    const clock0 = await rowA.locator('[data-testid="row-status"][data-status="running"]').textContent();
    await expect(rowA.locator('[data-testid="row-status"][data-status="running"]')).not.toHaveText(clock0!, { timeout: 2_000 });

    // -- live update through events (Start / Stop / create from "another tab" = API), <= 2 seconds, no F5
    expect(await post(request, `/api/loops/${c}/start`)).toBe(200);
    await expect(row(page, 'Gamma new').locator('[data-testid="row-status"][data-status="running"]')).toHaveText(/^#1 00:0\d$/, { timeout: 2_000 });
    await expect(row(page, 'Gamma new').getByTestId('row-counts')).toHaveText('✓0 ✗0 ⊘0 ↷0', { timeout: 2_000 });
    expect((await expectStats()).active).toBe(2);
    expect(await post(request, `/api/loops/${a}/stop`)).toBe(200);
    await expect(rowA.locator('[data-testid="row-status"][data-status="stopped"]')).toHaveText(t('list.row.stopped'), { timeout: 2_000 });
    expect(await expectStats()).toMatchObject({ active: 1, running: 1, stopped: 2 });
    await createLoop(request, 'Epsilon just created');
    await expect(page.getByTestId('loop-row')).toHaveCount(4, { timeout: 2_000 });
    await expect(page.getByTestId('loop-row').first()).toContainText('Epsilon just created'); // newest created first
    expect((await expectStats()).all).toBe(4);
    await stillNoReload(page);

    // -- search by name (case-insensitive) + filter by status
    await page.getByTestId('list-search').fill('ALP');
    await expect(page.getByTestId('loop-row')).toHaveCount(1);
    await expect(page.getByTestId('loop-row')).toContainText('Alpha running');
    await page.getByTestId('list-search').fill('no such');
    await expect(page.getByTestId('list-no-match')).toContainText(t('list.noMatch.title', { q: 'no such' }));
    await page.getByTestId('list-no-match').getByRole('button', { name: t('list.noMatch.clear') }).click();
    await expect(page.getByTestId('loop-row')).toHaveCount(4);
    await page.getByTestId('tab-active').click();
    await expect(page.getByTestId('loop-name')).toHaveText(['Gamma new']);
    await page.getByTestId('tab-stopped').click();
    await expect(page.getByTestId('loop-name')).toHaveText(['Epsilon just created', 'Beta stopped', 'Alpha running']);
    await page.getByTestId('tab-archived').click();
    await expect(page.getByTestId('loop-name')).toHaveText(['Delta archived']);
    await expect(page.getByTestId('loop-row').locator('[data-testid="row-status"][data-status="archived"]')).toHaveText(t('list.row.archived'));
    await page.getByTestId('tab-all').click();
    await expect(page.getByTestId('loop-row')).toHaveCount(4);

    // -- click a row -> loop detail (the row is selected)
    await row(page, 'Beta stopped').click();
    await expect(page).toHaveURL(new RegExp(`/loops/${b}$`));
    await expect(row(page, 'Beta stopped')).toHaveAttribute('aria-current', 'true');
    await stillNoReload(page);
  });

  test('UC-04: Start from a row -> new execution, the first run trigger=start runs at once, the next run on the exact cron boundary; while running there is no Start (LOOP_ALREADY_ACTIVE)', { tag: '@UC-04' }, async ({ page, request, browser }) => {
    test.setTimeout(60_000);
    const id = await createLoop(request, 'Loop Start');
    await gotoApp(page, '/');
    const r = row(page, 'Loop Start');
    await expect(r.locator('[data-testid="row-status"][data-status="stopped"]')).toBeVisible();
    await markNoReload(page);

    // Actions only show on hover (D-UI2).
    await expect(r.getByTestId('row-start')).toBeHidden();
    await revealRowActions(r);
    await expect(r.getByTestId('row-start')).toBeVisible();
    await r.getByTestId('row-start').click();
    await expect(r.locator('[data-testid="row-status"][data-status="running"]')).toHaveText(/^#1 00:0\d$/, { timeout: 2_000 });

    const ex = await one<{ id: string; seq: number; started_at: Date; ended_at: Date | null }>(
      `SELECT id, seq, started_at, ended_at FROM loop_executions WHERE loop_id = $1`, [id]);
    expect(ex).toMatchObject({ seq: 1, ended_at: null });
    const first = await one<{ trigger: string; status: string; iteration: number; started_at: Date; execution_id: string }>(
      `SELECT trigger, status, iteration, started_at, execution_id FROM runs WHERE loop_id = $1`, [id]);
    expect(first).toMatchObject({ trigger: 'start', status: 'running', iteration: 1, execution_id: ex.id });
    expect(first.started_at.getTime() - ex.started_at.getTime()).toBeLessThan(1_000); // the first run starts AT ONCE
    const loop = await one<{ status: string; next_run_at: Date; cron: string; timezone: string }>(`SELECT status, next_run_at, cron, timezone FROM loops WHERE id = $1`, [id]);
    expect(loop.status).toBe('active');
    expect(loop.next_run_at.toISOString()).toBe(nextRuns(loop.cron, loop.timezone, ex.started_at, 1)[0]!.toISOString()); // the first cron boundary after Start
    await expect(r.getByTestId('row-right')).toHaveText(`— → ${hm(loop.next_run_at)}`);
    await expect(r.getByTestId('row-exec')).toHaveText(/^exec #1 /);

    // Running: no Start button on the row any more, only Stop; the API rejects a second Start.
    await revealRowActions(r);
    await expect(r.getByTestId('row-start')).toHaveCount(0);
    await expect(r.getByTestId('row-stop')).toBeVisible();
    const again = await request.post(`/api/loops/${id}/start`);
    expect(again.status()).toBe(409);
    expect(((await again.json()) as Json).error.code).toBe('LOOP_ALREADY_ACTIVE');

    // A screen in another tab still has the old numbers (receives no events), presses Start -> the server rejects -> red toast translated by code (D-UI3).
    expect(await post(request, `/api/loops/${id}/stop`)).toBe(200);
    const ctx = await browser.newContext({ timezoneId: TZ });
    const stale = await ctx.newPage();
    try {
      await stale.route('**/api/events**', () => {}); // SSE hangs: no live events
      await gotoApp(stale, '/');
      const sr = row(stale, 'Loop Start');
      await expect(sr.locator('[data-testid="row-status"][data-status="stopped"]')).toBeVisible();
      expect(await post(request, `/api/loops/${id}/start`)).toBe(200); // execution #2 opened in "another tab"
      await revealRowActions(sr);
      await sr.getByTestId('row-start').click();
      await expect(stale.locator('.toast.is-err')).toHaveText(t('toast.failed', { msg: t('error.LOOP_ALREADY_ACTIVE') }));
      await expect(sr.locator('[data-testid="row-status"][data-status="running"]')).toBeVisible({ timeout: 2_000 }); // rejected -> reload, sees the true state
    } finally {
      await ctx.close();
    }
    expect(await n(`SELECT count(*) n FROM loop_executions WHERE loop_id = $1`, [id])).toBe(2); // no extra execution opened
    expect(await n(`SELECT count(*) n FROM runs WHERE loop_id = $1 AND status = 'running'`, [id])).toBe(1);

    // The main screen (with live) sees execution #2, run #2 (the loop's lifetime run number) without F5.
    await expect(r.getByTestId('row-exec')).toHaveText(/^exec #2 /, { timeout: 2_000 });
    await expect(r.locator('[data-testid="row-status"][data-status="running"]')).toHaveText(/^#2 /);
    await stillNoReload(page);
  });

  test('UC-05: Stop from a row -> asks when a run is going (D-UI1) -> run cancelled <= 5 seconds, execution closed stopped when pressed, no more scheduled runs', { tag: '@UC-05' }, async ({ page, request }) => {
    test.setTimeout(60_000);
    const id = await createLoop(request, 'Loop Stop');
    expect(await post(request, `/api/loops/${id}/start`)).toBe(200);
    await gotoApp(page, '/');
    const r = row(page, 'Loop Stop');
    await expect(r.locator('[data-testid="row-status"][data-status="running"]')).toBeVisible();
    await markNoReload(page);

    await revealRowActions(r);
    await r.getByTestId('row-stop').click();
    const dialog = page.getByTestId('stop-dialog');
    await expect(dialog).toContainText(t('dialog.stop.title', { name: 'Loop Stop' }));
    await expect(dialog).toContainText(/Run #1, in progress for 00:\d\d, will be cancelled \(within 5 seconds\)\. Execution #1 ends with reason Stopped by user\./);
    // Cancel the box -> nothing changes.
    await page.getByTestId('stop-cancel').click();
    await expect(dialog).toHaveCount(0);
    expect((await one<{ status: string }>(`SELECT status FROM loops WHERE id = $1`, [id])).status).toBe('active');

    await revealRowActions(r);
    await r.getByTestId('row-stop').click();
    const clickedAt = Date.now();
    await page.getByTestId('stop-confirm').click();
    await expect(r.locator('[data-testid="row-status"][data-status="stopped"]')).toHaveText(t('list.row.stopped'), { timeout: 5_000 });

    const run = await one<{ status: string; finished_at: Date }>(`SELECT status, finished_at FROM runs WHERE loop_id = $1`, [id]);
    expect(run.status).toBe('cancelled');
    expect(run.finished_at.getTime() - clickedAt).toBeLessThan(5_000);
    const ex = await one<{ ended_at: Date; end_reason: string }>(`SELECT ended_at, end_reason FROM loop_executions WHERE loop_id = $1`, [id]);
    expect(ex.end_reason).toBe('stopped');
    expect(Math.abs(ex.ended_at.getTime() - clickedAt)).toBeLessThan(2_000); // endedAt = the moment of the press
    expect(await one(`SELECT status, next_run_at FROM loops WHERE id = $1`, [id])).toEqual({ status: 'stopped', next_run_at: null });
    await expect(r.locator('[data-testid="row-right"][data-status="cancelled"]')).toHaveCount(1);
    await expect(r.getByTestId('row-counts')).toHaveCount(0);

    // No new scheduled run: advance the server clock past 4 */30 boundaries -> still exactly 1 run.
    expect((await request.post('/api/__test/clock', { data: { advanceMs: 2 * 3_600_000 } })).status()).toBe(200);
    await page.waitForTimeout(2_500); // >= 2 ticker beats of 1 second
    expect(await n(`SELECT count(*) n FROM runs WHERE loop_id = $1`, [id])).toBe(1);

    // D-UI1: a loop waiting for the next run (no run going) -> pressing Stop stops straight away, no question.
    const idle = await createLoop(request, 'Loop waiting', { executor: { kind: 'mock', config: { durationSec: 1, failRate: 0 } } });
    expect(await post(request, `/api/loops/${idle}/start`)).toBe(200);
    const ri = row(page, 'Loop waiting');
    // The first run (1 second) that starts at once on Start must be done first: between the moment the loop becomes active and
    // the moment the run is written, the row briefly shows "waiting for next run" - pressing Stop then opens the confirmation
    // box because the run is going.
    await expect(ri.locator('[data-testid="row-right"][data-status="succeeded"]')).toHaveCount(1, { timeout: 5_000 });
    await expect(ri.locator('[data-testid="row-status"][data-status="active"]')).toHaveText(t('list.row.idle'), { timeout: 5_000 });
    await revealRowActions(ri);
    await ri.getByTestId('row-stop').click();
    await expect(ri.locator('[data-testid="row-status"][data-status="stopped"]')).toHaveText(t('list.row.stopped'), { timeout: 2_000 });
    await expect(page.getByTestId('stop-dialog')).toHaveCount(0);
    expect(await one(`SELECT end_reason FROM loop_executions WHERE loop_id = $1`, [idle])).toEqual({ end_reason: 'stopped' });
    await stillNoReload(page);
  });
});
