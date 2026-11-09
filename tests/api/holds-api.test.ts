// GET /api/holds (goal G28): the open holds, oldest first, with the iteration of the run that opened each one. Real server (composeServer) + test Postgres.
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loopBody, resetApi, startApi, testPool, type ApiServer } from '../support/api-kit';

let server: ApiServer;
let pool: pg.Pool;
beforeAll(async () => {
  // No ticker: the hold service of a ticking server closes an open docker hold when Docker is up, between the INSERT and the GET (issue 426).
  server = await startApi({}, { ticker: false });
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
const get = async () => {
  const res = await server.app.inject({ method: 'GET', url: '/api/holds' });
  return { status: res.statusCode, body: res.json() as Json };
};

/** A loop that Start gave a first run: returns that run (id, iteration 1). */
async function firstRun(): Promise<{ id: string; iteration: number }> {
  const created = await server.app.inject({ method: 'POST', url: '/api/loops', payload: loopBody() });
  expect(created.statusCode).toBe(201);
  const start = await server.app.inject({ method: 'POST', url: `/api/loops/${created.json().id as string}/start` });
  expect(start.statusCode).toBe(200);
  const { rows } = await pool.query('SELECT id, iteration FROM runs ORDER BY iteration LIMIT 1');
  return rows[0] as { id: string; iteration: number };
}

const insertHold = (o: { resource: string; openedAt: string; until?: string | null; closedAt?: string | null; runId?: string | null }) =>
  pool.query('INSERT INTO resource_holds (id, resource, reason, opened_at, "until", closed_at, opened_by_run_id) VALUES ($1, $2, $3, $4, $5, $6, $7)', [
    randomUUID(),
    o.resource,
    'The usage limit is reached.',
    o.openedAt,
    o.until ?? null,
    o.closedAt ?? null,
    o.runId ?? null,
  ]);

describe('GET /api/holds', () => {
  it('answers an empty list while no hold is open', async () => {
    expect(await get()).toEqual({ status: 200, body: { holds: [] } });
  });

  it('lists an open hold with the iteration of the run that opened it, oldest first', async () => {
    const run = await firstRun();
    await insertHold({ resource: 'docker', openedAt: '2026-11-01T06:58:00.000Z', until: null, runId: null });
    await insertHold({ resource: 'plan-window', openedAt: '2026-11-01T06:50:00.000Z', until: '2026-11-01T12:00:00.000Z', runId: run.id });
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.body.holds).toEqual([
      {
        id: expect.any(String),
        resource: 'plan-window',
        reason: 'The usage limit is reached.',
        openedAt: '2026-11-01T06:50:00.000Z',
        until: '2026-11-01T12:00:00.000Z',
        openedByRun: { id: run.id, iteration: run.iteration },
      },
      { id: expect.any(String), resource: 'docker', reason: 'The usage limit is reached.', openedAt: '2026-11-01T06:58:00.000Z', until: null, openedByRun: null },
    ]);
  });

  it('does not list a closed hold', async () => {
    await insertHold({ resource: 'docker', openedAt: '2026-11-01T06:00:00.000Z', closedAt: '2026-11-01T06:30:00.000Z' });
    expect((await get()).body).toEqual({ holds: [] });
  });
});
