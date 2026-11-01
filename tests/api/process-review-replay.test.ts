// Replay of the review (R6, goal G14, spec 2.12): the 40 fixture rows go in as runs, and GET /api/process/events reads them.
// `first-pass`, `assemble` with the groups that haiku recorded, and `process-file-issues` then run on the fake gh.
// The real server and the test Postgres run. The model does not run here, and no real repository is touched.
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loopBody, resetApi, startApi, testPool, type ApiServer } from '../support/api-kit';
import { createFakeGh, type FakeGh } from '../support/fake-gh-kit';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Row = { id: string; at: string; loop: string; status: string; text: string };

const root = fileURLToPath(new URL('../..', import.meta.url));
const eventsFile = join(root, 'tests', 'fixtures', 'process-review', 'events.json');
const recordedFile = join(root, 'tests', 'tools', 'fixtures', 'process-first-pass', 'groups-haiku.json');
const FROM = '2026-10-19T00:00:00Z';
const TO = '2026-10-23T00:00:00Z';
const USAGE_FINGERPRINT = '58237cb2147d';
const SMART_APP_FINGERPRINT = '0f274a882e6b';
const fixtureRows = JSON.parse(readFileSync(eventsFile, 'utf8')) as Row[];

let server: ApiServer;
let pool: pg.Pool;
beforeAll(async () => {
  server = await startApi();
  pool = testPool();
});
afterAll(async () => {
  await server?.shutdown();
  await pool?.end();
});

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

/** The first event id of the fixture gives the run id that took its place. */
let uuidOf = new Map<string, string>();
let dir = '';
let recorded: { clusters: Array<{ ids: string[] }> };
beforeEach(async () => {
  recorded = JSON.parse(readFileSync(recordedFile, 'utf8'));
  dir = mkdtempSync(join(tmpdir(), 'lc-process-replay-'));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  await resetApi(server);
  const res = await server.app.inject({ method: 'POST', url: '/api/loops', payload: loopBody({ name: 'replay-loop' }) as Json });
  const loopId = (res.json() as { id: string }).id;
  const executionId = randomUUID();
  await pool.query(`INSERT INTO loop_executions (id, loop_id, seq, started_at) VALUES ($1, $2, 1, '2026-10-01T00:00:00Z')`, [executionId, loopId]);
  uuidOf = new Map();
  for (const [i, row] of fixtureRows.entries()) {
    const id = randomUUID();
    uuidOf.set(row.id, id);
    const column = (name: 'error' | 'skip_reason' | 'summary') => (name === ({ failed: 'error', skipped: 'skip_reason' }[row.status] ?? 'summary') ? row.text : null);
    await pool.query(
      `INSERT INTO runs (id, loop_id, execution_id, iteration, trigger, status, skip_reason, started_at, prompt_snapshot,
                         executor_kind, executor_config, summary, error)
       VALUES ($1, $2, $3, $4, 'schedule', $5, $6, $7, 'replay prompt', 'mock', '{}', $8, $9)`,
      [id, loopId, executionId, i + 1, row.status, column('skip_reason'), row.at, column('summary'), column('error')],
    );
  }
});

function run(script: string, args: string[], env: Record<string, string> = {}) {
  const prefix = script === 'process-review.mjs' ? ['--import', 'tsx'] : [];
  const r = spawnSync(process.execPath, [...prefix, join(root, 'scripts', script), ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, ...env } });
  expect(r.stderr).toBe('');
  expect(r.status).toBe(0);
  return r.stdout;
}

async function firstPass(): Promise<{ file: string; value: { clusters: Json[]; rest: Row[] } }> {
  const res = await server.app.inject({ method: 'GET', url: `/api/process/events?from=${encodeURIComponent(FROM)}&to=${encodeURIComponent(TO)}` });
  expect(res.statusCode).toBe(200);
  const events = join(dir, 'events.json');
  writeFileSync(events, res.body);
  const file = join(dir, 'first-pass.json');
  run('process-review.mjs', ['first-pass', '--events', events, '--repo', 'o/r', '--from', FROM, '--to', TO, '--out', file]);
  return { file, value: JSON.parse(readFileSync(file, 'utf8')) };
}

