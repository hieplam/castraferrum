// The new Repos page and folder picker (UI uplift, task U19) next to the approved new preview (design/ds/preview/shots/): the
// 17 states of spec 5.7 (14 desktop, 3 phone), light and dark = 34 pairs. Every state is rebuilt on the real app with real
// actions: a real server (test mode, test database) with the world of the new preview seeded (tests/support/preview-world.ts
// with DS_DATA_JS), the server and browser clocks at PREVIEW_NOW. The folder picker reads the "machine" of the preview
// (PV.folders: a Windows machine, a Mac) through `/api/__test/folders`, as tests/visual/repo.visual.ts does, so its folders,
// places and operating system are the same on every machine running the tests. Every error comes from the real server: a
// typed path that does not exist (opening it, registering it), a path already registered, a name taken, deleting a repo
// loops still use. The regions are the page, plus the picker (the wide dialog on the desktop, the full-height sheet on the
// phone) or the delete confirmation (a dialog, a sheet). No mask.
import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { en } from '../../../shared/i18n/en';
import { DS_DATA_JS, PREVIEW_NOW, previewData, previewDirs, previewFolderWorld, seedMacRepos, seedPreviewWorld, wipe } from '../../support/preview-world';
import { liveDbUrl, ServerProcess } from '../../support/server-process';
import { PHONE_VIEW, PREVIEW_VIEW, regions, setLang, snap, writeReport, type RegionSpec } from './kit';

/** The English text of a key of shared/i18n/en.ts with `{x}` filled in, like the app does. */
const tEn = (key: keyof typeof en, params: Record<string, string | number> = {}) =>
  en[key].replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));

test.afterAll(() => writeReport('repos'));

const PV = previewData(DS_DATA_JS);
type Machine = { at: string; typo?: string; denied?: string; repos?: Record<string, { name: string; path: string }> };
const FOLDERS = (PV as unknown as { folders: { win: Machine; mac: Machine } }).folders;
const W = FOLDERS.win;
const M = FOLDERS.mac;
const API = PV.repos.api!;
const OLD = PV.repos.old!;

/** The full-height sheet of the picker on the phone. */
const fullsheet = (): RegionSpec => ({ name: 'full-height sheet', selector: '.fullsheet' });

type World = 'overview' | 'empty' | 'mac';

/** One server for a describe block; `world()` = a clean DB with a world of the new preview and the clocks at PREVIEW_NOW. */
function useServer() {
  const ctx = {} as { sp: ServerProcess; db: pg.Pool; world(page: Page, kind: World): Promise<void> };
  test.beforeAll(async () => {
    ctx.sp = await ServerProcess.launch();
    ctx.db = new pg.Pool({ connectionString: liveDbUrl(), max: 2 });
    ctx.world = async (page, kind) => {
      // Leave the app first: its requests would race the TRUNCATE below.
      await page.goto('about:blank');
      expect((await ctx.sp.api('POST', '/api/__test/reset')).status).toBe(204);
      expect((await ctx.sp.api('POST', '/api/__test/clock', { at: PREVIEW_NOW.toISOString() })).status).toBe(200);
      await wipe(ctx.db);
      if (kind === 'overview') await seedPreviewWorld(ctx.db, {}, DS_DATA_JS);
      const mac = kind === 'mac' ? await seedMacRepos(ctx.db, DS_DATA_JS) : {};
      // Registering checks the real disk: the folder that `repos-err-dup-name` registers is forced present.
      const extra = { [`${W.at}\\acme-api-hotfix`]: true };
      expect((await ctx.sp.api('POST', '/api/__test/dirs', { paths: { ...previewDirs(DS_DATA_JS), ...mac, ...extra } })).status).toBe(204);
      const folders = previewFolderWorld(kind === 'mac' ? 'mac' : 'win', DS_DATA_JS);
      expect((await ctx.sp.api('POST', '/api/__test/folders', { world: folders })).status).toBe(204);
      await page.clock.setFixedTime(PREVIEW_NOW);
    };
  });
  test.afterAll(async () => {
    await ctx.sp?.stop();
    await ctx.db?.end();
  });
  return ctx;
}

