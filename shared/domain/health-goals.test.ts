import { describe, expect, it } from 'vitest';
import health from '../../goals/health.json';
import { isDomainError } from './errors';
import { parseHealthFile } from './health-goals';

const REAL = JSON.stringify(health);
const AUDIT = 'node scripts/merge-audit.mjs -R {repo} --since 2026-11-01T00:00:00Z';

const file = (patch: Record<string, unknown> = {}, rows?: unknown[]) =>
  JSON.stringify({
    v: 1,
    cron: '0 2 * * *',
    timezone: 'Asia/Ho_Chi_Minh',
    epic: 0,
    maxNewIssuesPerPass: 3,
    rows: rows ?? [{ id: 'H2', outcome: 'o', run: AUDIT, timeoutSec: 600 }],
    ...patch,
  });

function refused(text: string): string {
  try {
    parseHealthFile(text, 'o/r', 'linux');
  } catch (e) {
    expect(isDomainError(e, 'VALIDATION_FAILED')).toBe(true);
    return (e as Error).message;
  }
  throw new Error('parseHealthFile did not throw');
}

describe('parseHealthFile', () => {
  it('parses the real goals/health.json', () => {
    const h = parseHealthFile(REAL, 'o/r', 'linux');
    expect(h.rows.map((r) => r.id)).toEqual(['H1', 'H2']);
    expect(h.epic).toBe(0);
    expect(h.cron).toBe('0 2 * * *');
    expect(h.timezone).toBe('Asia/Ho_Chi_Minh');
    expect(h.maxNewIssuesPerPass).toBe(3);
  });

  it('fills {repo} and gives an sh argv on linux, with verbatim false', () => {
    const row = parseHealthFile(REAL, 'o/r', 'linux').rows[1]!;
    expect(row.run).toEqual(['sh', '-c', 'node scripts/merge-audit.mjs -R o/r --since 2026-11-01T00:00:00Z']);
    expect(row.verbatim).toBe(false);
  });

  it('gives a cmd.exe argv on win32, with verbatim true', () => {
    const row = parseHealthFile(REAL, 'o/r', 'win32').rows[1]!;
    expect(row.run).toEqual(['cmd.exe', '/d', '/s', '/c', '"node scripts/merge-audit.mjs -R o/r --since 2026-11-01T00:00:00Z"']);
    expect(row.verbatim).toBe(true);
  });

  it('refuses bad JSON', () => {
    expect(refused('{ nope')).toMatch(/JSON/);
  });

  it('refuses v 2', () => {
    expect(refused(file({ v: 2 }))).toMatch(/"v"/);
  });

  it('refuses a cron that nextRuns refuses', () => {
    expect(refused(file({ cron: '61 * * * *' }))).toMatch(/cron/);
  });

  it('refuses a repeated row id', () => {
    const row = { id: 'H1', outcome: 'o', run: 'true', timeoutSec: 5 };
    expect(refused(file({}, [row, row]))).toMatch(/H1/);
  });

  it('refuses timeoutSec 0', () => {
    expect(refused(file({}, [{ id: 'H1', outcome: 'o', run: 'true', timeoutSec: 0 }]))).toMatch(/timeoutSec/);
  });

  it('refuses maxNewIssuesPerPass 11', () => {
    expect(refused(file({ maxNewIssuesPerPass: 11 }))).toMatch(/maxNewIssuesPerPass/);
  });

  it('refuses an audit row with no --since', () => {
    const run = 'node scripts/merge-audit.mjs -R {repo}';
    expect(refused(file({}, [{ id: 'H2', outcome: 'o', run, timeoutSec: 600 }]))).toMatch(/--since/);
  });
});
