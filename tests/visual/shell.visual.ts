// Shots of the REAL app frame placed next to the approved preview shots (design/preview/shots/) + pixel mismatch per region
// (toolkit: compare-kit.ts). Every preview state of the app frame is rebuilt on the real app — a real server, a really
// killed server, a really cut Postgres — then compared: top bar (overview figures included), status banner, list pane,
// main pane at "/", the "← List" button. The DB carries the exact "world" of the preview (tests/support/preview-world.ts),
// so the list region and the overview figures are not masked. The time is fixed with `page.clock.setFixedTime` so the
// text matches the preview (now = 14:00:42, the DB died at 14:00:31); timers still run for real, so the retries
// 1 → 2 → 4 seconds really happen.
import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { PREVIEW_NOW, previewDirs, seedPreviewWorld, wipe } from '../support/preview-world';
import { liveDbUrl, ServerProcess } from '../support/server-process';
import { PREVIEW_VIEW, regions, snap, tEn, writeReport } from './compare-kit';

test.use(PREVIEW_VIEW);
const at = (hms: string) => new Date(`2026-10-18T${hms}+07:00`);

test.describe('app frame against the preview', () => {
  test.describe.configure({ mode: 'serial' });
  let sp: ServerProcess;
  let db: pg.Pool;
  test.beforeAll(async () => {
    sp = await ServerProcess.launch();
    db = new pg.Pool({ connectionString: liveDbUrl(), max: 2 });
  });
  test.afterAll(async () => {
    await sp?.stop();
    await db?.end();
    writeReport('shell');
  });
  /** Clean DB → the preview world → server + browser clocks at 14:00:42 (the "up for" clock shows exactly #69 00:42). */
  async function world(page: Page, browserAt = PREVIEW_NOW): Promise<void> {
    expect((await sp.api('POST', '/api/__test/reset')).status).toBe(204);
    // The server clock BEFORE seeding (the next runs 14:05 / 14:30 are past compared with the real time → the ticker would run them).
    expect((await sp.api('POST', '/api/__test/clock', { at: PREVIEW_NOW.toISOString() })).status).toBe(200);
    expect((await sp.api('POST', '/api/__test/dirs', { paths: previewDirs() })).status).toBe(204); // D-UI11: only the old repo is missing its folder
    await wipe(db);
    await seedPreviewWorld(db);
    await page.clock.setFixedTime(browserAt);
  }
  const ready = async (page: Page) => {
    await expect(page.getByTestId('loop-row')).toHaveCount(7);
    await expect(page.getByTestId('lamp-db')).toHaveAttribute('data-state', 'ok');
  };

  test('normal, loading, narrow viewport', async ({ page }) => {
    test.setTimeout(120_000);
    await world(page);
    await page.goto(`${sp.baseUrl}/`);
    await ready(page);
    await snap(page, 'list-overview', 'Normal at "/" — top bar + list with every kind of row + short guide', [regions.topbarAll(), regions.list(), regions.main()]);

    await page.setViewportSize({ width: 960, height: 900 });
    await snap(page, 'list-narrow', 'Below 1100px at "/" — only the list', [regions.topbarAll(), regions.list()]);
    await page.setViewportSize({ width: 1440, height: 900 });
    // `loop-narrow`, `vi-loop-running` (top bar + main pane of the loop detail) live in detail.visual.ts.

    // Loading: the API has not answered (every request held) → figures "—", server + db lamps amber — figures compared too.
    const loading = await page.context().newPage();
    // Every API call hangs except the repo list: the preview list-loading still prints the repo count in the top bar ("Repos 4").
    await loading.route('**/api/**', (r) => (new URL(r.request().url()).pathname === '/api/repos' ? r.continue() : undefined));
    await loading.goto(`${sp.baseUrl}/`);
    await expect(loading.getByTestId('lamp-server')).toHaveAttribute('data-state', 'wait');
    await expect(loading.getByTestId('list-loading')).toBeVisible();
    await snap(loading, 'list-loading', 'Loading — figures "—", amber lamps, skeleton rows', [regions.topbarAll(), regions.list(), regions.main()]);
    await loading.close();
  });

  test('lost connection → reconnected', async ({ page }) => {
    test.setTimeout(120_000);
    await world(page);
    await page.goto(`${sp.baseUrl}/`);
    await ready(page);
    await expect(page.getByTestId('lamp-server')).toHaveAttribute('data-state', 'ok');
    await sp.kill();
    // attempt 1 (wait 1 second) → attempt 2 (2 seconds) → attempt 3 (4 seconds) — exactly the text of the preview
    await expect(page.getByTestId('banner-disconnected')).toContainText(`${tEn('banner.retry', { n: 3, s: 4 })} · ${tEn('banner.staleSince', { t: '14:00:42' })}`, { timeout: 10_000 });
    await snap(page, 'list-disconnected', 'Lost connection — red banner, red server lamp, faded figures, frozen list', [regions.topbarAll(), regions.banner(), regions.list()]);

    // Restart the server: recovery stops every loop (UC-15) → seed the world again BEFORE the browser reconnects (keep
    // /api/events unreachable until then), so the data refreshed after reconnecting is exactly the preview data.
    await page.route('**/api/events**', (r) => r.abort());
    await sp.start();
    await world(page);
    await page.unroute('**/api/events**');
    await expect(page.getByTestId('banner-reconnected')).toBeVisible({ timeout: 30_000 });
    await ready(page);
    await expect(page.getByTestId('stat-active-loops')).toHaveText(tEn('top.stats.activeLoops', { n: 4 }));
    await snap(page, 'list-reconnected', 'Reconnected — notice banner, data refreshed without F5', [regions.topbarAll(), regions.banner(), regions.list()]);
  });

  test('database down', async ({ page }) => {
    test.setTimeout(120_000);
    await world(page, at('14:00:31'));
    await page.goto(`${sp.baseUrl}/`);
    await ready(page);
    await sp.cutDb();
    try {
      await expect(page.getByTestId('banner-db-down')).toContainText(tEn('banner.dbDownSince', { t: '14:00:31' }), { timeout: 12_000 });
      // The banner keeps the moment the DB died (14:00:31); the "up for" clocks of the rows keep running to 14:00:42 like the preview.
      await page.clock.setFixedTime(PREVIEW_NOW);
      await expect(page.getByTestId('loop-row').first()).toContainText('#69 00:42');
      await snap(page, 'list-db-down', 'Database down — red banner + red db lamp, faded figures', [regions.topbarAll(), regions.banner(), regions.list()]);
    } finally {
      await sp.restoreDb();
    }
  });
});
