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
import { gotoApp, isNewUi, lampAttr, lampState, projectUi, statValue, switchLanguage, themeName } from '../support/ui';

/** The tokens of the project's UI: design/tokens.css (classic) or design/ds/tokens.css (new UI, spec 7.2). */
const tokens = () => readFileSync(fileURLToPath(new URL(projectUi() === 'new' ? '../../design/ds/tokens.css' : '../../design/tokens.css', import.meta.url)), 'utf8');
/** The `--bg` value of a token set in the project's tokens.css (the default light block / the `[data-theme="dark"]` block). */
function tokenBg(theme: 'light' | 'dark'): string {
  const TOKENS = tokens();
  const block = theme === 'light' ? TOKENS.split(':root[data-theme="dark"]')[0] : TOKENS.split(':root[data-theme="dark"]')[1];
  const hex = /--bg:\s*(#[0-9a-f]{6})/i.exec(block ?? '')?.[1];
  if (!hex) throw new Error(`tokens.css has no --bg for the ${theme} set`);
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}
const STATS = ['active-loops', 'running-runs', 'runs-today', 'errors-24h'] as const;
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
/** The pages only the new UI has (spec 5.3 and 5.8). */
const NEW_SCREENS = ['/settings', `/loops/${UUID}/runs`, `/loops/${UUID}/settings`];
/** An English message as a pattern: each `{param}` matches a number. */
const pattern = (key: Parameters<typeof t>[0]): RegExp => new RegExp(en[key].replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{\w+\}/g, '\\d+'));
/** The top-bar link to the Loops page: the new UI writes the loop count after the label. */
const navLoopsText = (newUi: boolean, label: string): string | RegExp => (newUi ? new RegExp(`^${label}\\d*$`) : label);

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

      await gotoApp(page, `${sp.baseUrl}/`);
      const newUi = await isNewUi(page);
      // The new summary items carry the number in `data-value` (spec 7.2); the classic top bar writes it in a sentence.
      const figure = (stat: 'active-loops' | 'running-runs', key: Parameters<typeof t>[0], n: number, timeout?: number) =>
        newUi
          ? expect(statValue(page, stat)).toHaveAttribute('data-value', String(n), { timeout })
          : expect(statValue(page, stat)).toHaveText(t(key, { n }), { timeout });
      await expect(lampState(page, 'server')).toHaveAttribute(lampAttr('server'), 'ok');
      await expect(lampState(page, 'db')).toHaveAttribute(lampAttr('db'), 'ok');
      await figure('active-loops', 'top.stats.activeLoops', 0);
      await page.evaluate(() => ((window as unknown as { __noReload: boolean }).__noReload = true));

      // Live: Start through the API (another tab) -> SSE event -> the figures change, no F5.
      expect((await sp.api('POST', `/api/loops/${id}/start`)).status).toBe(200);
      await figure('active-loops', 'top.stats.activeLoops', 1, 2_000);
      await figure('running-runs', 'top.stats.runningRuns', 1, 2_000);

      // The server dies.
      await sp.kill();
      const banner = page.getByTestId('banner-disconnected');
      await expect(banner).toBeVisible({ timeout: 3_000 });
      if (newUi) {
        // The new sentences (Appendix B): `banner.lost`, then `banner.lostRetry` with the attempt and the seconds to the next one.
        await expect(banner).toContainText(t('banner.lost'));
        await expect(banner).toContainText(pattern('banner.lostRetry'));
      } else {
        await expect(banner).toContainText(t('banner.disconnected'));
        await expect(banner).toContainText(/attempt \d+ · retry in \d+ s · figures frozen at \d\d:\d\d:\d\d/);
      }
      await expect(lampState(page, 'server')).toHaveAttribute(lampAttr('server'), 'down');
      await expect(lampState(page, 'db')).toHaveAttribute(lampAttr('db'), 'wait');
      // Frozen figures: every new summary item carries `data-stale`; the classic top bar marks itself.
      if (newUi) for (const stat of STATS) await expect(statValue(page, stat)).toHaveAttribute('data-stale', 'true');
      else await expect(page.getByTestId('topstats')).toHaveAttribute('data-stale', 'true');
      await figure('active-loops', 'top.stats.activeLoops', 1); // figures frozen
      await expect(banner).toContainText(newUi ? /Attempt [2-9]/ : /attempt [2-9]/, { timeout: 8_000 }); // still retrying

      // Server back: recovery stopped the loop (UC-15) without emitting any event -> only right if the UI reloads by itself.
      await sp.start();
      const row = await db.query<{ status: string }>('SELECT status FROM loops WHERE id = $1', [id]);
      expect(row.rows[0]?.status).toBe('stopped');
      await expect(page.getByTestId('banner-reconnected')).toBeVisible({ timeout: 12_000 });
      await expect(page.getByTestId('banner-reconnected')).toHaveText(t(newUi ? 'banner.back' : 'banner.reconnected'));
      await expect(banner).toHaveCount(0);
      await expect(lampState(page, 'server')).toHaveAttribute(lampAttr('server'), 'ok');
      await figure('active-loops', 'top.stats.activeLoops', 0, 2_000);
      await figure('running-runs', 'top.stats.runningRuns', 0);
      if (newUi) for (const stat of STATS) await expect(statValue(page, stat)).not.toHaveAttribute('data-stale', 'true');
      else await expect(page.getByTestId('topstats')).not.toHaveAttribute('data-stale', 'true');
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
      await gotoApp(page, `${sp.baseUrl}/`);
      const newUi = await isNewUi(page);
      await expect(lampState(page, 'db')).toHaveAttribute(lampAttr('db'), 'ok');
      await sp.cutDb();
      const banner = page.getByTestId('banner-db-down');
      await expect(banner).toBeVisible({ timeout: 12_000 });
      if (newUi) {
        await expect(banner).toHaveText(t('banner.db')); // the new sentence (Appendix B)
        await expect(page.getByTestId('conn')).toHaveText(t('conn.dbDown'));
      } else {
        await expect(banner).toContainText('Database not responding — the server is up');
        await expect(banner).toContainText(/since \d\d:\d\d:\d\d · retrying/);
      }
      await expect(lampState(page, 'db')).toHaveAttribute(lampAttr('db'), 'down');
      await expect(lampState(page, 'server')).toHaveAttribute(lampAttr('server'), 'ok');
      await sp.restoreDb();
      await expect(banner).toHaveCount(0, { timeout: 12_000 });
      await expect(lampState(page, 'db')).toHaveAttribute(lampAttr('db'), 'ok');
    } finally {
      await sp.stop();
    }
  });

  test('UC-18: English by default on every screen, the toggle switches every text to Vietnamese and back, and it survives a reload', { tag: '@UC-18' }, async ({ page }) => {
    // A clean context (no stored preference) shows English with lang="en" on every screen.
    await gotoApp(page, '/');
    const newUi = await isNewUi(page);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByTestId('nav-loops')).toHaveText(navLoopsText(newUi, en['nav.loops']));
    if (newUi) {
      // The language is chosen on Settings (spec 7.2): English is the chosen option.
      await gotoApp(page, '/settings');
      await expect(page.getByTestId('settings-lang-en')).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByTestId('settings-lang-vi')).toHaveAttribute('aria-checked', 'false');
    } else {
      await expect(page.getByTestId('toggle-lang')).toHaveText('EN / VI');
      await expect(page.getByTestId('toggle-lang').locator('b')).toHaveText('EN');
    }
    // The new UI's own pages are checked too; the Vietnamese option's label on Settings carries `data-raw`, so it is skipped.
    for (const path of newUi ? [...SCREENS, ...NEW_SCREENS] : SCREENS) {
      await gotoApp(page, path);
      await expect(lampState(page, 'server')).toHaveAttribute(lampAttr('server'), 'ok');
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      const text = await visibleUiText(page);
      expect(hasVietnamese(text), `${path} still shows Vietnamese letters:\n${text}`).toBe(false);
      expect(text, `${path} has an unfilled parameter`).not.toMatch(/\{\w+\}/);
    }

    // The toggle switches to the strings of vi.ts and lang="vi".
    await gotoApp(page, '/');
    await switchLanguage(page);
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
    await expect(page.getByTestId('nav-loops')).toHaveText(navLoopsText(newUi, vi['nav.loops']));
    if (newUi) await expect(page.getByTestId('settings-lang-vi')).toHaveAttribute('aria-checked', 'true');
    else await expect(page.getByTestId('toggle-lang').locator('b')).toHaveText('VI');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
    await expect(page.getByTestId('nav-loops')).toHaveText(navLoopsText(newUi, vi['nav.loops']));

    await switchLanguage(page);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('UC-18: light / dark follows the system by default, a manual choice applies the matching tokens and survives a reload', { tag: '@UC-18' }, async ({ browser }) => {
    const dark = await browser.newContext({ colorScheme: 'dark' });
    const page = await dark.newPage();
    try {
      await gotoApp(page, '/');
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      expect(await bodyBg(page)).toBe(tokenBg('dark'));
      // The new UI names the theme in `html[data-theme]` (spec 7.2); the classic toggle writes it in bold.
      const newUi = await isNewUi(page);
      await expect.poll(() => themeName(page)).toBe(newUi ? 'dark' : en['top.theme.dark']);

      await page.getByTestId('toggle-theme').click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      expect(await bodyBg(page)).toBe(tokenBg('light'));
      await expect.poll(() => themeName(page)).toBe(newUi ? 'light' : en['top.theme.light']);

      await page.reload(); // the system is still dark, the manual choice wins
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      expect(await bodyBg(page)).toBe(tokenBg('light'));
    } finally {
      await dark.close();
    }

    const light = await browser.newContext({ colorScheme: 'light' });
    const page2 = await light.newPage();
    try {
      await gotoApp(page2, '/');
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
