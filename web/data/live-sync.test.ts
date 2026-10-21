// Live -> TanStack Query cache wiring on a real QueryClient + FakeLiveEvents: an event invalidates the right queries; reconnecting after
// a loss -> invalidates all (the server does not replay missed events - UC-17).
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { FakeLiveEvents } from '../api/fake-live-events';
import { CONNECTING, OPEN } from '../api/live-events';
import { connectLiveToCache, keysFor } from './live-sync';
import { qk } from './query-keys';

const at = new Date('2026-10-18T07:00:00Z');

function seeded() {
  const client = new QueryClient();
  const keys = [qk.loopList({}), qk.loopList({ archived: true }), qk.loop('l1'), qk.loopRuns('l1'), qk.loop('l2'), qk.execution('e1'), qk.run('r1'), qk.run('r9'), qk.health()];
  for (const k of keys) client.setQueryData(k, 1);
  const stale = () => keys.filter((k) => client.getQueryState(k)?.isInvalidated).map((k) => JSON.stringify(k));
  return { client, stale };
}

describe('live → cache', () => {
  it('a run event invalidates the loop list, that loop (and the history below it), the execution, the run - not other loops', () => {
    const { client, stale } = seeded();
    const live = new FakeLiveEvents();
    connectLiveToCache(live, client);
    live.emit({ type: 'run.finished', at, loopId: 'l1', executionId: 'e1', runId: 'r1', status: 'succeeded' });
    expect(stale()).toEqual(
      [qk.loopList({}), qk.loopList({ archived: true }), qk.loop('l1'), qk.loopRuns('l1'), qk.execution('e1'), qk.run('r1')].map((k) => JSON.stringify(k)),
    );
  });

  it('keysFor: a loop event has only the list + the loop', () => {
    expect(keysFor({ type: 'loop.created', at, loopId: 'l2' })).toEqual([qk.loops(), qk.loop('l2')]);
  });

  it('the first open refreshes nothing; lost then reconnected -> refreshes ALL', () => {
    const { client, stale } = seeded();
    const live = new FakeLiveEvents();
    const off = connectLiveToCache(live, client);
    live.setConnection(CONNECTING);
    live.setConnection(OPEN);
    expect(stale()).toEqual([]);
    live.setConnection({ status: 'down', attempt: 1, retryAt: at, downSince: at });
    expect(stale()).toEqual([]);
    live.setConnection(OPEN);
    expect(stale()).toHaveLength(9);
    off();
  });
});
