// Process scoreboard API (goal G15): the repeats of each cause before and after the date its check merged. Real server (composeServer)
// on the test Postgres. Each test writes its own reports and runs, and builds a git repo in a temp folder with commits on known days.
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createPgRepositories } from '../../server/adapters/postgres/repositories';
import { startApi, testPool, type ApiServer } from '../support/api-kit';
import { cluster, makeGitRepo, seedScoreboard, writeReport, type TestApi } from '../support/goal-loop-score-world';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

let server: ApiServer;
let pool: pg.Pool;
const folders: string[] = [];
beforeAll(async () => {
  server = await startApi();
  pool = testPool();
});
afterAll(async () => {
  await server?.shutdown();
  await pool?.end();
});
afterEach(() => {
  for (const f of folders.splice(0)) rmSync(f, { recursive: true, force: true });
});

const NOW = '2026-10-18T07:00:42.000Z';
const api: TestApi = {
  async api(method, url, body) {
    const res = await server.app.inject({ method, url, ...(body === undefined ? {} : { payload: body as Json }) });
    return { status: res.statusCode };
  },
};
async function call(url: string) {
  const res = await server.app.inject({ method: 'GET', url });
  return { status: res.statusCode, body: (res.body ? res.json() : null) as Json };
}
const scoreboard = (tz?: string) => call(`/api/process/scoreboard${tz ? `?tz=${encodeURIComponent(tz)}` : ''}`);

