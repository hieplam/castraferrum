// GET /api/loops/:id/goals (spec 2.10, goal G11, task T6): what the goals page reads. The real composition on the test Postgres. The files
// of the repository come from a real git clone of a local bare repository, so `origin/main` is a real ref and no test reaches the network.
// The rows of `goal_runs`, the standing goals and the probes are inserted with the repositories or with SQL.
import { randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { GoalRunRecord } from '../../shared/domain/standing-goal';
import { createPgRepositories } from '../../server/adapters/postgres/repositories';
import { composeServer, type ComposedServer } from '../../server/compose';
import { TEST_DB_URL, loopBody, resetApi, testPool } from '../support/api-kit';
import { createBareRepo, type BareRepo } from '../support/bare-repo';

const GITHUB_REPO = 'hieplam/tribe';
const MANIFEST = 'goals/2026-10-16-billing.json';
const T0 = Date.parse('2026-10-18T06:00:00Z');
const at = (minutes: number) => new Date(T0 + minutes * 60_000);

let server: ComposedServer;
let pool: ReturnType<typeof testPool>;
const bares: BareRepo[] = [];

beforeAll(async () => {
  pool = testPool();
  server = await composeServer({ databaseUrl: TEST_DB_URL, testMode: true, dbWaitMs: 5000 });
});

afterAll(async () => {
  await server?.shutdown();
  await pool?.end();
});

beforeEach(async () => {
  await resetApi(server);
});

afterEach(() => {
  for (const bare of bares.splice(0)) bare.dispose();
});

const repositories = () => createPgRepositories(pool);

const manifestText = (ids: string[], opened?: unknown) =>
  `${JSON.stringify({ epic: 7, ...(opened === undefined ? {} : { opened }), goals: ids.map((id) => ({ id, outcome: `Outcome of ${id}`, checks: [{ run: `node tests/row.mjs ${id}` }] })) }, null, 2)}\n`;

/** A registered repo whose clone holds `files` on `origin/main`, a loop in it, and a gate row. Returns the repo id and the loop id. */
async function world(files: Record<string, string>, gate = true): Promise<{ repoId: string; loopId: string }> {
  const bare = createBareRepo();
  bares.push(bare);
  const dir = bare.clone();
  bare.commit(dir, files, 'goals');
  bare.push(dir, 'main');
  const created = await server.app.inject({ method: 'POST', url: '/api/repos', payload: { path: realpathSync(dir), name: `goals ${randomUUID().slice(0, 6)}` } });
  expect(created.statusCode).toBe(201);
  const repoId = created.json().id as string;
  const loop = await server.app.inject({ method: 'POST', url: '/api/loops', payload: loopBody({ repoId }) });
  expect(loop.statusCode).toBe(201);
  if (gate) await repositories().gate.setRepoGate(repoId, { enabled: true, githubRepo: GITHUB_REPO, checkCommand: [] }, new Date());
  return { repoId, loopId: loop.json().id as string };
}

const row = (over: Partial<GoalRunRecord> = {}): GoalRunRecord => ({
  repo: GITHUB_REPO,
  manifest: MANIFEST,
  rowId: 'G1',
  pass: true,
  value: 12,
  of: 12,
  line: 'G1 12/12 refund tests',
  cadence: 'merge',
  sha: '4be21c7aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  at: at(0),
  ...over,
});

const goals = (loopId: string, query = '') => server.app.inject({ method: 'GET', url: `/api/loops/${loopId}/goals${query}` });

describe('GET /api/loops/:id/goals', { timeout: 60_000 }, () => {
  it('a loop with no gate row, or no stored row, gives manifest null and empty lists, and an unknown loop gives 404 LOOP_NOT_FOUND', async () => {
    const empty = { manifest: null, checkedAt: null, sha: null, passed: 0, total: 0, opened: null, rows: [], standing: [], loops: [] };
    const noGate = await world({ [MANIFEST]: manifestText(['G1']) }, false);
    await repositories().goals.saveRows([row()]);
    expect((await goals(noGate.loopId)).json()).toEqual(empty);
    const noRows = await world({ [MANIFEST]: manifestText(['G1']) });
    await pool.query('TRUNCATE goal_runs');
    const res = await goals(noRows.loopId);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(empty);
    const unknown = await goals(randomUUID());
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json().error.code).toBe('LOOP_NOT_FOUND');
  });

  it('the rows join the file and goal_runs: the outcome comes from the file, the line loses its id, the count and the sha come from the stored rows', async () => {
    const { loopId } = await world({ [MANIFEST]: manifestText(['G1', 'G2', 'G3']) });
    await repositories().goals.saveRows([
      row({ rowId: 'G2', pass: false, value: 3, of: 8, line: 'G2 3/8 screens', at: at(5), sha: '9c1d4e2bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }),
      row({ rowId: 'G1' }),
      row({ rowId: 'G3', line: 'G3 6/6 retries', at: at(2) }),
    ]);
    const body = (await goals(loopId)).json();
    expect(body.manifest).toBe(MANIFEST);
    expect(body.rows).toEqual([
      { id: 'G1', outcome: 'Outcome of G1', pass: true, line: '12/12 refund tests' },
      { id: 'G2', outcome: 'Outcome of G2', pass: false, line: '3/8 screens' },
      { id: 'G3', outcome: 'Outcome of G3', pass: true, line: '6/6 retries' },
    ]);
    expect([body.passed, body.total]).toEqual([2, 3]);
    expect(body.checkedAt).toBe(at(5).toISOString());
    expect(body.sha).toBe('9c1d4e2');
  });

  it('a goal with no stored row fails with an empty line, and the total is the size of the file', async () => {
    const { loopId } = await world({ [MANIFEST]: manifestText(['G1', 'G2', 'G3', 'G4']) });
    await repositories().goals.saveRows([row({ rowId: 'G2', line: 'G2 12/12 refund tests' })]);
    const body = (await goals(loopId)).json();
    expect(body.rows.map((r: { id: string; pass: boolean; line: string }) => [r.id, r.pass, r.line])).toEqual([
      ['G1', false, ''],
      ['G2', true, '12/12 refund tests'],
      ['G3', false, ''],
      ['G4', false, ''],
    ]);
    expect([body.passed, body.total]).toEqual([1, 4]);
  });

  it('opened is the opened object of the file, or null when the file has none or a bad one', async () => {
    const opened = { at: '2026-10-16T09:40:00+07:00', passed: 0, total: 8 };
    const first = await world({ [MANIFEST]: manifestText(['G1'], opened) });
    const second = await world({ [MANIFEST]: manifestText(['G1']) });
    const third = await world({ [MANIFEST]: manifestText(['G1'], { at: 5 }) });
    await repositories().goals.saveRows([row()]);
    expect((await goals(first.loopId)).json().opened).toEqual(opened);
    expect((await goals(second.loopId)).json().opened).toBeNull();
    expect((await goals(third.loopId)).json().opened).toBeNull();
  });

  it('the standing goals come from goals/health.json with the issue of each row: open since, last failed, number; a row never run has none', async () => {
    const health = JSON.stringify({ v: 1, rows: [{ id: 'H1', run: 'npm run verify' }, { id: 'H2', run: 'node scripts/merge-audit.mjs' }, { id: 'H3', run: 'node scripts/never.mjs' }] });
    const { loopId } = await world({ [MANIFEST]: manifestText(['G1']), 'goals/health.json': health });
    const repo = repositories();
    await repo.goals.saveRows([row()]);
    await repo.goals.saveGoal({ repo: GITHUB_REPO, rowId: 'H1', state: 'passing', lastLine: null, lastRunAt: at(10) });
    await repo.goals.saveGoal({ repo: GITHUB_REPO, rowId: 'H2', state: 'failing', lastLine: 'FAIL', lastRunAt: at(10) });
    const closed = { id: randomUUID(), repo: GITHUB_REPO, rowId: 'H1', fingerprint: 'aaaaaaaaaaaa', issueNumber: 30, openedAt: at(-60) };
    await repo.goals.open(closed);
    await repo.goals.touch(closed.id, at(-30));
    await repo.goals.close(closed.id, at(-20));
    await repo.goals.open({ id: randomUUID(), repo: GITHUB_REPO, rowId: 'H2', fingerprint: 'bbbbbbbbbbbb', issueNumber: 35, openedAt: at(-5) });
    const standing = (await goals(loopId)).json().standing;
    expect(standing).toEqual([
      { id: 'H1', command: 'npm run verify', pass: true, openSince: null, lastFailedAt: at(-30).toISOString(), issue: null },
      { id: 'H2', command: 'node scripts/merge-audit.mjs', pass: false, openSince: at(-5).toISOString(), lastFailedAt: at(-5).toISOString(), issue: 35 },
      { id: 'H3', command: 'node scripts/never.mjs', pass: false, openSince: null, lastFailedAt: null, issue: null },
    ]);
  });

  it('loops lists only the loops of this repository whose probe state is budget_limited or probe_failed, with the tokens used and the budget, and the last line as the text of a failed probe', async () => {
    const { repoId, loopId } = await world({ [MANIFEST]: manifestText(['G1']) });
    await repositories().goals.saveRows([row()]);
    const other = await world({ [MANIFEST]: manifestText(['G1']) });
    const probe = (id: string, state: string, line: string | null) =>
      pool.query(
        `INSERT INTO loop_probes (loop_id, command, claim, release, resources, lane_env, lane_base_port, restart_policy, state, last_line, last_probe_at)
         VALUES ($1,'["node","probe.mjs"]','[]','[]','[]','{}',NULL,'stop',$2,$3,$4)`,
        [id, state, line, at(0)],
      );
    const failed = await server.app.inject({ method: 'POST', url: '/api/loops', payload: loopBody({ repoId, name: 'Nightly health check' }) });
    const waiting = await server.app.inject({ method: 'POST', url: '/api/loops', payload: loopBody({ repoId, name: 'Waiting worker' }) });
    await probe(failed.json().id, 'probe_failed', 'exit 1');
    await probe(waiting.json().id, 'waiting', '{"v":1}');
    await probe(loopId, 'budget_limited', null);
    await probe(other.loopId, 'probe_failed', 'exit 2');
    await pool.query('UPDATE loop_probes SET token_budget = 1200000 WHERE loop_id = $1', [loopId]);
    const execution = randomUUID();
    await pool.query('INSERT INTO loop_executions (id, loop_id, seq, started_at) VALUES ($1,$2,1,$3)', [execution, loopId, at(0)]);
    await pool.query(
      `INSERT INTO runs (id, loop_id, execution_id, iteration, trigger, status, started_at, prompt_snapshot, executor_kind, executor_config, tokens)
       VALUES ($1,$2,$5,1,'probe','succeeded',$3,'p','claude','{}',700000), ($4,$2,$5,2,'probe','succeeded',$3,'p','claude','{}',500000)`,
      [randomUUID(), loopId, at(0), randomUUID(), execution],
    );
    const body = (await goals(loopId)).json();
    expect(body.loops).toHaveLength(2);
    expect(body.loops).toEqual(expect.arrayContaining([
      { id: loopId, name: expect.any(String), state: 'budget_limited', used: 1200000, budget: 1200000, text: null },
      { id: failed.json().id, name: 'Nightly health check', state: 'probe_failed', used: 0, budget: null, text: 'exit 1' },
    ]));
  });

  it('the manifest query picks one manifest, the default is the one with the newest row, and a manifest with no stored row gives manifest null', async () => {
    const older = 'goals/2026-09-01-older.json';
    const { loopId } = await world({ [MANIFEST]: manifestText(['G1', 'G2']), [older]: manifestText(['A1']) });
    await repositories().goals.saveRows([row({ rowId: 'G1', at: at(20) }), row({ manifest: older, rowId: 'A1', line: 'A1 ok', at: at(1) })]);
    const byDefault = (await goals(loopId)).json();
    expect([byDefault.manifest, byDefault.total]).toEqual([MANIFEST, 2]);
    const asked = (await goals(loopId, `?manifest=${encodeURIComponent(older)}`)).json();
    expect([asked.manifest, asked.total, asked.passed, asked.checkedAt]).toEqual([older, 1, 1, at(1).toISOString()]);
    const unknown = await goals(loopId, `?manifest=${encodeURIComponent('goals/none.json')}`);
    expect(unknown.statusCode).toBe(200);
    expect(unknown.json().manifest).toBeNull();
  });
});
