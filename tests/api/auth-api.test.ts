// Sign-in on the server (remote-access spec D3 to D6, goals G2 and G3): the guard over every route row of docs/API.md, the session
// cookie, the attempt limit and the composition without credentials. Every call without a session runs on a real listen with fetch,
// so the SSE rows prove that they answer 401 before a stream opens.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { openSse, startApi, type ApiServer } from '../support/api-kit';
import { apiTableRows } from '../support/api-table';

const CREDENTIALS = { username: 'owner', password: 'password1' };
const SOME_ID = '00000000-0000-4000-8000-000000000000';
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
/** Spec D5: the only routes a client reaches without a session. */
const PUBLIC = ['GET /api/health', 'GET /api/auth/session', 'POST /api/auth/login'];
const COOKIE = /^castra_session=([A-Za-z0-9_-]{43}); Max-Age=2592000; Path=\/; HttpOnly; SameSite=Lax$/;

describe('with credentials', () => {
  let server: ApiServer;
  let base: string;
  let ipCounter = 0;
  /** A client key of its own for each test, so the attempt limit of one test never reaches another. */
  const nextIp = () => `203.0.113.${++ipCounter}`;

  const login = (body: unknown, headers: Record<string, string> = {}) =>
    server.app.inject({ method: 'POST', url: '/api/auth/login', payload: body as object, headers: { 'cf-connecting-ip': nextIp(), ...headers } });

  async function signIn(): Promise<string> {
    const res = await login(CREDENTIALS);
    expect(res.statusCode).toBe(204);
    const m = COOKIE.exec(String(res.headers['set-cookie']));
    if (!m) throw new Error(`no session cookie: ${String(res.headers['set-cookie'])}`);
    return `castra_session=${m[1]}`;
  }

  beforeAll(async () => {
    server = await startApi({ auth: CREDENTIALS });
    base = await server.listen();
  });
  afterAll(async () => {
    await server?.shutdown();
  });
  beforeEach(async () => {
    // Test-mode routes stay outside the guard (spec D5), so the reset needs no session.
    expect((await server.app.inject({ method: 'POST', url: '/api/__test/reset' })).statusCode).toBe(204);
  });

  it('GET /api/loops without a cookie answers 401 UNAUTHENTICATED', async () => {
    const res = await fetch(`${base}/api/loops`);
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('UNAUTHENTICATED');
  });

  it('every route row of docs/API.md without a cookie answers 401 UNAUTHENTICATED, SSE included; the open ones are exactly the D5 list', async () => {
    const rows = apiTableRows();
    expect(rows.length).toBeGreaterThanOrEqual(48);
    const open: string[] = [];
    for (const row of rows) {
      const url = `${base}/api${row.path.replace(/:[a-zA-Z]+/g, SOME_ID)}`;
      const res = await fetch(url, {
        method: row.method,
        headers: row.description.startsWith('SSE') ? { accept: 'text/event-stream' } : {},
      });
      const name = `${row.method} /api${row.path}`;
      if (res.status === 401) {
        expect([name, res.headers.get('content-type')]).toEqual([name, 'application/json; charset=utf-8']);
        expect([name, ((await res.json()) as { error: { code: string } }).error.code]).toEqual([name, 'UNAUTHENTICATED']);
      } else {
        await res.body?.cancel();
        open.push(name);
      }
    }
    expect(open).toEqual(PUBLIC);
  });

  it('a route that does not exist under /api is 401 too, and the test-mode routes stay open', async () => {
    expect((await fetch(`${base}/api/nothing-here`)).status).toBe(401);
    const clock = await fetch(`${base}/api/__test/clock`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ advanceMs: 0 }),
    });
    expect(clock.status).toBe(200);
  });

  it('with the cookie GET /api/loops answers 200 and /api/events opens with :ok', async () => {
    const cookie = await signIn();
    const loops = await fetch(`${base}/api/loops`, { headers: { cookie } });
    expect(loops.status).toBe(200);
    expect(await loops.json()).toMatchObject({ items: [] });
    const sse = await openSse(`${base}/api/events`, { cookie });
    try {
      expect(sse.res.status).toBe(200);
      expect(await sse.waitFor((e) => e.event === ':' && e.comment === 'ok')).toMatchObject({ comment: 'ok' });
    } finally {
      await sse.close();
    }
  });

  it('a good login answers 204 with the D3 cookie; Secure only with X-Forwarded-Proto: https', async () => {
    const plain = await login(CREDENTIALS);
    expect(plain.statusCode).toBe(204);
    expect(String(plain.headers['set-cookie'])).toMatch(COOKIE);
    const https = await login(CREDENTIALS, { 'x-forwarded-proto': 'https' });
    expect(https.statusCode).toBe(204);
    expect(String(https.headers['set-cookie'])).toMatch(
      /^castra_session=[A-Za-z0-9_-]{43}; Max-Age=2592000; Path=\/; HttpOnly; SameSite=Lax; Secure$/,
    );
    const http = await login(CREDENTIALS, { 'x-forwarded-proto': 'http' });
    expect(String(http.headers['set-cookie'])).toMatch(COOKIE);
  });

  it('GET /api/auth/session tells whether sign-in is required and who is signed in', async () => {
    const none = await server.app.inject({ method: 'GET', url: '/api/auth/session' });
    expect([none.statusCode, none.json()]).toEqual([200, { required: true, signedIn: false }]);
    const cookie = await signIn();
    const signed = await server.app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie } });
    expect([signed.statusCode, signed.json()]).toEqual([200, { required: true, signedIn: true, username: 'owner' }]);
  });

  it('a wrong username or password answers 401 INVALID_CREDENTIALS and sets no cookie; a broken body is VALIDATION_FAILED', async () => {
    const wrong = await login({ username: 'owner', password: 'password2' });
    expect([wrong.statusCode, wrong.json().error.code]).toEqual([401, 'INVALID_CREDENTIALS']);
    expect(wrong.headers['set-cookie']).toBeUndefined();
    const stranger = await login({ username: 'someone', password: 'password1' });
    expect([stranger.statusCode, stranger.json().error.code]).toEqual([401, 'INVALID_CREDENTIALS']);
    const broken = await login({ username: 'owner' });
    expect([broken.statusCode, broken.json().error.code]).toEqual([400, 'VALIDATION_FAILED']);
  });

  it('the sixth failure answers 429 TOO_MANY_ATTEMPTS with Retry-After, and a login works again after 15 wound minutes', async () => {
    const ip = { 'cf-connecting-ip': '198.51.100.70' };
    for (let i = 0; i < 5; i++) {
      expect((await login({ username: 'owner', password: 'password2' }, ip)).statusCode).toBe(401);
    }
    const sixth = await login(CREDENTIALS, ip);
    expect([sixth.statusCode, sixth.json().error.code, sixth.headers['retry-after']]).toEqual([429, 'TOO_MANY_ATTEMPTS', '900']);
    expect(sixth.json().error.details).toEqual({ retryAfterSec: 900 });
    expect(sixth.headers['set-cookie']).toBeUndefined();
    // Another client is not held back.
    expect((await login(CREDENTIALS, { 'cf-connecting-ip': '198.51.100.71' })).statusCode).toBe(204);
    expect((await server.app.inject({ method: 'POST', url: '/api/__test/clock', payload: { advanceMs: 15 * MINUTE } })).statusCode).toBe(200);
    expect((await login(CREDENTIALS, ip)).statusCode).toBe(204);
  });

  it('CF-Connecting-IP counts only from a loopback socket: a LAN client is limited by its own address', async () => {
    const lan = (forged: string, body: unknown) =>
      server.app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: body as object,
        remoteAddress: '192.168.1.20',
        headers: { 'cf-connecting-ip': forged },
      });
    for (let i = 0; i < 5; i++) expect((await lan(`198.51.100.${100 + i}`, { username: 'owner', password: 'password2' })).statusCode).toBe(401);
    expect((await lan('198.51.100.200', CREDENTIALS)).statusCode).toBe(429);
  });

  it('X-Real-IP from a loopback socket gives each device its own count (local-name spec D8)', async () => {
    const dev = (ip: string, body: unknown) =>
      server.app.inject({ method: 'POST', url: '/api/auth/login', payload: body as object, headers: { 'x-real-ip': ip } });
    for (let i = 0; i < 5; i++) expect((await dev('192.0.2.10', { username: 'owner', password: 'password2' })).statusCode).toBe(401);
    expect((await dev('192.0.2.10', CREDENTIALS)).statusCode).toBe(429);
    expect((await dev('192.0.2.11', { username: 'owner', password: 'password2' })).statusCode).toBe(401);
  });

  it('a session ends after 30 wound days', async () => {
    const cookie = await signIn();
    const advance = (ms: number) => server.app.inject({ method: 'POST', url: '/api/__test/clock', payload: { advanceMs: ms } });
    expect((await advance(30 * DAY - 1000)).statusCode).toBe(200);
    expect((await server.app.inject({ method: 'GET', url: '/api/loops', headers: { cookie } })).statusCode).toBe(200);
    expect((await advance(1000)).statusCode).toBe(200);
    const expired = await server.app.inject({ method: 'GET', url: '/api/loops', headers: { cookie } });
    expect([expired.statusCode, expired.json().error.code]).toEqual([401, 'UNAUTHENTICATED']);
  });

  it('logout answers 204, clears the cookie and ends the session; without a session it is 401', async () => {
    const cookie = await signIn();
    const out = await server.app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    expect(out.statusCode).toBe(204);
    expect(out.headers['set-cookie']).toBe('castra_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax');
    const after = await server.app.inject({ method: 'GET', url: '/api/loops', headers: { cookie } });
    expect([after.statusCode, after.json().error.code]).toEqual([401, 'UNAUTHENTICATED']);
    const again = await server.app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    expect([again.statusCode, again.json().error.code]).toEqual([401, 'UNAUTHENTICATED']);
    const secure = await signIn();
    const outHttps = await server.app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie: secure, 'x-forwarded-proto': 'https' } });
    expect(outHttps.headers['set-cookie']).toBe('castra_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax; Secure');
  });

  it('a made-up or malformed cookie is no session', async () => {
    for (const cookie of [`castra_session=${'A'.repeat(43)}`, 'castra_session=', 'other=1', 'castra_session']) {
      const res = await server.app.inject({ method: 'GET', url: '/api/loops', headers: { cookie } });
      expect([cookie, res.statusCode]).toEqual([cookie, 401]);
    }
    const cookie = await signIn();
    const among = await server.app.inject({ method: 'GET', url: '/api/loops', headers: { cookie: `theme=dark; ${cookie}; lang=en` } });
    expect(among.statusCode).toBe(200);
  });
});

describe('without credentials', () => {
  let server: ApiServer;
  beforeAll(async () => {
    server = await startApi();
  });
  afterAll(async () => {
    await server?.shutdown();
  });

  it('the console behaves as before: /api/loops answers 200 and login and logout answer 404 AUTH_NOT_CONFIGURED', async () => {
    expect((await server.app.inject({ method: 'GET', url: '/api/loops' })).statusCode).toBe(200);
    const login = await server.app.inject({ method: 'POST', url: '/api/auth/login', payload: CREDENTIALS });
    expect([login.statusCode, login.json().error.code]).toEqual([404, 'AUTH_NOT_CONFIGURED']);
    expect(login.headers['set-cookie']).toBeUndefined();
    const logout = await server.app.inject({ method: 'POST', url: '/api/auth/logout' });
    expect([logout.statusCode, logout.json().error.code]).toEqual([404, 'AUTH_NOT_CONFIGURED']);
    const session = await server.app.inject({ method: 'GET', url: '/api/auth/session' });
    expect([session.statusCode, session.json()]).toEqual([200, { required: false, signedIn: false }]);
  });
});
