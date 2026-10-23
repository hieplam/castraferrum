// The new frame, Settings and Not found (UI uplift, task U14) next to the approved new preview (design/ds/preview/shots/):
// 12 states, light and dark = 24 pairs. Every state is rebuilt on the real app: a real server, a really killed server, a
// really cut Postgres, a held request. The DB carries the world of the new preview (tests/support/preview-world.ts with
// DS_DATA_JS), the server and browser clocks stand at PREVIEW_NOW, and the only masks are `settings-address` and
// `settings-version` (the machine's address and the build's version). The regions are the ones the task owns: the whole
// page for Settings and Not found, the top bar and the banner (desktop) or the banner and the tab bar (phone) for the
// frame states; the page of the Loops states is compared by the Loops task.
import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { en } from '../../../shared/i18n/en';
import { DS_DATA_JS, PREVIEW_NOW, previewDirs, seedPreviewWorld, wipe } from '../../support/preview-world';
import { liveDbUrl, ServerProcess } from '../../support/server-process';
import { PHONE_VIEW, PREVIEW_VIEW, regions, setLang, snap, writeReport } from './kit';

/** The English text of a key of shared/i18n/en.ts with `{x}` filled in, like the app does. */
const tEn = (key: keyof typeof en, params: Record<string, string | number> = {}) =>
  en[key].replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));

test.afterAll(() => writeReport('frame'));

/** One server for a describe block; `world()` = a clean DB with the new preview's world and the clocks at PREVIEW_NOW. */
function useServer() {
  const ctx = {} as { sp: ServerProcess; db: pg.Pool; world(page: Page): Promise<void> };
  test.beforeAll(async () => {
    ctx.sp = await ServerProcess.launch();
    ctx.db = new pg.Pool({ connectionString: liveDbUrl(), max: 2 });
    ctx.world = async (page) => {
      expect((await ctx.sp.api('POST', '/api/__test/reset')).status).toBe(204);
      // The server clock BEFORE seeding, or the ticker would run the runs that are already overdue.
      expect((await ctx.sp.api('POST', '/api/__test/clock', { at: PREVIEW_NOW.toISOString() })).status).toBe(200);
      expect((await ctx.sp.api('POST', '/api/__test/dirs', { paths: previewDirs(DS_DATA_JS) })).status).toBe(204);
      await wipe(ctx.db);
      await seedPreviewWorld(ctx.db, {}, DS_DATA_JS);
      await page.clock.setFixedTime(PREVIEW_NOW);
    };
  });
  test.afterAll(async () => {
    await ctx.sp?.stop();
    await ctx.db?.end();
  });
  return ctx;
}

/**
 * The frame is settled: the nav counts are in, the connection shows the server and the database answering, and every font face the
 * pages use is loaded. A face is fetched the first time text needs it, so one that is still unfetched when the server is killed
 * would fail to load and the text would be drawn in the fallback font.
 */
async function settled(page: Page) {
  await expect(page.getByTestId('conn')).toHaveAttribute('data-server', 'ok');
  await expect(page.getByTestId('conn')).toHaveAttribute('data-db', 'ok');
  await expect(page.getByTestId('nav-repos-count')).toHaveText('4');
  await page.evaluate(() =>
    Promise.all(['400', '500', '600', '700'].map((w) => document.fonts.load(`${w} 14px "Be Vietnam Pro"`)).concat(document.fonts.load('400 14px "JetBrains Mono"'))),
  );
}

