// The probe actions wait, blocked, plan, done and skip, and a failed probe (spec 2.1, decision 46). Time comes only from the wound clock, and the labels
// sit in the fake gateway. A notice has a key per reason: the store keeps one unread notice per key, so the tick must not send the same reason again.
import { beforeEach, describe, expect, it } from 'vitest';
import { claimedLine } from '../../shared/domain/goal-loop';
import { commandOk } from '../../tests/support/fake-command-runner';
import { flush, makeKit, MIN, T0, type Kit } from '../../tests/support/service-kit';

const HOUR = 60 * MIN;
const at = (ms: number) => new Date(T0.getTime() + ms);
const SKIP = '{"v":1,"action":"skip"}';
const take = (...keys: string[]) => JSON.stringify({ v: 1, action: 'take', tasks: keys.map((key) => ({ key })) });
const wait = (reason: string) => JSON.stringify({ v: 1, action: 'wait', reason });
const blocked = (reason: string, issues: string[]) => JSON.stringify({ v: 1, action: 'blocked', reason, issues });
const plan = (key = 'plan-217', failing = ['G4', 'G5']) => JSON.stringify({ v: 1, action: 'plan', plan: { key, failing } });
const DONE = '{"v":1,"action":"done"}';
const LIMIT = "You've hit your limit";

let k: Kit;
beforeEach(() => {
  k = makeKit();
});

type LoopOver = Parameters<Kit['input']>[0];

async function probeLoop(over: LoopOver = {}): Promise<string> {
  const { id } = await k.loopService.create(k.input(over));
  await k.probeService.save(id, { command: ['probe'], claim: ['claim', '{key}'], release: ['release', '{key}', '{reason}'] });
  await k.loopService.start(id);
  await flush();
  return id;
}

/** The next probe calls print this line. */
function says(line: string) {
  k.commands.reply = () => commandOk(line);
}

async function tickAt(ms: number) {
  k.clock.set(at(ms));
  const report = await k.probeService.tick();
  await flush();
  return report;
}

const runs = () => [...k.db.runs.values()].sort((a, b) => (a.iteration ?? 0) - (b.iteration ?? 0));
const claims = () => [...k.db.claims.values()];
const unread = () => k.repos.notices.listUnread(100);
const stateOf = async (id: string) => (await k.repos.probes.get(id))!.state;
const execution = (loopId: string) => [...k.db.executions.values()].find((e) => e.loopId === loopId)!;

describe('wait', () => {
  it('stores the state waiting, and sends one notice with the reason', async () => {
    const id = await probeLoop();
    says(wait('review the plan'));
    await tickAt(0);

    expect(await stateOf(id)).toBe('waiting');
    expect(await unread()).toEqual([
      expect.objectContaining({ dedupeKey: `wait:${id}:review the plan`, kind: 'wait', loopId: id, messageKey: 'notice.wait', params: { reason: 'review the plan' } }),
    ]);
    expect(runs()).toEqual([]);
  });

  it('three ticks with one reason give one notice', async () => {
    await probeLoop();
    says(wait('review the plan'));
    await tickAt(0);
    await tickAt(MIN);
    await tickAt(2 * MIN);

    expect(await unread()).toHaveLength(1);
  });

  it('a notice that the owner read does not come back for the same reason', async () => {
    await probeLoop();
    says(wait('review the plan'));
    await tickAt(0);
    const [notice] = await unread();
    await k.repos.notices.markRead(notice!.id, at(10_000));
    await tickAt(MIN);
    await tickAt(2 * MIN);

    expect(await unread()).toEqual([]);
  });

  it('a new reason gives a new notice', async () => {
    const id = await probeLoop();
    says(wait('review the plan'));
    await tickAt(0);
    says(wait('answer the question'));
    await tickAt(MIN);

    expect((await unread()).map((n) => n.dedupeKey).sort()).toEqual([`wait:${id}:answer the question`, `wait:${id}:review the plan`]);
  });
});

