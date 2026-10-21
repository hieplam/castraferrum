/// <reference lib="dom" />
// E2E app shell: UC-17 lost connection to the server, UC-18 language + light/dark, DB down (D-UI4).
// All real: browser -> build -> Fastify -> Postgres. UC-17 and DB down use a dedicated server process
// (tests/support/server-process.ts) to kill / restart the server and cut Postgres mid-test.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { en } from '../../shared/i18n/en';
import { vi } from '../../shared/i18n/vi';
import { liveDbUrl, ServerProcess } from '../support/server-process';
import { ensureTestRepo } from '../support/test-repo';
import { t } from '../support/ui-text';

const TOKENS = readFileSync(fileURLToPath(new URL('../../design/tokens.css', import.meta.url)), 'utf8');
/** The `--bg` value of a token set in design/tokens.css (the default light block / the `[data-theme="dark"]` block). */
function tokenBg(theme: 'light' | 'dark'): string {
  const block = theme === 'light' ? TOKENS.split(':root[data-theme="dark"]')[0] : TOKENS.split(':root[data-theme="dark"]')[1];
  const hex = /--bg:\s*(#[0-9a-f]{6})/i.exec(block ?? '')?.[1];
  if (!hex) throw new Error(`tokens.css has no --bg for the ${theme} set`);
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}
const bodyBg = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

/** The visible text of the page, without the data parts (`[data-raw]` - loop names, executor logs: not translated, D-UI8). */
const visibleUiText = (page: Page) =>
  page.evaluate(() => {
    const clone = document.body.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('[data-raw], script, style').forEach((el) => el.remove());
    document.body.appendChild(clone);
    clone.style.position = 'absolute';
    const text = clone.innerText;
    clone.remove();
    return text;
  });
/** Vietnamese letters with diacritics: the English UI must not contain any. */
const hasVietnamese = (text: string): boolean =>
  /\p{M}/u.test(text.normalize('NFD')) || text.includes(String.fromCharCode(0x111)) || text.includes(String.fromCharCode(0x110));
const UUID = '0e5b7d21-4c9a-4f3e-b812-6a0d9f3c7e45';
const SCREENS = ['/', '/loops/new', `/loops/${UUID}`, `/loops/${UUID}/edit`, `/executions/${UUID}`, `/runs/${UUID}`];

test.describe('app shell', () => {
  test('UC-17: server dies -> banner "Lost connection, retrying", server lamp red; server back -> reconnects by itself + refreshes data, no F5', { tag: '@UC-17' }, async ({ page }) => {
    test.setTimeout(90_000);
    const sp = await ServerProcess.launch();
    const db = new pg.Pool({ connectionString: liveDbUrl(), max: 1 });
    try {
      const created = await sp.api<{ id: string }>('POST', '/api/loops', {
        repoId: await ensureTestRepo((m, u, b) => sp.api(m, u, b)),
        name: 'UC-17 loop',
        prompt: 'keep a long run going',
        cron: '*/30 * * * *',
        executor: { kind: 'mock', config: { durationSec: 600, failRate: 0 } },
      });
      expect(created.status).toBe(201);
      const id = created.body.id;

      await page.goto(`${sp.baseUrl}/`);
      await expect(page.getByTestId('lamp-server')).toHaveAttribute('data-state', 'ok');
      await expect(page.getByTestId('lamp-db')).toHaveAttribute('data-state', 'ok');
      await expect(page.getByTestId('stat-active-loops')).toHaveText(t('top.stats.activeLoops', { n: 0 }));
      await page.evaluate(() => ((window as unknown as { __noReload: boolean }).__noReload = true));

      // Live: Start through the API (another tab) -> SSE event -> the figures change, no F5.
      expect((await sp.api('POST', `/api/loops/${id}/start`)).status).toBe(200);
      await expect(page.getByTestId('stat-active-loops')).toHaveText(t('top.stats.activeLoops', { n: 1 }), { timeout: 2_000 });
      await expect(page.getByTestId('stat-running-runs')).toHaveText(t('top.stats.runningRuns', { n: 1 }), { timeout: 2_000 });

      // The server dies.
      await sp.kill();
      const banner = page.getByTestId('banner-disconnected');
      await expect(banner).toBeVisible({ timeout: 3_000 });
      await expect(banner).toContainText(t('banner.disconnected'));
      await expect(banner).toContainText(/attempt \d+ · retry in \d+ s · figures frozen at \d\d:\d\d:\d\d/);
      await expect(page.getByTestId('lamp-server')).toHaveAttribute('data-state', 'down');
      await expect(page.getByTestId('lamp-db')).toHaveAttribute('data-state', 'wait');
      await expect(page.getByTestId('topstats')).toHaveClass(/is-stale/);
      await expect(page.getByTestId('stat-active-loops')).toHaveText(t('top.stats.activeLoops', { n: 1 })); // figures frozen
      await expect(banner).toContainText(/attempt [2-9]/, { timeout: 8_000 }); // still retrying

      // Server back: recovery stopped the loop (UC-15) without emitting any event -> only right if the UI reloads by itself.
      await sp.start();
      const row = await db.query<{ status: string }>('SELECT status FROM loops WHERE id = $1', [id]);
      expect(row.rows[0]?.status).toBe('stopped');
      await expect(page.getByTestId('banner-reconnected')).toBeVisible({ timeout: 12_000 });
      await expect(page.getByTestId('banner-reconnected')).toHaveText(t('banner.reconnected'));
      await expect(banner).toHaveCount(0);
      await expect(page.getByTestId('lamp-server')).toHaveAttribute('data-state', 'ok');
      await expect(page.getByTestId('stat-active-loops')).toHaveText(t('top.stats.activeLoops', { n: 0 }), { timeout: 2_000 });
      await expect(page.getByTestId('stat-running-runs')).toHaveText(t('top.stats.runningRuns', { n: 0 }));
      await expect(page.getByTestId('topstats')).not.toHaveClass(/is-stale/);
      expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);
      await expect(page.getByTestId('banner-reconnected')).toHaveCount(0, { timeout: 8_000 }); // the banner turns itself off
    } finally {
      await db.end();
      await sp.stop();
    }
  });

  test('DB down while the server is alive -> red banner + db lamp red (D-UI4); DB back -> banner gone', { tag: '@shell' }, async ({ page }) => {
    test.setTimeout(60_000);
    const sp = await ServerProcess.launch();
    try {
      await page.goto(`${sp.baseUrl}/`);
      await expect(page.getByTestId('lamp-db')).toHaveAttribute('data-state', 'ok');
      await sp.cutDb();
      const banner = page.getByTestId('banner-db-down');
      await expect(banner).toBeVisible({ timeout: 12_000 });
      await expect(banner).toContainText('Database not responding — the server is up');
      await expect(banner).toContainText(/since \d\d:\d\d:\d\d · retrying/);
      await expect(page.getByTestId('lamp-db')).toHaveAttribute('data-state', 'down');
      await expect(page.getByTestId('lamp-server')).toHaveAttribute('data-state', 'ok');
      await sp.restoreDb();
      await expect(banner).toHaveCount(0, { timeout: 12_000 });
      await expect(page.getByTestId('lamp-db')).toHaveAttribute('data-state', 'ok');
    } finally {
      await sp.stop();
    }
  });

  test('UC-18: English by default on every screen, the toggle switches every text to Vietnamese and back, and it survives a reload', { tag: '@UC-18' }, async ({ page }) => {
    // A clean context (no stored preference) shows English with lang="en" on every screen.
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByTestId('nav-loops')).toHaveText(en['nav.loops']);
    await expect(page.getByTestId('toggle-lang')).toHaveText('EN / VI');
    await expect(page.getByTestId('toggle-lang').locator('b')).toHaveText('EN');
    for (const path of SCREENS) {
      await page.goto(path);
      await expect(page.getByTestId('lamp-server')).toHaveAttribute('data-state', 'ok');
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      const text = await visibleUiText(page);
      expect(hasVietnamese(text), `${path} still shows Vietnamese letters:\n${text}`).toBe(false);
      expect(text, `${path} has an unfilled parameter`).not.toMatch(/\{\w+\}/);
    }

    // The toggle switches to the strings of vi.ts and lang="vi".
    await page.goto('/');
    await page.getByTestId('toggle-lang').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
    await expect(page.getByTestId('nav-loops')).toHaveText(vi['nav.loops']);
    await expect(page.getByTestId('toggle-lang').locator('b')).toHaveText('VI');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
    await expect(page.getByTestId('nav-loops')).toHaveText(vi['nav.loops']);

    await page.getByTestId('toggle-lang').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('UC-18: light / dark follows the system by default, a manual choice applies the matching tokens and survives a reload', { tag: '@UC-18' }, async ({ browser }) => {
    const dark = await browser.newContext({ colorScheme: 'dark' });
    const page = await dark.newPage();
    try {
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      expect(await bodyBg(page)).toBe(tokenBg('dark'));
      await expect(page.getByTestId('toggle-theme').locator('b')).toHaveText(en['top.theme.dark']);

      await page.getByTestId('toggle-theme').click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      expect(await bodyBg(page)).toBe(tokenBg('light'));
      await expect(page.getByTestId('toggle-theme').locator('b')).toHaveText(en['top.theme.light']);

      await page.reload(); // the system is still dark, the manual choice wins
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      expect(await bodyBg(page)).toBe(tokenBg('light'));
    } finally {
      await dark.close();
    }

    const light = await browser.newContext({ colorScheme: 'light' });
    const page2 = await light.newPage();
    try {
      await page2.goto('/');
      await expect(page2.locator('html')).toHaveAttribute('data-theme', 'light');
      expect(await bodyBg(page2)).toBe(tokenBg('light'));
      await page2.getByTestId('toggle-theme').press('Enter'); // the keyboard works too
      await expect(page2.locator('html')).toHaveAttribute('data-theme', 'dark');
      expect(await bodyBg(page2)).toBe(tokenBg('dark'));
    } finally {
      await light.close();
    }
  });
});
