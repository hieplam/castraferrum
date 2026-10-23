// The new loop page, All runs, the loop's settings and the active period page (UI uplift, task U16) next to the approved new
// preview (design/ds/preview/shots/): the 30 states of spec 5.3 and 5.4 (21 desktop, 9 phone), light and dark = 60 pairs.
// Every state is rebuilt on the real app: a real server (really killed for the lost connection), the world of the new preview
// with its history seeded into the test database (tests/support/preview-world.ts with DS_DATA_JS), the server and browser
// clocks at PREVIEW_NOW. The regions are the whole page (plus the navigation bar on the phone), and the open overlay (menu,
// popover, dialog, sheet or toast) when the state has one. No mask: a difference is fixed, never hidden.
import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { en } from '../../../shared/i18n/en';
import { DS_DATA_JS, execId, loopId, PREVIEW_NOW, previewDirs, seedPreviewWorld } from '../../support/preview-world';
import { liveDbUrl, ServerProcess } from '../../support/server-process';
import { expectOneLine, PHONE_VIEW, PREVIEW_VIEW, regions, snap, writeReport } from './kit';

/** The English text of a key of shared/i18n/en.ts with `{x}` filled in, like the app does. */
const tEn = (key: keyof typeof en, params: Record<string, string | number> = {}) =>
  en[key].replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));

test.afterAll(() => writeReport('loop'));

const KEYS = ['pilot', 'crash', 'wiki', 'prs', 'evidence', 'recap', 'oldsched'] as const;
type Key = (typeof KEYS)[number];
const ID = Object.fromEntries(KEYS.map((k) => [k, loopId(k, DS_DATA_JS)])) as Record<Key, string>;
/** Active period #k of a loop, as the seeded world makes its id. */
const period = (key: Key, k: number) => execId(key, k, DS_DATA_JS);
const NO_LOOP = '0e5b7d21-4c9a-4f3e-b812-6a0d9f3c7e45';
const NO_PERIOD = '5a1f9e07-c3d2-4b68-9e0a-7f2c4d81b6e3';

