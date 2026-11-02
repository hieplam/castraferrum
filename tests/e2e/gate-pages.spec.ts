// E2E goal G6, the gate pages on the real build: the switch of a repo, Ratify, and Queue again. All real: browser, build, Fastify, git,
// Postgres (test mode). No test reaches the network: every console runs on the fake `gh` (`LOOPS_GH_BIN`), the seeded origin is a local
// bare repository, and the repo of the switch tests can reach no host (see `registerRepo`). The name that shows is `hieplam/tribe`.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import pg from 'pg';
import { createFakeGh, type FakeGh } from '../support/fake-gh-kit';
import { gateJobId, seedGateFailed, seedGateQueue } from '../support/goal-loop-gate-world';
import { repoId } from '../support/preview-world';
import { liveDbUrl, ServerProcess } from '../support/server-process';

const TRIBE = 'hieplam/tribe';

test.use({ timezoneId: 'Asia/Ho_Chi_Minh' });

/** One console on the fake `gh` and its own database. `gh.read()` shows every call that the console made. */
async function launch(): Promise<{ sp: ServerProcess; gh: FakeGh; pool: pg.Pool; stop(): Promise<void> }> {
  const gh = createFakeGh();
  const sp = await ServerProcess.launch({ env: { LOOPS_GH_BIN: gh.script, FAKE_GH_WORLD: gh.world } });
  const pool = new pg.Pool({ connectionString: liveDbUrl(), max: 2 });
  return {
    sp,
    gh,
    pool,
    stop: async () => {
      await sp.stop();
      await pool.end();
      gh.dispose();
    },
  };
}

/**
 * A git repository in a temp folder, registered as a repo. Returns its id. With an `origin` (the github.com form that the switch needs),
 * every http request of this repo goes to a closed local port and no credential helper runs, so a fetch can reach no host.
 */
async function registerRepo(sp: ServerProcess, origin: string | null): Promise<string> {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'lc-gate-pages-')));
  execFileSync('git', ['init', '-q'], { cwd: dir, stdio: 'ignore' });
  if (origin) {
    execFileSync('git', ['remote', 'add', 'origin', origin], { cwd: dir, stdio: 'ignore' });
    for (const [key, value] of [['http.proxy', 'http://127.0.0.1:9'], ['credential.helper', '']] as [string, string][]) execFileSync('git', ['config', key, value], { cwd: dir, stdio: 'ignore' });
  }
  const res = await sp.api<{ id: string }>('POST', '/api/repos', { path: dir, name: 'gate pages' });
  expect(res.status).toBe(201);
  return res.body.id;
}

test('G6: the switch turns the gate on for a repo with an origin remote, and the row shows enabled', { tag: '@UC-37' }, async ({ page }) => {
  const c = await launch();
  try {
    const id = await registerRepo(c.sp, `https://github.com/${TRIBE}.git`);
    await page.goto(`${c.sp.baseUrl}/repos/${id}/gate`);
    const toggle = page.getByTestId('gate-switch');
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    const row = await c.pool.query('SELECT enabled, github_repo FROM repo_gate WHERE repo_id = $1', [id]);
    expect(row.rows).toEqual([{ enabled: true, github_repo: TRIBE }]);
    await page.reload();
    await expect(page.getByTestId('gate-switch')).toHaveAttribute('aria-checked', 'true');
  } finally {
    await c.stop();
  }
});

test('G6: a repo with no origin remote shows the message of GATE_NO_REMOTE, and the switch stays off', { tag: '@UC-37' }, async ({ page }) => {
  const c = await launch();
  try {
    const id = await registerRepo(c.sp, null);
    await page.goto(`${c.sp.baseUrl}/repos/${id}/gate`);
    await page.getByTestId('gate-switch').click();
    await expect(page.getByTestId('gate-error')).toContainText('GitHub');
    await expect(page.getByTestId('gate-switch')).toHaveAttribute('aria-checked', 'false');
    expect((await c.pool.query('SELECT 1 FROM repo_gate WHERE repo_id = $1', [id])).rowCount).toBe(0);
  } finally {
    await c.stop();
  }
});

test('G6: Ratify moves the job from needs ratification to queued', { tag: '@UC-37' }, async ({ page }) => {
  const c = await launch();
  try {
    await seedGateQueue(c.sp, c.pool);
    await page.goto(`${c.sp.baseUrl}/repos/${repoId('api')}/gate`);
    const queue = page.getByTestId('gate-queue');
    await expect(queue.getByTestId('gate-job')).toHaveCount(3);
    await expect(queue.locator('[data-status="queued"]')).toHaveCount(1);
    await queue.getByTestId('gate-ratify').click();
    await expect(queue.getByTestId('gate-ratify')).toHaveCount(0);
    await expect(queue.locator('[data-status="queued"]')).toHaveCount(2);
    const job = await c.pool.query('SELECT state, ratified_at FROM gate_jobs WHERE pr_number = 46');
    expect(job.rows[0].state).toBe('queued');
    expect(job.rows[0].ratified_at).not.toBeNull();
  } finally {
    await c.stop();
  }
});

test('G6: Queue again on a failed job adds a job to the queue', { tag: '@UC-37' }, async ({ page }) => {
  const c = await launch();
  try {
    const world = c.gh.read();
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
      url: `https://github.com/${TRIBE}/pull/41`,
      createdAt: new Date(0).toISOString(),
      mergedAt: null,
    });
    writeFileSync(c.gh.world, JSON.stringify(world));
    await seedGateFailed(c.sp, c.pool);
    await page.goto(`${c.sp.baseUrl}/repos/${repoId('api')}/gate/jobs/${gateJobId(41)}`);
    await page.getByTestId('gate-requeue').click();
    await expect(page).toHaveURL(/\/repos\/[^/]+\/gate$/);
    const queue = page.getByTestId('gate-queue');
    await expect(queue.getByTestId('gate-job')).toHaveCount(4);
    await expect(queue.locator('[data-status="queued"]')).toHaveCount(2);
    const added = await c.pool.query(`SELECT pr_number, task_key, title, head_sha FROM gate_jobs WHERE state = 'queued' ORDER BY queued_at DESC LIMIT 1`);
    expect(added.rows[0]).toMatchObject({ pr_number: 41, task_key: '16', title: 'Refund table migration', head_sha: 'c'.repeat(40) });
  } finally {
    await c.stop();
  }
});
