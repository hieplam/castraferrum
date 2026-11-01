// Holds (spec 2.5, decisions 26, 27, 28, 43, 44, 45): a usage limit pauses a run with its session, and the run goes on with no person. Time comes only from
// the wound clock, so no test waits on the wall clock. The labels sit in the fake gateway, and the executor is scripted.
import { beforeEach, describe, expect, it } from 'vitest';
import { laneEnvOf, RESUME_LINE, type ProbeResource } from '../../shared/domain/goal-loop';
import { commandOk } from '../../tests/support/fake-command-runner';
import { flush, makeKit, MIN, T0, type Kit } from '../../tests/support/service-kit';
import { OffsetClock } from '../adapters/clock/offset-clock';

const SEC = 1000;
const HOUR = 60 * MIN;
const at = (ms: number) => new Date(T0.getTime() + ms);
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
type Task = string | { key: string; resources: string[] };
const take = (tasks: Task[]) => JSON.stringify({ v: 1, action: 'take', tasks: tasks.map((t) => (typeof t === 'string' ? { key: t } : t)) });
const SKIP = '{"v":1,"action":"skip"}';
const CHECK_DOWN = { exitCode: 1, stdout: '', stderr: 'down', timedOut: false, error: null };
const LIMIT = "You've hit your limit";

let k: Kit;
beforeEach(() => {
  k = makeKit();
});

type LoopOver = Parameters<Kit['input']>[0];
type LaneOver = { resources?: ProbeResource[]; laneEnv?: Record<string, string>; laneBasePort?: number };

async function probeLoop(over: LoopOver = {}, probe: LaneOver = {}): Promise<string> {
  const { id } = await k.loopService.create(k.input(over));
  await k.probeService.save(id, { command: ['probe'], claim: ['claim', '{key}'], release: ['release', '{key}', '{reason}'], ...probe });
  await k.loopService.start(id);
  await flush();
  return id;
}

/** The answer of the next probe calls. A command that is not the probe is a resource check, and the check says down. */
function offer(...tasks: Task[]) {
  k.commands.reply = (req) => (req.argv[0] === 'probe' ? commandOk(tasks.length ? take(tasks) : SKIP) : CHECK_DOWN);
}

async function probeTick(ms: number) {
  k.clock.set(at(ms));
  const report = await k.probeService.tick();
  await flush();
  return report;
}

async function holdTick(ms: number) {
  k.clock.set(at(ms));
  const report = await k.holdService.tick();
  await flush();
  return report;
}

const runs = () => [...k.db.runs.values()].sort((a, b) => (a.iteration ?? 0) - (b.iteration ?? 0));
const openHolds = () => k.repos.holds.listOpen();
const openClaims = () => [...k.db.claims.values()].filter((c) => c.closedAt === null);
const unread = () => k.repos.notices.listUnread(100);
const resumedSessions = () => k.scripted.calls.flatMap((c) => (c.input.resumeSessionId ? [c.input.resumeSessionId] : []));

/** One loop with `n` lanes and `n` running tasks, started one minute apart, so the order of the runs is known. */
async function runningTasks(n: number, over: LoopOver = {}): Promise<string> {
  const id = await probeLoop({ maxConcurrent: n, ...over });
  for (let i = 0; i < n; i++) {
    offer(`t${i}`);
    await probeTick(i * MIN); // one minute: a probe is due each 60 s
  }
  offer();
  return id;
}

/** `n` runs, all held on one limit that ends at `resetsAt`. */
async function heldRuns(n: number, resetsAt: Date | null = null, costUsd?: number): Promise<string> {
  const id = await runningTasks(n);
  k.clock.set(at(0)); // the hold opens at T0, so each time in a test is a time from the hold
  for (let i = 1; i <= n; i++) k.scripted.call(i).usageLimit(LIMIT, costUsd, resetsAt);
  await flush();
  expect(runs().map((r) => r.status)).toEqual(Array(n).fill('held'));
  return id;
}

