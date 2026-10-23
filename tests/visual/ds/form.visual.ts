// The new editor (UI uplift, task U18) next to the approved new preview (design/ds/preview/shots/): the 25 states of spec 5.6
// (20 desktop, 5 phone), light and dark = 50 pairs. Every state is rebuilt on the real app with real actions: a real server
// (test mode, test database) with the world of the new preview seeded (tests/support/preview-world.ts with DS_DATA_JS), the
// server and browser clocks at PREVIEW_NOW, typing into the editor, picking a repo, pressing save, the server answering with
// field errors or a version conflict. The regions are the whole page (plus the navigation bar on the phone), and the repo
// picker of `form-repo-pick` (the menu on the desktop, the sheet on the phone). No mask.
//
// The real console offers one executor (Claude); a test-mode server also offers Mock, and the editor shows the executor choice
// only when there is more than one. The preview draws the real console in every state but `form-exec-mock` (test mode), so the
// other states answer `GET /api/executors` with the Claude executor only, as the real console does.
import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { en } from '../../../shared/i18n/en';
import { DS_DATA_JS, loopId, PREVIEW_NOW, previewData, previewDirs, repoId, seedPreviewWorld, wipe } from '../../support/preview-world';
import { liveDbUrl, ServerProcess } from '../../support/server-process';
import { PHONE_VIEW, PREVIEW_VIEW, regions, setLang, snap, useNewUi, writeReport } from './kit';

/** The English text of a key of shared/i18n/en.ts with `{x}` filled in, like the app does. */
const tEn = (key: keyof typeof en, params: Record<string, string | number> = {}) =>
  en[key].replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));

test.beforeEach(({ page }) => useNewUi(page));
test.afterAll(() => writeReport('form'));

const PV = previewData(DS_DATA_JS);
const SAMPLE = (PV as unknown as { formSample: { name: string; prompt: string } }).formSample;
const API = repoId('api', DS_DATA_JS);
const PILOT = loopId('pilot', DS_DATA_JS);
const WIKI = loopId('wiki', DS_DATA_JS);
/** A time on the preview's day (Asia/Ho_Chi_Minh). */
const at = (hms: string) => new Date(`2026-10-18T${hms}+07:00`);

type LoopJson = {
  id: string;
  repo: { id: string };
  name: string;
  description: string;
  prompt: string;
  cron: string;
  timezone: string;
  timeoutSec: number | null;
  maxConcurrent: number;
  executor: { kind: string; config: unknown };
  version: number;
};

/** One server for a describe block; `world()` = a clean DB with the new preview's world (or none) and the clocks at PREVIEW_NOW. */
function useServer() {
  const ctx = {} as { sp: ServerProcess; db: pg.Pool; world(page: Page, o?: { empty?: boolean }): Promise<void> };
  test.beforeAll(async () => {
    ctx.sp = await ServerProcess.launch();
    ctx.db = new pg.Pool({ connectionString: liveDbUrl(), max: 2 });
    ctx.world = async (page, o = {}) => {
      expect((await ctx.sp.api('POST', '/api/__test/reset')).status).toBe(204);
      // The server clock BEFORE seeding, or the ticker would run the runs that are already overdue.
      expect((await ctx.sp.api('POST', '/api/__test/clock', { at: PREVIEW_NOW.toISOString() })).status).toBe(200);
      expect((await ctx.sp.api('POST', '/api/__test/dirs', { paths: previewDirs(DS_DATA_JS) })).status).toBe(204);
      await wipe(ctx.db);
      if (!o.empty) await seedPreviewWorld(ctx.db, {}, DS_DATA_JS);
      await page.clock.setFixedTime(PREVIEW_NOW);
    };
  });
  test.afterAll(async () => {
    await ctx.sp?.stop();
    await ctx.db?.end();
  });
  return ctx;
}

/** The real console's executors: `GET /api/executors` answers with Claude only (see the head of this file). */
const claudeOnly = (page: Page) =>
  page.route('**/api/executors', async (route) => {
    const res = await route.fetch();
    const json = (await res.json()) as { items: { kind: string }[] };
    await route.fulfill({ response: res, json: { ...json, items: json.items.filter((e) => e.kind === 'claude') } });
  });

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

