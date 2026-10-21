// Shots of the REAL Repo page (UC-19 · UC-20 · D-UI9…D-UI11, D-UI20, D-UI21; UC-29: Browse… button + folder picker) next
// to the approved preview shots (design/preview/shots/repo-*, vi-repo-list, vi-repo-browse) + pixel mismatch: top bar
// (Loops · Repos), list pane, main pane, folder picker.
// Data = the preview world (tests/support/preview-world.ts — 4 repos, "acme-api (old)" missing its folder); every error
// comes from the real server (registering a missing folder, a duplicate path, a duplicate name, deleting a repo loops
// still use). Whether the sample paths exist depends on the machine → forced through `/api/__test/dirs`. The Browse…
// dialog reads the "machine" of the preview (PV.folders — a Windows machine, a Mac) through `/api/__test/folders`: folder
// tree, drives, OS (the placeholder of the path field) are the same as in the images on every machine running the tests.
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import pg from 'pg';
import { databaseUrl, loadDotEnv } from '../../server/config';
import { PREVIEW_NOW, previewData, previewDirs, previewFolderWorld, seedMacRepos, seedPreviewWorld, wipe } from '../support/preview-world';
import { PREVIEW_VIEW, regions, setLang, snap, tEn, writeReport, type RegionSpec } from './compare-kit';

loadDotEnv();
test.use(PREVIEW_VIEW);
const ALL = [regions.topbarAll(), regions.list(), regions.main()];
type Machine = { at: string; typo?: string; denied?: string; repos?: Record<string, { name: string }> };
const FOLDERS = (previewData() as unknown as { folders: { win: Machine; mac: Machine } }).folders;
const API = previewData().repos.api!.name;
const OLD = previewData().repos.old!.name;

let db: pg.Pool;
test.beforeAll(() => {
  db = new pg.Pool({ connectionString: databaseUrl(process.env, 'test'), max: 2 });
});
test.afterAll(async () => {
  await db?.end();
  writeReport('repo');
});

async function world(page: Page, request: APIRequestContext, kind: 'overview' | 'empty' | 'mac', dirs: Record<string, boolean> = {}): Promise<void> {
  expect((await request.post('/api/__test/reset')).status()).toBe(204);
  expect((await request.post('/api/__test/clock', { data: { at: PREVIEW_NOW.toISOString() } })).status()).toBe(200);
  await wipe(db);
  if (kind === 'overview') await seedPreviewWorld(db);
  const mac = kind === 'mac' ? await seedMacRepos(db) : {};
  expect((await request.post('/api/__test/dirs', { data: { paths: { ...previewDirs(), ...mac, ...dirs } } })).status()).toBe(204);
  const folders = previewFolderWorld(kind === 'mac' ? 'mac' : 'win');
  expect((await request.post('/api/__test/folders', { data: { world: folders } })).status()).toBe(204);
  await page.clock.setFixedTime(PREVIEW_NOW);
}

async function open(page: Page, rows: number, platform = 'win32'): Promise<void> {
  await page.goto('/repos');
  await expect(page.getByTestId('lamp-db')).toHaveAttribute('data-state', 'ok');
  if (rows) await expect(page.getByTestId('repo-row')).toHaveCount(rows);
  await expect(page.getByTestId('stat-active-loops')).not.toContainText('—');
  await expect(page.getByTestId('repo-path')).toHaveAttribute('data-platform', platform); // the placeholder follows the OS
}

/** Opens the Browse… dialog (empty path field → the folder opened last / next to a repo / home), waits for the read + the Quick access column. */
async function browse(page: Page): Promise<void> {
  await page.getByTestId('repo-browse').click();
  await expect(page.getByTestId('folder-list')).not.toHaveAttribute('data-path', '');
  await expect(page.getByTestId('folder-list')).toHaveAttribute('data-loading', 'false');
  await expect(page.getByTestId('folder-side')).toContainText('◫');
}

/** Clicks the Quick access entry with exactly the path `path`, waits until that folder is read. */
async function goPlace(page: Page, path: string): Promise<void> {
  const places = page.getByTestId('folder-place');
  const paths = await places.evaluateAll((els) => els.map((e) => e.getAttribute('data-path')));
  expect(paths).toContain(path);
  await places.nth(paths.indexOf(path)).click();
  await expect(page.getByTestId('folder-list')).toHaveAttribute('data-path', path);
  await expect(page.getByTestId('folder-list')).toHaveAttribute('data-loading', 'false');
}

