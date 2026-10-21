// Repo API + loops bound to a repo (SPEC-phase-2 section API contract) on the real server (composeServer) + test Postgres.
// Every result is cross-checked with a SELECT straight on the DB - a route returning hard-coded JSON without writing the DB goes red at once.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loopBody, resetApi, startApi, TEST_REPO_DIR, testPool, type ApiServer } from '../support/api-kit';

let server: ApiServer;
let pool: pg.Pool;
let repoId: string;
beforeAll(async () => {
  server = await startApi();
  pool = testPool();
});
afterAll(async () => {
  await server?.shutdown();
  await pool?.end();
});
beforeEach(async () => {
  repoId = await resetApi(server);
});

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
async function call(method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) {
  const res = await server.app.inject({ method, url, ...(payload === undefined ? {} : { payload: payload as Json }) });
  return { status: res.statusCode, body: (res.body ? res.json() : null) as Json };
}
const rows = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows;
const tmpDir = () => mkdtempSync(join(tmpdir(), 'lc23-api-'));
const MISSING = '00000000-0000-4000-8000-000000000000';
const issues = (b: Json) => (b.error.details.issues as { field: string; code: string }[]).map((i) => `${i.field}:${i.code}`);

describe('POST /api/repos (UC-19)', () => {
  it('201 -> repo exactly as in the DB; empty name = folder name; path stored in canonical form', async () => {
    const dir = tmpDir();
    mkdirSync(join(dir, 'sub'));
    const res = await call('POST', '/api/repos', { path: join(dir, 'sub', '..') + '/' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: basename(dir), path: dir });
    expect(res.body.createdAt).toMatch(/Z$/);
    expect(await rows('SELECT name, path FROM repos WHERE id = $1', [res.body.id])).toEqual([{ name: basename(dir), path: dir }]);

    const list = await call('GET', '/api/repos');
    expect(list.status).toBe(200);
    expect(list.body.items.map((r: Json) => r.path).sort()).toEqual([dir, TEST_REPO_DIR].sort());
  });

  it('folder does not exist / is a file / relative / empty / missing -> 400 VALIDATION_FAILED at the path field, nothing written to the DB', async () => {
    const file = join(tmpDir(), 'f.txt');
    writeFileSync(file, 'x');
    const cases: [unknown, string][] = [
      [{ path: join(tmpDir(), 'does-not-exist') }, 'path:notDirectory'],
      [{ path: file }, 'path:notDirectory'],
      [{ path: 'relative/path' }, 'path:invalid'],
      [{ path: '' }, 'path:required'],
      [{}, 'path:required'],
      [{ path: tmpDir(), name: 'a'.repeat(81) }, 'name:tooLong'],
    ];
    for (const [body, issue] of cases) {
      const res = await call('POST', '/api/repos', body);
      expect([res.status, res.body.error.code, issues(res.body)]).toEqual([400, 'VALIDATION_FAILED', [issue]]);
    }
    expect(await rows('SELECT count(*)::int AS n FROM repos')).toEqual([{ n: 1 }]); // only the test default repo
  });

  it('duplicate path -> 409 REPO_PATH_TAKEN; duplicate name (case-insensitive) -> 409 REPO_NAME_TAKEN', async () => {
    const path = await call('POST', '/api/repos', { path: TEST_REPO_DIR, name: 'other' });
    expect([path.status, path.body.error.code, path.body.error.details]).toEqual([409, 'REPO_PATH_TAKEN', { field: 'path', name: 'repo test' }]);
    const name = await call('POST', '/api/repos', { path: tmpDir(), name: 'REPO TEST' });
    expect([name.status, name.body.error.code, name.body.error.details]).toEqual([409, 'REPO_NAME_TAKEN', { field: 'name' }]);
    expect(await rows('SELECT count(*)::int AS n FROM repos')).toEqual([{ n: 1 }]);
  });
});

