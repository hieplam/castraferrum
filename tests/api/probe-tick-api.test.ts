// Probe tick on the real server (composeServer): a real child process through NodeCommandRunner, results cross-checked with SELECT.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loopBody, resetApi, startApi, testPool, type ApiServer } from '../support/api-kit';

const FAKE_PROBE = resolve('tests/support/fake-probe.mjs');
const folder = mkdtempSync(join(tmpdir(), 'lc-probe-tick-'));

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

/** A started loop whose probe prints the file `lineFile`. */
async function startedProbeLoop(lineFile: string): Promise<Json> {
  const created = await call('POST', '/api/loops', loopBody());
  expect(created.status).toBe(201);
  const id = created.body.id as string;
  const saved = await call('PUT', `/api/loops/${id}/probe`, { command: [process.execPath, FAKE_PROBE, lineFile] });
  expect(saved.status).toBe(200);
  const started = await call('POST', `/api/loops/${id}/start`);
  expect(started.status).toBe(200);
  return started.body;
}

const probeRow = async (id: string) =>
  (await pool.query('SELECT state, last_line, last_probe_at FROM loop_probes WHERE loop_id = $1', [id])).rows[0];
const runCount = async (id: string) => (await pool.query('SELECT count(*)::int AS n FROM runs WHERE loop_id = $1', [id])).rows[0].n as number;

describe('probe tick', () => {
  it('Start gives no run and no next run, and one background tick stores the state of a real probe line', async () => {
    const lineFile = join(folder, 'wait.txt');
    const line = '{"v":1,"action":"wait","reason":"needs a login"}';
    writeFileSync(lineFile, `checking\n${line}\n`);
    const loop = await startedProbeLoop(lineFile);
    expect(loop).toMatchObject({ status: 'active', nextRunAt: null, activeRun: null });
    await server.inspect.backgroundTick();
    expect(await probeRow(loop.id)).toMatchObject({ state: 'waiting', last_line: line });
    expect(await runCount(loop.id)).toBe(0);
  });

  it('a failing probe gives probe_failed and no run, and a loop with no probe still gets its first run', async () => {
    const loop = await startedProbeLoop(join(folder, 'no-such-file.txt'));
    await server.inspect.backgroundTick();
    expect(await probeRow(loop.id)).toMatchObject({ state: 'probe_failed', last_line: 'exit 1' });
    expect(await runCount(loop.id)).toBe(0);

    const plain = await call('POST', '/api/loops', loopBody());
    const started = await call('POST', `/api/loops/${plain.body.id}/start`);
    expect(started.body.nextRunAt).not.toBeNull();
    expect(await runCount(plain.body.id)).toBe(1);
  });
});
