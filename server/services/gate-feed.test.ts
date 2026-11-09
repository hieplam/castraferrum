// What a gate result does to the world around the job (decisions 39 to 41): the failure comment, the settling of the claim,
// a red `main`, and the ratification. Memory repositories, the real workspace on a bare repository, `GhGitHost` on the fake `gh`.
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { FakeClaimGateway } from '../../tests/support/fake-claim-gateway';
import { GITHUB_REPO, GOOD_FILES, createGateWorld, disposeGateSeed, type WorldPr } from '../../tests/support/gate-world';
import { RandomIdGenerator } from '../adapters/ids/random-id-generator';
import { createMemoryRepositories } from '../adapters/memory';
import { DefaultGateService } from './gate-service';

const KEY = '141';
const REPO_ID = '11111111-1111-4111-8111-111111111111';
const FAILED_CHECK = { name: 'build', status: 'completed', conclusion: 'failure' };
const PENDING_CHECK = { name: 'build', status: 'in_progress', conclusion: null };
const PASSED_CHECK = { name: 'build', status: 'completed', conclusion: 'success' };
const RED_TITLE = 'Gate: main is red';
const RED_MARK = '<!-- gate:red-main -->';

const BAD_FILES = { ...GOOD_FILES, 'impl.mjs': 'export const ok = false;\n' };
/** A test file that prints `count` lines of `width` characters, then `LAST LINE 7741`, and exits 1. It sets `exitCode`, because `process.exit` on Linux drops output that a pipe has not taken yet. */
const noisy = (count: number, width: number) => ({
  ...GOOD_FILES,
  'tests/e.test.mjs': `for (let i = 0; i < ${count}; i++) console.log(String(i).padEnd(${width}, 'x'));\nconsole.log('LAST LINE 7741');\nprocess.exitCode = 1;\n`,
});

const clock = (() => {
  let ticks = 0;
  return { now: () => new Date(Date.UTC(2026, 10, 1) + ++ticks * 1000) };
})();

async function setup() {
  const world = createGateWorld();
  const repos = createMemoryRepositories();
  const gateway = new FakeClaimGateway();
  await repos.repos.insert({ id: REPO_ID, name: 'gate repo', path: world.repoPath, createdAt: clock.now() });
  await repos.gate.setRepoGate(REPO_ID, { enabled: true, githubRepo: GITHUB_REPO, checkCommand: [] }, clock.now());
  const loopId = randomUUID();
  await repos.loops.insert({
    id: loopId,
    name: 'gated loop',
    description: '',
    prompt: 'work',
    cron: '*/5 * * * *',
    timezone: 'UTC',
    repoId: REPO_ID,
    timeoutSec: 60,
    executorKind: 'mock',
    executorConfig: { durationSec: 1, failRate: 0 },
    createdAt: clock.now(),
  });
  await repos.probes.upsert(loopId, { command: ['probe'], claim: ['claim', '{key}'], release: ['release', '{key}', '{reason}'], resources: [], laneEnv: {}, laneBasePort: 7200, restartPolicy: 'resume', tokenBudget: null });
  const service = new DefaultGateService({
    gate: repos.gate,
    repos: repos.repos,
    host: world.host,
    workspace: world.workspace,
    commands: world.runner,
    clock,
    ids: new RandomIdGenerator(),
    sleep: world.sleep,
    claims: repos.claims,
    probes: repos.probes,
    gateway,
  });

  const addIssue = (number: number, over: { title?: string; body?: string; state?: 'OPEN' | 'CLOSED' } = {}) => {
    const w = world.gh.read();
    w.issues.push({
      number,
      title: over.title ?? `Task ${number}`,
      body: over.body ?? '',
      state: over.state ?? 'OPEN',
      labels: [],
      comments: [],
      url: `https://github.com/fake/repo/issues/${number}`,
      closedAt: null,
    } as never);
    writeFileSync(world.gh.world, JSON.stringify(w, null, 2));
  };
  addIssue(Number(KEY));
  const comments = (issue = Number(KEY)) => world.gh.read().issues.find((i) => i.number === issue)!.comments.map((c) => c.body);
  const redIssues = () => world.gh.read().issues.filter((i) => i.title === RED_TITLE);

  const queue = async (pr: WorldPr, taskKey = KEY) => (await service.queue({ repoId: REPO_ID, prNumber: pr.number, taskKey })).jobId!;
  /** Queues the PR, gives a claim row to the job, and runs one tick. */
  const runOwned = async (pr: WorldPr, taskKey = KEY) => {
    const jobId = await queue(pr, taskKey);
    const claimId = randomUUID();
    await repos.claims.open({ id: claimId, loopId, taskKey, runId: randomUUID(), at: clock.now() });
    await repos.claims.handOver(claimId, jobId);
    const report = await service.tick();
    return { jobId, claimId, report };
  };
  const stateOf = async (jobId: string) => (await repos.gate.get(jobId))!.state;
  const stepsOf = async (jobId: string) => (await repos.gate.listSteps(jobId)).map((s) => [s.step, s.status]);
  const row = async (claimId: string) => (await repos.claims.listOpen(loopId)).find((c) => c.id === claimId) ?? null;
  /** A commit on main whose check runs are `checks`. */
  const mainChecks = (checks: Record<string, unknown>[]) => world.setChecks(world.commitMain({ 'main-change.txt': `${randomUUID()}\n` }), checks);
  return { world, repos, gateway, service, addIssue, comments, redIssues, queue, runOwned, stateOf, stepsOf, row, mainChecks };
}

