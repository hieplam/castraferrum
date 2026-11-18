// API surface = the table in SPEC section API contract: every row of the table has a route really registered on the server (the exact
// wiring of main.ts), and every error code of the table + of shared/contracts has at least one test asserting it. The spec adding a
// route / error code that was forgotten in the code or in the tests -> red here.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { API_ERROR_CODES } from '../../shared/contracts/common';
import { startApi, type ApiServer } from '../support/api-kit';
import { apiTableRows } from '../support/api-table';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

let server: ApiServer;
beforeAll(async () => {
  server = await startApi();
});
afterAll(async () => {
  await server?.shutdown();
});

describe('API surface matches SPEC section API contract', () => {
  const rows = apiTableRows();

  it('reads the API table of the spec (20 phase 1 routes + 3 repo routes + 2 folder-browse routes + 2 phase 2 transcript routes + 3 probe routes + 2 notice routes + 3 process routes + 3 goal card routes + 3 gate page routes + 1 hold route + 1 goals route + 3 sign-in routes; 5 test-mode routes separate)', () => {
    expect(rows).toHaveLength(48);
  });

  it.each(rows.map((r) => [`${r.method} /api${r.path}`, r] as const))('%s has a registered route', (_name, r) => {
    expect(server.app.hasRoute({ method: r.method, url: `/api${r.path}` })).toBe(true);
  });

  it('test-mode routes exist under LOOPS_TEST_MODE', () => {
    expect(server.app.hasRoute({ method: 'POST', url: '/api/__test/clock' })).toBe(true);
    expect(server.app.hasRoute({ method: 'POST', url: '/api/__test/reset' })).toBe(true);
    expect(server.app.hasRoute({ method: 'POST', url: '/api/__test/dirs' })).toBe(true);
    expect(server.app.hasRoute({ method: 'POST', url: '/api/__test/folders' })).toBe(true);
    expect(server.app.hasRoute({ method: 'POST', url: '/api/__test/repo-gate' })).toBe(true);
  });

  it('every error code (spec table + shared/contracts) has a test asserting it', () => {
    const testText = [join(ROOT, 'tests', 'api'), join(ROOT, 'server', 'http')]
      .flatMap((dir) => readdirSync(dir).filter((f) => f.endsWith('.test.ts')).map((f) => join(dir, f)))
      .filter((f) => !f.endsWith('api-surface.test.ts'))
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');
    const codes = new Set([...rows.flatMap((r) => r.codes), ...API_ERROR_CODES]);
    const untested = [...codes].filter((c) => !testText.includes(`'${c}'`));
    expect(untested).toEqual([]);
  });
});
