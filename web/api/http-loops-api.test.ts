// HttpLoopsApi over a fake fetch: the sign-in calls of remote-access task R5 (session, login, logout), the typed 401 of every
// protected call, and the wait of TOO_MANY_ATTEMPTS read from the server's Retry-After.
import { describe, expect, it } from 'vitest';
import { HttpLoopsApi } from './http-loops-api';
import { isUnauthenticated, type ApiError } from './loops-api';

type Seen = { url: string; method: string; body?: string };

function api(answer: (req: Seen) => Response) {
  const seen: Seen[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req: Seen = { url: String(input), method: init?.method ?? 'GET', ...(typeof init?.body === 'string' ? { body: init.body } : {}) };
    seen.push(req);
    return answer(req);
  }) as typeof globalThis.fetch;
  return { http: new HttpLoopsApi({ fetch }), seen };
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const fail = (status: number, code: string, details?: unknown, headers: Record<string, string> = {}) =>
  json(status, { error: { code, message: code, ...(details === undefined ? {} : { details }) } }, headers);

async function rejection(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p;
  } catch (e) {
    return e as ApiError;
  }
  throw new Error('expected a rejection');
}

describe('HttpLoopsApi - sign-in', () => {
  it('session() reads GET /api/auth/session', async () => {
    const { http, seen } = api(() => json(200, { required: true, signedIn: true, username: 'owner' }));
    expect(await http.session()).toEqual({ required: true, signedIn: true, username: 'owner' });
    expect(seen).toEqual([{ url: '/api/auth/session', method: 'GET' }]);
  });

  it('login() posts the credentials and resolves on 204; logout() posts to /api/auth/logout', async () => {
    const { http, seen } = api(() => new Response(null, { status: 204 }));
    await http.login('owner', 'password1');
    await http.logout();
    expect(seen[0]).toEqual({ url: '/api/auth/login', method: 'POST', body: JSON.stringify({ username: 'owner', password: 'password1' }) });
    expect(seen[1]).toMatchObject({ url: '/api/auth/logout', method: 'POST' });
  });

  it('wrong credentials raise INVALID_CREDENTIALS', async () => {
    const { http } = api(() => fail(401, 'INVALID_CREDENTIALS'));
    const err = await rejection(http.login('owner', 'password2'));
    expect(err.code).toBe('INVALID_CREDENTIALS');
    expect(err.retryAfterSec).toBeNull();
  });

  it('too many attempts carry the wait of the Retry-After header', async () => {
    const { http } = api(() => fail(429, 'TOO_MANY_ATTEMPTS', undefined, { 'retry-after': '690' }));
    const err = await rejection(http.login('owner', 'password2'));
    expect(err.code).toBe('TOO_MANY_ATTEMPTS');
    expect(err.retryAfterSec).toBe(690);
  });

  it('a 401 UNAUTHENTICATED from any protected call is the typed sign-in error', async () => {
    const { http } = api(() => fail(401, 'UNAUTHENTICATED'));
    const err = await rejection(http.listLoops());
    expect(isUnauthenticated(err)).toBe(true);
    expect(err.status).toBe(401);
    expect(isUnauthenticated(await rejection(api(() => fail(404, 'LOOP_NOT_FOUND')).http.getLoop('x')))).toBe(false);
  });
});