describe('a usage limit on a probe loop', () => {
  it('held: the run keeps its session, has no process and no end time, and its claim stays open', async () => {
    await runningTasks(1);
    k.scripted.call(1).usageLimit(LIMIT, 0.25, at(HOUR));
    await flush();

    const [run] = runs();
    expect(run).toMatchObject({ status: 'held', sessionId: 'scripted-1', finishedAt: null, costUsd: 0.25, error: null });
    expect(k.active.size()).toBe(0);
    expect(k.eventsOf('run.finished')).toEqual([]);
    expect(k.eventsOf('loop.updated').at(-1)).toMatchObject({ loopId: run!.loopId });
    expect((await k.loopService.get(run!.loopId)).lastRun).toBeNull(); // a held run has no result yet

    await probeTick(5 * SEC); // the orphan step reads the claim
    expect(openClaims().map((c) => c.taskKey)).toEqual(['t0']);
    expect(k.claimGateway.released()).toEqual([]);
    expect(k.claimGateway.labels).toEqual(new Set(['t0']));
  });

  it('one cause: two runs at one limit give one hold and one notice, and the later reset is kept', async () => {
    await runningTasks(2);
    k.scripted.call(1).usageLimit('limit one', undefined, at(HOUR));
    await flush();
    k.scripted.call(2).usageLimit('limit two', undefined, at(2 * HOUR));
    await flush();

    expect(await openHolds()).toEqual([expect.objectContaining({ resource: 'plan-window', reason: 'limit one', until: at(2 * HOUR), openedByRunId: runs()[0]!.id })]);
    expect(await unread()).toEqual([
      expect.objectContaining({ dedupeKey: 'hold:plan-window', kind: 'hold', loopId: null, messageKey: 'notice.hold', params: { reason: 'limit one' } }),
    ]);
  });

  it('plan-window: no probe is called in a hold, the state is stored once with the last line unchanged, and orphans are still released', async () => {
    const id = await probeLoop({ maxConcurrent: 2 });
    const other = await probeLoop();
    offer('a');
    await probeTick(0);
    const line = (await k.repos.probes.get(id))!.lastLine;
    expect(line).not.toBeNull();
    k.scripted.call(1).usageLimit(LIMIT, undefined, at(HOUR));
    await flush();
    await k.repos.claims.open({ id: uuid(1), loopId: id, taskKey: 'gone', runId: uuid(2), at: at(0) });

    const calls = k.commands.calls.length;
    const stored: string[] = [];
    const record = k.repos.probes.record.bind(k.repos.probes);
    k.repos.probes.record = async (loopId, result) => {
      stored.push(loopId);
      return record(loopId, result);
    };
    await probeTick(2 * MIN);
    await probeTick(4 * MIN);

    expect(k.commands.calls).toHaveLength(calls);
    expect(stored.sort()).toEqual([id, other].sort());
    expect(await k.repos.probes.get(id)).toMatchObject({ state: 'held', lastLine: line });
    expect(k.claimGateway.released().map((c) => c.key)).toEqual(['gone']);
  });

  it('a named hold stops only the tasks that list it: the other task runs', async () => {
    await probeLoop({ maxConcurrent: 2 });
    await k.repos.holds.open({ id: uuid(3), resource: 'docker', reason: 'docker is down', openedAt: at(0), until: null, openedByRunId: null });
    offer({ key: 'needs-docker', resources: ['docker'] }, { key: 'plain', resources: ['ssh'] });
    await probeTick(0);

    expect(runs().map((r) => r.taskKey)).toEqual(['plain']);
    expect(k.claimGateway.claimed()).toEqual(['plain']);
  });

  it('control: a loop with no probe writes failed with the message, opens no hold and sends no notice', async () => {
    const { id } = await k.loopService.create(k.input());
    await k.loopService.start(id);
    await flush();
    k.scripted.call(1).usageLimit(LIMIT, 0.25, at(HOUR));
    await flush();

    expect(runs()).toEqual([expect.objectContaining({ status: 'failed', error: LIMIT, costUsd: 0.25, endResult: null })]);
    expect(k.eventsOf('run.finished')).toHaveLength(1);
    expect(k.db.notices.size).toBe(0);
    expect(k.scripted.calls).toHaveLength(1);
  });

  it('no session id: the run writes failed with USAGE_LIMIT, the hold opens, and the release is excused (decision 26)', async () => {
    k.scripted.autoSession = false;
    await runningTasks(1);
    k.scripted.call(1).usageLimit(LIMIT);
    await flush();

    expect(runs()).toEqual([expect.objectContaining({ status: 'failed', endResult: 'USAGE_LIMIT', error: LIMIT, sessionId: null })]);
    expect((await openHolds()).map((h) => h.resource)).toEqual(['plan-window']);

    await probeTick(5 * SEC);
    expect(k.claimGateway.released()).toEqual([expect.objectContaining({ key: 't0', why: { reason: 'run failed USAGE_LIMIT', excused: true } })]);
  });
});

