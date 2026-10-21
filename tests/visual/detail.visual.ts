// Shots of the 3 REAL detail screens (loop · execution · run detail, with repo, cost, resume, summary and the "Repo does not
// exist" run) placed next to the approved preview shots (design/preview/shots/) + pixel mismatch (toolkit: compare-kit.ts).
// Data = the "world" of the preview (tests/support/preview-world.ts, history level) written straight into the DB of a
// real server (tests/support/server-process.ts); the browser clock is fixed at 14:00:42 like the preview
// (`page.clock.setFixedTime`) and the server clock set to that same moment (`/api/__test/clock`) → every "up for",
// "in 29 min" and log line matches the preview to the letter.
//
// Three preview states draw FEWER rows of run history (6 / 14, 9 / 182, 5 / 12 rows — the app page always has 10 rows) →
// the main pane is compared down to the top edge of the run history table (`until`); below it the data differs, not the UI.
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { liveDbUrl, ServerProcess } from '../support/server-process';
import { execId, loopId, PREVIEW_NOW as NOW, previewData, previewDirs, runId, seedPreviewWorld } from '../support/preview-world';
import { PREVIEW_VIEW, regions, setLang, snap, tEn, writeReport, type RegionSpec } from './compare-kit';

test.use({ ...PREVIEW_VIEW, permissions: ['clipboard-read', 'clipboard-write'] });

/**
 * Top bar + list pane: the detail world gives the same list pane + overview figures as the list screen. Only the
 * "errors 24h" cell is masked: the preview prints a smaller number while execution #4 of "Check test coverage" (17/10 21:05
 * → 23:58, ✗ 4 — in the execution table of the main pane) lies entirely inside the last 24 hours → the real DB gives
 * more. The preview contradicts itself (spec Q16); the approved image is not changed.
 */
const topbar = (): RegionSpec => ({ name: 'top bar ("errors 24h" masked — Q16)', selector: 'header.topbar', mask: ['[data-testid=stat-errors-24h]'] });
/** List pane, cut at the bottom of the preview image (the preview draws fewer runs → the preview page is shorter than the app page). */
const list = (): RegionSpec => ({ ...regions.list(), toPreviewBottom: true });
/** The "Created" cell of the configuration — creation times are stepped back to get the list row order (preview-world.ts `createdOf`). */
const CREATED_CELL = '[data-testid=loop-config] > div:nth-child(6)';
/**
 * The "Avg per run" cell: the preview prints numbers that do not match the durations of the runs it draws (Issue backlog
 * worker: the 9 listed runs average 14:52, the preview prints 18:47; Clean old artifacts: 37 seconds, the preview prints
 * 41) — the sample data contradicts itself; the approved image is not changed.
 */
const AVG_CELL = '[data-testid=kv-avg]';
/**
 * "Scan API logs for crashes" execution #1: the preview prints up for 5d 21h (`longest`) while its own timestamps
 * (12/10 10:02:31 → 17/10 09:31:05) give 4d 23h → mask the "Longest execution" cell + the "Up for" cell of row #1.
 */
const CRASH_LONGEST = ['[data-testid=kv-longest]', '[data-testid=exec-table] tr:nth-child(3) td:nth-child(5)'];
const main = (mask: string[] = []): RegionSpec => ({ ...regions.main(), ...(mask.length ? { mask } : {}) });
const mainUntilRuns = (mask: string[] = []): RegionSpec => ({ name: 'main pane (down to the run history table)', selector: '.pane-main', until: '[data-testid=runs-table]', ...(mask.length ? { mask } : {}) });
/** All three regions of the wide app frame. */
const all = (m: RegionSpec = main()): RegionSpec[] => [topbar(), list(), m];
const PREVIEW_APP = pathToFileURL(fileURLToPath(new URL('../../design/preview/app.html', import.meta.url))).href;

/**
 * Scrolls the log blocks of the app to exactly where the preview is scrolled. The preview sets `scrollTop = scrollHeight`
 * as soon as it draws, BEFORE the fonts are loaded → a long log can stop 1px above the real bottom; the app sticks to the
 * real bottom. 1px off shifts the whole block of text — that is the scroll position of the sample image, not the UI, so
 * the test sets it to match (like fixing the clock) instead of masking it.
 */
