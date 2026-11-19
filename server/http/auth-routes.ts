// Sign-in routes and the session guard (remote-access spec D3 to D6, section 5). The cookie is set and cleared here only; the
// guard in app.ts reads it with `sessionToken`.
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { authSessionDto, loginRequest, SESSION_COOKIE } from '../../shared/contracts/auth';
import type { AuthService } from '../services/contracts';
import { authError } from './errors';

export type AuthRouteDeps = { auth: AuthService };

/** Spec D5: the routes a client reaches without a session (`METHOD pattern`). Everything else under `/api/` needs one. */
export const PUBLIC_ROUTES: ReadonlySet<string> = new Set(['GET /api/health', 'GET /api/auth/session', 'POST /api/auth/login']);

/** The value of the session cookie in a `Cookie` header, or undefined. */
export function sessionToken(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0 || part.slice(0, eq).trim() !== SESSION_COOKIE) continue;
    const value = part.slice(eq + 1).trim();
    return value === '' ? undefined : value;
  }
  return undefined;
}

/**
 * Whether a request needs a session (spec D5): every `/api/*` route, a matched one or not, except the public list and the
 * test-mode routes (`/api/__test/*`, registered only in test mode). The UI bundle outside `/api/` stays public.
 */
export function needsSession(req: FastifyRequest): boolean {
  const path = req.url.split('?')[0] ?? '';
  const route = req.routeOptions.url;
  if (!(path === '/api' || path.startsWith('/api/') || route?.startsWith('/api/'))) return false;
  if (route?.startsWith('/api/__test/')) return false;
  const method = req.method === 'HEAD' ? 'GET' : req.method;
  return !PUBLIC_ROUTES.has(`${method} ${route ?? path}`);
}

/** Spec D3: `Secure` only when the request arrived over HTTPS, which `cloudflared` reports with `X-Forwarded-Proto`. */
function overHttps(req: FastifyRequest): boolean {
  return firstValue(req.headers['x-forwarded-proto'])?.toLowerCase() === 'https';
}

function firstValue(header: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(header) ? header[0] : header;
  const first = raw?.split(',')[0]?.trim();
  return first === '' ? undefined : first;
}

function cookie(req: FastifyRequest, value: string, maxAgeSec: number): string {
  return `${SESSION_COOKIE}=${value}; Max-Age=${maxAgeSec}; Path=/; HttpOnly; SameSite=Lax${overHttps(req) ? '; Secure' : ''}`;
}

export const authRoutes: FastifyPluginAsyncZod<AuthRouteDeps> = async (app, { auth }) => {
  /** Login and logout without credentials: 404 before the body is validated. */
  const configured = async (_req: FastifyRequest, _reply: FastifyReply) => {
    if (!auth.required) throw authError('AUTH_NOT_CONFIGURED', 'Sign-in is off: the console was started without --username and --password');
  };

  app.get('/api/auth/session', { schema: { response: { 200: authSessionDto } } }, async (req) =>
    auth.status(sessionToken(req.headers.cookie)),
  );

  app.post('/api/auth/login', { onRequest: configured, schema: { body: loginRequest } }, async (req, reply) => {
    const client = auth.clientKey({
      socket: req.socket.remoteAddress, cfConnectingIp: firstValue(req.headers['cf-connecting-ip']),
      realIp: firstValue(req.headers['x-real-ip']),
    });
    const result = auth.login(req.body, client);
    switch (result.kind) {
      case 'ok':
        return reply.code(204).header('set-cookie', cookie(req, result.token, result.maxAgeSec)).send();
      case 'tooManyAttempts':
        reply.header('retry-after', String(result.retryAfterSec));
        throw authError('TOO_MANY_ATTEMPTS', `Too many failed sign-in attempts; try again in ${result.retryAfterSec} seconds`, {
          retryAfterSec: result.retryAfterSec,
        });
      case 'invalid':
        throw authError('INVALID_CREDENTIALS', 'Wrong username or password');
      case 'notConfigured':
        throw authError('AUTH_NOT_CONFIGURED', 'Sign-in is off: the console was started without --username and --password');
    }
  });

  app.post('/api/auth/logout', { onRequest: configured }, async (req, reply) => {
    auth.logout(sessionToken(req.headers.cookie));
    return reply.code(204).header('set-cookie', cookie(req, '', 0)).send();
  });
};
