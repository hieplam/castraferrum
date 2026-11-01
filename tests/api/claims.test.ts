// Claims on the real server (composeServer): `inspect.backgroundTick()`, the real command gateway and real child processes, labels in a fake task
// tracker (tests/support/fake-labels.mjs), no GitHub. G4: a label ends with its run. G2: the next task starts after a run ends.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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

/** One task tracker: a folder with the keys that its `next` command offers. */
function makeWorld(queue: string[]) {
  const dir = mkdtempSync(join(tmpdir(), 'lc-claims-'));
  writeFileSync(join(dir, 'queue.json'), JSON.stringify(queue));
  writeFileSync(join(dir, 'calls.log'), '');
  const argv = (...rest: string[]) => [process.execPath, FAKE_LABELS, dir, ...rest];
  return {
    probe: {
      command: argv('next'),
      claim: argv('claim', '{key}'),
      release: argv('release', '{key}', '--if-claimed', '--reason', '{reason}'),
    },
    labelled: (key: string) => existsSync(join(dir, `label-${key}`)),
    reopened: (key: string) => existsSync(join(dir, `reopened-${key}`)),
    /** Another worker claimed `key` after the probe offered it. */
    overtake: (key: string) => {
      mkdirSync(join(dir, `label-${key}`));
      writeFileSync(join(dir, 'stale-offers'), '');
    },
    calls: () =>
      readFileSync(join(dir, 'calls.log'), 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l) as string[]),
  };
}

async function startedLoop(world: ReturnType<typeof makeWorld>, over: Record<string, unknown> = {}): Promise<string> {
  const created = await call('POST', '/api/loops', loopBody(over));
  expect(created.status).toBe(201);
  const id = created.body.id as string;
  expect((await call('PUT', `/api/loops/${id}/probe`, world.probe)).status).toBe(200);
  expect((await call('POST', `/api/loops/${id}/start`)).status).toBe(200);
  return id;
}

const runsOf = async (loopId: string) =>
  (await pool.query('SELECT id, status, trigger, task_key FROM runs WHERE loop_id = $1 ORDER BY iteration', [loopId])).rows as {
    id: string;
    status: string;
    trigger: string;
    task_key: string;
  }[];
const claimsOf = async (loopId: string) =>
  (await pool.query('SELECT task_key, run_id, closed_at, close_reason FROM run_claims WHERE loop_id = $1 ORDER BY task_key', [loopId])).rows as {
    task_key: string;
    run_id: string;
    closed_at: Date | null;
    close_reason: string | null;
  }[];

describe('claims on the tick', () => {
  it('stop: a stopped run loses its label after one tick, and no task reopens', async () => {
    const world = makeWorld(['141']);
    const id = await startedLoop(world);
    await server.inspect.backgroundTick();
    const [run] = await runsOf(id);
    expect(run).toMatchObject({ status: 'running', trigger: 'probe', task_key: '141' });
    expect(world.labelled('141')).toBe(true);

    expect((await call('POST', `/api/loops/${id}/stop`)).status).toBe(200);
    expect((await runsOf(id))[0]?.status).toBe('cancelled');
    await server.inspect.backgroundTick();

    expect(world.labelled('141')).toBe(false);
    expect(world.reopened('141')).toBe(false);
    expect(await claimsOf(id)).toEqual([{ task_key: '141', run_id: run!.id, closed_at: expect.any(Date), close_reason: 'run cancelled' }]);
  });

  it('succeeded: a finished run gives one release, and the next task starts with no cron', async () => {
    const world = makeWorld(['141', '142']);
    const id = await startedLoop(world, { executor: { kind: 'mock', config: { durationSec: 1, failRate: 0 } } });
    await server.inspect.backgroundTick();
    expect((await runsOf(id)).map((r) => r.task_key)).toEqual(['141']);
    expect(world.labelled('142')).toBe(false); // one lane

    // The ticker of the server goes on by itself: the run ends, its claim ends, the probe runs again.
    await expect.poll(async () => (await runsOf(id)).map((r) => r.task_key), { timeout: 15_000 }).toEqual(['141', '142']);
    await server.inspect.backgroundTick();

    expect(world.labelled('141')).toBe(false);
    expect(world.reopened('141')).toBe(false);
    expect((await claimsOf(id))[0]).toMatchObject({ task_key: '141', close_reason: 'run succeeded' });
    expect(world.calls().filter((c) => c[0] === 'release' && c[1] === '141')).toHaveLength(1);
  });

  it('refused: a task that another worker took starts no session and keeps its label', async () => {
    const world = makeWorld(['141']);
    world.overtake('141');
    const id = await startedLoop(world);
    await server.inspect.backgroundTick();

    expect(await runsOf(id)).toEqual([]);
    expect(world.calls().filter((c) => c[0] === 'claim')).toEqual([['claim', '141']]);
    expect(world.labelled('141')).toBe(true);
    expect(world.calls().filter((c) => c[0] === 'release')).toEqual([]);
    expect(await claimsOf(id)).toEqual([
      expect.objectContaining({ task_key: '141', closed_at: expect.any(Date), close_reason: expect.stringContaining('already claimed') }),
    ]);
  });

  it('two loops: one tick starts one run for each, and one key in two loops gives two claims', async () => {
    const first = makeWorld(['141']);
    const second = makeWorld(['141']);
    const a = await startedLoop(first);
    const b = await startedLoop(second);
    await server.inspect.backgroundTick();

    expect((await runsOf(a)).map((r) => r.task_key)).toEqual(['141']);
    expect((await runsOf(b)).map((r) => r.task_key)).toEqual(['141']);
    expect(first.labelled('141')).toBe(true);
    expect(second.labelled('141')).toBe(true);
  });
});
