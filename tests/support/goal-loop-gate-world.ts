// The world of the gate pages (goal G6): the sample of `goalLoop.gate` in design/ds/preview/data.js, built for real. The repo `api` gets
// the gate (on, `acme/api`) and five jobs: 44 running with three passed steps, 45 queued, 46 needs_ratification, 43 merged, and 41 failed
// at `green` with the eight steps and the output of the sample. The pages of this world must equal the approved `gate-queue` and
// `gate-failed` shots. Z2 imports both seeds.
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type pg from 'pg';
import { createBareRepo } from './bare-repo';
import { type TestApi } from './goal-loop-score-world';
import { DS_DATA_JS, previewData, pvTime, PREVIEW_NOW, repoId, seedPreviewWorld, uuid } from './preview-world';

type SampleJob = { state: string; pr: number; title: string; task: string; step?: string; at: string };
type Sample = {
  jobs: SampleJob[];
  record: SampleJob[];
  failed: { pr: number; title: string; task: string; sha: string; step: string; exit: number; at: string; steps: [string, string, number | null][]; output: string[] };
};

/** The id of the gate job of the sample for a pull request number. */
export const gateJobId = (pr: number): string => uuid(`gate job ${pr}`);

/** The head commit of a sample job: 40 hex characters, and for the failed job the short sha that the page shows. */
const headOf = (pr: number, sha?: string): string => (sha ?? `${pr}`.padStart(7, 'b')).padEnd(40, '0');

const MINUTE = 60_000;
const GITHUB_REPO = 'acme/api';

/**
 * A git repository in a temp folder whose `origin` is a LOCAL bare repository. No test reaches the network: a real address as origin makes
 * every `git fetch` of the gate tick or the goal-card tick open a credential window on the machine. The row `repo_gate` still says
 * `acme/api`, which is what the pages show.
 */
function makeOriginRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'lc-gate-repo-'));
  const origin = createBareRepo();
  execFileSync('git', ['init', '-q'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['remote', 'add', 'origin', origin.bare], { cwd: dir, stdio: 'ignore' });
  return dir;
}

async function insertJob(db: pg.Pool, repo: string, j: SampleJob, sha?: string): Promise<void> {
  const when = pvTime(j.at);
  const earlier = (min: number) => new Date(when.getTime() - min * MINUTE);
  const live = j.state === 'running' || j.state === 'queued';
  const queuedAt = j.state === 'queued' ? when : earlier(10);
  const startedAt = j.state === 'queued' ? null : j.state === 'running' ? when : earlier(5);
  const finishedAt = live ? null : when;
  await db.query(
    `INSERT INTO gate_jobs (id, repo_id, pr_number, head_sha, task_key, title, state, failed_step, queued_at, started_at, finished_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [gateJobId(j.pr), repo, j.pr, headOf(j.pr, sha), j.task, j.title, j.state, j.state === 'failed' || j.state === 'needs_ratification' ? (j.step ?? 'scope') : null, queuedAt, startedAt, finishedAt],
  );
}

async function insertStep(db: pg.Pool, pr: number, seq: number, step: string, status: string, ms: number, exitCode: number | null, outputTail: string): Promise<void> {
  await db.query('INSERT INTO gate_steps (job_id, seq, step, status, exit_code, ms, output_tail) VALUES ($1, $2, $3, $4, $5, $6, $7)', [gateJobId(pr), seq, step, status, exitCode, ms, outputTail]);
}

/**
 * Resets the console, sets its clock to `PREVIEW_NOW`, seeds the world of the preview, turns the gate of the repo `api` on, then inserts
 * the jobs of the sample. It returns the folder of the repo `api`, a git repository with the origin `acme/api`.
 */
async function seedGate(sp: TestApi, db: pg.Pool): Promise<{ path: string }> {
  expectOk(await sp.api('POST', '/api/__test/reset'));
  expectOk(await sp.api('POST', '/api/__test/clock', { at: PREVIEW_NOW.toISOString() }));
  await seedPreviewWorld(db, {}, DS_DATA_JS);
  const sample = (previewData(DS_DATA_JS) as unknown as { goalLoop: { gate: Sample } }).goalLoop.gate;
  const repo = repoId('api', DS_DATA_JS);
  const path = makeOriginRepo();
  await db.query('UPDATE repos SET path = $1 WHERE id = $2', [path, repo]);
  await db.query(
    `INSERT INTO repo_gate (repo_id, enabled, github_repo, check_command, updated_at) VALUES ($1, true, $2, '[]', $3)`,
    [repo, GITHUB_REPO, new Date(PREVIEW_NOW.getTime() - 60 * MINUTE)],
  );
  const failed = sample.failed;
  for (const j of [...sample.jobs, ...sample.record]) {
    if (j.pr === failed.pr) await insertJob(db, repo, { ...j, step: failed.step }, failed.sha);
    else await insertJob(db, repo, j);
  }
  // Job 44 runs: its first three steps passed, so the page shows `green` as its step.
  const running = sample.jobs.find((j) => j.state === 'running')!;
  for (const [i, [name, ms]] of (
    [
      ['scope', 4],
      ['base', 812],
      ['setup', 41_200],
    ] as [string, number][]
  ).entries()) {
    await insertStep(db, running.pr, i + 1, name, 'pass', ms, 0, '');
  }
  // Job 41 failed: the eight steps, with the output of the sample on the failed one.
  for (const [i, [name, status, ms]] of failed.steps.entries()) {
    const isFailed = name === failed.step;
    await insertStep(db, failed.pr, i + 1, name, status, ms ?? 0, status === 'skip' ? null : isFailed ? failed.exit : 0, isFailed ? failed.output.join('\n') : '');
  }
  return { path };
}

/** The world of the `gate-queue` shots. */
export const seedGateQueue = (sp: TestApi, db: pg.Pool): Promise<{ path: string }> => seedGate(sp, db);

/** The world of the `gate-failed` shots: the page of job 41 is `/repos/<repo api>/gate/jobs/<gateJobId(41)>`. */
export const seedGateFailed = (sp: TestApi, db: pg.Pool): Promise<{ path: string }> => seedGate(sp, db);

function expectOk(res: { status: number }): void {
  if (res.status >= 300) throw new Error(`test route answered ${res.status}`);
}
