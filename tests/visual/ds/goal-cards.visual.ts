// The goal cards page (goal-driven loop, task W7) next to the approved preview (design/ds/preview/shots/): the states `card-two-way` and
// `card-one-way` on the desktop and `phone-card-two-way` and `phone-card-one-way` on the phone, light and dark = 8 pairs. The app is real:
// a real server (test mode, test database) with the world of tests/support/goal-loop-cards-world.ts (the repo `api` has one proposed card
// and three earlier cards), the clocks at PREVIEW_NOW. The regions are the page, and on the phone the navigation bar. No mask.
import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { seedCard } from '../../support/goal-loop-cards-world';
import { PREVIEW_NOW, repoId } from '../../support/preview-world';
import { liveDbUrl, ServerProcess } from '../../support/server-process';
import { PHONE_VIEW, PREVIEW_VIEW, regions, snap, writeReport } from './kit';

test.afterAll(() => writeReport('goal-cards'));

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

/** One server and one pool for a describe block; `world()` builds the card world on an empty database. */
function useServer() {
  const ctx = {} as { sp: ServerProcess; db: pg.Pool; world(page: Page, door: 'one-way' | 'two-way'): Promise<void> };
  test.beforeAll(async () => {
    ctx.sp = await ServerProcess.launch();
    ctx.db = new pg.Pool({ connectionString: liveDbUrl(), max: 2 });
    ctx.world = async (page, door) => {
      // Leave the app first: its reads would race the reset's TRUNCATE (castraferrum#170).
      await page.goto('about:blank');
      await seedCard(ctx.sp, ctx.db, door);
      await page.clock.setFixedTime(PREVIEW_NOW);
    };
  });
  test.afterAll(async () => {
    await ctx.sp?.stop();
    await ctx.db?.end();
  });
  return ctx;
}

const PAGE = `/repos/${repoId('api')}/goal-cards`;

test.describe('desktop goal cards against the preview', () => {
  test.use(PREVIEW_VIEW);
  const ctx = useServer();

  test('card-two-way', async ({ page }) => {
    test.setTimeout(180_000);
    await ctx.world(page, 'two-way');
    await page.goto(`${ctx.sp.baseUrl}${PAGE}`);
    await expect(page.getByTestId('card-history').locator('.cell')).toHaveCount(3);
    await expect(page.getByTestId('card-door')).toHaveAttribute('data-status', 'two-way');
    await still(page, { x: 1430, y: 890 });
    await snap(page, 'card-two-way', 'A goal card that can be undone: the door, the start time, Accept and Refuse, the rows, the earlier cards', [regions.page()]);
  });

  test('card-one-way', async ({ page }) => {
    test.setTimeout(180_000);
    await ctx.world(page, 'one-way');
    await page.goto(`${ctx.sp.baseUrl}${PAGE}`);
    await expect(page.getByTestId('card-history').locator('.cell')).toHaveCount(3);
    await expect(page.getByTestId('card-door')).toHaveAttribute('data-status', 'one-way');
    await still(page, { x: 1430, y: 890 });
    await snap(page, 'card-one-way', 'A goal card that cannot be undone: it waits for Accept, with no start time', [regions.page()]);
  });
});

test.describe('phone goal cards against the preview', () => {
  test.use(PHONE_VIEW);
  const ctx = useServer();

  test('phone-card-two-way', async ({ page }) => {
    test.setTimeout(180_000);
    await ctx.world(page, 'two-way');
    await page.goto(`${ctx.sp.baseUrl}${PAGE}`);
    await expect(page.getByTestId('card-history').locator('.cell')).toHaveCount(3);
    await expect(page.getByTestId('tabbar')).toBeVisible();
    await still(page, { x: 380, y: 830 });
    await snap(page, 'phone-card-two-way', 'A goal card that can be undone, on the phone', [regions.navbar(), regions.page()]);
  });

  test('phone-card-one-way', async ({ page }) => {
    test.setTimeout(180_000);
    await ctx.world(page, 'one-way');
    await page.goto(`${ctx.sp.baseUrl}${PAGE}`);
    await expect(page.getByTestId('card-history').locator('.cell')).toHaveCount(3);
    await expect(page.getByTestId('tabbar')).toBeVisible();
    await still(page, { x: 380, y: 830 });
    await snap(page, 'phone-card-one-way', 'A goal card that cannot be undone, on the phone', [regions.navbar(), regions.page()]);
  });
});
