// Wires live events -> TanStack Query cache (ARCHITECTURE.md section "Events to the web"). Pure functions (no React) so they can be tested
// in node with FakeLiveEvents + a real QueryClient.
//
// - A state event carries only an id -> invalidate the related queries, the open screen reloads itself.
// - Reconnecting after a loss -> invalidate EVERYTHING: the server does not replay missed events (UC-17 "refresh data").
import type { QueryClient } from '@tanstack/react-query';
import type { StateEventDto } from '../../shared/contracts/events';
import type { ConnectionState, LiveEvents } from '../api/live-events';
import { qk } from './query-keys';

/** Key prefixes to reload when an event arrives. */
export function keysFor(event: StateEventDto): readonly (readonly unknown[])[] {
  const keys: (readonly unknown[])[] = [qk.loops(), qk.loop(event.loopId)];
  if ('executionId' in event) keys.push(qk.execution(event.executionId));
  if ('runId' in event) keys.push(qk.run(event.runId));
  return keys;
}

/** The connection state changed from `down` to `open` (the very first open does not count). */
export function isReconnect(prev: ConnectionState, next: ConnectionState): boolean {
  return prev.status === 'down' && next.status === 'open';
}

export function connectLiveToCache(live: LiveEvents, client: QueryClient): () => void {
  let prev = live.connection();
  const offEvent = live.onEvent((event) => {
    for (const queryKey of keysFor(event)) void client.invalidateQueries({ queryKey });
  });
  const offConn = live.onConnection((next) => {
    if (isReconnect(prev, next)) void client.invalidateQueries();
    prev = next;
  });
  return () => {
    offEvent();
    offConn();
  };
}
