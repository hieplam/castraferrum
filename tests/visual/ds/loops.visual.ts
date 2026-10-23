// The new Loops page (UI uplift, task U15) next to the approved new preview (design/ds/preview/shots/): the 16 states of spec 5.2
// (11 desktop, 5 phone) and the page region of 4 frame states (`frame-loading`, `frame-disconnected`, `phone-frame-loading`,
// `phone-frame-disconnected`), light and dark = 40 pairs. Every state is rebuilt on the real app: a real server (really killed for
// the lost connection), the world of the new preview seeded into the test database (tests/support/preview-world.ts with
// DS_DATA_JS), the server and browser clocks at PREVIEW_NOW. The regions are the page, plus the open overlay (menu, dialog, sheet
// or toast) when the state has one. No mask: a difference is fixed, never hidden.
import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { en } from '../../../shared/i18n/en';
import { viSchedule } from '../../../shared/i18n/vi';
import { DS_DATA_JS, PREVIEW_NOW, previewData, previewDirs, seedPreviewMany, seedPreviewWorld } from '../../support/preview-world';
import { liveDbUrl, ServerProcess } from '../../support/server-process';
import { expectOneLine, PHONE_VIEW, PREVIEW_VIEW, regions, setLang, snap, writeReport } from './kit';

/** The English text of a key of shared/i18n/en.ts with `{x}` filled in, like the app does. */
const tEn = (key: keyof typeof en, params: Record<string, string | number> = {}) =>
  en[key].replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));

test.afterAll(() => writeReport('loops'));

type Kind = 'overview' | 'many' | 'empty';

/** One server for a describe block; `world()` = a clean DB with the new preview's world and the clocks at PREVIEW_NOW. */
function useServer() {
  const ctx = {} as { sp: ServerProcess; db: pg.Pool; world(page: Page, kind?: Kind): Promise<void> };
  test.beforeAll(async () => {
    ctx.sp = await ServerProcess.launch();
    ctx.db = new pg.Pool({ connectionString: liveDbUrl(), max: 2 });
    ctx.world = async (page, kind = 'overview') => {
      // Leave the app first: its reads would race the reset's TRUNCATE (castraferrum#170).
      await page.goto('about:blank');
      expect((await ctx.sp.api('POST', '/api/__test/reset')).status).toBe(204);
      // The server clock BEFORE seeding, or the ticker would run the runs that are already overdue.
      expect((await ctx.sp.api('POST', '/api/__test/clock', { at: PREVIEW_NOW.toISOString() })).status).toBe(200);
      expect((await ctx.sp.api('POST', '/api/__test/dirs', { paths: previewDirs(DS_DATA_JS) })).status).toBe(204);
      if (kind === 'overview') await seedPreviewWorld(ctx.db, {}, DS_DATA_JS);
      if (kind === 'many') await seedPreviewMany(ctx.db, DS_DATA_JS);
      await page.clock.setFixedTime(PREVIEW_NOW);
    };
  });
  test.afterAll(async () => {
    await ctx.sp?.stop();
    await ctx.db?.end();
  });
  return ctx;
}

/** Every font face the page uses is loaded (a face is fetched the first time text needs it; a killed server would fail the fetch). */
const fontsLoaded = (page: Page) =>
  page.evaluate(() => Promise.all(['400', '500', '600', '700'].map((w) => document.fonts.load(`${w} 14px "Be Vietnam Pro"`)).concat(document.fonts.load('400 14px "JetBrains Mono"'))));

/** The page shows `rows` loops with their figures, and the fonts are in. */
async function ready(page: Page, rows: number) {
  if (rows) await expect(page.getByTestId('loop-row')).toHaveCount(rows);
  await expect(page.getByTestId('stat-active-loops')).toHaveAttribute('data-value', /\d/);
  await fontsLoaded(page);
}

const row = (page: Page, name: string) => page.getByTestId('loop-row').filter({ hasText: name });
const L = () => previewData(DS_DATA_JS).loops;
/** Park the pointer away from everything, so no hover state is drawn. */
const away = (page: Page) => page.mouse.move(1430, 890);

