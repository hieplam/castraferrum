// The gate pages (goal-driven loop, task K12) next to the approved preview (design/ds/preview/shots/): the states `gate-queue` and `gate-failed`
// on the desktop and `phone-gate-queue` and `phone-gate-failed` on the phone, light and dark = 8 pairs. The app is real: a real server (test
// mode, test database) with the world of tests/support/goal-loop-gate-world.ts (the gate of the repo `api` is on, five jobs, job 41 failed
// at `green` with its output), the clocks at PREVIEW_NOW. The regions are the page, and on the phone the navigation bar. No mask.
import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { createFakeGh, type FakeGh } from '../../support/fake-gh-kit';
import { gateJobId, seedGateFailed, seedGateQueue } from '../../support/goal-loop-gate-world';
import { liveDbUrl, ServerProcess } from '../../support/server-process';
import { PREVIEW_NOW, repoId } from '../../support/preview-world';
import { PHONE_VIEW, PREVIEW_VIEW, regions, snap, writeReport } from './kit';

test.afterAll(() => writeReport('gate'));
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

/** One server and one pool for a describe block; `world()` builds the gate world on an empty database. */
function useServer() {
  const ctx = {} as { gh: FakeGh; sp: ServerProcess; db: pg.Pool; world(page: Page, seed: typeof seedGateQueue): Promise<void> };
  test.beforeAll(async () => {
    // The seeded gate is on, so its ticks call `gh`: they run on the fake one, never on the real `gh` of this machine.
    ctx.gh = createFakeGh();
    ctx.sp = await ServerProcess.launch({ env: { LOOPS_GH_BIN: ctx.gh.script, FAKE_GH_WORLD: ctx.gh.world } });
    ctx.db = new pg.Pool({ connectionString: liveDbUrl(), max: 2 });
    ctx.world = async (page, seed) => {
      // Leave the app first: its reads would race the reset's TRUNCATE (castraferrum#170).
      await page.goto('about:blank');
      await seed(ctx.sp, ctx.db);
      await page.clock.setFixedTime(PREVIEW_NOW);
    };
  });
  test.afterAll(async () => {
    await ctx.sp?.stop();
    await ctx.db?.end();
    ctx.gh?.dispose();
  });
  return ctx;
}

const QUEUE = `/repos/${repoId('api')}/gate`;
const FAILED = `/repos/${repoId('api')}/gate/jobs/${gateJobId(41)}`;

test.describe('desktop gate pages against the preview', () => {
  test.use(PREVIEW_VIEW);
  const ctx = useServer();

  test('gate-queue', async ({ page }) => {
    test.setTimeout(180_000);
    await ctx.world(page, seedGateQueue);
    await page.goto(`${ctx.sp.baseUrl}${QUEUE}`);
    await expect(page.getByTestId('gate-job')).toHaveCount(5);
    await still(page, { x: 1430, y: 890 });
    await snap(page, 'gate-queue', 'The gate queue: the switch, three jobs in the queue, two in the record', [regions.page()]);
  });

  test('gate-failed', async ({ page }) => {
    test.setTimeout(180_000);
    await ctx.world(page, seedGateFailed);
    await page.goto(`${ctx.sp.baseUrl}${FAILED}`);
    await expect(page.getByTestId('gate-step')).toHaveCount(8);
    await expect(page.getByTestId('gate-output')).toBeVisible();
    await still(page, { x: 1430, y: 890 });
    await snap(page, 'gate-failed', 'A failed gate job: the failed step, its output and the eight steps', [regions.page()]);
  });
});

test.describe('phone gate pages against the preview', () => {
  test.use(PHONE_VIEW);
  const ctx = useServer();

  test('phone-gate-queue', async ({ page }) => {
    test.setTimeout(180_000);
    await ctx.world(page, seedGateQueue);
    await page.goto(`${ctx.sp.baseUrl}${QUEUE}`);
    await expect(page.getByTestId('gate-job')).toHaveCount(5);
    await expect(page.getByTestId('tabbar')).toBeVisible();
    await still(page, { x: 380, y: 830 });
    await snap(page, 'phone-gate-queue', 'The gate queue on the phone', [regions.navbar(), regions.page()]);
  });

  test('phone-gate-failed', async ({ page }) => {
    test.setTimeout(180_000);
    await ctx.world(page, seedGateFailed);
    await page.goto(`${ctx.sp.baseUrl}${FAILED}`);
    await expect(page.getByTestId('gate-step')).toHaveCount(8);
    await expect(page.getByTestId('tabbar')).toBeVisible();
    await still(page, { x: 380, y: 830 });
    await snap(page, 'phone-gate-failed', 'A failed gate job on the phone', [regions.navbar(), regions.page()]);
  });
});
