// Maps errors → HTTP status + `{ error: { code, message, details? } }` (SPEC § API contract). Routes do not catch business
// errors themselves: the service throws DomainError and the app error handler maps it here — one table, one place.
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import { isDomainError, type ErrorCode } from '../../shared/domain/errors';
import type { ApiErrorCode, ErrorBody, ValidationIssueDto } from '../../shared/contracts/common';

/** An error produced by the HTTP layer itself (not a business error from the service). */
export class HttpError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details?: unknown;

  constructor(status: number, code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Business error code → HTTP status. Adding a code in `shared/domain/errors.ts` and forgetting it here → a type error. */
export const STATUS_OF: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  LOOP_NOT_FOUND: 404,
  EXECUTION_NOT_FOUND: 404,
  RUN_NOT_FOUND: 404,
  LOOP_NAME_TAKEN: 409,
  VERSION_CONFLICT: 409,
  LOOP_ALREADY_ACTIVE: 409,
  LOOP_NOT_ACTIVE: 409,
  LOOP_ARCHIVED: 409,
  LOOP_IS_ACTIVE: 409,
  REPO_NOT_FOUND: 404,
  REPO_NAME_TAKEN: 409,
  REPO_PATH_TAKEN: 409,
  REPO_IN_USE: 409,
  TRANSCRIPT_NOT_FOUND: 404,
  NOTICE_NOT_FOUND: 404,
  GATE_OFF: 409,
};

export type ErrorReply = { status: number; body: ErrorBody };

/** Whatever a handler throws → HTTP status + standard error body. Never leaks the stack / details of unknown errors. */
export function toErrorReply(err: unknown, req?: Pick<FastifyRequest, 'body' | 'query' | 'params'>): ErrorReply {
  if (err instanceof HttpError) return reply(err.status, err.code, err.message, err.details);
  if (isDomainError(err)) {
    const details = err.code === 'VALIDATION_FAILED' ? normalizeValidationDetails(err.details, err.message) : err.details;
    return reply(STATUS_OF[err.code], err.code, err.message, details);
  }
  if (hasZodFastifySchemaValidationErrors(err)) {
    const source = sourceOf(req, (err as FastifyError).validationContext);
    const issues: ValidationIssueDto[] = err.validation.map((v) => {
      const path = v.instancePath.split('/').filter(Boolean);
      return {
        field: path.join('.') || (err as FastifyError).validationContext || 'request',
        code: valueAt(source, path) === undefined ? 'required' : 'invalid',
        message: v.message ?? 'Invalid',
      };
    });
    return reply(400, 'VALIDATION_FAILED', 'Invalid request', { issues });
  }
  const fe = err as Partial<FastifyError> | null;
  if (fe && typeof fe.statusCode === 'number' && fe.statusCode >= 400 && fe.statusCode < 500) {
    // Fastify errors before reaching a route: malformed JSON (400), wrong Content-Type (415), body too large (413)…
    if (fe.statusCode === 400) {
      const message = fe.message ?? 'Invalid request';
      return reply(400, 'VALIDATION_FAILED', message, { issues: [{ field: 'body', code: 'invalid', message }] });
    }
    return reply(fe.statusCode, 'BAD_REQUEST', fe.message ?? 'Invalid request');
  }
  return reply(500, 'INTERNAL_ERROR', 'Unexpected server error — see the server log');
}

/** Route/service errors, shared by the app error handler. */
export function sendError(err: unknown, req: FastifyRequest, res: FastifyReply, log?: (err: unknown) => void) {
  const { status, body } = toErrorReply(err, req);
  if (status >= 500) log?.(err);
  return res.code(status).send(body);
}

function reply(status: number, code: ApiErrorCode, message: string, details?: unknown): ErrorReply {
  return { status, body: { error: details === undefined ? { code, message } : { code, message, details } } };
}

/**
 * `VALIDATION_FAILED` always returns `details.issues` so the UI can show the error at the field: if the service already sent `{ issues }` it is kept
 * as is; if the repository sent `{ field }` (bad cursor / limit) it becomes a single issue.
 */
function normalizeValidationDetails(details: unknown, message: string): { issues: ValidationIssueDto[] } {
  if (details && typeof details === 'object') {
    if (Array.isArray((details as { issues?: unknown }).issues)) return details as { issues: ValidationIssueDto[] };
    const field = (details as { field?: unknown }).field;
    if (typeof field === 'string') return { issues: [{ field, code: 'invalid', message }] };
  }
  return { issues: [{ field: 'request', code: 'invalid', message }] };
}

function sourceOf(req: Pick<FastifyRequest, 'body' | 'query' | 'params'> | undefined, context: string | undefined): unknown {
  if (!req) return undefined;
  if (context === 'querystring') return req.query;
  if (context === 'params') return req.params;
  return req.body;
}

function valueAt(source: unknown, path: string[]): unknown {
  let cur = source;
  for (const key of path) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}
