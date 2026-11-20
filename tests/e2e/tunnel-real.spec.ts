// E2E on the real machine through the Cloudflare tunnel (phase 2 spec G6). It runs only with LC_REAL_TUNNEL=1,
// because it needs the machine setup of task R6d (the tunnel, the console name, the real console). Otherwise it is skipped.
//
// A phone context (390x844, touch) opens LOOPS_PUBLIC_URL (sample: castra.example.com) with the trusted roots of Chromium:
// certificate errors are not ignored. It signs in with LOOPS_USERNAME and LOOPS_PASSWORD, starts the loop "tunnel acceptance",
// sees Running in 2 seconds and a live log line, then stops and archives that loop (the console has no other way to remove one).
// When .env holds CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET, the test sends them as Cloudflare Access headers.
import { expect, test } from '@playwright/test';
import { t } from '../support/ui-text';

const URL = (process.env.LOOPS_PUBLIC_URL ?? 'https://castra.example.com').replace(/\/+$/, '');
const LOOP_NAME = 'tunnel acceptance';

test('through the tunnel a phone opens the console, signs in, and a started loop shows Running in 2 seconds and a live log line', async ({ browser }, testInfo) => {
  test.skip(process.env.LC_REAL_TUNNEL !== '1', 'needs the machine setup of the tunnel (task R6d); run with LC_REAL_TUNNEL=1');
  test.setTimeout(90_000);
  const username = process.env.LOOPS_USERNAME;
  const password = process.env.LOOPS_PASSWORD;
  if (!username || !password) throw new Error('LOOPS_USERNAME and LOOPS_PASSWORD must be set');
  const access = process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET ? { 'CF-Access-Client-Id': process.env.CF_ACCESS_CLIENT_ID, 'CF-Access-Client-Secret': process.env.CF_ACCESS_CLIENT_SECRET } : undefined;

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, ignoreHTTPSErrors: false, baseURL: URL, extraHTTPHeaders: access });
  const page = await context.newPage();
  let loopId: string | undefined;
  try {
    await page.goto(URL);
    await expect(page.getByTestId('signin-form')).toBeVisible();
    await page.getByTestId('signin-username').fill(username);
    await page.getByTestId('signin-password').fill(password);
    await page.getByTestId('signin-submit').click();
    await expect(page.getByTestId('topbar-user')).toHaveText(t('signin.signedInAs', { name: username }));
    await page.screenshot({ path: testInfo.outputPath('signed-in.png') });

    const repos = (await (await page.request.get('/api/repos')).json()) as { items: { id: string }[] };
    expect(repos.items.length, 'the console needs one registered repo').toBeGreaterThan(0);
    const created = await page.request.post('/api/loops', {
      data: {
        repoId: repos.items[0]!.id,
        name: LOOP_NAME,
        prompt: 'Reply with the single word ok. Use no tool and change no file.',
        timezone: 'UTC',
        cron: '0 0 1 1 *',
        timeoutSec: 1800,
        executor: { kind: 'claude', config: { model: 'haiku', effort: 'low' } },
      },
    });
    expect(created.status()).toBe(201);
    loopId = ((await created.json()) as { id: string }).id;

    await page.goto(`${URL}/loops/${loopId}`);
    await page.getByTestId('loop-start').tap();
    await expect(page.getByTestId('loop-header')).toHaveAttribute('data-status', 'running', { timeout: 2_000 });
    await expect(page.getByTestId('live-log').locator('[data-seq]').first()).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: testInfo.outputPath('running.png') });
  } finally {
    if (loopId) {
      await page.request.post(`/api/loops/${loopId}/stop`).catch(() => undefined);
      await page.request.post(`/api/loops/${loopId}/archive`).catch(() => undefined);
    }
    await context.close();
  }
});