describe('the resume after the reset', () => {
  it('stays held at until + 59 s, and at until + 60 s the hold closes and the same sessions resume, oldest first', async () => {
    await heldRuns(2, at(HOUR));
    await holdTick(HOUR + 59 * SEC);
    expect(k.scripted.calls).toHaveLength(2);
    expect(await openHolds()).toHaveLength(1);

    await holdTick(HOUR + 60 * SEC);
    expect(await openHolds()).toEqual([]);
    expect(resumedSessions()).toEqual(['scripted-1', 'scripted-2']);
    expect(runs().map((r) => r.status)).toEqual(['running', 'running']);

    k.scripted.call(3).succeed('same session');
    k.scripted.call(4).succeed('same session');
    await flush();
    expect(runs()).toEqual([
      expect.objectContaining({ status: 'succeeded', sessionId: 'scripted-1', iteration: 1 }),
      expect.objectContaining({ status: 'succeeded', sessionId: 'scripted-2', iteration: 2 }),
    ]);
  });

  it('a resume sends RESUME_LINE word for word, sets a new deadline, counts one resume and gives the env of the lane', async () => {
    const id = await probeLoop({ timeoutSec: 1800 }, { laneEnv: { LANE_PORT: '{port}' }, laneBasePort: 7100 });
    offer('141');
    await probeTick(0);
    k.scripted.call(1).usageLimit(LIMIT, undefined, at(HOUR));
    await flush();
    await holdTick(HOUR + MIN);

    expect(k.scripted.call(2).input).toMatchObject({ prompt: RESUME_LINE, resumeSessionId: 'scripted-1', iteration: 1, env: { CASTRAFERRUM_SLOT: '0', LANE_PORT: '7100' } });
    expect(k.scripted.call(2).input.env).toEqual(laneEnvOf((await k.repos.probes.get(id))!, 0));
    expect(runs()[0]).toMatchObject({ status: 'running', deadlineAt: at(HOUR + MIN + 1800 * SEC), resumeCount: 1 });
    expect(runs()[0]!.promptSnapshot).not.toContain(RESUME_LINE);
  });

  it('cost: a limit with no cost keeps the stored cost, and the cost of a resumed run replaces it', async () => {
    await heldRuns(1, at(HOUR), 0.4);
    await holdTick(HOUR + MIN);
    k.scripted.call(2).usageLimit('again', undefined, at(2 * HOUR));
    await flush();
    expect(runs()[0]).toMatchObject({ status: 'held', costUsd: 0.4 });

    await holdTick(2 * HOUR + MIN);
    k.scripted.call(3).succeed('done', 0.9);
    await flush();
    expect(runs()[0]).toMatchObject({ status: 'succeeded', costUsd: 0.9 });
  });

  it('cost: a resumed run whose result has no cost, or that throws, keeps the stored cost', async () => {
    await heldRuns(2, at(HOUR), 0.4);
    await holdTick(HOUR + MIN);
    k.scripted.call(3).succeed();
    k.scripted.call(4).throw('boom');
    await flush();
    expect(runs()).toEqual([
      expect.objectContaining({ status: 'succeeded', costUsd: 0.4 }),
      expect.objectContaining({ status: 'failed', error: 'boom', costUsd: 0.4 }),
    ]);
  });
});

