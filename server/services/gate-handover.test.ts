// Run-end hand-over to the gate (spec 2.3, decision 47): who owns a claim when a run ends with `PR_OPEN`. Time comes only from the wound clock.
import { beforeEach, describe, expect, it } from 'vitest';
import { RESUME_LINE } from '../../shared/domain/goal-loop';
import { commandOk } from '../../tests/support/fake-command-runner';
import { flush, makeKit, MIN, T0, type Kit } from '../../tests/support/service-kit';
import { GitHostError, PullRequestNotFoundError } from '../ports/git-host';
import { DefaultGateService } from './gate-service';

const SEC = 1000;
const HOUR = 60 * MIN;
const PR = 'https://github.com/fake/repo/pull/7';
const at = (ms: number) => new Date(T0.getTime() + ms);
const take = (key: string) => JSON.stringify({ v: 1, action: 'take', tasks: [{ key }] });
const plan = (key: string) => JSON.stringify({ v: 1, action: 'plan', plan: { key, failing: ['G4'] } });
const SKIP = '{"v":1,"action":"skip"}';

let k: Kit;
beforeEach(() => {
  k = makeKit();
});

const gateOn = () => k.repos.gate.setRepoGate(k.repo.id, { enabled: true, githubRepo: 'fake/repo', checkCommand: [] }, T0);
const gateOff = () => k.repos.gate.setRepoGate(k.repo.id, { enabled: false, githubRepo: 'fake/repo', checkCommand: [] }, T0);

async function probeLoop(): Promise<string> {
  const { id } = await k.loopService.create(k.input());
  await k.probeService.save(id, { command: ['probe'], claim: ['claim', '{key}'], release: ['release', '{key}', '{reason}'] });
  await k.loopService.start(id);
  await flush();
  return id;
}

async function tickAt(ms: number) {
  k.clock.set(at(ms));
  const report = await k.probeService.tick();
  await flush();
  return report;
}

/** A loop with a running claimed run of `line`, and a probe that offers nothing more. */
async function running(line = take('141')) {
  const id = await probeLoop();
  k.commands.reply = () => commandOk(line);
  await tickAt(0);
  k.commands.reply = () => commandOk(SKIP);
  return id;
}

async function endRun(n: number, end: { result: string; pr?: string | null }) {
  k.scripted.call(n).succeedWith(end);
  await flush();
}

const claim = () => [...k.db.claims.values()][0]!;