/** Every font face the page uses is loaded (a face is fetched the first time text needs it). */
const fontsLoaded = (page: Page) =>
  page.evaluate(() =>
    Promise.all(
      ['400', '500', '600', '700'].map((w) => document.fonts.load(`${w} 14px "Be Vietnam Pro"`)).concat(['400', '500', '600'].map((w) => document.fonts.load(`${w} 14px "JetBrains Mono"`))),
    ),
  );

/** Ready for a shot: no caret, no focus ring, no hover, the page at its top, the connection known, the fonts loaded. */
async function still(page: Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.mouse.move(1430, 890);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.getByTestId('conn')).toHaveAttribute('data-db', 'ok');
  await fontsLoaded(page);
}

async function openRepos(page: Page, base: string, rows: number) {
  await page.goto(`${base}/repos`);
  await expect(page.getByTestId('repo-row')).toHaveCount(rows);
}

const repoRow = (page: Page, name: string) => page.getByTestId('repo-row').filter({ has: page.getByTestId('repo-row-name').getByText(name, { exact: true }) });
const folderRow = (page: Page, name: string) => page.locator(`[data-testid="folder-row"][data-name="${name}"]`);

/** Opens the picker with Add a repo and waits until a folder is listed. */
async function openPicker(page: Page) {
  await page.getByTestId('repo-add').click();
  await expect(page.getByTestId('folder-picker')).toBeVisible();
  await expect(page.getByTestId('folder-list')).toHaveAttribute('data-loading', 'false');
  await expect(page.getByTestId('folder-list')).not.toHaveAttribute('data-path', '');
}

/** Types a path into the path field and opens it (Enter); waits until that folder is listed. */
async function goTo(page: Page, path: string) {
  await page.getByTestId('repo-path').fill(path);
  await page.getByTestId('repo-path').press('Enter');
  await expect(page.getByTestId('folder-list')).toHaveAttribute('data-path', path);
  await expect(page.getByTestId('folder-list')).toHaveAttribute('data-loading', 'false');
}

async function closePicker(page: Page) {
  await page.getByTestId('folder-cancel').click();
  await expect(page.getByTestId('folder-picker')).toHaveCount(0);
}

/** The picker open at the repo folder of the Windows machine, acme-tools chosen: the name follows the folder. */
async function chooseTools(page: Page) {
  await openPicker(page);
  await goTo(page, W.at);
  await folderRow(page, 'acme-tools').click();
  await expect(folderRow(page, 'acme-tools')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('repo-name')).toHaveValue('acme-tools');
  await expect(page.getByTestId('repo-submit')).toBeEnabled();
}

