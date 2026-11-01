// POST /api/gate/jobs (spec 2.8): a person queues a PR by hand. The real composition on the test Postgres and the fake `gh`.
// No ticker runs here, so a queued job stays queued and the duplicate answer does not depend on timing.
import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPgRepositories } from '../../server/adapters/postgres/repositories';
import { composeServer, type ComposedServer } from '../../server/compose';
import { TEST_DB_URL, resetApi, testPool } from '../support/api-kit';
import { createFakeGh, FAKE_GH_SCRIPT, type FakeGh } from '../support/fake-gh-kit';

const HEAD = 'a'.repeat(40);
const PR = 7;

let server: ComposedServer;
let gh: FakeGh;
let pool: ReturnType<typeof testPool>;
let repoId: string;
let saved: string | undefined;

const post = (payload: Record<string, unknown>) => server.app.inject({ method: 'POST', url: '/api/gate/jobs', payload });

beforeAll(async () => {
  gh = createFakeGh();
  saved = process.env.FAKE_GH_WORLD;
  process.env.FAKE_GH_WORLD = gh.world;
  const world = gh.read();
  world.prs.push({
    number: PR,
    title: 'A change',
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

const gateOn = () => createPgRepositories(pool).gate.setRepoGate(repoId, { enabled: true, githubRepo: 'fake/repo', checkCommand: [] }, new Date());

describe('POST /api/gate/jobs', { timeout: 30_000 }, () => {
  it('queues the PR at its head, with the first closing issue as the task key: 201', async () => {
    await gateOn();
    const res = await post({ repoId, prNumber: PR });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ outcome: 'queued', headSha: HEAD, taskKey: '141' });
    const job = await createPgRepositories(pool).gate.get(res.json().jobId as string);
    expect(job).toMatchObject({ state: 'queued', prNumber: PR, headSha: HEAD, taskKey: '141' });
  });

  it('a second call for the same head gives 200, the same job, and no new row', async () => {
    await gateOn();
    const first = await post({ repoId, prNumber: PR, taskKey: '141' });
    const second = await post({ repoId, prNumber: PR, taskKey: '141' });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({ outcome: 'duplicate', jobId: first.json().jobId });
    expect(await createPgRepositories(pool).gate.list(10)).toHaveLength(1);
  });

  it('a repository with the gate off gives 409 GATE_OFF and queues nothing', async () => {
    const res = await post({ repoId, prNumber: PR });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('GATE_OFF');
    expect(await createPgRepositories(pool).gate.list(10)).toEqual([]);
  });

  it('an unknown repository gives 404 REPO_NOT_FOUND', async () => {
    const res = await post({ repoId: randomUUID(), prNumber: PR });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('REPO_NOT_FOUND');
  });
});
