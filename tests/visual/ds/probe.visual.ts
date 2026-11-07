// The loop page and the run page of a loop with a probe (goal-driven loop, task P15) next to the approved preview (design/ds/preview/shots/):
// `probe-waiting`, `probe-held`, `probe-blocked`, `probe-complete` and `run-held`, desktop and phone (`phone-` twins), light and dark = 20 pairs.
// The app is real: a real server (test mode, test database) with the world of tests/support/goal-loop-probe-world.ts (the loop of
// `goalLoop` in data.js, its runs, its probe row, the open hold and the transcript of the held run), the clocks at PREVIEW_NOW. The
// regions are the page (plus the navigation bar on the phone). No mask: a difference is fixed, never hidden.
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { seedProbeState, type ProbeSeedState } from '../../support/goal-loop-probe-world';
import { PREVIEW_NOW } from '../../support/preview-world';
import { liveDbUrl, ServerProcess } from '../../support/server-process';
import { PHONE_VIEW, PREVIEW_VIEW, regions, snap, writeReport } from './kit';

test.afterAll(() => writeReport('probe'));

/** Every font face the page uses is loaded (a face is fetched the first time text needs it). */
const fontsLoaded = (page: Page) =>
  page.evaluate(() =>
    Promise.all(
      ['400', '500', '600', '700']
        .map((w) => document.fonts.load(`${w} 14px "Be Vietnam Pro"`))
        .concat(['400', '500', '600'].map((w) => document.fonts.load(`${w} 14px "JetBrains Mono"`)))
        .concat([document.fonts.load('italic 400 14px "Be Vietnam Pro"')]),
    ),
  );

/** One server for a describe block, with its own CLAUDE_CONFIG_DIR; `world(page, state)` = the world of one probe state with the clocks at PREVIEW_NOW. */
function useServer() {
  const ctx = {} as { sp: ServerProcess; db: pg.Pool; world(page: Page, state: ProbeSeedState): Promise<{ path: string; runPath: string | null }> };
  test.beforeAll(async () => {
    const config = realpathSync(mkdtempSync(join(tmpdir(), 'cf-ds-probe-')));
    ctx.sp = await ServerProcess.launch({ env: { CLAUDE_CONFIG_DIR: config } });
    ctx.db = new pg.Pool({ connectionString: liveDbUrl(), max: 2 });
    ctx.world = async (page, state) => {
      // Leave the app first: its reads would race the reset's TRUNCATE (castraferrum#170).
      await page.goto('about:blank');
      const seeded = await seedProbeState(ctx.sp, ctx.db, state, { projectsDir: join(config, 'projects') });
      await page.clock.setFixedTime(PREVIEW_NOW);
      return seeded;
    };
  });
  test.afterAll(async () => {
    await ctx.sp?.stop();
    await ctx.db?.end();
  });
  return ctx;
}

/** The loop page of a probe state is drawn: its header with the state, the figures, the list of the state and the last probe line. */
async function loopReady(page: Page, state: ProbeSeedState, extra: string | null) {
  await expect(page.getByTestId('loop-header')).toHaveAttribute('data-status', state);
  await expect(page.getByTestId('now-card')).toHaveAttribute('data-state', state);
  await expect(page.getByTestId('fig-goals')).toBeVisible();
  await expect(page.getByTestId('probe-line')).toBeVisible();
  if (extra) await expect(page.getByTestId(extra).first()).toBeVisible();
  await expect(page.getByTestId('recent-runs').getByTestId('run-row').first()).toBeVisible();
  await expect(page.getByTestId('conn')).toHaveAttribute('data-db', 'ok');
  await fontsLoaded(page);
}

/** The pointer parked away from everything, the page at the top. */
const still = async (page: Page, mouse: { x: number; y: number }) => {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.mouse.move(mouse.x, mouse.y);
  await page.evaluate(() => window.scrollTo(0, 0));
};

