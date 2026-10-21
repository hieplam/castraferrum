/// <reference lib="dom" />
// E2E for the 3 detail screens: UC-06 loop detail + live log + history, UC-07 run detail, UC-08 execution detail
// + session ids, UC-11 archive / restore. All real: browser -> build -> Fastify -> Postgres (the shared Playwright e2e server,
// test mode); the Mock executor runs in real seconds, the server clock is advanced with `/api/__test/clock` so ticks arrive at once.
// Every assertion is checked against a `SELECT` on the test DB - the numbers on screen must be the numbers in the DB.
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import pg from 'pg';
import { databaseUrl, loadDotEnv } from '../../server/config';
import { ensureTestRepo } from '../support/test-repo';
import { t } from '../support/ui-text';

loadDotEnv();
const db = new pg.Pool({ connectionString: databaseUrl(process.env, 'test'), max: 2 });
test.afterAll(() => db.end());

type Loop = { id: string; activeRun: { id: string } | null; currentExecution: { id: string } | null };

async function call<T = unknown>(request: APIRequestContext, method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ status: number; body: T }> {
  const res = await request.fetch(path, { method, ...(body === undefined ? {} : { data: body }) });
  const text = await res.text();
  return { status: res.status(), body: (text ? JSON.parse(text) : null) as T };
}
async function createLoop(request: APIRequestContext, name: string, config: { durationSec: number; failRate?: number }, cron = '*/30 * * * *') {
  const res = await call<Loop>(request, 'POST', '/api/loops', {
    repoId: await ensureTestRepo((m, u, b) => call(request, m, u, b)),
    timeoutSec: 1800,
    name,
    prompt: `Prompt of ${name}\nsecond line`,
    cron,
    executor: { kind: 'mock', config: { failRate: 0, ...config } },
  });
  expect(res.status).toBe(201);
  return res.body;
}
const getLoop = async (request: APIRequestContext, id: string) => (await call<Loop>(request, 'GET', `/api/loops/${id}`)).body;
const rows = async <T>(sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as T[];
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
const runStatus = (id: string) => rows<{ status: string }>('SELECT status FROM runs WHERE id = $1', [id]).then((r) => r[0]?.status);
async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByTestId('lamp-server')).toHaveAttribute('data-state', 'ok');
}

test.beforeEach(async ({ request }) => {
  expect((await call(request, 'POST', '/api/__test/reset')).status).toBe(204);
});

