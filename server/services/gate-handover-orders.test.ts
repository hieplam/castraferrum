// Each order of events around the hand-over of decision 47, with the real `GateService.queue`: a restart, a job that ends first, a setting that changes between two tries.
// A restart is a new kit on the same memory database, so nothing that lived in a service survives.
import { beforeEach, describe, expect, it } from 'vitest';
import { commandOk } from '../../tests/support/fake-command-runner';
import { flush, makeKit, MIN, T0, type Kit } from '../../tests/support/service-kit';
import { DefaultGateService } from './gate-service';

const SEC = 1000;
const HOUR = 60 * MIN;
const HEAD = 'a'.repeat(40);
const PR = 'https://github.com/fake/repo/pull/7';
const at = (ms: number) => new Date(T0.getTime() + ms);
const take = (key: string) => JSON.stringify({ v: 1, action: 'take', tasks: [{ key }] });
const SKIP = '{"v":1,"action":"skip"}';

let k: Kit;
beforeEach(() => {
  k = makeKit();
  useRealQueue(k);
});

function realGate(kit: Kit) {
  return new DefaultGateService({
    gate: kit.repos.gate,
    repos: kit.repos.repos,
    host: { pullRequest: async () => ({ headSha: HEAD, closingIssues: [141] }) } as never,
    workspace: {} as never,
    commands: kit.commands,
    claims: kit.repos.claims,
    probes: kit.repos.probes,
    gateway: kit.claimGateway,
    clock: kit.clock,
    ids: { newId: () => crypto.randomUUID() },
    sleep: async () => {},
  });
}

function useRealQueue(kit: Kit) {
  const gate = realGate(kit);
  kit.gateQueue.answer = (input) => gate.queue(input);
}

/** A new process on the same database: the start-up recovery, then the first tick of the new services. */
async function restart(): Promise<void> {
  k = makeKit({ db: k.db, clock: k.clock });
  useRealQueue(k);
  k.commands.reply = () => commandOk(SKIP);
  await k.recovery.recover();
  await k.repos.gate.requeueRunning(k.clock.now());
}

const gateSetting = (enabled: boolean) => k.repos.gate.setRepoGate(k.repo.id, { enabled, githubRepo: 'fake/repo', checkCommand: [] }, T0);

async function tickAt(ms: number) {
  k.clock.set(at(ms));
  const report = await k.probeService.tick();
  await flush();
  return report;
}

async function runningTask(): Promise<string> {
  const { id } = await k.loopService.create(k.input());
  await k.probeService.save(id, { command: ['probe'], claim: ['claim', '{key}'], release: ['release', '{key}', '{reason}'] });
  await k.loopService.start(id);
  await flush();
  k.commands.reply = () => commandOk(take('141'));
  await tickAt(0);
  k.commands.reply = () => commandOk(SKIP);
  return id;
}

async function endRun(pr: string | null = PR, n = 1) {
  k.scripted.call(n).succeedWith({ result: 'PR_OPEN', pr });
  await flush();
}

const claim = () => [...k.db.claims.values()][0]!;
const jobs = () => [...k.db.gateJobs.values()];

/** Runs the only queued job to its end by hand, as the gate tick does. */
async function endJob(state: 'merged' | 'failed' | 'needs_ratification', failedStep: 'ci' | 'scope' | null) {
  const job = await k.repos.gate.takeNext(k.clock.now());
  await k.repos.gate.finish(job!.id, { state, failedStep, at: k.clock.now() });
  return job!;
}

