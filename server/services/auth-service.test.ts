// Sign-in (remote-access spec D3, D4, D6): login, the attempt limit, session expiry, logout and the client key, on an in-memory
// session store and a wound clock.
import { describe, expect, it } from 'vitest';
import { NodeSecrets } from '../adapters/crypto/node-secrets';
import { OffsetClock } from '../adapters/clock/offset-clock';
import { MemorySessionStore } from '../adapters/memory/session-store';
import type { Secrets } from '../ports/secrets';
import { DefaultAuthService } from './auth-service';

const T0 = Date.parse('2026-11-18T10:00:00.000Z');
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const CREDENTIALS = { username: 'owner', password: 'password1' };
const GOOD = { username: 'owner', password: 'password1' };
const BAD = { username: 'owner', password: 'password2' };

function setup(opts: { credentials?: typeof CREDENTIALS | undefined; secrets?: Secrets } = { credentials: CREDENTIALS }) {
  const clock = new OffsetClock(() => T0);
  const sessions = new MemorySessionStore();
  const auth = new DefaultAuthService({ credentials: opts.credentials, sessions, secrets: opts.secrets ?? new NodeSecrets(), clock });
  return { auth, clock, sessions };
}

describe('DefaultAuthService login', () => {
  it('the right username and password give a session token that lives 30 days', () => {
    const { auth } = setup();
    const r = auth.login(GOOD, '127.0.0.1');
    expect(r).toMatchObject({ kind: 'ok', maxAgeSec: 30 * 24 * 60 * 60 });
    if (r.kind !== 'ok') throw new Error('no session');
    expect(r.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(auth.session(r.token)).toEqual({ username: 'owner' });
    expect(auth.status(r.token)).toEqual({ required: true, signedIn: true, username: 'owner' });
  });

  it('a wrong password or a wrong username is refused, and gives no session', () => {
    const { auth } = setup();
    expect(auth.login(BAD, '127.0.0.1')).toEqual({ kind: 'invalid' });
    expect(auth.login({ username: 'someone', password: 'password1' }, '127.0.0.1')).toEqual({ kind: 'invalid' });
    expect(auth.login({ username: 'Owner', password: 'password1' }, '127.0.0.1')).toEqual({ kind: 'invalid' });
    expect(auth.status(undefined)).toEqual({ required: true, signedIn: false });
  });

  it('compares both the username and the password every time, also when the username is wrong (no early return)', () => {
    const calls: [string, string][] = [];
    const real = new NodeSecrets();
    const spy: Secrets = {
      newToken: () => real.newToken(),
      same: (given, expected) => {
        calls.push([given, expected]);
        return real.same(given, expected);
      },
    };
    const { auth } = setup({ credentials: CREDENTIALS, secrets: spy });
    auth.login({ username: 'someone', password: 'password3' }, '127.0.0.1');
    expect(calls).toEqual([
      ['someone', 'owner'],
      ['password3', 'password1'],
    ]);
  });

  it('two logins give two different tokens, and each one is a session of its own', () => {
    const { auth } = setup();
    const a = auth.login(GOOD, '127.0.0.1');
    const b = auth.login(GOOD, '127.0.0.1');
    if (a.kind !== 'ok' || b.kind !== 'ok') throw new Error('no session');
    expect(a.token).not.toBe(b.token);
    auth.logout(a.token);
    expect(auth.session(a.token)).toBeNull();
    expect(auth.session(b.token)).toEqual({ username: 'owner' });
  });
});

describe('DefaultAuthService attempt limit (spec D6)', () => {
  it('after 5 failures the sixth attempt is refused with the seconds left, even with the right password', () => {
    const { auth, clock } = setup();
    for (let i = 0; i < 5; i++) expect(auth.login(BAD, '198.51.100.7')).toEqual({ kind: 'invalid' });
    expect(auth.login(BAD, '198.51.100.7')).toEqual({ kind: 'tooManyAttempts', retryAfterSec: 900 });
    expect(auth.login(GOOD, '198.51.100.7')).toEqual({ kind: 'tooManyAttempts', retryAfterSec: 900 });
    clock.advance(10 * MINUTE);
    expect(auth.login(GOOD, '198.51.100.7')).toEqual({ kind: 'tooManyAttempts', retryAfterSec: 300 });
    clock.advance(5 * MINUTE - 1000);
    expect(auth.login(GOOD, '198.51.100.7')).toEqual({ kind: 'tooManyAttempts', retryAfterSec: 1 });
  });

  it('the limit resets once 15 wound minutes have passed since the failures', () => {
    const { auth, clock } = setup();
    for (let i = 0; i < 5; i++) auth.login(BAD, '198.51.100.7');
    clock.advance(15 * MINUTE);
    expect(auth.login(GOOD, '198.51.100.7')).toMatchObject({ kind: 'ok' });
  });

  it('only failures within the last 15 minutes count', () => {
    const { auth, clock } = setup();
    for (let i = 0; i < 4; i++) auth.login(BAD, '198.51.100.7');
    clock.advance(15 * MINUTE);
    for (let i = 0; i < 4; i++) expect(auth.login(BAD, '198.51.100.7')).toEqual({ kind: 'invalid' });
    expect(auth.login(BAD, '198.51.100.7')).toEqual({ kind: 'invalid' });
    expect(auth.login(BAD, '198.51.100.7')).toMatchObject({ kind: 'tooManyAttempts' });
  });

  it('a success clears the count of that client', () => {
    const { auth } = setup();
    for (let i = 0; i < 4; i++) auth.login(BAD, '198.51.100.7');
    expect(auth.login(GOOD, '198.51.100.7')).toMatchObject({ kind: 'ok' });
    for (let i = 0; i < 5; i++) expect(auth.login(BAD, '198.51.100.7')).toEqual({ kind: 'invalid' });
    expect(auth.login(BAD, '198.51.100.7')).toMatchObject({ kind: 'tooManyAttempts' });
  });

  it('counts each client on its own', () => {
    const { auth } = setup();
    for (let i = 0; i < 5; i++) auth.login(BAD, '198.51.100.7');
    expect(auth.login(GOOD, '198.51.100.7')).toMatchObject({ kind: 'tooManyAttempts' });
    expect(auth.login(GOOD, '198.51.100.8')).toMatchObject({ kind: 'ok' });
  });
});

describe('DefaultAuthService sessions', () => {
  it('a session expires after 30 wound days', () => {
    const { auth, clock } = setup();
    const r = auth.login(GOOD, '127.0.0.1');
    if (r.kind !== 'ok') throw new Error('no session');
    clock.advance(30 * DAY - 1000);
    expect(auth.session(r.token)).toEqual({ username: 'owner' });
    clock.advance(1000);
    expect(auth.session(r.token)).toBeNull();
    expect(auth.status(r.token)).toEqual({ required: true, signedIn: false });
  });

  it('logout ends the session; an unknown or missing token is no session', () => {
    const { auth, sessions } = setup();
    const r = auth.login(GOOD, '127.0.0.1');
    if (r.kind !== 'ok') throw new Error('no session');
    auth.logout(r.token);
    expect(auth.session(r.token)).toBeNull();
    expect(sessions.get(r.token)).toBeUndefined();
    expect(auth.session('not-a-token')).toBeNull();
    expect(auth.session(undefined)).toBeNull();
    expect(() => auth.logout(undefined)).not.toThrow();
  });
});

describe('DefaultAuthService without credentials', () => {
  it('is not required, refuses login as not configured and knows no session', () => {
    const { auth } = setup({ credentials: undefined });
    expect(auth.required).toBe(false);
    expect(auth.login(GOOD, '127.0.0.1')).toEqual({ kind: 'notConfigured' });
    expect(auth.session('anything')).toBeNull();
    expect(auth.status(undefined)).toEqual({ required: false, signedIn: false });
  });
});

describe('DefaultAuthService client key (spec D6)', () => {
  it('is CF-Connecting-IP only when the socket is loopback, otherwise the socket address', () => {
    const { auth } = setup();
    expect(auth.clientKey({ socket: '127.0.0.1', cfConnectingIp: '203.0.113.7' })).toBe('203.0.113.7');
    expect(auth.clientKey({ socket: '::1', cfConnectingIp: '203.0.113.7' })).toBe('203.0.113.7');
    expect(auth.clientKey({ socket: '::ffff:127.0.0.1', cfConnectingIp: '203.0.113.7' })).toBe('203.0.113.7');
    expect(auth.clientKey({ socket: '127.0.0.1', cfConnectingIp: undefined })).toBe('127.0.0.1');
    expect(auth.clientKey({ socket: '192.168.1.20', cfConnectingIp: '203.0.113.7' })).toBe('192.168.1.20');
    expect(auth.clientKey({ socket: '::ffff:192.168.1.20', cfConnectingIp: '203.0.113.7' })).toBe('::ffff:192.168.1.20');
    expect(auth.clientKey({ socket: undefined, cfConnectingIp: '203.0.113.7' })).toBe('unknown');
  });

  it('uses X-Real-IP from a loopback socket, ignores it from another socket, and CF-Connecting-IP wins over it (local-name spec D8)', () => {
    const { auth } = setup();
    expect(auth.clientKey({ socket: '127.0.0.1', cfConnectingIp: undefined, realIp: '192.0.2.10' })).toBe('192.0.2.10');
    expect(auth.clientKey({ socket: '::1', cfConnectingIp: undefined, realIp: '192.0.2.10' })).toBe('192.0.2.10');
    expect(auth.clientKey({ socket: '192.0.2.7', cfConnectingIp: undefined, realIp: '192.0.2.10' })).toBe('192.0.2.7');
    expect(auth.clientKey({ socket: '127.0.0.1', cfConnectingIp: '203.0.113.7', realIp: '192.0.2.10' })).toBe('203.0.113.7');
    expect(auth.clientKey({ socket: '127.0.0.1', cfConnectingIp: undefined, realIp: undefined })).toBe('127.0.0.1');
  });

  it('a LAN client cannot dodge the limit with a forged CF-Connecting-IP', () => {
    const { auth } = setup();
    for (let i = 0; i < 5; i++) {
      auth.login(BAD, auth.clientKey({ socket: '192.168.1.20', cfConnectingIp: `203.0.113.${i}` }));
    }
    expect(auth.login(GOOD, auth.clientKey({ socket: '192.168.1.20', cfConnectingIp: '203.0.113.99' }))).toMatchObject({
      kind: 'tooManyAttempts',
    });
  });
});