const STATES: { state: ProbeSeedState; title: string; extra: string | null; start: 'loop-stop' | 'loop-start' }[] = [
  { state: 'waiting', title: 'A probe loop waits for a person (action wait): Waiting for you, the reason, the last probe line', extra: null, start: 'loop-stop' },
  { state: 'held', title: 'A probe loop on a hold (action hold, usage limit): Held, the hold, the last probe line, a held run in Recent runs', extra: 'hold-list', start: 'loop-stop' },
  { state: 'blocked', title: 'A probe loop with blockers (action blocked): Blocked, the blocking issues, the last probe line', extra: 'blocker-list', start: 'loop-stop' },
  { state: 'complete', title: 'The goal passed (action done): Goal met, the active period closed with Goal met, Start', extra: 'period-status', start: 'loop-start' },
];

test.describe('desktop probe pages against the preview', () => {
  test.use({ ...PREVIEW_VIEW });
  const ctx = useServer();

  for (const s of STATES) {
    test(`probe-${s.state}`, async ({ page }) => {
      test.setTimeout(180_000);
      const { path } = await ctx.world(page, s.state);
      await page.goto(`${ctx.sp.baseUrl}${path}`);
      await loopReady(page, s.state, s.extra);
      await expect(page.getByTestId(s.start)).toBeVisible();
      if (s.state === 'held') await expect(page.getByTestId('banner-hold')).toBeVisible();
      await still(page, { x: 1430, y: 890 });
      await snap(page, `probe-${s.state}`, s.title, [regions.page()]);
    });
  }

  test('run-held', async ({ page }) => {
    test.setTimeout(180_000);
    const { runPath } = await ctx.world(page, 'held');
    await page.goto(`${ctx.sp.baseUrl}${runPath}`);
    await expect(page.getByTestId('run-header')).toHaveAttribute('data-status', 'held');
    await expect(page.getByTestId('run-banner')).toBeVisible();
    await expect(page.getByTestId('run-transcript').getByTestId('tx-entry')).toHaveCount(6, { timeout: 10_000 });
    await expect(page.getByTestId('run-log').locator('.log-line[data-seq="2"]')).toBeVisible();
    await expect(page.getByTestId('run-resume')).toHaveCount(0);
    await expect(page.getByTestId('conn')).toHaveAttribute('data-db', 'ok');
    await fontsLoaded(page);
    // The preview is a still page: its transcript is scrolled to the top. The app's follows the bottom; scroll it like the preview.
    await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('[data-testid="run-transcript-scroll"]');
      if (el) el.scrollTop = 0;
    });
    await still(page, { x: 1430, y: 890 });
    await snap(page, 'run-held', 'A run held by the usage limit: Held, the same session resumes after the reset, no resume command', [regions.page()]);
  });
});

test.describe('phone probe pages against the preview', () => {
  test.use(PHONE_VIEW);
  const ctx = useServer();

  for (const s of STATES) {
    test(`phone-probe-${s.state}`, async ({ page }) => {
      test.setTimeout(180_000);
      const { path } = await ctx.world(page, s.state);
      await page.goto(`${ctx.sp.baseUrl}${path}`);
      await loopReady(page, s.state, s.extra);
      await expect(page.getByTestId(s.start)).toBeVisible();
      await still(page, { x: 380, y: 830 });
      await snap(page, `phone-probe-${s.state}`, `${s.title}, on the phone`, [regions.navbar(), regions.page()]);
    });
  }

  test('phone-run-held', async ({ page }) => {
    test.setTimeout(180_000);
    const { runPath } = await ctx.world(page, 'held');
    await page.goto(`${ctx.sp.baseUrl}${runPath}`);
    await expect(page.getByTestId('run-header')).toHaveAttribute('data-status', 'held');
    await expect(page.getByTestId('run-banner')).toBeVisible();
    await expect(page.getByTestId('run-transcript').getByTestId('tx-entry')).toHaveCount(6, { timeout: 10_000 });
    await expect(page.getByTestId('conn')).toHaveAttribute('data-db', 'ok');
    await fontsLoaded(page);
    await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('[data-testid="run-transcript-scroll"]');
      if (el) el.scrollTop = 0;
    });
    await still(page, { x: 380, y: 830 });
    await snap(page, 'phone-run-held', 'A run held by the usage limit, on the phone', [regions.navbar(), regions.page()]);
  });
});