test.describe('desktop Loops page against the preview', () => {
  test.describe.configure({ mode: 'serial' });
  test.use(PREVIEW_VIEW);
  const ctx = useServer();

  test('first launch, load error', async ({ page }) => {
    test.setTimeout(120_000);
    await ctx.world(page, 'empty');
    await page.goto(`${ctx.sp.baseUrl}/`);
    await expect(page.getByTestId('home-empty')).toBeVisible();
    await expect(page.getByTestId('conn')).toHaveAttribute('data-db', 'ok');
    await fontsLoaded(page);
    await snap(page, 'loops-empty', 'First launch: Create your first loop, the three steps, New loop', [regions.page()]);

    await ctx.world(page, 'overview');
    await page.route(/\/api\/(loops|stats)(\?|$)/, (r) => r.fulfill({ status: 500, json: { error: { code: 'INTERNAL_ERROR', message: 'fake error' } } }));
    await page.goto(`${ctx.sp.baseUrl}/`);
    await expect(page.getByTestId('list-error')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('conn')).toHaveAttribute('data-db', 'ok');
    await fontsLoaded(page);
    await snap(page, 'loops-error', 'The list failed to load, with Retry', [regions.page()]);
    await page.unroute(/\/api\/(loops|stats)(\?|$)/);
  });

  test('overview, archived, search finds nothing', async ({ page }) => {
    test.setTimeout(120_000);
    await ctx.world(page);
    await page.goto(`${ctx.sp.baseUrl}/`);
    await ready(page, 7);
    await snap(page, 'loops-overview', 'The seven sample loops, every kind of row', [regions.page()]);

    await page.getByTestId('tab-archived').click();
    await expect(page.getByTestId('loop-row')).toHaveCount(1);
    await away(page);
    await snap(page, 'loops-filter-archived', 'Archived filter', [regions.page()]);
    await page.getByTestId('tab-all').click();
    await expect(page.getByTestId('loop-row')).toHaveCount(7);

    await page.getByTestId('list-search').fill('nightly');
    await expect(page.getByTestId('list-no-match')).toBeVisible();
    await page.getByTestId('list-search').blur();
    await away(page);
    await snap(page, 'loops-search-empty', 'The search finds nothing, with Clear search', [regions.page()]);
    await page.getByTestId('list-no-match').getByRole('button').click();
    await expect(page.getByTestId('loop-row')).toHaveCount(7);
  });

  test('repo filter, row menu, Stop confirmation', async ({ page }) => {
    test.setTimeout(120_000);
    await ctx.world(page);
    await page.goto(`${ctx.sp.baseUrl}/`);
    await ready(page, 7);

    await page.getByTestId('repo-filter').click();
    await expect(page.getByTestId('repo-filter-all')).toBeVisible();
    await away(page);
    await snap(page, 'loops-repo-filter', 'The repo filter open: a menu', [regions.page(), regions.menu()]);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('repo-filter-all')).toHaveCount(0);

    const pilot = row(page, L().pilot!.name);
    await pilot.getByTestId('row-menu').click();
    await expect(page.getByTestId('menu-archive')).toHaveText(tEn('act.archiveLocked'));
    await away(page);
    await snap(page, 'loops-row-menu', 'The ⋯ menu of a running row: Archive locked', [regions.page(), regions.menu()]);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('menu-open')).toHaveCount(0);

    await pilot.getByTestId('row-stop').click();
    await expect(page.getByTestId('stop-dialog')).toContainText(tEn('stop.body', { n: 69, d: '0:42', k: 3 }));
    await away(page);
    await snap(page, 'loops-stop-confirm', 'Stop confirmation of a running loop: a dialog', [regions.page(), regions.dialog()]);
    await page.getByTestId('stop-cancel').click();
    await expect(page.getByTestId('stop-dialog')).toHaveCount(0);
  });

  test('refused action', async ({ page }) => {
    test.setTimeout(120_000);
    await ctx.world(page);
    // The live stream is held, so the page still shows a stopped loop that another tab just started.
    await page.route('**/api/events**', () => undefined);
    await page.goto(`${ctx.sp.baseUrl}/`);
    await ready(page, 7);
    const recap = row(page, L().recap!.name);
    const id = await recap.getAttribute('data-loop-id');
    expect((await ctx.sp.api('POST', `/api/loops/${id}/start`)).status).toBe(200);
    // The refetch that follows the refused action is held too, so the page keeps showing what the other tab had not told it yet.
    await page.route(/\/api\/(loops|stats)(\?|$)/, () => undefined);
    await recap.getByTestId('row-start').click();
    await expect(page.locator('.toast.is-err')).toHaveText(tEn('toast.failed', { msg: tEn('error.LOOP_ALREADY_ACTIVE') }));
    await away(page);
    await snap(page, 'loops-action-error', 'An action refused (LOOP_ALREADY_ACTIVE): error toast', [regions.page(), regions.toast()]);
    await page.unroute('**/api/events**');
    await page.unroute(/\/api\/(loops|stats)(\?|$)/);
  });

  test('Vietnamese', async ({ page }) => {
    test.setTimeout(120_000);
    await ctx.world(page);
    await page.goto(`${ctx.sp.baseUrl}/`);
    await ready(page, 7);
    await setLang(page, 'vi');
    await ready(page, 7);
    // A Vietnamese weekday name is two words that stay on one line (castraferrum#195); the names come from vi.ts.
    const weekday = new RegExp(viSchedule.weekday.map((n) => n.split(/[ \u00a0]/).join('[ \\u00a0]')).join('|'), 'u');
    await expectOneLine(page, '[data-testid="loop-row"]', weekday);
    await snap(page, 'vi-loops-overview', 'loops-overview in Vietnamese', [regions.page()]);
    await setLang(page, 'en');
  });

  test('loading', async ({ page }) => {
    test.setTimeout(120_000);
    await ctx.world(page);
    // The list and the figures have not arrived; the repo list, the live stream and the health check answer.
    await page.route('**/api/stats**', () => undefined);
    await page.route(/\/api\/loops(\?|$)/, () => undefined);
    await page.goto(`${ctx.sp.baseUrl}/`);
    await expect(page.getByTestId('list-loading')).toBeVisible();
    await expect(page.getByTestId('conn')).toHaveAttribute('data-db', 'ok');
    await expect(page.getByTestId('nav-repos-count')).toHaveText('4');
    await fontsLoaded(page);
    await snap(page, 'frame-loading', 'First load: skeleton cells, figures -', [regions.page()]);
  });

  test('lost connection', async ({ page }) => {
    test.setTimeout(120_000);
    await ctx.world(page);
    await page.goto(`${ctx.sp.baseUrl}/`);
    await ready(page, 7);
    await ctx.sp.kill();
    try {
      // attempt 1 (wait 1 second), attempt 2 (2 seconds), attempt 3 (4 seconds): exactly the text of the preview
      await expect(page.getByTestId('banner-disconnected')).toContainText(tEn('banner.lostRetry', { n: 3, s: 4 }), { timeout: 10_000 });
      await expect(page.getByTestId('stat-active-loops')).toHaveAttribute('data-stale', 'true');
      await snap(page, 'frame-disconnected', 'Lost connection: red banner, figures frozen', [regions.page()]);
    } finally {
      await ctx.sp.start();
    }
  });

  test('12 loops', async ({ page }) => {
    test.setTimeout(120_000);
    await ctx.world(page, 'many');
    await page.goto(`${ctx.sp.baseUrl}/`);
    await ready(page, 12);
    await snap(page, 'loops-many', '12 loops, 10 runs at once, a long name cut with an ellipsis', [regions.page()]);
  });
});

