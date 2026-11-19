// The session in the query cache (remote-access task R5): what ends it there. Its own file, so the query client
// (web/data/provider.tsx) and the session hooks (web/data/auth.ts) both read it without importing each other.
import type { QueryClient } from '@tanstack/react-query';
import type { AuthSessionDto } from '../../shared/contracts/auth';
import { isUnauthenticated } from '../api/loops-api';
import { qk } from './query-keys';

/** Marks the session as ended in the cache (a 401 `UNAUTHENTICATED`, Sign out); the routes then show the sign-in screen. */
export function markSignedOut(client: QueryClient): void {
  client.setQueryData<AuthSessionDto>(qk.session(), (prev) => (prev ? { required: prev.required, signedIn: false } : { required: true, signedIn: false }));
}

/** The query client's error handler: a 401 `UNAUTHENTICATED` from any query or mutation ends the session. */
export function onAuthError(client: QueryClient, err: unknown): void {
  if (isUnauthenticated(err)) markSignedOut(client);
}
