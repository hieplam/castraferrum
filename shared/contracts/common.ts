// Shared pieces of the HTTP contract (SPEC section "API contract"): timestamps, errors, pagination.
// The schemas are zod **codecs**: the server `encode`s (Date -> ISO string; fastify-type-provider-zod calls `safeEncode` when it sends
// the response), the web `decode`s (ISO string -> Date). `z.input<...>` = the JSON on the wire, `z.output<...>` = the type in use.
import { z } from 'zod';
import type { ErrorCode } from '../domain/errors';

/** A UTC instant: an ISO 8601 string with `Z` on the wire, a `Date` in code. */
export const isoDate = z.codec(z.iso.datetime(), z.date(), {
  decode: (s) => new Date(s),
  encode: (d) => d.toISOString(),
});

/**
 * Fixed API error codes - the web translates by `code`, never by `message`. Covers every domain business error
 * (`ErrorCode`) plus a few codes only the HTTP layer produces.
 */
export const API_ERROR_CODES = [
  'VALIDATION_FAILED',
  'LOOP_NOT_FOUND',
  'LOOP_NAME_TAKEN',
  'VERSION_CONFLICT',
  'LOOP_ALREADY_ACTIVE',
  'LOOP_NOT_ACTIVE',
  'LOOP_ARCHIVED',
  'LOOP_IS_ACTIVE',
  'EXECUTION_NOT_FOUND',
  'RUN_NOT_FOUND',
  'REPO_NOT_FOUND',
  'REPO_NAME_TAKEN',
  'REPO_PATH_TAKEN',
  'REPO_IN_USE',
  'TRANSCRIPT_NOT_FOUND',
  'NOTICE_NOT_FOUND',
  /** `GET /schedule/preview`: cron sai. */
  'INVALID_CRON',
  /** No such path / method (includes `/api/__test/*` when not in test mode). */
  'NOT_FOUND',
  /** A broken request that is not a data error (e.g. a wrong Content-Type). */
  'BAD_REQUEST',
  /** An unexpected error - see the server log. */
  'INTERNAL_ERROR',
] as const satisfies readonly (ErrorCode | string)[];
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

// Every domain code must appear in the list above (a missing one is a type error here).
type MissingDomainCode = Exclude<ErrorCode, ApiErrorCode>;
const _everyDomainCodeListed: MissingDomainCode extends never ? true : MissingDomainCode = true;
void _everyDomainCodeListed;

/**
 * An error at one field (`VALIDATION_FAILED` -> `details.issues`). `field` is the path of the field (`name`, `executor.config.durationSec`,
 * `version`, `cursor`...); `code`: `required` · `tooLong` · `outOfRange` · `invalid` · `unknownExecutor` · `unknownRepo` (the loop points at a repo that does not exist) · `notDirectory` (repo registration: the path is not an existing directory).
 */
export const validationIssue = z.object({
  field: z.string(),
  code: z.enum([
    'required',
    'tooLong',
    'outOfRange',
    'invalid',
    'unknownExecutor',
    'unknownRepo',
    'notDirectory',
    'missingKey',
    'missingReason',
    'reserved',
  ]),
  message: z.string(),
});
export type ValidationIssueDto = z.infer<typeof validationIssue>;

/** Body of every error response: `{ error: { code, message, details? } }`. */
export const errorBody = z.object({
  error: z.object({
    code: z.enum(API_ERROR_CODES),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ErrorBody = z.output<typeof errorBody>;

/** A cursor page: `nextCursor = null` = the end. The cursor is an opaque string - send back exactly the string the server returned. */
export const pageOf = <T extends z.ZodType>(item: T) => z.object({ items: z.array(item), nextCursor: z.string().nullable() });

/** `?cursor=&limit=` of the paginated lists. */
export const pageQuery = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** A list without pagination. */
export const listOf = <T extends z.ZodType>(item: T) => z.object({ items: z.array(item) });

/** `:id` in the path. Any string - an id that is not a uuid certainly does not exist -> the 404 of the right resource type. */
export const idParams = z.object({ id: z.string() });