describe('GET /api/repos - folder still exists + number of loops using it', () => {
  it('exists = folder still on disk (checked at read time, blocks nothing); loopCount = number of loops using it, archived ones included - exactly as the DB', async () => {
    const dir = tmpDir();
    const repo = (await call('POST', '/api/repos', { path: dir, name: 'will vanish' })).body;
    await call('POST', '/api/loops', loopBody({ name: 'Uses 1', repoId: repo.id }));
    const two = (await call('POST', '/api/loops', loopBody({ name: 'Uses 2', repoId: repo.id }))).body;
    await call('POST', `/api/loops/${two.id}/archive`);
    const byId = async () => Object.fromEntries(((await call('GET', '/api/repos')).body.items as Json[]).map((r) => [r.id, r]));
    expect((await byId())[repo.id]).toMatchObject({ name: 'will vanish', exists: true, loopCount: 2 });
    expect((await byId())[repoId]).toMatchObject({ exists: true, loopCount: 0 });
    const db = await rows('SELECT repo_id, count(*)::int AS n FROM loops GROUP BY repo_id');
    expect(db).toEqual([{ repo_id: repo.id, n: 2 }]);

    rmSync(dir, { recursive: true }); // folder vanishes after registration -> warning only, repo + loops stay intact
    expect((await byId())[repo.id]).toMatchObject({ exists: false, loopCount: 2 });
    expect(await rows('SELECT count(*)::int AS n FROM repos WHERE id = $1', [repo.id])).toEqual([{ n: 1 }]);
  });

  it('test mode forces a folder present / missing by its exact path string (POST /api/__test/dirs); reset clears the forcing', async () => {
    expect((await call('POST', '/api/__test/dirs', { paths: { [TEST_REPO_DIR]: false } })).status).toBe(204);
    const one = async () => ((await call('GET', '/api/repos')).body.items as Json[]).find((r) => r.id === repoId);
    expect(await one()).toMatchObject({ exists: false });
    repoId = await resetApi(server);
    expect(await one()).toMatchObject({ exists: true });
  });
});

describe('DELETE /api/repos/:id (UC-20)', () => {
  it('no loop uses it -> 204, gone from the DB; again / unknown id -> 404 REPO_NOT_FOUND', async () => {
    const repo = (await call('POST', '/api/repos', { path: tmpDir() })).body;
    expect((await call('DELETE', `/api/repos/${repo.id}`)).status).toBe(204);
    expect(await rows('SELECT id FROM repos WHERE id = $1', [repo.id])).toEqual([]);
    for (const id of [repo.id, MISSING, 'not-a-uuid']) {
      const res = await call('DELETE', `/api/repos/${id}`);
      expect([res.status, res.body.error.code]).toEqual([404, 'REPO_NOT_FOUND']);
    }
  });

  it('still used by a loop (archived ones included) -> 409 REPO_IN_USE naming the loops, repo stays in the DB', async () => {
    const a = (await call('POST', '/api/loops', loopBody({ name: 'Loop A' }))).body;
    const b = (await call('POST', '/api/loops', loopBody({ name: 'Loop B' }))).body;
    await call('POST', `/api/loops/${b.id}/archive`);
    const res = await call('DELETE', `/api/repos/${repoId}`);
    expect([res.status, res.body.error.code, res.body.error.details]).toEqual([409, 'REPO_IN_USE', { loops: ['Loop A', 'Loop B'], archivedLoops: ['Loop B'] }]);
    expect(await rows('SELECT count(*)::int AS n FROM repos WHERE id = $1', [repoId])).toEqual([{ n: 1 }]);
    expect(a.repo.id).toBe(repoId);
  });
});

