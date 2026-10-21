// Shots of the REAL list screen placed next to the approved preview + pixel mismatch per region (compare-kit.ts). The data
// is the exact "world" of the preview (design/preview/data.js) seeded straight into the test Postgres
// (tests/support/preview-world.ts); server + browser clocks at 18/10/2026 14:00:42 Vietnam time. A real server (the
// Playwright webServer), no mocked API — except two states that have to be forced: the load error (the route answers 500)
// and the LOOP_ALREADY_ACTIVE toast (SSE held so the screen still shows the old figures).
// The states of the app frame (normal, loading, narrow viewport, lost connection, reconnected, DB down) are in
// shell.visual.ts — the same world, comparing the list region + the overview figures too.
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import pg from 'pg';
import { databaseUrl, loadDotEnv } from '../../server/config';
import { PREVIEW_NOW, previewData, previewDirs, seedPreviewMany, seedPreviewWorld, wipe } from '../support/preview-world';
import { PREVIEW_VIEW, regions, snap, tEn, writeReport } from './compare-kit';

loadDotEnv();
test.use(PREVIEW_VIEW);
const toast = { name: 'toast', selector: '.toast-stack' };

let db: pg.Pool;
test.beforeAll(() => {
  db = new pg.Pool({ connectionString: databaseUrl(process.env, 'test'), max: 2 });
});
test.afterAll(async () => {
  await db?.end();
  writeReport('list');
});

async function world(page: Page, request: APIRequestContext, kind: 'overview' | 'many' | 'empty'): Promise<void> {
  expect((await request.post('/api/__test/reset')).status()).toBe(204);
  // Set the server clock BEFORE seeding: the next runs of the world (14:05, 14:30…) are past compared with the real time —
  // seeded first, the ticker (1 second) would run them.
  expect((await request.post('/api/__test/clock', { data: { at: PREVIEW_NOW.toISOString() } })).status()).toBe(200);
  expect((await request.post('/api/__test/dirs', { data: { paths: previewDirs() } })).status()).toBe(204);
  await wipe(db);
  if (kind === 'overview') await seedPreviewWorld(db);
  if (kind === 'many') await seedPreviewMany(db);
  await page.clock.setFixedTime(PREVIEW_NOW);
}

async function open(page: Page, rows: number): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('lamp-db')).toHaveAttribute('data-state', 'ok');
  if (rows) await expect(page.getByTestId('loop-row')).toHaveCount(rows);
  await expect(page.getByTestId('stat-active-loops')).not.toContainText('—');
}

const row = (page: Page, name: string) => page.getByTestId('loop-row').filter({ hasText: name });
const L = () => previewData().loops;