describe('blocked', () => {
  it('stores the state blocked with the issues in the last line, and sends one notice', async () => {
    const id = await probeLoop();
    says(blocked('two issues stop the goal', ['31', '32']));
    await tickAt(0);

    const probe = (await k.repos.probes.get(id))!;
    expect(probe.state).toBe('blocked');
    expect(JSON.parse(probe.lastLine!)).toMatchObject({ action: 'blocked', issues: ['31', '32'] });
    expect(await unread()).toEqual([
      expect.objectContaining({ dedupeKey: `blocked:${id}:two issues stop the goal`, kind: 'blocked', loopId: id, messageKey: 'notice.blocked', params: { reason: 'two issues stop the goal' } }),
    ]);
  });

  it('three ticks give one notice', async () => {
    await probeLoop();
    says(blocked('two issues stop the goal', ['31']));
    await tickAt(0);
    await tickAt(MIN);
    await tickAt(2 * MIN);

    expect(await unread()).toHaveLength(1);
  });
});

describe('a failed probe', () => {
  it('three failed ticks give one notice, and no session starts', async () => {
    const id = await probeLoop();
    k.commands.reply = () => ({ exitCode: 1, stdout: '', stderr: 'no tracker', timedOut: false, error: 'exit 1' });
    await tickAt(0);
    await tickAt(MIN);
    await tickAt(2 * MIN);

    expect(await stateOf(id)).toBe('probe_failed');
    expect(await unread()).toEqual([expect.objectContaining({ dedupeKey: `probe_failed:${id}`, kind: 'probe_failed', loopId: id, messageKey: 'notice.probeFailed' })]);
    expect(runs()).toEqual([]);
  });

  it('a pass and a new failure give a second notice', async () => {
    const id = await probeLoop();
    k.commands.reply = () => ({ exitCode: 1, stdout: '', stderr: 'no tracker', timedOut: false, error: 'exit 1' });
    await tickAt(0);
    const [first] = await unread();
    await k.repos.notices.markRead(first!.id, at(5_000));
    says(SKIP);
    await tickAt(MIN);
    expect(await stateOf(id)).toBe('active');
    k.commands.reply = () => ({ exitCode: 1, stdout: '', stderr: 'no tracker', timedOut: false, error: 'exit 1' });
    await tickAt(2 * MIN);

    expect(await unread()).toEqual([expect.objectContaining({ dedupeKey: `probe_failed:${id}` })]);
  });
});

describe('plan', () => {
  it('starts one run with both prompt lines, a plan claim row, and no call to the gateway', async () => {
    const id = await probeLoop();
    says(plan());
    await tickAt(0);

    const [run] = runs();
    expect(run).toMatchObject({ loopId: id, trigger: 'probe', taskKey: 'plan-217', status: 'running' });
    expect(run!.promptSnapshot).toBe(`${claimedLine('plan-217', 'plan')}
Failing goal rows: G4, G5.

Do the work`);
    expect(k.scripted.call(1).input.prompt).toBe(run!.promptSnapshot);
    expect(claims()).toEqual([expect.objectContaining({ taskKey: 'plan-217', kind: 'plan', runId: run!.id, closedAt: null })]);
    expect(k.claimGateway.calls).toEqual([]);
  });

  it('the same key while its run lives starts no second run', async () => {
    await probeLoop({ maxConcurrent: 2 });
    says(plan());
    await tickAt(0);
    await tickAt(MIN);
    await tickAt(2 * MIN);

    expect(runs()).toHaveLength(1);
    expect(k.commands.calls.length).toBeGreaterThan(1); // the lane was free, so the probe was called, and the key was taken
  });

  it('a new run starts after the run ends, and the plan row ends with no release command', async () => {
    await probeLoop({ maxConcurrent: 2 });
    says(plan());
    await tickAt(0);
    k.scripted.call(1).succeed();
    await flush();
    await tickAt(MIN);

    expect(runs().map((r) => r.status)).toEqual(['succeeded', 'running']);
    expect(claims().map((c) => [c.kind, c.closedAt, c.closeReason])).toEqual([
      ['plan', at(MIN), 'run succeeded'],
      ['plan', null, null],
    ]);
    expect(k.claimGateway.calls).toEqual([]);
  });

  it('a held run of the plan key keeps its row, so no second run starts', async () => {
    await probeLoop({ maxConcurrent: 2 });
    says(plan());
    await tickAt(0);
    k.scripted.call(1).usageLimit(LIMIT, undefined, at(HOUR));
    await flush();
    expect(runs().map((r) => r.status)).toEqual(['held']);
    for (const hold of await k.repos.holds.listOpen()) await k.repos.holds.close(hold.id, at(5_000)); // the window is closed: the probe is called again
    await tickAt(MIN);

    expect(k.commands.calls.length).toBeGreaterThan(1);
    expect(runs()).toHaveLength(1);
    expect(claims().filter((c) => c.closedAt === null)).toHaveLength(1);
  });

  it('full lanes: the probe is not called, and no plan run starts', async () => {
    const id = await probeLoop();
    const first = await k.repos.executions.findOpen(id);
    await k.runService.startFirst(id, first!.id);
    await flush();
    says(plan());
    await tickAt(MIN);

    expect(k.commands.calls).toEqual([]);
    expect(runs()).toHaveLength(1);
    expect(claims()).toEqual([]);
  });
});

