/// <reference lib="dom" />
// E2E for running up to N runs in parallel (UC-32). Real from end to end: browser -> build -> Fastify -> Postgres (test DB,
// test mode) -> real ClaudeAgentExecutor with a **fake Claude** (repo named `lc-fake-claude-*`, prompt `[soak:N]` -> the session soaks N
// real seconds then finishes - test-mode-query.ts), so it costs no subscription. The loop is created and edited THROUGH THE FORM; cron
// ticks arrive by advancing the server clock (`/api/__test/clock`), while the soak time is real seconds - so runs end apart by exactly
// the gap they were opened with.
// Every assertion is checked against a `SELECT` on the DB, not the text on screen.
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { databaseUrl, loadDotEnv } from '../../server/config';
import { FAKE_CLAUDE_DIR_PREFIX } from '../../server/adapters/executors/claude/test-mode-query';
import { fill, pickRepo } from '../support/form-kit';
import { skipParallel, soakSummary } from '../support/server-text';
import { t } from '../support/ui-text';

loadDotEnv();
test.use({ timezoneId: 'Asia/Ho_Chi_Minh' });

/** Seconds each run soaks and the real gap between two run openings - a later run ends exactly GAP seconds after the previous one. */
const SOAK = 30;
const GAP = 6_000;
const NAME = 'UC-32 parallel';
/** Evidence screenshots for the PR (reports/ is not in git). */
const shot = (page: Page, name: string) => page.screenshot({ path: `reports/uc32/${name}.png`, fullPage: true });

let db: pg.Pool;
test.beforeAll(() => {
  db = new pg.Pool({ connectionString: databaseUrl(process.env, 'test'), max: 3 });
});
test.afterAll(async () => {
  await db?.end();
});

type RunRow = { id: string; iteration: number | null; status: string; skip_reason: string | null; session_id: string | null };
const runsOf = async (loopId: string) =>
  (await db.query<RunRow>('SELECT id, iteration, status, skip_reason, session_id FROM runs WHERE loop_id = $1 ORDER BY started_at, id', [loopId])).rows;
