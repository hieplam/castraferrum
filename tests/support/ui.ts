// The steps of the e2e tests that differ between the classic UI and the new UI (UI uplift, task U12; spec 7.2 "Equivalences").
// Each helper holds today's classic code for its step; the new-UI branch (`isNewUi`) is added at the cut-over, and the comment on
// each helper names it. Helpers return locators and values, so the `expect` stays at the call site. This file is exempt from the
// selector scan (tests/tools/e2e-selectors.test.ts): the classic selectors live here until they are removed (task U25).
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';

export type Ui = 'classic' | 'new';
/** The Playwright projects that run the new UI (task U13): their pages carry `castraferrum.ui=new`. */
const NEW_UI_PROJECTS = ['chromium-new', 'webkit-phone'];

/** The UI a project runs: `new` for `chromium-new` and `webkit-phone`, `classic` otherwise. */
export function projectUi(testInfo: TestInfo = test.info()): Ui {
  return NEW_UI_PROJECTS.includes(testInfo.project.name) ? 'new' : 'classic';
}

/**
 * `page.goto` for every page of the app. The project's stored choice only covers its own `baseURL` origin, so in a new-UI
 * project a URL of another origin (a `ServerProcess`) gets `ui=new`, which the app stores for that origin.
 */
export async function gotoApp(page: Page, url: string): Promise<void> {
  const info = test.info();
  const base = info.project.use.baseURL;
  const target = new URL(url, base);
  if (projectUi(info) === 'new' && (!base || target.origin !== new URL(base).origin)) {
    target.searchParams.set('ui', 'new');
    await page.goto(target.toString());
    return;
  }
  await page.goto(url);
}

/** True when the page runs the new UI. It first asserts that `html[data-ui]` is the UI of the project, so a page never runs the wrong UI unnoticed. */
export async function isNewUi(page: Page): Promise<boolean> {
  const ui = projectUi();
  await expect(page.locator('html')).toHaveAttribute('data-ui', ui);
  return ui === 'new';
}

/** New UI (spec 7.2): row actions are visible at rest (D9), so there is nothing to reveal; the classic UI shows them on hover. */
export async function revealRowActions(row: Locator): Promise<void> {
  if (await isNewUi(row.page())) return;
  await row.hover();
}

/**
 * The paged run history of the loop page: `check` runs against its list (`runs-table`, with `runs-pager`, `runs-prev` and
 * `runs-next` on the same page). New UI (spec 7.2): it is the All runs page `/loops/:id/runs`, so the helper follows the loop page's
 * `all-runs-link`, runs `check` there and goes back. Both moves stay inside the app (no reload), so a test can still check that the
 * page never reloaded.
 */
export async function runHistory(page: Page, check: (table: Locator) => Promise<void>): Promise<void> {
  const table = page.getByTestId('runs-table');
  if (await isNewUi(page)) {
    const loopPage = page.url();
    await page.getByTestId('all-runs-link').click();
    await page.waitForURL(/\/loops\/[^/]+\/runs$/);
    await check(table);
    await page.goBack();
    await page.waitForURL(loopPage);
    return;
  }
  await check(table);
}

/**
 * The active periods (executions) of the loop page, each with `data-execution-id`. New UI (spec 7.2): the current period's group
 * head of Recent runs, then the earlier periods' `period-row` cells; each opens the active period page.
 */
export async function executionRows(page: Page): Promise<Locator> {
  if (await isNewUi(page)) return page.getByTestId('loop-page').locator('[data-execution-id]');
  return page.getByTestId('exec-row');
}

/**
 * The element that names the loop of a run page or an active period page. Classic: the selected row of the list pane. New UI
 * (spec 7.2): the page itself names its loop: `run-of` on the run page, the back link `back-to-loop` on the active period page.
 */
export async function loopRowOnList(page: Page): Promise<Locator> {
  if (await isNewUi(page)) return page.getByTestId(new URL(page.url()).pathname.startsWith('/runs/') ? 'run-of' : 'back-to-loop');
  return page.locator('[data-testid="loop-row"].is-sel');
}

/**
 * Switches the UI language to the other one. New UI (spec 7.2): the language is chosen on Settings (`settings-lang-en` and
 * `settings-lang-vi`, the chosen one `aria-checked="true"`), so the helper opens Settings through its top-bar link (inside the
 * app, no reload) and picks the option that is not chosen; the page stays on Settings. Classic: the `toggle-lang` button.
 */
export async function switchLanguage(page: Page): Promise<void> {
  if (await isNewUi(page)) {
    if (new URL(page.url()).pathname !== '/settings') await page.getByTestId('nav-settings').click();
    await page.locator('[data-testid^="settings-lang-"][aria-checked="false"]').click();
    return;
  }
  await page.getByTestId('toggle-lang').click();
}

