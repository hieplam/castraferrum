/// <reference lib="dom" />
// E2E Transcript on the run screen (SPEC-phase-2 § Transcript, UC-26…28). UC-26 / UC-27 run REAL Claude (haiku,
// effort low, folder `lc-real-claude-*` - test mode only opens real Claude there) as the project owner decided: *"test with real
// claude (haiku only, it is cheap, do not worry …)"*. The shared e2e server sets `LOOPS_TRANSCRIPT_PAGE=4` (playwright.config.ts) -> pages
// of 4 entries, so even a small transcript must scroll up through several pages. UC-28 uses Mock (skipped run, a `mock-…` session has no file).
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { findSessionFile, readFileEntries } from '../support/claude-transcript';
import { api, closeDb, createLoop, db, reset } from '../support/form-kit';
import { MOCK_DONE_LOG } from '../support/server-text';
import { t } from '../support/ui-text';

test.use({ timezoneId: 'Asia/Ho_Chi_Minh' });
test.afterAll(closeDb);

const PROMPT =
  'Use the Bash tool to run these three commands in order, each as its own tool call, no matter what: `echo $RANDOM$RANDOM` (the first one: pass exactly that text to the Bash tool, never replace it with another command or script), then `echo one`, then `echo two`. Skipping or merging any of the three is a failure. After all three results are back, reply with exactly one word: done. Do not repeat the number.';
/** Budget for an entry to appear (spec § What the user sees): <= 2 seconds after the JSONL line's `timestamp`. */
const BUDGET_MS = 2_000;

const tx = (page: Page) => page.getByTestId('run-transcript');
const rowsOf = (page: Page) => tx(page).locator('[data-cursor]');

