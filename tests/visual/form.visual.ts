// Shots of the REAL create / edit form (repo field + Claude executor + optional timeout) next to the approved preview
// shots (design/preview/shots/form-*, vi-form-errors) + pixel mismatch of the main pane (the list pane belongs to the list
// screen — not compared). Every state is rebuilt with real actions on a real server (test mode, test DB): typing into the
// form, picking a repo, pressing save, the server answering with field errors / a version conflict. The sample repos of
// the preview (4 repos, "acme-api (old)" missing its folder) are written straight into the DB + their folders forced
// present / missing (`/api/__test/dirs`). The browser clock is fixed at the preview "now" (14:00:42 on 18/10/2026) so the
// next 5 runs + "in 29 min" match the text.
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { previewData, previewDirs, repoId, seedRepos } from '../support/preview-world';
import { PREVIEW_NOW, SAMPLE_NEW, api, at, blur, closeDb, createLoop, db, fill, fillInfo, MOCK_LONG, pickDays, pickRepo, PILOT, type LoopJson } from '../support/form-kit';
import { PREVIEW_VIEW, regions, setLang, snap, tEn, writeReport } from './compare-kit';

test.use(PREVIEW_VIEW);
const MAIN = [regions.main()];
const API_REPO = previewData().repos.api!.name;
/** The loop whose name the error state reuses (LOOP_NAME_TAKEN) — preview form-errors. */
const TAKEN = previewData().loops.wiki;

/** Clean DB + the 4 sample repos of the preview (no loops). */
async function reset(request: APIRequestContext, repos = true): Promise<void> {
  expect((await api(request, 'POST', '/api/__test/reset')).status).toBe(204);
  expect((await api(request, 'POST', '/api/__test/dirs', { paths: previewDirs() })).status).toBe(204);
  if (repos) await seedRepos(db());
}

