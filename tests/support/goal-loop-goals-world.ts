// The world of the goals page (goal G11): the sample of `goalLoop.goals` in design/ds/preview/data.js, built for real. The repo `api` becomes
// a git clone whose `origin/main` holds `goals/2026-10-16-billing.json` (8 goals, `opened` 0 of 8 on 16/10) and `goals/health.json` (rows H1
// and H2). The table `goal_runs` holds the 8 results (3 pass, commit 4be21c7, checked at 13:59), the standing goals hold H1 (passing, its
// last failure on 14/10 02:00) and H2 (failing since 18/10 02:00, issue 35), and the loop "Nightly health check" has a failed probe with the
// last line `exit 1`. The page of the loop "Billing epic worker" in this world must equal the approved `goal-rows` shots. Z2 imports the seed.
import { realpathSync } from 'node:fs';
import type pg from 'pg';
import { createBareRepo, type BareRepo } from './bare-repo';
import { type TestApi } from './goal-loop-score-world';
import { DS_DATA_JS, previewData, pvTime, PREVIEW_NOW, repoId, seedPreviewWorld, uuid } from './preview-world';

type Sample = {
  checkedAt: string;
  sha: string;
  opened: { at: string; passed: number; total: number };
  rows: [string, string, boolean, string][];
  standing: [string, string, boolean, string, string][];
  loops: [string, string, string][];
};
type SampleLoop = { id: string; name: string; desc: string; prompt: string; tz: string; timeout: number; claude: { model: string; effort: string }; created: string; updated: string; repo: string };

/** The name of the repository on GitHub. It only shows on the pages; no test reaches it, and the origin of the clone is a local bare repository. */
export const GOALS_GITHUB_REPO = 'hieplam/tribe';
export const GOALS_MANIFEST = 'goals/2026-10-16-billing.json';

/** The bare repositories of the seeds of this process. A test run removes the temp folders with the system, so no `dispose` is needed. */
const bares: BareRepo[] = [];

const MINUTE = 60_000;

/**
 * Resets the console, sets its clock to `PREVIEW_NOW`, seeds the world of the preview, then builds the world of the goals page. It
 * returns the folder of the repo `api` (a clone of a local bare repository), the id of the loop "Billing epic worker" and the path of its goals page.
 */
