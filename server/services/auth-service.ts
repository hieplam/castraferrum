// Sign-in (remote-access spec D3 to D6): one user, credentials in memory, sessions in a store, a limit on failed attempts per
// client. Time comes from the Clock port, so tests wind it.
import type { Clock } from '../ports/clock';
import type { Secrets } from '../ports/secrets';
import type { SessionStore } from '../ports/session-store';
import type { AuthService, AuthStatus, ClientAddress, LoginResult } from './contracts';

/** Spec D3: a session lives 30 days. */
export const SESSION_MAX_AGE_SEC = 30 * 24 * 60 * 60;
/** Spec D6: 5 failed attempts per client within 15 minutes. */
export const MAX_FAILURES = 5;
export const FAILURE_WINDOW_MS = 15 * 60 * 1000;
/** Past this many tracked clients, a login first drops the clients whose failures all left the window. */
const SWEEP_ABOVE = 1000;

export type AuthServiceDeps = {
  /** Unset = no sign-in: the console behaves as before. */
  credentials: { username: string; password: string } | undefined;
  sessions: SessionStore;
  secrets: Secrets;
  clock: Clock;
};

export class DefaultAuthService implements AuthService {
  readonly required: boolean;
  readonly #credentials: { username: string; password: string } | undefined;
  readonly #sessions: SessionStore;
  readonly #secrets: Secrets;
  readonly #clock: Clock;
  /** Failure times (ms) of each client, oldest first, at most MAX_FAILURES. */
  readonly #failures = new Map<string, number[]>();

  constructor(deps: AuthServiceDeps) {
    this.#credentials = deps.credentials;
    this.required = deps.credentials !== undefined;
    this.#sessions = deps.sessions;
    this.#secrets = deps.secrets;
    this.#clock = deps.clock;
  }

  login(input: { username: string; password: string }, client: string): LoginResult {
    const expected = this.#credentials;
    if (!expected) return { kind: 'notConfigured' };
    const now = this.#clock.now().getTime();
    if (this.#failures.size > SWEEP_ABOVE) this.#sweepFailures(now);

    const recent = this.#recentFailures(client, now);
    if (recent.length >= MAX_FAILURES) {
      return { kind: 'tooManyAttempts', retryAfterSec: Math.max(1, Math.ceil((recent[0]! + FAILURE_WINDOW_MS - now) / 1000)) };
    }

    // Both compares run every time: a wrong username takes as long as a wrong password (spec D4).
    const userOk = this.#secrets.same(input.username, expected.username);
    const passwordOk = this.#secrets.same(input.password, expected.password);
    if (!(userOk && passwordOk)) {
      this.#failures.set(client, [...recent, now].slice(-MAX_FAILURES));
      return { kind: 'invalid' };
    }

    this.#failures.delete(client);
    this.#sessions.sweep(new Date(now));
    const token = this.#secrets.newToken();
    this.#sessions.put(token, { username: expected.username, expiresAt: new Date(now + SESSION_MAX_AGE_SEC * 1000) });
    return { kind: 'ok', token, maxAgeSec: SESSION_MAX_AGE_SEC };
  }

  session(token: string | undefined): { username: string } | null {
    if (!this.required || !token) return null;
    const s = this.#sessions.get(token);
    if (!s) return null;
    if (s.expiresAt.getTime() <= this.#clock.now().getTime()) {
      this.#sessions.delete(token);
      return null;
    }
    return { username: s.username };
  }

  status(token: string | undefined): AuthStatus {
    const s = this.session(token);
    return s ? { required: this.required, signedIn: true, username: s.username } : { required: this.required, signedIn: false };
  }

  logout(token: string | undefined): void {
    if (token) this.#sessions.delete(token);
  }

  clientKey(address: ClientAddress): string {
    const socket = address.socket;
    if (!socket) return 'unknown';
    if (!isLoopback(socket)) return socket;
    // Only a program on this machine (cloudflared, nginx) can send these headers with effect: a LAN client has a non-loopback socket.
    return address.cfConnectingIp?.trim() || address.realIp?.trim() || socket;
  }

  #recentFailures(client: string, now: number): number[] {
    const times = (this.#failures.get(client) ?? []).filter((t) => t + FAILURE_WINDOW_MS > now);
    if (times.length === 0) this.#failures.delete(client);
    return times;
  }

  #sweepFailures(now: number): void {
    for (const client of [...this.#failures.keys()]) this.#recentFailures(client, now);
  }
}

/** 127.0.0.0/8, `::1` and their IPv4-mapped form (`::ffff:127.x.y.z`). */
function isLoopback(address: string): boolean {
  const v4 = address.startsWith('::ffff:') ? address.slice(7) : address;
  return v4.startsWith('127.') || address === '::1';
}