async function openNew(page: Page, base: string) {
  await page.goto(`${base}/loops/new`);
  await expect(page.getByTestId('sched-out')).toBeVisible();
  await expect(page.getByTestId('f-model')).toBeVisible();
}

const fill = (page: Page, testId: string, value: string) => page.getByTestId(testId).fill(value);

/** Picks a repo: the menu on the desktop, the sheet on the phone. */
async function pickRepo(page: Page, id: string) {
  await page.getByTestId('f-repo').click();
  await page.getByTestId(`repo-opt-${id}`).click();
  await expect(page.getByTestId(`repo-opt-${id}`)).toHaveCount(0);
}

/** Turns on exactly the weekdays `days` on the Mon…Sun chips. */
async function pickDays(page: Page, days: number[]) {
  for (const d of [1, 2, 3, 4, 5, 6, 0]) {
    const chip = page.getByTestId(`sched-day-${d}`);
    const on = (await chip.getAttribute('aria-checked')) === 'true';
    if (on !== days.includes(d)) await chip.click();
  }
}

/** The new loop of the preview's board: name, repo acme-api, prompt; Claude opus / medium, no time limit. */
async function sample(page: Page) {
  await fill(page, 'f-name', SAMPLE.name);
  await pickRepo(page, API);
  await fill(page, 'f-prompt', SAMPLE.prompt);
}

async function daily(page: Page, time: string) {
  await page.getByTestId('sched-kind').selectOption('daily');
  await fill(page, 'sched-time', time);
  await expect(page.getByTestId('sched-out')).toHaveAttribute('data-state', 'ok');
}

async function weekly(page: Page) {
  await page.getByTestId('sched-kind').selectOption('weekly');
  await pickDays(page, [1, 3, 5]);
  await fill(page, 'sched-time', '08:30');
  await expect(page.getByTestId('sched-cron-out')).toHaveText('30 8 * * 1,3,5');
}

/**
 * The editor with 4 errors, as the preview draws it: the name taken, no repo, an empty prompt, a time limit of 30. The server
 * reports the taken name only when every other field is valid, so the first save picks a temporary repo (LOOP_NAME_TAKEN,
 * which the editor keeps until the name changes); the temporary repo is then deleted (as if from another tab), and the
 * second save reports the repo, the prompt and the time limit. The repo field goes back to "Choose a repo".
 */
async function errorsState(page: Page, ctx: { sp: ServerProcess; db: pg.Pool }) {
  const tmp = (await ctx.db.query<{ id: string }>(`INSERT INTO repos (id, name, path, created_at) VALUES (gen_random_uuid(), 'temp', 'C:\\temp', now()) RETURNING id`)).rows[0]!.id;
  await openNew(page, ctx.sp.baseUrl);
  await fill(page, 'f-name', PV.loops.wiki.name);
  await fill(page, 'f-description', 'Also scan the beta channel');
  await fill(page, 'f-prompt', 'x');
  await pickRepo(page, tmp);
  await weekly(page);
  await page.getByTestId('form-submit').click();
  await expect(page.getByTestId('error-f-name')).toBeVisible();
  expect((await fetch(`${ctx.sp.baseUrl}/api/repos/${tmp}`, { method: 'DELETE' })).status).toBe(204);
  await fill(page, 'f-prompt', '');
  await fill(page, 'f-timeout', '30');
  await page.getByTestId('form-submit').click();
  await expect(page.getByTestId('form-errors')).toContainText('4');
  await expect(page.getByTestId('error-f-repo')).toBeVisible();
  await expect(page.getByTestId('f-repo')).not.toContainText('temp');
  for (const id of ['f-name', 'f-prompt', 'f-timeout']) await expect(page.getByTestId(id)).toHaveAttribute('aria-invalid', 'true');
}

