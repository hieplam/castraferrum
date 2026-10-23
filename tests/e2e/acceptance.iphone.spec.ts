// The acceptance journey (task U27) on an iPhone stand-in: WebKit with Playwright's `iPhone 13` device (project iphone-lan),
// reaching the test server through the machine's LAN IPv4 address, not localhost. The server listens on 127.0.0.1 only (its
// `--host` flag is task L1/L2 of castraferrum#47, not merged), so a TCP relay listening on 0.0.0.0 forwards the LAN port to it:
// every request of the browser and of the API context really travels to the LAN address. A real iPhone stays with
// castraferrum#47 L6.
import { networkInterfaces } from 'node:os';
import { expect, test as base } from '@playwright/test';
import { JOURNEY_STEPS, journey, type Theme } from '../support/acceptance-journey';
import { closeDb } from '../support/form-kit';
import { TcpProxy } from '../support/tcp-proxy';

/** The machine's first non-internal IPv4 address (the LAN address a phone would use). */
function lanAddress(): string {
  for (const list of Object.values(networkInterfaces()))
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) return a.address;
  throw new Error('this machine has no LAN IPv4 address: the iPhone journey needs one');
}

const test = base.extend<object, { lanOrigin: string }>({
  lanOrigin: [
    async ({}, use, workerInfo) => {
      const target = new URL(String(workerInfo.project.use.baseURL));
      const relay = new TcpProxy({ host: target.hostname, port: Number(target.port) });
      const port = await relay.start(0, '0.0.0.0');
      try {
        await use(`http://${lanAddress()}:${port}`);
      } finally {
        await relay.stop();
      }
    },
    { scope: 'worker' },
  ],
  baseURL: async ({ lanOrigin }, use) => use(lanOrigin),
});

test.afterAll(closeDb);

for (const theme of ['light', 'dark'] as const satisfies readonly Theme[]) {
  test.describe(`acceptance on an iPhone 13 over the LAN, ${theme} system theme`, () => {
    test.use({ colorScheme: theme, timezoneId: 'Asia/Ho_Chi_Minh' });

    test(`G9: a normal session works end to end on an iPhone 13 through the LAN address (${theme} first)`, { tag: '@acceptance' }, async ({ page, request, lanOrigin, browserName }) => {
      test.setTimeout(150_000);
      expect(browserName).toBe('webkit');
      expect(new URL(lanOrigin).hostname).not.toMatch(/^(127\.|localhost$)/);
      const steps = await journey(page, request, { label: 'iphone13', theme, phone: true, touch: true, origin: lanOrigin });
      expect(steps).toBe(JOURNEY_STEPS);
    });
  });
}