/** Highest number of running runs ever seen (every read in the test) - the DB must never exceed N. */
let maxRunningSeen = 0;
async function running(loopId: string): Promise<RunRow[]> {
  const rows = (await runsOf(loopId)).filter((r) => r.status === 'running');
  maxRunningSeen = Math.max(maxRunningSeen, rows.length);
  return rows;
}
async function until<T>(read: () => Promise<T>, ok: (v: T) => boolean, ms = 15_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await read();
    if (ok(v)) return v;
    if (Date.now() > end) throw new Error(`timed out after ${ms} ms waiting: ${JSON.stringify(v)}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}
const loopRowIn = (page: Page) =>
  page.getByTestId('loop-row').filter({ has: page.locator('.row-name .nm', { hasText: new RegExp(`^${NAME}$`) }) });

test('UC-32: run up to N runs in parallel - N = 3 via the form: 3 runs running at once, the 4th skipped; lowering to 2 lets the 3 running runs finish, later ticks are skipped until 1 run is left; the DB blocks run N + 1 itself; Stop cancels every run', { tag: '@UC-32' }, async ({ page, request }) => {
  test.setTimeout(180_000);
  expect((await request.post('/api/__test/reset')).status()).toBe(204);
  const clock = async (at: string) => expect((await request.post('/api/__test/clock', { data: { at } })).status()).toBe(200);
  await clock('2026-11-02T03:00:05Z');
  // Repo = a temp folder named lc-fake-claude-* -> fake Claude in test mode.
  const dir = realpathSync(mkdtempSync(join(tmpdir(), FAKE_CLAUDE_DIR_PREFIX)));
  expect((await request.post('/api/repos', { data: { path: dir, name: 'fake-claude' } })).status()).toBe(201);

  // 1. Create the loop THROUGH THE FORM: every 1 minute, Claude, max concurrent runs = 3.
  await page.goto('/loops/new');
  await expect(page.getByTestId('sched-out')).toHaveAttribute('data-state', 'ok');
  await expect(page.getByTestId('f-max-concurrent')).toHaveValue('1'); // default = the old rule
  await fill(page, 'f-name', NAME);
  await fill(page, 'f-prompt', `Handle one issue [soak:${SOAK}]`);
  await pickRepo(page, 'fake-claude');
  await fill(page, 'sched-minutes', '1');
  await fill(page, 'f-max-concurrent', '3');
  await page.getByTestId('form-submit').click();
  await expect(page).toHaveURL(/\/loops\/[0-9a-f-]{36}$/);
  const loopId = page.url().split('/').pop()!;
  expect((await db.query('SELECT max_concurrent, executor_kind FROM loops WHERE id = $1', [loopId])).rows[0]).toEqual({ max_concurrent: 3, executor_kind: 'claude' });
  await expect(page.getByTestId('config-executor')).toContainText(t('loop.meta.concurrent', { n: 3 }));

  // 2. Start (run #1) then two cron ticks GAP real seconds apart (runs #2, #3) -> 3 runs running at once.
  await page.getByTestId('loop-start').click();
  await until(() => running(loopId), (r) => r.length === 1);
  for (const [i, at] of [['2', '2026-11-02T03:01:05Z'], ['3', '2026-11-02T03:02:05Z']] as const) {
    await page.waitForTimeout(GAP);
    await clock(at);
    await until(() => running(loopId), (r) => r.length === Number(i));
  }
  // The session id is reported a moment after the run row opens, so wait until all three have one.
  const three = await until(() => running(loopId), (r) => r.length === 3 && r.every((x) => x.session_id !== null));
  expect(three.map((r) => r.iteration)).toEqual([1, 2, 3]);
  expect(new Set(three.map((r) => r.session_id)).size).toBe(3); // every run has its own Claude session
  expect(three.every((r) => r.session_id !== null)).toBe(true);
  await expect(page.locator('.ph .st.running')).toContainText(t('loop.runningMany', { c: 3, list: '#3 #2 #1' }), { timeout: 5_000 });
  await expect(page.getByTestId('runs-table').locator('[data-status="running"]')).toHaveCount(3, { timeout: 5_000 });
  await expect(loopRowIn(page).locator('.st.running')).toContainText('×3', { timeout: 5_000 });
  await shot(page, '1-three-runs-running');

  // 3. The DB blocks it itself: insert a 4th running run directly -> trigger runs_max_concurrent_per_loop (23514).
  const execId = (await db.query('SELECT id FROM loop_executions WHERE loop_id = $1 AND ended_at IS NULL', [loopId])).rows[0].id;
  const raw = await db
    .query(
      `INSERT INTO runs (id, loop_id, execution_id, iteration, trigger, status, started_at, prompt_snapshot, executor_kind, executor_config)
       VALUES (gen_random_uuid(), $1, $2, 99, 'schedule', 'running', now(), 'p', 'claude', '{}')`,
      [loopId, execId],
    )
    .then(
      () => null,
      (e: { code?: string; constraint?: string }) => `${e.code} ${e.constraint}`,
    );
  expect(raw).toBe('23514 runs_max_concurrent_per_loop');

  // 4. The 4th tick with 3 runs going -> skipped, the reason names N and the runs still going.
  //    (skip_reason is produced by the server, which still writes Vietnamese today.)
  await clock('2026-11-02T03:03:05Z');
  const s1 = await until(() => runsOf(loopId), (r) => r.some((x) => x.status === 'skipped'));
  expect(s1.filter((r) => r.status === 'skipped').map((r) => r.skip_reason)).toEqual([skipParallel(3, '#1, #2, #3')]);
  await expect(page.getByTestId('runs-table').locator('[data-status="skipped"]').first()).toContainText(skipParallel(3, '#1, #2, #3'), { timeout: 5_000 });

  // 5. Edit THROUGH THE FORM down to 2 while 3 runs are running -> DB changes, no run is cancelled.
  await page.getByTestId('loop-edit').click();
  await expect(page.getByTestId('f-max-concurrent')).toHaveValue('3');
  await fill(page, 'f-max-concurrent', '2');
  await page.getByTestId('f-max-concurrent').scrollIntoViewIfNeeded();
  await shot(page, '2-form-lowered-to-2');
  await page.getByTestId('form-submit').click();
  await expect(page).toHaveURL(new RegExp(`/loops/${loopId}$`));
  expect((await db.query('SELECT max_concurrent FROM loops WHERE id = $1', [loopId])).rows[0].max_concurrent).toBe(2);
  await expect(page.getByTestId('config-executor')).toContainText(t('loop.meta.concurrent', { n: 2 }));
  expect((await running(loopId)).map((r) => r.iteration)).toEqual([1, 2, 3]);
  await expect(page.getByTestId('runs-table').locator('[data-status="running"]')).toHaveCount(3);
  await shot(page, '3-lowered-to-2-still-3-running');

  // 6. A tick arrives while 3 (>= 2) runs are going -> skipped with the new N.
  await clock('2026-11-02T03:04:05Z');
  await until(() => runsOf(loopId), (r) => r.filter((x) => x.status === 'skipped').length === 2);

  // 7. Run #1 finishes its soak -> succeeded (not cancelled); 2 left = N -> the tick is still skipped.
  await until(() => runsOf(loopId), (r) => r.find((x) => x.iteration === 1)?.status === 'succeeded', (SOAK + 5) * 1000);
  expect((await running(loopId)).map((r) => r.iteration)).toEqual([2, 3]);
  await clock('2026-11-02T03:05:05Z');
  const s3 = await until(() => runsOf(loopId), (r) => r.filter((x) => x.status === 'skipped').length === 3);
  expect(s3.filter((r) => r.status === 'skipped').map((r) => r.skip_reason)).toEqual([
    skipParallel(3, '#1, #2, #3'),
    skipParallel(2, '#1, #2, #3'),
    skipParallel(2, '#2, #3'),
  ]);

  // 8. Run #2 finishes -> 1 left < 2 -> the next tick opens run #4.
  await until(() => runsOf(loopId), (r) => r.find((x) => x.iteration === 2)?.status === 'succeeded', GAP + 10_000);
  await clock('2026-11-02T03:06:05Z');
  expect((await until(() => running(loopId), (r) => r.length === 2)).map((r) => r.iteration)).toEqual([3, 4]);

  // 9. Run #3 also runs to the end; the next tick opens run #5 -> 2 runs going (#4, #5).
  await until(() => runsOf(loopId), (r) => r.find((x) => x.iteration === 3)?.status === 'succeeded', GAP + 10_000);
  await clock('2026-11-02T03:07:05Z');
  expect((await until(() => running(loopId), (r) => r.length === 2)).map((r) => r.iteration)).toEqual([4, 5]);
  const done = await runsOf(loopId);
  expect(done.filter((r) => r.iteration !== null && r.iteration <= 3).map((r) => r.status)).toEqual(['succeeded', 'succeeded', 'succeeded']);
  expect(done.some((r) => r.status === 'cancelled')).toBe(false);
  // (summary text of the fake Claude comes from the server, see server-text.ts)
  expect((await db.query(`SELECT summary FROM runs WHERE loop_id = $1 AND iteration = 1`, [loopId])).rows[0].summary).toBe(soakSummary(SOAK));

  // 10. Stop (the confirmation box names both runs) -> every running run cancelled, execution closed.
  await page.getByTestId('loop-stop').click();
  await expect(page.getByTestId('stop-dialog')).toContainText(/2 runs in progress \(#5 #4\) will be cancelled/);
  await expect(page.getByTestId('runs-table').locator('[data-status="succeeded"]')).toHaveCount(3, { timeout: 5_000 });
  await shot(page, '4-stop-dialog-and-three-finished');
  await page.getByTestId('stop-confirm').click();
  const end = await until(() => runsOf(loopId), (r) => !r.some((x) => x.status === 'running'));
  expect(end.filter((r) => r.iteration === 4 || r.iteration === 5).map((r) => r.status)).toEqual(['cancelled', 'cancelled']);
  expect((await db.query('SELECT end_reason FROM loop_executions WHERE id = $1', [execId])).rows[0].end_reason).toBe('stopped');
  expect(maxRunningSeen).toBe(3); // never above the largest N (3)
});