/**
 * The name of the theme the page shows (`light` or `dark`). New UI (spec 7.2): `toggle-theme` is an icon button, so the theme is
 * read from `html[data-theme]`. Classic: the bold word of the `toggle-theme` text (`light / dark`).
 */
export async function themeName(page: Page): Promise<string | null> {
  if (await isNewUi(page)) return page.locator('html').getAttribute('data-theme');
  return page.getByTestId('toggle-theme').locator('b').textContent();
}

/**
 * The element that holds the state of a connection lamp. New UI (spec 7.2): one `conn` element carries both states, in
 * `data-server` and `data-db` (see `lampAttr`). Classic: `lamp-server` and `lamp-db`, each with `data-state`.
 */
export function lampState(page: Page, lamp: 'server' | 'db'): Locator {
  return projectUi() === 'new' ? page.getByTestId('conn') : page.getByTestId(`lamp-${lamp}`);
}

/** The attribute of `lampState` that holds the lamp's state (`ok`, `wait`, `down`): `data-server` or `data-db` in the new UI, `data-state` in the classic one. */
export function lampAttr(lamp: 'server' | 'db'): string {
  return projectUi() === 'new' ? `data-${lamp}` : 'data-state';
}

/**
 * One of the four figures. New UI (spec 7.2): an item of the Loops page summary (`summary`), with `data-value`,
 * `data-stale="true"` and `data-alert="true"`. Classic: a sentence of the top bar's `topstats`.
 */
export function statValue(page: Page, stat: 'active-loops' | 'running-runs' | 'runs-today' | 'errors-24h'): Locator {
  return page.getByTestId(projectUi() === 'new' ? 'summary' : 'topstats').getByTestId(`stat-${stat}`);
}

/** New UI (spec 7.2): the Repeat select `sched-kind` takes the kind as its value; the classic UI has one `sched-kind-<k>` button per kind. */
export async function pickScheduleKind(page: Page, kind: string): Promise<void> {
  if (await isNewUi(page)) {
    await page.getByTestId('sched-kind').selectOption(kind);
    return;
  }
  await page.getByTestId(`sched-kind-${kind}`).click();
}

/**
 * Registers the folder `path` from the Repos page. New UI (spec 7.2): `repo-add` opens the picker (unless it is open already),
 * which holds `repo-path`, `repo-name` and `repo-submit`; the helper waits until the picker has opened its first folder (which
 * writes that folder into `repo-path`) before it types. The picker closes after registering. Classic: the form on the page.
 */
export async function registerRepo(page: Page, path: string): Promise<void> {
  if ((await isNewUi(page)) && (await page.getByTestId('folder-picker').count()) === 0) await openPicker(page);
  await page.getByTestId('repo-path').fill(path);
  await page.getByTestId('repo-submit').click();
}

/** New UI: `repo-add` opens the picker; it is ready once it has opened its first folder, which it writes into `repo-path`. */
async function openPicker(page: Page): Promise<void> {
  await page.getByTestId('repo-add').click();
  await page.locator('[data-testid="folder-list"][data-loading="false"]:not([data-path=""])').waitFor();
}

/**
 * Opens the folder picker and waits until it shows its first folder. New UI (spec 7.2): `repo-add` opens it; `repo-browse` goes
 * away. Classic: `repo-browse`.
 */
export async function openFolderPicker(page: Page): Promise<void> {
  if (await isNewUi(page)) {
    await openPicker(page);
    return;
  }
  await page.getByTestId('repo-browse').click();
}

/** Asks to delete the repo of `row`. New UI (spec 7.2): the row's `⋯` menu (`repo-menu`), then its `repo-delete` item. Classic: the row's `repo-delete` button. */
export async function deleteRepo(row: Locator): Promise<void> {
  if (await isNewUi(row.page())) {
    await row.getByTestId('repo-menu').click();
    await row.page().getByRole('menu').getByTestId('repo-delete').click();
    return;
  }
  await row.getByTestId('repo-delete').click();
}

/**
 * Rows of the loop list read from a loop's page: `check` runs where the list is. Classic: the list pane beside the page. New UI
 * (spec 7.2): the list is only on `/`, so the helper follows `nav-loops`, runs `check` there and goes back, inside the app.
 */
export async function onLoopList(page: Page, check: () => Promise<void>): Promise<void> {
  if (await isNewUi(page)) {
    const loopPage = page.url();
    await page.getByTestId('nav-loops').click();
    await page.waitForURL((url) => url.pathname === '/');
    await check();
    await page.goBack();
    await page.waitForURL(loopPage);
    return;
  }
  await check();
}