/** A still image: drop the real focus (Chromium's focus ring) + move the mouse to the corner (no hover). */
async function still(page: Page): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.mouse.move(0, 0);
}

/** Types a path (+ name), presses Register; waits for the server error at the field. */
async function register(page: Page, path: string, errorAt: 'repo-path' | 'repo-name'): Promise<void> {
  await page.getByTestId('repo-path').fill(path);
  await page.getByTestId('repo-submit').click();
  await expect(page.getByTestId(`error-${errorAt}`)).toBeVisible();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.mouse.move(0, 0);
}

test.describe('Repo page against the preview', () => {
  test.describe.configure({ mode: 'serial' });

  test('list (en + vi), loading, no repo yet', async ({ page, request }) => {
    test.setTimeout(120_000);
    await world(page, request, 'overview');
    await open(page, 4);
    await expect(page.locator('[data-testid=repo-row][data-exists=false]')).toHaveCount(1);
    await snap(page, 'repo-list', 'Repo table: name, path (+ "folder is gone"), loops using it, registered at, Delete', ALL);

    await setLang(page, 'vi');
    await snap(page, 'vi-repo-list', 'Repo page, Vietnamese UI', ALL);
    await setLang(page, 'en');

    // Loading: GET /api/repos held. The repo count of the top bar comes from that same request → masked (the preview still prints "4").
    await page.route('**/api/repos', () => undefined);
    await page.goto('/repos');
    await expect(page.getByTestId('repo-loading')).toBeVisible();
    await expect(page.getByTestId('repo-path')).toHaveAttribute('data-platform', 'win32');
    await expect(page.getByTestId('loop-row')).toHaveCount(7);
    const top: RegionSpec = { ...regions.topbarAll(), mask: ['[data-testid=nav-repos-count]'] };
    await snap(page, 'repo-loading', 'Loading the repo list', [top, regions.list(), regions.main()]);
    await page.unroute('**/api/repos');

    await world(page, request, 'empty');
    await page.goto('/repos');
    await expect(page.getByTestId('repo-empty')).toBeVisible();
    await expect(page.getByTestId('repo-path')).toHaveAttribute('data-platform', 'win32');
    await expect(page.getByTestId('lamp-db')).toHaveAttribute('data-state', 'ok');
    await expect(page.getByTestId('nav-repos-count')).toHaveText('0');
    await snap(page, 'repo-empty', 'No repo registered yet (first time)', ALL);
  });

  test('register: name filled in, missing folder, duplicate path, duplicate name', async ({ page, request }) => {
    test.setTimeout(120_000);
    const pv = previewData();
    const dupName = `D:\\backup\\${API}`;
    await world(page, request, 'overview', { [dupName]: true });
    await open(page, 4);

    // Typing: the name is filled in from the last folder, the path field has focus (D-UI10).
    await page.getByTestId('repo-path').fill(`${FOLDERS.win.at}\\acme-tools`);
    await expect(page.getByTestId('repo-name')).toHaveValue('acme-tools');
    await expect(page.getByTestId('repo-path')).toHaveClass(/is-focus/); // the focused field carries the is-focus class of the design system
    // The preview draws the focus state with the `is-focus` class (no real focus); REAL focus makes Chromium anti-alias the
    // text of the whole form differently (0.31 % in the main pane, text only). Shot: drop the real focus but keep the class
    // checked above.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(page.getByTestId('repo-path')).not.toHaveClass(/is-focus/); // React redrew after the blur
    await page.getByTestId('repo-path').evaluate((el) => el.classList.add('is-focus'));
    await page.mouse.move(0, 0);
    await snap(page, 'repo-add-autoname', 'Typing a path — the name is filled in from the folder name, editable', ALL);

    await register(page, FOLDERS.win.typo!, 'repo-path');
    await expect(page.getByTestId('error-repo-path')).toHaveText(tEn('repo.val.notFound'));
    await snap(page, 'repo-err-missing', 'Folder does not exist → error at the path field, nothing written to the DB', ALL);

    await register(page, pv.repos.api!.path, 'repo-path');
    await expect(page.getByTestId('error-repo-path')).toHaveText(tEn('repo.val.pathTaken', { name: API }));
    await snap(page, 'repo-err-dup-path', 'Duplicate path → error at the field, naming the existing repo (D-UI21)', ALL);

    await register(page, dupName, 'repo-name');
    await expect(page.getByTestId('error-repo-name')).toHaveText(tEn('repo.val.nameTaken'));
    await snap(page, 'repo-err-dup-name', 'Duplicate name (the filled-in name clashes with another repo) → error at the Name field', ALL);
    expect((await db.query('SELECT count(*)::int AS n FROM repos')).rows[0].n).toBe(4); // nothing was ever written to the DB
  });

  test('delete: confirmation dialog, loops still use it → refused', async ({ page, request }) => {
    test.setTimeout(120_000);
    await world(page, request, 'overview');
    await open(page, 4);
    const row = (name: string) => page.getByTestId('repo-row').filter({ hasText: name });

    await row('dotfiles').getByTestId('repo-delete').click();
    await expect(page.getByTestId('repo-delete-dialog')).toBeVisible();
    await page.mouse.move(1430, 890);
    await snap(page, 'repo-delete-confirm', 'Deleting a repo no loop uses — confirmation dialog', ALL);
    await page.getByTestId('repo-delete-cancel').click();

    await row(OLD).getByTestId('repo-delete').click();
    await expect(page.getByTestId('repo-in-use')).toContainText(tEn('repo.inUse.archived', { name: previewData().loops.oldsched.name }));
    await page.mouse.move(0, 0);
    await snap(page, 'repo-delete-blocked', 'Deleting a repo loops still use → refused, naming every loop (archived ones too)', ALL);
    expect((await db.query('SELECT count(*)::int AS n FROM repos')).rows[0].n).toBe(4);
  });

  test('folder picker: Windows, typing a missing path, Vietnamese UI, Mac, macOS denies access', async ({ page, request }) => {
    test.setTimeout(180_000);
    const { win: W, mac: M } = FOLDERS;
    const D: RegionSpec[] = [...ALL, { name: 'folder picker', selector: '.dialog' }];
    const row = (name: string) => page.locator(`[data-testid=folder-row][data-name="${name}"]`);

    // The Windows machine (the main world): go to the repo folder through the "next to your repos" entry, pick acme-tools.
    await world(page, request, 'overview');
    await open(page, 4);
    await browse(page);
    await goPlace(page, W.at);
    await row('acme-tools').click();
    await expect(row('acme-tools')).toHaveClass(/is-sel/);
    await expect(row(API)).toContainText(tEn('folder.tag.repo', { name: API }));
    await still(page);
    await snap(page, 'repo-browse', 'Folder picker — Windows: Quick access, git, already registered folders, the selected row → Will choose', D);

    // Typing a missing path → error under the path bar, the list keeps the old folder (dialog opened again: no row selected).
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('folder-picker')).toHaveCount(0);
    await browse(page);
    await goPlace(page, W.at);
    await page.getByTestId('folder-path').fill(W.typo!);
    await page.getByTestId('folder-path').press('Enter');
    await expect(page.getByTestId('folder-error')).toHaveText(tEn('repo.val.notFound'));
    await expect(page.getByTestId('folder-list')).toHaveAttribute('data-path', W.at);
    await still(page);
    await snap(page, 'repo-browse-notfound', 'Typing a missing path → error under the path bar, the list keeps the old folder', D);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('folder-picker')).toHaveCount(0);

    await setLang(page, 'vi');
    await browse(page);
    await goPlace(page, W.at);
    await row('acme-tools').click();
    await still(page);
    await snap(page, 'vi-repo-browse', 'Folder picker on Windows, Vietnamese UI', D);
    await page.keyboard.press('Escape');
    await setLang(page, 'en');

    // The Mac (its own console: 2 repos with Mac paths, no loops yet): the dialog opens right at ~/Code (next to the
    // acme-api repo), pick the already registered acme-api.
    await world(page, request, 'mac');
    await open(page, 2, 'darwin');
    await expect(page.getByTestId('repo-path')).toHaveAttribute('placeholder', tEn('repo.add.path.placeholder.posix'));
    await browse(page);
    await expect(page.getByTestId('folder-list')).toHaveAttribute('data-path', M.at);
    await row(M.repos!.api!.name).click();
    await expect(page.getByTestId('folder-choose')).toBeDisabled();
    await still(page);
    await snap(page, 'repo-browse-mac', 'Folder picker — Mac: Macintosh HD + Backup, an already registered folder chosen → Choose locked', D);

    // macOS denies reading ~/Desktop (TCC) → how to grant access + Retry.
    await goPlace(page, M.denied!);
    await expect(page.getByTestId('folder-unreadable')).toHaveAttribute('data-reason', 'denied');
    await still(page);
    await snap(page, 'repo-browse-denied', 'macOS denies reading ~/Desktop → how to grant access + Retry', D);
  });
});