/** An empty console at the clock `NOW` with one repo whose folder is `dir`. */
async function world(dir: string): Promise<string> {
  folders.push(dir);
  expect((await api.api('POST', '/api/__test/reset')).status).toBe(204);
  expect((await api.api('POST', '/api/__test/clock', { at: NOW })).status).toBe(200);
  const repo = await server.app.inject({ method: 'POST', url: '/api/repos', payload: { path: dir, name: 'score repo' } });
  expect(repo.statusCode).toBe(201);
  const loop = await server.app.inject({
    method: 'POST',
    url: '/api/loops',
    payload: {
      name: 'score loop', description: 'd', prompt: 'p', repoId: repo.json().id, cron: '0 0 1 1 *', timezone: 'Asia/Ho_Chi_Minh', timeoutSec: 600,
      executor: { kind: 'mock', config: { durationSec: 600, failRate: 0 } },
    },
  });
  expect(loop.statusCode).toBe(201);
  const exec = randomUUID();
  await pool.query(`INSERT INTO loop_executions (id, loop_id, seq, started_at) VALUES ($1, $2, 1, '2026-09-01T00:00:00Z')`, [exec, loop.json().id]);
  return repo.json().id as string;
}
let iteration = 100;
/** Failed runs of the loop of `world()`, one at each start time. */
async function runsAt(starts: string[]): Promise<string[]> {
  const loop = (await pool.query('SELECT id, (SELECT id FROM loop_executions LIMIT 1) AS exec FROM loops LIMIT 1')).rows[0] as { id: string; exec: string };
  const ids: string[] = [];
  for (const startedAt of starts) {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO runs (id, loop_id, execution_id, iteration, trigger, status, started_at, finished_at, prompt_snapshot, executor_kind, executor_config)
       VALUES ($1, $2, $3, $4, 'schedule', 'failed', $5, $5, 'p', 'mock', '{}')`,
      [id, loop.id, loop.exec, ++iteration, startedAt],
    );
    ids.push(id);
  }
  return ids;
}

describe('GET /api/process/scoreboard (G15)', () => {
  it('the seeded world gives the four figures of the approved scoreboard: 3, 2, 11, 1', async () => {
    const { path } = await seedScoreboard(api, pool);
    folders.push(path);
    const res = await scoreboard();
    expect(res.status).toBe(200);
    expect(res.body.figures).toEqual({ causes: 3, checks: 2, before: 11, after: 1 });
    expect(res.body.causes.map((c: Json) => [c.cause, c.checkName, c.checkMergedAt, c.before, c.after, c.repeats])).toEqual([
      ['Usage limit ends a run', 'tests/api/usage-hold.test.ts', '2026-10-08T02:00:00.000Z', 7, 0, 7],
      ['Smart App Control blocks tests', 'scripts/preflight.mjs', '2026-10-02T02:00:00.000Z', 4, 1, 5],
      ['A test port is already taken', null, null, 0, 0, 4],
    ]);
  });

  it('the weeks are the 5 weeks that end with the week of now, from Monday 00:00 in the zone, oldest first: 6, 5, 3, 2, 0', async () => {
    const { path } = await seedScoreboard(api, pool);
    folders.push(path);
    const res = await scoreboard();
    expect(res.body.weeks).toEqual([
      { from: '2026-09-13T17:00:00.000Z', repeats: 6 },
      { from: '2026-09-20T17:00:00.000Z', repeats: 5 },
      { from: '2026-09-27T17:00:00.000Z', repeats: 3 },
      { from: '2026-10-04T17:00:00.000Z', repeats: 2 },
      { from: '2026-10-11T17:00:00.000Z', repeats: 0 },
    ]);
    // The same instants fall in other weeks in UTC: the weeks start on Monday 00:00 UTC there.
    const utc = await scoreboard('UTC');
    expect(utc.body.weeks[0].from).toBe('2026-09-14T00:00:00.000Z');
    expect((await scoreboard('Not/AZone')).status).toBe(400);
    expect((await scoreboard('Not/AZone')).body.error.code).toBe('VALIDATION_FAILED');
  });

  it('splits at the check date: an id before it is before, an id at the same instant and an id after it are after', async () => {
    const dir = makeGitRepo([{ at: '2026-10-10T09:00:00+07:00', files: { 'tests/a.test.ts': 'x\n' } }]);
    await world(dir);
    const ids = await runsAt(['2026-10-10T01:59:59Z', '2026-10-10T02:00:00Z', '2026-10-10T02:00:01Z']);
    writeReport(dir, '2026-10-18.json', [cluster('aaaaaaaaaaaa', 'cause a', ids, 'tests/a.test.ts')]);
    const res = await scoreboard();
    expect(res.body.causes).toEqual([
      { fingerprint: 'aaaaaaaaaaaa', cause: 'cause a', checkName: 'tests/a.test.ts', checkMergedAt: '2026-10-10T02:00:00.000Z', before: 1, after: 2, repeats: 3 },
    ]);
    expect(res.body.figures).toEqual({ causes: 1, checks: 1, before: 1, after: 2 });
  });

  it('gives a cause with no check its repeats only, and keeps it out of the sums', async () => {
    const dir = makeGitRepo([{ at: '2026-10-10T09:00:00+07:00', files: { 'tests/a.test.ts': 'x\n' } }]);
    await world(dir);
    const ids = await runsAt(['2026-10-11T01:00:00Z', '2026-10-12T01:00:00Z']);
    const withCheck = await runsAt(['2026-10-01T01:00:00Z']);
    writeReport(dir, '2026-10-18.json', [cluster('bbbbbbbbbbbb', 'no check', ids), cluster('aaaaaaaaaaaa', 'with check', withCheck, 'tests/a.test.ts')]);
    const res = await scoreboard();
    expect(res.body.causes.map((c: Json) => [c.cause, c.checkName, c.checkMergedAt, c.before, c.after, c.repeats])).toEqual([
      ['no check', null, null, 0, 0, 2],
      ['with check', 'tests/a.test.ts', '2026-10-10T02:00:00.000Z', 1, 0, 1],
    ]);
    expect(res.body.figures).toEqual({ causes: 2, checks: 1, before: 1, after: 0 });
  });

  it('merges the same fingerprint of two files into one cause and counts an id once', async () => {
    const dir = makeGitRepo([{ at: '2026-10-10T09:00:00+07:00', files: { 'tests/a.test.ts': 'x\n' } }]);
    await world(dir);
    const [r1, r2, r3] = await runsAt(['2026-10-01T01:00:00Z', '2026-10-02T01:00:00Z', '2026-10-12T01:00:00Z']);
    writeReport(dir, '2026-10-04.json', [cluster('aaaaaaaaaaaa', 'old name', [r1!, r2!])]);
    writeReport(dir, '2026-10-18.json', [cluster('aaaaaaaaaaaa', 'new name', [r2!, r3!], 'tests/a.test.ts')]);
    const res = await scoreboard();
    expect(res.body.causes).toHaveLength(1);
    expect(res.body.causes[0]).toMatchObject({ cause: 'new name', checkName: 'tests/a.test.ts', before: 2, after: 1, repeats: 3 });
  });

  it('skips a comment id, which has no date, and dates a gate id by the end of its job', async () => {
    const dir = makeGitRepo([{ at: '2026-10-10T09:00:00+07:00', files: { 'tests/a.test.ts': 'x\n' } }]);
    const repoId = await world(dir);
    const [run] = await runsAt(['2026-10-12T01:00:00Z']);
    const gate = createPgRepositories(pool).gate;
    const jobId = randomUUID();
    const queued = new Date('2026-10-01T00:00:00Z');
    await gate.enqueue({ id: jobId, repoId, prNumber: 5, headSha: 'abcdef0123456789abcdef0123456789abcdef01', taskKey: '1', at: queued });
    await gate.takeNext(queued);
    await gate.finish(jobId, { state: 'failed', failedStep: 'green', at: new Date('2026-10-05T00:00:00Z') });
    writeReport(dir, '2026-10-18.json', [cluster('aaaaaaaaaaaa', 'cause a', [run!, `gate:${jobId}`, 'comment:12:3456', 'gate:not-a-job'], 'tests/a.test.ts')]);
    const res = await scoreboard();
    expect(res.body.causes[0]).toMatchObject({ before: 1, after: 1, repeats: 2 });
  });

  it('ignores a file that is not a report, and with no report at all gives zeros and 5 empty weeks', async () => {
    const dir = makeGitRepo([{ at: '2026-10-10T09:00:00+07:00', files: { 'README.md': 'x\n' } }]);
    await world(dir);
    const empty = await scoreboard();
    expect(empty.status).toBe(200);
    expect(empty.body.figures).toEqual({ causes: 0, checks: 0, before: 0, after: 0 });
    expect(empty.body.causes).toEqual([]);
    expect(empty.body.weeks.map((w: Json) => w.repeats)).toEqual([0, 0, 0, 0, 0]);

    mkdirSync(join(dir, 'reports', 'process-review'), { recursive: true });
    writeFileSync(join(dir, 'reports', 'process-review', '2026-10-01.json'), '{ not json');
    writeFileSync(join(dir, 'reports', 'process-review', '2026-10-02.json'), JSON.stringify({ v: 9, clusters: [] }));
    const [id] = await runsAt(['2026-10-12T01:00:00Z']);
    writeReport(dir, '2026-10-18.json', [cluster('aaaaaaaaaaaa', 'cause a', [id!])]);
    const res = await scoreboard();
    expect(res.body.causes.map((c: Json) => c.cause)).toEqual(['cause a']);
  });

  it('gives no check to a name that holds ".." or starts with "-", and makes no git call for it', async () => {
    // Both files are committed, so a git call would find a date for each. The guard is the only reason that the date is null.
    const dir = makeGitRepo([{ at: '2026-10-10T09:00:00+07:00', files: { '-flag.test.ts': 'x\n', 'a..b.test.ts': 'x\n', 'plain.test.ts': 'x\n' } }]);
    await world(dir);
    const ids = await runsAt(['2026-10-12T01:00:00Z']);
    writeReport(dir, '2026-10-18.json', [
      cluster('aaaaaaaaaaaa', 'dash', ids, '-flag.test.ts'),
      cluster('bbbbbbbbbbbb', 'dots', ids, 'a..b.test.ts'),
      cluster('cccccccccccc', 'plain', ids, 'plain.test.ts'),
    ]);
    const res = await scoreboard();
    const byCause = Object.fromEntries(res.body.causes.map((c: Json) => [c.cause, c]));
    expect(byCause.dash).toMatchObject({ checkName: null, checkMergedAt: null });
    expect(byCause.dots).toMatchObject({ checkName: null, checkMergedAt: null });
    expect(byCause.plain).toMatchObject({ checkName: 'plain.test.ts', checkMergedAt: '2026-10-10T02:00:00.000Z' });
    expect(res.body.figures.checks).toBe(1);
  });
});