export async function seedGoalRows(sp: TestApi, db: pg.Pool): Promise<{ path: string; loopId: string; page: string }> {
  expectOk(await sp.api('POST', '/api/__test/reset'));
  expectOk(await sp.api('POST', '/api/__test/clock', { at: PREVIEW_NOW.toISOString() }));
  await seedPreviewWorld(db, {}, DS_DATA_JS);
  const gl = (previewData(DS_DATA_JS) as unknown as { goalLoop: { loop: SampleLoop; goals: Sample } }).goalLoop;
  const sample = gl.goals;
  const repo = repoId('api', DS_DATA_JS);

  // The repo `api` is a clone: `origin/main` holds the manifest and the health file, the way a repo with a merged goal manifest does.
  const bare = createBareRepo();
  bares.push(bare);
  const dir = bare.clone();
  const manifest = {
    epic: 7,
    opened: { at: '2026-10-16T09:40:12+07:00', passed: sample.opened.passed, total: sample.opened.total },
    goals: sample.rows.map(([id, outcome]) => ({ id, outcome, checks: [{ run: `node tests/row.mjs ${id}` }] })),
  };
  const health = {
    v: 1,
    cron: '0 2 * * *',
    timezone: 'Asia/Ho_Chi_Minh',
    epic: 0,
    rows: sample.standing.map(([id, run]) => ({ id, outcome: `The row ${id} passes.`, run, timeoutSec: 600 })),
  };
  bare.commit(dir, { [GOALS_MANIFEST]: `${JSON.stringify(manifest, null, 2)}\n`, 'goals/health.json': `${JSON.stringify(health, null, 2)}\n` }, 'goals');
  bare.push(dir, 'main');
  const path = realpathSync(dir);
  await db.query('UPDATE repos SET path = $1 WHERE id = $2', [path, repo]);

  // The gate row only names the repository on GitHub. It is off, so no goal pass of the console runs on this fake world.
  await db.query(`INSERT INTO repo_gate (repo_id, enabled, github_repo, check_command, updated_at) VALUES ($1, false, $2, '[]', $3)`, [
    repo,
    GOALS_GITHUB_REPO,
    new Date(PREVIEW_NOW.getTime() - 60 * MINUTE),
  ]);

  const checked = pvTime(sample.checkedAt);
  const sha = sample.sha.padEnd(40, '0');
  for (const [id, , pass, line] of sample.rows) {
    await db.query(`INSERT INTO goal_runs (repo, manifest, row_id, pass, value, "of", line, cadence, sha, at) VALUES ($1,$2,$3,$4,NULL,NULL,$5,'merge',$6,$7)`, [
      GOALS_GITHUB_REPO,
      GOALS_MANIFEST,
      id,
      pass,
      `${id} ${line}`,
      sha,
      checked,
    ]);
  }

  // The standing goals: H1 passes (its last issue is closed), H2 fails (its issue is open).
  for (const [id, , pass, line, issue] of sample.standing) {
    const at = pvTime(`${line.replace(/^.*?(\d\d\/\d\d \d\d:\d\d)$/, '$1')}:00`);
    await db.query('INSERT INTO standing_goals (repo, row_id, state, last_line, last_run_at) VALUES ($1,$2,$3,$4,$5)', [GOALS_GITHUB_REPO, id, pass ? 'passing' : 'failing', pass ? null : 'FAIL', pvTime('18/10 02:00:00')]);
    await db.query(
      `INSERT INTO standing_issues (id, repo, row_id, fingerprint, issue_number, opened_at, last_failed_at, fail_count, closed_at) VALUES ($1,$2,$3,$4,$5,$6,$6,1,$7)`,
      [uuid(`goals standing ${id}`), GOALS_GITHUB_REPO, id, uuid(`goals fingerprint ${id}`).slice(0, 12), issue ? Number(issue) : 30, at, pass ? new Date(at.getTime() + MINUTE) : null],
    );
  }

  // The loop of the page, and the loop whose probe failed.
  const l = gl.loop;
  const config = { model: l.claude.model, effort: l.claude.effort };
  const insertLoop = async (id: string, name: string, description: string) =>
    db.query(
      `INSERT INTO loops (id, name, description, prompt, cron, timezone, timeout_sec, executor_kind, executor_config, status, next_run_at,
                          run_counter, execution_counter, version, created_at, updated_at, archived_at, repo_id)
       VALUES ($1,$2,$3,$4,'0 0 1 1 *',$5,$6,'claude',$7,'stopped',NULL,0,0,1,$8,$9,NULL,$10)`,
      [id, name, description, l.prompt, l.tz, l.timeout, config, pvTime(l.created), pvTime(l.updated), repo],
    );
  await insertLoop(l.id, l.name, l.desc);
  for (const [kind, name, why] of sample.loops) {
    const id = uuid(`goals loop ${name}`);
    await insertLoop(id, name, 'A probe that failed');
    await db.query(
      `INSERT INTO loop_probes (loop_id, command, claim, release, resources, lane_env, lane_base_port, restart_policy, state, last_line, last_probe_at)
       VALUES ($1,$2,'[]','[]','[]','{}',NULL,'stop',$3,$4,$5)`,
      [id, JSON.stringify(['node', 'probe.mjs']), kind, why.replace(/^The probe stopped: /, ''), pvTime('18/10 13:30:00')],
    );
  }
  return { path, loopId: l.id, page: `/loops/${l.id}/goals` };
}

function expectOk(res: { status: number }): void {
  if (res.status >= 300) throw new Error(`test route answered ${res.status}`);
}