test.describe.serial('real Claude transcript (haiku)', () => {
  let runId = '';
  let sessionId = '';

  test('UC-26: open the screen of a running Claude run -> the transcript appears gradually, every entry <= 2 seconds after the line timestamp; tool call, result, final text; a second tab sees it too', { tag: '@UC-26' }, async ({ page, request, context }) => {
    test.setTimeout(300_000);
    await reset(request);
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'lc-real-claude-')));
    const repo = await api<{ id: string }>(request, 'POST', '/api/repos', { path: dir });
    expect(repo.status).toBe(201);
    const loop = await createLoop(request, {
      name: 'UC-26 real Claude transcript',
      prompt: PROMPT,
      cron: '0 0 1 1 *',
      repoId: repo.body.id,
      executor: { kind: 'claude', config: { model: 'haiku', effort: 'low' } },
    });

    // A MutationObserver records when each [data-cursor] appears (the browser clock = the machine clock, same machine as Claude).
    await page.addInitScript(() => {
      const w = window as unknown as { __txOpenedAt: number; __txSeen: Record<string, { at: string | null; seen: number }> };
      w.__txOpenedAt = Date.now();
      w.__txSeen = {};
      new MutationObserver((muts) => {
        const now = Date.now();
        for (const m of muts)
          for (const n of m.addedNodes) {
            if (!(n instanceof HTMLElement)) continue;
            const els = [...(n.matches('[data-cursor]') ? [n] : []), ...n.querySelectorAll<HTMLElement>('[data-cursor]')];
            for (const el of els) w.__txSeen[el.dataset.cursor as string] ??= { at: el.dataset.at ?? null, seen: now };
          }
      }).observe(document, { childList: true, subtree: true });
    });

    expect((await api(request, 'POST', `/api/loops/${loop.id}/start`)).status).toBe(200);
    const run = (await api<{ activeRun: { id: string } | null }>(request, 'GET', `/api/loops/${loop.id}`)).body.activeRun;
    expect(run).not.toBeNull();
    runId = run!.id;
    await page.goto(`/runs/${runId}`); // right after Start
    await expect(page.getByTestId('run-header')).toHaveAttribute('data-status', 'running');

    // The run finishes (real Claude: a few tens of seconds) - the screen is not reloaded.
    await expect(page.getByTestId('run-header')).toHaveAttribute('data-status', 'succeeded', { timeout: 240_000 });
    expect((await api(request, 'POST', `/api/loops/${loop.id}/stop`)).status).toBe(200);
    sessionId = (await db().query('SELECT session_id FROM runs WHERE id = $1', [runId])).rows[0].session_id as string;
    expect(sessionId).toMatch(/^[0-9a-f-]{36}$/);

    // The last entry of the file (the word "done") must be on screen - the stream drains one last time after the run ends.
    const file = findSessionFile(sessionId);
    expect(file, `~/.claude/projects/*/${sessionId}.jsonl`).not.toBeNull();
    await expect(tx(page).locator('[data-kind=assistant]').last()).toContainText('done', { timeout: 10_000 });

    const seen = await page.evaluate(() => {
      const w = window as unknown as { __txOpenedAt: number; __txSeen: Record<string, { at: string | null; seen: number }> };
      return { opened: w.__txOpenedAt, rows: w.__txSeen };
    });
    const opened = seen.opened;
    const live = Object.entries(seen.rows).filter(([, v]) => v.at !== null && Date.parse(v.at) > opened);
    expect(live.length, 'entries written AFTER the screen opened (latency measurable)').toBeGreaterThan(0);
    const lags = live.map(([k, v]) => ({ k, lag: v.seen - Date.parse(v.at as string) }));
    const worst = Math.max(...lags.map((l) => l.lag));
    console.log(`[UC-26] session ${sessionId} · ${live.length} entries appeared gradually · worst latency ${worst} ms (budget ${BUDGET_MS} ms) · ${lags.map((l) => l.lag).join(', ')}`);
    for (const l of lags) expect(l.lag, `entry ${l.k}`).toBeLessThanOrEqual(BUDGET_MS);

    await expect(tx(page).locator('[data-kind=tool_use]').filter({ hasText: 'echo' }).first()).toBeVisible();
    expect(await tx(page).locator('[data-kind=tool_result]').count()).toBeGreaterThanOrEqual(1);
    const last = tx(page).locator('[data-kind=assistant]').last();
    const lastCursor = await last.getAttribute('data-cursor');

    // A second tab at the same URL: its own stream (no blocking, no warning - D-UI32) -> also sees the last entry.
    const second = await context.newPage();
    await second.goto(`/runs/${runId}`);
    await expect(tx(second).locator(`[data-cursor="${lastCursor}"]`)).toContainText('done');
    await second.close();
  });

  test('UC-27: finished run - F5 shows only the last page; scrolling up loads to the start of the transcript by itself; entry count = independent count from the file; the random number is on screen, 0 rows in the DB', { tag: '@UC-27' }, async ({ page }) => {
    test.setTimeout(120_000);
    expect(runId, 'needs the run of UC-26').not.toBe('');
    const file = findSessionFile(sessionId) as string;
    await page.goto(`/runs/${runId}`);
    await expect(page.getByTestId('run-header')).toHaveAttribute('data-status', 'succeeded');
    await expect(rowsOf(page).first()).toBeVisible();
    const firstPage = await rowsOf(page).count();
    expect(firstPage, 'last page (LOOPS_TRANSCRIPT_PAGE=4)').toBeLessThanOrEqual(4);
    await expect(page.getByTestId('run-transcript-edge')).toHaveText(t('tx.loadingOlder')); // hasMore

    // Scroll to the top repeatedly until "start of transcript" shows (no button - the project owner decided #4).
    const scroller = tx(page).locator('.log-scroll');
    for (let i = 0; i < 60; i++) {
      if ((await page.getByTestId('run-transcript-edge').textContent()) === t('tx.start')) break;
      await scroller.evaluate((el) => (el.scrollTop = 0));
      await scroller.hover();
      await page.mouse.wheel(0, -600);
      await page.waitForTimeout(150);
    }
    await expect(page.getByTestId('run-transcript-edge')).toHaveText(t('tx.start'));

    const entries = readFileEntries(file);
    const shown = await rowsOf(page).count();
    console.log(`[UC-27] first page ${firstPage} entries · screen ${shown} entries · file ${entries.length} entries · ${file}`);
    expect(shown).toBeGreaterThan(firstPage);
    expect(shown).toBe(entries.length);
    // The order of entry kinds on screen = the order in the file.
    expect(await rowsOf(page).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.kind))).toEqual(entries.map((e) => e.kind));

    // The number of `echo $RANDOM$RANDOM` - read from the tool_result in the FILE (matching tool_use_id), not from the screen.
    const call = entries.find((e) => e.kind === 'tool_use' && e.text.includes('$RANDOM'));
    expect(call, 'tool_use echo $RANDOM$RANDOM').toBeDefined();
    const result = entries.find((e) => e.kind === 'tool_result' && e.toolUseId === call!.toolUseId);
    const num = (result?.text ?? '').trim();
    expect(num).toMatch(/^\d+$/);
    await expect(tx(page).locator('[data-kind=tool_result]').filter({ hasText: num })).toHaveCount(1);

    // Postgres has no copy: every text / jsonb column of every public table (except runs.prompt_snapshot, runs.summary - stored by
    // design) does not contain the number.
    const cols = (
      await db().query<{ table_name: string; column_name: string }>(
        `SELECT table_name, column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND data_type IN ('text', 'jsonb', 'json', 'character varying')
            AND NOT (table_name = 'runs' AND column_name IN ('prompt_snapshot', 'summary'))`,
      )
    ).rows;
    expect(cols.length).toBeGreaterThan(5);
    let hits = 0;
    for (const c of cols) {
      const r = await db().query(`SELECT count(*)::int AS n FROM "${c.table_name}" WHERE "${c.column_name}"::text LIKE $1`, [`%${num}%`]);
      hits += r.rows[0].n as number;
    }
    console.log(`[UC-27] random number ${num} · ${cols.length} text/jsonb columns · ${hits} rows containing it`);
    expect(hits).toBe(0);
  });
});

