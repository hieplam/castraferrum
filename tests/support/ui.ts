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

/** New UI (spec 7.2): row actions are visible at rest; no hover. */
export async function revealRowActions(row: Locator): Promise<void> {
  await row.hover();
}

/** New UI (spec 7.2): the paged run history is the All runs page `/loops/:id/runs` (`runs-table`, `runs-pager`). */
export function runHistory(page: Page): Locator {
  return page.getByTestId('runs-table');
}

/** New UI (spec 7.2): `period-row` cells and the current period's group head on the loop page (`data-execution-id`); `exec-row` on All runs. */
export function executionRows(page: Page): Locator {
  return page.getByTestId('exec-row');
}

/** New UI (spec 7.2): the page names its loop (`loop-header`, `run-of` or `exec-header`); list rows are read on `/`. */
export function loopRowOnList(page: Page): Locator {
  return page.locator('[data-testid="loop-row"].is-sel');
}

/** New UI (spec 7.2): Settings, `settings-lang-en` and `settings-lang-vi` (`aria-checked`). */
export async function switchLanguage(page: Page): Promise<void> {
  await page.getByTestId('toggle-lang').click();
}

/** New UI (spec 7.2): `toggle-theme` in the top bar, `html[data-theme]` and Settings `settings-theme-*`. */
export function themeName(page: Page): Locator {
  return page.getByTestId('toggle-theme').locator('b');
}

/** New UI (spec 7.2): `conn` with `data-server` and `data-db`. */
export function lampState(page: Page, lamp: 'server' | 'db'): Locator {
  return page.getByTestId(`lamp-${lamp}`);
}

/** New UI (spec 7.2): the summary items with `data-value`, `data-stale="true"` and `data-alert="true"`. */
export function statValue(page: Page, stat: 'active-loops' | 'running-runs' | 'runs-today' | 'errors-24h'): Locator {
  return page.getByTestId(`stat-${stat}`);
}

/** New UI (spec 7.2): the Repeat select `sched-kind` and its value. */
export async function pickScheduleKind(page: Page, kind: string): Promise<void> {
  await page.getByTestId(`sched-kind-${kind}`).click();
}

/** New UI (spec 7.2): `repo-add` opens the picker, which holds `repo-path`, `repo-name` and `repo-submit`; it closes after registering. */
export async function registerRepo(page: Page, path: string): Promise<void> {
  await page.getByTestId('repo-path').fill(path);
  await page.getByTestId('repo-submit').click();
}

/** New UI (spec 7.2): `repo-add` opens the folder picker; `repo-browse` goes away. */
export async function openFolderPicker(page: Page): Promise<void> {
  await page.getByTestId('repo-browse').click();
}

/** New UI (spec 7.2): the row's `⋯` menu (`repo-menu`), then `repo-delete`. */
export async function deleteRepo(row: Locator): Promise<void> {
  await row.getByTestId('repo-delete').click();
}
