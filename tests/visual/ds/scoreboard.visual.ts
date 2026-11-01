// The process scoreboard (goal-driven loop, task R9) next to the approved preview (design/ds/preview/shots/): state `scoreboard` on the
// desktop and `phone-scoreboard` on the phone, light and dark = 4 pairs. The app is real: a real server (test mode, test database)
// with the world of tests/support/goal-loop-score-world.ts (a git repo with two checks, three causes in a report, 16 failed runs),
// the clocks at PREVIEW_NOW. The regions are the page, and on the phone the navigation bar. No mask.
import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { seedScoreboard } from '../../support/goal-loop-score-world';
import { liveDbUrl, ServerProcess } from '../../support/server-process';
import { PREVIEW_NOW } from '../../support/preview-world';
import { PHONE_VIEW, PREVIEW_VIEW, regions, snap, writeReport } from './kit';

test.afterAll(() => writeReport('scoreboard'));

/** The page is ready for a shot: the data is in, the fonts are loaded, no hover, no caret. */
async function still(page: Page, mouse: { x: number; y: number }) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.mouse.move(mouse.x, mouse.y);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.getByTestId('conn')).toHaveAttribute('data-db', 'ok');
  await page.evaluate(() =>
    Promise.all(
      ['400', '500', '600', '700'].map((w) => document.fonts.load(`${w} 14px "Be Vietnam Pro"`)).concat(['400', '500', '600'].map((w) => document.fonts.load(`${w} 14px "JetBrains Mono"`))),
    ),
  );
}

/** One server and one pool for a describe block; `world()` builds the scoreboard world on an empty database. */
function useServer() {
  const ctx = {} as { sp: ServerProcess; db: pg.Pool; world(page: Page): Promise<void> };
  test.beforeAll(async () => {
    ctx.sp = await ServerProcess.launch();
    ctx.db = new pg.Pool({ connectionString: liveDbUrl(), max: 2 });
    ctx.world = async (page) => {
      // Leave the app first: its reads would race the reset's TRUNCATE (castraferrum#170).
      await page.goto('about:blank');
      await seedScoreboard(ctx.sp, ctx.db);
      await page.clock.setFixedTime(PREVIEW_NOW);
    };
  });
  test.afterAll(async () => {
    await ctx.sp?.stop();
    await ctx.db?.end();
  });
  return ctx;
}

test.describe('desktop scoreboard against the preview', () => {
  test.use(PREVIEW_VIEW);
  const ctx = useServer();

  test('scoreboard', async ({ page }) => {
    test.setTimeout(180_000);
    await ctx.world(page);
    await page.goto(`${ctx.sp.baseUrl}/scoreboard`);
    await expect(page.getByTestId('score-cause')).toHaveCount(3);
    await expect(page.getByTestId('score-week')).toHaveCount(5);
    await still(page, { x: 1430, y: 890 });
    await snap(page, 'scoreboard', 'The process scoreboard: four figures, five weeks, three causes', [regions.page()]);
  });
});

test.describe('phone scoreboard against the preview', () => {
  test.use(PHONE_VIEW);
  const ctx = useServer();

  test('phone-scoreboard', async ({ page }) => {
    test.setTimeout(180_000);
    await ctx.world(page);
    await page.goto(`${ctx.sp.baseUrl}/scoreboard`);
    await expect(page.getByTestId('score-cause')).toHaveCount(3);
    await expect(page.getByTestId('tabbar')).toBeVisible();
    await still(page, { x: 380, y: 830 });
    await snap(page, 'phone-scoreboard', 'The process scoreboard on the phone', [regions.navbar(), regions.page()]);
  });
});
