// SSE on a real port (fetch reads the stream): `/api/events` (state, no logs, heartbeat, deregistration on disconnect) and
// `/api/runs/:id/logs/stream` (replay then follow, no duplicate seq, `Last-Event-ID`, `end` when the run finishes).
// Every wait is event-driven (waitFor) - no hard sleep.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loopBody, MOCK_TICK_MS, openSse, resetApi, startApi, type ApiServer, type SseEvent } from '../support/api-kit';

let server: ApiServer;
let base: string;
beforeAll(async () => {
  server = await startApi();
  base = await server.listen();
});
afterAll(async () => {
  await server?.shutdown();
});
beforeEach(async () => {
  await resetApi(server);
});

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
async function post(url: string, body?: unknown): Promise<Json> {
  const res = await fetch(base + url, {
    method: 'POST',
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  return res.json() as Promise<Json>;
}
const data = (e: SseEvent) => e.data as Json;

describe('GET /api/events', () => {
  it('SSE headers; emits loop.created → execution.started → run.started → run.finished → execution.ended in order, no run.log', async () => {
    const sse = await openSse(`${base}/api/events`);
    expect(sse.res.status).toBe(200);
    expect(sse.res.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
    await sse.waitFor((e) => e.event === ':' && e.comment === 'ok'); // opening line → the browser sees `open` right away

    const loop = await post('/api/loops', loopBody({ executor: { kind: 'mock', config: { durationSec: 2 } } }));
    const started = await post(`/api/loops/${loop.id}/start`);
    const runId = started.activeRun.id;
    const finished = await sse.waitFor((e) => e.event === 'run.finished' && data(e).runId === runId, 40 * MOCK_TICK_MS + 3000);
    expect(data(finished)).toMatchObject({ type: 'run.finished', loopId: loop.id, status: 'succeeded' });
    expect(data(finished).at).toMatch(/Z$/);
    await post(`/api/loops/${loop.id}/stop`);
    await sse.waitFor((e) => e.event === 'execution.ended');

    const types = sse.data().map((e) => e.event);
    expect(types.filter((t) => t !== 'loop.updated')).toEqual([
      'loop.created',
      'execution.started',
      'run.started',
      'run.finished',
      'execution.ended',
    ]);
    expect(types).not.toContain('run.log');
    expect(data(sse.data().find((e) => e.event === 'execution.started')!)).toMatchObject({ seq: 1, executionId: started.currentExecution.id });
    expect(data(sse.data().find((e) => e.event === 'execution.ended')!)).toMatchObject({ reason: 'stopped' });
    await sse.close();
  });

  it('?loopId= only receives events of that loop', async () => {
    const a = await post('/api/loops', loopBody());
    const b = await post('/api/loops', loopBody());
    const sse = await openSse(`${base}/api/events?loopId=${b.id}`);
    await sse.waitFor((e) => e.comment === 'ok');
    await post(`/api/loops/${a.id}/start`);
    await post(`/api/loops/${b.id}/start`);
    await sse.waitFor((e) => e.event === 'run.started');
    expect(new Set(sse.data().map((e) => data(e).loopId))).toEqual(new Set([b.id]));
    await sse.close();
  });

  it('steady :ping heartbeat; listener disconnects → server deregisters from the bus', async () => {
    const before = server.inspect.listeners();
    const sse = await openSse(`${base}/api/events`);
    await sse.waitFor((e) => e.comment === 'ping');
    expect(server.inspect.listeners()).toBe(before + 1);
    await sse.close();
    await vi.waitFor(() => expect(server.inspect.listeners()).toBe(before));
  });
});

describe('GET /api/runs/:id/logs/stream', () => {
  it('replays stored logs then keeps following: sees working…, seq contiguous 1..n without duplicates, ends with an end event', async () => {
    const loop = await post('/api/loops', loopBody({ executor: { kind: 'mock', config: { durationSec: 6 } } }));
    const runId = (await post(`/api/loops/${loop.id}/start`)).activeRun.id;
    // Open the stream once the run has printed a few lines → the first part is replayed from the DB, the rest is live.
    await vi.waitFor(async () => {
      const logs = (await (await fetch(`${base}/api/runs/${runId}/logs`)).json()) as Json;
      expect(logs.items.length).toBeGreaterThanOrEqual(2);
    });
    const sse = await openSse(`${base}/api/runs/${runId}/logs/stream`);
    expect(sse.res.status).toBe(200);
    const end = await sse.waitFor((e) => e.event === 'end', 60 * MOCK_TICK_MS + 3000);
    expect(data(end)).toEqual({ runId, status: 'succeeded' });
    await sse.waitEnd(); // the server closes the stream itself after `end`

    const lines = sse.data().filter((e) => e.event === 'log');
    expect(lines.map((e) => data(e).seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(lines.map((e) => e.id)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    expect(lines.map((e) => data(e).message)).toContain('working… (3/6)');
    expect(data(lines.at(-1)!).message).toBe('Done (simulated)');
  });

  it('?after= and Last-Event-ID send only the lines after it; run already finished → replays everything then ends immediately', async () => {
    const loop = await post('/api/loops', loopBody({ executor: { kind: 'mock', config: { durationSec: 3 } } }));
    const runId = (await post(`/api/loops/${loop.id}/start`)).activeRun.id;
    await vi.waitFor(async () => expect(((await (await fetch(`${base}/api/runs/${runId}`)).json()) as Json).status).toBe('succeeded'), {
      timeout: 40 * MOCK_TICK_MS + 3000,
    });
    const seqs = async (url: string, headers?: Record<string, string>) => {
      const sse = await openSse(url, headers);
      await sse.waitFor((e) => e.event === 'end');
      await sse.waitEnd();
      return sse.data().filter((e) => e.event === 'log').map((e) => data(e).seq);
    };
    expect(await seqs(`${base}/api/runs/${runId}/logs/stream`)).toEqual([1, 2, 3, 4, 5]);
    expect(await seqs(`${base}/api/runs/${runId}/logs/stream?after=2`)).toEqual([3, 4, 5]);
    expect(await seqs(`${base}/api/runs/${runId}/logs/stream`, { 'last-event-id': '4' })).toEqual([5]);
  });

  it('Stop midway → a "Cancelled (Stop)" line then end with cancelled', async () => {
    const loop = await post('/api/loops', loopBody());
    const runId = (await post(`/api/loops/${loop.id}/start`)).activeRun.id;
    const sse = await openSse(`${base}/api/runs/${runId}/logs/stream`);
    await sse.waitFor((e) => e.event === 'log' && String(data(e).message).startsWith('working…'));
    await post(`/api/loops/${loop.id}/stop`);
    const end = await sse.waitFor((e) => e.event === 'end');
    expect(data(end)).toEqual({ runId, status: 'cancelled' });
    expect(sse.data().filter((e) => e.event === 'log').map((e) => data(e).message)).toContain('Cancelled (Stop)');
  });

  it('unknown run → 404 RUN_NOT_FOUND as JSON (no stream opened)', async () => {
    for (const id of ['00000000-0000-4000-8000-000000000000', 'xyz']) {
      const res = await fetch(`${base}/api/runs/${id}/logs/stream`);
      expect(res.status).toBe(404);
      expect(res.headers.get('content-type')).toMatch(/application\/json/);
      expect(((await res.json()) as Json).error.code).toBe('RUN_NOT_FOUND');
    }
  });
});
