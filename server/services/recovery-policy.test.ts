// Restart policy (spec decision 45, G5, G4). "New process" = a second kit on one MemoryDb, and the old kit counts as dead. Only services run here, so a
// test that sees a run after a restart saw it with no HTTP call. Time comes only from the wound clock.
import { describe, expect, it } from 'vitest';
import type { RestartPolicy } from '../../shared/domain/goal-loop';
import { commandOk } from '../../tests/support/fake-command-runner';
import { flush, makeKit, MIN, T0, type Kit } from '../../tests/support/service-kit';
import { OffsetClock } from '../adapters/clock/offset-clock';

const SEC = 1000;
const HOUR = 60 * MIN;
const at = (ms: number) => new Date(T0.getTime() + ms);
const take = (key: string) => JSON.stringify({ v: 1, action: 'take', tasks: [{ key }] });
const WAIT = '{"v":1,"action":"wait","reason":"none ready"}';

type Over = Parameters<Kit['input']>[0];

/** An active loop with a probe. With no `restartPolicy`, the probe gets the default. */
async function probeLoop(k: Kit, restartPolicy?: RestartPolicy, over: Over = {}): Promise<string> {
  const { id } = await k.loopService.create(k.input(over));
  await k.probeService.save(id, { command: ['probe'], claim: ['claim', '{key}'], release: ['release', '{key}', '{reason}'], ...(restartPolicy ? { restartPolicy } : {}) });
  await k.loopService.start(id);
  await flush();
  return id;
}

async function probeTick(k: Kit, ms: number, answer: string) {
  k.commands.reply = () => commandOk(answer);
  k.clock.set(at(ms));
  await k.probeService.tick();
  await flush();
}

/** A second kit on the same database, with its clock at `ms`. Nothing was probed in the new process yet. */
function bootAt(old: Kit, ms: number): Kit {
  const boot = makeKit({ db: old.db, clock: new OffsetClock(() => at(ms).getTime()) });
  boot.commands.reply = () => commandOk(WAIT);
  return boot;
}

const executionOf = (k: Kit, loopId: string) => [...k.db.executions.values()].find((e) => e.loopId === loopId)!;
const runsOf = (k: Kit, loopId: string) => [...k.db.runs.values()].filter((r) => r.loopId === loopId).sort((a, b) => (a.iteration ?? 0) - (b.iteration ?? 0));
const statusOf = (k: Kit, loopId: string) => k.db.loops.get(loopId)?.status;

