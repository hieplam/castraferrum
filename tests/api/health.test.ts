import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPool, openDb } from '../../server/adapters/postgres/db';
import { PgDbProbe } from '../../server/adapters/postgres/db-probe';
import { databaseUrl } from '../../server/config';
import { buildHttpApp } from '../../server/http/app';
import { DefaultHealthService } from '../../server/services/health-service';
import { TcpProxy } from '../support/tcp-proxy';

const testUrl = databaseUrl(process.env, 'test');
const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const fn of cleanups.splice(0).reverse()) await fn();
});

/** Real app (route -> DefaultHealthService -> PgDbProbe -> pool) on one Postgres URL. */
async function appOn(pool: ReturnType<typeof createPool>) {
  const app = await buildHttpApp({ health: new DefaultHealthService({ db: new PgDbProbe(pool, { timeoutMs: 1500 }) }) });
  cleanups.push(() => app.close());
  return app;
}

describe('GET /api/health', () => {
  it('Postgres alive -> 200 {"ok":true,"db":"up"}', async () => {
    const db = await openDb(testUrl);
    cleanups.push(() => db.close());
    const res = await (await appOn(db.pool)).inject('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, db: 'up' });
  });

  it('nobody listening on the DB port -> 503 {"ok":false,"db":"down"}', async () => {
    const pool = createPool('postgres://loops:loops@127.0.0.1:1/loops_test');
    cleanups.push(() => pool.end());
    const res = await (await appOn(pool)).inject('/api/health');
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ ok: false, db: 'down' });
  });

  it('Postgres goes down midway -> 503, the process does not die; back up -> 200', async () => {
    const target = new URL(testUrl);
    const proxy = new TcpProxy({ host: target.hostname, port: Number(target.port) });
    const port = await proxy.start();
    cleanups.push(() => proxy.stop());
    target.port = String(port);
    const pool = createPool(target.toString());
    cleanups.push(() => pool.end());
    const app = await appOn(pool);

    expect((await app.inject('/api/health')).statusCode).toBe(200);
    expect(pool.idleCount).toBe(1); // the pool keeps one idle connection

    // Cut the idle connection and wait for the pool to drop it - like a real Postgres stop (57P01 reaches the idle client before the next query).
    // If the pool does not catch 'error', the process dies right here.
    await proxy.stop();
    await vi.waitFor(() => expect(pool.totalCount).toBe(0));
    const down = await app.inject('/api/health');
    expect(down.statusCode).toBe(503);
    expect(down.json()).toEqual({ ok: false, db: 'down' });

    await proxy.start(port);
    const up = await app.inject('/api/health');
    expect(up.statusCode).toBe(200);
    expect(up.json()).toEqual({ ok: true, db: 'up' });
  });

  it('unknown /api path -> 404 in the standard error shape {error:{code}}', async () => {
    const pool = createPool(testUrl);
    cleanups.push(() => pool.end());
    const res = await (await appOn(pool)).inject('/api/no-such-path');
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });
});