describe('a hold with no end (decision 27, 44)', () => {
  it('trial: at 30 minutes only the oldest held run resumes, and the notice says that the end is not known', async () => {
    await heldRuns(2, null);
    expect(await openHolds()).toEqual([expect.objectContaining({ resource: 'plan-window', until: null })]);
    expect((await unread()).map((n) => n.messageKey)).toEqual(['notice.holdNoEnd']);

    await holdTick(30 * MIN - SEC);
    expect(resumedSessions()).toEqual([]);

    await holdTick(30 * MIN);
    expect(resumedSessions()).toEqual(['scripted-1']);
    expect(k.scripted.call(3).input.prompt).toBe(RESUME_LINE);
    expect(await openHolds()).toEqual([expect.objectContaining({ checkedAt: at(30 * MIN), trialRunId: runs()[0]!.id })]);
    expect(runs().map((r) => r.status)).toEqual(['running', 'held']);
  });

  it('trial: a new usage_limit keeps the hold with no second notice, and the next trial comes 30 minutes later', async () => {
    await heldRuns(2, null);
    await holdTick(30 * MIN);
    k.scripted.call(3).usageLimit(LIMIT);
    await flush();
    expect(runs().map((r) => r.status)).toEqual(['held', 'held']);
    expect(await openHolds()).toHaveLength(1);
    expect(await unread()).toHaveLength(1);

    await holdTick(60 * MIN - SEC);
    expect(k.scripted.calls).toHaveLength(3);
    await holdTick(60 * MIN);
    expect(resumedSessions()).toEqual(['scripted-1', 'scripted-1']);
  });

  it('trial: any other end closes the hold at once and resumes the other runs', async () => {
    await heldRuns(2, null);
    await holdTick(30 * MIN);
    k.scripted.call(3).succeed();
    await flush();

    await holdTick(30 * MIN + SEC);
    expect(await openHolds()).toEqual([]);
    expect(resumedSessions()).toEqual(['scripted-1', 'scripted-2']);
  });

  it('trial: while the trial runs the tick waits, also past the next 30 minutes', async () => {
    await heldRuns(2, null);
    await holdTick(30 * MIN);
    await holdTick(61 * MIN);
    expect(k.scripted.calls).toHaveLength(3);
    expect(await openHolds()).toEqual([expect.objectContaining({ checkedAt: at(30 * MIN) })]);
  });

  it('trial: with no held run at 30 minutes the hold closes, because no trial can ever come', async () => {
    await probeLoop();
    k.commands.reply = () => commandOk('{"v":1,"action":"hold","resource":"plan-window","reason":"the window is closed"}');
    await probeTick(0);
    expect(await openHolds()).toHaveLength(1);

    await holdTick(30 * MIN - SEC);
    expect(await openHolds()).toHaveLength(1);
    await holdTick(30 * MIN);
    expect(await openHolds()).toEqual([]);
  });

  it('raiseUntil: a limit with a known reset replaces a stored null, and a later limit with null keeps it', async () => {
    await runningTasks(3);
    k.scripted.call(1).usageLimit(LIMIT);
    await flush();
    k.scripted.call(2).usageLimit(LIMIT, undefined, at(HOUR));
    await flush();
    expect(await openHolds()).toEqual([expect.objectContaining({ until: at(HOUR) })]);
    k.scripted.call(3).usageLimit(LIMIT);
    await flush();
    expect(await openHolds()).toEqual([expect.objectContaining({ until: at(HOUR) })]);
    expect((await unread()).map((n) => n.messageKey)).toEqual(['notice.holdNoEnd']);
  });

  it('a resetsAt at or before now counts as null: no timer closes the hold', async () => {
    await runningTasks(1);
    k.clock.set(at(5 * MIN));
    k.scripted.call(1).usageLimit(LIMIT, undefined, at(5 * MIN));
    await flush();
    expect(await openHolds()).toEqual([expect.objectContaining({ until: null, openedAt: at(5 * MIN) })]);
    expect((await unread()).map((n) => n.messageKey)).toEqual(['notice.holdNoEnd']);

    await holdTick(6 * MIN);
    expect(runs()[0]).toMatchObject({ status: 'held' });
  });
});

describe('a held run has no process', () => {
  it('Stop cancels a held run, keeps its cost, and the next tick ends its claim', async () => {
    const id = await heldRuns(2, at(HOUR), 0.4);
    await k.loopService.stop(id);

    expect(runs()).toEqual([
      expect.objectContaining({ status: 'cancelled', costUsd: 0.4, finishedAt: at(0) }),
      expect.objectContaining({ status: 'cancelled', costUsd: 0.4, finishedAt: at(0) }),
    ]);
    expect(k.eventsOf('run.finished')).toHaveLength(2);
    await probeTick(2 * SEC);
    expect(openClaims()).toEqual([]);
    await holdTick(HOUR + MIN);
    expect(resumedSessions()).toEqual([]);
  });

  it('a held run keeps its lane and its slot: the next task gets the free slot, and a full loop calls no probe', async () => {
    await runningTasks(1, { maxConcurrent: 2 });
    k.scripted.call(1).usageLimit('window', undefined, at(HOUR));
    await flush();
    await k.repos.holds.close((await openHolds())[0]!.id, at(SEC)); // the run stays held, with no hold to stop the probe
    offer('next', 'third');
    await probeTick(2 * MIN);

    expect(runs().map((r) => [r.taskKey, r.slot, r.status])).toEqual([
      ['t0', 0, 'held'],
      ['next', 1, 'running'],
    ]);
    const calls = k.commands.calls.length;
    await probeTick(4 * MIN);
    expect(k.commands.calls).toHaveLength(calls);
  });
});