test('UC-28: skipped run -> "no session"; a Mock run with a mock-… session but no file -> "transcript not found"; the rest of the screen still shows', { tag: '@UC-28' }, async ({ page, request }) => {
  test.setTimeout(90_000);
  await reset(request);
  const rid = (await api<{ items: { id: string }[] }>(request, 'GET', '/api/repos')).body.items[0]!.id;

  // A Mock run with a mock-… session (no .jsonl file carries that id).
  const quick = await createLoop(request, { name: 'UC-28 mock', prompt: 'p', cron: '0 0 1 1 *', repoId: rid, executor: { kind: 'mock', config: { durationSec: 1, failRate: 0 } } });
  expect((await api(request, 'POST', `/api/loops/${quick.id}/start`)).status).toBe(200);
  const mockRun = (await api<{ activeRun: { id: string } }>(request, 'GET', `/api/loops/${quick.id}`)).body.activeRun.id;
  await expect.poll(async () => (await db().query('SELECT status FROM runs WHERE id = $1', [mockRun])).rows[0]?.status, { timeout: 15_000 }).toBe('succeeded');
  const sid = (await db().query('SELECT session_id FROM runs WHERE id = $1', [mockRun])).rows[0].session_id as string;
  expect(sid).toMatch(/^mock-/);
  expect(findSessionFile(sid)).toBeNull();
  await page.goto(`/runs/${mockRun}`);
  await expect(page.getByTestId('run-header')).toHaveAttribute('data-status', 'succeeded');
  const note = page.getByTestId('run-transcript-note');
  await expect(note).toHaveAttribute('data-mode', 'missing');
  await expect(note).toContainText(`No transcript for session ${sid}`);
  await expect(page.getByTestId('run-transcript')).toHaveCount(0);
  await expect(page.getByTestId('run-kv')).toBeVisible();
  await expect(page.getByTestId('run-log')).toContainText(MOCK_DONE_LOG);
  expect((await api(request, 'POST', `/api/loops/${quick.id}/stop`)).status).toBe(200);

  // Skipped run: a tick arrives while the previous run is going (overlap, UC-12).
  const slow = await createLoop(request, { name: 'UC-28 skipped', prompt: 'p', cron: '* * * * *', repoId: rid, executor: { kind: 'mock', config: { durationSec: 600, failRate: 0 } } });
  expect((await api(request, 'POST', `/api/loops/${slow.id}/start`)).status).toBe(200);
  expect((await api(request, 'POST', '/api/__test/clock', { advanceMs: 61_000 })).status).toBe(200);
  await expect
    .poll(async () => (await db().query(`SELECT id FROM runs WHERE loop_id = $1 AND status = 'skipped'`, [slow.id])).rows[0]?.id, { timeout: 15_000 })
    .toBeTruthy();
  const skipId = (await db().query(`SELECT id FROM runs WHERE loop_id = $1 AND status = 'skipped'`, [slow.id])).rows[0].id as string;
  await page.goto(`/runs/${skipId}`);
  await expect(page.getByTestId('run-header')).toHaveAttribute('data-status', 'skipped');
  await expect(note).toHaveAttribute('data-mode', 'noSession');
  await expect(note).toHaveText(`↷${t('tx.noSession')}`);
  await expect(page.getByTestId('run-transcript')).toHaveCount(0);
  await expect(page.getByTestId('run-kv')).toBeVisible();
  await expect(page.getByTestId('skip-reason')).toBeVisible();
  expect((await api(request, 'POST', `/api/loops/${slow.id}/stop`)).status).toBe(200);
});
