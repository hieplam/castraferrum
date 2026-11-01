// GET and PUT /api/repos/:id/gate, GET /api/gate/jobs/:id (spec 2.8, task K12): what the gate pages read and write. The real composition on
// the test Postgres and the fake `gh`. No ticker runs here, so a queued job stays queued. The rows are inserted with SQL where the test
// needs a state that the steps of the gate would reach only in a long run.
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPgRepositories } from '../../server/adapters/postgres/repositories';
import { composeServer, type ComposedServer } from '../../server/compose';
import { TEST_DB_URL, resetApi, testPool } from '../support/api-kit';
import { createFakeGh, FAKE_GH_SCRIPT, type FakeGh } from '../support/fake-gh-kit';

const HEAD = 'a'.repeat(40);
const PR = 7;
const T0 = Date.parse('2026-10-18T07:00:00Z');
const at = (minutes: number) => new Date(T0 + minutes * 60_000);

let server: ComposedServer;
let gh: FakeGh;
let pool: ReturnType<typeof testPool>;
let repoId: string;
let saved: string | undefined;

beforeAll(async () => {
  gh = createFakeGh();
  saved = process.env.FAKE_GH_WORLD;
  process.env.FAKE_GH_WORLD = gh.world;
  const world = gh.read();
  world.prs.push({
    number: PR,
    title: 'Refund report query',
    body: '',
    state: 'OPEN',
    headRefName: 'feat/x',
    baseRefName: 'main',
    headRefOid: HEAD,
    mergeCommit: null,
    closingIssuesReferences: [{ number: 141 }],
    url: 'https://github.com/fake/repo/pull/7',
    createdAt: new Date(0).toISOString(),
    mergedAt: null,
  });
  writeFileSync(gh.world, JSON.stringify(world));
  pool = testPool();
  server = await composeServer({ databaseUrl: TEST_DB_URL, testMode: true, dbWaitMs: 5000, ghBin: FAKE_GH_SCRIPT });
});

afterAll(async () => {
  await server?.shutdown();
  await pool?.end();
  gh?.dispose();
  if (saved === undefined) delete process.env.FAKE_GH_WORLD;
  else process.env.FAKE_GH_WORLD = saved;
});

beforeEach(async () => {
  repoId = await resetApi(server);
});

const getGate = (id = repoId) => server.app.inject({ method: 'GET', url: `/api/repos/${id}/gate` });
const putGate = (enabled: boolean, id = repoId) => server.app.inject({ method: 'PUT', url: `/api/repos/${id}/gate`, payload: { enabled } });
const repositories = () => createPgRepositories(pool);
const gateOn = () => repositories().gate.setRepoGate(repoId, { enabled: true, githubRepo: 'acme/api', checkCommand: [] }, new Date());

type Insert = { prNumber: number; state: string; queued: number; started?: number; finished?: number; failedStep?: string; ratified?: number; title?: string | null };
/** One job row with SQL, so a state and its times are exactly what the test says. */
async function insertJob(j: Insert): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO gate_jobs (id, repo_id, pr_number, head_sha, task_key, state, failed_step, queued_at, started_at, finished_at, ratified_at, title)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      id,
      repoId,
      j.prNumber,
      String(j.prNumber).padStart(40, '0'),
      String(j.prNumber),
      j.state,
      j.failedStep ?? null,
      at(j.queued),
      j.started === undefined ? null : at(j.started),
      j.finished === undefined ? null : at(j.finished),
      j.ratified === undefined ? null : at(j.ratified),
      j.title === undefined ? `PR ${j.prNumber} title` : j.title,
    ],
  );
  return id;
}

async function insertStep(jobId: string, seq: number, step: string, status: string, ms: number, outputTail = '', exitCode: number | null = 0) {
  await pool.query('INSERT INTO gate_steps (job_id, seq, step, status, exit_code, ms, output_tail) VALUES ($1, $2, $3, $4, $5, $6, $7)', [jobId, seq, step, status, exitCode, ms, outputTail]);
}