test.describe('list screen against the preview', () => {
  test.describe.configure({ mode: 'serial' });

  test('empty the first time, load error', async ({ page, request }) => {
    await world(page, request, 'empty');
    await page.goto('/');
    await expect(page.getByTestId('home-empty')).toBeVisible();
    await expect(page.getByTestId('lamp-db')).toHaveAttribute('data-state', 'ok');
    await snap(page, 'list-empty', 'Empty the first time — compact left pane, main pane "Create your first loop"', [regions.topbarAll(), regions.list(), regions.main()]);

    await world(page, request, 'overview');
    await page.route(/\/api\/(loops|stats)(\?|$)/, (r) => r.fulfill({ status: 500, json: { error: { code: 'INTERNAL_ERROR', message: 'fake error' } } }));
    await page.goto('/');
    await expect(page.getByTestId('list-error')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('lamp-db')).toHaveAttribute('data-state', 'ok');
    await snap(page, 'list-load-error', 'The list failed to load (GET /api/loops → 500) + Retry', [regions.topbarAll(), regions.list(), regions.main()]);
    await page.unroute(/\/api\/(loops|stats)(\?|$)/);
  });

  test('Archived filter, search finds nothing, hover + menu, Stop confirmation', async ({ page, request }) => {
    test.setTimeout(90_000);
    await world(page, request, 'overview');
    await open(page, 7);

    await page.getByTestId('tab-archived').click();
    await expect(page.getByTestId('loop-row')).toHaveCount(1);
    await snap(page, 'list-filter-archived', 'Archived tab', [regions.list()]);
    await page.getByTestId('tab-all').click();
    await expect(page.getByTestId('loop-row')).toHaveCount(7);

    await page.getByTestId('list-search').fill('nightly');
    await expect(page.getByTestId('list-no-match')).toBeVisible();
    await page.getByTestId('list-search').blur();
    await snap(page, 'list-search-empty', 'Search finds nothing + Clear search', [regions.list()]);
    await page.getByTestId('list-no-match').getByRole('button').click();
    await expect(page.getByTestId('loop-row')).toHaveCount(7);

    const debt = row(page, L().debt.name);
    await debt.hover();
    await debt.getByTestId('row-menu').click();
    await debt.getByTestId('menu-edit').hover();
    await expect(debt.getByTestId('menu-archive')).toHaveText(tEn('menu.archiveBlocked'));
    await snap(page, 'list-row-actions', 'Hover over a running row: Stop + ⋯ menu (Archive locked)', [regions.list()]);
    await page.keyboard.press('Escape');

    const pilot = row(page, L().pilot.name);
    await pilot.hover();
    await pilot.getByTestId('row-stop').click();
    await expect(page.getByTestId('stop-dialog')).toContainText(tEn('dialog.stop.body', { n: 69, t: '00:42' }).split(', will ')[0]!); // "Run #69, in progress for 00:42"
    await page.mouse.move(1430, 890);
    await snap(page, 'list-stop-confirm', 'Stop confirmation while a run is in progress (D-UI1)', [regions.topbarAll(), regions.list(), regions.main()]);
    await page.getByTestId('stop-cancel').click();
    await expect(page.getByTestId('stop-dialog')).toHaveCount(0);
  });

  test('filter by repo (UC-25, D-UI15)', async ({ page, request }) => {
    await world(page, request, 'overview');
    await open(page, 7);
    const old = previewData().repos.old!.name;
    await page.getByTestId('repo-filter').click();
    await page.getByRole('option', { name: old }).click();
    await expect(page.getByTestId('loop-row')).toHaveCount(1);
    await expect(page.getByTestId('tab-archived')).toContainText('1');
    await page.mouse.move(700, 600);
    await snap(page, 'list-filter-repo', `Filtered by repo "${old}" — the filter takes the accent colour, counts follow the filter`, [regions.topbarAll(), regions.list(), regions.main()]);
  });

  test('LOOP_ALREADY_ACTIVE toast, 12 loops running together', async ({ page, request }) => {
    test.setTimeout(90_000);
    await world(page, request, 'overview');
    // SSE held: the screen gets no events, so it still shows a "stopped" loop that another tab just started.
    await page.route('**/api/events**', () => {});
    await page.goto('/');
    await expect(page.getByTestId('loop-row')).toHaveCount(7);
    const recap = row(page, L().recap.name);
    const id = await recap.getAttribute('data-loop-id');
    expect((await request.post(`/api/loops/${id}/start`)).status()).toBe(200);
    await recap.hover();
    await recap.getByTestId('row-start').click();
    await expect(page.locator('.toast.is-err')).toHaveText(tEn('toast.failed', { msg: tEn('error.LOOP_ALREADY_ACTIVE') }));
    await page.mouse.move(700, 600);
    await snap(page, 'list-action-error', 'Server refused: red LOOP_ALREADY_ACTIVE toast (D-UI3)', [toast]);
    await page.unroute('**/api/events**');

    await world(page, request, 'many');
    await open(page, 12);
    // The top bar of the preview list-many contradicts itself (see seedPreviewMany) → compare the top bar with the figures
    // masked + the list pane.
    await snap(page, 'list-many', '12 loops, 10 runs in progress at once; a very long name cut with "…"', [regions.topbar(), regions.list(), regions.main()]);
  });
});