test.describe('desktop frame, Settings and Not found against the preview', () => {
  test.describe.configure({ mode: 'serial' });
  test.use(PREVIEW_VIEW);
  const ctx = useServer();

  test('settings and not found', async ({ page }) => {
    test.setTimeout(120_000);
    await ctx.world(page);
    await page.goto(`${ctx.sp.baseUrl}/settings`);
    await settled(page);
    await expect(page.getByTestId('settings-theme-auto')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('settings-db')).toContainText(tEn('settings.answering'));
    await snap(page, 'settings', 'Settings, everything connected', [regions.topbar(), regions.page(['settings-address', 'settings-version'])]);

    await page.goto(`${ctx.sp.baseUrl}/no/such/page`);
    await settled(page);
    await expect(page.getByText(tEn('missing.title'))).toBeVisible();
    await snap(page, 'not-found', 'Unknown URL: empty state with a link to Loops', [regions.topbar(), regions.page()]);
  });

  test('loading', async ({ page }) => {
    test.setTimeout(120_000);
    await ctx.world(page);
    // The figures have not arrived (stats held); the repo list, the live stream and the health check answer, as in the preview.
    await page.route('**/api/stats**', () => undefined);
    await page.goto(`${ctx.sp.baseUrl}/`);
    await settled(page);
    await expect(page.getByTestId('nav-loops')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('nav-loops')).toHaveText(tEn('nav.loops'));
    await snap(page, 'frame-loading', 'First load: the top bar without the Loops count', [regions.topbar()]);
  });

  test('lost connection, then reconnected', async ({ page }) => {
    test.setTimeout(120_000);
    await ctx.world(page);
    await page.goto(`${ctx.sp.baseUrl}/`);
    await settled(page);
    await expect(page.getByTestId('nav-loops')).toContainText('7');
    await ctx.sp.kill();
    // attempt 1 (wait 1 second), attempt 2 (2 seconds), attempt 3 (4 seconds): exactly the text of the preview
    await expect(page.getByTestId('banner-disconnected')).toContainText(tEn('banner.lostRetry', { n: 3, s: 4 }), { timeout: 10_000 });
    await expect(page.getByTestId('conn')).toHaveAttribute('data-server', 'down');
    await snap(page, 'frame-disconnected', 'Lost connection: red banner with the attempt and the retry time', [regions.topbar(), regions.banner()]);

    // Restart: recovery stops every loop (UC-15), so seed the world again BEFORE the browser reconnects.
    await page.route('**/api/events**', (r) => r.abort());
    await ctx.sp.start();
    await ctx.world(page);
    await page.unroute('**/api/events**');
    await expect(page.getByTestId('banner-reconnected')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('banner-reconnected')).toContainText(tEn('banner.back'));
    await snap(page, 'frame-reconnected', 'Info banner: reconnected, data refreshed', [regions.topbar(), regions.banner()]);
  });

  test('database down', async ({ page }) => {
    test.setTimeout(120_000);
    await ctx.world(page);
    await page.goto(`${ctx.sp.baseUrl}/settings`);
    await settled(page);
    await ctx.sp.cutDb();
    try {
      await expect(page.getByTestId('banner-db-down')).toContainText(tEn('banner.db'), { timeout: 15_000 });
      await expect(page.getByTestId('conn')).toHaveAttribute('data-db', 'down');
      await expect(page.getByTestId('settings-db')).toContainText(tEn('settings.notAnswering'));
      await snap(page, 'settings-db-down', 'Settings with the database not answering', [regions.topbar(), regions.page(['settings-address', 'settings-version'])]);
      // The same state on the Loops path, where the preview draws it: the Loops link is the active one.
      await page.getByTestId('nav-loops').click();
      await expect(page.getByTestId('nav-loops')).toHaveAttribute('aria-current', 'page');
      await expect(page.getByTestId('banner-db-down')).toBeVisible();
      await snap(page, 'frame-db-down', 'Server up, database not answering: warning banner, "Database not answering"', [regions.topbar(), regions.banner()]);
    } finally {
      await ctx.sp.restoreDb();
    }
  });
});

test.describe('phone frame, Settings and Not found against the preview', () => {
  test.describe.configure({ mode: 'serial' });
  test.use(PHONE_VIEW);
  const ctx = useServer();

  test('settings, Vietnamese settings and not found', async ({ page }) => {
    test.setTimeout(120_000);
    await ctx.world(page);
    await page.goto(`${ctx.sp.baseUrl}/settings`);
    await settled(page);
    await expect(page.getByTestId('tab-settings')).toHaveAttribute('aria-current', 'page');
    await snap(page, 'phone-settings', 'Settings on the phone', [regions.page(['settings-address', 'settings-version']), regions.tabbar()]);

    await setLang(page, 'vi');
    await expect(page.getByTestId('settings-lang-vi')).toHaveAttribute('aria-checked', 'true');
    await settled(page);
    await snap(page, 'phone-vi-settings', 'Settings in Vietnamese on the phone', [regions.page(['settings-address', 'settings-version']), regions.tabbar()]);
    await setLang(page, 'en');

    await page.goto(`${ctx.sp.baseUrl}/no/such/page`);
    await settled(page);
    await expect(page.getByText(tEn('missing.title'))).toBeVisible();
    await snap(page, 'phone-not-found', 'Unknown URL on the phone', [regions.page(), regions.tabbar()]);
  });

  test('loading', async ({ page }) => {
    test.setTimeout(120_000);
    await ctx.world(page);
    await page.route('**/api/stats**', () => undefined);
    await page.goto(`${ctx.sp.baseUrl}/`);
    await settled(page);
    await expect(page.getByTestId('tab-loops')).toHaveAttribute('aria-current', 'page');
    await snap(page, 'phone-frame-loading', 'First load on the phone: the tab bar, Loops active', [regions.tabbar()]);
  });

  test('lost connection', async ({ page }) => {
    test.setTimeout(120_000);
    await ctx.world(page);
    await page.goto(`${ctx.sp.baseUrl}/`);
    await settled(page);
    await ctx.sp.kill();
    await expect(page.getByTestId('banner-disconnected')).toContainText(tEn('banner.lostRetry', { n: 3, s: 4 }), { timeout: 10_000 });
    await snap(page, 'phone-frame-disconnected', 'Lost connection on the phone: banner and tab bar', [regions.banner(), regions.tabbar()]);
    await ctx.sp.start();
  });
});