/** A folder that is a git repository whose `origin` is `url` (or has none), registered as a repo. Returns the repo id. */
async function repoWithOrigin(url: string | null): Promise<string> {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'lc-gate-origin-')));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  git('init', '-q');
  if (url) git('remote', 'add', 'origin', url);
  const res = await server.app.inject({ method: 'POST', url: '/api/repos', payload: { path: dir, name: `origin ${randomUUID().slice(0, 6)}` } });
  expect(res.statusCode).toBe(201);
  return res.json().id as string;
}

describe('GET /api/repos/:id/gate', { timeout: 30_000 }, () => {
  it('a repo with no gate row gives enabled false and empty lists, and an unknown repo gives 404 REPO_NOT_FOUND', async () => {
    const res = await getGate();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ enabled: false, githubRepo: null, queue: [], record: [] });
    const unknown = await getGate(randomUUID());
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json().error.code).toBe('REPO_NOT_FOUND');
  });

  it('the queue lists running, then queued, then needs_ratification, each oldest first, with the step of each job (a job with no stored failed step shows scope)', async () => {
    await gateOn();
    const ratify2 = await insertJob({ prNumber: 6, state: 'needs_ratification', queued: 1, started: 2, finished: 20 });
    const queued2 = await insertJob({ prNumber: 5, state: 'queued', queued: 12 });
    const running = await insertJob({ prNumber: 4, state: 'running', queued: 9, started: 10 });
    const queued1 = await insertJob({ prNumber: 3, state: 'queued', queued: 11 });
    const ratify1 = await insertJob({ prNumber: 2, state: 'needs_ratification', queued: 0, started: 1, finished: 5, failedStep: 'scope' });
    await insertStep(running, 1, 'scope', 'pass', 4);
    await insertStep(running, 2, 'base', 'pass', 812);
    await insertStep(running, 3, 'setup', 'pass', 41_200);
    const body = (await getGate()).json();
    expect(body.enabled).toBe(true);
    expect(body.githubRepo).toBe('acme/api');
    expect(body.queue.map((j: { id: string }) => j.id)).toEqual([running, queued1, queued2, ratify1, ratify2]);
    expect(body.queue.map((j: { step: string | null }) => j.step)).toEqual(['green', null, null, 'scope', 'scope']);
    expect(body.queue[0]).toMatchObject({ prNumber: 4, title: 'PR 4 title', taskKey: '4', state: 'running', startedAt: at(10).toISOString(), finishedAt: null, ratifiedAt: null });
    expect(body.record).toEqual([]);
  });

  it('the record lists merged and failed jobs, newest finishedAt first, at most 20', async () => {
    await gateOn();
    for (let i = 1; i <= 22; i++) await insertJob({ prNumber: i, state: i % 2 ? 'merged' : 'failed', queued: i, started: i, finished: 100 + i, ...(i % 2 ? {} : { failedStep: 'green' }) });
    const body = (await getGate()).json();
    expect(body.record).toHaveLength(20);
    expect(body.record.map((j: { prNumber: number }) => j.prNumber)).toEqual(Array.from({ length: 20 }, (_, i) => 22 - i));
    expect(body.record[0]).toMatchObject({ state: 'failed', step: 'green', finishedAt: at(122).toISOString() });
    expect(body.record[1]).toMatchObject({ state: 'merged', step: null });
    expect(body.queue).toEqual([]);
  });
});

describe('POST /api/gate/jobs stores the title', { timeout: 30_000 }, () => {
  it('queue stores the title of the pull request on the job, and the page reads it back', async () => {
    await gateOn();
    const queued = await server.app.inject({ method: 'POST', url: '/api/gate/jobs', payload: { repoId, prNumber: PR } });
    expect(queued.statusCode).toBe(201);
    expect(await repositories().gate.get(queued.json().jobId as string)).toMatchObject({ title: 'Refund report query' });
    expect((await getGate()).json().queue[0]).toMatchObject({ prNumber: PR, title: 'Refund report query', state: 'queued' });
  });
});