describe('gate_handover', () => {
  it('PR_OPEN with the gate on: one queue, the gate owns the claim, and no release', async () => {
    await gateOn();
    await running();
    await endRun(1, { result: 'PR_OPEN', pr: PR });
    await tickAt(SEC);

    expect(k.gateQueue.calls).toEqual([{ repoId: k.repo.id, prNumber: 7, taskKey: '141' }]);
    expect(claim()).toMatchObject({ owner: 'gate', gateJobId: 'job-1', closedAt: null });
    expect(k.claimGateway.released()).toEqual([]);
    expect(k.claimGateway.labels).toEqual(new Set(['141']));
  });

  it('PR_OPEN with the gate off: a release, and no queue', async () => {
    await gateOff();
    await running();
    await endRun(1, { result: 'PR_OPEN', pr: PR });
    await tickAt(SEC);

    expect(k.gateQueue.calls).toEqual([]);
    expect(k.claimGateway.released()).toEqual([{ op: 'release', key: '141', why: { reason: 'run succeeded PR_OPEN', excused: false } }]);
    expect(claim()).toMatchObject({ owner: 'run', closedAt: at(SEC) });
  });

  it('gate on: the run gets CASTRAFERRUM_GATE and gateGuard', async () => {
    await gateOn();
    await running();
    expect(k.scripted.call(1).input.env).toEqual({ CASTRAFERRUM_SLOT: '0', CASTRAFERRUM_GATE: '1' });
    expect(k.scripted.call(1).input.gateGuard).toBe(true);
  });

  it('gate off: the input of the run has neither key', async () => {
    await gateOff();
    await running();
    expect(k.scripted.call(1).input.env).toEqual({ CASTRAFERRUM_SLOT: '0' });
    expect(k.scripted.call(1).input).not.toHaveProperty('gateGuard');
  });

  it('a loop with no probe: with the gate on, the input has neither key', async () => {
    await gateOn();
    const { id } = await k.loopService.create(k.input());
    await k.loopService.start(id);
    await flush();
    expect(k.scripted.call(1).input).not.toHaveProperty('env');
    expect(k.scripted.call(1).input).not.toHaveProperty('gateGuard');
  });

  it('PR_OPEN with no pull request link: a release, and no queue', async () => {
    await gateOn();
    await running();
    await endRun(1, { result: 'PR_OPEN', pr: null });
    await tickAt(SEC);

    expect(k.gateQueue.calls).toEqual([]);
    expect(k.claimGateway.released()).toHaveLength(1);
    expect(claim()).toMatchObject({ owner: 'run', closedAt: at(SEC) });
  });

  it('PR_OPEN with a pull request of another repository: a release, and no queue', async () => {
    await gateOn();
    await running();
    await endRun(1, { result: 'PR_OPEN', pr: 'https://github.com/other/repo/pull/7' });
    await tickAt(SEC);

    expect(k.gateQueue.calls).toEqual([]);
    expect(k.claimGateway.released()).toHaveLength(1);
  });

  it('queue throws: the row stays open, no try before 60 s, and one hand-over after them', async () => {
    await gateOn();
    await running();
    await endRun(1, { result: 'PR_OPEN', pr: PR });
    k.gateQueue.answer = () => {
      throw new Error('gh failed');
    };
    const failed = await tickAt(SEC);
    expect(failed.errors).toEqual([expect.objectContaining({ message: 'gh failed' })]);
    expect(claim()).toMatchObject({ owner: 'run', closedAt: null });

    await tickAt(SEC + 59 * SEC);
    expect(k.gateQueue.calls).toHaveLength(1);

    k.gateQueue.answer = null;
    await tickAt(SEC + MIN);
    expect(k.gateQueue.calls).toHaveLength(2);
    expect(claim()).toMatchObject({ owner: 'gate', gateJobId: 'job-2', closedAt: null });
    expect(k.claimGateway.released()).toEqual([]);
  });

  it('queue says the pull request does not exist: one release, not excused, with a reason that names the pull request', async () => {
    await gateOn();
    await running();
    await endRun(1, { result: 'PR_OPEN', pr: 'https://github.com/fake/repo/pull/9' });
    k.gateQueue.answer = () => {
      throw new PullRequestNotFoundError(9, 1, 'GraphQL: Could not resolve to a PullRequest with the number of 9. (repository.pullRequest)');
    };
    const report = await tickAt(SEC);
    await tickAt(SEC + MIN);
    await tickAt(SEC + 2 * MIN);

    expect(report.errors).toEqual([]);
    expect(k.gateQueue.calls).toHaveLength(1);
    expect(k.claimGateway.released()).toEqual([
      { op: 'release', key: '141', why: { reason: 'run succeeded PR_OPEN: pull request 9 does not exist', excused: false } },
    ]);
    expect(claim()).toMatchObject({ owner: 'run', closedAt: at(SEC) });
  });

  it('queue fails with a gh failure that is not a missing pull request: no release, a retry every 60 s', async () => {
    await gateOn();
    await running();
    await endRun(1, { result: 'PR_OPEN', pr: PR });
    k.gateQueue.answer = () => {
      throw new GitHostError('gh pr view failed: exit 1', 1, 'error connecting to api.github.com');
    };
    await tickAt(SEC);
    await tickAt(SEC + MIN);
    await tickAt(SEC + 2 * MIN);

    expect(k.gateQueue.calls).toHaveLength(3);
    expect(k.claimGateway.released()).toEqual([]);
    expect(claim()).toMatchObject({ owner: 'run', closedAt: null });
  });

  it('a duplicate that ended before the read gives a null job id: the same try 60 s later', async () => {
    await gateOn();
    await running();
    await endRun(1, { result: 'PR_OPEN', pr: PR });
    k.gateQueue.answer = () => ({ outcome: 'duplicate', jobId: null, headSha: 'a'.repeat(40), taskKey: '141' });
    await tickAt(SEC);
    expect(claim()).toMatchObject({ owner: 'run', closedAt: null });

    await tickAt(SEC + 59 * SEC);
    expect(k.gateQueue.calls).toHaveLength(1);

    k.gateQueue.answer = null;
    await tickAt(SEC + MIN);
    expect(claim()).toMatchObject({ owner: 'gate', gateJobId: 'job-2' });
    expect(k.claimGateway.released()).toEqual([]);
  });

  it('DONE with the gate on: a release, and no queue', async () => {
    await gateOn();
    await running();
    await endRun(1, { result: 'DONE' });
    await tickAt(SEC);

    expect(k.gateQueue.calls).toEqual([]);
    expect(k.claimGateway.released()).toEqual([{ op: 'release', key: '141', why: { reason: 'run succeeded DONE', excused: false } }]);
  });

  it('a failed run with the gate on: a release, and no queue', async () => {
    await gateOn();
    await running();
    k.scripted.call(1).fail('boom');
    await flush();
    await tickAt(SEC);

    expect(k.gateQueue.calls).toEqual([]);
    expect(k.claimGateway.released()).toEqual([{ op: 'release', key: '141', why: { reason: 'run failed', excused: false } }]);
  });

  it('a resume keeps the env and the guard of the gate', async () => {
    await gateOn();
    await running();
    k.scripted.call(1).usageLimit('limit', undefined, at(HOUR));
    await flush();
    k.clock.set(at(HOUR + MIN));
    await k.holdService.tick();
    await flush();

    expect(k.scripted.call(2).input).toMatchObject({ prompt: RESUME_LINE, resumeSessionId: 'scripted-1', gateGuard: true });
    expect(k.scripted.call(2).input.env).toEqual({ CASTRAFERRUM_SLOT: '0', CASTRAFERRUM_GATE: '1' });
  });

  it('a plan run: one queue, and no call of the claim gateway', async () => {
    await gateOn();
    await running(plan('plan-1'));
    await endRun(1, { result: 'PR_OPEN', pr: PR });
    await tickAt(SEC);

    expect(k.gateQueue.calls).toEqual([{ repoId: k.repo.id, prNumber: 7, taskKey: 'plan-1' }]);
    expect(claim()).toMatchObject({ kind: 'plan', owner: 'gate', closedAt: null });
    expect(k.claimGateway.calls).toEqual([]);
  });

  it('the next tick does nothing to a claim of the gate: 0 releases, and no second queue', async () => {
    await gateOn();
    await running();
    await endRun(1, { result: 'PR_OPEN', pr: PR });
    await tickAt(SEC);
    await tickAt(2 * MIN);

    expect(k.claimGateway.released()).toEqual([]);
    expect(k.gateQueue.calls).toHaveLength(1);
    expect(claim()).toMatchObject({ owner: 'gate', closedAt: null });
  });

  it('a failed job on a plan row closes the row, with 0 releases', async () => {
    await gateOn();
    await running(plan('plan-1'));
    await k.repos.gate.enqueue({ id: 'job-1', repoId: k.repo.id, prNumber: 7, headSha: 'a'.repeat(40), taskKey: 'plan-1', at: T0 });
    await k.repos.gate.takeNext(T0);
    await k.repos.gate.finish('job-1', { state: 'failed', failedStep: 'green', at: T0 });
    await k.repos.claims.handOver(claim().id, 'job-1');

    const gate = new DefaultGateService({
      gate: k.repos.gate,
      repos: k.repos.repos,
      host: {} as never,
      workspace: {} as never,
      commands: k.commands,
      claims: k.repos.claims,
      probes: k.repos.probes,
      gateway: k.claimGateway,
      clock: k.clock,
      ids: { newId: () => 'unused' },
      sleep: async () => {},
    });
    await gate.tick();

    expect(claim()).toMatchObject({ closeReason: 'gate: green' });
    expect(claim().closedAt).not.toBeNull();
    expect(k.claimGateway.calls).toEqual([]);
  });
});