describe('Loop bound to a repo (UC-21, UC-25)', () => {
  it('UC-21 create a Claude loop: repo + default model / effort opus / medium, empty timeout = null - exactly as the DB', async () => {
    const res = await call('POST', '/api/loops', loopBody({ timeoutSec: undefined, executor: { kind: 'claude' } }));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      repo: { id: repoId, name: 'repo test', path: TEST_REPO_DIR },
      timeoutSec: null,
      executor: { kind: 'claude', config: { model: 'opus', effort: 'medium' } },
    });
    expect(await rows('SELECT repo_id, timeout_sec, executor_kind FROM loops WHERE id = $1', [res.body.id])).toEqual([
      { repo_id: repoId, timeout_sec: null, executor_kind: 'claude' },
    ]);
  });

  it('UC-21 missing repo -> required, nonexistent repo -> unknownRepo (400, nothing written to the DB); PUT can change the repo', async () => {
    const missing = await call('POST', '/api/loops', loopBody({ repoId: undefined }));
    expect([missing.status, issues(missing.body)]).toEqual([400, ['repoId:required']]);
    const unknown = await call('POST', '/api/loops', loopBody({ repoId: MISSING }));
    expect([unknown.status, issues(unknown.body)]).toEqual([400, ['repoId:unknownRepo']]);
    expect(await rows('SELECT count(*)::int AS n FROM loops')).toEqual([{ n: 0 }]);

    const loop = (await call('POST', '/api/loops', loopBody({ name: 'Change repo' }))).body;
    const other = (await call('POST', '/api/repos', { path: tmpDir(), name: 'other' })).body;
    const put = await call('PUT', `/api/loops/${loop.id}`, loopBody({ name: 'Change repo', repoId: other.id, version: loop.version }));
    expect([put.status, put.body.repo.name]).toEqual([200, 'other']);
    expect(await rows('SELECT repo_id FROM loops WHERE id = $1', [loop.id])).toEqual([{ repo_id: other.id }]);
  });

  it('UC-25 GET /loops?repoId= returns only the loops of that repo; each loop carries the repo name', async () => {
    const other = (await call('POST', '/api/repos', { path: tmpDir(), name: 'other' })).body;
    const a = (await call('POST', '/api/loops', loopBody({ name: 'A' }))).body;
    const b = (await call('POST', '/api/loops', loopBody({ name: 'B', repoId: other.id }))).body;
    expect((await call('GET', `/api/loops?repoId=${other.id}`)).body.items.map((l: Json) => l.id)).toEqual([b.id]);
    expect((await call('GET', `/api/loops?repoId=${repoId}`)).body.items.map((l: Json) => l.id)).toEqual([a.id]);
    expect((await call('GET', `/api/loops?repoId=${MISSING}`)).body.items).toEqual([]);
    expect((await call('GET', '/api/loops?repoId=xyz')).body.items).toEqual([]);
    expect((await call('GET', `/api/loops/${b.id}`)).body.repo).toMatchObject({ id: other.id, name: 'other' });
  });
});

describe('Runs in the repo folder (UC-23, UC-24)', () => {
  it('UC-23 repo folder deleted -> Claude run failed "Repo does not exist", no session opened; the loop keeps going, the next tick still produces a run', async () => {
    const dir = tmpDir();
    const repo = (await call('POST', '/api/repos', { path: dir, name: 'will vanish' })).body;
    const loop = (await call('POST', '/api/loops', loopBody({ repoId: repo.id, cron: '* * * * *', executor: { kind: 'claude' } }))).body;
    rmSync(dir, { recursive: true }); // repo vanishes after registration - the executor checks before opening Claude Code, costing no quota
    await call('POST', `/api/loops/${loop.id}/start`);
    const runsOf = () => rows('SELECT iteration, status, error, session_id FROM runs WHERE loop_id = $1 ORDER BY iteration', [loop.id]);
    await vi.waitFor(async () => expect((await runsOf())[0]?.status).toBe('failed'), { timeout: 5000 });
    expect((await runsOf())[0]).toEqual({ iteration: 1, status: 'failed', error: `Repo does not exist: ${dir}`, session_id: null });
    expect(await rows('SELECT status FROM loops WHERE id = $1', [loop.id])).toEqual([{ status: 'active' }]);

    await call('POST', '/api/__test/clock', { advanceMs: 61_000 }); // past the next cron boundary
    await vi.waitFor(async () => expect((await runsOf()).map((r) => r.status)).toEqual(['failed', 'failed']), { timeout: 5000 });
    await call('POST', `/api/loops/${loop.id}/stop`);
  });

  it('UC-24 empty timeout: run deadline_at NULL, clock advanced 2 days -> still running, not timed_out', async () => {
    const loop = (await call('POST', '/api/loops', loopBody({ timeoutSec: null }))).body; // Mock 600 "seconds", yearly schedule
    const run = (await call('POST', `/api/loops/${loop.id}/start`)).body.activeRun;
    expect(await rows('SELECT status, deadline_at FROM runs WHERE id = $1', [run.id])).toEqual([{ status: 'running', deadline_at: null }]);
    await call('POST', '/api/__test/clock', { advanceMs: 2 * 86_400_000 });
    const ticks = server.inspect.ticks();
    await vi.waitFor(() => expect(server.inspect.ticks()).toBeGreaterThanOrEqual(ticks + 3), { timeout: 5000 });
    expect(await rows('SELECT status, finished_at FROM runs WHERE id = $1', [run.id])).toEqual([{ status: 'running', finished_at: null }]);
    expect((await call('GET', `/api/runs/${run.id}`)).body).toMatchObject({ status: 'running', deadlineAt: null });
    await call('POST', `/api/loops/${loop.id}/stop`);
  });
});
