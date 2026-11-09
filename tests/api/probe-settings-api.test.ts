// Probe settings API (`/api/loops/:id/probe`): every route and error code on the real server (composeServer) + test Postgres.
// Results are cross-checked with a SELECT straight on the DB (loop_probes), so a route that returns hard-coded JSON is caught.
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loopBody, resetApi, startApi, testPool, type ApiServer } from '../support/api-kit';

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
async function call(method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) {
  const res = await server.app.inject({ method, url, ...(payload === undefined ? {} : { payload: payload as Json }) });
  return { status: res.statusCode, body: (res.body ? res.json() : null) as Json };
}
async function createLoop(): Promise<string> {
  const res = await call('POST', '/api/loops', loopBody());
  expect(res.status).toBe(201);
  return res.body.id as string;
}
const rows = async (loopId: string) => (await pool.query('SELECT * FROM loop_probes WHERE loop_id = $1', [loopId])).rows;
const MISSING = '00000000-0000-4000-8000-000000000000';

const body = {
  command: ['node', 'probe.mjs'],
  claim: ['node', 'claim.mjs', '{key}'],
  release: ['node', 'release.mjs', '{key}', '{reason}'],
  resources: [{ name: 'docker', check: ['docker', 'info'], everySec: 30 }],
  laneEnv: { PORT: '{port}' },
  laneBasePort: 7200,
  restartPolicy: 'resume',
};

describe('GET /api/loops/:id/probe', () => {
  it('200 { probe: null } for a loop with no probe; LOOP_NOT_FOUND for an unknown loop', async () => {
    const id = await createLoop();
    expect(await call('GET', `/api/loops/${id}/probe`)).toMatchObject({ status: 200, body: { probe: null } });
    expect(await rows(id)).toHaveLength(0);
    const missing = await call('GET', `/api/loops/${MISSING}/probe`);
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('LOOP_NOT_FOUND');
  });

  it('200 with the saved probe, as in the DB', async () => {
    const id = await createLoop();
    await call('PUT', `/api/loops/${id}/probe`, body);
    const res = await call('GET', `/api/loops/${id}/probe`);
    expect(res.status).toBe(200);
    expect(res.body.probe).toEqual({ loopId: id, ...body, tokenBudget: null, state: 'active', lastLine: null, lastProbeAt: null });
    const [row] = await rows(id);
    expect(row).toMatchObject({ command: body.command, lane_base_port: 7200, restart_policy: 'resume', state: 'active' });
  });
});

describe('PUT /api/loops/:id/probe', () => {
  it('200 stores the settings and the row has them', async () => {
    const id = await createLoop();
    const res = await call('PUT', `/api/loops/${id}/probe`, body);
    expect(res.status).toBe(200);
    expect(res.body.probe).toMatchObject({ loopId: id, command: body.command, restartPolicy: 'resume', state: 'active' });
    const [row] = await rows(id);
    expect(row).toMatchObject({ loop_id: id, claim: body.claim, release: body.release, resources: body.resources, lane_env: body.laneEnv });
  });

  it('200 stores `tokenBudget`, and the row has it; an omitted field gives no budget', async () => {
    const id = await createLoop();
    const res = await call('PUT', `/api/loops/${id}/probe`, { ...body, tokenBudget: 5_000_000_000 });
    expect(res.status).toBe(200);
    expect(res.body.probe).toMatchObject({ tokenBudget: 5_000_000_000 });
    expect((await call('GET', `/api/loops/${id}/probe`)).body.probe).toMatchObject({ tokenBudget: 5_000_000_000 });
    const [row] = await rows(id);
    expect(row).toMatchObject({ token_budget: '5000000000' });
    expect((await call('PUT', `/api/loops/${id}/probe`, body)).body.probe).toMatchObject({ tokenBudget: null });
  });

  it('400 VALIDATION_FAILED for a budget under 1, and no row', async () => {
    const id = await createLoop();
    const res = await call('PUT', `/api/loops/${id}/probe`, { ...body, tokenBudget: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error.details.issues.map((i: Json) => `${i.field}:${i.code}`)).toEqual(['tokenBudget:outOfRange']);
    expect(await rows(id)).toHaveLength(0);
  });

  it('a second PUT replaces the settings, keeps one row, and an omitted field takes its default', async () => {
    const id = await createLoop();
    await call('PUT', `/api/loops/${id}/probe`, body);
    const res = await call('PUT', `/api/loops/${id}/probe`, { command: ['node', 'next.mjs'] });
    expect(res.body.probe).toMatchObject({ command: ['node', 'next.mjs'], claim: [], resources: [], laneEnv: {}, laneBasePort: null, restartPolicy: 'stop' });
    const found = await rows(id);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ command: ['node', 'next.mjs'], claim: [], restart_policy: 'stop' });
  });

  it('409 LOOP_IS_ACTIVE for a running loop and no row; 409 LOOP_ARCHIVED for an archived loop', async () => {
    const id = await createLoop();
    expect((await call('POST', `/api/loops/${id}/start`)).status).toBe(200);
    const active = await call('PUT', `/api/loops/${id}/probe`, body);
    expect(active.status).toBe(409);
    expect(active.body.error.code).toBe('LOOP_IS_ACTIVE');
    expect(await rows(id)).toHaveLength(0);
    expect((await call('POST', `/api/loops/${id}/stop`)).status).toBe(200);

    expect((await call('POST', `/api/loops/${id}/archive`)).status).toBe(204);
    const archived = await call('PUT', `/api/loops/${id}/probe`, body);
    expect(archived.status).toBe(409);
    expect(archived.body.error.code).toBe('LOOP_ARCHIVED');
    expect(await rows(id)).toHaveLength(0);
  });

  it('400 VALIDATION_FAILED lists claim:missingKey, release:missingKey, release:missingReason, resources:reserved; a wrong type is refused too', async () => {
    const id = await createLoop();
    const res = await call('PUT', `/api/loops/${id}/probe`, {
      command: ['node', 'probe.mjs'],
      claim: ['gh', 'claim'],
      release: ['gh', 'release'],
      resources: [{ name: 'plan-window', check: ['true'], everySec: 30 }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details.issues.map((i: Json) => `${i.field}:${i.code}`)).toEqual([
      'claim:missingKey',
      'release:missingKey',
      'release:missingReason',
      'resources:reserved',
    ]);
    const wrong = await call('PUT', `/api/loops/${id}/probe`, { command: 'node probe.mjs' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.code).toBe('VALIDATION_FAILED');
    expect(await rows(id)).toHaveLength(0);
  });
});

describe('DELETE /api/loops/:id/probe', () => {
  it('204 deletes the row; a second DELETE is 204 too; GET gives { probe: null }; unknown loop 404', async () => {
    const id = await createLoop();
    await call('PUT', `/api/loops/${id}/probe`, body);
    expect((await call('DELETE', `/api/loops/${id}/probe`)).status).toBe(204);
    expect(await rows(id)).toHaveLength(0);
    expect((await call('DELETE', `/api/loops/${id}/probe`)).status).toBe(204);
    expect((await call('GET', `/api/loops/${id}/probe`)).body).toEqual({ probe: null });
    expect((await call('DELETE', `/api/loops/${MISSING}/probe`)).status).toBe(404);
  });
});