describe('gate_handover orders', () => {
  it('a restart between the end of the run and the tick: the first tick of the new process hands over', async () => {
    await gateSetting(true);
    await runningTask();
    await endRun();
    await restart();
    await tickAt(SEC);

    expect(jobs()).toHaveLength(1);
    expect(claim()).toMatchObject({ owner: 'gate', gateJobId: jobs()[0]!.id, closedAt: null });
    expect(k.claimGateway.released()).toEqual([]);
  });

  it('control: a restart while the run lives gives an excused release, and no job, with the gate on', async () => {
    await gateSetting(true);
    await runningTask();
    await restart();
    await tickAt(SEC);

    expect(jobs()).toEqual([]);
    expect(k.claimGateway.released()).toEqual([expect.objectContaining({ key: '141', why: { reason: 'run interrupted', excused: true } })]);
  });

  it('a restart between `queue` and `handOver`: the new process takes the live job, and no second job exists', async () => {
    await gateSetting(true);
    await runningTask();
    await endRun();
    await k.gateQueue.queue({ repoId: k.repo.id, prNumber: 7, taskKey: '141' });
    const [job] = jobs();
    await restart();
    await tickAt(SEC);

    expect(jobs()).toHaveLength(1);
    expect(claim()).toMatchObject({ owner: 'gate', gateJobId: job!.id });
    expect(k.claimGateway.released()).toEqual([]);
  });

  it('a restart with the first job merged before the tick: a new job takes the claim, and its merge closes the row with no release', async () => {
    await gateSetting(true);
    await runningTask();
    await endRun();
    await k.gateQueue.queue({ repoId: k.repo.id, prNumber: 7, taskKey: '141' });
    await endJob('merged', null);
    await restart();
    await tickAt(SEC);
    expect(jobs()).toHaveLength(2);
    expect(claim()).toMatchObject({ owner: 'gate', closedAt: null });

    await endJob('merged', null);
    await realGate(k).tick();
    expect(claim()).toMatchObject({ closeReason: 'gate: merged' });
    expect(k.claimGateway.released()).toEqual([]);
  });

  it('a job that fails before the row is handed over: the settle step releases one time', async () => {
    await gateSetting(true);
    await runningTask();
    await endRun();
    k.gateQueue.answer = async (input) => {
      const queued = await realGate(k).queue(input);
      await endJob('failed', 'ci');
      return queued;
    };
    await tickAt(SEC);
    expect(claim()).toMatchObject({ owner: 'gate', closedAt: null });
    expect(k.claimGateway.released()).toEqual([]);

    await realGate(k).tick();
    await realGate(k).tick();
    await tickAt(2 * MIN);
    expect(k.claimGateway.released()).toEqual([expect.objectContaining({ key: '141', why: { reason: 'gate: ci', excused: false } })]);
    expect(claim()).toMatchObject({ closeReason: 'gate: ci' });
  });

  it('a failed release of the gate stays with the gate: the probe tick does not take the row back', async () => {
    await gateSetting(true);
    await runningTask();
    await endRun();
    await tickAt(SEC);
    await endJob('failed', 'ci');
    k.claimGateway.releaseError = 'gh failed';
    await realGate(k).tick();
    await tickAt(2 * MIN);
    expect(claim()).toMatchObject({ owner: 'gate', closedAt: null });

    k.claimGateway.releaseError = null;
    await realGate(k).tick();
    expect(claim()).toMatchObject({ closeReason: 'gate: ci' });
    expect(k.claimGateway.labels.size).toBe(0);
  });

  it('a job that waits for a ratification keeps the row open, and the label stays', async () => {
    await gateSetting(true);
    await runningTask();
    await endRun();
    await tickAt(SEC);
    await endJob('needs_ratification', 'scope');
    await realGate(k).tick();
    await tickAt(2 * MIN);

    expect(claim()).toMatchObject({ owner: 'gate', closedAt: null });
    expect(k.claimGateway.released()).toEqual([]);
    expect(k.claimGateway.labels).toEqual(new Set(['141']));
  });

  it('the gate is turned off between a failed try and the next: the next try releases, so no label stays', async () => {
    await gateSetting(true);
    await runningTask();
    await endRun();
    k.gateQueue.answer = () => {
      throw new Error('gh failed');
    };
    await tickAt(SEC);
    await gateSetting(false);
    await tickAt(SEC + MIN);

    expect(k.claimGateway.released()).toEqual([expect.objectContaining({ key: '141', why: { reason: 'run succeeded PR_OPEN', excused: false } })]);
    expect(k.claimGateway.labels.size).toBe(0);
    expect(claim().closedAt).not.toBeNull();
  });

  it('a failed read of the setting at the end of a run: no release, and a try 60 s later', async () => {
    await gateSetting(true);
    await runningTask();
    await endRun();
    const read = k.repos.gate.getRepoGate.bind(k.repos.gate);
    k.repos.gate.getRepoGate = async () => {
      throw new Error('db down');
    };
    await tickAt(SEC);
    expect(k.claimGateway.released()).toEqual([]);
    expect(claim()).toMatchObject({ owner: 'run', closedAt: null });

    k.repos.gate.getRepoGate = read;
    await tickAt(SEC + MIN);
    expect(claim()).toMatchObject({ owner: 'gate', closedAt: null });
  });

  it('a stopped loop still hands over: the Stop comes after the end of the run', async () => {
    await gateSetting(true);
    const id = await runningTask();
    await endRun();
    await k.loopService.stop(id);
    await tickAt(SEC);

    expect(claim()).toMatchObject({ owner: 'gate', closedAt: null });
    expect(k.claimGateway.released()).toEqual([]);
  });

  it('a held run that resumes and ends with PR_OPEN hands over, and a held run hands over nothing before that', async () => {
    await gateSetting(true);
    await runningTask();
    k.scripted.call(1).usageLimit('limit', undefined, at(HOUR));
    await flush();
    await tickAt(MIN);
    expect(jobs()).toEqual([]);

    k.clock.set(at(HOUR + MIN));
    await k.holdService.tick();
    await flush();
    await endRun(PR, 2);
    await tickAt(HOUR + 2 * MIN);

    expect(claim()).toMatchObject({ owner: 'gate', closedAt: null });
    expect(k.claimGateway.released()).toEqual([]);
  });

  it('a failed read of the setting at a resume: the run stays held, and the next tick resumes it with the guard', async () => {
    await gateSetting(true);
    await runningTask();
    k.scripted.call(1).usageLimit('limit', undefined, at(HOUR));
    await flush();
    const read = k.repos.gate.getRepoGate.bind(k.repos.gate);
    k.repos.gate.getRepoGate = async () => {
      throw new Error('db down');
    };
    k.clock.set(at(HOUR + MIN));
    const report = await k.holdService.tick();
    expect(report.errors).toEqual([expect.objectContaining({ message: 'db down' })]);
    expect([...k.db.runs.values()][0]).toMatchObject({ status: 'held' });

    k.repos.gate.getRepoGate = read;
    await k.holdService.tick();
    await flush();
    expect(k.scripted.call(2).input.gateGuard).toBe(true);
  });

  it('a failed read of the setting before a take: no claim, no run', async () => {
    await gateSetting(true);
    const { id } = await k.loopService.create(k.input());
    await k.probeService.save(id, { command: ['probe'], claim: ['claim', '{key}'], release: ['release', '{key}', '{reason}'] });
    await k.loopService.start(id);
    await flush();
    k.commands.reply = () => commandOk(take('141'));
    k.repos.gate.getRepoGate = async () => {
      throw new Error('db down');
    };
    const report = await tickAt(0);

    expect(report.errors).toEqual([expect.objectContaining({ message: 'db down' })]);
    expect(k.claimGateway.claimed()).toEqual([]);
    expect([...k.db.claims.values()]).toEqual([]);
    expect(k.scripted.calls).toEqual([]);
  });

  it('the repository name in the link may differ in case: the hand-over takes it', async () => {
    await gateSetting(true);
    await runningTask();
    await endRun('https://GitHub.com/Fake/Repo/pull/7');
    await tickAt(SEC);
    expect(k.gateQueue.calls).toEqual([{ repoId: k.repo.id, prNumber: 7, taskKey: '141' }]);
  });
});
