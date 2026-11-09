// The oracle of the gate (G6, G7, G9, plan K11): the real composition on the test Postgres, the fake `gh`, a bare repository as origin, and no ticker.
// `runJob` runs one job with one tick, so a test reads the result of that job and not of a race. A check run must never stay pending
// or missing here: this server waits 30 s between two reads, for real.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect } from 'vitest';
import { FAKE_CLAUDE_DIR_PREFIX } from '../../server/adapters/executors/claude/test-mode-query';
import { createPgRepositories } from '../../server/adapters/postgres/repositories';
import { composeServer, type ComposedServer } from '../../server/compose';
import type { GateJob, GateStep, GateStepName } from '../../shared/domain/gate';
import { TEST_DB_URL, resetApi, testPool } from './api-kit';
import { FAKE_GH_SCRIPT } from './fake-gh-kit';
import { handOverPrompt, labelCalls, startHandOverLoop, type HandOverLoop } from './gate-handover-world';
import { createGateWorld, disposeGateSeed, GITHUB_REPO, type GateWorld, type WorldPr } from './gate-world';

const STEPS: GateStepName[] = ['scope', 'base', 'setup', 'green', 'stub', 'verify', 'ci', 'merge'];
/** A tick of the claim, of the handed-over job, and of the end of the claim, with room for the order of the services in one tick. */
const CHAIN_TICKS = 8;

export const RED_MAIN_TITLE = 'Gate: main is red';

export type GateCase = { world: GateWorld; repoId: string; mainBefore: string };
export type JobResult = { job: GateJob; steps: GateStep[] };
export type AuditResult = { exit: number | null; output: { incidents: { pr: number; why: string }[]; ratified: { pr: number; at: string }[]; merged: number } };
export type ChainResult = JobResult & { loop: HandOverLoop; claimClosed: boolean; releases: string[]; comments: string[] };

/** One path that a guarded entry matches: `**` becomes `zz/zz`, `*` becomes `zz`, a literal entry stays. */
export function sampleGuardedPath(entry: string): string {
  return entry.replaceAll('**', '\0').replaceAll('*', 'zz').replaceAll('\0', 'zz/zz');
}

/** The steps of the last attempt: a ratified job keeps the rows of its first stop before them. */
const lastAttempt = (steps: GateStep[]) => steps.slice(steps.map((row) => row.step).lastIndexOf('scope'));

export type GateApi = Awaited<ReturnType<typeof startGateApi>>;

