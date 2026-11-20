// E2E on the real machine behind the local name (local-name spec G2 and G3). It runs only with LC_LOCAL_NAME=1,
// because it needs a public DNS record, nginx, a Let's Encrypt certificate from task N3 and the owner's real console. Otherwise it is skipped.
//
// Chromium does not ignore certificate errors: the certificate must be a trusted one (Let's Encrypt). The address is LOOPS_PUBLIC_URL (sample: castra.example.com). The test signs in with
// LOOPS_USERNAME and LOOPS_PASSWORD, starts one loop named "local-name acceptance" and sees it running in 2 seconds.
// It makes no other data, and it stops and archives that loop at the end (the console has no other way to remove a loop).
import { expect, test } from '@playwright/test';
import { t } from '../support/ui-text';

const URL = (process.env.LOOPS_PUBLIC_URL ?? 'https://castra.example.com').replace(/\/+$/, '');
const LOOP_NAME = 'local-name acceptance';

test('the console opens at the local name with a trusted certificate, signs in, and a started loop shows Running in 2 seconds', async ({ browser }) => {
  test.skip(process.env.LC_LOCAL_NAME !== '1', 'needs the machine setup of the local name; run with LC_LOCAL_NAME=1');
  test.setTimeout(60_000);
  const username = process.env.LOOPS_USERNAME;
  const password = process.env.LOOPS_PASSWORD;
  if (!username || !password) throw new Error('LOOPS_USERNAME and LOOPS_PASSWORD must be set');

  const context = await browser.newContext({ ignoreHTTPSErrors: false, baseURL: URL });
  const page = await context.newPage();
  let loopId: string | undefined;
  try {
    // The sign-in screen, over HTTPS, with no certificate error.
    await page.goto(URL);
    await expect(page.getByTestId('signin-form')).toBeVisible();
    await page.getByTestId('signin-username').fill(username);
    await page.getByTestId('signin-password').fill(password);
    await page.getByTestId('signin-submit').click();
    await expect(page.getByTestId('topbar-user')).toHaveText(t('signin.signedInAs', { name: username }));

    // One loop on the first registered repo, with the Mock executor: it never starts a real agent.
    const repos = (await (await page.request.get('/api/repos')).json()) as { items: { id: string }[] };
    expect(repos.items.length, 'the console needs one registered repo').toBeGreaterThan(0);
    const created = await page.request.post('/api/loops', {
      data: {
        repoId: repos.items[0]!.id,
        name: LOOP_NAME,
        prompt: 'Job',
        cron: '0 0 1 1 *',
        timeoutSec: 1800,
        executor: { kind: 'mock', config: { durationSec: 600, failRate: 0 } },
      },
    });
    expect(created.status()).toBe(201);
    loopId = ((await created.json()) as { id: string }).id;

    // Start it in the UI. Live updates (SSE) through nginx show Running in 2 seconds.
    await page.goto(`${URL}/loops/${loopId}`);
    await page.getByTestId('loop-start').click();
    await expect(page.getByTestId('loop-header')).toHaveAttribute('data-status', 'running', { timeout: 2_000 });
  } finally {
    // Remove what the test made: stop the loop, then archive it.
    if (loopId) {
      await page.request.post(`/api/loops/${loopId}/stop`).catch(() => undefined);
      await page.request.post(`/api/loops/${loopId}/archive`).catch(() => undefined);
    }
    await context.close();
  }
});
