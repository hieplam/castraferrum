// The sign-in screen and Sign out (remote-access task R5) next to the approved sign-in preview (design/ds/preview/shots/, task
// R3, approved in R4): the 10 states `signin`, `signin-error`, `signin-locked`, `signin-topbar`, `vi-signin` and their phone
// twins, light and dark = 20 pairs. Every state is rebuilt on the real app with real actions on a real server started with
// credentials: a wrong password, five failures and a sixth refused by the server's limiter, a real sign-in. The wait of the
// locked state is the preview's 12 minutes: the server clock is wound 210 seconds after the fifth failure, so `Retry-After`
// is 690 seconds, which the screen rounds up to 12 minutes. The signed-in states seed the world of the new preview
// (tests/support/preview-world.ts with DS_DATA_JS) with the clocks at PREVIEW_NOW. Each view has its own server, so the
// attempt count of one never locks the other. The only masks are the machine's address and the build's version.
import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { en } from '../../../shared/i18n/en';
import { DS_DATA_JS, PREVIEW_NOW, previewDirs, seedPreviewWorld } from '../../support/preview-world';
import { liveDbUrl, ServerProcess } from '../../support/server-process';
import { PHONE_VIEW, PREVIEW_VIEW, regions, setLang, snap, writeReport, type RegionSpec } from './kit';

const USER = 'owner';
const PASS = 'password1';

test.afterAll(() => writeReport('signin'));

/** The sign-in screen: the one screen outside the app frame (`.signin`), compared whole. */
const screen = (): RegionSpec => ({ name: 'sign-in screen', selector: '.signin' });

/** One server with credentials for a describe block; `world()` = a clean DB, the clocks at PREVIEW_NOW, the preview's world when asked. */
function useServer() {
  const ctx = {} as { sp: ServerProcess; db: pg.Pool; world(page: Page, seed?: boolean): Promise<void> };
  test.beforeAll(async () => {
    ctx.sp = await ServerProcess.launch({ env: { LOOPS_USERNAME: USER, LOOPS_PASSWORD: PASS } });
    ctx.db = new pg.Pool({ connectionString: liveDbUrl(), max: 2 });
    ctx.world = async (page, seed = false) => {
      // Leave the app first: its reads would race the reset's TRUNCATE (castraferrum#170).
      await page.goto('about:blank');
      expect((await ctx.sp.api('POST', '/api/__test/reset')).status).toBe(204);
      // The server clock BEFORE seeding, or the ticker would run the runs that are already overdue.
      expect((await ctx.sp.api('POST', '/api/__test/clock', { at: PREVIEW_NOW.toISOString() })).status).toBe(200);
      expect((await ctx.sp.api('POST', '/api/__test/dirs', { paths: previewDirs(DS_DATA_JS) })).status).toBe(204);
      if (seed) await seedPreviewWorld(ctx.db, {}, DS_DATA_JS);
      await page.clock.setFixedTime(PREVIEW_NOW);
    };
  });
  test.afterAll(async () => {
    await ctx.sp?.stop();
    await ctx.db?.end();
  });
  return ctx;
}

/** Every font face the page uses is loaded (a face is fetched the first time text needs it). */
const fontsLoaded = (page: Page) =>
  page.evaluate(() => Promise.all(['400', '500', '600', '700'].map((w) => document.fonts.load(`${w} 14px "Be Vietnam Pro"`)).concat(document.fonts.load('400 14px "JetBrains Mono"'))));

/** Ready for a shot: no caret, no focus ring, no hover, the fonts loaded. */
async function still(page: Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.mouse.move(1, 1);
  await fontsLoaded(page);
}

/** Types the credentials and presses Sign in; resolves with the status of the server's answer. */
async function submit(page: Page, password: string): Promise<number> {
  await page.getByTestId('signin-username').fill(USER);
  await page.getByTestId('signin-password').fill(password);
  const answer = page.waitForResponse((r) => r.url().endsWith('/api/auth/login'));
  await page.getByTestId('signin-submit').click();
  return (await answer).status();
}

