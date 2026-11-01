// The probe actions plan and done on the real server (composeServer): `inspect.backgroundTick()`, the real command gateway, real child processes, a wound
// clock, and no GitHub. G25: a plan run gets the failing rows in its prompt, and a key has one run. G28: `done` ends the period as Goal met.
import { appendFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
async function call(method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) {
  const res = await server.app.inject({ method, url, ...(payload === undefined ? {} : { payload: payload as Json }) });
  return { status: res.statusCode, body: (res.body ? res.json() : null) as Json };
}

/** A tracker folder whose `next` command prints the line of `answer.json`. */
function makeWorld(answer: unknown) {
  const dir = mkdtempSync(join(tmpdir(), 'lc-plan-'));
  writeFileSync(join(dir, 'queue.json'), '[]');
  writeFileSync(join(dir, 'calls.log'), '');
  const say = (line: unknown) => writeFileSync(join(dir, 'answer.json'), JSON.stringify(line));
  say(answer);
  const argv = (...rest: string[]) => [process.execPath, FAKE_LABELS, dir, ...rest];
  return {
    say,
    probe: { command: argv('next'), claim: argv('claim', '{key}'), release: argv('release', '{key}', '--if-claimed', '--reason', '{reason}') },
    calls: () =>
      readFileSync(join(dir, 'calls.log'), 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l) as string[]),
    note: (text: string) => appendFileSync(join(dir, 'calls.log'), `${JSON.stringify([text])}\n`),
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
  (await pool.query('SELECT id, status, trigger, task_key, prompt_snapshot FROM runs WHERE loop_id = $1 ORDER BY iteration', [loopId])).rows as {
    id: string;
    status: string;
    trigger: string;
    task_key: string;
    prompt_snapshot: string;
  }[];
const claimsOf = async (loopId: string) =>
  (await pool.query('SELECT task_key, kind, closed_at FROM run_claims WHERE loop_id = $1 ORDER BY opened_at', [loopId])).rows as {
    task_key: string;
    kind: string;
    closed_at: Date | null;
  }[];
const PLAN = { v: 1, action: 'plan', plan: { key: 'plan-217', failing: ['G4', 'G5'] } };

describe('the plan action', () => {
  it('failure text: the run gets the failing goal rows in its prompt, and no label command runs', async () => {
    const world = makeWorld(PLAN);
    const id = await startedLoop(world);
    await server.inspect.backgroundTick();

    const [run] = await runsOf(id);
    expect(run).toMatchObject({ status: 'running', trigger: 'probe', task_key: 'plan-217' });
    expect(run!.prompt_snapshot).toBe(`${claimedLine('plan-217', 'plan')}\nFailing goal rows: G4, G5.\n\n${loopBody().prompt}`);
    expect(await claimsOf(id)).toEqual([{ task_key: 'plan-217', kind: 'plan', closed_at: null }]);
    expect(world.calls().map((c) => c[0])).toEqual(['next']); // no claim and no release
  });

  it('repeat: the same plan key while its run lives starts no second run, though the probe is called again', async () => {
    const world = makeWorld(PLAN);
    const id = await startedLoop(world, { maxConcurrent: 2 });
    await server.inspect.backgroundTick();
    expect((await call('POST', '/api/__test/clock', { advanceMs: 120_000 })).status).toBe(200);
    await server.inspect.backgroundTick();

    expect(world.calls().filter((c) => c[0] === 'next')).toHaveLength(2);
    expect(await runsOf(id)).toHaveLength(1);
    expect(await claimsOf(id)).toHaveLength(1);
  });
});

describe('the done action', () => {
  it('ends the period as Goal met, and the loop is stopped', async () => {
    const world = makeWorld({ v: 1, action: 'done' });
    const id = await startedLoop(world);
    await server.inspect.backgroundTick();

    const rows = (await pool.query('SELECT end_reason, ended_at FROM loop_executions WHERE loop_id = $1', [id])).rows;
    expect(rows).toEqual([{ end_reason: 'goal_met', ended_at: expect.any(Date) }]);
    const loop = await call('GET', `/api/loops/${id}`);
    expect(loop.body).toMatchObject({ status: 'stopped', currentExecution: { endReason: 'goal_met' } });
    expect(await runsOf(id)).toEqual([]);
  });
});
