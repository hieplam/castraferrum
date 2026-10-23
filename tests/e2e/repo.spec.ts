/// <reference lib="dom" />
// E2E phase 2 (SPEC-phase-2 § New use cases): UC-19 register a repo, UC-20 delete a repo, UC-21 create / edit a Claude loop,
// UC-23 repo vanishes while running, UC-24 no timeout, UC-25 repo on the list + filter by repo. UC-22 (real Claude) is in
// claude.spec.ts. All real: browser -> build -> Fastify -> Postgres (test DB, test mode); every result is checked
// with a SELECT straight on the DB. No test opens real Claude: test mode only opens Claude in a folder `lc-real-claude-*`
// (server/adapters/executors/claude/test-mode-query.ts); runs that must last long use Mock (test mode only).
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { REPO_MISSING_PREFIX } from '../../shared/domain/cost';
import { api, closeDb, db, fill, MOCK_LONG, pickRepo } from '../support/form-kit';
import { t } from '../support/ui-text';
import { deleteRepo, openFolderPicker, pickScheduleKind, registerRepo } from '../support/ui';

test.use({ timezoneId: 'Asia/Ho_Chi_Minh' });
test.afterAll(closeDb);
test.beforeEach(async ({ request }) => {
  expect((await api(request, 'POST', '/api/__test/reset')).status).toBe(204);
});

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
/** A REAL temp folder (canonical form - exactly the string the server stores after realpath). */
const tmpRepo = (prefix = 'lc24-e2e-') => realpathSync(mkdtempSync(join(tmpdir(), prefix)));
const rows = async <T = Json>(sql: string, params: unknown[] = []) => (await db().query(sql, params)).rows as T[];
const count = async (sql: string, params: unknown[] = []) => Number((await rows<{ n: string }>(sql, params))[0]!.n);

async function registerApi(request: APIRequestContext, path: string, name?: string): Promise<Json> {
  const r = await api<Json>(request, 'POST', '/api/repos', { path, ...(name ? { name } : {}) });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body;
}
async function loopApi(request: APIRequestContext, body: Json): Promise<Json> {
  const r = await api<Json>(request, 'POST', '/api/loops', { cron: '0 0 1 1 *', prompt: 'p', ...body });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body;
}
const repoRow = (page: Page, name: string) => page.getByTestId('repo-row').filter({ has: page.getByTestId('repo-row-name').filter({ hasText: new RegExp(`^${name}$`) }) });