describe('restart_policy', () => {
  it('resume loop: the running run is interrupted, the execution stays open and the loop stays active', async () => {
    const old = makeKit();
    const id = await probeLoop(old, 'resume');
    await probeTick(old, 0, take('t1'));
    await old.repos.heartbeat.beat(at(40 * SEC));

    const boot = bootAt(old, 50 * SEC);
    const report = await boot.recovery.recover();

    expect(report).toEqual({ at: at(50 * SEC), lastHeartbeatAt: at(40 * SEC), interruptedRuns: 1, closedExecutions: 0, stoppedLoops: 0 });
    expect(statusOf(boot, id)).toBe('active');
    expect(executionOf(boot, id)).toMatchObject({ endedAt: null, endReason: null });
    expect(runsOf(boot, id)).toEqual([expect.objectContaining({ status: 'interrupted', finishedAt: at(50 * SEC), durationMs: 40 * SEC })]);
  });

  it('first tick: an excused release of the old claim, then a new run on the same execution, with no call from a person', async () => {
    const old = makeKit();
    const id = await probeLoop(old, 'resume');
    await probeTick(old, 0, take('t1'));
    const execution = executionOf(old, id);

    const boot = bootAt(old, 30 * SEC);
    await boot.recovery.recover();
    await probeTick(boot, 31 * SEC, take('t1'));

    expect(boot.claimGateway.released()).toEqual([expect.objectContaining({ key: 't1', why: { reason: 'run interrupted', excused: true } })]);
    expect(boot.claimGateway.claimed()).toEqual(['t1']);
    expect(runsOf(boot, id).map((r) => [r.status, r.trigger, r.taskKey, r.executionId])).toEqual([
      ['interrupted', 'probe', 't1', execution.id],
      ['running', 'probe', 't1', execution.id],
    ]);
    expect(boot.scripted.calls).toHaveLength(1);
  });

  it('default loop: a probe with no policy stops as it did before, and the tick neither probes nor runs', async () => {
    const old = makeKit();
    const id = await probeLoop(old);
    await probeTick(old, 0, take('t1'));
    await old.repos.heartbeat.beat(at(40 * SEC));

    const boot = bootAt(old, 50 * SEC);
    const report = await boot.recovery.recover();
    await probeTick(boot, 51 * SEC, take('t2'));

    expect(report).toMatchObject({ interruptedRuns: 1, closedExecutions: 1, stoppedLoops: 1 });
    expect(statusOf(boot, id)).toBe('stopped');
    expect(executionOf(boot, id)).toMatchObject({ endReason: 'server_down', endedAt: at(40 * SEC) });
    expect(boot.commands.calls).toEqual([]);
    expect(boot.scripted.calls).toEqual([]);
    expect(boot.claimGateway.released()).toEqual([expect.objectContaining({ key: 't1', why: { reason: 'run interrupted', excused: true } })]);
  });

  it('no-probe loop: stops with its schedule cleared, and no tick starts a run', async () => {
    const old = makeKit();
    const { id } = await old.loopService.create(old.input());
    await old.loopService.start(id);
    await flush();

    const boot = bootAt(old, 50 * SEC);
    const report = await boot.recovery.recover();
    await boot.tickAt(at(HOUR));
    await boot.probeService.tick();
    await flush();

    expect(report).toMatchObject({ interruptedRuns: 1, closedExecutions: 1, stoppedLoops: 1 });
    expect(boot.db.loops.get(id)).toMatchObject({ status: 'stopped', nextRunAt: null });
    expect(executionOf(boot, id).endReason).toBe('server_down');
    expect(boot.scripted.calls).toEqual([]);
    expect(boot.commands.calls).toEqual([]);
  });

  it('stopped resume loop: stays stopped, and its closed execution does not change', async () => {
    const old = makeKit();
    const id = await probeLoop(old, 'resume');
    old.clock.set(at(10 * SEC));
    await old.loopService.stop(id);

    const boot = bootAt(old, 50 * SEC);
    const report = await boot.recovery.recover();
    await probeTick(boot, 51 * SEC, take('t1'));

    expect(report).toMatchObject({ interruptedRuns: 0, closedExecutions: 0, stoppedLoops: 0 });
    expect(statusOf(boot, id)).toBe('stopped');
    expect(executionOf(boot, id)).toMatchObject({ endReason: 'stopped', endedAt: at(10 * SEC) });
    expect(boot.commands.calls).toEqual([]);
    expect(boot.scripted.calls).toEqual([]);
  });

  it('held run: stays held with its hold row, and the same session goes on after the reset', async () => {
    const old = makeKit();
    const id = await probeLoop(old, 'resume');
    await probeTick(old, 0, take('t1'));
    const resetsAt = at(HOUR);
    old.scripted.call(1).usageLimit("You've hit your limit", 2, resetsAt);
    await flush();
    const [run] = runsOf(old, id);
    expect(run).toMatchObject({ status: 'held', sessionId: 'scripted-1' });

    const boot = bootAt(old, 10 * MIN);
    const report = await boot.recovery.recover();

    expect(report).toMatchObject({ interruptedRuns: 0, closedExecutions: 0, stoppedLoops: 0 });
    expect(runsOf(boot, id)).toEqual([expect.objectContaining({ id: run!.id, status: 'held', finishedAt: null })]);
    expect((await boot.repos.holds.listOpen()).map((h) => h.until)).toEqual([resetsAt]);

    boot.clock.set(at(30 * MIN)); // before the reset
    await boot.holdService.tick();
    await boot.probeService.tick();
    await flush();
    expect(boot.scripted.calls).toEqual([]);
    expect(boot.commands.calls).toEqual([]);
    expect(boot.claimGateway.released()).toEqual([]);

    boot.clock.set(at(HOUR + 60 * SEC)); // the reset plus the grace of the window
    await boot.holdService.tick();
    await flush();
    expect(boot.scripted.calls.map((c) => c.input.resumeSessionId)).toEqual(['scripted-1']);
    expect(runsOf(boot, id)).toEqual([expect.objectContaining({ id: run!.id, status: 'running', sessionId: 'scripted-1', resumeCount: 1, costUsd: 2 })]);
  });

  it('mixed loops: only the resume loop stays, and the report counts the others', async () => {
    const old = makeKit();
    const keep = await probeLoop(old, 'resume', { name: 'resume' });
    const stop = await probeLoop(old, 'stop', { name: 'stop' });
    const { id: plain } = await old.loopService.create(old.input({ name: 'no probe' }));
    await old.loopService.start(plain);
    await flush();
    let n = 0;
    old.commands.reply = () => commandOk(take(`t${++n}`));
    await old.probeService.tick();
    await flush();

    const boot = bootAt(old, 50 * SEC);
    const report = await boot.recovery.recover();

    expect(report).toMatchObject({ interruptedRuns: 3, closedExecutions: 2, stoppedLoops: 2 });
    expect([keep, stop, plain].map((id) => statusOf(boot, id))).toEqual(['active', 'stopped', 'stopped']);
    expect([keep, stop, plain].map((id) => executionOf(boot, id).endReason)).toEqual([null, 'server_down', 'server_down']);
    expect([...boot.db.runs.values()].map((r) => r.status)).toEqual(['interrupted', 'interrupted', 'interrupted']);
  });

  it('an active resume loop with no open execution stops, because nothing can hold its runs', async () => {
    const old = makeKit();
    const { id } = await old.loopService.create(old.input());
    await old.probeService.save(id, { command: ['probe'], restartPolicy: 'resume' });
    old.db.writeLoop({ ...old.db.loops.get(id)!, status: 'active' }); // data that breaks the invariant

    const boot = bootAt(old, 50 * SEC);
    const report = await boot.recovery.recover();

    expect(report).toMatchObject({ closedExecutions: 0, stoppedLoops: 1 });
    expect(statusOf(boot, id)).toBe('stopped');
  });

  it('the first tick of a process probes a resume loop that was probed seconds ago, and the second tick does not', async () => {
    const old = makeKit();
    const id = await probeLoop(old, 'resume');
    await probeTick(old, 0, WAIT);
    expect(runsOf(old, id)).toEqual([]);

    const boot = bootAt(old, 10 * SEC);
    await boot.recovery.recover();
    expect(statusOf(boot, id)).toBe('active');
    await probeTick(boot, 11 * SEC, WAIT);
    expect(boot.commands.calls).toHaveLength(1);

    await probeTick(boot, 12 * SEC, take('t1'));
    expect(boot.commands.calls).toHaveLength(1);
    expect(boot.db.runs.size).toBe(0);
  });

  it('an open plan-window: the first tick makes no probe call, and the loop waits in state held', async () => {
    const old = makeKit();
    const id = await probeLoop(old, 'resume');
    await probeTick(old, 0, WAIT);
    await old.repos.holds.open({ id: '00000000-0000-4000-8000-000000000001', resource: 'plan-window', reason: 'limit', openedAt: at(SEC), until: at(HOUR), openedByRunId: null });

    const boot = bootAt(old, 10 * SEC);
    await boot.recovery.recover();
    await probeTick(boot, 11 * SEC, take('t1'));

    expect(statusOf(boot, id)).toBe('active');
    expect(boot.commands.calls).toEqual([]);
    expect(boot.scripted.calls).toEqual([]);
    expect(boot.db.probes.get(id)).toMatchObject({ state: 'held' });
  });
});
