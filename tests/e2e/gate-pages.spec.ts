// E2E goal G6, the gate pages on the real build: the switch of a repo, Ratify, and Queue again. All real: browser, build, Fastify, git,
// Postgres (test mode). The fake `gh` stands in for GitHub, so no test touches a real repository.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type APIRequestContext } from '@playwright/test';
import pg from 'pg';
import { createFakeGh } from '../support/fake-gh-kit';
import { api, closeDb, db } from '../support/form-kit';
import { gateJobId, seedGateFailed, seedGateQueue } from '../support/goal-loop-gate-world';
import { repoId } from '../support/preview-world';
import { liveDbUrl, ServerProcess } from '../support/server-process';

test.use({ timezoneId: 'Asia/Ho_Chi_Minh' });
test.afterAll(closeDb);

/** A git repository in a temp folder, with an `origin` when `origin` is set, registered as a repo. Returns its id. */
async function registerRepo(request: APIRequestContext, origin: string | null): Promise<string> {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'lc-gate-pages-')));
  execFileSync('git', ['init', '-q'], { cwd: dir, stdio: 'ignore' });
  if (origin) execFileSync('git', ['remote', 'add', 'origin', origin], { cwd: dir, stdio: 'ignore' });
  // The gate is turned on for this repo, so the ticks of the console fetch from its origin. The origin has the github.com form that the
  // switch needs, so this repo can reach no network: every http request goes to a closed local port, and no credential helper runs.
  if (origin) for (const [key, value] of [['http.proxy', 'http://127.0.0.1:9'], ['credential.helper', '']]) execFileSync('git', ['config', key, value], { cwd: dir, stdio: 'ignore' });
  const res = await api<{ id: string }>(request, 'POST', '/api/repos', { path: dir, name: 'gate pages' });
  expect(res.status).toBe(201);
  return res.body.id;
}

test('G6: the switch turns the gate on for a repo with an origin remote, and the row shows enabled', { tag: '@UC-37' }, async ({ page, request }) => {
  await api(request, 'POST', '/api/__test/reset');
  const id = await registerRepo(request, 'https://github.com/acme/api.git');
  await page.goto(`/repos/${id}/gate`);
  const toggle = page.getByTestId('gate-switch');
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  const row = await db().query('SELECT enabled, github_repo FROM repo_gate WHERE repo_id = $1', [id]);
  expect(row.rows).toEqual([{ enabled: true, github_repo: 'acme/api' }]);
  await page.reload();
  await expect(page.getByTestId('gate-switch')).toHaveAttribute('aria-checked', 'true');
});

test('G6: a repo with no origin remote shows the message of GATE_NO_REMOTE, and the switch stays off', { tag: '@UC-37' }, async ({ page, request }) => {
  await api(request, 'POST', '/api/__test/reset');
  const id = await registerRepo(request, null);
  await page.goto(`/repos/${id}/gate`);
  await page.getByTestId('gate-switch').click();
  await expect(page.getByTestId('gate-error')).toContainText('GitHub');
  await expect(page.getByTestId('gate-switch')).toHaveAttribute('aria-checked', 'false');
  expect((await db().query('SELECT 1 FROM repo_gate WHERE repo_id = $1', [id])).rowCount).toBe(0);
});

test('G6: Ratify moves the job from needs ratification to queued', { tag: '@UC-37' }, async ({ page, request }) => {
  await seedGateQueue({ api: (method, route, body) => api(request, method, route, body) }, db());
  await page.goto(`/repos/${repoId('api')}/gate`);
  const queue = page.getByTestId('gate-queue');
  await expect(queue.getByTestId('gate-job')).toHaveCount(3);
  await expect(queue.locator('[data-status="queued"]')).toHaveCount(1);
  await queue.getByTestId('gate-ratify').click();
  await expect(queue.getByTestId('gate-ratify')).toHaveCount(0);
  await expect(queue.locator('[data-status="queued"]')).toHaveCount(2);
  const job = await db().query('SELECT state, ratified_at FROM gate_jobs WHERE pr_number = 46');
  expect(job.rows[0].state).toBe('queued');
  expect(job.rows[0].ratified_at).not.toBeNull();
});

test('G6: Queue again on a failed job adds a job to the queue', { tag: '@UC-37' }, async ({ page }) => {
  const gh = createFakeGh();
  const world = gh.read();
  world.prs.push({
    number: 41,
    title: 'Refund table migration',
    body: '',
    state: 'OPEN',
    headRefName: 'feat/refund-table',
    baseRefName: 'main',
    headRefOid: 'c'.repeat(40),
    mergeCommit: null,
    closingIssuesReferences: [{ number: 16 }],
    url: 'https://github.com/acme/api/pull/41',
    createdAt: new Date(0).toISOString(),
    mergedAt: null,
  });
  writeFileSync(gh.world, JSON.stringify(world));
  const sp = await ServerProcess.launch({ env: { LOOPS_GH_BIN: gh.script, FAKE_GH_WORLD: gh.world } });
  const pool = new pg.Pool({ connectionString: liveDbUrl(), max: 2 });
  try {
    await seedGateFailed(sp, pool);
    await page.goto(`${sp.baseUrl}/repos/${repoId('api')}/gate/jobs/${gateJobId(41)}`);
    await page.getByTestId('gate-requeue').click();
    await expect(page).toHaveURL(/\/repos\/[^/]+\/gate$/);
    const queue = page.getByTestId('gate-queue');
    await expect(queue.getByTestId('gate-job')).toHaveCount(4);
    await expect(queue.locator('[data-status="queued"]')).toHaveCount(2);
    const added = await pool.query(`SELECT pr_number, task_key, title, head_sha FROM gate_jobs WHERE state = 'queued' ORDER BY queued_at DESC LIMIT 1`);
    expect(added.rows[0]).toMatchObject({ pr_number: 41, task_key: '16', title: 'Refund table migration', head_sha: 'c'.repeat(40) });
  } finally {
    await sp.stop();
    await pool.end();
    gh.dispose();
  }
});