test.describe('loop detail · execution · run', () => {
  test('UC-06: click a loop -> Start -> the running run prints working… every second (new line shows within 1 s), history matches the DB, longest execution is right, Stop right there', { tag: '@UC-06' }, async ({ page, request }) => {
    test.setTimeout(90_000);
    const loop = await createLoop(request, 'UC-06 live log', { durationSec: 6 });
    // Record when each log line (data-seq) appears in the live log block - machine clock, same machine as the server.
    await page.addInitScript(() => {
      const seen: Record<string, number> = {};
      (window as unknown as { __seen: typeof seen }).__seen = seen;
      new MutationObserver(() => {
        document.querySelectorAll('[data-testid="live-log"] [data-seq]').forEach((el) => {
          const s = (el as HTMLElement).dataset.seq as string;
          if (!(s in seen)) seen[s] = Date.now();
        });
      }).observe(document, { childList: true, subtree: true });
    });
    await open(page, `/loops/${loop.id}`);
    await expect(page.getByTestId('loop-header')).toHaveAttribute('data-status', 'stopped');
    const shownAt = Date.now();
    await page.getByTestId('loop-start').click();

    // Run #1 starts at once (UC-04) and its log runs live on screen, no F5.
    await expect(page.locator('.ph .st.running')).toContainText('Run #1 in progress');
    const live = page.getByTestId('live-log');
    await expect(live.locator('[data-seq="6"]')).toBeVisible({ timeout: 15_000 });
    await expect(live).toHaveAttribute('data-paused', 'false');
    const [run] = await rows<{ id: string }>('SELECT id FROM runs WHERE loop_id = $1', [loop.id]);
    const logs = await rows<{ seq: number; at: Date; message: string }>('SELECT seq, at, message FROM run_logs WHERE run_id = $1 ORDER BY seq', [run!.id]);
    const seen = await page.evaluate(() => (window as unknown as { __seen: Record<string, number> }).__seen);
    // Lines the executor printed AFTER the screen opened: shown on screen <= 1 second after their `at`.
    const measured = logs.filter((l) => l.at.getTime() > shownAt && String(l.seq) in seen);
    expect(measured.length, `measurable lines: ${JSON.stringify(logs.map((l) => l.seq))}`).toBeGreaterThanOrEqual(4);
    for (const l of measured) {
      const lag = (seen[String(l.seq)] as number) - l.at.getTime();
      expect(lag, `line #${l.seq} «${l.message}» appeared after ${lag} ms`).toBeLessThanOrEqual(1_000);
    }
    await expect(live.locator('[data-seq="2"]')).toContainText('working… (1/6)');

    // Execution + run history = DB.
    const execs = await rows<{ id: string }>('SELECT id FROM loop_executions WHERE loop_id = $1', [loop.id]);
    await expect(page.getByTestId('exec-row')).toHaveCount(execs.length);
    const dbRuns = await rows<{ id: string }>('SELECT id FROM runs WHERE loop_id = $1', [loop.id]);
    await expect(page.getByTestId('runs-table').getByTestId('run-row')).toHaveCount(dbRuns.length);

    // Stop while a run is going -> confirmation box (D-UI1) -> run `cancelled` <= 5 seconds, execution closed `stopped`.
    await page.getByTestId('loop-stop').click();
    await expect(page.getByTestId('stop-dialog')).toBeVisible();
    await page.getByTestId('stop-confirm').click();
    const t0 = Date.now();
    await until(() => runStatus(run!.id), (s) => s === 'cancelled', 5_000);
    expect(Date.now() - t0).toBeLessThanOrEqual(5_000);
    await expect(page.getByTestId('loop-header')).toHaveAttribute('data-status', 'stopped');
    expect(await rows('SELECT end_reason FROM loop_executions WHERE loop_id = $1', [loop.id])).toEqual([{ end_reason: 'stopped' }]);
    await expect(page.getByTestId('last-run').getByTestId('run-row')).toHaveAttribute('data-status', 'cancelled');

    // Execution #2: finish a run then Stop while waiting for the next one -> stops straight away, no question (D-UI1).
    await page.getByTestId('loop-start').click();
    await expect(page.locator('.ph .st.running')).toContainText('Run #2 in progress');
    await expect(page.locator('.ph .st.active')).toContainText('next run', { timeout: 15_000 });
    await page.getByTestId('loop-stop').click();
    await expect(page.getByTestId('stop-dialog')).toHaveCount(0);
    await expect(page.getByTestId('loop-header')).toHaveAttribute('data-status', 'stopped');
    await expect(page.getByTestId('exec-row')).toHaveCount(2);

    // Longest execution = SELECT; number of executions and total runs = DB.
    const [longest] = await rows<{ seq: number; sec: number }>(
      `SELECT seq, floor(round(extract(epoch FROM (ended_at - started_at)) * 1000) / 1000)::int AS sec FROM loop_executions
        WHERE loop_id = $1 ORDER BY ended_at - started_at DESC LIMIT 1`,
      [loop.id],
    );
    const [counts] = await rows<{ execs: number; rounds: number }>(
      `SELECT (SELECT count(*)::int FROM loop_executions WHERE loop_id = $1) AS execs,
              (SELECT count(*)::int FROM runs WHERE loop_id = $1 AND status <> 'skipped') AS rounds`,
      [loop.id],
    );
    const sec = longest!.sec;
    const text = sec >= 60 ? new RegExp(String.raw`^${Math.floor(sec / 60)}\s+min$`) : new RegExp(String.raw`^${sec}\s+s$`);
    await expect(page.getByTestId('kv-longest').locator('.v')).toHaveText(text);
    await expect(page.getByTestId('kv-longest').locator('.sub')).toHaveText(t('kv.longestSub', { k: longest!.seq, e: counts!.execs, r: counts!.rounds }));
  });

  test('UC-06: run history paginates by cursor - every page in DB order, total right', { tag: '@UC-06' }, async ({ page, request }) => {
    const loop = await createLoop(request, 'UC-06 pagination', { durationSec: 1 });
    expect((await call(request, 'POST', `/api/loops/${loop.id}/start`)).status).toBe(200);
    expect((await call(request, 'POST', `/api/loops/${loop.id}/stop`)).status).toBe(200);
    // 27 old runs (3 skipped) written straight into the execution just closed, times in the past 1 minute apart.
    const [exec] = await rows<{ id: string }>('SELECT id FROM loop_executions WHERE loop_id = $1', [loop.id]);
    for (let i = 0; i < 27; i++) {
      const skipped = i % 9 === 4;
      await db.query(
        `INSERT INTO runs (id, loop_id, execution_id, iteration, trigger, status, skip_reason, started_at, finished_at, duration_ms,
                           prompt_snapshot, executor_kind, executor_config, session_id)
         VALUES (gen_random_uuid(), $1, $2, $3, 'schedule', $4, $5, now() - make_interval(mins => $6), now() - make_interval(mins => $6),
                 $7, 'p', 'mock', '{}', $8)`,
        [loop.id, exec!.id, skipped ? null : 100 + i, skipped ? 'skipped' : 'succeeded', skipped ? 'run #1 still in progress' : null, 60 - i, skipped ? null : 1000, skipped ? null : `mock-e2e-${i}`],
      );
    }
    const all = await rows<{ id: string }>('SELECT id FROM runs WHERE loop_id = $1 ORDER BY started_at DESC, id DESC', [loop.id]);
    expect(all.length).toBe(28);
    await open(page, `/loops/${loop.id}`);
    const ids = () => page.getByTestId('runs-table').getByTestId('run-row').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.runId));
    const pager = page.getByTestId('runs-pager');
    await expect(pager).toContainText(t('pager.range', { a: 1, b: 10, n: 28 }));
    expect(await ids()).toEqual(all.slice(0, 10).map((r) => r.id));
    await page.getByTestId('runs-next').click();
    await expect(pager).toContainText(t('pager.range', { a: 11, b: 20, n: 28 }));
    expect(await ids()).toEqual(all.slice(10, 20).map((r) => r.id));
    await page.getByTestId('runs-next').click();
    await expect(pager).toContainText(t('pager.range', { a: 21, b: 28, n: 28 }));
    expect(await ids()).toEqual(all.slice(20).map((r) => r.id));
    await expect(page.getByTestId('runs-next')).toBeDisabled();
    await page.getByTestId('runs-prev').click();
    await expect(pager).toContainText(t('pager.range', { a: 11, b: 20, n: 28 }));
    // Skipped run: no round number, reason verbatim from the DB.
    await expect(page.getByTestId('runs-table').locator('[data-status="skipped"]').first()).toContainText('run #1 still in progress');
    await page.getByTestId('runs-prev').click();
    await expect(pager).toContainText(t('pager.range', { a: 1, b: 10, n: 28 }));
    await expect(page.getByTestId('runs-prev')).toBeDisabled();
  });

  test('UC-07: run detail - while running the log is followed live; when done the log is complete, in DB order (also after F5); session id, prompt used, error, skip reason match the DB', { tag: '@UC-07' }, async ({ page, request }) => {
    test.setTimeout(90_000);
    const loop = await createLoop(request, 'UC-07 run detail', { durationSec: 3 });
    expect((await call(request, 'POST', `/api/loops/${loop.id}/start`)).status).toBe(200);
    const runId = (await getLoop(request, loop.id)).activeRun!.id;

    await open(page, `/runs/${runId}`);
    await expect(page.getByTestId('run-header')).toHaveAttribute('data-status', 'running');
    await expect(page.locator('[data-testid="loop-row"].is-sel')).toContainText('UC-07 run detail');
    await expect(page.getByTestId('run-log')).toContainText(t('log.live'));
    // No F5: the run finishes -> status + the full log appear by themselves.
    await expect(page.getByTestId('run-header')).toHaveAttribute('data-status', 'succeeded', { timeout: 15_000 });
    const check = async () => {
      const lines = await rows<{ seq: number; message: string }>('SELECT seq, message FROM run_logs WHERE run_id = $1 ORDER BY seq', [runId]);
      expect(lines.length).toBeGreaterThanOrEqual(5); // opening + 3 x working… + Done
      const shown = page.getByTestId('run-log').locator('[data-seq]');
      await expect(shown).toHaveCount(lines.length);
      expect(await shown.evaluateAll((els) => els.map((e) => [Number((e as HTMLElement).dataset.seq), (e.lastChild as Node).textContent]))).toEqual(
        lines.map((l) => [l.seq, l.message]),
      );
      const [r] = await rows<{ session_id: string; prompt_snapshot: string }>('SELECT session_id, prompt_snapshot FROM runs WHERE id = $1', [runId]);
      await expect(page.getByTestId('run-session')).toHaveAttribute('data-session-id', r!.session_id);
      await expect(page.getByTestId('run-session')).toContainText(r!.session_id);
      await expect(page.getByTestId('run-prompt')).toHaveText(r!.prompt_snapshot);
      await expect(page.getByTestId('run-log')).toContainText(t('log.saved', { n: lines.length }));
    };
    await check();
    await page.reload();
    await expect(page.getByTestId('run-header')).toHaveAttribute('data-status', 'succeeded');
    await check();
    expect((await call(request, 'POST', `/api/loops/${loop.id}/stop`)).status).toBe(200);

    // Skipped run: a tick arrives while the previous run is going (UC-12) -> no round number, no session, no log, reason from the DB.
    const slow = await createLoop(request, 'UC-07 skipped', { durationSec: 600 }, '* * * * *');
    expect((await call(request, 'POST', `/api/loops/${slow.id}/start`)).status).toBe(200);
    expect((await call(request, 'POST', '/api/__test/clock', { advanceMs: 61_000 })).status).toBe(200);
    const [skip] = await until(
      () => rows<{ id: string; skip_reason: string }>(`SELECT id, skip_reason FROM runs WHERE loop_id = $1 AND status = 'skipped'`, [slow.id]),
      (r) => r.length > 0,
    );
    await open(page, `/runs/${skip!.id}`);
    await expect(page.getByTestId('run-header')).toHaveAttribute('data-status', 'skipped');
    await expect(page.getByTestId('skip-reason')).toContainText(skip!.skip_reason);
    await expect(page.getByTestId('run-session')).toContainText(t('run.noSession'));
    await expect(page.getByText(t('log.empty'))).toBeVisible();
    expect((await call(request, 'POST', `/api/loops/${slow.id}/stop`)).status).toBe(200);

    // Failed run: the error message = the DB `error` column.
    const bad = await createLoop(request, 'UC-07 error', { durationSec: 2, failRate: 100 });
    expect((await call(request, 'POST', `/api/loops/${bad.id}/start`)).status).toBe(200);
    const badRun = (await getLoop(request, bad.id)).activeRun!.id;
    await until(() => runStatus(badRun), (s) => s === 'failed');
    const [err] = await rows<{ error: string }>('SELECT error FROM runs WHERE id = $1', [badRun]);
    await open(page, `/runs/${badRun}`);
    await expect(page.getByTestId('run-header')).toHaveAttribute('data-status', 'failed');
    await expect(page.getByTestId('run-banner')).toHaveText(`✗ ${t('run.err.failed', { msg: err!.error })}`);
  });

  test('UC-08: execution detail - session ids on screen = API GET /executions/:id = SELECT (a cancelled run still has one); copy the whole list in one click', { tag: '@UC-08' }, async ({ page, request }) => {
    test.setTimeout(90_000);
    // Server clock to second :05: with the real time, a real minute boundary could land while run #3 (4 seconds) is going -> one
    // extra skipped run nobody planned for (red once on a clean clone, 2026-10-19). The whole test takes ~20 seconds so it never reaches the next minute.
    expect((await call(request, 'POST', '/api/__test/clock', { at: '2026-11-02T03:00:05Z' })).status).toBe(200);
    const loop = await createLoop(request, 'UC-08 session id', { durationSec: 4 }, '* * * * *');
    expect((await call(request, 'POST', `/api/loops/${loop.id}/start`)).status).toBe(200);
    const ran = () =>
      rows<{ iteration: number; status: string }>(`SELECT iteration, status FROM runs WHERE loop_id = $1 AND status <> 'skipped' ORDER BY iteration`, [loop.id]);
    // runs #2, #3: wait for the previous run to finish then advance the clock past the next cron boundary -> the tick runs at once
    for (const n of [2, 3]) {
      await until(ran, (r) => r.length >= n - 1 && r.every((x) => x.status !== 'running'));
      if ((await ran()).length < n) expect((await call(request, 'POST', '/api/__test/clock', { advanceMs: 60_000 })).status).toBe(200);
      await until(ran, (r) => r.length >= n);
    }
    // run #3 going -> Stop -> `cancelled` but it keeps its session id
    await until(ran, (r) => r[2]?.status === 'running');
    expect((await call(request, 'POST', `/api/loops/${loop.id}/stop`)).status).toBe(200);
    const [exec] = await rows<{ id: string }>('SELECT id FROM loop_executions WHERE loop_id = $1', [loop.id]);
    const fromDb = (
      await rows<{ session_id: string }>('SELECT session_id FROM runs WHERE execution_id = $1 AND session_id IS NOT NULL ORDER BY started_at', [exec!.id])
    ).map((r) => r.session_id);
    expect(fromDb).toHaveLength(3);
    expect(await rows(`SELECT status FROM runs WHERE execution_id = $1 ORDER BY started_at`, [exec!.id])).toEqual([
      { status: 'succeeded' },
      { status: 'succeeded' },
      { status: 'cancelled' },
    ]);
    const fromApi = (await call<{ sessionIds: string[] }>(request, 'GET', `/api/executions/${exec!.id}`)).body.sessionIds;
    expect(fromApi).toEqual(fromDb);

    // From the loop detail -> executions table -> execution #1.
    await open(page, `/loops/${loop.id}`);
    await page.getByTestId('exec-row').first().click();
    await expect(page).toHaveURL(new RegExp(`/executions/${exec!.id}$`));
    await expect(page.getByTestId('exec-header')).toHaveAttribute('data-ended', 'stopped');
    // list pane: the row of the loop that holds the execution stays selected
    await expect(page.locator('[data-testid="loop-row"].is-sel')).toContainText('UC-08 session id');
    const shown = page.getByTestId('exec-runs').getByTestId('run-session');
    await expect(shown).toHaveCount(3);
    const onScreen = (await shown.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.sessionId as string))).reverse(); // table: newest first
    expect(onScreen).toEqual(fromDb);
    for (const s of fromDb) await expect(page.getByTestId('exec-runs')).toContainText(s);
    await expect(page.getByTestId('exec-api')).toHaveText(t('exec.api', { id: exec!.id, n: 3 }));

    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.getByTestId('copy-all').click();
    await expect(page.locator('.toast')).toHaveText(t('toast.copied', { n: 3 }));
    // Windows turns newlines in the clipboard into CRLF
    expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toBe(fromDb.join('\n'));
  });

  test('UC-11: archive / restore from the loop detail - while running it cannot be archived (Stop first); archive -> hidden from the default list, the archived filter shows it again, history stays; restore back to Stopped', { tag: '@UC-11' }, async ({ page, request }) => {
    test.setTimeout(60_000);
    const loop = await createLoop(request, 'UC-11 archive', { durationSec: 1 });
    expect((await call(request, 'POST', `/api/loops/${loop.id}/start`)).status).toBe(200);
    const state = async () => (await rows<{ archived_at: Date | null; status: string }>('SELECT archived_at, status FROM loops WHERE id = $1', [loop.id]))[0]!;

    await open(page, `/loops/${loop.id}`);
    await expect(page.getByTestId('loop-header')).toHaveAttribute('data-status', 'active');
    await page.getByTestId('loop-menu').click();
    const archive = page.getByTestId('menu-archive');
    await expect(archive).toHaveText(t('menu.archiveBlocked'));
    await expect(archive).toHaveAttribute('aria-disabled', 'true');
    await archive.click({ force: true }); // click the locked item: nothing happens
    expect((await state()).archived_at).toBeNull();
    await page.keyboard.press('Escape');

    await expect(page.locator('.ph .st.active')).toContainText('next run', { timeout: 10_000 }); // the 1-second run is done
    await page.getByTestId('loop-stop').click();
    await expect(page.getByTestId('loop-header')).toHaveAttribute('data-status', 'stopped');
    await page.getByTestId('loop-menu').click();
    await expect(page.getByTestId('menu-archive')).toHaveText(t('menu.archive'));
    await page.getByTestId('menu-archive').click();
    await expect(page.getByTestId('loop-header')).toHaveAttribute('data-status', 'archived');
    await expect(page.getByText(t('archived.banner').split(' — ')[0]!)).toBeVisible();
    await expect(page.getByTestId('loop-start')).toBeDisabled();
    const after = await state();
    expect(after.archived_at).not.toBeNull();
    expect(after.status).toBe('stopped');
    // The default list no longer has it; the archived filter shows it again; history is intact.
    const ids = async (q: string) => (await call<{ items: { id: string }[] }>(request, 'GET', `/api/loops${q}`)).body.items.map((l) => l.id);
    expect(await ids('')).not.toContain(loop.id);
    expect(await ids('?archived=true')).toContain(loop.id);
    await expect(page.getByTestId('exec-row')).toHaveCount(1);

    await page.getByTestId('loop-restore').click();
    await expect(page.getByTestId('loop-header')).toHaveAttribute('data-status', 'stopped');
    await expect(page.getByTestId('loop-start')).toBeEnabled();
    const restored = await state();
    expect(restored.archived_at).toBeNull();
    expect(restored.status).toBe('stopped');
    expect(await ids('')).toContain(loop.id);
  });

  test('UC-31: the ↳ line under every run = the first line of runs.summary (cap 80, "…" when text remains) in the run history and the execution runs; skipped and worked runs differ right on the line; no summary -> —', { tag: '@UC-31' }, async ({ page, request }) => {
    const loop = await createLoop(request, 'UC-31 summary on the run row', { durationSec: 1 });
    expect((await call(request, 'POST', `/api/loops/${loop.id}/start`)).status).toBe(200);
    expect((await call(request, 'POST', `/api/loops/${loop.id}/stop`)).status).toBe(200);
    const [exec] = await rows<{ id: string }>('SELECT id FROM loop_executions WHERE loop_id = $1', [loop.id]);
    // Four old runs: the agent skipped itself (longer than the cap), did work (several lines), failed with no summary, skipped because of overlap.
    const seeds: [number | null, string, string | null][] = [
      [101, 'succeeded', 'Skipping this run: #25 carries loop:needs-human, #29 still has loop:in-progress from another session - no task is eligible.'],
      [102, 'succeeded', '  Did #27 - reworded the Advanced schedule sentence  \nPR #26 merged, removed the loop:in-progress label.'],
      [103, 'failed', null],
      [null, 'skipped', null],
    ];
    for (const [i, [n, status, summary]] of seeds.entries()) {
      await db.query(
        `INSERT INTO runs (id, loop_id, execution_id, iteration, trigger, status, skip_reason, started_at, finished_at, duration_ms,
                           prompt_snapshot, executor_kind, executor_config, summary, error, session_id)
         VALUES (gen_random_uuid(), $1, $2, $3, 'schedule', $4, $5, now() - make_interval(mins => $6), now() - make_interval(mins => $6),
                 $7, 'p', 'mock', '{}', $8, $9, $10)`,
        [loop.id, exec!.id, n, status, n === null ? 'run #12 still in progress' : null, 10 + i, n === null ? null : 1000, summary,
          status === 'failed' ? 'Simulated error' : null, n === null ? null : `mock-uc31-${i}`],
      );
    }
    // Expected ↳ line computed in SQL: first non-empty line, trimmed at both ends, left(…, 80); text remaining after it -> "…".
    const expected = await rows<{ id: string; summary: string | null; line: string | null; more: boolean }>(
      `SELECT id, summary, line, char_length(btrim(summary, E' \n\r\t')) > char_length(line) AS more
         FROM (SELECT id, started_at, summary,
                      left(btrim(split_part(ltrim(summary, E' \n\r\t'), E'\n', 1), E' \r\t'), 80) AS line FROM runs WHERE loop_id = $1) r
        ORDER BY started_at DESC, id DESC`,
      [loop.id],
    );
    expect(expected.length).toBe(5);
    const want = expected.map((r) => (r.line ? r.line + (r.more ? '…' : '') : '—'));
    expect(want.filter((w) => w.endsWith('…'))).toHaveLength(2); // longer than the cap + several lines

    async function checkTable(testId: string) {
      const table = page.getByTestId(testId);
      await expect(table.getByTestId('run-sum')).toHaveCount(expected.length);
      // Every run: the ↳ line sits right under that run's own row, text = SELECT, hover (title) = runs.summary verbatim.
      const pairs = await table.locator('tr[data-testid]').evaluateAll((els) =>
        els.map((e) => ({ kind: (e as HTMLElement).dataset.testid, id: (e as HTMLElement).dataset.runId, text: (e.lastElementChild as HTMLElement).innerText.trim(), title: (e.lastElementChild as HTMLElement).getAttribute('title') })),
      );
      expect(pairs.map((p) => p.kind)).toEqual(expected.flatMap(() => ['run-row', 'run-sum']));
      for (const [i, r] of expected.entries()) {
        expect(pairs[2 * i]!.id).toBe(r.id);
        expect(pairs[2 * i + 1]!.id).toBe(r.id);
        expect(pairs[2 * i + 1]!.text).toBe(want[i]);
        expect(pairs[2 * i + 1]!.title).toBe(r.line ? r.summary : null);
      }
      // A run where the agent skipped itself is still ✓ Succeeded (D-UI26) - it differs from a worked run only in the summary text.
      const sumOf = (id: string) => table.locator(`[data-testid=run-sum][data-run-id="${id}"]`);
      await expect(sumOf(expected[1]!.id)).toContainText('Skipping this run:');
      await expect(sumOf(expected[2]!.id)).toContainText('Did #27');
      for (const id of [expected[1]!.id, expected[2]!.id]) await expect(table.locator(`[data-testid=run-row][data-run-id="${id}"]`)).toHaveAttribute('data-status', 'succeeded');
    }

    await open(page, `/loops/${loop.id}`);
    await expect(page.getByTestId('runs-pager')).toContainText(t('pager.range', { a: 1, b: 5, n: 5 }));
    await checkTable('runs-table');
    // The Latest run table (one row) has no ↳ line (D-UI22).
    await expect(page.getByTestId('last-run').getByTestId('run-sum')).toHaveCount(0);

    await open(page, `/executions/${exec!.id}`);
    await checkTable('exec-runs');
  });
});