test.describe('repo + Claude executor (phase 2)', () => {
  test('UC-19: register a repo - name auto-filled from the folder; a missing folder / duplicate path / duplicate name -> error at the field, nothing written to the DB', { tag: '@UC-19' }, async ({ page }) => {
    const dir = tmpRepo();
    await page.goto('/');
    await page.getByTestId('nav-repos').click(); // D-UI9: reached through the Loops · Repos entry in the top bar
    await expect(page).toHaveURL(/\/repos$/);
    await expect(page.getByTestId('repo-empty')).toBeVisible();

    await openFolderPicker(page); // a repo is registered from the folder picker (spec 7.2)
    await page.getByTestId('repo-path').fill(dir);
    await expect(page.getByTestId('repo-name')).toHaveValue(basename(dir)); // D-UI10: name auto-filled
    await page.getByTestId('repo-submit').click();
    await expect(page.getByTestId('repo-row')).toHaveCount(1);
    const [saved] = await rows('SELECT id, name, path FROM repos');
    expect(saved).toMatchObject({ name: basename(dir), path: dir });
    const row = page.getByTestId('repo-row').first();
    await expect(row).toContainText(dir);
    await expect(row).toHaveAttribute('data-repo-id', saved!.id);
    // The picker closes after registering (spec 7.2).
    await expect(page.getByTestId('folder-picker')).toHaveCount(0);
    await expect(page.getByTestId('nav-repos-count')).toHaveText('1');

    // Folder does not exist -> error at the path field; the DB still has one repo.
    await registerRepo(page, join(dir, 'missing'));
    await expect(page.getByTestId('error-repo-path')).toHaveText(t('repo.val.notFound'));
    expect(await count('SELECT count(*) AS n FROM repos')).toBe(1);

    // Duplicate path (typed another way: a trailing "\") -> error at the field, names the existing repo (D-UI21).
    await registerRepo(page, `${dir}\\`);
    await expect(page.getByTestId('error-repo-path')).toHaveText(t('picker.pathTaken', { name: basename(dir) }));
    await expect(page.getByTestId('error-repo-name')).toHaveCount(0);
    expect(await count('SELECT count(*) AS n FROM repos')).toBe(1);

    // Duplicate name (different case) at another folder -> error at the Name field.
    const other = tmpRepo();
    await page.getByTestId('repo-path').fill(other);
    await page.getByTestId('repo-name').fill(basename(dir).toUpperCase());
    await page.getByTestId('repo-submit').click();
    await expect(page.getByTestId('error-repo-name')).toHaveText(t('error.REPO_NAME_TAKEN'));
    expect(await count('SELECT count(*) AS n FROM repos')).toBe(1);
    // Fix the name -> it registers, the table is sorted by name.
    await page.getByTestId('repo-name').fill('another');
    await page.getByTestId('repo-submit').click();
    await expect(page.getByTestId('repo-row')).toHaveCount(2);
    expect((await rows('SELECT name, path FROM repos ORDER BY lower(name)')).map((r) => r.name)).toEqual(
      (await page.getByTestId('repo-row-name').allInnerTexts()),
    );
  });

  test('UC-20: delete a repo - no loop uses it -> it disappears; a loop still uses it (even an archived one) -> refused, names each loop', { tag: '@UC-20' }, async ({ page, request }) => {
    const free = await registerApi(request, tmpRepo(), 'free-repo');
    const used = await registerApi(request, tmpRepo(), 'in-use');
    await loopApi(request, { name: 'Loop A', repoId: used.id, executor: MOCK_LONG });
    const b = await loopApi(request, { name: 'Loop B', repoId: used.id, executor: MOCK_LONG });
    expect((await api(request, 'POST', `/api/loops/${b.id}/archive`)).status).toBe(204);

    await page.goto('/repos');
    await expect(repoRow(page, 'in-use').getByTestId('repo-loop-count')).toHaveText(t('repos.loops.other', { n: 2 }));
    await expect(repoRow(page, 'free-repo').getByTestId('repo-loop-count')).toHaveText(t('repos.loops.zero'));

    // A loop still uses it -> red banner names them (the archived loop is marked "(archived)"), the repo stays in the DB (D-UI20).
    await deleteRepo(repoRow(page, 'in-use'));
    const usedBy = `Loop A, ${t('repo.inUse.archived', { name: 'Loop B' })}`;
    await expect(page.getByTestId('repo-in-use')).toHaveText(t('repos.deleteBlocked', { list: usedBy }));
    expect(await count('SELECT count(*) AS n FROM repos WHERE id = $1', [used.id])).toBe(1);

    // No loop uses it -> confirmation box -> gone from the table + DB.
    await deleteRepo(repoRow(page, 'free-repo'));
    await expect(page.getByTestId('repo-delete-dialog')).toContainText(t('repos.deleteTitle', { name: 'free-repo' }));
    await page.getByTestId('repo-delete-cancel').click();
    expect(await count('SELECT count(*) AS n FROM repos WHERE id = $1', [free.id])).toBe(1);
    await deleteRepo(repoRow(page, 'free-repo'));
    await page.getByTestId('repo-delete-confirm').click();
    await expect(page.getByTestId('repo-row')).toHaveCount(1);
    expect(await count('SELECT count(*) AS n FROM repos WHERE id = $1', [free.id])).toBe(0);
  });

  test('UC-21: create / edit a Claude loop on the form - pick a repo, Claude opus / medium by default, empty timeout; no repo -> error at the field', { tag: '@UC-21' }, async ({ page, request }) => {
    const a = await registerApi(request, tmpRepo(), 'repo A');
    const b = await registerApi(request, tmpRepo(), 'repo B');
    await page.goto('/loops/new');
    await expect(page.getByTestId('sched-out')).toHaveAttribute('data-state', 'ok');
    await fill(page, 'f-name', 'Claude loop');
    await fill(page, 'f-prompt', 'Read the README, summarize in one line.');
    // No repo -> error at the Repo field, nothing written to the DB.
    await page.getByTestId('form-submit').click();
    await expect(page.getByTestId('error-f-repo')).toContainText(t('val.repoRequired'));
    await expect(page.getByTestId('form-errors')).toHaveText(t('editor.errSummary.one'));
    expect(await count('SELECT count(*) AS n FROM loops')).toBe(0);

    await pickRepo(page, 'repo A');
    // The editor's field names the repo; the note under it gives its folder (spec 5.6).
    await expect(page.getByTestId('f-repo')).toHaveText('repo A');
    await expect(page.getByText(t('editor.repoNote', { path: a.path }), { exact: true })).toBeVisible();
    await page.getByTestId('form-submit').click();
    await expect(page).toHaveURL(/\/loops\/[0-9a-f-]{36}$/);
    const [loop] = await rows('SELECT id, repo_id, executor_kind, executor_config, timeout_sec, status FROM loops');
    expect(loop).toMatchObject({ repo_id: a.id, executor_kind: 'claude', executor_config: { model: 'opus', effort: 'medium' }, timeout_sec: null, status: 'stopped' });
    // Loop detail: repo + Claude + no limit (read from the API, not the form's text). They show on the loop settings card.
    await expect(page.getByTestId('config-repo')).toContainText('repo A');
    await expect(page.getByTestId('config-executor')).toContainText(t('loop.meta.claude', { model: 'opus', effort: 'medium' }));
    await expect(page.getByTestId('config-timeout')).toContainText(t('loopSettings.noLimit'));

    // Edit: repo B, haiku / low, timeout 600 -> the DB has every field right.
    await page.getByTestId('loop-edit').click();
    await expect(page.getByTestId('f-model')).toHaveAttribute('data-value', 'opus');
    await pickRepo(page, 'repo B');
    await page.getByTestId('f-model-haiku').click();
    await page.getByTestId('f-effort-low').click();
    await fill(page, 'f-timeout', '600');
    await page.getByTestId('form-submit').click();
    await expect(page).toHaveURL(new RegExp(`/loops/${loop!.id}$`));
    expect((await rows('SELECT repo_id, executor_config, timeout_sec, version FROM loops WHERE id = $1', [loop!.id]))[0]).toEqual({
      repo_id: b.id,
      executor_config: { model: 'haiku', effort: 'low' },
      timeout_sec: 600,
      version: 2,
    });
    await expect(page.getByTestId('config-executor')).toContainText(t('loop.meta.claude', { model: 'haiku', effort: 'low' }));
  });

  test('UC-23: the repo folder vanishes while running -> run failed "Repo does not exist", no session; the loop keeps running, the next tick still gets a run', { tag: '@UC-23' }, async ({ page, request }) => {
    const dir = tmpRepo();
    const repo = await registerApi(request, dir, 'will-vanish');
    const loop = await loopApi(request, { name: 'Repo-lost loop', repoId: repo.id, cron: '* * * * *', executor: { kind: 'claude', config: { model: 'haiku', effort: 'low' } } });
    rmSync(dir, { recursive: true }); // the folder is deleted / moved after registering

    await page.goto(`/loops/${loop.id}`);
    await page.getByTestId('loop-start').click();
    // A state of the now card, which names the missing folder (spec 7.1).
    await expect(page.getByTestId('now-card')).toHaveAttribute('data-state', 'last-failed', { timeout: 10_000 });
    await expect(page.getByTestId('last-run-repo-missing')).toHaveText(t('now.repoMissing', { path: dir }));
    const [run1] = await rows('SELECT id, iteration, status, error, session_id FROM runs WHERE loop_id = $1', [loop.id]);
    expect(run1).toMatchObject({ iteration: 1, status: 'failed', error: `${REPO_MISSING_PREFIX}${dir}`, session_id: null });
    expect((await rows('SELECT status FROM loops WHERE id = $1', [loop.id]))[0]).toEqual({ status: 'active' });

    // Run screen: no session ("the run failed before a session opened"), no cost, no resume command, a button to the Repos page.
    await page.goto(`/runs/${run1!.id}`);
    // The run page has no session cell without a session; the transcript says why there is none.
    await expect(page.getByTestId('run-transcript-note')).toHaveAttribute('data-mode', 'noSession');
    await expect(page.getByTestId('run-transcript-note')).toHaveText(t('tx.note.noSession'));
    await expect(page.getByTestId('run-session')).toHaveCount(0);
    await expect(page.getByTestId('run-cost')).toHaveText('-');
    await expect(page.getByTestId('run-resume')).toHaveCount(0);
    await page.getByTestId('open-repos').click();
    await expect(page).toHaveURL(/\/repos$/);
    // D-UI11: the repo table warns that the folder is gone (GET /api/repos -> exists = false).
    await expect(repoRow(page, 'will-vanish').getByTestId('repo-gone')).toHaveText(t('status.folderGone'));
    const api1 = (await api<{ items: Json[] }>(request, 'GET', '/api/repos')).body.items.find((r) => r.id === repo.id);
    expect(api1).toMatchObject({ exists: false, loopCount: 1 });

    // The next tick still runs (a new run, same execution).
    expect((await api(request, 'POST', '/api/__test/clock', { advanceMs: 61_000 })).status).toBe(200);
    await expect.poll(async () => count('SELECT count(*) AS n FROM runs WHERE loop_id = $1', [loop.id]), { timeout: 10_000 }).toBe(2);
    expect(await count(`SELECT count(DISTINCT execution_id) AS n FROM runs WHERE loop_id = $1`, [loop.id])).toBe(1);
    expect((await rows('SELECT status FROM loops WHERE id = $1', [loop.id]))[0]).toEqual({ status: 'active' });
    expect((await api(request, 'POST', `/api/loops/${loop.id}/stop`)).status).toBe(200);
  });

  test('UC-24: empty timeout = no limit - advance the clock 2 days, the run keeps going, never timed_out', { tag: '@UC-24' }, async ({ page, request }) => {
    const repo = await registerApi(request, tmpRepo(), 'repo');
    await page.goto('/loops/new');
    await fill(page, 'f-name', 'Runs forever');
    await fill(page, 'f-prompt', 'Fix issues until none are left');
    await pickRepo(page, 'repo');
    await pickScheduleKind(page, 'advanced');
    await fill(page, 'sched-cron', '0 0 1 1 *'); // yearly - no schedule tick gets in when the clock is advanced
    await page.getByTestId('f-executor-mock').click(); // a long run without opening Claude (Mock exists in test mode only)
    await fill(page, 'f-duration', '600');
    await expect(page.getByTestId('f-timeout')).toHaveValue('');
    await page.getByTestId('form-submit').click();
    await expect(page).toHaveURL(/\/loops\/[0-9a-f-]{36}$/);
    const [loop] = await rows('SELECT id, timeout_sec, repo_id FROM loops');
    expect(loop).toMatchObject({ timeout_sec: null, repo_id: repo.id });
    await expect(page.getByTestId('config-timeout')).toContainText(t('loopSettings.noLimit'));

    await page.getByTestId('loop-start').click();
    await expect(page.getByTestId('live-log')).toBeVisible();
    const [run] = await rows('SELECT id, status, deadline_at FROM runs WHERE loop_id = $1', [loop!.id]);
    expect(run).toMatchObject({ status: 'running', deadline_at: null });

    expect((await api(request, 'POST', '/api/__test/clock', { advanceMs: 2 * 86_400_000 })).status).toBe(200);
    await page.waitForTimeout(3_000); // a few ticker beats (1 second) after the jump
    expect((await rows('SELECT status, finished_at FROM runs WHERE id = $1', [run!.id]))[0]).toEqual({ status: 'running', finished_at: null });
    await page.goto(`/runs/${run!.id}`);
    await expect(page.getByTestId('run-header')).toHaveAttribute('data-status', 'running');
    // The page names the agent the run used (the limit is on the loop's settings).
    await expect(page.getByTestId('run-executor-used')).toHaveText(t('run.agentUsed', { s: `repo · ${t('loop.meta.mock', { d: t('dur.s', { s: 600 }), p: 0 })}` }));
    expect((await api(request, 'POST', `/api/loops/${loop!.id}/stop`)).status).toBe(200);
  });

  test('UC-25: repo name on each list row + the detail; filter by repo leaves only that repo\'s loops - exactly as in the DB', { tag: '@UC-25' }, async ({ page, request }) => {
    const a = await registerApi(request, tmpRepo(), 'Alpha');
    const b = await registerApi(request, tmpRepo(), 'Beta');
    await loopApi(request, { name: 'Loop 1', repoId: a.id, executor: MOCK_LONG });
    await loopApi(request, { name: 'Loop 2', repoId: b.id, executor: MOCK_LONG });
    const l3 = await loopApi(request, { name: 'Loop 3', repoId: b.id, executor: MOCK_LONG });
    const l4 = await loopApi(request, { name: 'Loop 4 archived', repoId: b.id, executor: MOCK_LONG });
    expect((await api(request, 'POST', `/api/loops/${l4.id}/archive`)).status).toBe(204);

    await page.goto('/');
    await expect(page.getByTestId('loop-row')).toHaveCount(3);
    // Every row: repo name = SELECT (join repos).
    const db1 = await rows<{ loop: string; repo: string }>(
      'SELECT l.name AS loop, r.name AS repo FROM loops l JOIN repos r ON r.id = l.repo_id WHERE l.archived_at IS NULL ORDER BY l.created_at DESC, l.id DESC',
    );
    const shown = await page.getByTestId('loop-row').evaluateAll((els) => els.map((e) => ({ loop: e.querySelector('[data-testid=loop-name]')?.textContent, repo: e.querySelector('[data-testid=row-repo]')?.textContent })));
    expect(shown).toEqual(db1);

    // Filter by Beta -> only Beta's loops; the count on each tab under the filter = SELECT.
    await page.getByTestId('repo-filter').click();
    await page.getByTestId(`repo-filter-${b.id}`).click();
    await expect(page.getByTestId('repo-filter')).toHaveAttribute('data-active', 'true');
    await expect(page.getByTestId('loop-row')).toHaveCount(2);
    const beta = await rows<{ name: string }>('SELECT name FROM loops WHERE repo_id = $1 AND archived_at IS NULL ORDER BY created_at DESC, id DESC', [b.id]);
    await expect(page.getByTestId('loop-name')).toHaveText(beta.map((r) => r.name));
    await expect(page.getByTestId('tab-all')).toContainText(String(beta.length));
    await expect(page.getByTestId('tab-archived')).toContainText(String(await count('SELECT count(*) AS n FROM loops WHERE repo_id = $1 AND archived_at IS NOT NULL', [b.id])));
    await page.getByTestId('tab-archived').click();
    await expect(page.getByTestId('loop-name')).toHaveText(['Loop 4 archived']);
    await page.getByTestId('tab-all').click();

    // Loop detail: the configuration. The desktop loop page names the repo on its settings card
    // (`loop-repo` is the phone's page meta line, spec 5.3).
    await page.locator(`[data-testid=loop-row][data-loop-id="${l3.id}"]`).getByTestId('loop-name').click();
    await expect(page).toHaveURL(new RegExp(`/loops/${l3.id}$`));
    await expect(page.getByTestId('config-repo').locator('strong')).toHaveText('Beta');
    await expect(page.getByTestId('config-repo')).toContainText(b.path);

    // Remove the filter -> all 3 rows. The list is on `/` only, so the filter is reached there (spec 7.2).
    await page.getByTestId('nav-loops').click();
    await expect(page).toHaveURL(/\/$/);
    await page.getByTestId('repo-filter').click();
    await page.getByTestId(`repo-filter-${b.id}`).click();
    await expect(page.getByTestId('loop-row')).toHaveCount(2);
    await page.getByTestId('repo-filter').click();
    await page.getByTestId('repo-filter-all').click();
    await expect(page.getByTestId('loop-row')).toHaveCount(3);
  });
});