test.describe('desktop Repos page against the preview', () => {
  test.describe.configure({ mode: 'serial' });
  test.use(PREVIEW_VIEW);
  const ctx = useServer();
  const page1 = () => [regions.page()];
  const withDialog = () => [regions.page(), regions.dialog()];

  test('list (English and Vietnamese), loading, delete, delete refused', async ({ page }) => {
    test.setTimeout(180_000);
    await ctx.world(page, 'overview');
    const base = ctx.sp.baseUrl;

    await openRepos(page, base, 4);
    await expect(page.locator('[data-testid="repo-row"][data-exists="false"]')).toHaveCount(1);
    await expect(repoRow(page, OLD.name).getByTestId('repo-gone')).toHaveText(tEn('status.folderGone'));
    await expect(repoRow(page, 'dotfiles').getByTestId('repo-loop-count')).toHaveAttribute('data-n', '0');
    await still(page);
    await snap(page, 'repos-list', 'The four sample repos, one whose folder is gone', page1());

    await setLang(page, 'vi');
    await expect(page.getByTestId('repo-row')).toHaveCount(4);
    await still(page);
    await snap(page, 'vi-repos-list', 'repos-list in Vietnamese', page1());
    await setLang(page, 'en');

    // Loading: GET /api/repos held.
    await page.route('**/api/repos', () => undefined); // never answers
    await page.goto(`${base}/repos`);
    await expect(page.getByTestId('repo-loading')).toBeVisible();
    await still(page);
    await snap(page, 'repos-loading', 'Loading the repos: skeleton cells', page1());
    await page.unroute('**/api/repos');

    // Delete a repo no loop uses: the confirmation.
    await openRepos(page, base, 4);
    await repoRow(page, 'dotfiles').getByTestId('repo-menu').click();
    await page.getByTestId('repo-delete').click();
    await expect(page.getByTestId('repo-delete-dialog')).toBeVisible();
    await expect(page.getByTestId('repo-delete-dialog')).toContainText(tEn('repos.deleteTitle', { name: 'dotfiles' }));
    await still(page);
    await snap(page, 'repos-delete-confirm', 'Delete a repo no loop uses: a dialog', withDialog());
    await page.getByTestId('repo-delete-cancel').click();
    await expect(page.getByTestId('repo-delete-dialog')).toHaveCount(0);

    // Delete a repo loops still use: the server refuses (REPO_IN_USE) and names them, archived ones marked.
    await repoRow(page, OLD.name).getByTestId('repo-menu').click();
    await page.getByTestId('repo-delete').click();
    await expect(page.getByTestId('repo-in-use')).toContainText(tEn('repo.inUse.archived', { name: PV.loops.oldsched.name }));
    await expect(page.getByTestId('repo-in-use')).toContainText(PV.loops.crash.name);
    await expect(page.getByTestId('repo-row')).toHaveCount(4);
    await still(page);
    await snap(page, 'repos-delete-blocked', 'Delete refused: the loops that use the repo', page1());
    expect((await ctx.db.query<{ n: number }>('SELECT count(*)::int AS n FROM repos')).rows[0]!.n).toBe(4);
  });

  test('the folder picker (English and Vietnamese), a path that does not exist, registration errors', async ({ page }) => {
    test.setTimeout(180_000);
    await ctx.world(page, 'overview');
    await openRepos(page, ctx.sp.baseUrl, 4);

    await chooseTools(page);
    await expect(folderRow(page, API.name).getByText(tEn('picker.tagRepo'))).toBeVisible();
    await expect(page.getByTestId('folder-target')).toContainText(`${W.at}\\acme-tools`);
    await still(page);
    await snap(page, 'repos-add', 'The folder picker: a git folder selected, the name filled in', withDialog());
    await closePicker(page);

    await setLang(page, 'vi');
    await chooseTools(page);
    await still(page);
    await snap(page, 'vi-repos-add', 'repos-add in Vietnamese', withDialog());
    await closePicker(page);
    await setLang(page, 'en');

    // Opening a typed path that does not exist: the error under the path, the list keeps the open folder, Add stays on.
    await openPicker(page);
    await goTo(page, W.at);
    await page.getByTestId('repo-path').fill(W.typo!);
    await page.getByTestId('repo-path').press('Enter');
    await expect(page.getByTestId('folder-error')).toHaveText(tEn('repo.val.notFound'));
    await expect(page.getByTestId('folder-list')).toHaveAttribute('data-path', W.at);
    await expect(page.getByTestId('repo-name')).toHaveValue('work');
    await expect(page.getByTestId('repo-submit')).toBeEnabled();
    await still(page);
    await snap(page, 'repos-add-notfound', 'A typed path that does not exist: the error, the list keeps the open folder', withDialog());
    await closePicker(page);

    // Registering a typed path that does not exist: the server refuses it at the path field; Add is locked until it changes.
    await openPicker(page);
    await goTo(page, W.at);
    await page.getByTestId('repo-path').fill(W.typo!);
    await expect(page.getByTestId('repo-name')).toHaveValue('acme-tool');
    await page.getByTestId('repo-submit').click();
    await expect(page.getByTestId('error-repo-path')).toHaveText(tEn('repo.val.notFound'));
    await expect(page.getByTestId('repo-path')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByTestId('repo-submit')).toBeDisabled();
    await still(page);
    await snap(page, 'repos-err-missing', 'Registering a folder that does not exist', withDialog());
    await closePicker(page);

    // Registering a path already registered: the error names the repo, its folder is selected.
    await openPicker(page);
    await goTo(page, W.at);
    await page.getByTestId('repo-path').fill(API.path);
    await page.getByTestId('repo-submit').click();
    await expect(page.getByTestId('error-repo-path')).toHaveText(tEn('picker.pathTaken', { name: API.name }));
    await expect(folderRow(page, API.name)).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('repo-submit')).toBeDisabled();
    await still(page);
    await snap(page, 'repos-err-dup-path', 'The path is already registered', withDialog());
    await closePicker(page);

    // A name another repo has: the error at the name field.
    await openPicker(page);
    await goTo(page, W.at);
    await folderRow(page, 'acme-api-hotfix').click();
    await page.getByTestId('repo-name').fill(API.name);
    await page.getByTestId('repo-submit').click();
    await expect(page.getByTestId('error-repo-name')).toHaveText(tEn('error.REPO_NAME_TAKEN'));
    await expect(page.getByTestId('repo-submit')).toBeDisabled();
    await still(page);
    await snap(page, 'repos-err-dup-name', 'The name is taken', withDialog());
    await closePicker(page);
    expect((await ctx.db.query<{ n: number }>('SELECT count(*)::int AS n FROM repos')).rows[0]!.n).toBe(4); // nothing was written
  });

  test('no repo yet, the Mac: its places, macOS refuses a folder', async ({ page }) => {
    test.setTimeout(180_000);
    await ctx.world(page, 'empty');
    await page.goto(`${ctx.sp.baseUrl}/repos`);
    await expect(page.getByTestId('repo-empty')).toBeVisible();
    await still(page);
    await snap(page, 'repos-empty', 'No repo yet', page1());

    // The Mac's own console: two repos with Mac paths, no loops.
    await ctx.world(page, 'mac');
    await openRepos(page, ctx.sp.baseUrl, 2);
    await expect(page.getByTestId('repo-path')).toHaveCount(0);
    await openPicker(page);
    await expect(page.getByTestId('repo-path')).toHaveAttribute('data-platform', 'darwin');
    await goTo(page, M.at);
    await folderRow(page, 'dotfiles').click();
    await expect(folderRow(page, M.repos!.api!.name).getByText(tEn('picker.tagRepo'))).toBeVisible();
    await still(page);
    await snap(page, 'repos-add-mac', 'macOS places, a registered folder tagged', withDialog());

    const places = page.getByTestId('folder-place');
    await places.filter({ hasText: tEn('folder.place.desktop') }).click();
    await expect(page.getByTestId('folder-unreadable')).toHaveAttribute('data-reason', 'denied');
    await expect(page.getByTestId('folder-retry')).toBeVisible();
    await expect(page.getByTestId('repo-name')).toHaveValue('Desktop');
    await still(page);
    await snap(page, 'repos-add-denied', 'macOS refuses to read a folder: where to grant access, Retry', withDialog());
  });
});