/** One server for a describe block; `world()` = a clean DB with the new preview's world (with history) and the clocks at PREVIEW_NOW. */
function useServer() {
  const ctx = {} as { sp: ServerProcess; db: pg.Pool; world(page: Page): Promise<void> };
  test.beforeAll(async () => {
    ctx.sp = await ServerProcess.launch();
    ctx.db = new pg.Pool({ connectionString: liveDbUrl(), max: 2 });
    ctx.world = async (page) => {
      // Leave the app first: its reads would race the reset's TRUNCATE (castraferrum#170).
      await page.goto('about:blank');
      expect((await ctx.sp.api('POST', '/api/__test/reset')).status).toBe(204);
      // The server clock BEFORE seeding, or the ticker would run the runs that are already overdue.
      expect((await ctx.sp.api('POST', '/api/__test/clock', { at: PREVIEW_NOW.toISOString() })).status).toBe(200);
      expect((await ctx.sp.api('POST', '/api/__test/dirs', { paths: previewDirs(DS_DATA_JS) })).status).toBe(204);
      await seedPreviewWorld(ctx.db, { history: true }, DS_DATA_JS);
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
  page.evaluate(() =>
    Promise.all(
      ['400', '500', '600', '700'].map((w) => document.fonts.load(`${w} 14px "Be Vietnam Pro"`)).concat(['400', '500', '600'].map((w) => document.fonts.load(`${w} 14px "JetBrains Mono"`))),
    ),
  );

/** The page scrolled back to its top, as the preview draws an open overlay (a tap first scrolls its target into view). */
const toTop = (page: Page) => page.evaluate(() => window.scrollTo(0, 0));

/** Park the pointer away from everything, so no hover state is drawn. */
const away = (page: Page) => page.mouse.move(1430, 890);

/** The loop page shows its figures, its now card with `logLines` lines of output (0 = no output) and `runs` recent runs. */
async function loopReady(page: Page, o: { logLines: number; runs: number; periods?: number }) {
  await expect(page.getByTestId('loop-figures')).toBeVisible();
  await expect(page.getByTestId('now-card')).toBeVisible();
  if (o.logLines) await expect(page.getByTestId('now-card').locator(`.log-line[data-seq="${o.logLines}"]`)).toBeVisible();
  if (o.runs) await expect(page.getByTestId('recent-runs').getByTestId('run-row')).toHaveCount(o.runs);
  if (o.periods !== undefined) await expect(page.getByTestId('period-row')).toHaveCount(o.periods);
  await expect(page.getByTestId('conn')).toHaveAttribute('data-db', 'ok');
  await fontsLoaded(page);
}

async function openLoop(page: Page, base: string, key: Key, o: { logLines: number; runs: number; periods?: number }) {
  await page.goto(`${base}/loops/${ID[key]}`);
  await loopReady(page, o);
}

test.describe('desktop loop page against the preview', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ ...PREVIEW_VIEW, permissions: ['clipboard-read', 'clipboard-write'] });
  const ctx = useServer();

  test('running, waiting, last run failed, stopped, server down, never started, archived', async ({ page }) => {
    test.setTimeout(180_000);
    await ctx.world(page);
    const base = ctx.sp.baseUrl;

    await openLoop(page, base, 'pilot', { logLines: 1, runs: 4, periods: 2 });
    await expect(page.getByTestId('live-log')).toHaveAttribute('data-paused', 'false');
    await snap(page, 'loop-running', 'A run working, live output', [regions.page()]);

    await openLoop(page, base, 'wiki', { logLines: 2, runs: 4, periods: 0 });
    await snap(page, 'loop-idle', "Waiting for the next run, the last run's output", [regions.page()]);

    await openLoop(page, base, 'crash', { logLines: 1, runs: 4, periods: 1 });
    await expect(page.getByTestId('last-run-repo-missing')).toBeVisible();
    await expect(page.getByTestId('open-repos')).toBeVisible();
    await snap(page, 'loop-last-failed', 'The last run failed, the loop keeps running', [regions.page()]);

    await openLoop(page, base, 'evidence', { logLines: 2, runs: 4, periods: 0 });
    await expect(page.getByTestId('loop-start')).toBeVisible();
    await snap(page, 'loop-stopped', 'Stopped by the user, the last run cancelled', [regions.page()]);

    await openLoop(page, base, 'prs', { logLines: 2, runs: 4, periods: 1 });
    await expect(page.getByTestId('loop-start')).toBeVisible();
    await snap(page, 'loop-server-down', 'Stopped by a server shutdown', [regions.page()]);

    await openLoop(page, base, 'recap', { logLines: 0, runs: 0 });
    await expect(page.getByTestId('now-card')).toHaveAttribute('data-state', 'never');
    await snap(page, 'loop-never-run', 'Just created', [regions.page()]);

    await openLoop(page, base, 'oldsched', { logLines: 2, runs: 2, periods: 1 });
    await expect(page.getByTestId('loop-restore')).toBeVisible();
    await expect(page.getByTestId('loop-start')).toHaveCount(0);
    await snap(page, 'loop-archived', 'Archived: Restore, no Start', [regions.page()]);
  });

  test('Stop confirmation, stopping, help, menu', async ({ page }) => {
    test.setTimeout(180_000);
    await ctx.world(page);
    await openLoop(page, ctx.sp.baseUrl, 'pilot', { logLines: 1, runs: 4 });

    await page.getByTestId('runs-help').click();
    await expect(page.getByTestId('help-sheet')).toBeVisible();
    await away(page);
    await snap(page, 'loop-help', 'The ? of Recent runs open: a popover', [regions.page(), regions.popover()]);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('help-sheet')).toHaveCount(0);

    await page.getByTestId('loop-menu').click();
    await expect(page.getByTestId('menu-archive')).toHaveText(tEn('act.archiveLocked'));
    await away(page);
    await snap(page, 'loop-menu', 'The ⋯ of the loop page open: Duplicate, Archive locked while running', [regions.page(), regions.menu()]);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('menu-duplicate')).toHaveCount(0);

    await page.getByTestId('loop-stop').click();
    await expect(page.getByTestId('stop-dialog')).toContainText(tEn('stop.body', { n: 69, d: '0:42', k: 3 }));
    await away(page);
    await snap(page, 'loop-stop-confirm', 'Stop confirmation from the loop page: a dialog', [regions.page(), regions.dialog()]);

    // Stopping: the Stop request is held without an answer, so the page shows the run being cancelled.
    let release: () => void = () => undefined;
    const held = new Promise<void>((r) => (release = r));
    await page.route('**/api/loops/*/stop', async (route) => {
      await held;
      await route.abort();
    });
    await page.getByTestId('stop-confirm').click();
    await expect(page.getByTestId('loop-status')).toHaveAttribute('data-status', 'cancelled');
    await expect(page.getByTestId('loop-stop')).toBeDisabled();
    await away(page);
    await snap(page, 'loop-stopping', 'Stopping', [regions.page()]);
    release();
    await expect(page.locator('.toast.is-err')).toBeVisible();
    await page.unroute('**/api/loops/*/stop');
  });

  test('All runs, settings and prompt, loading, not found', async ({ page }) => {
    test.setTimeout(180_000);
    await ctx.world(page);
    const base = ctx.sp.baseUrl;

    await page.goto(`${base}/loops/${ID.pilot}/runs`);
    await expect(page.getByTestId('runs-table').getByTestId('run-row')).toHaveCount(10);
    await expect(page.getByTestId('period-longest')).toHaveText(tEn('runs.longest', { k: 1, d: '1d 3h' }));
    await fontsLoaded(page);
    await snap(page, 'loop-runs', 'All runs: the longest active period, the runs of page 1 grouped by active period', [regions.page()]);

    await page.goto(`${base}/loops/${ID.pilot}/settings`);
    await expect(page.getByTestId('loop-prompt')).toBeVisible();
    await expect(page.getByTestId('config-repo')).toBeVisible();
    await fontsLoaded(page);
    await snap(page, 'loop-settings', 'Settings and prompt', [regions.page()]);

    await page.route(`**/api/loops/${ID.pilot}`, () => undefined); // never answers
    await page.goto(`${base}/loops/${ID.pilot}`);
    await expect(page.locator('.page [aria-busy="true"]')).toBeVisible();
    await expect(page.getByTestId('conn')).toHaveAttribute('data-db', 'ok');
    await fontsLoaded(page);
    await snap(page, 'loop-loading', 'Skeleton', [regions.page()]);
    await page.unroute(`**/api/loops/${ID.pilot}`);

    await page.goto(`${base}/loops/${NO_LOOP}`);
    await expect(page.getByRole('alert')).toContainText(tEn('error.LOOP_NOT_FOUND'));
    await fontsLoaded(page);
    await snap(page, 'loop-not-found', 'LOOP_NOT_FOUND', [regions.page()]);
  });

  test('active periods: still active, stopped, server down, copied, not found', async ({ page }) => {
    test.setTimeout(180_000);
    await ctx.world(page);
    const base = ctx.sp.baseUrl;
    const openPeriod = async (key: Key, k: number, runs: number) => {
      await page.goto(`${base}/executions/${period(key, k)}`);
      await expect(page.getByTestId('exec-runs').getByTestId('run-row')).toHaveCount(runs);
      await expect(page.getByTestId('period-figures')).toBeVisible();
      await fontsLoaded(page);
    };

    await openPeriod('pilot', 3, 10);
    await expect(page.getByTestId('exec-header')).toHaveAttribute('data-ended', 'false');
    await snap(page, 'period-running', 'Still active', [regions.page()]);

    await page.getByTestId('copy-all').click();
    await expect(page.locator('.toast')).toHaveText(tEn('period.copied.other', { n: 10 }));
    await away(page);
    await snap(page, 'period-copied', 'Toast after copying every session id', [regions.page(), regions.toast()]);

    await openPeriod('evidence', 1, 4);
    await expect(page.getByTestId('exec-header')).toHaveAttribute('data-ended', 'true');
    await snap(page, 'period-stopped', 'Ended because the user pressed Stop', [regions.page()]);

    await openPeriod('pilot', 2, 4);
    // The counts name the states of the list: 3 succeeded, 1 interrupted, no failed run (castraferrum#190).
    await expect(page.getByTestId('period-figures')).toContainText(`${tEn('count.succeeded', { n: 3 })} · ${tEn('count.interrupted', { n: 1 })}`);
    await expect(page.getByTestId('period-figures')).not.toContainText(tEn('count.failed', { n: 1 }));
    await snap(page, 'period-server-down', 'Ended because the server shut down, an interrupted run', [regions.page()]);

    await page.goto(`${base}/executions/${NO_PERIOD}`);
    await expect(page.getByRole('alert')).toContainText(tEn('period.notFound'));
    await fontsLoaded(page);
    await snap(page, 'period-not-found', 'EXECUTION_NOT_FOUND', [regions.page()]);
  });

  test('lost connection while following the live output', async ({ page }) => {
    test.setTimeout(120_000);
    await ctx.world(page);
    await openLoop(page, ctx.sp.baseUrl, 'pilot', { logLines: 1, runs: 4 });
    await ctx.sp.kill();
    try {
      // attempt 1 (wait 1 second), attempt 2 (2 seconds), attempt 3 (4 seconds): exactly the text of the preview
      await expect(page.getByTestId('banner-disconnected')).toContainText(tEn('banner.lostRetry', { n: 3, s: 4 }), { timeout: 10_000 });
      await expect(page.getByTestId('live-log')).toHaveAttribute('data-paused', 'true');
      await snap(page, 'loop-disconnected', 'Connection lost while following the live output', [regions.page()]);
    } finally {
      await ctx.sp.start();
    }
  });
});

