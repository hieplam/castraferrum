/// <reference lib="dom" />
// E2E UC-34, the console on a phone (UI uplift, task U24; spec G6, D13). One walk by touch through the whole job: create a loop,
// start it, follow its live log, open the run and its transcript, stop it from the Loops list, register a repo. After every step
// the page must not scroll sideways, every visible button, link and form control must be at least 44 by 44 (`--size-touch`),
// and on the tab roots the tab bar sits at the bottom of the screen. It runs in Chromium at 390 by 844 with
// touch (project chromium) and in WebKit as an emulated iPhone 15 (project webkit-phone). The loop is checked in the DB.
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { api, closeDb, fill, loopRows, pickRepo, reset } from '../support/form-kit';
import { box, offUiFont, textLeft } from '../support/frame-probe';
import { ensureTestRepo, TEST_REPO } from '../support/test-repo';
import { t } from '../support/ui-text';

/** `--size-touch` of design/ds/tokens.css: the smallest target a finger may be asked to hit. */
const TOUCH = 44;
const CHROMIUM_PHONE = { width: 390, height: 844 };

// chromium is a desktop project: this spec turns it into a 390 by 844 touch screen. webkit-phone keeps its iPhone 15.
test.use({
  viewport: async ({}, use, testInfo) => use(testInfo.project.name === 'webkit-phone' ? (testInfo.project.use.viewport ?? null) : CHROMIUM_PHONE),
  hasTouch: true,
  isMobile: async ({}, use, testInfo) => use(testInfo.project.name === 'webkit-phone' ? (testInfo.project.use.isMobile ?? true) : true),
});

test.afterAll(closeDb);
test.beforeEach(async ({ request }) => {
  await reset(request);
});

type Small = { what: string; w: number; h: number };

/**
 * Every visible button, link and form control whose target is smaller than TOUCH in either direction. The target of a control
 * is its own box joined with the boxes of its labels (`control.labels`): a tap on a label activates its control, so a field
 * labelled by its cell, or a search box that is a `label`, is measured by what the finger can actually hit.
 */
async function smallTargets(page: Page): Promise<Small[]> {
  return page.evaluate((min) => {
    const sel = 'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="tab"], [role="radio"], [role="checkbox"], [role="switch"], [role="menuitem"], [role="option"]';
    const out: { what: string; w: number; h: number }[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const own = el.getBoundingClientRect();
      if (own.width === 0 && own.height === 0) continue;
      const labels = 'labels' in el ? Array.from((el as HTMLInputElement).labels ?? []) : [];
      let [left, top, right, bottom] = [own.left, own.top, own.right, own.bottom];
      for (const l of labels) {
        const r = l.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        [left, top, right, bottom] = [Math.min(left, r.left), Math.min(top, r.top), Math.max(right, r.right), Math.max(bottom, r.bottom)];
      }
      const [w, h] = [right - left, bottom - top];
      if (w + 0.5 >= min && h + 0.5 >= min) continue;
      const id = el.getAttribute('data-testid');
      const name = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30);
      out.push({ what: `${el.tagName.toLowerCase()}${id ? `[${id}]` : ''} "${name}"`, w: Math.round(w), h: Math.round(h) });
    }
    return out;
  }, TOUCH);
}