/** The sign-in states of one view: rest, Vietnamese, wrong password, too many attempts. */
function signinStates(ctx: ReturnType<typeof useServer>, prefix: string) {
  test('rest, Vietnamese, wrong password, too many attempts', async ({ page }) => {
    test.setTimeout(120_000);
    await ctx.world(page);
    await page.goto(`${ctx.sp.baseUrl}/`);
    await expect(page.getByTestId('signin-form')).toBeVisible();
    await still(page);
    await snap(page, `${prefix}signin`, 'The sign-in screen', [screen()]);

    await setLang(page, 'vi');
    await expect(page.getByTestId('signin-form')).toBeVisible();
    await still(page);
    await snap(page, `${prefix}vi-signin`, 'The sign-in screen in Vietnamese', [screen()]);
    await setLang(page, 'en');

    expect(await submit(page, 'password2')).toBe(401);
    await expect(page.getByTestId('signin-error')).toHaveAttribute('data-code', 'INVALID_CREDENTIALS');
    await expect(page.getByTestId('signin-password')).toHaveValue('');
    await still(page);
    await snap(page, `${prefix}signin-error`, 'Wrong username or password', [screen()]);

    for (const pw of ['password3', 'password4', 'password5', 'password6']) expect(await submit(page, pw)).toBe(401);
    expect((await ctx.sp.api('POST', '/api/__test/clock', { advanceMs: 210_000 })).status).toBe(200);
    expect(await submit(page, 'password7')).toBe(429);
    await expect(page.getByTestId('signin-error')).toHaveAttribute('data-code', 'TOO_MANY_ATTEMPTS');
    await expect(page.getByTestId('signin-error')).toHaveText(en['signin.locked.other'].replace('{n}', '12'));
    await expect(page.getByTestId('signin-submit')).toBeDisabled();
    await still(page);
    await snap(page, `${prefix}signin-locked`, 'Too many attempts: the wait in minutes, Sign in disabled', [screen()]);
  });
}

test.describe('desktop sign-in against the preview', () => {
  test.describe.configure({ mode: 'serial' });
  test.use(PREVIEW_VIEW);
  const ctx = useServer();

  test('signed in: the user and Sign out in the top bar', async ({ page }) => {
    test.setTimeout(120_000);
    await ctx.world(page, true);
    await page.goto(`${ctx.sp.baseUrl}/`);
    expect(await submit(page, PASS)).toBe(204);
    await expect(page.getByTestId('loop-row')).toHaveCount(7);
    await expect(page.getByTestId('stat-active-loops')).toHaveAttribute('data-value', /\d/);
    await expect(page.getByTestId('conn')).toHaveAttribute('data-db', 'ok');
    await expect(page.getByTestId('topbar-user')).toHaveText(en['signin.signedInAs'].replace('{name}', USER));
    await still(page);
    await page.mouse.move(1430, 890);
    await snap(page, 'signin-topbar', 'Signed in: the Loops list, the user and Sign out in the top bar', [regions.topbar(), regions.page()]);
  });
  // Last: its five failures lock this server's client for the rest of the block.
  signinStates(ctx, '');
});

test.describe('phone sign-in against the preview', () => {
  test.describe.configure({ mode: 'serial' });
  test.use(PHONE_VIEW);
  const ctx = useServer();

  test('signed in: the Account group of Settings', async ({ page }) => {
    test.setTimeout(120_000);
    await ctx.world(page, true);
    await page.goto(`${ctx.sp.baseUrl}/settings`);
    expect(await submit(page, PASS)).toBe(204);
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByTestId('settings-account')).toContainText(en['signin.signedInAs'].replace('{name}', USER));
    await expect(page.getByTestId('conn')).toHaveAttribute('data-db', 'ok');
    await expect(page.getByTestId('settings-db')).toContainText(en['settings.answering']);
    await still(page);
    await snap(page, 'phone-signin-topbar', 'Settings on the phone: the Account group with the user and Sign out', [
      regions.page(['settings-address', 'settings-version']),
      regions.tabbar(),
    ]);
  });
  // Last: its five failures lock this server's client for the rest of the block.
  signinStates(ctx, 'phone-');
});