async function matchPreviewScroll(page: Page, id: string) {
  const pv = await page.context().newPage();
  await pv.goto(`${PREVIEW_APP}?state=${id}&theme=light`);
  const tops = await pv.locator('.log-scroll').evaluateAll((els) => els.map((e) => e.scrollTop));
  await pv.close();
  await page.locator('.pane-main .log-scroll').evaluateAll((els, t) => els.forEach((e, i) => (e.scrollTop = t[i] ?? e.scrollTop)), tops);
}

/**
 * The older `run-*` states are drawn without the Transcript section (STATES.md: "the older `run-*` states keep their
 * approved image") → hide that section (title + the panel / note right after it) before comparing; the Transcript panel
 * is compared in transcript.visual.ts with its own 7 states.
 */
async function hideTranscript(page: Page) {
  await page.addStyleTag({ content: '[data-testid=run-transcript-title], [data-testid=run-transcript-title] + * { display: none !important; }' });
}

const KEYS = ['pilot', 'crash', 'wiki', 'debt', 'prs', 'evidence', 'recap', 'oldsched'] as const;
const ID = Object.fromEntries(KEYS.map((k) => [k, loopId(k)])) as Record<(typeof KEYS)[number], string>;

test.describe('detail screens against the preview', () => {
  test.describe.configure({ mode: 'serial' });
  let sp: ServerProcess;
  let db: pg.Pool;
  test.beforeAll(async () => {
    sp = await ServerProcess.launch();
    db = new pg.Pool({ connectionString: liveDbUrl(), max: 2 });
  });
  test.afterAll(async () => {
    await db?.end();
    await sp?.stop();
    writeReport('detail');
  });

  /** Clean DB → server + browser clocks at 14:00:42 → the preview world. */
  async function world(page: Page) {
    expect((await sp.api('POST', '/api/__test/reset')).status).toBe(204);
    // the clock BEFORE writing data: the 1-second schedule tick must not see overdue runs / due loops by the real time
    expect((await sp.api('POST', '/api/__test/clock', { at: NOW.toISOString() })).status).toBe(200);
    expect((await sp.api('POST', '/api/__test/dirs', { paths: previewDirs() })).status).toBe(204); // D-UI11
    await seedPreviewWorld(db, { history: true });
    await page.clock.setFixedTime(NOW);
  }
  async function open(page: Page, path: string) {
    await page.goto(`${sp.baseUrl}${path}`);
    await expect(page.getByTestId('lamp-db')).toHaveAttribute('data-state', 'ok');
  }
  /** Shoot + compare; the log blocks are scrolled like the preview first. */
  async function shot(page: Page, id: string, title: string, specs: RegionSpec[]) {
    await matchPreviewScroll(page, id);
    await snap(page, id, title, specs);
  }
  const rows = (page: Page, table: string) => page.getByTestId(table).getByTestId(table === 'exec-table' ? 'exec-row' : 'run-row');

  test('loop detail: running, waiting for next run, latest run failed, stopped, server down, never started, archived', async ({ page }) => {
    test.setTimeout(180_000);
    await world(page);

    await open(page, `/loops/${ID.pilot}`);
    await expect(page.getByTestId('live-log').locator('[data-seq="1"]')).toBeVisible();
    await expect(rows(page, 'runs-table')).toHaveCount(10);
    await expect(rows(page, 'exec-table')).toHaveCount(3);
    await shot(page, 'loop-running', 'Running, with a run in progress + live log; figures, execution history, run history, configuration', all(main([AVG_CELL])));

    await open(page, `/loops/${ID.wiki}`);
    await expect(page.getByTestId('last-run-log').locator('[data-seq="2"]')).toBeVisible();
    await expect(rows(page, 'runs-table')).toHaveCount(10);
    await shot(page, 'loop-idle', 'Running, waiting for the next run + log of the latest run (the preview draws 6 / 14 runs → compared down to the run table)', all(mainUntilRuns([CREATED_CELL])));

    await open(page, `/loops/${ID.debt}`);
    await expect(page.getByTestId('live-log').locator('[data-seq="1"]')).toBeVisible();
    await expect(page.getByTestId('last-run-failed')).toBeVisible();
    await expect(rows(page, 'exec-table')).toHaveCount(3);
    await shot(page, 'loop-last-failed', 'Latest run failed, skipped runs (the preview draws 9 / 182 runs → compared down to the run table)', all(mainUntilRuns([CREATED_CELL])));

    await open(page, `/loops/${ID.evidence}`);
    await expect(page.getByTestId('last-run-log').locator('[data-seq="2"]')).toBeVisible();
    await expect(rows(page, 'runs-table')).toHaveCount(4);
    await shot(page, 'loop-stopped', 'Stopped — the last run was cancelled', all(main([CREATED_CELL, AVG_CELL])));

    await open(page, `/loops/${ID.prs}`);
    await expect(page.getByTestId('last-run-log').locator('[data-seq="2"]')).toBeVisible();
    await expect(page.getByTestId('server-down-banner')).toBeVisible();
    await shot(page, 'loop-server-down', 'The latest execution ended because the server shut down (the preview draws 5 / 12 runs → compared down to the run table)', all(mainUntilRuns()));

    await open(page, `/loops/${ID.recap}`);
    await expect(page.getByTestId('loop-config')).toBeVisible();
    await shot(page, 'loop-never-run', 'Just created, never started', all(main([CREATED_CELL])));

    // An archived loop only shows in the Archived tab — the preview draws the list pane on that tab (the way a user gets to this loop).
    await open(page, `/loops/${ID.oldsched}`);
    await page.getByTestId('tab-archived').click();
    await expect(page.locator('[data-testid="loop-row"].is-sel')).toContainText(previewData().loops.oldsched.name);
    await expect(page.getByTestId('last-run-log').locator('[data-seq="2"]')).toBeVisible();
    await expect(rows(page, 'runs-table')).toHaveCount(4);
    await shot(page, 'loop-archived', 'Archived — Restore, Start locked', all());

    // UC-23: the repo folder is gone — the latest run "Repo does not exist", the loop keeps running; the configuration warns about the folder.
    await page.getByTestId('tab-all').click();
    await open(page, `/loops/${ID.crash}`);
    await expect(page.getByTestId('last-run-repo-missing')).toBeVisible();
    await expect(page.getByTestId('config-repo-gone')).toBeVisible();
    await expect(rows(page, 'runs-table')).toHaveCount(10);
    await shot(page, 'loop-repo-missing', 'Repo folder gone: the latest run failed with "Repo does not exist", the loop keeps running (the preview draws 9 / 31 runs → compared down to the run table)', all(mainUntilRuns(CRASH_LONGEST)));
  });

  test('loop detail: Stop confirmation, stopping, loading, not found, Vietnamese UI, narrow viewport', async ({ page }) => {
    test.setTimeout(180_000);
    await world(page);
    await open(page, `/loops/${ID.pilot}`);
    await expect(page.getByTestId('live-log').locator('[data-seq="1"]')).toBeVisible();
    await expect(rows(page, 'runs-table')).toHaveCount(10);

    await page.getByTestId('loop-stop').click();
    await expect(page.getByTestId('stop-dialog')).toBeVisible();
    await shot(page, 'loop-stop-confirm', 'Stop confirmation while a run is in progress (D-UI1)', all(main([AVG_CELL])));

    // Stopping: the Stop request held without an answer → locked "Stopping…" button + amber banner (D-UI5). Then the
    // request fails (no real Stop) and the world is rebuilt for the next states.
    let release: () => void = () => undefined;
    const held = new Promise<void>((r) => (release = r));
    await page.route('**/api/loops/*/stop', async (route) => {
      await held;
      await route.abort();
    });
    await page.getByTestId('stop-confirm').click();
    await expect(page.getByTestId('stopping-banner')).toBeVisible();
    await page.mouse.move(0, 0);
    await shot(page, 'loop-stopping', 'Stopping — waiting for the run to cancel (≤ 5 seconds)', all(main([AVG_CELL])));
    release();
    await expect(page.locator('.toast.is-err')).toBeVisible();
    await page.unroute('**/api/loops/*/stop');

    await page.setViewportSize({ width: 960, height: 900 });
    await open(page, `/loops/${ID.pilot}`);
    await expect(page.getByTestId('live-log').locator('[data-seq="1"]')).toBeVisible();
    await expect(rows(page, 'runs-table')).toHaveCount(10);
    // At the narrow width the top bar has no flexible space left: a larger "errors 24h" figure (Q16, see `topbar`) than
    // the one of the preview pushes the EN/VI, light/dark toggles and the lamps to the right. Only the left part of the
    // bar is compared (brand + Loops · Repos); the right part is compared in the wide states.
    const narrowTop: RegionSpec[] = [
      { name: 'top bar: brand', selector: 'header.topbar .brand' },
      { name: 'top bar: Loops · Repos', selector: 'header.topbar .topnav' },
    ];
    await shot(page, 'loop-narrow', 'Below 1100px: only the main pane + "← List"', [...narrowTop, main([AVG_CELL])]);
    await page.setViewportSize({ width: 1440, height: 900 });

    await setLang(page, 'vi');
    await expect(page.getByTestId('live-log').locator('[data-seq="1"]')).toBeVisible();
    await shot(page, 'vi-loop-running', 'Loop detail with a run in progress, Vietnamese UI', all(main([AVG_CELL])));
    await setLang(page, 'en');

    const loading = await page.context().newPage();
    await loading.clock.setFixedTime(NOW);
    await loading.route(`**/api/loops/${ID.pilot}`, () => undefined); // never answers
    await loading.goto(`${sp.baseUrl}/loops/${ID.pilot}`);
    await expect(loading.getByTestId('detail-loading')).toBeVisible();
    await shot(loading, 'loop-loading', 'Loading the loop detail', all());
    await loading.close();

    await open(page, '/loops/0e5b7d21-4c9a-4f3e-b812-6a0d9f3c7e45');
    await expect(page.getByTestId('detail-not-found')).toBeVisible();
    await shot(page, 'loop-not-found', 'Loop not found', all());
  });

  test('execution detail: open, Stop, server down, copied, loading, not found', async ({ page }) => {
    test.setTimeout(180_000);
    await world(page);

    await open(page, '/executions/9b2e41d7-5c08-4f3a-a6e1-27d4c8b05f19');
    await expect(rows(page, 'exec-runs')).toHaveCount(10);
    await shot(page, 'exec-running', 'Open execution — run table with full session ids', all());

    await page.getByTestId('copy-all').click();
    await expect(page.locator('.toast')).toHaveText(tEn('toast.copied', { n: 10 }));
    await page.mouse.move(0, 0);
    // Only the main pane + the toast are compared. With the ↳ row under every run the preview page is 1024px tall > the
    // 900px viewport while a `fixed` image only covers the viewport; the app scrolls inside the pane, so its page does not
    // overflow → Chromium draws the text of the top bar + list pane 1px off (the same effect as noted in compare-kit
    // `snap`), not the UI. Those two regions are compared in exec-running.
    await shot(page, 'exec-copied', 'Just copied every session id (toast)', [main(), { name: 'toast', selector: '.toast-stack' }]);

    await open(page, '/executions/3b8d6f1a-0c92-4e7b-95d4-a16e2c7f80b3');
    await expect(rows(page, 'exec-runs')).toHaveCount(4);
    await shot(page, 'exec-stopped', 'Ended because the user pressed Stop — the cancelled run keeps its session id', all());

    await open(page, `/executions/${execId('pilot', 2)}`);
    await expect(rows(page, 'exec-runs')).toHaveCount(4);
    await shot(page, 'exec-server-down', 'Ended because the server shut down — Interrupted run', all());

    const loading = await page.context().newPage();
    await loading.clock.setFixedTime(NOW);
    await loading.route('**/api/executions/*', () => undefined);
    await loading.goto(`${sp.baseUrl}/executions/9b2e41d7-5c08-4f3a-a6e1-27d4c8b05f19`);
    await expect(loading.getByTestId('detail-loading')).toBeVisible();
    await shot(loading, 'exec-loading', 'Loading the execution', all());
    await loading.close();

    await open(page, '/executions/5a1f9e07-c3d2-4b68-9e0a-7f2c4d81b6e3');
    await expect(page.getByTestId('detail-not-found')).toBeVisible();
    await shot(page, 'exec-not-found', 'Execution not found', all());
  });

  test('run detail: running, succeeded, failed, timed out, cancelled, interrupted, skipped, loading, not found', async ({ page }) => {
    test.setTimeout(180_000);
    await world(page);
    const run = async (key: (typeof KEYS)[number], n: number | null, start: string, id: string, title: string, lastSeq: number | null) => {
      await open(page, `/runs/${runId(key, n, start)}`);
      if (key === 'oldsched') await page.getByTestId('tab-archived').click(); // archived loop: list pane on the Archived tab like the preview
      await hideTranscript(page);
      if (lastSeq !== null) await expect(page.getByTestId('run-log').locator(`[data-seq="${lastSeq}"]`)).toBeVisible();
      else await expect(page.getByTestId('run-kv')).toBeVisible();
      await shot(page, id, title, all());
    };
    await run('pilot', 69, '14:00:00', 'run-running', 'Run in progress — live log (no copy-resume button yet — D-UI12)', 1);
    await run('pilot', 68, '13:30:00', 'run-succeeded', 'Succeeded — cost, summary, claude --resume command; the prompt used is the snapshot', 2);
    // D-UI12: copies exactly `claude --resume <id>`, without cd
    await page.getByTestId('run-resume-copy').click();
    await expect(page.locator('.toast')).toContainText('claude --resume');
    const sid68 = await page.getByTestId('run-session').getAttribute('data-session-id');
    expect((await page.evaluate(() => navigator.clipboard.readText())).trim()).toBe(`claude --resume ${sid68}`);
    await page.mouse.move(0, 0);
    // Only the main pane + the toast are compared (the new part of this state). The top bar + list pane are compared in
    // run-succeeded; in this preview image the toast text pulls in one more font file (Google Fonts), so the → arrows of
    // the list pane are drawn with another font — a difference in how the preview page loads fonts, not the UI.
    await shot(page, 'run-resume-copied', 'Just copied the claude --resume <id> command (toast) — without cd', [main(), { name: 'toast', selector: '.toast-stack' }]);
    await expect(page.locator('.toast')).toHaveCount(0, { timeout: 6_000 });
    await run('debt', 104, '13:50:00', 'run-failed', 'Failed (the executor reported an error) — no summary', 2);
    await run('oldsched', 4, '14/10 09:00:00', 'run-timed-out', 'Timed out', 2);
    await run('evidence', 4, '15/10 03:00:00', 'run-cancelled', 'Cancelled by Stop — still has a session id', 2);
    await run('pilot', 59, '17/10 09:30:00', 'run-interrupted', 'Interrupted by a server shutdown', 1);
    await run('crash', 31, '14:00:00', 'run-repo-missing', 'Run failed with "Repo does not exist" — no session, no cost, button to the Repo page', 1);
    await run('debt', null, '14:00:00', 'run-skipped', 'Skipped — no run number, no session, no log', null);

    const loading = await page.context().newPage();
    await loading.clock.setFixedTime(NOW);
    await loading.route('**/api/runs/*', () => undefined);
    await loading.goto(`${sp.baseUrl}/runs/${runId('pilot', 69, '14:00:00')}`);
    await expect(loading.getByTestId('detail-loading')).toBeVisible();
    await shot(loading, 'run-loading', 'Loading the run', all());
    await loading.close();

    await open(page, '/runs/c47e2b90-1d5f-4a83-a6c9-38e0b7f1d254');
    await expect(page.getByTestId('detail-not-found')).toBeVisible();
    await shot(page, 'run-not-found', 'Run not found', all());
  });

  test('loop detail: lost connection while watching the live log', async ({ page }) => {
    test.setTimeout(120_000);
    await world(page);
    await open(page, `/loops/${ID.pilot}`);
    await expect(page.getByTestId('live-log').locator('[data-seq="1"]')).toBeVisible();
    await expect(rows(page, 'runs-table')).toHaveCount(10);
    await sp.kill();
    try {
      await expect(page.getByTestId('live-log')).toHaveAttribute('data-paused', 'true', { timeout: 10_000 });
      await expect(page.getByTestId('loop-stop')).toBeDisabled();
      await shot(page, 'loop-disconnected', 'Lost connection while watching the live log: log paused, buttons locked', all(main([AVG_CELL])));
    } finally {
      await sp.start();
    }
  });
});
