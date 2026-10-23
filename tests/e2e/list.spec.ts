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
import { gotoApp, statValue } from '../support/ui';

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

// The list (spec 7.2) shows per-row figures on the loop page and the row's run as words: these build its expected texts from the
// message catalogue. `pattern` replaces the one `{x}` parameter left in the text.
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const HOLE = '\u0000';
const keyRe = (text: string, pattern: string) => new RegExp(`^${escapeRe(text).replace(HOLE, pattern)}$`);
/** The new row's working run, `run #n · m:ss` (`row.runningFor`); `clock` is the pattern of its duration. */
const runningFor = (n: number, clock = '\\d+:\\d\\d') => keyRe(t('row.runningFor', { n, d: HOLE }), clock);
/** A span under a minute, `42 s` (`dur.s`), as the loop page's `fig-active` writes it. */
const seconds = new RegExp(escapeRe(t('dur.s', { s: HOLE })).replace(HOLE, '\\d+'));
/** A new-UI page opened with a client-side link from the list and left the same way (`nav-loops`), so the page never reloads. */
async function onLoopPage(page: Page, name: string, check: () => Promise<void>) {
  await row(page, name).getByTestId('loop-name').click();
  await expect(page.getByTestId('loop-header')).toContainText(name);
  await check();
  await page.getByTestId('nav-loops').click();
  await expect(page).toHaveURL(/\/$/);
}
/** The loop page's current active period head (spec 7.2: it carries `data-execution-id`), `Active period #k · …`. */
const periodHead = (page: Page, executionId: string) => page.locator(`[data-execution-id="${executionId}"]`).first();

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
    // A loop's state is its pill word (`row-status`).
    const stoppedWord = t('status.stopped');

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
    expect(`✓${st.ok} ✗${st.err} ⊘${st.cancel} ↷${st.skip}`).toBe('✓2 ✗2 ⊘1 ↷1');
    const running = await one<{ iteration: number }>(`SELECT iteration FROM runs WHERE loop_id = $1 AND status = 'running'`, [a]);
    const last = await one<{ id: string; status: string; started_at: Date }>(
      `SELECT id, status, started_at FROM runs WHERE loop_id = $1 AND status NOT IN ('running','skipped') ORDER BY started_at DESC LIMIT 1`,
      [a],
    );
    const loopA = await one<{ next_run_at: Date }>(`SELECT next_run_at FROM loops WHERE id = $1`, [a]);
    // The row says the run working and the next run (spec 7.2); the counts, the active period and the last result are on the loop page.
    await expect(rowA.locator('[data-testid="row-status"][data-status="running"]')).toHaveText(t('status.running'));
    await expect(rowA.getByTestId('row-last')).toHaveText(runningFor(running.iteration));
    await expect(rowA.getByTestId('row-next')).toHaveText(hm(loopA.next_run_at));
    await expect(rowA).toContainText('Every 30 minutes'); // the schedule column
    await onLoopPage(page, 'Alpha running', async () => {
      for (const [key, n] of [['count.succeeded', st.ok], ['count.failed', st.err], ['count.cancelled', st.cancel], ['count.skipped', st.skip]] as const) {
        await expect(page.getByTestId('fig-runs')).toContainText(t(key, { n: n! }));
      }
      await expect(page.getByTestId('fig-active')).toContainText(seconds);
      await expect(periodHead(page, exA.id)).toContainText(new RegExp(`^${escapeRe(t('period.title', { k: st.seq! }))} `));
      const lastRun = page.getByTestId('recent-runs').locator(`[data-testid="run-row"][data-run-id="${last.id}"]`);
      await expect(lastRun).toHaveAttribute('data-status', last.status);
      await expect(lastRun).toContainText(hm(last.started_at));
    });

    // -- stopped loop / loop never started
    const rowB = row(page, 'Beta stopped');
    await expect(rowB.locator('[data-testid="row-status"][data-status="stopped"]')).toHaveText(stoppedWord);
    await expect(rowB.getByTestId('row-counts')).toHaveCount(0);
    const lastB = await one<{ started_at: Date }>(`SELECT started_at FROM runs WHERE loop_id = $1 AND status = 'cancelled'`, [b]);
    await expect(rowB.getByTestId('row-last')).toHaveText(t('row.lastCancelled', { t: hm(lastB.started_at) })); // the first run was cancelled by Stop
    await expect(row(page, 'Gamma new').getByTestId('row-last')).toHaveText(t('row.neverStarted'));

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
      const stats = [
        ['active-loops', 'top.stats.activeLoops', s.active],
        ['running-runs', 'top.stats.runningRuns', s.running],
        ['runs-today', 'top.stats.runsToday', s.today],
        ['errors-24h', 'top.stats.errors24h', s.errors],
      ] as const;
      for (const [stat, , value] of stats) {
        // The summary items carry the number in `data-value` (spec 7.2).
        await expect(statValue(page, stat)).toHaveAttribute('data-value', String(value), { timeout: 2_000 });
      }
      // A space between a tab's label and its count.
      const tab = (label: string, count: number) => `${label} ${count}`;
      await expect(page.getByTestId('tab-all')).toHaveText(tab(t('list.filter.all'), s.all), { timeout: 2_000 });
      await expect(page.getByTestId('tab-active')).toHaveText(tab(t('list.filter.active'), s.active), { timeout: 2_000 });
      await expect(page.getByTestId('tab-stopped')).toHaveText(tab(t('list.filter.stopped'), s.stopped), { timeout: 2_000 });
      await expect(page.getByTestId('tab-archived')).toHaveText(tab(t('list.filter.archived'), s.archived), { timeout: 2_000 });
      return s;
    };
    expect(await expectStats()).toEqual({ active: 1, running: 1, today: 7, errors: 2, all: 3, stopped: 2, archived: 1 });
    await expect(statValue(page, 'errors-24h')).toHaveAttribute('data-alert', 'true');

    // -- live update: the "running for" clock keeps ticking
    // (the clock is the row's `row.runningFor`, next to the pill)
    const clock = rowA.getByTestId('row-last');
    const clock0 = await clock.textContent();
    await expect(clock).not.toHaveText(clock0!, { timeout: 2_000 });

    // -- live update through events (Start / Stop / create from "another tab" = API), <= 2 seconds, no F5
    expect(await post(request, `/api/loops/${c}/start`)).toBe(200);
    await expect(row(page, 'Gamma new').locator('[data-testid="row-status"][data-status="running"]')).toHaveText(t('status.running'), { timeout: 2_000 });
    await expect(row(page, 'Gamma new').getByTestId('row-last')).toHaveText(runningFor(1, '0:0\\d'), { timeout: 2_000 });
    expect((await expectStats()).active).toBe(2);
    expect(await post(request, `/api/loops/${a}/stop`)).toBe(200);
    await expect(rowA.locator('[data-testid="row-status"][data-status="stopped"]')).toHaveText(stoppedWord, { timeout: 2_000 });
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
    await page.getByTestId('list-no-match').getByRole('button', { name: t('loops.clearSearch') }).click();
    await expect(page.getByTestId('loop-row')).toHaveCount(4);
    await page.getByTestId('tab-active').click();
    await expect(page.getByTestId('loop-name')).toHaveText(['Gamma new']);
    await page.getByTestId('tab-stopped').click();
    await expect(page.getByTestId('loop-name')).toHaveText(['Epsilon just created', 'Beta stopped', 'Alpha running']);
    await page.getByTestId('tab-archived').click();
    await expect(page.getByTestId('loop-name')).toHaveText(['Delta archived']);
    await expect(page.getByTestId('loop-row').locator('[data-testid="row-status"][data-status="archived"]')).toHaveText(t('status.archived'));
    await page.getByTestId('tab-all').click();
    await expect(page.getByTestId('loop-row')).toHaveCount(4);

    // -- click a row -> loop detail (the row is selected; the new loop page names its loop and holds the row's last active period)
    await row(page, 'Beta stopped').getByTestId('loop-name').click();
    await expect(page).toHaveURL(new RegExp(`/loops/${b}$`));
    await expect(page.locator(`[data-testid="loop-header"][data-status="stopped"]`)).toContainText('Beta stopped');
    await expect(page.getByTestId('fig-active')).toContainText(seconds);
    await expect(periodHead(page, exB.id)).toContainText(new RegExp(`^${escapeRe(t('period.title', { k: 1 }))} `));
    await stillNoReload(page);
  });

  test('UC-04: Start from a row -> new execution, the first run trigger=start runs at once, the next run on the exact cron boundary; while running there is no Start (LOOP_ALREADY_ACTIVE)', { tag: '@UC-04' }, async ({ page, request, browser }) => {
    test.setTimeout(60_000);
    const id = await createLoop(request, 'Loop Start');
    await gotoApp(page, '/');
    const r = row(page, 'Loop Start');
    await expect(r.locator('[data-testid="row-status"][data-status="stopped"]')).toBeVisible();
    await markNoReload(page);

    // Row actions are visible at rest (D9).
    await expect(r.getByTestId('row-start')).toBeVisible();
    await expect(r.getByTestId('row-start')).toBeVisible();
    await r.getByTestId('row-start').click();
    await expect(r.getByTestId('row-last')).toHaveText(runningFor(1, '0:0\\d'), { timeout: 2_000 });
    await expect(r.locator('[data-testid="row-status"][data-status="running"]')).toBeVisible();

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
    // The row says the working run (above) and the next run; the active period is the loop page's current period head (spec 7.2).
    await expect(r.getByTestId('row-next')).toHaveText(hm(loop.next_run_at));
    await onLoopPage(page, 'Loop Start', async () => {
      await expect(periodHead(page, ex.id)).toContainText(new RegExp(`^${escapeRe(t('period.title', { k: 1 }))} `));
    });

    // Running: no Start button on the row any more, only Stop; the API rejects a second Start.
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
      await sr.getByTestId('row-start').click();
      await expect(stale.locator('.toast.is-err')).toHaveText(t('toast.failed', { msg: t('error.LOOP_ALREADY_ACTIVE') }));
      await expect(sr.locator('[data-testid="row-status"][data-status="running"]')).toBeVisible({ timeout: 2_000 }); // rejected -> reload, sees the true state
    } finally {
      await ctx.close();
    }
    expect(await n(`SELECT count(*) n FROM loop_executions WHERE loop_id = $1`, [id])).toBe(2); // no extra execution opened
    expect(await n(`SELECT count(*) n FROM runs WHERE loop_id = $1 AND status = 'running'`, [id])).toBe(1);

    // The main screen (with live) sees execution #2, run #2 (the loop's lifetime run number) without F5.
    await expect(r.getByTestId('row-last')).toHaveText(runningFor(2), { timeout: 2_000 });
    const ex2 = await one<{ id: string }>(`SELECT id FROM loop_executions WHERE loop_id = $1 AND seq = 2`, [id]);
    await onLoopPage(page, 'Loop Start', async () => {
      await expect(periodHead(page, ex2.id)).toContainText(new RegExp(`^${escapeRe(t('period.title', { k: 2 }))} `));
    });
    await stillNoReload(page);
  });

  test('UC-05: Stop from a row -> asks when a run is going (D-UI1) -> run cancelled <= 5 seconds, execution closed stopped when pressed, no more scheduled runs', { tag: '@UC-05' }, async ({ page, request }) => {
    test.setTimeout(60_000);
    const id = await createLoop(request, 'Loop Stop');
    expect(await post(request, `/api/loops/${id}/start`)).toBe(200);
    await gotoApp(page, '/');
    const stoppedWord = t('status.stopped');
    const r = row(page, 'Loop Stop');
    await expect(r.locator('[data-testid="row-status"][data-status="running"]')).toBeVisible();
    await markNoReload(page);

    await r.getByTestId('row-stop').click();
    const dialog = page.getByTestId('stop-dialog');
    // The new sheet's texts (spec Appendix B): `stop.title`, and `stop.body` with the run's clock.
    await expect(dialog).toContainText(t('stop.title', { name: 'Loop Stop' }));
    await expect(dialog).toContainText(new RegExp(escapeRe(t('stop.body', { n: 1, d: HOLE, k: 1 })).replace(HOLE, '0:\\d\\d')));
    // Cancel the box -> nothing changes.
    await page.getByTestId('stop-cancel').click();
    await expect(dialog).toHaveCount(0);
    expect((await one<{ status: string }>(`SELECT status FROM loops WHERE id = $1`, [id])).status).toBe('active');

    await r.getByTestId('row-stop').click();
    const clickedAt = Date.now();
    await page.getByTestId('stop-confirm').click();
    await expect(r.locator('[data-testid="row-status"][data-status="stopped"]')).toHaveText(stoppedWord, { timeout: 5_000 });

    const run = await one<{ status: string; started_at: Date; finished_at: Date }>(`SELECT status, started_at, finished_at FROM runs WHERE loop_id = $1`, [id]);
    expect(run.status).toBe('cancelled');
    expect(run.finished_at.getTime() - clickedAt).toBeLessThan(5_000);
    const ex = await one<{ ended_at: Date; end_reason: string }>(`SELECT ended_at, end_reason FROM loop_executions WHERE loop_id = $1`, [id]);
    expect(ex.end_reason).toBe('stopped');
    expect(Math.abs(ex.ended_at.getTime() - clickedAt)).toBeLessThan(2_000); // endedAt = the moment of the press
    expect(await one(`SELECT status, next_run_at FROM loops WHERE id = $1`, [id])).toEqual({ status: 'stopped', next_run_at: null });
    await expect(r.getByTestId('row-last')).toHaveText(t('row.lastCancelled', { t: hm(run.started_at) }));
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
    await expect(ri.getByTestId('row-last')).toHaveText(keyRe(t('row.lastOk', { t: HOLE }), '\\d\\d:\\d\\d'), { timeout: 5_000 });
    await expect(ri.locator('[data-testid="row-status"][data-status="active"]')).toHaveText(t('status.waiting'), { timeout: 5_000 });
    await ri.getByTestId('row-stop').click();
    await expect(ri.locator('[data-testid="row-status"][data-status="stopped"]')).toHaveText(stoppedWord, { timeout: 2_000 });
    await expect(page.getByTestId('stop-dialog')).toHaveCount(0);
    expect(await one(`SELECT end_reason FROM loop_executions WHERE loop_id = $1`, [idle])).toEqual({ end_reason: 'stopped' });
    await stillNoReload(page);
  });
});
