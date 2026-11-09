// E2E goal G11 (task T6): the goal number moves at each merge. All real: browser, build, Fastify, git, Postgres (test mode), the gate with its
// steps and the goal pass after a merge. No test reaches the network: the console runs on the fake `gh` (`LOOPS_GH_BIN`), and the origin is a
// local bare repository. The name that shows is `hieplam/tribe`.
//
// The origin holds `goals/gate.json`, a manifest of 8 goals (epic 1, each `run` is `node tests/row.mjs <id>`) and `tests/pass.txt`. A row passes
// when its id is in `tests/pass.txt`. Two ids are in the file at the start, so the number is 2/8. A pull request that adds a third id moves it to 3/8
// when the gate merges it and the goal pass reads `main`. A pull request that fixes no goal leaves it at 2/8.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import pg from 'pg';
import { createGateWorld, disposeGateSeed, GOOD_FILES, VERIFY_LINE, type GateWorld } from '../support/gate-world';
import { liveDbUrl, ServerProcess } from '../support/server-process';

const TRIBE = 'hieplam/tribe';
const MANIFEST = 'goals/2026-11-01-number.json';
const EPIC = 1;
const IDS = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8'];
const GOAL_CHECK = readFileSync(new URL('../../scripts/goal-check.mjs', import.meta.url), 'utf8');
const ROW_FILE = `import { readFileSync } from 'node:fs';
const ids = readFileSync('tests/pass.txt', 'utf8').split(/\\s+/);
process.exit(ids.includes(process.argv[2]) ? 0 : 1);
`;
const manifestText = () =>
  `${JSON.stringify({ setup: [], epic: EPIC, goals: IDS.map((id) => ({ id, outcome: `Goal ${id} passes`, checks: [{ run: `node tests/row.mjs ${id}` }] })) }, null, 2)}\n`;

test.use({ timezoneId: 'Asia/Ho_Chi_Minh' });
test.afterAll(disposeGateSeed);

type Console = { world: GateWorld; sp: ServerProcess; pool: pg.Pool; repoId: string; loopId: string; stop(): Promise<void> };

/** A console on the fake `gh` and its own database, with the repository of the world registered, a loop in it, and a gate row. */
async function launch(): Promise<Console> {
  const world = createGateWorld();
  await world.host.openIssue(TRIBE, { title: 'the epic', body: '', labels: [] });
  world.commitMain({ 'scripts/goal-check.mjs': GOAL_CHECK, 'tests/row.mjs': ROW_FILE, 'tests/pass.txt': 'G1\nG2\n', [MANIFEST]: manifestText() });
  // The clone of the console learns `origin/main` with a fetch; the gate does it by itself before each job.
  execFileSync('git', ['fetch', '-q', 'origin'], { cwd: world.repoPath, stdio: 'ignore' });
  const sp = await ServerProcess.launch({ env: { LOOPS_GH_BIN: world.gh.script, FAKE_GH_WORLD: world.gh.world } });
  const pool = new pg.Pool({ connectionString: liveDbUrl(), max: 2 });
  const repo = await sp.api<{ id: string }>('POST', '/api/repos', { path: realpathSync(world.repoPath), name: 'goal number' });
  expect(repo.status).toBe(201);
  const loop = await sp.api<{ id: string }>('POST', '/api/loops', {
    repoId: repo.body.id,
    name: 'Goal number worker',
    prompt: 'Do one task.',
    cron: '0 0 1 1 *',
    timeoutSec: 600,
    executor: { kind: 'mock', config: { durationSec: 600, failRate: 0 } },
  });
  expect(loop.status).toBe(201);
  await pool.query(`INSERT INTO repo_gate (repo_id, enabled, github_repo, check_command, updated_at) VALUES ($1, true, $2, '[]', now())`, [repo.body.id, TRIBE]);
  // Two rows that pass, as a goal pass of an earlier merge stored them.
  for (const id of ['G1', 'G2']) {
    await pool.query(`INSERT INTO goal_runs (repo, manifest, row_id, pass, value, "of", line, cadence, sha, at) VALUES ($1,$2,$3,true,NULL,NULL,$4,'merge',$5,now())`, [TRIBE, MANIFEST, id, `${id} pass`, '4be21c7'.padEnd(40, '0')]);
  }
  return {
    world,
    sp,
    pool,
    repoId: repo.body.id,
    loopId: loop.body.id,
    stop: async () => {
      await sp.stop();
      await pool.end();
      world.dispose();
    },
  };
}