test.describe('desktop editor against the preview', () => {
  test.describe.configure({ mode: 'serial' });
  test.use(PREVIEW_VIEW);
  const ctx = useServer();
  const page1 = () => [regions.page()];

  test('a new loop and the schedule kinds', async ({ page }) => {
    test.setTimeout(180_000);
    await ctx.world(page);
    await claudeOnly(page);
    await openNew(page, ctx.sp.baseUrl);
    await expect(page.getByTestId('f-executor')).toHaveCount(0);
    await still(page);
    await snap(page, 'form-new', 'Defaults: no repo, every 30 minutes, Asia/Ho_Chi_Minh, opus, medium, no time limit', page1());

    await sample(page);
    // The preview draws this state at 14:40:42, so the next runs show the uneven gap at the end of the hour.
    await page.clock.setFixedTime(at('14:40:42'));
    await fill(page, 'sched-minutes', '7');
    await expect(page.getByTestId('sched-warn-unevenMinuteStep')).toBeVisible();
    await expect(page.getByTestId('sched-next').locator('li').first()).toContainText('14:42');
    await still(page);
    await snap(page, 'form-sched-minutes-uneven', 'Every 7 minutes: the uneven-gap warning', page1());
    await page.clock.setFixedTime(PREVIEW_NOW);

    await page.getByTestId('sched-kind').selectOption('hours');
    await fill(page, 'sched-hours', '2');
    await fill(page, 'sched-at-minute', '5');
    await expect(page.getByTestId('sched-next').locator('li').first()).toContainText('14:05');
    await still(page);
    await snap(page, 'form-sched-hours', 'Every 2 hours at minute 05', page1());

    await daily(page, '02:30');
    await expect(page.getByTestId('sched-next-when')).toHaveCount(5);
    await still(page);
    await snap(page, 'form-sched-daily', 'Every day at 02:30', page1());

    await weekly(page);
    await still(page);
    await snap(page, 'form-sched-weekly', 'Mon, Wed, Fri at 08:30', page1());

    await page.getByTestId('sched-kind').selectOption('monthly');
    await fill(page, 'sched-day', '31');
    await fill(page, 'sched-time', '09:00');
    await expect(page.getByTestId('sched-warn-missingMonthDay')).toBeVisible();
    await still(page);
    await snap(page, 'form-sched-monthly-warn', 'Day 31: the warning', page1());

    await page.getByTestId('sched-kind').selectOption('advanced');
    await fill(page, 'sched-cron', '0 9-17/2 * * 1-5');
    await expect(page.getByTestId('sched-desc')).toBeVisible();
    await still(page);
    await snap(page, 'form-sched-advanced', 'A cron with no built-in kind, with its description', page1());

    await fill(page, 'sched-cron', '61 8 * * 1-5');
    await expect(page.getByTestId('sched-cron-error')).toBeVisible();
    await expect(page.getByTestId('sched-out')).toHaveAttribute('data-state', 'error');
    await expect(page.getByTestId('form-submit')).toBeDisabled();
    await still(page);
    await snap(page, 'form-sched-advanced-error', 'An invalid cron: the error, Save locked', page1());
  });

  test('errors (English and Vietnamese), no repo chosen, saving', async ({ page }) => {
    test.setTimeout(180_000);
    await ctx.world(page);
    await claudeOnly(page);

    await errorsState(page, ctx);
    await still(page);
    await snap(page, 'form-errors', 'After Save: an error at each field and a summary', page1());

    await setLang(page, 'vi');
    await errorsState(page, ctx);
    await still(page);
    await snap(page, 'vi-form-errors', 'form-errors in Vietnamese', page1());
    await setLang(page, 'en');

    // No repo chosen: a single error (UC-21).
    await openNew(page, ctx.sp.baseUrl);
    await fill(page, 'f-name', SAMPLE.name);
    await fill(page, 'f-prompt', SAMPLE.prompt);
    await daily(page, '02:30');
    await page.getByTestId('form-submit').click();
    await expect(page.getByTestId('form-errors')).toContainText('1');
    await expect(page.getByTestId('error-f-repo')).toHaveText(tEn('val.repoRequired'));
    await expect(page.getByTestId('f-repo')).toHaveAttribute('aria-invalid', 'true');
    await still(page);
    await snap(page, 'form-repo-required', 'No repo chosen', page1());

    // Saving: POST /api/loops held.
    await openNew(page, ctx.sp.baseUrl);
    await sample(page);
    await weekly(page);
    await page.route('**/api/loops', (route) => (route.request().method() === 'POST' ? undefined : route.continue()));
    await page.getByTestId('form-submit').click();
    await expect(page.getByTestId('form-submit')).toHaveText(tEn('form.saving'));
    await expect(page.getByTestId('form-submit')).toBeDisabled();
    await still(page);
    await snap(page, 'form-saving', 'Saving', page1());
    await page.unroute('**/api/loops');
  });

  test('the repo picker, the Mock executor, no repo registered', async ({ page }) => {
    test.setTimeout(180_000);
    await ctx.world(page);
    await claudeOnly(page);

    await openNew(page, ctx.sp.baseUrl);
    await sample(page);
    await daily(page, '02:30');
    await page.getByTestId('f-repo').click();
    await expect(page.locator('.combo .menu').getByTestId('repo-opt-name')).toHaveCount(4);
    await expect(page.getByTestId('repo-manage')).toBeVisible();
    await page.mouse.move(1430, 890);
    await page.evaluate(() => window.scrollTo(0, 0));
    await fontsLoaded(page);
    await snap(page, 'form-repo-pick', 'The repo picker open, a repo whose folder is gone', [regions.page(), regions.menu()]);
    await page.keyboard.press('Escape');
    await expect(page.locator('.combo .menu')).toHaveCount(0);

    // Test mode: the server offers Mock too, so the editor shows the executor choice.
    await page.unroute('**/api/executors');
    await openNew(page, ctx.sp.baseUrl);
    await sample(page);
    await daily(page, '02:30');
    await page.getByTestId('f-executor-mock').click();
    await expect(page.getByTestId('f-duration')).toHaveValue('10');
    await expect(page.getByTestId('f-model')).toHaveCount(0);
    await still(page);
    await snap(page, 'form-exec-mock', 'Test mode: the Mock executor', page1());

    await claudeOnly(page);
    await ctx.world(page, { empty: true });
    await openNew(page, ctx.sp.baseUrl);
    await expect(page.getByTestId('repo-go-register')).toBeVisible();
    await expect(page.getByTestId('form-submit')).toBeDisabled();
    await still(page);
    await snap(page, 'form-no-repos', 'No repo registered: Register a repo', page1());
  });

  test('edit a running loop, a conflict, edit a Claude loop, a copy, loading', async ({ page }) => {
    test.setTimeout(180_000);
    await ctx.world(page);
    await claudeOnly(page);
    const base = ctx.sp.baseUrl;

    // "Issue backlog worker" works on run #69.
    await page.goto(`${base}/loops/${PILOT}/edit`);
    await expect(page.getByTestId('form-edit-running')).toContainText(tEn('editor.editRunning', { n: 69 }));
    await expect(page.getByTestId('f-effort')).toHaveAttribute('data-value', 'high');
    await still(page);
    await snap(page, 'form-edit-running', 'Editing a running loop: applies from the next run', page1());

    // Conflict: this tab opened the editor; "another tab" (the API) changes the prompt and the schedule at 14:02:10; this tab
    // picks effort max and saves.
    await page.goto(`${base}/loops/${PILOT}/edit`);
    await expect(page.getByTestId('f-name')).toHaveValue(PV.loops.pilot.name);
    const cur = (await ctx.sp.api<LoopJson>('GET', `/api/loops/${PILOT}`)).body;
    expect((await ctx.sp.api('POST', '/api/__test/clock', { at: at('14:02:10').toISOString() })).status).toBe(200);
    const other = {
      repoId: cur.repo.id,
      name: cur.name,
      description: cur.description,
      prompt: `${cur.prompt}\n(other tab)`,
      cron: '*/15 * * * *',
      timezone: cur.timezone,
      timeoutSec: cur.timeoutSec,
      maxConcurrent: cur.maxConcurrent,
      executor: cur.executor,
      version: cur.version,
    };
    expect((await ctx.sp.api('PUT', `/api/loops/${PILOT}`, other)).status).toBe(200);
    await page.getByTestId('f-effort-max').click();
    await page.getByTestId('form-submit').click();
    await expect(page.getByTestId('form-conflict')).toContainText('14:02:10');
    await expect(page.getByTestId('conflict-reload')).toBeVisible();
    await expect(page.getByTestId('conflict-overwrite')).toBeVisible();
    await still(page);
    await snap(page, 'form-conflict', 'VERSION_CONFLICT: Reload or Overwrite', page1());

    // Edit "Digest upstream releases": haiku, low, 600 seconds.
    await page.goto(`${base}/loops/${WIKI}/edit`);
    await expect(page.getByTestId('f-name')).toHaveValue(PV.loops.wiki.name);
    await page.getByTestId('f-model-haiku').click();
    await page.getByTestId('f-effort-low').click();
    await fill(page, 'f-timeout', '600');
    await expect(page.getByTestId('hint-f-timeout')).toHaveText(tEn('dur.m', { m: 10 }));
    await still(page);
    await snap(page, 'form-edit-claude', 'Haiku, low, 600 seconds', page1());

    // Duplicate from the Loops page (a fresh world: the conflict above changed the loop): the copy, stopped, its editor open
    // with the note.
    await ctx.world(page);
    await page.goto(`${base}/`);
    const row = page.locator(`[data-testid="loop-row"][data-loop-id="${PILOT}"]`);
    await row.getByTestId('row-menu').click();
    await page.getByTestId('menu-duplicate').click();
    await expect(page).toHaveURL(/\/edit$/);
    await expect(page.getByText(tEn('editor.duplicated'))).toBeVisible();
    await expect(page.getByTestId('f-name')).toHaveValue(tEn('loop.copySuffix', { name: PV.loops.pilot.name }));
    await expect(page.getByTestId('form-edit-running')).toHaveCount(0);
    await still(page);
    await snap(page, 'form-duplicate', 'The copy, stopped, its editor open', page1());

    // Loading: GET /api/loops/:id held.
    await page.route(`**/api/loops/${WIKI}`, () => undefined); // never answers
    await page.goto(`${base}/loops/${WIKI}/edit`);
    await expect(page.getByTestId('form-loading')).toBeVisible();
    await still(page);
    await snap(page, 'form-loading', 'Loading the loop', page1());
    await page.unroute(`**/api/loops/${WIKI}`);
  });
});

