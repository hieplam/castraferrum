// The goals page (goal-driven loop, task T6) next to the approved preview (design/ds/preview/shots/): the state `goal-rows` on the desktop
// and `phone-goal-rows` on the phone, light and dark = 4 pairs. The app is real: a real server (test mode, test database) with the world of
// tests/support/goal-loop-goals-world.ts (a git clone whose origin/main holds the manifest of 8 goals and the health file, 8 stored rows with
// 3 passing, two standing goals, one loop whose probe failed), the clocks at PREVIEW_NOW. The regions are the page, and on the phone the
// navigation bar. No mask.
import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { createFakeGh, type FakeGh } from '../../support/fake-gh-kit';
import { seedGoalRows } from '../../support/goal-loop-goals-world';
import { liveDbUrl, ServerProcess } from '../../support/server-process';
import { PREVIEW_NOW } from '../../support/preview-world';
import { PHONE_VIEW, PREVIEW_VIEW, regions, snap, writeReport } from './kit';

test.afterAll(() => writeReport('goals'));

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

/** One server and one pool for a describe block; `world()` builds the goals world on an empty database and gives the path of the page. */
function useServer() {
  const ctx = {} as { gh: FakeGh; sp: ServerProcess; db: pg.Pool; world(page: Page): Promise<string> };
  test.beforeAll(async () => {
    // Any tick of the console that calls `gh` runs on the fake one, never on the real `gh` of this machine.
    ctx.gh = createFakeGh();
    ctx.sp = await ServerProcess.launch({ env: { LOOPS_GH_BIN: ctx.gh.script, FAKE_GH_WORLD: ctx.gh.world } });
    ctx.db = new pg.Pool({ connectionString: liveDbUrl(), max: 2 });
    ctx.world = async (page) => {
      // Leave the app first: its reads would race the reset's TRUNCATE (castraferrum#170).
      await page.goto('about:blank');
      const { page: path } = await seedGoalRows(ctx.sp, ctx.db);
      await page.clock.setFixedTime(PREVIEW_NOW);
      return path;
    };
  });
  test.afterAll(async () => {
    await ctx.sp?.stop();
    await ctx.db?.end();
    ctx.gh?.dispose();
  });
  return ctx;
}

test.describe('desktop goals page against the preview', () => {
  test.use(PREVIEW_VIEW);
  const ctx = useServer();

  test('goal-rows', async ({ page }) => {
    test.setTimeout(180_000);
    const path = await ctx.world(page);
    await page.goto(`${ctx.sp.baseUrl}${path}`);
    await expect(page.getByTestId('goal-row')).toHaveCount(8);
    await expect(page.getByTestId('standing-row')).toHaveCount(2);
    await expect(page.getByTestId('goal-loop-row')).toHaveCount(1);
    await still(page, { x: 1430, y: 890 });
    await snap(page, 'goal-rows', 'The goals page: four figures, eight goal rows, two standing goals, the loop whose probe failed', [regions.page()]);
  });
});

test.describe('phone goals page against the preview', () => {
  test.use(PHONE_VIEW);
  const ctx = useServer();

  test('phone-goal-rows', async ({ page }) => {
    test.setTimeout(180_000);
    const path = await ctx.world(page);
    await page.goto(`${ctx.sp.baseUrl}${path}`);
    await expect(page.getByTestId('goal-row')).toHaveCount(8);
    await expect(page.getByTestId('tabbar')).toBeVisible();
    await still(page, { x: 380, y: 830 });
    await snap(page, 'phone-goal-rows', 'The goals page on the phone', [regions.navbar(), regions.page()]);
  });
});