/** A temp copy of the groups, with the fixture ids replaced by the run ids. */
function withRunIds(groups: { clusters: Array<{ ids: string[] }> }): string {
  const mapped = { clusters: groups.clusters.map((c) => ({ ...c, ids: c.ids.map((id) => uuidOf.get(id) ?? id) })) };
  const file = join(dir, 'groups.json');
  writeFileSync(file, JSON.stringify(mapped));
  return file;
}

async function assemble(groups: { clusters: Array<{ ids: string[] }> }): Promise<{ file: string; clusters: Json[] }> {
  const pass = await firstPass();
  const file = join(dir, 'review.json');
  run('process-review.mjs', ['assemble', '--first-pass', pass.file, '--groups', withRunIds(groups), '--out', file]);
  return { file, clusters: (JSON.parse(readFileSync(file, 'utf8')) as { clusters: Json[] }).clusters };
}

function fakeGh(): FakeGh {
  const gh = createFakeGh();
  cleanups.push(() => gh.dispose());
  return gh;
}
const fileIssues = (gh: FakeGh, review: string) =>
  JSON.parse(run('process-file-issues.mjs', [review], { LOOPS_GH_BIN: gh.script, FAKE_GH_WORLD: gh.world })) as Record<'created' | 'updated' | 'skipped', string[]>;
const issueFingerprints = (gh: FakeGh) => gh.read().issues.map((i) => /fingerprint:([0-9a-f]{12})/.exec(i.body)?.[1]);

describe('process-review replay (G14)', () => {
  it('files one issue for each cluster of 2 or more events, with the two golden rule fingerprints', async () => {
    const { file, clusters } = await assemble(recorded);
    const repeated = clusters.filter((c) => c.events >= 2);
    expect(repeated.length).toBeGreaterThan(2);
    const gh = fakeGh();
    const result = fileIssues(gh, file);
    expect(result.created).toEqual(repeated.map((c) => c.fingerprint));
    const filed = issueFingerprints(gh);
    expect(filed).toHaveLength(repeated.length);
    expect(filed).toEqual(expect.arrayContaining([USAGE_FINGERPRINT, SMART_APP_FINGERPRINT]));
  });

  it('adds no issue and 1 comment for each issue on a second replay', async () => {
    const { file } = await assemble(recorded);
    const gh = fakeGh();
    fileIssues(gh, file);
    const before = gh.read().issues.length;
    const again = await assemble(recorded);
    const result = fileIssues(gh, again.file);
    expect(result.created).toEqual([]);
    expect(result.updated).toHaveLength(before);
    const issues = gh.read().issues;
    expect(issues).toHaveLength(before);
    expect(issues.map((i) => i.comments.length)).toEqual(issues.map(() => 1));
  });

  it('gives 2 issues with no groups, and more with the recorded groups', async () => {
    const none = fakeGh();
    fileIssues(none, (await assemble({ clusters: [] })).file);
    expect(issueFingerprints(none)).toEqual([USAGE_FINGERPRINT, SMART_APP_FINGERPRINT]);
    const withGroups = fakeGh();
    fileIssues(withGroups, (await assemble(recorded)).file);
    expect(withGroups.read().issues.length).toBeGreaterThan(2);
  });

  it('gets the same rest from the API as from the file', async () => {
    const fromApi = (await firstPass()).value.rest;
    const out = join(dir, 'file-first-pass.json');
    run('process-review.mjs', ['first-pass', '--events', eventsFile, '--repo', 'o/r', '--from', FROM, '--to', TO, '--out', out]);
    const fromFile = (JSON.parse(readFileSync(out, 'utf8')) as { rest: Row[] }).rest;
    const shape = (rows: Row[]) => rows.map((e) => ({ at: Date.parse(e.at), status: e.status, text: e.text })).sort((a, b) => a.at - b.at || a.text.localeCompare(b.text));
    expect(fromApi).toHaveLength(14);
    expect(shape(fromApi)).toEqual(shape(fromFile));
    expect(fromApi.map((e) => e.id).sort()).toEqual(fromFile.map((e) => uuidOf.get(e.id)!).sort());
  });
});