test.describe('phone editor against the preview', () => {
  test.describe.configure({ mode: 'serial' });
  test.use(PHONE_VIEW);
  const ctx = useServer();
  const phone = () => [regions.navbar(), regions.page()];

  /** Every field of the editor is at least 16px, so the iPhone does not zoom into it. */
  async function fieldsAt16(page: Page) {
    const sizes = await page.locator('.page input, .page textarea, .page select').evaluateAll((els) => els.map((e) => parseFloat(getComputedStyle(e).fontSize)));
    expect(sizes.length).toBeGreaterThan(0);
    for (const s of sizes) expect(s).toBeGreaterThanOrEqual(16);
  }

  test('new, every day, weekdays, errors, the repo sheet', async ({ page }) => {
    test.setTimeout(180_000);
    await ctx.world(page);
    await claudeOnly(page);

    await openNew(page, ctx.sp.baseUrl);
    await expect(page.getByTestId('tabbar')).toHaveCount(0);
    await expect(page.locator('.navbar .navbar-title')).toHaveText(tEn('editor.new'));
    await fieldsAt16(page);
    await still(page);
    await snap(page, 'phone-form-new', 'Defaults on the phone', phone());

    await sample(page);
    await daily(page, '02:30');
    await still(page);
    await snap(page, 'phone-form-sched-daily', 'Every day at 02:30 on the phone', phone());

    await page.getByTestId('f-repo').click();
    await expect(page.locator('.sheet').getByTestId('repo-opt-name')).toHaveCount(4);
    await expect(page.getByTestId('repo-manage')).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await fontsLoaded(page);
    await snap(page, 'phone-form-repo-pick', 'The repo sheet on the phone', [regions.navbar(), regions.page(), regions.sheet()]);
    await page.keyboard.press('Escape');
    await expect(page.locator('.sheet')).toHaveCount(0);

    await weekly(page);
    await still(page);
    await snap(page, 'phone-form-sched-weekly', 'Mon, Wed, Fri at 08:30 on the phone', phone());

    await errorsState(page, ctx);
    await fieldsAt16(page);
    await still(page);
    await snap(page, 'phone-form-errors', 'An error at each field on the phone', phone());
  });
});
