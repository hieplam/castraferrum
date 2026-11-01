// A usage limit on the real server (composeServer): a fake Claude in a repo folder named lc-fake-claude-*, a wound clock, labels in a fake task tracker. G3.
import { existsSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FAKE_CLAUDE_DIR_PREFIX } from '../../server/adapters/executors/claude/test-mode-query';
import { loopBody, resetApi, startApi, testPool, type ApiServer } from '../support/api-kit';

const FAKE_LABELS = resolve('tests/support/fake-labels.mjs');
const HOUR = 3_600_000;

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

const windClock = (advanceMs: number) => call('POST', '/api/__test/clock', { advanceMs });

/** A loop on the fake Claude. `queue` null: no probe, so the first run starts at Start. */
async function limitLoop(queue: string[] | null, over: Record<string, unknown> = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), FAKE_CLAUDE_DIR_PREFIX)));
  const repo = await call('POST', '/api/repos', { path: dir, name: `limits ${dir.slice(-6)}` });
  expect(repo.status).toBe(201);
  const created = await call(
    'POST',
    '/api/loops',
    loopBody({ repoId: repo.body.id, prompt: 'Handle one task [limit]', executor: { kind: 'claude', config: { model: 'opus', effort: 'medium' } }, ...over }),
  );
  expect(created.status).toBe(201);
  const id = created.body.id as string;
  const world = mkdtempSync(join(tmpdir(), 'lc-limits-'));
  if (queue) {
    writeFileSync(join(world, 'queue.json'), JSON.stringify(queue));
    writeFileSync(join(world, 'calls.log'), '');
    const argv = (...rest: string[]) => [process.execPath, FAKE_LABELS, world, ...rest];
    const saved = await call('PUT', `/api/loops/${id}/probe`, { command: argv('next'), claim: argv('claim', '{key}'), release: argv('release', '{key}', '--if-claimed', '--reason', '{reason}') });
    expect(saved.status).toBe(200);
  }
  expect((await call('POST', `/api/loops/${id}/start`)).status).toBe(200);
  return { id, labelled: (key: string) => existsSync(join(world, `label-${key}`)), finished: (key: string) => existsSync(join(world, `done-${key}`)) };
}

const runsOf = async (loopId: string) =>
  (await pool.query('SELECT id, status, session_id, resume_count, error FROM runs WHERE loop_id = $1 ORDER BY iteration', [loopId])).rows as {
    id: string;
    status: string;
    session_id: string | null;
    resume_count: number;
    error: string | null;
  }[];
const holds = async () => (await pool.query('SELECT resource, closed_at FROM resource_holds')).rows as { resource: string; closed_at: Date | null }[];
const statusOf = async (id: string) => (await runsOf(id))[0]?.status;

describe('usage limit, real wiring', () => {
  it('G3: a fake rejected event gives held, and after the wound reset the same session ends succeeded with no person', async () => {
    const loop = await limitLoop(['141']);
    await server.inspect.backgroundTick();
    await expect.poll(() => statusOf(loop.id), { timeout: 10_000 }).toBe('held');
    const [held] = await runsOf(loop.id);
    expect(held!.session_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(loop.labelled('141')).toBe(true);

    await windClock(2 * HOUR); // the fake limit resets one hour from the real time
    await expect.poll(() => statusOf(loop.id), { timeout: 10_000 }).toBe('succeeded');

    expect(await runsOf(loop.id)).toEqual([{ id: held!.id, status: 'succeeded', session_id: held!.session_id, resume_count: 1, error: null }]);
    expect(await holds()).toEqual([{ resource: 'plan-window', closed_at: expect.any(Date) }]);
    await expect.poll(() => loop.finished('141'), { timeout: 10_000 }).toBe(true);
    expect(loop.labelled('141')).toBe(false);
  });

  it('a mock limit has no resetsAt: the hold has no end, and a trial 30 minutes later ends it', async () => {
    const loop = await limitLoop(['141'], { prompt: 'Handle one task [usage-limit]', executor: { kind: 'mock', config: { durationSec: 1, failRate: 0 } } });
    await server.inspect.backgroundTick();
    await expect.poll(() => statusOf(loop.id), { timeout: 10_000 }).toBe('held');
    const [held] = await runsOf(loop.id);

    await windClock(HOUR / 2);
    await expect.poll(() => statusOf(loop.id), { timeout: 10_000 }).toBe('succeeded');
    expect((await runsOf(loop.id))[0]).toMatchObject({ session_id: held!.session_id, resume_count: 1 });
    await expect.poll(async () => (await holds())[0]?.closed_at ?? null, { timeout: 10_000 }).toEqual(expect.any(Date));
  });

  it('control: a loop with no probe writes failed with the message, and no hold exists', async () => {
    const loop = await limitLoop(null);
    await expect.poll(() => statusOf(loop.id), { timeout: 10_000 }).toBe('failed');

    expect((await runsOf(loop.id))[0]).toMatchObject({ error: "You've hit your limit", resume_count: 0 });
    expect(await holds()).toEqual([]);
  });
});