export async function startGateApi() {
  const saved = process.env.FAKE_GH_WORLD;
  const pool = testPool();
  const server: ComposedServer = await composeServer({ databaseUrl: TEST_DB_URL, testMode: true, dbWaitMs: 5000, ghBin: FAKE_GH_SCRIPT });
  const gate = createPgRepositories(pool).gate;
  const cases: GateCase[] = [];
  const folders: string[] = [];

  const result = async (id: string): Promise<JobResult> => {
    const job = await gate.get(id);
    if (!job) throw new Error(`no gate job ${id}`);
    return { job, steps: await gate.listSteps(id) };
  };

  const prOf = (c: GateCase, pr: WorldPr) => c.world.gh.read().prs.find((row) => row.number === pr.number)!;
  const mergesOf = (c: GateCase, pr: WorldPr) => c.world.mergeCalls().filter((args) => args[2] === String(pr.number));

  const api = {
    server,
    pool,

    /** Wipes the console, and makes a repository with the gate on. */
    async newCase(): Promise<GateCase> {
      await resetApi(server);
      const world = createGateWorld();
      process.env.FAKE_GH_WORLD = world.gh.world;
      const res = await server.app.inject({ method: 'POST', url: '/api/repos', payload: { path: world.repoPath, name: `gate case ${cases.length}` } });
      if (res.statusCode !== 201) throw new Error(`POST /api/repos -> ${res.statusCode} ${res.body}`);
      const repoId = res.json().id as string;
      await gate.setRepoGate(repoId, { enabled: true, githubRepo: GITHUB_REPO, checkCommand: [] }, new Date());
      const c: GateCase = { world, repoId, mainBefore: world.bare.sha('main') };
      cases.push(c);
      return c;
    },

    /** Deletes the folders of each case. A test file calls it in `afterEach`. */
    endCases() {
      for (const c of cases.splice(0)) c.world.dispose();
      for (const dir of folders.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
    },

    /** Queues the PR by hand and runs one tick. One tick runs one job. */
    async runJob(c: GateCase, pr: WorldPr, key = '141'): Promise<JobResult> {
      c.mainBefore = c.world.bare.sha('main');
      const res = await server.app.inject({ method: 'POST', url: '/api/gate/jobs', payload: { repoId: c.repoId, prNumber: pr.number, taskKey: key } });
      if (res.statusCode !== 201) throw new Error(`POST /api/gate/jobs -> ${res.statusCode} ${res.body}`);
      await server.inspect.backgroundTick();
      return result(res.json().jobId as string);
    },

    /** Ratifies a job in `needs_ratification` and runs one tick. */
    async ratifyAndRun(c: GateCase, jobId: string): Promise<JobResult> {
      c.mainBefore = c.world.bare.sha('main');
      const res = await server.app.inject({ method: 'POST', url: `/api/gate/jobs/${jobId}/ratify` });
      if (res.statusCode !== 200) throw new Error(`POST /api/gate/jobs/${jobId}/ratify -> ${res.statusCode} ${res.body}`);
      await server.inspect.backgroundTick();
      return result(jobId);
    },

    /** The whole of G6 on the merge side: every step passed, one merge at the head that was checked, the status is a success, `main` moved. */
    expectMerged(c: GateCase, pr: WorldPr, run: JobResult) {
      const steps = lastAttempt(run.steps);
      expect(run.job.state).toBe('merged');
      expect(steps.map((row) => row.step)).toEqual(STEPS);
      expect(steps.filter((row) => row.status === 'fail')).toEqual([]);
      const calls = mergesOf(c, pr);
      expect(calls).toHaveLength(1);
      expect(calls[0]!.slice(-2)).toEqual(['--match-head-commit', pr.headSha]);
      expect(c.world.statuses(pr.headSha).at(-1)?.state).toBe('success');
      expect(prOf(c, pr).state).toBe('MERGED');
      expect(c.world.bare.sha('main')).not.toBe(c.mainBefore);
    },

    /** A refusal: the job stops at `step`, nothing merges, and the status says why. */
    expectRefused(c: GateCase, pr: WorldPr, run: JobResult, step: GateStepName) {
      // The output of the last step goes in the message: a throw in a step ends as `failed`, and only its row holds the thrown text.
      const output = `the last step: ${JSON.stringify(run.steps.at(-1) ?? null)}`;
      expect(run.job.failedStep, output).toBe(step);
      expect(run.job.state, output).toBe(step === 'scope' ? 'needs_ratification' : 'failed');
      expect(run.steps.at(-1)).toMatchObject({ step, status: 'fail' });
      expect(mergesOf(c, pr)).toEqual([]);
      expect(c.world.bare.sha('main')).toBe(c.mainBefore);
      expect(prOf(c, pr).state).toBe('OPEN');
      const last = c.world.statuses(pr.headSha).at(-1);
      expect(last?.state).toBe('failure');
      expect(last?.description.startsWith(`${step}:`)).toBe(true);
    },

    /** An open issue with the exact title of the gate, which is what a first refused PR leaves. */
    openRedIssue(c: GateCase): number {
      const url = execFileSync(process.execPath, [FAKE_GH_SCRIPT, 'issue', 'create', '--title', RED_MAIN_TITLE, '--body', 'main is red'], { env: { ...process.env, FAKE_GH_WORLD: c.world.gh.world }, encoding: 'utf8' });
      return Number(url.trim().split('/').at(-1));
    },

    /** The merge of a person or a script that goes around the gate. */
    mergeByHand(c: GateCase, pr: WorldPr) {
      execFileSync(process.execPath, [FAKE_GH_SCRIPT, 'pr', 'merge', String(pr.number), '--squash'], { env: { ...process.env, FAKE_GH_WORLD: c.world.gh.world }, stdio: ['ignore', 'pipe', 'pipe'] });
    },

    /** Runs the committed audit on the fake `gh`. */
    audit(c: GateCase): AuditResult {
      const env = { ...process.env, FAKE_GH_WORLD: c.world.gh.world, LOOPS_GH_BIN: FAKE_GH_SCRIPT };
      const run = spawnSync(process.execPath, ['scripts/merge-audit.mjs', '-R', GITHUB_REPO, '--since', '2000-01-01T00:00:00Z', '--json'], { env, encoding: 'utf8' });
      if (run.status === 2 || run.status === null) throw new Error(`merge-audit failed: ${run.status} ${run.stderr}`);
      return { exit: run.status, output: JSON.parse(run.stdout) as AuditResult['output'] };
    },

    /** A loop run ends with `PR_OPEN` on this PR, on task 141. The ticks stop when the claim of the run is closed. */
    async runChain(c: GateCase, pr: WorldPr): Promise<ChainResult> {
      const issues = c.world.gh.read();
      issues.issues.push({ number: 141, title: 'The task', body: '', state: 'OPEN', labels: [], comments: [], url: 'https://github.com/hieplam/tribe/issues/141', createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(), closedAt: null });
      writeFileSync(c.world.gh.world, JSON.stringify(issues, null, 2));

      // A run of the fake Claude needs a folder with this prefix, so the loop has its own clone of origin.
      const dir = realpathSync(mkdtempSync(join(tmpdir(), FAKE_CLAUDE_DIR_PREFIX)));
      folders.push(dir);
      execFileSync('git', ['clone', '-q', c.world.bare.bare, dir], { stdio: ['ignore', 'pipe', 'pipe'] });

      c.mainBefore = c.world.bare.sha('main');
      const loop = await startHandOverLoop(server, pool, { gate: true, dir, prompt: handOverPrompt(`https://github.com/hieplam/tribe/pull/${pr.number}`) });
      folders.push(loop.labels);
      await server.inspect.backgroundTick();
      await expect.poll(async () => (await pool.query('SELECT status FROM runs WHERE loop_id = $1', [loop.loopId])).rows[0]?.status, { timeout: 15_000 }).toBe('succeeded');

      const claim = async () => (await pool.query('SELECT gate_job_id, closed_at FROM run_claims WHERE loop_id = $1', [loop.loopId])).rows[0] as { gate_job_id: string | null; closed_at: Date | null };
      for (let tick = 0; tick < CHAIN_TICKS && (await claim()).closed_at === null; tick++) await server.inspect.backgroundTick();
      const { gate_job_id: jobId, closed_at: closedAt } = await claim();
      if (jobId === null) throw new Error('the run did not hand its claim to the gate');
      return {
        ...(await result(jobId)),
        loop,
        claimClosed: closedAt !== null,
        releases: labelCalls(loop).filter((line) => line.startsWith('["release"')),
        comments: c.world.gh.read().issues.find((row) => row.number === 141)!.comments.map((row) => row.body),
      };
    },

    async close() {
      api.endCases();
      await server.shutdown();
      await pool.end();
      disposeGateSeed();
      if (saved === undefined) delete process.env.FAKE_GH_WORLD;
      else process.env.FAKE_GH_WORLD = saved;
    },
  };
  return api;
}