test.describe('phone Loops page against the preview', () => {
  test.describe.configure({ mode: 'serial' });
  test.use(PHONE_VIEW);
  const ctx = useServer();

  test('first launch', async ({ page }) => {
    test.setTimeout(120_000);
    await ctx.world(page, 'empty');
    await page.goto(`${ctx.sp.baseUrl}/`);
    await expect(page.getByTestId('home-empty')).toBeVisible();
    await expect(page.getByTestId('tab-loops')).toHaveAttribute('aria-current', 'page');
    await fontsLoaded(page);
    await snap(page, 'phone-loops-empty', 'First launch on the phone', [regions.page()]);
  });

  test('overview, repo filter, Stop confirmation, Vietnamese', async ({ page }) => {
    test.setTimeout(120_000);
    await ctx.world(page);
    await page.goto(`${ctx.sp.baseUrl}/`);
    await ready(page, 7);
    await snap(page, 'phone-loops-overview', 'The seven sample loops on the phone, a visible Start or Stop on each', [regions.page()]);

    await page.getByTestId('repo-filter').tap();
    await expect(page.getByTestId('repo-filter-all')).toBeVisible();
    await snap(page, 'phone-loops-repo-filter', 'The repo filter on the phone: a sheet', [regions.page(), regions.sheet()]);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('repo-filter-all')).toHaveCount(0);

    await row(page, L().pilot!.name).getByTestId('row-stop').tap();
    await expect(page.getByTestId('stop-dialog')).toContainText(tEn('stop.body', { n: 69, d: '0:42', k: 3 }));
    await snap(page, 'phone-loops-stop-confirm', 'Stop confirmation on the phone: a sheet', [regions.page(), regions.sheet()]);
    await page.getByTestId('stop-cancel').tap();
    await expect(page.getByTestId('stop-dialog')).toHaveCount(0);

    await setLang(page, 'vi');
    await ready(page, 7);
    await snap(page, 'phone-vi-loops-overview', 'loops-overview in Vietnamese on the phone', [regions.page()]);
    await setLang(page, 'en');
  });

  test('loading', async ({ page }) => {
    test.setTimeout(120_000);
    await ctx.world(page);
    await page.route('**/api/stats**', () => undefined);
    await page.route(/\/api\/loops(\?|$)/, () => undefined);
    await page.goto(`${ctx.sp.baseUrl}/`);
    await expect(page.getByTestId('list-loading')).toBeVisible();
    await expect(page.getByTestId('tab-loops')).toHaveAttribute('aria-current', 'page');
    await fontsLoaded(page);
    await snap(page, 'phone-frame-loading', 'First load on the phone: skeleton cells, figures -', [regions.page()]);
  });

  test('lost connection', async ({ page }) => {
    test.setTimeout(120_000);
    await ctx.world(page);
    await page.goto(`${ctx.sp.baseUrl}/`);
    await ready(page, 7);
    await ctx.sp.kill();
    try {
      await expect(page.getByTestId('banner-disconnected')).toContainText(tEn('banner.lostRetry', { n: 3, s: 4 }), { timeout: 10_000 });
      await expect(page.getByTestId('stat-active-loops')).toHaveAttribute('data-stale', 'true');
      await snap(page, 'phone-frame-disconnected', 'Lost connection on the phone: banner, figures frozen', [regions.page()]);
    } finally {
      await ctx.sp.start();
    }
  });
});
