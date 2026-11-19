/// <reference lib="dom" />
// E2E UC-42, the console behind a reverse proxy (local-name spec G5, D4, D8; task N1). A real `server/main.ts` listens on
// 127.0.0.1 with credentials. `tests/support/fake-reverse-proxy.mjs` stands in front of it the way nginx does: it adds
// `X-Forwarded-Proto: https` and sets `X-Real-IP` from the request header `x-test-client`. Device A fails to sign in 5 times and
// gets 429 on the sixth. Device B (another address) then signs in with a `Secure` cookie, starts a loop, and sees it Running in
// 2 seconds over SSE, which the proxy must not buffer. Fake device addresses come from the documentation range 192.0.2.0/24.
import { expect, test } from '@playwright/test';
import { startFakeReverseProxy } from '../support/fake-reverse-proxy.mjs';
import { ServerProcess } from '../support/server-process';
import { ensureTestRepo } from '../support/test-repo';

const USER = 'owner';
const PASS = 'password1';
const DEVICE_A = '192.0.2.10';
const DEVICE_B = '192.0.2.11';

test('@UC-42 behind a reverse proxy: a Secure cookie, live updates, and a sign-in count for each device', async ({ browser }) => {
  test.setTimeout(120_000);
  const sp = await ServerProcess.launch({ env: { LOOPS_USERNAME: USER, LOOPS_PASSWORD: PASS } });
  const proxy = await startFakeReverseProxy({ targetPort: sp.port });
  const proxyUrl = `http://127.0.0.1:${proxy.port}`;
  const context = await browser.newContext({ extraHTTPHeaders: { 'x-test-client': DEVICE_B } });
  try {
    // Device A: five wrong passwords, then 429.
    const login = (device: string, password: string) =>
      fetch(`${proxyUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-test-client': device },
        body: JSON.stringify({ username: USER, password }),
      });
    for (let i = 0; i < 5; i++) expect((await login(DEVICE_A, `wrong-pass-${i}`)).status).toBe(401);
    expect((await login(DEVICE_A, PASS)).status).toBe(429);

    // Device B signs in in the browser. The proxy sends X-Forwarded-Proto: https, so the cookie has Secure.
    const page = await context.newPage();
    await page.goto(`${proxyUrl}/`);
    await expect(page.getByTestId('signin-form')).toBeVisible();
    await page.getByTestId('signin-username').fill(USER);
    await page.getByTestId('signin-password').fill(PASS);
    const answer = page.waitForResponse((r) => r.url().endsWith('/api/auth/login'));
    await page.getByTestId('signin-submit').click();
    const response = await answer;
    expect(response.status()).toBe(204);
    expect((await response.allHeaders())['set-cookie']).toMatch(/^castra_session=[A-Za-z0-9_-]{43};.*; Secure$/);

    // Device B starts a loop and sees Running within 2 seconds.
    const repoId = await ensureTestRepo(async (method, url, body) => {
      const r = await page.request.fetch(proxyUrl + url, { method, ...(body === undefined ? {} : { data: body }) });
      return { status: r.status(), body: await r.json() };
    });
    const created = await page.request.post(`${proxyUrl}/api/loops`, {
      data: { repoId, timeoutSec: 1800, name: 'Behind a proxy', prompt: 'Job', cron: '*/30 * * * *', executor: { kind: 'mock', config: { durationSec: 600, failRate: 0 } } },
    });
    expect(created.status()).toBe(201);
    await page.goto(`${proxyUrl}/`);
    const row = page.getByTestId('loop-row').filter({ hasText: 'Behind a proxy' });
    await expect(row).toBeVisible();
    await row.getByTestId('row-start').click();
    await expect(row.locator('[data-testid="row-status"][data-status="running"]')).toBeVisible({ timeout: 2_000 });
  } finally {
    await context.close();
    await proxy.stop();
    await sp.stop();
  }
});
