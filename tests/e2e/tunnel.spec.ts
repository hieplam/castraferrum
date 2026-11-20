/// <reference lib="dom" />
// E2E UC-41, the console through a Cloudflare tunnel (remote-access spec G5, D7 to D10; task R6a). A real `server/main.ts` with
// credentials and `--cloudflare` starts `--cloudflared=tests/support/fake-cloudflared.mjs` as its child. The fake runs a reverse
// proxy on a free port that adds `X-Forwarded-Proto: https` and `CF-Connecting-IP`, as the Cloudflare edge does. The tunnel
// address is `http://localhost:<proxy port>`, because Chromium treats `localhost` as a secure context and keeps the `Secure`
// cookie there. A phone (390x844, touch) opens it, is sent to sign-in, signs in, starts a loop, and sees Running and live log
// lines in 2 seconds. After a graceful shutdown the fake has exited.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { freePort, ServerProcess } from '../support/server-process';
import { ensureTestRepo } from '../support/test-repo';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const FAKE = join(ROOT, 'tests', 'support', 'fake-cloudflared.mjs');
const USER = 'owner';
const PASS = 'password1';
const TOKEN = 'e2e-tunnel-token-0123456789abcdef';
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function tunnelState(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(`${url}/api/health`);
    return ((await res.json()) as { tunnel?: string }).tunnel;
  } catch {
    return undefined;
  }
}

test('@UC-41 through the tunnel: a phone signs in, starts a loop and sees it live; the tunnel stops with the console', async ({ browser }) => {
  test.setTimeout(120_000);
  const dir = mkdtempSync(join(tmpdir(), 'e2e-tunnel-'));
  const report = join(dir, 'fake-cloudflared.json');
  const proxyPort = await freePort();
  const tunnelUrl = `http://localhost:${proxyPort}`;
  const sp = await ServerProcess.launch({
    env: {
      LOOPS_USERNAME: USER,
      LOOPS_PASSWORD: PASS,
      LOOPS_CLOUDFLARE: TOKEN,
      LOOPS_CLOUDFLARED: FAKE,
      FAKE_TUNNEL_PORT: String(proxyPort),
      FAKE_CLOUDFLARED_REPORT: report,
    },
  });
  const context = await browser.newContext(PHONE);
  try {
    await expect.poll(() => tunnelState(sp.baseUrl), { timeout: 15_000 }).toBe('connected');
    const fake = JSON.parse(readFileSync(report, 'utf8')) as { pid: number; argv: string[]; token: string };
    expect(fake.token).toBe(TOKEN);
    expect(fake.argv.join(' ')).not.toContain(TOKEN);
    expect(sp.logs.join('')).not.toContain(TOKEN);
    expect(sp.logs.join('')).toContain('Tunnel: connected');

    // Health through the tunnel.
    const health = await fetch(`${tunnelUrl}/api/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ ok: true, db: 'up', tunnel: 'connected' });

    // The phone is sent to sign-in and signs in. The fake sends X-Forwarded-Proto: https, so the cookie has Secure.
    const page = await context.newPage();
    await page.goto(`${tunnelUrl}/`);
    await expect(page.getByTestId('signin-form')).toBeVisible();
    await page.getByTestId('signin-username').fill(USER);
    await page.getByTestId('signin-password').fill(PASS);
    const answer = page.waitForResponse((r) => r.url().endsWith('/api/auth/login'));
    await page.getByTestId('signin-submit').tap();
    const response = await answer;
    expect(response.status()).toBe(204);
    expect((await response.allHeaders())['set-cookie']).toMatch(/^castra_session=[A-Za-z0-9_-]{43};.*; Secure$/);
    expect((await context.cookies(tunnelUrl)).map((c) => [c.name, c.secure])).toEqual([['castra_session', true]]);

    // The phone starts a loop from the list and sees Running in 2 seconds over SSE through the tunnel.
    const repoId = await ensureTestRepo(async (method, url, body) => {
      const r = await page.request.fetch(tunnelUrl + url, { method, ...(body === undefined ? {} : { data: body }) });
      return { status: r.status(), body: await r.json() };
    });
    const created = await page.request.post(`${tunnelUrl}/api/loops`, {
      data: { repoId, timeoutSec: 1800, name: 'Through the tunnel', prompt: 'Job', cron: '*/30 * * * *', executor: { kind: 'mock', config: { durationSec: 600, failRate: 0 } } },
    });
    expect(created.status()).toBe(201);
    const loopId = ((await created.json()) as { id: string }).id;
    await page.goto(`${tunnelUrl}/`);
    const row = page.getByTestId('loop-row').filter({ hasText: 'Through the tunnel' });
    await expect(row).toBeVisible();
    await row.getByTestId('row-start').tap();
    await expect(row.locator('[data-testid="row-status"][data-status="running"]')).toBeVisible({ timeout: 2_000 });

    // A live log line arrives on the loop page in 2 seconds (the mock writes one line each second).
    await page.goto(`${tunnelUrl}/loops/${loopId}`);
    const lines = page.getByTestId('live-log').locator('[data-seq]');
    await expect(lines.first()).toBeVisible();
    const before = await lines.count();
    await expect.poll(() => lines.count(), { timeout: 2_000 }).toBeGreaterThan(before);

    // A graceful shutdown stops the tunnel: the fake's process has exited, and the tunnel address answers no more.
    expect(alive(fake.pid)).toBe(true);
    await context.close();
    await sp.shutdown();
    expect(sp.exitCode).toBe(0);
    expect(alive(fake.pid)).toBe(false);
    await expect(fetch(`${tunnelUrl}/api/health`)).rejects.toThrow();
  } finally {
    await context.close().catch(() => undefined);
    await sp.shutdown().catch(() => undefined);
    await sp.stop();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('@UC-41 a tunnel without credentials: startup exits 2 with the D8 message', () => {
  const res = spawnSync(process.execPath, ['--import', 'tsx', 'server/main.ts', `--cloudflare=${TOKEN}`, `--cloudflared=${FAKE}`], {
    cwd: ROOT,
    env: { ...process.env, LOOPS_USERNAME: '', LOOPS_PASSWORD: '', LOOPS_CLOUDFLARE: '', LOOPS_TEST_MODE: '1' },
    encoding: 'utf8',
    timeout: 60_000,
  });
  expect(res.status).toBe(2);
  expect(res.stderr).toContain('a tunnel needs --username and --password');
  expect(res.stderr + res.stdout).not.toContain(TOKEN);
});

test('@UC-41 a wrong token: the console stays up, reports the tunnel down and prints the error of cloudflared', async () => {
  test.setTimeout(60_000);
  const sp = await ServerProcess.launch({
    env: { LOOPS_USERNAME: USER, LOOPS_PASSWORD: PASS, LOOPS_CLOUDFLARE: 'bad', LOOPS_CLOUDFLARED: FAKE },
  });
  try {
    await expect.poll(() => tunnelState(sp.baseUrl), { timeout: 15_000 }).toBe('down');
    await expect.poll(() => sp.logs.join(''), { timeout: 15_000 }).toMatch(/\[cloudflared\] .*Unauthorized: Invalid tunnel secret/);
    expect(sp.logs.join('')).toContain('Tunnel: down');
    const health = await fetch(`${sp.baseUrl}/api/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ ok: true, db: 'up', tunnel: 'down' });
  } finally {
    await sp.shutdown().catch(() => undefined);
    await sp.stop();
  }
});