afterAll(disposeGateSeed);

const test = (name: string, body: (t: Awaited<ReturnType<typeof setup>>) => Promise<void>) =>
  it.concurrent(name, async () => {
    const t = await setup();
    try {
      await body(t);
    } finally {
      t.world.dispose();
    }
  });

describe('gate_feed', { timeout: 120_000 }, () => {
  describe('failure', () => {
    test('the comment on the task holds the step and the literal last line of the output', async ({ world, runOwned, comments }) => {
      await runOwned(world.openPr({ files: noisy(1, 5) }));
      const [comment, ...rest] = comments();
      expect(rest).toEqual([]);
      expect(comment!.startsWith('Gate failed at green.\n')).toBe(true);
      expect(comment).toContain('LAST LINE 7741');
      expect(comment!.trimEnd().endsWith('```')).toBe(true);
    });

    test('60 lines of 1000 characters keep the last line, under the 20000-character cut', async ({ world, runOwned, comments }) => {
      await runOwned(world.openPr({ files: noisy(100, 1000) }));
      const comment = comments()[0]!;
      expect(comment.length).toBeLessThan(20_000);
      expect(comment).toContain('LAST LINE 7741');
      expect(comment.trimEnd().endsWith('```')).toBe(true);
    });

    test('the next tick releases once, not excused, and closes the row', async ({ world, gateway, service, runOwned, row }) => {
      const { claimId } = await runOwned(world.openPr({ files: BAD_FILES }));
      expect(gateway.released()).toEqual([]);
      await service.tick();
      await service.tick();
      expect(gateway.released()).toEqual([{ op: 'release', key: KEY, why: { reason: 'gate: green', excused: false } }]);
      expect(await row(claimId)).toBeNull();
    });

    test('a release that fails is tried again on the next tick, with one comment', async ({ world, gateway, service, runOwned, row, comments }) => {
      const { claimId } = await runOwned(world.openPr({ files: BAD_FILES }));
      gateway.releaseError = 'gh is down';
      const failed = await service.tick();
      expect(failed.errors.map((e) => e.message)).toEqual(['gh is down']);
      expect(await row(claimId)).not.toBeNull();
      gateway.releaseError = null;
      await service.tick();
      expect(gateway.released()).toHaveLength(2);
      expect(await row(claimId)).toBeNull();
      expect(comments()).toHaveLength(1);
    });

    test('a merged job closes the row with no release', async ({ world, repos, gateway, service, runOwned, stateOf, row }) => {
      const { jobId, claimId } = await runOwned(world.openPr());
      expect(await stateOf(jobId)).toBe('merged');
      await service.tick();
      expect(gateway.released()).toEqual([]);
      expect(await row(claimId)).toBeNull();
      expect(await repos.claims.listGateOwned()).toEqual([]);
    });

    test('needs_ratification keeps the row, and the comment names the path', async ({ world, gateway, service, runOwned, stateOf, row, comments }) => {
      const pr = world.openPr({ files: { ...GOOD_FILES, 'scripts/guarded-file.mjs': 'export {};\n' } });
      const { jobId, claimId } = await runOwned(pr);
      await service.tick();
      expect(await stateOf(jobId)).toBe('needs_ratification');
      expect(await row(claimId)).not.toBeNull();
      expect(gateway.released()).toEqual([]);
      expect(comments()).toHaveLength(1);
      expect(comments()[0]).toContain('scripts/guarded-file.mjs');
      expect(comments()[0]).toContain(jobId);
      expect(world.statuses(pr.headSha).at(-1)?.description.startsWith('scope: ')).toBe(true);
    });

    test('a job queued by hand, with no claim, comments and releases nothing', async ({ world, gateway, service, queue, comments }) => {
      await queue(world.openPr({ files: BAD_FILES }));
      await service.tick();
      await service.tick();
      expect(comments()).toHaveLength(1);
      expect(gateway.calls).toEqual([]);
    });

    test('a key that is not a number gets no comment', async ({ world, runOwned }) => {
      await runOwned(world.openPr({ files: BAD_FILES }), 'plan-217');
      expect(world.gh.read().calls.filter((c) => c.args[0] === 'issue' && c.args[1] === 'comment')).toEqual([]);
    });

    test('a comment that throws goes to the errors and still releases', async ({ world, gateway, service, runOwned, row }) => {
      const { jobId, claimId, report } = await runOwned(world.openPr({ files: BAD_FILES }), '999');
      expect(report.errors).toHaveLength(1);
      expect(report.errors[0]!.loopId).toBe(jobId);
      expect(report.errors[0]!.message).toContain('gh issue');
      await service.tick();
      expect(gateway.released().map((r) => r.key)).toEqual(['999']);
      expect(await row(claimId)).toBeNull();
    });
  });

  describe('ratify', () => {
    const guarded = (files: Record<string, string> = GOOD_FILES) => ({ ...files, 'scripts/guarded-file.mjs': 'export {};\n' });

    test('control: the job takes the queue again, scope writes skip, and the PR merges', async ({ world, service, runOwned, stateOf, stepsOf, gateway }) => {
      const { jobId } = await runOwned(world.openPr({ files: guarded() }));
      expect(await service.ratify(jobId)).toMatchObject({ jobId, state: 'queued' });
      await service.tick();
      expect(await stateOf(jobId)).toBe('merged');
      expect((await stepsOf(jobId)).slice(1)).toEqual([
        ['scope', 'skip'],
        ['base', 'pass'],
        ['setup', 'pass'],
        ['green', 'pass'],
        ['stub', 'pass'],
        ['verify', 'pass'],
        ['ci', 'pass'],
        ['merge', 'pass'],
      ]);
      expect(world.mergeCalls()).toHaveLength(1);
      await service.tick();
      expect(gateway.released()).toEqual([]);
    });

    test('a failing green stays failed: ratify skips only checkScope', async ({ world, service, runOwned, stateOf, repos, comments }) => {
      const { jobId } = await runOwned(world.openPr({ files: guarded(BAD_FILES) }));
      await service.ratify(jobId);
      await service.tick();
      expect(await stateOf(jobId)).toBe('failed');
      expect((await repos.gate.get(jobId))!.failedStep).toBe('green');
      expect(world.mergeCalls()).toEqual([]);
      expect(comments().at(-1)).toContain('Gate failed at green.');
    });

    test('a moved head fails scope: the ratification holds for job.headSha only', async ({ world, service, runOwned, stateOf, repos }) => {
      const pr = world.openPr({ files: guarded() });
      const { jobId } = await runOwned(pr);
      world.commitToPr(pr, { 'later.txt': 'a later push\n' });
      await service.ratify(jobId);
      await service.tick();
      expect(await stateOf(jobId)).toBe('failed');
      expect((await repos.gate.get(jobId))!.failedStep).toBe('scope');
      expect(world.mergeCalls()).toEqual([]);
    });

    test('wrong state, an unknown id, and a live duplicate of the head are clear refusals, and nothing moves', async ({ world, service, runOwned, queue, stateOf }) => {
      const merged = await runOwned(world.openPr());
      await expect(service.ratify(merged.jobId)).rejects.toMatchObject({ code: 'GATE_JOB_NOT_RATIFIABLE' });
      await expect(service.ratify(randomUUID())).rejects.toMatchObject({ code: 'GATE_JOB_NOT_FOUND' });

      const pr = world.openPr({ files: guarded() });
      const { jobId } = await runOwned(pr);
      const duplicate = await queue(pr);
      await expect(service.ratify(jobId)).rejects.toMatchObject({ code: 'GATE_JOB_NOT_RATIFIABLE', message: expect.stringContaining('queued or running') });
      expect(await stateOf(jobId)).toBe('needs_ratification');
      expect(await stateOf(duplicate)).toBe('queued');
    });
  });

  describe('red main', () => {
    test('the first PR fails base, one issue opens, the release is excused, main is unchanged', async ({ world, gateway, service, runOwned, mainChecks, redIssues, stateOf, repos }) => {
      mainChecks([FAILED_CHECK]);
      const { jobId } = await runOwned(world.openPr());
      expect(await stateOf(jobId)).toBe('failed');
      expect((await repos.gate.get(jobId))!.failedStep).toBe('base');
      expect(redIssues()).toHaveLength(1);
      expect(redIssues()[0]!.body).toContain(RED_MARK);
      expect(redIssues()[0]!.body).toContain('build: failure');
      expect(redIssues()[0]!.labels).toEqual([]);
      expect(world.mergeCalls()).toEqual([]);
      expect(() => world.bare.show('main', 'impl.mjs')).toThrow();
      await service.tick();
      expect(gateway.released()).toEqual([{ op: 'release', key: KEY, why: { reason: 'gate: base', excused: true } }]);
    });

    test('a second PR finds the same issue and opens no other', async ({ world, runOwned, mainChecks, redIssues, stateOf, addIssue }) => {
      addIssue(142);
      mainChecks([FAILED_CHECK]);
      const first = await runOwned(world.openPr());
      const second = await runOwned(world.openPr(), '142');
      expect([await stateOf(first.jobId), await stateOf(second.jobId)]).toEqual(['failed', 'failed']);
      expect(redIssues()).toHaveLength(1);
    });

    test('an old CLOSED issue, or an OPEN issue that only names the mark, does not stop a new one', async ({ world, runOwned, mainChecks, redIssues, addIssue }) => {
      addIssue(50, { title: RED_TITLE, body: RED_MARK, state: 'CLOSED' });
      addIssue(51, { title: 'A note', body: `The issue "${RED_TITLE}" holds ${RED_MARK}` });
      mainChecks([FAILED_CHECK]);
      await runOwned(world.openPr());
      expect(redIssues().map((i) => i.state)).toEqual(['CLOSED', 'OPEN']);
    });

    test('a PR that closes the issue goes on and merges', async ({ world, runOwned, mainChecks, redIssues, stateOf }) => {
      mainChecks([FAILED_CHECK]);
      await runOwned(world.openPr());
      const fix = await runOwned(world.openPr({ closing: [redIssues()[0]!.number] }));
      expect(await stateOf(fix.jobId)).toBe('merged');
      expect(redIssues()).toHaveLength(1);
      expect(world.bare.show('main', 'impl.mjs')).toContain('ok = true');
    });

    test('pending is not red', async ({ world, runOwned, mainChecks, redIssues, stateOf }) => {
      mainChecks([PENDING_CHECK]);
      const { jobId } = await runOwned(world.openPr());
      expect(await stateOf(jobId)).toBe('merged');
      expect(redIssues()).toEqual([]);
    });

    test('green control: a passing main opens no issue', async ({ world, runOwned, mainChecks, redIssues, stateOf }) => {
      mainChecks([PASSED_CHECK]);
      const { jobId } = await runOwned(world.openPr());
      expect(await stateOf(jobId)).toBe('merged');
      expect(redIssues()).toEqual([]);
    });
  });
});
