/// <reference lib="dom" />
// E2E UC-29 (SPEC-phase-2 § New use cases): browse folders when registering a repo. All real: browser -> build ->
// Fastify -> node:fs of the machine running the tests (a REAL temp folder tree) -> Postgres (test DB, test mode). The grandchild
// folder is reached only by mouse / keyboard in the box (its path is typed nowhere); the result is checked with a SELECT on the DB.
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { api, closeDb, db } from '../support/form-kit';
import { t } from '../support/ui-text';
import { openFolderPicker } from '../support/ui';

test.use({ timezoneId: 'Asia/Ho_Chi_Minh' });
test.afterAll(closeDb);
test.beforeEach(async ({ request }) => {
  expect((await api(request, 'POST', '/api/__test/reset')).status).toBe(204);
});

/** Real temp tree: root/{proj-a/.git, proj-b/sub/deep, .an} - canonical form (realpath) as the server returns it. */
function tree() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'lc-browse-e2e-')));
  mkdirSync(join(root, 'proj-a', '.git'), { recursive: true });
  mkdirSync(join(root, 'proj-b', 'sub', 'deep'), { recursive: true });
  mkdirSync(join(root, '.an'));
  return root;
}
const listAt = (page: Page, path: string) => expect(page.getByTestId('folder-list')).toHaveAttribute('data-path', path);
const row = (page: Page, name: string) => page.locator(`[data-testid=folder-row][data-name="${name}"]`);

test.describe('browse folders when registering a repo', () => {
  test('UC-29: Browse… -> reach the grandchild folder by mouse + keyboard -> Choose -> canonical path + auto-filled name -> Register writes the right DB row', { tag: '@UC-29' }, async ({ page }) => {
    const root = tree();
    const deep = join(root, 'proj-b', 'sub', 'deep');
    await page.goto('/repos');
    // Spec 7.2: the path field `repo-path` lives in the picker that `repo-add` opens; typing the tree root there and pressing
    // Enter opens it.
    await openFolderPicker(page);
    await expect(page.getByTestId('repo-path')).toHaveAttribute('data-platform', /^(win32|darwin|linux)$/);
    await page.getByTestId('repo-path').fill(root);
    await page.getByTestId('repo-path').press('Enter');
    await expect(page.getByTestId('folder-picker')).toBeVisible();
    await listAt(page, root);
    await expect(page.getByTestId('folder-row')).toHaveText([/proj-a/, /proj-b/]); // `.an` is hidden by default
    await expect(row(page, 'proj-a')).toContainText('git');
    await page.getByTestId('folder-show-hidden').check();
    await expect(page.getByTestId('folder-row')).toHaveCount(3);
    await page.getByTestId('folder-show-hidden').uncheck();

    // Double-click proj-b -> click the "›" of sub -> keyboard: ↓ selects deep, Enter opens.
    await row(page, 'proj-b').dblclick();
    await listAt(page, join(root, 'proj-b'));
    await row(page, 'sub').getByTestId('folder-open').click();
    await listAt(page, join(root, 'proj-b', 'sub'));
    await page.getByTestId('folder-filter').press('ArrowDown');
    await expect(row(page, 'deep')).toHaveAttribute('aria-selected', 'true');
    await page.getByTestId('folder-filter').press('Enter');
    await listAt(page, deep);
    await expect(page.getByTestId('folder-empty')).toBeVisible(); // deep has no subfolders

    // ⌫ (empty filter) = up to the parent, the folder just left is pre-selected -> "Will choose" = deep.
    await page.getByTestId('folder-filter').press('Backspace');
    await listAt(page, join(root, 'proj-b', 'sub'));
    await expect(row(page, 'deep')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('folder-target')).toHaveAttribute('data-path', deep);

    // Back to the tree root then back in through the cache history - still the right folder. The breadcrumb only shows the path
    // (design/ds/SYSTEM.md, `.crumbs`), so Up (`folder-up`) climbs twice; the crumbs still name the root.
    await expect(page.getByTestId('folder-crumb').filter({ hasText: basename(root) })).toHaveCount(1);
    await page.getByTestId('folder-up').click();
    await listAt(page, join(root, 'proj-b'));
    await page.getByTestId('folder-up').click();
    await listAt(page, root);
    await row(page, 'proj-b').dblclick();
    await row(page, 'sub').dblclick();
    await row(page, 'deep').click();
    const name = 'deep-picked';
    // Spec 7.2: Choose and Register are one step. Selecting fills the target and the name (editable); `repo-submit`
    // registers the name the field holds, and the picker closes.
    await expect(row(page, 'deep')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('folder-target')).toHaveAttribute('data-path', deep);
    await expect(page.getByTestId('repo-name')).toHaveValue('deep');
    await page.getByTestId('repo-name').fill(name);
    await expect(page.getByTestId('folder-target')).toContainText(name);
    await page.getByTestId('repo-submit').click();
    await expect(page.getByTestId('folder-picker')).toHaveCount(0);
    await expect(page.getByTestId('repo-row')).toHaveCount(1);
    expect((await db().query('SELECT name, path FROM repos')).rows).toEqual([{ name, path: deep }]);

    // Reopen (empty path field) -> back to the folder opened last time; the folder just registered carries the repo tag, choose it ->
    // the Register button (`repo-submit`) is locked.
    await openFolderPicker(page);
    await listAt(page, join(root, 'proj-b', 'sub'));
    await expect(row(page, 'deep')).toContainText(t('picker.tagRepo'));
    await row(page, 'deep').click();
    await expect(page.getByTestId('folder-target')).toHaveAttribute('data-path', deep);
    await expect(page.getByTestId('repo-submit')).toBeDisabled();

    // Type a path that does not exist in the path bar (`repo-path`) -> error right below, the list keeps the old folder.
    const pathBar = page.getByTestId('repo-path');
    await pathBar.fill(join(root, 'missing'));
    await pathBar.press('Enter');
    await expect(page.getByTestId('folder-error')).toHaveText(t('repo.val.notFound'));
    await listAt(page, join(root, 'proj-b', 'sub'));

    // Quick access: the first entry = the machine's home folder; Esc closes the box; the DB still has one repo.
    await page.getByTestId('folder-place').first().click();
    await listAt(page, realpathSync.native(homedir()));
    await expect(page.getByTestId('folder-error')).toHaveCount(0);
    await page.getByTestId('folder-filter').press('Escape');
    await expect(page.getByTestId('folder-picker')).toHaveCount(0);
    expect((await db().query('SELECT count(*)::int AS n FROM repos')).rows[0].n).toBe(1);
  });
});
