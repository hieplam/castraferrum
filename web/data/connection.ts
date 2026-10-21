// Server + DB state for the app frame (lights, the UC-17 disconnect banner, the D-UI4 dead-DB banner).
// Server: from the SSE connection `/api/events` (a loss is known at once - a dead server breaks the TCP link). DB: `/api/health` every 5 seconds
// (one light request; the spec forbids "dense polling" for data, and health carries no data).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ConnectionState } from '../api/live-events';
import { useApi, useLive } from './provider';
import { qk } from './query-keys';

export const HEALTH_INTERVAL_MS = 5_000;
/** How long the "Reconnected" banner shows after reconnecting. */
export const RECONNECTED_BANNER_MS = 5_000;

export type Lamp = 'ok' | 'wait' | 'down';

export type ServerStatus = {
  connection: ConnectionState;
  server: Lamp;
  db: Lamp;
  /** The DB has not answered since this instant (the server is still alive). */
  dbDownSince: Date | null;
  /** Just reconnected (within RECONNECTED_BANNER_MS). */
  reconnected: boolean;
  /** The figures on screen may be stale (server lost or DB dead; on the first open there are no figures yet - not counted). */
  stale: boolean;
};

export function useConnection(): ConnectionState {
  const live = useLive();
  return useSyncExternalStore(
    (cb) => live.onConnection(cb),
    () => live.connection(),
  );
}

export function useServerStatus(): ServerStatus {
  const api = useApi();
  const connection = useConnection();
  const client = useQueryClient();
  const health = useQuery({
    queryKey: qk.health(),
    queryFn: () => api.health(),
    refetchInterval: HEALTH_INTERVAL_MS,
    retry: false,
    staleTime: 0,
  });

  const server: Lamp = connection.status === 'open' ? 'ok' : connection.status === 'down' ? 'down' : 'wait';
  const dbUp = health.data?.db === 'up' && !health.isError;
  const dbDown = health.data?.db === 'down' && !health.isError;
  const db: Lamp = server === 'down' ? 'wait' : dbDown ? 'down' : dbUp ? 'ok' : 'wait';

  // The instant the DB started being dead (kept across later health checks); DB back up -> refresh all data.
  const [dbDownSince, setDbDownSince] = useState<Date | null>(null);
  const wasDbDown = useRef(false);
  useEffect(() => {
    if (db === 'down' && !wasDbDown.current) {
      wasDbDown.current = true;
      setDbDownSince(new Date(health.dataUpdatedAt || Date.now()));
    } else if (db === 'ok' && wasDbDown.current) {
      wasDbDown.current = false;
      setDbDownSince(null);
      void client.invalidateQueries();
    }
  }, [db, health.dataUpdatedAt, client]);

  // The "Reconnected" banner for a few seconds after going down -> open; at that point also ask health again right away.
  const [reconnected, setReconnected] = useState(false);
  const prev = useRef(connection.status);
  useEffect(() => {
    const was = prev.current;
    prev.current = connection.status;
    if (was === 'down' && connection.status === 'open') {
      setReconnected(true);
      const timer = setTimeout(() => setReconnected(false), RECONNECTED_BANNER_MS);
      return () => clearTimeout(timer);
    }
    if (connection.status === 'down') setReconnected(false);
    return undefined;
  }, [connection.status]);

  return { connection, server, db, dbDownSince: db === 'down' ? dbDownSince : null, reconnected, stale: server === 'down' || db === 'down' };
}

/** Now, self-updating every `everyMs` (countdown, "running for how long"). */
export function useNow(everyMs = 1_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}
