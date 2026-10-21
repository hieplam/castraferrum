import { DomainError } from '../../shared/domain/errors';

// Pagination cursor shared by postgres/ and memory/: same sort order → same cursor.

/** Runs: (started_at, id) descending. */
export type RunCursor = { startedAt: Date; id: string };

export function encodeRunCursor(c: RunCursor): string {
  return Buffer.from(JSON.stringify(['r', c.startedAt.toISOString(), c.id])).toString('base64url');
}

export function decodeRunCursor(cursor: string): RunCursor {
  const v = parse(cursor);
  if (v[0] !== 'r' || typeof v[1] !== 'string' || typeof v[2] !== 'string') throw bad(cursor);
  const startedAt = new Date(v[1]);
  if (Number.isNaN(startedAt.getTime())) throw bad(cursor);
  return { startedAt, id: v[2] };
}

/** Run log entries: seq descending. */
export function encodeExecutionCursor(seq: number): string {
  return Buffer.from(JSON.stringify(['e', seq])).toString('base64url');
}

export function decodeExecutionCursor(cursor: string): number {
  const v = parse(cursor);
  if (v[0] !== 'e' || !Number.isInteger(v[1])) throw bad(cursor);
  return v[1] as number;
}

function parse(cursor: string): unknown[] {
  try {
    const v: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (Array.isArray(v)) return v;
  } catch {
    // fall through to the shared error
  }
  throw bad(cursor);
}

function bad(cursor: string): DomainError {
  return new DomainError('VALIDATION_FAILED', `Invalid pagination cursor: ${cursor}`, { field: 'cursor' });
}

/** Fetch `limit + 1` rows to tell whether another page follows. */
export function checkLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new DomainError('VALIDATION_FAILED', `limit must be an integer 1–500, got ${limit}`, { field: 'limit' });
  }
  return limit;
}