test.describe('phone loop page against the preview', () => {
  test.describe.configure({ mode: 'serial' });
  test.use(PHONE_VIEW);
  const ctx = useServer();
  const phone = (...more: ReturnType<typeof regions.page>[]) => [regions.navbar(), regions.page(), ...more];

  test('running, help, menu, Stop confirmation', async ({ page }) => {
    test.setTimeout(180_000);
    await ctx.world(page);
    await openLoop(page, ctx.sp.baseUrl, 'pilot', { logLines: 1, runs: 4, periods: 2 });
    await expect(page.getByTestId('tabbar')).toHaveCount(0);
    await snap(page, 'phone-loop-running', 'A run working on the phone, Stop loop in the action bar', phone());

    await page.getByTestId('runs-help').tap();
    await expect(page.getByTestId('help-sheet')).toBeVisible();
    await toTop(page);
    await expectOneLine(page, '[data-testid="help-sheet"]', /claude[  ]--resume/); // castraferrum#191
    await snap(page, 'phone-loop-help', 'The ? of Recent runs on the phone: a sheet', phone(regions.sheet()));
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('help-sheet')).toHaveCount(0);

    await page.getByTestId('loop-menu').tap();
    await expect(page.getByTestId('menu-archive')).toHaveText(tEn('act.archiveLocked'));
    await toTop(page);
    await snap(page, 'phone-loop-menu', 'The ⋯ of the loop page on the phone: a sheet', phone(regions.sheet()));
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('menu-duplicate')).toHaveCount(0);

    await page.getByTestId('loop-stop').tap();
    await expect(page.getByTestId('stop-dialog')).toContainText(tEn('stop.body', { n: 69, d: '0:42', k: 3 }));
    await toTop(page);
    await snap(page, 'phone-loop-stop-confirm', 'Stop confirmation on the phone: a sheet', phone(regions.sheet()));
    await page.getByTestId('stop-cancel').tap();
    await expect(page.getByTestId('stop-dialog')).toHaveCount(0);
  });

  test('last run failed, never started', async ({ page }) => {
    test.setTimeout(120_000);
    await ctx.world(page);
    await openLoop(page, ctx.sp.baseUrl, 'crash', { logLines: 1, runs: 4, periods: 1 });
    await expect(page.getByTestId('open-repos')).toBeVisible();
    await snap(page, 'phone-loop-last-failed', 'The last run failed on the phone', phone());

    await openLoop(page, ctx.sp.baseUrl, 'recap', { logLines: 0, runs: 0 });
    await expect(page.getByTestId('loop-start')).toBeVisible();
    await snap(page, 'phone-loop-never-run', 'Just created, on the phone', phone());
  });

  test('All runs, settings and prompt, an active period', async ({ page }) => {
    test.setTimeout(120_000);
    await ctx.world(page);
    const base = ctx.sp.baseUrl;

    await page.goto(`${base}/loops/${ID.pilot}/runs`);
    await expect(page.getByTestId('runs-table').getByTestId('run-row')).toHaveCount(10);
    await fontsLoaded(page);
    await snap(page, 'phone-loop-runs', 'All runs on the phone', phone());

    await page.goto(`${base}/loops/${ID.pilot}/settings`);
    await expect(page.getByTestId('loop-prompt')).toBeVisible();
    await expect(page.getByTestId('loop-edit')).toBeVisible();
    await fontsLoaded(page);
    await snap(page, 'phone-loop-settings', 'Settings and prompt on the phone, Edit settings in the action bar', phone());

    await page.goto(`${base}/executions/${period('pilot', 3)}`);
    await expect(page.getByTestId('exec-runs').getByTestId('run-row')).toHaveCount(10);
    await expect(page.getByTestId('back-to-loop')).toBeVisible();
    await fontsLoaded(page);
    await snap(page, 'phone-period-running', 'An active period on the phone', phone());
  });
});