test.describe('create / edit form against the preview', () => {
  test.describe.configure({ mode: 'serial' });
  test.afterAll(async () => {
    await closeDb();
    writeReport('form');
  });
  test.beforeEach(async ({ page, request }) => {
    test.setTimeout(120_000);
    await reset(request);
    await page.clock.setFixedTime(PREVIEW_NOW);
  });

  async function openNew(page: Page) {
    await page.goto('/loops/new');
    await expect(page.getByTestId('sched-out')).toBeVisible();
    await expect(page.getByTestId('f-executor-claude')).toBeVisible();
  }
  const shot = async (page: Page, id: string, title: string) => {
    await blur(page);
    await page.mouse.move(0, 0);
    // Pressing save at the bottom scrolls the page down — regions are measured against the viewport, so scroll back up first.
    await page.evaluate(() => window.scrollTo(0, 0));
    await snap(page, id, title, MAIN);
  };
  /** Fields of SAMPLE_NEW: details + repo acme-api + Claude sonnet / medium + timeout 1,800. */
  async function sample(page: Page) {
    await fillInfo(page, SAMPLE_NEW);
    await pickRepo(page, API_REPO);
    await page.getByTestId('f-model-sonnet').click();
    await fill(page, 'f-timeout', '1800');
  }

  test('new loop + the six schedule kinds', async ({ page }) => {
    await openNew(page);
    await shot(page, 'form-new', 'New loop, defaults: no repo chosen, every 30 minutes, Claude opus / medium, empty timeout = no limit');

    await sample(page);
    await fill(page, 'sched-minutes', '7');
    await expect(page.getByTestId('sched-warn-unevenMinuteStep')).toBeVisible();
    // the preview sets now = 14:40:42 for this state so the next 5 runs show 14:56 → 15:00
    await page.clock.setFixedTime(at('14:40:42'));
    await expect(page.getByTestId('sched-next').locator('li').first()).toContainText('14:42');
    await shot(page, 'form-sched-minutes-uneven', 'Every 7 minutes → warning: uneven gap at the end of the hour');
    await page.clock.setFixedTime(PREVIEW_NOW);
    // the form recomputes "now" every second — wait until it is back at 14:00:42 (first run 14:07) before the next state
    await expect(page.getByTestId('sched-next').locator('li').first()).toContainText('14:07');

    await page.getByTestId('sched-kind-hours').click();
    await fill(page, 'sched-hours', '2');
    await fill(page, 'sched-at-minute', '05');
    await shot(page, 'form-sched-hours', 'Every 2 hours, at minute 05');

    await page.getByTestId('sched-kind-daily').click();
    await fill(page, 'sched-time', '08:30');
    await shot(page, 'form-sched-daily', 'Daily at 08:30');

    await page.getByTestId('sched-kind-weekly').click();
    await pickDays(page, [1, 3, 5]);
    await fill(page, 'sched-time', '08:30');
    await expect(page.getByTestId('sched-cron-out')).toHaveText('30 8 * * 1,3,5');
    await shot(page, 'form-sched-weekly', 'Weekdays Mon, Wed, Fri at 08:30');

    await page.getByTestId('sched-kind-monthly').click();
    await fill(page, 'sched-day', '31');
    await fill(page, 'sched-time', '09:00');
    await shot(page, 'form-sched-monthly-warn', 'Monthly on day 31 → warning');

    await page.getByTestId('sched-kind-advanced').click();
    await fill(page, 'sched-cron', '0 9-17/2 * * 1-5');
    await shot(page, 'form-sched-advanced', 'Advanced — a cron that matches no kind + its generated description');

    await fill(page, 'sched-cron', '61 8 * * 1-5');
    await expect(page.getByTestId('form-submit')).toBeDisabled();
    await shot(page, 'form-sched-advanced-error', 'Advanced typed wrong → error right away, no next runs, save button locked');
  });

  /**
   * The form with 4 errors like the preview: name taken + no repo + empty prompt + timeout 30. The server only reports the
   * taken name when every other field is valid → the first save picks a temporary repo (valid enough) →
   * LOOP_NAME_TAKEN, which the form keeps until the name changes; delete the temporary repo (as if from another tab), then
   * save again → repo `unknownRepo` ("Choose a repo"), the repo field back to "not chosen".
   */
  async function errorsState(page: Page, request: APIRequestContext) {
    const tmp = (await db().query<{ id: string }>(`INSERT INTO repos (id, name, path, created_at) VALUES (gen_random_uuid(), 'temp', 'C:\\temp', now()) RETURNING id`)).rows[0]!.id;
    await openNew(page);
    await fillInfo(page, { name: TAKEN.name, desc: 'Also scan the beta channel', prompt: 'x' });
    await pickRepo(page, 'temp');
    await page.getByTestId('sched-kind-weekly').click();
    await pickDays(page, [1, 3, 5]);
    await fill(page, 'sched-time', '08:30');
    await page.getByTestId('form-submit').click();
    await expect(page.getByTestId('error-f-name')).toBeVisible();
    expect((await api(request, 'DELETE', `/api/repos/${tmp}`)).status).toBe(204);
    await fill(page, 'f-prompt', '');
    await fill(page, 'f-timeout', '30');
    await page.getByTestId('form-submit').click();
    await expect(page.getByTestId('form-errors')).toContainText(/4/);
    await expect(page.getByTestId('f-repo')).not.toContainText('temp');
  }

  test('form with errors (en + vi), saving, no repo chosen', async ({ page, request }) => {
    await createLoop(request, { name: TAKEN.name, prompt: 'p', cron: '5 */2 * * *', repoId: repoId('api') });
    await errorsState(page, request);
    await shot(page, 'form-errors', 'Name taken, no repo, empty prompt, timeout out of range — error at each field + summary');

    await setLang(page, 'vi');
    await errorsState(page, request);
    await shot(page, 'vi-form-errors', 'Form with errors, Vietnamese UI');
    await setLang(page, 'en');

    // No repo chosen: a single error (UC-21).
    await openNew(page);
    await fillInfo(page, SAMPLE_NEW);
    await page.getByTestId('f-model-sonnet').click();
    await fill(page, 'f-timeout', '1800');
    await page.getByTestId('form-submit').click();
    await expect(page.getByTestId('form-errors')).toContainText(/1/);
    await shot(page, 'form-repo-required', 'Pressing Create with no repo chosen → error at the Repo field + summary');

    // Saving: POST /api/loops held.
    await openNew(page);
    await sample(page);
    await page.getByTestId('sched-kind-weekly').click();
    await pickDays(page, [1, 3, 5]);
    await fill(page, 'sched-time', '08:30');
    await page.route('**/api/loops', (route) => (route.request().method() === 'POST' ? undefined : route.continue()));
    await page.getByTestId('form-submit').click();
    await expect(page.getByTestId('form-submit')).toHaveText(tEn('form.saving'));
    await shot(page, 'form-saving', 'Saving (button locked)');
    await page.unroute('**/api/loops');
  });

  test('repo field: open list, no repo yet; Mock executor (test mode only)', async ({ page, request }) => {
    await openNew(page);
    await fillInfo(page, SAMPLE_NEW);
    await page.getByTestId('f-model-sonnet').click();
    await fill(page, 'f-timeout', '1800');
    await page.getByTestId('f-repo').click();
    await expect(page.locator('.combo').getByRole('option')).toHaveCount(4);
    await page.locator('.combo').getByRole('option').first().hover();
    await page.evaluate(() => window.scrollTo(0, 0));
    await snap(page, 'form-repo-pick', 'Repo field open: name + path; a repo whose folder is gone has a warning; Manage repos →', MAIN);
    await page.keyboard.press('Escape');

    await openNew(page);
    await sample(page);
    await page.getByTestId('f-executor-mock').click();
    await fill(page, 'f-timeout', '');
    await expect(page.getByTestId('f-duration')).toHaveValue('10');
    await shot(page, 'form-exec-mock', 'Mock executor (test mode only — the real console has none): Mock fields instead of model / effort, empty timeout');

    await reset(request, false);
    await openNew(page);
    await expect(page.getByTestId('repo-go-register')).toBeVisible();
    await expect(page.getByTestId('form-submit')).toBeDisabled();
    await shot(page, 'form-no-repos', 'No repo registered yet → Repo field locked, "Register a repo →" button');
  });

  test('edit a running loop, conflict, edit a Claude loop, duplicate, loading', async ({ page, request }) => {
    // Run #69 in progress: set the run counter to 68, Start with the long-running Mock (no real Claude), then switch it to
    // Claude opus / high (applies from the next run) — the form sees a Claude loop with a run in progress, like the preview.
    const pilot = await createLoop(request, { ...PILOT, repoId: repoId('api'), executor: MOCK_LONG });
    await db().query('UPDATE loops SET run_counter = 68 WHERE id = $1', [pilot.id]);
    expect((await api(request, 'POST', `/api/loops/${pilot.id}/start`)).status).toBe(200);
    const v1 = (await api<LoopJson>(request, 'GET', `/api/loops/${pilot.id}`)).body;
    expect((await api(request, 'PUT', `/api/loops/${pilot.id}`, { ...PILOT, repoId: repoId('api'), version: v1.version })).status).toBe(200);
    await page.goto(`/loops/${pilot.id}/edit`);
    await expect(page.getByTestId('form-edit-running')).toContainText(tEn('form.editRunning', { n: 69 }));
    await expect(page.getByTestId('f-effort')).toHaveAttribute('data-value', 'high');
    await shot(page, 'form-edit-running', 'Editing a running Claude loop — applies from the next run');
    expect((await api(request, 'POST', `/api/loops/${pilot.id}/stop`)).status).toBe(200);

    // Conflict: this tab opens the form, "another tab" (the API) changes the prompt + schedule at 14:02:10, this tab
    // switches effort to max and saves.
    await page.goto(`/loops/${pilot.id}/edit`);
    await expect(page.getByTestId('f-name')).toHaveValue(PILOT.name);
    const cur = (await api<LoopJson>(request, 'GET', `/api/loops/${pilot.id}`)).body;
    await api(request, 'POST', '/api/__test/clock', { at: '2026-10-18T07:02:10.000Z' });
    expect((await api(request, 'PUT', `/api/loops/${pilot.id}`, { ...PILOT, repoId: repoId('api'), prompt: `${PILOT.prompt}\n(other tab)`, cron: '*/15 * * * *', version: cur.version })).status).toBe(200);
    await page.getByTestId('f-effort-max').click();
    await page.getByTestId('form-submit').click();
    await expect(page.getByTestId('form-conflict')).toContainText('14:02:10');
    await shot(page, 'form-conflict', 'Conflict while editing — Reload / Overwrite');

    // Edit a Claude loop haiku / low, timeout 600 (preview form-edit-claude: "Check test coverage").
    await reset(request);
    const D = previewData().loops.debt;
    const debt = await createLoop(request, {
      name: D.name,
      description: D.desc,
      prompt: D.prompt,
      cron: '*/30 * * * *',
      timeoutSec: D.timeout,
      repoId: repoId('api'),
      executor: { kind: 'claude', config: { model: D.claude.model, effort: D.claude.effort } },
    });
    await page.goto(`/loops/${debt.id}/edit`);
    await expect(page.getByTestId('f-model')).toHaveAttribute('data-value', 'haiku');
    await shot(page, 'form-edit-claude', 'Editing a Claude loop: haiku / low, timeout 600 seconds');

    // Duplicate: ⋯ menu → Duplicate on a list row → the copy "… (copy)" opens its edit form with a note.
    await reset(request);
    const src = await createLoop(request, { ...PILOT, repoId: repoId('api') });
    // The server still names a copy with its old Vietnamese suffix (server texts are translated in a later step), while
    // the English preview shows `loop.copySuffix`. Until then the copy is renamed to that English name before the UI
    // reads it; once the server writes the English name itself, this does nothing.
    const copyName = tEn('loop.copySuffix', { name: PILOT.name });
    await page.route('**/api/loops/*/duplicate', async (route) => {
      const res = await route.fetch();
      const copy = (await res.json()) as LoopJson;
      if (copy.name === copyName) return route.fulfill({ response: res });
      const put = await api<LoopJson>(request, 'PUT', `/api/loops/${copy.id}`, { ...PILOT, name: copyName, repoId: repoId('api'), version: copy.version });
      expect(put.status, JSON.stringify(put.body)).toBe(200);
      await route.fulfill({ response: res, json: put.body });
    });
    await page.goto('/');
    const row = page.locator(`[data-testid="loop-row"][data-loop-id="${src.id}"]`);
    await row.hover();
    await row.getByTestId('row-menu').click();
    await page.getByTestId('menu-duplicate').click();
    await expect(page).toHaveURL(/\/edit$/);
    await expect(page.getByText(tEn('form.duplicated'))).toBeVisible();
    await expect(page.getByTestId('f-name')).toHaveValue(copyName);
    await page.unroute('**/api/loops/*/duplicate');
    await shot(page, 'form-duplicate', 'Duplicate: the copy is Stopped, its edit form open');

    // Loading: GET /api/loops/:id held.
    await page.route(`**/api/loops/${src.id}`, () => {});
    await page.goto(`/loops/${src.id}/edit`);
    await expect(page.getByTestId('form-loading')).toBeVisible();
    await shot(page, 'form-loading', 'Edit form loading the loop');
  });
});
