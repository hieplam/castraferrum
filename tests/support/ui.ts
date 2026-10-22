// The steps of the e2e tests that differ between the classic UI and the new UI (UI uplift, task U12; spec 7.2 "Equivalences").
// Each helper holds today's classic code for its step; the new-UI branch (`isNewUi`) is added at the cut-over, and the comment on
// each helper names it. Helpers return locators and values, so the `expect` stays at the call site. This file is exempt from the
// selector scan (tests/tools/e2e-selectors.test.ts): the classic selectors live here until they are removed (task U25).
import type { Locator, Page } from '@playwright/test';

/** True when the page runs the new UI: `html[data-ui="new"]`. The classic UI has no such attribute. */
export async function isNewUi(page: Page): Promise<boolean> {
  return (await page.locator('html').getAttribute('data-ui')) === 'new';
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
