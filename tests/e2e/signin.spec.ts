/// <reference lib="dom" />
// E2E sign-in and sign-out (remote-access spec G3 in the browser, D5, D6; task R5). The spec named this use case UC-35,
// but docs/USE-CASES.md had already given UC-35 to the gate, so it is UC-40 there and here.
//
// A real server launched with credentials (`ServerProcess`, the credentials through LOOPS_USERNAME and LOOPS_PASSWORD) and the
// real build: every page first shows the sign-in screen, a wrong password shows the error of en.ts, the right one returns to
// the page that was asked for, a live update arrives within 2 seconds, Sign out ends the session on the server (the page's own
// `GET /api/loops` then answers 401), and the sixth failure in a row shows the too-many-attempts text with Sign in disabled.
// Each view gets its own server, so the attempt count of one never locks the other. The last test runs on the shared e2e
// server, which has no credentials: no sign-in screen and no Sign out there.
import { expect, test, type Page } from '@playwright/test';
import { ensureTestRepo } from '../support/test-repo';
import { ServerProcess } from '../support/server-process';
import { t } from '../support/ui-text';

const USER = 'owner';
const PASS = 'password1';

const VIEWS = [
  { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
  { name: 'phone 390x844 touch', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
] as const;

/** Types the credentials and presses Sign in (a tap on the touch view); resolves with the status of the login answer. */
async function signIn(page: Page, username: string, password: string, touch: boolean): Promise<number> {
  await page.getByTestId('signin-username').fill(username);
  await page.getByTestId('signin-password').fill(password);
  const answer = page.waitForResponse((r) => r.url().endsWith('/api/auth/login'));
  if (touch) await page.getByTestId('signin-submit').tap();
  else await page.getByTestId('signin-submit').click();
  return (await answer).status();
}

/** The status a request of the page itself gets (the browser sends the page's cookies). */
const pageFetch = (page: Page, path: string) => page.evaluate(async (p) => (await fetch(p)).status, path);

for (const view of VIEWS) {
  test.describe(`sign-in on ${view.name}`, () => {
    test.use(view.use);
    let sp: ServerProcess;
    test.beforeAll(async () => {
      sp = await ServerProcess.launch({ env: { LOOPS_USERNAME: USER, LOOPS_PASSWORD: PASS } });
    });
    test.afterAll(async () => {
      await sp?.stop();
    });

    test(`@UC-40 sign in, live updates, sign out, too many attempts (${view.name})`, async ({ page }) => {
      test.setTimeout(120_000);
      const touch = view.name !== 'desktop';

      // Every page first shows the sign-in screen, outside the app frame, and remembers where it was going.
      await page.goto(`${sp.baseUrl}/loops/new`);
      await expect(page.getByTestId('signin-form')).toBeVisible();
      await expect(page).toHaveURL(`${sp.baseUrl}/signin?next=%2Floops%2Fnew`);
      await expect(page.getByTestId('topbar')).toHaveCount(0);
      await expect(page.getByTestId('tab-loops')).toHaveCount(0);
      await expect(page.getByTestId('signin-username')).toHaveAttribute('autocomplete', 'username');
      await expect(page.getByTestId('signin-password')).toHaveAttribute('autocomplete', 'current-password');

      // A wrong password: the error of en.ts, the username kept, the password cleared.
      expect(await signIn(page, USER, 'password2', touch)).toBe(401);
      await expect(page.getByTestId('signin-error')).toHaveAttribute('data-code', 'INVALID_CREDENTIALS');
      await expect(page.getByTestId('signin-error')).toHaveText(t('signin.invalid'));
      await expect(page.getByTestId('signin-username')).toHaveValue(USER);
      await expect(page.getByTestId('signin-password')).toHaveValue('');

      // The right one returns to the page that was asked for.
      expect(await signIn(page, USER, PASS, touch)).toBe(204);
      await expect(page).toHaveURL(`${sp.baseUrl}/loops/new`);
      await expect(page.getByTestId('form-submit')).toBeVisible();
      await expect(page.getByTestId('signin-form')).toHaveCount(0);

      // After signing in the console works and live updates arrive: a loop created behind the page's back shows within 2 s.
      await page.goto(`${sp.baseUrl}/`);
      await expect(page.getByTestId('home-empty')).toBeVisible();
      await expect(page.getByTestId('conn')).toHaveAttribute('data-server', 'ok');
      const repoId = await ensureTestRepo(async (method, url, body) => {
        const r = await page.request.fetch(sp.baseUrl + url, { method, ...(body === undefined ? {} : { data: body }) });
        return { status: r.status(), body: await r.json() };
      });
      const created = await page.request.post(`${sp.baseUrl}/api/loops`, {
        data: { repoId, timeoutSec: 1800, name: 'Signed in', prompt: 'Job', cron: '*/30 * * * *', executor: { kind: 'mock', config: { durationSec: 600, failRate: 0 } } },
      });
      expect(created.status()).toBe(201);
      await expect(page.getByTestId('loop-name').filter({ hasText: /^Signed in$/ })).toBeVisible({ timeout: 2_000 });

      // The signed-in user and Sign out: the top bar on the desktop, the Account group of Settings on the phone.
      if (touch) {
        await page.getByTestId('tab-settings').tap();
        await expect(page.getByTestId('settings-account')).toHaveText(new RegExp(`${t('signin.signedInAs', { name: USER })}`));
        await page.getByTestId('settings-signout').tap();
      } else {
        await expect(page.getByTestId('topbar-user')).toHaveText(t('signin.signedInAs', { name: USER }));
        await page.getByTestId('topbar-signout').click();
      }

      // Sign out ends the session on the server, not only in the page.
      await expect(page.getByTestId('signin-form')).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`^${sp.baseUrl}/signin`));
      expect(await pageFetch(page, '/api/loops')).toBe(401);

      // Five failures in a row are allowed; the sixth is refused with the wait in minutes, and Sign in is disabled.
      for (let i = 1; i <= 5; i++) expect(await signIn(page, USER, `password${i + 1}`, touch)).toBe(401);
      expect(await signIn(page, USER, 'password7', touch)).toBe(429);
      await expect(page.getByTestId('signin-error')).toHaveAttribute('data-code', 'TOO_MANY_ATTEMPTS');
      await expect(page.getByTestId('signin-error')).toHaveText(t('signin.locked.other', { n: 15 }));
      await expect(page.getByTestId('signin-submit')).toBeDisabled();
    });
  });
}

test.describe('no credentials', () => {
  test('@UC-40 a console started without credentials has no sign-in and no Sign out', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('topbar')).toBeVisible();
    await expect(page.getByTestId('conn')).toHaveAttribute('data-server', 'ok');
    await expect(page.getByTestId('signin-form')).toHaveCount(0);
    await expect(page.getByTestId('topbar-user')).toHaveCount(0);
    await expect(page.getByTestId('topbar-signout')).toHaveCount(0);
    expect(await pageFetch(page, '/api/auth/session')).toBe(200);

    // The sign-in address itself leads into the console.
    await page.goto('/signin?next=%2Fsettings');
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByTestId('settings-theme')).toBeVisible();
    await expect(page.getByTestId('signin-form')).toHaveCount(0);
    await expect(page.getByTestId('settings-account')).toHaveCount(0);
  });
});
