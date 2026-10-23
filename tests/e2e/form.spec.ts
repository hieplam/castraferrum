/// <reference lib="dom" />
// E2E create / edit form + schedule builder: UC-01 create, UC-02 friendly schedule, UC-09 edit + two-tab conflict, UC-10
// duplicate. All real: browser -> build -> Fastify -> Postgres (test DB, test mode); every test re-reads the DB to be sure of
// the exact cron and every field - not trusting the text on screen.
import { expect, test, type Page } from '@playwright/test';
import { describe, nextRuns, validate } from '../../shared/domain/schedule';
import { en } from '../../shared/i18n/en';
import { viSchedule, viScheduleGolden } from '../../shared/i18n/vi';
import { PREVIEW_NOW, api, closeDb, createLoop, db, fill, loopRow, loopRows, pickDays, pickRepo, reset, type LoopJson } from '../support/form-kit';
import { TEST_REPO } from '../support/test-repo';
import { copyName as serverCopyName } from '../support/server-text';
import { t } from '../support/ui-text';
import { isNewUi, pickScheduleKind, revealRowActions } from '../support/ui';

const TZ = 'Asia/Ho_Chi_Minh';

test.afterAll(closeDb);
test.beforeEach(async ({ request }) => {
  await reset(request);
});

async function openNew(page: Page) {
  await page.goto('/loops/new');
  await expect(page.getByTestId('sched-out')).toHaveAttribute('data-state', 'ok');
}
const submit = (page: Page) => page.getByTestId('form-submit').click();
const fieldError = (page: Page, id: string) => page.getByTestId(`error-${id}`);

/** The schedule kind the editor shows (spec 7.2): the Repeat select's value in the new UI, the pressed `sched-kind-<k>` button in the classic UI. */
async function expectKind(page: Page, kind: string) {
  if (await isNewUi(page)) await expect(page.getByTestId('sched-kind')).toHaveValue(kind);
  else await expect(page.getByTestId(`sched-kind-${kind}`)).toHaveAttribute('aria-checked', 'true');
}
/** The error summary above the form: `editor.errSummary` (a plural) in the new UI, `form.errSummary` in the classic UI. */
const errSummary = (fresh: boolean, n: number) => (fresh ? t(n === 1 ? 'editor.errSummary.one' : 'editor.errSummary.other', { n }) : t('form.errSummary', { n }));

/** Text of the next 5 runs as the form must show them: `Mon 19/10 · 08:30`, computed with the domain function, independent of the UI. */
function expectedRuns(cron: string, from: Date): string[] {
  const dow = ([0, 1, 2, 3, 4, 5, 6] as const).map((d) => en[`day.short.${d}`]);
  return nextRuns(cron, TZ, from, 5).map((d) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
    const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[p.weekday as string] ?? 0;
    return `${dow[wd]} ${p.day}/${p.month} · ${p.hour}:${p.minute}`;
  });
}

