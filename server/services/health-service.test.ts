import { describe, expect, it } from 'vitest';
import type { DbProbe } from '../ports/db-probe';
import { DefaultHealthService } from './health-service';

const probe = (ping: DbProbe['ping']): DbProbe => ({ ping });

describe('DefaultHealthService', () => {
  it('DB answers → ok, db up', async () => {
    const health = new DefaultHealthService({ db: probe(async () => true) });
    expect(await health.check()).toEqual({ ok: true, db: 'up', tunnel: 'off' });
  });

  it('DB does not answer → not ok, db down', async () => {
    const health = new DefaultHealthService({ db: probe(async () => false) });
    expect(await health.check()).toEqual({ ok: false, db: 'down', tunnel: 'off' });
  });

  it('probe throws → treated as DB down, does not rethrow', async () => {
    const health = new DefaultHealthService({ db: probe(() => Promise.reject(new Error('ECONNREFUSED'))) });
    expect(await health.check()).toEqual({ ok: false, db: 'down', tunnel: 'off' });
  });
});

describe('DefaultHealthService, the tunnel (remote-access spec D10)', () => {
  it('reports the state of the tunnel runner, and the tunnel does not change ok', async () => {
    for (const state of ['connecting', 'connected', 'down'] as const) {
      const health = new DefaultHealthService({ db: probe(async () => true), tunnel: { state: () => state } });
      expect(await health.check()).toEqual({ ok: true, db: 'up', tunnel: state });
    }
  });
});
