/// <reference lib="dom" />
// E2E for an idle probe loop (goal-driven loop, G1): a loop whose probe says `wait`, `skip` or `done` starts no session and makes no run.
// Real from end to end: Fastify -> Postgres (test DB, test mode) -> the background tick -> a real child process (tests/support/fake-probe-seq.mjs).
// The probe is called once per 60 s of the server clock, so the test moves that clock (`POST /api/__test/clock`) and counts the calls in
// `calls.log`. The second loop (the witness) always prints `skip`: its calls go on after the first loop has ended, so real ticks prove the count.
// Every assertion is checked against a `SELECT` on the DB.
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test, type APIRequestContext } from '@playwright/test';
import pg from 'pg';
import { databaseUrl, loadDotEnv } from '../../server/config';

loadDotEnv();

const FAKE_PROBE_SEQ = resolve('tests/support/fake-probe-seq.mjs');
const WAIT = '{"v":1,"action":"wait","reason":"needs a login"}';
const SKIP = '{"v":1,"action":"skip"}';
const DONE = '{"v":1,"action":"done"}';
const TAKE = '{"v":1,"action":"take","tasks":[{"key":"t1"}]}';

let db: pg.Pool;
test.beforeAll(() => {
  db = new pg.Pool({ connectionString: databaseUrl(process.env, 'test'), max: 3 });
});
test.afterAll(async () => {
  await db?.end();
});
test.beforeEach(async ({ request }) => {
  expect((await request.post('/api/__test/reset')).status()).toBe(204);
});

async function until<T>(read: () => T | Promise<T>, ok: (v: T) => boolean, ms = 20_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await read();
    if (ok(v)) return v;
    if (Date.now() > end) throw new Error(`timed out after ${ms} ms waiting: ${JSON.stringify(v)}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

/** The number of probe calls so far: one line of `calls.log` for each call. */
const callsOf = (world: string): number => {
  try {
    return readFileSync(join(world, 'calls.log'), 'utf8').split('\n').filter((l) => l !== '').length;
  } catch {
    return 0;
  }
};

/** A started probe loop on a Mock executor whose probe prints the entries of `lines` in order. Returns the loop id and the folder of its calls. */
async function probeLoop(request: APIRequestContext, repoId: string, name: string, lines: string[]): Promise<{ id: string; world: string }> {
  const world = realpathSync(mkdtempSync(join(tmpdir(), 'lc-probe-seq-')));
  writeFileSync(join(world, 'lines.json'), JSON.stringify(lines));
  const created = await request.post('/api/loops', {
    data: {
      name,
      description: 'description',
      prompt: 'Do the task',
      repoId,
      cron: '0 0 1 1 *', // once a year: only the probe starts work
      timezone: 'Asia/Ho_Chi_Minh',
      timeoutSec: 600,
      executor: { kind: 'mock', config: { durationSec: 600, failRate: 0 } },
    },
  });
  expect(created.status()).toBe(201);
  const id = ((await created.json()) as { id: string }).id;
  expect((await request.put(`/api/loops/${id}/probe`, { data: { command: [process.execPath, FAKE_PROBE_SEQ, world] } })).status()).toBe(200);
  expect((await request.post(`/api/loops/${id}/start`)).status()).toBe(200);
  return { id, world };
}

async function repoOf(request: APIRequestContext): Promise<string> {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'lc-probe-repo-')));
  const repo = await request.post('/api/repos', { data: { path: dir, name: 'probe repo' } });
  expect(repo.status()).toBe(201);
  return ((await repo.json()) as { id: string }).id;
}

const runCount = async (loopId: string) => (await db.query('SELECT count(*)::int AS n FROM runs WHERE loop_id = $1', [loopId])).rows[0].n as number;

test('G1: a probe that says wait, skip, done starts no session; the loop ends as goal_met, and a second idle loop proves that the calls are real ticks', async ({ request }) => {
  test.setTimeout(120_000);
  const repoId = await repoOf(request);
  const advance = async (ms: number) => expect((await request.post('/api/__test/clock', { data: { advanceMs: ms } })).status()).toBe(200);

  const witness = await probeLoop(request, repoId, 'witness', [SKIP]);
  const first = await probeLoop(request, repoId, 'first', [WAIT, SKIP, DONE]);
  await until(() => callsOf(first.world), (n) => n === 1);
  await until(() => callsOf(witness.world), (n) => n === 1);
  expect((await db.query('SELECT state FROM loop_probes WHERE loop_id = $1', [first.id])).rows[0].state).toBe('waiting');

  await advance(60_000);
  await until(() => callsOf(first.world), (n) => n === 2);
  await advance(60_000);
  await until(() => callsOf(first.world), (n) => n === 3);

  // `done` with no live run ends the period at once.
  const ended = await until(
    async () => (await db.query('SELECT end_reason FROM loop_executions WHERE loop_id = $1', [first.id])).rows[0]?.end_reason as string | null,
    (reason) => reason === 'goal_met',
  );
  expect(ended).toBe('goal_met');
  expect(await runCount(first.id)).toBe(0);
  expect(await runCount(witness.id)).toBe(0);

  // The witness goes on: each 120 s of the clock gives it one more call, and the first loop (not active any more) gets none.
  const before = await until(() => callsOf(witness.world), (n) => n >= 3);
  for (const step of [1, 2]) {
    await advance(120_000);
    await until(() => callsOf(witness.world), (n) => n >= before + step);
  }
  expect(callsOf(first.world)).toBe(3);
  expect(await runCount(first.id)).toBe(0);
  expect(await runCount(witness.id)).toBe(0);
});

test('G1 control: the same loop with a take line and no claim command starts a run', async ({ request }) => {
  test.setTimeout(60_000);
  const repoId = await repoOf(request);
  const loop = await probeLoop(request, repoId, 'control', [TAKE]);
  await until(() => runCount(loop.id), (n) => n === 1);
  expect(callsOf(loop.world)).toBeGreaterThanOrEqual(1);
  expect((await db.query('SELECT trigger FROM runs WHERE loop_id = $1', [loop.id])).rows[0].trigger).toBe('probe');
});
