import { describe, expect, it } from 'vitest';
import { API_ERROR_CODES } from '../../shared/contracts/common';
import { DomainError, type ErrorCode } from '../../shared/domain/errors';
import { HttpError, STATUS_OF, toErrorReply } from './errors';

describe('toErrorReply — error → HTTP status + { error: { code, message, details? } }', () => {
  it('every business error code has a fixed HTTP status and is in the API code list', () => {
    expect(STATUS_OF).toEqual({
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
      GIT_HOST_FAILED: 502,
      GATE_JOB_NOT_FOUND: 404,
      GATE_JOB_NOT_RATIFIABLE: 409,
      GOAL_CARD_NOT_FOUND: 404,
      GOAL_CARD_NOT_OPEN: 409,
    });
    for (const code of Object.keys(STATUS_OF) as ErrorCode[]) {
      expect(API_ERROR_CODES).toContain(code);
      const r = toErrorReply(new DomainError(code, 'm'));
      expect([code, r.status, r.body.error.code]).toEqual([code, STATUS_OF[code], code]);
    }
  });

  it('VALIDATION_FAILED: keeps the service details.issues as is; the repository { field } → one issue', () => {
    const issues = [{ field: 'name', code: 'required', message: 'The loop needs a name' }];
    expect(toErrorReply(new DomainError('VALIDATION_FAILED', 'x', { issues })).body.error.details).toEqual({ issues });
    expect(toErrorReply(new DomainError('VALIDATION_FAILED', 'Malformed cursor', { field: 'cursor' })).body.error.details).toEqual({
      issues: [{ field: 'cursor', code: 'invalid', message: 'Malformed cursor' }],
    });
  });

  it('unknown error → 500 INTERNAL_ERROR, does not leak the message / stack', () => {
    const r = toErrorReply(new Error('the DB password is abc'));
    expect(r.status).toBe(500);
    expect(r.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(r.body)).not.toContain('abc');
  });

  it('HttpError keeps its status + code; a Fastify 4xx other than 400 → BAD_REQUEST', () => {
    expect(toErrorReply(new HttpError(400, 'INVALID_CRON', 'wrong', { field: 'minute' }))).toEqual({
      status: 400,
      body: { error: { code: 'INVALID_CRON', message: 'wrong', details: { field: 'minute' } } },
    });
    const unsupported = Object.assign(new Error('Unsupported Media Type'), { statusCode: 415 });
    expect(toErrorReply(unsupported)).toMatchObject({ status: 415, body: { error: { code: 'BAD_REQUEST' } } });
  });
});
