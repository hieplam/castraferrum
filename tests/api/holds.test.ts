// One root cause on the real server (composeServer): the real command runner, labels in a fake task tracker, a fake Claude, no GitHub. G23.
import { mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FAKE_CLAUDE_DIR_PREFIX } from '../../server/adapters/executors/claude/test-mode-query';
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

type Queue = (string | { key: string; resources: string[] })[];
type Options = { queue: Queue | null; prompt: string; maxConcurrent: number; resources?: { name: string; check: string[]; everySec: number }[] };

/** A loop on the fake Claude. `queue` null: no probe. */
async function holdLoop({ queue, prompt, maxConcurrent, resources }: Options) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), FAKE_CLAUDE_DIR_PREFIX)));
  const repo = await call('POST', '/api/repos', { path: dir, name: `holds ${dir.slice(-6)}` });
  expect(repo.status).toBe(201);
  const created = await call('POST', '/api/loops', loopBody({ repoId: repo.body.id, prompt, maxConcurrent, executor: { kind: 'claude', config: { model: 'opus', effort: 'medium' } } }));
  expect(created.status).toBe(201);
  const id = created.body.id as string;
  if (queue) {
    const world = mkdtempSync(join(tmpdir(), 'lc-holds-'));
    writeFileSync(join(world, 'queue.json'), JSON.stringify(queue));
    writeFileSync(join(world, 'calls.log'), '');
    const argv = (...rest: string[]) => [process.execPath, FAKE_LABELS, world, ...rest];
    const saved = await call('PUT', `/api/loops/${id}/probe`, { command: argv('next'), claim: argv('claim', '{key}'), release: argv('release', '{key}', '--if-claimed', '--reason', '{reason}'), resources });
    expect(saved.status).toBe(200);
  }
  expect((await call('POST', `/api/loops/${id}/start`)).status).toBe(200);
  return id;
}

const statuses = async (loopId: string) => (await pool.query('SELECT task_key, status FROM runs WHERE loop_id = $1 ORDER BY iteration', [loopId])).rows as { task_key: string; status: string }[];
const openHolds = async () => (await pool.query('SELECT resource FROM resource_holds WHERE closed_at IS NULL')).rows as { resource: string }[];
const closedHolds = async () => (await pool.query('SELECT resource FROM resource_holds WHERE closed_at IS NOT NULL')).rows as { resource: string }[];
const notices = async () => (await pool.query('SELECT dedupe_key, kind FROM notices')).rows as { dedupe_key: string; kind: string }[];

describe('one cause, real wiring', () => {
  it('G23: two runs report one limit: 1 hold, 1 notice, both runs held, and no new task starts', async () => {
    const id = await holdLoop({ queue: ['141', '142', '143'], prompt: 'Handle one task [limit]', maxConcurrent: 2 });
    await server.inspect.backgroundTick();
    await expect.poll(async () => (await statuses(id)).map((r) => r.status), { timeout: 10_000 }).toEqual(['held', 'held']);

    await server.inspect.backgroundTick();
    expect(await openHolds()).toEqual([{ resource: 'plan-window' }]);
    expect(await notices()).toEqual([{ dedupe_key: 'hold:plan-window', kind: 'hold' }]);
    expect((await statuses(id)).map((r) => r.task_key)).toEqual(['141', '142']);
  });

  it('G23: RESOURCE_DOWN holds its tasks, another task runs, and a passing check clears the hold', async () => {
    const flag = join(realpathSync(mkdtempSync(join(tmpdir(), 'lc-holds-flag-'))), 'up');
    const check = [process.execPath, '-e', `process.exit(require('node:fs').existsSync(${JSON.stringify(flag)}) ? 0 : 1)`];
    const id = await holdLoop({
      queue: [{ key: 'docker-1', resources: ['docker'] }],
      prompt: 'Handle one task [run-end:RESOURCE_DOWN:docker]',
      maxConcurrent: 1,
      resources: [{ name: 'docker', check, everySec: 1 }],
    });
    await server.inspect.backgroundTick();
    await expect.poll(() => openHolds(), { timeout: 10_000 }).toEqual([{ resource: 'docker' }]);
    await expect.poll(async () => (await statuses(id))[0]?.status, { timeout: 10_000 }).toBe('succeeded');
    expect(await notices()).toEqual([{ dedupe_key: 'hold:docker', kind: 'hold' }]);

    const other = await holdLoop({ queue: ['plain', { key: 'docker-2', resources: ['docker'] }], prompt: 'Handle one task', maxConcurrent: 1 });
    await server.inspect.backgroundTick();
    await expect.poll(async () => (await statuses(other)).map((r) => r.task_key), { timeout: 10_000 }).toEqual(['plain']);
    await expect.poll(async () => (await statuses(other)).map((r) => r.status), { timeout: 10_000 }).toEqual(['succeeded']);

    await server.inspect.backgroundTick();
    await call('POST', '/api/__test/clock', { advanceMs: 61_000 }); // a new probe call: docker-2 stays out while the hold is open
    await server.inspect.backgroundTick();
    expect((await statuses(other)).map((r) => r.task_key)).toEqual(['plain']);

    // The first loop stops, because its only task would report the resource down again. The check does not depend on a loop that runs.
    expect((await call('POST', `/api/loops/${id}/stop`)).status).toBe(200);
    writeFileSync(flag, '');
    await expect.poll(() => closedHolds(), { timeout: 10_000 }).toEqual([{ resource: 'docker' }]);
    await call('POST', '/api/__test/clock', { advanceMs: 61_000 });
    await expect.poll(async () => (await statuses(other)).map((r) => r.task_key), { timeout: 10_000 }).toEqual(['plain', 'docker-2']);
  });

  it('control: two runs with no probe fail on their own: no hold and no notice', async () => {
    const id = await holdLoop({ queue: null, prompt: 'Handle one task [limit]', maxConcurrent: 1 });
    const second = await holdLoop({ queue: null, prompt: 'Handle one task [limit]', maxConcurrent: 1 });
    await expect.poll(async () => [...(await statuses(id)), ...(await statuses(second))].map((r) => r.status), { timeout: 10_000 }).toEqual(['failed', 'failed']);

    expect(await openHolds()).toEqual([]);
    expect(await notices()).toEqual([]);
  });
});
