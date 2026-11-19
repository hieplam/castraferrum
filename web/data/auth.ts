// Sign-in in the web (remote-access spec D3, D5, D6, D13; task R5). The session query says whether the console asks for sign-in
// and whether this browser holds a session; the routes read it (web/app/AuthGate.tsx) and send a signed-out browser to
// `/signin?next=<path>`. Three things mark the session as ended: a 401 `UNAUTHENTICATED` from any call (the query client's
// handler, `markSignedOut`), a loss of the live connection after which the server answers `signedIn: false` (`useAuthSync`),
// and Sign out. The pure parts (where to go, how long to wait) are exported for the unit tests.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import type { AuthSessionDto } from '../../shared/contracts/auth';
import { useApi, useLive } from './provider';
import { qk } from './query-keys';
import { markSignedOut } from './session-cache';

/** The path of the sign-in screen. */
export const SIGNIN_PATH = '/signin';

/** The console asks for sign-in and this browser holds no session: show the sign-in screen. Unknown (not loaded) is not signed out. */
export function mustSignIn(session: AuthSessionDto | undefined): boolean {
  return session !== undefined && session.required && !session.signedIn;
}

/** The signed-in user to show (top bar, Settings): only when the console asks for sign-in. */
export function signedInUser(session: AuthSessionDto | undefined): string | null {
  return session?.required && session.signedIn && session.username ? session.username : null;
}

/** `/signin?next=<path>`: the sign-in screen, remembering the page that was asked for (its query too). */
export function signinHref(pathname: string, search = ''): string {
  const next = pathname + search;
  return next === '/' || next === '' || pathname === SIGNIN_PATH ? SIGNIN_PATH : `${SIGNIN_PATH}?next=${encodeURIComponent(next)}`;
}

/**
 * Where sign-in leads: the `next` of the address when it is a path of this console, `/` otherwise. A full address, a
 * protocol-relative `//host` or a backslash would send the browser to another site, so they lead to `/`.
 */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return '/';
  if (next === SIGNIN_PATH || next.startsWith(`${SIGNIN_PATH}?`) || next.startsWith(`${SIGNIN_PATH}/`)) return '/';
  return next;
}

/** The wait the too-many-attempts message shows: whole minutes, rounded up (design/APPROVED.md, the sign-in entry); at least 1. */
export function waitMinutes(remainingMs: number): number {
  return Math.max(1, Math.ceil(remainingMs / 60_000));
}

export function useSession() {
  const api = useApi();
  return useQuery({
    queryKey: qk.session(),
    queryFn: () => api.session(),
    // Only an answer of the server changes it: a sign-in, a Sign out, a 401, or the check after a lost live connection.
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
}

/** Sign in: on success the session is read again, so the routes lead on to `next`. */
export function useLogin() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) => api.login(username, password),
    onSuccess: () => client.refetchQueries({ queryKey: qk.session() }),
  });
}

/** Sign out: ends the session on the server, then shows the sign-in screen. */
export function useLogout() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => markSignedOut(client),
  });
}

/**
 * Keeps the live connection and the cache in step with the session (called once, by the app). Signed out: the live connection
 * closes (it would only be refused) and the data of the signed-in user leaves the cache. Signed in again: the live connection
 * opens at once, so live updates arrive right after sign-in. A lost live connection asks the server whether the session still
 * holds: if it answers `signedIn: false`, the routes show the sign-in screen; an unreachable server changes nothing.
 */
export function useAuthSync(): void {
  const live = useLive();
  const client = useQueryClient();
  const session = useSession();
  const out = mustSignIn(session.data);
  const wasOut = useRef(false);
  useEffect(() => {
    if (out) {
      wasOut.current = true;
      live.close();
      client.removeQueries({ predicate: (q) => q.queryKey[0] !== qk.session()[0] && q.queryKey[0] !== qk.health()[0] });
    } else if (wasOut.current) {
      wasOut.current = false;
      live.connect();
    }
  }, [out, live, client]);
  const required = session.data?.required === true;
  useEffect(() => {
    if (!required) return undefined;
    return live.onConnection((state) => {
      if (state.status === 'down') void client.invalidateQueries({ queryKey: qk.session() });
    });
  }, [required, live, client]);
}
