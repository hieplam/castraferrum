// A run that ends with `PR_OPEN` hands its claim to the gate (spec 2.3, decision 47). The real composition on the test Postgres, the fake `gh`, a fake Claude, and no ticker.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { composeServer, type ComposedServer } from '../../server/compose';
import { TEST_DB_URL, resetApi, testPool } from '../support/api-kit';
import { createFakeGh, FAKE_GH_SCRIPT, type FakeGh } from '../support/fake-gh-kit';
import { HANDOVER_PR_URL, labelCalls, startHandOverLoop, type HandOverLoop } from '../support/gate-handover-world';

const HEAD = 'a'.repeat(40);

let server: ComposedServer;
let gh: FakeGh;
let pool: ReturnType<typeof testPool>;
let saved: string | undefined;

beforeAll(async () => {
  gh = createFakeGh();
  saved = process.env.FAKE_GH_WORLD;
  process.env.FAKE_GH_WORLD = gh.world;
  const world = gh.read();
  world.prs.push({
    number: 7,
    title: 'A change',
    body: '',
    state: 'OPEN',
    headRefName: 'feat/x',
    baseRefName: 'main',
    headRefOid: HEAD,
    mergeCommit: null,
    closingIssuesReferences: [{ number: 141 }],
    url: HANDOVER_PR_URL,
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
  await resetApi(server);
});

/** The first tick claims the task. The run ends by itself, and the next tick ends its claim. */
async function endedRun(gate: boolean): Promise<HandOverLoop> {
  const loop = await startHandOverLoop(server, pool, { gate });
  await server.inspect.backgroundTick();
  await expect.poll(async () => (await pool.query('SELECT status FROM runs WHERE loop_id = $1', [loop.loopId])).rows[0]?.status, { timeout: 15_000 }).toBe('succeeded');
  await server.inspect.backgroundTick();
  return loop;
}

const label = (loop: HandOverLoop) => existsSync(join(loop.labels, 'label-141'));
const jobs = async () => (await pool.query('SELECT id, state, pr_number, task_key, queued_at FROM gate_jobs')).rows as { id: string; state: string; pr_number: number; task_key: string; queued_at: Date }[];
const claims = async (loop: HandOverLoop) => (await pool.query('SELECT owner, gate_job_id, closed_at FROM run_claims WHERE loop_id = $1', [loop.loopId])).rows as { owner: string; gate_job_id: string | null; closed_at: Date | null }[];

describe('gate_handover on the real wiring', { timeout: 30_000 }, () => {
  it('gate on: the run is succeeded, a queued job exists from its end on, and the label stays', async () => {
    const loop = await endedRun(true);
    const [run] = (await pool.query('SELECT status, finished_at, end_result, end_pr FROM runs WHERE loop_id = $1', [loop.loopId])).rows as { status: string; finished_at: Date; end_result: string; end_pr: string }[];
    const [job] = await jobs();

    expect(run).toMatchObject({ status: 'succeeded', end_result: 'PR_OPEN', end_pr: HANDOVER_PR_URL });
    expect(job).toMatchObject({ state: 'queued', pr_number: 7, task_key: '141' });
    expect(job!.queued_at.getTime()).toBeGreaterThanOrEqual(run!.finished_at.getTime());
    expect(await claims(loop)).toEqual([{ owner: 'gate', gate_job_id: job!.id, closed_at: null }]);
    expect(label(loop)).toBe(true);
    expect(labelCalls(loop).filter((line) => line.includes('"release"'))).toEqual([]);
  });

  it('gate off: the label is released, and no job exists', async () => {
    const loop = await endedRun(false);

    expect(await jobs()).toEqual([]);
    expect(label(loop)).toBe(false);
    expect(await claims(loop)).toEqual([expect.objectContaining({ owner: 'run', gate_job_id: null, closed_at: expect.any(Date) })]);
  });

  it('gate on: the run sees CASTRAFERRUM_GATE in its env', async () => {
    const loop = await endedRun(true);
    const lines = readFileSync(join(loop.dir, 'lane-env.jsonl'), 'utf8').split('\n').filter(Boolean);
    expect(lines.map((line) => JSON.parse(line) as unknown)).toEqual([{ CASTRAFERRUM_SLOT: '0', CASTRAFERRUM_GATE: '1' }]);
  });
});
