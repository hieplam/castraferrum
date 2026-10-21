// Folder browsing API (UC-29 - SPEC-phase-2 § API contract) on a real server (composeServer, test mode): a REAL temp directory
// tree on the machine running the tests (cross-checked with node:fs), registered folders cross-checked with SELECT; the
// test-mode fake world via POST /api/__test/folders.
import { mkdirSync, mkdtempSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, parse, sep } from 'node:path';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetApi, startApi, TEST_REPO_DIR, testPool, type ApiServer } from '../support/api-kit';

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
beforeEach(async () => {
  await resetApi(server);
});

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
async function call(method: 'GET' | 'POST', url: string, payload?: unknown) {
  const res = await server.app.inject({ method, url, ...(payload === undefined ? {} : { payload: payload as Json }) });
  return { status: res.statusCode, body: (res.body ? res.json() : null) as Json };
}
const q = (path: string) => `/api/folders?path=${encodeURIComponent(path)}`;
const issues = (b: Json) => (b.error.details.issues as { field: string; code: string }[]).map((i) => `${i.field}:${i.code}`);
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

describe('GET /api/folders (UC-29)', () => {
  it('200 → exactly the subfolders of the real temp tree (as node:fs sees them), canonical path; a registered folder carries the repo name as in the DB', async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'lc-browse-api-')));
    for (const d of ['Alpha', 'beta/.git', '.an', 'gamma/con', 'x10', 'x9']) mkdirSync(join(root, d), { recursive: true });
    writeFileSync(join(root, 'file.txt'), 'x');
    const reg = await call('POST', '/api/repos', { path: join(root, 'beta'), name: 'repo beta' });
    expect(reg.status).toBe(201);

    const res = await call('GET', q(`${root}${sep}gamma${sep}..${sep}`)); // typed differently → same canonical form
    expect(res.status).toBe(200);
    const onDisk = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort(collator.compare);
    expect(res.body.entries.map((e: Json) => e.name)).toEqual(onDisk);
    expect(onDisk).toEqual(['.an', 'Alpha', 'beta', 'gamma', 'x9', 'x10']);
    expect(res.body).toMatchObject({ path: root, parent: dirname(root), git: false, repo: null, truncated: false, unreadable: null });
    const [saved] = (await pool.query('SELECT name, path FROM repos WHERE id = $1', [reg.body.id])).rows;
    expect(res.body.entries.find((e: Json) => e.name === 'beta')).toEqual({ name: 'beta', path: saved.path, git: true, hidden: false, repo: saved.name });
    expect(res.body.entries.find((e: Json) => e.name === '.an')).toMatchObject({ hidden: true, repo: null });
    expect(res.body.crumbs.at(-1)).toEqual({ name: parse(root).base, path: root });
  });

  it('empty path → the home directory of the machine running the server', async () => {
    const res = await call('GET', '/api/folders');
    expect([res.status, res.body.path]).toEqual([200, realpathSync.native(homedir())]);
  });

  it('relative / missing / is a file → 400 VALIDATION_FAILED at the path field', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lc-browse-api-'));
    writeFileSync(join(dir, 'f.txt'), 'x');
    const cases: [string, string][] = [
      ['relative/path', 'path:invalid'],
      [join(dir, 'does-not-exist'), 'path:notDirectory'],
      [join(dir, 'f.txt'), 'path:notDirectory'],
    ];
    for (const [path, issue] of cases) {
      const res = await call('GET', q(path));
      expect([res.status, res.body.error.code, issues(res.body)]).toEqual([400, 'VALIDATION_FAILED', [issue]]);
    }
  });
});

describe('GET /api/folders/places', () => {
  it("200 → OS + the machine's home directory; the drive holding the temp directory is in roots; the parent of the test repo is in nearRepos", async () => {
    const res = await call('GET', '/api/folders/places');
    expect(res.status).toBe(200);
    const platform = process.platform === 'win32' || process.platform === 'darwin' ? process.platform : 'linux';
    expect([res.body.platform, res.body.home]).toEqual([platform, homedir()]);
    expect(res.body.places[0]).toEqual({ kind: 'home', path: homedir() });
    const tmpRoot = parse(realpathSync.native(tmpdir())).root;
    expect(res.body.roots.map((r: Json) => r.path)).toContain(platform === 'darwin' ? '/' : tmpRoot);
    const parent = dirname(realpathSync.native(TEST_REPO_DIR));
    expect(res.body.nearRepos).toContainEqual({ path: parent, name: parse(parent).base, repos: ['repo test'] });
  });
});

describe('POST /api/__test/folders - fake folder world (test mode)', () => {
  it("set a fake Mac → places + folders return the world's tree; reset → back to the real machine; bad body → 400", async () => {
    const world = {
      platform: 'darwin',
      home: '/Users/alice',
      dirs: ['/Users/alice/Code/atlas/.git', '/Users/alice/Desktop', '/Volumes/Backup'],
      links: { '/Volumes/Macintosh HD': '/' },
    };
    expect((await call('POST', '/api/__test/folders', { world })).status).toBe(204);
    const places = await call('GET', '/api/folders/places');
    expect(places.body).toMatchObject({ platform: 'darwin', home: '/Users/alice', roots: [{ name: 'Macintosh HD', path: '/' }, { name: 'Backup', path: '/Volumes/Backup' }] });
    const code = await call('GET', q('~/Code'));
    expect(code.body).toMatchObject({ path: '/Users/alice/Code', parent: '/Users/alice', entries: [{ name: 'atlas', path: '/Users/alice/Code/atlas', git: true, hidden: false, repo: null }] });

    expect((await call('POST', '/api/__test/folders', { world: { ...world, platform: 'beos' } })).status).toBe(400);
    expect((await call('POST', '/api/__test/reset')).status).toBe(204);
    expect((await call('GET', '/api/folders')).body.path).toBe(realpathSync.native(homedir()));
  });
});
