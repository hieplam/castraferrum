// Notices API (goal G23: one cause gives one unread notice, and one push if a webhook is set) on the real server
// (composeServer) + test Postgres. Every result is cross-checked with a SELECT. The webhook test posts only to a
// server that this file starts on 127.0.0.1; nothing here talks to an external service.
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Notice } from '../../shared/domain/notice';
import { resetApi, startApi, testPool, type ApiServer } from '../support/api-kit';

let pool: pg.Pool;
let server: ApiServer | null = null;
let hook: Hook | null = null;
beforeAll(() => {
  pool = testPool();
});
afterAll(async () => {
  await pool?.end();
});
afterEach(async () => {
  await server?.shutdown();
  server = null;
  await hook?.close();
  hook = null;
});

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const MISSING = '00000000-0000-4000-8000-000000000000';
const AT = new Date('2026-11-01T01:00:00.000Z');
const holdNotice = (over: Partial<Notice> = {}): Notice => ({
  dedupeKey: 'hold:ci-red',
  kind: 'hold',
  loopId: null,
  messageKey: 'notice.hold',
  params: { reason: 'the CI is red' },
  at: AT,
  ...over,
});

/** A local HTTP server that records every request body it gets. */
type Hook = { url: string; bodies: string[]; close(): Promise<void> };
async function startHook(): Promise<Hook> {
  const bodies: string[] = [];
  const srv: Server = createServer((req: IncomingMessage, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      bodies.push(body);
      res.writeHead(204).end();
    });
  });
  await new Promise<void>((ok) => srv.listen(0, '127.0.0.1', ok));
  const url = `http://127.0.0.1:${(srv.address() as AddressInfo).port}/hook`;
  return { url, bodies, close: () => new Promise<void>((ok) => (srv.closeAllConnections(), srv.close(() => ok()))) };
}

async function boot(over: Parameters<typeof startApi>[0] = {}): Promise<ApiServer> {
  server = await startApi(over);
  await resetApi(server);
  return server;
}
async function call(method: 'GET' | 'POST', url: string) {
  const res = await server!.app.inject({ method, url });
  return { status: res.statusCode, body: (res.body ? res.json() : null) as Json };
}
const rows = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows;

describe('notices (G23)', () => {
  it('send twice with the same key gives 1 unread row, in the DB and in GET /api/notices', async () => {
    await boot();
    await server!.notifier.send(holdNotice());
    await server!.notifier.send(holdNotice());
    const list = await call('GET', '/api/notices');
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({
      dedupeKey: 'hold:ci-red',
      kind: 'hold',
      loopId: null,
      messageKey: 'notice.hold',
      params: { reason: 'the CI is red' },
      at: AT.toISOString(),
    });
    expect(await rows("SELECT read_at FROM notices WHERE dedupe_key = 'hold:ci-red'")).toEqual([{ read_at: null }]);
  });

  it('read, then send again gives a new unread row; the read row stays read', async () => {
    await boot();
    await server!.notifier.send(holdNotice());
    const first = (await call('GET', '/api/notices')).body.items[0].id as string;
    expect((await call('POST', `/api/notices/${first}/read`)).status).toBe(204);
    expect((await call('GET', '/api/notices')).body.items).toEqual([]);
    await server!.notifier.send(holdNotice());
    const after = (await call('GET', '/api/notices')).body.items as Json[];
    expect(after).toHaveLength(1);
    expect(after[0]!.id).not.toBe(first);
    const all = await rows("SELECT id, read_at IS NULL AS unread FROM notices WHERE dedupe_key = 'hold:ci-red' ORDER BY unread");
    expect(all).toHaveLength(2);
    expect(all.map((r) => r.unread)).toEqual([false, true]);
  });

  it('POST /api/notices/:id/read on an unknown id or a bad id gives 404 NOTICE_NOT_FOUND', async () => {
    await boot();
    for (const id of [MISSING, 'not-a-uuid']) {
      const res = await call('POST', `/api/notices/${id}/read`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOTICE_NOT_FOUND');
    }
  });

  it('a local webhook gets one body { kind, text, at } for one cause, also when the cause is sent twice', async () => {
    hook = await startHook();
    await boot({ notifyWebhook: hook.url });
    await server!.notifier.send(holdNotice());
    await server!.notifier.send(holdNotice());
    expect(hook.bodies).toHaveLength(1);
    expect(JSON.parse(hook.bodies[0]!)).toEqual({
      kind: 'hold',
      text: expect.stringContaining('the CI is red'),
      at: AT.toISOString(),
    });
    expect((await call('GET', '/api/notices')).body.items).toHaveLength(1);
  });

  it('with no webhook set, send stores the notice and posts nothing', async () => {
    hook = await startHook();
    await boot();
    await server!.notifier.send(holdNotice());
    expect((await call('GET', '/api/notices')).body.items).toHaveLength(1);
    expect(hook.bodies).toEqual([]);
  });
});