/** The checks that hold after every step: no sideways scrolling, no target under 44 by 44, and the tab bar on the tab roots. */
async function phoneOk(page: Page, step: string, tabRoot: boolean) {
  await test.step(`${step}: fits the phone`, async () => {
    const { scrollWidth, innerWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
    expect(scrollWidth, `${step}: the page scrolls sideways`).toBeLessThanOrEqual(innerWidth);
    expect.soft(await smallTargets(page), `${step}: targets under ${TOUCH} by ${TOUCH}`).toEqual([]);
    const bar = page.getByTestId('tabbar');
    if (tabRoot) {
      await expect(bar).toBeVisible();
      const box = await bar.boundingBox();
      const height = await page.evaluate(() => window.innerHeight);
      expect(box && Math.abs(box.y + box.height - height) <= 1, `${step}: the tab bar is not at the bottom (${JSON.stringify(box)}, ${height})`).toBe(true);
    } else {
      await expect(bar).toHaveCount(0);
    }
  });
}

test.describe('the console on a phone', () => {
  let newRepo = '';
  test.afterEach(() => {
    if (newRepo) rmSync(newRepo, { recursive: true, force: true });
  });

  test('UC-34: create, start, live log, transcript, stop from the list and register a repo, all by touch with no sideways scrolling', { tag: '@UC-34' }, async ({ page, request }) => {
    await ensureTestRepo((method, url, body) => api(request, method, url, body));
    const name = 'Phone loop';

    // The Loops tab.
    await page.goto('/');
    await expect(page.getByTestId('tab-loops')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('list-create')).toBeVisible();
    await phoneOk(page, 'Loops tab', true);

    // Create a loop: `+`, fill the editor, Create loop.
    await page.getByTestId('list-create').tap();
    await expect(page).toHaveURL(/\/loops\/new$/);
    await expect(page.getByTestId('sched-out')).toHaveAttribute('data-state', 'ok');
    await phoneOk(page, 'Editor', false);
    await fill(page, 'f-name', name);
    await fill(page, 'f-prompt', 'Check the phone layout');
    await pickRepo(page, TEST_REPO.name);
    await page.getByTestId('f-executor-mock').tap();
    await fill(page, 'f-duration', '600');
    await phoneOk(page, 'Editor filled', false);
    await expect(page.getByTestId('form-submit')).toHaveText(t('editor.create'));
    await page.getByTestId('form-submit').tap();
    await expect(page).toHaveURL(/\/loops\/[0-9a-f-]{36}$/);
    const rows = await loopRows();
    expect(rows.map((r) => [r.name, r.status])).toEqual([[name, 'stopped']]);
    const loopId = rows[0]!.id;
    await expect(page.getByTestId('loop-header')).toContainText(name);
    await phoneOk(page, 'Loop page', false);

    // Start it from the action bar; the live log shows a line within 1 second.
    await page.getByTestId('loop-start').tap();
    await expect(page.getByTestId('live-log').locator('[data-seq]').first()).toBeVisible({ timeout: 1_000 });
    await expect(page.getByTestId('loop-stop')).toBeVisible();
    await phoneOk(page, 'Live log', false);

    // Open the run, then its transcript section.
    const run = page.getByTestId('run-row').first();
    await run.scrollIntoViewIfNeeded();
    await run.tap();
    await expect(page).toHaveURL(/\/runs\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId('run-page')).toBeVisible();
    const transcript = page.getByTestId('run-transcript-title');
    await transcript.scrollIntoViewIfNeeded();
    await expect(transcript).toBeInViewport();
    await phoneOk(page, 'Run and transcript', false);

    // Back to the Loops tab, and stop the loop from its row: Stop, then Stop in the sheet.
    await page.getByTestId('back-to-loop').tap();
    await expect(page.getByTestId('loop-header')).toContainText(name);
    await page.getByRole('link', { name: t('nav.loops'), exact: true }).tap();
    await expect(page).toHaveURL(/\/$/);
    const row = page.locator(`[data-testid="loop-row"][data-loop-id="${loopId}"]`);
    await expect(row).toHaveAttribute('data-status', 'running');
    await phoneOk(page, 'Loops tab, loop running', true);
    await row.getByTestId('row-stop').tap();
    await expect(page.getByTestId('stop-dialog')).toBeVisible();
    await phoneOk(page, 'Stop sheet', true);
    await page.getByTestId('stop-confirm').tap();
    await expect(row).toHaveAttribute('data-status', 'stopped');
    await expect.poll(async () => (await loopRows()).find((r) => r.id === loopId)?.status).toBe('stopped');
    await phoneOk(page, 'Loops tab, loop stopped', true);

    // Register a repo: the Repos tab, then `repo-add`, `repo-path`, `repo-submit`.
    newRepo = realpathSync(mkdtempSync(join(tmpdir(), 'cf-phone-')));
    await page.getByTestId('tab-repos').tap();
    await expect(page).toHaveURL(/\/repos$/);
    await expect(page.getByTestId('tab-repos')).toHaveAttribute('aria-current', 'page');
    await phoneOk(page, 'Repos tab', true);
    await page.getByTestId('repo-add').tap();
    await expect(page.getByTestId('repo-path')).toBeVisible();
    await phoneOk(page, 'Add repo', true);
    await page.getByTestId('repo-path').fill(newRepo);
    await page.getByTestId('repo-submit').tap();
    await expect(page.getByTestId('repo-path')).toHaveCount(0);
    const repos = (await api<{ items: { name: string; path: string }[] }>(request, 'GET', '/api/repos')).body.items;
    expect(repos.map((r) => r.path)).toContain(newRepo);
    await expect(page.getByTestId('repo-row-name').filter({ hasText: basename(newRepo) })).toBeVisible();
    await phoneOk(page, 'Repos tab, repo registered', true);
  });
});

/** `--space-4` of design/ds/tokens.css: the side gutter of a phone page, read from the page. */
async function gutter(page: Page): Promise<number> {
  return page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--space-4')));
}

// Defects found by U27, the acceptance of epic 63 (castraferrum#183, castraferrum#184, castraferrum#194): each check reads
// what the browser drew, in Chromium and in WebKit.
test.describe('the phone frame', () => {
  test('the folder picker: every control uses the UI font, and Cancel starts on the gutter', async ({ page }) => {
    await page.goto('/repos');
    await page.getByTestId('repo-add').tap();
    await page.locator('[data-testid="folder-list"][data-loading="false"]:not([data-path=""])').waitFor();
    await expect(page.getByTestId('folder-place').first()).toBeVisible();
    expect(await offUiFont(page, ['folder-cancel', 'folder-place', 'folder-go', 'folder-show-hidden', 'repo-submit'])).toEqual([]);
    const left = await textLeft(page.getByTestId('folder-cancel'));
    expect(left, 'the text of Cancel starts on the gutter').toBeGreaterThanOrEqual(await gutter(page));
    expect(left).toBeLessThan((await gutter(page)) + 2);
  });

  test('the editor: Cancel starts on the gutter, like the labels under it', async ({ page }) => {
    await page.goto('/loops/new');
    await expect(page.getByTestId('sched-out')).toHaveAttribute('data-state', 'ok');
    const left = await textLeft(page.getByTestId('form-cancel'));
    expect(left, 'the text of Cancel starts on the gutter').toBeGreaterThanOrEqual(await gutter(page));
    expect(left).toBeLessThan((await gutter(page)) + 2);
  });

  test('the large title of every tab root keeps the same top space, with or without a top action', async ({ page }) => {
    const top = async (path: string) => {
      await page.goto(path);
      const title = page.getByRole('heading', { level: 1 });
      await expect(title).toBeVisible();
      return (await box(title)).y;
    };
    // Repos has its `+` above the title; Loops without a loop and Settings have no top action.
    const repos = await top('/repos');
    await expect(page.getByTestId('repo-add')).toBeVisible();
    const tops = { repos, loopsEmpty: await top('/'), settings: await top('/settings') };
    expect(repos, 'the action row is above the title').toBeGreaterThan(20);
    expect(tops).toEqual({ repos, loopsEmpty: repos, settings: repos });
  });
});
