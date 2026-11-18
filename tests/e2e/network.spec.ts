/// <reference lib="dom" />
// E2E UC-33, the console on the local network (LAN access, task L2; spec G1, G2, D3, D4, D9). A real server process starts with
// `--remote`; a 390 by 844 touch browser opens it at the machine's own IPv4 address (not 127.0.0.1) and runs a loop from the list.
// The server output must list that address and carry the warning. A second server, started without a flag, must refuse the same
// address and keep answering on 127.0.0.1. The tests need a non-internal IPv4 address; without one they FAIL with a message that says so.
import { networkInterfaces } from 'node:os';
import { expect, test } from '@playwright/test';
import { ignoreHostKeys } from '../support/host-keys';
import { ServerProcess } from '../support/server-process';
import { ensureTestRepo } from '../support/test-repo';

const WARNING = 'Warning: anyone on this network can open the console and run agents on this machine.';

/** The first non-internal IPv4 address of this machine. Throws (a red test, never a skip) when there is none. */
function lanAddress(): string {
  for (const list of Object.values(networkInterfaces())) {
    for (const nic of list ?? []) if (nic.family === 'IPv4' && !nic.internal && !nic.address.startsWith('169.254.')) return nic.address;
  }
  throw new Error('This test needs a machine with at least one non-internal IPv4 address (a Wi-Fi or Ethernet interface), and this one has none.');
}

test.describe('local network access', () => {
  test('UC-33: with --remote a phone opens the console at the machine IPv4 address and runs a loop; the log lists the address and warns', { tag: '@UC-33' }, async ({ browser }) => {
    test.setTimeout(90_000);
    const ip = lanAddress();
    const sp = await ServerProcess.launch({ args: ['--remote'] });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    try {
      const created = await sp.api<{ id: string }>('POST', '/api/loops', {
        repoId: await ensureTestRepo((m, u, b) => sp.api(m, u, b)),
        name: 'UC-33 loop',
        prompt: 'run on the local network',
        cron: '*/30 * * * *',
        executor: { kind: 'mock', config: { durationSec: 600, failRate: 0 } },
      });
      expect(created.status).toBe(201);

      const page = await context.newPage();
      await ignoreHostKeys(page);
      await page.goto(`http://${ip}:${sp.port}/`);
      const row = page.getByTestId('loop-row').filter({ hasText: 'UC-33 loop' });
      await expect(row).toBeVisible();
      await row.getByTestId('row-start').tap();
      await expect(row.locator('[data-testid="row-status"][data-status="running"]')).toBeVisible({ timeout: 2_000 });
      await row.getByTestId('row-stop').tap();
      await page.getByTestId('stop-confirm').tap();
      await expect(row.locator('[data-testid="row-status"][data-status="stopped"]')).toBeVisible({ timeout: 5_000 });

      const output = sp.logs.join('');
      expect(output).toContain(`On your network: http://${ip}:${sp.port}`);
      expect(output).toContain(WARNING);
    } finally {
      await context.close();
      await sp.stop();
    }
  });

  test('without --host the console refuses the IPv4 address and still answers on 127.0.0.1', async () => {
    test.setTimeout(60_000);
    const ip = lanAddress();
    const sp = await ServerProcess.launch();
    try {
      const refused = await fetch(`http://${ip}:${sp.port}/api/health`).then(
        () => null,
        (err: Error & { cause?: { code?: string } }) => err.cause?.code,
      );
      expect(refused).toBe('ECONNREFUSED');
      expect((await fetch(`http://127.0.0.1:${sp.port}/api/health`)).status).toBe(200);
      const output = sp.logs.join('');
      expect(output).not.toContain('On your network:');
      expect(output).not.toContain(WARNING);
    } finally {
      await sp.stop();
    }
  });
});
