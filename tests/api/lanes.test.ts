// Lanes on the real server (composeServer): three claimed runs of a fake Claude get three slots, databases and ports. G24.
// The fake Claude (a repo folder named lc-fake-claude-*, prompt `[echo-env]`) writes the lane env it received to `<cwd>/lane-env.jsonl`.
import { existsSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FAKE_CLAUDE_DIR_PREFIX } from '../../server/adapters/executors/claude/test-mode-query';
import { claimedLine } from '../../shared/domain/goal-loop';
import { loopBody, resetApi, startApi, testPool, type ApiServer } from '../support/api-kit';

const FAKE_LABELS = resolve('tests/support/fake-labels.mjs');

let server: ApiServer;
let pool: pg.Pool;
beforeAll(async () => {
  server = await startApi();
  pool = testPool();
});
afterAll(async () => {
  await server?.shutdown();
  await pool?.end();
});
beforeEach(async () => {
  await resetApi(server);
});

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
async function call(method: 'POST' | 'PUT', url: string, payload?: unknown) {
  const res = await server.app.inject({ method, url, ...(payload === undefined ? {} : { payload: payload as Json }) });
  return { status: res.statusCode, body: (res.body ? res.json() : null) as Json };
}

const PROMPT = 'Handle one task [echo-env] [soak:0]';

/** A started loop on a fake Claude repo. `queue` null: no probe. */
async function laneLoop(queue: string[] | null): Promise<{ id: string; dir: string }> {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), FAKE_CLAUDE_DIR_PREFIX)));
  const repo = await call('POST', '/api/repos', { path: dir, name: `lanes ${dir.slice(-6)}` });
  expect(repo.status).toBe(201);
  const created = await call(
    'POST',
    '/api/loops',
    loopBody({ repoId: repo.body.id, prompt: PROMPT, maxConcurrent: 3, executor: { kind: 'claude', config: { model: 'opus', effort: 'medium' } } }),
  );
  expect(created.status).toBe(201);
  const id = created.body.id as string;
  if (queue) {
    const world = mkdtempSync(join(tmpdir(), 'lc-lanes-'));
    writeFileSync(join(world, 'queue.json'), JSON.stringify(queue));
    writeFileSync(join(world, 'calls.log'), '');
    const argv = (...rest: string[]) => [process.execPath, FAKE_LABELS, world, ...rest];
    const saved = await call('PUT', `/api/loops/${id}/probe`, {
      command: argv('next'),
      claim: argv('claim', '{key}'),
      release: argv('release', '{key}', '--if-claimed', '--reason', '{reason}'),
      laneEnv: { LANE_DB: 'loops_lane{slot}_test', LANE_PORT: '{port}' },
      laneBasePort: 7100,
    });
    expect(saved.status).toBe(200);
  }
  expect((await call('POST', `/api/loops/${id}/start`)).status).toBe(200);
  return { id, dir };
}

const envLines = (dir: string): Record<string, string>[] => {
  const file = join(dir, 'lane-env.jsonl');
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, string>);
};
const runsOf = async (id: string) =>
  (await pool.query('SELECT trigger, task_key, slot, prompt_snapshot FROM runs WHERE loop_id = $1 ORDER BY task_key', [id])).rows as {
    trigger: string;
    task_key: string | null;
    slot: number | null;
    prompt_snapshot: string;
  }[];

describe('lanes', () => {
  it('three claimed runs get three env sets: slots 0 to 2, three databases, ports 7100 to 7102', async () => {
    const { id, dir } = await laneLoop(['a', 'b', 'c']);
    await server.inspect.backgroundTick();
    await expect.poll(() => envLines(dir).length, { timeout: 15_000 }).toBe(3);

    const sorted = envLines(dir).sort((x, y) => Number(x.CASTRAFERRUM_SLOT) - Number(y.CASTRAFERRUM_SLOT));
    expect(sorted).toEqual([
      { CASTRAFERRUM_SLOT: '0', LANE_DB: 'loops_lane0_test', LANE_PORT: '7100' },
      { CASTRAFERRUM_SLOT: '1', LANE_DB: 'loops_lane1_test', LANE_PORT: '7101' },
      { CASTRAFERRUM_SLOT: '2', LANE_DB: 'loops_lane2_test', LANE_PORT: '7102' },
    ]);
    const rows = await runsOf(id);
    expect(rows.map((r) => r.task_key)).toEqual(['a', 'b', 'c']);
    expect(new Set(rows.map((r) => r.slot))).toEqual(new Set([0, 1, 2]));
  });

  it('a run with no probe gets no lane env, no slot and the plain prompt', async () => {
    const { id, dir } = await laneLoop(null);
    await expect.poll(() => envLines(dir).length, { timeout: 15_000 }).toBe(1);
    expect(envLines(dir)).toEqual([{}]);
    expect(await runsOf(id)).toEqual([expect.objectContaining({ trigger: 'start', task_key: null, slot: null, prompt_snapshot: PROMPT })]);
  });

  it('prompt_snapshot of a claimed run: the claimed line, a blank line, then the loop prompt', async () => {
    const { id } = await laneLoop(['141']);
    await server.inspect.backgroundTick();
    const [run] = await runsOf(id);
    expect(run).toMatchObject({ trigger: 'probe', task_key: '141', slot: 0 });
    expect(run!.prompt_snapshot).toBe(`${claimedLine('141', 'take')}\n\n${PROMPT}`);
    expect(run!.prompt_snapshot.split('\n')[0]).toBe(
      '[Castraferrum] The console claimed task 141 for this run (action take). Do not run next or claim. Do this task only.',
    );
  });
});