describe('PUT /api/repos/:id/gate', { timeout: 30_000 }, () => {
  it('the first enable reads the origin remote, in the https form and in the ssh form', async () => {
    const https = await repoWithOrigin('https://github.com/acme/api.git');
    const first = await putGate(true, https);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ enabled: true, githubRepo: 'acme/api', queue: [], record: [] });
    expect(await repositories().gate.getRepoGate(https)).toMatchObject({ enabled: true, githubRepo: 'acme/api', checkCommand: [] });
    const ssh = await repoWithOrigin('git@github.com:acme/web.git');
    expect((await putGate(true, ssh)).json().githubRepo).toBe('acme/web');
  });

  it('a repo with no origin, or an origin that is not on github.com, gives 409 GATE_NO_REMOTE and writes no row', async () => {
    const none = await repoWithOrigin(null);
    const refused = await putGate(true, none);
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error.code).toBe('GATE_NO_REMOTE');
    expect(await repositories().gate.getRepoGate(none)).toBeNull();
    const elsewhere = await repoWithOrigin('https://example.com/acme/api.git');
    expect((await putGate(true, elsewhere)).json().error.code).toBe('GATE_NO_REMOTE');
  });

  it('turning the gate off keeps the row and its repository, and turning it on again keeps them', async () => {
    const id = await repoWithOrigin('https://github.com/acme/api.git');
    await putGate(true, id);
    const off = await putGate(false, id);
    expect(off.statusCode).toBe(200);
    expect(off.json()).toMatchObject({ enabled: false, githubRepo: 'acme/api' });
    expect(await repositories().gate.getRepoGate(id)).toMatchObject({ enabled: false, githubRepo: 'acme/api' });
    expect((await putGate(true, id)).json()).toMatchObject({ enabled: true, githubRepo: 'acme/api' });
    expect((await putGate(false, randomUUID())).json().error.code).toBe('REPO_NOT_FOUND');
  });
});

describe('GET /api/gate/jobs/:id', { timeout: 30_000 }, () => {
  it('answers the job with its steps ordered by seq, each with its output tail', async () => {
    const id = await insertJob({ prNumber: 41, state: 'failed', queued: 0, started: 1, finished: 6, failedStep: 'green' });
    await insertStep(id, 3, 'setup', 'pass', 41_200, 'installed');
    await insertStep(id, 1, 'scope', 'pass', 4, '3 changed files');
    await insertStep(id, 4, 'green', 'fail', 18_650, 'Tests  1 failed | 2 passed (3)', 1);
    await insertStep(id, 2, 'base', 'pass', 812, 'rebased');
    const res = await server.app.inject({ method: 'GET', url: `/api/gate/jobs/${id}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ repoId, headSha: '41'.padStart(40, '0'), job: { id, prNumber: 41, state: 'failed', step: 'green', title: 'PR 41 title', finishedAt: at(6).toISOString() } });
    expect(body.steps.map((s: { seq: number; step: string }) => [s.seq, s.step])).toEqual([[1, 'scope'], [2, 'base'], [3, 'setup'], [4, 'green']]);
    // The page of the repo lists the same job, with the same fields as its own record.
    expect((await getGate()).json().record[0]).toEqual(body.job);
    expect(body.steps[3]).toEqual({ seq: 4, step: 'green', status: 'fail', exitCode: 1, ms: 18_650, outputTail: 'Tests  1 failed | 2 passed (3)' });
  });

  it('an unknown job gives 404 GATE_JOB_NOT_FOUND', async () => {
    const res = await server.app.inject({ method: 'GET', url: `/api/gate/jobs/${randomUUID()}` });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('GATE_JOB_NOT_FOUND');
  });
});