test.describe('phone Repos page against the preview', () => {
  test.describe.configure({ mode: 'serial' });
  test.use(PHONE_VIEW);
  const ctx = useServer();

  test('list, the folder picker, delete', async ({ page }) => {
    test.setTimeout(180_000);
    await ctx.world(page, 'overview');
    await openRepos(page, ctx.sp.baseUrl, 4);
    await expect(page.getByTestId('tabbar')).toBeVisible();
    await still(page);
    await snap(page, 'phone-repos-list', 'The repos on the phone', [regions.page()]);

    await chooseTools(page);
    await expect(page.locator('.fullsheet')).toBeVisible();
    // Every field of the picker is at least 16px, so the iPhone does not zoom into it.
    const sizes = await page.locator('.fullsheet input').evaluateAll((els) => els.map((e) => parseFloat(getComputedStyle(e).fontSize)));
    expect(sizes.length).toBeGreaterThan(0);
    for (const s of sizes) expect(s).toBeGreaterThanOrEqual(16);
    await still(page);
    await snap(page, 'phone-repos-add', 'The folder picker on the phone: a full-height sheet', [regions.page(), fullsheet()]);
    await closePicker(page);

    await repoRow(page, 'dotfiles').getByTestId('repo-menu').click();
    await page.getByTestId('repo-delete').click();
    await expect(page.getByTestId('repo-delete-dialog')).toBeVisible();
    await still(page);
    await snap(page, 'phone-repos-delete-confirm', 'Delete a repo on the phone: a sheet', [regions.page(), regions.sheet()]);
  });
});
