// The world of the scoreboard (goal G15): the sample of `goalLoop.score` in design/ds/preview/data.js, built for real. The folder of the
// repo `api` becomes a git repo with two check files committed on known days, `reports/process-review/2026-10-18.json` names three
// causes, and 16 failed runs of the loop `pilot` are the events. The page of this world must equal the approved scoreboard shots.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type pg from 'pg';
import { DS_DATA_JS, execId, loopId, PREVIEW_NOW, repoId, seedPreviewWorld, uuid } from './preview-world';

/** What the seed needs of a running console: its test routes. `ServerProcess` has this, and so has a wrapper of `app.inject`. */
export type TestApi = { api(method: 'POST', path: string, body?: unknown): Promise<{ status: number }> };

const IDENT = ['-c', 'user.name=Fake Dev', '-c', 'user.email=fake@example.com', '-c', 'commit.gpgsign=false'];

/** A new git repository in a temp folder with one commit for each entry, dated `at` (an ISO string with an offset). Returns the folder. */
export function makeGitRepo(commits: { at: string; files: Record<string, string> }[], dir = mkdtempSync(join(tmpdir(), 'lc-score-repo-'))): string {
  const git = (args: string[], env: Record<string, string> = {}) =>
    execFileSync('git', [...IDENT, ...args], { cwd: dir, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  git(['init', '-q']);
  for (const c of commits) {
    for (const [name, text] of Object.entries(c.files)) {
      mkdirSync(dirname(join(dir, name)), { recursive: true });
      writeFileSync(join(dir, name), text);
    }
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'add check'], { GIT_AUTHOR_DATE: c.at, GIT_COMMITTER_DATE: c.at });
  }
  return dir;
}

/** Writes `reports/process-review/<name>` in a repo folder. */
export function writeReport(dir: string, name: string, clusters: unknown[], from = '2026-09-14', to = '2026-10-18'): void {
  mkdirSync(join(dir, 'reports', 'process-review'), { recursive: true });
  writeFileSync(join(dir, 'reports', 'process-review', name), JSON.stringify({ v: 1, from, to, clusters }));
}

/** A cluster of spec 2.12 with the keys the scoreboard reads and the rest filled in. */
export function cluster(fingerprint: string, cause: string, runIds: string[], check?: string): Record<string, unknown> {
  return {
    id: fingerprint,
    cause,
    events: runIds.length,
    runIds,
    firstAt: '2026-09-15T03:00:00.000Z',
    lastAt: '2026-10-07T03:00:00.000Z',
    repo: 'o/r',
    fingerprint,
    ...(check ? { check: { kind: 'test', name: check, replay: `npx vitest run ${check}` } } : {}),
  };
}

type Event = { fingerprint: string; day: string };
/** The 16 events of the sample, one run each, at 10:00 in `Asia/Ho_Chi_Minh`. */
const USAGE = 'a1b2c3d4e5f6';
const SAC = 'b2c3d4e5f6a1';
const PORT = 'c3d4e5f6a1b2';
const EVENTS: Event[] = [
  ...['2026-09-15', '2026-09-15', '2026-09-15', '2026-09-22', '2026-09-22', '2026-09-29', '2026-09-29'].map((day) => ({ fingerprint: USAGE, day })),
  ...['2026-09-15', '2026-09-15', '2026-09-22', '2026-09-29', '2026-10-06'].map((day) => ({ fingerprint: SAC, day })),
  ...['2026-09-16', '2026-09-23', '2026-09-23', '2026-10-07'].map((day) => ({ fingerprint: PORT, day })),
];

/** Inserts failed runs of the loop `pilot`, one at each of `starts`, into its current execution. Returns the run ids. */
export async function insertFailedRuns(db: pg.Pool, starts: string[], salt: string, firstIteration = 9000): Promise<string[]> {
  const loop = loopId('pilot', DS_DATA_JS);
  const exec = execId('pilot', 3, DS_DATA_JS);
  const ids: string[] = [];
  for (const [i, startedAt] of starts.entries()) {
    const id = uuid(`score ${salt} ${i}`);
    await db.query(
      `INSERT INTO runs (id, loop_id, execution_id, iteration, trigger, status, started_at, finished_at, prompt_snapshot, executor_kind, executor_config, error)
       VALUES ($1, $2, $3, $4, 'schedule', 'failed', $5, $5, 'prompt', 'mock', '{}', 'You have hit your limit')`,
      [id, loop, exec, firstIteration + i, startedAt],
    );
    ids.push(id);
  }
  return ids;
}

/**
 * Resets the console, sets its clock to `PREVIEW_NOW`, seeds the world of the preview, then builds the scoreboard of the sample. It
 * returns the folder of the repo `api`. The result must equal `goalLoop.score` of data.js: figures 3, 2, 11, 1, weeks 6, 5, 3, 2, 0,
 * and the causes 7 and 0, 4 and 1, 4 repeats.
 */
export async function seedScoreboard(sp: TestApi, db: pg.Pool): Promise<{ path: string }> {
  expectOk(await sp.api('POST', '/api/__test/reset'));
  expectOk(await sp.api('POST', '/api/__test/clock', { at: PREVIEW_NOW.toISOString() }));
  await seedPreviewWorld(db, {}, DS_DATA_JS);
  const path = makeGitRepo([
    { at: '2026-10-02T09:00:00+07:00', files: { 'scripts/preflight.mjs': 'export {};\n' } },
    { at: '2026-10-08T09:00:00+07:00', files: { 'tests/api/usage-hold.test.ts': 'export {};\n' } },
  ]);
  await db.query('UPDATE repos SET path = $1 WHERE id = $2', [path, repoId('api', DS_DATA_JS)]);
  const ids = await insertFailedRuns(
    db,
    EVENTS.map((e) => `${e.day}T10:00:00+07:00`),
    'sample',
  );
  const idsOf = (fingerprint: string) => ids.filter((_, i) => EVENTS[i]!.fingerprint === fingerprint);
  writeReport(path, '2026-10-18.json', [
    cluster(USAGE, 'Usage limit ends a run', idsOf(USAGE), 'tests/api/usage-hold.test.ts'),
    cluster(SAC, 'Smart App Control blocks tests', idsOf(SAC), 'scripts/preflight.mjs'),
    cluster(PORT, 'A test port is already taken', idsOf(PORT)),
  ]);
  return { path };
}

function expectOk(res: { status: number }): void {
  if (res.status >= 300) throw new Error(`test route answered ${res.status}`);
}