/** Queues a pull request through the API, and waits until its job ends as `merged` and the goal pass has commented on the epic. */
async function mergeThroughGate(c: Console, files: Record<string, string>, taskKey: string): Promise<void> {
  const comments = () => c.world.gh.read().issues.find((i) => i.number === EPIC)!.comments.filter((x) => x.body.startsWith('loop-goals:')).length;
  const before = comments();
  const pr = c.world.openPr({ files });
  const queued = await c.sp.api<{ jobId: string }>('POST', '/api/gate/jobs', { repoId: c.repoId, prNumber: pr.number, taskKey });
  expect(queued.status).toBe(201);
  // A refused job names its step and output in the failure, so a red run says why.
  const job = async () => {
    const row = (await c.pool.query('SELECT state, failed_step FROM gate_jobs WHERE id = $1', [queued.body.jobId])).rows[0];
    const steps = (await c.pool.query('SELECT step, status, output_tail FROM gate_steps WHERE job_id = $1 ORDER BY seq', [queued.body.jobId])).rows;
    const paths = (await c.pool.query('SELECT path FROM repos')).rows.map((r) => `${r.path} exists=${existsSync(r.path)}`);
    return `${row?.state} at ${row?.failed_step} ${paths.join(' | ')} ${JSON.stringify(steps)}
${c.sp.logs.join('').slice(-1500)}`;
  };
  await expect.poll(async () => ((await job()).startsWith('merged') ? 'merged' : await job()), { timeout: 120_000, intervals: [1_000] }).toBe('merged');
  await expect.poll(comments, { timeout: 120_000, intervals: [1_000] }).toBeGreaterThan(before);
}

test('G11: the loop page shows the goal number 2/8, and a merge that fixes a goal moves it to 3/8', async ({ page }) => {
  test.setTimeout(360_000);
  const c = await launch();
  try {
    await page.goto(`${c.sp.baseUrl}/loops/${c.loopId}`);
    await expect(page.getByTestId('fig-goals')).toContainText('2/8');
    await mergeThroughGate(c, { ...GOOD_FILES, 'tests/pass.txt': 'G1\nG2\nG3\n' }, '141');
    await expect.poll(async () => page.getByTestId('fig-goals').innerText(), { timeout: 120_000, intervals: [1_000] }).toContain('3/8');
  } finally {
    await c.stop();
  }
});

test('G11: a merge that fixes no goal leaves the goal number at 2/8', async ({ page }) => {
  test.setTimeout(360_000);
  const c = await launch();
  try {
    c.world.setEntry('142', { green: [{ run: VERIFY_LINE, expect: ['verify sees'] }], stub: { none: 'a text file' } });
    execFileSync('git', ['fetch', '-q', 'origin'], { cwd: c.world.repoPath, stdio: 'ignore' });
    await page.goto(`${c.sp.baseUrl}/loops/${c.loopId}`);
    await expect(page.getByTestId('fig-goals')).toContainText('2/8');
    await mergeThroughGate(c, { 'two.txt': 'two\n' }, '142');
    // The goal pass ran on the new main (its comment is there) and stored the same result: two rows pass.
    expect(c.world.gh.read().issues.find((i) => i.number === EPIC)!.comments.at(-1)!.body).toContain('"passed":2,"total":8');
    await page.reload();
    await expect(page.getByTestId('fig-goals')).toContainText('2/8');
  } finally {
    await c.stop();
  }
});

test('G11: the entry Goals and checks opens the goals page of the loop', async ({ page }) => {
  test.setTimeout(120_000);
  const c = await launch();
  try {
    await page.goto(`${c.sp.baseUrl}/loops/${c.loopId}`);
    await page.getByTestId('goals-link').click();
    await expect(page).toHaveURL(new RegExp(`/loops/${c.loopId}/goals$`));
    await expect(page.getByTestId('goal-row')).toHaveCount(8);
    await expect(page.getByTestId('goal-row').filter({ hasText: 'G1' })).toHaveAttribute('data-status', 'pass');
    await expect(page.getByTestId('goal-row').filter({ hasText: 'G3' })).toHaveAttribute('data-status', 'fail');
  } finally {
    await c.stop();
  }
});