describe('done', () => {
  it('ends the period with goal_met, stops the loop and publishes both events', async () => {
    const id = await probeLoop();
    says(DONE);
    await tickAt(0);

    expect(execution(id)).toMatchObject({ endReason: 'goal_met', endedAt: at(0) });
    expect(await k.repos.loops.findById(id)).toMatchObject({ status: 'stopped', nextRunAt: null });
    expect(await stateOf(id)).toBe('complete');
    expect(k.eventsOf('execution.ended')).toEqual([expect.objectContaining({ loopId: id, reason: 'goal_met' })]);
    expect(k.eventsOf('loop.updated').at(-1)).toMatchObject({ loopId: id });
    expect(await unread()).toEqual([]);
  });

  it('with a live run the loop waits, and the next probe after the run ends closes the period', async () => {
    const id = await probeLoop({ maxConcurrent: 2 });
    says(take('141'));
    await tickAt(0);
    says(DONE);
    await tickAt(MIN);

    expect(await stateOf(id)).toBe('complete');
    expect(execution(id).endReason).toBeNull(); // the run lives: nothing closes, and nothing is cancelled
    expect(runs().map((r) => r.status)).toEqual(['running']);

    k.clock.set(at(MIN + 500)); // the run ends after the last probe, so the next tick probes at once
    k.scripted.call(1).succeed();
    await flush();
    await tickAt(MIN + 1000);

    expect(execution(id)).toMatchObject({ endReason: 'goal_met' });
    expect(runs().map((r) => r.status)).toEqual(['succeeded']); // not cancelled
  });

  it('no probe is called after the goal is met', async () => {
    await probeLoop();
    says(DONE);
    await tickAt(0);
    const calls = k.commands.calls.length;
    await tickAt(MIN);
    await tickAt(HOUR);

    expect(k.commands.calls).toHaveLength(calls);
  });
});

describe('unchanged behaviour', () => {
  it('skip: the state is active, and no notice, run or claim appears', async () => {
    const id = await probeLoop();
    says(SKIP);
    await tickAt(0);

    expect(await stateOf(id)).toBe('active');
    expect(await unread()).toEqual([]);
    expect(runs()).toEqual([]);
    expect(claims()).toEqual([]);
  });

  it('a loop with no probe runs on its cron, and the probe tick does nothing for it', async () => {
    const { id } = await k.loopService.create(k.input());
    await k.loopService.start(id);
    await flush();
    k.scripted.call(1).succeed();
    await flush();
    await k.tickAt(at(5 * MIN));
    const report = await k.probeService.tick();

    expect(report.probed).toEqual([]);
    expect(k.commands.calls).toEqual([]);
    expect(runs().map((r) => [r.trigger, r.promptSnapshot])).toEqual([
      ['start', 'Do the work'],
      ['schedule', 'Do the work'],
    ]);
    expect(await unread()).toEqual([]);
    expect(claims()).toEqual([]);
  });
});