test.describe('create / edit form', () => {
  test('UC-01: create a loop - defaults match the spec, bad data errors at the right field and writes nothing to the DB, good data saves as Stopped', { tag: '@UC-01' }, async ({ page, request }) => {
    await openNew(page);
    const fresh = await isNewUi(page);
    // Defaults (spec § Model, D-UI6; phase 2): Every 30 minutes, Asia/Ho_Chi_Minh, no repo chosen, Claude opus / medium,
    // empty timeout = no limit.
    await expectKind(page, 'minutes');
    await expect(page.getByTestId('sched-minutes')).toHaveValue('30');
    await expect(page.getByTestId('sched-tz')).toHaveValue(TZ);
    await expect(page.getByTestId('f-repo')).toContainText(fresh ? t('editor.repoPlaceholder') : t('form.repo.placeholder'));
    await expect(page.getByTestId('f-executor-claude')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('f-model')).toHaveAttribute('data-value', 'opus');
    await expect(page.getByTestId('f-effort')).toHaveAttribute('data-value', 'medium');
    await expect(page.getByTestId('f-timeout')).toHaveValue('');

    // Empty name + repo + prompt -> errors at three fields, summary "3 fields", nothing in the DB.
    await submit(page);
    await expect(fieldError(page, 'f-name')).toHaveText(t('val.required'));
    await expect(page.getByTestId('error-f-repo')).toContainText(t('val.repoRequired'));
    await expect(fieldError(page, 'f-prompt')).toHaveText(t('val.required'));
    await expect(page.getByTestId('form-errors')).toHaveText(errSummary(fresh, 3));
    await expect(page.getByTestId('f-name')).toHaveAttribute('aria-invalid', 'true');
    expect(await loopRows()).toHaveLength(0);

    // Typing into a field with an error -> that field's error clears at once.
    await fill(page, 'f-name', 'Scan WorldSvr log');
    await expect(fieldError(page, 'f-name')).toHaveCount(0);
    await fill(page, 'f-description', 'Report new crashes');
    await fill(page, 'f-prompt', 'Read the log, summarize new crashes');
    await pickRepo(page, TEST_REPO.name);
    // Mock executor (test mode only - the real console has Claude only). Timeout + Mock out of range -> error at
    // the exact field (the server checks), still nothing in the DB.
    await page.getByTestId('f-executor-mock').click();
    await fill(page, 'f-timeout', '30');
    await fill(page, 'f-duration', '0');
    await fill(page, 'f-fail', '120');
    await submit(page);
    await expect(fieldError(page, 'f-timeout')).toHaveText(t('val.timeoutRangeOptional'));
    await expect(fieldError(page, 'f-duration')).toHaveText(t('val.durRange'));
    await expect(fieldError(page, 'f-fail')).toHaveText(t('val.failRange'));
    await expect(page.getByTestId('form-errors')).toHaveText(errSummary(fresh, 3));
    expect(await loopRows()).toHaveLength(0);

    await fill(page, 'f-timeout', '900');
    // The new UI writes the duration alone under the field (spec 5.6), the classic UI writes `= 15 min`.
    await expect(page.getByTestId('hint-f-timeout')).toContainText(fresh ? t('dur.m', { m: 15 }) : `= ${t('dur.m', { m: 15 })}`);
    await fill(page, 'f-duration', '20');
    await fill(page, 'f-fail', '5');
    await submit(page);
    await expect(page).toHaveURL(/\/loops\/[0-9a-f-]{36}$/);
    const rows = await loopRows();
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(page.url()).toContain(row.id);
    expect(row).toMatchObject({
      name: 'Scan WorldSvr log',
      description: 'Report new crashes',
      prompt: 'Read the log, summarize new crashes',
      cron: '*/30 * * * *',
      timezone: TZ,
      timeout_sec: 900,
      repo_id: (await api<{ items: { id: string; path: string }[] }>(request, 'GET', '/api/repos')).body.items.find((r) => r.path === TEST_REPO.path)!.id,
      executor_kind: 'mock',
      executor_config: { durationSec: 20, failRate: 5 },
      status: 'stopped',
      next_run_at: null,
    });
    // List (the list screen's API): the loop is Stopped, the server's schedule sentence matches the sentence the form showed.
    const list = await api<{ items: LoopJson[] }>(request, 'GET', '/api/loops');
    expect(list.body.items.map((l) => [l.name, l.status])).toEqual([['Scan WorldSvr log', 'stopped']]);
    const desc = await api<{ description: string }>(request, 'GET', `/api/schedule/preview?cron=${encodeURIComponent(row.cron)}&tz=${TZ}&lang=vi`);
    expect(desc.body.description).toBe(viSchedule.everyMinutes(30));
    const descEn = await api<{ description: string }>(request, 'GET', `/api/schedule/preview?cron=${encodeURIComponent(row.cron)}&tz=${TZ}`);
    expect(descEn.body.description).toBe('Every 30 minutes');

    // Duplicate name (different case) -> error at the name field, the DB still has one loop; rename and the error goes, it saves.
    await openNew(page);
    await fill(page, 'f-name', 'SCAN WORLDSVR LOG');
    await fill(page, 'f-prompt', 'p');
    await pickRepo(page, TEST_REPO.name);
    await submit(page);
    await expect(fieldError(page, 'f-name')).toHaveText(t('error.LOOP_NAME_TAKEN'));
    expect(await loopRows()).toHaveLength(1);
    await fill(page, 'f-name', 'Scan WorldSvr log 2');
    await expect(fieldError(page, 'f-name')).toHaveCount(0);
    await submit(page);
    await expect(page).toHaveURL(/\/loops\/[0-9a-f-]{36}$/);
    expect((await loopRows()).map((r) => r.name)).toEqual(['Scan WorldSvr log', 'Scan WorldSvr log 2']);
  });

  test('UC-02: schedule builder - Mon, Wed, Fri at 08:30 saves 30 8 * * 1,3,5, sentence + next 5 runs right; a bad cron cannot be saved', { tag: '@UC-02' }, async ({ page, request }) => {
    await page.clock.setFixedTime(PREVIEW_NOW);
    await openNew(page);
    const fresh = await isNewUi(page);
    await fill(page, 'f-name', 'Watch open PRs');
    await fill(page, 'f-prompt', 'gh pr list');
    await pickRepo(page, TEST_REPO.name);

    await pickScheduleKind(page, 'weekly');
    await pickDays(page, [1, 3, 5]);
    await fill(page, 'sched-time', '08:30');
    await expect(page.getByTestId('sched-desc')).toHaveText(describe('30 8 * * 1,3,5', 'en'));
    await expect(page.getByTestId('sched-desc')).toHaveText('At 08:30 on Monday, Wednesday, Friday');
    await expect(page.getByTestId('sched-cron-out')).toHaveText('30 8 * * 1,3,5');
    const shown = (await page.getByTestId('sched-next-when').allInnerTexts()).map((s) => s.replace(/\s+/g, ' ').trim());
    expect(shown).toEqual(expectedRuns('30 8 * * 1,3,5', PREVIEW_NOW));
    expect(shown[0]).toBe(`${en['day.short.1']} 19/10 · 08:30`);
    await expect(page.getByTestId('sched-next').locator('li').first()).toContainText(t('rel.in', { d: t('dur.hm', { h: 18, m: 29 }) }));
    // The server's sentence (same domain function, other process) equals the sentence the form shows - in both languages.
    const sv = await api<{ description: string }>(request, 'GET', `/api/schedule/preview?cron=${encodeURIComponent('30 8 * * 1,3,5')}&tz=${TZ}&lang=vi`);
    expect(sv.body.description).toBe(viScheduleGolden['30 8 * * 1,3,5']);
    const svEn = await api<{ description: string }>(request, 'GET', `/api/schedule/preview?cron=${encodeURIComponent('30 8 * * 1,3,5')}&tz=${TZ}&lang=en`);
    expect(svEn.body.description).toBe('At 08:30 on Monday, Wednesday, Friday');

    // Bad field in the builder -> error right at the field, save button locked; fix it and it clears.
    await fill(page, 'sched-time', 'eight');
    await expect(page.getByTestId('error-sched-time')).toBeVisible();
    await expect(page.getByTestId('form-submit')).toBeDisabled();
    await fill(page, 'sched-time', '08:30');
    await expect(page.getByTestId('form-submit')).toBeEnabled();

    await submit(page);
    await expect(page).toHaveURL(/\/loops\/[0-9a-f-]{36}$/);
    const [row] = await loopRows();
    expect(row?.cron).toBe('30 8 * * 1,3,5');

    // Reopen -> the Weekdays kind, Mon Wed Fri, the right time (round-trip).
    await page.goto(`/loops/${row!.id}/edit`);
    await expectKind(page, 'weekly');
    for (const d of [1, 2, 3, 4, 5, 6, 0]) await expect(page.getByTestId(`sched-day-${d}`)).toHaveAttribute('aria-checked', String([1, 3, 5].includes(d)));
    await expect(page.getByTestId('sched-time')).toHaveValue('08:30');

    // Every 7 minutes -> warning about the uneven gap.
    await openNew(page);
    await fill(page, 'sched-minutes', '7');
    await expect(page.getByTestId('sched-warn-unevenMinuteStep')).toContainText('60 is not divisible by 7');

    // Mistyped Advanced -> error at the right field, no next runs, cannot save (even with Enter).
    await fill(page, 'f-name', 'Bad cron');
    await fill(page, 'f-prompt', 'p');
    await pickScheduleKind(page, 'advanced');
    await expect(page.getByTestId('sched-cron')).toHaveValue('*/7 * * * *');
    await fill(page, 'sched-cron', '61 8 * * 1-5');
    const bad = validate('61 8 * * 1-5');
    expect(bad.ok).toBe(false);
    await expect(page.getByTestId('sched-cron-error')).toHaveText(`${t('error.INVALID_CRON')}${fresh ? ':' : ' —'} ${bad.ok ? '' : bad.error.message}`);
    await expect(page.getByTestId('sched-cron-error')).toContainText('Invalid minute field: "61" (accepts 0–59)');
    await expect(page.getByTestId('sched-out')).toHaveAttribute('data-state', 'error');
    await expect(page.getByTestId('sched-next')).toHaveCount(0);
    await expect(page.getByTestId('form-submit')).toBeDisabled();
    await page.getByTestId('sched-cron').press('Enter');
    expect((await loopRows()).map((r) => r.name)).toEqual(['Watch open PRs']);

    // A valid cron that fits no kind: reopen -> opens in Advanced by itself, text kept, sentence generated.
    const adv = await createLoop(request, { name: 'Office hours', prompt: 'p', cron: '0 9-17/2 * * 1-5' });
    await page.goto(`/loops/${adv.id}/edit`);
    await expectKind(page, 'advanced');
    await expect(page.getByTestId('sched-cron')).toHaveValue('0 9-17/2 * * 1-5');
    // The classic UI adds a note; the new UI says it with the Repeat select itself, which reads "Advanced (cron)" (spec 5.6: the
    // approved form-sched-advanced state has no note).
    if (fresh) await expect(page.getByTestId('sched-kind').locator('option:checked')).toHaveText(t('editor.kind.advanced'));
    else await expect(page.getByText(t('sched.autoAdvanced'))).toBeVisible();
    const advDesc = await api<{ description: string }>(request, 'GET', `/api/schedule/preview?cron=${encodeURIComponent('0 9-17/2 * * 1-5')}&tz=${TZ}&lang=en`);
    await expect(page.getByTestId('sched-desc')).toHaveText(advDesc.body.description);
  });

  test('UC-09: edit a loop - changing the schedule recomputes the next run, the running run keeps its old snapshot; two tabs editing at once -> conflict warning, no silent overwrite', { tag: '@UC-09' }, async ({ page, request, context }) => {
    test.setTimeout(90_000);
    const p1 = 'Old prompt - the running run must keep this one';
    const loop = await createLoop(request, { name: 'Edit while running', prompt: p1, cron: '0 3 * * *', executor: { kind: 'mock', config: { durationSec: 600, failRate: 0 } } });
    expect((await api(request, 'POST', `/api/loops/${loop.id}/start`)).status).toBe(200);
    await page.goto(`/loops/${loop.id}/edit`);
    const fresh = await isNewUi(page);
    await expect(page.getByTestId('form-edit-running')).toContainText(fresh ? t('editor.editRunning', { n: 1 }) : t('form.editRunning', { n: 1 }));
    // Reopens with every saved field.
    await expect(page.getByTestId('f-name')).toHaveValue('Edit while running');
    await expect(page.getByTestId('f-prompt')).toHaveValue(p1);
    await expectKind(page, 'daily');
    await expect(page.getByTestId('sched-time')).toHaveValue('03:00');
    await expect(page.getByTestId('f-duration')).toHaveValue('600');

    await fill(page, 'f-prompt', 'New prompt');
    await pickScheduleKind(page, 'minutes');
    await fill(page, 'sched-minutes', '15');
    await fill(page, 'f-fail', '7');
    await submit(page);
    await expect(page).toHaveURL(new RegExp(`/loops/${loop.id}$`));
    const after = await loopRow(loop.id);
    expect(after).toMatchObject({ prompt: 'New prompt', cron: '*/15 * * * *', version: 2, status: 'active', executor_config: { durationSec: 600, failRate: 7 } });
    // The next run is recomputed on the new schedule: the first */15 boundary (no longer 03:00).
    const next = after.next_run_at!;
    expect(next.getUTCMinutes() % 15).toBe(0);
    expect(next.getTime() - Date.now()).toBeLessThanOrEqual(15 * 60_000);
    const running = (await db().query<{ status: string; prompt_snapshot: string }>("SELECT status, prompt_snapshot FROM runs WHERE loop_id = $1 AND status = 'running'", [loop.id])).rows;
    expect(running).toEqual([{ status: 'running', prompt_snapshot: p1 }]);
    expect((await api(request, 'POST', `/api/loops/${loop.id}/stop`)).status).toBe(200);

    // Two tabs open the form at the same version 2. Tab B saves first (renames), tab A saves later (changes description) -> warning, the DB keeps B's version.
    const tabA = page;
    const tabB = await context.newPage();
    await tabA.goto(`/loops/${loop.id}/edit`);
    await tabB.goto(`/loops/${loop.id}/edit`);
    await expect(tabA.getByTestId('f-name')).toHaveValue('Edit while running');
    await expect(tabB.getByTestId('f-name')).toHaveValue('Edit while running');
    await fill(tabB, 'f-name', 'Name from tab B');
    await submit(tabB);
    await expect(tabB).toHaveURL(new RegExp(`/loops/${loop.id}$`));
    await fill(tabA, 'f-description', 'Description from tab A');
    await submit(tabA);
    const banner = tabA.getByTestId('form-conflict');
    await expect(banner).toContainText(fresh ? 'This loop was changed in another tab at' : 'The loop was changed in another tab at');
    await expect(banner).toContainText(t(fresh ? 'editor.conflictFields' : 'form.conflict.fields', { fields: t('form.name') }));
    await expect(tabA).toHaveURL(new RegExp(`/loops/${loop.id}/edit$`));
    expect(await loopRow(loop.id)).toMatchObject({ name: 'Name from tab B', description: '', version: 3 });

    // Reload -> the form shows tab B's version, A's unsaved text is lost; edit again and it saves (new version).
    await tabA.getByTestId('conflict-reload').click();
    await expect(banner).toHaveCount(0);
    await expect(tabA.getByTestId('f-name')).toHaveValue('Name from tab B');
    await expect(tabA.getByTestId('f-description')).toHaveValue('');
    await fill(tabA, 'f-description', 'Description from tab A');
    await submit(tabA);
    await expect(tabA).toHaveURL(new RegExp(`/loops/${loop.id}$`));
    expect(await loopRow(loop.id)).toMatchObject({ name: 'Name from tab B', description: 'Description from tab A', version: 4 });

    // Overwrite: tab B (open at version 4) saves after another edit -> warning; only pressing Overwrite writes B's version.
    await tabB.goto(`/loops/${loop.id}/edit`);
    await expect(tabB.getByTestId('f-description')).toHaveValue('Description from tab A');
    const v4 = (await api<LoopJson>(request, 'GET', `/api/loops/${loop.id}`)).body;
    expect((await api(request, 'PUT', `/api/loops/${loop.id}`, { repoId: v4.repo.id, name: v4.name, description: v4.description, prompt: 'Prompt from the third tab', cron: v4.cron, timeoutSec: v4.timeoutSec, executor: v4.executor, version: 4 })).status).toBe(200);
    await fill(tabB, 'f-fail', '0');
    await submit(tabB);
    await expect(tabB.getByTestId('form-conflict')).toContainText(t(fresh ? 'editor.conflictFields' : 'form.conflict.fields', { fields: t('form.prompt') }));
    expect(await loopRow(loop.id)).toMatchObject({ prompt: 'Prompt from the third tab', version: 5, executor_config: { failRate: 7 } });
    await tabB.getByTestId('conflict-overwrite').click();
    await expect(tabB).toHaveURL(new RegExp(`/loops/${loop.id}$`));
    expect(await loopRow(loop.id)).toMatchObject({ prompt: 'New prompt', version: 6, executor_config: { durationSec: 600, failRate: 0 } });
    await tabB.close();
  });

  test('UC-10: duplicate - row menu ⋯ -> "… (copy)" Stopped, the edit form open, no executions / runs carried over', { tag: '@UC-10' }, async ({ page, request }) => {
    test.setTimeout(60_000);
    // The source loop ran once (has an execution + run) then stopped.
    const src = await createLoop(request, { name: 'Clean old evidence', description: 'Delete evidence images older than 30 days', prompt: 'Clean the evidence branch', cron: '30 8 * * 1,3,5', timeoutSec: 600, executor: { kind: 'mock', config: { durationSec: 600, failRate: 0 } } });
    expect((await api(request, 'POST', `/api/loops/${src.id}/start`)).status).toBe(200);
    expect((await api(request, 'POST', `/api/loops/${src.id}/stop`)).status).toBe(200);
    const srcRuns = (await db().query('SELECT id FROM runs WHERE loop_id = $1', [src.id])).rowCount;
    expect(srcRuns).toBeGreaterThan(0);

    await page.goto('/');
    const fresh = await isNewUi(page);
    const row = page.locator(`[data-testid="loop-row"][data-loop-id="${src.id}"]`);
    await revealRowActions(row); // the new UI shows the row menu at rest (D9)
    await row.getByTestId('row-menu').click();
    await page.getByTestId('menu-duplicate').click();

    await expect(page).toHaveURL(/\/loops\/[0-9a-f-]{36}\/edit$/);
    const copyId = /\/loops\/([0-9a-f-]{36})\/edit$/.exec(page.url())![1]!;
    expect(copyId).not.toBe(src.id);
    const copyName = serverCopyName('Clean old evidence');
    await expect(page.getByText(fresh ? t('editor.duplicated') : t('form.duplicated'))).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(fresh ? t('editor.edit', { name: copyName }) : t('form.editTitle', { name: copyName }));
    // The form opens with the source loop's exact configuration.
    await expect(page.getByTestId('f-name')).toHaveValue(copyName);
    await expect(page.getByTestId('f-prompt')).toHaveValue('Clean the evidence branch');
    await expectKind(page, 'weekly');
    await expect(page.getByTestId('f-timeout')).toHaveValue('600');

    const copy = await loopRow(copyId);
    expect(copy).toMatchObject({ name: copyName, description: 'Delete evidence images older than 30 days', prompt: 'Clean the evidence branch', cron: '30 8 * * 1,3,5', timeout_sec: 600, status: 'stopped', version: 1, executor_config: { durationSec: 600, failRate: 0 } });
    const counts = async (id: string) => (await db().query<{ e: string; r: string }>('SELECT (SELECT count(*) FROM loop_executions WHERE loop_id = $1) AS e, (SELECT count(*) FROM runs WHERE loop_id = $1) AS r', [id])).rows[0];
    expect(await counts(copyId)).toEqual({ e: '0', r: '0' });
    expect((await db().query('SELECT id FROM runs WHERE loop_id = $1', [src.id])).rowCount).toBe(srcRuns); // the source keeps its history

    // Edit and save the copy like any loop.
    await fill(page, 'f-name', 'Clean new evidence');
    await submit(page);
    await expect(page).toHaveURL(new RegExp(`/loops/${copyId}$`));
    expect(await loopRow(copyId)).toMatchObject({ name: 'Clean new evidence', status: 'stopped', version: 2 });
    expect(await counts(copyId)).toEqual({ e: '0', r: '0' });
  });
});
