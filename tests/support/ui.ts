// The steps of the e2e tests that the new UI does its own way (UI uplift, task U12; spec 7.2 "Equivalences"). Since the
// cut-over (task U25) there is one UI, so every helper holds one way only. Helpers return locators and values, so the
// `expect` stays at the call site.
import type { Locator, Page } from '@playwright/test';

/** `page.goto` for every page of the app, of the test server or of a `ServerProcess` on another port. */
export async function gotoApp(page: Page, url: string): Promise<void> {
  await page.goto(url);
}

/**
 * The paged run history of a loop (`runs-table`, with `runs-pager`, `runs-prev` and `runs-next`): it is the All runs page
 * `/loops/:id/runs` (spec 7.2), so the helper follows the loop page's `all-runs-link`, runs `check` there and goes back. Both moves stay inside the app (no reload), so a test can still check that the
 * page never reloaded.
 */
export async function runHistory(page: Page, check: (table: Locator) => Promise<void>): Promise<void> {
  const loopPage = page.url();
  await page.getByTestId('all-runs-link').click();
  await page.waitForURL(/\/loops\/[^/]+\/runs$/);
  await check(page.getByTestId('runs-table'));
  await page.goBack();
  await page.waitForURL(loopPage);
}

/**
 * The active periods (executions) of the loop page, each with `data-execution-id` (spec 7.2): the current period's group
 * head of Recent runs, then the earlier periods' `period-row` cells; each opens the active period page.
 */
export async function executionRows(page: Page): Promise<Locator> {
  return page.getByTestId('loop-page').locator('[data-execution-id]');
}

/**
 * The element that names the loop of a run page or an active period page (spec 7.2): `run-of` on the run page, the back link
 * `back-to-loop` on the active period page.
 */
export async function loopRowOnList(page: Page): Promise<Locator> {
  return page.getByTestId(new URL(page.url()).pathname.startsWith('/runs/') ? 'run-of' : 'back-to-loop');
}

/**
 * Switches the UI language to the other one. The language is chosen on Settings (spec 7.2) (`settings-lang-en` and
 * `settings-lang-vi`, the chosen one `aria-checked="true"`), so the helper opens Settings through its top-bar link (inside the
 * app, no reload) and picks the option that is not chosen; the page stays on Settings.
 */
export async function switchLanguage(page: Page): Promise<void> {
  if (new URL(page.url()).pathname !== '/settings') await page.getByTestId('nav-settings').click();
  await page.locator('[data-testid^="settings-lang-"][aria-checked="false"]').click();
}

/**
 * The name of the theme the page shows (`light` or `dark`). `toggle-theme` is an icon button, so the theme is read from
 * `html[data-theme]` (spec 7.2).
 */
export async function themeName(page: Page): Promise<string | null> {
  return page.locator('html').getAttribute('data-theme');
}

/**
 * The element that holds the state of the connection lamps (spec 7.2): one `conn` element carries both states, in
 * `data-server` and `data-db` (see `lampAttr`).
 */
export function lampState(page: Page): Locator {
  return page.getByTestId('conn');
}

/** The attribute of `lampState` that holds the lamp's state (`ok`, `wait`, `down`): `data-server` or `data-db`. */
export function lampAttr(lamp: 'server' | 'db'): string {
  return `data-${lamp}`;
}

/**
 * One of the four figures (spec 7.2): an item of the Loops page summary (`summary`), with `data-value`, `data-stale="true"`
 * and `data-alert="true"`.
 */
export function statValue(page: Page, stat: 'active-loops' | 'running-runs' | 'runs-today' | 'errors-24h'): Locator {
  return page.getByTestId('summary').getByTestId(`stat-${stat}`);
}

/** Picks the schedule kind: the Repeat select `sched-kind` takes the kind as its value (spec 7.2). */
export async function pickScheduleKind(page: Page, kind: string): Promise<void> {
  await page.getByTestId('sched-kind').selectOption(kind);
}

/**
 * Registers the folder `path` from the Repos page (spec 7.2): `repo-add` opens the picker (unless it is open already),
 * which holds `repo-path`, `repo-name` and `repo-submit`; the helper waits until the picker has opened its first folder (which
 * writes that folder into `repo-path`) before it types. The picker closes after registering.
 */
export async function registerRepo(page: Page, path: string): Promise<void> {
  if ((await page.getByTestId('folder-picker').count()) === 0) await openFolderPicker(page);
  await page.getByTestId('repo-path').fill(path);
  await page.getByTestId('repo-submit').click();
}

/**
 * Opens the folder picker and waits until it shows its first folder: `repo-add` opens it (spec 7.2), and it is ready once it
 * has opened its first folder, which it writes into `repo-path`.
 */
export async function openFolderPicker(page: Page): Promise<void> {
  await page.getByTestId('repo-add').click();
  await page.locator('[data-testid="folder-list"][data-loading="false"]:not([data-path=""])').waitFor();
}

/** Asks to delete the repo of `row` (spec 7.2): the row's `⋯` menu (`repo-menu`), then its `repo-delete` item. */
export async function deleteRepo(row: Locator): Promise<void> {
  await row.getByTestId('repo-menu').click();
  await row.page().getByRole('menu').getByTestId('repo-delete').click();
}

/**
 * Rows of the loop list read from a loop's page: `check` runs where the list is. The list is only on `/` (spec 7.2), so the
 * helper follows `nav-loops`, runs `check` there and goes back, inside the app.
 */
export async function onLoopList(page: Page, check: () => Promise<void>): Promise<void> {
  const loopPage = page.url();
  await page.getByTestId('nav-loops').click();
  await page.waitForURL((url) => url.pathname === '/');
  await check();
  await page.goBack();
  await page.waitForURL(loopPage);
}
