// Process events API (goal G14): the run events of a period, without names. Real server (composeServer) + test Postgres.
// Runs are inserted with SQL so that each test controls started_at, status and the three text columns.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const FIXTURE_KEYS = Object.keys(
  (JSON.parse(readFileSync(fileURLToPath(new URL('../fixtures/process-review/events.json', import.meta.url)), 'utf8')) as Json[])[0]!,
).sort();
const LOOP_NAME = 'secret-loop-name-xyz';
const PROMPT = 'secret-prompt-text-xyz';
const DAY = 86_400_000;

let loopId = '';
let executionId = '';
let iteration = 0;
beforeEach(async () => {
  await resetApi(server);
  const loop = (await call('/api/loops', 'POST', loopBody({ name: LOOP_NAME, prompt: PROMPT }))).body;
  loopId = loop.id as string;
  executionId = randomUUID();
  iteration = 0;
  await pool.query(`INSERT INTO loop_executions (id, loop_id, seq, started_at) VALUES ($1, $2, 1, '2026-10-01T00:00:00Z')`, [executionId, loopId]);
});

async function call(url: string, method: 'GET' | 'POST' = 'GET', payload?: unknown) {
  const res = await server.app.inject({ method, url, ...(payload === undefined ? {} : { payload: payload as Json }) });
  return { status: res.statusCode, body: (res.body ? res.json() : null) as Json };
}
const events = (from: string, to: string) => call(`/api/process/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);

async function addRun(startedAt: string, over: { status?: string; error?: string | null; summary?: string | null; skip?: string | null } = {}): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO runs (id, loop_id, execution_id, iteration, trigger, status, skip_reason, started_at, prompt_snapshot,
                       executor_kind, executor_config, summary, error)
     VALUES ($1, $2, $3, $4, 'schedule', $5, $6, $7, $8, 'mock', '{}', $9, $10)`,
    [id, loopId, executionId, ++iteration, over.status ?? 'succeeded', over.skip ?? null, startedAt, PROMPT, over.summary ?? null, over.error ?? null],
  );
  return id;
}

describe('GET /api/process/events (G14)', () => {
  it('answers the runs of the range, oldest first, with the loop id and the status', async () => {
    const late = await addRun('2026-10-20T10:00:00Z', { status: 'failed', error: 'late' });
    const early = await addRun('2026-10-19T10:00:00Z');
    const res = await events('2026-10-19T00:00:00Z', '2026-10-21T00:00:00Z');
    expect(res.status).toBe(200);
    expect(res.body.events).toEqual([
      { id: early, at: '2026-10-19T10:00:00.000Z', loop: loopId, status: 'succeeded', text: '' },
      { id: late, at: '2026-10-20T10:00:00.000Z', loop: loopId, status: 'failed', text: 'late' },
    ]);
  });

  it('includes a run that starts at from and excludes a run that starts at to', async () => {
    const inside = await addRun('2026-10-19T00:00:00Z');
    await addRun('2026-10-20T00:00:00Z');
    await addRun('2026-10-18T23:59:59Z');
    const res = await events('2026-10-19T00:00:00Z', '2026-10-20T00:00:00Z');
    expect(res.body.events.map((e: Json) => e.id)).toEqual([inside]);
  });

  it('joins the non-empty error, summary and skip reason with a newline, each cut at 2000 characters', async () => {
    await addRun('2026-10-19T01:00:00Z', { status: 'failed', error: 'E', summary: 'S', skip: 'K' });
    await addRun('2026-10-19T02:00:00Z', { status: 'failed', error: 'E', summary: '', skip: 'K' });
    await addRun('2026-10-19T03:00:00Z', { status: 'failed', error: 'x'.repeat(2500), summary: 'S' });
    const res = await events('2026-10-19T00:00:00Z', '2026-10-20T00:00:00Z');
    expect(res.body.events.map((e: Json) => e.text)).toEqual(['E\nS\nK', 'E\nK', `${'x'.repeat(2000)}\nS`]);
  });

  it('gives an empty text for a run with no error, summary or skip reason', async () => {
    await addRun('2026-10-19T01:00:00Z', { error: null, summary: '', skip: null });
    const res = await events('2026-10-19T00:00:00Z', '2026-10-20T00:00:00Z');
    expect(res.body.events).toHaveLength(1);
    expect(res.body.events[0].text).toBe('');
  });

  it('gives each event exactly the keys of the fixture events.json', async () => {
    await addRun('2026-10-19T01:00:00Z', { summary: 'S' });
    const res = await events('2026-10-19T00:00:00Z', '2026-10-20T00:00:00Z');
    expect(Object.keys(res.body)).toEqual(['events']);
    expect(res.body.events).toHaveLength(1);
    expect(Object.keys(res.body.events[0]).sort()).toEqual(FIXTURE_KEYS);
  });

  it('holds no loop name and no prompt in the body', async () => {
    await addRun('2026-10-19T01:00:00Z', { summary: 'S' });
    const res = await server.app.inject({ method: 'GET', url: '/api/process/events?from=2026-10-19T00:00:00Z&to=2026-10-20T00:00:00Z' });
    expect(res.statusCode).toBe(200);
    expect(res.json().events).toHaveLength(1);
    expect(res.body).not.toContain(LOOP_NAME);
    expect(res.body).not.toContain(PROMPT);
    expect(res.body).not.toContain('/');
  });

  it('answers 400 VALIDATION_FAILED when from is after to, or equal to it', async () => {
    for (const [from, to] of [
      ['2026-10-20T00:00:00Z', '2026-10-19T00:00:00Z'],
      ['2026-10-20T00:00:00Z', '2026-10-20T00:00:00Z'],
    ] as const) {
      const res = await events(from, to);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    }
  });

  it('answers 400 VALIDATION_FAILED for a range over 31 days, and accepts exactly 31 days', async () => {
    const from = '2026-10-01T00:00:00.000Z';
    const over = await events(from, new Date(Date.parse(from) + 32 * DAY).toISOString());
    expect([over.status, over.body.error.code]).toEqual([400, 'VALIDATION_FAILED']);
    const edge = await events(from, new Date(Date.parse(from) + 31 * DAY).toISOString());
    expect(edge.status).toBe(200);
  });

  it('answers 400 VALIDATION_FAILED when from or to is missing or not an ISO date', async () => {
    for (const url of [
      '/api/process/events?to=2026-10-20T00:00:00Z',
      
      '/api/process/events?from=2026-10-19T00:00:00Z',
      '/api/process/events?from=yesterday&to=2026-10-20T00:00:00Z',
    ]) {
      const res = await call(url);
      expect([res.status, res.body.error.code]).toEqual([400, 'VALIDATION_FAILED']);
    }
  });
});