describe('named holds', () => {
  const docker: ProbeResource = { name: 'docker', check: ['docker', 'ps'], everySec: 120 };

  it('a passing check clears the hold at everySec, and the check runs at no other time', async () => {
    await probeLoop({}, { resources: [docker] });
    await k.repos.holds.open({ id: uuid(4), resource: 'docker', reason: 'down', openedAt: at(0), until: null, openedByRunId: null });
    const checks = () => k.commands.calls.filter((c) => c.argv[0] === 'docker');
    offer();

    await holdTick(119 * SEC);
    expect(checks()).toHaveLength(0);
    await holdTick(120 * SEC);
    expect(checks()).toHaveLength(1);
    expect(await openHolds()).toEqual([expect.objectContaining({ checkedAt: at(120 * SEC) })]);
    await holdTick(239 * SEC);
    expect(checks()).toHaveLength(1);

    k.commands.reply = () => commandOk('');
    await holdTick(240 * SEC);
    expect(checks()).toHaveLength(2);
    expect(await openHolds()).toEqual([]);
  });

  it('RESOURCE_DOWN opens that hold with the run named, excuses the release, and with no check the hold closes 30 minutes after it opened', async () => {
    await runningTasks(1);
    k.scripted.call(1).succeedWith({ result: 'RESOURCE_DOWN', resource: 'docker' });
    await flush();
    expect(await openHolds()).toEqual([expect.objectContaining({ resource: 'docker', openedByRunId: runs()[0]!.id, until: null })]);
    expect((await unread())[0]).toMatchObject({ dedupeKey: 'hold:docker', messageKey: 'notice.holdNoEnd' });

    await probeTick(5 * SEC);
    expect(k.claimGateway.released()).toEqual([expect.objectContaining({ key: 't0', why: { reason: 'run succeeded RESOURCE_DOWN', excused: true } })]);

    await holdTick(30 * MIN - SEC);
    expect(await openHolds()).toHaveLength(1);
    await holdTick(30 * MIN);
    expect(await openHolds()).toEqual([]);
  });

  it('a hold line opens the hold with its until, stores the state held, and the hold closes at until', async () => {
    const id = await probeLoop();
    const until = at(10 * MIN).toISOString();
    k.commands.reply = () => commandOk(JSON.stringify({ v: 1, action: 'hold', resource: 'docker', reason: 'docker is down', until }));
    await probeTick(0);
    await probeTick(MIN);

    expect(await openHolds()).toEqual([expect.objectContaining({ resource: 'docker', reason: 'docker is down', until: at(10 * MIN), openedByRunId: null })]);
    expect(await unread()).toHaveLength(1);
    expect(await k.repos.probes.get(id)).toMatchObject({ state: 'held' });

    await holdTick(10 * MIN - SEC);
    expect(await openHolds()).toHaveLength(1);
    await holdTick(10 * MIN);
    expect(await openHolds()).toEqual([]);
  });
});

describe('failures and restarts', () => {
  it('a resume that fails keeps the run held, the other run still resumes, and the next tick tries it again', async () => {
    await heldRuns(2, at(HOUR));
    const resume = k.repos.runs.resume.bind(k.repos.runs);
    let failures = 1;
    k.repos.runs.resume = async (id, deadlineAt) => {
      if (failures-- > 0) throw new Error('the database went away');
      return resume(id, deadlineAt);
    };

    const report = await holdTick(HOUR + MIN);
    expect(report.errors).toEqual([expect.objectContaining({ message: 'the database went away' })]);
    expect(runs().map((r) => r.status)).toEqual(['held', 'running']);

    await holdTick(HOUR + MIN + SEC);
    expect(runs().map((r) => r.status)).toEqual(['running', 'running']);
    expect(resumedSessions()).toEqual(['scripted-2', 'scripted-1']);
  });

  it('restart, every loop stops: a held run becomes interrupted with its duration up to the last heartbeat, and its release is excused', async () => {
    await heldRuns(1, at(HOUR));
    await k.repos.heartbeat.beat(at(5 * MIN));

    const boot = makeKit({ db: k.db, clock: new OffsetClock(() => at(20 * MIN).getTime()) });
    const report = await boot.recovery.recover();

    expect(report).toMatchObject({ interruptedRuns: 1, closedExecutions: 1, stoppedLoops: 1 });
    expect([...boot.db.runs.values()]).toEqual([expect.objectContaining({ status: 'interrupted', finishedAt: at(20 * MIN), durationMs: 5 * MIN })]);
    await boot.probeService.tick();
    await flush();
    expect(boot.claimGateway.released()).toEqual([expect.objectContaining({ key: 't0', why: { reason: 'run interrupted', excused: true } })]);
  });
});
